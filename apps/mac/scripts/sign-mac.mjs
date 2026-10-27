/*
 * electron-builder 26.18 replaces the selected certificate hash with its display
 * name in the default signing path. Renewed certificates can share that name,
 * making codesign fail with "ambiguous". The custom hook receives the original
 * options, including the hash, so pass them to the same signer unchanged.
 * Keep the builder's retries, entitlements, and signature verification intact.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.resolve('electron-builder'))
export default require('app-builder-lib/out/codeSign/macCodeSign.js').sign
