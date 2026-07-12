import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Company, CompanyInsider } from '../types.js'

export const getCompanyOverviewSchema = z.object({
  ticker: z.string().describe('Stock ticker symbol, case-insensitive, e.g. MSFT.'),
})

export const getCompanyInsidersSchema = z.object({
  ticker: z.string().describe('Stock ticker symbol, case-insensitive, e.g. MSFT.'),
  per_page: z.number().int().min(1).max(100).optional().default(20).describe('Results per page. Defaults to 20, maximum 100.'),
  page: z.number().int().min(1).optional().default(1).describe('1-based page number. Defaults to 1.'),
})

export type GetCompanyOverviewInput = z.infer<typeof getCompanyOverviewSchema>
export type GetCompanyInsidersInput = z.infer<typeof getCompanyInsidersSchema>

export async function getCompanyOverview(client: Form4ApiClient, input: GetCompanyOverviewInput): Promise<Company> {
  return client.get<Company>(`/v1/companies/${encodeURIComponent(input.ticker)}`)
}

export async function getCompanyInsiders(
  client: Form4ApiClient,
  input: GetCompanyInsidersInput,
): Promise<CompanyInsider[]> {
  return client.get<CompanyInsider[]>(`/v1/companies/${encodeURIComponent(input.ticker)}/insiders`, {
    per_page: input.per_page,
    page: input.page,
  })
}
