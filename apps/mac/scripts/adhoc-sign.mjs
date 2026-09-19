/*
 * Re-seal the packed .app with an ad-hoc signature (electron-builder afterPack).
 *
 * Why: Apple Silicon refuses to launch unsigned binaries. Swapping resources at
 * pack time breaks the seal that came with the Electron distribution, yet in
 * environments without a certificate (public-repo CI) electron-builder skips
 * signing entirely, producing an .app that cannot launch. So re-sign the whole
 * bundle ad-hoc here. Where a certificate exists, the proper signing that runs
 * right after this overwrites it with --force, so local builds are unaffected.
 *
 * electron-builder loads hooks via require(). This ESM works because
 * require(esm) landed in Node 22.12+ (both dev and CI satisfy that).
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

export default function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit'
  })
}
