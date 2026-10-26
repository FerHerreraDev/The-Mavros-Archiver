import { test as base, expect, type Page, type Browser } from '@playwright/test'
import { randomIp } from '../helpers/users'

/**
 * Cada prueba navega con su propia IP (x-forwarded-for), como usuarios distintos
 * detrás de un proxy. Si no, todas compartirían el rate limit de login.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
    await provide(page)
  },
})

export { expect }

export async function login(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
}

/** Login completo desde cero; termina en /dashboard */
export async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await login(page, user.email, user.password)
  // 15 s y no los 5 por defecto: al arrancar la corrida (5 navegadores + Docker + emulador) se midieron
  // pausas de ~5 s del servidor completo, incluso sirviendo archivos estáticos. Ninguna regla del
  // SPEC fija el tiempo de login; esto es solo el margen de la infraestructura de pruebas.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
}

/** Página en un navegador aparte (otra persona, sin cookies compartidas) */
export async function otherPerson(browser: Browser) {
  const context = await browser.newContext()
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
  return context.newPage()
}

/** Alerta de error del formulario (excluye el anunciador de rutas de Next, que también es role=alert) */
export function formAlert(page: Page) {
  return page.locator('div[role="alert"] > p')
}
