import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Signal } from '../types.js'

export const getSignalsSchema = z.object({
  ticker: z.string().optional().describe('Filter to a specific company ticker, case-insensitive, e.g. NVDA. Omit for a market-wide scan across all companies.'),
  cluster_buy: z.boolean().optional().describe('If true, return only ClusterBuy signals (multiple insiders buying together). Omit both cluster_buy and cluster_sell to return signals of either type.'),
  cluster_sell: z.boolean().optional().describe('If true, return only ClusterSell signals (multiple insiders selling together). Omit both cluster_buy and cluster_sell to return signals of either type.'),
  per_page: z.number().int().min(1).max(50).optional().default(20).describe('Results per page. Defaults to 20, maximum 50.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1.'),
})

export type GetSignalsInput = z.infer<typeof getSignalsSchema>

export async function getSignals(client: Form4ApiClient, input: GetSignalsInput): Promise<Signal[]> {
  return client.get<Signal[]>('/v1/signals', {
    ticker: input.ticker,
    cluster_buy: input.cluster_buy,
    cluster_sell: input.cluster_sell,
    per_page: input.per_page,
    page: input.page,
  })
}
