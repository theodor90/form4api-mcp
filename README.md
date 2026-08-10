# form4api-mcp

> Production-grade SEC Form 4 insider trading data for any MCP-compatible AI assistant — **amendment-aware, 10b5-1 clean, with Form 144 + institutional 13F-HR overlay, plus congressional STOCK Act trades and insider/Congress convergence** — 34 tools + 6 ready-made research prompts

[![npm version](https://badge.fury.io/js/form4api-mcp.svg)](https://www.npmjs.com/package/form4api-mcp)
[![Available on mcp.so](https://img.shields.io/badge/mcp.so-form4api-blue)](https://mcp.so)
[![form4api-mcp MCP server](https://glama.ai/mcp/servers/theodor90/form4api-mcp/badges/score.svg)](https://glama.ai/mcp/servers/theodor90/form4api-mcp)

An [MCP](https://modelcontextprotocol.io) server that exposes the hosted [Form4API](https://www.form4api.com) REST API to Claude Desktop, Cursor, Windsurf, VS Code, Codex CLI, and any other MCP-compatible client. Configured once, your LLM can answer questions about insider trading, institutional positioning, and intent-to-sell filings directly during research sessions.

**Four data-quality claims no scraping-based alternative can make:**

- 🛡 **Amendment-aware** — Form 4/A amendments are reconciled automatically. No double-counting when an insider corrects a filing.
- 🎯 **10b5-1 clean** — every transaction flagged as pre-scheduled (10b5-1 plan) or discretionary. Cluster signals exclude planned trades by construction.
- 📜 **Form 144 intent-to-sell** — 118K+ Form 144 filings indexed. Catch insider sales ~2 days before they hit Form 4.
- 🏛 **Institutional × insider join** — every transaction carries the current 13F-HR ownership context (top-3 holders, AUM trend) in the same response: no second call, no client-side join. Among the self-serve SEC data APIs we've surveyed, none return both sides in one query — sec-api.io and Kaleidoscope both ship 13F and insider data as separate endpoints.

---

## Quick install

### 1. Get a free API key

Go to [www.form4api.com](https://www.form4api.com) → Sign in → Dashboard. Free plan includes 500 requests/day, no credit card required.

### 2. Add to your MCP client

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "form4api": {
      "command": "npx",
      "args": ["-y", "form4api-mcp"],
      "env": {
        "FORM4API_KEY": "YOUR_API_KEY"
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

**Cursor** — edit `~/.cursor/mcp.json` (user-level) or `.cursor/mcp.json` (workspace-level):

```json
{
  "mcpServers": {
    "form4api": {
      "command": "npx",
      "args": ["-y", "form4api-mcp"],
      "env": {
        "FORM4API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart Cursor. The tools appear automatically.

**Windsurf** — edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "form4api": {
      "command": "npx",
      "args": ["-y", "form4api-mcp"],
      "env": {
        "FORM4API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart Windsurf. The tools appear automatically.

**VS Code** — edit `.vscode/mcp.json` (workspace-level). Note: VS Code uses the `servers` key (not `mcpServers`):

```json
{
  "servers": {
    "form4api": {
      "command": "npx",
      "args": ["-y", "form4api-mcp"],
      "env": {
        "FORM4API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Restart VS Code. The tools appear automatically.

**Codex CLI** — config is TOML at `~/.codex/config.toml`:

```toml
[mcp_servers.form4api]
command = "npx"
args = ["-y", "form4api-mcp"]
env = { FORM4API_KEY = "YOUR_API_KEY" }
```

### Verify it works

Ask your LLM to run the `verify_setup` tool — it confirms your API key is valid and the MCP server is reachable, or returns the exact fix steps.

Example: *"Run the verify_setup tool to confirm the MCP is configured correctly."*

### Try before you commit a key

`get_public_stats` is a **keyless tool** — it works with no `FORM4API_KEY` set. Try it first to preview live data coverage before signing up:

```bash
FORM4API_KEY="" npx form4api-mcp
```

Once you like what you see, sign up for a free key at [www.form4api.com](https://www.form4api.com) → set `FORM4API_KEY` → all tools unlock.

### 3. Or run directly

```bash
FORM4API_KEY=YOUR_API_KEY npx form4api-mcp
```

---

## Available tools (34)

### Form 4 insider trading

| Tool | Description | Plan |
|---|---|---|
| `research_company` | Bundled insider-research context for one ticker in a single call — company profile, recent transactions, cluster signals, sentiment, and a computed buy/sell direction summary. Replaces 4 separate calls and degrades gracefully when a section needs a higher plan | Free (signals/sentiment sections need Business) |
| `get_transactions` | Search insider transactions — filter by ticker, insider, date range, transaction codes or whole categories (`exclude_category=derivatives`), 10b5-1 plan trades, a dollar floor (`min_value`), the 13F ownership trend (`inst_ownership_trend`), or use `significant=true` for real discretionary buys/sells only. Pro adds the remaining trade-size screens (`max_value`, `min_shares`, `max_shares`) and post-trade-return screening (`min_return_1d`…`max_return_6m`, `has_returns`; returns are fractions, 0.05 = +5%). Paging depth is plan-limited — see Plans | Free |
| `get_recent_filings` | Most recent Form 4 filings, optionally filtered by ticker | Free |
| `get_filing` | Single filing by accession number | Free |
| `get_insider_profile` | Insider profile — name, title, director/officer/10pct owner flags | Free |
| `get_insider_transactions` | All transactions for a specific insider (by CIK) | Free |
| `get_company_overview` | Company profile — name, CIK, SIC sector, state, website, filing counts | Free |
| `get_company_insiders` | All insiders who have filed Form 4s for a company | Free |
| `list_companies` | List companies, sorted by name or filing count | Free |
| `get_insider_career_summary` | Aggregate career rollup: total bought/sold, top companies, 10b5-1 split, return averages | Pro |
| `get_insider_scorecard` | Buy track-record scorecard for an insider (CIK) — hit rate and avg/median return on discretionary open-market buys; null when fewer than 5 matured samples | Pro |
| `get_insider_leaderboard` | Top insiders ranked by `hit_rate` or `avg_return`; filter by `horizon` (3m/6m), `min_trades`, and `limit` | Business |

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
| `explain_signal` | Explain why a signal fired — the insiders and trades counted, exclusions, and criteria | Business |
| `get_data_quality` | Public data-quality, freshness and coverage metrics | Free |

### Congress + convergence

| Tool | Description | Plan |
|---|---|---|
| `list_congress_trades` | Congressional STOCK Act trades (periodic transaction reports) — filter by ticker, politician, party, chamber, state, transaction type, min amount, or date range. Every row carries `amountLow`/`amountHigh` (disclosed ranges, never a fabricated midpoint) and `disclosureLagDays` — up to 45 days under the STOCK Act, so "real-time" here means minutes-after-disclosure, not minutes-after-trade | Free (30-day disclosure window; Starter 366 days; Pro+ unlimited history) |
| `list_congress_politicians` | Ranked rollup of politicians by congressional trade activity — total/buy/sell counts, most recent disclosure | Pro |
| `get_congress_politician` | One politician's full profile by bioguide ID — totals, top traded tickers, most recent trades | Pro |
| `get_congress_ticker_rollup` | Which politicians traded a given ticker, with net buy/sell counts | Pro |
| `get_convergence_signals` | Tickers where an insider cluster-buy and a congressional purchase happened within a trailing window of each other. `strength` is documented arithmetic (distinct congressional purchasers × the signal's insider count) — never a black-box or predictive score. No performance/alpha claims are computed or implied | Pro |

### Utility

| Tool | Description | Plan |
|---|---|---|
| `check_usage` | Your API key usage stats and current plan | Free |
| `get_key_activity` | Recent API requests for this key | Free |
| `get_usage_history` | Daily request counts for the last N days | Free |
| `search_insiders` | Substring search on insider names | Free |
| `list_webhooks` | List your webhook subscriptions | Free |
| `get_webhook_events` | Replay webhook delivery events since a timestamp | Free |
| `verify_setup` | Verify the MCP is configured correctly — confirms API key is valid and server is reachable | Free |
| `get_public_stats` | Public corpus-wide totals (filings, transactions, companies, 13F-HR AUM, ingestion latency) — no API key required | Free (keyless) |
| `get_status_history` | Trailing 90-day daily uptime history for the public status page | Free (keyless) |
| `health_ingestion` | Live ingestion-health check — Form 4 freshness, parse-queue backlog, price-feed staleness | Free (keyless) |

---

## Prompts (6)

Beyond the 29 tools, this MCP ships 6 **prompts** — ready-made research recipes that a client can list (`prompts/list`) and load (`prompts/get`) so you don't have to hand-assemble the right tool sequence yourself. Each one tells the LLM exactly which SEC Form 4 / Form 144 / 13F-HR tools to call, in what order, and how to read plan-gated results.

| Prompt | Args | What it does |
|---|---|---|
| `insider_monitor` | `ticker` | Recent SEC Form 4 insider activity for a ticker — transactions (10b5-1 flagged), cluster signals, sentiment — summarized as buy/sell conviction with post-trade-return context |
| `cluster_buy_scan` | `days` (default 7) | Market-wide scan of recent cluster-buy signals, 10b5-1 excluded, ranked by conviction (insider count + $ value), each with a sentiment score |
| `form144_early_warning` | `ticker` (optional) | Pending Form 144 notice-of-proposed-sale filings cross-referenced against recent Form 4 sells — flags discretionary (non-10b5-1) notices as the highest-signal early warnings, ~2 days ahead of the sale |
| `exec_conviction_check` | `insider` (name or CIK) | An insider's career track record — total bought/sold, historical post-trade returns on discretionary buys, and whether their buying has historically beaten their scheduled 10b5-1 selling |
| `institutional_insider_overlap` | `ticker` | Combines 13F-HR institutional holders with recent insider transactions to spot where smart money and insiders agree or diverge |
| `post_selloff_buys` | `min_return` (default 0.05) | Screens insider buys with post-trade-return filters to surface historically-successful dip-buying patterns |

These map to the recipe workflows scraping-based Form 4 MCPs don't offer — each one leans on data this MCP alone exposes (10b5-1 flags, Form 144, 13F-HR join, per-insider return scoring). Plan requirements are honored honestly: prompts that touch Business-plan tools (`get_signals`, `get_sentiment`, `get_form144`, `get_holdings`, `get_managers`) or Pro-plan tools (`get_insider_career_summary`, `get_insider_scorecard`) instruct the LLM to surface the structured `upgrade_required` response rather than silently failing.

In Claude Desktop, prompts surface as a `/` slash-command picker; in Claude Code or other MCP clients, ask the assistant to "use the insider_monitor prompt for NVDA" (or similar) and it will fetch and follow the recipe.

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
| Form 144 intent-to-sell | ✅ 118K+ filings | ❌ not exposed |
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

**21 of the 34 tools work on the free plan, and every tool that is free today stays free.**
New premium capability gets tiered as it ships; nothing that already works on your key is
taken away later.

| Tool | Free | Pro | Business |
|---|---|---|---|
| `get_transactions`, `get_recent_filings`, `get_filing` | ✓ | ✓ | ✓ |
| `get_insider_profile`, `get_insider_transactions` | ✓ | ✓ | ✓ |
| `get_company_overview`, `get_company_insiders` | ✓ | ✓ | ✓ |
| `get_insider_career_summary`, `get_insider_scorecard` | — | ✓ | ✓ |
| `get_insider_leaderboard`, `get_signals`, `get_sentiment` | — | — | ✓ |
| `get_form144`, `get_holdings`, `get_managers` | — | — | ✓ |
| `list_congress_trades` | ✓ (30-day disclosure window) | ✓ (unlimited history) | ✓ (unlimited history) |
| `list_congress_politicians`, `get_congress_politician`, `get_congress_ticker_rollup`, `get_convergence_signals` | — | ✓ | ✓ |
| Requests/day | 500 | 50,000 | 250,000 |
| `get_transactions` paging depth | 20 pages | unlimited | unlimited |

For a bulk historical pull, use the REST `/v1/transactions/export` endpoint (Business) rather
than paging — it streams the whole filtered set as CSV in one request.

### What your agent sees at a paywall

A gated call never surfaces a bare HTTP error. The MCP returns a structured
`upgrade_required` payload so the model can explain the situation and the fix in one turn:

```json
{
  "error": "upgrade_required",
  "required_plan": "business",
  "current_plan": "Free",
  "message": "This endpoint requires the Business plan or higher. Your current plan is Free.",
  "unlocks": "Business ($149/mo) adds cluster-buy signals and sentiment scores, 13F institutional holdings and managers, Form 144 notices, bulk CSV export, and 250,000 requests/day.",
  "upgrade_url": "https://www.form4api.com/dashboard/billing",
  "pricing_url": "https://www.form4api.com/pricing"
}
```

`message` is the API's own explanation, kept verbatim — it names the specific limit or
parameter that stopped the call, which is usually what the model needs to suggest a working
alternative. The same shape is returned when a Pro-only *parameter* is used on an otherwise
free tool, so the model can simply retry without that filter.

Upgrade at [form4api.com/dashboard/billing](https://www.form4api.com/dashboard/billing), or
compare tiers at [form4api.com/pricing](https://www.form4api.com/pricing).

---

## Data coverage

- **1.3M+ Form 4 transactions** from SEC EDGAR
- **596K+ filings** across all reporting companies
- **118K+ Form 144** notice-of-proposed-sale filings (Business+)
- **43M+ Form 13F-HR holdings** across 114K+ filings, $71T+ AUM in the latest complete quarter (Business+)
- **2.8+ years of history** (since 2023-10)
- **10b5-1 plan flag** on every transaction
- **Amendment-aware** — Form 4/A reconciled
- **Congressional STOCK Act trades** (Pro+) — House Clerk PTR + Senate eFD, digital filings, amounts always shown as disclosed ranges (`amountLow`/`amountHigh`), never a fabricated midpoint, plus `disclosureLagDays` on every trade (up to 45 days under the STOCK Act)
- **Real-time ingestion** — new filings within minutes of SEC publication

---

## Install as a Claude Desktop Extension (DXT)

A `manifest.json` is included at the repo root for one-click install via the [Desktop Extensions (DXT)](https://www.anthropic.com/news/desktop-extensions) format. Once Claude Desktop supports `.dxt` files natively, pack and install with:

```bash
npx @anthropic-ai/dxt pack
# Produces form4api-mcp.dxt — open it in Claude Desktop to install
```

Until then, use the standard `claude_desktop_config.json` method described in Quick install above.

---

## How tools stay in sync with the backend

This MCP is split between two layers:

- **Hand-written tools** in `src/tools/*.ts` (transactions, signals, sentiment, form144, holdings, …) — these carry the LLM-discriminator descriptions (amendment-aware, 10b5-1 clean, etc.) that make this MCP pick correctly over alternatives.
- **Auto-generated tools** in `src/tools/_generated.ts` — produced from `https://api.form4api.com/openapi/v1.json` by `npm run codegen`. Every new backend endpoint that lands in the OpenAPI spec flows in here automatically. CI runs `npm run codegen:check` on every PR and fails the build if the committed file drifts from what the live spec would produce, so the MCP is never silently behind the backend.

To add a new generated tool: ship the endpoint on the backend, regenerate (`npm run codegen`), commit `src/tools/_generated.ts`, publish. No tool-wrapper code needed.

The 6 recipe **prompts** live in `src/prompts/recipes.ts` — also hand-written, not generated. They add no new backend surface area; each one is a client-side template that tells the LLM which existing tools to call and in what order.

---

## Links

- [Form4API](https://www.form4api.com) — API homepage
- [Documentation](https://www.form4api.com/docs) — Full REST API reference
- [Dashboard](https://www.form4api.com/dashboard) — Manage your API key, view usage, configure webhooks
- [Status](https://www.form4api.com/status) — live uptime, database, and ingestion-queue health
- [npm](https://www.npmjs.com/package/form4api-mcp) — npm package
- [mcp.so](https://mcp.so) — MCP server directory listing
