import createServer, { internal } from '../src/server'
import createClient from '../src/client'
import type { Request, Response, ResponseMethods } from '../src/types'
import fetch from 'node-fetch'

const Person = { name: String, age: Number } as const
const schema = {
  greet: {},
  time: { result: String },
  add: { params: [Number, Number], result: Number },
  concat: { params: [String, String], result: String },
  capitalize: { params: String, result: String },
  person: { params: [String, Number], result: Person },
  age: { params: Person, result: Person },
  older: { params: Object, result: Person },
  unhandled: { result: Object },
  fetch: { params: String, result: String },
} as const
type Schema = typeof schema & typeof internal

const server = createServer(schema, { logger: null })

server.on('greet', () => {})
server.on('time', () => new Date().toISOString())
server.on('add', ([a, b]) => a + b)
server.on('concat', ([a, b]) => a + b)
server.on('capitalize', v => v[0].toUpperCase() + v.slice(1))
server.on('person', ([name, age]) => ({ name, age }))
server.on('age', ({ name, age }) => ({ name, age: age + 30 }))
server.on('older', ([a, b]) => (a.age > b.age ? a : b))
server.on('fetch', async url => {
  const txt = await fetch(url).then(res => res.text())
  return txt.match(/(?<=<h1>)([\w\s]+)/)?.[0] ?? 'no match'
})

test('server', async () => {
  await expect(() =>
    server
      .createChannel()
      .in({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 })
  ).rejects.toThrow()

  const inOut = <T extends ResponseMethods<typeof schema>>(
    msg: Request<typeof schema, T>
  ): Promise<Response<typeof schema, T>> =>
    new Promise(res => {
      const channel = server.createChannel()
      channel.out = res as any
      channel.in(msg as any)
    })

  await expect(
    inOut({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 3 })

  await expect(
    inOut({ jsonrpc: '2.0', method: 'concat', params: ['a', 'b'], id: 1 })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 'ab' })

  await expect(
    inOut({ jsonrpc: '2.0', method: 'capitalize', params: 'abc', id: 1 })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 'Abc' })

  const response = await inOut({
    jsonrpc: '2.0',
    method: 'person',
    params: ['John', 30],
    id: 1,
  })
  if (!('result' in response)) throw Error('no result')
  const person = response.result
  expect(person).toEqual({ name: 'John', age: 30 })
  await expect(
    inOut({ jsonrpc: '2.0', method: 'age', params: person, id: 1 })
  ).resolves.toEqual({
    jsonrpc: '2.0',
    id: 1,
    result: { ...person, age: 60 },
  })
  await expect(
    inOut({
      jsonrpc: '2.0',
      method: 'older',
      params: [person, { name: 'Jane', age: 1 }],
      id: 1,
    })
  ).resolves.toMatchObject({ result: person })
})

test('client', async () => {
  const _client = createClient<Schema>(() => {})
  type Client = typeof _client

  const expectRequest = (func: (client: Client) => void, expected: any) =>
    expect(
      new Promise(res => func(createClient<Schema>(res)))
    ).resolves.toEqual({ jsonrpc: '2.0', ...expected })

  await expectRequest(c => c.notify('greet'), { method: 'greet' })

  await expectRequest(c => c.notify('add', 1, 2), {
    method: 'add',
    params: [1, 2],
  })
  await expectRequest(c => c.notify('capitalize', 'abc'), {
    method: 'capitalize',
    params: 'abc',
  })
  await expectRequest(c => c.notify('age', { name: 'John', age: 50 }), {
    method: 'age',
    params: { name: 'John', age: 50 },
  })
  await expectRequest(c => c.call('time'), { method: 'time', id: 0 })
})

test('client <-> server', async () => {
  const channel = server.createChannel()
  const client = createClient<Schema>()
  client.out = channel.in
  channel.out = client.in

  await expect(client.call('add', 1, 2)).resolves.toBe(3)
  await expect(client.call('add', 2, 3)).resolves.toBe(5)
  await expect(client.call('unhandled')).rejects.toMatchObject({ code: -32601 })

  await expect(client.call('fetch', 'https://example.com')).resolves.toBe(
    'Example Domain'
  )
  await expect(
    client.call('fetch', 'https://empty.bullinger.dev')
  ).rejects.toMatchObject({ code: -32603 })
})

test('server introspection', async () => {
  const channel1 = createServer({}).createChannel()
  const client1 = createClient<typeof internal>(channel1.in)
  channel1.out = client1.in
  await expect(client1.call('__schema')).resolves.toEqual({
    __schema: { result: 'Object' },
  })

  const channel2 = createServer({}, { introspection: false }).createChannel()
  const client2 = createClient<{}>(channel2.in)
  channel2.out = client2.in
  await expect(client2.call('__schema' as never)).rejects.toMatchObject({
    code: -32601,
  })
})

test('server errors', async () => {
  const channel = server.createChannel()

  const addRequest = {
    jsonrpc: '2.0',
    method: 'add',
    params: [1, 2],
    id: 1,
  } as const

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in(addRequest)
    })
  ).resolves.toMatchObject({ result: 3 })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.inStr(JSON.stringify(addRequest))
    })
  ).resolves.toMatchObject({ result: 3 })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.inStr('invalid json')
    })
  ).resolves.toEqual({
    error: { code: -32700, message: 'Parse error' },
    id: null,
    jsonrpc: '2.0',
  })

  const invalid = {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32600, message: 'Invalid request' },
  }

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ foo: 'bar' } as any)
    })
  ).resolves.toEqual(invalid)

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ jsonrpc: '1.0', method: 'greet' } as any)
    })
  ).resolves.toEqual(invalid)

  await expect(
    new Promise(res => {
      const strictChannel = createServer(schema, {
        strictKeyCheck: true,
      }).createChannel()
      strictChannel.out = res
      strictChannel.in({ jsonrpc: '2.0', method: 'greet', foo: 'bar' } as any)
    })
  ).resolves.toEqual(invalid)

  // params validation

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({
        jsonrpc: '2.0',
        method: 'greet',
        params: 'foo',
        id: 0,
      } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ jsonrpc: '2.0', method: 'add', id: 0 } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ jsonrpc: '2.0', method: 'add', params: '', id: 0 } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({
        jsonrpc: '2.0',
        method: 'capitalize',
        params: ['a'],
        id: 0,
      } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({
        jsonrpc: '2.0',
        method: 'add',
        params: [1, 2, 3] as any,
        id: 0,
      })
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({ jsonrpc: '2.0', method: 'fetch', params: 1, id: 0 } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({
        jsonrpc: '2.0',
        method: 'add',
        params: [1, '2'],
        id: 0,
      } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })

  await expect(
    new Promise(res => {
      channel.out = res
      channel.in({
        jsonrpc: '2.0',
        method: 'age',
        params: { name: 0, age: 1 },
        id: 0,
      } as any)
    })
  ).resolves.toMatchObject({ error: { code: -32602 } })
})
