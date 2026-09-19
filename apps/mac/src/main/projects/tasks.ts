import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProjectTask } from '../review/types.js'

export function discoverProjectTasks(cwd: string): ProjectTask[] {
  const result: ProjectTask[] = []
  const packageJson = join(cwd, 'package.json')
  if (existsSync(packageJson)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJson, 'utf8')) as { scripts?: Record<string, unknown> }
      for (const name of Object.keys(parsed.scripts ?? {}).sort()) {
        const task = { id: `package:${name}`, label: name, source: 'package' as const, command: '' }
        result.push({ ...task, command: taskCommand(task) })
      }
    } catch {
      // A definition we cannot read is never a run candidate
    }
  }

  const composerJson = join(cwd, 'composer.json')
  if (existsSync(composerJson)) {
    try {
      const parsed = JSON.parse(readFileSync(composerJson, 'utf8')) as { scripts?: Record<string, unknown> }
      for (const name of Object.keys(parsed.scripts ?? {}).sort()) {
        const task = { id: `composer:${name}`, label: name, source: 'composer' as const, command: '' }
        result.push({ ...task, command: taskCommand(task) })
      }
    } catch {
      // A definition we cannot read is never a run candidate
    }
  }

  const makefile = ['Makefile', 'makefile'].map((name) => join(cwd, name)).find(existsSync)
  if (makefile) {
    const names = new Set<string>()
    for (const line of readFileSync(makefile, 'utf8').split('\n')) {
      const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*):(?:\s|$)/.exec(line)
      if (match && !match[1].startsWith('.')) names.add(match[1])
    }
    for (const name of [...names].sort()) {
      const task = { id: `make:${name}`, label: name, source: 'make' as const, command: '' }
      result.push({ ...task, command: taskCommand(task) })
    }
  }
  return result
}

export function taskCommand(task: ProjectTask): string {
  const name = task.id.slice(task.id.indexOf(':') + 1)
  if (task.source === 'package') return `npm run ${shellQuote(name)}`
  if (task.source === 'composer') return `composer run-script ${shellQuote(name)}`
  return `make ${shellQuote(name)}`
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

