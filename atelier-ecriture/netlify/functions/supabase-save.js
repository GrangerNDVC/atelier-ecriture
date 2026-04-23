const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sctfzwqqlmjprodszsrv.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_ANON_KEY manquante dans Netlify' }) };
  }

  try {
    const { action, data } = JSON.parse(event.body);

    if (action === 'save_session') {
      await sbRequest(SUPABASE_URL, SUPABASE_KEY, 'POST', '/rest/v1/sessions', {
        id: data.username,
        username: data.username,
        level: data.level,
        dys: data.dys,
        mode_livre: data.modeLivre || false,
        livre_plan: data.livrePlan || '',
        nb_echanges: data.nbEchanges || 0,
        updated_at: new Date().toISOString()
      }, { 'Prefer': 'resolution=merge-duplicates' });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'save_log') {
      await sbRequest(SUPABASE_URL, SUPABASE_KEY, 'POST', '/rest/v1/logs', {
        username: data.username,
        level: data.level,
        dys: data.dys,
        user_msg: (data.userMsg || '').slice(0, 2000),
        ia_msg: (data.iaMsg || '').slice(0, 2000),
        created_at: new Date().toISOString()
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue' }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function sbRequest(baseUrl, key, method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(baseUrl + path);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method,
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...extraHeaders
      },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Supabase')); });
    req.write(postData);
    req.end();
  });
}
