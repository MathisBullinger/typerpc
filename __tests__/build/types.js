const fs = require('fs')
const path = require('path')
const schema = require('./schema')
const { formatType, encode } = require('../../lib/utils/schema')

fs.writeFileSync(
  path.join(__dirname, 'schemaType.ts'),
  `export type Schema=${formatType(encode(schema))}`
)
