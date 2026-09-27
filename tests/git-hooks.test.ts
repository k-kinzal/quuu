import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

const source = resolve(import.meta.dirname, '..')
// Assemble a synthetic token at runtime so the test source contains no credential.
const token = ['ghp', 'K8n2Zq4Wd9Fs6Ha3Jv7Bc5Mx1Rp0Ty8Lu2Ea'].join('_')
const secret = `github_token = "${token}"\n`
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|GITLEAKS_)/.test(key))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Hook Test',
  GIT_AUTHOR_EMAIL: 'hooks@example.invalid',
  GIT_COMMITTER_NAME: 'Hook Test',
  GIT_COMMITTER_EMAIL: 'hooks@example.invalid'
}
let directory: string
let repo: string
let remote: string

function run(command: string, args: string[], options: { input?: string; path?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: repo,
    env: { ...env, ...(options.path ? { PATH: options.path } : {}) },
    input: options.input,
    encoding: 'utf8',
    timeout: 20_000
  })
  if (result.error) throw result.error
  return { status: result.status, output: result.stdout + result.stderr }
}

function git(...args: string[]) {
  const result = run('git', args)
  expect(result.status, result.output).toBe(0)
  return result.output.trim()
}

function write(name: string, contents: string) {
  writeFileSync(join(repo, name), contents)
}

function stage(contents: string) {
  write('credentials.txt', contents)
  git('add', 'credentials.txt')
}

function commit(contents = 'safe\n') {
  stage(contents)
  git('commit', '-m', 'Update fixture')
}

function uncheckedCommit(contents: string) {
  stage(contents)
  // Only the disposable fixture bypasses hooks, to model pre-existing leaked history.
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Fixture history')
}

function expectBlocked(result: ReturnType<typeof run>) {
  expect(result.status).not.toBe(0)
  expect(result.output).toContain('Secret scan blocked')
  expect(result.output).not.toContain(token)
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'quuu-git-hooks-'))
  repo = join(directory, 'checkout with spaces')
  remote = join(directory, 'remote.git')
  mkdirSync(repo)
  git('init', '-b', 'main')
  git('init', '--bare', remote)
  git('remote', 'add', 'origin', remote)
  cpSync(join(source, '.githooks'), join(repo, '.githooks'), { recursive: true })
  cpSync(join(source, '.gitleaks.toml'), join(repo, '.gitleaks.toml'))
  mkdirSync(join(repo, 'scripts'))
  for (const script of ['install-git-hooks.sh', 'scan-secrets.sh']) {
    cpSync(join(source, 'scripts', script), join(repo, 'scripts', script))
  }
  const installed = run('sh', ['scripts/install-git-hooks.sh'])
  expect(installed.status, installed.output).toBe(0)
})

afterEach(() => rmSync(directory, { recursive: true, force: true }))

it('blocks a secret in the first commit and redacts diagnostics', () => {
  stage(secret)
  expectBlocked(run('git', ['commit', '-m', 'Should be blocked']))
  expect(run('git', ['rev-parse', '--verify', 'HEAD']).status).not.toBe(0)
})

it('scans the index even when the working copy has already removed the secret', () => {
  commit()
  stage(secret)
  write('credentials.txt', 'safe again\n')
  expectBlocked(run('git', ['commit', '-m', 'Should be blocked']))
})

it('allows clean staged changes without including an unstaged secret', () => {
  stage('safe\n')
  write('credentials.txt', secret)
  git('commit', '-m', 'Clean staged content')
  expect(git('show', 'HEAD:credentials.txt')).toBe('safe')
})

it('allows clean first pushes, updates, annotated tags and ref deletions', () => {
  commit()
  git('push', 'origin', 'main')
  commit('still safe\n')
  git('tag', '-a', 'release-test', '-m', 'Clean tag')
  git('push', 'origin', 'main', 'refs/tags/release-test')
  git('push', 'origin', '--delete', 'release-test')
})

