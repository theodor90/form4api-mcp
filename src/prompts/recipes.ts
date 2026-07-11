// src/prompts/recipes.ts — hand-written MCP "prompts" (recipe workflows).
//
// NOT touched by codegen. Unlike src/tools/*, these are pure client-side
// convenience templates: each one returns a canned user-message that tells
// the calling LLM which of the 25 tools to call, in what order, and how to
// read the result. They add zero new backend surface area — they're a
// script for tool orchestration that the MCP protocol lets a client discover
// via prompts/list and fetch via prompts/get.
//
// Added v1.9.0 (2026-07-11) — the one feature edgar.tools' competing MCP
// has that this server lacked (their 7 "recipes"). Wired into src/index.ts.
import { z } from 'zod'

export interface RecipePromptMessage {
  role: 'user'
  content: { type: 'text'; text: string }
}

export interface RecipePromptResult {
  [key: string]: unknown
  description?: string
  messages: RecipePromptMessage[]
}

export interface RecipePrompt {
  name: string
  description: string
  argsSchema: z.ZodRawShape
  handler: (args: Record<string, string | undefined>) => RecipePromptResult
}

function userMessage(text: string): RecipePromptResult {
  return { messages: [{ role: 'user', content: { type: 'text', text } }] }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. insider_monitor
// ─────────────────────────────────────────────────────────────────────────
const insiderMonitor: RecipePrompt = {
  name: 'insider_monitor',
  description:
    'Monitor recent SEC Form 4 insider trading activity for a stock ticker — transactions flagged for 10b5-1 plans, cluster buy/sell signals, and insider sentiment, summarized as buy vs. sell conviction with historical post-trade-return context.',
  argsSchema: {
    ticker: z.string().describe('Stock ticker symbol to monitor, e.g. AAPL'),
  },
  handler: (args) => {
    const ticker = (args.ticker ?? '').toUpperCase()
    return userMessage(`Monitor recent SEC Form 4 insider trading activity for ${ticker}. Work through this step by step:

1. Call \`research_company\` with ticker="${ticker}" first — it bundles company profile, recent transactions, cluster signals, and sentiment in one call (Business-plan sections degrade gracefully if unavailable; note which ones did).
2. Call \`get_transactions\` with ticker="${ticker}", exclude_10b5=true, per_page=50 to get the clean discretionary-only transaction list (drops pre-scheduled 10b5-1 disposals that aren't a real signal).
3. If cluster signals or sentiment came back unavailable in step 1 (Business plan required), call \`get_signals\` (ticker="${ticker}") and \`get_sentiment\` (ticker="${ticker}") directly and report the 402 upgrade path if they fail.
4. For the 1-2 insiders with the largest discretionary buys or sells, call \`get_insider_career_summary\` (Pro plan) with their CIK to pull post-trade-return averages — this is what tells you whether this insider's past buys/sells actually predicted anything.

Present a terse, quant-flavored summary:
- Buy vs. sell count and total $ value, discretionary-only (10b5-1 excluded)
- Net direction (bullish/bearish/neutral) and whether a cluster signal is active
- Current sentiment score (-100 to +100) if available
- For the largest trade(s): the insider's historical post-trade-return track record, if available
- Flag plainly if a section required a plan upgrade instead of guessing at the data

No fluff, no restating the question — numbers and a one-line verdict.`)
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 2. cluster_buy_scan
// ─────────────────────────────────────────────────────────────────────────
const clusterBuyScan: RecipePrompt = {
  name: 'cluster_buy_scan',
  description:
    'Scan recent cluster-buy signals across the whole market — multiple SEC Form 4 insiders at the same company buying in the same short window, excluding 10b5-1 plan trades — ranked by conviction (insider count and dollar value), with each company\'s insider-sentiment score.',
  argsSchema: {
    days: z
      .string()
      .optional()
      .describe('Lookback window in days, as a numeric string (default "7"). E.g. "14" for two weeks.'),
  },
  handler: (args) => {
    const days = args.days && args.days.trim() !== '' ? args.days.trim() : '7'
    return userMessage(`Scan for cluster-buy signals across the market from the last ${days} days. Work through this step by step:

1. Call \`get_signals\` with cluster_buy=true, per_page=50 (Business plan required — surface the upgrade path if it 402s). This tool excludes 10b5-1 plan trades by construction, so every signal returned is discretionary conviction, not scheduled selling noise.
2. Filter the results client-side to \`detectedAt\` within the last ${days} days.
3. Rank the remaining signals by conviction: primarily by \`buyerCount\` (more insiders agreeing = higher conviction), tie-broken by \`totalValue\` (larger dollar commitment).
4. For the top 5-10 ranked signals, call \`get_sentiment\` with each company's ticker (Business plan) to add the current insider-sentiment score for context — does the cluster buy line up with an already-improving sentiment trend, or is it a reversal signal?

Present a terse ranked table: ticker, company, buyer count, total $ value, detected date, sentiment score. One-line verdict per top pick — is this a strong or weak conviction signal. Skip signals with only 2 buyers and low dollar value unless nothing else qualifies.`)
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 3. form144_early_warning
// ─────────────────────────────────────────────────────────────────────────
const form144EarlyWarning: RecipePrompt = {
  name: 'form144_early_warning',
  description:
    'Early-warning scan of pending SEC Form 144 notice-of-proposed-sale filings, which lead the actual Form 4 sale by roughly 2 days — cross-referenced against recent Form 4 sells and flagged for discretionary (non-10b5-1) notices, the highest-signal insider-selling early warnings.',
  argsSchema: {
    ticker: z.string().optional().describe('Stock ticker symbol to scope the scan to, e.g. TSLA. Omit to scan across all companies.'),
  },
  handler: (args) => {
    const ticker = args.ticker?.trim()
    const scope = ticker ? `ticker="${ticker.toUpperCase()}"` : 'no ticker filter (market-wide scan)'
    return userMessage(`Run a Form 144 early-warning scan${ticker ? ` for ${ticker.toUpperCase()}` : ' across the market'}. Work through this step by step:

1. Call \`get_form144\` with ${scope}${ticker ? ', ' : ''}exclude_10b5=true, per_page=50 (Business plan required — surface the upgrade path if it 402s). exclude_10b5=true keeps only discretionary notices, which is the actual early-warning signal; a 10b5-1 Form 144 just confirms a pre-scheduled sale is coming and isn't new information.
2. Call \`get_transactions\` with ${scope}${ticker ? ', ' : ''}code="S", per_page=50 to pull recent actual Form 4 sells.
3. Cross-reference by insider CIK and approximate share count: a Form 144 notice with NO matching Form 4 sell yet (filed within roughly the last 5 days, no corresponding sale in step 2) is a PENDING sale — the SEC's ~2-day lead time means the Form 4 should land soon. A notice that already has a matching Form 4 sell is CONFIRMED/RESOLVED.
4. Flag every PENDING, discretionary (non-10b5-1) notice as the highest-priority item — this is the one signal edgar.tools-style Form 4-only scrapers cannot produce, because they don't ingest Form 144 at all.

Present a terse table: ticker, insider, filed date, proposed shares/value, status (PENDING/RESOLVED), 10b5-1 flag. Call out the PENDING discretionary rows first with a one-line "watch for this" note.`)
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 4. exec_conviction_check
// ─────────────────────────────────────────────────────────────────────────
const execConvictionCheck: RecipePrompt = {
  name: 'exec_conviction_check',
  description:
    'Check a company insider or executive\'s career SEC Form 4 track record — total bought/sold, historical post-trade returns on their discretionary open-market buys, and whether their discretionary buying has historically beaten their scheduled 10b5-1 plan selling. Uses Form4API\'s unique per-insider return scoring (Pro plan+).',
  argsSchema: {
    insider: z
      .string()
      .describe('Insider name (e.g. "Tim Cook") or CIK number (e.g. "1214128"). A name will be resolved to a CIK first.'),
  },
  handler: (args) => {
    const insider = (args.insider ?? '').trim()
    const looksLikeCik = /^\d+$/.test(insider)
    return userMessage(`Check the career conviction track record for insider "${insider}". Work through this step by step:

${looksLikeCik
  ? `1. "${insider}" looks like a CIK already — use it directly.`
  : `1. "${insider}" looks like a name, not a CIK. Call \`search_insiders\` with name="${insider}" to resolve it to a CIK. If more than one match comes back, pick the most likely one (or ask which company they're associated with) before continuing.`}
2. Call \`get_insider_profile\` with the CIK — confirm name, titles, director/officer/10%-owner flags.
3. Call \`get_insider_career_summary\` with the CIK (Pro plan) — pull first/last transaction dates, total bought/sold/net, top companies traded, the 10b5-1 plan split, and post-trade-return averages.
4. Call \`get_insider_scorecard\` with the CIK (Pro plan) — pull the hit rate and average/median return specifically on discretionary open-market buys (TransactionCode=P, no 10b5-1, no derivatives), at both the 3-month and 6-month horizon. Check \`sampleSufficient\` — if false (fewer than 5 matured scored buys), say so plainly instead of reporting a misleading number.
5. Optionally call \`get_insider_transactions\` with the CIK for the underlying transaction-level detail if the summary numbers need drilling into.

Present a terse verdict:
- Career total bought / sold / net, and what fraction of their selling is 10b5-1 (scheduled, not a signal) vs. discretionary
- Discretionary buy hit rate and avg return at 3m/6m (flag if sample is too small to trust)
- One-line conclusion: does this insider's discretionary BUYING historically show real predictive conviction, or is their activity dominated by scheduled plan liquidity that shouldn't move your read on the stock?`)
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 5. institutional_insider_overlap
// ─────────────────────────────────────────────────────────────────────────
const institutionalInsiderOverlap: RecipePrompt = {
  name: 'institutional_insider_overlap',
  description:
    'Combine institutional 13F-HR holders with recent SEC Form 4 insider transactions for a ticker to spot where smart money (institutions) and company insiders agree or diverge — both accumulating, both trimming, or pulling in opposite directions.',
  argsSchema: {
    ticker: z.string().describe('Stock ticker symbol, e.g. NVDA'),
  },
  handler: (args) => {
    const ticker = (args.ticker ?? '').toUpperCase()
    return userMessage(`Compare institutional and insider positioning for ${ticker}. Work through this step by step:

1. Call \`get_holdings\` with ticker="${ticker}", per_page=20 (Business plan required — surface the upgrade path if it 402s). This resolves CUSIP → ticker automatically. Note the top institutional positions and whichever quarter-over-quarter fields are present in the response (e.g. share/value changes) — the shape is loosely typed, so read whatever the API actually returns rather than assuming exact field names.
2. Optionally call \`get_managers\` with name filters on the top holders from step 1 to get their AUM and confirm identity (e.g. "Berkshire" → Berkshire Hathaway).
3. Call \`get_transactions\` with ticker="${ticker}", exclude_10b5=true, significant=true, per_page=50 to get recent discretionary insider activity (significant=true presets to open-market only, no plan trades, no derivatives).
4. Call \`get_sentiment\` with ticker="${ticker}" (Business plan) for the current insider-sentiment score.

Cross-reference and present a terse verdict:
- Are the top institutional holders adding while insiders are buying? → aligned bullish, strongest read
- Are institutions trimming while insiders are selling (discretionary, not 10b5-1)? → aligned bearish
- Institutions adding while insiders sell, or institutions trimming while insiders buy? → divergence — call this out explicitly, it's the most interesting case
- One line noting whether either dataset was unavailable due to plan gating, so the read isn't presented as more complete than it is`)
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 6. post_selloff_buys
// ─────────────────────────────────────────────────────────────────────────
const postSelloffBuys: RecipePrompt = {
  name: 'post_selloff_buys',
  description:
    'Screen recent SEC Form 4 insider buys for historically successful dip-buying patterns, using Form4API\'s post-trade-return data — the insiders whose past discretionary open-market buys have historically produced positive 3/6-month returns (Pro plan+, a feature no scraping-based Form 4 source has).',
  argsSchema: {
    min_return: z
      .string()
      .optional()
      .describe('Minimum historical average post-trade return threshold, as a fraction (e.g. "0.05" for +5%). Defaults to "0.05". Returns are stored as fractions, not percentages.'),
  },
  handler: (args) => {
    const minReturn = args.min_return && args.min_return.trim() !== '' ? args.min_return.trim() : '0.05'
    return userMessage(`Screen for historically-successful insider dip-buying, using a minimum average post-trade-return threshold of ${minReturn} (a fraction — ${minReturn} = +${Number(minReturn) * 100}%). Work through this step by step:

1. Call \`get_transactions\` with code="P", exclude_10b5=true, significant=true, per_page=50 to get recent discretionary open-market buys. If your \`get_transactions\` tool schema accepts return-filter params directly (min_return_3m, min_return_6m, has_returns — Pro plan+, check the tool's current parameter list), pass min_return_3m=${minReturn} to filter server-side. If it doesn't accept them, do the screen manually in the next steps instead.
2. Call \`get_insider_leaderboard\` with order="avg_return", min_trades=5 (Business plan) to pull the market-wide ranking of insiders by historical discretionary-buy return — this surfaces proven dip-buyers even if they haven't traded in your step-1 window yet.
3. For each candidate insider from steps 1-2 (dedupe by CIK), call \`get_insider_scorecard\` with their CIK (Pro plan) to confirm hit rate and avg/median return at the 3m and 6m horizon. Keep only insiders where \`sampleSufficient\` is true and avg return ≥ ${minReturn}.
4. Prefer buys that also line up with a recent price decline in the underlying stock if that context is available — this recipe's premise is "insiders buying into weakness who have historically been right," not just "insiders with a good scorecard."

Present a terse ranked list: insider name, company/ticker, trade date, trade value, historical hit rate, avg return (3m/6m), sample size. One line per entry, ranked by avg return descending. Note plainly if a plan gate limited how many candidates you could verify.`)
  },
}

export const RECIPE_PROMPTS: RecipePrompt[] = [
  insiderMonitor,
  clusterBuyScan,
  form144EarlyWarning,
  execConvictionCheck,
  institutionalInsiderOverlap,
  postSelloffBuys,
]
