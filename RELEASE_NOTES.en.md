## Lime v1.104.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Moved Messages, Reasoning, and Plans fully onto the Codex-aligned canonical Item lifecycle. Start/Delta/End share stable identities, provider output is scoped by canonical Turn and sampling attempt, and Turn completion no longer synthesizes content through a side path.
- Added typed `content_parts` to canonical AgentMessages. Text and reference-only Media preserve their order and references from ThreadStore through `thread/read`, `agentSession/read`, and live GUI projection while rejecting inline data URIs and raw provider payloads.
- Established `agentSession/read` as the current ThreadStore-backed product presentation endpoint. Approval cold and live reads now emit the same typed terminal response, with GUI decision aliases lowered only at the view-model boundary.
- AgentControl children now inherit the resolved provider, model, reasoning, workspace, and search policy from the parent Turn. Warm `followup_task` calls retain the target child's effective route, using the caller snapshot only for cold targets.
- Runtime-owned MCP clients now use `2025-06-18` and advertise the exact form elicitation capability. Management connections without a trusted Thread owner continue to keep that capability absent.
- Completed current-owner, stable DOM identity, and five-language UI coverage for Agent Chat task indexing, review decisions, tool processes, and media workbenches. Empty timelines now trigger canonical history recovery.

### Fixes

- Fixed provider raw IDs being reused across later sampling attempts or Turns. Reasoning, Messages, Plans, and Tools now order only by their first canonical outer sequence, and terminal Items reject late deltas.
- Fixed producer ordinals colliding with the ThreadStore unique index, imported Reasoning losing its source ordinal, and canonical projection failures still notifying the GUI or advancing in-memory history.
- Fixed same-session navigation skipping history hydration when Turn metadata was present but Messages and Items were still empty. Missing canonical detail now fails explicitly.
- Fixed Approval terminal wire values using GUI aliases, Coding recovery reusing execution identities across Turns, synthetic Content Factory actions and contract probes, and blank Project Shell color variables bypassing defaults.

### Improvements and Refactors

- Removed the app-data session fallback, the 681-line `session_hydration` module, the old Team runtime governor and SubAgent tree, Renderer Agent Runtime root barrels, and stale type aggregators. RuntimeCore, EventLog, and ProjectionStore/ThreadStore are now the sole session fact source.
- Physically removed RuntimeCore's second provider-neutral request/event algebra and generic Model Provider chat/Gemini/Ollama lowering, deleting roughly 1,500 net lines. The current path accepts only canonical requests/events and media body builders.
- Split provider output lifecycle, conversation-import Plan, canonical message lifecycle, Approval, and read-model workflow ownership into focused modules while preserving existing file-size limits without new facades or compatibility tracks.
- Migrated media DTOs, Workspace requests, Evidence/Inventory/Expert/Plugin types, and Agent client/session/thread consumers to their current owners, with guards preventing dead barrels from returning.

### Tests and Quality

- Expanded Rust and TypeScript regressions for canonical lifecycle, typed media parts, Approval, session history, projection failure, provider lowering, and current-owner boundaries while synchronizing App Server schemas and the generated client.
- Added real Electron and Gate B evidence for all six AgentControl tools, visible Reasoning order, image media references, Content Factory, Coding recovery, and history replay.
- AgentControl visible-DOM Gate B now verifies six completed Tool rows and Started/Interacted/Interrupted activity, while MCP elicitation Gate B proves both runtime capability advertisement and management capability absence.
- Made the history replay oracle wait for complete Reasoning summaries, image attachments, and MCP tool rows. Tool rows now expose stable name/status DOM attributes, reducing transient races and brittle text selectors.
- Standardized the macOS Rust test-worker minimum stack in the shared layer runner while preserving explicit caller settings. The candidate includes passing evidence for the smart frontend suite, changed Rust scope, legacy governance, and GUI smoke.
- Covered Task Index and Runtime Review Decision strings across `zh-CN`, `zh-TW`, `en-US`, `ja-JP`, and `ko-KR`, with stable locale regressions.

### Documentation

- Updated the global architecture, Refactor V2 central plan, Agent Workspace, Project Thread, and per-slice evidence for the sole canonical lifecycle, ThreadStore ordinal/projection, AgentSession presentation, and provider algebra owners.
- Recorded the app-data fallback, old provider lowering, root barrels, and Team/synthetic fixtures as `dead / deleted / forbidden-to-restore`, together with their validation, handoff, and exit criteria.

### Other

- Bumped version facts to `1.104.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.103.0` -> `v1.104.0`
