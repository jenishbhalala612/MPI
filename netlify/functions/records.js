// Netlify Serverless Function for MPI Sheet Records (data/records.json)
const crypto = require('crypto');

// RFC 6238 TOTP Engine for Team Lead Verification
function base32tohex(base32) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  for (let i = 0; i < base32.length; i++) {
    const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    if (val >= 0) bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16);
  }
  return hex;
}

function generateTOTP(secretBase32, offset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offset;
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  const key = Buffer.from(base32tohex(secretBase32), 'hex');
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

function verifyTOTP(token, secretBase32) {
  const clean = (token || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  for (let offset of [-1, 0, 1]) {
    if (generateTOTP(secretBase32, offset) === clean) return true;
  }
  return false;
}

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

      // 1. Handle TOTP Verification for Team Lead
      if (payload.action === 'verify_totp') {
        const code = (payload.code || '').replace(/\D/g, '');
        const secret = process.env.TOTP_SECRET || 'MPSR2236TLREVKEY';
        const isValid = verifyTOTP(code, secret);

        if (isValid) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              verified: true,
              message: 'TOTP Verification successful.'
            })
          };
        } else {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({
              success: false,
              verified: false,
              error: 'Invalid 6-digit code. Please verify against your Google Authenticator or Microsoft Authenticator app.'
            })
          };
        }
      }

      // 2. Handle Sheet Record Submission / Review Save
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
        status: payload.status || 'Reviewed',
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
