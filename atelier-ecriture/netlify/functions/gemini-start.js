const https = require('https');
const crypto = require('crypto');

// Cette fonction est volontairement TRÈS rapide (pas d'appel IA ici) : elle crée juste une ligne
// "en attente" dans Supabase, déclenche gemini-background.js (qui, lui, a jusqu'à 15 minutes pour
// travailler, sans la limite de 10s des fonctions normales de Netlify), et renvoie immédiatement
// un identifiant de job que le navigateur va ensuite interroger via gemini-status.js.
//
// Nécessite une table Supabase "ai_jobs" (voir le SQL fourni à Julie) :
//   id text primary key, status text, result text, error text, created_at timestamptz

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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_ANON_KEY manquantes)' }) };
  }

  try {
    const payload = JSON.parse(event.body);
    const messages = payload._messages || [{ role: 'user', content: payload.prompt }];
    const jobId = crypto.randomUUID();
    console.log('[gemini-start] Nouveau job:', jobId);

    // 1. Crée la ligne "en attente"
    const insertResult = await sbInsert(SUPABASE_URL, SUPABASE_KEY, 'ai_jobs', {
      id: jobId, status: 'pending', created_at: new Date().toISOString()
    });
    if (insertResult.status < 200 || insertResult.status >= 300) {
      console.error('[gemini-start] ÉCHEC insertion ai_jobs. HTTP', insertResult.status, '—', insertResult.data);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Écriture Supabase (ai_jobs) refusée : HTTP ' + insertResult.status + ' — ' + insertResult.data }) };
    }
    console.log('[gemini-start] Insertion ai_jobs OK (HTTP', insertResult.status, ')');

    // 2. Déclenche la fonction de fond (fire-and-forget : on n'attend pas qu'elle finisse,
    // juste l'accusé de réception quasi-instantané de Netlify pour les fonctions "-background")
    const base = process.env.URL || ('https://' + (event.headers.host || ''));
    console.log('[gemini-start] Déclenchement background sur', base + '/.netlify/functions/gemini-background');
    await triggerBackground(base + '/.netlify/functions/gemini-background', { jobId, messages });

    return { statusCode: 200, headers, body: JSON.stringify({ jobId }) };
  } catch (err) {
    console.error('[gemini-start] Exception:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

function sbInsert(baseUrl, key, table, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(baseUrl.replace(/\/$/, '') + '/rest/v1/' + table);
    const options = {
      hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
      headers: {
        'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData), 'Prefer': 'return=minimal'
      },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Supabase (ai_jobs insert)')); });
    req.write(postData); req.end();
  });
}

function triggerBackground(url, body) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      timeout: 5000
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {}); // on ignore le corps, seul le 202 immédiat nous intéresse
      res.on('end', resolve);
    });
    // On ne bloque jamais gemini-start à cause d'un souci de déclenchement : on résout quand même,
    // gemini-background pourra être invoqué manuellement/retenté si besoin plus tard.
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(postData); req.end();
  });
}
