const https = require('https')

function httpsPost(hostname, path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data._key}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }
    // On retire la clé du body avant d'envoyer
    const cleanBody = JSON.stringify({ ...data, _key: undefined })
    const options2 = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data._key}`,
        'Content-Length': Buffer.byteLength(cleanBody),
      },
    }
    const req = https.request(options2, (res) => {
      let raw = ''
      res.on('data', (chunk) => raw += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }) }
        catch (e) { resolve({ status: res.statusCode, data: raw }) }
      })
    })
    req.on('error', reject)
    req.write(cleanBody)
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Aucune clé Mistral configurée dans Netlify.' }),
    }
  }

  const { prompt } = JSON.parse(event.body)
  let lastError = null

  for (const key of keys) {
    try {
      const payload = {
        _key: key,
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 600,
      }

      const result = await httpsPost(
        'api.mistral.ai',
        '/v1/chat/completions',
        payload
      )

      if (result.status === 429 || result.status === 401) {
        lastError = { status: result.status }
        continue
      }

      if (result.status === 200) {
        const text = result.data.choices[0].message.content
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text }),
        }
      }

      lastError = { status: result.status, detail: result.data }

    } catch (err) {
      lastError = { error: err.message }
      continue
    }
  }

  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({ error: 'Toutes les clés ont échoué.', detail: lastError }),
  }
}
