import { test as base, expect, type Page } from '@playwright/test'
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

/** Alerta de error del formulario (excluye el anunciador de rutas de Next, que también es role=alert) */
export function formAlert(page: Page) {
  return page.locator('div[role="alert"] > p')
}
