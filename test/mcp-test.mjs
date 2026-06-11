/**
 * MCP protocol test — spawns the server and verifies:
 *  1. initialize handshake
 *  2. tools/list returns all 20 tools with correct names
 *  3. (optional) live tool call if FORM4API_KEY is set
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.resolve(__dirname, '../dist/index.js')

const EXPECTED_TOOLS = [
  'get_transactions',
  'get_recent_filings',
  'get_filing',
  'get_insider_profile',
  'get_insider_transactions',
  'get_company_overview',
  'get_company_insiders',
  'get_signals',
  // Tier A additions (PLAN_MCP_DEFENSE Phase 1, 2026-06-01)
  'get_form144',
  'get_holdings',
  'get_managers',
  'get_sentiment',
  'get_insider_career_summary',
  'check_usage',
  // Auto-generated from OpenAPI (PLAN_MCP_DEFENSE Phase 4, 2026-06-01)
  'search_insiders',
  'get_key_activity',
  'get_usage_history',
  'list_webhooks',
  'get_webhook_events',
  // Auto-generated after the backend list endpoint shipped (2026-06-03 SEO arc)
  'list_companies',
]

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

async function runTest() {
  const env = { ...process.env, FORM4API_KEY: process.env.FORM4API_KEY ?? 'fapi_test_key' }

  const server = spawn('node', [serverPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const rl = createInterface({ input: server.stdout })
  const responses = []
  const pending = new Map()
  let nextId = 1

  rl.on('line', (line) => {
    if (!line.trim()) return
    try {
      const msg = JSON.parse(line)
      responses.push(msg)
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id)
        pending.delete(msg.id)
        resolve(msg)
      }
    } catch {
      // ignore non-JSON lines
    }
  })

  function send(method, params) {
    const id = nextId++
    const msg = { jsonrpc: '2.0', id, method, params }
    server.stdin.write(JSON.stringify(msg) + '\n')
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`Timeout waiting for response to ${method}`))
        }
      }, 5000)
    })
  }

  try {
    // ── Test 1: initialize ────────────────────────────────────────────────
    console.log('\n[1] MCP initialize handshake')
    const initRes = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    })
    assert(initRes.result?.serverInfo?.name === 'form4api', 'serverInfo.name === "form4api"')
    assert(initRes.result?.serverInfo?.version === '1.3.0', 'serverInfo.version === "1.3.0"')
    assert(!initRes.error, 'no error in initialize response')

    // Send initialized notification (no response expected)
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

    // ── Test 2: tools/list ────────────────────────────────────────────────
    console.log('\n[2] tools/list — 20 tools registered')
    const listRes = await send('tools/list', {})
    const toolNames = (listRes.result?.tools ?? []).map(t => t.name)
    assert(!listRes.error, 'no error in tools/list response')
    assert(toolNames.length === 20, `20 tools returned (got ${toolNames.length})`)
    for (const name of EXPECTED_TOOLS) {
      assert(toolNames.includes(name), `tool "${name}" present`)
    }

    // ── Test 3: tool schema spot-check ───────────────────────────────────
    console.log('\n[3] Tool schema spot-check')
    const txTool = listRes.result?.tools?.find(t => t.name === 'get_transactions')
    assert(txTool?.inputSchema?.properties?.ticker !== undefined, 'get_transactions has ticker param')
    assert(txTool?.inputSchema?.properties?.exclude_10b5 !== undefined, 'get_transactions has exclude_10b5 param')
    assert(txTool?.inputSchema?.properties?.code !== undefined, 'get_transactions has code param')

    const signalsTool = listRes.result?.tools?.find(t => t.name === 'get_signals')
    assert(signalsTool?.inputSchema?.properties?.cluster_buy !== undefined, 'get_signals has cluster_buy param')

    // ── Test 4: live tool call (only if real key provided) ───────────────
    if (process.env.FORM4API_KEY && !process.env.FORM4API_KEY.startsWith('fapi_test')) {
      console.log('\n[4] Live tool call — check_usage')
      const callRes = await send('tools/call', {
        name: 'check_usage',
        arguments: {},
      })
      assert(!callRes.error, 'no error in tools/call response')
      assert(!callRes.result?.isError, 'check_usage did not return tool error')
      const content = callRes.result?.content?.[0]?.text
      if (content) {
        const usage = JSON.parse(content)
        assert(typeof usage.plan === 'string', `plan field present: "${usage.plan}"`)
        assert(typeof usage.requestsToday === 'number', `requestsToday: ${usage.requestsToday}`)
        assert(typeof usage.dailyLimit === 'number', `dailyLimit: ${usage.dailyLimit}`)
        console.log(`     → Plan: ${usage.plan}, ${usage.requestsToday}/${usage.dailyLimit} requests today`)
      }

      console.log('\n[5] Live tool call — get_transactions (AAPL, 5 results)')
      const txRes = await send('tools/call', {
        name: 'get_transactions',
        arguments: { ticker: 'AAPL', per_page: 5, exclude_10b5: true },
      })
      assert(!txRes.error, 'no error in get_transactions response')
      assert(!txRes.result?.isError, 'get_transactions did not return tool error')
      const txContent = txRes.result?.content?.[0]?.text
      if (txContent) {
        const txs = JSON.parse(txContent)
        assert(Array.isArray(txs), 'response is an array')
        if (txs.length > 0) {
          const tx = txs[0]
          assert('transactionCode' in tx, 'transaction has transactionCode')
          assert('isOpenMarket' in tx, 'transaction has isOpenMarket')
          assert('is10b5Plan' in tx, 'transaction has is10b5Plan')
          assert('totalValue' in tx, 'transaction has totalValue')
          assert('insiderTitle' in tx, 'transaction has insiderTitle')
          console.log(`     → ${txs.length} transactions, first: ${tx.insiderName} (${tx.transactionCode}) @ ${tx.transactionDate}`)
        }
      }
    } else {
      console.log('\n[4] Skipping live API tests (no real FORM4API_KEY set)')
      console.log('     Run with: FORM4API_KEY=fapi_live_xxx node test/mcp-test.mjs')
    }

  } catch (err) {
    console.error('\nTest error:', err.message)
    failed++
  } finally {
    server.kill()
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`Results: ${passed} passed, ${failed} failed`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

runTest()
