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
  codes: z
    .string()
    .optional()
    .describe('Comma-separated list of SEC transaction codes to include, e.g. "P,S". Multi-code superset of `code`.'),
  exclude_codes: z
    .string()
    .optional()
    .describe('Comma-separated list of SEC transaction codes to exclude, e.g. "A,M,F,G" to drop grants, option exercises, tax withholding and gifts.'),
  category: z
    .enum(['open_market', 'grants', 'derivatives', 'gifts', 'other'])
    .optional()
    .describe('Include only one category of transactions. open_market = P/S (the signal most users want); grants = award/comp noise; derivatives = option exercises etc.'),
  exclude_category: z
    .enum(['open_market', 'grants', 'derivatives', 'gifts', 'other'])
    .optional()
    .describe('Exclude an entire category of transactions, e.g. exclude_category=derivatives drops all option-related rows.'),
  exclude_derivative: z
    .boolean()
    .optional()
    .describe('If true, drop derivative-security rows — the cleanest single "no options" switch.'),
  significant: z
    .boolean()
    .optional()
    .describe('If true, preset = open-market trades only, no 10b5-1 plan trades, no derivatives. The "just show me real discretionary buys and sells" filter. Explicit params override it.'),
  min_value: z
    .number()
    .optional()
    .describe('Minimum trade value in USD (shares × price). Pro plan or higher.'),
  max_value: z
    .number()
    .optional()
    .describe('Maximum trade value in USD (shares × price). Pro plan or higher.'),
  min_shares: z.number().optional().describe('Minimum number of shares. Pro plan or higher.'),
  max_shares: z.number().optional().describe('Maximum number of shares. Pro plan or higher.'),
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
    codes: input.codes,
    exclude_codes: input.exclude_codes,
    category: input.category,
    exclude_category: input.exclude_category,
    exclude_derivative: input.exclude_derivative,
    significant: input.significant,
    min_value: input.min_value,
    max_value: input.max_value,
    min_shares: input.min_shares,
    max_shares: input.max_shares,
    from: input.from,
    to: input.to,
    page: input.page,
    per_page: input.per_page,
  })
}
