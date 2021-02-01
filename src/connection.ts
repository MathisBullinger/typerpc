import type {
  Schema,
  FieldDef,
  FieldBuild,
  Response,
  ResponseMethod,
} from './types'
import type { Transport } from './endpoint'

export default class Connection<T extends Schema> {
  private requestCount = 0
  private openRequests: Record<number, [Function, Function]> = {}

  constructor(
    private readonly address: any,
    public readonly transport: Transport<any>
  ) {}

  public async notify<M extends keyof T>(method: M, ...params: Params<T, M>) {
    await this.transport.out(this.address, this.request(method, params))
  }

  public async call<M extends ResponseMethod<T>>(
    method: M,
    ...params: Params<T, M>
  ): Promise<Response<T, M>> {
    const id = this.requestCount++
    const prom = new Promise<any>((resolve, reject) => {
      this.openRequests[id] = [resolve, reject]
    })
    await this.transport.out(this.address, this.request(method, params, id))
    return prom
  }

  public async _response(response: Response<T, any>) {
    if (!(response.id! in this.openRequests)) return
    const [resolve, reject] = this.openRequests[response.id as any]
    if ('error' in response) reject(response.error)
    else resolve(response.result)
  }

  private request<M extends keyof T>(
    method: M,
    params: Params<T, M>,
    id?: number
  ): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params.length &&
        ({ params: params.length > 1 ? params : params[0] } as any)),
      ...(id !== undefined && { id }),
    })
  }
}

type Params<
  T extends Schema,
  M extends keyof T,
  P = T[M]['params'] extends FieldDef ? FieldBuild<T[M]['params']> : never
> = P extends never ? [] : [...(P extends readonly [any, ...any[]] ? P : [P])]
