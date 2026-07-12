import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Filing } from '../types.js'

export const getRecentFilingsSchema = z.object({
  ticker: z.string().optional().describe('Filter to one stock ticker, case-insensitive, e.g. NVDA. Omit for the unfiltered market-wide feed.'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page. Defaults to 20, maximum 100.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1.'),
})

export const getFilingSchema = z.object({
  accession: z.string().describe('SEC accession number in NNNNNNNNNN-YY-NNNNNN format (10-digit filer CIK, 2-digit year, 6-digit sequence), e.g. 0000320193-26-000001. Copy this from a get_recent_filings or get_transactions result.'),
})

export type GetRecentFilingsInput = z.infer<typeof getRecentFilingsSchema>
export type GetFilingInput = z.infer<typeof getFilingSchema>

export async function getRecentFilings(client: Form4ApiClient, input: GetRecentFilingsInput): Promise<Filing[]> {
  return client.get<Filing[]>('/v1/filings/recent', {
    ticker: input.ticker,
    per_page: input.per_page,
    page: input.page,
  })
}

export async function getFiling(client: Form4ApiClient, input: GetFilingInput): Promise<Filing> {
  return client.get<Filing>(`/v1/filings/${encodeURIComponent(input.accession)}`)
}
