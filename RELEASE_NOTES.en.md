## Lime v1.103.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Moved the Agent Workspace SubAgent experience fully onto the canonical child Thread family. Parent-child identity, seven runtime states, task statistics, navigation, and history recovery now read App Server `thread/list|read`, AgentGraph, and Thread identity.
- Preserved the original Codex Item ID for imported completed Plans as the canonical item, revision, and source identity. Restarts retain a typed Plan lifecycle without degrading it into a tool event or synthesized identity.
- Codex-imported User and Agent Messages now preserve source identity and source ordinals while emitting the complete canonical `item.started` / `item.completed` lifecycle. Turn completion no longer synthesizes Messages through a side path.
- Migrated Managed Objective, Skills, Evidence, Tool Inventory, queued-turn, execution-strategy, stream-runtime, and thread-read consumers to their current owners, with guards preventing legacy root barrels and session rosters from returning.

### Fixes

- Fixed stable canonical timeline ordering for live and historical reasoning, Messages, and Plans by consistently using Item ordinals, and completed the EventLog-to-canonical-Thread history repair path.
- Fixed SubAgent parent identity, child roster, and terminal-state visibility after cold start, paginated reads, and zero-child cases without falling back to legacy session detail.
- Fixed Plugin runtime start/get/cancel, capability-dispatcher, and host-bridge fixtures that omitted the canonical `threadId`.
- Fixed targeted Vitest and batch-list commands overwriting the default resume state, so local diagnostics no longer corrupt later resumed runs.

### Improvements and Refactors

- Physically removed Renderer Team formation, the Team runtime sidecar, raw SubAgent channels and parsers, legacy roster DTOs/state/normalizers, roster memory shadowing, and synthetic worker notifications. Historical compatibility remains read-only where required.
- Consolidated canonical SubAgent activity into `Started`, `Interacted`, and `Interrupted`, keeping current six-tool names, lineage, and GUI status consistent end to end while excluding V1 aliases from current capability coverage.
- Split App Server runtime value helpers, image-command event projection, and the RuntimeBackend execution adapter, tightening file-size and ownership guards without adding parallel facades.
- Updated Agent Workspace, AgentUI, Project Thread, and SubAgent roadmaps so current documentation references only canonical Thread family, AgentGraph, and AgentUI projection facts.

### Tests and Quality

- Expanded Rust and TypeScript regressions for canonical Messages, Plans, SubAgents, child Threads, session reads, and export metrics, together with App Server schema, generated-client, and Electron contract fixtures.
- Added static guards for Agent runtime current owners, legacy surfaces, roadmaps, Electron IPC ordering, App Server file boundaries, and production sources.
- Added real Electron GUI smoke, history-fixture, Claw cancel/continue, canonical-roster, and Inputbar/Task Rail recovery evidence while keeping five-language Agent Workspace strings and regressions synchronized.
- Made the history-replay Electron oracle wait for the complete Reasoning summary, image attachments, and MCP tool row before asserting, eliminating race false positives from the transient “thinking” shell.
- Improved smart Vitest targeted-state isolation so focused fixes can continue a large resumed suite without resetting completed batches.

### Documentation

- Updated the Refactor V2 central plan, architecture confirmations, and per-slice evidence for canonical child Threads, Agent Chat current owners, App Server module ownership, and deletion exit criteria.
- Synchronized Agent Workspace, AgentUI, Project Thread, Skills, and SubAgent roadmaps, removing descriptions that treated legacy session rosters or the Team sidecar as current.

### Other

- Bumped version facts to `1.103.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.102.0` -> `v1.103.0`
