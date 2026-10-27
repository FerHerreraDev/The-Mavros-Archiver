import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let admin: TestUser
let regular: TestUser

test.beforeAll(async () => {
  ;[admin, regular] = await Promise.all([
    createUser({ role: 'admin', prefix: 'e2e-ser-admin' }),
    createUser({ prefix: 'e2e-ser-user' }),
  ])
})
test.afterAll(async () => {
  await adminClient().from('series').delete().eq('created_by', admin.id)
  await deleteUsers([admin.id, regular.id])
})

const uniq = () => Math.random().toString(36).slice(2, 8)

test('SER-05 un user que entra a /dashboard/admin/series vuelve a /dashboard', async ({ page }) => {
  await loginAs(page, regular)
  for (const path of ['/dashboard/admin/series', '/dashboard/admin/series/new']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/dashboard$/)
  }
})

test('SER-05 / SER-06 / SER-07 crear serie, agregar episodio, publicar borradores y borrar', async ({ page }) => {
  const title = `E2E Serie ${uniq()}`
  await loginAs(page, admin)
  await page.goto('/dashboard/admin')
  await page.getByRole('navigation', { name: /administración/i }).getByRole('link', { name: 'Series' }).click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/series$/)

  await page.getByRole('link', { name: /nueva serie/i }).click()
  await page.getByLabel('Título', { exact: true }).fill(title)
  await page.getByLabel('Año').fill('2008')
  await expect(page.getByLabel('Video (ruta en R2)')).toHaveCount(0)
  await page.getByRole('button', { name: /guardar borrador/i }).click()

  // Queda en su página de edición, sin episodios
  await expect(page).toHaveURL(/\/dashboard\/admin\/series\/[0-9a-f-]+\/edit$/)
  await expect(page.getByRole('heading', { name: 'Episodios (0)' })).toBeVisible()

  // Agregar episodio: la serie viene elegida
  await page.getByRole('link', { name: /agregar episodio/i }).click()
  await expect(page.getByRole('heading', { name: `Nuevo episodio de ${title}` })).toBeVisible()
  await page.getByLabel('Título', { exact: true }).fill('Piloto')
  await page.getByLabel('Temporada').fill('1')
  await page.getByLabel('Episodio').fill('1')
  await page.getByLabel('Video (ruta en R2)').fill('ladder/master.m3u8')
  await page.getByRole('button', { name: /guardar borrador/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/admin\/movies$/)
  const episodeRow = page.getByRole('row').filter({ hasText: 'Piloto' }).filter({ hasText: title })
  await expect(episodeRow.getByText(`${title} · T1:E1`)).toBeVisible()

  // Repetido → error en el campo
  await page.goto('/dashboard/admin/series')
  await page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: `Editar ${title}` }).click()
  await page.getByRole('link', { name: /agregar episodio/i }).click()
  await expect(page.getByRole('heading', { name: `Nuevo episodio de ${title}` })).toBeVisible()
  await page.getByLabel('Título', { exact: true }).fill('Otro')
  await page.getByLabel('Temporada').fill('1')
  await page.getByLabel('Episodio').fill('1')
  await page.getByLabel('Video (ruta en R2)').fill('ladder/master.m3u8')
  await page.getByRole('button', { name: /guardar borrador/i }).click()
  await expect(page.getByText('Ese episodio ya existe en la serie')).toBeVisible()

  // Publicar borradores (1)
  await page.goto('/dashboard/admin/series')
  const seriesRow = page.getByRole('row').filter({ hasText: title })
  await expect(seriesRow.getByText('1 episodio', { exact: true })).toBeVisible()
  await seriesRow.getByRole('link', { name: `Editar ${title}` }).click()
  await expect(page.getByText('T1:E1')).toBeVisible()
  await page.getByRole('button', { name: 'Publicar borradores (1)' }).click()
  await expect(page.getByText('1 episodio publicado.')).toBeVisible()
  await expect(page.getByRole('button', { name: /publicar borradores/i })).toHaveCount(0)

  // Borrar pide confirmación y dice cuántos episodios se van
  await page.goto('/dashboard/admin/series')
  const row = page.getByRole('row').filter({ hasText: title })
  await row.getByRole('button', { name: `Borrar ${title}` }).click()
  await expect(row.getByRole('button', { name: `Confirmar borrar ${title}` })).toContainText('con 1 episodio')
  await row.getByRole('button', { name: `Confirmar borrar ${title}` }).click()
  await expect(row).toHaveCount(0)
})
