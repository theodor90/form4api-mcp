import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { SearchResponse } from '../types.js'

export const searchSchema = z.object({
  q: z
    .string()
    .describe(
      'Search text — a company name/ticker fragment and/or a person\'s name, in any order (e.g. "tim cook" matches insider "Cook Timothy D"). Trimmed before validation; must be 2-64 characters after trimming.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of results per section (companies, insiders), applied independently to each. Defaults to 8, clamped to 1-20.'),
})

export type SearchInput = z.infer<typeof searchSchema>

export async function search(client: Form4ApiClient, input: SearchInput): Promise<SearchResponse> {
  return client.get<SearchResponse>('/v1/search', {
    q: input.q,
    limit: input.limit,
  })
}
