import type { Request, Response } from './types'

type Schema = Record<string, { params: any; result: any }>

type Params<T extends Schema, M extends keyof T> = T[M]['params'] extends never
  ? []
  : [...(T[M]['params'] extends any[] ? T[M]['params'] : [T[M]['params']])]

export default <T extends Schema>(
  out: (request: Request<any, string>) => void
) => {
  const msg = <M extends keyof T>({
    method,
    params,
    id,
  }: {
    method: M
    params: Params<T, M>
    id?: number
  }): Request<any, string> => ({
    jsonrpc: '2.0',
    method: method as string,
    ...(params.length && { params: params.length > 1 ? params : params[0] }),
    ...(id !== undefined && { id }),
  })

  let num = 0
  let pending: Record<number, (response: any) => void> = {}

  const buildRequest = <ID extends boolean>(includeId: ID) => <
    M extends keyof T
  >(
    method: M,
    ...params: Params<T, M>
  ): ID extends true ? Promise<any> : void => {
    const id = includeId ? num++ : undefined
    let res: any = undefined
    if (id)
      res = new Promise(resolve => {
        pending[id] = resolve
      })
    out(msg({ method, params, id }))
    return res
  }

  const notify = buildRequest(false)
  const call = buildRequest(true)

  return { notify, call }
}
