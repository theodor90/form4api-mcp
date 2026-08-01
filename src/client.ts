import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env.FORM4API_BASE_URL ?? 'https://api.form4api.com'

// Single source of truth for the version — read from package.json at load so
// the User-Agent can never drift from the published version. This UA is how the
// backend attributes traffic to the MCP channel (User-Agent: form4api-mcp/x.y.z),
// so it must stay accurate. Mirrors the serverInfo version read in index.ts.
// __dirname is dist/ at runtime (CommonJS output); ../package.json is the root.
const { version: PKG_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string }

export type RequiredPlan = 'starter' | 'pro' | 'business' | 'enterprise' | 'higher'

// Structured payload the MCP returns when an upstream call needs a plan
// upgrade. The LLM router can read the JSON shape and surface the upgrade
// path to the user cleanly (e.g. "you need Business for sentiment scores,
// upgrade at form4api.com/dashboard/billing") instead of swallowing an
// opaque 402 text. PLAN_MCP_DEFENSE Decision 1 (2026-06-01).
//
// `message` is the backend's own text, verbatim. That matters: the API
// explains each gate specifically (which page depth was exceeded, which
// filter param is Pro-only, that /v1/transactions/export exists for bulk
// pulls), and that detail is far more useful to a calling agent than any
// sentence this client could synthesise. `unlocks` adds what the target plan
// buys, so the agent can relay a complete upgrade pitch in one turn instead
// of making the user go read the pricing page to find out.
export interface UpgradeRequiredPayload {
  error: 'upgrade_required'
  required_plan: RequiredPlan
  current_plan?: string
  message: string
  unlocks?: string
  upgrade_url: string
  pricing_url: string
}

// What each paid tier adds, phrased as the answer to "why would I pay for
// this". Kept in sync with form4api-web/app/lib/plans.ts, which is the
// single source of truth for plan contents.
const PLAN_UNLOCKS: Record<Exclude<RequiredPlan, 'higher'>, string> = {
  starter:
    'Starter ($19/mo) adds a commercial-use license, 7,500 requests/day, and 100 pages of query depth.',
  pro:
    'Pro ($49/mo) adds insider scorecards and career summaries, congressional trading data and convergence signals, ' +
    'return and trade-size filters, unlimited query depth, and 50,000 requests/day.',
  business:
    'Business ($149/mo) adds cluster-buy signals and sentiment scores, 13F institutional holdings and managers, ' +
    'Form 144 notices, bulk CSV export, and 250,000 requests/day.',
  enterprise:
    'Enterprise ($499/mo) adds unlimited requests, unlimited webhooks, and Slack support with an SLA.',
}

const PRICING_URL = 'https://www.form4api.com/pricing'
const BILLING_URL = 'https://www.form4api.com/dashboard/billing'

export class Form4ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly payload?: UpgradeRequiredPayload,
  ) {
    super(message)
    this.name = 'Form4ApiError'
  }
}

const NO_KEY_MESSAGE =
  'No Form4API key found (FORM4API_KEY is not set).\n' +
  'Get a free key — 500 requests/day, no credit card — at:\n' +
  '  https://www.form4api.com/dashboard\n' +
  'Then add it to your MCP client config:  "env": { "FORM4API_KEY": "your-key" }\n' +
  'or run directly:  FORM4API_KEY=your-key npx form4api-mcp'

export class Form4ApiClient {
  // Key is resolved lazily so the server starts (and keyless tools like
  // get_public_stats / get_data_quality work) without FORM4API_KEY.
  // Authenticated tools surface NO_KEY_MESSAGE on first use instead.
  private readonly apiKey: string | null
  private readonly baseUrl: string

