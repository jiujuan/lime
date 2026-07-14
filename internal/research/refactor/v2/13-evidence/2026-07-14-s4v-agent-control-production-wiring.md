# S4v RuntimeCore AgentControl Boundary

## Fact Source

The first production control boundary belongs to App Server `RuntimeCore` and the canonical
`ProjectionStore` `AgentGraphStore` implementation. It does not read legacy session metadata or
Team state. This is intentionally an internal boundary until the real dynamic tool gateway can
consume it.

## Implemented Boundary

- Spawn requires a non-empty loaded parent session and a canonical ProjectionStore before creating
  any child state.
- A child is created through the normal canonical `start_session` path, then its Open parent edge
  is persisted through `AgentGraphStore`.
- If edge persistence fails, S4v removes both the just-created in-memory child session and its
  canonical Thread. A cleanup failure is returned together with the graph failure; it is never
  ignored.
- Close validates that the supplied child is a durable descendant of the loaded parent before
  storing `Closed`; the edge audit row remains readable.
- Open descendant reads only consume the canonical graph. A restarted RuntimeCore without the
  parent session fails closed instead of reconstructing a tree from legacy metadata.

## Validation

- `rustfmt --edition 2021 --check lime-rs/crates/app-server/src/runtime.rs lime-rs/crates/app-server/src/runtime/agent_control.rs`: passed.
- `git diff --check -- lime-rs/crates/app-server/src/runtime.rs lime-rs/crates/app-server/src/runtime/agent_control.rs`: passed.
- `CARGO_TARGET_DIR=/tmp/lime-s4v-target cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib`: passed. The only S4v warnings are expected dead-code warnings because this narrow internal boundary intentionally has no gateway caller yet.
- `RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml -p app-server agent_control --lib`: pass, 6/6. `2026-07-14-s4r8-local-data-source-fixture-sync` 已补齐 shared `LocalAppDataSource` fixture 的 router field，原并行 MCP 编译阻塞已解除。

## Classification And Handoff

- `current`: RuntimeCore loaded-parent child lifecycle and canonical graph ownership check.
- `compat`: none.
- `deprecated`: legacy session metadata and Team state remain prohibited as graph truth.
- `dead`: no surface deleted in this narrow control slice.

The next owner is S4w and must only consume durable identity/mailbox with canonical
Item-before-ack, trigger only `TriggerTurn`, and model mailbox activity/wait. It requires a new
narrow claim after the active canonical Item and RuntimeBackend write sets are released. The six
current tools, dynamic gateway, JSON-RPC/GUI projection, restart recovery, and old Team/collab
surface deletion remain separate follow-up slices.
