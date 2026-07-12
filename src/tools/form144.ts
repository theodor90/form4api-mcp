import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Form144Filing } from '../types.js'

export const getForm144Schema = z.object({
  ticker: z.string().optional().describe('Stock ticker symbol, case-insensitive, e.g. AAPL.'),
  insider_name: z.string().optional().describe('Filter by insider name, case-insensitive partial/substring match, e.g. "cook".'),
  from: z.string().optional().describe('Start filing date, inclusive, format YYYY-MM-DD (e.g. 2026-01-01).'),
  to: z.string().optional().describe('End filing date, inclusive, format YYYY-MM-DD (e.g. 2026-12-31).'),
  exclude_10b5: z
    .boolean()
    .optional()
    .describe('If true, exclude pre-scheduled 10b5-1 plan filings. Recommended for signal analysis — discretionary sale-intent notices only.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1.'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page. Defaults to 20, maximum 100.'),
})

export type GetForm144Input = z.infer<typeof getForm144Schema>

export async function getForm144(client: Form4ApiClient, input: GetForm144Input): Promise<Form144Filing[]> {
  return client.get<Form144Filing[]>('/v1/form144', {
    ticker: input.ticker,
    insider_name: input.insider_name,
    from: input.from,
    to: input.to,
    exclude_10b5: input.exclude_10b5,
    page: input.page,
    per_page: input.per_page,
  })
}
