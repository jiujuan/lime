## Lime v1.88.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Split the Agent Runtime mainline into `agent-protocol`, `agent-runtime`, `model-provider`, `thread-store`, and `tool-runtime` crates so Codex-style execution has clearer protocol, model-context, session-thread, and tool-runtime boundaries.
- Continued landing the App Server workflow runtime, including plugin-worker workflows, event-log modules, workflow read models, queue-resume audit coverage, Content Factory host-tool evidence, and Article Workspace edited-draft projection.
- Strengthened Claw / Article Workspace image-task and inline host-command flows, covering document-inline image synchronization, image-task preview state, visible reasoning policy, Plugin input capability, and workspace send behavior.

### Fixes

- Fixed several Agent Chat streaming terminal-state, history restore, auto-title, read-model projection, and visible-reasoning boundary issues to reduce ordering drift, unfinished send state, and stale history overwrite.
- Fixed image-task, media-worker, image-workbench preview, and document-inline image writeback projection issues so failed, cancelled, completed, and tool-result states are displayed more consistently.
- Fixed drift around Plugin install readiness, Content Factory runtime fixtures, provider model display, and App Server protocol/client schemas so retired demo, mock, or legacy surfaces do not return to the current mainline.

### Improvements and Refactors

- Split App Server runtime backend, plugin-worker runtime, request context, memory tools, image tools, and event-log code into narrower modules, continuing to reduce central-file responsibility.
- Moved the old services-side Aster session store into the Agent-owned source of truth and synchronized Aster runtime / migration / App Server boundary governance.
- Removed the old `agentapp` roadmap directory and stale Content Factory demo surface, replacing them with current Plugin, Workflow, Aster migration, and Agent Runtime documentation.

### Tests and Quality

- Added or updated coverage for Agent Runtime, App Server protocol, workflow read models, media-task JSON-RPC, image workers, plugin runtime, provider config, legacy-surface guards, and governance boundaries.
- Frontend regressions now cover the Agent Chat input area, message list, image-task preview, Article Workspace, Plugin page, API key provider, i18n resources, and App Server event-stream / read-model projection.
- Split the `content-factory-current-turn` fixture into host-tool assertions / fixtures and synchronized the release smoke client version to `1.88.0`.

### Documentation

- Added workflow standardization, Aster migration, App Server / Aster runtime boundary governance, Writing v2 Content Factory reframe, and Plugin runtime completion-audit docs.
- Updated next PRD, Writing / Workflow / Plugin / Agent Runtime / App Server / images roadmaps, tech-debt tracking, and command-boundary guidance for this round of current-mainline and retirement decisions.

### Other

- Bumped version facts to `1.88.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/crates/aster-rust/Cargo.lock`, App Server release manifest, and current-turn smoke client.

**Full changes**: `v1.87.0` -> `v1.88.0`

## Lime v1.87.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- The Plugin runtime mainline replaces the old Plugin entry points: install, runtime, shell host, task worker, right-side surface, history restore, SDK, and manifest flows now use Plugin naming and the current protocol.
- Continued completing standalone release coverage for the Content Factory plugin package, including release gates, connector production preflight / delivery / webhook checks, runtime fixture smoke, and signed release evidence.
- Article Workspace and the right-side workbench now support Plugin surfaces and plugin workflow evidence, with stronger Content Factory worker dogfood, article workspace patches, and history restore coverage.

### Fixes

- Fixed marketplace, installed-state, manifest-contract, runtime-authorization, and governance drift caused by the old Plugin / Plugin dual track.
- Fixed image-task and media-worker routing, post-processing, and provider coverage gaps so image generation behaves more consistently across providers.
- Fixed stale Plugin method residues in the App Server client, protocol schema, command catalog, and mock boundaries so legacy commands do not return to the current mainline.

### Improvements and Refactors

