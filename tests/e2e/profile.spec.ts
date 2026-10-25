import { test, expect, loginAs } from './fixtures'
import { createUser, deleteUsers, type TestUser } from '../helpers/users'

let user: TestUser
let other: TestUser
let admin: TestUser

test.beforeAll(async () => {
  ;[user, other, admin] = await Promise.all([
    createUser({ prefix: 'e2e-profile' }),
    createUser({ prefix: 'e2e-other' }),
    createUser({ role: 'admin', prefix: 'e2e-profile-admin' }),
  ])
})
test.afterAll(() => deleteUsers([user.id, other.id, admin.id]))

test('PRF-01 muestra email, User ID, rol y estado del usuario', async ({ page }) => {
  await loginAs(page, user)
  await page.getByRole('link', { name: /perfil/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/profile$/)

  const main = page.getByRole('main')
  await expect(main.getByText(user.email)).toBeVisible()
  await expect(main.getByText(user.id)).toBeVisible()
  await expect(main.getByText('user', { exact: true })).toBeVisible()
  await expect(main.getByText(/activo/i)).toBeVisible()
})

test('PRF-01 un admin ve rol admin en su perfil', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/profile')
  await expect(page.getByRole('main').getByText('admin', { exact: true })).toBeVisible()
})

test('PRF-02 manipular la URL no muestra datos de otro usuario', async ({ page }) => {
  await loginAs(page, user)
  for (const query of [`?id=${other.id}`, `?userId=${other.id}`, `?email=${encodeURIComponent(other.email)}`]) {
    await page.goto(`/dashboard/profile${query}`)
    const main = page.getByRole('main')
    await expect(main.getByText(user.email)).toBeVisible()
    await expect(main.getByText(other.email)).toHaveCount(0)
    await expect(main.getByText(other.id)).toHaveCount(0)
  }
})
