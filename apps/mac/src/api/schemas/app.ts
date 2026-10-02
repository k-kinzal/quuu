import { z } from 'zod'

/**
 * Where the automatic updater is. `local` is a build that never updates itself (a checkout's
 * `npm run dist`, a development launch); the rest are the updater's own states.
 */
export const UpdateStateSchema = z.enum(['local', 'starting', 'unsigned', 'idle', 'checking', 'downloading', 'ready'])
export type UpdateState = z.infer<typeof UpdateStateSchema>

/** What the app menu and Help menu know about the running Quuu, for callers without a window. */
export const AppInfoSchema = z.object({
  version: z.string(),
  /** Where the database, run logs, reports and worktrees live. */
  dataDirectory: z.string(),
  updates: UpdateStateSchema
})
export type AppInfo = z.infer<typeof AppInfoSchema>

/**
 * Whether this computer exports OpenTelemetry (docs/telemetry.md). Answered by the computer that
 * receives it, even from a satellite's window: what it sends where is its own choice.
 */
export const TelemetryStatusSchema = z.object({
  enabled: z.boolean(),
  /** OTLP/HTTP base URL. Empty leaves it to `OTEL_EXPORTER_OTLP_ENDPOINT`. */
  endpoint: z.string(),
  /** Only the names; a value may be a token. */
  headerNames: z.array(z.string()),
  resourceAttributes: z.record(z.string(), z.string()),
  /** An environment variable deciding instead of `enabled`. */
  override: z.enum(['QUUU_OTEL', 'OTEL_SDK_DISABLED']).nullable(),
  /** Exporting right now. */
  active: z.boolean(),
  /** Each signal's latest export since export last started: whether the collector took it. */
  lastExports: z.array(z.object({
    signal: z.enum(['traces', 'metrics', 'logs']),
    at: z.string(),
    ok: z.boolean(),
    error: z.string().nullable()
  }))
})
export type TelemetryStatus = z.infer<typeof TelemetryStatusSchema>

/** Only the named fields change, and a change applies at once. */
export const TelemetryPatchSchema = z.object({
  enabled: z.boolean().optional(),
  endpoint: z.string().max(2048).optional(),
  /** Replaces every header. */
  headers: z.record(z.string(), z.string()).optional(),
  /** Replaces every extra resource attribute. */
  resourceAttributes: z.record(z.string(), z.string()).optional()
}).strict()