- Removed the old `plugin` frontend, Electron, App Server, script, and schema surfaces at scale, replacing them with equivalent Plugin-domain modules.
- Converged App Server runtime, local data source, processor, runtime backend, and protocol schema ownership around Plugin APIs; old Plugin files are now treated as dead surface.
- Updated script governance, i18n app metadata, legacy surface catalog, and quality workflow docs to use Plugin naming and release gates.

### Tests and Quality

- Added or updated regressions for Plugin runtime, marketplace, install / cleanup / packaging / SDK / shell / UI flows, Electron host integration, App Server protocol, and Content Factory fixtures.
- Updated `test:contracts`, protocol type generation, script governance, and legacy surface guards to cover Plugin retirement and the current Plugin surface.
- Adjusted the release workflow skill to prefer stable required gates: keep `verify:app-version` / `typecheck` by default, and no longer auto-block releases on `npm run lint`, bare `npm test`, or full `cargo test`.
- Synchronized the current-turn smoke client version to `1.87.0` so release fixtures match the app version.

### Documentation

- Updated command boundary, quality workflow, design language, workspace, parallel collaboration, and Writing v2 execution-plan docs for the Plugin runtime current mainline and Plugin retirement policy.
- Updated package READMEs, agent runtime package READMEs, and default skill docs with Plugin / Content Factory wording.

### Other

- Bumped version facts to `1.87.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/crates/aster-rust/Cargo.lock`, and release smoke fixture.
- Excluded the local temporary file `internal/roadmap/Writing/.DS_Store` and the unreferenced temporary barrel `src/features/plugin/host-sdk-index.tmp.ts`.

**Full changes**: `v1.86.0` -> `v1.87.0`

## Lime v1.86.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued grounding the Lime Plugin Package v1 content-factory source of truth: sample and technical docs now cover `plugin.json`, `app.runtime.yaml`, `app.workbench.yaml`, skills / subagents / CLIs / connectors / hooks / resources / workflows / artifacts / examples.
- Kept tightening the current image-command mainline so `@image`, `@edit image`, and `@redraw` have a more complete preview, branch-selection, retry, and writeback path.
- Continued shrinking the gap between Agent Chat live timeline, session restore, and read-model boundaries so stale history and ordering drift are less likely during streaming.

### Fixes

- Fixed several host-managed generation and image-task routing issues that could leak the wrong image context into normal follow-up turns.
- Fixed stale-detail overwrite, rollback, and ordering drift during streaming refresh so message and thread-item projection is more stable.
- Fixed projection drift in the plugin marketplace, installed Plugins, manifest parsing, and seeded fixtures.

### Improvements and Refactors

- Split App Server runtime, worker, image-command, plugin-manifest, and plugin package code into narrower modules to reduce central-file sprawl.
- Cleaned up Electron host commands / IPC channels / resource-manager window host integration and the renderer bridge surface.
- Updated the `scripts/agent-runtime` current fixture set, `scripts/agent-qc` local gates, `scripts/i18n` unused-key checks, and release-doc tooling.

### Tests and Quality

- Added or updated coverage for Plugins, plugin contracts, image task viewer behavior, current fixture smoke, Rust runtime, and App Server regressions.
- Continued tightening the release gates around `verify:app-version`, `test:contracts`, and GUI smoke.

### Documentation

- Updated the Writing v2, images v2, thread timeline, plugin technical-spec, and quality / command-runtime / Playwright guidance docs.

### Other

- Bumped version facts to `1.86.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and `lime-rs/crates/aster-rust/Cargo.lock`.
- Excluded the local temporary file `internal/roadmap/Writing/.DS_Store`.

**Full changes**: `v1.85.0` -> `v1.86.0`

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
- Expanded the plugin marketplace and installed Plugins projection so activation, capability profile, installed state, and availability are now presented through the same view model.

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
- Expanded plugin-package projection so the host can read skills, subagents, CLI tools, connectors, and hooks from plugin manifests and merge them into the plugin manifest and history restore flow.
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
