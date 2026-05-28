## Lime v1.53.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Aligned the coding workbench with the OpenVibeCoding main path, adding central Preview / Files / Changes / Output / Logs tabs and a stable right-side conversation column.
- Made coding mode prefer visual HTML previews by default, with multi-file changes and output moved out of the first-screen diagnostics stack.
- Added a “fix failed output” loop that builds a structured repair request from existing Harness output, file changes, and checkpoints, then submits it back to the same `code_orchestrated` session.
- Added i18n P4 readiness reports for release docs, Chrome extension, app metadata, RTL, and whole-roadmap aggregation.

### Fixes

- Fixed runtime queue active-turn isolation across independent sessions so one session no longer blocks another.
- Fixed fallback handling and gate release when the runtime-turn thread or Tokio runtime cannot start, reducing stuck queue risk.
- Fixed queued-turn projection for empty persisted threads and first history pages so restored sessions can still expose real queue state.
- Fixed hydrated Agent Chat runtime queues not auto-resuming after session restore.

### Improvements And Refactors

- Tightened the `CanvasWorkbenchLayout` coding mode, utility tab, change view, and i18n copy boundaries.
- Expanded the code review summary with failed-output previews, current review focus, related-file ordering, and output/file pairing.
- Further aligned the Harness status panel, task-center tabs, workspace scene runtime, and sidebar with the coding workbench information architecture.
- Removed stale RTL evidence screenshots and outdated readiness artifacts in favor of the new P4 / roadmap readiness evidence.

### Tests And Quality

- Added frontend and Rust regressions for coding workbench layout, failed-output repair, change queues, conversation restore, and runtime queue behavior.
- Added tests for i18n docs locale manifests, app metadata locale manifests, P4 readiness, and roadmap readiness reports.
- Updated the quality task planner to recommend refreshing P4 / roadmap readiness reports when i18n evidence changes.
- Extended RTL smoke evidence to the Workspace surface and included required surface coverage in the readiness inventory.

### Documentation

- Added the OpenVibeCoding coding workbench alignment plan.
- Updated the Agent UI roadmap, i18n P0-P4 progress, release docs workflow, app metadata workflow, and RTL readiness evaluation.
- Synchronized release notes and version fact sources to `1.53.0`.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, and lockfile versions to `1.53.0`.

**Full changes**: `v1.52.0` -> `v1.53.0`
