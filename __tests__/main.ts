import { createServer } from '../src/server'

const schema = {
  greet: {},
  add: { params: [Number, Number], result: Number },
  concact: { params: [String, String] },
} as const

const server = createServer(schema)

server.on('greet', () => {})
server.on('add', ([a, b]) => a + b)

test('server', async () => {
  const channel = server.createChannel()

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 })
    })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 3 })
})
