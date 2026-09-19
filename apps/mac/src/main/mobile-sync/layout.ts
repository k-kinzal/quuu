/**
 * What lives in the iCloud Drive folder. **Every file has exactly one writer.**
 *
 * ```
 * <root>/
 *   README.txt              the explanation for a human opening Files (written by the Mac)
 *   mac/                    only the Mac writes. The iPhone only reads
 *     snapshot.json         everything the list needs
 *     tasks/<taskId>.json   one task's detail (the tail of the conversation, the run history)
 *     receipts.json         stubs of how the intents from the iPhone were handled
 *   phone/                  only the iPhone writes. The Mac only reads
 *     intents/<name>.json   one intent per file. Contents never change once written
 *   app/                    only the Mac writes. The iPhone's UI itself (`app.ts`)
 *     manifest.json         the current version, plus the file list and fingerprints
 *     <build>/...           one directory per version
 * ```
 *
 * Splitting the writers is the point. If both wrote the same file, iCloud **keeps both as
 * correct** (creating a conflict file like `... 2.json`). Folding those together becomes the
 * app's job, and it happens far away from here, so nobody notices.
 * Split, a conflict cannot arise at all, and the folding code is not needed either.
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
  /** The iPhone's UI itself (written by the Mac). So it can be fixed without plugging in a cable */
  app: 'app',
  appManifest: 'app/manifest.json',
  readme: 'README.txt'
} as const

/** Where a detail file lives (relative to the root). */
export function detailPath(taskId: string): string {
  return `${LAYOUT.details}/${taskId}.json`
}

/**
 * The file name for an intent.
 *
 * **Shaped so the order is readable from the name.** iCloud does not guarantee arrival order, so
 * the Mac re-sorts what has arrived before applying it. Sorting by name also lets a human opening
 * Files see which came first.
 */
export function intentFileName(seq: number, id: string): string {
  return `${String(seq).padStart(12, '0')}-${id}.json`
}

/** Read the seq out of an intent's file name. null when unreadable (sorting then follows the seq inside). */
export function seqFromFileName(name: string): number | null {
  const m = /^(\d{12})-/.exec(name)
  if (!m) return null
  return Number(m[1])
}

/**
 * The marker for a file iCloud has not brought down yet.
 *
 * macOS throws the contents away to free storage and leaves a small stand-in named
 * `.<name>.icloud`. Reading it looks like "the file is missing", so **missing has to be told
 * apart from not-yet-downloaded**.
 */
export function placeholderName(name: string): string {
  return `.${name}.icloud`
}

/** `.foo.json.icloud` -> `foo.json`. null when it is not a stand-in. */
export function nameFromPlaceholder(name: string): string | null {
  if (!name.startsWith('.') || !name.endsWith('.icloud')) return null
  return name.slice(1, -'.icloud'.length)
}
