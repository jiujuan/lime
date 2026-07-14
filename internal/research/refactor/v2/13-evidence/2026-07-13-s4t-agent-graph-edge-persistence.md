# S4t Agent Graph Edge Persistence

## Fact source

Codex persists directional parent/child thread spawn edges separately from its in-memory inter-agent
mailbox. Lime adopts that split: `thread-store` owns a storage-neutral graph contract and App Server
`ProjectionStore` owns the canonical SQLite implementation. Pending mailbox delivery is not stored in
the user Turn queue and remains a separate product decision. The persisted topology is acyclic: a
self edge or reparenting beneath the child's own subtree must fail without mutating the existing edge.

## Copy and adapt

- Adapted Codex `agent-graph-store/{store,types}.rs` to Lime `agent-protocol::ThreadId` and
  `thread-store::ThreadStoreResult`.
- Adapted Codex `state` thread spawn edge schema and queries into the existing ProjectionStore
  database instead of creating another crate or database.
- Preserved Codex semantics: child primary key gives at most one parent, upsert may reparent, missing
  status update is a no-op, close preserves audit state, and descendants are stable breadth-first by
  depth then thread id.
- Hardened the upsert boundary so cycle validation and edge replacement run in one SQLite transaction.
  The descendant probe uses cycle-safe recursive `UNION`, and rejected writes preserve the previous
  parent and status.

## Validation

- `cargo test -p thread-store agent_graph`: 1 passed.
- App Server `canonical_thread_spawn_edge` filter: 6 passed, including self-edge and multi-node cycle
  rejection with mutation-preservation assertions.
- `cargo check -p thread-store`: passed.
- `cargo check -p thread-store -p app-server`: passed after the active S4r1 owner resolved its
  unrelated E0597 dependency blocker.
- Scoped `rustfmt --check`, tracked `git diff --check`, and untracked-file
  `git diff --no-index --check`: passed.

This slice does not alter JSON-RPC, Electron, Renderer, or GUI behavior, so Gate B is not applicable.

## Classification

- `current`: `AgentGraphStore` plus ProjectionStore canonical SQLite implementation.
- `compat`: none.
- `deprecated`: legacy session extension metadata remains outside this slice and cannot become the
  graph owner.
- `dead`: none deleted in this storage-only slice.

## Remaining production cut

The graph API currently has no production AgentControl caller. The next multi-agent slice must wire
spawn/close/recover through this owner, produce canonical Collab/SubAgent Items, and delete legacy
metadata/Team surfaces as their consumers migrate. Durable pending-mailbox replay is not claimed:
Codex uses an in-memory queue, while Lime has not yet defined ack, dedupe, or crash-window semantics.
