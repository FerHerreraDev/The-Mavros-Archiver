// Corre en Google Chrome (proyecto "chrome", coincide con /watch\.spec\.ts/): el video se reproduce de verdad.
import { test, expect, type Page } from '@playwright/test'
import { loginAs as loginWithSharedIp } from './fixtures'
import { adminClient, createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'

async function loginAs(page: Page, user: TestUser) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
  await loginWithSharedIp(page, user)
  await page.setExtraHTTPHeaders({})
}

const tag = Math.random().toString(36).slice(2, 8)
let viewer: TestUser
let seriesId: string
const seriesTitle = `E2E Serie ${tag}`
const seriesSlug = `e2e-serie-${tag}`
const episodeSlug = (n: number) => `${seriesSlug}-s01e0${n}`

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-series' })
  const { data } = await adminClient()
    .from('series')
    .insert({ slug: seriesSlug, title: seriesTitle, synopsis: 'Una serie de prueba.', release_year: 2026, genres: ['prueba'], status: 'published' })
    .select('id')
    .single()
  seriesId = data!.id
  // tests/fixtures/hls/sample: video real de 12 s
  await adminClient()
    .from('movies')
    .insert(
      [1, 2].map((n) => ({
        slug: episodeSlug(n),
        title: `Capítulo ${n}`,
        duration_seconds: 12,
        hls_path: 'sample/master.m3u8',
        status: 'published',
        series_id: seriesId,
        season_number: 1,
        episode_number: n,
      }))
    )
})
test.afterAll(async () => {
  await adminClient().from('series').delete().eq('id', seriesId)
  await deleteUsers([viewer.id])
})

const video = (page: Page) => page.locator('video')
/** Lleva el video casi al final y lo reproduce para que termine (evento ended) */
const playToEnd = (page: Page) =>
  video(page).evaluate(async (v: HTMLVideoElement) => {
    v.muted = true
    await v.play()
    v.currentTime = Math.max(0, v.duration - 1)
  })

test('SER-08 / SER-09 / SER-10 del catálogo a la serie y al primer episodio', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto('/dashboard')
  const section = page.getByRole('region', { name: 'Series' })
  await section.getByRole('link', { name: `Ver serie ${seriesTitle}` }).click()

  await expect(page).toHaveURL(new RegExp(`/dashboard/series/${seriesSlug}$`))
  await expect(page.getByRole('heading', { name: seriesTitle })).toBeVisible()
  await expect(page.getByText('Una serie de prueba.')).toBeVisible()
  await expect(page.getByText(/2026 · 2 episodios · prueba/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Ver T1:E2 Capítulo 2/ })).toBeVisible()

  await page.getByRole('link', { name: 'Reproducir T1:E1' }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${episodeSlug(1)}$`))
  await expect(page.getByText('Temporada 1 · Episodio 1')).toBeVisible()
  await expect(page.getByRole('link', { name: seriesTitle }).first()).toBeVisible()
})

test('SER-12 al terminar ofrece el siguiente; Cancelar lo quita y la cuenta regresiva lo abre sola', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${episodeSlug(1)}`)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(10)

  await playToEnd(page)
  const dialog = page.getByRole('dialog', { name: 'Siguiente episodio' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText('T1:E2 · Capítulo 2')).toBeVisible()
  await expect(dialog.getByText(/Siguiente episodio en \d+ s/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(new RegExp(`${episodeSlug(1)}$`))

  // Otra vez al final: sin tocar nada, a los ~10 s pasa al siguiente
  await playToEnd(page)
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${episodeSlug(2)}$`), { timeout: 15_000 })
  await expect(page.getByText('Temporada 1 · Episodio 2')).toBeVisible()
})

test('SER-12 "Ver ahora" abre el siguiente; en el último episodio no aparece', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${episodeSlug(1)}`)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(10)
  await playToEnd(page)
  await page.getByRole('button', { name: 'Ver ahora' }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${episodeSlug(2)}$`))

  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(10)
  await playToEnd(page)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.ended), { timeout: 15_000 }).toBe(true)
  await page.waitForTimeout(1000)
  await expect(page.getByRole('dialog', { name: 'Siguiente episodio' })).toHaveCount(0)
})

test('SER-11 al terminar un episodio, "Seguir viendo" ofrece el siguiente', async ({ page }) => {
  const watcher = await createUser({ prefix: 'e2e-series-cont' })
  try {
    const { data: ep1 } = await adminClient().from('movies').select('id').eq('slug', episodeSlug(1)).single()
    await adminClient().from('watch_progress').insert({ user_id: watcher.id, movie_id: ep1!.id, position_seconds: 12 })
    await loginAs(page, watcher)
    await page.goto('/dashboard')
    const row = page.getByRole('region', { name: 'Seguir viendo' })
    const card = row.getByRole('link', { name: `Ver ${seriesTitle} T1:E2` })
    await expect(card).toBeVisible()
    await expect(card.getByText('T1:E2 · Capítulo 2')).toBeVisible()
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${episodeSlug(2)}$`))
  } finally {
    await deleteUsers([watcher.id])
  }
})