  constructor() {
    this.apiKey = process.env.FORM4API_KEY ?? null
    this.baseUrl = BASE_URL
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {
      'User-Agent': `form4api-mcp/${PKG_VERSION}`,
    }
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey

    const res = await fetch(url.toString(), { headers })

    if (!res.ok) {
      let code: string | undefined
      let message = res.statusText
      let upgradeUrl: string | undefined

      try {
        // The API wraps every error as { error: { code, message, requestId,
        // upgradeUrl? } }. Older/edge responses (and any non-API proxy in
        // front of us) may send those fields flat, so accept both shapes —
        // reading only the flat shape silently produced "[object Object]"
        // for every error the client didn't special-case.
        const body = await res.json() as {
          error?: { code?: string; message?: string; upgradeUrl?: string } | string
          code?: string
          message?: string
        }
        const detail = typeof body.error === 'object' && body.error !== null ? body.error : undefined

        code = detail?.code ?? body.code
        upgradeUrl = detail?.upgradeUrl
        message =
          detail?.message ??
          body.message ??
          (typeof body.error === 'string' ? body.error : undefined) ??
          message
      } catch {
        // ignore parse error; use status text
      }

      // 402 = the endpoint itself is above the caller's plan (PlanGuardMiddleware,
      // and the /v1/transactions page-depth limit). 403 = the endpoint is allowed
      // but a specific parameter is Pro-only (PRO_TIER_REQUIRED, the only 403 the
      // API emits). Both are "pay to proceed", so both get the structured payload
      // rather than a bare error string.
      if (res.status === 402 || res.status === 403) {
        const requiredPlan = this.requiredPlanFrom(code, message)
        const currentPlan = this.currentPlanFrom(message)
        const payload: UpgradeRequiredPayload = {
          error: 'upgrade_required',
          required_plan: requiredPlan,
          ...(currentPlan ? { current_plan: currentPlan } : {}),
          message,
          ...(requiredPlan !== 'higher' ? { unlocks: PLAN_UNLOCKS[requiredPlan] } : {}),
          upgrade_url: upgradeUrl ?? BILLING_URL,
          pricing_url: PRICING_URL,
        }
        // The structured payload is JSON-encoded into the error message so
        // the MCP server's text-channel response carries the full shape.
        // The LLM router parses the JSON back out and surfaces the upgrade
        // link directly to the user. PLAN_MCP_DEFENSE Decision 1.
        throw new Form4ApiError(JSON.stringify(payload), res.status, code, payload)
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') ?? 'a few'
        throw new Form4ApiError(
          `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
          429,
          'RATE_LIMIT_EXCEEDED',
        )
      }

      if (res.status === 401) {
        throw new Form4ApiError(
          this.apiKey
            ? 'Invalid API key. Check FORM4API_KEY in your MCP client config, or get a ' +
              'free key (500 requests/day, no card) at https://www.form4api.com/dashboard'
            : NO_KEY_MESSAGE,
          401,
          'UNAUTHORIZED',
        )
      }

      if (res.status === 404) {
        throw new Form4ApiError(`Not found: ${path}`, 404, 'NOT_FOUND')
      }

      throw new Form4ApiError(`API error ${res.status}: ${message}`, res.status, code)
    }

    return res.json() as Promise<T>
  }

  // The error code alone is often not enough: PlanGuardMiddleware returns the
  // same PLAN_REQUIRED code for every tier and names the tier only in the
  // message ("This endpoint requires the Business plan or higher"). So try the
  // code first, where it is explicit (PRO_TIER_REQUIRED), then the message.
  //
  // The message patterns are deliberately anchored on upgrade phrasing rather
  // than "any plan name in the text" — the page-depth message names the
  // caller's CURRENT plan first ("beyond the Free plan's pagination depth"),
  // so a naive first-match would read that as the required plan.
  private requiredPlanFrom(code?: string, message?: string): RequiredPlan {
    if (code) {
      if (code.includes('BUSINESS')) return 'business'
      if (code.includes('ENTERPRISE')) return 'enterprise'
      if (code.includes('PRO')) return 'pro'
      if (code.includes('STARTER')) return 'starter'
    }

    const named =
      message?.match(/requires the (\w+) plan/i)?.[1] ??
      message?.match(/\b(\w+) plan or higher/i)?.[1]

    switch (named?.toLowerCase()) {
      case 'starter': return 'starter'
      case 'pro': return 'pro'
      case 'business': return 'business'
      case 'enterprise': return 'enterprise'
      default: return 'higher'
    }
  }

  // Both gate messages state the caller's plan, in two different shapes:
  // "Your current plan is Free." (PlanGuardMiddleware) and "beyond the Free
  // plan's pagination depth" (the page-depth limit).
  private currentPlanFrom(message?: string): string | undefined {
    return (
      message?.match(/current plan is (\w+)/i)?.[1] ??
      message?.match(/beyond the (\w+) plan's/i)?.[1]
    )
  }
}
