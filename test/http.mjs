/**
 * Hosted HTTP mode test. Starts the real HTTP server on a local port, pointed
 * at a local STUB of the Form4API (the live API is never called), and checks:
 *  - initialize + tools/list over POST /mcp (38 tools)
 *  - keyless tool works with no key; keyed tool without a key gets HTTP-mode guidance
 *  - the Bearer / X-Api-Key key reaches the API as X-Api-Key; query-string keys are ignored
 *  - the server's own FORM4API_KEY env var is never used in HTTP mode
 *  - concurrent requests with different keys never cross
 *  - keyless per-IP limiter (429) that does not apply to keyed requests
 *  - GET/DELETE /mcp 405, /healthz, 1 MB body limit (413)
 *  - `node dist/index.js --http` starts, and its log never contains a key
 *
 * Run: node test/http.mjs   (requires npm run build first)
 */
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { createHttpApp, httpOptionsFromEnv } = require('../dist/http.js')
const { EXPECTED_TOOLS } = await import('./expected.mjs')
const PKG_VERSION = JSON.parse(readFileSync(path.resolve(here, '../package.json'), 'utf8')).version

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

// A server-side env key that must NEVER show up upstream in HTTP mode.
process.env.FORM4API_KEY = 'ENV_KEY_MUST_NOT_LEAK'

// ── Stub Form4API ───────────────────────────────────────────────────────────
const upstream = [] // { path, key, ua }
const stub = http.createServer((req, res) => {
  const key = req.headers['x-api-key'] ?? null
  const url = new URL(req.url, 'http://x')
  upstream.push({ path: url.pathname, key, ua: req.headers['user-agent'] })
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/v1/stats') return reply(200, { totalFilings: 123 })
  if (url.pathname === '/v1/keys/usage') {
    if (!key) return reply(401, { error: { code: 'UNAUTHORIZED', message: 'Missing key' } })
    // Random delay so concurrent requests overlap and would cross if state were shared.
    return setTimeout(() => reply(200, { plan: 'Free', requestsToday: 1, dailyLimit: 500, echoedKey: key }), Math.random() * 60)
  }
  reply(404, { error: { code: 'NOT_FOUND', message: 'nope' } })
})
await new Promise((r) => stub.listen(0, '127.0.0.1', r))
const stubUrl = `http://127.0.0.1:${stub.address().port}`

async function startApp(overrides = {}) {
  const opts = { ...httpOptionsFromEnv({}), port: 0, host: '127.0.0.1', baseUrl: stubUrl, log: false, ...overrides }
  const { server } = createHttpApp(opts)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { server, url: `http://127.0.0.1:${server.address().port}` }
}

