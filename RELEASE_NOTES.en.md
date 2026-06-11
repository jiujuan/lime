## Lime v1.66.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Agent App runtime now connects to the current App Server client and capability APIs, allowing standalone Agent Apps to reuse the JSON-RPC client, capability host, and runtime projection path.
- Agent Runtime standard packages now include App Server facts, fixture replay, subagents, refs, and validation support for shared runtime, projection, and UI consumption.
- App Server workspace protocol now exposes project-summary reads, with matching Rust client, npm `app-server-client`, and frontend project API updates.
- The Agent input bar can read and surface project context so workspace project summaries can participate in the main chat orchestration path.

### Fixes

- Fixed Agent UI projection summary and subagents read-model naming so old Team Workbench terminology no longer leaks into the current model.
- Fixed Agent App runtime page and projection bridge wiring for the current capability host / client APIs, reducing drift between standalone apps and the desktop host.
- Fixed several state-sync issues around the input bar, tool display, workspace send runtime, and thread grouping.
- Fixed DevBridge command policy and legacy surface catalog classification for retired command surfaces.

### Improvements And Refactors

- Converged the Agent Chat workbench path from old Team Workspace components, selectors, canvas runtime, and suggestion helpers onto the current subagents / workbench presentation, deleting a large amount of retired team-workspace UI surface.
- Split `AppSidebar` into account, appearance, invite, search, session, navigation-target, and style modules, reducing single-file complexity.
- Removed Companion API, settings card, provider overview, desktop mock, and sidebar-entry remnants from the current settings and provider surfaces.
- Continued moving input-bar project context, team preference, project storage, and workspace selection logic into hooks and focused helpers.
- Expanded the Agent Runtime / Agent UI npm packages with standard contracts, fixtures, projection helpers, runtime facts, and UI exports to reduce duplicated GUI and SDK implementation.

### Tests And Quality

- Expanded App Server protocol catalog, workspace project API, npm `app-server-client`, Agent Runtime client, projection, UI contracts, and fixture replay regressions.
- Updated AppSidebar, Agent Chat input bar, workspace scene, workspace send, settings v2, Agent App runtime page, and i18n resource tests.
- Updated Electron SDK fixture smoke, tool-surface smoke, command-contract checks, quality-task planning, and i18n readiness reporting.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, Agent Runtime client dependency, and lockfiles to `1.66.0`.

### Documentation

- Added Agent Workbench and Subagents roadmap entries, including acceptance, iteration plan, parallel workstreams, and task board artifacts.
- Updated Agent Runtime, Agent UI standard gap, completion audit, implementation plan, test cases, and adjacent protocol documentation.
- Updated quality workflow, command-boundary, Playwright E2E, protocol standards map, and tech-debt tracking docs for the current workbench / subagents / App Server boundaries.

### Other

- This release keeps release facts centered on App Server JSON-RPC, Electron Desktop Host, current npm clients, `lime-rs/crates/**`, and machine-readable guards while preventing old Team Workspace, Companion, and legacy command surfaces from flowing back into the product path.

**Full changes**: `v1.65.0` -> `v1.66.0`
