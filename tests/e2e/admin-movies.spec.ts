import { test, expect, loginAs, formAlert } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let admin: TestUser
let regular: TestUser

test.beforeAll(async () => {
  ;[admin, regular] = await Promise.all([
    createUser({ role: 'admin', prefix: 'e2e-mov-admin' }),
    createUser({ prefix: 'e2e-mov-user' }),
  ])
})
test.afterAll(async () => {
  // Cada worker de Playwright corre su propio afterAll: borrar solo lo de SU admin,
  // no lo que otros workers están usando en ese momento
  await adminClient().from('movies').delete().eq('created_by', admin.id)
  await deleteUsers([admin.id, regular.id])
})

const uniq = () => Math.random().toString(36).slice(2, 8)
const row = (page: import('@playwright/test').Page, title: string) => page.getByRole('row').filter({ hasText: title })

async function createMovie(page: import('@playwright/test').Page, title: string, hlsPath = 'ladder/master.m3u8') {
  await page.goto('/dashboard/admin/movies/new')
  await page.getByLabel('Título', { exact: true }).fill(title)
  await page.getByLabel('Año').fill('2025')
  await page.getByLabel('Géneros').fill('Anime, Acción')
  await page.getByLabel('Video (ruta en R2)').fill(hlsPath)
  await page.getByRole('button', { name: /guardar borrador/i }).click()
}

test('MOV-12 un user que entra a /dashboard/admin/movies vuelve a /dashboard', async ({ page }) => {
  await loginAs(page, regular)
  for (const path of ['/dashboard/admin/movies', '/dashboard/admin/movies/new']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/dashboard$/)
  }
})

test('MOV-13 pestañas Usuarios / Películas', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  const tabs = page.getByRole('navigation', { name: /administración/i })
  await expect(tabs.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page')

  await tabs.getByRole('link', { name: 'Películas' }).click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/movies$/)
  await expect(tabs.getByRole('link', { name: 'Películas' })).toHaveAttribute('aria-current', 'page')
})

test('MOV-07 / MOV-08 / MOV-09 crear desde el formulario: borrador con duración de la playlist y slug generado', async ({ page }) => {
  const title = `E2E Película ${uniq()}`
  await loginAs(page, admin)
  await createMovie(page, title)

  await expect(page).toHaveURL(/\/dashboard\/admin\/movies$/)
  const r = row(page, title)
  await expect(r).toBeVisible()
  await expect(r.getByText('Borrador', { exact: true })).toBeVisible()
  await expect(r.getByText('22 s')).toBeVisible()
  // MOV-09: slug generado del título, sin acentos
  await expect(r.getByText(`e2e-pelicula-${title.split(' ').pop()}`)).toBeVisible()
})

test('MOV-08 un video que no existe muestra error en el campo y no crea nada', async ({ page }) => {
  const title = `E2E Roto ${uniq()}`
  await loginAs(page, admin)
  await createMovie(page, title, 'no-existe/master.m3u8')

  await expect(page).toHaveURL(/\/movies\/new$/)
  await expect(formAlert(page)).toBeVisible()
  await expect(page.locator('#hls_path-error')).toBeVisible()

  await page.goto('/dashboard/admin/movies')
  await expect(row(page, title)).toHaveCount(0)
})

test('MOV-07 errores de validación se muestran por campo', async ({ page }) => {
  await loginAs(page, admin)
  await page.goto('/dashboard/admin/movies/new')
  await page.getByLabel('Título', { exact: true }).fill('E2E Validación')
  await page.getByLabel('Año').fill('1500')
  await page.getByLabel('Video (ruta en R2)').fill('ladder/master.m3u8')
  await page.getByRole('button', { name: /guardar borrador/i }).click()
  await expect(page.locator('#release_year-error')).toBeVisible()
})

test('MOV-11 editar, publicar, despublicar y borrar con confirmación', async ({ page }) => {
  const title = `E2E Ciclo ${uniq()}`
  const edited = `${title} editada`
  await loginAs(page, admin)
  await createMovie(page, title)
  await expect(row(page, title)).toBeVisible()

  // Editar
  await row(page, title).getByRole('link', { name: `Editar ${title}` }).click()
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(title)
  await page.getByLabel('Título', { exact: true }).fill(edited)
  await page.getByRole('button', { name: /guardar cambios/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/movies$/)
  await expect(row(page, edited)).toBeVisible()

  // Publicar / despublicar
  await row(page, edited).getByRole('button', { name: `Publicar ${edited}` }).click()
  await expect(row(page, edited).getByText('Publicada', { exact: true })).toBeVisible()
  await row(page, edited).getByRole('button', { name: `Despublicar ${edited}` }).click()
  await expect(row(page, edited).getByText('Borrador', { exact: true })).toBeVisible()

  // Borrar pide confirmación: el primer clic no borra
  await row(page, edited).getByRole('button', { name: `Borrar ${edited}` }).click()
  await expect(row(page, edited)).toBeVisible()
  await row(page, edited).getByRole('button', { name: `Confirmar borrar ${edited}` }).click()
  await expect(row(page, edited)).toHaveCount(0)
})
