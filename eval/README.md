# eval

Material for checking how well a model picks tools from this server. Nothing here runs at server start-up and none of it is published to npm (package.json `files` only lists `dist`, `README.md`, `CHANGELOG.md`, `LICENSE`).

- `golden-prompts.json`: 25 realistic user questions. Each has an `id`, the `prompt`, `expected` (the tool names that are a correct FIRST call with all 40 tools available; more than one name means either is acceptable), `expected_default` (the same, when only the 15 default tools are available) and `notes` explaining the choice from the tool descriptions.
- `dump-tools.mjs`: starts the built server over stdio, calls `tools/list` and prints `[{ name, title, description, inputSchemaKeys }]` as JSON on stdout. No API key and no network needed.

## `expected_default`

The server has two toolsets (see "Toolsets" in the main README): `all` (40 tools) and `default` (15 curated tools, defined in `src/toolsets.ts`). `expected_default` is the acceptable first tool(s) when a model sees only the default set. It is `null` when the question cannot reasonably be answered with the default set, for example the leaderboard, manager AUM, returns summary, peers, data-freshness and usage questions. For those, a good model says the tool is not available rather than forcing a poor fit; score a `null` prompt by whether the model avoids a misleading call, not by a tool name.

Every name in `expected_default` is in the default set. When the default set changes, revisit the prompts whose `expected` tool left it.

## Run the dump

```
npm run build
npm run eval:tools > tools.json
npm run eval:tools -- --toolsets default > tools-default.json
```

The first dump is the full 40 tools (the stdio default). The second is the curated 15, as the hosted server serves them by default.

To score a model, give it the dumped tools and each prompt, and check that its first tool call is in `expected` (full dump) or `expected_default` (default dump).
