# S4j Conversation Import Typed Draft

> date: 2026-07-13
> status: completed / coordinator-validated

## Outcome

Codex conversation import no longer represents Tool source data as
`tool.started/tool.result/tool.failed + Value`. The parser now emits a
source-local `ImportedToolDraft` with typed phase, call identity, arguments,
output and source metadata. Projection selection, lifecycle normalization,
budgeting and commit lowering consume that draft directly.

The draft layer now covers:

- Function, Custom Tool, Tool Search and structured call outputs;
- MCP, Dynamic Tool, Web Search, Image, Collab and View Image events;
- current Codex paginated `item_completed(TurnItem)` Tool families;
- terminal-only and incomplete lifecycle synthesis;
- duplicate start/terminal idempotency;
- unique source-sequence identity when a source call ID is absent.

Unknown paginated completed items are counted as unsupported/provenance-only
instead of being silently dropped. Structured content remains structured
through canonical `ToolOutput` lowering.

`commit_events.rs` was split from 922 lines into focused modules:

- `commit_events.rs`: selector and normalizer;
- `commit_events/tool_lowering.rs`: draft to canonical Item lowering;
- `commit_events/tests.rs`: lifecycle and structured-output guards;
- `codex/events/tool_draft.rs`: source-local draft and Codex response mapping.

## Product Boundary

The commit boundary still owns final session/thread/turn identity. Lowering
emits only canonical `item.started` and `item.completed`; `StoredSession`, the
event log, ProjectionStore, read model, notification and GUI never receive a
source-local Tool draft or raw Tool wire.

## Verification

- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server`: passed.
- App Server conversation import: passed, `48/48`.
- canonical external Tool guard: passed, `4/4`.
- typed draft lifecycle tests: duplicate lifecycle, isolated synthetic start,
  unique missing identity and structured output passed.
- `npm run test:contracts`: passed, `290 checks`.
- `npm run governance:legacy-report`: passed, zero classification drift and
  zero boundary violations.
- targeted `rustfmt` and `git diff --check`: passed.

Gate B was not rerun because this slice changes only the source-local import
representation and preserves the S4i product wire. S4i home-hotpath Gate B
remains the product-path evidence.

## Governance

- `current`: typed import draft plus commit-boundary canonical Item lowering.
- `compat`: none.
- `deprecated`: none for the Tool import intermediate.
- `dead / forbidden-to-restore`: source-local raw Tool runtime envelope,
  imported raw product wire, EventStore bypass, projection allowlist and GUI or
  read-model fallback.

## Next Slice

The next S4 cut should audit evidence/export and context-compaction consumers,
then remove any remaining raw `tool.*` branches that no longer have a current
producer. It must keep domain-only provider/media notifications separate from
Thread/Turn/Item lifecycle.
