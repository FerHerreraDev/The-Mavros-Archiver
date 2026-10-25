import { defineConfig, devices } from '@playwright/test'
import { readLocalSupabase, appTestEnv, E2E_BASE_URL, E2E_PORT } from './tests/helpers/local-supabase'

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build de producción real, apuntando al Supabase local, en .next-e2e
    command: `pnpm exec next build && pnpm exec next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { ...appTestEnv(local), NEXT_DIST_DIR: '.next-e2e' },
  },
})
