import type { AppSettings } from './types.js'

/**
 * How a project decides what its tasks are told about their Pull Request.
 *   inherit … the app's prompts (default)
 *   off     … never send this project's tasks back over a Pull Request
 *   custom  … this project's own prompts
 */
export type PullRequestPromptMode = 'inherit' | 'off' | 'custom'

export const PULL_REQUEST_PROMPT_MODES: PullRequestPromptMode[] = ['inherit', 'off', 'custom']

/** The states of a Pull Request a task can be sent back over, and what is said for each. */
export interface PullRequestPrompts {
  failure: string
  pending: string
  conflict: string
}

export type PullRequestPromptSource = Pick<AppSettings, 'pullRequestFailurePrompt' | 'pullRequestPendingPrompt' | 'pullRequestConflictPrompt'>

const EMPTY: PullRequestPrompts = { failure: '', pending: '', conflict: '' }

function prompts(source: PullRequestPromptSource): PullRequestPrompts {
  return {
    failure: source.pullRequestFailurePrompt.trim(),
    pending: source.pullRequestPendingPrompt.trim(),
    conflict: source.pullRequestConflictPrompt.trim()
  }
}

/** The prompts that apply to one project: its own, the app's, or none. Empty strings send nothing. */
export function resolvePullRequestPrompts(
  settings: PullRequestPromptSource,
  project: PullRequestPromptSource & { pullRequestPromptMode: PullRequestPromptMode }
): PullRequestPrompts {
  if (project.pullRequestPromptMode === 'off') return EMPTY
  if (project.pullRequestPromptMode === 'custom') return prompts(project)
  return prompts(settings)
}
