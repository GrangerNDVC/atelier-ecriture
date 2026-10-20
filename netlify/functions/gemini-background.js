const https = require('https');

// Le suffixe "-background" dans le nom du fichier dit à Netlify de traiter cette fonction
// différemment : l'appelant reçoit un 202 immédiat et cette fonction continue de tourner jusqu'à
// 15 minutes. Comme on n'est plus contraint par les 10s des fonctions normales, on peut se
// permettre une cascade SÉQUENTIELLE avec des délais généreux par modèle (beaucoup plus fiable et
// économe en quota qu'une course en parallèle) : on essaie le premier modèle, et on ne passe au
// suivant QUE s'il échoue vraiment.

const OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",        // Valeur sûre, bon compromis vitesse/qualité
  "mistralai/mistral-small-3.1-24b-instruct:free", // Petit modèle rapide, français, fiable
  "z-ai/glm-5.2:free",                             // Bonne qualité, potentiellement plus lent
  "minimax/minimax-m3:free",
  "deepseek/deepseek-v4-flash:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free"
];
const MODEL_TIMEOUT_MS = 25000; // large, car plus de contrainte de 10s ici

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  let jobId = null;
  try {
    const payload = JSON.parse(event.body);
    jobId = payload.jobId;
    const messages = payload.messages;
    if (!jobId || !messages) throw new Error('jobId ou messages manquant');
    console.log('[gemini-background] Démarrage job', jobId);

    const openRouterKeys = [
      process.env.OPENROUTER_KEY_1, process.env.OPENROUTER_KEY_2, process.env.OPENROUTER_KEY_3,
    ].filter(Boolean);
    const mistralKeys = [
      process.env.MISTRAL_KEY_1, process.env.MISTRAL_KEY_2, process.env.MISTRAL_KEY_3,
    ].filter(Boolean);
    console.log('[gemini-background] Clés dispo — OpenRouter:', openRouterKeys.length, '/ Mistral:', mistralKeys.length);
    if (openRouterKeys.length === 0 && mistralKeys.length === 0) {
      throw new Error("Aucune clé API trouvée dans les variables Netlify.");
    }

    let answer = null, lastError = 'Aucune tentative';
    for (const model of OPENROUTER_MODELS) {
      for (const key of openRouterKeys) {
        const result = await tryOpenRouter(key, model, messages, MODEL_TIMEOUT_MS);
        console.log(`[gemini-background] ${model} / ...${key.slice(-4)} →`, result.success ? 'OK' : 'ÉCHEC: ' + result.error);
        if (result.success) { answer = result.answer; break; }
        lastError = `${model}: ${result.error}`;
      }
      if (answer) break;
    }
    if (!answer) {
      for (const key of mistralKeys) {
        const result = await tryMistral(key, messages, MODEL_TIMEOUT_MS);
        console.log('[gemini-background] mistral-direct →', result.success ? 'OK' : 'ÉCHEC: ' + result.error);
        if (result.success) { answer = result.answer; break; }
        lastError = `mistral-direct: ${result.error}`;
      }
    }

    if (answer) {
      const r = await sbUpdateJob(SUPABASE_URL, SUPABASE_KEY, jobId, { status: 'done', result: answer });
      console.log('[gemini-background] Update Supabase (done) → HTTP', r.status, r.data);
    } else {
      const r = await sbUpdateJob(SUPABASE_URL, SUPABASE_KEY, jobId, { status: 'error', error: lastError });
      console.log('[gemini-background] Update Supabase (error) → HTTP', r.status, r.data, '| lastError:', lastError);
    }
  } catch (err) {
    console.error('[gemini-background] Exception:', err.message);
    if (jobId && SUPABASE_URL && SUPABASE_KEY) {
      await sbUpdateJob(SUPABASE_URL, SUPABASE_KEY, jobId, { status: 'error', error: err.message }).catch(()=>{});
    }
  }
};

function sbUpdateJob(baseUrl, key, jobId, fields) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(fields);
    const parsed = new URL(baseUrl.replace(/\/$/, '') + '/rest/v1/ai_jobs?id=eq.' + encodeURIComponent(jobId));
    const options = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'PATCH',
      headers: {
        'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData), 'Prefer': 'return=minimal'
      },
      timeout: 8000
    };
    const req = https.request(options, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout Supabase (ai_jobs update)')); });
    req.write(postData); req.end();
  });
}

function tryOpenRouter(key, model, messages, timeoutMs) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, messages, max_tokens: 3000 });
    const options = {
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json',
        'HTTP-Referer': 'https://netlify.app', 'X-Title': 'Atelier College'
      },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      let data = ''; res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content;
            if (content) resolve({ success: true, answer: content });
            else resolve({ success: false, error: 'Contenu vide' });
          } catch (e) { resolve({ success: false, error: 'Parse: ' + e.message }); }
        } else resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.slice(0,150)}` });
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout ' + timeoutMs + 'ms' }); });
    req.write(postData); req.end();
  });
}

function tryMistral(key, messages, timeoutMs) {
  return new Promise((resolve) => {
    const msgs = messages.map(m => m.role === 'system' ? { ...m, role: 'user' } : m);
    const postData = JSON.stringify({ model: 'mistral-small-latest', messages: msgs, max_tokens: 3000 });
    const options = {
      hostname: 'api.mistral.ai', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ success: true, answer: JSON.parse(data).choices[0].message.content }); }
          catch (e) { resolve({ success: false, error: 'Parse: ' + e.message }); }
        } else resolve({ success: false, error: `HTTP ${res.statusCode}` });
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData); req.end();
  });
}
