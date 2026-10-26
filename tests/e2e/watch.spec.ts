// Corre en Google Chrome (proyecto "chrome"): el video se decodifica de verdad.
import { test as base, expect, type Page } from '@playwright/test'
import { loginAs as loginWithSharedIp } from './fixtures'
import { adminClient, createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'

// Navegador limpio: sin x-forwarded-for en la reproducción (forzaría preflight CORS hacia el
// Worker) y sin page.route (interceptar cancela el guardado al cerrar la pestaña, PRG-06)
const test = base

/** Login con IP propia (rate limit por IP, como fixtures.ts); después se quita la cabecera */
async function loginAs(page: Page, user: TestUser) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
  await loginWithSharedIp(page, user)
  await page.setExtraHTTPHeaders({})
}

let viewer: TestUser
let movieId: string
let slug: string

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-watch' })
  slug = `e2e-watch-${Math.random().toString(36).slice(2, 8)}`
  // tests/fixtures/hls/sample: video real de 12 s, 2 calidades, segmentos de 6 s
  const { data } = await adminClient()
    .from('movies')
    .insert({
      slug,
      title: 'E2E Reproducción',
      synopsis: 'Sinopsis de prueba.',
      genres: ['prueba'],
      release_year: 2026,
      duration_seconds: 12,
      hls_path: 'sample/master.m3u8',
      status: 'published',
    })
    .select('id')
    .single()
  movieId = data!.id
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().eq('id', movieId)
  await deleteUsers([viewer.id])
})
test.beforeEach(async () => {
  await adminClient().from('watch_progress').delete().eq('user_id', viewer.id)
})

const video = (page: Page) => page.locator('video')
const currentTime = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => v.currentTime)
const play = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => {
    v.muted = true
    return v.play()
  })
const savedPosition = async () =>
  (await adminClient().from('watch_progress').select('position_seconds').eq('user_id', viewer.id).eq('movie_id', movieId).maybeSingle())
    .data?.position_seconds

test('WATCH-02 / WATCH-04 se reproduce de verdad, con controles y datos de la película', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)

  await expect(page.getByRole('heading', { name: 'E2E Reproducción' })).toBeVisible()
  await expect(page.getByText('Sinopsis de prueba.')).toBeVisible()
  await expect(page.getByText(/2026 · 12 s · prueba/)).toBeVisible()
  await expect(page.getByRole('button', { name: /fullscreen|pantalla completa/i }).first()).toBeAttached()

  await play(page)
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(2)

  // Las peticiones de video van al Worker con token
  const src = await video(page).evaluate((v: HTMLVideoElement) => v.currentSrc)
  expect(src.startsWith('blob:')).toBe(true) // hls.js (MSE)
})

test('PRG-01 al pausar se guarda la posición en la base', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)
  await play(page)
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(3)
  const t = await video(page).evaluate((v: HTMLVideoElement) => {
    v.pause()
    return v.currentTime
  })
  await expect.poll(savedPosition, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(Math.abs(Number(await savedPosition()) - t)).toBeLessThan(1)
})

test('PRG-02 al volver, arranca donde se quedó', async ({ page }) => {
  await adminClient().from('watch_progress').insert({ user_id: viewer.id, movie_id: movieId, position_seconds: 10.5 })
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(10)
  expect(await currentTime(page)).toBeLessThan(11)
})

test('WATCH-03 si el Worker responde 403 a mitad de la película, renueva el token y sigue', async ({ page }) => {
  await loginAs(page, viewer)

  let firstToken: string | null = null
  let blocked = 0
  let playbackCalls = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/playback/')) playbackCalls++
  })
  // Simula que el primer token caduca justo después del primer segmento
  await page.route(/\/t\/[^/]+\/sample\/.*seg_0000[1-9]\.ts$/, async (route) => {
    const token = route.request().url().match(/\/t\/([^/]+)\//)![1]
    if (token === firstToken) {
      blocked++
      return route.fulfill({ status: 403, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    return route.continue()
  })
  page.on('request', (req) => {
    const m = req.url().match(/\/t\/([^/]+)\/sample\/master\.m3u8/)
    if (m && !firstToken) firstToken = m[1]
  })

  await page.goto(`/dashboard/watch/${slug}`)
  await play(page)

  // Pasa del primer segmento (0–6 s) al segundo, que solo carga con el token nuevo
  await expect.poll(() => currentTime(page), { timeout: 30_000 }).toBeGreaterThan(7)
  expect(blocked).toBeGreaterThan(0)
  expect(playbackCalls).toBeGreaterThan(0)
})

test('PRG-06 salir de la película mientras se reproduce no borra el progreso', async ({ page }) => {
  await adminClient().from('watch_progress').insert({ user_id: viewer.id, movie_id: movieId, position_seconds: 10.5 })
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(10)
  await play(page)
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(10.8)

  // Navegación dentro de la app mientras el video sigue sonando
  await page.getByRole('link', { name: /catálogo/i }).first().click()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.waitForTimeout(1500)
  const saved = Number(await savedPosition())
  expect(saved, `progreso guardado tras salir: ${saved}`).toBeGreaterThan(10)
})

test('PRG-06 cerrar la pestaña mientras se reproduce guarda la posición', async ({ page, context }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)
  await play(page)
  // Menos de los 10 s del guardado periódico: solo el guardado al salir lo puede registrar
  await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(4)
  const t = await currentTime(page)
  await page.close({ runBeforeUnload: true })

  await expect.poll(async () => Number(await savedPosition()), { timeout: 10_000 }).toBeGreaterThan(3)
  expect(Math.abs(Number(await savedPosition()) - t)).toBeLessThan(1.5)
  void context
})

