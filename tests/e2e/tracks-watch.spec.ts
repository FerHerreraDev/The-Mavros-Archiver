// WATCH-05 en Google Chrome (proyecto "chrome"): idiomas de audio y subtítulos con un video real.
import { test as base, expect, type Page } from '@playwright/test'
import { loginAs as loginWithSharedIp } from './fixtures'
import { adminClient, createUser, deleteUsers, randomIp, type TestUser } from '../helpers/users'

const test = base

async function loginAs(page: Page, user: TestUser) {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() })
  await loginWithSharedIp(page, user)
  await page.setExtraHTTPHeaders({})
}

let viewer: TestUser
let movieId: string
let slug: string

test.beforeAll(async () => {
  viewer = await createUser({ prefix: 'e2e-tracks' })
  slug = `e2e-tracks-${Math.random().toString(36).slice(2, 8)}`
  // tests/fixtures/hls/tracks: 12 s, audio en español e inglés, subtítulos en español (make-tracks.sh)
  const { data } = await adminClient()
    .from('movies')
    .insert({ slug, title: 'E2E Idiomas', duration_seconds: 12, hls_path: 'tracks/master.m3u8', status: 'published' })
    .select('id')
    .single()
  movieId = data!.id
})
test.afterAll(async () => {
  await adminClient().from('movies').delete().eq('id', movieId)
  await deleteUsers([viewer.id])
})

const video = (page: Page) => page.locator('video')
const play = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => {
    v.muted = true
    return v.play()
  })
const subtitles = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) =>
    Array.from(v.textTracks)
      .filter((t) => t.kind === 'subtitles')
      .map((t) => ({ label: t.label, language: t.language, mode: t.mode }))
  )
async function openAudioMenu(page: Page) {
  await video(page).hover()
  await page.getByRole('button', { name: /settings|ajustes|configuración/i }).click()
  await page.getByRole('menuitem', { name: /^audio/i }).click()
}
const audioSegment = (page: Page, n: number) => page.waitForRequest((r) => new RegExp(`/audio-${n}/seg_\\d+\\.ts`).test(r.url()))

test('WATCH-05 audio en español por defecto, subtítulos apagados, y el menú ofrece cada idioma', async ({ page }) => {
  await loginAs(page, viewer)
  const spanish = audioSegment(page, 0)
  await page.goto(`/dashboard/watch/${slug}`)
  await play(page)
  await spanish
  await expect.poll(() => subtitles(page)).toEqual([{ label: 'Español', language: 'es', mode: 'disabled' }])

  await openAudioMenu(page)
  await expect(page.getByText('Inglés')).toBeVisible()
})

test('WATCH-05 lo que se elige se recuerda para la siguiente vez', async ({ page }) => {
  await loginAs(page, viewer)
  await page.goto(`/dashboard/watch/${slug}`)
  await play(page)
  await expect.poll(() => subtitles(page)).toHaveLength(1)

  // Inglés desde el menú y subtítulos prendidos (como lo haría el botón)
  await openAudioMenu(page)
  const english = audioSegment(page, 1)
  await page.getByText('Inglés').click()
  await english
  await video(page).evaluate((v: HTMLVideoElement) => {
    Array.from(v.textTracks).find((t) => t.kind === 'subtitles')!.mode = 'showing'
  })
  await expect.poll(() => page.evaluate(() => [localStorage.getItem('mavros.audioLang'), localStorage.getItem('mavros.subtitlesLang')])).toEqual(['en', 'es'])

  const englishAgain = audioSegment(page, 1)
  await page.reload()
  await play(page)
  await englishAgain
  await expect.poll(() => subtitles(page)).toEqual([{ label: 'Español', language: 'es', mode: 'showing' }])
})
