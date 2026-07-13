# S1f/S2e Canonical Thread Read Evidence

> date: 2026-07-12
> owner: refactor-v2-coordinator
> target: `/tmp/lime-refactor-v2-s2e-read-model-target`

## Current Chain

```text
typed client
  -> thread/read | thread/list | thread/turns/list | thread/items/list
  -> App Server processor
  -> RuntimeCore direct ThreadStore read
  -> ProjectionStore canonical Thread/Turn/Item tables
```

- S1f registered the four methods, canonical DTOs, opaque cursors, view controls and protocol-owned access metadata across Rust/schema/generated TypeScript clients.
- S2e added direct ThreadStore-backed handlers without AgentSession fallback.
- EventStore production batches create and incrementally update canonical history.
- The AgentSession detail adapter prefers canonical ThreadItem values, propagates store errors and contains no sync `block_on` in the async read path.
- Request serialization consumes catalog access metadata. Session-only input resolves to canonical `threadId`; two sessions bound to one Thread share one FIFO queue.

## Verification

- `cargo test -p app-server thread_read --lib -j2`: pass, 7 tests.
- `cargo test -p app-server read_model --lib -j2`: pass, 48 tests.
- `cargo test -p app-server request_serialization --lib -j2`: pass, 15 tests.
- `cargo test -p app-server canonical_thread_store --lib -j2`: pass, 6 tests.
- `cargo test -p app-server event_store --lib -j2`: pass, 1 matched test; production event-batch canonical write coverage is also included in the canonical store tests.
- `npm run test:contracts`: pass; 675 generated v0 types with zero drift, 287 app-server-client checks and all command/harness/governance/docs guards passed.
- exact App Server diff check: pass.

The coordinator reran these commands against the current shared working tree after all S1f/S2e/S1b overlapping changes stabilized.

## Identity And Failure Cases

- Two distinct `sessionId` values mapped to one `threadId` serialize through the same queue.
- Explicit mismatched `sessionId`/`threadId` fails closed.
- Unknown sessions preserve the `SESSION_NOT_FOUND` JSON-RPC code.
- Shared reads cannot overtake a queued exclusive writer.
- Canonical store failures propagate instead of silently selecting the legacy detail path.
- Canonical history apply remains atomic, idempotent and rollback-capable.

## Governance

- `current`: canonical Thread protocol/client, direct ThreadStore handlers, canonical write/read model, protocol-owned scope/access metadata.
- `deprecated`: AgentSession detail presentation adapter and event-derived fallback for sessions not yet materialized canonically.
- `compat`: none added.
- `dead`: none deleted in this slice.

## Remaining

- S5 must migrate GUI consumers from AgentSession detail to canonical Thread reads before the presentation adapter can be deleted.
- Agent runtime smoke and Gate B remain required after S4 display DTO and S5 consumer cutover.
