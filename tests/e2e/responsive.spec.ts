import { test, expect, loginAs } from './fixtures'
import { createUser, deleteUsers, type TestUser } from '../helpers/users'

let admin: TestUser
test.beforeAll(async () => {
  admin = await createUser({ role: 'admin', prefix: 'e2e-mobile' })
})
test.afterAll(() => deleteUsers([admin.id]))

test.use({ viewport: { width: 390, height: 844 } })

async function hasHorizontalScroll(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}

test('UI-01 sin scroll horizontal en móvil y navbar accesible', async ({ page }) => {
  await page.goto('/login')
  expect(await hasHorizontalScroll(page), '/login').toBe(false)

  await loginAs(page, admin)
  for (const path of ['/dashboard', '/dashboard/profile', '/dashboard/admin']) {
    await page.goto(path)
    expect(await hasHorizontalScroll(page), path).toBe(false)
  }

  for (const name of [/catálogo/i, /perfil/i, /admin/i]) {
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /salir/i })).toBeVisible()
})
