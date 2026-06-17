## Lime v1.72.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the first typed contracts for the unified multi-model and multimodal runtime: models, providers, provider keys, task capabilities, route decisions, failure categories, and executable model routes now flow through App Server protocol / schemas / TS client.
- Media tasks now record standard `ModelTaskRequest`, `ResolvedModelRoute`, `RouteFailure`, and `model_route_execution` evidence, allowing image and video tasks to share route semantics.
- Completed the Codex local-history import click-through path for preview artifacts: imported Markdown, HTML, DOCX, and image attachments can open from the tool timeline into the current Canvas Workbench.
- Added a real long-sample local-history visual-audit smoke covering message list rendering, timeline details, input readiness, screenshots, and leakage boundaries after importing a large Codex rollout.

### Fixes

- Fixed duplicate Codex imports across process restarts by hydrating imported business references from projections and reusing the existing session for the same source thread.
- Fixed imported plan, reasoning, command, patch, web-search, approval, and `read_file` arguments being missing or incomplete after historical hydration.
- Fixed a Canvas Workbench race where a preview request arriving before artifact registration could be marked handled too early, leaving HTML or file previews on the previous artifact.
- Fixed `@voice` / voice generation metadata promoting preferred TTS provider/model into chat-turn provider/model overrides.
- Fixed image workbench draft retries restoring provider/model from `runtimeContract` display metadata; new tasks now return to App Server RouteResolver when the user has not explicitly selected a route.

### Improvements and Refactors

- Moved provider and model APIs from raw JSON projection to typed App Server DTOs; frontend gateways now project those DTOs into UI view models instead of passing raw App Server objects through.
- Split App Server route assembly into `model_task_contract`, `model_route_assembly`, `model_route_execution`, and media runtime contract builders, reducing duplicated JSON assembly across chat, media, and list indexes.
- Reclassified `runtime_contract` as GUI / Skill display metadata; executable route facts are now limited to `model_task_request`, `resolved_route`, and `model_route_execution`.
- Continued splitting sidebar conversation import and conversation menus into dedicated controllers, view models, and menu components to reduce `AppSidebarConversationShelf` size and coupling.
- Split Codex import smoke helpers into `scripts/electron/lib/`, keeping scenario scripts focused on orchestration while sharing GUI and App Server helpers.

### Tests and Quality

- Expanded App Server protocol schemas, generated app-server-client types, model/provider APIs, RouteResolver, media route execution, conversation import, and read-model coverage.
- Added or updated Codex import continuation, click-through, local-history visual audit, real-sample visual audit, artifact preview, Canvas Workbench, AppSidebar, and media workbench regressions.
- Strengthened `npm run test:contracts` so protocol type checking is part of the contract gate.
- Strengthened modality runtime governance: metadata-only voice contracts cannot declare a current executor or `executor_invoked`, preventing fake audio-worker surfaces from returning.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock to `1.72.0`.

### Documentation

- Added the unified multi-model and multimodal runtime PRD and execution plan covering typed catalog, RouteResolver, canonical LLM runtime, and media-task reuse.
- Updated Codex import implementation tracking and progress notes for real file previews, imported-source boundaries, visual audits, and component splitting.
- Updated Warp / modality / quality / command boundary docs so voice generation is documented as metadata-only until an audio worker or RuntimeCore protocol mapper consumes executable routes.
- Updated refactor and artifact roadmap docs with current owners, module splitting, and follow-up governance entries.

### Other

- This release continues converging model, provider, media-task, and history-import capabilities onto the App Server JSON-RPC / RuntimeCore current chain. Retired Tauri wrappers, renderer-side local scanning, fake executors, and parallel runtime routes remain out of scope for new capabilities.

**Full changes**: `v1.71.0` -> `v1.72.0`
