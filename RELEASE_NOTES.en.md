## Lime v1.101.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Established the end-to-end canonical Thread / Turn / Item product chain: App Server now exposes `thread/read`, list, and pagination protocols, ProjectionStore persists typed changesets directly, and Renderer receives complete canonical entities.
- Added atomic empty-Thread creation plus active / queued Turn reads and queue-control projection so new sessions, restart recovery, queued execution, and terminal reads share one source of truth.
- Expanded Skills management and read protocols with stable skill identity, authority, policy, dependency, and workflow metadata across App Server, tool-runtime, and typed frontend clients.
- Added typed display-item and lifecycle contracts for Tool, Approval, MCP, and collaborative Agent activity while preserving arguments, structured output, duration, truncation, sidecars, and decision semantics.

### Fixes

- Fixed approval and request-user-input identity and continuation validation across restart, resume, and cancellation; missing continuations now return structured errors without fabricating resolved state.
- Fixed consistency around canonical event sequencing, duplicate lifecycle events, damaged event-log tails, projection repair, and conversation import while keeping invalid identity and ordering fail-closed.
- Fixed projection drift across GUI active Turns, queued Turns, terminal history, input restore, and right-side workbench state so renderer caches cannot become runtime truth.
- Fixed argument, output, and terminal-state fidelity for image commands, media requests, provider streams, and imported Tool events in the canonical lifecycle.

### Improvements and Refactors

- Moved provider wire lowering from `runtime-core` into `model-provider`, centralizing the current owner for OpenAI, Anthropic, Gemini, Ollama, Fal, and image requests.
- Migrated current provider tool execution to `RuntimeTool` / `ToolCall` / `ToolLifecycleEmitter`, with the host emitter as the sole producer of canonical `item.started` / `item.completed` events.
- Migrated Agent Chat, Plugin runtime, and App Server clients to canonical Thread reads and typed Item projection, narrowing the old `agentSession/read` presentation adapter.
- Removed old Agent tool orchestrator/lifecycle code, runtime-core mappers, thread-store legacy stores/transcripts, raw tool batching, and parallel frontend media/subagent clients.

### Tests and Quality

- Expanded App Server protocol/schema/client contracts for canonical Thread reads, Skills, request access, notification sequencing, and serialization boundaries.
- Added targeted Rust regressions for empty Threads, event-log repair, Tool/Approval lifecycle, conversation import, provider/media lowering, projection storage, and restart recovery.
- Added TypeScript regressions for Agent Chat, Plugin runtime, queue control, canonical item readers, approval projection, and workspace composition.
- Added refactor v2 Gate A / Gate B, current-fixture, protocol-guard, and per-slice evidence covering production-consumer cutover and dead-surface deletion.

### Documentation

- Updated the global architecture for ProjectionStore, the canonical read edge, Tool lifecycle, Approval semantics, provider lowering, and Renderer consumption boundaries.
- Added the refactor v2 multi-process implementation plan, v1 crosswalk, and S1-S6 evidence with consistent current / deprecated / dead classification and remaining exit conditions.

### Other

- Bumped version facts to `1.101.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.100.0` -> `v1.101.0`
