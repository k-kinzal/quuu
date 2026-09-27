import type { PullRequestPromptMode } from '../../../preload/api/settings.js'
export type { PullRequestPromptMode } from '../../../preload/api/settings.js'

/**
 * How a project decides what its tasks are told about their Pull Request.
 *   inherit … the app's prompts (default)
 *   off     … never send this project's tasks back over a Pull Request
 *   custom  … this project's own prompts
 */
export const PULL_REQUEST_PROMPT_MODES: PullRequestPromptMode[] = ['inherit', 'off', 'custom']

/**
 * The names a prompt can use. Main fills them in (`settings/pullRequestPrompts.ts`); the list is
 * repeated here only to be shown, and a test holds the two together.
 */
export const PULL_REQUEST_PROMPT_VARIABLES = ['url', 'number', 'title', 'branch', 'base'] as const

/** The names as they are written in a prompt. Not copy: the braces are the syntax. */
export const PULL_REQUEST_PROMPT_VARIABLE_TEXT = PULL_REQUEST_PROMPT_VARIABLES.map((name) => `{{${name}}}`).join('  ')

/** The three states in the order they are shown, with the fields each one reads and writes. */
export const PULL_REQUEST_PROMPT_KINDS = [
  { kind: 'failure', prompt: 'pullRequestFailurePrompt', enabled: 'pullRequestFailureEnabled' },
  { kind: 'pending', prompt: 'pullRequestPendingPrompt', enabled: 'pullRequestPendingEnabled' },
  { kind: 'conflict', prompt: 'pullRequestConflictPrompt', enabled: 'pullRequestConflictEnabled' }
] as const
