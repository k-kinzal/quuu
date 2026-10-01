import { z } from 'zod'

export const RunnerLabelsSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).array().max(32)

export const RunnerTokenAgentSchema = z.enum(['claude', 'cursor-agent'])
export const RunnerLoginAgentSchema = z.enum(['codex'])
export const RunnerCredentialInputSchema = z.object({ agent: RunnerTokenAgentSchema, value: z.string().max(4096) }).strict()
export const RunnerSignInInputSchema = z.object({ runnerId: z.string(), agent: RunnerLoginAgentSchema }).strict()
export const RunnerConfigSchema = z.object({ enabled: z.boolean(), port: z.number().int().min(0).max(65535) }).strict()
export const RunnerStatusSchema = z.object({
  enabled: z.boolean(), port: z.number(), listening: z.boolean(), fingerprint: z.string(), error: z.string(), urls: z.string().array(),
  /** Tokens Quuu lends to Runner jobs. Only whether one is saved; never the value. */
  credentials: z.object({ agent: RunnerTokenAgentSchema, variable: z.string(), configured: z.boolean() }).array(),
  runners: z.object({ id: z.string(), name: z.string(), agents: z.object({ name: z.string(), command: z.string(), version: z.string(),
    /** quuu: a lent token · runner: the Runner's own login · missing: none · unknown: an older Runner */
    auth: z.enum(['quuu', 'runner', 'missing', 'unknown']) }).array(),
    login: z.object({ agent: RunnerLoginAgentSchema, state: z.enum(['waiting', 'delivering', 'failed']), url: z.string(), error: z.string() }).optional(),
    labels: RunnerLabelsSchema.optional(),
    capacity: z.number(), root: z.string(), lastSeen: z.string(), revoked: z.boolean(), online: z.boolean(), active: z.number() }).array()
})
export const RunnerPairingSchema = z.object({ pin: z.string(), expiresAt: z.string(), fingerprint: z.string(), urls: z.string().array(), command: z.string() })
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>
export type RunnerPairing = z.infer<typeof RunnerPairingSchema>
