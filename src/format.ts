/**
 * Renders tool results for the MCP text channel.
 *
 * Every tool used to return `JSON.stringify(data, null, 2)`. For the list
 * endpoints that is a bad trade: a 100-row `get_transactions` response is
 * ~2,100 lines and ~16k tokens, and roughly 60% of that is the same nineteen
 * key names repeated a hundred times. The rows are what the model needs; the
 * repetition is what it pays for.
 *
 * A pipe-delimited table states each key once, in the header. Measured on a
 * 100-row get_transactions payload with all nineteen fields kept (the figure
 * test/format.mjs prints, so it stays honest as the shape changes):
 *
 *     pretty JSON   60,302 chars   ~15,076 tokens   2,102 lines
 *     table         22,145 chars    ~5,536 tokens     103 lines
 *
 * 2.7x. Dropping columns would roughly double that again, and the reasoning
 * below is why it is not done. That saving is spent from the caller's context
 * window rather than ours, and MCP is this product's highest-reach channel,
 * so it is worth being careful about in both directions.
 *
 * Two deliberate limits:
 *
 *   - No columns are dropped. A curated column set per tool would compress
 *     further, but a field the model cannot see is a field the user cannot
 *     ask about, and the tools are generated from an evolving OpenAPI spec —
 *     a hand-maintained column list would rot silently.
 *
 *   - Rows carrying nested collections fall back to JSON. `get_signals`
 *     returns each signal with its `transactions[]` attached, and those
 *     transactions are the substance of the answer; flattening them into a
 *     cell would either explode the table or lose them. Losing data to save
 *     tokens is not a trade worth making, so those tools keep their old
 *     output exactly.
 *
 * Not used here: `structuredContent`. It cannot hold a bare array (the spec
 * types it as an object), and a tool that sets it SHOULD also serialize the
 * same payload into a text block — so it duplicates the data rather than
 * replacing it, which is the opposite of the point. Declaring the matching
 * `outputSchema` would also make the SDK hard-fail any tool whose response
 * drifts from it, and these shapes come from a live API.
 */

/** Widest a single cell may get before it is truncated with an ellipsis. */
const MAX_CELL_CHARS = 80

/**
 * Above this many rows the header is repeated at the bottom. Long tables lose
 * their header off the top of a model's attention the same way they do off the
 * top of a screen.
 */
const REPEAT_HEADER_AFTER = 40

export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    // Integers stay exact — share counts and CIKs must not pick up decimals.
    if (Number.isInteger(value)) return String(value)
    // Returns and hit rates are stored as FRACTIONS — the generated spec says so
    // on every scored endpoint: 0.0234 is +2.34%. Rounding those to 2dp reads as
    // +2%, renders a -0.30% return as the nonsense "-0.00", and collapses a
    // leaderboard's ordering into ties. So anything below 1 keeps four decimals;
    // money and prices sit above 1 and read fine at two.
    return String(Number(value.toFixed(Math.abs(value) < 1 ? 4 : 2)))
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') {
    // A newline inside a cell would break the row/line correspondence the
    // whole format depends on.
    const collapsed = value.replace(/\s+/g, ' ').trim()
    return collapsed === '' ? '—' : truncate(collapsed)
  }
  // Empty containers are the only nested values that reach here — anything
  // non-empty sends the whole payload down the JSON path (see isFlatRow).
  if (Array.isArray(value)) return '[]'
  return '{}'
}

function truncate(text: string): string {
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS - 1)}…` : text
}

/** A pipe in a value would read as a column break. */
function escapeCell(cell: string): string {
  return cell.includes('|') ? cell.replace(/\|/g, '/') : cell
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * True when a row can be rendered as a table line without losing anything.
 * Empty arrays and empty objects are fine — they carry no information a cell
 * cannot state. Anything populated does not fit in a cell.
 */
function isFlatRow(row: unknown): row is Record<string, unknown> {
  if (!isPlainObject(row)) return false
  for (const value of Object.values(row)) {
    if (Array.isArray(value) && value.length > 0) return false
    if (isPlainObject(value) && Object.keys(value).length > 0) return false
  }
  return true
}

/**
 * Column order follows first appearance across the rows rather than the first
 * row alone: a nullable field the API omits from early rows still gets a
 * column instead of being silently dropped.
 */
function collectColumns(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }
  return columns
}

export function renderTable(rows: Record<string, unknown>[]): string {
  const columns = collectColumns(rows)
  const header = columns.join(' | ')
  const lines = [header]
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(formatCell(row[column]))).join(' | '))
  }
  if (rows.length > REPEAT_HEADER_AFTER) lines.push(header)
  return lines.join('\n')
}

/**
 * Render a tool result for the text channel: a table when the payload is a
 * list of flat rows, the previous pretty JSON otherwise.
 */
export function formatToolResult(data: unknown): string {
  if (!Array.isArray(data)) return JSON.stringify(data, null, 2)
  if (data.length === 0) return 'No results.'
  if (!data.every(isFlatRow)) return JSON.stringify(data, null, 2)

  const rows = data as Record<string, unknown>[]
  const count = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}.`
  return `${count}\n${renderTable(rows)}`
}
