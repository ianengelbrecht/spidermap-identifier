import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
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

const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
setOptions({
  key: mapsApiKey
});

const { Map } = await importLibrary("maps");

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

export async function fetchSpiderMapRecordByVMNumber(vmNumber) {
  const response = await fetch(`${baseApiUrl}/search?vm_number=${encodeURIComponent(vmNumber)}`);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

export function mapSpiderMapRecordToFirebase(record) {

  const associatedMedia = record.images.map(img => {
    return {
      publicURL: `${baseApiUrl}/recordImages/${img}`,
    };
  });

  const identifications = record.identifications.map(det => {
    return {
      dateIdentified: det.date_of_comment || null,
      identifiedBy: det.comment_by || '',
      identificationQualifier: det.identification_qualifier || '',
      scientific_name: det.scientific_name || '',
      sp_code: det.sp_code || '',
      identificationRemarks: det.comment || ''
    }
  });

  const spiderMapObject = {
    key: `vm${record.vm_number}`,
    basisOfRecord: record.basis_of_record || '',
    observation: {
      event: {
        recordedBy: record.collector || '',
        observerContact: record.collector_email || '',
        year: record.year_collected ? Number(record.year_collected) : null,
        month: record.month_collected ? Number(record.month_collected) : null,
        day: record.day_collected ? Number(record.day_collected) : null,
      },
      location: {
        country: record.country || '',
        stateProvince: record.state_province || '',
        closestTown: record.closest_town || '',
        locality: record.locality || '',
        decimalLatitude: record.decimal_latitude ? Number(record.decimal_latitude) : null,
        decimalLongitude: record.decimal_longitude ? Number(record.decimal_longitude) : null
      },
      taxaObserved: [
        {
          associatedMedia,
          identifications,
          occurrenceRemarks: record.related_information || '',
        }
      ]
    }
  };

  return spiderMapObject;

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

export async function unflagRecord(recordKey) {
  if (!recordKey) throw new Error('No record key provided');
  await remove(ref(db, 'records/' + recordKey + '/flagged'));
}

export function preloadImages(urls) {
  return Promise.all(urls.map(src => {
    const img = new Image();
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = src;
    return img.decode?.().catch(() => { }); // don’t block on errors
  }));
}

export async function getVMTaxonRecords(name = null) {
  let url = `${baseApiUrl}/records`;
  if (name) {
    url += `?name=${encodeURIComponent(name)}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response.json();
}

// Default marker icon
const defaultBSAIcon = {
  path: google.maps.SymbolPath.CIRCLE,
  scale: 6, // size of the circle
  fillColor: '#00f', // fill color
  fillOpacity: 0.8,
  strokeWeight: 1,
  strokeColor: '#fff' // border color
};

// Clicked marker icon (wide red border)
const clickedBSAIcon = {
  path: google.maps.SymbolPath.CIRCLE,
  scale: 6, // size of the circle
  fillColor: '#00f', // fill color
  fillOpacity: 0.8,
  strokeWeight: 4,
  strokeColor: 'red' // border color
};
let lastClickedMarker = null;

export function setMap(mapEl, position) {
  return new Map(mapEl, {
    zoom: 5,
    center: position,
    mapId: 'DEMO_MAP_ID',
    gestureHandling: 'greedy'
  });
}

export function setMarkers(map, bsaRecords, vmRecords, markersArray, showRecord) {
  // clear all markers on the map
  markersArray.forEach((marker) => marker.setMap(null));
  markersArray.length = 0;

  for (const r of vmRecords) {
    const lat = r?.Decimal_latitude;
    const lng = r?.Decimal_longitude;
    if (lat && lng) {
      const marker = new google.maps.Marker({
        position: { lat: Number(lat), lng: Number(lng) },
        map: map,
        title: r.Vm_number.toString(),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6, // size of the circle
          fillColor: '#398f0e', // fill color
          fillOpacity: 0.8,
          strokeWeight: 1,
          strokeColor: '#fff' // border color
        },
        clickable: false
      });
      markersArray.push(marker);
    } else {
      console.log('No coordinates for VM record:', r);
    }
  }

  // add a marker for each bsa record with that name
  bsaRecords.forEach((r) => {
    const lat = r?.observation?.location?.decimalLatitude;
    const lng = r?.observation?.location?.decimalLongitude;
    if (lat && lng) {
      const marker = new google.maps.Marker({
        position: { lat: Number(lat), lng: Number(lng) },
        map: map,
        title: r.key,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6, // size of the circle
          fillColor: '#00f', // fill color
          fillOpacity: 0.8,
          strokeWeight: 1,
          strokeColor: '#fff' // border color
        }
      });

      marker.addListener("click", () => {
        if (lastClickedMarker) {
          lastClickedMarker.setIcon(defaultBSAIcon);
        }
        marker.setIcon(clickedBSAIcon);
        lastClickedMarker = marker;
        showRecord(r.key);
      });
      markersArray.push(marker);
    }
  });
}