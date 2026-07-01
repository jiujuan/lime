## Lime v1.85.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Moved the image-generation mainline into the App Server / Media Runtime worker: `@image`, plain natural-language image prompts, and article image slots now share `.lime/tasks/image_generate`, Provider DB routing, resident scheduling, and recovery.
- Added a generic plugin orchestration rail to the Article Workspace right editor so Content Factory workflow, subagents, skills, connectors, and hooks remain visible and restorable.
- Article image slots can now launch image tasks directly; completed tasks replace Markdown placeholders by slot / anchor, including multi-slot assignment, failed / cancelled safeguards, and manual apply metadata.
- Completed the AgentChat Thread Timeline / Session Refresh mainline so live streaming timeline state is no longer overwritten by stale session detail refreshes.

### Fixes

- Fixed `@command` panel filtering that could hide the `@image` result after the outer catalog had already matched it.
- Fixed image model placeholder leakage so `default / auto / __default__` and similar values are no longer persisted as real task models.
- Fixed the Electron Host `config.json` vs App Server `config.yaml` split by making image defaults read from the current `config.yaml` source.
- Fixed image worker fallback to the retired local gateway, long-pending tasks, stale running recovery, and successful completion records without `slot_id`.
- Fixed regular Expert Panel text follow-ups inheriting the image Provider / `gpt-image-1`.
- Fixed high-frequency `runtimeGetSession` / detail refresh behavior that could reduce, reorder, or erase already displayed live messages.

### Improvements and Refactors

- Split `lime_media_runtime` from a 5k+ line root module into a 31-line facade with dedicated image request, reference image, post-processing, task artifact, worker, and test modules.
- Expanded Media Runtime Provider adapters for OpenAI-compatible edit / reference image requests, Responses `input_image`, Gemini `inlineData/fileData`, native Zhipu image generation, and shared HTTP error classification.
- Split image-task frontend runtime code into `imageWorkbenchTaskActions`, `imageTaskPreviewRuntimeGuards`, `imageTaskPreviewRuntimePayload`, and `workspaceDocumentInlineImageTaskSync`.
- Added projected item events to the App Server read model for message batches, reasoning, tool lifecycle, permission preflight, artifact snapshots, routing, and runtime events.
- Continued tightening Agent Chat page and Workspace loading/projection boundaries with lazy-loading and smaller pure helpers.

### Tests and Quality

- Added and updated Rust and frontend coverage for image workers, Provider routing, stale running recovery, Media Runtime adapters, article slot writeback, failed / cancelled retry, thread timeline merging, and the orchestration rail.
- Extended Electron fixtures including `image-command`, `plain-image-intent`, and `content-factory-article-workspace` to cover GUI state, App Server read model, task artifacts, reload restore, and provider request bodies.
- `npm run test:contracts` and `npm run verify:gui-smoke` passed across multiple key increments; the release run will execute the version and release gates again.

### Documentation

- Updated the image capability roadmap with App Server image worker, resident scheduling, Provider adapter, and configuration source-of-truth boundaries.
- Updated the Writing implementation plan with Content Factory orchestration rail, article image-slot tasks, slot replacement, and retry closure.
- Added the Thread Timeline / Session Refresh source-of-truth governance roadmap.
- Added the Agent verification research entry and Agent Verification Contract template.

### Other

- Updated version facts to `1.85.0` across the root app, CLI npm package, Rust workspace, main `lime-rs/Cargo.lock`, and the Aster sub-workspace lock.
- This release excludes local temporary files `internal/roadmap/Writing/.DS_Store` and `lime-rs/test-tool-call-fix.sh`.

**Full changes**: `v1.84.0` -> `v1.85.0`

## Lime v1.84.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued the Writing mainline into Article Workspace / Article Editor: `@write article` artifacts now render in a standalone `ArtifactFrame`, and the right-side canvas is now the editable current surface.
- Unified the image-generation capability catalog and execution chain: OpenAI-compatible, Gemini, Fal, and local image-server routes now share one catalog / executor / error-presentation flow.
- Expanded the plugin marketplace and installed Agent Apps projection so activation, capability profile, installed state, and availability are now presented through the same view model.

### Fixes

- Fixed history-restore and right-surface projection drift for Writing so restored sessions no longer fall back to old Profile semantics or the wrong draft.
- Fixed image-task completion, cancellation, and wrong-type handling so image tasks now fail closed on invalid task types and cancelled terminal states.
- Fixed the presentation of plugin activation and marketplace blockers so disabled, unavailable, package-mismatch, and missing-release-evidence states are shown consistently.

### Improvements and Refactors

- Split Article Workspace, the right-surface host, and article-artifact projection into smaller modules to reduce responsibility sprawl.
- Split image-generation provider matching, executors, response parsers, and local-server adapters into a unified image capability catalog.
- Refactored the plugin marketplace view model and capability-profile computation to make installed / activatable / attention classification more consistent.
- Added streaming-worker, content-factory-worker, and image-provider-routing layering on the App Server side.

### Tests and Quality

- Added regression coverage for Writing, image tasks, the plugin marketplace, and capability projection, including current fixtures, history restore, and terminal-state assertions.
- Added focused Rust and frontend tests covering app-server runtime, image tools, plugin contract behavior, and the image model matcher.

### Documentation

- Updated the Writing roadmap and implementation plan to stay aligned with the Article Workspace / Article Editor source of truth.
- Updated the image capability roadmap to record the unified catalog / executor boundary.
- Synchronized the right-surface constraints and related execution plans.

### Other

- Updated version facts to `1.84.0` across the root app, CLI npm package, Rust workspace, and `lime-rs/Cargo.lock`.
- This release excludes `internal/roadmap/Writing/.DS_Store`.

**Full changes**: `v1.83.0` -> `v1.84.0`

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
