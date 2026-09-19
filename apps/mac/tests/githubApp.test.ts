import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import type { CreateAppResult } from '../src/main/ipc/types.js'
import { cancelGitHubApp, createGitHubApp } from '../src/main/platform/githubApp.js'
import type { GitHubAppFlowDeps } from '../src/main/platform/githubApp.js'
import { GITHUB_APP_SETUP_VERSION } from '../src/main/settings/commitIdentity.js'

/**
 * The flow that has the browser create a GitHub App (App Manifest).
 *
 * The GitHub side cannot be called, so **what we hand over** is what gets checked.
 * If the manifest and the return address (redirect_url) disagree, it fails as "nothing comes back"
 * after a human has pressed all the way through. Only whoever creates it walks this path, so it is pinned down here.
 */

/** Start a creation and receive the URL handed to the browser. */
async function start(
  deps: GitHubAppFlowDeps = {}
): Promise<{ url: string; done: Promise<CreateAppResult> }> {
  let resolveUrl: (u: string) => void = () => { }
  const opened = new Promise<string>((r) => {
    resolveUrl = r
  })
  const done = createGitHubApp(
    (u) => {
      resolveUrl(u)
      return Promise.resolve()
    },
    deps
  )
  return { url: await opened, done }
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Pull the POST target and the manifest out of the hand-off page. */
async function handoff(url: string): Promise<{ action: string; manifest: Record<string, unknown> }> {
  const html = await (await fetch(url)).text()
  const action = unescapeHtml(/action="([^"]*)"/.exec(html)![1])
  const raw = unescapeHtml(/name="manifest" value="([^"]*)"/.exec(html)![1])
  return { action, manifest: JSON.parse(raw) as Record<string, unknown> }
}

afterEach(() => cancelGitHubApp())

describe('creating a GitHub App', () => {
  it('points the return address in the manifest handed to GitHub at our own listener', async () => {
    const { url, done } = await start()
    const { action, manifest } = await handoff(url)

    expect(action.startsWith('https://github.com/settings/apps/new?state=')).toBe(true)
    // The return address is 127.0.0.1 on the port open right now (get it wrong and nothing comes back)
    expect(manifest.redirect_url).toBe(`${new URL(url).origin}/callback`)
    expect(String(manifest.setup_url)).toMatch(
      new RegExp(`^${new URL(url).origin}/installed\\?state=[0-9a-f]+$`)
    )
    expect(manifest.setup_on_update).toBe(true)

    // Hand over only the permissions needed to make commit / push / PR the same bot
    expect(manifest.default_permissions).toEqual({
      metadata: 'read',
      contents: 'write',
      pull_requests: 'write',
      workflows: 'write'
    })
    expect(manifest.public).toBe(false)
    expect(manifest.default_events).toEqual([])

    cancelGitHubApp()
    expect(await done).toEqual({ ok: false, reason: 'Canceled', canceled: true })
  })

  it('decides the App name on our side (nobody has to type it)', async () => {
    const { url, done } = await start()
    const { manifest } = await handoff(url)

    // The name is unique across GitHub, and the identity (the slug) follows from it
    expect(String(manifest.name)).toMatch(/^Quuu[0-9]{6}$/)

    cancelGitHubApp()
    await done
  })

  it('draws a fresh name every time (press again after a collision)', async () => {
    const names = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const { url, done } = await start()
      names.add(String((await handoff(url)).manifest.name))
      cancelGitHubApp()
      await done
    }
    expect(names.size).toBeGreaterThan(1)
  })

  it('does not accept a return whose signal (state) does not match', async () => {
    const { url, done } = await start()
    const res = await fetch(`${new URL(url).origin}/callback?code=abc&state=別のもの`)

    expect(res.status).toBe(400)
    expect(await done).toEqual({ ok: false, reason: 'The returned handshake did not match' })
  })

  it('does not run two creations at once (the earlier one is folded away)', async () => {
    const first = await start()
    const second = await start()

    expect(await first.done).toEqual({ ok: false, reason: 'Canceled', canceled: true })
    // Folding the earlier one away leaves the one started later alive
    expect((await handoff(second.url)).manifest.redirect_url).toBe(
      `${new URL(second.url).origin}/callback`
    )

    cancelGitHubApp()
    await second.done
  })

  it('folds the listener away on abort (never keep holding the port)', async () => {
    const { url, done } = await start()
    cancelGitHubApp()
    await done

    await expect(fetch(`${new URL(url).origin}/`)).rejects.toThrow()
  })

  it('completes the browser flow from creation through installation and saves only a verified key', async () => {
    const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const saved: Array<{ appId: string; pem: string }> = []
    const fetchImpl = githubFetch(pem, 123)
    const { url, done } = await start({
      fetchImpl,
      savePrivateKey: (appId, privateKey) => {
        saved.push({ appId, pem: privateKey })
        return Promise.resolve()
      }
    })
    const { action } = await handoff(url)
    const state = new URL(action).searchParams.get('state')!
    const origin = new URL(url).origin

    const callback = await fetch(`${origin}/callback?code=manifest-code&state=${state}`, {
      redirect: 'manual'
    })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(
      'https://github.com/apps/quuu-test/installations/new'
    )

    const installed = await fetch(`${origin}/installed?installation_id=456&state=${state}`)
    expect(installed.status).toBe(200)
    expect(await done).toEqual({
      ok: true,
      identity: {
        appSlug: 'quuu-test',
        botUserId: '999',
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION
      }
    })
    expect(saved).toEqual([{ appId: '123', pem }])
  })

  it('verifies the returned installation_id against the App itself and never saves it as the key of another App', async () => {
    const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const saved: string[] = []
    const { url, done } = await start({
      fetchImpl: githubFetch(pem, 999),
      savePrivateKey: (appId) => {
        saved.push(appId)
        return Promise.resolve()
      }
    })
    const { action } = await handoff(url)
    const state = new URL(action).searchParams.get('state')!
    const origin = new URL(url).origin

    await fetch(`${origin}/callback?code=manifest-code&state=${state}`, { redirect: 'manual' })
    const installed = await fetch(`${origin}/installed?installation_id=456&state=${state}`)

    expect(installed.status).toBe(502)
    expect(await done).toEqual({
      ok: false,
      reason: 'Could not confirm the installation of the created GitHub App'
    })
    expect(saved).toEqual([])
  })
})

/** A GitHub answering only the three APIs: manifest, installation and bot. */
function githubFetch(pem: string, installationAppId: number): typeof fetch {
  return (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/app-manifests/')) {
      return Promise.resolve(Response.json({ id: 123, slug: 'quuu-test', pem }))
    }
    if (url.endsWith('/app/installations/456')) {
      return Promise.resolve(
        Response.json({
          app_id: installationAppId,
          permissions: { contents: 'write', pull_requests: 'write', workflows: 'write' }
        })
      )
    }
    if (url.endsWith('/users/quuu-test%5Bbot%5D')) {
      return Promise.resolve(Response.json({ id: 999, type: 'Bot' }))
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  }
}
