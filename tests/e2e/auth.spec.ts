import { test, expect, login, formAlert } from './fixtures'
import { createUser, deleteUsers, type TestUser } from '../helpers/users'

let user: TestUser
let admin: TestUser

test.beforeAll(async () => {
  ;[user, admin] = await Promise.all([createUser(), createUser({ role: 'admin' })])
})
test.afterAll(async () => {
  await deleteUsers([user.id, admin.id])
})

test('ACC-03 / sin sesión termina en /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('ACC-01 /dashboard sin sesión → /login?redirectTo=/dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  const url = new URL(page.url())
  expect(url.pathname).toBe('/login')
  expect(url.searchParams.get('redirectTo')).toBe('/dashboard')
})

test('AUTH-06 el botón de login se habilita solo con email y contraseña', async ({ page }) => {
  await page.goto('/login')
  const button = page.getByRole('button', { name: /sign in/i })
  await expect(button).toBeDisabled()
  await page.getByLabel('Email').fill(user.email)
  await expect(button).toBeDisabled()
  await page.getByLabel('Password', { exact: true }).fill('x')
  await expect(button).toBeEnabled()
})

test('AUTH-01 login válido → /dashboard', async ({ page }) => {
  await page.goto('/login')
  await login(page, user.email, user.password)
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('AUTH-02 contraseña incorrecta → error visible y sigue en /login', async ({ page }) => {
  await page.goto('/login')
  await login(page, user.email, 'definitely-wrong-pw')
  await expect(formAlert(page)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('ACC-08 tras login vuelve a la ruta original', async ({ page }) => {
  await page.goto('/dashboard/profile')
  await expect(page).toHaveURL(/\/login\?redirectTo=/)
  await login(page, user.email, user.password)
  await page.waitForURL((url) => url.pathname !== '/login')
  expect(new URL(page.url()).pathname).toBe('/dashboard/profile')
})

test('ACC-02 con sesión, /login → /dashboard', async ({ page }) => {
  await page.goto('/login')
  await login(page, user.email, user.password)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('AUTH-05 logout → /login y /dashboard vuelve a pedir login', async ({ page }) => {
  await page.goto('/login')
  await login(page, user.email, user.password)
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.getByRole('button', { name: /salir/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
})

test('ACC-07 usuario normal no ve el enlace Admin', async ({ page }) => {
  await page.goto('/login')
  await login(page, user.email, user.password)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('link', { name: /catálogo/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /admin/i })).toHaveCount(0)
})

test('ACC-07 admin sí ve el enlace Admin', async ({ page }) => {
  await page.goto('/login')
  await login(page, admin.email, admin.password)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('link', { name: /admin/i })).toBeVisible()
})

test('El enlace "Forgot password?" del login lleva a una página que existe', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: /forgot password/i }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await expect(page.getByLabel('Email')).toBeVisible()
})
