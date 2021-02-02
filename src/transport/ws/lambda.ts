import { ApiGatewayManagementApi } from 'aws-sdk'
import type { APIGatewayEvent } from 'aws-lambda'
import type { Transport } from '../..'

type WsTransport = Transport<string> & {
  on<T extends RPCEvent>(name: T, handler: EventHandler<T>): Unsubscribe
}
type Unsubscribe = () => void

export default function lambdaWSTransport(wsUrl: string): WsTransport {
  const gateway = new ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: wsUrl,
  })

  const listeners: { [K in RPCEvent]?: EventHandler<K>[] } = {}

  const onEvent = async <T extends RPCEvent>(
    name: T,
    ...args: EventArgs<T>
  ) => {
    await Promise.all(
      listeners[name]?.map((handler: any) => handler(...args)) as any
    )
  }

  const transport: WsTransport = {
    async out(address, msg) {
      await gateway
        .postToConnection({ ConnectionId: address, Data: msg })
        .promise()
    },
    async in(event: APIGatewayEvent) {
      const { eventType: type, connectionId: id } = event.requestContext
      if (!type || !id) return
      if (type === 'CONNECT') return await onEvent('connect', id)
      if (type === 'DISCONNECT') return await onEvent('disconnect', id)
      if (type === 'MESSAGE' && event.body) {
        if (typeof transport.onInput !== 'function')
          throw Error('no transport input handler registered')
        await transport.onInput(event.body, id)
      }
    },
    on(name, handler) {
      if (!(name in listeners)) listeners[name] = []
      listeners[name]!.push(handler as any)
      return () => {
        listeners[name] = listeners[name]!.filter(f => f !== handler)
      }
    },
  }

  return transport
}

const rpcEvents = ['connect', 'disconnect'] as const
type RPCEvent = typeof rpcEvents[number]
type EventHandler<T extends RPCEvent> = (
  ...args: EventArgs<T>
) => void | Promise<void>
type EventArgs<T extends RPCEvent> = T extends 'connect' | 'disconnect'
  ? [connectionId: string]
  : never
