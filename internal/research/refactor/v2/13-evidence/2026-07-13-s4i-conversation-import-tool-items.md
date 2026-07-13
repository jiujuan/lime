# S4i Conversation Import Canonical Tool Items

> date: 2026-07-13
> status: completed / coordinator-validated

## Outcome

Codex conversation import now lowers its source-local Tool intermediate at the
commit boundary where final session, thread and turn identities exist. The
stored product event stream contains only canonical `item.started` and
`item.completed` Tool Items with typed arguments, output, error, metadata and
source provenance. The outer `AgentEvent` owns nested Item sequence and time.

The following retired product paths are deleted:

- `is_imported_tool_wire_payload` EventStore bypass;
- raw Tool allowlist in projection item events;
- positive external fixture that accepted imported raw Tool wire;
- read-model synthetic imported Tool Items and imported raw fallback.

Raw Codex source events remain only inside the import parser/normalizer before
commit lowering. They cannot be written to `StoredSession`, the event log,
ProjectionStore, read model, live notification or GUI.

## Focused Verification

- Rust Tool projection: `4/4`.
- Rust read model: `27/27`.
- Rust conversation import runtime events: `10/10`.
- Rust external canonical Tool items: `4/4`.
- Rust thread item projection: `30/30`.
- Rust tool lifecycle: `17/17`.
- Rust ProjectionStore: `21/21`.
- Rust workspace patch host: `8/8`.
- `npm run test:contracts`: passed, `290 checks`.
- targeted ESLint and `npm run typecheck`: passed.
- targeted `rustfmt` and `git diff --check`: passed.
- `npm run governance:legacy-report`: passed with zero reference, classification
  and boundary-drift candidates.

Two regression guards added during Gate B investigation also passed:

- RuntimeCore `message.delta` serializes a canonical AgentMessage Item in the
  live notification envelope.
- Renderer sequence gate accepts repeated canonical snapshots for one
  AgentMessage Item and projects both as final-answer text deltas.

## Gate B

`claw-chat-current-fixture-home-hotpath-s4i-rerun` passed at
`2026-07-13T02:22:39.152Z` as a controlled Electron Gate B fixture. It proved
the real Electron/preload/App Server JSON-RPC chain, first empty-state submit,
fixture backend, canonical GUI projection, visible international-news summary,
terminal state, input readiness and read-model completion. The previous
home-hotpath attempt reached the same real chain but lost the summary during a
navigation race; the isolated rerun passed without a product fallback or code
relaxation, so that attempt is recorded as timing evidence rather than an S4i
regression.

`approval-request-resume` remains blocked before `action.required`: the GUI
shows the fixture provider authentication error asking for API key/Base URL or
authorization configuration. No pending Approval Item or approval button was
created, so this does not validate or invalidate S4i or requestId-first
Approval identity.

## Governance

- `current`: commit-boundary canonical Tool lowering and typed read/write
  consumers.
- `compat`: none in product wire.
- `deprecated`: source-local import raw intermediate only, pending S4j typed
  draft refactor.
- `dead / deleted / forbidden-to-restore`: imported raw Tool wire, bypass,
  projection allowlist, synthetic read Items and positive compat fixture.

## Next Slice

S4j replaces the source-local raw Tool intermediate with a typed import draft
and splits `conversation_import/commit_events.rs` before it exceeds the 1000
line policy limit. Product wire behavior is frozen by the S4i guards.
