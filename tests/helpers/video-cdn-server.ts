// Corre el handler REAL del Worker en Node, con un bucket falso sobre una carpeta local.
// Lo usan las pruebas de integración (import) y Playwright (proceso aparte):
//   VIDEO_TOKEN_SECRET=… node tests/helpers/video-cdn-server.ts <carpeta> <puerto>
import { createServer, type Server } from 'node:http'
import { Readable } from 'node:stream'
import path from 'node:path'
import { handleRequest } from '../../workers/video/src/handler.ts'
import { fsBucket } from './fs-bucket.ts'
import { TEST_VIDEO_SECRET } from './test-secrets.ts'

export { TEST_VIDEO_SECRET }

export function startVideoCdn(root: string, secret: string, port = 0, reads: string[] = []): Promise<Server> {
  const env = { VIDEOS: fsBucket(root, reads), VIDEO_TOKEN_SECRET: secret }
  const server = createServer(async (req, res) => {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const response = await handleRequest(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers }), env)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(res)
    else res.end()
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [root, port] = process.argv.slice(2)
  const secret = process.env.VIDEO_TOKEN_SECRET ?? TEST_VIDEO_SECRET
  const server = await startVideoCdn(path.resolve(root), secret, Number(port))
  console.log(`video cdn on http://127.0.0.1:${(server.address() as { port: number }).port}`)
}
