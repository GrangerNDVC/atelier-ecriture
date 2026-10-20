const https = require('https');

// ════════════════════════════════════════════════════════════════
// FOURNISSEUR PRINCIPAL : Mistral La Plateforme (API directe)
// ────────────────────────────────────────────────────────────────
// Pourquoi : contrairement à OpenRouter, les identifiants de modèles
// Mistral sont stables dans le temps (pas de catalogue "gratuit" qui
// change sans préavis). Le tier gratuit "Experiment" offre ~1 milliard
// de tokens/mois par modèle, largement suffisant pour une classe.
// Cascade interne : mistral-small-latest (rapide) puis mistral-large-
// latest (plus solide) si le premier échoue.
// ════════════════════════════════════════════════════════════════
const MISTRAL_MODELS = [
  "mistral-small-latest",
  "mistral-large-latest"
];

// ════════════════════════════════════════════════════════════════
// FOURNISSEUR DE SECOURS : OpenRouter (uniquement si Mistral échoue
// entièrement — panne du service, quota mensuel épuisé, etc.)
// ────────────────────────────────────────────────────────────────
// ⚠️ Le catalogue gratuit d'OpenRouter change souvent. Si ce secours
// se déclenche fréquemment, vérifier la liste à jour sur
// https://openrouter.ai/models (filtre "Price: Free") et remplacer
// les identifiants ci-dessous. "openrouter/free" est un routeur
// automatique fourni par OpenRouter qui choisit lui-même un modèle
// gratuit disponible — c'est le choix le plus robuste face aux
// changements de catalogue.
// ════════════════════════════════════════════════════════════════
const OPENROUTER_MODELS = [
  "openrouter/free",
  "mistralai/mistral-small-3.1-24b-instruct:free"
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

    const mistralKeys = [
      process.env.MISTRAL_KEY_1,
      process.env.MISTRAL_KEY_2,
      process.env.MISTRAL_KEY_3,
    ].filter(Boolean);

    const openRouterKeys = [
      process.env.OPENROUTER_KEY_1,
      process.env.OPENROUTER_KEY_2,
      process.env.OPENROUTER_KEY_3,
    ].filter(Boolean);

    if (mistralKeys.length === 0 && openRouterKeys.length === 0) {
      throw new Error("Aucune clé API trouvée dans les variables Netlify (MISTRAL_KEY_1 ou OPENROUTER_KEY_1 attendues).");
    }

    // Budget global : Netlify (plan gratuit) coupe à 10s → on s'arrête à ~9s
    const t0 = Date.now();
    const remaining = () => Math.max(1500, 9000 - (Date.now() - t0));

    // 1. Essaie Mistral en priorité (modèle rapide, puis modèle robuste), toutes clés dispo
    // Si une clé répond 429 (quota/limite de l'espace de travail, partagé entre les clés),
    // inutile d'essayer les autres : on passe directement au secours.
    let mistralBloque = false;
    for (const model of MISTRAL_MODELS) {
      if (mistralBloque) break;
      for (let i = 0; i < mistralKeys.length; i++) {
        const key = mistralKeys[i];
        const result = await tryMistral(key, model, messages, remaining());
        if (result.success) {
          console.log("Modèle utilisé:", model, "clé index", i + 1);
          return { statusCode: 200, headers, body: JSON.stringify({
            answer: result.answer,
            _debug: { provider: 'mistral', model, keyIndex: i + 1 }
          }) };
        }
        console.warn(`Échec Mistral ${model} / clé ...${key.slice(-4)}: ${result.error}`);
        if (result.status === 429) { mistralBloque = true; break; }
      }
    }

    // 2. Repli sur OpenRouter si Mistral est indisponible
    for (const model of OPENROUTER_MODELS) {
      for (let i = 0; i < openRouterKeys.length; i++) {
        const key = openRouterKeys[i];
        const result = await tryOpenRouter(key, model, messages, remaining());
        if (result.success) {
          console.log("Modèle de secours utilisé (OpenRouter):", model, "clé index", i + 1);
          return { statusCode: 200, headers, body: JSON.stringify({
            answer: result.answer,
            _debug: { provider: 'openrouter', model, keyIndex: i + 1 }
          }) };
        }
        console.warn(`Échec OpenRouter ${model} / clé ...${key.slice(-4)}: ${result.error}`);
        if (Date.now() - t0 > 8500) break;
      }
      if (Date.now() - t0 > 8500) break;
    }

    throw new Error("Tous les fournisseurs ont échoué (Mistral et OpenRouter).");

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

function tryMistral(key, model, messages, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, messages });
    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content;
            if (content) resolve({ success: true, answer: content });
            else resolve({ success: false, error: "Contenu vide" });
          } catch (e) { resolve({ success: false, error: "Parse: " + e.message }); }
        } else {
          resolve({ success: false, status: res.statusCode, error: `HTTP ${res.statusCode}: ${data.slice(0,150)}` });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}

function tryOpenRouter(key, model, messages, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ model, messages });
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
      timeout: timeoutMs
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
          resolve({ success: false, status: res.statusCode, error: `HTTP ${res.statusCode}: ${data.slice(0,150)}` });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}
