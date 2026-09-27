import type { AppSettings } from './types.js'

/**
 * How a project decides what its tasks are told about their Pull Request.
 *   inherit … the app's prompts (default)
 *   off     … never send this project's tasks back over a Pull Request
 *   custom  … this project's own prompts
 */
export type PullRequestPromptMode = 'inherit' | 'off' | 'custom'

export const PULL_REQUEST_PROMPT_MODES: PullRequestPromptMode[] = ['inherit', 'off', 'custom']

/** The states of a Pull Request a task can be sent back over, and what is said for each. Empty sends nothing. */
export interface PullRequestPrompts {
  failure: string
  pending: string
  conflict: string
}

export type PullRequestPromptSource = Pick<AppSettings,
  | 'pullRequestFailurePrompt' | 'pullRequestPendingPrompt' | 'pullRequestConflictPrompt'
  | 'pullRequestFailureEnabled' | 'pullRequestPendingEnabled' | 'pullRequestConflictEnabled'>

const EMPTY: PullRequestPrompts = { failure: '', pending: '', conflict: '' }

/** A prompt that is switched off, or has nothing written, sends nothing. */
function prompts(source: PullRequestPromptSource): PullRequestPrompts {
  const pick = (enabled: boolean, text: string): string => enabled && text.trim().length > 0 ? text : ''
  return {
    failure: pick(source.pullRequestFailureEnabled, source.pullRequestFailurePrompt),
    pending: pick(source.pullRequestPendingEnabled, source.pullRequestPendingPrompt),
    conflict: pick(source.pullRequestConflictEnabled, source.pullRequestConflictPrompt)
  }
}

/** The prompts that apply to one project: its own, the app's, or none. */
export function resolvePullRequestPrompts(
  settings: PullRequestPromptSource,
  project: PullRequestPromptSource & { pullRequestPromptMode: PullRequestPromptMode }
): PullRequestPrompts {
  if (project.pullRequestPromptMode === 'off') return EMPTY
  if (project.pullRequestPromptMode === 'custom') return prompts(project)
  return prompts(settings)
}

/** Whether any state would send this project's tasks back at all. */
export function hasPullRequestPrompt(prompts: PullRequestPrompts): boolean {
  return Boolean(prompts.failure || prompts.pending || prompts.conflict)
}

/** What a prompt may name about the Pull Requests it is sent over. */
export interface PullRequestFacts {
  url: string
  number: number
  title: string
  headRefName: string
  baseRefName: string
}

/**
 * The names a prompt can use, written `{{url}}` (spaces inside the braces are fine). Several Pull
 * Requests in the same state are listed one per line. This list is also what the settings show.
 */
export const PULL_REQUEST_PROMPT_VARIABLES = {
  url: (pr: PullRequestFacts) => pr.url,
  number: (pr: PullRequestFacts) => String(pr.number),
  title: (pr: PullRequestFacts) => pr.title,
  branch: (pr: PullRequestFacts) => pr.headRefName,
  base: (pr: PullRequestFacts) => pr.baseRefName
} satisfies Record<string, (pr: PullRequestFacts) => string>

type Variable = keyof typeof PULL_REQUEST_PROMPT_VARIABLES

function isVariable(name: string): name is Variable {
  return Object.hasOwn(PULL_REQUEST_PROMPT_VARIABLES, name)
}

/**
 * The prompt exactly as written, with only the known names filled in.
 *
 * Nothing is added around it: the person wrote what the agent should read. A name this does not
 * know is left as written - it may be text meant for the agent, and dropping it would change the
 * instruction without a trace.
 */
export function renderPullRequestPrompt(prompt: string, pullRequests: PullRequestFacts[]): string {
  return prompt.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (whole, name: string) =>
    isVariable(name) ? pullRequests.map(PULL_REQUEST_PROMPT_VARIABLES[name]).join('\n') : whole)
}
