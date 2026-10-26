import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'
import type { Page, Route } from '@playwright/test'
import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

// LOAD-01 (skeleton) y LOAD-02 (póster con vista previa) en un navegador real
let viewer: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const ids: string[] = []
const POSTER = readFileSync(path.join(__dirname, '../fixtures/posters/red-blue-2x3.png'))

// ThumbHash calculado aquí con la librería de referencia (no con el código de la app)
async function referenceThumbhash(image: Buffer) {
  const { data, info } = await sharp(image).resize(100, 100, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64')
}

async function publishedMovie(title: string, fields: Record<string, unknown>) {
  const slug = `e2e-load-${title.toLowerCase().replace(/\W+/g, '-')}-${tag}`
  const { data, error } = await adminClient()
    .from('movies')
    .insert({ slug, title, duration_seconds: 1200, release_year: 2024, hls_path: `movies/${slug}/master.m3u8`, status: 'published', ...fields })
    .select('id')
    .single()
  if (error) throw error
  ids.push(data.id)
}

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-load' })
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().in('id', ids)
  await deleteUsers([viewer.id])
})

/** Retiene la imagen hasta llamar a release() */
async function holdPoster(page: Page, url: string) {
  let release!: (respond: (route: Route) => Promise<void>) => void
  const gate = new Promise<(route: Route) => Promise<void>>((r) => (release = r))
  await page.route(url, async (route) => (await gate)(route))
  return release
}

const card = (page: Page, title: string) => page.getByRole('link', { name: `Ver ${title}` })
const opacity = (page: Page, title: string) => card(page, title).locator('img').evaluate((img) => getComputedStyle(img).opacity)

test('LOAD-02 el póster muestra al instante su vista previa y se funde con la imagen real', async ({ page }) => {
  const title = `Thumb ${tag}`
  const url = `https://posters.mavros.test/${tag}.png`
  await publishedMovie(title, { poster_url: url, poster_thumbhash: await referenceThumbhash(POSTER) })
  const release = await holdPoster(page, url)

  await loginAs(page, viewer)
  const placeholder = card(page, title).getByTestId('poster-placeholder')
  await expect(placeholder).toBeVisible()
  expect(await placeholder.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^url\("data:image\/png;base64,/)

  // La vista previa tiene los colores del póster: arriba rojo, abajo azul
  const colors = await placeholder.evaluate(async (el) => {
    const src = getComputedStyle(el).backgroundImage.slice(5, -2)
    const img = new Image()
    img.src = src
    await img.decode()
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const at = (fy: number) => [...ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height * fy), 1, 1).data]
    return { top: at(0.1), bottom: at(0.9) }
  })
  expect(colors.top[0], 'arriba rojo').toBeGreaterThan(colors.top[2] + 60)
  expect(colors.bottom[2], 'abajo azul').toBeGreaterThan(colors.bottom[0] + 60)

  // Mientras la imagen no llega, no se ve (sin cuadro vacío ni imagen a medias)
  await expect(card(page, title).locator('img')).toHaveAttribute('data-loaded', 'false')
  expect(await opacity(page, title)).toBe('0')

  release((route) => route.fulfill({ status: 200, contentType: 'image/png', body: POSTER }))
  await expect(card(page, title).locator('img')).toHaveAttribute('data-loaded', 'true')
  // Se funde (transición de ~300 ms), no aparece de golpe
  const duration = await card(page, title).locator('img').evaluate((img) => getComputedStyle(img).transitionDuration)
  expect(duration).toBe('0.3s')
  await expect.poll(() => opacity(page, title)).toBe('1')
})

test('LOAD-02 si la imagen falla queda la tarjeta con el título', async ({ page }) => {
  const title = `Rota ${tag}`
  const url = `https://posters.mavros.test/rota-${tag}.png`
  await publishedMovie(title, { poster_url: url, poster_thumbhash: await referenceThumbhash(POSTER) })
  await page.route(url, (route) => route.fulfill({ status: 404, body: '' }))

  await loginAs(page, viewer)
  const fallback = card(page, title).getByTestId('poster-fallback')
  await expect(fallback).toBeVisible()
  await expect(fallback).toContainText(title)
  await expect(card(page, title).locator('img')).toHaveCount(0)
})

