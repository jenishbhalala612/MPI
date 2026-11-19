// Netlify Serverless Function for MPI Sheet Records (data/records.json)
let inMemoryRecords = null;

exports.handler = async function (event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let store = null;
  try {
    const { getStore } = require('@netlify/blobs');
    store = getStore('mpi-sheets');
  } catch (e) {
    // Netlify Blobs package optional
  }

  async function loadRecords() {
    if (store) {
      try {
        const data = await store.get('records', { type: 'json' });
        if (data) return data;
      } catch (e) {
        console.warn('[Netlify Function] Blobs read error:', e.message);
      }
    }
    return inMemoryRecords || {};
  }

  async function saveRecords(records) {
    inMemoryRecords = records;
    if (store) {
      try {
        await store.setJSON('records', records);
      } catch (e) {
        console.warn('[Netlify Function] Blobs write error:', e.message);
      }
    }
  }

  if (event.httpMethod === 'GET') {
    const records = await loadRecords();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data: records })
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '{}');
      const employeeName = (payload.employeeName || '').trim();
      const monthYear = (payload.monthYear || '').trim().toUpperCase();

      if (!employeeName || !monthYear) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'employeeName and monthYear are required.' })
        };
      }

      const records = await loadRecords();
      if (!records[employeeName]) {
        records[employeeName] = {};
      }

      const existing = records[employeeName][monthYear] || {};
      const updatedRecord = {
        employeeName,
        monthYear,
        points: payload.points !== undefined ? payload.points : (existing.points || ''),
        extraordinary: payload.extraordinary !== undefined ? payload.extraordinary : (existing.extraordinary || ''),
        teamLeadReview: payload.teamLeadReview !== undefined ? payload.teamLeadReview : (existing.teamLeadReview || ''),
        teamLeadRating: payload.teamLeadRating !== undefined ? payload.teamLeadRating : (existing.teamLeadRating ?? null),
        hrReview: payload.hrReview !== undefined ? payload.hrReview : (existing.hrReview || ''),
        hrRating: payload.hrRating !== undefined ? payload.hrRating : (existing.hrRating ?? null),
        status: payload.status || existing.status || 'Pending',
        updatedAt: new Date().toISOString()
      };

      records[employeeName][monthYear] = updatedRecord;
      await saveRecords(records);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Record for ${employeeName} (${monthYear}) saved successfully.`,
          data: updatedRecord
        })
      };
    } catch (err) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON: ' + err.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
  };
};
