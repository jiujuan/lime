# S2f Empty Canonical Thread Evidence

> date: 2026-07-12
> status: ready-for-review; original Gate B empty-thread blocker validated

## Result

`RuntimeCore::start_session` now creates the empty canonical Thread before the
in-memory session becomes visible. A configured ProjectionStore therefore
supports immediate canonical read/list with empty turns and items, which is the
GUI home hot-path requirement.

Canonical `session_id` is unique in SQLite. Explicit session delete and import
replace clear canonical and projected rows through one SQLite transaction before
memory removal, preventing orphan Threads and allowing identity reuse.

## Failure Semantics

- create failure leaves no memory-only session and allows retry;
- duplicate session/thread identity creates no orphan Thread;
- delete failure keeps the memory session;
- successful delete removes the empty Thread and allows recreate.

The RuntimeCore state mutex covers synchronous SQLite create/delete so same-core
operations cannot race between duplicate check and persistence. Cross-storage
process-crash atomicity for SQLite, JSONL and sidecars is not claimed.

## Validation

- the three `start_session_*` S2f tests passed;
- `delete_session_removes_empty_canonical_thread_and_allows_recreate` passed;
- `cargo fmt -p app-server -- --check` passed;
- exact write-set `git diff --check` passed.

The broader crate-level `sessions` filter passed all S2f regressions. Its six
remaining failures were audited separately: three belong to the active S1g
notification cutover and three were released S2c/S2e test fixtures that had not
adopted contiguous event-log sequence and canonical ThreadStore seeding. The
fixture-only corrections are tracked by `S2g-sessions-canonical-fixtures` and do
not relax production validation or restore a legacy read fallback.

## Current Read Review Correction

Coordinator review added the missing direct regression for the original failure boundary:
immediately after `start_session`, `read_session_current` succeeds with empty turns and items before
any Turn or runtime event exists. The corrected start-session group passes 3/3, and the delete/recreate
regression passes independently. The latest broader sessions run is 16 passed / 3 failed; all three
remaining failures are outside the S2f assertions while S1g is active.

## Gate B Rerun

`npm run smoke:agent-runtime-current-fixture` rebuilt the packaged renderer,
Electron host and real App Server sidecar, then passed the original first-Turn
boundary:

- fixture session creation and session list succeeded;
- the sidebar opened the session before the first Turn;
- `agentSession/read` returned the empty canonical Thread instead of
  `thread <fixture-thread> does not exist`;
- the home hot-path submitted, rendered the assistant response and reached a
  completed canonical read model.

The first rerun exited non-zero at the later, independent
`agentUiPerformanceTraceSeparatesProviderAndClient` assertion. The Renderer
sequence gate follow-up now preserves the known provider raw diagnostic
side-channel while keeping canonical lifecycle fail-closed. The final
`npm run smoke:claw-chat-current-fixture` rerun passed with
`hasProviderWaitMs = true`, `hasClientLocalOutputMs = true`, and
`providerWaitMs = 90`.

The latest app-server `sessions` filter also passes 30/30 after the released
fixtures adopted contiguous projection events, canonical Item seeding and
notification-only canonical Item assertions.
