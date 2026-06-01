import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { SentimentScore } from '../types.js'

export const getSentimentSchema = z.object({
  ticker: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  months: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe('How many past months of sentiment to return. Defaults to backend default (~12).'),
})

export type GetSentimentInput = z.infer<typeof getSentimentSchema>

export async function getSentiment(client: Form4ApiClient, input: GetSentimentInput): Promise<SentimentScore> {
  return client.get<SentimentScore>(`/v1/signals/sentiment/${encodeURIComponent(input.ticker)}`, {
    months: input.months,
  })
}
