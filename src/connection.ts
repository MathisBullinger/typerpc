import type { Transport } from '.'
import type {
  Schema,
  FieldDef,
  FieldBuild,
  Response,
  ResponseMethod,
} from './types'

export default class Connection<T extends Schema> {
  private requestCount = 0
  private openRequests: Record<number, [Function, Function]> = {}

  constructor(
    public readonly address: any,
    public readonly transport: Transport<any>
  ) {}

  public async notify<M extends keyof T>(method: M, ...params: Params<T, M>) {
    await this.transport.out(this.address, this.buildRequest(method, params))
  }

  public async call<M extends ResponseMethod<T>>(
    method: M,
    ...params: Params<T, M>
  ): Promise<Response<T, M>> {
    const id = this.requestCount++
    const prom = new Promise<any>((resolve, reject) => {
      this.openRequests[id] = [resolve, reject]
    })
    await this.transport.out(
      this.address,
      this.buildRequest(method, params, id)
    )
    return prom
  }

  public batch({
    silent = false,
  }: {
    silent?: boolean
  } = {}): BatchBuilder<void, T> {
    return new BatchBuilder(this, silent)
  }

  public async _response(response: Response<T, any>) {
    if (!(response.id! in this.openRequests)) return
    const [resolve, reject] = this.openRequests[response.id as any]
    if ('error' in response) reject(response.error)
    else resolve(response.result)
  }

  private buildRequest<M extends keyof T>(
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

class BatchBuilder<T, S extends Schema> extends Promise<T> {
  static get [Symbol.species]() {
    return Promise
  }

  private static cbStack: [(value?: any) => void, (reason?: any) => void][] = []

  constructor(
    private readonly connection: Connection<S>,
    private readonly silent: boolean,
    private readonly parent?: BatchBuilder<unknown, S>,
    prom?: Promise<T>,
    private readonly msg?: string
  ) {
    super(
      (
        resolve: (value: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void
      ): any => {
        if (!parent) BatchBuilder.cbStack.push([resolve, reject])
        if (prom) prom.then(resolve).catch(reject)
      }
    )
    if (!parent) {
      const [resolve, reject] = BatchBuilder.cbStack.pop()!
      this.exec = async () => {
        delete this.exec
        const batched = `[${this.msgs.join(',')}]`
        try {
          await this.connection.transport.out(this.connection.address, batched)
          const results = await Promise.allSettled(this.notifications)
          if (this.silent) return resolve()
          const err = results.find(
            v => v.status === 'rejected'
          ) as PromiseRejectedResult
          if (err) reject(err.reason)
          resolve(results.map(v => v.status === 'fulfilled' && v.value))
        } catch (e) {
          reject(e)
        }
      }
    }
  }

  private guardMutable() {
    if (!this.root.exec)
      throw Error("can't add to batch request that has already been executed")
  }

  notify<M extends keyof S>(method: M, ...params: Params<S, M>) {
    this.guardMutable()
    return this.addChild<void>(
      ...this.patchTransport(() => this.connection.notify(method, ...params))
    )
  }

  call<M extends ResponseMethod<S>>(
    method: M,
    ...params: Params<S, M>
  ): BatchBuilder<Response<S, M>, S> {
    this.guardMutable()
    const [prom, msg] = this.patchTransport(() =>
      this.connection.call(method, ...params)
    )
    this.root.notifications.push(prom)
    return this.addChild(prom, msg)
  }

  private patchTransport<T>(task: () => T): [T, string] {
    const transport = this.connection.transport
    let msg: string
    ;(this.connection as any).transport = {
      out(_: any, _msg: string) {
        msg = _msg
      },
    }
    try {
      return [task(), msg!]
    } finally {
      ;(this.connection as any).transport = transport
    }
  }

  private exec?: () => any
  private notifications: Promise<any>[] = []

  private get msgs(): string[] {
    return [
      ...(this.msg ? [this.msg] : []),
      ...this.children.flatMap(child => child.msgs),
    ]
  }

  private get root(): BatchBuilder<unknown, S> {
    if (!this.parent) return this
    return this.parent.root
  }

  private children: BatchBuilder<unknown, S>[] = []

  private addChild<T>(prom: Promise<T>, msg: string): BatchBuilder<T, S> {
    const child = new BatchBuilder<T, S>(
      this.connection,
      false,
      this,
      prom,
      msg
    )
    this.children.push(child)
    return child
  }

  public then<TResult1 = T, TResult2 = never>(
    res?: (value: T) => TResult1 | PromiseLike<TResult1>,
    rej?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    this.root.exec?.()
    return super.then(res, rej)
  }
}
