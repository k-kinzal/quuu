import { z } from 'zod'

/**
 * What a window tells main about its use, for OpenTelemetry. Not an operation: nothing answers,
 * remote callers have no screen to report, and when telemetry is off main drops it unread.
 *
 * Screens are named by their place (`project/dashboard/task`), never by what they show.
 */
export const RendererTelemetrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('screen'),
    screen: z.string().max(120),
    previous: z.string().max(120).nullable(),
    /** How long the previous screen was on show. */
    previousDurationMs: z.number().int().nonnegative().nullable(),
    projectId: z.string().max(64).optional(),
    taskId: z.string().max(64).optional()
  }).strict(),
  z.object({
    kind: z.literal('action'),
    /** A UI-only change no operation records (`table.sort`, `layout`, `palette.open`). */
    action: z.string().max(80),
    fields: z.array(z.string().max(80)).max(40).optional(),
    screen: z.string().max(120).optional()
  }).strict(),
  z.object({
    kind: z.literal('error'),
    origin: z.enum(['uncaught', 'unhandled_rejection', 'render']),
    type: z.string().max(200),
    message: z.string().max(4000),
    stack: z.string().max(16_000).optional(),
    componentStack: z.string().max(16_000).optional(),
    screen: z.string().max(120).optional()
  }).strict()
])
export type RendererTelemetry = z.infer<typeof RendererTelemetrySchema>

/** The preload bridge. Fire and forget. */
export interface QuuuTelemetry {
  record(event: RendererTelemetry): void
}
