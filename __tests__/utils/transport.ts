import type { Transport } from '../../src'

function makeBroker() {
  const connections: Record<string, Transport<string>> = {}
  return {
    register(name: string, transport: Transport<string>) {
      connections[name] = transport
    },
    async call(target: string, caller: Transport<string>, msg: string) {
      const [name] = Object.entries(connections).find(([, v]) => v === caller)!
      await connections[target].in!(msg, name)
    },
  }
}
const broker = makeBroker()

export default function directTransport(route: string): Transport<string> {
  const transport: Transport<string> = {
    out(addr, msg) {
      broker.call(addr, transport, msg)
    },
    in(msg: string, caller: string) {
      transport.onInput?.(msg, caller)
    },
  }
  broker.register(route, transport)
  return transport
}
