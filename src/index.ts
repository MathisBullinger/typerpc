import Connection from './connection'
import error, { errors } from './error'
import { encode } from './utils/schema'
import type {
  Schema,
  Request,
  Response,
  FieldDef,
  FieldBuild,
  OptProm,
} from './types'

export type Transport<T> = {
  out(address: T, msg: string): void | Promise<void>
  in(...args: any[]): void | Promise<void>
  onInput?(msg: string, caller: T): Promise<void>
}

type Opts<T extends boolean> = {
  logger?: { info(...args: any[]): void; error(...args: any[]): void } | null
  strictKeyCheck?: boolean
  validateParams?: boolean
  introspection?: T
}

export const internal = {
  __schema: { result: Object },
} as const

export default class Endpoint<
  TCustom extends Schema | null,
  TIntro extends boolean = true,
  TSchema extends Schema | null = TIntro extends false
    ? TCustom
    : TCustom extends null
    ? typeof internal
    : TCustom & typeof internal
> {
  private transports: Transport<any>[] = []
  private defaultTransport?: Transport<any>
  private connections = new Map<any, Connection<any>>()
  private handlers: { [K in keyof Schema]?: Function } = {}
  private readonly logger: Opts<TIntro>['logger']
  private readonly strictKeyCheck: boolean
  private readonly validateParams: boolean
  private readonly introspectable: boolean
  public readonly schema: TSchema

  constructor(
    schema: TCustom,
    { logger = console, introspection, ...opts }: Opts<TIntro> = {}
  ) {
    this.on = schema ? (this._on.bind(this) as any) : undefined
    this.logger = logger
    this.strictKeyCheck = opts.strictKeyCheck ?? false
    this.validateParams = opts.validateParams ?? true
    this.introspectable = introspection === false ? false : true
    this.schema = (!this.introspectable
      ? schema
      : !schema
      ? internal
      : { ...schema, ...internal }) as any
    if (this.introspectable)
      this.handlers.__schema = () => encode({ ...schema, ...internal })
  }

  public addTransport(
    transport: Transport<any>,
    opts: { default?: boolean } = {}
  ) {
    if (this.transports.includes(transport)) return
    this.transports.push(transport)
    transport.onInput = this.ingress(transport)
    if (!opts.default) return
    if (this.defaultTransport)
      throw Error("can't register multiple default transports")
    this.defaultTransport = transport
  }

  public addConnection<S extends Schema>(
    address: any,
    transport?: Transport<any>
  ): Connection<S> {
    if (!transport && !this.defaultTransport)
      throw Error(
        'No default transport registered. Either register a default transport or provide a transport for this connection.'
      )

    const connection = new Connection<S>(
      address,
      transport ?? this.defaultTransport!
    )
    this.connections.set(address, connection)

    return connection
  }

  public getConnection<S extends Schema>(address: any): Connection<S> {
    if (!this.connections.has(address))
      throw Error(`unknown connection ${address}`)
    return this.connections.get(address) as Connection<S>
  }

  public on: TSchema extends null ? never : Registration<Exclude<TSchema, null>>
  private _on: Registration<Exclude<TSchema, null>> = (method, handler) => {
    this.handlers[method as any] = handler
  }

  private ingress = (transport: Transport<any>) => async (
    msg: string,
    caller: any
  ) => {
    let parsed: any
    try {
      parsed = JSON.parse(msg)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return await this.respondError('request', transport, caller)
    } catch (e) {
      return await this.respondError('parse', transport, caller)
    }
    if (this.isResponse(parsed)) {
      const connection = this.connections.get(caller)
      if (connection) connection._response(parsed)
      else this.logger?.error('unsolicited response from', caller)
    } else {
      const invalid = this.validateRequest(parsed)
      if (invalid)
        return await this.respondError(invalid, transport, caller, parsed.id)
      await this.invokeProcedure(parsed, transport, caller)
    }
  }

  private async invokeProcedure(
    request: Request<Exclude<TSchema, null>, any>,
    transport: Transport<any>,
    caller: any
  ) {
    let result: any = undefined
    try {
      result = this.handlers[request.method]!(
        (request as any).params,
        caller,
        transport
      )
      if (isPromise(result)) result = await result
    } catch (e) {
      this.logger?.error('failed to invoke procedure', request, e)
      return await this.respondError('internal', transport, caller, request.id)
    }
    if (!('id' in request)) return
    if ('result' in this.schema![request.method])
      await this.respondResult(result, transport, caller, request.id!)
    else await this.respondError('notification', transport, caller, request.id)
  }

  private validateRequest(
    request: Request<Exclude<TSchema, null>, any>
  ): keyof typeof errors | undefined {
    if (!this.isRequest(request)) return 'request'
    if (typeof this.handlers[request.method] !== 'function') return 'method'
    if (this.validateParams && !this.validateParameters(request))
      return 'params'
  }

  private validateParameters(
    request: Request<Exclude<TSchema, null>, any>
  ): boolean {
    if (this.schema === null) return false

    const params = this.schema[request.method].params
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

  private isResponse(msg: any): msg is Response<any, any> {
    return 'result' in msg || 'error' in msg
  }

  private isRequest(request: any): request is Request<any, any> {
    if (
      typeof request !== 'object' ||
      Array.isArray(request) ||
      request === null
    )
      return false

    if (request.jsonrpc !== '2.0') return false
    if (typeof request.method !== 'string') return false

    if (
      this.strictKeyCheck &&
      Object.keys(request).some(key => !validRequestKeys.includes(key))
    )
      return false

    return true
  }

  private async respondError(
    type: keyof typeof errors,
    transport: Transport<any>,
    addr: any,
    id: string | number | null = null
  ) {
    await transport.out(
      addr,
      JSON.stringify({ jsonrpc: '2.0', id, error: error(type) })
    )
  }

  private async respondResult(
    result: any,
    transport: Transport<any>,
    addr: any,
    id: string | number
  ) {
    await transport.out(addr, JSON.stringify({ jsonrpc: '2.0', id, result }))
  }
}

type Registration<T extends Schema> = <M extends keyof T, A>(
  method: M,
  handler: Handler<T, M, A>
) => void

type Handler<T extends Schema, M extends keyof T, A> = (
  ...args: [
    ...params: T[M]['params'] extends FieldDef
      ? [FieldBuild<T[M]['params']>]
      : [],
    caller: A,
    transport: Transport<A>
  ]
) => OptProm<
  T[M]['result'] extends FieldDef ? FieldBuild<T[M]['result']> : void
>

const validRequestKeys = ['jsonrpc', 'method', 'params', 'id']

const isPromise = (v: any): v is PromiseLike<any> =>
  typeof v === 'object' && v !== null && typeof v.then === 'function'
