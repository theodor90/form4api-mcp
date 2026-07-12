import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { InsiderProfile, Transaction } from '../types.js'

export const getInsiderProfileSchema = z.object({
  cik: z.string().describe('Insider CIK number — SEC\'s numeric filer identifier, e.g. 0001214128. Leading zeros optional. Resolve a name to a CIK first with search_insiders if you don\'t already have it.'),
})

export const getInsiderTransactionsSchema = z.object({
  cik: z.string().describe('Insider CIK number — SEC\'s numeric filer identifier, e.g. 0001214128. Leading zeros optional.'),
  ticker: z.string().optional().describe('Filter to a specific company ticker, case-insensitive, e.g. AAPL.'),
  code: z
    .enum(['P', 'S', 'A', 'M', 'F', 'D', 'G', 'C', 'J'])
    .optional()
    .describe('Single SEC transaction code to filter to. P=open-market purchase, S=open-market sale, A=grant/award, M=option exercise, F=tax withholding on vesting, D=disposition to issuer, G=gift, C=conversion of derivative, J=other.'),
  exclude_10b5: z.boolean().optional().describe('If true, exclude pre-scheduled 10b5-1 plan trades — keeps only discretionary transactions.'),
  from: z.string().optional().describe('Start date, inclusive, format YYYY-MM-DD (e.g. 2026-01-01). Filters on transactionDate.'),
  to: z.string().optional().describe('End date, inclusive, format YYYY-MM-DD (e.g. 2026-12-31). Filters on transactionDate.'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page. Defaults to 20, maximum 100.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1.'),
})

export type GetInsiderProfileInput = z.infer<typeof getInsiderProfileSchema>
export type GetInsiderTransactionsInput = z.infer<typeof getInsiderTransactionsSchema>

export async function getInsiderProfile(client: Form4ApiClient, input: GetInsiderProfileInput): Promise<InsiderProfile> {
  return client.get<InsiderProfile>(`/v1/insiders/${encodeURIComponent(input.cik)}`)
}

export async function getInsiderTransactions(
  client: Form4ApiClient,
  input: GetInsiderTransactionsInput,
): Promise<Transaction[]> {
  return client.get<Transaction[]>(`/v1/insiders/${encodeURIComponent(input.cik)}/transactions`, {
    ticker: input.ticker,
    code: input.code,
    exclude_10b5: input.exclude_10b5,
    from: input.from,
    to: input.to,
    per_page: input.per_page,
    page: input.page,
  })
}
