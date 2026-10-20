const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase non configuré' }) };
  }

  try {
    const { username } = JSON.parse(event.body);
    if (!username) return { statusCode: 400, headers, body: JSON.stringify({ error: 'username manquant' }) };

    // Charge session + 50 derniers logs en parallèle
    const [sessionRes, logsRes] = await Promise.all([
      sbGet(SUPABASE_URL, SUPABASE_KEY, `sessions?id=eq.${encodeURIComponent(username)}&select=*`),
      sbGet(SUPABASE_URL, SUPABASE_KEY, `logs?username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=50`)
    ]);

    const session = sessionRes.data.length > 0 ? sessionRes.data[0] : null;
    const logs = logsRes.data || [];

    // Charge aussi les rédactions notées
    const redacsRes = await sbGet(SUPABASE_URL, SUPABASE_KEY,
      `redactions?username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc&limit=20`);
    const redactions = redacsRes.data || [];

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ session, logs, redactions })
    };
  } catch (err) {
    console.error('Load error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function sbGet(baseUrl, key, path) {
  return new Promise((resolve, reject) => {
    const fullUrl = baseUrl.replace(/\/$/, '') + '/rest/v1/' + path;
    const parsed = new URL(fullUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}
