## Lime v1.89.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued the Aster runtime migration: the old `crates/aster-rust` tree moved to `lime-rs/vendor/aster-rust`, while the Rust workspace keeps App Server / Agent as the current source of truth and treats Aster as a controlled vendor compatibility dependency.
- Added current App Server workflow control coverage for `workflow/respond`, `workflow/retry`, and `workflow/cancel`, including protocol schemas, client methods, and runtime control entry points.
- Added Article Workspace / General Workbench workflow controls, detail panels, and read-model projection so workflow state, evidence, and next actions are visible from the chat workspace.

### Fixes

- Fixed several Agent Session / Aster session-store projection, history compaction, runtime conversation, todo projection, and subagent projection boundaries to reduce drift between legacy Aster storage and Lime current sessions.
- Fixed image-task preview, inline article images, draft materialization, and task-send recovery / writeback paths so failed, completed, manually applied, and synchronized states are more consistent.
- Fixed Plugin / Workflow runtime drift by removing the old `workflowRuntimeHost`, `useWorkflow`, and related policy leftovers so tests and frontend entry points no longer depend on the retired workflow host.

### Improvements and Refactors

- Split Agent-side ask / turn execution, Aster trait skeletons, session projection, message-content adapters, runtime snapshot / timeline adapters, and subagent adapters out of central files.
- Continued separating `model-provider`, `thread-store`, and `tool-runtime` around provider safety / routing, session records, tool IO, MCP notifications, and tool-result models.
- Converged App Server workflow processing, runtime read models, media tasks, and image-command presentation around current owners; protocol types and the npm client were regenerated in sync.

### Tests and Quality

- Added or updated coverage for workflow control, App Server protocol catalog, media-task JSON-RPC, workflow read models, Agent session stores, Article Workspace workflows, image-task preview, and inline image sync.
- Frontend regressions now cover the General Workbench sidebar / workflow panel, Article Workspace right panel, draft send / materialization, Plugin pages, navigation, and five-locale i18n resources.
- Updated the release workflow skill to use single-page release notes: each release replaces `RELEASE_NOTES.md` / `RELEASE_NOTES.en.md` and keeps only the current version.

### Documentation

- Updated the Aster migration main plan, Phase 2 blocking analysis, feature gate, vendor downgrade, conflict-resolution notes, and session summaries to record the vendor migration and compat-aster convergence policy.
- Updated Workflow PRD / architecture / diagrams / implementation plan, images v2 progress, and the workflow standardization execution plan to match the current implementation.

### Other

- Bumped version facts to `1.89.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and the current-turn smoke client.
- Excluded the local backup file `lime-rs/crates/agent/src/aster_session_store_adapter.rs.bak`; it remains only a temporary conflict-resolution reference.

**Full changes**: `v1.88.0` -> `v1.89.0`
