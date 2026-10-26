import { test, expect, loginAs } from './fixtures'
import { createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'
import type { Page } from '@playwright/test'

let user: TestUser
let admin: TestUser
test.beforeAll(async () => {
  ;[user, admin] = await Promise.all([createUser({ prefix: 'e2e-contrast' }), createUser({ role: 'admin', prefix: 'e2e-contrast-admin' })])
})
test.afterAll(() => deleteUsers([user.id, admin.id]))

/**
 * Contraste WCAG de cada elemento con texto visible contra el primer fondo opaco
 * de sus ancestros (el body es negro). Devuelve los que no llegan al mínimo WCAG AA.
 */
async function lowContrast(page: Page) {
  return page.evaluate(() => {
    // Cualquier color CSS (oklch, lab, rgb…) → [r, g, b, a] en sRGB, pintándolo en un canvas
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const parse = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const background = (el: Element | null): number[] => {
      for (let e = el; e; e = e.parentElement) {
        const [r, g, b, a = 1] = parse(getComputedStyle(e).backgroundColor)
        if (a > 0.5) return [r, g, b]
      }
      return [0, 0, 0]
    }
    const failures: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
      if (!own || (el as HTMLElement).offsetParent === null) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.1) continue
      const fg = lum(parse(style.color))
      const bg = lum(background(el))
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
      // WCAG: texto grande (≥ 24 px, o ≥ 18.66 px en negrita) pide 3.0; el normal, 4.5
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) failures.push(`${el.tagName.toLowerCase()} "${el.textContent!.trim().slice(0, 30)}" ${ratio.toFixed(2)}`)
    }
    return failures
  })
}

test('UI-02 contraste legible en /login y /forgot-password', async ({ page }) => {
  for (const path of ['/login', '/forgot-password']) {
    await page.goto(path)
    expect(await lowContrast(page), path).toEqual([])
  }
})

test('UI-02 contraste legible en /link (entrada, aprobación y resultado)', async ({ page, request }) => {
  const code = await (
    await request.post('/api/device/code', { data: { client_name: 'Tele contraste' }, headers: { 'x-forwarded-for': randomIp() } })
  ).json()
  await loginAs(page, user)

  await page.goto('/link')
  expect(await lowContrast(page), 'entrada').toEqual([])

  await page.goto(code.verification_uri_complete)
  expect(await lowContrast(page), 'aprobación').toEqual([])

  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByRole('status')).toBeVisible()
  expect(await lowContrast(page), 'resultado').toEqual([])
})

/**
 * UI-03 (WCAG 1.4.11): cada campo debe distinguirse de lo que lo rodea. Vale si el borde
 * (≥ 1 px) o el fondo del propio campo contrasta ≥ 3:1 con el primer fondo opaco de sus
 * ancestros. Con `focused` se mide el anillo de foco (box-shadow/outline) además del borde.
 */
async function invisibleFields(page: Page, focused = false) {
  return page.evaluate((focused) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const parse = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)]
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    // Color translúcido pintado sobre el fondo: lo que realmente se ve
    const over = ([r, g, b, a]: number[], bg: number[]) => [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)]
    const outside = (el: Element): number[] => {
      for (let e = el.parentElement; e; e = e.parentElement) {
        const [r, g, b, a] = parse(getComputedStyle(e).backgroundColor)
        if (a > 0.5) return [r, g, b]
      }
      return [0, 0, 0]
    }
    const fields = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select'))
      .filter((el) => (el as HTMLElement).offsetParent !== null)
    const failures: string[] = []
    for (const el of fields) {
      const s = getComputedStyle(el)
      const bg = outside(el)
      const own = over(parse(s.backgroundColor), bg)
      const border = parseFloat(s.borderTopWidth) >= 1 ? ratio(over(parse(s.borderTopColor), own), bg) : 1
      const fill = ratio(own, bg)
      let ring = 1
      if (focused) {
        // box-shadow apila varias sombras (algunas transparentes): cuenta la más visible
        for (const c of s.boxShadow.match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|lab\([^)]*\)|#[0-9a-f]+)/gi) ?? []) {
          ring = Math.max(ring, ratio(over(parse(c), bg), bg))
        }
        if (parseFloat(s.outlineWidth) >= 1 && s.outlineStyle !== 'none') ring = Math.max(ring, ratio(over(parse(s.outlineColor), bg), bg))
        ring = Math.max(ring, border)
      }
      const name = el.getAttribute('name') ?? el.id ?? el.tagName
      if (Math.max(border, fill) < 3) failures.push(`${name}: borde ${border.toFixed(2)}, fondo ${fill.toFixed(2)}`)
      if (focused && ring < 3) failures.push(`${name} enfocado: anillo ${ring.toFixed(2)}`)
    }
    return { count: fields.length, failures }
  }, focused)
}

async function expectVisibleFields(page: Page, label: string) {
  const idle = await invisibleFields(page)
  expect(idle.count, `${label}: hay campos`).toBeGreaterThan(0)
  expect(idle.failures, label).toEqual([])
  // Enfocar cada campo y medir su anillo de foco
  const fields = page.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):visible, textarea:visible, select:visible')
  for (let i = 0; i < (await fields.count()); i++) {
    await fields.nth(i).focus()
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('name') ?? document.activeElement?.id)
    const result = await invisibleFields(page, true)
    expect(result.failures.filter((f) => f.startsWith(`${focused} enfocado`)), `${label} (${focused} enfocado)`).toEqual([])
  }
}

test('UI-03 los campos se distinguen: acceso y recuperación', async ({ page }) => {
  for (const path of ['/login', '/forgot-password']) {
    await page.goto(path)
    await expectVisibleFields(page, path)
  }
})

test('UI-03 los campos se distinguen: nueva contraseña y /link', async ({ page }) => {
  await loginAs(page, user)
  await page.goto('/set-password')
  await expectVisibleFields(page, '/set-password')
  await page.goto('/link')
  await expectVisibleFields(page, '/link')
})

test('UI-03 los campos se distinguen: invitar y formulario de películas', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await expectVisibleFields(page, 'invitar')
  await page.goto('/dashboard/admin/movies/new')
  await expectVisibleFields(page, 'película')
})
