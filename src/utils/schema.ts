export const encode = (node: any): any => {
  if (node === null) return
  if (typeof node === 'function') {
    const name = node.prototype?.constructor?.name
    return name === 'Object' ? 'any' : name?.toLowerCase()
  }
  if (Array.isArray(node)) return node.map(encode)
  if (typeof node === 'object')
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, encode(v)])
    )
  return node
}

export const formatType = (schema: any) => {
  const res = Object.fromEntries(
    Object.entries(
      schema
    ).map(([k, { params = 'never', result = 'void' }]: any) => [
      k,
      { params, result },
    ])
  )

  console.log(res.add)

  return JSON.stringify(res).replace(/"/g, '')
}
