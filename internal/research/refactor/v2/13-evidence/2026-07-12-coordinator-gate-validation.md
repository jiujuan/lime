# Refactor V2 Coordinator Gate Validation

> date: 2026-07-12
> owner: refactor-v2-coordinator
> scope: S1e, S2b-S2e, S3d, S4 shared-worktree validation
> target: `/tmp/lime-refactor-v2-verify-target`

## Results

- `cargo test -p app-server thread_item_projection --lib`
  - result: pass
  - 22 passed; typed materializer and existing projection families ran in the App Server workspace.
- `cargo test -p app-server runtime::event_log::tests --lib`
  - result: pass
  - 16 passed; malformed/unterminated tail, fingerprint, gap, regression and divergence coverage ran.
- `cargo test -p app-server projection_repair --lib`
  - result: pass
  - 7 passed; repair and fail-closed corruption cases ran.
- `cargo test -p app-server provider_history --lib`
  - result: pass
  - 3 passed; canonical provider history remained consumable after the S3 cutover.
- `cargo test -p app-server tool_events --lib`
  - result: pass
  - 23 passed; provider/runtime/tool event projection compiled and ran after the S3 cutover.
- `cargo test -p lime-skills`
  - result: pass
  - 61 passed.
- `cargo test -p tool-runtime skill_search`
  - result: pass
  - 3 passed.
- `npm --prefix packages/agent-runtime-client run typecheck`
  - result: pass (S1e owner handoff).
- `npm --prefix packages/agent-runtime-client test`
  - result: pass (S1e owner handoff).
  - 18 passed; canonical lifecycle tests replaced raw lifecycle positive tests.
- `cargo test -p app-server thread_read --lib`
  - result: pass
  - 7 passed; four direct ThreadStore read methods, active+archived filtering and full turn/item hydration ran.
- `cargo test -p app-server read_model --lib`
  - result: pass
  - 48 passed; the async canonical adapter propagates store errors and preserves the deprecated AgentSession presentation shape.
- `cargo test -p app-server canonical_thread_store --lib`
  - result: pass
  - 6 passed; production event batches, incremental history, archive filtering, paging and rollback ran.
- `cargo test -p app-server projection_store --lib`
  - result: pass
  - 21 passed.
- `cargo test -p app-server-protocol catalog`
  - result: pass
  - 10 passed; canonical Thread and browser reads remain catalog-owned SharedRead operations.
- `npm run test:contracts`
  - result: pass
  - protocol generation had zero drift; App Server client contract reported 287 checks; command, governance, scripts and docs guards passed.

All Rust commands above used `CARGO_TARGET_DIR=/tmp/lime-refactor-v2-verify-target` and validated the current shared working tree. They prove the listed boundaries compile and run together; they do not transfer source ownership from the slice workers.

## Governance

- `current`: typed materializer, canonical event-log repair, canonical provider consumer, stable skill identity, canonical package lifecycle API.
- `compat`: none added by this validation.
- `deprecated`: AgentSession presentation consumers remain only until the S5 canonical GUI cutover; broader Tool/MCP/multi-agent display and recovery contracts remain pending S4 follow-up.
- `dead`: raw lifecycle package mapper/export/tests and schema compatibility middleware were deleted by S1e.

## Remaining Gates

- S5 must migrate Renderer history and live projection consumers to canonical Thread reads and notifications before AgentSession presentation removal.
- S4 must connect its canonical tool contract to production and freeze Tool/Approval/MCP/Collab display DTOs.
- Agent runtime smoke, GUI smoke and Gate B remain required after the downstream S4/S5 cutovers.