let rpcId = 1
async function rpc(base, method, params, { headers = {}, query = '' } = {}) {
  const res = await fetch(`${base}/mcp${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body, text }
}
const call = (base, name, args = {}, opts) => rpc(base, 'tools/call', { name, arguments: args }, opts)
const toolText = (r) => r.body?.result?.content?.[0]?.text ?? ''

const { server: app, url } = await startApp()

try {
  console.log('\n[1] initialize + tools/list')
  const init = await rpc(url, 'initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'http-test', version: '1.0.0' },
  })
  assert(init.status === 200, `initialize returns 200 (got ${init.status})`)
  assert(init.body?.result?.serverInfo?.name === 'form4api', 'serverInfo.name is form4api')
  assert(init.body?.result?.serverInfo?.version === PKG_VERSION, `serverInfo.version is ${PKG_VERSION}`)
  const list = await rpc(url, 'tools/list', {})
  const names = (list.body?.result?.tools ?? []).map((t) => t.name)
  assert(names.length === 38, `38 tools returned (got ${names.length})`)
  assert(EXPECTED_TOOLS.every((n) => names.includes(n)), 'every expected tool is present')
  const prompts = await rpc(url, 'prompts/list', {})
  assert((prompts.body?.result?.prompts ?? []).length === 6, '6 prompts returned')

  console.log('\n[2] keyless tool works with no key')
  upstream.length = 0
  const stats = await call(url, 'get_public_stats')
  assert(stats.status === 200 && !stats.body?.result?.isError, 'get_public_stats succeeds without a key')
  assert(toolText(stats).includes('123'), 'result carries the stubbed API data')
  assert(upstream.length === 1 && upstream[0].key === null, 'no X-Api-Key sent upstream (server env key not used)')
  assert(/^form4api-mcp\/\S+ \(remote\)$/.test(upstream[0].ua), `User-Agent is "${upstream[0].ua}"`)

  console.log('\n[3] keyed tool without a key')
  const nokey = await call(url, 'check_usage')
  assert(nokey.body?.result?.isError === true, 'check_usage without a key is a tool error')
  assert(toolText(nokey).includes('Authorization: Bearer'), 'guidance says to send Authorization: Bearer')
  assert(!toolText(nokey).includes('env'), 'guidance does not mention env vars')

  console.log('\n[4] Bearer and X-Api-Key reach the API as X-Api-Key')
  upstream.length = 0
  const bearer = await call(url, 'check_usage', {}, { headers: { Authorization: 'Bearer key_bearer_1' } })
  assert(!bearer.body?.result?.isError && toolText(bearer).includes('key_bearer_1'), 'Bearer key used upstream')
  assert(upstream[0]?.key === 'key_bearer_1', 'upstream saw exactly the Bearer key')
  const xkey = await call(url, 'check_usage', {}, { headers: { 'X-Api-Key': 'key_header_2' } })
  assert(toolText(xkey).includes('key_header_2'), 'X-Api-Key header used upstream')
  const both = await call(url, 'check_usage', {}, { headers: { Authorization: 'Bearer key_a', 'X-Api-Key': 'key_b' } })
  assert(toolText(both).includes('key_a'), 'Authorization wins over X-Api-Key')

  console.log('\n[5] query-string keys are ignored')
  upstream.length = 0
  const qs = await call(url, 'check_usage', {}, { query: '?api_key=QS_KEY&key=QS_KEY&apiKey=QS_KEY&x-api-key=QS_KEY' })
  assert(qs.body?.result?.isError === true, 'call with only a query-string key is treated as keyless')
  assert(upstream.every((u) => u.key === null), 'query-string key never sent upstream')

  console.log('\n[6] concurrent requests with different keys never cross')
  upstream.length = 0
  const N = 40
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      call(url, 'check_usage', {}, { headers: { Authorization: `Bearer concurrent_key_${i}` } }).then((r) => ({ i, r })),
    ),
  )
  const crossed = results.filter(({ i, r }) => {
    const found = toolText(r).match(/concurrent_key_\d+/g) ?? []
    return found.length === 0 || found.some((k) => k !== `concurrent_key_${i}`)
  })
  assert(crossed.length === 0, `all ${N} responses carry their own caller's key (${crossed.length} crossed)`)
  const seen = upstream.map((u) => u.key).sort()
  const want = Array.from({ length: N }, (_, i) => `concurrent_key_${i}`).sort()
  assert(JSON.stringify(seen) === JSON.stringify(want), 'upstream saw each key exactly once, none leaked or duplicated')

  console.log('\n[7] GET and DELETE /mcp return 405; other paths')
  for (const m of ['GET', 'DELETE']) {
    const r = await fetch(`${url}/mcp`, { method: m })
    const b = await r.json().catch(() => null)
    assert(r.status === 405, `${m} /mcp returns 405 (got ${r.status})`)
    assert(b?.jsonrpc === '2.0' && b?.error?.code !== undefined, `${m} /mcp body is a JSON-RPC error`)
  }
  assert((await fetch(`${url}/nope`)).status === 404, 'unknown path returns 404')

  console.log('\n[8] /healthz')
  const hz = await fetch(`${url}/healthz`)
  const hzBody = await hz.json()
  assert(hz.status === 200 && hzBody.status === 'ok' && hzBody.version === PKG_VERSION, `/healthz -> 200 ${JSON.stringify(hzBody)}`)
  assert(hz.headers.get('access-control-allow-origin') === null, 'no CORS headers')

  console.log('\n[9] body size limit')
  const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(1024 * 1024 + 10) } })
  const status413 = await new Promise((resolve) => {
    const u = new URL(url)
    const req = http.request(
      { host: u.hostname, port: u.port, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(big) } },
      (res) => { res.resume(); resolve(res.statusCode) },
    )
    req.on('error', () => resolve('error'))
    req.end(big)
  })
  assert(status413 === 413, `>1 MB body returns 413 (got ${status413})`)
  const bad = await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' })
  assert(bad.status === 400, `invalid JSON returns 400 (got ${bad.status})`)
} finally {
  app.close()
}

