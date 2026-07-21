## Lime v1.108.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Upgraded the Agent product chain to the App Server v2 `Thread / Turn / Item` protocol, covering thread creation/resume/archive, turn start/interrupt/steer, item lifecycle, and token usage notifications.
- Added thread goals, memory modes, thread settings, shell commands, paginated history/read models, and durable notifications with one canonical GUI identity.
- Added a session loop for queued input, steering, interruption, approval responses, context compaction, sub-agent mailboxes, and durable cross-turn continuation.

### Fixes

- Fixed duplicate messages, missing terminal states, identity drift, and error recovery across topic switches, history hydration, archive/unarchive, running-turn reopen, and long-thread pagination.
- Fixed queued/steer/interrupt ordering across Electron IPC, App Server notifications, and the GUI input bar so interrupted or failed turns can continue on the same thread.
- Fixed provider routing readiness, credential lookup, pending generation, stream terminals, and model error presentation while keeping unknown capabilities fail closed.
- Fixed current bridge wiring for archived conversations, provider connection errors, voice models, and system capabilities in Settings while removing the retired hotkey settings surface and production mock fallback.
- Fixed restart, cancellation, and permission-failure cleanup for plugin workers, automation, MCP elicitation, Browser Session, and system tools.
- Fixed static session identity across Content Factory first open, draft editing, reload recovery, and workflow actions. Article Editor, artifacts, and the right workspace now consume server-issued canonical Thread/Turn identity and the durable v2 read model.

### Improvements and Refactors

- Converged App Server protocol, transport, processor, RuntimeCore, ThreadStore, and Renderer typed gateways on one v2 current path; retired `agentSession` session methods and schemas were removed.
- Split Agent runtime ownership across the session loop, turn start, thread state/listener, goals/usage, history merge, route selection, and provider request modules.
- Narrowed Electron Desktop Host to App Server forwarding and OS host capabilities, synchronizing Plugin, Voice, System Utility, and preload/IPC allowlists.
- Reorganized Renderer canonical projection, event streams, workspace runtime, message lists, task rails, and right-side workbenches around one Thread/Turn/Item read model.
- Unified user-data, cache, credential, and database-root migration while removing runtime queues, imported-session sidecars, duplicate repositories, and retired compatibility entries.

### Tests and Quality

- Expanded unit and integration coverage for App Server v2 JSON-RPC, the session loop, ThreadStore history, provider routing, MCP, Multi-Agent, plugin workers, and Electron host boundaries.
- Added Gate A browser-projection and Gate B Electron/current-fixture evidence for real preload/IPC, `app_server_handle_json_lines`, read-model, GUI terminal, and zero production mocks.
- Added Content Factory Gate B coverage for Article Editor open/edit/reload recovery, artifacts/read model, and workflow controls, passing 70/70 assertions with zero console or page errors.
- Updated protocol generation, command/catalog, storage-root, legacy-surface, and script-owner guards to prevent v0/compat regressions.

### Documentation

- Updated architecture, database/persistence, provider, governance, Codex/OpenCode alignment, Writing v2, Agent Workbench, and project Gate A/B sources of truth.

### Other

- Bumped version facts to `1.108.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.107.0` -> `v1.108.0`
