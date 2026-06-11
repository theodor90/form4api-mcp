#!/usr/bin/env node
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
import { GENERATED_TOOLS } from './tools/_generated.js'

const client = new Form4ApiClient()

const server = new McpServer({
  name: 'form4api',
  version: '1.3.0',
})

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

server.tool(
  'get_transactions',
  'Search SEC Form 4 insider transactions. Filter by ticker, insider, transaction type, date range, and more. Use exclude_10b5=true for discretionary-only signal analysis.',
  getTransactionsSchema.shape,
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
  async (_input) => {
    try {
      return wrapResult(await checkUsage(client, {}))
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
    async (input) => {
      try {
        return wrapResult(await tool.handler(client, input as Record<string, unknown>))
      } catch (err) {
        return wrapError(err)
      }
    },
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
