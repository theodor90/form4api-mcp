/**
 * Expected tool and prompt names. Shared by test/mcp-test.mjs and the
 * release checks so the list lives in exactly one place.
 */

export const EXPECTED_TOOLS = [
  'get_transactions',
  'get_recent_filings',
  'get_filing',
  'get_insider_profile',
  'get_insider_transactions',
  'get_company_overview',
  'get_company_insiders',
  'get_signals',
  // Tier A additions (PLAN_MCP_DEFENSE Phase 1, 2026-06-01)
  'get_form144',
  'get_holdings',
  'get_managers',
  'get_sentiment',
  'get_insider_career_summary',
  'check_usage',
  // Self-test / onboarding tool (v1.8.0, 2026-06-28)
  'verify_setup',
  // Auto-generated from OpenAPI (PLAN_MCP_DEFENSE Phase 4, 2026-06-01)
  'search_insiders',
  'get_key_activity',
  'get_usage_history',
  'list_webhooks',
  'get_webhook_events',
  // Auto-generated after the backend list endpoint shipped (2026-06-03 SEO arc)
  'list_companies',
  // Auto-generated after scorecard + leaderboard endpoints shipped (2026-06-13)
  'get_insider_scorecard',
  'get_insider_leaderboard',
  // Auto-generated after the A-Z insider directory shipped (insiderapi #238)
  'get_insider_directory',
  // Auto-generated after the public /v1/stats endpoint shipped (2026-06-19)
  'get_public_stats',
  // Flagship bundled research tool (2026-06-25)
  'research_company',
  // Auto-generated after the status-history + ingestion-health endpoints shipped (v1.10.0)
  'get_status_history',
  'health_ingestion',
  // Auto-generated after the congress/convergence endpoints shipped (v1.11.0, 2026-07-24)
  'list_congress_trades',
  'list_congress_politicians',
  'get_congress_politician',
  'get_congress_ticker_rollup',
  'get_convergence_signals',
  // Auto-generated after the /v1/filings listing endpoint shipped (insiderapi
  // #206, 2026-08-04). Missed by the 2026-08-10 codegen pass and caught by the
  // 2026-08-12 coverage sweep — the endpoint existed for 8 days with no tool.
  'list_filings',
  // Auto-generated after the Schedule 13D/13G ownership-crossings endpoint
  // shipped; picked up by the 2026-09-24 OpenAPI sync (v1.15.0).
  'list_schedule13_dg',
  // Hand-written combined company/insider name resolver (insiderapi #314,
  // 2026-09-25) — framed as the obvious first call to resolve a name to a
  // ticker/CIK before calling other tools.
  'search',
  // Auto-generated tools that predate this list's upkeep (codegen sync);
  // present in the server all along, added so the list is exhaustive.
  'explain_signal',
  'get_data_quality',
]

// Recipe prompts (v1.9.0, 2026-07-11) — the MCP "prompts" capability.
export const EXPECTED_PROMPTS = [
  'insider_monitor',
  'cluster_buy_scan',
  'form144_early_warning',
  'exec_conviction_check',
  'institutional_insider_overlap',
  'post_selloff_buys',
]
