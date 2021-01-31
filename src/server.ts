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
import error, { errors } from './error'

export const internal = {
  __schema: { result: Object },
} as const

type Opts<T extends boolean> = {
  introspection?: T
  strictKeyCheck?: boolean
  logger?: { error(...args: any[]): void } | null
  validateParams?: boolean
}

const validRequestKeys = ['jsonrpc', 'method', 'params', 'id']

export default <
  R extends Schema,
  I extends boolean = true,
  T extends Schema = R & (I extends true ? typeof internal : {})
>(
  schema: R,
  {
    introspection = true as I,
    strictKeyCheck = false,
    logger = console,
    validateParams = true,
  }: Opts<I> = {}
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

  const isRequest = (request: any): request is Request<T, any> => {
    if (
      typeof request !== 'object' ||
      Array.isArray(request) ||
      request === null
    )
      return false

    if (request.jsonrpc !== '2.0') return false
    if (typeof request.method !== 'string') return false

    if (
      strictKeyCheck &&
      Object.keys(request).some(key => !validRequestKeys.includes(key))
    )
      return false

    return true
  }

  const validate = (request: any): keyof typeof errors | undefined => {
    if (!isRequest(request)) return 'request'
    if (typeof handlers[request.method] !== 'function') return 'method'
    if (!validateParams) return
    if (validateParams && !validateParameters(request)) return 'params'
  }

  const validateParameters = (request: Request<T, any>): boolean => {
    const params = schema[request.method].params
    const reqParams = (request as any).params

    if ((params === undefined) !== (reqParams === undefined)) return false
    if (!params) return true

    if (params === Object) return reqParams !== undefined

    if (Array.isArray(params) !== Array.isArray(reqParams)) return false

    const checkType = (node: any, comp: any): boolean => {
      if (comp === Object) return true
      if (comp === null) return node === null
      if (typeof comp === 'object') {
        if (typeof node !== 'object' || typeof node === null) return false
        for (const k of Object.keys(comp))
          if (!checkType(node[k], comp[k])) return false
        return true
      }
      return node.constructor === comp
    }

    if (Array.isArray(params)) {
      if (params.length !== reqParams.length) return false
    }

    return checkType(reqParams, params)
  }

  const createChannel = (): Channel<T> => {
    const channel: Channel<T> = {
      async in(request) {
        const invalid = validate(request)
        if (invalid)
          return respond(channel)(request.id ?? null, {
            error: error(invalid),
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
          logger?.error(e)
          return respond(channel)(request.id!, { error: error('internal') })
        }
        if (!('id' in request)) return
        respond(channel)(
          request.id!,
          'result' in schema[request.method as any]
            ? { result }
            : { error: error('notification') }
        )
      },
      inStr(request) {
        try {
          const parsed = JSON.parse(request)
          this.in(parsed)
        } catch (e) {
          respond(channel)(null, { error: error('parse') })
        }
      },
    }
    channel.inStr.bind(channel)
    return channel
  }

  if (introspection) on('__schema', () => encode({ ...schema, ...internal }))

  return { on, createChannel }
}

export type Channel<T extends Schema> = {
  in: <M extends keyof T>(request: Request<T, M>) => void
  inStr: (request: string) => void
  out?: <M extends ResponseMethods<T>>(response: Response<T, M>) => void
}
