// Unit tests for Form4ApiClient error handling.
//
// The MCP integration test (mcp-test.mjs) drives the real server over stdio
// and cannot reach these paths — provoking a genuine 402/403 would need a
// live key on a specific plan. These run the client directly against a
// stubbed fetch, which is the only way to pin the exact payload an agent
// receives when it hits a paywall.
//
// Run: node test/client-errors.mjs   (requires npm run build first)

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Form4ApiClient, Form4ApiError } = require('../dist/client.js')

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

// Minimal fetch stub: one canned response per call.
function stubFetch({ status, body, headers = {} }) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: (h) => headers[h] ?? null },
    json: async () => body,
  })
}

// Every error the API emits is wrapped as { error: { code, message, requestId } }.
function envelope(code, message) {
  return { error: { code, message, requestId: 'test-request-id' } }
}

async function callAndCatch() {
  const client = new Form4ApiClient()
  try {
    await client.get('/v1/anything')
    return null
  } catch (err) {
    return err
  }
}

async function run() {
  const originalFetch = globalThis.fetch
  process.env.FORM4API_KEY = 'fapi_test_key'

  console.log('\n402 — endpoint above the caller\'s plan:')
  {
    stubFetch({
      status: 402,
      body: envelope(
        'PLAN_REQUIRED',
        'This endpoint requires the Business plan or higher. Your current plan is Free.',
      ),
    })
    const err = await callAndCatch()
    assert(err instanceof Form4ApiError, 'throws Form4ApiError')
    assert(err.statusCode === 402, 'preserves 402 status')
    const p = err.payload
    assert(p?.error === 'upgrade_required', 'payload is tagged upgrade_required')
    assert(p?.required_plan === 'business', 'reads required plan from the message, not just the code')
    assert(p?.current_plan === 'Free', 'reads current plan from the message')
    assert(p?.unlocks?.includes('Business'), 'carries what Business unlocks')
    assert(
      p?.message === 'This endpoint requires the Business plan or higher. Your current plan is Free.',
      'preserves the backend message verbatim',
    )
    assert(p?.pricing_url === 'https://www.form4api.com/pricing', 'includes the pricing URL')
    assert(JSON.parse(err.message).required_plan === 'business', 'message is the JSON payload for the LLM router')
  }

  console.log('\n402 — /v1/transactions page-depth limit:')
  {
    const depthMessage =
      "Page 21 is beyond the Free plan's pagination depth on /v1/transactions (20 pages). " +
      'The Starter plan reaches 100 pages and Pro removes the limit — upgrade at ' +
      'https://form4api.com/dashboard/billing. For a bulk historical pull, ' +
      'GET /v1/transactions/export (Business plan) streams the full filtered set as CSV instead of paging.'
    stubFetch({ status: 402, body: envelope('PLAN_REQUIRED', depthMessage) })
    const err = await callAndCatch()
    const p = err.payload
    assert(p?.current_plan === 'Free', 'reads current plan from the depth phrasing')
    assert(p?.message.includes('/v1/transactions/export'), 'keeps the bulk-export alternative in the message')
    assert(p?.message.includes('20 pages'), 'keeps the specific limit in the message')
    // This message names Free first, then Starter and Pro as options. Guessing
    // one would be wrong more often than useful, so the client stays honest and
    // lets the message itself explain the ladder.
    assert(p?.required_plan === 'higher', 'does not mistake the current plan for the required one')
    assert(p?.unlocks === undefined, 'omits unlocks when the target tier is ambiguous')
  }

  console.log('\n403 — Pro-only query parameter:')
  {
    stubFetch({
      status: 403,
      body: envelope(
        'PRO_TIER_REQUIRED',
        'Filtering by post-trade returns (min_return_*, max_return_*, has_returns) or trade size ' +
          '(max_value, min_shares, max_shares) requires the Pro plan or higher. ' +
          'Upgrade at https://form4api.com/dashboard/billing.',
      ),
    })
    const err = await callAndCatch()
    const p = err.payload
    assert(err.statusCode === 403, 'preserves 403 status')
    assert(p?.error === 'upgrade_required', '403 is shaped as an upgrade, not a raw error')
    assert(p?.required_plan === 'pro', 'reads Pro from the PRO_TIER_REQUIRED code')
    assert(p?.unlocks?.includes('Pro'), 'carries what Pro unlocks')
    assert(p?.message.includes('max_value'), 'keeps the offending parameter list in the message')
  }

  console.log('\nGeneric error — nested envelope must not stringify as [object Object]:')
  {
    stubFetch({ status: 500, body: envelope('INTERNAL_ERROR', 'Something went wrong upstream.') })
    const err = await callAndCatch()
    assert(!err.message.includes('[object Object]'), 'does not leak [object Object] to the agent')
    assert(err.message.includes('Something went wrong upstream.'), 'surfaces the real backend message')
    assert(err.code === 'INTERNAL_ERROR', 'reads the code out of the nested envelope')
  }

  console.log('\nFlat error shape stays supported:')
  {
    stubFetch({ status: 500, body: { code: 'LEGACY', message: 'Flat shape.' } })
    const err = await callAndCatch()
    assert(err.code === 'LEGACY', 'reads a flat code')
    assert(err.message.includes('Flat shape.'), 'reads a flat message')
  }

  console.log('\n429 and 401 keep their dedicated handling:')
  {
    stubFetch({ status: 429, body: envelope('RATE_LIMIT', 'slow down'), headers: { 'Retry-After': '30' } })
    const err = await callAndCatch()
    assert(err.statusCode === 429 && err.message.includes('30'), 'rate-limit message carries Retry-After')

    stubFetch({ status: 401, body: envelope('INVALID_API_KEY', 'The provided API key is invalid.') })
    const err401 = await callAndCatch()
    assert(err401.payload === undefined, '401 is not shaped as an upgrade')
    assert(err401.message.includes('FORM4API_KEY'), '401 points at the key configuration')
  }

  globalThis.fetch = originalFetch

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
