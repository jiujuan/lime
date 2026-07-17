## Lime v1.106.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added Responses WebSocket transport to the current provider chain. The `supportsWebsockets` capability now flows from the TypeScript client through the App Server and Agent Runtime into `model-provider`, with real Upgrade requests, `response.create`, serialized connection reuse, and session-sticky HTTP fallback for 426 responses, exhausted connection retries, or disconnects before visible output.
- Added multimodal input to the canonical message-part path. Current-turn images are persisted as sidecar references before provider injection, history hydration carries controlled references only, text-only models fail closed before network I/O, and provider capture/read models do not expose base64 payloads.
- Added a standalone SETTINGS-01 Gate A runner covering five locales, three viewports, sixteen primary settings pages, and archived-conversation loading, empty, and error states with structured surface proof.

### Fixes

- Prevented the large App Server async dispatcher from overflowing the default thread stack and enabled concurrent independent JSON-RPC requests after initialization. Long turns, MCP calls, and host I/O no longer block unrelated list/read requests, while responses remain correlated by request ID and resource serialization scope.
- Fixed provider history loss across batch/completed content parts, commentary/final snapshots, and bounded tails after compaction, preventing missing messages, duplicate content, or reinjection of the full compacted prefix on the next request.
- Fixed canonical lifecycle handling for Multi-Agent mailbox Results, concurrent child isolation, and cold-restart recovery. Multiple Results now complete under stable item identities, partial deltas are not acknowledged early, and failed children do not contaminate completed siblings.
- Fixed Plan reloads replacing canonical revision identity with a message copy, and Content Factory multi-document flows selecting artifacts by DOM order. Workspace recovery now reconciles canonical revision and artifact references.
- Fixed macOS arm64 quality runners and App Server project status being blocked by incompatible user-level Git binaries or shell configuration. Native executable PATH handling, plain-directory Git preflight, async child deadlines, and `kill_on_drop` now share current owners.

### Improvements and Refactors

- Further converged Codex local-history import on canonical Thread/Turn/Item data, covering reasoning, commands, approvals, MCP, web search, file artifacts, attachments, and multi-format previews. Large imports now run as background jobs with GUI phase, item, and conversation progress, while native and imported conversations share message projection, tool lifecycle, and continuation paths.
- Switched import commits to incremental materialization. The owner benchmark for 1,200 commands dropped from 106.7 seconds to 3.51 seconds with no fidelity loss, while real-sample visual audits cover desktop, compact, and narrow layouts at multiple scroll positions.
- Unified Agent GUI projection for historical and live timelines, process groups, attachments, diffs/file artifacts, and tool results. Compact and narrow layouts now use a chat-first single panel with an explicit workspace mode switch and preserve the message tree across resizing.
- Removed imported runtime events, imported-only Renderer branches, the legacy Codex content-studio smoke, and the `.skill` file-association Host/API/UI path that did not provide a real system-setting capability. Retired names remain only in negative governance guards.

### Tests and Quality

- Expanded Rust and TypeScript coverage for Responses WebSocket/HTTP fallback, provider errors and retries, multimodal capture, context compaction, AgentControl concurrency/recovery, Codex import performance, and canonical lifecycle behavior.
- Strengthened real Electron Gate B coverage across the current Agent fixture, Codex import click-through, real-sample visual audit, provider migration, Settings, MCP, and Content Factory, verifying shared Electron/preload/IPC/App Server/read-model/GUI identities with zero production mock fallback.
- Unified native executable handling and fail-closed Git checks across quality scripts, and synchronized protocol schemas, generated clients, command catalogs, five-locale resources, script governance, and project Gate evidence contracts.

### Documentation

- Updated the global architecture, Codex import roadmap, Refactor V2 phase-two test plan, DeepSWE scenario matrix, and project Gate A/B records with the App Server concurrency, provider transport, canonical import, responsive GUI, and remaining Windows/live/eval acceptance boundaries.

### Other

- Bumped version facts to `1.106.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.105.0` -> `v1.106.0`
