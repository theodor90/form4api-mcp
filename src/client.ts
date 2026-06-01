const BASE_URL = process.env.FORM4API_BASE_URL ?? 'https://api.form4api.com'

// Structured payload the MCP returns when an upstream call needs a plan
// upgrade. The LLM router can read the JSON shape and surface the upgrade
// path to the user cleanly (e.g. "you need Business for sentiment scores,
// upgrade at form4api.com/dashboard/billing") instead of swallowing an
// opaque 402 text. PLAN_MCP_DEFENSE Decision 1 (2026-06-01).
export interface UpgradeRequiredPayload {
  error: 'upgrade_required'
  required_plan: 'pro' | 'business' | 'enterprise' | 'higher'
  current_plan?: string
  message: string
  upgrade_url: string
}

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

export class Form4ApiClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor() {
    const key = process.env.FORM4API_KEY
    if (!key) {
      throw new Error(
        'FORM4API_KEY environment variable is not set.\n' +
        'Set it before running: FORM4API_KEY=fapi_live_your_key npx form4api-mcp',
      )
    }
    this.apiKey = key
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

    const res = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': this.apiKey,
        'User-Agent': 'form4api-mcp/1.2.0',
      },
    })

    if (!res.ok) {
      let code: string | undefined
      let message = res.statusText
      let currentPlan: string | undefined

      try {
        const body = await res.json() as { code?: string; message?: string; error?: string; currentPlan?: string }
        code = body.code
        message = body.message ?? body.error ?? message
        currentPlan = body.currentPlan
      } catch {
        // ignore parse error; use status text
      }

      if (res.status === 402) {
        const requiredPlan = this.requiredPlanFromCode(code)
        const planDisplay = this.planDisplayName(requiredPlan)
        const payload: UpgradeRequiredPayload = {
          error: 'upgrade_required',
          required_plan: requiredPlan,
          current_plan: currentPlan,
          message: `This tool requires the ${planDisplay} plan. ${currentPlan ? `Your current plan is ${currentPlan}.` : ''} Upgrade in the Form4API dashboard.`,
          upgrade_url: 'https://www.form4api.com/dashboard/billing',
        }
        // The structured payload is JSON-encoded into the error message so
        // the MCP server's text-channel response carries the full shape.
        // The LLM router parses the JSON back out and surfaces the upgrade
        // link directly to the user. PLAN_MCP_DEFENSE Decision 1.
        throw new Form4ApiError(JSON.stringify(payload), 402, code, payload)
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
          'Invalid or missing API key. Check your FORM4API_KEY environment variable.',
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

  private requiredPlanFromCode(code?: string): 'pro' | 'business' | 'enterprise' | 'higher' {
    if (!code) return 'higher'
    if (code.includes('BUSINESS')) return 'business'
    if (code.includes('PRO')) return 'pro'
    if (code.includes('ENTERPRISE')) return 'enterprise'
    return 'higher'
  }

  private planDisplayName(plan: 'pro' | 'business' | 'enterprise' | 'higher'): string {
    switch (plan) {
      case 'pro': return 'Pro ($49/mo)'
      case 'business': return 'Business ($149/mo)'
      case 'enterprise': return 'Enterprise ($499/mo)'
      default: return 'a higher'
    }
  }
}