console.log('\n[9b] flood guard applies to keyed requests too')
{
  const { server, url: furl } = await startApp({ perIpPerMinute: 4 })
  try {
    const codes = []
    for (let i = 0; i < 6; i++) codes.push((await rpc(furl, 'tools/list', {}, { headers: { Authorization: 'Bearer junk' } })).status)
    assert(JSON.stringify(codes) === JSON.stringify([200, 200, 200, 200, 429, 429]), `keyed: 4 allowed then 429 (${codes.join(',')})`)
    const over = await rpc(furl, 'tools/list', {}, { headers: { 'X-Api-Key': 'junk' } })
    assert(over.status === 429 && over.body?.error?.code === -32029, '429 body is a JSON-RPC error')
    assert((await fetch(`${furl}/healthz`)).status === 200, '/healthz is outside the flood guard')
  } finally {
    server.close()
  }
}

console.log('\n[9c] public tool cache')
{
  const { server, url: curl } = await startApp()
  try {
    upstream.length = 0
    await call(curl, 'get_public_stats')
    const second = await call(curl, 'get_public_stats')
    const third = await call(curl, 'get_public_stats', {}, { headers: { Authorization: 'Bearer some_key' } })
    assert(toolText(second).includes('123') && toolText(third).includes('123'), 'cached calls still return the data (keyless and keyed)')
    assert(upstream.filter((u) => u.path === '/v1/stats').length === 1, 'identical public calls within the TTL hit upstream once')

    upstream.length = 0
    await call(curl, 'check_usage', {}, { headers: { Authorization: 'Bearer private_key_A' } })
    await call(curl, 'check_usage', {}, { headers: { Authorization: 'Bearer private_key_B' } })
    await call(curl, 'check_usage', {}, { headers: { Authorization: 'Bearer private_key_A' } })
    const keys = upstream.filter((u) => u.path === '/v1/keys/usage').map((u) => u.key)
    assert(JSON.stringify(keys) === JSON.stringify(['private_key_A', 'private_key_B', 'private_key_A']), `keyed private tool is never cached (${keys.join(',')})`)
  } finally {
    server.close()
  }
  const { TtlCache } = require('../dist/cache.js')
  const c = new TtlCache(1000, 200)
  let loads = 0
  await c.wrap('check_usage', {}, async () => ++loads)
  await c.wrap('check_usage', {}, async () => ++loads)
  assert(loads === 2 && c.size === 0, 'tools outside the allowlist never enter the cache')
  let t = 0
  const c2 = new TtlCache(1000, 3, () => t)
  for (let i = 0; i < 5; i++) await c2.wrap('get_data_quality', { i }, async () => i)
  assert(c2.size === 3, 'cache is capped at its max entries')
  let n = 0
  await c2.wrap('get_status_history', {}, async () => ++n)
  await c2.wrap('get_status_history', {}, async () => ++n)
  t = 5000
  await c2.wrap('get_status_history', {}, async () => ++n)
  assert(n === 2, 'entries expire after the TTL')
  let threw = false
  try { await c2.wrap('health_ingestion', {}, async () => { throw new Error('x') }) } catch { threw = true }
  assert(threw && (await c2.wrap('health_ingestion', {}, async () => 'ok')) === 'ok', 'failures are not cached')
}

