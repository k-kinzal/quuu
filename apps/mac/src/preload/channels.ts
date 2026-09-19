/** Connection for the MessagePort handed over by the renderer. Operation paths are handled by oRPC from the contract. */
export const RPC_CONNECT = 'quuu:rpc:connect'
export const RPC_CLIENT = 'quuu:rpc:client'

/** Push channels from main to renderer. */
export const EVENTS = {
  snapshot: 'quuu:evt:snapshot',
  sessionAppended: 'quuu:evt:sessionAppended',
  schedulerStatus: 'quuu:evt:schedulerStatus',
  toast: 'quuu:evt:toast',
  /** Commands from the native menu / tray / notifications. */
  command: 'quuu:evt:command',
  terminal: 'quuu:evt:terminal'
} as const
