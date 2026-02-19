export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    // Same-origin requests won't need CORS, but keep this friendly.
    res.statusCode = 204
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type, x-api-key')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    return
  }

  const apiKey = req.headers['x-api-key']
  if (!apiKey || typeof apiKey !== 'string') {
    res.statusCode = 400
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing x-api-key header' }))
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      // leave as-is
    }
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    })

    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Upstream request failed', message: e instanceof Error ? e.message : String(e) }))
  }
}

