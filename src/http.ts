// Hosted mode: stateless Streamable HTTP, `node dist/index.js --http`.
//
// Isolation model: nothing in this file holds a credential between requests.
// Every POST /mcp builds its own Form4ApiClient (from that request's own key),
// its own McpServer via createServer(client), and its own transport, and tears
// all three down when the response closes. There is no module-level client and
// no session map, so two concurrent callers cannot see each other's key.
//
// Logging: at most one line per request (method, path without query, status,
// duration, keyed yes/no). Header values, keys and bodies are never logged.

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Form4ApiClient, VERSION } from './client.js'
import { createServer } from './server.js'
import { TtlCache } from './cache.js'

export interface HttpOptions {
  port: number
  host: string
  /** Trust the first X-Forwarded-For hop as the client IP (only behind your own proxy). */
  trustProxy: boolean
  /** Requests per minute per client IP for requests that carry no key. */
  keylessPerMinute: number
  /** Requests per minute per client IP across ALL /mcp requests, keyed or not (flood guard). */
  perIpPerMinute: number
  /** TTL for cached public (keyless) tool results, in milliseconds. */
  cacheTtlMs: number
  /** Request body cap in bytes. */
  maxBodyBytes: number
  /** Whole-request budget in milliseconds. */
  requestTimeoutMs: number
  /** Upstream API base URL; defaults to FORM4API_BASE_URL / production. */
  baseUrl?: string
  /** Set false to silence the per-request log line (tests). */
  log: boolean
}

export function httpOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): HttpOptions {
  const int = (v: string | undefined, d: number) => {
    const n = Number.parseInt(v ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : d
  }
  return {
    port: v0(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    trustProxy: env.TRUST_PROXY === '1',
    keylessPerMinute: int(env.MCP_KEYLESS_PER_MINUTE, 30),
    perIpPerMinute: int(env.MCP_PER_IP_PER_MINUTE, 300),
    cacheTtlMs: int(env.MCP_CACHE_TTL_SECONDS, 300) * 1000,
    maxBodyBytes: 1024 * 1024,
    requestTimeoutMs: 60_000,
    log: true,
  }
}

// PORT=0 is valid (ephemeral port), so it cannot go through the "positive int" helper.
function v0(v: string | undefined, d: number): number {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : d
}

// ── Keyless token bucket ────────────────────────────────────────────────────

const MAX_BUCKETS = 50_000

export class KeylessLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>()

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns 0 when allowed, else the seconds the caller should wait. */
  take(ip: string): number {
    const t = this.now()
    const ratePerMs = this.perMinute / 60_000
    let b = this.buckets.get(ip)
    if (!b) {
      if (this.buckets.size >= MAX_BUCKETS) this.evict(t, ratePerMs)
      b = { tokens: this.perMinute, at: t }
    } else {
      b.tokens = Math.min(this.perMinute, b.tokens + (t - b.at) * ratePerMs)
      b.at = t
      this.buckets.delete(ip) // re-insert so Map order tracks recency
    }
    this.buckets.set(ip, b)
    if (b.tokens >= 1) {
      b.tokens -= 1
      return 0
    }
    return Math.max(1, Math.ceil((1 - b.tokens) / ratePerMs / 1000))
  }

  /** Drops buckets that have fully refilled (they carry no information), then the oldest if still full. */
  private evict(t: number, ratePerMs: number): void {
    for (const [ip, b] of this.buckets) {
      if (b.tokens + (t - b.at) * ratePerMs >= this.perMinute) this.buckets.delete(ip)
    }
    while (this.buckets.size >= MAX_BUCKETS) {
      const oldest = this.buckets.keys().next().value
      if (oldest === undefined) break
      this.buckets.delete(oldest)
    }
  }

  /** Periodic sweep so idle IPs do not accumulate. */
  sweep(): void {
    const t = this.now()
    const ratePerMs = this.perMinute / 60_000
    for (const [ip, b] of this.buckets) {
      if (b.tokens + (t - b.at) * ratePerMs >= this.perMinute) this.buckets.delete(ip)
    }
  }

  get size(): number {
    return this.buckets.size
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function jsonRpcError(code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null })
}

function send(res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extra,
  })
  res.end(body)
}

