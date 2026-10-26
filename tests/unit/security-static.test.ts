import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe('SEC-02 secretos fuera de git', () => {
  it.each(['.env.local', '.env', '.env.production', '.env.development.local'])('%s está ignorado', (file) => {
    // check-ignore sale con código 0 si el archivo está ignorado
    expect(() => execFileSync('git', ['check-ignore', '-q', file], { cwd: root })).not.toThrow()
  })

  it('.env.example sí se versiona', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', '.env.example'], { cwd: root })).toThrow()
  })

  it('ningún .env con secretos está trackeado', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: root }).toString().split('\n')
    expect(tracked.filter((f) => /(^|\/)\.env(?!\.example$)/.test(f))).toEqual([])
  })
})

describe('SEC-03 el cliente admin (service role) es solo de servidor', () => {
  it("lib/supabase/admin.ts importa 'server-only'", () => {
    const src = readFileSync(path.join(root, 'lib/supabase/admin.ts'), 'utf8')
    expect(src).toMatch(/import\s+['"]server-only['"]/)
  })

  it('todo archivo que lo importa es de servidor', () => {
    const files = ['app', 'components', 'lib'].flatMap((d) => sourceFiles(path.join(root, d)))
    const importers = files.filter((f) => /from\s+['"]@\/lib\/supabase\/admin['"]/.test(readFileSync(f, 'utf8')))
    const clientSide = importers.filter((f) => {
      const src = readFileSync(f, 'utf8')
      const isServer = /^\s*['"]use server['"]/m.test(src) || /import\s+['"]server-only['"]/.test(src)
      const isClient = /^\s*['"]use client['"]/m.test(src)
      return isClient || !isServer
    })
    expect(clientSide.map((f) => path.relative(root, f))).toEqual([])
  })
})

describe('MOB-01 la app Android no lleva secretos', () => {
  const androidDir = path.join(root, 'android')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (['build', '.gradle', '.kotlin', 'test', 'androidTest'].includes(name)) return []
      if (statSync(full).isDirectory()) return files(full)
      return /\.(kt|kts|xml|properties|toml|pro)$/.test(name) ? [full] : []
    })

  it('ni el código ni la configuración de la app mencionan la service role key ni el secreto del video', () => {
    const offenders = files(androidDir).filter((f) =>
      /service_role|SERVICE_ROLE|VIDEO_TOKEN_SECRET|sb_secret_/.test(readFileSync(f, 'utf8'))
    )
    expect(offenders.map((f) => path.relative(root, f))).toEqual([])
  })

  it('de .env.local la app solo lee las dos variables públicas', () => {
    const gradle = readFileSync(path.join(androidDir, 'app-mobile/build.gradle.kts'), 'utf8')
    const allowed = gradle.match(/val allowed = setOf\(([^)]*)\)/)?.[1] ?? ''
    expect(allowed.replace(/\s/g, '')).toBe('"NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY"')
  })
})
