#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Form4ApiClient } from './client.js'
import { createServer } from './server.js'
import { startHttpServer } from './http.js'

const httpMode = process.argv.includes('--http') || process.env.MCP_TRANSPORT === 'http'

async function main() {
  if (httpMode) {
    // Hosted mode: keys arrive per request. FORM4API_KEY is deliberately NOT read.
    startHttpServer()
    return
  }

  // Stdio mode: the only place the key is read from the environment.
  const client = new Form4ApiClient(process.env.FORM4API_KEY ?? null)
  const server = createServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('Form4API MCP server running on stdio\n')
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`)
  process.exit(1)
})
