import type { APIGatewayEvent } from 'aws-lambda'
import type createServer from '../server'
import type { Channel } from '../server'
import { ApiGatewayManagementApi } from 'aws-sdk'

const rpcEvents = ['connect', 'disconnect'] as const
type RPCEvent = typeof rpcEvents[number]
type EventHandler<T extends RPCEvent> = (...args: EventArgs<T>) => void
type EventArgs<T extends RPCEvent> = T extends 'connect' | 'disconnect'
  ? [connectionId: string]
  : never

export default (server: ReturnType<typeof createServer>, endpoint: string) => {
  if (!endpoint) throw Error('websocket endpoint url missing')
  const listeners: { [K in RPCEvent]?: EventHandler<K>[] } = {}
  const channels: Record<string, Channel<any>> = {}

  const gateway = new ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint,
  })

  const getChannel = (id: string) => {
    if (id in channels) return channels[id]
    const channel = server.createChannel()
    channel.out = async response => {
      await gateway
        .postToConnection({
          ConnectionId: id,
          Data: JSON.stringify(response),
        })
        .promise()
    }
    return (channels[id] = channel)
  }

  const onEvent = <T extends RPCEvent>(name: T, ...args: EventArgs<T>) => {
    listeners[name]?.forEach((handler: any) => handler(...args))
  }

  const input = async (event: APIGatewayEvent) => {
    const { eventType: type, connectionId: id } = event.requestContext
    if (!type || !id) return

    if (type === 'CONNECT') return onEvent('connect', id)
    if (type === 'DISCONNECT') return onEvent('disconnect', id)
    if (type === 'MESSAGE' && event.body) await getChannel(id).inStr(event.body)
  }

  const on = <T extends RPCEvent>(event: T, handler: EventHandler<T>) => {
    if (!rpcEvents.includes(event))
      throw Error(`unknown rpc event type "${event}"`)
    if (!(event in listeners)) listeners[event] = []
    listeners[event]!.push(handler as any)
    return () =>
      (listeners[event] = listeners[event]!.filter(f => f !== handler))
  }

  return { in: input, on }
}
