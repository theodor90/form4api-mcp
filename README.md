# form4api-mcp

> Production-grade SEC Form 4 insider trading data for any MCP-compatible AI assistant — **amendment-aware, 10b5-1 clean, with Form 144 + institutional 13F-HR overlay**

[![npm version](https://badge.fury.io/js/form4api-mcp.svg)](https://www.npmjs.com/package/form4api-mcp)
[![Available on mcp.so](https://img.shields.io/badge/mcp.so-form4api-blue)](https://mcp.so)

An [MCP](https://modelcontextprotocol.io) server that exposes the hosted [Form4API](https://form4api.com) REST API to Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI, and any other MCP-compatible client. Configured once, your LLM can answer questions about insider trading, institutional positioning, and intent-to-sell filings directly during research sessions.

**Four data-quality claims no scraping-based alternative can make:**

- 🛡 **Amendment-aware** — Form 4/A amendments are reconciled automatically. No double-counting when an insider corrects a filing.
- 🎯 **10b5-1 clean** — every transaction flagged as pre-scheduled (10b5-1 plan) or discretionary. Cluster signals exclude planned trades by construction.
- 📜 **Form 144 intent-to-sell** — 23K+ Form 144 filings indexed. Catch insider sales ~2 days before they hit Form 4.
- 🏛 **Institutional × insider join** — every transaction carries the current 13F-HR ownership context (top-3 holders, AUM trend). No competitor at any price point joins both sides in one query.

---

## Quick install

### 1. Get a free API key

Go to [form4api.com](https://form4api.com) → Sign in → Dashboard. Free plan includes 1,000 requests/day, no credit card required.

### 2. Add to your MCP client

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart the client. The tools appear automatically.

**Claude Code (CLI):**
```sh
claude mcp add form4api -- npx -y form4api-mcp
```
…then set `FORM4API_KEY` in your shell or in `~/.claude/mcp.json`.

**Cursor / VS Code / Codex CLI / Windsurf** — same generic stdio config (`command: "npx"`, `args: ["-y", "form4api-mcp"]`, `env.FORM4API_KEY`).

### 3. Or run directly

```bash
FORM4API_KEY=fapi_live_your_key npx form4api-mcp
```

---

## Available tools (14)

### Form 4 insider trading

| Tool | Description | Plan |
|---|---|---|
| `get_transactions` | Search insider transactions — filter by ticker, insider, transaction code, date range, exclude 10b5-1 plan trades | Free |
| `get_recent_filings` | Most recent Form 4 filings, optionally filtered by ticker | Free |
| `get_filing` | Single filing by accession number | Free |
| `get_insider_profile` | Insider profile — name, title, director/officer/10pct owner flags | Free |
| `get_insider_transactions` | All transactions for a specific insider (by CIK) | Free |
| `get_company_overview` | Company profile — name, CIK, SIC sector, state, website, filing counts | Free |
| `get_company_insiders` | All insiders who have filed Form 4s for a company | Free |
| `get_insider_career_summary` | Aggregate career rollup: total bought/sold, top companies, 10b5-1 split, return averages | Pro |

### Signals + sentiment

| Tool | Description | Plan |
|---|---|---|
| `get_signals` | Cluster buy/sell signals — multiple insiders at the same company in the same direction. **Excludes 10b5-1 trades automatically** | Business |
| `get_sentiment` | MSPR-style monthly sentiment score per ticker (-100 to +100). **10b5-1 excluded** so the score reflects real insider conviction | Business |

### Form 144 + institutional

| Tool | Description | Plan |
|---|---|---|
| `get_form144` | Notice-of-proposed-sale filings — early signal ~2 days before Form 4 sale lands | Business |
| `get_holdings` | Institutional positions from Form 13F-HR (filter by ticker, CUSIP, manager, quarter, min value) | Business |
| `get_managers` | Institutional manager index with latest AUM | Business |

### Utility

| Tool | Description | Plan |
|---|---|---|
| `check_usage` | Your API key usage stats and current plan | Free |

---

## Example prompts

Configured? Ask your LLM:

**Quality-led (these require our amendment-aware, 10b5-1 clean, joined dataset):**
- *"Show me cluster buy signals from this week — discretionary only, no planned trades"*
- *"Which companies have insiders buying while institutional ownership is increasing this quarter?"*
- *"Are there any Form 144 filings at NVDA suggesting upcoming sales?"*
- *"What's the monthly insider sentiment for TSLA over the last 6 months, with 10b5-1 plans excluded?"*
- *"Berkshire Hathaway's top 13F-HR holdings — what did they add or trim this quarter?"*

**Standard insider research:**
- *"What insider trades happened at NVDA in the last 30 days, excluding 10b5-1 plans?"*
- *"What is Tim Cook's career insider-trading summary?"*
- *"Show me all open-market purchases over $1M at Tesla in 2026"*
- *"What has the CFO of Microsoft been doing with their shares this year?"*

---

## Why this MCP vs scraping-based alternatives

Some MCPs in this space scrape free public sites (e.g. openinsider.com) for Form 4 data. That's fine for a quick prototype but the data layer they give your LLM has structural gaps:

| | form4api-mcp | Scraping-based MCPs |
|---|---|---|
| Form 4/A amendment handling | ✅ reconciled automatically | ❌ double-counts |
| 10b5-1 plan flag | ✅ exposed on every transaction | ❌ planned + discretionary mixed |
| Form 144 intent-to-sell | ✅ 23K+ filings | ❌ not exposed |
| Institutional × insider join | ✅ top-3 holders + AUM trend per transaction | ❌ insider only |
| Sentiment (10b5-1 excluded) | ✅ MSPR-style score | ❌ planned trades pollute score |
| Source resilience | ✅ hosted API contract | ❌ breaks when source HTML changes |
| Webhooks / production delivery | ✅ HMAC + retry + DLQ | ❌ MCP-only, no fallback |
| SDKs | ✅ Python + JS | ❌ MCP-only |
| Commercial support | ✅ | ❌ |

If your LLM session is the start of a real research workflow that eventually wants production delivery, picking the MCP that has a graduation path matters.

---

## Beyond MCP — when you need more

The MCP is the easiest entry point. When your workflow grows past LLM-mediated research, the rest of the Form4API platform is right behind it:

- **[Webhooks](https://www.form4api.com/docs#webhooks)** — HMAC-signed, exponential backoff, dead-letter queue, auto-disable on persistent failure. For production pipelines, not just LLM chats.
- **Python SDK** — `pip install form4api` ([PyPI](https://pypi.org/project/form4api/))
- **JS / TypeScript SDK** — `npm install form4api` ([npm](https://www.npmjs.com/package/form4api))
- **[Dashboard](https://www.form4api.com/dashboard)** — usage, billing self-serve, key rotation, webhook health, billing history.

The MCP wraps the same backend as all of the above — every fact your LLM cites can be re-fetched programmatically through any of these channels with the same key.

---

## Plans

| Tool | Free | Pro | Business |
|---|---|---|---|
| `get_transactions`, `get_recent_filings`, `get_filing` | ✓ | ✓ | ✓ |
| `get_insider_profile`, `get_insider_transactions` | ✓ | ✓ | ✓ |
| `get_company_overview`, `get_company_insiders` | ✓ | ✓ | ✓ |
| `get_insider_career_summary` | — | ✓ | ✓ |
| `get_signals`, `get_sentiment` | — | — | ✓ |
| `get_form144`, `get_holdings`, `get_managers` | — | — | ✓ |
| Requests/day | 1,000 | 10,000 | 100,000 |

When a tool requires a higher plan, the MCP returns a structured `upgrade_required` payload (with `required_plan` and `upgrade_url`) so the LLM can surface the path to you directly. No mid-conversation 402 confusion.

Upgrade at [form4api.com/dashboard/billing](https://www.form4api.com/dashboard/billing).

---

## Data coverage

- **1M+ Form 4 transactions** from SEC EDGAR
- **475K+ filings** across all reporting companies
- **23K+ Form 144** notice-of-proposed-sale filings (Business+)
- **3.45M Form 13F-HR holdings** across 11K+ filings, $72T+ AUM (Business+)
- **2.5+ years of history** (since 2023-10)
- **10b5-1 plan flag** on every transaction
- **Amendment-aware** — Form 4/A reconciled
- **Real-time ingestion** — new filings within minutes of SEC publication

---

## Links

- [Form4API](https://www.form4api.com) — API homepage
- [Documentation](https://www.form4api.com/docs) — Full REST API reference
- [Dashboard](https://www.form4api.com/dashboard) — Manage your API key, view usage, configure webhooks
- [npm](https://www.npmjs.com/package/form4api-mcp) — npm package
- [mcp.so](https://mcp.so) — MCP server directory listing
