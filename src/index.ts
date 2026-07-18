#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Form4ApiClient, Form4ApiError } from './client.js'
import { getTransactionsSchema, getTransactions } from './tools/transactions.js'
import { getRecentFilingsSchema, getFilingSchema, getRecentFilings, getFiling } from './tools/filings.js'
import { getInsiderProfileSchema, getInsiderTransactionsSchema, getInsiderProfile, getInsiderTransactions } from './tools/insiders.js'
import { getCompanyOverviewSchema, getCompanyInsidersSchema, getCompanyOverview, getCompanyInsiders } from './tools/companies.js'
import { getSignalsSchema, getSignals } from './tools/signals.js'
import { getForm144Schema, getForm144 } from './tools/form144.js'
import { getHoldingsSchema, getHoldings } from './tools/holdings.js'
import { getManagersSchema, getManagers } from './tools/managers.js'
import { getSentimentSchema, getSentiment } from './tools/sentiment.js'
import { getInsiderCareerSummarySchema, getInsiderCareerSummary } from './tools/insiderSummary.js'
import { checkUsageSchema, checkUsage } from './tools/usage.js'
import { verifySetupSchema, verifySetup } from './tools/verify-setup.js'
import { researchCompanySchema, researchCompany } from './tools/research.js'
import { GENERATED_TOOLS } from './tools/_generated.js'
import { RECIPE_PROMPTS } from './prompts/recipes.js'

const client = new Form4ApiClient()

// Single source of truth for the version: read it from package.json at startup
// so serverInfo can never drift from the published package version again.
// __dirname is dist/ at runtime (CommonJS output); ../package.json is the root.
const { version } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string }

const SERVER_INSTRUCTIONS = `Form4API insider trading data: amendment-aware Form 4 transactions, 10b5-1 plan flags, Form 144 intent-to-sell, institutional 13F-HR overlay.

Start with \`research_company\` to get bundled insider context for any ticker. If something fails, run \`verify_setup\` first. Try \`get_public_stats\` without a key to preview the data.

Try these prompts:
• "What insider trades happened at NVDA in the last 30 days, excluding 10b5-1 plans?"
• "Show me cluster buy signals from this week — multiple insiders at the same company trading in the same direction."
• "Call get_public_stats to show me our current data coverage — no API key required."`

const server = new McpServer(
  {
    name: 'form4api',
    version,
  },
  {
    instructions: SERVER_INSTRUCTIONS,
  },
)

function wrapResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

