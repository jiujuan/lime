## Lime v1.52.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Expanded Managed Objective automation smoke into an independent entry point covering the end-to-end evidence chain for owner sessions, continuation, completion audit, and evidence packs.
- Added request metadata, tool input capabilities, file checkpoints, timeline artifacts, reliability status, and diff review presentation to the Agent runtime.
- Completed runtime permission, command execution summary, evidence status, and error presentation coverage for `ToolCallDisplay`, `DecisionPanel`, `HarnessStatusPanel`, and `AgentRuntimeStrip`.
- Added asset protocol preview paths to the HTML artifact renderer, with Tauri CSP updated for asset, font, media, and frame resources.
- Added ONNX embedding support for local memory embeddings; models are downloaded on demand and are not bundled into the installer.
- Expanded API Key Provider and model configuration panels with connection test types, model registration, and OpenAI-compatible provider information.

### Fixes

- Fixed owner binding between automation due jobs and agent sessions to avoid losing the original session relationship during continuation and evidence export.
- Fixed boundary states in Agent message projection, artifact preview, workspace send actions, and the message scroll controller.
- Fixed consistency issues across memory search, unified memory command output, HTML preview, filesystem API mocks, and media task mocks.
- Fixed the default blocking strategy for live provider smoke and the Vitest network guard to prevent regular tests from accidentally calling external networks or real providers.

### Improvements And Refactors

- Split the DevBridge agent session dispatcher, automation executor, and runtime request metadata assembly logic.
- Tightened test boundaries for Agent Chat runtime state, session finalization, artifact/message utility functions, and the workspace send helper.
- Simplified Memory page and settings memory configuration paths, reducing duplication between old display surfaces and the current memory runtime.
- Unified fact sources for `@code` / mention command prefix matching, runtime tool surface, agent command catalog, and mock priority commands.

### Tests And Quality

- Added `managed-objective-automation` smoke and an OpenAI-compatible fixture server that defaults to a local fixture instead of a real provider.
- Enhanced the `agent-runtime-tool-surface` page smoke to cover runtime tool surface, workspace skill bindings, and GUI page readability.
- Added frontend regressions for diff review, workspace file preview, harness state, runtime input capability, and agent runtime error presentation.
- Expanded command contract, legacy surface catalog, i18n patch retirement gate, translation coverage, and language boundary report tests.
- Added Rust targeted tests for request model resolution, runtime turn routing / prompt / projection, timeline service, and automation owner session evidence.

### Documentation

- Updated command boundary, quality workflow, Agent UI, i18n, and Managed Objective roadmap records.
- Added HTML preview provider readiness notes and i18n patch retirement gate evidence.
- Synchronized release notes and version fact sources to `1.52.0`.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, and lockfile versions to `1.52.0`.

**Full changes**: `v1.51.0` -> `v1.52.0`
