import { z } from 'zod'

// The Runner's HTTPS protocol also accepts older workers that advertise no labels.
export const runnerLabels = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).array().max(32)

export function configuredRunnerLabels(): string[] {
  return runnerLabels.parse([...new Set((process.env.QUUU_RUNNER_LABELS ?? '').split(',').map(label => label.trim()).filter(Boolean))])
}

export function matchesRunnerLabels(runner: { labels?: string[] }, project: { runnerLabels?: string[] }): boolean {
  return (project.runnerLabels ?? []).every(label => runner.labels?.includes(label))
}
