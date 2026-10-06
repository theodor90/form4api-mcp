/**
 * Metadata drift check — no server needed. Fails when the hand-maintained
 * metadata files disagree with the source of truth:
 *   - test/expected.mjs   (EXPECTED_TOOLS / EXPECTED_PROMPTS; mcp-test.mjs
 *                          already asserts the running server matches it)
 *   - package.json        (version)
 *
 * Checked: server.json (version, package version, description counts and the
 * registry's 100-char limit), manifest.json (version, tool names), and the
 * README's tool/prompt counts plus its tool table.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED_TOOLS, EXPECTED_PROMPTS } from './expected.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(path.join(root, f), 'utf8')
const json = (f) => JSON.parse(read(f))

const pkg = json('package.json')
const server = json('server.json')
const manifest = json('manifest.json')
const readme = read('README.md')

const N = EXPECTED_TOOLS.length
const P = EXPECTED_PROMPTS.length

let passed = 0
let failed = 0
function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}`)
    failed++
  }
}

const diff = (a, b) => a.filter((x) => !b.includes(x))
const dupes = (a) => a.filter((x, i) => a.indexOf(x) !== i)

console.log('Metadata drift check')

// --- versions ---
assert(server.version === pkg.version, `server.json version (${server.version}) == package.json (${pkg.version})`)
assert(
  server.packages?.[0]?.version === pkg.version,
  `server.json packages[0].version (${server.packages?.[0]?.version}) == package.json (${pkg.version})`,
)
assert(manifest.version === pkg.version, `manifest.json version (${manifest.version}) == package.json (${pkg.version})`)

// --- server.json description ---
const desc = server.description ?? ''
assert(desc.includes(`${N} tools`), `server.json description says "${N} tools"`)
assert(desc.includes(`${P} prompts`), `server.json description says "${P} prompts"`)
assert(desc.length <= 100, `server.json description is ${desc.length} chars (registry limit 100)`)

// --- manifest.json tools ---
const manifestTools = (manifest.tools ?? []).map((t) => t.name)
assert(manifestTools.length === N, `manifest.json lists ${manifestTools.length} tools, expected ${N}`)
assert(diff(EXPECTED_TOOLS, manifestTools).length === 0, `manifest.json is missing no tools (${diff(EXPECTED_TOOLS, manifestTools).join(', ') || 'none'})`)
assert(diff(manifestTools, EXPECTED_TOOLS).length === 0, `manifest.json has no unregistered tools (${diff(manifestTools, EXPECTED_TOOLS).join(', ') || 'none'})`)
assert(dupes(manifestTools).length === 0, 'manifest.json has no duplicate tools')
assert((manifest.tools ?? []).every((t) => typeof t.description === 'string' && t.description.length > 0), 'every manifest.json tool has a description')

// --- README counts (named phrases only, so unrelated prose numbers are safe) ---
const countOf = (re) => {
  const m = readme.match(re)
  return m ? Number(m[1]) : null
}
const headline = countOf(/^>.*?[—-]\s*(\d+) tools\b/m)
assert(headline === N, `README leading tagline says "${headline} tools", expected ${N}`)
const heading = countOf(/^## Available tools \((\d+)\)/m)
assert(heading === N, `README "Available tools (${heading})" heading, expected ${N}`)
const beyond = countOf(/\bBeyond the (\d+) tools\b/)
assert(beyond === N, `README "Beyond the ${beyond} tools", expected ${N}`)
const ofThe = countOf(/\bof the (\d+) tools\b/)
assert(ofThe === N, `README "of the ${ofThe} tools" (plans section), expected ${N}`)
const promptsHeading = countOf(/^## Prompts \((\d+)\)/m)
assert(promptsHeading === P, `README "Prompts (${promptsHeading})" heading, expected ${P}`)

// --- README tool table: every registered tool has exactly one row ---
const toolsSection = readme.slice(readme.indexOf('## Available tools'), readme.indexOf('## Prompts'))
const rows = [...toolsSection.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1])
assert(diff(EXPECTED_TOOLS, rows).length === 0, `README tool table is missing no tools (${diff(EXPECTED_TOOLS, rows).join(', ') || 'none'})`)
assert(diff(rows, EXPECTED_TOOLS).length === 0, `README tool table has no unregistered tools (${diff(rows, EXPECTED_TOOLS).join(', ') || 'none'})`)
assert(dupes(rows).length === 0, 'README tool table has no duplicate rows')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
