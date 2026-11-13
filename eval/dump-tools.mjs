#!/usr/bin/env node
/**
 * Dumps the tool surface exactly as an MCP client sees it: starts the built
 * server over stdio, calls tools/list, and prints to stdout
 *   [{ name, title, description, inputSchemaKeys }]
 * No API key is needed (tools/list never calls the API) and no network is used.
 *
 * Run: npm run build && npm run eval:tools
 *      npm run eval:tools -- --toolsets default    # the curated 15 only
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverPath = path.resolve(here, '../dist/index.js')

// --toolsets default|all (or --toolsets=default): which toolset to list. The stdio
// server's own default is `all`, so with no flag the dump is the full 40 tools.
const argv = process.argv.slice(2)
let toolsets = 'all'
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--toolsets') toolsets = argv[++i] ?? ''
  else if (a.startsWith('--toolsets=')) toolsets = a.slice('--toolsets='.length)
  else {
    process.stderr.write(`eval:tools: unknown argument ${JSON.stringify(a)}. Usage: eval-tools [--toolsets default|all]\n`)
    process.exit(1)
  }
}
toolsets = toolsets.trim().toLowerCase()
if (toolsets !== 'default' && toolsets !== 'all') {
  process.stderr.write('eval:tools: --toolsets must be "default" or "all"\n')
  process.exit(1)
}

// Never forward a real key to the child: listing tools does not need one.
const env = { ...process.env, FORM4API_TOOLSETS: toolsets }
delete env.FORM4API_KEY

const child = spawn('node', [serverPath], { env, stdio: ['pipe', 'pipe', 'ignore'] })
const rl = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1

rl.on('line', (line) => {
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

function send(method, params) {
  const id = nextId++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), 10000)
  })
}

try {
  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'eval-dump', version: '1.0.0' },
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
  const res = await send('tools/list', {})
  if (res.error) throw new Error(JSON.stringify(res.error))
  const out = (res.result?.tools ?? []).map((t) => ({
    name: t.name,
    title: t.title ?? t.annotations?.title ?? null,
    description: t.description ?? '',
    inputSchemaKeys: Object.keys(t.inputSchema?.properties ?? {}),
  }))
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
} catch (err) {
  process.stderr.write(`eval:tools failed: ${err.message}\n`)
  process.exitCode = 1
} finally {
  child.kill()
}
