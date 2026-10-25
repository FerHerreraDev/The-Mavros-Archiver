import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { readLocalSupabase, appTestEnv } from './tests/helpers/local-supabase'

// Las suites integration/db necesitan Supabase local; unit no.
function localEnv(): Record<string, string> {
  try {
    return appTestEnv(readLocalSupabase())
  } catch {
    return {}
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': path.resolve(import.meta.dirname, 'tests/helpers/empty-module.ts'),
    },
  },
  test: {
    // Sin reintentos: una prueba que falla a veces es un bug, no ruido
    retry: 0,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts', 'tests/db/**/*.test.ts'],
          environment: 'node',
          env: localEnv(),
          setupFiles: ['tests/helpers/integration-setup.ts'],
          globalSetup: ['tests/helpers/integration-global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
