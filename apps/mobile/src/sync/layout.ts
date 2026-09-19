/**
 * Contents of the iCloud Drive folder. **Every file has exactly one writer.**
 *
 * ```
 * <root>/
 *   README.txt              Explanation for a person opening it in Files (the Mac writes it)
 *   mac/                    Only the Mac writes. The iPhone only reads
 *     snapshot.json         Everything the list needs
 *     tasks/<taskId>.json   Detail of one task (tail of the conversation, run history)
 *     receipts.json         Record of how intents from the iPhone were handled
 *   phone/                  Only the iPhone writes. The Mac only reads
 *     intents/<name>.json   One file, one intent. Never modified once written
 *   app/                    Only the Mac writes. The iPhone's UI itself (`app.ts`)
 *     manifest.json         Current build, plus the list of files and their fingerprints
 *     <build>/...           One directory per build
 * ```
 *
 * The split of writers is the point. Let both sides write the same file and
 * iCloud **keeps both as equally valid** (it creates conflict files like
 * `... 2.json`). Folding those becomes the app's job, and it happens far
 * away where nobody notices. With writers split, conflicts cannot occur in
 * principle and the folding code is simply unnecessary.
 */
export const LAYOUT = {
  /** The side the Mac writes */
  mac: 'mac',
  snapshot: 'mac/snapshot.json',
  details: 'mac/tasks',
  receipts: 'mac/receipts.json',
  /** The side the iPhone writes */
  phone: 'phone',
  intents: 'phone/intents',
  /** The iPhone's UI itself (written by the Mac), so it can be fixed without a cable */
  app: 'app',
  appManifest: 'app/manifest.json',
  readme: 'README.txt'
} as const

/** Where a detail file lives (relative to the root). */
export function detailPath(taskId: string): string {
  return `${LAYOUT.details}/${taskId}.json`
}

/**
 * File name for an intent.
 *
 * **Make the order readable from the name.** iCloud does not guarantee
 * arrival order, so the Mac re-sorts what has arrived before applying.
 * If names sort, a person opening the folder in Files can also see what
 * came first.
 */
export function intentFileName(seq: number, id: string): string {
  return `${String(seq).padStart(12, '0')}-${id}.json`
}

/** Read the seq out of an intent file name. null if unreadable (ordering then follows the seq in the body). */
export function seqFromFileName(name: string): number | null {
  const m = /^(\d{12})-/.exec(name)
  if (!m) return null
  return Number(m[1])
}

/**
 * Marker for a file whose content iCloud has not brought down yet.
 *
 * macOS evicts content to free storage and leaves a small stand-in named
 * `.<name>.icloud`. A read then looks like "file does not exist", so we
 * must **distinguish missing from not-yet-downloaded**.
 */
export function placeholderName(name: string): string {
  return `.${name}.icloud`
}

/** `.foo.json.icloud` → `foo.json`. null if it is not a stand-in. */
export function nameFromPlaceholder(name: string): string | null {
  if (!name.startsWith('.') || !name.endsWith('.icloud')) return null
  return name.slice(1, -'.icloud'.length)
}

/** Explanation for a person who opens the folder in Files. The Mac places it. */
export const README_TEXT = `Quuu

Quuu on the Mac and Quuu on the iPhone talk to each other through this folder.

  mac/    Written by the Mac (the iPhone only reads)
  phone/  Written by the iPhone (the Mac only reads)
  app/    The iPhone's UI (written by the Mac)

Please do not delete or move anything in here by hand.
If you delete the whole folder, it can be recreated from Quuu's settings on the Mac.
`
