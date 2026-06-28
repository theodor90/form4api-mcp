#!/usr/bin/env node
// codegen/generate.mjs — fetch backend OpenAPI spec and emit src/tools/_generated.ts.
//
// Phase 4 of PLAN_MCP_DEFENSE_2026-06-01. Replaces hand-written tool wrappers
// for the long tail of trivial pass-through endpoints. Every new backend endpoint
// that lands in /openapi/v1.json flows into the MCP via CI on the next merge —
// no manual tool wrapper needed.
//
// Hand-written tools in src/tools/*.ts still win on name conflicts. They keep
// the rich LLM-discriminator descriptions ("amendment-aware", "10b5-1 clean",
// etc.) that the spec descriptions don't carry today.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUTPUT_PATH = path.join(REPO_ROOT, 'src/tools/_generated.ts')
const SPEC_URL = process.env.FORM4API_OPENAPI_URL ?? 'https://api.form4api.com/openapi/v1.json'

// Operations excluded entirely from auto-generation:
//   - Operational (health) — not useful for LLM research workflows
//   - Mutating + sensitive (billing, key management, webhook create/delete) —
//     we deliberately keep these out of the LLM-exposed surface
//   - Auth-establishing — should require explicit user action, not an LLM call
const SKIP_OPERATIONS = new Set([
  'HealthLive',
  'HealthReady',
  'CreateCheckout',
  'CreateBillingPortal',
  'CreateApiKey',
  'CreateWebhook',
  'DeleteWebhook',
  // Bulk CSV exports — stream up to 100k rows of raw RFC 4180 CSV and are
  // Business+ gated. Poor fit for an LLM tool (token blast / 402 for most
  // callers / client.get expects JSON). Agents should use get_transactions /
  // get_form144 with pagination instead.
  'ExportTransactions',
  'ExportForm144',
  // Featured customer testimonials — a marketing/social-proof endpoint for the
  // website, not insider-research data. Keyless, but no value as an LLM tool;
  // keep it out of the MCP surface. (Leaked in via the OpenAPI spec when the
  // testimonial feature shipped, 2026-06-28.)
  'GetFeaturedTestimonials',
])

// Operations that have a hand-written tool wrapper in src/tools/*.ts. The
// hand-written versions carry richer LLM-discriminator descriptions
// (amendment-aware, 10b5-1 clean, institutional × insider join, Form 144
// early signal, etc.) that aren't in the OpenAPI spec yet. Codegen skips
// these so we don't end up with two near-duplicate tools doing the same thing.
//
// Move an entry OUT of this set when you want to delete the corresponding
// src/tools/*.ts file and let the codegen take over — only do that once the
// backend OpenAPI summary/description is rich enough to stand on its own.
const HANDLED_BY_HANDWRITTEN = new Set([
  'ListTransactions',         // → get_transactions (src/tools/transactions.ts)
  'GetRecentFilings',         // → get_recent_filings (src/tools/filings.ts)
  'GetFiling',                // → get_filing
  'GetInsider',               // → get_insider_profile (src/tools/insiders.ts)
  'GetInsiderTransactions',   // → get_insider_transactions
  'GetInsiderSummary',        // → get_insider_career_summary (src/tools/insiderSummary.ts)
  'GetCompany',               // → get_company_overview (src/tools/companies.ts)
  'GetCompanyInsiders',       // → get_company_insiders
  'GetSignals',               // → get_signals (src/tools/signals.ts)
  'GetSentiment',             // → get_sentiment (src/tools/sentiment.ts)
  'ListForm144',              // → get_form144 (src/tools/form144.ts)
  'ListHoldings',             // → get_holdings (src/tools/holdings.ts)
  'ListManagers',             // → get_managers (src/tools/managers.ts)
  'GetKeyUsage',              // → check_usage (src/tools/usage.ts)
])

// Override the default snake_case mapping for a clearer LLM tool name on a
// per-operation basis. Most ops use the auto-derived name (PascalCase → snake_case).
const NAME_OVERRIDES = {
  ListInsiders: 'search_insiders',
}

function pascalToSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase()
}

function toolNameFor(operationId) {
  if (NAME_OVERRIDES[operationId]) return NAME_OVERRIDES[operationId]
  return pascalToSnake(operationId)
}

// Translate an OpenAPI parameter schema into a zod expression string.
// Conservative: anything we don't recognise becomes z.unknown() so we never
// generate a broken type. Callers can still pass values through — the backend
// is the source of truth for validation.
function zodForParam(param) {
  const s = param.schema ?? {}
  let expr

  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const enumLiterals = s.enum.map((v) => JSON.stringify(v)).join(', ')
    expr = `z.enum([${enumLiterals}] as const)`
  } else {
    switch (s.type) {
      case 'string':  expr = 'z.string()'; break
      case 'integer': expr = 'z.number().int()'; break
      case 'number':  expr = 'z.number()'; break
      case 'boolean': expr = 'z.boolean()'; break
      default:        expr = 'z.unknown()'; break
    }
    if (s.type === 'integer' || s.type === 'number') {
      if (typeof s.minimum === 'number') expr += `.min(${s.minimum})`
      if (typeof s.maximum === 'number') expr += `.max(${s.maximum})`
    }
  }

  if (!param.required) expr += '.optional()'

  const desc = param.description || s.description
  if (desc) {
    // Escape backticks + ${} so the description is safe to drop into a TS string literal
    const escaped = desc.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
    expr += `.describe(\`${escaped}\`)`
  }

  return expr
}

