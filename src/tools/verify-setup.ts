import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const BASE_URL = process.env.FORM4API_BASE_URL ?? 'https://api.form4api.com'

// Read version from package.json — mirrors the pattern in client.ts so the
// User-Agent stays accurate without any additional drift risk.
// __dirname is dist/tools/ at runtime (CommonJS output) — unlike client.js
// which lives in dist/ — so go up TWO levels to reach the repo-root package.json.
const { version: PKG_VERSION } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { version: string }

export const verifySetupSchema = z.object({})

export type VerifySetupInput = z.infer<typeof verifySetupSchema>

interface Check {
  name: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
}

export interface VerifySetupResult {
  ok: boolean
  checks: Check[]
  nextSteps: string[]
}

const TIMEOUT_MS = 5000

function makeAbortSignal(): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), TIMEOUT_MS)
  return controller.signal
}

export async function verifySetup(_input: VerifySetupInput): Promise<VerifySetupResult> {
  try {
    const checks: Check[] = []
    const nextSteps: string[] = []

    // ── Check 1: Environment — FORM4API_KEY present ──────────────────────────
    const apiKey = process.env.FORM4API_KEY
    const keyPresent = !!apiKey && apiKey.trim() !== ''

    checks.push({
      name: 'Environment: FORM4API_KEY present',
      status: keyPresent ? 'pass' : 'fail',
      detail: keyPresent ? 'Key found' : 'FORM4API_KEY is not set',
    })

    // ── Check 2: API Key — Valid (401 test via /v1/keys/usage) ───────────────
    // Direct fetch — NOT via Form4ApiClient (its constructor throws when the
    // key is unset, so we use raw fetch throughout verify_setup).
    let usageData: { plan: string; requestsToday: number; dailyLimit: number } | null = null

    if (!keyPresent) {
      checks.push({
        name: 'API Key: Valid (401 test)',
        status: 'warn',
        detail: 'Skipped (no key to test)',
      })
      nextSteps.push(
        '1. Get a free API key at https://www.form4api.com/dashboard (500 requests/day, no credit card)',
        '2. Add it to your MCP client config: "env": { "FORM4API_KEY": "your-key-here" }',
        '3. Or set it inline: FORM4API_KEY=your-key npx form4api-mcp',
      )
    } else {
      try {
        const res = await fetch(`${BASE_URL}/v1/keys/usage`, {
          headers: {
            'X-Api-Key': apiKey.trim(),
            'User-Agent': `form4api-mcp/${PKG_VERSION}`,
          },
          signal: makeAbortSignal(),
        })

        if (res.status === 200) {
          const body = await res.json() as { plan: string; requestsToday: number; dailyLimit: number }
          usageData = body
          checks.push({
            name: 'API Key: Valid (401 test)',
            status: 'pass',
            detail: `Authenticated as ${body.plan ?? 'Unknown'} plan`,
          })
        } else if (res.status === 401) {
          checks.push({
            name: 'API Key: Valid (401 test)',
            status: 'fail',
            detail: 'Invalid API key. Check FORM4API_KEY in your MCP client config.',
          })
          nextSteps.push('Check that FORM4API_KEY is set to a valid key from https://www.form4api.com/dashboard')
        } else if (res.status === 402) {
          let body: { currentPlan?: string; required_plan?: string } = {}
          try {
            body = await res.json() as typeof body
          } catch {
            // ignore parse error; fall back to empty body
          }
          checks.push({
            name: 'API Key: Valid (401 test)',
            status: 'fail',
            detail: `Requires ${body.required_plan ?? 'higher'} plan; current plan is ${body.currentPlan ?? 'unknown'}`,
          })
          nextSteps.push('Upgrade your plan at https://www.form4api.com/dashboard/billing to access this tool')
        } else {
          let errorText = res.statusText
          try {
            const body = await res.json() as { message?: string; error?: string }
            errorText = body.message ?? body.error ?? errorText
          } catch {
            // ignore parse error; use status text
          }
          checks.push({
            name: 'API Key: Valid (401 test)',
            status: 'fail',
            detail: `HTTP ${res.status}: ${errorText}`,
          })
        }
      } catch {
        // Network error or timeout — don't add a nextStep here; Check 3 will
        // surface the connectivity issue with a more actionable message.
        checks.push({
          name: 'API Key: Valid (401 test)',
          status: 'fail',
          detail: 'Cannot reach API. Check your internet connection or firewall.',
        })
      }
    }

    // ── Check 3: Backend — Reachable (keyless probe, direct fetch) ───────────
    // CRITICAL: this MUST be a direct fetch(), never via Form4ApiClient.
    try {
      const res = await fetch(`${BASE_URL}/v1/stats`, {
        signal: makeAbortSignal(),
      })

      if (res.status === 200) {
        checks.push({
          name: 'Backend: Reachable',
          status: 'pass',
          detail: 'GET /v1/stats returned 200; API is up',
        })
      } else if (res.status >= 500) {
        checks.push({
          name: 'Backend: Reachable',
          status: 'fail',
          detail: `Backend returned HTTP ${res.status}; api.form4api.com may be down`,
        })
        nextSteps.push(
          'Check https://status.form4api.com or retry in a moment; if the problem persists, contact support@form4api.com',
        )
      } else {
        checks.push({
          name: 'Backend: Reachable',
          status: 'fail',
          detail: `HTTP ${res.status}: ${res.statusText}`,
        })
        nextSteps.push(
          'Check https://status.form4api.com or retry in a moment; if the problem persists, contact support@form4api.com',
        )
      }
    } catch {
      checks.push({
        name: 'Backend: Reachable',
        status: 'fail',
        detail: 'Cannot reach API. Check your internet connection or firewall.',
      })
      nextSteps.push(
        'Check https://status.form4api.com or retry in a moment; if the problem persists, contact support@form4api.com',
      )
    }

    // ── Check 4: Plan — Current plan (derived from Check 2) ──────────────────
    if (usageData !== null) {
      checks.push({
        name: 'Plan: Current plan',
        status: 'pass',
        detail: `${usageData.plan}; requestsToday: ${usageData.requestsToday} / dailyLimit: ${usageData.dailyLimit}`,
      })
    } else {
      checks.push({
        name: 'Plan: Current plan',
        status: 'warn',
        detail: 'Unknown (authentication required)',
      })
    }

    // Determine overall ok: any 'fail' status means not ok
    const ok = checks.every(c => c.status !== 'fail')

    if (!ok && nextSteps.length === 0) {
      nextSteps.push('Fix the failed checks above and retry')
    }

    return { ok, checks, nextSteps }
  } catch (err) {
    // Fallback: something completely unexpected happened; never throw
    return {
      ok: false,
      checks: [
        { name: 'Unexpected error', status: 'fail', detail: `${err}` },
      ],
      nextSteps: ['Restart the MCP server and try again. If this persists, contact support.'],
    }
  }
}