test('LOAD-02 sin ThumbHash: el color de tarjeta, sin vista previa rota', async ({ page }) => {
  const title = `SinHash ${tag}`
  const url = `https://posters.mavros.test/sinhash-${tag}.png`
  await publishedMovie(title, { poster_url: url })
  const release = await holdPoster(page, url)

  await loginAs(page, viewer)
  await expect(card(page, title).locator('img')).toHaveAttribute('data-loaded', 'false')
  await expect(card(page, title).getByTestId('poster-placeholder')).toHaveCount(0)
  release((route) => route.fulfill({ status: 200, contentType: 'image/png', body: POSTER }))
  await expect(card(page, title).locator('img')).toHaveAttribute('data-loaded', 'true')
})

// El skeleton real solo se ve si el servidor tarda: aquí se monta su mismo marcado con el CSS
// real de la app para medir lo que hace el navegador
const SKELETON = '<div id="sk" class="skeleton-delayed"><div id="block" class="skeleton" style="width:200px;height:40px"></div></div>'
async function mountSkeleton(page: Page) {
  await page.goto('/login')
  return page.evaluate((html) => {
    document.body.insertAdjacentHTML('beforeend', html)
    return performance.now()
  }, SKELETON)
}

test('LOAD-01 el skeleton no se ve los primeros 200 ms y luego aparece', async ({ page }) => {
  const mountedAt = await mountSkeleton(page)
  const early = await page.evaluate(() => [performance.now(), Number(getComputedStyle(document.getElementById('sk')!).opacity)])
  if (early[0] - mountedAt < 150) expect(early[1], 'antes de 200 ms').toBe(0)
  // CSS real: retraso de 200 ms
  expect(await page.locator('#sk').evaluate((el) => getComputedStyle(el).animationDelay)).toBe('0.2s')
  await expect.poll(() => page.locator('#sk').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 2000 }).toBe(1)
})

test('LOAD-01 el skeleton tiene un brillo que lo recorre (shimmer de ~1.6 s)', async ({ page }) => {
  await mountSkeleton(page)
  const block = page.locator('#block')
  const style = await block.evaluate((el) => {
    const s = getComputedStyle(el)
    return { name: s.animationName, duration: s.animationDuration, iterations: s.animationIterationCount, image: s.backgroundImage }
  })
  expect(style).toMatchObject({ name: 'skeleton-shimmer', duration: '1.6s', iterations: 'infinite' })
  expect(style.image).toContain('linear-gradient')
  // De verdad se mueve
  const p1 = await block.evaluate((el) => getComputedStyle(el).backgroundPosition)
  await page.waitForTimeout(300)
  const p2 = await block.evaluate((el) => getComputedStyle(el).backgroundPosition)
  expect(p2).not.toBe(p1)
})

test('LOAD-01 con "reducir movimiento" el skeleton no se anima', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountSkeleton(page)
  const block = page.locator('#block')
  expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(await block.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')
  // Sigue viéndose como bloque (no desaparece)
  await expect.poll(() => page.locator('#sk').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 2000 }).toBe(1)
})

test('LOAD-02 con "reducir movimiento" el póster aparece sin desvanecido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const title = `Reduce ${tag}`
  const url = `https://posters.mavros.test/reduce-${tag}.png`
  await publishedMovie(title, { poster_url: url })
  const release = await holdPoster(page, url)
  await loginAs(page, viewer)
  await expect(card(page, title).locator('img')).toHaveAttribute('data-loaded', 'false')

  // Se observa la opacidad en el mismo cuadro en que la imagen pasa a "cargada": sin transición ya es 1
  await card(page, title)
    .locator('img')
    .evaluate((img) => {
      const w = window as unknown as { firstOpacity: Promise<string> }
      w.firstOpacity = new Promise((resolve) => {
        new MutationObserver(() => {
          if (img.getAttribute('data-loaded') === 'true') resolve(getComputedStyle(img).opacity)
        }).observe(img, { attributes: true, attributeFilter: ['data-loaded'] })
      })
    })
  release((route) => route.fulfill({ status: 200, contentType: 'image/png', body: POSTER }))
  const firstOpacity = page.evaluate(() => (window as unknown as { firstOpacity: Promise<string> }).firstOpacity)
  expect(await firstOpacity).toBe('1')
})
