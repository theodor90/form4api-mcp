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
    handler: async (client, input) => client.get<unknown>(`/v1/signals/${encodeURIComponent(String(input.ticker))}/explain`, {
        date: input.date as never,
      }),
  },
  {
    name: 'get_congress_politician',
    operationId: 'GetCongressPolitician',
    method: 'GET',
    path: '/v1/congress/politicians/{idOrSlug}',
    description: "Get one politician's congressional trading profile (Pro plan+). Returns one politician's profile — identity fields, total/buy/sell trade counts, most recent trade's disclosure date, their top N most-traded tickers (by trade count), and their N most recent trades (same shape as GET /v1/congress/trades). Use this for a one-call politician overview rather than paging /v1/congress/trades?politician= yourself. Accepts either a bioguide ID (e.g. \"P000197\") or the politician's URL slug (e.g. \"nancy-pelosi\") in the path, matched case-insensitively against whichever field applies. Returns 404 NOT_FOUND if neither matches. Requires Pro plan or higher (402 PLAN_REQUIRED on Free/Starter). Query runs live — no caching.",
    schema: {
  idOrSlug: z.string().describe(`Politician's bioguide ID (e.g. "P000197") or URL slug (e.g. "nancy-pelosi"), exact match, case-insensitive. Tried against both fields.`),
  top_tickers: z.number().int().optional().describe(`Number of most-traded tickers to include. Defaults to 10, maximum 50.`),
  recent_trades: z.number().int().optional().describe(`Number of most recent trades to include. Defaults to 20, maximum 100.`),
    },
    handler: async (client, input) => client.get<unknown>(`/v1/congress/politicians/${encodeURIComponent(String(input.idOrSlug))}`, {
        top_tickers: input.top_tickers as never,
        recent_trades: input.recent_trades as never,
      }),
  },
  {
    name: 'get_congress_ticker_rollup',
    operationId: 'GetCongressTickerRollup',
    method: 'GET',
    path: '/v1/congress/tickers/{ticker}',
    description: "Which politicians traded a ticker, with net buy/sell counts (Pro plan+). Returns every politician who has a non-superseded congressional trade in the given ticker, each with their trade/buy/sell counts, plus ticker-level totals. Optional window_days restricts to trades with a transactionDate in the trailing N days; omit for all-time. A ticker with no congress trades returns 200 with an empty politicians array and zero counts rather than 404 — there is no separate ticker/company entity in this dataset to 404 against. Requires Pro plan or higher (402 PLAN_REQUIRED on Free/Starter). Query runs live — no caching.",
    schema: {
  ticker: z.string().describe(`Ticker symbol, case-insensitive (e.g. "AAPL").`),
  window_days: z.number().int().optional().describe(`Trailing window in days ending now, applied to transactionDate. Omit for all-time.`),
    },
    handler: async (client, input) => client.get<unknown>(`/v1/congress/tickers/${encodeURIComponent(String(input.ticker))}`, {
        window_days: input.window_days as never,
      }),
  },
  {
    name: 'get_convergence_signals',
    operationId: 'GetConvergenceSignals',
    method: 'GET',
    path: '/v1/signals/convergence',
    description: "Insider cluster-buy x congressional-purchase convergence (Pro plan+). Returns the tickers where an insider cluster-buy (InsiderSignal.IsClusterBuy) and at least one non-superseded congressional PURCHASE happened within window_days of EACH OTHER, restricted to convergences where the MORE RECENT of the pair's two dates is within a trailing lookback_days (so this surfaces CURRENT convergences, not ancient history). DEFINITION: for each result, insider.signalDate is the SignalDate of the qualifying cluster-buy signal with the most recent date (insider.insiderCount is that same signal's count — never summed or maxed across multiple signals), and congress is every non-superseded congressional purchase that paired with at least one qualifying cluster-buy (not every purchase in the window — only the ones that actually paired). firstSeen/lastSeen are the earliest/most recent dates among all qualifying insider and congress dates for that ticker. STRENGTH is documented arithmetic, NOT a black-box or predictive/ML score: strength = (distinct congressional purchasers among the qualifying legs) x (the representative signal's insiderCount) — a plain multiplication of two observed counts, nothing more. HONESTY: every congress leg always carries both amountLow and amountHigh (STOCK Act discloses ranges, never exact figures — never combined into a fabricated midpoint) and disclosureLagDays = (disclosureDate - transactionDate); congressional trades are disclosed up to 45 days after the actual trade under the STOCK Act, so this endpoint is detection/monitoring of what insiders AND members of Congress have DISCLOSED buying, not a claim of predictive edge, alpha, or win rate — no performance numbers are computed or implied anywhere in this response. window_days and lookback_days are both caller-overridable with clamps (see each parameter's own description for the exact bounds). Requires Pro plan or higher (402 PLAN_REQUIRED on Free/Starter). Query runs live against the database — no caching.",
    schema: {
  ticker: z.string().optional().describe(`Ticker symbol, case-insensitive exact match (e.g. "AAPL"). Omit to scan every ticker.`),
  window_days: z.number().int().optional().describe(`Trailing-day window: an insider cluster-buy date and a congressional purchase date must fall within this many days of EACH OTHER (either order) to count as a qualifying pair. Defaults to 30, clamped to [1, 90].`),
  lookback_days: z.number().int().optional().describe(`How far back from now the MORE RECENT of a qualifying pair's two dates must fall to still count as a current convergence (the less-recent date in a pair can be older, as long as it's within window_days of a recent partner). Defaults to 180, clamped to [1, 730].`),
  page: z.number().int().optional().describe(`1-based page number. Defaults to 1.`),
  per_page: z.number().int().optional().describe(`Converged tickers per page. Defaults to 100, maximum 500.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/signals/convergence', {
        ticker: input.ticker as never,
        window_days: input.window_days as never,
        lookback_days: input.lookback_days as never,
        page: input.page as never,
        per_page: input.per_page as never,
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
    handler: async (client, input) => client.get<unknown>(`/v1/insiders/${encodeURIComponent(String(input.cik))}/scorecard`),
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
    description: "Replay webhook delivery events since a given timestamp (default: last 24h). Returns up to 500 delivery attempts across all of the authenticated key's subscriptions since `since` (default: last 24 hours), most recent first — delivery id, subscription id, event type, attempt count, delivered-at/next-retry-at timestamps, last HTTP status code from the receiving endpoint, whether the delivery is dead (exhausted all retries), and the event payload. Use this to reconcile missed webhook deliveries (e.g. after an outage on your receiving endpoint) rather than relying solely on push delivery. `since` cannot be more than 30 days in the past. Requires a valid X-Api-Key (401 without one). `payload` is null and `payloadRedacted` is true for any event type above your current plan (congress.trade.filed requires Starter, signal.convergence requires Pro) — delivery history outlives the plan that created it, so payloads are checked against the plan you are on now, not the plan you had when you subscribed.",
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
    name: 'list_congress_politicians',
    operationId: 'ListCongressPoliticians',
    method: 'GET',
    path: '/v1/congress/politicians',
    description: "Ranked rollup of politicians by congressional trade activity (Pro plan+). Returns a paginated list of politicians who have at least one non-superseded congressional trade, each with total/buy/sell counts (sells include both Sale and PartialSale; Exchange trades count only toward total) and their most recent trade's disclosure date. Ordered by total trade count descending, ties broken by most recently disclosed. Use this to discover active traders; for one politician's full profile (including their most-traded tickers and recent trades) use GET /v1/congress/politicians/{idOrSlug}. Requires Pro plan or higher (402 PLAN_REQUIRED on Free/Starter). Query runs live — no caching.",
    schema: {
  page: z.number().int().optional().describe(`1-based page number. Defaults to 1.`),
  per_page: z.number().int().optional().describe(`Politicians per page. Defaults to 100, maximum 500.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/congress/politicians', {
        page: input.page as never,
        per_page: input.per_page as never,
      }),
  },
  {
    name: 'list_congress_trades',
    operationId: 'ListCongressTrades',
    method: 'GET',
    path: '/v1/congress/trades',
    description: "Query congressional STOCK Act trades (Free+, plan-clamped disclosure window). Returns a paginated JSON list of congressional periodic-transaction-report trades, most recently DISCLOSED first, with non-superseded rows only (amended-away rows never appear). COVERAGE — HOUSE ONLY TODAY: every trade in this dataset comes from the U.S. House Clerk's PTR index. Senate eFD (efdsearch.senate.gov) returns 403 to datacenter traffic, so no Senate filings are ingested yet. chamber=Senate remains a valid filter but matches nothing and returns the response header X-Coverage-Note: chamber-not-covered, so an empty result is never ambiguous. Scanning by chamber should treat that header as \"not covered\", not as \"no trades\". PLAN-CLAMPED WINDOW: this endpoint is open to every plan, but how far back you can see is clamped on disclosureDate — Free sees only trades disclosed in the last 30 days, Starter the last 366 days, Pro/Business/Enterprise unlimited history. Passing an older disclosure_date_from than your plan allows does not extend the window — the floor always wins. Filters: ticker, politician (bioguideId, exact), party (free-text, case-insensitive exact match — not a fixed enum), chamber (House|Senate — see the coverage note above), state (2-letter code), transaction_type (purchase|sale|partial_sale|exchange), min_amount (range-aware — matches AmountLow >= value, never a fabricated midpoint), transaction_date_from/to, disclosure_date_from/to. Every row always carries BOTH amountLow and amountHigh (STOCK Act discloses ranges, never exact figures) and disclosureLagDays = (disclosureDate - transactionDate) — the STOCK Act allows up to 45 days of lag, so \"real-time\" here means minutes-after-disclosure, not minutes-after-trade. For per-politician or per-ticker rollups use GET /v1/congress/politicians, /v1/congress/politicians/{idOrSlug}, or /v1/congress/tickers/{ticker} (all Pro+). Query runs live against the database — no caching.",
    schema: {
  ticker: z.string().optional().describe(`Ticker symbol, case-insensitive exact match (e.g. "AAPL").`),
  politician: z.string().optional().describe(`Politician's bioguide ID, exact match (e.g. "P000197").`),
  party: z.string().optional().describe(`Party as disclosed by the source, case-insensitive exact match (e.g. "D", "R", "Democratic"). Free-text — not a fixed enum, so this matches whatever string the source reported.`),
  chamber: z.string().optional().describe(`"House" or "Senate", case-insensitive. COVERAGE: this dataset currently holds House PTRs only — Senate eFD blocks datacenter traffic, so chamber=Senate is a valid filter over data we do not yet have and returns an empty array with the response header X-Coverage-Note: chamber-not-covered.`),
  state: z.string().optional().describe(`Two-letter US state/territory code, case-insensitive exact match (e.g. "CA").`),
  transaction_type: z.string().optional().describe(`"purchase", "sale", "partial_sale", or "exchange", case-insensitive.`),
  min_amount: z.number().optional().describe(`Minimum disclosed amount, range-aware: matches trades whose AmountLow >= this value. Never matched against a fabricated midpoint — see the amountLow/amountHigh honesty rule.`),
  transaction_date_from: z.string().optional().describe(`Inclusive start of the transaction-date window, format YYYY-MM-DD.`),
  transaction_date_to: z.string().optional().describe(`Inclusive end of the transaction-date window, format YYYY-MM-DD.`),
  disclosure_date_from: z.string().optional().describe(`Inclusive start of the disclosure-date window, format YYYY-MM-DD. Subject to the plan-clamped floor below — a Free/Starter caller cannot page back further than their plan allows even by passing an older date here.`),
  disclosure_date_to: z.string().optional().describe(`Inclusive end of the disclosure-date window, format YYYY-MM-DD.`),
  page: z.number().int().optional().describe(`1-based page number. Defaults to 1.`),
  per_page: z.number().int().optional().describe(`Trades per page. Defaults to 100, maximum 500.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/congress/trades', {
        ticker: input.ticker as never,
        politician: input.politician as never,
        party: input.party as never,
        chamber: input.chamber as never,
        state: input.state as never,
        transaction_type: input.transaction_type as never,
        min_amount: input.min_amount as never,
        transaction_date_from: input.transaction_date_from as never,
        transaction_date_to: input.transaction_date_to as never,
        disclosure_date_from: input.disclosure_date_from as never,
        disclosure_date_to: input.disclosure_date_to as never,
        page: input.page as never,
        per_page: input.per_page as never,
      }),
  },
  {
    name: 'list_filings',
    operationId: 'ListFilings',
    method: 'GET',
    path: '/v1/filings',
    description: "List Form 4 filings with optional ticker, CIK and date filters. Returns a paginated list of Form 4 filings, newest filed first. Filter by ticker, cik, and a from/to filed-date window. Each entry carries the accession number, company ticker/name, period of report, filed date, amendment type (Original/Amendment), and the count of non-superseded transactions in that filing. Use this for a company's filing HISTORY; use GET /v1/filings/recent for a live newest-first feed (it has no page parameter), and GET /v1/transactions when you want the individual trades rather than the filings that contain them. `limit` is accepted as an alias for `per_page`. Not plan-gated.",
    schema: {
  ticker: z.string().optional().describe(`Company ticker symbol, case-insensitive (e.g. "AAPL").`),
  cik: z.string().optional().describe(`Company CIK (SEC identifier), e.g. "0000320193". Leading zeros optional.`),
  from: z.string().optional().describe(`Inclusive start of the filed-date window, format YYYY-MM-DD.`),
  to: z.string().optional().describe(`Inclusive end of the filed-date window, format YYYY-MM-DD.`),
  page: z.number().int().optional().describe(`1-based page number. Defaults to 1.`),
  per_page: z.number().int().optional().describe(`Filings per page. Defaults to 20, maximum 100. \`limit\` is accepted as an alias; if both are given, per_page wins.`),
  limit: z.number().int().optional().describe(`Alias for per_page. Accepted because every caller who hit this path before it existed sent \`limit\`.`),
    },
    handler: async (client, input) => client.get<unknown>('/v1/filings', {
        ticker: input.ticker as never,
        cik: input.cik as never,
        from: input.from as never,
        to: input.to as never,
        page: input.page as never,
        per_page: input.per_page as never,
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
