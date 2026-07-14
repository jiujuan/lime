# S4q MCP Prompt Target Identity

## Fact source

Every single prompt get operation targets the exact pair `(server, name)`. Protocol, manager,
typed clients, Renderer gateways, Hooks, and GUI state must not rediscover a server by parsing or
scanning prompt names. An asynchronous result is valid only while the same target remains active.

## Changes

- Added required non-empty `server` beside `name` in the Rust protocol DTO, JSON Schema fixtures,
  generated TypeScript, handwritten TypeScript protocol type, and Rust typed client helper.
- Replaced prompt-name prefix parsing and cross-connection prompt scans with exact
  `clients.get(server)` selection in `lime-mcp`.
- Propagated `(server, name)` through App Server local data source, Renderer API, `useMcp`, and the
  prompt browser.
- Keyed the active GUI prompt by server plus name. A request generation now invalidates pending
  results when the user switches or closes a prompt, so a late response from `server-a/shared`
  cannot appear under `server-b/shared`.
- Added contract guards for the DTO shape and exact manager call.

## Regression evidence

- Two real in-memory MCP connections expose the same prompt name `shared`. Getting
  `(server-b, shared)` returns only server-b content and records no call against server-a.
- Empty or whitespace-only server/name targets fail before dispatch in the manager, Rust typed
  client, and Renderer gateway.
- The GUI expands server-a and server-b with the same prompt name, starts a pending server-a
  request, switches to server-b, resolves server-a, and proves the late content is discarded before
  successfully calling server-b.

## Validation

- `cargo test -p lime-mcp manager::tests::prompts --lib`: `10/10`.
- `cargo test -p app-server-client mcp --lib`: `3/3` across prompt and resource exact-target helpers.
- `cargo test -p app-server-protocol schema_fixtures_match_generated_output --test schema_fixtures`:
  `1/1`.
- `cargo check -p app-server-protocol -p lime-mcp -p app-server-client`: pass.
- MCP API/fail-closed/Hook/Prompt Browser/Panel focused Vitest: `43/43`.
- Focused ESLint for prompt browser implementation and tests: pass.
- `npm run check:protocol-types`: pass, no drift.
- `node scripts/check-app-server-client-contract.mjs`: pass, `290 checks`.
- `npm run test:contracts`: pass, including docs boundary.
- `npm run governance:legacy-report`: pass; zero-reference candidates `0`, classification drift
  `0`, boundary violations `0`.
- Repository `git diff --check`: pass at the pre-documentation checkpoint.

Closeout review found two current fixtures that still constructed the retired server-less shape.
They were corrected after the original implementation lock released:

- App Server processor MCP tests: `2/2`, including Prompt get and Resource read/subscribe/unsubscribe
  with explicit server identity.
- App Server client package tests: `62/62`, including request builders and exact params assertions.
- `npm run test:contracts`: pass after the fixture correction and S4s capability guard, including
  `290` App Server client checks.
- `npm run governance:legacy-report`: zero-reference candidates `0`, classification drift `0`,
  boundary violations `0`.

A fresh Cargo target first stopped while downloading `sherpa-onnx` because the peer closed TLS
without `close_notify`. The same processor test was rerun with the already validated S4s target and
passed, so the download failure is not treated as a product or fixture failure.

The deterministic MCP current stdio fixture exposes prompt list but not prompt get, so it cannot
prove this target operation and is not claimed. The exact get path is proven by the two-server real
in-memory MCP regression.

`cargo check -p app-server-protocol -p lime-mcp -p app-server-client -p app-server` and
`npm run verify:gui-smoke` were attempted while unrelated App Server and S4t graph files were
actively changing, so those broad runs are not claimed. The later shared-tree App Server check and
focused processor tests pass. No new Electron Gate B is claimed because the deterministic fixture
does not implement prompt get.

Repository-wide `npm run typecheck` was also attempted and was blocked by unrelated active GUI
work: `messageListItemProjection.ts` reads `request_id` from the full `AgentThreadItem` union,
`useWorkspaceTaskCenterSendRuntime.ts` treats `activeSessionIdRef` as definitely present, and the
concurrent fast-response migration temporarily removes or relocates several imported helpers.
Focused S4q TypeScript tests and ESLint pass.

## Classification

- `current`: App Server live MCP prompt management and exact `(server, name)` identity.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: prompt-name prefix routing, cross-connection name scans, and target-unbound late GUI
  results; removed or invalidated and covered by regressions.

## Next cut

The false MCP sampling capability advertisement was removed by the completed
`S4s-mcp-sampling-capability-fail-closed` slice. Implement server-originated MCP elicitation as its own typed reverse
JSON-RPC slice with exact request/connection identity, canonical pending action, timeout pause, and
resolve/cancel/restart semantics.
