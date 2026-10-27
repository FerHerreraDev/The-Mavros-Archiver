import sharp from 'sharp'
import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

const tag = Math.random().toString(36).slice(2, 8)
const slug = `e2e-sp-${tag}`
let viewer: TestUser
let seriesId: string

/** Imagen sólida subida al bucket local de pósters: su URL pública */
async function image(name: string, width: number, height: number, color: string) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: color } }).webp().toBuffer()
  const path = `e2e-${tag}-${name}.webp`
  await adminClient().storage.from('posters').upload(path, bytes, { contentType: 'image/webp', upsert: true })
  return adminClient().storage.from('posters').getPublicUrl(path).data.publicUrl
}

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-series-page' })
  const { data } = await adminClient()
    .from('series')
    .insert({
      slug,
      title: 'Serie con portada',
      synopsis: 'Una sinopsis larga de la serie para la portada.',
      release_year: 2008,
      genres: ['drama'],
      status: 'published',
      backdrop_image_url: await image('backdrop', 1280, 720, '#7a4fd0'),
      tmdb_id: 1396,
    })
    .select('id')
    .single()
  seriesId = data!.id
  const still = await image('still', 640, 360, '#2a5a4a')
  const ep = (season: number, n: number, extra: Record<string, unknown> = {}) => ({
    slug: `${slug}-s0${season}e0${n}`,
    title: `Capítulo ${season}.${n}`,
    duration_seconds: 2820,
    hls_path: 'sample/master.m3u8',
    status: 'published',
    series_id: seriesId,
    season_number: season,
    episode_number: n,
    ...extra,
  })
  const { data: eps } = await adminClient()
    .from('movies')
    .insert([ep(1, 1, { synopsis: 'Así empieza todo.', poster_image_url: still }), ep(1, 2, { synopsis: 'Segundo capítulo.' }), ep(2, 1)])
    .select('id, slug')
  const e11 = eps!.find((e) => e.slug.endsWith('s01e01'))!.id
  await adminClient().from('watch_progress').insert({ user_id: viewer.id, movie_id: e11, position_seconds: 900 })
})

test.afterAll(async () => {
  await adminClient().from('series').delete().eq('id', seriesId)
  await adminClient().storage.from('posters').remove([`e2e-${tag}-backdrop.webp`, `e2e-${tag}-still.webp`])
  await deleteUsers([viewer.id])
})

test('SER-17 / SER-18 portada con imagen horizontal y episodios con imagen, sinopsis y progreso', async ({ page }) => {
  await loginAs(page, viewer)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/dashboard/series/${slug}`)

  await expect(page.getByRole('heading', { name: 'Serie con portada', level: 1 })).toBeVisible()
  await expect(page.getByText('2008 · 2 temporadas · drama')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar T1:E1 desde 15:00' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar a lista' })).toBeVisible()
  await expect(page.getByText('Datos e imágenes: TMDB.')).toBeVisible()

  // Episodios de la temporada del que sigue, con imagen, sinopsis y el actual resaltado
  const first = page.getByRole('link', { name: /Ver T1:E1 Capítulo 1\.1/ })
  await expect(first).toHaveAttribute('aria-current', 'true')
  await expect(first.getByText('Así empieza todo.')).toBeVisible()
  await expect(first.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '32')
  await expect(first.locator('img')).toHaveAttribute('src', /still\.webp$/)
  await expect(page.getByText('47 min').first()).toBeVisible()
  // La imagen de fondo se funde al cargar (LOAD-02): la captura, ya visible
  await expect(page.locator('main section').first().locator('img')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/series-page-desktop.png', fullPage: true })

  // Cambiar de temporada con el selector
  await page.getByLabel('Temporada').selectOption('2')
  await expect(page).toHaveURL(new RegExp(`temporada=2$`))
  await expect(page.getByRole('link', { name: /Ver T2:E1/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Ver T1:E1/ })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/dashboard/series/${slug}`)
  await expect(page.getByRole('heading', { name: 'Serie con portada', level: 1 })).toBeVisible()
  await expect(page.locator('main section').first().locator('img')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/series-page-phone.png', fullPage: true })
  // Sin scroll horizontal en el teléfono
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
