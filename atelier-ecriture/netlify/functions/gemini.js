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

    // On récupère les clés une par une pour être sûr
    const orKey = process.env.OPENROUTER_API_KEY_1 || process.env.OPENROUTER_API_KEY_2;
    const mKey = process.env.MISTRAL_API_KEY_1;

    if (!orKey && !mKey) {
      throw new Error("Aucune clé API trouvée dans les variables Netlify.");
    }

    // On prépare l'appel à OpenRouter (Priorité)
    const postData = JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free",
      messages: messages
    });

    return new Promise((resolve) => {
      const options = {
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
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
            const result = JSON.parse(data);
            resolve({
              statusCode: 200,
              headers,
              body: JSON.stringify({ answer: result.choices[0].message.content })
            });
          } else {
            console.error("Erreur API:", data);
            resolve({ statusCode: res.statusCode, headers, body: data });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) });
      });

      req.write(postData);
      req.end();
    });

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
