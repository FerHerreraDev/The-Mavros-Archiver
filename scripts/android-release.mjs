#!/usr/bin/env node
// UPD-07: publica una versión nueva de las apps Android para que cada aparato se actualice solo (UPD-04).
//   pnpm android:release            → teléfono y tele
//   pnpm android:release --only tv  → solo una
//   pnpm android:release --dry-run  → compila y revisa, sin subir nada
// Solo lee de ../.env.local NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (para subir el APK y registrar la versión).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { apkPath, badging, gradleVersion, publishProblem } from './android-release-lib.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const ANDROID = path.join(ROOT, 'android')
const APPS = {
  mobile: { module: 'app-mobile', packageName: 'com.mavros.archiver' },
  tv: { module: 'app-tv', packageName: 'com.mavros.archiver.tv' },
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
if (only && !APPS[only]) throw new Error(`--only ${only}: usa mobile o tv`)
const apps = only ? [only] : Object.keys(APPS)

function readEnv() {
  return Object.fromEntries(
    readFileSync(path.join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*"?([^"\n]*)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
}

function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME
  const jbr = '/Applications/Android Studio.app/Contents/jbr/Contents/Home'
  return existsSync(jbr) ? jbr : undefined
}

function aapt2() {
  const sdk = process.env.ANDROID_HOME ?? path.join(homedir(), 'Library/Android/sdk')
  const tools = path.join(sdk, 'build-tools')
  const latest = readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
  return path.join(tools, latest, 'aapt2')
}

const env = readEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// 1. ¿Se puede publicar? (antes de compilar: falla rápido)
const plan = []
for (const app of apps) {
  const { module, packageName } = APPS[app]
  const version = gradleVersion(readFileSync(path.join(ANDROID, module, 'build.gradle.kts'), 'utf8'))
  const { data, error } = await supabase.from('app_releases').select('version_code').eq('app', app).order('version_code', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`No pude leer app_releases (¿corriste la migración 0012?): ${error.message}`)
  const problem = publishProblem(version.code, data?.version_code)
  if (problem) throw new Error(`${app}: ${problem}`)
  plan.push({ app, module, packageName, version, apk: path.join(ANDROID, module, 'build/outputs/apk/prod/release', `${module}-prod-release.apk`) })
  console.log(`${app}: ${data ? `publicada ${data.version_code}` : 'sin versiones'} → ${version.code} (${version.name})`)
}

// 2. Compilar con la llave de producción
execFileSync('./gradlew', plan.map((p) => `:${p.module}:assembleProdRelease`), {
  cwd: ANDROID,
  stdio: 'inherit',
  env: { ...process.env, ...(javaHome() ? { JAVA_HOME: javaHome() } : {}) },
})

// 3. Revisar cada APK: paquete, versión y que no lleve secretos (MOB-01)
for (const p of plan) {
  const info = badging(execFileSync(aapt2(), ['dump', 'badging', p.apk], { encoding: 'utf8' }))
  if (info.packageName !== p.packageName || info.code !== p.version.code) {
    throw new Error(`${p.app}: el APK dice ${info.packageName} ${info.code}, esperaba ${p.packageName} ${p.version.code}`)
  }
  execFileSync(path.join(ANDROID, 'scripts/check-apk-secrets.sh'), [p.apk], { stdio: 'inherit' })
  p.bytes = readFileSync(p.apk)
  p.sha256 = createHash('sha256').update(p.bytes).digest('hex')
}

if (dryRun) {
  for (const p of plan) console.log(`(prueba) ${p.app} ${p.version.name}: ${p.apk} · ${(p.bytes.length / 1e6).toFixed(1)} MB · sha256 ${p.sha256}`)
  process.exit(0)
}

// 4. Subir y registrar: primero el archivo, luego la versión (así ningún aparato ve una versión sin APK)
for (const p of plan) {
  const target = apkPath(p.app, p.version.code)
  const up = await supabase.storage.from('apps').upload(target, p.bytes, { contentType: 'application/vnd.android.package-archive', upsert: true })
  if (up.error) throw new Error(`${p.app}: no pude subir el APK: ${up.error.message}`)
  const { error } = await supabase.from('app_releases').insert({ app: p.app, version_code: p.version.code, version_name: p.version.name, apk_path: target, sha256: p.sha256 })
  if (error) throw new Error(`${p.app}: no pude registrar la versión: ${error.message}`)
  console.log(`✓ ${p.app} ${p.version.name} (${p.version.code}) publicada: los aparatos la pedirán al abrir la app`)
}
