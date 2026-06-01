import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { InsiderCareerSummary } from '../types.js'

export const getInsiderCareerSummarySchema = z.object({
  cik: z.string().describe('Insider CIK number. From SEC EDGAR. Example: 1214156 for Tim Cook.'),
})

export type GetInsiderCareerSummaryInput = z.infer<typeof getInsiderCareerSummarySchema>

export async function getInsiderCareerSummary(
  client: Form4ApiClient,
  input: GetInsiderCareerSummaryInput,
): Promise<InsiderCareerSummary> {
  return client.get<InsiderCareerSummary>(`/v1/insiders/${encodeURIComponent(input.cik)}/summary`)
}
