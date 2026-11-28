/**
 * Strict tool arguments: an argument a tool does not take must be an error that
 * names it and the accepted ones, never silently dropped. In 1.19.0,
 * get_recent_filings called with the removed `page` argument returned page 1.
 * No network: validation runs before any handler, and the client points at a
 * closed port so a call that does pass validation fails fast instead.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../dist/server.js'
import { Form4ApiClient } from '../dist/client.js'

let passed = 0
let failed = 0
function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    failed++
  }
}

const api = new Form4ApiClient('test', { baseUrl: 'http://127.0.0.1:9' })
const { server } = buildServer(api)
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
await server.connect(serverSide)
const client = new Client({ name: 'strict-args-test', version: '0' })
await client.connect(clientSide)

/** Calls a tool and returns the error text, whether the SDK reports it as a tool error or a JSON-RPC error. */
async function errorText(name, args) {
  try {
    const r = await client.callTool({ name, arguments: args })
    return r.isError ? r.content.map((c) => c.text).join('\n') : ''
  } catch (e) {
    return String(e.message ?? e)
  }
}

console.log('Strict tool arguments')

const { tools } = await client.listTools()
assert(tools.length === 40, `40 tools listed (${tools.length})`)
assert(
  tools.every((t) => t.inputSchema.additionalProperties === false),
  'every tool schema declares additionalProperties: false',
)
assert(
  tools.every((t) => t.annotations?.destructiveHint === false),
  'every tool sets destructiveHint: false explicitly',
)
assert(
  tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.openWorldHint === true),
  'every tool keeps readOnlyHint and openWorldHint true',
)

const removed = await errorText('get_recent_filings', { per_page: 3, page: 2 })
assert(removed.includes('Unknown argument "page"'), 'the removed page argument is rejected by name')
assert(removed.includes('get_recent_filings accepts: ticker, per_page'), 'the error lists the accepted arguments')

const two = await errorText('get_transactions', { ticker: 'AAPL', foo: 1, bar: 2 })
assert(two.includes('Unknown arguments "foo", "bar"'), 'several unknown arguments are all named')

const none = await errorText('verify_setup', { x: 1 })
assert(/Unknown argument "x"/.test(none), 'a tool with no arguments rejects any argument')

const generated = await errorText('search_insiders', { nope: true })
assert(generated.includes('Unknown argument "nope"'), 'generated tools are strict too')

const valid = await errorText('get_recent_filings', { per_page: 3 })
assert(!valid.includes('Unknown argument'), 'valid arguments pass validation (fails later on the closed port)')

const typo = await errorText('get_recent_filings', { per_page: 'ten' })
assert(typo.length > 0 && !typo.includes('Unknown argument'), 'a wrong type still gets the normal validation error')

await client.close()
console.log(`\nResults: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
