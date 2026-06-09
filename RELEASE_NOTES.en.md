## Lime v1.64.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Expanded the App Server JSON-RPC current protocol with schemas and client types for gallery materials, project materials, session files, unified memory, voice ASR credentials, voice instructions, and video-task artifacts.
- Added standardized Agent Runtime npm surfaces, including `@limecloud/agent-runtime-client` and `@limecloud/agent-ui-contracts`, while expanding shared Agent Runtime projection/UI events, read models, runtime facts, and routing helpers.
- Split App Server local data sources into current domain modules for agent apps, automation, channels, connect, diagnostics, gallery, knowledge, MCP, media, model providers, project materials, session files, skills, unified memory, voice, and workspaces.
- Continued wiring Agent App, Skills, Resource Manager, Memory, Connect, Artifact, Video Workspace, and Agent Chat workspaces into the current App Server / Desktop Host path.

### Fixes

- Fixed boundary gaps where frontend APIs, Desktop Host, DevBridge, or command contracts could still reference retired commands, old mocks, or legacy wrappers.
- Fixed response-shape and test-coverage gaps for App Server client current methods covering session files, gallery materials, materials, media tasks, voice models, ASR, unified memory, system settings, and agent runtime.
- Fixed Agent Chat workspace regressions around session files, external links, Markdown rendering, tool process display, workbench context, and empty-state input flow.
- Fixed remaining old-entry coverage gaps in Electron host command / IPC current allowlists and command-contract guards.

### Improvements And Refactors

- Continued retiring old Tauri command wrappers for ASR, execution runs, gallery materials, layered design, materials, session files, video generation, voice models, and memory feedback.
- Split the App Server protocol v0 implementation out of a large file into domain modules and moved schema export into a dedicated registry.
- Split App Server local data source logic out of a large file into domain modules, reducing cross-cutting edits and repeated branches.
- Reduced duplicated Agent Runtime UI implementation by moving shared contracts, event stores, read models, summaries, UI state, and runtime facts into clearer package boundaries.
- Updated governance, quality workflow, parallel-collaboration guidance, App Server roadmap, and current-migration plans to clarify current / compat / deprecated / dead boundaries.

### Tests And Quality

- Expanded App Server client contracts, command contracts, Rust current-boundary guards, legacy surface catalog checks, desktop-host core tests, and Electron host / IPC regressions.
- Added a session-files Electron fixture smoke and current-boundary tests for session files, gallery materials, materials, media tasks, voice, ASR, document import, frontend diagnostics, image search, logs, skills, and system settings.
- Expanded tests for Agent App runtime, Agent Runtime projection, Agent Runtime UI, Agent UI contracts, Skills workspace, Resource Manager, Memory page, Artifact toolbar, Connect external links, and Agent Chat workspaces.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, Agent Runtime client dependency, App Server release manifest, and lockfiles to `1.64.0`.

### Documentation

- Added the Agent UI Runtime standard and updated engineering navigation, command boundaries, governance, quality workflow, remote runtime, parallel-collaboration guidance, and roadmap indexes.
- Updated production command current migration, Tauri wrapper cleanup, diagnostics fail-closed, tech-debt tracking, and next-stage implementation plans.
- Updated Agent Runtime UI, App Server client, the default video-generation skill, voice current boundaries, and related package documentation.

### Other

- Continued centering release facts on App Server JSON-RPC, Electron Desktop Host, current clients, machine-readable schemas, and domain modules while reducing the influence of old wrappers, legacy dispatchers, and renderer mocks on GUI production paths.

**Full changes**: `v1.63.0` -> `v1.64.0`
