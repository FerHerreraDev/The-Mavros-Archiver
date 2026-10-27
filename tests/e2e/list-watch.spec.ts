// Corre en Google Chrome (proyecto "chrome", coincide con /watch\.spec\.ts/): el video se reproduce de verdad.
import { test, expect, type Page } from '@playwright/test'
import { loginAs as loginWithSharedIp } from './fixtures'
import { adminClient, createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'

async function loginAs(page: Page, user: TestUser) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
  await loginWithSharedIp(page, user)
  await page.setExtraHTTPHeaders({})
}

const tag = Math.random().toString(36).slice(2, 8)
let viewer: TestUser
let listId: string
const slugs = { m1: `e2e-lw-m1-${tag}`, m2: `e2e-lw-m2-${tag}` }

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-list-watch' })
  const { data: movies } = await adminClient()
    .from('movies')
    .insert([
      { slug: slugs.m1, title: 'Primera de la lista', duration_seconds: 12, hls_path: 'sample/master.m3u8', status: 'published' },
      { slug: slugs.m2, title: 'Segunda de la lista', duration_seconds: 12, hls_path: 'sample/master.m3u8', status: 'published' },
    ])
    .select('id, slug')
  const { data: list } = await adminClient().from('playlists').insert({ name: 'Lista E2E', user_id: viewer.id }).select('id').single()
  listId = list!.id
  const id = (slug: string) => movies!.find((m) => m.slug === slug)!.id
  await adminClient().from('playlist_items').insert([
    { playlist_id: listId, movie_id: id(slugs.m1), position: 1 },
    { playlist_id: listId, movie_id: id(slugs.m2), position: 2 },
  ])
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().in('slug', Object.values(slugs))
  await deleteUsers([viewer.id])
})

const video = (page: Page) => page.locator('video')
const playToEnd = (page: Page) =>
  video(page).evaluate(async (v: HTMLVideoElement) => {
    v.muted = true
    await v.play()
    v.currentTime = Math.max(0, v.duration - 1)
  })

test('PL-06 reproducir la lista: al terminar ofrece lo siguiente de la lista y lo abre; en lo último no', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/lists/${listId}`)
  await page.getByRole('link', { name: 'Reproducir lista' }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${slugs.m1}\\?lista=${listId}$`))

  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(10)
  await playToEnd(page)
  const dialog = page.getByRole('dialog', { name: 'Siguiente en la lista' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(dialog.getByText('Segunda de la lista')).toBeVisible()
  await dialog.getByRole('button', { name: 'Ver ahora' }).click()
  await expect(page).toHaveURL(new RegExp(`/dashboard/watch/${slugs.m2}\\?lista=${listId}$`))

  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(10)
  await playToEnd(page)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.ended), { timeout: 15_000 }).toBe(true)
  await page.waitForTimeout(1000)
  await expect(page.getByRole('dialog', { name: /Siguiente/ })).toHaveCount(0)
})
