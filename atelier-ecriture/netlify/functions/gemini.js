const https = require('https')

function httpsPost(hostname, path, key, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body)
    const options = {
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }) }
        catch (e) { resolve({ status: res.statusCode, data: raw }) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' }

  const keys = [
    process.env.MISTRAL_KEY_1,
    process.env.MISTRAL_KEY_2,
    process.env.MISTRAL_KEY_3,
  ].filter(Boolean)

  if (keys.length === 0) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Aucune clé Mistral configurée.' }) }
  }

  let payload
  try { payload = JSON.parse(event.body) } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }
  }

  // Support both simple { prompt } and multi-turn { _messages }
  const messages = payload._messages || [{ role: 'user', content: payload.prompt }]
  let lastError = null

  for (const key of keys) {
    try {
      const result = await httpsPost(
        'api.mistral.ai',
        '/v1/chat/completions',
        key,
        { model: 'mistral-small-latest', messages, temperature: 0.7, max_tokens: 800 }
      )

      if (result.status === 401 || result.status === 429) {
        lastError = { status: result.status }; continue
      }
      if (result.status === 200) {
        const text = result.data.choices?.[0]?.message?.content || ''
        return { statusCode: 200, headers, body: JSON.stringify({ text }) }
      }
      lastError = { status: result.status, detail: result.data }
    } catch (err) {
      lastError = { error: err.message }; continue
    }
  }

  return {
    statusCode: 503, headers,
    body: JSON.stringify({ error: 'Toutes les clés ont échoué.', detail: lastError }),
  }
}
