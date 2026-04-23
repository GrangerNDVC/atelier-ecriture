const https = require('https');

// Ordre de priorité : DeepSeek V3 (meilleur gratuit) → Llama 3.3 70B → Mistral 7B
const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-7b-instruct:free"
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

    // Essaie chaque modèle dans l'ordre de priorité, avec toutes les clés disponibles
    for (const model of OPENROUTER_MODELS) {
      for (const key of openRouterKeys) {
        const result = await tryOpenRouter(key, model, messages);
        if (result.success) {
          console.log("Modèle utilisé:", model);
          return { statusCode: 200, headers, body: JSON.stringify({ answer: result.answer }) };
        }
        console.warn(`Échec ${model} / clé ...${key.slice(-4)}: ${result.error}`);
      }
    }

    // Fallback final : API Mistral directe
    for (const key of mistralKeys) {
      const result = await tryMistral(key, messages);
      if (result.success) {
        return { statusCode: 200, headers, body: JSON.stringify({ answer: result.answer }) };
      }
      console.warn("Mistral direct échoué:", result.error);
    }

    throw new Error("Tous les modèles ont échoué.");

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

function tryOpenRouter(key, model, messages) {
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
      timeout: 25000
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
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout 25s' }); });
    req.write(postData);
    req.end();
  });
}

function tryMistral(key, messages) {
  return new Promise((resolve) => {
    const msgs = messages.map(m => m.role === 'system' ? { ...m, role: 'user' } : m);
    const postData = JSON.stringify({ model: "mistral-small-latest", messages: msgs });
    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 15000
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
