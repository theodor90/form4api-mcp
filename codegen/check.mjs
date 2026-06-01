#!/usr/bin/env node
// codegen/check.mjs — verify that src/tools/_generated.ts matches what
// codegen/generate.mjs would produce against the live OpenAPI spec.
//
// CI runs this on every PR. If a backend OpenAPI change lands without a
// matching `npm run codegen` regen, this fails the build and prints the diff
// so the contributor knows what to do. PLAN_MCP_DEFENSE Phase 4.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const GENERATED_PATH = path.join(REPO_ROOT, 'src/tools/_generated.ts')

async function main() {
  const before = await fs.readFile(GENERATED_PATH, 'utf8').catch(() => '')

  const result = spawnSync('node', [path.join(__dirname, 'generate.mjs')], {
    cwd: REPO_ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    console.error('codegen failed:')
    console.error(result.stderr)
    process.exit(1)
  }

  const after = await fs.readFile(GENERATED_PATH, 'utf8')

  if (before === after) {
    console.log('codegen:check — _generated.ts is in sync with the live OpenAPI spec')
    process.exit(0)
  }

  // Restore the committed file so the working tree isn't modified by the check
  await fs.writeFile(GENERATED_PATH, before, 'utf8')

  console.error('codegen:check — DRIFT DETECTED')
  console.error('')
  console.error('The committed src/tools/_generated.ts does not match what would be')
  console.error('produced from the current OpenAPI spec. The backend has likely added,')
  console.error('changed, or removed an endpoint.')
  console.error('')
  console.error('Fix:')
  console.error('  npm run codegen')
  console.error('  git add src/tools/_generated.ts')
  console.error('  git commit')
  console.error('')
  console.error('--- diff (committed vs what codegen would produce) ---')

  // Best-effort diff using whatever is on PATH (git diff works on Windows + Unix)
  const diff = spawnSync('git', ['diff', '--no-index', '--', GENERATED_PATH, '-'], {
    input: after,
    encoding: 'utf8',
  })
  if (diff.stdout) console.error(diff.stdout)
  else if (diff.stderr) console.error(diff.stderr)

  process.exit(1)
}

main().catch((err) => {
  console.error('codegen:check failed:', err)
  process.exit(1)
})
