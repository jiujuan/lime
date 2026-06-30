## Lime v1.83.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Moved the Writing mainline to Article Workspace / Article Editor: `@写文章` artifacts now render as a standalone `ArtifactFrame`, and the right rail hosts the editable article canvas. The old Product Profile path has left the main path.
- Expanded plugin-package projection so the host can read skills, subagents, CLI tools, connectors, and hooks from plugin manifests and merge them into the agent app manifest and history restore flow.
- Completed the current `@配图` chain with `mediaTaskArtifact/image/complete`, forming one end-to-end path from task creation to completion, GUI terminal card, and reload restore.
- Narrowed image workbench event handling so the frontend no longer depends on the old model-preset split and instead follows the current image task and runtime trigger path.

### Fixes

- Fixed history restore drift for Writing objects, artifact references, and right-rail tab projection so restored sessions no longer fall back to old Profile semantics.
- Fixed the lack of a standard JSON-RPC completion entry point for image tasks by adding task-type validation, terminal-state rejection, and result writeback coverage.
- Fixed plugin history restore normalization for blank surface kinds, artifact refs, and selection state.

### Improvements and Refactors

- Split Article Workspace projection, editing, preview, and right-surface code into focused modules to reduce single-file responsibility overload.
- Migrated the Content Factory fixture narrative from Product Profile to Article Workspace and added restore, reload, and terminal-state assertions.
- Synchronized the App Server, Rust protocol, and frontend client image-task interfaces, including generated types and contract checks.

### Tests and Quality

- Added Rust JSON-RPC tests for image-task completion, covering the happy path, wrong task type, and cancelled terminal rejection.
- Added a current `@配图` fixture and regression assertions that verify GUI state, App Server read model, task file state, and reload restore together.
- Updated regression coverage for the plugin contract, history restore, image workbench, workspace article path, and locale resources.

### Documentation

- Added `internal/roadmap/images/README.md` to document the image-capability roadmap.
- Updated the `internal/roadmap/Writing/` docs to use Article Workspace / Article Editor as the current source of truth.
- Updated the related execution plan with the current `@配图` chain closure and verification notes.

### Other

- Updated version facts to `1.83.0` across the root app, CLI npm package, App Server client package, Rust workspace, main Cargo lock, and the Aster sub-workspace lock.
- This release excludes the local temporary file `internal/roadmap/Writing/.DS_Store` and the unreferenced `lime-home.png`.

**Full changes**: `v1.82.0` -> `v1.83.0`
