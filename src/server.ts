// recursive type would result in error
// "Type instantiation is excessively deep and possibly infinite.ts(2589)"
type ParamDef = ParamBaseDef | readonly [ParamDef, ...ParamBaseDef[]]
type ParamBaseDef = StringConstructor | NumberConstructor

type ParamBuild<T extends ParamDef> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
  ? number
  : T extends readonly [ParamBaseDef, ...any[]]
  ? { [K in keyof T]: ParamBuild<T[K]> }
  : never

type Schema = Record<string, { params?: ParamDef }>

type Message<T extends Schema, M extends keyof T> = {
  jsonrpc: '2.0'
  method: M
} & ParamPart<T, M>

type ParamPart<
  T extends Schema,
  M extends keyof T
> = T[M]['params'] extends ParamDef
  ? { params: ParamBuild<T[M]['params']> }
  : {}

type Channel<T extends Schema> = {
  in: <M extends keyof T>(msg: Message<T, M>) => void
  out?: (msg: any) => void
}

export const createServer = <T extends Schema>(schema: T) => {
  const handlers: { [K in keyof T]?: Function } = {}
  return {
    on<M extends keyof T>(
      method: M,
      handler: (
        ...[params]: T[M]['params'] extends ParamDef
          ? [ParamBuild<T[M]['params']>]
          : []
      ) => void
    ) {
      handlers[method] = handler
    },
    createChannel: (): Channel<T> => ({
      in(msg) {
        console.log('in:', msg)

        if (typeof handlers[msg.method] !== 'function')
          throw Error(`no handler registered for method "${msg.method}"`)

        handlers[msg.method]!((msg as any).params)
      },
    }),
  }
}
