import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = import.meta.dirname

/**
 * The iPhone app's screens. **The shell (WKWebView) reads the output via file://.**
 * Absolute paths cannot be resolved from a file URL, so `base` is relative.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@design-system/react': resolve(root, '../../packages/design-system/src/index.ts'),
      '@': resolve(root, 'src')
    }
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // WKWebView (iOS 17+). Lowering this makes body rendering heavier, so keep it
    target: 'safari17'
  }
})
