import { createServer } from '../src/server'

test('server', async () => {
  const schema = {
    greet: {},
    add: { params: [Number, Number] },
    concact: { params: [String, String] },
  } as const

  const server = createServer(schema)

  server.on('greet', () => {
    console.log('someone said hello')
  })

  server.on('add', ([a, b]) => {
    console.log(`calculate ${a}+${b}`)
  })

  const channel = server.createChannel()
  channel.out = msg => console.log('received:', msg)

  channel.in({ jsonrpc: '2.0', method: 'add', params: [1, 2] })
  channel.in({ jsonrpc: '2.0', method: 'greet' })

  await new Promise(res => setTimeout(res, 2000))
})
