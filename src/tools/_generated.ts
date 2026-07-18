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
    description: "Explain why a signal fired: the insiders and trades counted, what was excluded, and the criteria (Business plan+). Reconstructs the full evidence behind one company's insider signal from GET /v1/signals: the detection criteria (5-day cluster window, 3-insider threshold, 90-day ratio window, 10b5-1 exclusion), the list of cluster buyers and sellers (each with their role and individual trades in the window), trades that were excluded from the cluster count and why (10b5-1 plan or superseded by amendment), and the raw buy/sell share totals behind the 90-day ratio. Use this to audit or debug a specific signal rather than to scan many companies (use GET /v1/signals for that). This is a LIVE reconstruction from current non-superseded data, computed on every request (no caching) — it can differ slightly from the originally stored signal if trades were amended afterward. Requires Business plan or higher (402 PLAN_REQUIRED on Free/Starter/Pro). Returns 404 COMPANY_NOT_FOUND if the ticker isn't tracked, 404 SIGNAL_NOT_FOUND if no signal exists for the given/most-recent date, or 400 INVALID_DATE if `date` isn't YYYY-MM-DD.",
    schema: {
  ticker: z.string().describe(`Company ticker symbol, case-insensitive (e.g. "AAPL").`),
  date: z.string().optional().describe(`Exact signal date to explain, format YYYY-MM-DD. Omit to explain the company's most recent signal. Returns 404 SIGNAL_NOT_FOUND if no signal exists for the given (or most recent) date.`),
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
    description: "Ranked leaderboard of insiders by buy track-record (Business plan+). Returns the top insiders ranked by historical buy performance — same scored-buy methodology as\nGET /v1/insiders/{cik}/scorecard, applied across the whole corpus rather than one insider. Use\nthis to discover which insiders have the best track record; use the per-insider scorecard once\nyou have a specific CIK. Scores use absolute return (NOT market-adjusted) — a hit is a scored\nbuy with a positive 3m (or 6m) return anchored at the filing-date close. Only discretionary\nopen-market buys (P-code, not 10b5-1, not derivative) with a matured return are counted.\nInsiders with fewer than min_trades (floor 5) scored buys are excluded. Requires Business plan\nor higher (402 PLAN_REQUIRED on Free/Starter/Pro). Results are cached for 1 hour per unique\nparameter combination.",
    schema: {
  horizon: z.string().optional().describe(`"3m" or "6m" — the post-trade return horizon to score and rank by. Defaults to "3m".`),
  order: z.string().optional().describe(`"hit_rate" (% of scored buys with a positive return) or "avg_return" (mean scored return). Defaults to "hit_rate".`),
  min_trades: z.number().int().optional().describe(`Minimum number of scored buys an insider must have to be ranked. Defaults to 5; values below 5 are silently raised to 5 (the scorecard sample-sufficiency floor).`),
  limit: z.number().int().optional().describe(`Maximum number of insiders to return. Defaults to 25, maximum 100.`),
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
    description: "Get insider buy track-record scorecard (Pro plan+). Returns the historical hit rate and average/median return of an insider's discretionary\nopen-market buys (TransactionCode=P, excluding 10b5-1 plans and derivatives), plus their best\nand worst scored buy. Scores use absolute return (NOT market-adjusted) anchored at the\nfiling-date close. A 'hit' is a scored buy whose 3m (or 6m) return is positive. Use this over\nGET /v1/insiders/{cik}/summary when you specifically want a scored track record (with a\nsample-sufficiency guard) rather than raw totals; use GET /v1/insiders/leaderboard (Business+)\nto rank many insiders by this same methodology. Score fields (hitRate3m, avgReturn3m, etc.) are\nnull when the insider has fewer than 5 matured scored buys (sampleSufficient=false), preventing\nmisleading statistics from small samples. Requires Pro plan or higher (402 PLAN_REQUIRED on\nFree/Starter). Returns 404 NOT_FOUND if the CIK isn't tracked. Computed live — no caching.\nNote: all return fields (HitRate3m, AvgReturn3m, MedianReturn3m, etc.) are stored\nas FRACTIONS — 0.05 means +5%, -0.10 means -10%.",
    schema: {
  cik: z.string().describe(`Insider's SEC CIK, exact match.`),
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
    description: "Public corpus-wide statistics — no API key required. Returns headline dataset totals: filing count, transaction count, tracked companies, institutional holdings rows, Form 144 and Form 13F-HR filing counts, the earliest filing date in the corpus, the most recent quarter's total 13F-HR reported AUM in USD, and measured ingestion latency (median/p95 seconds from SEC acceptance to our processing, trailing 7 days). Use this for corpus-wide totals (e.g. a marketing/status widget), not for per-company or per-insider data — those live under GET /v1/companies and GET /v1/insiders. For freshness and coverage-quality metrics (is ingestion stalled, is price data stale) use GET /v1/data-quality instead. Takes no parameters. No API key or plan required. Cached for ~12 hours.",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/v1/stats'),
  },
  {
    name: 'get_status_history',
    operationId: 'GetStatusHistory',
    method: 'GET',
    path: '/v1/status/history',
    description: "Measured uptime history for the public status page — trailing 90-day daily breakdown. Returns a daily breakdown of measured API uptime over a trailing 90-day window, computed from an internal heartbeat probe that runs every 5 minutes and performs the same DB-connectivity check as GET /health/ready. Each day in the `days` array reports the number of 5-minute slots expected to have elapsed (288 for a complete past day, pro-rated for the feature's first day and for today's partial day), how many of those slots recorded a healthy heartbeat, and the resulting uptime percentage for that day — plus an overall percentage (`overallPct`) across the whole window. `start` is the earliest date included: either the date of the very first heartbeat ever recorded, or 89 days before today once more than 90 days of history exist. Days before that are never returned. Use this to render an uptime history / status bar; for live corpus freshness use GET /v1/data-quality instead. Takes no parameters. Cached for ~5 minutes; no API key or plan required.",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/v1/status/history'),
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
    description: "Replay webhook delivery events since a given timestamp (default: last 24h). Returns up to 500 delivery attempts across all of the authenticated key's subscriptions since `since` (default: last 24 hours), most recent first — delivery id, subscription id, event type, attempt count, delivered-at/next-retry-at timestamps, last HTTP status code from the receiving endpoint, whether the delivery is dead (exhausted all retries), and the event payload. Use this to reconcile missed webhook deliveries (e.g. after an outage on your receiving endpoint) rather than relying solely on push delivery. `since` cannot be more than 30 days in the past. Requires a valid X-Api-Key (401 without one).",
    schema: {
  since: z.string().optional().describe(`Inclusive lower bound for delivery timestamps, ISO-8601 datetime. Defaults to 24 hours ago. Cannot be more than 30 days in the past (400 INVALID_RANGE).`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/webhooks/events', {
        since: input.since as never,
      }),
  },
  {
    name: 'health_ingestion',
    operationId: 'HealthIngestion',
    method: 'GET',
    path: '/health/ingestion',
    description: "Ingestion-death detector — Form 4 freshness, parse-queue health, price-feed freshness. Returns live (uncached) ingestion health: Form 4 processing freshness (stale after 90 minutes during the weekday 06:00-22:00 US Eastern EDGAR activity window, 14 hours outside it), parse-queue health (stale when >50 jobs are pending AND the oldest has waited >45 minutes), and daily price-feed freshness (degraded, never stale, when price bars are >5 days behind). Overall status is \"healthy\", \"degraded\" (price feed only), or \"stale\" (Form 4 or queue). Returns HTTP 503 when stale, 200 otherwise — safe to point an external uptime monitor at directly. No API key or plan required.",
    schema: {

    },
    handler: async (client, input) => client.get<unknown>('/health/ingestion'),
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
    description: "List webhook subscriptions owned by the authenticated API key. Returns every webhook subscription (active and deactivated) created under the authenticated API key: subscription id, target URL, subscribed event types, creation date, active flag, and the isReadOnly flag. Does NOT return the signing secret again (it's shown once, at creation, by POST /v1/webhooks) — regenerate by deleting and recreating the subscription if it's lost. Requires a valid X-Api-Key (401 without one).",
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