/** Authorization: Bearer <key>, else X-Api-Key. Never the query string. */
export function extractKey(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (m && m[1].trim()) return m[1].trim()
  }
  const x = req.headers['x-api-key']
  const xv = Array.isArray(x) ? x[0] : x
  if (typeof xv === 'string' && xv.trim()) return xv.trim()
  return null
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for']
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
    if (first) return first
  }
  const addr = req.socket.remoteAddress ?? 'unknown'
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr
}

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > max) {
      reject(new BodyTooLarge())
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        chunks.length = 0
        req.removeAllListeners('data')
        req.resume() // discard the rest; the connection is closed after the 413
        reject(new BodyTooLarge())
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ── Server ──────────────────────────────────────────────────────────────────

export interface Guards {
  keyless: KeylessLimiter
  flood: KeylessLimiter
  cache: TtlCache
}

export function createHttpApp(opts: HttpOptions): { server: Server; limiter: KeylessLimiter; flood: KeylessLimiter; cache: TtlCache } {
  const limiter = new KeylessLimiter(opts.keylessPerMinute)
  const flood = new KeylessLimiter(opts.perIpPerMinute)
  const cache = new TtlCache(opts.cacheTtlMs, 200)
  const guards: Guards = { keyless: limiter, flood, cache }

  const server = createHttpServer((req, res) => {
    const started = Date.now()
    const method = req.method ?? 'GET'
    let path = '/'
    try {
      path = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      // keep '/'
    }
    // The key is read once, here. `keyed` is all that is ever logged about it.
    const key = path === '/mcp' ? extractKey(req) : null
    const keyed = key !== null

    if (opts.log) {
      res.on('close', () => {
        process.stderr.write(
          `${method} ${path} ${res.statusCode} ${Date.now() - started}ms keyed=${keyed ? 'yes' : 'no'}\n`,
        )
      })
    }

    handle(req, res, path, key, opts, guards).catch(() => {
      send(res, 500, jsonRpcError(-32603, 'Internal server error'))
    })
  })

  server.requestTimeout = opts.requestTimeoutMs
  server.headersTimeout = 30_000
  return { server, limiter, flood, cache }
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  key: string | null,
  opts: HttpOptions,
  guards: Guards,
): Promise<void> {
  const method = req.method ?? 'GET'

  if (path === '/healthz') {
    if (method !== 'GET' && method !== 'HEAD') {
      send(res, 405, jsonRpcError(-32000, 'Method not allowed.'), { Allow: 'GET, HEAD' })
      return
    }
    send(res, 200, JSON.stringify({ status: 'ok', version: VERSION }))
    return
  }

  if (path !== '/mcp') {
    send(res, 404, jsonRpcError(-32000, 'Not found. The MCP endpoint is POST /mcp.'))
    return
  }

  // Stateless mode: no server-initiated stream (GET) and no session to end (DELETE).
  if (method !== 'POST') {
    send(res, 405, jsonRpcError(-32000, 'Method not allowed.'), { Allow: 'POST' })
    return
  }

  // Flood guard: every /mcp request, keyed or not. A junk key must not skip limiting.
  const ip = clientIp(req, opts.trustProxy)
  const floodWait = guards.flood.take(ip)
  if (floodWait > 0) {
    send(res, 429, jsonRpcError(-32029, `Too many requests from this address. Retry in ${floodWait}s.`), {
      'Retry-After': String(floodWait),
    })
    return
  }

  // Keyless requests get an extra, stricter limit. Valid keys are also limited by the API per user.
  if (key === null) {
    const wait = guards.keyless.take(ip)
    if (wait > 0) {
      send(
        res,
        429,
        jsonRpcError(
          -32029,
          `Too many keyless requests. Retry in ${wait}s, or send "Authorization: Bearer <your key>" ` +
            '(free key at https://www.form4api.com/dashboard) to lift this limit.',
        ),
        { 'Retry-After': String(wait) },
      )
      return
    }
  }

  let parsed: unknown
  try {
    const raw = await readBody(req, opts.maxBodyBytes)
    parsed = JSON.parse(raw.toString('utf8'))
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      send(res, 413, jsonRpcError(-32000, 'Request body too large (limit 1 MB).'), { Connection: 'close' })
    } else {
      send(res, 400, jsonRpcError(-32700, 'Parse error: body must be valid JSON.'))
    }
    return
  }

  // Streamable HTTP clients send both; be lenient with plain-JSON clients (n8n, curl).
  req.headers.accept = 'application/json, text/event-stream'

  const client = new Form4ApiClient(key, { remote: true, baseUrl: opts.baseUrl })
  const mcp = createServer(client, guards.cache)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    void transport.close().catch(() => {})
    void mcp.close().catch(() => {})
  }
  const timer = setTimeout(() => {
    send(res, 504, jsonRpcError(-32000, 'Request timed out.'))
    cleanup()
  }, opts.requestTimeoutMs)
  res.on('close', cleanup)

  await mcp.connect(transport)
  await transport.handleRequest(req, res, parsed)
}

export function startHttpServer(opts: HttpOptions = httpOptionsFromEnv()): Server {
  const { server, limiter, flood } = createHttpApp(opts)

  const sweeper = setInterval(() => { limiter.sweep(); flood.sweep() }, 60_000)
  sweeper.unref()

  server.listen(opts.port, opts.host, () => {
    process.stderr.write(`Form4API MCP server (HTTP) v${VERSION} listening on ${opts.host}:${opts.port}\n`)
  })

  const shutdown = (signal: string) => {
    process.stderr.write(`${signal} received, shutting down\n`)
    const force = setTimeout(() => process.exit(0), 10_000)
    force.unref()
    server.close(() => process.exit(0))
    server.closeIdleConnections()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  return server
}
