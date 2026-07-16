## Lime v1.105.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the Codex-aligned `exec_command` and `write_stdin` current tool surface with PTY support, persistent sessions, incremental output, timed yields, output budgets, stdin writes, and terminal cleanup. Command execution now flows through the App Server execution process, approval, sandbox, and canonical Tool/Command lifecycle.
- Added `spawn_agent.fork_turns` support for `all`, `none`, and the latest N canonical Turns. Children rebuild optional history and provider transcripts under independent stable identities, while the Pending -> Open crash commit exposes a child only after durable setup completes.
- Added a DeepSWE adapter, project-level Gate candidate/coverage entry points, and an Electron smoke evidence owner to provide auditable snapshots, surface contracts, and proof levels for the next complete Gate A/B candidate freeze.

### Fixes

- Changed provider SSE handling to a 300-second idle timeout instead of a total request deadline and preserved nested transport errors. OpenAI chat streams now ignore fully empty tool-call placeholders and fail closed when arguments arrive without a tool name.
- Preserved final-answer/commentary phase at TextEnd, projected failed commands as canonical Command items instead of generic Tools, and exposed stable runtime Turn status in the streaming DOM.
- Prevented AgentControl spawn failures during history, lineage, graph, identity, or mailbox writes from leaving partial children. Startup recovery now exposes only Open children that completed the crash commit.

### Improvements and Refactors

- Started rebuilding Codex local-history imports directly as canonical Thread/Turn/Item history. Removed the imported runtime-event sidecar, `conversationImport/thread/runtimeEvents/read`, the dedicated detail panel, and imported-only tool projection so imports no longer maintain a second full-history fact source.
- Removed legacy Bash, PowerShell, and shell aliases together with the separate `shell_execution` owner. Live processes, PTY, output draining, interruption/termination, and sandbox command preparation now converge in the current Tool Runtime and App Server owners.
- Removed Renderer synthetic Team projection, Team Memory shadow, selected-team/session metadata, Workspace Agent Team settings, and the old SubAgent tool whitelist. The GUI, read model, and runtime now continue from canonical child Thread/graph facts only.
- Split Task Center draft-send dispatch, conversation-import history building, execution process handling, sandbox command preparation, and Electron smoke evidence into focused owners to reduce hot-file size and hidden cross-layer wiring.

### Tests and Quality

- Expanded Rust and TypeScript coverage for unified exec/PTY, execution-process JSON-RPC, sandbox/policy decisions, AgentControl fork/crash recovery, provider SSE, canonical conversation-import mapping, and GUI projection.
- Added a DeepSWE coding slice, project Gate candidate digests, a 34-surface coverage contract, Gate B execution evidence, and an App Server stdio transport fixture. Removed the old benchmark-release parallel pipeline and obsolete manifests.
- Synchronized App Server protocol schemas, the generated TypeScript client, command catalogs, runtime fixtures, Electron smoke coverage, and current documentation guards.

### Documentation

- Updated the global architecture, Refactor V2 central plan, Codex import roadmap, Multi-Agent/Agent UI guidance, testing strategy, and project Gate A/B plan with current owners, deletion classifications, candidate-freeze rules, and remaining acceptance conditions.

### Other

- Bumped version facts to `1.105.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.104.0` -> `v1.105.0`
