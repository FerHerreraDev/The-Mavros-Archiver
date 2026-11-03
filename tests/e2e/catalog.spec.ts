import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let viewer: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const genre = `e2e${tag}`
const ids: string[] = []

async function movie(title: string, fields: Record<string, unknown>) {
  const slug = `e2e-cat-${title.toLowerCase().replace(/\W+/g, '-')}-${tag}`
  const { data } = await adminClient()
    .from('movies')
    .insert({ slug, title, duration_seconds: 1200, release_year: 2024, hls_path: `movies/${slug}/master.m3u8`, ...fields })
    .select('id')
    .single()
  ids.push(data!.id)
  return { id: data!.id as string, slug }
}

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-cat' })
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().in('id', ids)
  await deleteUsers([viewer.id])
})

const card = (page: import('@playwright/test').Page, title: string) => page.getByRole('link', { name: `Ver ${title}` })

test('CAT-01 / CAT-03 publicadas con título, año y duración; borradores no aparecen; la tarjeta lleva a su detalle y de ahí a ver', async ({ page }) => {
  const pub = await movie(`Pub ${tag}`, { status: 'published' })
  await movie(`Draft ${tag}`, { status: 'draft' })

  await loginAs(page, viewer)
  await expect(card(page, `Pub ${tag}`)).toBeVisible()
  await expect(card(page, `Pub ${tag}`)).toContainText('2024')
  await expect(card(page, `Pub ${tag}`)).toContainText('20 min')
  await expect(card(page, `Draft ${tag}`)).toHaveCount(0)

  await card(page, `Pub ${tag}`).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/movie/${pub.slug}$`))
  await page.getByRole('link', { name: 'Reproducir' }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${pub.slug}$`))
})

