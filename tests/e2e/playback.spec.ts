import { test, expect, loginAs } from './fixtures'
import { test as plainTest } from '@playwright/test'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let viewer: TestUser
let movieId: string

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-ply' })
  const slug = `e2e-ply-${Math.random().toString(36).slice(2, 8)}`
  const { data } = await adminClient()
    .from('movies')
    .insert({ slug, title: 'E2E Playback', duration_seconds: 22, hls_path: 'ladder/master.m3u8', status: 'published' })
    .select('id')
    .single()
  movieId = data!.id
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().eq('id', movieId)
  await deleteUsers([viewer.id])
})

// Navegador "limpio": el fixture normal agrega x-forwarded-for a todas las peticiones (para el
// rate limit), y eso forzaría un preflight CORS que un navegador real nunca hace.
plainTest('PLY-05..08 desde el navegador: endpoint → URL firmada → master y calidad desde el Worker (CORS)', async ({ page }) => {
  await loginAs(page, viewer)

  const result = await page.evaluate(async (id) => {
    const playback = await fetch(`/api/playback/${id}`).then((r) => r.json())
    // Otro origen (el Worker): esto falla si no hay CORS
    const masterRes = await fetch(playback.url)
    const master = await masterRes.text()
    const variant = master.split('\n').find((l) => l && !l.startsWith('#'))!
    const variantRes = await fetch(new URL(variant, playback.url).href)
    return {
      masterStatus: masterRes.status,
      masterType: masterRes.headers.get('content-type'),
      variantStatus: variantRes.status,
      variantHasEnd: (await variantRes.text()).includes('#EXT-X-ENDLIST'),
      expiresAt: playback.expires_at,
    }
  }, movieId)

  expect(result).toMatchObject({
    masterStatus: 200,
    masterType: 'application/vnd.apple.mpegurl',
    variantStatus: 200,
    variantHasEnd: true,
  })
  expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now())
})

test('PLY-06 sin sesión el endpoint responde 401', async ({ request }) => {
  const res = await request.get(`/api/playback/${movieId}`)
  expect(res.status()).toBe(401)
})

test('PLY-03 la URL del video sin token no sirve', async ({ request }) => {
  const res = await request.get('http://127.0.0.1:3101/ladder/master.m3u8')
  expect(res.status()).toBe(403)
})
