import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDataDir } from '../appPaths.js'

/**
 * Whether Quuu exports OpenTelemetry, and where to.
 *
 * **Off unless someone turns it on.** An `OTEL_EXPORTER_OTLP_ENDPOINT` left in a shell is not a
 * request to send this app's history anywhere, so only `telemetry.json` (`enabled: true`) or
 * `QUUU_OTEL=1` opt in; `QUUU_OTEL=0` and `OTEL_SDK_DISABLED=true` always win. The endpoint and
 * headers may come from the file or from the standard `OTEL_EXPORTER_OTLP_*` variables, which the
 * exporters read themselves.
 */
export interface TelemetryConfig {
  enabled: boolean
  /** OTLP/HTTP base URL (`http://host:4318`). Empty leaves it to `OTEL_EXPORTER_OTLP_ENDPOINT`. */
  endpoint: string
  headers: Record<string, string>
  /** Extra resource attributes, e.g. to tell two Macs apart. */
  resourceAttributes: Record<string, string>
}

/** What identifies this build, read by the composition that knows it. */
export interface TelemetryBuild {
  version: string
  packaged: boolean
}

export function telemetryConfigPath(): string {
  return join(userDataDir(), 'telemetry.json')
}

export function readTelemetryConfig(env: NodeJS.ProcessEnv = process.env, path = telemetryConfigPath()): TelemetryConfig {
  const file = readFile(path)
  const flag = env.QUUU_OTEL?.trim().toLowerCase()
  const forced = flag === undefined || flag === '' ? null : ['1', 'true', 'on', 'yes'].includes(flag)
  const disabled = env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true'
  return {
    enabled: !disabled && (forced ?? file.enabled === true),
    endpoint: typeof file.endpoint === 'string' ? file.endpoint.trim().replace(/\/+$/, '') : '',
    headers: strings(file.headers),
    resourceAttributes: strings(file.resourceAttributes)
  }
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
