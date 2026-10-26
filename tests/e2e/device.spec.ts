import { test, expect, login, loginAs, formAlert } from './fixtures'
import { createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'
import type { APIRequestContext } from '@playwright/test'

let user: TestUser
test.beforeAll(async () => {
  user = await createUser({ prefix: 'e2e-device' })
})
test.afterAll(() => deleteUsers([user.id]))

async function tvRequestsCode(request: APIRequestContext, clientName = 'Hisense Google TV E2E') {
  const res = await request.post('/api/device/code', {
    data: { client_name: clientName },
    headers: { 'x-forwarded-for': randomIp() },
  })
  expect(res.status()).toBe(200)
  return res.json() as Promise<{ device_code: string; user_code: string; verification_uri_complete: string }>
}

test('DEV-03 / DEV-04 / DEV-10 la tele pide código, se aprueba desde el teléfono y la tele recibe la sesión', async ({ page, request }) => {
  const code = await tvRequestsCode(request)

  // Abrir el QR sin sesión → login → vuelve a /link con el código
  await page.goto(code.verification_uri_complete)
  await expect(page).toHaveURL(/\/login\?redirectTo=/)
  await login(page, user.email, user.password)
  await expect(page).toHaveURL(new RegExp(`/link\\?code=${code.user_code}$`))

  // DEV-10: qué dispositivo, cuándo, aviso, y como quién
  await expect(page.getByTestId('device-name')).toHaveText('Hisense Google TV E2E')
  await expect(page.getByText(/hace (un momento|\d+ min)/)).toBeVisible()
  await expect(page.getByRole('note')).toContainText(/tu propia pantalla/i)
  await expect(page.getByText(user.email)).toBeVisible()

  await page.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByRole('status')).toContainText(/tele conectada/i)

  // La tele sondea y recibe la sesión de este usuario
  const token = await request.post('/api/device/token', { data: { device_code: code.device_code } })
  expect(token.status()).toBe(200)
  expect((await token.json()).user.email).toBe(user.email)
})

test('DEV-03 escribir el código a mano en minúsculas y sin guion', async ({ page, request }) => {
  const code = await tvRequestsCode(request, 'Tele de la sala')
  await loginAs(page, user)
  await page.goto('/link')
  await page.getByLabel('Código').fill(code.user_code.toLowerCase().replace('-', ' '))
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByTestId('device-name')).toHaveText('Tele de la sala')
})

test('DEV-05 rechazar → la tele recibe access_denied', async ({ page, request }) => {
  const code = await tvRequestsCode(request)
  await loginAs(page, user)
  await page.goto(code.verification_uri_complete)
  await page.getByRole('button', { name: 'Rechazar' }).click()
  await expect(page.getByRole('status')).toContainText(/rechazada/i)
  const token = await request.post('/api/device/token', { data: { device_code: code.device_code } })
  expect((await token.json()).error).toBe('access_denied')
})

test('DEV-06 un código que no existe muestra error', async ({ page }) => {
  await loginAs(page, user)
  await page.goto('/link?code=AAAA-AAAA')
  await expect(formAlert(page)).toContainText(/no existe/i)
})

test('UX-01 Aprobar: ambos botones bloqueados con indicador y un doble clic aprueba una vez', async ({ page, request }) => {
  const code = await tvRequestsCode(request)
  await loginAs(page, user)
  await page.goto(code.verification_uri_complete)
  const posts: string[] = []
  await page.route(/\/link(\?|$)/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    posts.push(route.request().url())
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })

  const approve = page.getByRole('button', { name: 'Aprobar' })
  await approve.click()
  await expect(approve).toHaveAttribute('aria-busy', 'true')
  await expect(approve.getByTestId('spinner')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rechazar' })).toBeDisabled()
  await approve.click({ force: true })
  await expect(page.getByRole('status')).toContainText(/tele conectada/i, { timeout: 10_000 })
  expect(posts).toHaveLength(1)
})

test('LOAD-06 "Continuar" con el código muestra la barra de progreso', async ({ page, request }) => {
  const code = await tvRequestsCode(request)
  await loginAs(page, user)
  await page.goto('/link')
  await page.route(/\/link\?code=/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })
  await page.getByLabel('Código').fill(code.user_code)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('progressbar', { name: 'Cargando página' })).toBeVisible({ timeout: 500 })
  await expect(page.getByTestId('device-name')).toBeVisible({ timeout: 10_000 })
})
