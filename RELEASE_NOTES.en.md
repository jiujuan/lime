## Lime v1.73.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the current App Server `memoryStore/*` memory chain, covering `addNote`, `list`, `read`, and `search` protocol schemas, Rust processors, local data sources, and TS client types.
- Expanded chat image and media preview support with Markdown image fallback, unavailable image placeholders, preview artifact fallback surfaces, and media renderers.
- Upgraded runtime tool process rendering with streaming groups, tool result details, URL preview snapshots, and tool-family display config modules for long-running tasks.
- Added LLM / media event mappers for OpenAI Images, Responses image generation, and FAL video generation so media tasks can reuse the unified LLM event projection.
- Added a versioned turn roadmap covering main-thread turns, frontend/backend contracts, sequences, and test cases.

### Fixes

- Fixed multiple Agent streaming terminal-state, silent-turn recovery, and thread-item projection edges that could leave the UI stuck or recover the input too late.
- Fixed Codex / local-history import runtime event, source metadata, tool detail, and visual-audit assertions so imported process evidence remains traceable.
- Fixed display fallbacks for tool results, search results, artifact previews, and Markdown images when resources, URLs, or media metadata are missing.
- Fixed App Server sidecar host and HTTP client boundary coverage for external backend, JSON-lines event, and command policy error paths.
- Fixed navigation, resources, and memory settings residue after removing the old MemoryPage / UnifiedMemory surface.

### Improvements and Refactors

- Removed old `unifiedMemory/*` commands, the frontend `unifiedMemory` API, the standalone `lime-rs/crates/memory` crate, and the old MemoryPage; memory now converges on the MemoryStore current source of truth.
- Split the oversized `toolDisplayInfo` module into `toolDisplayConfig/*`, copy, subject, types, and result detail modules.
- Continued moving chat message lists, timelines, process summaries, turn grouping, workspace send/navigation/runtime hooks into testable projection / view model / controller modules.
- Continued narrowing conversation import, artifact preview, workspace task rail, and curated task launcher boundaries.
- Updated five-locale i18n resources for `agent`, `agentRuntime`, `agentMessageList`, `workspace`, `settings`, and navigation copy.

### Tests and Quality

- Expanded MemoryStore protocol / App Server / app-server-client contract coverage and added legacy guards against UnifiedMemory returning.
- Added and updated Agent streaming, timeline projection, tool display, message sanitizer, conversation projection, workspace runtime, and artifact preview regressions.
- Strengthened Codex import click-through, real-sample visual audit, session-history fixture, Claw chat fixture, and ready-streaming smoke assertions.
- Updated `test:contracts` support scripts for App Server client contracts, command contracts, protocol type generation, and legacy surface reporting.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock to `1.73.0`.

### Documentation

- Reworked the memory roadmap, PRD, architecture, acceptance, rollout, and diagrams around the MemoryStore current owner and UnifiedMemory retirement.
- Updated the App Server implementation plan, model runtime unification plan, frontend integration matrix, artifact roadmap, and Codex import acceptance matrix.
- Updated command, governance, quality, and memory-compaction docs to clarify current App Server, DevBridge, and memory-chain boundaries.
- Added the turn roadmap documentation set for turn lifecycle, frontend/backend contracts, and test matrices.

### Other

- This release continues converging memory, tool processes, media events, history import, and artifact previews onto the App Server JSON-RPC / RuntimeCore / current GUI chain. Old UnifiedMemory, MemoryPage, and parallel memory crates remain out of scope for new capabilities.

**Full changes**: `v1.72.0` -> `v1.73.0`
