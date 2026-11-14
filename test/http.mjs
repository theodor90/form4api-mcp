/**
 * Hosted HTTP mode test. Starts the real HTTP server on a local port, pointed
 * at a local STUB of the Form4API (the live API is never called), and checks:
 *  - initialize + tools/list over POST /mcp (40 tools)
 *  - keyless tool works with no key; keyed tool without a key gets HTTP-mode guidance
 *  - the Bearer / X-Api-Key key reaches the API as X-Api-Key; query-string keys are ignored
 *  - the server's own FORM4API_KEY env var is never used in HTTP mode
 *  - concurrent requests with different keys never cross
 *  - no initialize handshake needed; keyed requests have no per-IP limit by default
 *  - keyless per-IP limiter and global keyless budget (429 + Retry-After), trusted CIDR ranges
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
const { EXPECTED_TOOLS, EXPECTED_DEFAULT_TOOLS } = await import('./expected.mjs')
const { DEFAULT_TOOLS } = require('../dist/toolsets.js')
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
const callRaw = (base, name, args = {}, opts) => rpc(base, 'tools/call', { name, arguments: args }, opts)
// HTTP serves the 15-tool default set unless a request says `?toolsets=all`. Most
// sections below exercise tools outside that set (check_usage, get_public_stats),
// so `call` opts in to everything on purpose. Tests of the default surface use
// rpc() / callRaw() directly.
const withAll = (opts = {}) => ({ ...opts, query: `${opts.query ? `${opts.query}&` : '?'}toolsets=all` })
const call = (base, name, args = {}, opts) => callRaw(base, name, args, withAll(opts))
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
  const list = await rpc(url, 'tools/list', {}, { query: '?toolsets=all' })
  const names = (list.body?.result?.tools ?? []).map((t) => t.name)
  assert(names.length === 40, `?toolsets=all returns 40 tools (got ${names.length})`)
  assert(EXPECTED_TOOLS.every((n) => names.includes(n)), 'every expected tool is present with ?toolsets=all')
  const httpTools = list.body?.result?.tools ?? []
  assert(httpTools.every((t) => typeof t.title === 'string' && t.title.trim().length > 0), 'every tool has a non-empty title over HTTP')
  assert(new Set(httpTools.map((t) => t.title)).size === httpTools.length, 'tool titles are unique over HTTP')
  assert(httpTools.every((t) => t.annotations?.readOnlyHint === true), 'every tool has readOnlyHint over HTTP')
  const list2 = await rpc(url, 'tools/list', {}, { query: '?toolsets=all' })
  assert(JSON.stringify((list2.body?.result?.tools ?? []).map((t) => t.name)) === JSON.stringify(names), 'tools/list order is stable across requests over HTTP')
  const prompts = await rpc(url, 'prompts/list', {})
  assert((prompts.body?.result?.prompts ?? []).length === 6, '6 prompts returned')

  console.log('\n[1b] toolsets: HTTP default is the curated 15')
  const dlist = await rpc(url, 'tools/list', {})
  const dnames = (dlist.body?.result?.tools ?? []).map((t) => t.name)
  assert(dnames.length === 15, `default HTTP tools/list returns exactly 15 tools (got ${dnames.length})`)
  assert(JSON.stringify([...dnames].sort()) === JSON.stringify([...EXPECTED_DEFAULT_TOOLS].sort()), 'the 15 are exactly the curated default set')
  assert(dnames.every((n) => names.includes(n)), 'every default tool is also in the full set')
  const dorder = names.filter((n) => dnames.includes(n))
  assert(JSON.stringify(dnames) === JSON.stringify(dorder), 'default list keeps the same relative order as the full list')
  assert(JSON.stringify((await rpc(url, 'tools/list', {})).body?.result?.tools?.map((t) => t.name)) === JSON.stringify(dnames), 'default order is stable across requests')
  assert(((await rpc(url, 'prompts/list', {}, { query: '?toolsets=default' })).body?.result?.prompts ?? []).length === 6, 'prompts are unaffected by the toolset (6)')
  const explicit = await rpc(url, 'tools/list', {}, { query: '?toolsets=default' })
  assert((explicit.body?.result?.tools ?? []).length === 15, '?toolsets=default is accepted and returns 15')
  for (const v of ['ALL', '%20all%20', 'All']) {
    const r = await rpc(url, 'tools/list', {}, { query: `?toolsets=${v}` })
    assert(r.status === 200 && (r.body?.result?.tools ?? []).length === 40, `?toolsets=${v} is case-insensitive and trimmed: 40 tools`)
  }
  const withOther = await rpc(url, 'tools/list', {}, { query: '?foo=bar&toolsets=all' })
  assert((withOther.body?.result?.tools ?? []).length === 40, '?toolsets works next to other parameters')
  assert(dnames.every((n) => EXPECTED_TOOLS.includes(n)), 'every name in the default set exists in EXPECTED_TOOLS')
  assert(JSON.stringify(DEFAULT_TOOLS) === JSON.stringify(EXPECTED_DEFAULT_TOOLS), 'src DEFAULT_TOOLS matches test/expected.mjs')
  const dinit = await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'http-test', version: '1.0.0' } })
  assert(!/get_public_stats/.test(dinit.body?.result?.instructions ?? ''), 'default-set instructions do not point at a tool that is not there')
  const ainit = await rpc(url, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'http-test', version: '1.0.0' } }, { query: '?toolsets=all' })
  assert(/get_public_stats/.test(ainit.body?.result?.instructions ?? ''), 'full-set instructions still mention get_public_stats')

  console.log('\n[1c] toolsets: unknown value is HTTP 400')
  for (const v of ['bogus', '', 'default,all', 'none']) {
    const r = await rpc(url, 'tools/list', {}, { query: `?toolsets=${v}` })
    assert(r.status === 400, `?toolsets=${v || '(empty)'} returns 400 (got ${r.status})`)
    assert(r.body?.jsonrpc === '2.0' && r.body?.error?.message?.includes('"default" or "all"'), 'body is a JSON-RPC error naming the accepted values')
  }
  const dup = await rpc(url, 'tools/list', {}, { query: '?toolsets=all&toolsets=default' })
  assert(dup.status === 400, 'a repeated parameter with conflicting values is a 400')
  const dupSame = await rpc(url, 'tools/list', {}, { query: '?toolsets=all&toolsets=ALL' })
  assert(dupSame.status === 200 && (dupSame.body?.result?.tools ?? []).length === 40, 'a repeated parameter with the same value is fine')
  const echo = await rpc(url, 'tools/list', {}, { query: '?toolsets=SECRETISH_VALUE_77' })
  assert(echo.status === 400 && !echo.text.includes('SECRETISH_VALUE_77'), 'the 400 body does not echo the bad value')
  const { resolveRequestToolset } = require('../dist/http.js')
  assert(
    resolveRequestToolset('/mcp', 'default') === 'default' && resolveRequestToolset('/mcp?toolsets=all', 'default') === 'all' &&
      resolveRequestToolset('/mcp', 'all') === 'all' && resolveRequestToolset('/mcp?toolsets=x', 'all') === null,
    'resolveRequestToolset: absent -> server default, value -> value, unknown -> null',
  )

  console.log('\n[1d] toolsets: a tool outside the active set')
  upstream.length = 0
  const blocked = await callRaw(url, 'get_public_stats')
  assert(blocked.status === 200 && blocked.body?.result?.isError === true, 'get_public_stats under the default set is a clean tool error')
  assert(toolText(blocked).includes('?toolsets=all') && toolText(blocked).includes('get_public_stats'), 'the error names the tool and says how to enable it (?toolsets=all)')
  assert(toolText(blocked).includes('15') && toolText(blocked).includes('40'), 'the error says 15 default tools and 40 in the full set')
  assert(!blocked.body?.error && blocked.body?.id !== undefined, 'the reply is a normal result carrying the request id')
  assert(upstream.length === 0, 'the handler never ran: nothing reached the upstream API')
  const unknown = await callRaw(url, 'no_such_tool_at_all')
  assert(unknown.body?.result?.isError === true || !!unknown.body?.error, 'a tool that exists nowhere still fails')
  assert(!toolText(unknown).includes('?toolsets=all'), 'a truly unknown tool does not get the enable hint')
  const allowed = await callRaw(url, 'get_recent_filings', {}, { headers: { Authorization: 'Bearer k_default' } })
  assert(upstream.length === 1, 'a default-set tool reaches the handler under the default set')
  assert(!toolText(allowed).includes('?toolsets=all'), 'a default-set tool gets no enable hint')
  upstream.length = 0
  {
    // Own app instance: its cache is separate, so [2] below still sees an uncached first call.
    const fresh = await startApp()
    try {
      const opened = await callRaw(fresh.url, 'get_public_stats', {}, { query: '?toolsets=all' })
      assert(!opened.body?.result?.isError && toolText(opened).includes('123'), 'the same call with ?toolsets=all reaches the handler and returns data')
      assert(upstream.filter((u) => u.path === '/v1/stats').length === 1, 'upstream saw the call under ?toolsets=all')
    } finally {
      fresh.server.close()
    }
  }

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

console.log('\n[9a] no initialize handshake needed (stateless)')
{
  // A fresh server that has never seen an initialize request.
  const { server, url: nurl } = await startApp()
  try {
    const l = await rpc(nurl, 'tools/list', {})
    assert(l.status === 200 && !l.body?.error && (l.body?.result?.tools ?? []).length === EXPECTED_DEFAULT_TOOLS.length, `tools/list without initialize succeeds (${l.status}, ${(l.body?.result?.tools ?? []).length} default tools)`)
    const c = await call(nurl, 'get_public_stats')
    assert(c.status === 200 && !c.body?.error && !c.body?.result?.isError && toolText(c).includes('123'), 'keyless tools/call without initialize succeeds')
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

    // The cache is shared across requests but keyed by tool call, so a result cached
    // under ?toolsets=all must not be served to a connection on the default set.
    upstream.length = 0
    await callRaw(curl, 'get_public_stats', {}, { query: '?toolsets=all' })
    const viaAll = await callRaw(curl, 'get_public_stats', {}, { query: '?toolsets=all' })
    const viaDefault = await callRaw(curl, 'get_public_stats')
    assert(toolText(viaAll).includes('123') && upstream.filter((u) => u.path === '/v1/stats').length === 0, 'under ?toolsets=all the public result is still served from the cache (no new upstream hit)')
    assert(viaDefault.body?.result?.isError === true && !toolText(viaDefault).includes('123'), 'a cached tool outside the default set is not served on the default set')
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

console.log('\n[10b] limit defaults and env parsing')
{
  const d = httpOptionsFromEnv({})
  assert(d.keylessPerMinute === 120 && d.keylessGlobalPerMinute === 1200 && d.perIpPerMinute === 0, `defaults: keyless 120/min per IP, 1200/min global, per-IP flood off (${d.keylessPerMinute}, ${d.keylessGlobalPerMinute}, ${d.perIpPerMinute})`)
  assert(d.trustedProxyCidrs.length === 0 && d.invalidTrustedCidrs.length === 0, 'no trusted proxy ranges by default')
  const e = httpOptionsFromEnv({ MCP_KEYLESS_PER_MINUTE: '7', MCP_KEYLESS_GLOBAL_PER_MINUTE: '0', MCP_PER_IP_PER_MINUTE: '50' })
  assert(e.keylessPerMinute === 7 && e.keylessGlobalPerMinute === 0 && e.perIpPerMinute === 50, 'env overrides parse; 0 turns the global budget off')
  const { parseCidrList } = require('../dist/http.js')
  const p = parseCidrList(' 10.0.0.0/8, bogus, 1.2.3.4/33, ::1/129, 2001:db8::/32 ,1.2.3.4, 10.0.0.0/x, ,1.2.3.4/8/8')
  assert(JSON.stringify(p.valid) === JSON.stringify(['10.0.0.0/8', '2001:db8::/32', '1.2.3.4']), `valid CIDRs kept (${p.valid.join(' ')})`)
  assert(p.invalid.length === 5, `malformed entries set aside, no throw (${p.invalid.length})`)
}

console.log('\n[10c] keyed requests have no per-IP limit by default')
{
  const { server, url: kurl } = await startApp()
  try {
    const codes = []
    for (let batch = 0; batch < 9; batch++) {
      const rs = await Promise.all(Array.from({ length: 40 }, () => rpc(kurl, 'tools/list', {}, { headers: { Authorization: 'Bearer some_key' } })))
      codes.push(...rs.map((r) => r.status))
    }
    assert(codes.length === 360 && codes.every((c) => c === 200), `360 keyed requests from one IP all succeed (${codes.filter((c) => c !== 200).length} rejected)`)
    const origin = await rpc(kurl, 'tools/list', {}, { headers: { Origin: 'https://evil.example' } })
    assert(origin.status === 200, 'no Origin validation: a foreign Origin header is accepted')
  } finally {
    server.close()
  }
}

console.log('\n[10d] global keyless budget')
{
  // trustProxy so each request can come from a different "client", as it does behind a hosted client.
  const { server, url: gurl } = await startApp({ keylessPerMinute: 100, keylessGlobalPerMinute: 4, trustProxy: true })
  try {
    const xff = (n) => ({ headers: { 'X-Forwarded-For': `198.51.100.${n}` } })
    const codes = []
    for (let i = 1; i <= 6; i++) codes.push((await rpc(gurl, 'tools/list', {}, xff(i))).status)
    assert(JSON.stringify(codes) === JSON.stringify([200, 200, 200, 200, 429, 429]), `different IPs share one keyless budget: 4 allowed then 429 (${codes.join(',')})`)
    const res = await fetch(`${gurl}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-Forwarded-For': '198.51.100.99' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    const body = await res.json()
    assert(res.status === 429 && Number(res.headers.get('retry-after')) >= 1, `429 carries Retry-After (${res.headers.get('retry-after')})`)
    assert(body?.jsonrpc === '2.0' && body.error?.code === -32029 && /shared keyless/.test(body.error.message) && body.error.message.includes('Authorization: Bearer'), 'global 429 body is a clear JSON-RPC error pointing at a key')
    const keyed = await rpc(gurl, 'tools/list', {}, { headers: { Authorization: 'Bearer some_key', 'X-Forwarded-For': '198.51.100.1' } })
    assert(keyed.status === 200, 'keyed requests are outside the global keyless budget')
  } finally {
    server.close()
  }
  const { server: s2, url: u2 } = await startApp({ keylessGlobalPerMinute: 0, keylessPerMinute: 100 })
  try {
    const codes = []
    for (let i = 0; i < 20; i++) codes.push((await rpc(u2, 'tools/list', {})).status)
    assert(codes.every((c) => c === 200), 'MCP_KEYLESS_GLOBAL_PER_MINUTE=0 turns the global budget off')
  } finally {
    s2.close()
  }
}

console.log('\n[10e] per-IP keyless 429 has Retry-After')
{
  const { server, url: ru } = await startApp({ keylessPerMinute: 1 })
  try {
    await rpc(ru, 'tools/list', {})
    const res = await fetch(`${ru}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    const body = await res.json()
    assert(res.status === 429 && Number(res.headers.get('retry-after')) >= 1 && body.error?.code === -32029, `per-IP keyless 429 with Retry-After (${res.headers.get('retry-after')})`)
  } finally {
    server.close()
  }
}

console.log('\n[10f] trusted proxy ranges')
{
  // IPv4 range: exempt from the per-IP keyless limit, but still in the global budget.
  const t4 = await startApp({ keylessPerMinute: 1, keylessGlobalPerMinute: 6, trustProxy: true, trustedProxyCidrs: ['203.0.113.0/24', '2001:db8::/32'] })
  try {
    const go = async (ip) => (await rpc(t4.url, 'tools/list', {}, { headers: { 'X-Forwarded-For': ip } })).status
    const trusted = [await go('203.0.113.7'), await go('203.0.113.8'), await go('203.0.113.9')]
    assert(trusted.every((c) => c === 200), `IPv4 trusted range skips the per-IP keyless limit (${trusted.join(',')})`)
    const v6 = [await go('2001:db8::1'), await go('2001:db8:0:1::5')]
    assert(v6.every((c) => c === 200), `IPv6 trusted range skips the per-IP keyless limit (${v6.join(',')})`)
    const other = [await go('198.51.100.1'), await go('198.51.100.1')]
    assert(other[0] === 200 && other[1] === 429, `an address outside the range is still limited per IP (${other.join(',')})`)
    // Counted globally so far: 3 + 2 + 1 allowed non-trusted request = 6 (the per-IP 429 above did not consume any).
    const fromTrusted = await go('203.0.113.10')
    assert(fromTrusted === 429, `trusted clients still count against the global keyless budget (${fromTrusted})`)
  } finally {
    t4.server.close()
  }
  // Malformed entries are ignored; the app still works and the valid entry applies.
  const bad = await startApp({ keylessPerMinute: 1, trustedProxyCidrs: ['127.0.0.0/8'], invalidTrustedCidrs: ['nope'] })
  try {
    const codes = []
    for (let i = 0; i < 3; i++) codes.push((await rpc(bad.url, 'tools/list', {})).status)
    assert(codes.every((c) => c === 200), `loopback in a trusted range is exempt from the per-IP keyless limit (${codes.join(',')})`)
  } finally {
    bad.server.close()
  }
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
    assert(/POST \/mcp 200 \d+ms keyed=yes toolset=all\n/.test(log) && !log.includes('toolsets'), 'the log line names the toolset (toolset=all) without the query string')
  } finally {
    child.kill()
  }
}

console.log('\n[11b] malformed MCP_TRUSTED_PROXY_CIDRS: one warning line, no crash')
{
  const free = await new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
  const child = spawn('node', [path.resolve(here, '../dist/index.js'), '--http'], {
    env: { ...process.env, PORT: String(free), HOST: '127.0.0.1', FORM4API_BASE_URL: stubUrl, MCP_TRUSTED_PROXY_CIDRS: '10.0.0.0/8, bogus, 1.2.3.4/99' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d })
  try {
    let up = false
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${free}/healthz`)).status === 200 } catch { await new Promise((r) => setTimeout(r, 100)) }
    }
    assert(up, 'server starts despite malformed CIDR entries')
    const warnings = log.split('\n').filter((l) => l.includes('MCP_TRUSTED_PROXY_CIDRS'))
    assert(warnings.length === 1 && warnings[0].includes('bogus') && warnings[0].includes('1.2.3.4/99') && !warnings[0].includes('10.0.0.0/8'), `exactly one warning line naming only the bad entries (${warnings.length})`)
  } finally {
    child.kill()
  }
}

console.log('\n[11c] MCP_DEFAULT_TOOLSETS')
{
  const d = httpOptionsFromEnv({})
  assert(d.defaultToolset === 'default' && d.invalidDefaultToolset === null, 'HTTP default toolset is "default" when the env var is unset')
  const a = httpOptionsFromEnv({ MCP_DEFAULT_TOOLSETS: ' ALL ' })
  assert(a.defaultToolset === 'all' && a.invalidDefaultToolset === null, 'MCP_DEFAULT_TOOLSETS is case-insensitive and trimmed')
  const b = httpOptionsFromEnv({ MCP_DEFAULT_TOOLSETS: 'everything' })
  assert(b.defaultToolset === 'default' && b.invalidDefaultToolset === 'everything', 'an unknown value falls back to "default" and is flagged for a warning')

  const { server, url: aurl } = await startApp({ defaultToolset: 'all' })
  try {
    const all = await rpc(aurl, 'tools/list', {})
    assert((all.body?.result?.tools ?? []).length === 40, 'with MCP_DEFAULT_TOOLSETS=all a plain request gets 40 tools')
    const narrowed = await rpc(aurl, 'tools/list', {}, { query: '?toolsets=default' })
    assert((narrowed.body?.result?.tools ?? []).length === 15, '...and a request can still narrow itself with ?toolsets=default')
    const bad = await rpc(aurl, 'tools/list', {}, { query: '?toolsets=nope' })
    assert(bad.status === 400, 'an unknown ?toolsets value is still a 400 when the server default is "all"')
  } finally {
    server.close()
  }

  async function spawnHttp(extraEnv) {
    const free = await new Promise((resolve) => {
      const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
    })
    const child = spawn('node', [path.resolve(here, '../dist/index.js'), '--http'], {
      env: { ...process.env, PORT: String(free), HOST: '127.0.0.1', FORM4API_BASE_URL: stubUrl, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out = { log: '' }
    child.stderr.on('data', (x) => { out.log += x })
    let up = false
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`http://127.0.0.1:${free}/healthz`)).status === 200 } catch { await new Promise((r) => setTimeout(r, 100)) }
    }
    return { base: `http://127.0.0.1:${free}`, child, out, up }
  }

  const s1 = await spawnHttp({ MCP_DEFAULT_TOOLSETS: 'ALL' })
  try {
    const l = await rpc(s1.base, 'tools/list', {})
    assert(s1.up && (l.body?.result?.tools ?? []).length === 40, 'spawned with MCP_DEFAULT_TOOLSETS=ALL: plain request lists 40 tools')
    await new Promise((r) => setTimeout(r, 100))
    assert(/POST \/mcp 200 \d+ms keyed=no toolset=all\n/.test(s1.out.log), 'log line says toolset=all')
    assert(!s1.out.log.includes('MCP_DEFAULT_TOOLSETS'), 'no warning for a valid value')
  } finally {
    s1.child.kill()
  }

  const s2 = await spawnHttp({ MCP_DEFAULT_TOOLSETS: 'bogus-value' })
  try {
    const l = await rpc(s2.base, 'tools/list', {})
    assert(s2.up && (l.body?.result?.tools ?? []).length === 15, 'spawned with an unknown MCP_DEFAULT_TOOLSETS: starts and falls back to the 15 default tools')
    const bad = await rpc(s2.base, 'tools/list', {}, { query: '?toolsets=zzz' })
    await new Promise((r) => setTimeout(r, 100))
    const warnings = s2.out.log.split('\n').filter((x) => x.includes('MCP_DEFAULT_TOOLSETS'))
    assert(warnings.length === 1 && warnings[0].includes('bogus-value') && warnings[0].includes('"default" or "all"'), 'exactly one startup warning line naming the accepted values')
    assert(/POST \/mcp 200 \d+ms keyed=no toolset=default\n/.test(s2.out.log), 'log line says toolset=default')
    assert(bad.status === 400 && /POST \/mcp 400 \d+ms keyed=no toolset=invalid\n/.test(s2.out.log) && !s2.out.log.includes('zzz'), 'a rejected request logs toolset=invalid, never the value')
  } finally {
    s2.child.kill()
  }
}

stub.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
