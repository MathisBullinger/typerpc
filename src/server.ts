import type {
  Schema,
  Request,
  Response,
  FieldBuild,
  FieldDef,
  ResponseMethods,
  OptProm,
} from './types'
import { encode } from './utils/schema'

type Channel<T extends Schema> = {
  in: <M extends keyof T>(request: Request<T, M>) => void
  out?: <M extends ResponseMethods<T>>(response: Response<T, M>) => void
}

export const internal = {
  __schema: { result: Object },
} as const

type Opts<T extends boolean> = {
  introspection?: T
}

export default <
  R extends Schema,
  I extends boolean = true,
  T extends Schema = R & (I extends true ? typeof internal : {})
>(
  schema: R,
  { introspection = true as I }: Opts<I> = {}
) => {
  if (introspection) schema = { ...schema, ...internal }
  const handlers: { [K in keyof T]?: Function } = {}

  const on = <M extends keyof T>(
    method: M,
    handler: (
      ...[params]: T[M]['params'] extends FieldDef
        ? [FieldBuild<T[M]['params']>]
        : []
    ) => OptProm<
      T[M]['result'] extends FieldDef ? FieldBuild<T[M]['result']> : void
    >
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
      async in(request) {
        if (typeof handlers[request.method] !== 'function')
          return respond(channel)(request.id!, {
            error: { code: -32601, message: 'Method not found' },
          })

        let result: any = undefined
        try {
          result = handlers[request.method]!((request as any).params)
          if (
            typeof result === 'object' &&
            result !== null &&
            typeof result.then === 'function'
          )
            result = await result
        } catch (e) {
          return respond(channel)(request.id!, {
            error: { code: -32603, message: 'Internal error' },
          })
        }
        if (!('id' in request)) return
        respond(channel)(
          request.id!,
          'result' in schema[request.method as any]
            ? { result }
            : {
                error: { code: -32001, message: 'Invalid notification id' },
              }
        )
      },
    }
    return channel
  }

  if (introspection) on('__schema', () => encode({ ...schema, ...internal }))

  return { on, createChannel }
}
