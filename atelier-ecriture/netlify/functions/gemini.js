const https = require('https')

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data)
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', (chunk) => raw += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) })
        } catch (e) {
          resolve({ status: res.statusCode, data: raw })
        }
      })
    })
    req.on('error', reject)
    req.write(body)
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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  const keys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
  ].filter(Boolean)

  if (keys.length === 0) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Aucune clé API trouvée dans les variables Netlify.' }),
    }
  }

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash']
  const body = JSON.parse(event.body)
  let lastError = null

  for (const key of keys) {
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
        const result = await httpsPost(url, body)

        if (result.status === 429 || result.status === 403) {
          lastError = { status: result.status, model }
          break
        }
        if (result.status === 404) {
          lastError = { status: 404, model }
          continue
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.data),
        }
      } catch (err) {
        lastError = { error: err.message, model }
        continue
      }
    }
  }

  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({
      error: 'Échec de toutes les clés.',
      detail: lastError,
      keysFound: keys.length,
    }),
  }
}
