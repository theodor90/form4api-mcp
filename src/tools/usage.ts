import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { UsageStats } from '../types.js'

export const checkUsageSchema = z.object({})

export type CheckUsageInput = z.infer<typeof checkUsageSchema>

export async function checkUsage(client: Form4ApiClient, _input: CheckUsageInput): Promise<UsageStats> {
  return client.get<UsageStats>('/v1/keys/usage')
}
