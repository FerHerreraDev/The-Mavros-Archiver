#!/usr/bin/env node
// Servidor estático mínimo que simula R2 en las pruebas (tipos HLS + CORS).
//   node tests/helpers/static-server.mjs <carpeta> <puerto>
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' }

export function startStaticServer(root, port = 0) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const base = path.resolve(root)
    const file = path.resolve(base, '.' + pathname)
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (!file.startsWith(base + path.sep)) return res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [root, port] = process.argv.slice(2)
  const server = await startStaticServer(path.resolve(root), Number(port))
  console.log(`static server on http://127.0.0.1:${server.address().port}`)
}
