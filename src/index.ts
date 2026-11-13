#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Form4ApiClient } from './client.js'
import { createServer } from './server.js'
import { startHttpServer } from './http.js'
import { toolsetFromEnv, toolsetWarning } from './toolsets.js'

const httpMode = process.argv.includes('--http') || process.env.MCP_TRANSPORT === 'http'

async function main() {
  if (httpMode) {
    // Hosted mode: keys arrive per request. FORM4API_KEY is deliberately NOT read.
    startHttpServer()
    return
  }

  // Stdio mode: the only place the key is read from the environment.
  const client = new Form4ApiClient(process.env.FORM4API_KEY ?? null)
  // Existing installs keep all tools; FORM4API_TOOLSETS=default opts in to the curated 15.
  const { toolset, invalid } = toolsetFromEnv(process.env.FORM4API_TOOLSETS, 'all')
  if (invalid !== null) process.stderr.write(toolsetWarning('FORM4API_TOOLSETS', invalid, 'all'))
  const server = createServer(client, undefined, { toolset })
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Form4API MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`)
  process.exit(1)
})
