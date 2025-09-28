import { initializeApp } from 'firebase/app';
import { getDatabase, ref, query, orderByKey, limitToFirst, startAfter, get, set, update, remove } from 'firebase/database';
const baseApiUrl = import.meta.env.VITE_API_URL;
console.log('API URL:', baseApiUrl);
// import { getStorage, ref as stRef, getDownloadURL } from 'firebase/storage';

const fbConfig = {
  apiKey: 'AIzaSyBS7rPtI9G9AbZZ-dDuywQ2jERPPiQfPeQ',
  authDomain: 'whatsthat-c5a89.firebaseapp.com',
  databaseURL: 'https://whatsthat-c5a89.firebaseio.com',
  storageBucket: 'whatsthat-c5a89.appspot.com',
  messagingSenderId: '674861285189'
};

const app = initializeApp(fbConfig);
const db = getDatabase(app);
// const storage = getStorage(app);

export async function fetchAllFirebaseRecords() {
  const q = query(ref(db, "records"), orderByKey());
  const snapshot = await get(q);
  if (snapshot.exists()) {
    const records = [];
    snapshot.forEach((child) => {
      records.push({ key: child.key, ...child.val() });
    });
    return records;
  }
  else {
    throw new Error("No records");
  }
}

export async function updateFirebaseRecordCount(count) {
  await set(ref(db, 'recordCount'), count);
  return
}

export function coalesce(v) {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

export function fmtDate(ev) {
  const y = ev?.year;
  const m = ev?.month; // likely stored as 1–12 in the legacy form
  const d = ev?.day;
  if (y && d && m !== undefined && m !== null) {
    const monthIndex = Math.max(0, Number(m) - 1);
    const dt = new Date(Number(y), monthIndex, Number(d));
    return isNaN(+dt) ? '—' : dt.toDateString();
  }
  return '—';
}

export async function fetchSpiderMapRecords(collectorEmail, year, month, day, closestTown) {
  const response = await fetch(`${baseApiUrl}/search?collector_email=${encodeURIComponent(collectorEmail)}&year_collected=${year}&month_collected=${month}&day_collected=${day}&closest_town=${encodeURIComponent(closestTown)}`);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

export async function queryTaxa(q) {
  const response = await fetch(`${baseApiUrl}/taxa?q=${encodeURIComponent(q)}`);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

export async function getTaxonDetails(sp_code) {
  const response = await fetch(`${baseApiUrl}/taxa/${encodeURIComponent(sp_code)}`);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

export async function saveIdentification(recordKey, updatedTaxaObserved) {
  if (!recordKey) throw new Error('No record key provided');
  if (!updatedTaxaObserved || !updatedTaxaObserved[0].identifications || !Array.isArray(updatedTaxaObserved[0].identifications)
    || updatedTaxaObserved[0].identifications.length === 0
  ) throw new Error('Invalid taxa observed data');

  await set(ref(db, 'records/' + recordKey + '/observation/taxaObserved'),
    updatedTaxaObserved);
}

export async function deleteRecord(recordKey) {
  if (!recordKey) throw new Error('No record key provided');
  await remove(ref(db, 'records/' + recordKey));
}

export async function deleteDet(recordKey, updatedTaxaObserved) {
  if (!recordKey) throw new Error('No record key provided');
  if (!updatedTaxaObserved || !updatedTaxaObserved[0].identifications || !Array.isArray(updatedTaxaObserved[0].identifications)
  ) throw new Error('Invalid taxa observed data');

  await set(ref(db, 'records/' + recordKey + '/observation/taxaObserved'),
    updatedTaxaObserved);
}

export async function flagRecord(recordKey) {
  if (!recordKey) throw new Error('No record key provided');
  await set(ref(db, 'records/' + recordKey + '/flagged'), true);
}