// ═══════════════════════════════════════════════════════════
// netlify/functions/test-keys.js
// Teste individuellement chaque clé MISTRAL_KEY_1/2/3 et
// OPENROUTER_KEY_1/2/3 configurée dans Netlify, en parallèle
// (pour rester sous la limite de 10s du plan gratuit).
// N'affecte en rien gemini.js — outil de diagnostic uniquement.
// ═══════════════════════════════════════════════════════════
const https = require('https');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const mistralKeys = [
    { label: 'MISTRAL_KEY_1', value: process.env.MISTRAL_KEY_1 },
    { label: 'MISTRAL_KEY_2', value: process.env.MISTRAL_KEY_2 },
    { label: 'MISTRAL_KEY_3', value: process.env.MISTRAL_KEY_3 },
  ];
  const openRouterKeys = [
    { label: 'OPENROUTER_KEY_1', value: process.env.OPENROUTER_KEY_1 },
    { label: 'OPENROUTER_KEY_2', value: process.env.OPENROUTER_KEY_2 },
    { label: 'OPENROUTER_KEY_3', value: process.env.OPENROUTER_KEY_3 },
  ];

  // Tous les tests en parallèle pour rester sous les 10s Netlify
  const tests = [];

  for (const k of mistralKeys) {
    tests.push(
      !k.value
        ? Promise.resolve({ label: k.label, provider: 'Mistral', status: 'absent', detail: 'Variable non définie dans Netlify' })
        : testMistralKey(k.value).then(r => ({ label: k.label, provider: 'Mistral', ...r }))
    );
  }
  for (const k of openRouterKeys) {
    tests.push(
      !k.value
        ? Promise.resolve({ label: k.label, provider: 'OpenRouter', status: 'absent', detail: 'Variable non définie dans Netlify' })
        : testOpenRouterKey(k.value).then(r => ({ label: k.label, provider: 'OpenRouter', ...r }))
    );
  }

  const results = await Promise.all(tests);
  return { statusCode: 200, headers, body: JSON.stringify({ results }) };
};

function testMistralKey(key) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Réponds uniquement le mot : OK' }],
      max_tokens: 10
    });
    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const content = JSON.parse(data)?.choices?.[0]?.message?.content || '';
            resolve({ status: 'ok', detail: `Réponse reçue : "${content.trim()}"` });
          } catch (e) { resolve({ status: 'error', detail: 'Réponse illisible : ' + e.message }); }
        } else {
          let msg = data.slice(0, 180);
          try { msg = JSON.parse(data)?.message || JSON.parse(data)?.error?.message || msg; } catch (e) {}
          resolve({ status: 'error', detail: `HTTP ${res.statusCode} — ${msg}` });
        }
      });
    });
    req.on('error', e => resolve({ status: 'error', detail: 'Réseau : ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'error', detail: 'Timeout 8s' }); });
    req.write(postData);
    req.end();
  });
}

function testOpenRouterKey(key) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: 'openrouter/free',
      messages: [{ role: 'user', content: 'Réponds uniquement le mot : OK' }],
      max_tokens: 10
    });
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://netlify.app',
        'X-Title': 'Atelier College - Test'
      },
      timeout: 8000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const content = JSON.parse(data)?.choices?.[0]?.message?.content || '';
            resolve({ status: 'ok', detail: `Réponse reçue : "${content.trim()}"` });
          } catch (e) { resolve({ status: 'error', detail: 'Réponse illisible : ' + e.message }); }
        } else {
          resolve({ status: 'error', detail: `HTTP ${res.statusCode} — ${data.slice(0, 180)}` });
        }
      });
    });
    req.on('error', e => resolve({ status: 'error', detail: 'Réseau : ' + e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'error', detail: 'Timeout 8s' }); });
    req.write(postData);
    req.end();
  });
}
