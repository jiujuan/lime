## Lime v1.65.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- `lime media video generate` now uses the current media runtime to create and execute video-generation tasks, resolve service endpoint/API key from local config or environment variables, and persist progress, error, and artifact state.
- `@limecloud/agent-runtime-projection` now exposes dedicated builders for artifact, context, conversation, diagnostic, hydration, lifecycle, permission, plan approval, queue, thread item, and tool events.
- Agent Chat projections continue to consume the shared projection package for runtime state, queue, permissions, history hydration, tool timeline, thread items, and context-event read model semantics.

### Fixes

- Fixed the video-generation skill recommendation so it points at the current `lime media video generate --prompt "..." --aspect-ratio 9:16` entrypoint.
- Fixed governance wording that could still treat old `lime-rs/src/**` files as current Rust owners; restoring old Tauri wrappers, stubs, or legacy facades is now explicitly guarded as backflow.
- Removed duplicate voice settings dependencies on ASR credentials and shortcut runtime state, reducing old command-surface coupling and making the current voice model install state the default source for model status.

### Improvements And Refactors

- Physically removed the old orphaned `lime-rs/src/**` directory, including old Tauri command, service, dev_bridge, and runner implementations; Rust backend ownership is now centered on `lime-rs/crates/**`.
- Moved agent tools catalog, execution, and inventory into `lime-rs/crates/agent`; the old path now exists only as deletion history, not as a runtime owner.
- Split video-generation CLI logic into `lime-rs/crates/lime-cli/src/video.rs` and moved video task execution into `lime-rs/crates/media-runtime/src/video_worker.rs`.
- Reduced duplicated Agent Chat frontend projection state machines by moving reusable event semantics into the npm projection package.
- Simplified the voice and hotkey settings boundary: the voice page focuses on models, instructions, and preferences, while the hotkey page owns global shortcut configuration and validation.

### Tests And Quality

- Added Agent Runtime projection unit coverage for artifact, context, diagnostic, hydration, lifecycle, permission, routing, and turn context events, and expanded the main projection regression suite.
- Updated App Server client contracts, Harness contracts, Rust current-boundary guards, legacy tool permission guards, and Electron current rules guards to prevent old paths from becoming fact sources again.
- Expanded regressions for the input bar, Markdown rendering, Agent Chat home surface, voice settings, hotkey settings, media tasks, gallery materials, session images, and video diagnostics.
- Updated the root app, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, Agent Runtime client dependency, and lockfiles to `1.65.0`.

### Documentation

- Updated AGENTS, quality workflow, governance, command-boundary, and parallel-collaboration docs to record the June 10, 2026 `lime-rs/src/**` deletion and the directory-level dead-surface decision rule.
- Updated production command current migration, Tauri wrapper inventory / cleanup queue, tech-debt tracking, and the App Server frontend integration matrix.
- Updated Agent Runtime projection and Lime CLI npm package documentation with the current projection modules and video-generation entrypoint.

### Other

- This release continues to center release facts on App Server JSON-RPC, Electron Desktop Host, current clients, `lime-rs/crates/**`, and machine-readable guards while blocking old Tauri wrappers and renderer mocks from returning to GUI production paths.

**Full changes**: `v1.64.0` -> `v1.65.0`
