import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Transaction } from '../types.js'

export const getTransactionsSchema = z.object({
  ticker: z.string().optional().describe('Stock ticker symbol, case-insensitive, e.g. AAPL or aapl.'),
  cik: z.string().optional().describe('Company CIK number — SEC\'s numeric filer identifier, e.g. 0000320193. Leading zeros optional.'),
  insider_cik: z.string().optional().describe('Insider CIK number — SEC\'s numeric filer identifier, e.g. 0001214128. Leading zeros optional.'),
  code: z
    .enum(['P', 'S', 'A', 'M', 'F', 'D', 'G', 'C', 'J'])
    .optional()
    .describe('Single SEC transaction code to filter to. P=open-market purchase, S=open-market sale, A=grant/award, M=option exercise, F=tax withholding on vesting, D=disposition to issuer, G=gift, C=conversion of derivative, J=other. Use `codes` instead to match more than one.'),
  exclude_10b5: z
    .boolean()
    .optional()
    .describe('If true, exclude pre-scheduled 10b5-1 plan trades. Recommended for signal analysis — filters out automatic, non-discretionary trades.'),
  codes: z
    .string()
    .optional()
    .describe('Comma-separated list of SEC transaction codes to include, e.g. "P,S" (see `code` for the letter meanings). Multi-code superset of `code`.'),
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
    .describe('Minimum trade value in USD (shares × price), inclusive. Available on every plan.'),
  max_value: z
    .number()
    .optional()
    .describe('Maximum trade value in USD (shares × price), inclusive. Requires Pro plan or higher — the whole call is rejected with 403 on Free/Starter, not silently ignored. Use min_value alone to screen by size on a free key.'),
  min_shares: z.number().optional().describe('Minimum number of shares, inclusive. Requires Pro plan or higher — the whole call is rejected with 403 on Free/Starter, not silently ignored.'),
  max_shares: z.number().optional().describe('Maximum number of shares, inclusive. Requires Pro plan or higher — the whole call is rejected with 403 on Free/Starter, not silently ignored.'),
  min_return_1d: z
    .number()
    .optional()
    .describe('Minimum 1-day post-trade return, as a FRACTION not a percentage (0.05 = +5%), inclusive. Rows with no computed 1-day return are excluded. Requires Pro plan or higher — omitted or ignored on Free.'),
  max_return_1d: z
    .number()
    .optional()
    .describe('Maximum 1-day post-trade return as a fraction (e.g. -0.1 = -10%), inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  min_return_1w: z
    .number()
    .optional()
    .describe('Minimum 1-week post-trade return as a fraction (0.05 = +5%), inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  max_return_1w: z
    .number()
    .optional()
    .describe('Maximum 1-week post-trade return as a fraction, inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  min_return_1m: z
    .number()
    .optional()
    .describe('Minimum 1-month post-trade return as a fraction (0.05 = +5%), inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  max_return_1m: z
    .number()
    .optional()
    .describe('Maximum 1-month post-trade return as a fraction, inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  min_return_3m: z
    .number()
    .optional()
    .describe('Minimum 3-month post-trade return as a fraction (0.05 = +5%), inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  max_return_3m: z
    .number()
    .optional()
    .describe('Maximum 3-month post-trade return as a fraction, inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  min_return_6m: z
    .number()
    .optional()
    .describe('Minimum 6-month post-trade return as a fraction (0.05 = +5%), inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  max_return_6m: z
    .number()
    .optional()
    .describe('Maximum 6-month post-trade return as a fraction, inclusive. Requires Pro plan or higher — omitted or ignored on Free.'),
  has_returns: z
    .boolean()
    .optional()
    .describe('If true, only return transactions with at least one computed post-trade return horizon (any of 1d/1w/1m/3m/6m). Requires Pro plan or higher — omitted or ignored on Free.'),
  inst_ownership_trend: z
    .enum(['increasing', 'decreasing', 'stable'])
    .optional()
    .describe('Filter by the trailing quarter-over-quarter trend in institutional (13F) ownership of the underlying company. No effect if institutional-ownership enrichment is disabled server-side; rows where the trend was suppressed for insufficient 13F coverage still match "stable".'),
  from: z.string().optional().describe('Start date, inclusive, format YYYY-MM-DD (e.g. 2026-01-01). Filters on transactionDate.'),
  to: z.string().optional().describe('End date, inclusive, format YYYY-MM-DD (e.g. 2026-12-31). Filters on transactionDate.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1. Paging depth is plan-limited: Free reaches page 20, Starter page 100, Pro and above unlimited; beyond that the call returns 402 with the upgrade path. If you need the full history rather than a page of it, the REST endpoint GET /v1/transactions/export (Business plan) streams the entire filtered set as CSV in one request.'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page. Defaults to 20, maximum 100.'),
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
    min_return_1d: input.min_return_1d,
    max_return_1d: input.max_return_1d,
    min_return_1w: input.min_return_1w,
    max_return_1w: input.max_return_1w,
    min_return_1m: input.min_return_1m,
    max_return_1m: input.max_return_1m,
    min_return_3m: input.min_return_3m,
    max_return_3m: input.max_return_3m,
    min_return_6m: input.min_return_6m,
    max_return_6m: input.max_return_6m,
    has_returns: input.has_returns,
    inst_ownership_trend: input.inst_ownership_trend,
    from: input.from,
    to: input.to,
    page: input.page,
    per_page: input.per_page,
  })
}
