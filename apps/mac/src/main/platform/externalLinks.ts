import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shell } from 'electron'
import { t } from '../i18n/index.js'
import { launch } from './launch.js'

/** Conversation paths open in Finder; documents and app bundles are never executed. */
export async function openExternalLink(href: string): Promise<void> {
  let path: string
  try {
    if (/^file:/i.test(href)) path = fileURLToPath(href)
    else if (/^\/(?!\/)/.test(href)) path = decodeURIComponent(href)
    else if (href.startsWith('~/')) path = join(homedir(), decodeURIComponent(href.slice(2)))
    else {
      if (!/^(?:https?|mailto):/i.test(href)) throw new Error('Unsupported link')
      await shell.openExternal(href)
      return
    }
    if (/\p{Cc}/u.test(path)) throw new Error('Invalid path')
  } catch (cause) {
    throw new Error(t('externalLinks.cannotOpen'), { cause })
  }

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(path)
  } catch (cause) {
    throw new Error(t('externalLinks.pathUnavailable', { path }), { cause })
  }
  if (info.isDirectory()) await launch(['-a', 'Finder', path])
  else shell.showItemInFolder(path)
}
