import type { RPCError } from './types'

export const errors = {
  // JSON-RPC
  parse: { code: -32700, message: 'Parse error' },
  request: { code: -32600, message: 'Invalid request' },
  method: { code: -32601, message: 'Method not found' },
  params: { code: -32602, message: 'Invalid params' },
  internal: { code: -32603, message: 'Internal error' },
  // custom
  notification: { code: -32001, message: 'Invalid notification id' },
} as const

export default (key: keyof typeof errors, data?: any): RPCError => {
  if (!(key in errors)) throw Error(`unknown error key "${key}"`)
  return { ...errors[key], ...(data && { data }) }
}
