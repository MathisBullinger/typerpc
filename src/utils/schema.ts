export const encode = (node: any): any => {
  if (node === null) return
  if (typeof node === 'function') return node.prototype?.constructor?.name
  if (Array.isArray(node)) return node.map(encode)
  if (typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, encode(v)])
    )
  return node
}
