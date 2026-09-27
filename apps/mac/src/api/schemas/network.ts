import { z } from 'zod'

const PortSchema = z.number().int().min(1).max(65535)

/** A Quuu on the network, as far as this one has heard of it: `address` is `host:port`. */
export const NetworkPeerSchema = z.object({ id: z.string(), name: z.string(), address: z.string() })
export type NetworkPeer = z.infer<typeof NetworkPeerSchema>

/**
 * This Quuu as a host: other computers on the network show and change its tasks through the
 * same operations as its own window. Only computers paired with a code shown here get in.
 */
export const NetworkHostSchema = z.object({
  enabled: z.boolean(),
  port: PortSchema,
  name: z.string(),
  /** Where the other computers reach it. Empty while it is not listening. */
  addresses: z.string().array(),
  error: z.string().nullable(),
  /** The code a computer being paired enters, while pairing is open. */
  pairing: z.object({ code: z.string(), expiresAt: z.string() }).nullable(),
  devices: z.object({ id: z.string(), name: z.string(), pairedAt: z.string() }).array()
})
export type NetworkHost = z.infer<typeof NetworkHostSchema>

/**
 * This Quuu as a satellite of a host. While the host answers, the window shows and changes the
 * host's data; when it goes away, the window falls back to this computer's own.
 */
export const NetworkSatelliteSchema = z.object({
  enabled: z.boolean(),
  host: NetworkPeerSchema.nullable(),
  state: z.enum(['off', 'unpaired', 'searching', 'connected']),
  error: z.string().nullable(),
  /** Hosts announcing themselves on this network right now. */
  discovered: NetworkPeerSchema.array()
})
export type NetworkSatellite = z.infer<typeof NetworkSatelliteSchema>

export const NetworkStatusSchema = z.object({ host: NetworkHostSchema, satellite: NetworkSatelliteSchema })
export type NetworkStatus = z.infer<typeof NetworkStatusSchema>

/** A computer is either a host or a satellite: turning one on turns the other off. */
export const NetworkConfigSchema = z.object({
  hostEnabled: z.boolean(),
  hostPort: PortSchema,
  satelliteEnabled: z.boolean()
}).partial()
export type NetworkConfig = z.infer<typeof NetworkConfigSchema>

export const NetworkPairSchema = z.object({
  /** `host:port` of the host, as discovered or typed. */
  address: z.string().min(1),
  code: z.string().regex(/^\d{6}$/)
})
export type NetworkPair = z.infer<typeof NetworkPairSchema>
