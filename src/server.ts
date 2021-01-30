type Schema = Record<string, { params?: FieldDef; result?: FieldDef }>

// recursive type would result in error
// "Type instantiation is excessively deep and possibly infinite.ts(2589)"
type FieldDef = FieldBaseDef | readonly [FieldDef, ...FieldBaseDef[]]
type FieldBaseDef = StringConstructor | NumberConstructor

type FieldBuild<T extends FieldDef> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
  ? number
  : T extends readonly [FieldBaseDef, ...any[]]
  ? { [K in keyof T]: FieldBuild<T[K]> }
  : never

type Request<T extends Schema, M extends keyof T> = {
  jsonrpc: '2.0'
  method: M
  id?: string | number
} & ParamPart<T, M>

type ParamPart<
  T extends Schema,
  M extends keyof T
> = T[M]['params'] extends FieldDef
  ? { params: FieldBuild<T[M]['params']> }
  : {}

type Response<
  T extends Schema,
  M extends keyof T
> = T[M]['result'] extends FieldDef
  ? {
      jsonrpc: '2.0'
      result: FieldBuild<T[M]['result']>
      id: string | number | null
    }
  : never

type Channel<T extends Schema> = {
  in: <M extends keyof T>(request: Request<T, M>) => void
  out?: (response: Response<T, any>) => void
}

export const createServer = <T extends Schema>(schema: T) => {
  const handlers: { [K in keyof T]?: Function } = {}
  return {
    on<M extends keyof T>(
      method: M,
      handler: (
        ...[params]: T[M]['params'] extends FieldDef
          ? [FieldBuild<T[M]['params']>]
          : []
      ) => void
    ) {
      handlers[method] = handler
    },
    createChannel: (): Channel<T> => ({
      in(request) {
        if (typeof handlers[request.method] !== 'function')
          throw Error(`no handler registered for method "${request.method}"`)

        const result = handlers[request.method]!((request as any).params)
        if ('id' in request)
          this.out?.({ jsonrpc: '2.0', id: request.id, result } as any)
      },
    }),
  }
}
