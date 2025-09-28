// server.js
import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
const port = 3000;

// Create a single shared connection pool (better than creating per request)
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'spidermap',
});

app.get('/', (req, res) => {
  console.log('Received request at /');
  res.send('Hello from the server!');
});

app.get('/search', async (req, res) => {
  console.log('Received request at /search');
  // build the sql string dynamically from arbitrary query parameters
  let sql = 'SELECT d.vm_number, t.scientific_name, d.Id_confirmed_by, d.Date_id_confirmed FROM `vm_data` d';
  sql += ' JOIN `vm_taxonomy` t ON `d`.`sp_code` = `t`.`sp_code`';
  sql += ' WHERE 1=1'; // dummy condition to simplify appending AND clauses

  const params = [];

  const queryKeys = Object.keys(req.query);
  const queryParams = Object.values(req.query);
  const whereClause = queryKeys.map((key, index) => {
    params.push(queryParams[index]);
    return ` AND \`${key}\` = ?`;
  }).join('');

  const finalSql = sql + whereClause;

  try {
    const [results] = await pool.execute(finalSql, params);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/taxa', async (req, res) => {
  console.log('Received request at /taxa for', req.query.q);
  const q = req.query.q || '';

  if (q.length < 2) {
    throw new Error('Query too short');
  }

  const searchTerm = q.trim().replace(/\s+/g, ' ').split(' ').join('% ') + '%';

  try {
    const [results] = await pool.execute(
      'SELECT sp_code, scientific_name FROM `vm_taxonomy` WHERE `scientific_name` LIKE ? ORDER BY `scientific_name`',
      [searchTerm]
    );
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.get('/taxa/:sp_code', async (req, res) => {
  console.log('Received request at /taxa/:sp_code for', req.params.sp_code);
  const sp_code = req.params.sp_code;

  try {
    const [results] = await pool.execute(
      'SELECT sp_code, family, scientific_name, taxonomic_authority FROM `vm_taxonomy` WHERE `sp_code` = ?',
      [sp_code]
    );
    if (results.length === 0) {
      res.status(404).json({ error: 'Taxon not found' });
    } else {
      res.json(results[0]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
