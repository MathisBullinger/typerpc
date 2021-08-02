import Endpoint from '../src'
import createTransport from './utils/transport'
import { encode } from '../src/utils/schema'
import fetch from 'node-fetch'

const Person = { name: String, age: Number } as const
const server = new Endpoint(
  {
    add: { params: [Number, Number], result: Number },
    concat: { params: [String, String], result: String },
    person: { params: [String, Number], result: Person },
    age: { params: Person, result: Person },
    fetch: { params: String, result: String },
    greet: {},
    time: { result: String },
    capitalize: { params: String, result: String },
    unhandled: { result: Object },
  },
  { logger: null }
)
{
  const transport = createTransport('/server')
  server.addTransport(transport, { default: true })

  server.on('add', ([a, b]) => a + b)
  server.on('concat', ([a, b]) => a + b)
  server.on('person', ([name, age]) => ({ name, age }))
  server.on('age', ({ name, age }) => ({ name, age: age + 30 }))
  server.on('greet', console.log)
  server.on('time', () => new Date().toISOString())
  server.on('capitalize', v => v[0].toUpperCase() + v.slice(1))
  server.on('fetch', async url => {
    const txt = await fetch(url).then(res => res.text())
    return txt.match(/(?<=<h1>)([\w\s]+)/)?.[0] ?? 'no match'
  })
}

const client = new Endpoint(null)
{
  const transport = createTransport('/user')
  client.addTransport(transport, { default: true })
  client.addConnection('/server')
}
const api = client.getConnection<typeof server.schema>('/server')

test('rpc', async () => {
  await expect(api.notify('add', 1, 2)).resolves.toBeUndefined()

  // synchronous resolvers
  await expect(api.call('add', 1, 2)).resolves.toBe(3)
  await expect(api.call('concat', 'a', 'b')).resolves.toBe('ab')
  await expect(api.call('capitalize', 'asdf')).resolves.toBe('Asdf')
  await expect(api.call('person', 'John', 50)).resolves.toEqual({
    name: 'John',
    age: 50,
  })
  await expect(api.call('age', { name: 'John', age: 30 })).resolves.toEqual({
    name: 'John',
    age: 60,
  })

  // async resolver
  await expect(api.call('fetch', 'https://example.com')).resolves.toBe(
    'Example Domain'
  )
})

test('error responses', async () => {
  // unknown connection
  expect(() =>
    (client.getConnection('non-existent') as any).call('foo')
  ).toThrow()

  // missing resolver
  await expect(api.call('unhandled')).rejects.toMatchObject({ code: -32601 })

  // parse error
  await expect(
    new Promise(res => {
      const transport = createTransport('foo')
      server.addTransport(transport)
      transport.out = (_, v) => {
        res(JSON.parse(v))
      }
      transport.in!('invalid json', 'me')
    })
  ).resolves.toMatchObject({ error: { code: -32700 } })

  // invalid format
  await expect(
    new Promise(res => {
      const transport = createTransport('foo')
      server.addTransport(transport)
      transport.out = (_, v) => {
        res(JSON.parse(v))
      }
      transport.in!(JSON.stringify({ foo: 'bar' }), 'me')
    })
  ).resolves.toMatchObject({ error: { code: -32600 } })

  await expect(
    new Promise(res => {
      const transport = createTransport('foo')
      server.addTransport(transport)
      transport.out = (_, v) => {
        res(JSON.parse(v))
      }
      transport.in!(JSON.stringify({ jsonrpc: '1.0', method: 'greet' }), 'me')
    })
  ).resolves.toMatchObject({ error: { code: -32600 } })

  // params validation
  await expect(
    // @ts-ignore
    api.call('time', 'foo')
  ).rejects.toMatchObject({ code: -32602 })
  // @ts-ignore
  await expect(api.call('add')).rejects.toMatchObject({ code: -32602 })
  // @ts-ignore
  await expect(api.call('add', 1, 2, 3)).rejects.toMatchObject({ code: -32602 })
  // @ts-ignore
  await expect(api.call('add', 1, '2')).rejects.toMatchObject({ code: -32602 })
  // @ts-ignore
  await expect(api.call('capitalize', ['a'])).rejects.toMatchObject({
    code: -32602,
  })
  // @ts-ignore
  await expect(api.call('age', { name: 1, age: 2 })).rejects.toMatchObject({
    code: -32602,
  })

  // internal
  await expect(
    api.call('fetch', 'https://empty.bullinger.dev')
  ).rejects.toMatchObject({ code: -32603 })
})

test('introspection', async () => {
  await expect(api.call('__schema')).resolves.toEqual(encode(server.schema))

  const noIntro = new Endpoint(
    { foo: { result: String } },
    { introspection: false }
  )
  noIntro.on('foo', () => 'bar')
  noIntro.addTransport(createTransport('/nointro'), { default: true })
  const api2 = client.addConnection<typeof noIntro.schema>('/nointro')
  await expect(api2.call('foo')).resolves.toBe('bar')
  // @ts-ignore
  await expect(api2.call('__intro')).rejects.toMatchObject({ code: -32601 })
})

test.only('batch', async () => {
  const batch = api.batch()
  expect(() => batch.notify('greet')).not.toThrow()
  await batch
  expect(() => batch.notify('greet')).toThrow()
})
