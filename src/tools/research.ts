import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'
import type { Company, Transaction, Signal, SentimentScore } from '../types.js'
import { getCompanyOverview } from './companies.js'
import { getTransactions } from './transactions.js'
import { getSignals } from './signals.js'
import { getSentiment } from './sentiment.js'

export const researchCompanySchema = z.object({
  ticker: z.string().describe('Stock ticker symbol to research, e.g. AAPL'),
  recent_limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe('How many recent insider transactions to include (default 10, max 100)'),
})

export type ResearchCompanyInput = z.infer<typeof researchCompanySchema>

export interface ResearchCompanySummary {
  open_market_buys: number
  open_market_sells: number
  net_direction: 'bullish' | 'bearish' | 'neutral'
  cluster_signal_present: boolean
  cluster_signal_type: string | null
  sentiment_score: number | null
  sentiment_available: boolean
}

export interface ResearchCompanyResult {
  ticker: string
  company: Company | null
  company_unavailable: string | null
  transactions: Transaction[] | null
  transactions_unavailable: string | null
  signals: Signal[] | null
  signals_unavailable: string | null
  sentiment: SentimentScore | null
  sentiment_unavailable: string | null
  summary: ResearchCompanySummary
  suggested_analysis: string[]
  disclaimer: string
}

export async function researchCompany(
  client: Form4ApiClient,
  input: ResearchCompanyInput,
): Promise<ResearchCompanyResult> {
  const ticker = input.ticker.toUpperCase()
  const limit = input.recent_limit ?? 10

  // Fetch all four sections concurrently; each is independently gated
  const [companyResult, transactionsResult, signalsResult, sentimentResult] = await Promise.allSettled([
    getCompanyOverview(client, { ticker }),
    getTransactions(client, {
      ticker,
      per_page: limit,
      page: 1,
    }),
    getSignals(client, { ticker, per_page: 5, page: 1 }),
    getSentiment(client, { ticker }),
  ])

  const company = companyResult.status === 'fulfilled' ? companyResult.value : null
  const companyUnavailable =
    companyResult.status === 'rejected'
      ? `Company overview unavailable: ${String(companyResult.reason)}`
      : null

  const transactions = transactionsResult.status === 'fulfilled' ? transactionsResult.value : null
  const transactionsUnavailable =
    transactionsResult.status === 'rejected'
      ? `Transactions unavailable: ${String(transactionsResult.reason)}`
      : null

  const signals = signalsResult.status === 'fulfilled' ? signalsResult.value : null
  const signalsUnavailable =
    signalsResult.status === 'rejected'
      ? 'Cluster signals require Business plan. Upgrade at https://www.form4api.com/dashboard/billing'
      : null

  const sentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : null
  const sentimentUnavailable =
    sentimentResult.status === 'rejected'
      ? 'Sentiment scores require Business plan. Upgrade at https://www.form4api.com/dashboard/billing'
      : null

  // Compute summary from real fetched data only
  const openMarketBuys = transactions
    ? transactions.filter((t) => t.transactionCode === 'P' && !t.is10b5Plan).length
    : 0
  const openMarketSells = transactions
    ? transactions.filter((t) => t.transactionCode === 'S' && !t.is10b5Plan).length
    : 0
  const net = openMarketBuys - openMarketSells

  const clusterSignalPresent = signals !== null && signals.length > 0
  const clusterSignalType = clusterSignalPresent
    ? (signals![0].signalType === 'ClusterBuy' ? 'ClusterBuy' : 'ClusterSell')
    : null

  // Extract sentiment score from the opaque SentimentScore record if present
  // The backend returns an array of monthly scores; the most recent score field is `score`
  let sentimentScore: number | null = null
  if (sentiment !== null) {
    const scores = sentiment as Record<string, unknown>
    // Backend returns { data: [{ score, month, ... }] } or [{ score, ... }]
    if (Array.isArray(scores['data']) && (scores['data'] as unknown[]).length > 0) {
      const first = (scores['data'] as Record<string, unknown>[])[0]
      if (typeof first['score'] === 'number') sentimentScore = first['score']
    } else if (Array.isArray(sentiment) && (sentiment as unknown[]).length > 0) {
      const first = (sentiment as Record<string, unknown>[])[0]
      if (typeof first['score'] === 'number') sentimentScore = first['score']
    }
  }

  let netDirection: 'bullish' | 'bearish' | 'neutral'
  if (net > 0) netDirection = 'bullish'
  else if (net < 0) netDirection = 'bearish'
  else netDirection = 'neutral'

  const summary: ResearchCompanySummary = {
    open_market_buys: openMarketBuys,
    open_market_sells: openMarketSells,
    net_direction: netDirection,
    cluster_signal_present: clusterSignalPresent,
    cluster_signal_type: clusterSignalType,
    sentiment_score: sentimentScore,
    sentiment_available: sentiment !== null,
  }

  const suggestedAnalysis: string[] = [
    'Look up individual insider CIKs from the transactions above and call get_insider_career_summary to see their historical conviction and track record.',
    'Call get_insider_scorecard with a specific insider CIK to see their buy hit rate and average return (Pro plan).',
    'Check Form 144 intent-to-sell signals via get_form144 with this ticker — filings appear ~2 days before the Form 4 sale.',
    'Use get_company_insiders to see the full roster of insiders who have ever filed for this company.',
    'Call get_signals without a ticker filter to surface cross-market cluster signals and see if this ticker stands out.',
    'Use get_sentiment with a longer months window (e.g. 24) to see multi-year sentiment trend.',
  ]

  return {
    ticker,
    company,
    company_unavailable: companyUnavailable,
    transactions,
    transactions_unavailable: transactionsUnavailable,
    signals,
    signals_unavailable: signalsUnavailable,
    sentiment,
    sentiment_unavailable: sentimentUnavailable,
    summary,
    suggested_analysis: suggestedAnalysis,
    disclaimer: 'Research and decision-support only. Not investment advice.',
  }
}
