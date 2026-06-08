## Lime v1.62.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Expanded the App Server JSON-RPC file-system mutation protocol with create-directory, create-file, delete-file, rename-file, and a shared mutation response shape.
- Added the usage statistics current data surface, including summary reads, daily trends, model rankings, and range parameters backed by protocol schemas.
- Moved knowledge pack detail reads onto the App Server `knowledgePack/read` current path.
- Expanded Agent Runtime typed clients across sessions, threads, artifacts, export, media, objectives, sites, subagents, and inventory.
- Improved Agent App cloud bootstrap, install-state projections, and app logo/icon display for clearer runtime state and visual identity.
- Added a built-in Lime logo fallback on the startup screen when external icon assets are unavailable.

### Fixes

- Fixed several frontend APIs that could still fall back to renderer mocks or legacy paths when App Server or Electron current routes were unavailable.
- Fixed stale MCP errors remaining after successful server-list refreshes and stopped automatic external-app imports on the first empty MCP list.
- Fixed shape mismatches in MCP server/tool reads, Agent Runtime session reads, and App Server artifact reads that could lead to incorrect UI state.
- Tightened official Skill marketplace response validation for envelopes, lists, bundles, and visual assets.
- Fixed Electron main-window options, IPC channels, and host-command boundaries that were missing current allowlist or test coverage.
- Tightened browser, model, skill, session-file, config-system, and related desktop-host mocks so tests cannot accidentally simulate production capabilities.
- Removed a duplicate Agent App install-success toast from the install review flow.

### Improvements And Refactors

- Continued consolidating DevBridge dispatchers around the App Server and Desktop Host current paths, removing or shrinking old agent-session export, files, models, voice, and workspace branches.
- Significantly reduced the default `src/lib/desktop-host/*Mocks` surface so unregistered mock commands fail by default.
- Kept App Server protocol schema export, Rust clients, TypeScript clients, and contract guards synchronized as new protocol methods are added.
- Continued moving file browsing, connect, memory, project resources, gallery materials, provider, server runtime, voice, update, and related frontend gateways onto current boundaries.
- Added a dedicated Rust usage statistics service and routed App Server processor/runtime/local data source responsibilities through it.
- Changed old Connect Tauri commands to explicit retired-command errors; production now routes through Electron deep-link bridge and App Server JSON-RPC.

### Tests And Quality

- Expanded App Server client contracts for file-system mutations, usage statistics, Agent Runtime clients, schema export, and Rust/TypeScript client synchronization.
- Added targeted regressions for MCP hooks, MCP fail-closed behavior, manual import behavior, Agent Runtime agent/media/objective/site/subagent/thread/export clients, App Server read models, file-system APIs, and usage stats.
- Expanded Agent Apps page, ViewModel, cloud bootstrap, official Skill marketplace, desktop-host mock-boundary, and `webview-api` coverage.
- Added production UI command current-boundary, Knowledge current-boundary, and Rust command current-boundary guards.
- Continued guarding command contracts against legacy, mock priority, and old DevBridge paths returning into current production routes.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, and lockfiles to `1.62.0`.

### Documentation

- Updated App Server protocol schemas and manifest with machine-readable definitions for usage statistics, file-system mutations, and knowledge pack reads.
- Kept five-locale i18n resources in sync for official Skill marketplace invalid-response errors and removed the unused install-success copy.

### Other

- Continued reducing old Tauri, legacy desktop facade, and renderer mock influence on GUI production paths so release facts center on App Server JSON-RPC, Electron Desktop Host, and current clients.

**Full changes**: `v1.61.0` -> `v1.62.0`
