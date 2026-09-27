import { fileURLToPath } from 'node:url'
import { workerMain } from './worker.js'
void workerMain(fileURLToPath(import.meta.url)).catch(error => {
  console.error(error instanceof Error ? error.message : 'Runner failed')
  process.exitCode = 1
})
