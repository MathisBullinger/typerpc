import createServer from '../src/server'
import createClient from '../src/client'
import type { Request, Response } from '../src/types'
import _schema from './build/schema.js'
import type { Schema } from './build/schemaType'

const Person = { name: String, age: Number } as const
const schema = {
  greet: {},
  add: { params: [Number, Number], result: Number },
  concat: { params: [String, String], result: String },
  capitalize: { params: String, result: String },
  person: { params: [String, Number], result: Person },
  age: { params: Person, result: Person },
  older: { params: Object, result: Person },
} as const

test('schema matches', () => {
  expect(schema).toEqual(_schema)
})

const server = createServer(schema)

server.on('greet', () => {})
server.on('add', ([a, b]) => a + b)
server.on('concat', ([a, b]) => a + b)
server.on('capitalize', v => v[0].toUpperCase() + v.slice(1))
server.on('person', ([name, age]) => ({ name, age }))
server.on('age', ({ name, age }) => ({ name, age: age + 30 }))
server.on('older', ([a, b]) => (a.age > b.age ? a : b))

test('server', async () => {
  expect(() =>
    server
      .createChannel()
      .in({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 })
  ).toThrow()

  const inOut = <T extends keyof typeof schema>(
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

  const { result: person } = await inOut({
    jsonrpc: '2.0',
    method: 'person',
    params: ['John', 30],
    id: 1,
  })
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
  await expectRequest(c => c.call('greet'), { method: 'greet', id: 0 })
})

test('client <-> server', async () => {
  const channel = server.createChannel()
  const client = createClient<Schema>(channel.in)
  channel.out = client.in

  await expect(client.call('add', 1, 2)).resolves.toBe(3)
  await expect(client.call('add', 2, 3)).resolves.toBe(5)
})
