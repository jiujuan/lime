## Lime v1.68.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features
- The coding workbench main path has been upgraded with layered Canvas Workbench panels, top tool tabs, project file browsing, change lists, review menus, preview mode, and a coding output panel, moving the workbench from a monolith to an extensible coding execution surface.
- Added current Project Git capability and App Server JSON-RPC schemas so the frontend can read project diffs, file changes, and workspace context, then render them in the workbench changes panel.
- Electron Desktop Host now includes an embedded browser host and main-window load error capture, bringing browser preview, loading state, and diagnostics into the current host boundary.
- Agent tool execution now has tool orchestration, policy inspection, sandbox / rules / decision layers, and an apply_patch tool chain for more realistic engineering execution.
- App Server runtime now includes coding events, file checkpoint projection, artifact projection, tool lifecycle, turn execution, session hydration / lifecycle, and related modules for a unified read model across code artifacts, tool traces, and session state.

### Fixes
- Fixed the Canvas Workbench single-component surface being too large and tightly coupling file, diff, preview, and toolbar state; extracted ViewModels and subpanels reduce state drift and rendering regressions.
- Fixed synchronization issues around Agent session completion, continue output, browser assist, workspace conversation scene, and active stream cleanup, reducing the chance that stale terminal events stop a new stream.
- Fixed incomplete runtime backend aggregation for tool events, tool inventory, request context, and coding events so tool execution, file patches, and the read model stay aligned.
- Fixed several flattened gateway / websocket / scheduler responsibilities and removed old executor residue, keeping ownership on the current App Server / RuntimeCore path.

### Improvements and Refactors
- Continued splitting central App Server files such as `runtime.rs`, `local_data_source.rs`, and `runtime_backend.rs` into domain modules, keeping processors focused on dispatch wiring.
- Agent prompt assets, managed goals, permissions, review, and realtime templates are now checked-in upstream assets, reducing scattered and unaudited runtime prompt construction.
- Gateway WeChat / Telegram / Feishu / Discord runtime logic now shares agent runner and task context structure, reducing repeated execution branches.
- Removed legacy agent runtime mock / command manifest residue so DevBridge and governance catalogs focus on the current App Server / Electron Desktop Host boundary.
- Updated the coding roadmap, Agent Workbench, App Server integration matrix, governance docs, and execution plans with the current coding workbench and tool execution state.

### Tests and Quality
- Expanded Rust regression coverage for App Server runtime, runtime backend, coding events, tool inventory, file checkpoints, evidence exports, and session archive JSON-RPC.
- Expanded tests for Agent tool execution, tool orchestrator, policy inspector, apply patch, request tool policy, and aster tool execution.
- Expanded regressions for Canvas Workbench, Workspace main area, Project Shell, Inputbar, Agent Runtime Strip, Layout Transition, Agent App runtime, and i18n resources.
- Expanded app-server-client, agent-runtime-client, agent-runtime-projection, agent-runtime-ui, and agent-ui-contracts tests for the new protocol, projection, and tool trace behavior.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Agent Runtime client dependency, and Cargo lock to `1.68.0`.

### Documentation
- Updated coding workbench architecture, implementation plan, runtime capability map, UI projection, and reference boundary docs with current owners and delivery criteria.
- Updated quality workflow, command boundary, Harness Engine, state / history / telemetry, memory compaction, services, and query-loop docs to align the App Server current path and legacy boundaries.
- Updated tools PRD, tool inventory, Agent Workbench roadmap, and execution plans with release evidence for tool execution and the coding workbench.

### Other
- This release continues to consolidate the coding task path around App Server JSON-RPC, RuntimeCore, Electron Desktop Host, current npm clients, checked-in schemas, and machine-readable guards; local screenshot evidence is not included in the release commit.

**Full changes**: `v1.67.0` -> `v1.68.0`
