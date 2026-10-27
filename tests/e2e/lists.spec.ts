import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let viewer: TestUser
let other: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const ids: Record<string, string> = {}
const seriesTitle = `Serie listas ${tag}`

test.beforeAll(async () => {
  ;[viewer, other] = await Promise.all([createUser({ prefix: 'e2e-lists' }), createUser({ prefix: 'e2e-lists-other' })])
  const { data: show } = await adminClient().from('series').insert({ slug: `e2e-lists-${tag}`, title: seriesTitle, status: 'published' }).select('id').single()
  ids.show = show!.id
  for (const [key, fields] of [
    ['m1', { title: `Peli uno ${tag}` }],
    ['m2', { title: `Peli dos ${tag}` }],
    ['e1', { title: 'Piloto', series_id: ids.show, season_number: 1, episode_number: 1 }],
  ] as const) {
    const { data } = await adminClient()
      .from('movies')
      .insert({ slug: `e2e-lists-${key}-${tag}`, duration_seconds: 12, hls_path: 'sample/master.m3u8', status: 'published', ...fields })
      .select('id')
      .single()
    ids[key] = data!.id
  }
})
test.afterAll(async () => {
  await adminClient().from('series').delete().eq('id', ids.show)
  await adminClient().from('movies').delete().like('slug', `e2e-lists-%-${tag}`)
  await deleteUsers([viewer.id, other.id])
})

test('PL-03 / PL-04 / PL-05 crear lista desde una serie, agregar películas, ordenar, quitar y que sea privada', async ({ page, browser }) => {
  await loginAs(page, viewer)

  // Sin listas: estado vacío
  await page.getByRole('link', { name: /mis listas/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/lists$/)
  await expect(page.getByText(/todavía no tienes listas/i)).toBeVisible()

  // Desde la serie: crear lista nueva ya con la serie
  await page.goto(`/dashboard/series/e2e-lists-${tag}`)
  await page.getByRole('button', { name: 'Agregar a lista' }).click()
  const dialog = page.getByRole('dialog', { name: 'Agregar a lista' })
  await dialog.getByLabel('Nombre de la lista nueva').fill('Maratón')
  await dialog.getByRole('button', { name: 'Crear lista y agregar' }).click()
  await expect(dialog.getByRole('menuitemcheckbox', { name: 'Maratón' })).toHaveAttribute('aria-checked', 'true')

  // Desde dos películas: marcar la lista existente
  for (const key of ['m1', 'm2']) {
    await page.goto(`/dashboard/watch/e2e-lists-${key}-${tag}`)
    await page.getByRole('button', { name: 'Agregar a lista' }).click()
    const item = page.getByRole('dialog', { name: 'Agregar a lista' }).getByRole('menuitemcheckbox', { name: 'Maratón' })
    await expect(item).toHaveAttribute('aria-checked', 'false')
    await item.click()
    await expect(item).toHaveAttribute('aria-checked', 'true')
  }

  // La lista: en orden de agregado, con "Serie" en la serie
  await page.goto('/dashboard/lists')
  await expect(page.getByText('3 elementos')).toBeVisible()
  await page.getByRole('link', { name: /Maratón/ }).click()
  const rows = page.getByRole('listitem')
  await expect(rows).toHaveText([new RegExp(seriesTitle), new RegExp(`Peli uno ${tag}`), new RegExp(`Peli dos ${tag}`)])
  await expect(rows.first()).toContainText('Serie')

  // Mover "Peli dos" arriba y quitar la serie
  await page.getByRole('button', { name: `Subir Peli dos ${tag}` }).click()
  await expect(rows).toHaveText([new RegExp(seriesTitle), new RegExp(`Peli dos ${tag}`), new RegExp(`Peli uno ${tag}`)])
  await page.getByRole('button', { name: `Quitar ${seriesTitle}` }).click()
  await expect(rows).toHaveText([new RegExp(`Peli dos ${tag}`), new RegExp(`Peli uno ${tag}`)])
  await expect(page.getByRole('link', { name: 'Reproducir lista' })).toHaveAttribute('href', new RegExp(`e2e-lists-m2-${tag}\\?lista=`))

  // Privada: otra persona → 404
  const url = page.url()
  const ctx = await browser.newContext()
  const otherPage = await ctx.newPage()
  await loginAs(otherPage, other)
  const res = await otherPage.goto(url)
  expect(res?.status()).toBe(404)
  await ctx.close()

  // Renombrar y borrar (con confirmación)
  await page.goto('/dashboard/lists')
  await page.getByRole('button', { name: 'Renombrar Maratón' }).click()
  await page.getByLabel('Nuevo nombre de Maratón').fill('Domingo')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('link', { name: /Domingo/ })).toBeVisible()
  await page.getByRole('button', { name: 'Borrar Domingo' }).click()
  await page.getByRole('button', { name: 'Confirmar borrar Domingo' }).click()
  await expect(page.getByText(/todavía no tienes listas/i)).toBeVisible()
})
