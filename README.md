# form4api-mcp

> Query SEC Form 4 insider trading data from any MCP-compatible AI assistant

[![npm version](https://badge.fury.io/js/form4api-mcp.svg)](https://www.npmjs.com/package/form4api-mcp)
[![Available on mcp.so](https://img.shields.io/badge/mcp.so-form4api-blue)](https://mcp.so)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps the [Form4API](https://form4api.com) REST API as callable tools. Configure it once in Claude Desktop, Cursor, Windsurf, or any MCP client — then ask natural-language questions about insider trading directly.

---

## Quick install

### 1. Get a free API key

Go to [form4api.com](https://form4api.com) → Sign in → Dashboard. Free plan includes 1,000 requests/day, no credit card required.

### 2. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "form4api": {
      "command": "npx",
      "args": ["-y", "form4api-mcp"],
      "env": {
        "FORM4API_KEY": "fapi_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The tools will appear automatically.

### 3. Or run directly

```bash
FORM4API_KEY=fapi_live_your_key npx form4api-mcp
```

---

## Available tools (9)

| Tool | Description |
|---|---|
| `get_transactions` | Search insider transactions — filter by ticker, insider, transaction code, date range, exclude 10b5-1 plan trades |
| `get_recent_filings` | Most recent Form 4 filings, optionally filtered by ticker |
| `get_filing` | Single filing by accession number |
| `get_insider_profile` | Insider profile — name, title, director/officer/10pct owner flags |
| `get_insider_transactions` | All transactions for a specific insider (by CIK) |
| `get_company_overview` | Company profile — name, CIK, SIC sector, state, website, filing counts |
| `get_company_insiders` | All insiders who have filed Form 4s for a company |
| `get_signals` | Cluster buy/sell signals — requires Business plan |
| `check_usage` | Your API key usage stats and current plan |

---

## Example prompts

Once configured, you can ask Claude:

- *"What insider trades happened at NVDA in the last 30 days, excluding 10b5-1 plan trades?"*
- *"Show me cluster buy signals from this week"*
- *"What is Tim Cook's CIK and how many times has he bought AAPL stock?"*
- *"Are there any cluster buy signals in energy companies?"*
- *"What has the CFO of Microsoft been doing with their shares this year?"*
- *"Show me all open-market purchases over $1M at Tesla in 2026"*
- *"Check my API usage"*

---

## Plans

| Feature | Free | Pro | Business |
|---|---|---|---|
| `get_transactions` | ✓ | ✓ | ✓ |
| `get_recent_filings` | ✓ | ✓ | ✓ |
| `get_filing` | ✓ | ✓ | ✓ |
| `get_insider_profile` | ✓ | ✓ | ✓ |
| `get_insider_transactions` | ✓ | ✓ | ✓ |
| `get_company_overview` | ✓ | ✓ | ✓ |
| `get_company_insiders` | ✓ | ✓ | ✓ |
| `get_signals` | — | — | ✓ |
| Requests/day | 1,000 | 10,000 | 100,000 |

Upgrade at [form4api.com/#pricing](https://form4api.com/#pricing).

---

## Data coverage

- **1M+ transactions** from SEC EDGAR Form 4 filings
- **460K+ filings** across all reporting companies
- **10b5-1 plan detection** — every transaction flagged as pre-scheduled or discretionary
- Real-time ingestion — new filings appear within minutes of SEC publication
- Fields: `transactionCode`, `sharesAmount`, `pricePerShare`, `totalValue`, `isOpenMarket`, `is10b5Plan`, `insiderTitle`, `isDirector`, `isOfficer`, `is10PctOwner`

---

## Links

- [Form4API](https://form4api.com) — API homepage
- [Documentation](https://form4api.com/docs) — Full REST API reference
- [npm](https://www.npmjs.com/package/form4api-mcp) — npm package
- [mcp.so](https://mcp.so) — MCP server directory listing
