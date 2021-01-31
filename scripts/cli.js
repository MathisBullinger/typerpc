#!/usr/bin/env node
const WebSocket = require('ws')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')

const [, , ...args] = process.argv
args.forEach(v => v.toLowerCase())

const cmd = str => `${chalk.green('typerpc')} ${chalk.greenBright(str)}`
const title = str => chalk.bold(str.toUpperCase())
const indent = str => '    ' + str

const warn = msg => console.warn(` ${chalk.yellow('› ' + msg)}\n`)
const error = msg => console.error(` ${chalk.red('› ' + msg)}\n`)

main()

function main() {
  const cmd = args[0]
  if (!cmd || cmd.startsWith('-')) return printInfo(args[1])

  if (cmd === 'help') return printInfo(args[1])
  if (cmd === 'schema') return fetchSchema(...args.slice(1))

  console.log(chalk.yellow(cmd) + ' is not a valid typerpc command')
  console.log(`Run ${cmd('help')} for help`)
}

function fetchSchema(...args) {
  if (args.length && !args[0].startsWith('-')) {
    let url = args[0]
    if (!/^\w+:\/\//.test(url))
      url = `${
        ['localhost', '127.0.0.1'].includes(url.toLowerCase().split(/[:/]/)[0])
          ? 'ws'
          : 'wss'
      }://${url}`

    console.log(`fetch schema from ${url}`)

    const ws = new WebSocket(url)

    ws.onerror = e => {
      const addr = chalk.redBright(url)
      const code = e.message.match(/response: (\d+)$/i)
      if (code)
        error(
          `${addr} responded with unexected status code: ${200}. Is this a WebSocket endpoint?`
        )
      else error(`failed to query ${addr}`)
    }

    ws.onmessage = ({ data }) => {
      const res = JSON.parse(data)
      if (typeof res !== 'object' || res.id !== 0) return
      if (!res.result) {
        error('server did not respond with a valid schema')
        if (res.error && res.error.code === -32601)
          warn('it looks like introspection is disabled on this server')
      } else {
        let outPath = ''
        const i = args.findIndex(v => v === '-o')
        if (i !== -1) outPath = args[i + 1]
        if (!/\.ts$/.test(outPath)) outPath = path.join(outPath, 'schema.ts')
        const dir = outPath.split('/').slice(0, -1).join('/')
        if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        let output = `/* This file has been automatically generated TypeRPC
 * https://github.com/MathisBullinger/typerpc
 *
 * endpoint:   ${url}
 * generated:  ${new Date().toISOString()} */

const schema = ${JSON.stringify(res.result).replace(/"/g, '')} as const
export type Schema = typeof schema`
        fs.writeFileSync(outPath, output)

        console.log(`output written to ${outPath}`)
      }
      ws.close()
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: '__schema' }))
    }
  } else {
    warn('no endpoint specified')
    console.log(`For help run ${cmd('help schema')}`)
  }
}

function printInfo(cmd = args[1]) {
  let info = ''
  switch (cmd) {
    case 'schema':
      info = `Fetch a schema from a running TypeRPC server
      
${title('usage')}
${indent(
  `$ typerpc schema ${chalk.grey('[ENDPOINT]')} -o ${chalk.grey('[PATH]')}`
)}`
      break

    default:
      info = `Command line tool for TypeRTC

${title('usage')}
${indent('$ typerpc [COMMAND]')}
  
${title('commands')}
${indent('schema  Fetch the schema from a running TypeRPC server')}
${indent('help    Display available commands')}
`
  }

  console.log(info)
}
