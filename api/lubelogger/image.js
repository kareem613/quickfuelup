function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function isSafePath(p) {
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
  const path = u.searchParams.get('path')
  if (!isSafePath(path)) {
    res.statusCode = 400
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Invalid path')
    return
  }

  const target = new URL(`${normalizeBaseUrl(baseUrl)}${path}`)
  const resp = await fetch(target.toString(), { method: 'GET' })

  res.statusCode = resp.status
  const contentType = resp.headers.get('content-type')
  if (contentType) res.setHeader('content-type', contentType)
  res.setHeader('cache-control', 'public, max-age=3600')

  const buf = Buffer.from(await resp.arrayBuffer())
  res.end(buf)
}

