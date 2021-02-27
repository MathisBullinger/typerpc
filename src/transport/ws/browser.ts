import type { Transport } from '../..'
import type Endpoint from '../..'
import type Connection from '../../connection'
import type { Schema } from '../../types'

type WsTransport = Transport<string> & {
  connect<T extends Schema>(endpoint: Endpoint<any>): Connection<T>
}

export default function browserWSTransport(endpoint: string): WsTransport {
  let ws: WebSocket
  let queue: string[] = []
  const bufferMsg = (msg: string) => void queue.push(msg)
  let handleOut: (msg: string) => void = bufferMsg

  const connect = () => {
    ws = new WebSocket(endpoint)

    ws.onopen = () => {
      handleOut = msg => ws.send(msg)
      queue.forEach(msg => ws.send(msg))
      queue = []
    }

    ws.onclose = () => {
      handleOut = bufferMsg
      connect()
    }

    ws.onmessage = ({ data }) => {
      transport.in(data)
    }
  }

  connect()

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

  return transport
}
