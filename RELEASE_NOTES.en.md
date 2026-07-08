## Lime v1.95.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Continued moving the Agent / Claw workspace onto the current path with a richer home surface, task-center tabs, queued turns, input restoration after stop, terminal event handling, media reference previews, Browser Assist, and Team collaboration projection.
- Added App Server session media read protocol, media task read models, sidecar / idempotency support, and image-command Soul presentation so media tasks, session history, and GUI previews share one source of truth.
- Strengthened runtime tool surfaces with reply backend / stream handling, provider stream handling, native overlay dispatch, Skill runtime gates, and tool-runtime contracts, reducing central dispatch inside the agent crate.
- Expanded the Plugin App Center and runtime host with install, launch, uninstall preview, cleanup evidence, cloud bootstrap, and capability dispatch flows, while splitting detail and runtime projections into reusable modules.

### Fixes

- Fixed Agent / Claw cleanup boundaries for stale terminal events, queued turns, stop-then-continue input, history hydrate, and workspace topic switching so old events do not restore input or stop a newer stream incorrectly.
- Fixed App Server / client event streams, read-model normalizers, media result projection, and export normalizers to reduce frontend/backend protocol drift.
- Fixed Codex conversation import path resolution and project filtering for more reliable cross-directory import and history recovery.
- Fixed provider/model loading, OEM LimeHub synchronization, and Prompt Cache capability presentation so UI and runtime capability signals stay aligned.
- Fixed Electron dev sidecar, fixture build, and packaged app-server asset handling to reduce development-vs-packaged resource path mismatches.

### Improvements and Refactors

- Removed the old ChatSidebar and several legacy Harness export cards, consolidating conversation, task, evidence-pack, and workbench state into current Workspace / Task Center / HarnessStatusPanel components.
- Split large frontend modules including `agentProtocol`, Agent Runtime normalizers / types, App Server client methods, OEM cloud control plane, plugin capability dispatcher, host bridge, and Plugins page into narrower domain modules.
- Split Agent chat message projection, timeline content parts, stream event processing, flow control, harness state, thread reliability, and workspace browser-assist runtime out of overloaded hooks and components.
- Split Rust backend media task, conversation import, runtime exports, Soul locale copy, image-command presentation, model routing, plugin worker generation, and tool inventory modules.
- Continued Codex-first cleanup of Aster / legacy residuals by moving Skill gates, native tools, provider stream handling, and retired command guards back to current owners.

### Tests and Quality

- Added and updated regressions for Agent stream handling, queued turns, input restore, workspace topic switching, media reference preview, task center, message projection, thread reliability, and Claw provider selection.
- Added and updated Plugin App Center, capability dispatcher, host bridge, cloud bootstrap, runtime projection, and install / uninstall evidence tests.
- Added Rust targeted tests for media task JSON-RPC, session media read, conversation import path resolution, runtime export rollout, tool inventory, model routing, and image-command presentation.
- Expanded Claw current fixtures, terminal guards, pending steer coverage, web tools, skills runtime, Electron fixture build, and reopen-running-turn CDP gates for stronger GUI release evidence.
- Updated App Server protocol schemas, generated TypeScript types, client contracts, legacy surface catalog, MCP contract guards, and five-locale i18n resources.

### Documentation

- Updated Claw stream, Soul style output, refactor v1, Aster migration, Skills, Agent runtime recovery, and test scenario ledger / registry planning materials.
- Updated release-candidate research notes with the v1.95.0 closure points for the Agent, Plugin, Media, and Runtime current paths.

### Other

- Bumped version facts to `1.95.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/vendor/aster-rust/Cargo.lock`, and release notes.

**Full changes**: `v1.94.0` -> `v1.95.0`
