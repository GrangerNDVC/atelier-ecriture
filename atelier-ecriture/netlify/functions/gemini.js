const https = require('https');

function httpsPost(hostname, path, key, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://netlify.app', // Obligatoire pour OpenRouter
        'X-Title': 'Atelier Ecriture Classe',
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

  // On récupère toutes les clés possibles dans vos variables Netlify
  const keys = [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3
  ].filter(Boolean);

  if (keys.length === 0) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Aucune clé API configurée.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const messages = payload._messages || [{ role: 'user', content: payload.prompt }];
  
  // On mélange les clés pour que chaque élève n'utilise pas la même
  const randomKey = keys[Math.floor(Math.random() * keys.length)];

  try {
    const result = await httpsPost(
      'openrouter.ai',
      '/api/v1/chat/completions',
      randomKey,
      {
        // Utilisation d'un modèle gratuit et performant (Mistral 7B ou Llama 3)
        model: 'mistralai/mistral-7b-instruct:free', 
        messages,
        temperature: 0.7
      }
    );

    if (result.status === 200) {
      const text = result.data.choices?.[0]?.message?.content || '';
      return { statusCode: 200, headers, body: JSON.stringify({ answer: text }) };
    } else {
      return { statusCode: result.status, headers, body: JSON.stringify({ error: 'Erreur OpenRouter' }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
