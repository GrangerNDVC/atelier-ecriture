const https = require('https');

function apiRequest(hostname, path, key, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://netlify.app',
        'X-Title': 'Atelier Ecriture College',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const openRouterKeys = [
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3
  ].filter(Boolean);

  const mistralKeys = [
    process.env.MISTRAL_API_KEY_1,
    process.env.MISTRAL_API_KEY_2,
    process.env.MISTRAL_API_KEY_3
  ].filter(Boolean);

  let payload;
  try { payload = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const messages = payload._messages || [{ role: 'user', content: payload.prompt }];

  // --- LOGIQUE DE SECOURS ---
  // On essaie d'abord OpenRouter
  if (openRouterKeys.length > 0) {
    const orKey = openRouterKeys[Math.floor(Math.random() * openRouterKeys.length)];
    try {
      const resOR = await apiRequest('openrouter.ai', '/api/v1/chat/completions', orKey, {
        model: 'mistralai/mistral-7b-instruct:free',
        messages,
        temperature: 0.7
      });
      if (resOR.status === 200 && resOR.data.choices) {
        return { statusCode: 200, headers, body: JSON.stringify({ answer: resOR.data.choices[0].message.content }) };
      }
    } catch (err) { console.error("Erreur OpenRouter"); }
  }

  // Si échec, on essaie Mistral
  if (mistralKeys.length > 0) {
    const mKey = mistralKeys[Math.floor(Math.random() * mistralKeys.length)];
    try {
      const resM = await apiRequest('api.mistral.ai', '/v1/chat/completions', mKey, {
        model: 'mistral-small-latest',
        messages,
        temperature: 0.7
      });
      if (resM.status === 200) {
        return { statusCode: 200, headers, body: JSON.stringify({ answer: resM.data.choices[0].message.content }) };
      }
    } catch (err) { console.error("Erreur Mistral"); }
  }

  return { statusCode: 500, headers, body: JSON.stringify({ error: "Service momentanément indisponible." }) };
};
