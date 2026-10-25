import { test, expect } from './fixtures'

test('OPS-07 headers de seguridad en páginas, redirecciones y API', async ({ request }) => {
  for (const path of ['/login', '/dashboard', '/api/playback/00000000-0000-4000-8000-000000000000', '/no-existe']) {
    const res = await request.get(path, { maxRedirects: 0 })
    const h = res.headers()
    expect(h['x-frame-options'], path).toBe('DENY')
    expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(h['x-content-type-options'], path).toBe('nosniff')
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy'], path).toContain('camera=()')
    expect(h['strict-transport-security'], path).toContain('max-age=')
    expect(h['x-powered-by'], path).toBeUndefined()
  }
})

test('OPS-05 una ruta inexistente muestra la 404 propia con enlace de vuelta', async ({ page }) => {
  const res = await page.goto('/esta-ruta-no-existe')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /no existe/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /volver al catálogo/i })).toBeVisible()
})
