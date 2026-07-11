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
  'Search SEC Form 4 insider transactions. Filter by ticker, insider, transaction type, date range, and more. Use exclude_10b5=true for discretionary-only signal analysis.',
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
  'Get the most recent SEC Form 4 filings, optionally filtered by ticker.',
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
  'Get a single Form 4 filing by its SEC accession number.',
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
  'Get an insider profile by CIK — name, title, role flags (director/officer/10pct owner).',
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
  'Get all Form 4 transactions for a specific insider by their CIK.',
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
  'Get company profile — name, CIK, SIC sector, state of incorporation, website, filing counts.',
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
  'List all insiders who have filed Form 4s for a company.',
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
  'Get cluster buy/sell signals — multiple insiders at the same company transacting in the same direction within a short window. Excludes 10b5-1 plan trades automatically (no scraping-based tool does this). Requires Business plan.',
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
  'List Form 144 notice-of-proposed-sale filings. Insiders disclose intent to sell ~2 days before the actual Form 4 sale lands — early signal on discretionary vs pre-scheduled sales. Filter by ticker, insider name, date range, or exclude 10b5-1 plans. Requires Business plan.',
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
  'List institutional positions from Form 13F-HR filings. Filter by ticker (CUSIP→ticker resolved automatically), CUSIP, manager CIK, quarter, or minimum position value. Use this to find "who owns NVDA" or "which managers added to AAPL last quarter". Requires Business plan.',
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
  'Browse the institutional manager index — each manager with their latest 13F-HR filing and AUM. Filter by name (partial match — "Berkshire" returns Berkshire Hathaway) or minimum AUM. Pair with get_holdings to see what a given manager owns. Requires Business plan.',
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
  'Get the monthly insider-sentiment score for a ticker (MSPR-style, -100 to +100). Automatically excludes 10b5-1 plan trades — the score reflects actual insider conviction, not pre-scheduled dispositions. Requires Business plan.',
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
  'Get an aggregate career rollup for a single insider by CIK: first/last transaction, total bought/sold/net, top companies, transaction-code breakdown, 10b5-1 plan split, post-trade return averages. Requires Pro plan.',
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
  'Check current API key usage stats — plan name, requests today, daily limit, all-time request count.',
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
  'validates your Form4API key + connectivity and returns a green check or exact fix steps; run this first if other tools fail',
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
  'One call: a bundled, AI-ready insider-research context for a ticker — company profile, recent insider transactions, cluster signals, sentiment, and a computed buy/sell summary. Use this FIRST when researching a company\'s insider activity; it replaces several separate calls. Note: makes multiple API calls.',
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
