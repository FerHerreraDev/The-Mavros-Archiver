// Partes puras de `pnpm android:release` (UPD-07), con pruebas en tests/unit/android-release.test.ts

/** versionCode y versionName de un build.gradle.kts */
export function gradleVersion(text) {
  const code = text.match(/^\s*versionCode\s*=\s*(\d+)\s*$/m)
  const name = text.match(/^\s*versionName\s*=\s*"([^"]+)"\s*$/m)
  if (!code || !name) throw new Error('No encuentro versionCode / versionName en build.gradle.kts')
  return { code: Number(code[1]), name: name[1] }
}

/** Mensaje de error si no se puede publicar esa versión; null si sí */
export function publishProblem(code, published) {
  if (!Number.isInteger(code) || code <= 0) return `versionCode inválido: ${code}`
  if (published != null && code <= published) {
    return `versionCode ${code} no es mayor que el publicado (${published}): súbelo en build.gradle.kts`
  }
  return null
}

/** package y versionCode según `aapt2 dump badging` */
export function badging(text) {
  const m = text.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m)
  if (!m) throw new Error('aapt2 no devolvió el paquete')
  return { packageName: m[1], code: Number(m[2]), name: m[3] }
}

export const apkPath = (app, code) => `${app}/${code}.apk`
