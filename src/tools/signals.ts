import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Signal } from '../types.js'

export const getSignalsSchema = z.object({
  ticker: z.string().optional().describe('Filter to a specific company ticker'),
  cluster_buy: z.boolean().optional().describe('Only return cluster buy signals'),
  cluster_sell: z.boolean().optional().describe('Only return cluster sell signals'),
  per_page: z.number().int().min(1).max(50).optional().default(20).describe('Results per page (max 50)'),
  page: z.number().int().min(1).optional().default(1).describe('Page number'),
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
