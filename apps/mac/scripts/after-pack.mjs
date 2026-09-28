/*
 * electron-builder afterPack: check the archive first, then seal the bundle.
 * electron-builder takes a single hook, so each step lives in its own script.
 */
import adhocSign from './adhoc-sign.mjs'
import verifyPackagedModules from './verify-packaged-modules.mjs'

export default function afterPack(context) {
  verifyPackagedModules(context)
  adhocSign(context)
}
