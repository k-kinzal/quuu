import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { userDataDir } from '../appPaths.js'
import { t } from '../i18n/index.js'

/**
 * Whether this computer exports OpenTelemetry, and where to, as `app.setTelemetry` saved it.
 *
 * **Off unless someone turns it on.** An `OTEL_EXPORTER_OTLP_ENDPOINT` left in a shell is not a
 * request to send this app's history anywhere, so only the saved choice or `QUUU_OTEL=1` opt in;
 * `QUUU_OTEL=0` and `OTEL_SDK_DISABLED=true` always win. An empty endpoint leaves it to the
 * standard `OTEL_EXPORTER_OTLP_*` variables, which the exporters read themselves.
 *
 * Kept in `telemetry.json`, not the app settings: a satellite's window reads those from its host,
 * and what this computer sends where is this computer's own choice (like `network.json`).
 */
export interface TelemetrySettings {
  enabled: boolean
  /** OTLP/HTTP base URL (`http://host:4318`). */
  endpoint: string
  /** Sent with every export (an auth token). Never read back out through an operation. */
  headers: Record<string, string>
  /** Extra resource attributes, e.g. to tell two Macs apart. */
  resourceAttributes: Record<string, string>
}

/** The settings with the environment applied: what the app actually runs with. */
export type TelemetryConfig = TelemetrySettings

/** The environment variable deciding instead of the saved choice, if any. */
export type TelemetryOverride = 'QUUU_OTEL' | 'OTEL_SDK_DISABLED' | null

export type TelemetryPatch = Partial<TelemetrySettings>

/** What identifies this build, read by the composition that knows it. */
export interface TelemetryBuild {
  version: string
  packaged: boolean
}

export function telemetryConfigPath(): string {
  return join(userDataDir(), 'telemetry.json')
}

export function telemetryOverride(env: NodeJS.ProcessEnv = process.env): { override: TelemetryOverride; enabled: boolean | null } {
  if (env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true') return { override: 'OTEL_SDK_DISABLED', enabled: false }
  const flag = env.QUUU_OTEL?.trim().toLowerCase()
  if (!flag) return { override: null, enabled: null }
  return { override: 'QUUU_OTEL', enabled: ['1', 'true', 'on', 'yes'].includes(flag) }
}

export function readTelemetryConfig(env: NodeJS.ProcessEnv = process.env, path = telemetryConfigPath()): TelemetryConfig {
  const settings = readTelemetrySettings(path)
  return { ...settings, enabled: telemetryOverride(env).enabled ?? settings.enabled }
}

export function readTelemetrySettings(path = telemetryConfigPath()): TelemetrySettings {
  const file = readFile(path)
  return {
    enabled: file.enabled === true,
    endpoint: typeof file.endpoint === 'string' ? normalizeEndpoint(file.endpoint) : '',
    headers: strings(file.headers),
    resourceAttributes: strings(file.resourceAttributes)
  }
}

/** Save only what the patch names. Private (0600): the headers may carry a token. */
export function saveTelemetrySettings(patch: TelemetryPatch, path = telemetryConfigPath()): TelemetrySettings {
  const endpoint = patch.endpoint === undefined ? undefined : normalizeEndpoint(patch.endpoint)
  if (endpoint && !isHttpUrl(endpoint)) throw new Error(t('telemetry.badEndpoint'))
  const next: TelemetrySettings = {
    ...readTelemetrySettings(path),
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    ...(endpoint === undefined ? {} : { endpoint })
  }
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
  return next
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function readFile(path: string): Record<string, unknown> {
  let text: string
  try { text = readFileSync(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Cannot read telemetry settings:', error)
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch { /* reported below */ }
  console.warn(`Ignoring telemetry settings that are not a JSON object: ${path}`)
  return {}
}

function strings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
