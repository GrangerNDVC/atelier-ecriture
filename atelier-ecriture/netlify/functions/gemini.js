const https = require('https');

// Modèles GRATUITS uniquement, mis à jour (sept. 2026). ⚠️ Avec le système de course en
// parallèle ci-dessous, SEULS les 2 ou 3 premiers modèles de cette liste sont réellement utilisés
// à chaque appel (voir plus bas) — pour changer quels modèles sont essayés, réordonnez cette
// liste, ne l'allongez pas. Les deux premiers doivent être des modèles RAPIDES et FIABLES avant
// tout (une bonne qualité inutile si le modèle est trop lent et ne répond jamais à temps) ; les
// suivants (plus gros/plus qualitatifs mais potentiellement plus lents) servent de 3e tentative.
// Rappel : tous les modèles ":free" d'OpenRouter partagent le MÊME quota journalier (50/jour sans
// crédit déposé, 1000/jour si 10$ ont été déposés une fois — un dépôt ponctuel, pas un abonnement),
// et le catalogue gratuit tourne régulièrement : à revérifier de temps en temps sur
// openrouter.ai/models (filtre "Free").
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",       // Valeur sûre, bon compromis vitesse/qualité
  "mistralai/mistral-small-3.1-24b-instruct:free",// Petit modèle rapide, français, fiable
  "z-ai/glm-5.2:free",                            // Meilleure qualité repérée, mais potentiellement plus lent
  "minimax/minimax-m3:free",                      // Très utilisé, gros contexte
  "deepseek/deepseek-v4-flash:free",              // Bonne réputation générale
  "nvidia/nemotron-3-ultra-550b-a55b:free"        // Gros modèle, en dernier (le plus lent probable)
];

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const payload = JSON.parse(event.body);
    const messages = payload._messages || [{ role: "user", content: payload.prompt }];

    const openRouterKeys = [
      process.env.OPENROUTER_KEY_1,
      process.env.OPENROUTER_KEY_2,
      process.env.OPENROUTER_KEY_3,
    ].filter(Boolean);

    const mistralKeys = [
      process.env.MISTRAL_KEY_1,
      process.env.MISTRAL_KEY_2,
      process.env.MISTRAL_KEY_3,
    ].filter(Boolean);

    if (openRouterKeys.length === 0 && mistralKeys.length === 0) {
      throw new Error("Aucune clé API trouvée dans les variables Netlify.");
    }

    // IMPORTANT — Netlify coupe une fonction après 10s (plan gratuit) / 26s (plan Pro).
    // Essayer les modèles un par un (avec un timeout de 25s chacun comme avant) dépasse
    // systématiquement cette limite dès qu'un seul modèle est lent : Netlify tue alors la
    // fonction (504) avant même d'avoir reçu de réponse, et l'appli retombe sur un texte de
    // secours vide. On lance donc 2-3 tentatives EN PARALLÈLE (modèles différents, clés
    // différentes si possible) avec un timeout court (8s), et on prend la première qui réussit.
    const ROUND_TIMEOUT_MS = 8000;
    const key1 = openRouterKeys[0];
    const key2 = openRouterKeys[1] || openRouterKeys[0];
    const key3 = openRouterKeys[2] || openRouterKeys[0];

    const attempts = [];
    if (key1) attempts.push(() => tryOpenRouter(key1, OPENROUTER_MODELS[0], messages, ROUND_TIMEOUT_MS)
      .then(r => logAttempt(OPENROUTER_MODELS[0], key1, r)));
    if (key2 && OPENROUTER_MODELS[1]) attempts.push(() => tryOpenRouter(key2, OPENROUTER_MODELS[1], messages, ROUND_TIMEOUT_MS)
      .then(r => logAttempt(OPENROUTER_MODELS[1], key2, r)));
    if (mistralKeys[0]) attempts.push(() => tryMistral(mistralKeys[0], messages, ROUND_TIMEOUT_MS)
      .then(r => logAttempt('mistral-small-latest (direct)', mistralKeys[0], r)));
    else if (key3 && OPENROUTER_MODELS[2]) attempts.push(() => tryOpenRouter(key3, OPENROUTER_MODELS[2], messages, ROUND_TIMEOUT_MS)
      .then(r => logAttempt(OPENROUTER_MODELS[2], key3, r)));

    try {
      const result = await raceFirstSuccess(attempts, ROUND_TIMEOUT_MS + 500);
      return { statusCode: 200, headers, body: JSON.stringify({ answer: result.answer }) };
    } catch (e) {
      throw new Error("Tous les modèles ont échoué ou ont mis trop de temps à répondre : " + e.message);
    }

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

function logAttempt(model, key, result) {
  if (result.success) console.log("Modèle utilisé:", model);
  else console.warn(`Échec ${model} / clé ...${key.slice(-4)}: ${result.error}`);
  return result;
}

// Lance plusieurs tentatives en parallèle, retourne dès que la PREMIÈRE réussit.
// Ne rejette que si toutes ont échoué (ou si le délai global est dépassé).
function raceFirstSuccess(attemptFactories, hardTimeoutMs) {
  return new Promise((resolve, reject) => {
    if (attemptFactories.length === 0) { reject(new Error("Aucune tentative possible (clés manquantes)")); return; }
    let pending = attemptFactories.length;
    let settled = false;
    const globalTimer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("Délai global dépassé")); }
    }, hardTimeoutMs);
    attemptFactories.forEach(factory => {
      factory().then(result => {
        if (settled) return;
        if (result && result.success) {
          settled = true;
          clearTimeout(globalTimer);
          resolve(result);
        } else {
          pending--;
          if (pending === 0 && !settled) { settled = true; clearTimeout(globalTimer); reject(new Error("Tous les modèles ont échoué")); }
        }
      }).catch(() => {
        pending--;
        if (pending === 0 && !settled) { settled = true; clearTimeout(globalTimer); reject(new Error("Tous les modèles ont échoué")); }
      });
    });
  });
}

function tryOpenRouter(key, model, messages, timeoutMs) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, messages, max_tokens: 3000 });
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://netlify.app',
        'X-Title': 'Atelier College'
      },
      timeout: timeoutMs || 8000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content;
            if (content) resolve({ success: true, answer: content });
            else resolve({ success: false, error: "Contenu vide" });
          } catch (e) { resolve({ success: false, error: "Parse: " + e.message }); }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.slice(0,150)}` });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout ' + (timeoutMs||8000) + 'ms' }); });
    req.write(postData);
    req.end();
  });
}

function tryMistral(key, messages, timeoutMs) {
  return new Promise((resolve) => {
    const msgs = messages.map(m => m.role === 'system' ? { ...m, role: 'user' } : m);
    const postData = JSON.stringify({ model: "mistral-small-latest", messages: msgs, max_tokens: 3000 });
    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: timeoutMs || 8000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ success: true, answer: JSON.parse(data).choices[0].message.content }); }
          catch (e) { resolve({ success: false, error: "Parse: " + e.message }); }
        } else resolve({ success: false, error: `HTTP ${res.statusCode}` });
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}
