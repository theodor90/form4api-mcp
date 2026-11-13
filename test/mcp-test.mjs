/**
 * MCP protocol test — spawns the server and verifies:
 *  1. initialize handshake
 *  2. tools/list returns all 40 tools with correct names (stdio default stays `all`;
 *     FORM4API_TOOLSETS=default gives the curated 15, see [7b])
 *  3. prompts/list returns all 6 recipe prompts
 *  4. prompts/get returns rendered messages for a sample of prompts
 *  5. (optional) live tool call if FORM4API_KEY is set
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.resolve(__dirname, '../dist/index.js')
// Read the version from package.json (the server does the same) so the assertion
// never drifts on a bump.
const PKG_VERSION = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version

import { EXPECTED_TOOLS, EXPECTED_PROMPTS, EXPECTED_DEFAULT_TOOLS } from './expected.mjs'

/**
 * Spawns the stdio server with extra env, lists its tools and prompts, and
 * returns the names plus everything it wrote to stderr.
 */
async function listStdio(extraEnv) {
  const env = { ...process.env, FORM4API_KEY: 'fapi_test_key', ...extraEnv }
  for (const k of Object.keys(extraEnv)) if (extraEnv[k] === undefined) delete env[k]
  const child = spawn('node', [serverPath], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  const rl = createInterface({ input: child.stdout })
  const waiting = new Map()
  rl.on('line', (line) => {
    try {
      const m = JSON.parse(line)
      if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    } catch { /* ignore */ }
  })
  let id = 1
  const ask = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = id++
      waiting.set(myId, resolve)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n')
      setTimeout(() => reject(new Error(`timeout: ${method}`)), 5000)
    })
  try {
    await ask('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
    const tools = (await ask('tools/list', {})).result?.tools ?? []
    const prompts = (await ask('prompts/list', {})).result?.prompts ?? []
    const blocked = await ask('tools/call', { name: 'get_public_stats', arguments: {} })
    return { names: tools.map((t) => t.name), prompts: prompts.map((p) => p.name), stderr, blocked }
  } finally {
    child.kill()
  }
}

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
  delete env.FORM4API_TOOLSETS // the default-mode assertions below must not inherit an opt-in

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
    assert(initRes.result?.serverInfo?.version === PKG_VERSION, `serverInfo.version === "${PKG_VERSION}"`)
    assert(!initRes.error, 'no error in initialize response')

    // Send initialized notification (no response expected)
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

    // ── Test 2: tools/list ────────────────────────────────────────────────
    console.log('\n[2] tools/list — 40 tools registered')
    const listRes = await send('tools/list', {})
    const toolNames = (listRes.result?.tools ?? []).map(t => t.name)
    assert(!listRes.error, 'no error in tools/list response')
    assert(toolNames.length === 40, `40 tools returned (got ${toolNames.length})`)
    for (const name of EXPECTED_TOOLS) {
      assert(toolNames.includes(name), `tool "${name}" present`)
    }

    // ── Test 2b: directory metadata on every tool ────────────────────────
    console.log('\n[2b] tools/list — titles, readOnlyHint, name length, stable order')
    const listedTools = listRes.result?.tools ?? []
    const titles = listedTools.map(t => t.title)
    assert(listedTools.every(t => typeof t.title === 'string' && t.title.trim().length > 0), 'every tool has a non-empty title')
    assert(new Set(titles).size === titles.length, 'tool titles are unique')
    assert(
      listedTools.every(t => t.annotations?.title === t.title),
      'annotations.title matches the top-level title on every tool',
    )
    assert(listedTools.every(t => t.annotations?.readOnlyHint === true), 'every tool has annotations.readOnlyHint === true')
    assert(listedTools.every(t => t.name.length <= 64), 'every tool name is 64 characters or fewer')
    assert(
      listedTools.every(t => !/\.$/.test(t.title) && /^[A-Z0-9]/.test(t.title)),
      'titles have no trailing period and start with a capital or digit',
    )
    const listAgain = await send('tools/list', {})
    assert(
      JSON.stringify((listAgain.result?.tools ?? []).map(t => t.name)) === JSON.stringify(toolNames),
      'a second tools/list returns the same order',
    )

    // ── Test 3: tool schema spot-check ───────────────────────────────────
    console.log('\n[3] Tool schema spot-check')
    const txTool = listRes.result?.tools?.find(t => t.name === 'get_transactions')
    assert(txTool?.inputSchema?.properties?.ticker !== undefined, 'get_transactions has ticker param')
    assert(txTool?.inputSchema?.properties?.exclude_10b5 !== undefined, 'get_transactions has exclude_10b5 param')
    assert(txTool?.inputSchema?.properties?.code !== undefined, 'get_transactions has code param')
    assert(txTool?.inputSchema?.properties?.min_return_1d !== undefined, 'get_transactions has min_return_1d param')
    assert(txTool?.inputSchema?.properties?.has_returns !== undefined, 'get_transactions has has_returns param')
    assert(txTool?.inputSchema?.properties?.inst_ownership_trend !== undefined, 'get_transactions has inst_ownership_trend param')

    const signalsTool = listRes.result?.tools?.find(t => t.name === 'get_signals')
    assert(signalsTool?.inputSchema?.properties?.cluster_buy !== undefined, 'get_signals has cluster_buy param')

    // ── Test 4: prompts/list — 6 recipe prompts ───────────────────────────
    console.log('\n[4] prompts/list — 6 recipe prompts registered')
    const promptsListRes = await send('prompts/list', {})
    const promptNames = (promptsListRes.result?.prompts ?? []).map(p => p.name)
    assert(!promptsListRes.error, 'no error in prompts/list response')
    assert(promptNames.length === 6, `6 prompts returned (got ${promptNames.length})`)
    for (const name of EXPECTED_PROMPTS) {
      assert(promptNames.includes(name), `prompt "${name}" present`)
    }
    const insiderMonitorMeta = promptsListRes.result?.prompts?.find(p => p.name === 'insider_monitor')
    assert(typeof insiderMonitorMeta?.description === 'string' && insiderMonitorMeta.description.length > 0, 'insider_monitor has a description')
    assert(
      (insiderMonitorMeta?.arguments ?? []).some(a => a.name === 'ticker'),
      'insider_monitor declares a "ticker" argument',
    )

    // ── Test 5: prompts/get — rendered messages for a sample of prompts ──
    console.log('\n[5] prompts/get — insider_monitor')
    const insiderMonitorRes = await send('prompts/get', {
      name: 'insider_monitor',
      arguments: { ticker: 'AAPL' },
    })
    assert(!insiderMonitorRes.error, 'no error in prompts/get(insider_monitor) response')
    const insiderMonitorMessages = insiderMonitorRes.result?.messages ?? []
    assert(insiderMonitorMessages.length > 0, 'insider_monitor returns at least one message')
    assert(insiderMonitorMessages[0]?.role === 'user', 'insider_monitor message role is "user"')
    assert(
      typeof insiderMonitorMessages[0]?.content?.text === 'string' && insiderMonitorMessages[0].content.text.includes('AAPL'),
      'insider_monitor message text interpolates the ticker argument',
    )
    assert(
      insiderMonitorMessages[0].content.text.includes('research_company'),
      'insider_monitor message references the research_company tool',
    )

    console.log('\n[6] prompts/get — post_selloff_buys (default min_return)')
    const postSelloffRes = await send('prompts/get', {
      name: 'post_selloff_buys',
      arguments: {},
    })
    assert(!postSelloffRes.error, 'no error in prompts/get(post_selloff_buys) response')
    const postSelloffMessages = postSelloffRes.result?.messages ?? []
    assert(postSelloffMessages.length > 0, 'post_selloff_buys returns at least one message')
    assert(
      typeof postSelloffMessages[0]?.content?.text === 'string' && postSelloffMessages[0].content.text.includes('get_insider_scorecard'),
      'post_selloff_buys message references the get_insider_scorecard tool',
    )
    assert(
      postSelloffMessages[0].content.text.includes('0.05'),
      'post_selloff_buys message applies the default min_return of 0.05',
    )

    console.log('\n[7] prompts/get — unknown prompt name is rejected')
    const unknownPromptRes = await send('prompts/get', { name: 'not_a_real_prompt', arguments: {} })
    assert(!!unknownPromptRes.error, 'prompts/get with an unknown name returns a protocol error')

    // ── Test 7b: toolsets over stdio ─────────────────────────────────────
    console.log('\n[7b] stdio toolsets — FORM4API_TOOLSETS')
    assert(toolNames.length === EXPECTED_TOOLS.length, `stdio default (no env) keeps all ${EXPECTED_TOOLS.length} tools`)
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    const defaultRun = await listStdio({ FORM4API_TOOLSETS: 'default' })
    assert(defaultRun.names.length === 15, `FORM4API_TOOLSETS=default lists exactly 15 tools (got ${defaultRun.names.length})`)
    assert(same(defaultRun.names, EXPECTED_DEFAULT_TOOLS), 'the 15 are exactly the curated default set')
    assert(defaultRun.prompts.length === 6, 'prompts are unaffected by the toolset (6)')
    assert(defaultRun.stderr.trim() === 'Form4API MCP server running on stdio', 'no warning for a valid value')
    assert(
      defaultRun.blocked.result?.isError === true || !!defaultRun.blocked.error,
      'a tool outside the default set (get_public_stats) is not callable',
    )
    const loud = await listStdio({ FORM4API_TOOLSETS: '  ALL ' })
    assert(loud.names.length === EXPECTED_TOOLS.length, 'FORM4API_TOOLSETS is case-insensitive and trimmed ("  ALL ")')
    const bad = await listStdio({ FORM4API_TOOLSETS: 'everything' })
    assert(bad.names.length === EXPECTED_TOOLS.length, 'an unknown FORM4API_TOOLSETS value falls back to all tools')
    const warnLines = bad.stderr.split('\n').filter((l) => l.includes('FORM4API_TOOLSETS'))
    assert(warnLines.length === 1 && warnLines[0].includes('"default" or "all"'), 'one warning line naming the accepted values')
    const dist = await import('../dist/toolsets.js')
    assert(JSON.stringify(dist.DEFAULT_TOOLS) === JSON.stringify(EXPECTED_DEFAULT_TOOLS), 'src DEFAULT_TOOLS matches test/expected.mjs')
    assert(EXPECTED_DEFAULT_TOOLS.every((n) => EXPECTED_TOOLS.includes(n)), 'every default-set name is a real registered tool')
    assert(new Set(EXPECTED_DEFAULT_TOOLS).size === 15, 'the default set has 15 distinct names')

    // ── Test 8: live tool call (only if real key provided) ───────────────
    if (process.env.FORM4API_KEY && !process.env.FORM4API_KEY.startsWith('fapi_test')) {
      console.log('\n[8] Live tool call — check_usage')
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

      console.log('\n[9] Live tool call — get_transactions (AAPL, 5 results)')
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
      console.log('\n[8] Skipping live API tests (no real FORM4API_KEY set)')
      console.log('     Run with: FORM4API_KEY=YOUR_API_KEY node test/mcp-test.mjs')
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
