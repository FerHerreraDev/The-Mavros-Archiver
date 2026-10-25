import { test, expect, loginAs, login, otherPerson, formAlert } from './fixtures'
import { adminClient, createUser, deleteUsers, findUserByEmail, uniqueEmail, type TestUser } from '../helpers/users'
import { waitForEmailCount } from '../helpers/mailpit'
import { E2E_BASE_URL } from '../helpers/local-supabase'

let admin: TestUser
let regular: TestUser
const createdEmails: string[] = []

test.beforeAll(async () => {
  ;[admin, regular] = await Promise.all([
    createUser({ role: 'admin', prefix: 'e2e-admin' }),
    createUser({ prefix: 'e2e-regular' }),
  ])
})
test.afterAll(async () => {
  const extra = await Promise.all(createdEmails.map(findUserByEmail))
  await deleteUsers([admin.id, regular.id, ...extra.flatMap((u) => (u ? [u.id] : []))])
})

const row = (page: import('@playwright/test').Page, email: string) =>
  page.getByRole('row').filter({ hasText: email })

async function newUser() {
  const u = await createUser({ prefix: 'e2e-target' })
  createdEmails.push(u.email)
  return u
}

test('ADM-01 un user que entra a /dashboard/admin vuelve a /dashboard sin ver nada de admin', async ({ page }) => {
  await loginAs(page, regular)
  await page.goto('/dashboard/admin')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText(/invitar usuario/i)).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('ADM-02 un admin ve el formulario de invitación y la tabla, con su propia fila', async ({ page }) => {
  await loginAs(page, admin)
  await page.getByRole('link', { name: /admin/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/admin$/)
  await expect(page.getByLabel(/email del invitado/i)).toBeVisible()
  await expect(row(page, admin.email)).toBeVisible()
  await expect(row(page, regular.email)).toBeVisible()
})

test('ADM-07 / ADM-11 en su propia fila no hay acciones (ni rol ni desactivar)', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await expect(row(page, admin.email).getByRole('button')).toHaveCount(0)
})

test('ADM-03 / ADM-04 invitar desde el formulario: éxito, campo limpio y fila pendiente sin recargar', async ({ page }) => {
  const email = uniqueEmail('e2e-ui-invite')
  createdEmails.push(email)

  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  const input = page.getByLabel(/email del invitado/i)
  await input.fill(email)
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()

  await expect(page.getByRole('status').filter({ hasText: email })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(row(page, email)).toBeVisible()
  await expect(row(page, email).getByText(/pendiente/i)).toBeVisible()
  await waitForEmailCount(email, 1)
})

test('ADM-03 invitar un email ya registrado muestra error en el formulario', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await page.getByLabel(/email del invitado/i).fill(regular.email)
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
  await expect(formAlert(page)).toBeVisible()
})

test('ADM-06 hacer admin a un usuario: ve el enlace Admin en su siguiente request; quitarlo lo oculta', async ({ page, browser }) => {
  const target = await newUser()
  const targetPage = await otherPerson(browser)
  await loginAs(targetPage, target)
  await expect(targetPage.getByRole('link', { name: /admin/i })).toHaveCount(0)

  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await row(page, target.email).getByRole('button', { name: `Hacer admin a ${target.email}` }).click()
  await expect(row(page, target.email).getByText('admin', { exact: true })).toBeVisible()

  await targetPage.reload()
  await expect(targetPage.getByRole('link', { name: /admin/i })).toBeVisible()

  await row(page, target.email).getByRole('button', { name: `Quitar admin a ${target.email}` }).click()
  await expect(row(page, target.email).getByText('user', { exact: true })).toBeVisible()

  await targetPage.reload()
  await expect(targetPage.getByRole('link', { name: /admin/i })).toHaveCount(0)
  await targetPage.context().close()
})

test('ADM-09 / ADM-10 desactivar saca al usuario aunque tenga sesión abierta; reactivar le devuelve el acceso', async ({ page, browser }) => {
  const target = await newUser()
  const targetPage = await otherPerson(browser)
  await loginAs(targetPage, target)

  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await row(page, target.email).getByRole('button', { name: `Desactivar a ${target.email}` }).click()
  await expect(row(page, target.email).getByText('Desactivado', { exact: true })).toBeVisible()

  // Su sesión abierta deja de servir
  await targetPage.goto('/dashboard')
  await expect(targetPage).toHaveURL(/\/login/)
  // Y no puede volver a entrar
  await login(targetPage, target.email, target.password)
  await expect(formAlert(targetPage)).toBeVisible()
  await expect(targetPage).toHaveURL(/\/login/)

  // Reactivar
  await row(page, target.email).getByRole('button', { name: `Reactivar a ${target.email}` }).click()
  await expect(row(page, target.email).getByText('Activo', { exact: true })).toBeVisible()

  // Su sesión vieja no revive: tiene que volver a iniciar sesión
  await targetPage.goto('/dashboard')
  await expect(targetPage).toHaveURL(/\/login/)

  await targetPage.goto('/login')
  await login(targetPage, target.email, target.password)
  await expect(targetPage).toHaveURL(/\/dashboard$/)
  await targetPage.context().close()
})

test('ADM-08 reenviar invitación a un pendiente: llega un segundo correo', async ({ page }) => {
  const email = uniqueEmail('e2e-resend')
  createdEmails.push(email)
  const { error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${E2E_BASE_URL}/auth/confirm?next=/set-password`,
  })
  if (error) throw error
  await waitForEmailCount(email, 1)

  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await row(page, email).getByRole('button', { name: `Reenviar invitación a ${email}` }).click()
  await expect(row(page, email).getByRole('status')).toBeVisible()
  await waitForEmailCount(email, 2)
})

test('ADM-08 un usuario activo no tiene botón de reenviar', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await expect(row(page, regular.email).getByRole('button', { name: /reenviar/i })).toHaveCount(0)
})
