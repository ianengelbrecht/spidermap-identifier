// server.js
import express from 'express';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
// read the directory with the images
const imageDir = 'C:\\devprojects\\personal\\vm-data-fetcher\\images';
const images = await fs.readdir(imageDir);
const imageDictionary = {};
let imageCount = 0
for (const img of images) {
  const imageVMNumber = img.split('_')[1];
  if (imageVMNumber) {
    if (!imageDictionary[imageVMNumber]) {
      imageDictionary[imageVMNumber] = [];
    }
    imageDictionary[imageVMNumber].push(img);
    imageCount++;
  }
}
console.log('Found images:', imageCount);

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
      'SELECT sp_code, family, scientific_name, \
      taxonomic_authority FROM `vm_taxonomy` WHERE `sp_code` = ?',
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

// fetches theraphosidae or the name requested
app.get('/search', async (req, res) => {
  console.log('Received request at /records with query', req.query);
  let sql = 'SELECT d.vm_number, \
  d.institution_code, d.collection_code, d.catalog_number, \
    d.scientific_name, \
    d.collector, d.year_collected, d.month_collected, d.day_collected, \
    d.related_information, \
    d.identification_qualifier, d.basis_of_record, \
    d.country, d.state_province, d.closest_town, d.locality,  \
    d.decimal_latitude, d.decimal_longitude \
    FROM `vm_data` d JOIN `vm_taxonomy` t ON `d`.`sp_code` = `t`.`sp_code`';
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'name' && value && value.trim() !== '') {
      fields.push(`d.\`${key}\` = ?`);
      params.push(value.trim());
    }
  }

  const name = req.query.name || '';
  if (name && name.trim() !== '') {
    fields.push(`t.scientific_name = ?`);
    params.push(name);
  }
  else {
    fields.push(`t.family = ?`);
    params.push('Theraphosidae');
  }

  // exlude deleted
  fields.push('d.deleted = ?');
  params.push(0);

  if (fields.length > 0) {
    sql += ' WHERE ' + fields.join(' AND ');
  }

  try {
    const [results] = await pool.execute(
      sql,
      params
    );
    await Promise.all(results.map(async (record) => {
      record.images = imageDictionary[record.vm_number] || [];

      let detSql = "SELECT p.vm_panel_id, p.sp_code, t.scientific_name, \
        p.comment_by, p.comment, p.date_of_comment FROM `vm_panel` p \
        JOIN `vm_taxonomy` t ON `p`.`sp_code` = `t`.`sp_code` \
        WHERE `p`.`vm_number` = ? AND `p`.`deleted` IS NULL \
        ORDER BY `p`.`date_of_comment` DESC";
      const [rows] = await pool.execute(detSql, [record.vm_number]);
      record.identifications = rows;
    }));

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query failed' });
  }

});

app.get('/recordImages/:filename', async (req, res) => {
  console.log('Received request at /recordImages/:filename for', req.params.filename);
  const filename = req.params.filename;

  const imagePath = path.join(imageDir, filename);
  try {
    await fs.access(imagePath);
    res.sendFile(imagePath);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'file does not exist' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
