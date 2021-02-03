import type { Transport } from '../..'
import type Endpoint from '../..'
import type Connection from '../../connection'
import type { Schema } from '../../types'

type WsTransport = Transport<string> & {
  connect<T extends Schema>(endpoint: Endpoint<any>): Connection<T>
}

export default function browserWSTransport(endpoint: string): WsTransport {
  const ws = new WebSocket(endpoint)
  const queue: string[] = []

  let handleOut = (msg: string) => void queue.push(msg)

  const transport: WsTransport = {
    out: (addr, msg) => {
      if (addr !== endpoint)
        throw Error(
          `Invalid endpoint ${addr}, must be ${endpoint} for this transport.`
        )
      handleOut(msg)
    },
    in: msg => {
      if (typeof transport.onInput !== 'function')
        throw Error('no input handler defined')
      transport.onInput(msg, endpoint)
    },
    connect(rpc) {
      rpc.addTransport(transport)
      return rpc.addConnection(endpoint, transport)
    },
  }

  ws.onopen = () => {
    handleOut = msg => void ws.send(msg)
    queue.forEach(msg => ws.send(msg))
  }

  ws.onmessage = ({ data }) => {
    transport.in(data)
  }

  return transport
}
