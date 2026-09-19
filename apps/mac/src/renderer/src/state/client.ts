import { createORPCClient, safe } from '@orpc/client'
import { RPCLink, type SupportedMessagePort } from '@orpc/client/message-port'
import type { QuuuApi } from '../../../preload/api.js'

/** Only operations that surface errors at the input field set this. oRPC client context is not forwarded to main. */
export type QuuuClient = QuuuApi<{ feedback?: 'inline' }>

/** Production and the connection tests share the same client, serializer, and error revival. */
export function createQuuuClient(port: SupportedMessagePort, failed: (error: unknown, path: readonly string[], notify: boolean) => void): QuuuClient {
  return createORPCClient(new RPCLink<{ feedback?: 'inline' }>({
    port,
    interceptors: [async ({ next, path, context }) => {
      const [error, result] = await safe(next())
      if (error) {
        failed(error, path, context.feedback !== 'inline')
        throw error
      }
      // A business-rule refusal is also delivered as a reason the operation could not finish. Cancel is the user's own act.
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && !('canceled' in result && result.canceled)) {
        failed(result, path, context.feedback !== 'inline')
      }
      return result
    }]
  }))
}
