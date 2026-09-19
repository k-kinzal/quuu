import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Vite 5's builtin-module list lacks `node:sqlite`, so it tries to resolve it
 * as `sqlite` and fails. Treat it as external explicitly.
 */
const externalizeNodeSqlite = {
  name: 'externalize-node-sqlite',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id === 'node:sqlite') return { id, external: true }
    return null
  }
}

/*
 * Tests run from one place (`npm test` covers the whole repo). Splitting the
 * config per workspace nudges `npm run check` toward "some of it passed".
 * Aliases resolve from this file's location, not the cwd
 * (apps/mac's `dev:fixture` borrows this config).
 */
const root = import.meta.dirname

export default defineConfig({
  plugins: [externalizeNodeSqlite, react()],
  resolve: {
    alias: {
      '@design-system/react/layout-spec': resolve(root, 'packages/design-system/src/layoutSpec.ts'),
      '@design-system/react/input-behavior': resolve(
        root,
        'packages/design-system/src/components/inputs/resizeInput.ts'
      ),
      '@design-system/react': resolve(root, 'packages/design-system/src/index.ts'),
    }
  },
  test: {
    /*
     * Node by default. Only tests that exercise screen composition (`.test.tsx`)
     * opt into the browser side with `@vitest-environment jsdom` at the top of
     * the file. Making everything jsdom drags a DOM into main-process tests and slows them down
     */
    environment: 'node',
    root,
    include: [
      'apps/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.test.tsx',
      'packages/*/tests/**/*.test.ts',
      'tests/**/*.test.ts'
    ],
    /*
     * main tests launch real processes. Filling every CPU with workers pushes
     * individual 5-second guarantees over the line depending only on what else
     * is co-resident, so leave headroom for child processes and the OS.
     */
    maxWorkers: '25%',
    minWorkers: 1,
    server: { deps: { external: ['node:sqlite'] } }
  }
})
