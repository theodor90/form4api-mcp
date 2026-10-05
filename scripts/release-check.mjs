/**
 * Pre-publish gate — tests the package users actually install, not the source tree.
 *
 * Stages (stops at the first failure):
 *   1. Version sync       package.json / server.json / CHANGELOG (warns if git tag exists)
 *   2. Build and pack     npm run build, npm pack --json into a temp dir
 *   3. Static lint        publint --strict on the tarball, ajv on server.json,
 *                         mcp-publisher validate (SKIP if the binary is absent)
 *   4. Install isolated   npm install <tgz> in a fresh temp project, resolve bin
 *   5. Smoke test         stdio MCP against the INSTALLED bin (tools, prompts, version)
 *   6. Live stage         verify_setup + 4 read-only tools (needs FORM4API_TEST_KEY)
 *   7. Dry-run publish    npm publish --dry-run, fails on any "npm warn" line
 *
 * Flags:
 *   --offline   skip stage 6 (CI)
 *   --keep      keep the temp directories for debugging
 *
 * Run: npm run release:check            (FORM4API_TEST_KEY set)
 *      npm run release:check -- --offline
 */
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED_TOOLS, EXPECTED_PROMPTS } from '../test/expected.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'
const args = new Set(process.argv.slice(2))
const OFFLINE = args.has('--offline')
const KEEP = args.has('--keep')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const pkg = readJson(path.join(ROOT, 'package.json'))
const TEST_KEY = process.env.FORM4API_TEST_KEY || ''

const results = []
const tempDirs = []

class StageFailure extends Error {}
const fail = (msg) => {
  throw new StageFailure(msg)
}
const note = (msg) => console.log(`     ${msg}`)

/** Replace the test key in any text that is about to be printed. */
function redact(text) {
  let out = String(text)
  if (TEST_KEY) out = out.split(TEST_KEY).join('***')
  return out
}

/**
 * Run a command to completion. On Windows npm is npm.cmd, which needs a shell;
 * arguments here are fixed strings or temp paths, quoted when they contain spaces.
 */
