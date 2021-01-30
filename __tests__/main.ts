import createServer from '../src/server'
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
type Schema = typeof schema

const server = createServer(schema)

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
  const client = createClient<Schema>(channel.in)
  channel.out = client.in

  await expect(client.call('add', 1, 2)).resolves.toBe(3)
  await expect(client.call('add', 2, 3)).resolves.toBe(5)
  await expect(client.call('unhandled')).rejects.toMatchObject({ code: -32001 })

  await expect(client.call('fetch', 'https://example.com')).resolves.toBe(
    'Example Domain'
  )
  await expect(
    client.call('fetch', 'https://empty.bullinger.dev')
  ).rejects.toMatchObject({ code: -32603 })
})
