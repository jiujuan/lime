## Lime v1.61.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added App Server JSON-RPC current protocols for automation jobs, covering scheduler config, scheduler status, job list/read/create/update/delete, run now, health, run history, schedule preview, and schedule validation.
- Moved model Provider management onto the App Server current path, covering Provider list, catalog, read, create, update, delete, sort order, config import/export, connection tests, chat tests, model fetching, API key management, key rotation, usage/error records, and UI state persistence.
- Expanded both the TypeScript and Rust App Server clients with typed automation and model Provider methods backed by shared protocol constants and schemas.
- Added an Electron runtime wrapper and continued routing Electron Desktop Host commands into App Server current data surfaces.

### Fixes

- Fixed automation settings and job APIs so missing required App Server results fail closed instead of falling back to legacy commands.
- Fixed API Key Provider and model Provider flows so reads, writes, tests, imports, and exports no longer depend on legacy `safeInvoke` paths.
- Fixed unregistered desktop-host mock commands silently succeeding; explicit test mocks now fail closed unless a command is registered.
- Fixed diagnostic-only APIs being mixed with production API behavior by introducing a dedicated diagnostic facade.
- Fixed the risk of automation `runNow` falling back to the old Tauri executor before the App Server automation executor is fully migrated.

### Improvements And Refactors

- Continued consolidating frontend API gateways for automation, model Providers, file browsing, session files, knowledge, memory, MCP, voice, updates, and workspaces around App Server and Electron current boundaries.
- Removed old automation Rust command and DevBridge dispatcher paths, classifying the legacy automation command family as dead surface.
- Reduced the default `src/lib/desktop-host/*Mocks` surface so production paths cannot fake App Server capabilities through default mocks.
- Removed obsolete `webview-api` exposure and types to reduce overlap between browser runtime helpers and the desktop current path.
- Moved more automation, Provider, and file-browser responsibilities into the App Server local data source, reducing old compatibility wrappers in the services crate.
- Updated command-boundary governance with current automation and Provider method lists plus legacy-command regression guards.

### Tests And Quality

- Expanded App Server client contracts for automation and model Provider protocols, schemas, TypeScript client methods, and Rust client methods.
- Added command-contract guards that block legacy automation and Provider commands from returning through Tauri commands, DevBridge dispatchers, mock priority commands, or runtime surfaces.
- Added targeted regressions for automation APIs, API Key Provider, model Providers, execution runs, session files, hint routes, document export, image search, video generation, and voice models.
- Added desktop-host mock-boundary tests to ensure unregistered mocks fail closed and test fixtures explicitly register commands.
- Expanded Electron host command, IPC channel, update host, App Server host, and current entrypoint coverage.
- Improved Vitest smart-runner and test-file filtering coverage for more stable focused validation.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, and lockfiles to `1.61.0`.

### Documentation

- Updated Desktop Host / App Server command-boundary documentation for automation, model Providers, file browsing, mocks, DevBridge, and legacy surface classification.
- Updated the App Server frontend integration matrix and implementation plan with automation and Provider migration progress.
- Updated quality workflow and Playwright/E2E guidance to keep GUI validation centered on real Electron Desktop Host plus App Server paths.
- Updated Agent App, Agent UI, Managed Objective, and Skill Forge roadmap notes where current command boundaries changed.

### Other

- Continued reducing old Tauri, legacy desktop facade, and renderer mock influence on production paths so release facts, command boundaries, and GUI validation stay on the current single path.

**Full changes**: `v1.60.0` -> `v1.61.0`
