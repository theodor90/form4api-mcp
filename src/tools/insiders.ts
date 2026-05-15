import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { InsiderProfile, Transaction } from '../types.js'

export const getInsiderProfileSchema = z.object({
  cik: z.string().describe('Insider CIK number, e.g. 0001214128'),
})

export const getInsiderTransactionsSchema = z.object({
  cik: z.string().describe('Insider CIK number'),
  ticker: z.string().optional().describe('Filter to a specific company ticker'),
  code: z
    .enum(['P', 'S', 'A', 'M', 'F', 'D', 'G', 'C', 'J'])
    .optional()
    .describe('Filter by SEC transaction code'),
  exclude_10b5: z.boolean().optional().describe('Exclude pre-scheduled 10b5-1 plan trades'),
  from: z.string().optional().describe('Start date ISO 8601'),
  to: z.string().optional().describe('End date ISO 8601'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (max 100)'),
  page: z.number().int().min(1).optional().default(1).describe('Page number'),
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
