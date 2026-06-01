export interface Transaction {
  transactionId: number
  accessionNumber: string
  filedAt: string
  transactionDate: string
  transactionCode: string
  sharesAmount: number
  pricePerShare: number | null
  totalValue: number | null
  isOpenMarket: boolean
  is10b5Plan: boolean
  companyName: string
  ticker: string | null
  companyCik: string
  insiderName: string
  insiderCik: string
  insiderTitle: string | null
  isDirector: boolean
  isOfficer: boolean
  is10PctOwner: boolean
}

export interface Filing {
  accessionNumber: string
  filedAt: string
  periodOfReport: string
  companyCik: string
  companyName: string
  ticker: string | null
  insiderCik: string
  insiderName: string
  transactionCount: number
}

export interface InsiderProfile {
  cik: string
  name: string
  isDirector: boolean
  isOfficer: boolean
  is10PctOwner: boolean
  titles: string[]
}

export interface Company {
  cik: string
  name: string
  ticker: string | null
  exchange: string | null
  sicCode: string | null
  sicDescription: string | null
  stateOfIncorporation: string | null
  website: string | null
  totalFilings: number
  activeInsiders: number
}

export interface CompanyInsider {
  cik: string
  name: string
  isDirector: boolean
  isOfficer: boolean
  is10PctOwner: boolean
  titles: string[]
  lastFiledAt: string | null
  totalTransactions: number
}

export interface Signal {
  signalId: number
  ticker: string
  companyName: string
  signalType: 'ClusterBuy' | 'ClusterSell'
  detectedAt: string
  buyerCount: number
  sellerCount: number
  totalValue: number
  transactionCount: number
  transactions: Transaction[]
}

export interface UsageStats {
  plan: string
  requestsToday: number
  dailyLimit: number
  requestsAllTime: number
  keyCreatedAt: string
}

export interface ApiError {
  error: string
  code: string
  message: string
}

// ----- Tier A additions (2026-06-01, PLAN_MCP_DEFENSE Phase 1) -----
//
// Response shapes for these endpoints are not currently strict-typed in the
// backend OpenAPI spec (server returns inline objects). The MCP passes the
// JSON through to the LLM, so we use permissive `Record<string, unknown>`
// here rather than ossifying field names that might evolve. The codegen in
// Phase 4 will pull strict types from the spec once the backend tightens it.

export type Form144Filing = Record<string, unknown>
export type Holding = Record<string, unknown>
export type Manager = Record<string, unknown>
export type SentimentScore = Record<string, unknown>
export type InsiderCareerSummary = Record<string, unknown>
