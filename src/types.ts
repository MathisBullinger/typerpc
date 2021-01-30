export type Schema = Record<string, { params?: FieldDef; result?: FieldDef }>

// recursive list type results in error
// "Type instantiation is excessively deep and possibly infinite.ts(2589)"
export type FieldDef =
  | FieldBaseDef
  | readonly [FieldBaseDef, ...FieldBaseDef[]]
  | { [K: string]: FieldDef }
  | Object
type FieldBaseDef = StringConstructor | NumberConstructor | null

export type FieldBuild<T extends FieldDef> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
  ? number
  : T extends ObjectConstructor
  ? any
  : T extends null
  ? null
  : T extends { [K: string]: FieldBaseDef }
  ? { [K in keyof T]: FieldBuild<T[K]> }
  : T extends readonly [FieldBaseDef, ...any[]]
  ? { [K in keyof T]: FieldBuild<T[K]> }
  : never

export type Request<T extends Schema, M extends keyof T> = {
  jsonrpc: '2.0'
  method: M
  id?: string | number
} & ParamPart<T, M>

export type Response<T extends Schema, M extends ResponseMethods<T>> = {
  jsonrpc: '2.0'
  id: string | number | null
} & (
  | { result: FieldBuild<T[M]['result']> }
  | { error: { code: number; message: string; data?: any } }
)

export type ResponseMethods<T extends Schema> = {
  [K in keyof T]: T[K]['result'] extends FieldDef ? K : never
}[keyof T]

type ParamPart<
  T extends Schema,
  M extends keyof T
> = T[M]['params'] extends FieldDef
  ? { params: FieldBuild<T[M]['params']> }
  : {}
