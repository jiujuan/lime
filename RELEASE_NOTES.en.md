## Lime v1.70.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features
- Agent session listing now supports working-directory filters across the App Server protocol, schema, Rust runtime, Projection DB, and frontend sidebar so recent conversations can be scoped to the current project root.
- Projection Store now owns session updates, bulk archive, inferred titles, and metadata persistence, further consolidating history lists, archive state, and title rendering on the current App Server read model.
- Coding Workbench gained richer Task Center run controls, task rails, file-change cards, and projection adapters so general and coding workbenches share a more stable task context.
- App Server / Agent Runtime event projection now maps tool args, tool input/output deltas, tool progress, file reads, and command lifecycle events for more detailed frontend tool timelines and command output rendering.

### Fixes
- Fixed sidebar conversation navigation so sessions resolve their project from `working_dir`, reducing cross-project recent-conversation jumps.
- Fixed empty session titles by deriving a display title from the first user message for historical and projected sessions.
- Fixed App Server host process startup and readiness boundaries while removing retired current timeline / legacy message backfill product fallbacks.
- Fixed agent session list / update / archive consistency on the projection-first path; missing projections now surface as missing sessions instead of falling back to retired product paths.

### Improvements and Refactors
- Product DB cleanup advanced by removing retired runtime table creation for `agent_messages`, old thread item/outcome/incident tables, and A2UI forms, with a drop path that prevents these tables from remaining product truth.
- App Server runtime removed the `current_timeline` and legacy message backfill bridges; session list, hydrate, and archive now converge on event log, Projection DB, and RuntimeCore current ownership.
- App Sidebar removed in-sidebar language / appearance popover leftovers and tightened the ownership of account, settings, update, and conversation-list areas.
- Agent Chat / Workbench components continued moving state machines, projection helpers, and runtime logic into focused ViewModels and hooks.
- Coding and DB roadmaps were updated to the 2026-06-15 state with S3 legacy migration state machine details, S4/S5 execution slices, and current-owner boundaries.

### Tests and Quality
- Expanded App Server protocol schema, app-server-client, session-list cwd filter, projection update/archive, session-title, and thread-client event projection coverage.
- Expanded Electron session history fixture, code artifact workbench fixture, claw chat current fixture, and App Server contract guards for the new projection-first session path.
- Expanded App Sidebar, Agent Chat, Task Center, Canvas Workbench, MessageList, Inputbar, and five-locale i18n regressions.
- Expanded Rust coverage for agent tool orchestration, session store, runtime backend coding events, Projection DB, legacy boundaries, and Product DB schema cleanup.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Agent Runtime client dependency, pnpm lock, and Cargo lock to `1.70.0`.

### Documentation
- Updated database slimming PRD, execution plan, and tech-debt tracker with `agent_messages`, legacy DAO, current timeline exit strategy, migration state machine, and future drop conditions.
- Updated the Coding Workbench roadmap and implementation plan with execution process policy follow-up, Agent Workspace workbench decomposition, and Task Center projection progress.
- Added Agent Workspace roadmap material and package boundary notes for Agent capability catalog / workbench adapter ownership.

### Other
- This release continues to consolidate session history, workbench projections, coding tasks, tool timelines, and database governance around App Server JSON-RPC, RuntimeCore, Projection DB, Electron Desktop Host, current npm clients, checked-in schemas, and machine-readable guards.

**Full changes**: `v1.69.0` -> `v1.70.0`
