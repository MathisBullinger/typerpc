import createServer from '../src/server'
import type { Request, Response } from '../src/types'

const Person = { name: String, age: Number } as const

const schema = {
  greet: {},
  add: { params: [Number, Number], result: Number },
  concat: { params: [String, String], result: String },
  person: { params: [String, Number], result: Person },
  age: { params: Person, result: Person },
  older: { params: Object, result: Person },
} as const

const server = createServer(schema)

server.on('greet', () => {})
server.on('add', ([a, b]) => a + b)
server.on('concat', ([a, b]) => a + b)
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
      channel.in(msg)
    })

  await expect(
    inOut({ jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 3 })

  await expect(
    inOut({ jsonrpc: '2.0', method: 'concat', params: ['a', 'b'], id: 1 })
  ).resolves.toEqual({ jsonrpc: '2.0', id: 1, result: 'ab' })

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
