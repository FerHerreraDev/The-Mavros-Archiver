import { test, expect, loginAs } from './fixtures'
import { adminClient, createUser, deleteUsers, type TestUser } from '../helpers/users'

let admin: TestUser
let movieId: string
const slug = `e2e-mobile-${Math.random().toString(36).slice(2, 8)}`
test.beforeAll(async () => {
  admin = await createUser({ role: 'admin', prefix: 'e2e-mobile' })
  const { data } = await adminClient()
    .from('movies')
    .insert({ slug, title: 'E2E Móvil con un título bastante largo para probar', duration_seconds: 12, hls_path: 'sample/master.m3u8', status: 'published' })
    .select('id')
    .single()
  movieId = data!.id
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().eq('id', movieId)
  await deleteUsers([admin.id])
})

test.use({ viewport: { width: 390, height: 844 } })

async function hasHorizontalScroll(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}

test('UI-01 sin scroll horizontal en móvil y navbar accesible', async ({ page }) => {
  await page.goto('/login')
  expect(await hasHorizontalScroll(page), '/login').toBe(false)

  await loginAs(page, admin)
  for (const path of ['/dashboard', `/dashboard/watch/${slug}`, '/dashboard/profile', '/dashboard/admin', '/dashboard/admin/movies']) {
    await page.goto(path)
    expect(await hasHorizontalScroll(page), path).toBe(false)
  }

  for (const name of [/catálogo/i, /perfil/i, /admin/i]) {
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /salir/i })).toBeVisible()
})
