// Unit tests for the MCP text-channel formatter.
//
// The integration test (mcp-test.mjs) checks that tools respond; it cannot
// check what the response reads like, because that needs a live key and a
// deterministic payload. These run the formatter directly over fixtures that
// stand in for the real response shapes — flat lists, lists carrying nested
// collections, single objects, and the empty case.
//
// Run: node test/format.mjs   (requires npm run build first)

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatToolResult, formatCell, renderTable } = require('../dist/format.js')

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

// A row shaped like the real Transaction interface.
const txn = (over = {}) => ({
  transactionId: 184920331,
  accessionNumber: '0000320193-26-000042',
  filedAt: '2026-08-19T20:31:00Z',
  transactionDate: '2026-08-17',
  transactionCode: 'P',
  sharesAmount: 12500,
  pricePerShare: 231.44,
  totalValue: 2893000,
  isOpenMarket: true,
  is10b5Plan: false,
  companyName: 'Apple Inc.',
  ticker: 'AAPL',
  companyCik: '0000320193',
  insiderName: 'Cook Timothy D',
  insiderCik: '0001214128',
  insiderTitle: 'Chief Executive Officer',
  isDirector: false,
  isOfficer: true,
  is10PctOwner: false,
  ...over,
})

console.log('\nCell formatting')
assert(formatCell(null) === '—', 'null renders as an em dash, not "null"')
assert(formatCell(undefined) === '—', 'undefined renders as an em dash')
assert(formatCell('') === '—', 'empty string renders as an em dash')
assert(formatCell(true) === 'yes' && formatCell(false) === 'no', 'booleans read as yes/no')
assert(formatCell(12500) === '12500', 'integers stay exact — no decimals on share counts')
assert(formatCell(231.4444) === '231.44', 'money-scale numbers round to 2dp')

// Returns and hit rates are stored as FRACTIONS (0.0234 is +2.34%). At 2dp the
// leaderboard's whole ranking column collapses: +2.34% and +1.51% both print
// "0.02", and a -0.30% return prints "-0.00".
assert(formatCell(0.0234) === '0.0234', 'a fractional return keeps the digits that carry its meaning')
assert(formatCell(0.109) === '0.109', 'a 10.9% return does not round to 11%')
assert(formatCell(-0.003) === '-0.003', 'a small negative return keeps its sign and size')
assert(!formatCell(-0.003).startsWith('-0.00') || formatCell(-0.003).length > 5, 'no "-0.00" cells')
assert(formatCell(0.6667) === '0.6667', 'a hit rate keeps four decimals')
assert(formatCell(1234.5678) === '1234.57', 'above 1, two decimals is still enough')
assert(formatCell(NaN) === '—', 'NaN renders as an em dash rather than "NaN"')
assert(formatCell('a\nb  c') === 'a b c', 'newlines collapse so a cell cannot break the row')
assert(formatCell('x'.repeat(200)).length === 80, 'long strings truncate to the cell cap')
assert(formatCell([]) === '[]' && formatCell({}) === '{}', 'empty containers render as literals')

console.log('\nTable rendering')
{
  const out = renderTable([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
  const lines = out.split('\n')
  assert(lines[0] === 'a | b', 'header names each key once')
  assert(lines[1] === '1 | x' && lines[2] === '2 | y', 'one line per row')
  assert(lines.length === 3, 'no header repeat on a short table')
}
{
  // A field absent from the first row must still get a column.
  const out = renderTable([{ a: 1 }, { a: 2, b: 'late' }])
  assert(out.split('\n')[0] === 'a | b', 'columns collect across all rows, not just the first')
  assert(out.split('\n')[1] === '1 | —', 'a row missing that field renders an em dash')
}
{
  const out = renderTable([{ a: 'x | y' }])
  assert(!out.split('\n')[1].includes('|'), 'a pipe inside a value cannot fake a column break')
}
{
  const out = renderTable(Array.from({ length: 41 }, () => ({ a: 1 })))
  const lines = out.split('\n')
  assert(lines[lines.length - 1] === 'a', 'a long table repeats its header at the bottom')
}

console.log('\nPayload routing')
{
  const out = formatToolResult([txn(), txn({ transactionCode: 'S' })])
  assert(out.startsWith('2 rows.\n'), 'a list is prefixed with its row count')
  assert(out.split('\n').length === 4, 'two rows render as count + header + 2 lines')
  assert(out.includes('Cook Timothy D'), 'row values survive into the table')
  assert(!out.includes('"insiderName"'), 'key names are not repeated per row')
}
assert(formatToolResult([]) === 'No results.', 'an empty list says so instead of printing []')
assert(formatToolResult([txn()]).startsWith('1 row.'), 'the row count is singular at one row')
{
  // get_signals attaches each signal's transactions; flattening would lose them.
  const signal = { signalId: 1, ticker: 'AAPL', transactions: [txn()] }
  const out = formatToolResult([signal])
  assert(out.includes('"transactionId"'), 'rows with nested collections fall back to JSON')
  assert(JSON.parse(out).length === 1, 'that fallback is valid, parseable JSON')
}
{
  // An empty nested array carries nothing, so the table is still lossless.
  const out = formatToolResult([{ signalId: 1, transactions: [] }])
  assert(out.startsWith('1 row.'), 'an empty nested collection still tables')
}
{
  // Single-object endpoints (get_company_overview, verify_setup) are unchanged.
  const obj = { cik: '0000320193', name: 'Apple Inc.', ticker: 'AAPL' }
  const out = formatToolResult(obj)
  assert(out === JSON.stringify(obj, null, 2), 'a single object keeps its pretty JSON')
}
assert(formatToolResult(['a', 'b']).startsWith('['), 'a list of scalars is not a table')

console.log('\nSize')
{
  const rows = Array.from({ length: 100 }, () => txn())
  const before = JSON.stringify(rows, null, 2).length
  const after = formatToolResult(rows).length
  const ratio = before / after
  console.log(`  100 transactions: ${before.toLocaleString('en-US')} chars -> ${after.toLocaleString('en-US')} chars (${ratio.toFixed(1)}x smaller)`)
  assert(ratio > 2.5, 'a 100-row payload shrinks by more than 2.5x')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
