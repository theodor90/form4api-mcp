import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Transaction } from '../types.js'

export const getTransactionsSchema = z.object({
  ticker: z.string().optional().describe('Stock ticker symbol, e.g. AAPL'),
  cik: z.string().optional().describe('Company CIK number'),
  insider_cik: z.string().optional().describe('Insider CIK number'),
  code: z
    .enum(['P', 'S', 'A', 'M', 'F', 'D', 'G', 'C', 'J'])
    .optional()
    .describe('SEC transaction code. P=purchase, S=sale, A=award, M=option exercise, F=tax withholding, D=disposition'),
  exclude_10b5: z
    .boolean()
    .optional()
    .describe('If true, exclude pre-scheduled 10b5-1 plan trades. Recommended for signal analysis — filters out automatic, non-discretionary trades.'),
  from: z.string().optional().describe('Start date in ISO 8601 format, e.g. 2026-01-01'),
  to: z.string().optional().describe('End date in ISO 8601 format, e.g. 2026-12-31'),
  page: z.number().int().min(1).optional().default(1).describe('Page number for pagination'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (max 100)'),
})

export type GetTransactionsInput = z.infer<typeof getTransactionsSchema>

export async function getTransactions(client: Form4ApiClient, input: GetTransactionsInput): Promise<Transaction[]> {
  return client.get<Transaction[]>('/v1/transactions', {
    ticker: input.ticker,
    cik: input.cik,
    insider_cik: input.insider_cik,
    code: input.code,
    exclude_10b5: input.exclude_10b5,
    from: input.from,
    to: input.to,
    page: input.page,
    per_page: input.per_page,
  })
}
