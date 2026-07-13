# S2f Empty Thread Creation Audit

> date: 2026-07-12
> source: `smoke:agent-runtime-current-fixture` Gate B
> next slice: S2f-empty-thread-create

## Failure

The controlled Electron fixture created a session successfully, listed it in the GUI and clicked it before starting the first Turn. The workspace remained in restoring state because the real App Server read failed:

```text
agentSession/read failed: thread <fixture-thread> does not exist
```

Evidence is recorded in `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-home-hotpath-regression-summary.json`.

## Cause

- `RuntimeCore::start_session` inserts only an in-memory `StoredSession` with no events.
- `ProjectionStore::apply_canonical_events` creates the canonical Thread lazily when the first event is appended.
- GUI session open calls the real read boundary before the first Turn/event.
- The read boundary correctly fails closed because no canonical Thread row exists.

This is not a reason to restore AgentSession fallback or synthesize an empty thread in the GUI. Canonical Thread creation belongs to the App Server session/store transaction.

## Frozen Fix Boundary

`S2f-empty-thread-create` owns only:

- `app-server/src/runtime/session_lifecycle.rs`
- `app-server/src/runtime/canonical_thread_store.rs`
- `app-server/src/runtime/tests/sessions.rs`

Successful session creation must atomically create an empty canonical Thread. Store failure must not leave split in-memory/SQLite truth. Tests must cover immediate read/list with empty turns/items, duplicate identity, failure/retry and the original Electron home-hotpath.

The slice is blocked until S4b releases the permanent `app-server/src/runtime/**` hot zone.