it('blocks a secret added and later deleted before pushing an existing branch', () => {
  commit()
  git('push', 'origin', 'main')
  const previous = git('rev-parse', 'HEAD')
  uncheckedCommit(secret)
  commit('removed\n')
  expectBlocked(run('git', ['push', 'origin', 'main']))
  expect(git('--git-dir', remote, 'rev-parse', 'refs/heads/main')).toBe(previous)
})

it('scans all history for new refs, including tags and pushes by URL', () => {
  uncheckedCommit(secret)
  commit('removed\n')
  git('tag', '-a', 'release-test', '-m', 'Tag with unsafe history')
  for (const ref of ['main', 'refs/tags/release-test']) {
    expectBlocked(run('git', ['push', remote, ref]))
  }
  expect(git('--git-dir', remote, 'for-each-ref').length).toBe(0)
})

it('checks every ref in a push and rejects the whole push when one contains a secret', () => {
  commit()
  git('push', 'origin', 'main')
  const previous = git('rev-parse', 'HEAD')
  git('checkout', '-b', 'unsafe')
  uncheckedCommit(secret)
  git('checkout', 'main')
  commit('safe update\n')
  expectBlocked(run('git', ['push', 'origin', 'main', 'unsafe']))
  expect(git('--git-dir', remote, 'rev-parse', 'main')).toBe(previous)
})

it('checks commits introduced by a forced update', () => {
  commit()
  const base = git('rev-parse', 'HEAD')
  commit('remote history\n')
  git('push', 'origin', 'main')
  git('checkout', '-b', 'replacement', base)
  uncheckedCommit(secret)
  expectBlocked(run('git', ['push', '--force', 'origin', 'replacement:main']))
})

it('scans merge results that introduce a secret only in the merge commit', () => {
  commit()
  git('push', 'origin', 'main')
  git('checkout', '-b', 'side')
  write('side.txt', 'side\n')
  git('add', 'side.txt')
  git('commit', '-m', 'Side change')
  git('checkout', 'main')
  commit('main change\n')
  git('merge', '--no-commit', '--no-ff', 'side')
  uncheckedCommit(secret)
  expectBlocked(run('git', ['push', 'origin', 'main']))
})

it('scans the entire history when the remote tip is unavailable locally', () => {
  uncheckedCommit(secret)
  commit('removed\n')
  const tip = git('rev-parse', 'HEAD')
  expectBlocked(run('sh', ['.githooks/pre-push'], {
    input: `refs/heads/main ${tip} refs/heads/main ${'1'.repeat(40)}\n`
  }))
})

it('blocks commits and pushes on scanner errors while allowing ref deletions', () => {
  commit()
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'gitleaks'), '#!/bin/sh\nexit 127\n', { mode: 0o755 })
  const path = `${bin}:${process.env.PATH}`
  stage('clean update\n')
  expectBlocked(run('git', ['commit', '-m', 'Scanner unavailable'], { path }))
  expectBlocked(run('git', ['push', 'origin', 'main'], { path }))
  const deletion = run('sh', ['.githooks/pre-push'], {
    path,
    input: `(delete) ${'0'.repeat(40)} refs/heads/old ${git('rev-parse', 'HEAD')}\n`
  })
  expect(deletion.status, deletion.output).toBe(0)
})

it('installs idempotently and preserves existing custom hooks', () => {
  expect(run('sh', ['scripts/install-git-hooks.sh']).status).toBe(0)
  expect(git('config', '--local', '--get', 'core.hooksPath')).toBe('.githooks')
  git('config', '--local', 'core.hooksPath', 'custom-hooks')
  expect(run('sh', ['scripts/install-git-hooks.sh']).status).not.toBe(0)
  expect(git('config', '--local', '--get', 'core.hooksPath')).toBe('custom-hooks')
  git('config', '--local', '--unset', 'core.hooksPath')
  writeFileSync(join(repo, '.git/hooks/post-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  expect(run('sh', ['scripts/install-git-hooks.sh']).status).not.toBe(0)
})
