## Lime v1.69.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features
- Added App Server `executionProcess/*` JSON-RPC methods for process start, status, output drain, stdin writes, interrupt, and terminate, with matching schemas, protocol types, client coverage, and contract tests.
- Upgraded the Agent tool execution path to a durable process execution model with shell output buffering, restricted tokens, sandbox backends, tool orchestration, and execution strategy compatibility projection.
- Added Settings surfaces for execution policy and network access focus, plus an Electron fixture smoke path for Provider settings migration.
- Added Agent Chat runtime policy and routing evidence cards with reliability panel projections so model routing, policy decisions, and execution sources can be reviewed from the conversation.
- App Server runtime now includes artifact sidecars, projection store, projection repair, event log, storage roots, and legacy message backfill modules to keep session read models, code artifacts, and history recovery on the current App Server source of truth.

### Fixes
- Fixed history visibility and projection consistency across session history, message projection, subagent context, todo projection, and runtime detail.
- Fixed App Server session read model, turn lifecycle, tool timeline, and evidence export synchronization in mixed artifact, coding event, and external event scenarios.
- Fixed Electron App Server host and update notification window URL boundary handling, with more coverage for host startup, connection, and update prompts.
- Fixed current/compat boundary regressions in Agent Runtime client, thread client, DevBridge HTTP client, and command policy so retired surfaces are not treated as production truth.

### Improvements and Refactors
- Continued splitting central App Server runtime, processor, and runtime backend files into domain modules for projections, artifacts, events, storage, coding events, and execution process handling.
- Core, infra, and services gained product database migration cleanup, telemetry store, runtime conversation, and model registry runtime metadata modules to reduce coupling in legacy session storage and model routing.
- Canvas Workbench changes, diff, toolbar, and tabs were further separated into ViewModels and focused components.
- API Key Provider, Settings v2, sidebar, archived conversations, About, and App Sidebar styling were aligned with the current settings path and visual system.
- Updated coding and database roadmaps, execution plans, persistence map, and script governance notes for database slimming, Codex alignment, and current runtime capability boundaries.

### Tests and Quality
- Expanded App Server protocol manifest / schema, app-server-client, Agent Runtime client, execution process, session history fixture, and code artifact workbench fixture coverage.
- Expanded Rust coverage for App Server runtime, projection store, legacy message backfill, event log, evidence export, runtime backend coding events, and model routing.
- Expanded tests for aster sandbox, restricted token, process output buffer, bash tool, tool registry, and tool orchestrator behavior.
- Expanded Agent Chat reliability / routing / policy evidence, Canvas Workbench changes, Settings execution policy, Provider settings migration, and i18n resource regressions.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Agent Runtime client dependency, pnpm lock, and Cargo lock to `1.69.0`.

### Documentation
- Added database roadmap, inventory, PRD, and Codex comparison notes for product database slimming, migration cleanup, and persistence main-path slicing.
- Updated coding roadmap, architecture, implementation plan, runtime capability map, and UI projection with execution process, policy evidence, and workbench decomposition progress.
- Updated persistence map and execution plans with current ownership for artifact sidecars, projection store, event log, legacy backfill, and storage roots.

### Other
- This release continues to consolidate coding tasks, session read models, tool execution, settings policy, and database governance around App Server JSON-RPC, RuntimeCore, Electron Desktop Host, current npm clients, checked-in schemas, and machine-readable guards.

**Full changes**: `v1.68.0` -> `v1.69.0`
