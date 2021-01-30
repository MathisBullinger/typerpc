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

The methods have to be defined via the server's `.on(name, resolver)` method.
The `resolver` is typed according to the schema description. If a resolver is
asynchronous the server will wait for them to resolve. If a resolver throws or
rejects, the server returns a `-32603 (Internal error)` error.

If a client calls a method for which no resolver has been registered, the server
responds with `-32601 (Method not found)`.

If a client provides an id for a method for which no result type has been 
declared (i.e. expects a response for a notification), the server will execute
the method but respond with an `-32001 (Invalid notification id)` error.

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
// server side

import createServer from 'typerpc/server'

const calculator = createServer({
  add: { params: [Number, Number], result: Number },
  shutdown: {},
})

calculator.on('add', ([a, b]) => a + b)
calculator.on('shutdown', () => { /*...*/ })

// For this example let's directly connect the server's
// and client's output & input channels.
// Usually the "transport" would send the requests through
// and receive responses from a network.
const transport = calculator.createChannel()

// client side

import createClient from 'typerpc/client'
import Schema from '<remoteSchema.ts>' // = typeof serverSchema

const client = createClient()

client.out = transport.in // send the client's output to the server
transport.out = client.in // ...and the server's output to the client

// call a remote procedure and store the result
const sum = await client.call('add', 1, 2) // -> sum = 3 🎉

// notify the server to shutdown without waiting for a result
client.notify('shutdown')
```

``` ts
// introspect the server's schema
const schema = await client('__schema')
/* schema = {
  "add": { "params": ["Number", "Number"], result: "Number" } },
  "shutdown": {},
  "__schema": "Object"
} */
```
