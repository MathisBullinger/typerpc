type Primitive = StringConstructor | NumberConstructor
type ParamSchema = Primitive | [ParamSchema, ...ParamSchema[]]

type Params<T extends ParamSchema> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
  ? number
  : T extends any[]
  ? { [K in keyof T]: Params<T[K]> }
  : never

type Methods = Record<string, { params: ParamSchema }>

type Handlers<T extends Methods> = { [K in keyof T]: () => void }

type Message<T extends Methods, M extends keyof T> = {
  jsonrpc: '2.0'
  method: M
  params: Params<T[M]['params']>
}

type MessageHandler<T extends Methods> = <M extends keyof T>(
  msg: Message<T, M>
) => void

type Channel<T extends Methods> = {
  in: MessageHandler<T>
  out?: MessageHandler<T>
}

type MsgHandler<T extends Methods> = <M extends keyof T>(
  params: Params<T[M]['params']>
) => void

type Server<T extends Methods> = {
  createChannel(): Channel<T>
  on<M extends keyof T>(method: M, handler: MsgHandler<T>): void
}

export const createServer = <T extends Methods>(methods: T): Server<T> => {
  const handlers: { [K in keyof T]?: Function } = {}

  return {
    on(method, handler) {
      handlers[method] = handler
    },
    createChannel: () => ({
      in(msg) {
        console.log('in:', msg)

        if (typeof handlers[msg.method] !== 'function')
          throw Error(`no handler registered for method "${msg.method}"`)

        handlers[msg.method]!(msg.params)
      },
    }),
  }
}
