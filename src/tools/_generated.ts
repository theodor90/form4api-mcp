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
    description: "Get insider buy track-record scorecard (Pro plan+). Returns the historical hit rate and average return of an insider's discretionary\nopen-market buys (TransactionCode=P, excluding 10b5-1 plans and derivatives).\nScores use absolute return (NOT market-adjusted) anchored at the filing-date close.\nA 'hit' is a scored buy whose 3m (or 6m) return is positive.\nScore fields are null when the insider has fewer than 5 matured scored buys\n(sampleSufficient=false), preventing misleading statistics from small samples.",
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
    description: "Recent API requests for the authenticated key",
    schema: {
  limit: z.number().int().optional(),
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
    description: "Daily request counts for the last N days",
    schema: {
  days: z.number().int().optional(),
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
    description: "List companies, optionally sorted by name or totalFilings",
    schema: {
  sort: z.string().optional(),
  limit: z.number().int().optional(),
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
    description: "Search insiders by name",
    schema: {
  name: z.string().optional(),
  page: z.number().int().optional(),
  per_page: z.number().int().optional(),
    },
    handler: async (client, input) => client.get<unknown>('/v1/insiders', {
        name: input.name as never,
        page: input.page as never,
        per_page: input.per_page as never,
      }),
  },
]
