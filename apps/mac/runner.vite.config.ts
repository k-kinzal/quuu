import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node24', outDir: 'out/runner',
    lib: { entry: resolve(import.meta.dirname, 'src/main/runners/entry.ts'), formats: ['es'], fileName: () => 'quuu-runner.mjs' },
    rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)] }
  }
})
