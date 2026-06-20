## Lime v1.74.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Extended the current App Server `memoryStore/*` chain with `consolidate`, `review/list`, `review/resolve`, and `index/rebuild` protocol schemas, Rust processors, local data sources, and TS client types.
- Added the current `agentSession/delete` JSON-RPC method with protocol catalog entries, generated schemas, App Server client support, and archive/delete coverage.
- Upgraded the memory settings page into an operational MemoryStore surface for health refresh, manual note capture, consolidation, index rebuilds, review candidates, and workspace rollout summaries.
- Added a visible runtime status when WebSearch / WebFetch results have returned and the Agent is synthesizing the final answer.
- Expanded tool-result previews into dedicated audio transcription, image, video, web-image-search, and memory-evidence preview models.

### Fixes

- Fixed the missing intermediate state between completed web-retrieval tools and the final text response, reducing cases where the UI looked stuck.
- Fixed stream cancellation polling so cancellation no longer depends on waiting for the next runtime event.
- Removed remaining current-truth references to the old `project_memory_get` / `src/lib/api/memory.ts` gateway; project memory now routes through the current `projectMemory` API.
- Fixed the memory settings gap where users could inspect health but could not act on review notes or rollout summaries.
- Reduced the maintenance risk in tool-result preview handling by removing the oversized preview aggregation file.

### Improvements and Refactors

- Split MemoryStore backend work into `audit`, `consolidation`, `review`, and `rollout` modules so the central processor remains a dispatcher.
- Split `taskPreviewFromToolResult` into audio transcription, image, video, web-image-search, copy, and shared-helper modules.
- Tightened Electron Host, DevBridge, command-contract, and legacy-surface guards so old project-memory CRUD and prompt helpers cannot return as current paths.
- Continued integrating file-based memory with runtime memory prompts, context compaction, evidence exports, and session lifecycle handling.
- Updated five-locale i18n resources for `agent`, `agentMessageList`, `settings`, `navigation`, and related fixtures.

### Tests and Quality

- Expanded MemoryStore protocol / App Server / app-server-client contract tests for consolidation, review, index rebuilds, and session deletion.
- Added frontend coverage for memory settings, rollout candidates, the MemoryStore status panel, and the current project-memory API.
- Strengthened Claw chat current fixtures, ready-streaming smoke, command contracts, App Server client contracts, and i18n unused-key checks.
- Added unit coverage for web-retrieval synthesis status, tool-preview split modules, search previews, tool grouping, and memory evidence panels.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock to `1.74.0`.

### Documentation

- Updated the memory roadmap, PRD, architecture, acceptance, rollout, and diagrams around MemoryStore consolidation, review, and rollout ownership.
- Updated turn roadmap, frontend/backend contract, test-case, and sequence docs for session deletion and memory-context boundaries.
- Updated memory compaction, Playwright E2E, App Server frontend integration, and Codex import acceptance documentation.
- Updated tech-debt tracking for the old memory gateway and current-source convergence.

### Other

- This release continues converging memory governance, tool processes, web-retrieval status, session management, and settings actions onto the App Server JSON-RPC / RuntimeCore / current GUI chain. The old project-memory CRUD gateway is no longer a source for new capabilities.

**Full changes**: `v1.73.0` -> `v1.74.0`
