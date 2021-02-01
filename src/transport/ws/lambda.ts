import { ApiGatewayManagementApi } from 'aws-sdk'
import type { APIGatewayEvent } from 'aws-lambda'
import type { Transport } from '../..'

export default function lambdaWSTransport(wsUrl: string): Transport<string> {
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

  const transport: Transport<string> = {
    async out(address, msg) {
      console.log('out', address, msg)
      await gateway
        .postToConnection({ ConnectionId: address, Data: msg })
        .promise()
    },
    async in(event: APIGatewayEvent) {
      const { eventType: type, connectionId: id } = event.requestContext
      console.log('got', type, id)
      if (!type || !id) return
      if (type === 'CONNECT') return await onEvent('connect', id)
      if (type === 'DISCONNECT') return await onEvent('disconnect', id)
      if (type === 'MESSAGE' && event.body) {
        console.log('in:', id, event.body)
        if (typeof transport.onInput !== 'function')
          throw Error('no transport input handler registered')
        await transport.onInput(event.body, id)
      }
    },
  }

  return transport
}

const rpcEvents = ['connect', 'disconnect'] as const
type RPCEvent = typeof rpcEvents[number]
type EventHandler<T extends RPCEvent> = (...args: EventArgs<T>) => void
type EventArgs<T extends RPCEvent> = T extends 'connect' | 'disconnect'
  ? [connectionId: string]
  : never
