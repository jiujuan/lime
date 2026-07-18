## Lime v1.107.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added a resumable Electron update state machine for checking, downloading, completion, installation, and restart. Repeated actions now reuse the active session instead of duplicating downloads or restarts.
- Added Windows Squirrel N-1 installer download, candidate install/upgrade smoke, and structured evidence upload to the release workflow.
- Converged Browser Runtime settings on the current session API with remote-debugging port validation, target inspection, session open/close, and connection-state feedback.
- Added the Dream Blossom home skin and local hero artwork, with skin assets, copy, and five-locale navigation/settings resources owned by the unified appearance path.

### Fixes

- Fixed duplicate Codex rollout discovery, canonical item detail boundaries, and stable item identity during imported-history reads.
- Fixed ordering, filtering, and recovery state across historical/live messages, tool calls, file artifacts, reasoning, and web retrieval in the Agent timeline; narrow layouts no longer remount the message tree.
- Fixed inconsistent loading, error, disconnect, close, and retry states in Settings and Browser Runtime, and removed the retired Chrome Relay guide path from the current product chain.
- Fixed re-entry boundaries in Electron updater, App Server host, and Windows startup paths, with deterministic configuration for unsigned macOS development packaging.
- Fixed a Windows Squirrel N-1 smoke navigation race that treated the preload-enabled startup page as the final renderer; packaged launches now also remove unsupported `NODE_OPTIONS` and the development-server URL.
- Fixed Electron Release workflow builds when the Rust cache omits sherpa-onnx prebuilt libraries; shared runtime libraries are now prepared explicitly for each target before packaging.

### Improvements and Refactors

- Extracted canonical item conversion into a dedicated App Server current module covering Thread/Turn/Item payloads, metadata, tool output, approvals, media, sub-agents, and compaction.
- Further converged Codex local-history import on canonical Thread/Turn/Item data, including large histories, archived paths, visual audits, and continuation.
- Expanded managed tool execution, cold-restart, soak evidence, and Settings fixture harnesses while keeping script ownership and fail-closed governance on one path.
- Removed the retired Chrome Relay guide, the ineffective `.skill` system-setting path, and test artifacts outside the build graph; required negative governance guards remain.

### Tests and Quality

- Added Windows Squirrel RC, updater re-entry, Browser Runtime session, multi-page Settings, and Dream Blossom skin regressions.
- Expanded Agent timeline, Codex import, canonical read model, provider stream, Electron host/preload/IPC, protocol catalog, and five-locale resource coverage.
- Added managed-execution evidence, soak, cold-restart, and script-governance checks while keeping production mock fallback disabled.

### Documentation

- Updated global architecture, App Server release updater, Codex import roadmap, Refactor V2 test plan, Agent verification research, and project Gate A/B records with current ownership, Windows RC evidence, and remaining live/eval boundaries.

### Other

- Bumped version facts to `1.107.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.106.0` -> `v1.107.0`
