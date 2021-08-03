# TypeRPC

At its core, this is an implementation of the [JSON-RPC 2.0
specification](https://www.jsonrpc.org/specification) in TypeScript. The library 
provides transport agnostic interfaces for the RPC Client and the Server.

On top of that the server takes a description of its available methods, their 
parameters and their result type (if one exists). This description is also used 
to infer static types for all requests, responses, and method resolvers. The 
client can use the same types to provide TypeScript definitions for its methods.

## Schema Definition

The server accepts a schema definition of the following structure:

`{ [name of method]: { params?: TYPE, result?: TYPE } }`

where `TYPE` can be defined as follows:

- the `String` or `Number` constructors are translated to their
respective primitive type
- `Object` is interpreted as `any`
- `null` is `null`
- these options can be combined in tuples (e.g. `[String, Number]`) that 
will be typed as such (fixed length and type) and in nested objects (e.g. `{ name: String, age: Number }`)
- *there is a restriction right now that tuples can only contain primitive types
and can't be further nested*

`params` and `result` can both be omitted. If `result` is omitted, the method
is interpreted as a [notification](https://www.jsonrpc.org/specification#notification), meaning the server will not send a response for the method. In the client this will result in
the method only being available via the `.notify` method.

## Resolvers

The methods have to be defined via the endpoint's `.on(name, resolver)` method.
The `resolver` is typed according to the schema description. If a resolver is
asynchronous the server will wait for it to resolve. If a resolver throws or
rejects, the server returns a `-32603 (Internal error)` error.

If a client calls a method for which no resolver has been registered, the server
responds with `-32601 (Method not found)`.

If a client provides an id for a method for which no result type has been 
declared (i.e. expects a response for a notification), the server will execute
the method but respond with an `-32001 (Invalid notification id)` error.

## Batch Requests

Multiple requests can be batched to be sent as a single request, as described by the [JSON-RPC spec](https://www.jsonrpc.org/specification#batch).

To create a batched request, use the `.batch()` method, and call `.notify` and `.call` on the resulting object as you would with a regular request. E.g.:

``` ts
const batch = server.batch()
const prom3 = batch.call('add', 1, 2)
const prom5 = batch.call('add', 2, 3)
const prom7 = batch.call('add', 3, 4)
```

The request will be sent once either the batch object itself or any of requests
created from it is resolved (either by calling `.then()` on it or `await`ing it).
After the request is sent, trying to add more requests to the batch will result
in an error.

Requests can also be added to the batch by chaining `.call` or `.notify` on any
of the batches other requests. So these are functionally equivalent to the above
example:

```ts
server.batch().call('add', 1, 2).call('add', 2, 3).call('add', 3, 4)
```
```ts
const batch = server.batch()
const prom5 = batch.call('add', 1, 2).call('add', 2, 3)
const prom7 = batch.call('add', 3, 4)
```

If all requests are successful, the batch promise will resolve to an array of
all results, otherwise it will reject with the error of the first failed request:

```ts
const batch = server.batch()
await Promise.all([
  batch.call('add', 1, 2),
  batch.notify('hello'),
  batch.call('add', 2, 3),
  batch
]) // resolves to [3, 5, [3, 5]]

const batch = server.batch()
const prom3 = server.add('add', 1, 2)
const invalid = server.add('add', '!!')

await batch   // rejects with { code: -32602, message: "Invalid params"}
await prom3   // resolves to 3
await invalid // rejects with { code: -32602, message: "Invalid params"}
```

## Introspection

The server provides the `__schema` method to query its schema description 
(including any internal methods that may exist). Constructors (`String`, 
`Number`, `Object`) will be encoded as strings, e.g. `Number` -> `"Number"`.

This can be used to generate types to provide to the client of the API.

Schema introspection can be disabled by setting `introspection: false` in the 
server options.

## Examples

### Basic calculator without network transport

```ts
import Endpoint, { Transport } from '.'

const calculatorCPU = new Endpoint({
  add: { params: [Number, Number], result: Number },
  shutdown: {},
})

calculatorCPU.on('add', ([a, b]) => a + b)
calculatorCPU.on('shutdown', () => {/*...*/})

// In this example the user doesn't provide any API that the calculator
// could call into.
// Note however, that in principle, there is no distinction between a "client"
// and the "server", and both sides can act as both at the same time.
const user = new Endpoint(null)

// For now, let's just directly send all messages from the user to the calculator
// and vice versa.
// In the real world, the transports would probably do something more useful, like
// sending the messages through HTTP requests, accross threads or something along
// those lines.
// More complex transports will also want to route messages differently based
// on the address they were sent to / received from.
// An example of transports that send & receive messages through websockets in
// a browser and AWS Lambda functions with an API gateway can be found in src/transport/ws
const calcTransport: Transport<any> = {
  in(msg, caller) {
    this.onInput?.(msg, caller)
  },
  out(address, msg) {
    userTransport.in(msg, '/calc')
  },
}
const userTransport: Transport<any> = {
  in(msg, caller) {
    this.onInput?.(msg, caller)
  },
  out(address, msg) {
    if (address !== '/calc') throw Error("that's not the calculator")
    calcTransport.in(msg, '/user')
  },
}
calculatorCPU.addTransport(calcTransport, { default: true })
user.addTransport(userTransport, { default: true })

// The schema of any endpoint can also be introspected by calling its __schema method
type Schema = typeof calculatorCPU extends Endpoint<infer I> ? I : never

// This is the interface that the user will use to speak to the calculator.
// You can think of it as the calculators buttons that the user presses.
// Connections will use the default transport unless specified otherwise.
const calculator = user.addConnection<Schema>('/calc')

// Now that the user and calculator can speak to each other, let's do some maths:
const sum = await calculator.call('add', 1, 2) // -> 3 🎉

// And turn the calculator off, we don't need to wait for a result for that
calculator.notify('shutdown')
```
