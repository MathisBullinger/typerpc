export const add = (a: number, b: number) => a + b

type Messages = {
  foo: string
  bar: number
}

type Method = keyof Messages

const send = <T extends Method>(method: T, payload: Messages[T]) => {}
