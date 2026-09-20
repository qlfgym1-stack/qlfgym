import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['e2e/**', 'test-results/**'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
