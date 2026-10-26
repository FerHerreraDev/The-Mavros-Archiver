import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos de pruebas (los .ts de fixtures son segmentos de video MPEG-TS, no TypeScript)
    "tests/fixtures/**",
    ".next-e2e/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Proyecto Android: lo revisa Gradle; aquí solo se lintean sus scripts .mjs
    "android/**/build/**",
    "android/.gradle/**",
  ]),
]);

export default eslintConfig;
