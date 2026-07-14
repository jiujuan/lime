# S4u Durable Agent Mailbox And Identity

## Fact source

S4u establishes only the storage owners required before V2 AgentControl can safely consume
multi-agent state. `thread-store` owns storage-neutral `AgentIdentityStore` and
`AgentMailboxStore`; App Server `ProjectionStore` implements both in its existing canonical SQLite
database. No legacy `agent_sessions` extension, process-local path map, or user-input queue is used.

## Current behavior

- Agent identity persists `root_thread_id`, `thread_id`, canonical absolute `agent_path`, optional
  nickname/role, and last task message. `thread_id` and `(root_thread_id, agent_path)` are unique;
  task name is derived only from the final canonical path segment.
- Mailbox append uses a stable `message_id`: a byte-for-byte matching immutable retry returns the
  original record, while any conflict fails closed. New records are always pending.
- Pending reads are isolated by `(root_thread_id, recipient_thread_id)` and ordered by
  `(created_at_ms, message_id)`. Delivery changes only status and timestamp, retains the audit row,
  and refuses a mismatched root or recipient.
- `QueueOnly` and `TriggerTurn` are durable delivery-mode facts. This slice does not yet trigger a
  turn, append a canonical Item, acknowledge delivery, expose tools, or project UI.

## Validation

- `cargo test --manifest-path lime-rs/Cargo.toml -p thread-store`: pass, 21/21.
- `cargo check --manifest-path lime-rs/Cargo.toml -p thread-store`: pass.
- Scoped `rustfmt --check` and `git diff --check`: pass.
- `RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml -p app-server
  agent_mailbox_store::tests --lib`: pass, 4/4. `2026-07-14-s4r8-local-data-source-fixture-sync`
  已补齐 shared `LocalAppDataSource` fixture 的 router field，原并行 MCP 编译阻塞已解除。

## Boundary and next owner

`AgentIdentityStore` and `AgentMailboxStore` are `current` durable storage owners. S4w must next
use the graph plus these stores to append a deterministic canonical Item before marking a mailbox
record delivered, derive its Item identity from `message_id`, trigger turns only for `TriggerTurn`,
and expose activity to `wait_agent`. Legacy session metadata, temporary maps, and a second queue
remain `dead / forbidden-to-restore` as owners.
