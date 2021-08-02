import Connection from '../src/connection'
import type { Transport } from '../src'

const transport: Transport<string> = {
  out: console.error,
  in: console.error,
}

const expectOut = async (func: Function, expected: any) =>
  await expect(
    new Promise(res => {
      transport.out = (_, json) => {
        res(JSON.parse(json))
      }
      func()
    })
  ).resolves.toEqual(expected)

const connection = new Connection<Schema>('', transport)

test('.notify output', async () => {
  await expectOut(() => connection.notify('add', 1, 2), {
    jsonrpc: '2.0',
    method: 'add',
    params: [1, 2],
  })
})

test('.call output', async () => {
  await expectOut(() => connection.call('add', 1, 2), {
    jsonrpc: '2.0',
    method: 'add',
    params: [1, 2],
    id: 0,
  })
  await expectOut(() => connection.call('add', 3, 4), {
    jsonrpc: '2.0',
    method: 'add',
    params: [3, 4],
    id: 1,
  })
})

test.only('batch', async () => {
  await expectOut(
    async () => await connection.batch().notify('add', 1, 2).call('add', 3, 4),
    [
      { jsonrpc: '2.0', method: 'add', params: [1, 2] },
      { jsonrpc: '2.0', method: 'add', params: [3, 4], id: 0 },
    ]
  )
})

test('response', async () => {
  ;(connection as any).transport = {
    ...connection.transport,
    out: (_: any, json: string) => {
      const {
        params: [a, b],
        id,
      } = JSON.parse(json)
      setTimeout(() => connection._response({ id, result: a + b } as any), 10)
    },
  }
  await expect(connection.call('add', 1, 2)).resolves.toBe(3)
})

const schema = {
  add: { params: [Number, Number], result: Number },
} as const
type Schema = typeof schema
