import { describe, it, expect } from 'vitest'
import { apkPath, badging, gradleVersion, publishProblem } from '../../scripts/android-release-lib.mjs'

describe('UPD-07 publicar versión Android', () => {
  it('lee versionCode y versionName del build.gradle.kts', () => {
    const text = 'defaultConfig {\n        versionCode = 7\n        versionName = "1.3.0"\n    }\n            versionNameSuffix = "-local"'
    expect(gradleVersion(text)).toEqual({ code: 7, name: '1.3.0' })
    expect(() => gradleVersion('defaultConfig {}')).toThrow()
  })

  it('solo publica un versionCode mayor que el ya publicado', () => {
    expect(publishProblem(7, null)).toBeNull()
    expect(publishProblem(7, 6)).toBeNull()
    expect(publishProblem(6, 6)).toMatch(/no es mayor/)
    expect(publishProblem(5, 6)).toMatch(/no es mayor/)
    expect(publishProblem(0, null)).toMatch(/inválido/)
  })

  it('lee paquete y versión de aapt2', () => {
    const out = "package: name='com.mavros.archiver.tv' versionCode='6' versionName='1.2.0' platformBuildVersionName='17'\nsdkVersion:'28'"
    expect(badging(out)).toEqual({ packageName: 'com.mavros.archiver.tv', code: 6, name: '1.2.0' })
    expect(() => badging('nada')).toThrow()
  })

  it('cada versión en su propio archivo del bucket', () => {
    expect(apkPath('tv', 6)).toBe('tv/6.apk')
  })
})
