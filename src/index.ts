#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Form4ApiClient, Form4ApiError } from './client.js'
import { getTransactionsSchema, getTransactions } from './tools/transactions.js'
import { getRecentFilingsSchema, getFilingSchema, getRecentFilings, getFiling } from './tools/filings.js'
import { getInsiderProfileSchema, getInsiderTransactionsSchema, getInsiderProfile, getInsiderTransactions } from './tools/insiders.js'
import { getCompanyOverviewSchema, getCompanyInsidersSchema, getCompanyOverview, getCompanyInsiders } from './tools/companies.js'
import { getSignalsSchema, getSignals } from './tools/signals.js'
import { checkUsageSchema, checkUsage } from './tools/usage.js'

const client = new Form4ApiClient()

const server = new McpServer({
  name: 'form4api',
  version: '1.0.0',
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
  'Get cluster buy/sell signals — multiple insiders at the same company transacting in the same direction within a short window. Excludes 10b5-1 plan trades. Requires Business plan.',
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

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Form4API MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`)
  process.exit(1)
})
