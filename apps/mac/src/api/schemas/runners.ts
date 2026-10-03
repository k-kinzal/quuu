import { z } from 'zod'

export const RunnerLabelsSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).array().max(32)

/** Every agent a Runner can be signed in to, through the same Quuu sign-in. */
export const RunnerLoginAgentSchema = z.enum(['codex', 'claude', 'cursor-agent'])
export const RunnerSignInInputSchema = z.object({ runnerId: z.string(), agent: RunnerLoginAgentSchema }).strict()
export const RunnerConfigSchema = z.object({ enabled: z.boolean(), port: z.number().int().min(0).max(65535) }).strict()
export const RunnerStatusSchema = z.object({
  enabled: z.boolean(), port: z.number(), listening: z.boolean(), fingerprint: z.string(), error: z.string(), urls: z.string().array(),
  runners: z.object({ id: z.string(), name: z.string(), agents: z.object({ name: z.string(), command: z.string(), version: z.string(),
    /** Provider-confirmed sign-in, missing/rejected credentials, or an unverified older login. */
    auth: z.enum(['signedIn', 'missing', 'unknown', 'expired', 'unverified']) }).array(),
    login: z.object({ agent: RunnerLoginAgentSchema, state: z.enum(['waiting', 'delivering', 'failed']), error: z.string() }).optional(),
    labels: RunnerLabelsSchema.optional(),
    capacity: z.number(), root: z.string(), lastSeen: z.string(), revoked: z.boolean(), online: z.boolean(), active: z.number() }).array()
})
export const RunnerPairingSchema = z.object({ pin: z.string(), expiresAt: z.string(), fingerprint: z.string(), urls: z.string().array(), command: z.string() })
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>
export type RunnerPairing = z.infer<typeof RunnerPairingSchema>
