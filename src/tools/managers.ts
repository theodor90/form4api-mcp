import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Manager } from '../types.js'

export const getManagersSchema = z.object({
  name: z.string().optional().describe('Filter by manager name (partial, case-insensitive). Example: "Berkshire" matches Berkshire Hathaway.'),
  min_aum: z.number().optional().describe('Minimum AUM in USD at the latest filed quarter'),
  page: z.number().int().min(1).optional().default(1).describe('Page number for pagination'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page (max 100)'),
})

export type GetManagersInput = z.infer<typeof getManagersSchema>

export async function getManagers(client: Form4ApiClient, input: GetManagersInput): Promise<Manager[]> {
  return client.get<Manager[]>('/v1/managers', {
    name: input.name,
    min_aum: input.min_aum,
    page: input.page,
    per_page: input.per_page,
  })
}
