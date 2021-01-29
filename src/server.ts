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

type Message<T extends Methods, M extends keyof T> = {
  jsonrpc: '2.0'
  method: M
  params: Params<T[M]['params']>
}

type Server<T extends Methods> = {
  call<M extends keyof T>(msg: Message<T, M>): void
}

export const createServer = <T extends Methods>(methods: T): Server<T> => {
  return { call() {} }
}

const server = createServer({
  add: { params: [Number, Number] },
  sayHello: { params: String },
})

server.call({ jsonrpc: '2.0', method: 'sayHello', params: 'John' })
server.call({ jsonrpc: '2.0', method: 'add', params: [1, 2] })

type Foo = Params<[NumberConstructor, NumberConstructor]>
