import { z } from 'zod'

export const RunnerConfigSchema = z.object({ enabled: z.boolean(), port: z.number().int().min(0).max(65535) }).strict()
export const RunnerStatusSchema = z.object({
  enabled: z.boolean(), port: z.number(), listening: z.boolean(), fingerprint: z.string(), error: z.string(), urls: z.string().array(),
  runners: z.object({ id: z.string(), name: z.string(), agents: z.object({ name: z.string(), command: z.string(), version: z.string() }).array(),
    capacity: z.number(), root: z.string(), lastSeen: z.string(), revoked: z.boolean(), online: z.boolean(), active: z.number() }).array()
})
export const RunnerPairingSchema = z.object({ pin: z.string(), expiresAt: z.string(), fingerprint: z.string(), urls: z.string().array() })
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>
export type RunnerPairing = z.infer<typeof RunnerPairingSchema>
