// Unit tests for the get_company_peers tool (codegen'd from GET /v1/companies/{ticker}/peers).
// Runs the real generated handler against a stubbed fetch — no network.
//
// Run: node test/company-peers.mjs   (requires npm run build first)

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Form4ApiClient, Form4ApiError } = require('../dist/client.js')
const { GENERATED_TOOLS } = await import('../dist/tools/_generated.js')

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

const tool = GENERATED_TOOLS.find((t) => t.name === 'get_company_peers')

const requested = []
function stubFetch({ status, body }) {
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: `HTTP ${status}`,
      headers: { get: () => null },
      json: async () => body,
    }
  }
}

process.env.FORM4API_KEY = 'fapi_test_key'
const client = new Form4ApiClient()

console.log('\nget_company_peers:')
assert(tool !== undefined, 'tool is registered')
assert(tool.path === '/v1/companies/{ticker}/peers', 'maps to /v1/companies/{ticker}/peers')

const peersBody = {
  ticker: 'AAPL',
  sicCode: '3571',
  sicDescription: 'Electronic Computers',
  basis: 'sic4',
  peers: [
    { ticker: 'DELL', name: 'Dell Technologies Inc.', cik: '0001571996', sicCode: '3571', filings12m: 42, matchLevel: 'sic4' },
  ],
}

{
  stubFetch({ status: 200, body: peersBody })
  const out = await tool.handler(client, { ticker: 'aapl' })
  const url = new URL(requested.at(-1))
  assert(url.pathname === '/v1/companies/aapl/peers', 'happy path hits the peers path')
  assert(!url.searchParams.has('limit'), 'limit omitted when not provided')
  assert(out.basis === 'sic4' && out.peers[0].ticker === 'DELL', 'returns the parsed response')
}

{
  stubFetch({ status: 200, body: peersBody })
  await tool.handler(client, { ticker: 'AAPL', limit: 5 })
  const url = new URL(requested.at(-1))
  assert(url.searchParams.get('limit') === '5', 'limit is passed through as a query param')
}

{
  stubFetch({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Unknown ticker', requestId: 'r1' } } })
  let err = null
  try {
    await tool.handler(client, { ticker: 'ZZZZ' })
  } catch (e) {
    err = e
  }
  assert(err instanceof Form4ApiError, '404 throws Form4ApiError')
  assert(err?.statusCode === 404 && err?.code === 'NOT_FOUND', '404 carries NOT_FOUND code')
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
