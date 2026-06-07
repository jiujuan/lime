## Lime v1.60.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Made Electron Desktop Host the primary desktop entry point, adding main process, preload, IPC channels, window configuration, DevBridge HTTP bridge, and App Server host bridge foundations.
- Moved release and updater work onto the Electron Forge current path, covering macOS DMG/ZIP, Windows Squirrel, Forge release asset staging, package-resource verification, and local ZIP feed validation.
- Expanded App Server JSON-RPC coverage across Agent sessions, read/list/update, turn cancel, Connect deep links, workspace, model, knowledge, skill, artifact, and evidence surfaces.
- Advanced the Agent Runtime / Claw path onto the App Server current read model, including Electron fixture coverage for session restore, code artifacts, stop generation, history reads, and completion projection.
- Improved Agent App runtime lifecycle support for UI runtime start/status/stop, runtime packages, SDK contracts, native shell configuration, and standalone release helpers.
- Added current GUI smoke coverage for settings, sidebar sessions, Connect deep links, Agent App UI runtime, Claw current fixture, code artifact workbench, and session history fixtures.

### Fixes

- Fixed Electron `safeInvoke` JSON-RPC result-envelope handling so real App Server `result.lines` responses are no longer treated as empty.
- Fixed sends from stale restored sessions by confirming restored ids with `agentSession/read` before submitting a new turn.
- Fixed recent and archived sidebar sessions being filtered by stale remembered workspace ids.
- Fixed Claw first-token waiting state so task cards and input status no longer show completed before a real terminal projection is available.
- Fixed stop-generation behavior so `agentSession/turn/cancel` quickly writes a canceled read model and late completion events cannot overwrite the canceled state.
- Fixed Electron startup and second-instance handling for `lime://connect` deep links, including current resolve, save, and callback paths.

### Improvements And Refactors

- Consolidated desktop host facts around Electron Desktop Host, App Server JSON-RPC, and `src/lib/desktop-host/` current mock boundaries.
- Split large Agent Chat, workbench, sidebar, Harness, Skill selector, and Agent App tests into focused View Model and fixture layers.
- Tightened App Server client contracts, command catalog, DevBridge policy, and governance catalogs to reduce mock-priority and legacy-command regressions.
- Moved Electron release/updater scripts into `scripts/electron/` and continued organizing App Server, Agent Runtime, Agent App, i18n, Harness, Agent QC, and Knowledge scripts by domain.
- Removed old Tauri naming and legacy updater/builder references from current release paths, making Forge-only release/updater the active source of truth.

### Tests And Quality

- Added App Server client contracts, command contracts, modality contracts, scripts governance, and Electron release workflow guards to `npm run test:contracts`.
- Added a structured Electron release workflow guard for Forge makers, signing/notarization, Windows Squirrel, R2 updater assets, and legacy release-path rejection.
- Added `npm run governance:scripts` to freeze the root `scripts/` directory and track domain migrations; the root release bucket is now cleared.
- Added App Server, Electron, and Agent Runtime fixture smokes for stdio, sidecar lifecycle, packaged backend failure, package resources, Claw current fixture, cancel fixture, and history restore.
- Strengthened live Provider / WebSearch / WebFetch smoke gates so unauthorized runs fail closed and authorized runs require turn-scoped provider, model, routing, completed tools, and output evidence.
- Added targeted Rust and frontend regressions for App Server cancel/read model/JSON-RPC/external backend, App Server gateway, Agent Runtime clients, Connect, Agent App runtime, and i18n loading.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, and lockfiles to `1.60.0`.

### Documentation

- Updated the App Server implementation plan with Electron migration, Claw current fixture, Connect deep link, Agent App UI runtime, cancel semantics, and release/updater governance progress.
- Updated the quality workflow with Electron Desktop Host, App Server JSON-RPC, GUI smoke, current fixture, live Provider authorization, and localization validation rules.
- Updated scripts governance documentation for Electron, App Server, Agent Runtime, Agent App, i18n, Harness, Agent QC, and Knowledge domain entry points.
- Updated command boundary, governance, Playwright/E2E, App Server release/updater, and frontend migration docs with legacy / compat / dead surface exit criteria.

### Other

- Continued the repository structure migration from `src-tauri` to `lime-rs`, aligning Rust workspace and desktop backend fact sources.
- Clarified release runners and asset staging: macOS arm64 uses `macos-15`, x64 uses `macos-15-intel`, and Windows uses `windows-2022`.

**Full changes**: `v1.59.0` -> `v1.60.0`
