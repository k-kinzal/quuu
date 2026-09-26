import type { PullRequestPromptMode } from '../../../preload/api/settings.js'
export type { PullRequestPromptMode } from '../../../preload/api/settings.js'

/**
 * How a project decides what its tasks are told about their Pull Request.
 *   inherit … the app's prompts (default)
 *   off     … never send this project's tasks back over a Pull Request
 *   custom  … this project's own prompts
 */
export const PULL_REQUEST_PROMPT_MODES: PullRequestPromptMode[] = ['inherit', 'off', 'custom']
