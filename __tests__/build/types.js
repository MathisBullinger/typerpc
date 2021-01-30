const fs = require('fs')
const path = require('path')
const schema = require('./schema')
const { encode } = require('../../lib/utils/schema')

const schemaStr = JSON.stringify(encode(schema)).replace(/"/g, '')

fs.writeFileSync(
  path.join(__dirname, 'schemaType.ts'),
  `export const schema=${schemaStr} as const\nexport type Schema=typeof schema`
)
