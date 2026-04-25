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

  console.log('SUPABASE_URL:', SUPABASE_URL ? 'OK' : 'MANQUANTE');
  console.log('SUPABASE_ANON_KEY:', SUPABASE_KEY ? 'OK (' + SUPABASE_KEY.slice(0,15) + '...)' : 'MANQUANTE');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers,
      body: JSON.stringify({ error: 'Variables manquantes',
        detail: `URL:${SUPABASE_URL?'OK':'MANQUANTE'} KEY:${SUPABASE_KEY?'OK':'MANQUANTE'}` }) };
  }

  try {
    const { action, data } = JSON.parse(event.body);

    if (action === 'save_session') {
      const r = await sbRequest(SUPABASE_URL, SUPABASE_KEY, 'POST', 'sessions', {
        id: data.username,
        username: data.username,
        level: data.level,
        dys: data.dys,
        mode_livre: data.modeLivre || false,
        livre_plan: data.livrePlan || '',
        nb_echanges: data.nbEchanges || 0,
        history_json: JSON.stringify(data.history || []),
        updated_at: new Date().toISOString()
      }, { 'Prefer': 'resolution=merge-duplicates' });
      console.log('save_session:', r.status);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'save_log') {
      const r = await sbRequest(SUPABASE_URL, SUPABASE_KEY, 'POST', 'logs', {
        username: data.username,
        level: data.level,
        dys: data.dys,
        user_msg: (data.userMsg || '').slice(0, 2000),
        ia_msg: (data.iaMsg || '').slice(0, 2000),
        created_at: new Date().toISOString()
      });
      console.log('save_log:', r.status);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'save_redaction') {
      const r = await sbRequest(SUPABASE_URL, SUPABASE_KEY, 'POST', 'redactions', {
        username: data.username,
        level: data.level,
        type_redac: data.typeRedac,
        sujet: (data.sujet || '').slice(0, 500),
        texte: (data.texte || '').slice(0, 10000),
        note: data.note,
        appreciation: data.appreciation,
        points_positifs: JSON.stringify(data.pointsPositifs || []),
        axes_amelioration: JSON.stringify(data.axesAmelioration || []),
        difficultes: JSON.stringify(data.difficultes || []),
        nb_mots: data.nbMots || 0,
        created_at: new Date().toISOString()
      });
      console.log('save_redaction:', r.status);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue: ' + action }) };

  } catch (err) {
    console.error('Handler error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function sbRequest(baseUrl, key, method, table, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const fullUrl = baseUrl.replace(/\/$/, '') + '/rest/v1/' + table;
    const parsed = new URL(fullUrl);
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
      timeout: 10000
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log(`Supabase ${table}: HTTP ${res.statusCode} — ${d.slice(0,100)}`);
        resolve({ status: res.statusCode, data: d });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Supabase')); });
    req.write(postData);
    req.end();
  });
}
