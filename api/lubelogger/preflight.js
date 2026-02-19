function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function isSafeApiPath(p) {
  if (typeof p !== 'string') return false
  if (!p.startsWith('/')) return false
  if (p.startsWith('//')) return false
  if (p.includes('..')) return false
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Method Not Allowed')
    return
  }

  const baseUrl = process.env.LUBELOGGER_PROXY_BASE_URL
  if (!baseUrl) {
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Missing env var LUBELOGGER_PROXY_BASE_URL')
    return
  }

  const u = new URL(req.url || '/', 'http://localhost')
  const path = u.searchParams.get('path') ?? '/whoami'
  if (!isSafeApiPath(path)) {
    res.statusCode = 400
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Invalid path')
    return
  }

  const target = new URL(`${normalizeBaseUrl(baseUrl)}/api${path}`)

  const origin = req.headers?.origin ? String(req.headers.origin) : 'https://quickfuelup.vercel.app'
  const requestMethod = (u.searchParams.get('method') ?? 'GET').toUpperCase()
  const requestHeaders = u.searchParams.get('headers') ?? 'x-api-key,culture-invariant,content-type'

  const resp = await fetch(target.toString(), {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': requestMethod,
      'Access-Control-Request-Headers': requestHeaders,
    },
  })

  const allowHeaders = [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-max-age',
    'allow',
    'vary',
    'server',
  ]

  const outHeaders = {}
  for (const key of allowHeaders) {
    const v = resp.headers.get(key)
    if (v) outHeaders[key] = v
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(
    JSON.stringify({
      target: target.toString(),
      sent: { origin, requestMethod, requestHeaders },
      result: {
        status: resp.status,
        statusText: resp.statusText,
        headers: outHeaders,
      },
    }),
  )
}

