# eval

Material for checking how well a model picks tools from this server. Nothing here runs at server start-up and none of it is published to npm (package.json `files` only lists `dist`, `README.md`, `CHANGELOG.md`, `LICENSE`).

- `golden-prompts.json`: 25 realistic user questions. Each has an `id`, the `prompt`, `expected` (the tool names that are a correct FIRST call; more than one name means either is acceptable) and `notes` explaining the choice from the tool descriptions.
- `dump-tools.mjs`: starts the built server over stdio, calls `tools/list` and prints `[{ name, title, description, inputSchemaKeys }]` as JSON on stdout. No API key and no network needed.

## Run the dump

```
npm run build
npm run eval:tools > tools.json
```

To score a model, give it the dumped tools and each prompt, and check that its first tool call is in `expected`.
