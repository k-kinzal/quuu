import { expect, it } from 'vitest'
import { PULL_REQUEST_PROMPT_VARIABLES, renderPullRequestPrompt, resolvePullRequestPrompts } from '../src/main/settings/pullRequestPrompts.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { PULL_REQUEST_PROMPT_VARIABLES as SHOWN } from '../src/renderer/src/model/pullRequestPrompts.js'

const pr = (number: number) => ({ url: `https://github.com/o/r/pull/${String(number)}`, number, title: `T${String(number)}`, headRefName: `f${String(number)}`, baseRefName: 'main' })

/** The person's words go out untouched: no URL added, no whitespace trimmed, unknown names kept. */
it('sends the prompt verbatim with only known names filled in', () => {
  expect(renderPullRequestPrompt('  Fix the CI.\n', [pr(1)])).toBe('  Fix the CI.\n')
  expect(renderPullRequestPrompt('{{url}}|{{ number }}|{{title}}|{{branch}}|{{base}}|{{other}}|{url}', [pr(1)]))
    .toBe('https://github.com/o/r/pull/1|1|T1|f1|main|{{other}}|{url}')
  expect(renderPullRequestPrompt('See:\n{{url}}', [pr(1), pr(2)])).toBe('See:\nhttps://github.com/o/r/pull/1\nhttps://github.com/o/r/pull/2')
})

it('resolves only switched-on prompts with text, from the app or the project', () => {
  const settings = { ...DEFAULT_SETTINGS, pullRequestFailurePrompt: 'app fail', pullRequestFailureEnabled: true,
    pullRequestPendingPrompt: 'app pending', pullRequestPendingEnabled: false, pullRequestConflictPrompt: '   ', pullRequestConflictEnabled: true }
  const project = { pullRequestPromptMode: 'inherit' as const, pullRequestFailurePrompt: 'own', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '',
    pullRequestFailureEnabled: true, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false }
  expect(resolvePullRequestPrompts(settings, project)).toEqual({ failure: 'app fail', pending: '', conflict: '' })
  expect(resolvePullRequestPrompts(settings, { ...project, pullRequestPromptMode: 'custom' })).toEqual({ failure: 'own', pending: '', conflict: '' })
  expect(resolvePullRequestPrompts(settings, { ...project, pullRequestPromptMode: 'off' })).toEqual({ failure: '', pending: '', conflict: '' })
})

it('shows in settings exactly the names main fills in', () => {
  expect([...SHOWN].sort()).toEqual(Object.keys(PULL_REQUEST_PROMPT_VARIABLES).sort())
})
