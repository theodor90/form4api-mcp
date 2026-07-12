// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: https://api.form4api.com/openapi/v1.json
// Regenerate: npm run codegen
// Check for drift: npm run codegen:check
//
// Phase 4 of PLAN_MCP_DEFENSE_2026-06-01. Wraps every OpenAPI GET operation
// not in the skip-list as a thin MCP tool. Hand-written tools in src/tools/*.ts
// win on name conflicts — they carry the LLM-discriminator descriptions
// (amendment-aware, 10b5-1 clean, etc.) that the OpenAPI spec doesn't.
//
// To exclude an operation: add its operationId to SKIP_OPERATIONS in
// codegen/generate.mjs and regenerate.
/* eslint-disable */
import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'

export interface GeneratedTool {
  name: string
  operationId: string
  method: string
  path: string
  description: string
  schema: z.ZodRawShape
  handler: (client: Form4ApiClient, input: Record<string, unknown>) => Promise<unknown>
}

export const GENERATED_TOOLS: GeneratedTool[] = [
  {
    name: 'explain_signal',
    operationId: 'ExplainSignal',
    method: 'GET',
    path: '/v1/signals/{ticker}/explain',
    description: "Explain why a signal fired: the insiders and trades counted, what was excluded, and the criteria (Business plan+)",
    schema: {
  ticker: z.string(),
  date: z.string().optional(),
    },
    handler: async (client, input) => client.get<unknown>(`/v1/signals/\${encodeURIComponent(String(input.ticker))}/explain`, {
        date: input.date as never,
      }),
  },
  {
    name: 'get_data_quality',
    operationId: 'GetDataQuality',
    method: 'GET',
    path: '/v1/data-quality',
    description: "Public data-quality, freshness and coverage metrics for the whole dataset. Returns public, keyless metrics on data freshness, ingestion latency, corpus coverage, and post-trade returns coverage — use this to check whether the dataset is current before relying on it (e.g. confirm Form 4 ingestion isn't stalled, or that price data isn't stale), not to look up any single company, insider, or transaction. Includes: most recent Form 4 processed timestamp and median/p95 filing-accepted-to-processed latency in seconds, latest price-bar date and how many days behind it is, total companies/transactions tracked plus filing counts by form type (4, 144, 13F-HR), the percentage of 13F CUSIPs resolved to a ticker, and the percentage of eligible transactions with fully computed post-trade returns. Takes no parameters. Cached for 30 minutes; no API key or plan required.",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/v1/data-quality'),
  },
  {
    name: 'get_insider_leaderboard',
    operationId: 'GetInsiderLeaderboard',
    method: 'GET',
    path: '/v1/insiders/leaderboard',
    description: "Ranked leaderboard of insiders by buy track-record (Business plan+). Returns the top insiders ranked by historical buy performance.\nScores use absolute return (NOT market-adjusted) — a hit is a scored buy\nwith a positive 3m (or 6m) return anchored at the filing-date close.\nOnly discretionary open-market buys (P-code, not 10b5-1, not derivative)\nwith a matured return are counted. Insiders with fewer than min_trades\n(floor 5) scored buys are excluded. Results are cached for 1 hour.\nParameters: horizon=3m|6m (default 3m), order=hit_rate|avg_return (default hit_rate),\nmin_trades (default 5, minimum 5), limit (default 25, max 100).",
    schema: {
  horizon: z.string().optional(),
  order: z.string().optional(),
  min_trades: z.number().int().optional(),
  limit: z.number().int().optional(),
    },
    handler: async (client, input) => client.get<unknown>('/v1/insiders/leaderboard', {
        horizon: input.horizon as never,
        order: input.order as never,
        min_trades: input.min_trades as never,
        limit: input.limit as never,
      }),
  },
  {
    name: 'get_insider_scorecard',
    operationId: 'GetInsiderScorecard',
    method: 'GET',
    path: '/v1/insiders/{cik}/scorecard',
    description: "Get insider buy track-record scorecard (Pro plan+). Returns the historical hit rate and average return of an insider's discretionary\nopen-market buys (TransactionCode=P, excluding 10b5-1 plans and derivatives).\nScores use absolute return (NOT market-adjusted) anchored at the filing-date close.\nA 'hit' is a scored buy whose 3m (or 6m) return is positive.\nScore fields are null when the insider has fewer than 5 matured scored buys\n(sampleSufficient=false), preventing misleading statistics from small samples.\nNote: all return fields (HitRate3m, AvgReturn3m, MedianReturn3m, etc.) are stored\nas FRACTIONS — 0.05 means +5%, -0.10 means -10%.",
    schema: {
  cik: z.string(),
    },
    handler: async (client, input) => client.get<unknown>(`/v1/insiders/\${encodeURIComponent(String(input.cik))}/scorecard`),
  },
  {
    name: 'get_key_activity',
    operationId: 'GetKeyActivity',
    method: 'GET',
    path: '/v1/keys/usage/activity',
    description: "Recent, per-request API activity log for the authenticated key. Returns the most recent HTTP requests made with the authenticated API key, most recent first, including the endpoint path, response status code, duration in milliseconds, and timestamp. Use this to debug integration issues — confirm a specific call reached the API, check for repeated 4xx/5xx responses, or spot slow requests — rather than for usage trends; for aggregate daily counts use GET /v1/keys/usage/history instead. Requires a valid X-Api-Key (401 without one).",
    schema: {
  limit: z.number().int().optional().describe(`Number of most-recent requests to return. Defaults to 100, maximum 200.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/keys/usage/activity', {
        limit: input.limit as never,
      }),
  },
  {
    name: 'get_public_stats',
    operationId: 'GetPublicStats',
    method: 'GET',
    path: '/v1/stats',
    description: "Public corpus statistics (cached ~12h).",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/v1/stats'),
  },
  {
    name: 'get_usage_history',
    operationId: 'GetUsageHistory',
    method: 'GET',
    path: '/v1/keys/usage/history',
    description: "Daily request counts for the authenticated key over a trailing window. Returns a daily time series of request counts for the authenticated API key over the trailing N days — one data point per calendar day (UTC). Use this to plot usage trends or check rate-limit headroom over time. For a single current-day snapshot (today's count, plan limit, reset time) use GET /v1/keys/usage instead; for a raw request-by-request log use GET /v1/keys/usage/activity. Requires a valid X-Api-Key (401 without one).",
    schema: {
  days: z.number().int().optional().describe(`Number of trailing days to include, ending today (UTC). Defaults to 30, maximum 90.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/keys/usage/history', {
        days: input.days as never,
      }),
  },
  {
    name: 'get_webhook_events',
    operationId: 'GetWebhookEvents',
    method: 'GET',
    path: '/v1/webhooks/events',
    description: "Replay webhook delivery events since a given timestamp (default: last 24h)",
    schema: {
  since: z.string().optional(),
    },
    handler: async (client, input) => client.get<unknown>('/v1/webhooks/events', {
        since: input.since as never,
      }),
  },
  {
    name: 'list_companies',
    operationId: 'ListCompanies',
    method: 'GET',
    path: '/v1/companies',
    description: "List companies with a public ticker, sorted by name or total filings. Returns a single page of companies that have a tracked public ticker — for browsing or building a company picker, not for searching by name or CIK (there is no full-text search here; use GET /v1/companies/{ticker} to fetch one company by its exact ticker). Each entry includes the company's CIK, name, ticker, exchange, total filing count, and distinct insider count. There is no page parameter — this endpoint always returns the top `limit` companies by the chosen sort order. Not plan-gated.",
    schema: {
  sort: z.string().optional().describe(`Sort order: "name" (alphabetical, default) or "totalfilings" (most SEC filings first). Case-insensitive; unrecognized values fall back to "name".`),
  limit: z.number().int().optional().describe(`Maximum number of companies to return. Defaults to 50, maximum 50.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/companies', {
        sort: input.sort as never,
        limit: input.limit as never,
      }),
  },
  {
    name: 'list_webhooks',
    operationId: 'ListWebhooks',
    method: 'GET',
    path: '/v1/webhooks',
    description: "List webhook subscriptions for this API key",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/v1/webhooks'),
  },
  {
    name: 'search_insiders',
    operationId: 'ListInsiders',
    method: 'GET',
    path: '/v1/insiders',
    description: "Search insiders (officers, directors, 10% owners) by name. Searches insiders by name and returns a paginated list of matches with each insider's CIK, title, director/officer/10%-owner flags, and total filing count. Use this to resolve a person's name to their CIK before fetching their transaction history, career summary, or scorecard — the CIK returned here feeds directly into GET /v1/insiders/{cik}/transactions, /summary, and /scorecard. Omitting the name filter returns insiders in alphabetical order rather than performing a search. Not plan-gated — available on the Free tier.",
    schema: {
  name: z.string().optional().describe(`Case-insensitive substring match against the insider's full name (e.g. "Musk", "cook"). Must be at least 2 characters — shorter values return a 400 QUERY_TOO_SHORT error. Omit to list all insiders alphabetically.`),
  page: z.number().int().optional().describe(`1-based page number. Defaults to 1.`),
  per_page: z.number().int().optional().describe(`Number of insiders per page. Defaults to 20, maximum 500.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/insiders', {
        name: input.name as never,
        page: input.page as never,
        per_page: input.per_page as never,
      }),
  },
]
