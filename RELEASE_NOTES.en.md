## Lime v1.63.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Expanded the App Server JSON-RPC current surface for objectives, session compaction, thread resume, queued turns, review decisions, handoff/replay/evidence export, file checkpoints, persisted logs, media tasks, gateway tunnels/channels, WeChat channels, skill packages, and skill repositories.
- Added an MCP current smoke entrypoint for the App Server current MCP path.
- Added release planning artifacts for Agent App shell prepare, Agent App uninstall current UI, provider-store data roots, and the desktop platform product-app boundary.
- Continued expanding App Server client and frontend Agent Runtime typed clients for skill packages, media, objectives, sessions, threads, subagents, sites, gateway, and diagnostics current methods.

### Fixes

- Fixed more DevBridge and desktop-host APIs that could still fall back to legacy or mock paths when the current route was unavailable.
- Fixed current-boundary and response-shape gaps for skill package install, import, replace, rename, and export flows.
- Fixed protocol schema and client type gaps for App Server diagnostics, gateway tunnel/channel, media task, session archive, and replay paths.
- Fixed current allowlist coverage gaps in Electron host commands, IPC channels, update host, and release workflow guards.

### Improvements And Refactors

- Continued moving business logic out of old Tauri wrappers and the legacy desktop facade, shrinking old agent-session, skill, media-task, gateway, WeChat, capability-draft, and runtime-query command surfaces.
- Routed more current capabilities through App Server runtime, processor, local data source, protocol schema export, and Rust/TypeScript clients.
- Reduced the old skill execution dialog, hook, and mock command paths in favor of the Skill Forge/package current chain.
- Tightened Desktop Host mocks, DevBridge policy, command catalog, and mock priority surfaces so tests cannot masquerade as production routes.
- Continued migrating scripts into domain directories and added the `scripts/mcp/` current smoke area.

### Tests And Quality

- Expanded App Server client contracts, command contracts, Rust current-boundary guards, desktop-host mock-boundary tests, and Agent Runtime command schema guards.
- Added or expanded regressions for skill package current paths, media current boundaries, session current boundaries, app-config provider current boundaries, channels runtime, gateway tunnel, usage stats, and MCP fail-closed behavior.
- Expanded tests for Agent Apps, Capability Drafts, Harness Status, settings stats, Skills pages, desktop-host core, webview APIs, Electron host commands, and IPC channels.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, and lockfiles to `1.63.0`.

### Documentation

- Updated App Server/Desktop Host command boundaries, governance, quality workflow, parallel collaboration guidance, execution-plan indexes, and the appserver roadmap.
- Added PRDs and execution plans for provider-store data roots, desktop platform product-app boundaries, Agent App uninstall current UI, and diagnostics current fail-closed behavior.
- Updated default knowledge-builder skill guidance, knowledge roadmap notes, and scripts governance documentation.

### Other

- Continued centering release facts on App Server JSON-RPC, Electron Desktop Host, current clients, and machine-readable schemas while reducing legacy wrapper and renderer-mock influence on GUI production paths.

**Full changes**: `v1.62.0` -> `v1.63.0`
