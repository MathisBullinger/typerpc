import type {
  Schema,
  Request,
  Response,
  FieldBuild,
  FieldDef,
  ResponseMethods,
} from './types'
import { encode } from './utils/schema'

type Channel<T extends Schema> = {
  in: <M extends keyof T>(request: Request<T, M>) => void
  out?: <M extends ResponseMethods<T>>(response: Response<T, M>) => void
}

export type Internal = {
  __schema: { result: Object }
}

export default <R extends Schema, T extends Schema = R & Internal>(
  schema: R
) => {
  const handlers: { [K in keyof T]?: Function } = {}

  const on = <M extends keyof T>(
    method: M,
    handler: (
      ...[params]: T[M]['params'] extends FieldDef
        ? [FieldBuild<T[M]['params']>]
        : []
    ) => T[M]['result'] extends FieldDef ? FieldBuild<T[M]['result']> : void
  ) => {
    handlers[method] = handler
  }

  const respond = (channel: Channel<T>) => (
    id: string | number | null,
    { result, error }: { result?: any; error?: any }
  ) => {
    if (typeof channel.out !== 'function')
      throw Error('no channel output defined')

    channel.out({ jsonrpc: '2.0', id, ...(result ? { result } : { error }) })
  }

  const createChannel = (): Channel<T> => {
    const channel: Channel<T> = {
      in(request) {
        if (typeof handlers[request.method] !== 'function')
          return respond(channel)(request.id!, {
            error: { code: -32001, message: 'Invalid notification id' },
          })

        const result = handlers[request.method]!((request as any).params)
        if ('id' in request) respond(channel)(request.id!, { result })
      },
    }
    return channel
  }

  on('__schema', () => encode(schema))

  return { on, createChannel }
}
