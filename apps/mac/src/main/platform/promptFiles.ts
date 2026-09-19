import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { userDataDir } from '../appPaths.js'

/** Staged clipboard files must survive restarts and long waits in the queue. */
export async function savePromptFiles(files: { name: string; data: Uint8Array }[]): Promise<string[]> {
  if (files.length === 0) return []
  const root = join(userDataDir(), 'prompt-files')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(join(root, 'paste-'))
  try {
    const paths: string[] = []
    for (const [index, file] of files.entries()) {
      // Names come from the clipboard, never from a trusted destination picker.
      const name = Array.from(basename(file.name), character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character).join('')
      const path = join(directory, `${index + 1}-${!name || name === '.' || name === '..' ? 'file' : name}`)
      await writeFile(path, file.data, { flag: 'wx', mode: 0o600 })
      paths.push(path)
    }
    return paths
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
