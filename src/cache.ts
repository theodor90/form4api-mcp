// Small in-process TTL cache for the PUBLIC, keyless tools.
//
// Safety rule: only the tools in PUBLIC_CACHEABLE_TOOLS can ever enter it. Those
// endpoints ignore the API key, so a cached result is identical for every
// caller. Anything else (every keyed or per-user tool) is never cached, and
// only successful results are stored.

export const PUBLIC_CACHEABLE_TOOLS: ReadonlySet<string> = new Set([
  'get_public_stats',
  'get_data_quality',
  'get_status_history',
  'health_ingestion',
])

export class TtlCache {
  private readonly map = new Map<string, { value: unknown; expires: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 200,
    private readonly now: () => number = Date.now,
  ) {}

  /** Runs `load` unless a fresh entry exists. Errors propagate and are not cached. */
  async wrap(tool: string, args: unknown, load: () => Promise<unknown>): Promise<unknown> {
    if (!PUBLIC_CACHEABLE_TOOLS.has(tool)) return load()
    const key = `${tool}:${JSON.stringify(args ?? {})}`
    const hit = this.map.get(key)
    if (hit && hit.expires > this.now()) return hit.value
    const value = await load()
    this.map.delete(key)
    this.map.set(key, { value, expires: this.now() + this.ttlMs })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
    return value
  }

  get size(): number {
    return this.map.size
  }
}
