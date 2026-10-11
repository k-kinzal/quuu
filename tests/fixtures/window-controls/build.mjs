import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { build } from 'vite'

const outDir = process.argv[2]
if (!outDir) throw new Error('Missing fixture output directory')

await build({
  configFile: false, root: resolve(import.meta.dirname, '../../..'), base: './',
  plugins: [react()], logLevel: 'error',
  build: { outDir, rollupOptions: { input: resolve(import.meta.dirname, 'index.html') } }
})
