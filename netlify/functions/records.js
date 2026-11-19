// Netlify Serverless Function for MPI Sheet Records (data/records.json)
let inMemoryRecords = {
  "Alex Johnson": {
    "OCTOBER 2026": {
      "employeeName": "Alex Johnson",
      "monthYear": "OCTOBER 2026",
      "points": "1. Completed OAuth2 Authentication integration for mobile app\n2. Resolved 14 High Priority Jira defects in Payment processing\n3. Optimized SQL index queries reducing API latency by 45%\n4. Mentored 2 Junior Engineers during sprint onboarding",
      "extraCurricularActivity": "Organized team Tech-Talk on Angular Signals and Modern State Management",
      "teamLeadReview": "Outstanding technical performance and initiative across all sprint objectives.",
      "teamLeadRating": 9,
      "hrReview": "Demonstrates strong company culture, collaboration, and reliability.",
      "hrRating": 9,
      "status": "Reviewed",
      "updatedAt": "2026-10-31T17:30:00.000Z"
    },
    "NOVEMBER 2026": {
      "employeeName": "Alex Johnson",
      "monthYear": "NOVEMBER 2026",
      "points": "1. Migrated Angular legacy forms to Typed Reactive signals\n2. Configured CI/CD automated pipeline for Netlify deployment\n3. Authored end-to-end integration test suites with Puppeteer",
      "extraCurricularActivity": "Participated in quarterly Hackathon and created team utility toolkit",
      "teamLeadReview": "",
      "teamLeadRating": null,
      "hrReview": "",
      "hrRating": null,
      "status": "Pending",
      "updatedAt": "2026-11-19T09:00:00.000Z"
    }
  }
};

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
    const blobs = require('@netlify/blobs');
    if (blobs && blobs.getStore) {
      store = blobs.getStore({ name: 'mpi-sheets', consistency: 'strong' });
    }
  } catch (e) {
    try {
      const blobs = await import('@netlify/blobs');
      if (blobs && blobs.getStore) {
        store = blobs.getStore({ name: 'mpi-sheets', consistency: 'strong' });
      }
    } catch (e2) {
      // Blobs optional
    }
  }

  async function loadRecords() {
    if (store) {
      try {
        const data = await store.get('records', { type: 'json' });
        if (data && typeof data === 'object') {
          // Merge initial seed with blob data
          return { ...inMemoryRecords, ...data };
        }
      } catch (e) {
        console.warn('[Netlify Function] Blobs read error:', e.message);
      }
    }
    return inMemoryRecords;
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
        extraCurricularActivity: payload.extraCurricularActivity !== undefined 
          ? payload.extraCurricularActivity 
          : (payload.extraordinary !== undefined ? payload.extraordinary : (existing.extraCurricularActivity || '')),
        teamLeadReview: payload.teamLeadReview !== undefined ? payload.teamLeadReview : (existing.teamLeadReview || ''),
        teamLeadRating: payload.teamLeadRating !== undefined ? payload.teamLeadRating : (existing.teamLeadRating ?? null),
        hrReview: payload.hrReview !== undefined ? payload.hrReview : (existing.hrReview || ''),
        hrRating: payload.hrRating !== undefined ? payload.hrRating : (existing.hrRating ?? null),
        status: payload.status || existing.status || 'Pending',
        updatedAt: payload.updatedAt || new Date().toISOString()
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
