exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  if (!event.body || event.body.length > 20000) {
    return { statusCode: 413, body: 'Requête trop grande' }
  }

  // Trousseau de clés — on essaie dans l'ordre, on passe à la suivante si erreur
  const keys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
  ].filter(Boolean) // ignore les clés non définies

  if (keys.length === 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Aucune clé API configurée.' }),
    }
  }

  const body = JSON.parse(event.body)
  let lastError = null

  for (const key of keys) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )

      const data = await response.json()

      // Si la clé est épuisée ou invalide (429 = quota, 400/403 = clé invalide)
      // on passe automatiquement à la clé suivante
      if (response.status === 429 || response.status === 403) {
        lastError = data
        continue
      }

      // Succès — on renvoie la réponse
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(data),
      }

    } catch (err) {
      lastError = { error: err.message }
      continue // essaie la clé suivante
    }
  }

  // Toutes les clés ont échoué
  return {
    statusCode: 503,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      error: 'Toutes les clés API sont temporairement indisponibles. Réessayez dans quelques minutes.',
      detail: lastError,
    }),
  }
}
