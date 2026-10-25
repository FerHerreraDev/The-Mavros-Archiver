import { test, expect, login, formAlert } from './fixtures'
import { adminClient, deleteUsers, strongPassword, uniqueEmail, findUserByEmail } from '../helpers/users'
import { waitForEmail, extractLink } from '../helpers/mailpit'
import { E2E_BASE_URL } from '../helpers/local-supabase'

// Hasta la Fase 2 no hay UI de invitación: se invita con la misma llamada que hace inviteUserAction.
// En la Fase 2 este paso pasa a ser el formulario del panel admin.
async function inviteAndGetLink(prefix: string) {
  const email = uniqueEmail(prefix)
  const { error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${E2E_BASE_URL}/auth/confirm?next=/set-password`,
  })
  if (error) throw error
  const mail = await waitForEmail(email)
  return { email, link: extractLink(mail.HTML, '/auth/confirm') }
}

const created: string[] = []
test.afterAll(async () => {
  const users = await Promise.all(created.map(findUserByEmail))
  await deleteUsers(users.flatMap((u) => (u ? [u.id] : [])))
})

test('INV-04 flujo completo de invitación', async ({ page }) => {
  const { email, link } = await inviteAndGetLink('e2e-invite')
  created.push(email)

  // Abre el link del correo → elige contraseña
  await page.goto(link)
  await expect(page).toHaveURL(/\/set-password$/)
  await expect(page.getByText(email)).toBeVisible()

  // PWD-01 en cliente: confirmación distinta → error, no avanza
  await page.getByLabel('New password').fill('una-contraseña-larga')
  await page.getByLabel('Confirm password').fill('otra-contraseña-larga')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.locator('p[role="alert"]')).toBeVisible()
  await expect(page).toHaveURL(/\/set-password$/)

  // Contraseña válida → dashboard
  const password = strongPassword()
  await page.getByLabel('New password').fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // Más tarde: logout y login con la contraseña elegida
  await page.getByRole('button', { name: /salir/i }).click()
  await expect(page).toHaveURL(/\/login/)
  await login(page, email, password)
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('INV-05 el link de invitación no sirve dos veces', async ({ page, browser }) => {
  const { email, link } = await inviteAndGetLink('e2e-reuse')
  created.push(email)

  await page.goto(link)
  await expect(page).toHaveURL(/\/set-password$/)

  // Otra persona (otro navegador, sin cookies) intenta reusar el link
  const other = await browser.newPage()
  await other.goto(link)
  await expect(other).toHaveURL(/\/login\?error=link_invalid/)
  await expect(formAlert(other)).toBeVisible()
  await other.close()
})

test('ACC-05 invitado que no eligió contraseña no puede entrar al dashboard', async ({ page }) => {
  const { email, link } = await inviteAndGetLink('e2e-skip')
  created.push(email)

  await page.goto(link)
  await expect(page).toHaveURL(/\/set-password$/)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/set-password$/)
  await page.goto('/login')
  await expect(page).toHaveURL(/\/set-password$/)
})

test('CNF-03 link inválido → /login con mensaje', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=inventado&type=invite')
  await expect(page).toHaveURL(/\/login\?error=link_invalid/)
  await expect(formAlert(page)).toBeVisible()
})
