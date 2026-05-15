const BASE_URL = process.env.FORM4API_BASE_URL ?? 'https://api.form4api.com'

export class Form4ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
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
        'User-Agent': 'form4api-mcp/1.0.0',
      },
    })

    if (!res.ok) {
      let code: string | undefined
      let message = res.statusText

      try {
        const body = await res.json() as { code?: string; message?: string; error?: string }
        code = body.code
        message = body.message ?? body.error ?? message
      } catch {
        // ignore parse error; use status text
      }

      if (res.status === 402) {
        const planNeeded = this.planNameFromCode(code)
        throw new Form4ApiError(
          `This endpoint requires the ${planNeeded} plan.\n` +
          `Your current plan does not include this feature.\n` +
          `Upgrade at https://form4api.com/#pricing`,
          402,
          code,
        )
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

  private planNameFromCode(code?: string): string {
    if (!code) return 'a higher'
    if (code.includes('BUSINESS')) return 'Business ($149/mo)'
    if (code.includes('PRO')) return 'Pro ($49/mo)'
    if (code.includes('ENTERPRISE')) return 'Enterprise ($499/mo)'
    return 'a higher'
  }
}
