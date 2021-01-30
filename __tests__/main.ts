import { createServer } from '../src/server'

test('add', async () => {
  const server = createServer({ add: { params: [Number, Number] } })

  server.on('add', ([a, b]) => {
    console.log(`handle ${a}+${b}`)
  })

  const channel = server.createChannel()
  channel.in({ jsonrpc: '2.0', method: 'add', params: [1, 2] })
  channel.out = msg => console.log('received:', msg)

  await new Promise(res => setTimeout(res, 2000))
})
