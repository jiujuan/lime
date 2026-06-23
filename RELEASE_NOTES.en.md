## Lime v1.78.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Agent App Host v3 is now on the current path: host lifecycle, history restore, product workspace profiles, Right Surface contracts, readiness descriptors, App Server protocol schemas, and generated TS/Rust client types were added together.
- Workspace Right Surface now has App Server JSON-RPC methods: `workspaceRightSurface/request`, `pending/list`, `pending/consume`, `pending/dismiss`, and the `workspaceRightSurface/pendingChanged` notification.
- Right Surface pending requests gained a minimal AppDataSource / Local SQLite persistence path, while the renderer now shares one `AppServerEventBus` drain loop across Agent Runtime and Right Surface consumers.
- objectCanvas gained its first product skeleton: Browser Assist candidates can open in Right Surface, with board / object / edge models, view models, metadata trimming, persist / replay request schemas, and an App Server snapshot store.
- objectCanvas replay now exposes RuntimeCore readiness projection and an `object_canvas.replay.dry_run` audit event. Execution remains blocked intentionally until the real replay executor exists.
- Planning and reasoning are now represented in the streaming UI path through plan state, a plan event controller, model reasoning state, inputbar plan status, and plan decision panel wiring.
- `@limecloud/app-server-client` was split into connection, request client, sidecar manifest, sidecar lifecycle/process, and helper modules so Electron Host and independent apps can reuse the same client surface.

### Fixes

- Fixed multiple Right Surface rendering paths competing with each other: the old Harness outer dialog fallback was removed, and Files / objectCanvas / Harness / Shell / Workbench / Expert now share one surface host.
- Fixed false launcher availability when no result file or object candidate exists. Files and objectCanvas now follow real target / candidate availability.
- Fixed pending Right Surface requests stopping at toolbar badges; pending metadata can now make a surface clickable, open it, consume it, and dismiss it.
- Fixed the risk of multiple frontend runtimes competing for the App Server event drain by routing Agent Runtime and Right Surface pending updates through the shared event bus.
- Improved streaming process display for reasoning, plans, tool calls, Markdown grouping, thinking blocks, tool family labels, and inline process projection.
- Normalized Context7 tool display names from `resolve_library_id / query_docs` to the current `resolve-library-id / query-docs` form.

### Improvements and Refactors

- Split `src/lib/api/appServer.ts` into constants, types, transport, response, client, and method modules to reduce single-file ownership and make contract guards easier to maintain.
- Split `packages/app-server-client/src/index.ts` into protocol, connection, sidecar, and request-helper modules while keeping the package entrypoint re-exports.
- Added App Server protocol schemas for Right Surface, Agent App Host lifecycle, product profiles, history restore, and objectCanvas, then regenerated TypeScript protocol types.
- Continued modularizing the Claw / Agent Runtime current fixture with plan history, right surface visual checks, expert-skills live runner, and tool-execution smoke helpers.
- Moved Workspace conversation logic for Right Surface state, objectCanvas, product profiles, plan decisions, runtime projection, and view models into focused testable modules.
- Consolidated Agent tools / external data / MCP dynamic tool display through family classifiers and projection helpers to reduce duplicated renderer branches.

### Tests and Quality

- Added and expanded regressions for Right Surface registry, controller, runtime adapter, pending runtime, host rendering, Workspace scene wiring, and toolbar integration.
- Added focused tests for objectCanvas model, view model, persistence, replay, App Server snapshot storage, and RuntimeCore replay dry-run audit projection.
- Added coverage for plan state, model reasoning state, plan event controller, plan decision panel, inputbar plan status, and streaming process grouping.
- Expanded Agent App manifest, readiness, host lifecycle, Agent Apps page view model, App Server API, and protocol client tests.
- Extended `scripts/check-app-server-client-contract.mjs` and current entrypoint guards for the split App Server client, Right Surface methods, and sidecar release manifest helpers.
- Updated five-locale i18n resources for new visible copy in agent, agentInputbar, and workspace namespaces.
- Updated release version facts to `1.78.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock.

### Documentation

- Added Agent App v3 roadmap, PRD, architecture, interface contracts, Electron / App Server technical baseline, history product workspace, and content factory workspace documentation.
- Added Plan runtime roadmap and implementation plan covering plan events, reasoning state, inputbar status, and future Runtime executor boundaries.
- Updated the Right Surface roadmap and progress log for the dock / tab / pane model, App Server contracts, pending persistence, objectCanvas snapshots, and replay dry-run work.
- Updated agent tool test batch docs and the coverage matrix for external info/data tools, Context7 docs tools, and dynamic tool family display.
- Updated Desktop Host / App Server command-boundary docs with the Agent App Host lifecycle current method.

### Other

- This release continues converging Agent App, Right Surface, planning / reasoning events, objectCanvas, App Server client, and GUI smoke fixtures onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current path. Old mock fallback, outer dialog fallback, and parallel renderer event-drain paths are not sources for new capabilities.

**Full changes**: `v1.77.0` -> `v1.78.0`
