## Lime v1.90.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued converging the Agent Runtime migration: retired the old Aster backend, provider state / factories, router, scheduler, and live-provider specialty tests while App Server / Agent current runtime now owns session configuration, runtime state, credential projection, and live execution process handling.
- Expanded Article Workspace and image workbench support for inline images, image tasks, structured previews, object artifacts, and action-output kinds so writing and media generation stay synchronized inside the workspace.
- Added current Soul / personal-style foundations: built-in style profiles, style directive composition, boundary evaluation, interaction copy, and the memory-settings entry point for personalized output.

### Fixes

- Fixed Agent Chat streaming status, failure recovery, send context, runtime status hints, and session-history projection boundaries to reduce stuck states, stale terminal events, and inconsistent recovery.
- Fixed Expert Plaza, expert instances, expert launch synchronization, and workspace right-surface metadata / role-switch projections so expert Agents and workspace entry points stay aligned.
- Fixed Markdown image resolution, image-task preview, Task Center draft materialization / send, article edited-draft sync, and artifact writeback paths for more stable mixed text and image workflows.

### Improvements and Refactors

- Split App Server processor code, plugin worker turns, runtime backend tests, image-command presentation, and read-model tests by responsibility to reduce central-file size and sharpen current-owner boundaries.
- Split Agent crate runtime state / support, session config adapters, credential bridge runtime projection, request-tool-policy reply streams, and test support while removing migrated provider-safety / Aster-state leftovers.
- Tightened model provider, tool runtime, agent protocol, and App Server backend boundaries so retired Aster / legacy backend paths cannot drift back into production truth.

### Tests and Quality

- Added or updated regressions for Agent stream controllers, workspace workflow controls, workspace metadata, Soul style profiles, Markdown media, Expert Plaza, Knowledge metadata, Plugin manifest / runtime, and i18n loading.
- Added governance coverage for App Server runtime/backend boundaries, Aster migration boundaries, ProjectThread-first boundaries, Rust layer budgets, Rust test scope, and Electron release/update host behavior.
- Added Claw image live smoke coverage, content-factory / article inline-image fixtures, current Electron fixture assertions, and GUI smoke helpers so release validation covers image and workspace main paths.

### Documentation

- Updated the Aster migration main plan and vendor-downgrade policy, removed obsolete phase / session documents, and consolidated migration records around the current roadmap.
- Added the ProjectThread-first execution plan and roadmap PRD, and updated Soul personal-style output surfaces, style-pack installation, and style-profile planning.
- Updated Playwright E2E, Workflow standardization, images v2 progress, skills E2E testing, script governance, and repository-level rules to match the current validation flow.

### Other

- Bumped version facts to `1.90.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and the current-turn smoke client.

**Full changes**: `v1.89.0` -> `v1.90.0`