// Build the description for the tool — combines OpenAPI summary + description.
// Annotated with a "(generated)" suffix so users reading the tool list can
// distinguish auto-generated from hand-written tools.
function descriptionFor(op) {
  const summary = (op.summary || '').trim()
  const detail = (op.description || '').trim()
  let combined = summary
  if (detail && detail !== summary) combined = summary ? `${summary}. ${detail}` : detail
  return combined || `Auto-generated wrapper for ${op.operationId}`
}

// Identify path-template parameters (the {ticker}, {cik}, {accession} etc.).
function pathParamsOf(pathTemplate) {
  return [...pathTemplate.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

// Emit the handler body for a generated tool — substitutes path params and
// builds the query-param object.
function handlerBody(method, pathTemplate, params) {
  const pathParams = pathParamsOf(pathTemplate)
  const queryParams = params.filter((p) => p.in === 'query')

  let urlExpr
  if (pathParams.length === 0) {
    urlExpr = `'${pathTemplate}'`
  } else {
    let parts = pathTemplate
    for (const pp of pathParams) {
      parts = parts.replace(`{${pp}}`, '\\${encodeURIComponent(String(input.' + pp + '))}')
    }
    urlExpr = '`' + parts + '`'
  }

  const queryObj = queryParams.length === 0
    ? ''
    : `, {\n        ${queryParams.map((p) => `${p.name}: input.${p.name} as never`).join(',\n        ')},\n      }`

  const methodLc = method.toLowerCase()
  if (methodLc === 'get') {
    return `client.get<unknown>(${urlExpr}${queryObj})`
  }
  // POST/DELETE supported via a hypothetical client.request — for now we skip
  // anything other than GET in the SKIP filter, so this branch shouldn't fire.
  return `client.get<unknown>(${urlExpr}${queryObj})`
}

async function main() {
  console.log(`Fetching OpenAPI spec from ${SPEC_URL}`)
  const res = await fetch(SPEC_URL)
  if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`)
  const spec = await res.json()

  const tools = []
  let skipped = 0

  for (const [pathTemplate, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue
      const opId = op.operationId
      if (!opId) continue

      // Skip rules: explicit skip list, hand-written equivalent exists, or
      // any non-GET (mutations stay hand-written so we can be deliberate)
      if (SKIP_OPERATIONS.has(opId) || HANDLED_BY_HANDWRITTEN.has(opId) || method.toLowerCase() !== 'get') {
        skipped++
        continue
      }

      const params = op.parameters ?? []
      const schemaFields = params.map((p) => `  ${p.name}: ${zodForParam(p)},`).join('\n')

      tools.push({
        name: toolNameFor(opId),
        operationId: opId,
        method: method.toUpperCase(),
        path: pathTemplate,
        description: descriptionFor(op),
        schemaFields,
        handlerExpr: handlerBody(method, pathTemplate, params),
      })
    }
  }

  tools.sort((a, b) => a.name.localeCompare(b.name))

  const header = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: ${SPEC_URL}
// Regenerate: npm run codegen
// Check for drift: npm run codegen:check
//
// Phase 4 of PLAN_MCP_DEFENSE_2026-06-01. Wraps every OpenAPI GET operation
// not in the skip-list as a thin MCP tool. Hand-written tools in src/tools/*.ts
// win on name conflicts — they carry the LLM-discriminator descriptions
// (amendment-aware, 10b5-1 clean, etc.) that the OpenAPI spec doesn't.
//
// To exclude an operation: add its operationId to SKIP_OPERATIONS in
// codegen/generate.mjs and regenerate.
/* eslint-disable */
import { z } from 'zod'
import type { Form4ApiClient } from '../client.js'

export interface GeneratedTool {
  name: string
  operationId: string
  method: string
  path: string
  description: string
  schema: z.ZodRawShape
  handler: (client: Form4ApiClient, input: Record<string, unknown>) => Promise<unknown>
}

export const GENERATED_TOOLS: GeneratedTool[] = [
`

  const toolBlocks = tools.map((t) => `  {
    name: '${t.name}',
    operationId: '${t.operationId}',
    method: '${t.method}',
    path: '${t.path}',
    description: ${JSON.stringify(t.description)},
    schema: {
${t.schemaFields}
    },
    handler: async (client, input) => ${t.handlerExpr},
  },`).join('\n')

  const footer = `\n]\n`

  const output = header + toolBlocks + footer

  await fs.writeFile(OUTPUT_PATH, output, 'utf8')
  console.log(`\nWrote ${OUTPUT_PATH}`)
  console.log(`  ${tools.length} tools generated, ${skipped} operations skipped`)
  for (const t of tools) {
    console.log(`    - ${t.name.padEnd(30)} ${t.method} ${t.path}`)
  }
}

main().catch((err) => {
  console.error('Codegen failed:', err)
  process.exit(1)
})
