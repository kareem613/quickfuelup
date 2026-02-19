function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return undefined
  return Buffer.concat(chunks)
}

function pickHeader(req, key) {
  const v = req.headers?.[key]
  if (!v) return undefined
  return Array.isArray(v) ? v.join(',') : String(v)
}

export async function proxyToLubeLogger(req, res, targetPath) {
  const baseUrl = process.env.LUBELOGGER_PROXY_BASE_URL
  if (!baseUrl) {
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Missing env var LUBELOGGER_PROXY_BASE_URL')
    return
  }

  const incomingUrl = new URL(req.url || '/', 'http://localhost')
  const target = new URL(`${normalizeBaseUrl(baseUrl)}/api${targetPath}`)
  target.search = incomingUrl.search // preserve query params (e.g. vehicleId)

  const headers = {}
  const xApiKey = pickHeader(req, 'x-api-key')
  const authorization = pickHeader(req, 'authorization')
  const cultureInvariant = pickHeader(req, 'culture-invariant')
  const contentType = pickHeader(req, 'content-type')

  if (xApiKey) headers['x-api-key'] = xApiKey
  if (authorization) headers['authorization'] = authorization
  if (cultureInvariant) headers['culture-invariant'] = cultureInvariant
  if (contentType) headers['content-type'] = contentType

  const body = req.method && ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined

  const resp = await fetch(target.toString(), {
    method: req.method,
    headers,
    body,
  })

  res.statusCode = resp.status
  const respContentType = resp.headers.get('content-type')
  if (respContentType) res.setHeader('content-type', respContentType)
  res.setHeader('cache-control', 'no-store')

  const buf = Buffer.from(await resp.arrayBuffer())
  res.end(buf)
}

