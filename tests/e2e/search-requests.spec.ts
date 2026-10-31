import { test, expect, loginAs, otherPerson } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

// SRCH-02, SRCH-03, REQ-03..REQ-05 en la web
let viewer: TestUser
let boss: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const ids: string[] = []

test.beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'e2e-srch' }), createUser({ role: 'admin', prefix: 'e2e-srch-boss' })])
  const rows = [
    { title: `Película Zeta ${tag}`, original_title: `Zeta Movie ${tag}`, status: 'published' },
    { title: `Borrador Zeta ${tag}`, status: 'draft' },
  ].map((m, i) => ({ ...m, slug: `e2e-srch-${i}-${tag}`, duration_seconds: 600, hls_path: `movies/e2e-srch-${i}/master.m3u8` }))
  const { data } = await adminClient().from('movies').insert(rows).select('id')
  ids.push(...data!.map((m) => m.id))
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().in('id', ids)
  await deleteUsers([viewer.id, boss.id])
})

test('SRCH-02 buscar sin acentos, queda en la URL y no muestra borradores', async ({ page }) => {
  await loginAs(page, viewer)
  await page.getByRole('searchbox', { name: 'Buscar' }).fill(`pelicula zeta ${tag}`)
  await expect(page).toHaveURL(new RegExp(`\\?q=pelicula`))
  await expect(page.getByRole('heading', { name: /Resultados para/ })).toBeVisible()
  await expect(page.getByRole('link', { name: `Ver Película Zeta ${tag}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Ver Borrador Zeta ${tag}` })).toHaveCount(0)

  // Por el título original también, y entrar directo con ?q= funciona
  await page.goto(`/dashboard?q=${encodeURIComponent(`zeta movie ${tag}`)}`)
  await expect(page.getByRole('link', { name: `Ver Película Zeta ${tag}` })).toBeVisible()

  // Borrar la búsqueda regresa al catálogo
  await page.getByRole('button', { name: 'Borrar búsqueda' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Recién agregadas' })).toBeVisible()
})

test('SRCH-03 / REQ-03 sin resultados se pide, y un segundo pedido igual se rechaza', async ({ page }) => {
  const wanted = `Nada Igual ${tag}`
  await loginAs(page, viewer)
  await page.goto(`/dashboard?q=${encodeURIComponent(wanted)}`)
  await expect(page.getByText(`No encontramos «${wanted}».`)).toBeVisible()
  await page.getByRole('button', { name: `Pedir «${wanted}»` }).click()
  await expect(page.getByText('Listo, se lo pedimos al admin.')).toBeVisible()

  const { data } = await adminClient().from('movie_requests').select('title, status').eq('user_id', viewer.id)
  expect(data).toEqual([{ title: wanted, status: 'pending' }])

  await page.reload()
  await page.getByRole('button', { name: `Pedir «${wanted}»` }).click()
  await expect(page.getByText('Ya lo pediste y sigue pendiente.')).toBeVisible()
})

test('REQ-04 / REQ-05 Mis pedidos, el admin resuelve y el usuario ve el estado', async ({ browser }) => {
  const user = await otherPerson(browser)
  await loginAs(user, viewer)
  await user.getByRole('link', { name: 'Pedidos' }).click()
  await expect(user).toHaveURL(/\/dashboard\/requests$/)
  await user.getByRole('textbox', { name: 'Qué quieres ver' }).fill(`Pedido Web ${tag}`)
  await user.getByRole('textbox', { name: 'Nota' }).fill('La versión del director')
  await user.getByRole('button', { name: 'Pedir', exact: true }).click()
  const mine = user.getByRole('list', { name: 'Mis pedidos' })
  await expect(mine.getByText(`Pedido Web ${tag}`)).toBeVisible()
  await expect(mine.getByText('Pendiente').first()).toBeVisible()

  const admin = await otherPerson(browser)
  await loginAs(admin, boss)
  await admin.goto('/dashboard/admin/requests')
  await expect(admin.getByRole('navigation', { name: 'Secciones de administración' }).getByRole('link', { name: /Pedidos/ })).toContainText(/\d/)
  const row = admin.getByTestId('request-row').filter({ hasText: `Pedido Web ${tag}` })
  await expect(row).toContainText(viewer.email)
  await expect(row).toContainText('La versión del director')
  await row.getByRole('button', { name: 'Ya está' }).click()
  await expect(row.getByRole('button', { name: 'Reabrir' })).toBeVisible()

  await user.reload()
  const done = user.getByRole('listitem').filter({ hasText: `Pedido Web ${tag}` })
  await expect(done).toContainText('Ya está')
  await expect(done.getByRole('button', { name: /Borrar/ })).toHaveCount(0)
  await user.close()
  await admin.close()
})

test('REQ-05 un user no entra al panel de pedidos', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto('/dashboard/admin/requests')
  await expect(page).toHaveURL(/\/dashboard$/)
})
