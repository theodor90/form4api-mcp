import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Filing } from '../types.js'

export const getRecentFilingsSchema = z.object({
  ticker: z.string().optional().describe('Filter by stock ticker, e.g. NVDA'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (max 100)'),
  page: z.number().int().min(1).optional().default(1).describe('Page number'),
})

export const getFilingSchema = z.object({
  accession: z.string().describe('Accession number, e.g. 0000320193-26-000001'),
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
