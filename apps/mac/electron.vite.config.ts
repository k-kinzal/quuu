import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const designSystem = resolve(process.cwd(), '../../packages/design-system/src/index.ts')

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin()
    ],
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'src/main/index.ts') },
        external: ['node:sqlite']
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin()
    ],
    build: {
      rollupOptions: {
        input: { index: resolve(process.cwd(), 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve(process.cwd(), 'src/renderer'),
    resolve: {
      alias: {
        '@design-system/react/layout-spec': resolve(
          process.cwd(),
          '../../packages/design-system/src/layoutSpec.ts'
        ),
        '@design-system/react': designSystem,
        '@': resolve(process.cwd(), 'src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(process.cwd(), 'src/renderer/index.html') }
    }
  }
})
