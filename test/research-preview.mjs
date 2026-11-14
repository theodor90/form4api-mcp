// Unit tests for research_company's handling of the get_signals preview
// (Free/Starter/Pro get one market-wide cluster-buy item with preview: true).
// Runs against a stubbed fetch, no network.
//
// Run: node test/research-preview.mjs   (requires npm run build first)

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Form4ApiClient } = require('../dist/client.js')
const { researchCompany } = await import('../dist/tools/research.js')

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

function stubFetch(signalsStatus, signalsBody) {
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname
    const isSignals = path === '/v1/signals'
    const status = isSignals ? signalsStatus : 200
    let body = {}
    if (isSignals) body = signalsBody
    else if (path === '/v1/transactions') body = []
    else if (path.startsWith('/v1/sentiment')) body = { monthly: [] }
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: `HTTP ${status}`,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    }
  }
}

process.env.FORM4API_KEY = 'fapi_test_key'
const client = new Form4ApiClient()

const previewItem = (ticker) => ({
  ticker,
  companyName: `${ticker} Corp`,
  signalDate: '2026-11-12',
  insiderCount: 3,
  buySellRatio: 0,
  isClusterSell: false,
  preview: true,
})

console.log('\nresearch_company signals preview:')

{
  stubFetch(200, [previewItem('OTHR')])
  const out = await researchCompany(client, { ticker: 'aapl', recent_limit: 5 })
  assert(out.signals_preview === true, 'signals_preview is true when the item has preview: true')
  assert(Array.isArray(out.signals) && out.signals.length === 1, 'the preview item is still returned')
  assert(/preview/i.test(out.signals_unavailable ?? ''), 'signals_unavailable labels it a preview')
  assert(/not AAPL|may not be AAPL/.test(out.signals_unavailable ?? ''), 'note says it may not be this ticker')
  assert(out.summary.cluster_signal_present === false, 'an unrelated preview item is not counted as this ticker\'s signal')
  assert(out.summary.cluster_signal_type === null, 'cluster_signal_type stays null for an unrelated preview')
}

{
  stubFetch(200, [previewItem('AAPL')])
  const out = await researchCompany(client, { ticker: 'AAPL', recent_limit: 5 })
  assert(out.signals_preview === true && out.signals_unavailable !== null, 'matching-ticker preview is still labelled a preview')
  assert(out.summary.cluster_signal_present === true, 'a preview item for this very ticker counts as present')
}

{
  stubFetch(200, [
    { signalId: 1, ticker: 'AAPL', companyName: 'Apple', signalType: 'ClusterBuy', detectedAt: '2026-11-01', buyerCount: 3, sellerCount: 0, totalValue: 1, transactionCount: 3, transactions: [] },
  ])
  const out = await researchCompany(client, { ticker: 'AAPL', recent_limit: 5 })
  assert(out.signals_preview === false, 'full feed is not flagged as a preview')
  assert(out.signals_unavailable === null, 'full feed has no unavailable note')
  assert(out.summary.cluster_signal_present === true && out.summary.cluster_signal_type === 'ClusterBuy', 'full feed counts normally')
}

{
  stubFetch(402, { error: { code: 'UPGRADE_REQUIRED', message: 'Business plan required', requestId: 'r1' } })
  const out = await researchCompany(client, { ticker: 'AAPL', recent_limit: 5 })
  assert(out.signals === null && out.signals_preview === false, 'a 402 still yields null signals, not a preview')
  assert(/Business plan/.test(out.signals_unavailable ?? ''), 'a 402 keeps the Business-plan note')
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
