// Toolsets: which tools a server instance registers.
//
//   default  15 curated tools, enough for the common questions
//   all      every tool (40 as of this writing)
//
// This file is the only place the set is defined. Stdio mode (src/index.ts) and
// HTTP mode (src/http.ts) both resolve a Toolset here and pass it to createServer.
// A tool outside the active set is not registered at all, so it is absent from
// tools/list and a tools/call for it fails as an unknown tool.

export const TOOLSET_VALUES = ['default', 'all'] as const
export type Toolset = (typeof TOOLSET_VALUES)[number]

/** Human-readable list of accepted values, for error and warning text. */
export const ACCEPTED_TOOLSET_TEXT = TOOLSET_VALUES.map((v) => `"${v}"`).join(' or ')

/**
 * The curated default set. Every name must be a real registered tool:
 * createServer throws at construction if one is not, so a rename cannot
 * silently shrink the set.
 */
export const DEFAULT_TOOLS: readonly string[] = [
  'search',
  'research_company',
  'get_transactions',
  'get_recent_filings',
  'get_filing',
  'get_insider_transactions',
  'get_insider_scorecard',
  'get_signals',
  'get_company_overview',
  'get_form144',
  'get_holdings',
  'list_congress_trades',
  'get_convergence_signals',
  'get_company_insiders',
  'verify_setup',
]

const DEFAULT_TOOL_SET: ReadonlySet<string> = new Set(DEFAULT_TOOLS)

/** Case-insensitive, trimmed. Returns null for anything that is not exactly `default` or `all`. */
export function parseToolset(raw: string | null | undefined): Toolset | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return (TOOLSET_VALUES as readonly string[]).includes(v) ? (v as Toolset) : null
}

/** True when `name` is registered under the given toolset. */
export function inToolset(toolset: Toolset, name: string): boolean {
  return toolset === 'all' || DEFAULT_TOOL_SET.has(name)
}

/**
 * Resolves a toolset from an environment variable. An unset or empty variable
 * gives `fallback` silently; an unknown value gives `fallback` plus the
 * offending text in `invalid` so the caller can write one warning line.
 */
export function toolsetFromEnv(
  raw: string | undefined,
  fallback: Toolset,
): { toolset: Toolset; invalid: string | null } {
  if (raw === undefined || raw.trim() === '') return { toolset: fallback, invalid: null }
  const parsed = parseToolset(raw)
  return parsed ? { toolset: parsed, invalid: null } : { toolset: fallback, invalid: raw }
}

/** One stderr line for an unusable env value. The value is truncated and quoted. */
export function toolsetWarning(envName: string, invalid: string, fallback: Toolset): string {
  return `warning: ignoring ${envName}=${JSON.stringify(invalid.slice(0, 64))}; accepted values are ${ACCEPTED_TOOLSET_TEXT}. Using "${fallback}".\n`
}

/** Throws when a name in DEFAULT_TOOLS is not among the registered tools. */
export function assertDefaultToolsRegistered(registered: Iterable<string>): void {
  const have = new Set(registered)
  const missing = DEFAULT_TOOLS.filter((n) => !have.has(n))
  if (missing.length > 0) {
    throw new Error(`DEFAULT_TOOLS names tools that are not registered: ${missing.join(', ')}`)
  }
}
