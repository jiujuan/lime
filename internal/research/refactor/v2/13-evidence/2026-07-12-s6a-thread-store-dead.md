# S6a Thread Store Dead Surface Evidence

> date: 2026-07-12
> slice: S6a-thread-store-dead
> owner: thread-store-dead-a -> refactor-v2-coordinator

## Deleted

The following zero-consumer modules and their embedded positive tests were physically deleted (1923 source lines):

- `thread-store/src/conversation_transcript.rs`
- `thread-store/src/history_search.rs`
- `thread-store/src/legacy_conversation.rs`
- `thread-store/src/runtime_store.rs`
- `thread-store/src/runtime_status_item.rs`
- `thread-store/src/session_insights.rs`

`thread-store/src/lib.rs` only lost the six matching module declarations. Current `ThreadStore`, `types`, session repository, runtime snapshot, session record and task board owners remain unchanged.

## Consumer Proof

- Rust production search found no remaining module or public-symbol consumer outside the deleted files.
- Cargo metadata identifies `lime-agent`, `agent-runtime` and `app-server` as reverse dependencies.
- All three reverse dependencies compile after deletion.

## Verification

- `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-s6a-target cargo test --manifest-path lime-rs/Cargo.toml -p thread-store`: pass, 17 passed.
- `npm run test:related -- src/lib/governance/agentMigrationBoundary.test.ts`: pass, 11 passed.
- `cargo check` for `lime-agent`, `agent-runtime` and `app-server`: pass.
- exact rustfmt and diff checks: pass.
- `npm run governance:legacy-report`: one unrelated failure in the active S4b write set, `rust-runtime-snapshot-sidecar-ref-boundary-leak` at `thread_item_projection/materializer.rs`.

## Governance

- `current`: `thread-store::{ThreadStore, types}` and App Server `ProjectionStore`.
- `dead / deleted / forbidden-to-restore`: the six modules above, plus the already deleted in-memory and SQLite runtime-store paths covered by the same absence guard.
- `compat` and `deprecated`: none introduced by this slice.

This deletion removes parallel transcript/search/runtime-store truth after the canonical S2e write/read cutover. It does not change the GUI or command boundary and therefore does not claim GUI or Gate B evidence.
