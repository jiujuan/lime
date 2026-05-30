## Lime v1.54.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Upgraded the Agent Chat workspace into a clearer task workbench, tightening the relationship between session overview, team tasks, artifact preview, file management, and the right-side conversation.
- Added project selector flows for opening an existing folder, choosing the project root, revealing the local path, and opening the current project's content view.
- Added the `view_image` workspace-restricted tool to the Rust runtime surface and expanded alias normalization for `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, and web tools.
- Added plaintext `<tool_use>` extraction in Aster reply parsing so non-standard model tool-call output can continue through the runtime.
- Improved OpenAI-compatible / Responses tool-call parsing for top-level tool names, namespaces, object arguments, and streaming tool deltas, reducing provider-format interruptions.
- Scoped Agent runtime warmup by workspace and ensured sends wait for the current workspace runtime readiness and model preference resolution.

### Fixes

- Added a before-first-token timeout guard for automatic context compaction so slow compaction models degrade instead of blocking later runtime turns.
- Collapsed noisy JSON-RPC / troubleshooting runtime output behind readable error summaries in failure cards.
- Fixed deferred project-list loading, existing-folder reuse, project-path conflict checks, and default workspace readiness edges.
- Fixed several projection boundaries around image input policy, Browser Assist evidence indexing, and workspace query mocks.
- Made responsive-chat automatic model selection recognize recent quota, authentication, and provider-unavailable failures, then skip unavailable candidates.
- Fixed Bash / PowerShell path permission parsing so pure variable-assignment segments no longer panic.
- Fixed native tool panics so they collapse into a single tool error result instead of interrupting the tool stream.
- Fixed provider / model preferences so new sessions and sessions missing runtime metadata still submit the selected preference with the turn.
- Fixed web-search preflight so empty search payloads no longer count as successful results, and required news / time-sensitive requests now expand into dated search queries.

### Improvements And Refactors

- Reworked team workbench copy around tasks, owners, artifacts, and handling status, with technical details collapsed by default.
- Split display logic across the Harness status panel, Team workbench, Canvas workbench, File Manager, and conversation restore paths.
- Filled current five-locale resources for Agent Chat, project management, settings, and error presentation.
- Removed the old provider-continuation export dependency and cleaned up the stale home screenshot asset.
- Allowed workspace tool permissions to include explicit read-only local paths while preserving workspace restrictions.
- Extracted tool-process summaries, tool display info, and Agent text normalization into focused helpers to reduce UI duplication.
- File write / edit tools now emit structured `file_change` metadata, and the frontend aggregates it into a concise file-change summary card.
- Updated Tauri patch dependencies to `2.11.2` / `2.6.2` and aligned the global shortcut patch version.
- Default release builds no longer bundle the local SenseVoice `sherpa-onnx` native runtime. Voice models still download on demand, and the local SenseVoice runtime will be enabled through an explicit component or feature path so optional runtime downloads cannot block installer releases.

### Tests And Quality

- Added Rust regressions for plaintext tool-call parsing, tool alias normalization, `view_image` permissions, compaction timeout, and image policy.
- Added frontend regressions for project selection / creation, file management, team workbench, canvas layout, conversation restore, Crash Recovery, and error presentation.
- Added regressions for OpenAI / Responses tool-call formats, responsive-chat provider-unavailable handling, explicit read-only path permissions, runtime warmup, and tool-process summaries.
- Added regressions for file-change summaries, tool panic containment, shell path parsing panic protection, and model preferences submitted with turns.
- Added Rust regressions for web-search preflight required / allowed mode boundaries, news-query expansion, and empty-result downgrades.
- Updated the GUI smoke knowledge-workspace check to cover the new workspace path and readiness state.
- Updated the Agent UI TTFT sample matrix to cover the runtime MCP prewarm before-first-token budget path.
- Release gates cover `cargo fmt`, `cargo test`, `cargo clippy`, `npm run lint`, `npm test`, and `npm run verify:gui-smoke`.

### Documentation

- Updated the Agent Chat workspace and component READMEs with the current workbench structure and component boundaries.
- Synchronized release notes and version fact sources to `1.54.0`.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, and lockfile versions to `1.54.0`.

**Full changes**: `v1.53.0` -> `v1.54.0`
