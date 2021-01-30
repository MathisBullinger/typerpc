import type {
  Schema,
  Request,
  FieldDef,
  FieldBuild,
  Response,
  ResponseMethods,
} from './types'

type Params<
  T extends Schema,
  M extends keyof T,
  P = T[M]['params'] extends FieldDef ? FieldBuild<T[M]['params']> : never
> = P extends never ? [] : [...(P extends readonly [any, ...any[]] ? P : [P])]

export default <T extends Schema>(
  out?: <M extends keyof T>(request: Request<T, M>) => void
) => {
  const msg = <M extends keyof T>({
    method,
    params,
    id,
  }: {
    method: M
    params: Params<T, M>
    id?: number
  }): Request<T, M> =>
    ({
      jsonrpc: '2.0',
      method,
      ...(params.length && { params: params.length > 1 ? params : params[0] }),
      ...(id !== undefined && { id }),
    } as any)

  let num = 0
  const pending: Record<
    number,
    [resolve: (response: any) => void, reject: (reason: any) => void]
  > = {}

  const buildRequest = <ID extends boolean>(includeId: ID) => <
    M extends ID extends false ? keyof T : ResponseMethods<T>
  >(
    method: M,
    ...params: Params<T, M>
  ): ID extends true ? Promise<any> : void => {
    const id = includeId ? num++ : undefined
    const res: any =
      id === undefined
        ? undefined
        : new Promise((resolve, reject) => {
            pending[id] = [resolve, reject]
          })

    out!(msg({ method, params, id }))
    return res
  }

  const notify = buildRequest(false)
  const call = buildRequest(true)

  return {
    notify,
    call,
    in<M extends ResponseMethods<T>>(response: Response<T, M>) {
      if (!(response.id! in pending)) return
      const [resolve, reject] = pending[response.id as number]
      if ('result' in response) resolve(response.result)
      else reject(response.error)
      delete pending[response.id as number]
    },
    set out(v: typeof out) {
      out = v
    },
  }
}
