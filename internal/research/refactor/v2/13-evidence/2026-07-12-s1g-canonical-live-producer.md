# S1g Canonical Live Producer Evidence

> date: 2026-07-12
> slice: `S1g-canonical-live-producer`
> owner: `s1g-canonical-live-producer`

## Result

App Server live notifications now receive the same typed Turn/Item semantics as the current canonical store path without rewriting durable event truth:

1. EventStore materializes each turn-bound lifecycle event against durable history plus the current batch prefix before JSONL append.
2. The returned notification clone receives a complete canonical `turn` or `item` entity.
3. JSONL, the projection stores and in-memory `StoredSession.events` continue to receive the original source payload.
4. Missing canonical entities and materialization identity/sequence conflicts fail before durable append.
5. Current `turn.canceled` emits a canonical Turn with `TurnStatus::Interrupted`; the protocol no longer accepts the source-less `turn.interrupted` name.
6. Session-level events such as `context.compaction.*` have no canonical `turn_id` and remain on the raw channel instead of being misclassified as ThreadItems.

## Boundaries

The current fact source is:

```text
RuntimeEvent
  -> EventStore validation/materialization
  -> original AgentEvent -> event log + stores
  -> notification-only AgentEvent clone with canonical Turn/Item
  -> App Server JSON-RPC agentSession/event
```

The clone is not written back into the source event payload. Renderer normalization and lifecycle synthesis were not restored.

## Tests

- `cargo test -p app-server-protocol agent_session --lib`: 16 passed.
- `cargo test -p app-server turn_lifecycle --lib`: 22 passed.
- `cargo test -p app-server event_notification_jsonrpc --lib`: 3 passed.
- `cargo test -p app-server current_turn_canceled_projects_interrupted_and_retired_name_is_not_accepted --lib`: 1 passed.
- `cargo test -p app-server compact_agent_session_writes_session_context_artifact --lib`: 1 passed.
- `npm run generate:protocol-types`: 678 generated types, 0 failures.
- `npm run test:contracts`: passed, including zero generated drift and 287 app-server-client checks.
- `npm run governance:legacy-report`: passed with 0 classification drift and 0 boundary violations.
- `cargo fmt -p app-server-protocol -p app-server -- --check`: passed.
- `git diff --check` for the exact source/generated write set: passed.

`cargo test -p app-server runtime::tests::sessions --lib` passed 16 of 19 tests on the shared worktree. All S2f empty-thread tests and both compaction tests passed. The remaining failures are outside S1g:

- two stale-event fixtures expect the projection watermark to remain at 4, while current read repair advances it to 5;
- one deprecated presentation fixture expects legacy `type=web_search`, while the canonical typed projection represents the item through Tool semantics.

S1g does not change read-repair policy, presentation DTOs or those fixtures.

## Governance

- `current`: pre-append canonical materialization and complete Turn/Item live notification clones.
- `compat`: none added.
- `deprecated`: raw `AgentSession` presentation remains until S5 canonical GUI cutover.
- `dead`: protocol acceptance of `turn.interrupted`; it has no current producer and no longer yields a canonical notification.

Generated schema/client files were regenerated and validated. Their broader dirty baseline also contains the already completed S1f/S4b contract work; S1g did not overwrite or revert those shared changes.