function wrapError(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  const message = err instanceof Form4ApiError ? err.message : String(err)
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

// All tools in this server are read-only calls to a remote API.
// Every registration carries these annotations so MCP clients that honour
// the spec can skip confirmation prompts and mark the tools as safe.
const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const

server.tool(
  'get_transactions',
  "Search SEC Form 4 insider transactions with rich filters: ticker, insider CIK, transaction code/category, date range, (Pro+) trade-size thresholds, and (Pro+) post-trade return screening (1d/1w/1m/3m/6m, returns as fractions e.g. 0.05 = +5%). Also supports institutional-ownership-trend filtering (inst_ownership_trend, Free). Returns transaction-level rows — shares, price, total value, transaction code, 10b5-1 flag, insider role flags. Use this for filtered or historical search across many companies/insiders; use get_recent_filings for an unfiltered live feed instead, or get_insider_transactions/get_company_insiders when you already have a specific insider or company. Free plan; min_value/max_value/min_shares/max_shares/min_return_*/max_return_*/has_returns require Pro. Paginated, max 100/page.",
  getTransactionsSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getTransactions(client, input as Parameters<typeof getTransactions>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_recent_filings',
  'Live feed of the newest SEC Form 4 filings, sorted most-recent-first, optionally filtered to one ticker. New filings typically appear within ~60 seconds of SEC publication. Use this to check "what just happened" rather than get_transactions (built for filtered/historical search across date ranges and codes). Returns per-filing accession number, filed/period-of-report dates, company + insider identity, and transaction count; pass the accession number to get_filing for full detail. Free plan. Paginated, max 100/page.',
  getRecentFilingsSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getRecentFilings(client, input as Parameters<typeof getRecentFilings>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_filing',
  'Fetch one Form 4 filing by its exact SEC accession number (format NNNNNNNNNN-YY-NNNNNN, e.g. 0000320193-26-000001). Use this once you already have an accession number from get_recent_filings or get_transactions. Returns filed/period-of-report dates, company and insider identity, and transaction count for that filing. Free plan.',
  getFilingSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getFiling(client, input as Parameters<typeof getFiling>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_insider_profile',
  "Look up one insider's identity by CIK (SEC's numeric filer identifier, e.g. 0001214128) — returns name, all known titles, and director/officer/10%-owner role flags. If you only have a name, resolve it to a CIK first with the generated search_insiders tool. For trading history use get_insider_transactions or get_insider_career_summary instead. Free plan.",
  getInsiderProfileSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getInsiderProfile(client, input as Parameters<typeof getInsiderProfile>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_insider_transactions',
  "All Form 4 transactions filed by one insider (by CIK), filterable by ticker, transaction code, date range, and 10b5-1 exclusion. Use this once you have an insider's CIK on hand; get_transactions with insider_cik= gives the same rows alongside its broader filter set, while get_insider_career_summary returns a pre-aggregated rollup instead of raw rows. Free plan. Paginated, max 100/page.",
  getInsiderTransactionsSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getInsiderTransactions(client, input as Parameters<typeof getInsiderTransactions>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_company_overview',
  "Company profile for a single ticker — name, CIK, SIC sector/description, state of incorporation, website, total Form 4 filing count, and active insider count. Use this for company identity/metadata; use get_company_insiders to list who is filing, or get_transactions with ticker= for their trade history. Free plan.",
  getCompanyOverviewSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getCompanyOverview(client, input as Parameters<typeof getCompanyOverview>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_company_insiders',
  "Full roster of insiders who have ever filed a Form 4 for a given ticker — name, CIK, titles, director/officer/10%-owner flags, last-filed date, and total transaction count per insider. Use this to enumerate a company's insiders (e.g. before pulling each one's career summary); use get_transactions with ticker= for the underlying trade history itself. Free plan. Paginated, max 100/page.",
  getCompanyInsidersSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getCompanyInsiders(client, input as Parameters<typeof getCompanyInsiders>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_signals',
  'Cluster buy/sell signals — multiple insiders at the same company trading in the same direction within a short window, a stronger conviction signal than any single trade. Excludes 10b5-1 plan trades automatically by construction. Returns signal type, detection date, buyer/seller counts, total $ value, and the underlying transactions; pair with the generated explain_signal tool to see exactly why a given signal fired. Use get_transactions instead for raw, unaggregated trade search. Requires Business plan (a 402 upgrade_required response is returned otherwise). Paginated, max 50/page.',
  getSignalsSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getSignals(client, input as Parameters<typeof getSignals>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_form144',
  'Form 144 notice-of-proposed-sale filings — insiders disclose intent to sell roughly 2 days before the matching Form 4 sale lands, so this is an early-warning signal, especially discretionary (non-10b5-1) notices. Filter by ticker, insider name (partial match), date range, or exclude_10b5. Cross-reference with get_transactions/get_insider_transactions to see whether the intent was actually executed. Requires Business plan. Paginated, max 100/page.',
  getForm144Schema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getForm144(client, input as Parameters<typeof getForm144>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_holdings',
  'Institutional 13F-HR positions — filter by ticker (CUSIP resolved to ticker automatically), CUSIP, manager CIK, quarter, or minimum position value. Answers "who owns NVDA" or "which managers hold AAPL this quarter"; pair with get_managers to look up a manager\'s identity/AUM, or get_transactions to cross-reference insider activity at the same company. Requires Business plan. Paginated, max 100/page.',
  getHoldingsSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getHoldings(client, input as Parameters<typeof getHoldings>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_managers',
  'Browse the institutional manager index — each manager with their latest 13F-HR filing date and AUM. Filter by name (partial match — "Berkshire" returns Berkshire Hathaway) or minimum AUM. Pair with get_holdings to see what a given manager owns. Requires Business plan. Paginated, max 100/page.',
  getManagersSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getManagers(client, input as Parameters<typeof getManagers>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_sentiment',
  'Monthly insider-sentiment score for a ticker (MSPR-style, -100 to +100; positive = net buying conviction), one point per month, defaulting to roughly the last 12 months. Automatically excludes 10b5-1 plan trades so the score reflects discretionary conviction, not pre-scheduled dispositions. Use get_transactions or get_signals for the trade-level detail behind a given month. Requires Business plan.',
  getSentimentSchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getSentiment(client, input as Parameters<typeof getSentiment>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'get_insider_career_summary',
  'Aggregate career rollup for one insider by CIK — first/last transaction dates, total shares/value bought vs sold, top companies traded, transaction-code breakdown, 10b5-1 plan split, and average post-trade returns (stored as fractions, e.g. 0.05 = +5%). Use this instead of get_insider_transactions when you want a pre-computed summary rather than raw rows; pair with the generated get_insider_scorecard for hit-rate statistics on their discretionary buys specifically. Requires Pro plan.',
  getInsiderCareerSummarySchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await getInsiderCareerSummary(client, input as Parameters<typeof getInsiderCareerSummary>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'check_usage',
  "Snapshot of the authenticated API key's current usage — plan name, requests made today, daily limit, and all-time request count. Use this for a quick right-now check; use the generated get_usage_history tool for a daily trend over time, or get_key_activity for a per-request log. Free plan, works on every tier.",
  checkUsageSchema.shape,
  READ_ONLY,
  async (_input) => {
    try {
      return wrapResult(await checkUsage(client, {}))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'verify_setup',
  'Diagnostic check: confirms FORM4API_KEY is present and valid, the backend is reachable, and reports your current plan — returns a pass/fail/warn per check plus concrete next steps (where to get a key, how to upgrade) instead of a raw error. Run this first whenever another tool fails or returns a 401/402, to isolate whether the problem is configuration, plan, or a backend outage. No API key or parameters required.',
  verifySetupSchema.shape,
  READ_ONLY,
  async () => {
    try {
      return wrapResult(await verifySetup({}))
    } catch (err) {
      return wrapError(err)
    }
  },
)

server.tool(
  'research_company',
  "Bundled insider-research context for one ticker in a single call — company profile, recent insider transactions (10b5-1 flagged), cluster buy/sell signals, monthly sentiment score, and a computed net buy/sell direction summary. Use this FIRST for any company insider-research question; it replaces 4 separate calls (get_company_overview, get_transactions, get_signals, get_sentiment) and degrades gracefully — if signals/sentiment require a plan you don't have, they come back null with an explanatory `_unavailable` note instead of failing the whole call. Company/transaction data works on Free; signals/sentiment sections require Business. Fetches all sections concurrently. Research and decision-support only, not investment advice.",
  researchCompanySchema.shape,
  READ_ONLY,
  async (input) => {
    try {
      return wrapResult(await researchCompany(client, input as Parameters<typeof researchCompany>[1]))
    } catch (err) {
      return wrapError(err)
    }
  },
)

// Auto-generated tools from /openapi/v1.json. Anything in HANDLED_BY_HANDWRITTEN
// (codegen/generate.mjs) is already exposed above with a richer description;
// what's left here is the long tail (search_insiders, key activity, usage
// history, list_webhooks, get_webhook_events) — operations the spec describes
// well enough on its own. New backend endpoints flow into this loop on
// the next codegen run without a manual src/tools/*.ts file.
// PLAN_MCP_DEFENSE Phase 4 (2026-06-01).
for (const tool of GENERATED_TOOLS) {
  server.tool(
    tool.name,
    tool.description,
    tool.schema,
    READ_ONLY,
    async (input) => {
      try {
        return wrapResult(await tool.handler(client, input as Record<string, unknown>))
      } catch (err) {
        return wrapError(err)
      }
    },
  )
}

// Recipe prompts — MCP "prompts" capability. Each one is a canned
// tool-orchestration template (which of the 27 tools to call, in what order,
// how to read plan-gated failures) that a client can discover via
// prompts/list and fetch via prompts/get. Defined in src/prompts/recipes.ts,
// NOT generated from the OpenAPI spec — safe to hand-edit.
for (const recipe of RECIPE_PROMPTS) {
  server.prompt(
    recipe.name,
    recipe.description,
    recipe.argsSchema,
    (args) => recipe.handler(args as Record<string, string | undefined>),
  )
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Form4API MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
