const https = require('https');

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

    // ✅ Noms corrigés pour correspondre aux variables Netlify
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

    // Tente chaque clé OpenRouter dans l'ordre
    for (const key of openRouterKeys) {
      const result = await tryOpenRouter(key, messages);
      if (result.success) {
        return { statusCode: 200, headers, body: JSON.stringify({ answer: result.answer }) };
      }
      console.warn("Clé OpenRouter échouée, tentative suivante...", result.error);
    }

    // Fallback : tente chaque clé Mistral dans l'ordre
    for (const key of mistralKeys) {
      const result = await tryMistral(key, messages);
      if (result.success) {
        return { statusCode: 200, headers, body: JSON.stringify({ answer: result.answer }) };
      }
      console.warn("Clé Mistral échouée, tentative suivante...", result.error);
    }

    throw new Error("Toutes les clés API ont échoué.");

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

function tryOpenRouter(key, messages) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free",
      messages: messages
    });

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
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve({ success: true, answer: result.choices[0].message.content });
          } catch (e) {
            resolve({ success: false, error: "Parse error: " + e.message });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}

function tryMistral(key, messages) {
  return new Promise((resolve) => {
    // Filtre le message "system" car l'API Mistral directe le supporte différemment
    const mistralMessages = messages.map(m =>
      m.role === 'system' ? { ...m, role: 'user' } : m
    );

    const postData = JSON.stringify({
      model: "mistral-small-latest",
      messages: mistralMessages
    });

    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve({ success: true, answer: result.choices[0].message.content });
          } catch (e) {
            resolve({ success: false, error: "Parse error: " + e.message });
          }
        } else {
          resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}
