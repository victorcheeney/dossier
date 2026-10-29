# Dossier

A local app where a Candidate prepares job Applications with their own Agent. Read `GLOSSARY.md` first and use its terms in code, tests, docs and commit messages.

## Docs

- `GLOSSARY.md`: one meaning per term.
- `docs/design.md`: the numbered design decisions. Change a decision there before building against it.
- `docs/adr/`: hard-to-reverse decisions, one file each. If a change contradicts an ADR, say so and why.
- `design.md`: the look (colors, type, layout). Update it with each visual decision.

## Run and test

- `npm start` serves the page and the MCP server on port 4747 (override with `PORT`). Data goes to `data/dossier.db`, which Git ignores.
- `npm test` runs every test with Node's built-in runner.
- Node version: `.node-version`. Node runs the TypeScript directly: erasable syntax only (no enums, namespaces or parameter properties), no build step.

## Layout

- `src/core/` owns domain types, rules and the Store and FormReader ports. Keep its imports within the core. Every read and write from a driving adapter goes through `createCore`'s use cases.
- `src/adapters/` owns MCP, web (routes, pages, SSE), SQLite, job-board fetching and Example file loading. Keep protocol parsing and rendering here; put domain validation in the core.
- `src/server.ts` creates and connects the core and adapters. `src/instructions.md` tells the Agent how to work with the Candidate; `public/` holds browser scripts, styles and fonts.
- `example/` is the made-up Example Candidate and Posting; the tests use it too.
- `test/` holds the tests; `test/fixtures/` holds saved public form responses for `read_form_fields`.

## Conventions

- Dossier has no AI and fetches nothing except public Lever, Greenhouse and Ashby forms (ADR 0001, decisions 11 and 12). Keep it that way.
- The only runtime dependency is `@modelcontextprotocol/sdk`. Add another only with a clear reason.
- Test each rule through the core with SQLite `:memory:`. Keep adapter tests for protocol translation, rendering, persistence and live events; remove duplicate rule tests. No tests of internals or markup snapshots.
- A tool's description and `src/instructions.md` are part of the product: write them as plain instructions to the Agent, in the glossary's terms.
- Never put real personal data in the repo. Use the Example or `example.com` addresses in tests.
- Commit messages follow Conventional Commits, such as `feat(profile): ...` or `fix(applications): ...`.
