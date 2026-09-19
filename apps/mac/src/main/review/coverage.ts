import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { CoverageFile, CoverageMetric, CoverageSummary } from './types.js'

function coverageMetric(value: unknown): CoverageMetric | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const covered = Number(record.covered)
  const total = Number(record.total)
  const percent = Number(record.pct)
  if (![covered, total, percent].every(Number.isFinite)) return undefined
  return { covered, total, percent }
}

function metricFromCounts(covered: number, total: number): CoverageMetric | undefined {
  if (total <= 0) return undefined
  return {
    covered,
    total,
    percent: Math.round((covered / total) * 10_000) / 100
  }
}

function coveragePath(cwd: string, value: string): string | null {
  const absolute = isAbsolute(value) ? resolve(value) : resolve(cwd, value)
  const local = relative(cwd, absolute)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) return null
  return local.split(sep).join('/')
}

function coverageFile(path: string, value: unknown): CoverageFile | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return {
    path,
    lines: coverageMetric(record.lines),
    functions: coverageMetric(record.functions),
    branches: coverageMetric(record.branches),
    statements: coverageMetric(record.statements),
    uncoveredLines: []
  }
}

function readLcov(cwd: string, path: string): CoverageSummary | null {
  if (!existsSync(path)) return null
  try {
    const files: CoverageFile[] = []
    let currentPath: string | null = null
    let lineTotal = 0
    let lineCovered = 0
    let functionTotal = 0
    let functionCovered = 0
    let branchTotal = 0
    let branchCovered = 0
    let uncoveredLines: number[] = []

    const finish = (): void => {
      if (!currentPath) return
      files.push({
        path: currentPath,
        lines: metricFromCounts(lineCovered, lineTotal),
        functions: metricFromCounts(functionCovered, functionTotal),
        branches: metricFromCounts(branchCovered, branchTotal),
        uncoveredLines
      })
      currentPath = null
      lineTotal = 0
      lineCovered = 0
      functionTotal = 0
      functionCovered = 0
      branchTotal = 0
      branchCovered = 0
      uncoveredLines = []
    }

    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.startsWith('SF:')) {
        finish()
        currentPath = coveragePath(cwd, line.slice(3).trim())
        continue
      }
      if (line === 'end_of_record') {
        finish()
        continue
      }
      if (!currentPath) continue
      if (line.startsWith('DA:')) {
        const [numberValue, countValue] = line.slice(3).split(',')
        const number = Number(numberValue)
        const count = Number(countValue)
        if (!Number.isFinite(number) || !Number.isFinite(count)) continue
        lineTotal += 1
        if (count > 0) lineCovered += 1
        else uncoveredLines.push(number)
      } else if (line.startsWith('FNF:')) {
        functionTotal = Number(line.slice(4)) || 0
      } else if (line.startsWith('FNH:')) {
        functionCovered = Number(line.slice(4)) || 0
      } else if (line.startsWith('BRF:')) {
        branchTotal = Number(line.slice(4)) || 0
      } else if (line.startsWith('BRH:')) {
        branchCovered = Number(line.slice(4)) || 0
      }
    }
    finish()
    if (files.length === 0) return null

    const sum = (select: (file: CoverageFile) => CoverageMetric | undefined): CoverageMetric | undefined => {
      const values = files.map(select).filter((value): value is CoverageMetric => Boolean(value))
      return metricFromCounts(
        values.reduce((total, value) => total + value.covered, 0),
        values.reduce((total, value) => total + value.total, 0)
      )
    }
    return {
      source: relative(cwd, path),
      lines: sum((file) => file.lines),
      functions: sum((file) => file.functions),
      branches: sum((file) => file.branches),
      files: files.sort((a, b) => a.path.localeCompare(b.path))
    }
  } catch {
    return null
  }
}

export function readCoverage(cwd: string): CoverageSummary | null {
  const lcovPath = join(cwd, 'coverage', 'lcov.info')
  const lcov = readLcov(cwd, lcovPath)
  const summaries = [
    join(cwd, 'coverage', 'coverage-summary.json'),
    join(cwd, 'coverage-summary.json')
  ]
  for (const path of summaries) {
    if (!existsSync(path)) continue
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      const total = (parsed.total ?? parsed) as Record<string, unknown>
      const files = Object.entries(parsed)
        .filter(([name]) => name !== 'total')
        .map(([name, value]) => {
          const local = coveragePath(cwd, name)
          return local ? coverageFile(local, value) : null
        })
        .filter((file): file is CoverageFile => Boolean(file))
        .map((file) => {
          const detail = lcov?.files.find((candidate) => candidate.path === file.path)
          return detail ? { ...file, uncoveredLines: detail.uncoveredLines } : file
        })
        .sort((a, b) => a.path.localeCompare(b.path))
      return {
        source: relative(cwd, path),
        lines: coverageMetric(total.lines),
        functions: coverageMetric(total.functions),
        branches: coverageMetric(total.branches),
        statements: coverageMetric(total.statements),
        files: files.length > 0 ? files : lcov?.files ?? []
      }
    } catch {
      // A different format: look at the next candidate
    }
  }

  return lcov
}

