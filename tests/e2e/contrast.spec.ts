import { test, expect, loginAs } from './fixtures'
import { createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'
import type { Page } from '@playwright/test'

let user: TestUser
test.beforeAll(async () => {
  user = await createUser({ prefix: 'e2e-contrast' })
})
test.afterAll(() => deleteUsers([user.id]))

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
