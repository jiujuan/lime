# S4n Dead Backend Event Stream Surface

## Fact source

Tool and response lifecycle is canonical Thread/Turn/Item. Codex exposes complete
`item/started` and `item/completed` notifications carrying a typed Thread Item; Lime's current
owner is `agent-protocol::ThreadItem` plus canonical Item lifecycle. App Server must not expose a
second event-name mapper, and core must not expose a second stream DTO family.

## Audit

- `app-server/src/backend_event.rs` had only its own unit test and a public re-export from
  `app-server/src/lib.rs`; no repository consumer called the mapper.
- The mapper still translated `tool_start -> tool.started` and `tool_end -> tool.result`, both
  retired raw lifecycle names rejected by the current EventStore.
- `core::agent::types::StreamEvent` had no imports, constructions, matches, serde/schema consumers,
  or fixtures in the repository compile graph. Its `ToolExecutionResult` was only referenced by
  `StreamEvent::ToolEnd`.
- `StreamResult` was also definition-only. `TokenUsage` is different: database and agent session
  consumers still use it, so it remains current.
- Same-named provider transport stream enums are separate current domains and were not changed.

## Changes

- Deleted `app-server/src/backend_event.rs`, its module declaration, public export, and unit test.
- Deleted the full zero-consumer `StreamEvent`, `ToolExecutionResult`, and `StreamResult` family.
- Added contract guards for the deleted file, module/export symbols, and DTO declarations.
- Updated architecture and active App Server/refactor plans so the deleted helper is no longer
  described as current.

## Validation

- `rustfmt --edition 2021 --check` on touched Rust files: pass.
- `cargo test -p lime-core --lib`: `698/698`.
- `cargo check -p lime-core -p lime-agent -p app-server`: pass, no warnings.
- `cargo test -p app-server --test host_boundary_guard`: `2/2`.
- `cargo test -p app-server external_events::canonical_tool_items --lib`: `4/4`.
- `cargo test -p app-server external_backend --lib`: `7/7`.
- `node scripts/check-app-server-client-contract.mjs`: pass, `290 checks`.
- `npm run test:contracts`: pass.
- `npm run governance:legacy-report`: pass, zero-reference candidates `0`, classification
  drift `0`, boundary violations `0`.
- Scoped `git diff --check`: pass.

The App Server lib subsets emit two existing test-helper `dead_code` warnings; the three-crate
production check is warning-free.

This slice changes no Electron, App Server JSON-RPC, or Renderer wire. It removes compile-graph
dead Rust symbols behind the already canonical product chain, so Gate B is not applicable.

## Classification

- `current`: `agent-protocol::ThreadItem`, canonical Item lifecycle, and current `TokenUsage` data.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: App Server backend event-name mapper and core stream DTO family, deleted and guarded.

## Next cut

Return to the S4 control-plane backlog: audit MCP resource/prompt/capability and server elicitation
snapshot ownership before extending the existing sampling-step snapshot.
