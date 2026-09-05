const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase non configuré' }) };
  }

  try {
    const jobId = (event.queryStringParameters || {}).jobId;
    if (!jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId manquant' }) };

    const rows = await sbGet(SUPABASE_URL, SUPABASE_KEY,
      `ai_jobs?id=eq.${encodeURIComponent(jobId)}&select=status,result,error`);
    if (!rows.length) return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };

    const row = rows[0];
    return { statusCode: 200, headers, body: JSON.stringify({ status: row.status, result: row.result, error: row.error }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function sbGet(baseUrl, key, path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl.replace(/\/$/, '') + '/rest/v1/' + path);
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve([]); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Supabase (ai_jobs select)')); });
    req.end();
  });
}