console.log('\n[10] keyless limiter')
{
  const { server, url: lurl } = await startApp({ keylessPerMinute: 3 })
  try {
    const codes = []
    for (let i = 0; i < 5; i++) codes.push((await rpc(lurl, 'tools/list', {})).status)
    assert(JSON.stringify(codes) === JSON.stringify([200, 200, 200, 429, 429]), `keyless: 3 allowed then 429 (${codes.join(',')})`)
    const limited = await rpc(lurl, 'tools/list', {})
    assert(limited.body?.error?.message?.includes('Authorization: Bearer'), '429 body is a JSON-RPC error pointing at a key')
    const keyedCodes = []
    for (let i = 0; i < 6; i++) keyedCodes.push((await rpc(lurl, 'tools/list', {}, { headers: { Authorization: 'Bearer some_key' } })).status)
    assert(keyedCodes.every((c) => c === 200), `keyed requests are not limited (${keyedCodes.join(',')})`)
    const xk = await rpc(lurl, 'tools/list', {}, { headers: { 'X-Api-Key': 'some_key' } })
    assert(xk.status === 200, 'X-Api-Key requests are not limited either')
    const hz = await fetch(`${lurl}/healthz`)
    assert(hz.status === 200, '/healthz is not limited')
  } finally {
    server.close()
  }
}
{
  // X-Forwarded-For is only honoured with TRUST_PROXY=1.
  const noTrust = await startApp({ keylessPerMinute: 1, trustProxy: false })
  const a = (await rpc(noTrust.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': '1.1.1.1' } })).status
  const b = (await rpc(noTrust.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': '2.2.2.2' } })).status
  assert(a === 200 && b === 429, `without TRUST_PROXY, X-Forwarded-For is ignored (${a},${b})`)
  noTrust.server.close()
  const trust = await startApp({ keylessPerMinute: 1, trustProxy: true })
  const c = (await rpc(trust.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': '1.1.1.1, 9.9.9.9' } })).status
  const d = (await rpc(trust.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': '2.2.2.2' } })).status
  const e = (await rpc(trust.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': '1.1.1.1' } })).status
  assert(c === 200 && d === 200 && e === 429, `with TRUST_PROXY, the first hop is the client (${c},${d},${e})`)
  trust.server.close()
}

console.log('\n[11] `node dist/index.js --http` (spawned) logs no secrets')
{
  const free = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
  const child = spawn('node', [path.resolve(here, '../dist/index.js'), '--http'], {
    env: { ...process.env, PORT: String(free), HOST: '127.0.0.1', FORM4API_BASE_URL: stubUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  child.stdout.on('data', (d) => { log += d })
  try {
    let up = false
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${free}/healthz`)).status === 200 } catch { await new Promise((r) => setTimeout(r, 100)) }
    }
    assert(up, '--http starts and serves /healthz')
    const r = await call(`http://127.0.0.1:${free}`, 'check_usage', {}, { headers: { Authorization: 'Bearer SENTINEL_SECRET_KEY_9' }, query: '?k=SENTINEL_QS_9' })
    assert(toolText(r).includes('SENTINEL_SECRET_KEY_9'), 'keyed call works through the spawned server')
    await new Promise((r2) => setTimeout(r2, 100))
    assert(/POST \/mcp 200 \d+ms keyed=yes/.test(log), 'one access line per request (method path status ms keyed)')
    assert(!log.includes('SENTINEL_SECRET_KEY_9') && !log.includes('SENTINEL_QS_9') && !log.includes('ENV_KEY_MUST_NOT_LEAK'), 'log contains no key, query string or env key')
  } finally {
    child.kill()
  }
}

stub.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