test('CAT-04 filtro por género en la URL; "Todas" lo quita; género inexistente → vacío', async ({ page }) => {
  await movie(`Con genero ${tag}`, { status: 'published', genres: [genre] })
  await movie(`Sin genero ${tag}`, { status: 'published', genres: [] })

  await loginAs(page, viewer)
  const filters = page.getByRole('navigation', { name: /filtrar por género/i })
  await filters.getByRole('link', { name: genre }).click()
  await expect(page).toHaveURL(new RegExp(`\\?genre=${genre}$`))
  await expect(card(page, `Con genero ${tag}`)).toBeVisible()
  await expect(card(page, `Sin genero ${tag}`)).toHaveCount(0)
  await expect(filters.getByRole('link', { name: genre })).toHaveAttribute('aria-current', 'page')

  await filters.getByRole('link', { name: 'Todas' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(card(page, `Sin genero ${tag}`)).toBeVisible()

  await page.goto(`/dashboard?genre=no-existe-${tag}`)
  await expect(page.getByText(/no hay películas/i)).toBeVisible()
})

test('CAT-06 "Seguir viendo" con barra de progreso para la película a medias', async ({ page }) => {
  const half = await movie(`Mitad ${tag}`, { status: 'published' })
  await adminClient().from('watch_progress').insert({ user_id: viewer.id, movie_id: half.id, position_seconds: 600 })

  await loginAs(page, viewer)
  const section = page.getByRole('region', { name: 'Seguir viendo' })
  await expect(section).toBeVisible()
  const bar = section.getByRole('link', { name: `Ver Mitad ${tag}` }).getByRole('progressbar')
  await expect(bar).toHaveAttribute('aria-valuenow', '50')
})

test('WATCH-01 un user que abre un borrador o un slug inexistente → 404', async ({ page }) => {
  const draft = await movie(`Oculta ${tag}`, { status: 'draft' })
  await loginAs(page, viewer)
  for (const slug of [draft.slug, `no-existe-${tag}`]) {
    const res = await page.goto(`/dashboard/watch/${slug}`)
    expect(res?.status()).toBe(404)
  }
})

// Las destacadas son las más recientes de todo el catálogo: estas dos no corren a la vez
test.describe.serial('CAT-07 portada', () => {
  test('CAT-07 portada: la destacada más reciente con su título, datos y "Reproducir"; se puede pausar y elegir', async ({ page }) => {
    const first = await movie(`Destacada A ${tag}`, { status: 'published', synopsis: 'Primera.', backdrop_url: 'https://image.invalid/a.jpg', accent_color: '#c81e1e' })
    const second = await movie(`Destacada B ${tag}`, { status: 'published', synopsis: 'Segunda.', backdrop_url: 'https://image.invalid/b.jpg', genres: [genre] })

    await loginAs(page, viewer)
    const hero = page.getByRole('region', { name: 'Destacadas' })
    await expect(hero.getByRole('heading', { name: `Destacada B ${tag}` })).toBeVisible()
    await expect(hero).toContainText('Segunda.')
    await expect(hero).toContainText(`2024 · 20 min · ${genre}`.toUpperCase(), { ignoreCase: true })
    await expect(hero.getByRole('button', { name: /agregar a lista/i })).toBeVisible()

    // Pausar: no cambia sola
    await hero.getByRole('button', { name: 'Pausar destacadas' }).click()
    await expect(hero.getByRole('button', { name: 'Reanudar destacadas' })).toBeVisible()

    await hero.getByRole('button', { name: `Ver destacada 2: Destacada A ${tag}` }).click()
    await expect(hero.getByRole('heading', { name: `Destacada A ${tag}` })).toBeVisible()
    await expect(hero.getByRole('button', { name: `Ver destacada 2: Destacada A ${tag}` })).toHaveAttribute('aria-current', 'true')
    await expect(hero.getByTestId('featured-accent')).toBeVisible()

    await expect(hero.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', `/dashboard/movie/${first.slug}`)
    await hero.getByRole('link', { name: 'Reproducir' }).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${first.slug}$`))
    expect(second.slug).toBeTruthy()
  })

  test('CAT-07 con "reducir movimiento" las destacadas no rotan solas', async ({ page }) => {
    await movie(`Quieta A ${tag}`, { status: 'published', backdrop_url: 'https://image.invalid/a.jpg' })
    await movie(`Quieta B ${tag}`, { status: 'published', backdrop_url: 'https://image.invalid/b.jpg' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await loginAs(page, viewer)
    const hero = page.getByRole('region', { name: 'Destacadas' })
    await expect(hero.getByRole('heading', { name: `Quieta B ${tag}` })).toBeVisible()
    await expect(hero.getByRole('button', { name: /pausar destacadas/i })).toHaveCount(0)
    await page.waitForTimeout(9_000)
    await expect(hero.getByRole('heading', { name: `Quieta B ${tag}` })).toBeVisible()
  })
})

test('CAT-08 filas que se deslizan: una por género (con 2 o más) y flechas para avanzar', async ({ page }) => {
  const rowGenre = `fila${tag}`
  for (let i = 0; i < 9; i++) await movie(`Fila ${i} ${tag}`, { status: 'published', genres: [rowGenre] })
  await movie(`Solita ${tag}`, { status: 'published', genres: [`solo${tag}`] })

  await page.setViewportSize({ width: 1280, height: 900 })
  await loginAs(page, viewer)
  await expect(page.getByRole('region', { name: 'Recién agregadas' }).getByRole('link', { name: `Ver Fila 8 ${tag}` })).toBeVisible()
  const row = page.getByRole('region', { name: rowGenre })
  await expect(row.getByRole('link', { name: new RegExp(`^Ver Fila \\d ${tag}$`) })).toHaveCount(9)
  // Una sola tarjeta no hace fila
  await expect(page.getByRole('region', { name: `solo${tag}` })).toHaveCount(0)

  const scroller = row.getByTestId('catalog-row')
  await expect(row.getByRole('button', { name: `Anteriores de ${rowGenre}` })).toBeDisabled()
  await row.getByRole('button', { name: `Más de ${rowGenre}` }).click()
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200)
  await expect(row.getByRole('button', { name: `Anteriores de ${rowGenre}` })).toBeEnabled()
})

test('CAT-09 / CAT-10 detalle: datos, continuar, tráiler, reparto y "Más como esta"; borrador → 404', async ({ page }) => {
  const g = `det${tag}`
  const main = await movie(`Detalle ${tag}`, {
    status: 'published',
    synopsis: 'Berlín, antes de la caída del muro.',
    original_title: 'Original distinto',
    genres: [g],
    backdrop_url: 'https://image.invalid/b.jpg',
    accent_color: '#c81e1e',
    trailer_key: 'CTB15PPtMyA',
    cast: [
      { name: 'Isabelle Adjani', character: 'Anna', profile_url: null },
      { name: 'Sam Neill', character: 'Mark', profile_url: null },
    ],
  })
  await movie(`Parecida ${tag}`, { status: 'published', genres: [g] })
  const draft = await movie(`Escondida ${tag}`, { status: 'draft', genres: [g] })
  await adminClient().from('watch_progress').insert({ user_id: viewer.id, movie_id: main.id, position_seconds: 600 })

  await loginAs(page, viewer)
  await page.goto(`/dashboard/movie/${main.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: `Detalle ${tag}` })).toBeVisible()
  await expect(page.getByText('Original distinto')).toBeVisible()
  await expect(page.getByText(`2024 · 20 min · ${g}`, { exact: false })).toBeVisible()
  await expect(page.getByText('Berlín, antes de la caída del muro.')).toBeVisible()
  await expect(page.getByTestId('detail-accent')).toBeAttached()
  await expect(page.getByRole('progressbar', { name: 'Progreso' })).toHaveAttribute('aria-valuenow', '50')

  // Tráiler: ventana con el video de YouTube (sin cookies); Esc la cierra y quita el video
  await page.getByRole('button', { name: 'Ver tráiler' }).click()
  const dialog = page.getByRole('dialog', { name: `Tráiler · Detalle ${tag}` })
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/CTB15PPtMyA\?autoplay=1/)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveCount(0)

  const cast = page.getByRole('region', { name: 'Reparto' })
  await expect(cast.getByText('Isabelle Adjani')).toBeVisible()
  await expect(cast.getByText('Mark')).toBeVisible()

  const similar = page.getByRole('region', { name: 'Más como esta' })
  await expect(similar.getByRole('link', { name: `Ver Parecida ${tag}` })).toBeVisible()
  await expect(similar.getByRole('link', { name: `Ver Escondida ${tag}` })).toHaveCount(0)
  await expect(similar.getByRole('link', { name: `Ver Detalle ${tag}` })).toHaveCount(0)

  // El clic de detalle a reproducir ya lo cubre CAT-01
  await expect(page.getByRole('link', { name: /continuar desde 10:00/i })).toHaveAttribute('href', `/dashboard/watch/${main.slug}`)

  const res = await page.goto(`/dashboard/movie/${draft.slug}`)
  expect(res?.status()).toBe(404)
})
