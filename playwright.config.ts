import { defineConfig, devices } from '@playwright/test'
import { readLocalSupabase, appTestEnv, E2E_BASE_URL, E2E_PORT } from './tests/helpers/local-supabase'
import { TEST_VIDEO_SECRET } from './tests/helpers/test-secrets'

// Worker de video real sobre un "R2" local con los fixtures HLS (sin internet)
const VIDEO_PORT = 3101

const local = readLocalSupabase()

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Sin reintentos: si algo falla a veces, es un bug que hay que ver
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /watch\.spec\.ts/ },
    // Reproducción real: el Chromium de Playwright no trae H.264/AAC; Google Chrome sí
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' }, testMatch: /watch\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/helpers/video-cdn-server.ts tests/fixtures/hls ${VIDEO_PORT}`,
      // Sin token responde 403: basta para saber que ya escucha
      url: `http://127.0.0.1:${VIDEO_PORT}/`,
      reuseExistingServer: false,
      env: { VIDEO_TOKEN_SECRET: TEST_VIDEO_SECRET },
    },
    {
      // Build de producción real, apuntando al Supabase local, en .next-e2e
      command: `pnpm exec next build && pnpm exec next start -p ${E2E_PORT}`,
      url: `${E2E_BASE_URL}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        ...appTestEnv(local),
        VIDEO_CDN_URL: `http://127.0.0.1:${VIDEO_PORT}`,
        VIDEO_TOKEN_SECRET: TEST_VIDEO_SECRET,
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
})
