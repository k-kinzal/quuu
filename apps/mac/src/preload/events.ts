import type { z } from 'zod'
import { CommandPayloadSchema, SessionAppendedPayloadSchema } from './api/desktop.js'
import { SchedulerStatusSchema } from './api/execution.js'
import { AppSnapshotSchema, ToastPayloadSchema } from './api/snapshot.js'
import { TerminalEventSchema } from './api/workbench.js'
import { EVENTS } from './channels.js'

/** Notifications, too, never declare separate types on the sending and subscribing sides. */
export const eventSchemas = {
  [EVENTS.snapshot]: AppSnapshotSchema,
  [EVENTS.sessionAppended]: SessionAppendedPayloadSchema,
  [EVENTS.schedulerStatus]: SchedulerStatusSchema,
  [EVENTS.toast]: ToastPayloadSchema,
  [EVENTS.command]: CommandPayloadSchema,
  [EVENTS.terminal]: TerminalEventSchema
}
export type EventPayloads = { [K in keyof typeof eventSchemas]: z.infer<typeof eventSchemas[K]> }
export type QuuuEvents = { [K in keyof typeof EVENTS]: (callback: (payload: EventPayloads[typeof EVENTS[K]]) => void) => () => void }
