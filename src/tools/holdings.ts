import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Holding } from '../types.js'

export const getHoldingsSchema = z.object({
  ticker: z.string().optional().describe('Stock ticker the position is in (e.g. AAPL). Resolves via CUSIP → ticker mapping for issuers without direct ticker rows.'),
  cusip: z.string().optional().describe('CUSIP identifier of the security'),
  manager_cik: z.string().optional().describe('CIK of the institutional manager'),
  quarter: z.string().optional().describe('Quarter in YYYY-Qn format, e.g. 2026-Q1'),
  min_value: z.number().optional().describe('Minimum position value in USD'),
  page: z.number().int().min(1).optional().default(1).describe('Page number for pagination'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (max 100)'),
})

export type GetHoldingsInput = z.infer<typeof getHoldingsSchema>

export async function getHoldings(client: Form4ApiClient, input: GetHoldingsInput): Promise<Holding[]> {
  return client.get<Holding[]>('/v1/holdings', {
    ticker: input.ticker,
    cusip: input.cusip,
    manager_cik: input.manager_cik,
    quarter: input.quarter,
    min_value: input.min_value,
    page: input.page,
    per_page: input.per_page,
  })
}
