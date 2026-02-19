const { proxyToLubeLogger } = require('./_util.cjs')

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Method Not Allowed')
    return
  }
  await proxyToLubeLogger(req, res, '/whoami')
}

