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