function run(cmd, cmdArgs, opts = {}) {
  const quote = (a) => (IS_WIN && /[\s&|<>^()]/.test(a) ? `"${a}"` : a)
  const res = spawnSync(IS_WIN ? [cmd, ...cmdArgs.map(quote)].join(' ') : cmd, IS_WIN ? [] : cmdArgs, {
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    shell: IS_WIN,
    maxBuffer: 64 * 1024 * 1024,
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', error: res.error }
}

function makeTemp(label) {
  const dir = mkdtempSync(path.join(tmpdir(), `f4mcp-${label}-`))
  tempDirs.push(dir)
  return dir
}

function tail(text, n = 15) {
  return redact(text).trim().split(/\r?\n/).slice(-n).join('\n     ')
}

// ── Shared state between stages ────────────────────────────────────────────
const state = { tarball: null, installDir: null, binPath: null }

// ── Stage 1: version sync ─────────────────────────────────────────────────
async function stageVersionSync() {
  const server = readJson(path.join(ROOT, 'server.json'))
  const version = pkg.version
  const mismatches = []
  if (server.version !== version) mismatches.push(`server.json .version is ${server.version}`)
  const pkgEntry = server.packages?.[0]?.version
  if (pkgEntry !== version) mismatches.push(`server.json .packages[0].version is ${pkgEntry}`)

  const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
  // Headings look like "## [1.15.2] — 2026-10-05". [Unreleased] is skipped by the digit match.
  const m = changelog.match(/^## \[(\d+\.\d+\.\d+[^\]]*)\]/m)
  if (!m) mismatches.push('CHANGELOG.md has no "## [x.y.z]" entry')
  else if (m[1] !== version) mismatches.push(`CHANGELOG.md top entry is [${m[1]}]`)

  if (mismatches.length) fail(`package.json is ${version} but ${mismatches.join('; ')}`)
  note(`version ${version} in package.json, server.json (x2), CHANGELOG.md`)

  // Read-only: a pre-existing tag is a warning, not a failure.
  const tag = run('git', ['tag', '-l', `v${version}`])
  if (tag.status === 0 && tag.stdout.trim() === `v${version}`) {
    note(`WARN: git tag v${version} already exists`)
  }
}

// ── Stage 2: build and pack ───────────────────────────────────────────────
async function stageBuildPack() {
  const build = run('npm', ['run', 'build'])
  if (build.status !== 0) fail(`npm run build failed:\n     ${tail(build.stdout + build.stderr)}`)

  const packDir = makeTemp('pack')
  const pack = run('npm', ['pack', '--json', '--pack-destination', packDir])
  if (pack.status !== 0) fail(`npm pack failed:\n     ${tail(pack.stdout + pack.stderr)}`)
  let info
  try {
    info = JSON.parse(pack.stdout)[0]
  } catch {
    fail(`could not parse npm pack --json output:\n     ${tail(pack.stdout)}`)
  }
  const tarball = path.join(packDir, info.filename)
  if (!existsSync(tarball)) fail(`npm pack reported ${info.filename} but ${tarball} does not exist`)
  state.tarball = tarball
  note(`${info.filename} (${info.entryCount} files, ${info.size} bytes)`)
  note(`tarball: ${tarball}`)
}

// ── Stage 3: static lint ──────────────────────────────────────────────────
async function stageStaticLint() {
  // publint, strict, against the packed tarball (what npm users get).
  const { publint } = await import('publint')
  const { readFileSync: rf } = await import('node:fs')
  const buf = rf(state.tarball)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const lint = await publint({ strict: true, level: 'suggestion', pack: { tarball: ab } })
  if (lint.messages.length) {
    const { formatMessage } = await import('publint/utils')
    const lines = lint.messages.map((msg) => `[${msg.type}] ${String(formatMessage(msg, lint.pkg) ?? msg.code).replace(/\[[0-9;]*m/g, '')}`)
    fail(`publint --strict reported ${lint.messages.length} issue(s):\n     ${lines.join('\n     ')}`)
  }
  note('publint --strict: no issues')

  // server.json against the schema named in its own $schema field.
  const server = readJson(path.join(ROOT, 'server.json'))
  const schemaUrl = server.$schema
  if (!schemaUrl) fail('server.json has no $schema field')
  let schema
  try {
    const res = await fetch(schemaUrl, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) fail(`could not fetch ${schemaUrl}: HTTP ${res.status}`)
    schema = await res.json()
  } catch (err) {
    if (err instanceof StageFailure) throw err
    fail(`could not fetch ${schemaUrl} (network failure: ${err.cause?.code ?? err.message}). server.json was NOT validated.`)
  }
  const Ajv = (await import('ajv')).default
  const addFormats = (await import('ajv-formats')).default
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (!validate(server)) {
    const errs = validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`)
    fail(`server.json does not match ${schemaUrl}:\n     ${errs.join('\n     ')}`)
  }
  note(`server.json valid against ${schemaUrl}`)

  // mcp-publisher validate, only if the binary is in the repo root.
  const publisher = [path.join(ROOT, 'mcp-publisher.exe'), path.join(ROOT, 'mcp-publisher')].find(existsSync)
  if (!publisher) {
    note('mcp-publisher binary not found in repo root: validate SKIP')
    return 'pass'
  }
  const v = run(publisher, ['validate'])
  if (v.status !== 0) fail(`mcp-publisher validate failed:\n     ${tail(v.stdout + v.stderr)}`)
  note('mcp-publisher validate: ok')
}

// ── Stage 4: install in isolation ─────────────────────────────────────────
async function stageInstall() {
  const dir = makeTemp('install')
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'release-check-consumer', version: '0.0.0', private: true }))
  const inst = run('npm', ['install', state.tarball, '--no-audit', '--no-fund'], { cwd: dir })
  if (inst.status !== 0) fail(`npm install of the tarball failed:\n     ${tail(inst.stdout + inst.stderr)}`)

  const pkgDir = path.join(dir, 'node_modules', pkg.name)
  if (!existsSync(path.join(pkgDir, 'package.json'))) fail(`${pkg.name} not found in ${pkgDir} after install`)
  const installed = readJson(path.join(pkgDir, 'package.json'))
  if (installed.version !== pkg.version) fail(`installed version is ${installed.version}, expected ${pkg.version}`)

  // Resolve the bin from the INSTALLED package.json, exactly as npm would link it.
  const bin = typeof installed.bin === 'string' ? { [installed.name]: installed.bin } : installed.bin
  if (!bin || !bin[pkg.name]) fail(`installed package.json has no bin["${pkg.name}"] (bin = ${JSON.stringify(installed.bin)})`)
  const binPath = path.resolve(pkgDir, bin[pkg.name])
  if (!existsSync(binPath)) fail(`installed bin["${pkg.name}"] points at ${bin[pkg.name]}, which does not exist in the package`)

  // The shim npm creates for consumers must exist too.
  const shim = path.join(dir, 'node_modules', '.bin', IS_WIN ? `${pkg.name}.cmd` : pkg.name)
  if (!existsSync(shim)) fail(`npm did not create the bin shim ${shim}`)

  state.installDir = dir
  state.binPath = binPath
  note(`installed ${installed.name}@${installed.version}`)
  note(`bin["${pkg.name}"] -> ${bin[pkg.name]} (exists)`)
}

// ── Minimal MCP stdio client ──────────────────────────────────────────────
function startServer(env) {
  const child = spawn(process.execPath, [state.binPath], {
    cwd: state.installDir,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const pending = new Map()
  let nextId = 1
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.trim()) return
    try {
      const msg = JSON.parse(line)
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    } catch {
      // ignore non-JSON lines
    }
  })
  child.on('exit', (code) => {
    for (const resolve of pending.values()) resolve({ error: { message: `server exited (code ${code}). stderr: ${redact(stderr).slice(-300)}` } })
    pending.clear()
  })
  const send = (method, params, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, resolve)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`timeout waiting for ${method}`))
      }, timeoutMs)
    })
  return { child, send }
}

async function handshake(send, child) {
  const init = await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'release-check', version: '1.0.0' } })
  if (init.error) fail(`initialize failed: ${init.error.message}`)
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
  return init
}

/** The child env: never the real key from the shell, never FORM4API_TEST_KEY. */
function childEnv(key) {
  const env = { ...process.env, FORM4API_KEY: key }
  delete env.FORM4API_TEST_KEY
  return env
}

// ── Stage 5: smoke test the installed server ──────────────────────────────
async function stageSmoke() {
  if (!state.binPath.startsWith(state.installDir)) fail(`bin ${state.binPath} is outside the install dir: refusing to test a non-installed server`)
  const { child, send } = startServer(childEnv('fapi_release_check_dummy'))
  try {
    const init = await handshake(send, child)
    const info = init.result?.serverInfo
    if (info?.version !== pkg.version) fail(`server reports version ${info?.version}, package is ${pkg.version}`)
    note(`serverInfo: ${info.name}@${info.version}`)

    const tools = await send('tools/list', {})
    if (tools.error) fail(`tools/list failed: ${tools.error.message}`)
    const names = (tools.result?.tools ?? []).map((t) => t.name)
    const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n))
    if (missing.length) fail(`tools missing from the installed server: ${missing.join(', ')}`)
    const extra = names.filter((n) => !EXPECTED_TOOLS.includes(n))
    if (extra.length) fail(`tools not listed in EXPECTED_TOOLS (test/expected.mjs): ${extra.join(', ')}`)
    note(`tools/list: ${names.length} tools match EXPECTED_TOOLS`)
    state.toolSchemas = Object.fromEntries(tools.result.tools.map((t) => [t.name, t.inputSchema]))

    const prompts = await send('prompts/list', {})
    if (prompts.error) fail(`prompts/list failed: ${prompts.error.message}`)
    const pNames = (prompts.result?.prompts ?? []).map((p) => p.name)
    const pMissing = EXPECTED_PROMPTS.filter((n) => !pNames.includes(n))
    const pExtra = pNames.filter((n) => !EXPECTED_PROMPTS.includes(n))
    if (pMissing.length || pExtra.length) fail(`prompts differ. missing: [${pMissing}] unexpected: [${pExtra}]`)
    note(`prompts/list: ${pNames.length} prompts match`)
  } finally {
    child.kill()
  }
}

// ── Stage 6: live calls against the real API ──────────────────────────────
async function stageLive() {
  if (!TEST_KEY) {
    if (OFFLINE) return 'skip:--offline set and FORM4API_TEST_KEY is not set'
    fail('FORM4API_TEST_KEY is not set. A publish needs the live stage: set it, or pass --offline to skip.')
  }
  if (OFFLINE) return 'skip:--offline'
  note('FORM4API_TEST_KEY: set')

  const { child, send } = startServer(childEnv(TEST_KEY))
  try {
    await handshake(send, child)
    const calls = [
      ['verify_setup', {}],
      ['get_public_stats', {}],
      ['get_transactions', { ticker: 'AAPL', per_page: 3 }],
      ['list_congress_trades', { ticker: 'SONY', per_page: 3 }],
      ['get_company_overview', { ticker: 'AAPL' }],
    ]
    for (const [name, callArgs] of calls) {
      const res = await send('tools/call', { name, arguments: callArgs }, 60000)
      if (res.error) fail(`${name}: protocol error: ${redact(res.error.message)}`)
      const text = (res.result?.content ?? []).map((c) => c.text ?? '').join('')
      if (res.result?.isError) fail(`${name}: tool returned isError: ${redact(text).slice(0, 300)}`)
      if (!text.trim()) fail(`${name}: returned empty content`)
      if (name === 'verify_setup') {
        // verify_setup reports a bad key as a normal result with ok:false, not as isError.
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          fail('verify_setup: output is not JSON, cannot read its "ok" field')
        }
        if (parsed.ok !== true) fail('verify_setup: ok is not true (key rejected or a check failed)')
      }
      note(`${name}: ok (${text.length} chars)`)
    }
  } finally {
    child.kill()
  }
}

// ── Stage 7: dry-run publish ──────────────────────────────────────────────
async function stageDryRun() {
  const res = run('npm', ['publish', '--dry-run'])
  const out = res.stdout + res.stderr
  // Warnings are the point of this stage (the bin rewrite showed up as one), so scan first.
  const warns = out.split(/\r?\n/).filter((l) => /npm warn/i.test(l))
  if (warns.length) fail(`npm publish --dry-run printed ${warns.length} warning line(s):\n     ${redact(warns.join('\n     '))}`)
  if (res.status !== 0) {
    // The only tolerated error: this exact version is already on the registry. The dry-run
    // got past packing and every lifecycle check to reach that registry comparison, and a
    // real publish would need a version bump anyway. Surfaced loudly, never silent.
    if (/cannot publish over the previously published versions/i.test(out)) {
      // A real pre-publish run must fail here: a forgotten version bump is exactly what this
      // gate exists to catch. Only --offline (CI on main, where the version is normally
      // already out) tolerates it.
      if (!OFFLINE) fail(`${pkg.version} is already published on npm: bump the version (package.json, server.json x2, CHANGELOG) before publishing.`)
      note(`WARN: ${pkg.version} is already published on npm; a real publish needs a version bump. No npm warn lines.`)
      return
    }
    fail(`npm publish --dry-run exited ${res.status}:\n     ${tail(out)}`)
  }
  note('npm publish --dry-run: clean, no warnings')
}

const STAGES = [
  ['1. Version sync', stageVersionSync],
  ['2. Build and pack', stageBuildPack],
  ['3. Static lint of tarball', stageStaticLint],
  ['4. Install in isolation', stageInstall],
  ['5. Smoke test installed server', stageSmoke],
  ['6. Live API stage', stageLive],
  ['7. Dry-run publish', stageDryRun],
]

async function main() {
  console.log(`release:check for ${pkg.name}@${pkg.version}${OFFLINE ? ' (offline)' : ''}`)
  let failed = false
  for (const [label, fn] of STAGES) {
    console.log(`\n== ${label}`)
    try {
      const out = await fn()
      if (typeof out === 'string' && out.startsWith('skip:')) {
        console.log(`SKIP  ${label} (${out.slice(5)})`)
        results.push([label, 'SKIP'])
      } else {
        console.log(`PASS  ${label}`)
        results.push([label, 'PASS'])
      }
    } catch (err) {
      console.log(`     ${err instanceof StageFailure ? err.message : redact(err.stack ?? err)}`)
      console.log(`FAIL  ${label}`)
      results.push([label, 'FAIL'])
      failed = true
      break
    }
  }

  console.log(`\n${'─'.repeat(50)}\nSummary`)
  for (const [label, status] of results) console.log(`  ${status.padEnd(5)} ${label}`)
  for (const [label] of STAGES.slice(results.length)) console.log(`  ----  ${label} (not run)`)
  console.log(failed ? '\nrelease:check FAILED. Do not publish.' : '\nrelease:check PASSED.')

  if (KEEP) {
    console.log(`\nKept temp directories:\n  ${tempDirs.join('\n  ')}`)
  } else {
    for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
  }
  process.exit(failed ? 1 : 0)
}

main()
