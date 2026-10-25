import { test, expect, login, formAlert } from './fixtures'
import { createUser, deleteUsers, strongPassword, uniqueEmail, type TestUser } from '../helpers/users'
import { waitForEmail, expectNoEmail, extractLink } from '../helpers/mailpit'

let user: TestUser
test.beforeAll(async () => {
  user = await createUser({ prefix: 'e2e-recovery' })
})
test.afterAll(async () => {
  await deleteUsers([user.id])
})

async function requestReset(page: import('@playwright/test').Page, email: string) {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /send/i }).click()
  const status = page.getByRole('status')
  await expect(status).toBeVisible()
  return status.innerText()
}

test('PWD-03 mismo mensaje para email existente e inexistente', async ({ page }) => {
  const ghost = uniqueEmail('e2e-ghost')
  const forGhost = await requestReset(page, ghost)
  const forUser = await requestReset(page, user.email)
  expect(forGhost).toBe(forUser)
  await expectNoEmail(ghost)
})

test('PWD-04 flujo completo de recuperación', async ({ page }) => {
  const victim = await createUser({ prefix: 'e2e-reset' })
  try {
    await requestReset(page, victim.email)
    const mail = await waitForEmail(victim.email)
    await page.goto(extractLink(mail.HTML, '/auth/confirm'))
    await expect(page).toHaveURL(/\/set-password$/)

    const newPassword = strongPassword()
    await page.getByLabel('New password').fill(newPassword)
    await page.getByLabel('Confirm password').fill(newPassword)
    await page.getByRole('button', { name: /save/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.getByRole('button', { name: /salir/i }).click()
    await expect(page).toHaveURL(/\/login/)

    // La vieja ya no sirve
    await login(page, victim.email, victim.password)
    await expect(formAlert(page)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)

    // La nueva sí
    await page.getByLabel('Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  } finally {
    await deleteUsers([victim.id])
  }
})
