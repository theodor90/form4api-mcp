import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { InsiderCareerSummary } from '../types.js'

export const getInsiderCareerSummarySchema = z.object({
  cik: z.string().describe('Insider CIK number — SEC\'s numeric filer identifier. Leading zeros optional. Example: 1214156 for Tim Cook. Resolve a name to a CIK first with search_insiders if you don\'t already have it. Note: response return fields are stored as fractions (0.05 = +5%), not percentages.'),
})

export type GetInsiderCareerSummaryInput = z.infer<typeof getInsiderCareerSummarySchema>

export async function getInsiderCareerSummary(
  client: Form4ApiClient,
  input: GetInsiderCareerSummaryInput,
): Promise<InsiderCareerSummary> {
  return client.get<InsiderCareerSummary>(`/v1/insiders/${encodeURIComponent(input.cik)}/summary`)
}
