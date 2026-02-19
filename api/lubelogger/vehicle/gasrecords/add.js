import { proxyToLubeLogger } from '../../_util.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('Method Not Allowed')
    return
  }
  await proxyToLubeLogger(req, res, '/vehicle/gasrecords/add')
}

