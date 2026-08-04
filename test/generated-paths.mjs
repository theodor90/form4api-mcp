/**
 * Regression guard for the generated tool paths.
 *
 * The generator builds each URL as a template literal. If it emits an escaped
 * `\${...}` the interpolation is dead and the handler sends the raw source text
 * as the request path — which is exactly what shipped between v1.2.0 and
 * v1.12.0, breaking every path-param tool for two months.
 *
 * `codegen:check` cannot catch this: it only proves the committed file matches
 * what the generator produces, and both were wrong. So assert on the behaviour
 * instead — resolve each handler's path against a dummy client and require that
 * nothing template-shaped survives into the URL.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err.message}`)
    failed++
  }
}

console.log('\nGenerated tool paths — no dead interpolation:\n')

// 1. Static check on the emitted source. An escaped dollar in a path template
//    is never intentional.
const generatedSrc = readFileSync(
  path.resolve(__dirname, '../src/tools/_generated.ts'),
  'utf8',
)

check('generated source contains no escaped \\${ in a template literal', () => {
  const offenders = generatedSrc
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes('\\${'))
  if (offenders.length > 0) {
    const detail = offenders.map(([n, l]) => `line ${n}: ${l.trim()}`).join('\n      ')
    throw new Error(`escaped interpolation found:\n      ${detail}`)
  }
})

// 2. Behavioural check — actually run each handler and inspect the path it asks
//    for. This catches any future way of producing a literal placeholder.
const { GENERATED_TOOLS } = await import('../dist/tools/_generated.js')

const requestedPaths = []
const spyClient = {
  get(url) {
    requestedPaths.push(url)
    return Promise.resolve({})
  },
}

// Path params are strings; query params may be numbers. A string satisfies the
// interpolation either way, and nothing here validates types at call time.
const dummyInput = new Proxy({}, { get: () => 'X' })

for (const tool of GENERATED_TOOLS) {
  await tool.handler(spyClient, dummyInput)
}

check(`all ${GENERATED_TOOLS.length} generated tools resolve to a concrete path`, () => {
  const bad = requestedPaths.filter((p) => p.includes('${') || p.includes('encodeURIComponent'))
  if (bad.length > 0) {
    throw new Error(`unresolved template in:\n      ${bad.join('\n      ')}`)
  }
})

check('path params are actually substituted', () => {
  // At least one tool takes a path param; if substitution silently stopped
  // happening the placeholder braces would survive.
  const withBraces = requestedPaths.filter((p) => /\{\w+\}/.test(p))
  if (withBraces.length > 0) {
    throw new Error(`unsubstituted placeholder in:\n      ${withBraces.join('\n      ')}`)
  }
})

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
