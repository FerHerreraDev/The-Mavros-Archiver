import { test, expect } from './fixtures'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { readLocalSupabase } from '../helpers/local-supabase'

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? filesUnder(full) : [full]
  })
}

test('SEC-01 el bundle del navegador no contiene la service role key', async () => {
  const staticDir = path.join(process.cwd(), '.next-e2e/static')
  expect(existsSync(staticDir)).toBe(true)

  const { serviceRoleKey } = readLocalSupabase()
  const leaks = filesUnder(staticDir).filter((file) => {
    const content = readFileSync(file, 'utf8')
    return content.includes(serviceRoleKey) || /sb_secret_/.test(content) || content.includes('SUPABASE_SERVICE_ROLE_KEY')
  })
  expect(leaks.map((f) => path.relative(process.cwd(), f))).toEqual([])
})

test('SEC-01 las páginas públicas no exponen la service role key en el HTML', async ({ page }) => {
  const { serviceRoleKey } = readLocalSupabase()
  for (const route of ['/login', '/forgot-password']) {
    const res = await page.goto(route)
    const html = (await res?.text()) ?? ''
    expect(html.includes(serviceRoleKey), route).toBe(false)
  }
})
