import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'out/cli',
    lib: { entry: resolve(import.meta.dirname, 'src/cli/main.mjs'), formats: ['es'], fileName: () => 'quuu.mjs' },
    rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)] },
  },
})
