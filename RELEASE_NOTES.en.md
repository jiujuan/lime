## Lime v1.67.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features
- Agent Workbench v2 executable protocol core landed in the main repo: sequence verifier, runtime event pipeline, middleware / adapters, `state.delta` schemas, and projection apply now form a mechanically verifiable event chain.
- App Server / RuntimeCore now gate events before persistence with AgentUI runtime event schema, `state.delta` schema, and sequence validation; invalid streams fail closed instead of mutating session state, turn status, or outbound notifications.
- Runtime / Provider capability manifest and resume contract are now wired through contracts, App Server protocol, RuntimeCore, and the frontend current gateway; `capability/list` can expose runtime capabilities, and thread resume can carry a validated resume contract.
- Agent Runtime client now supports `0..N` event fan-out, flush substrate, schema compatibility middleware, and the browser-safe sessionGateway pipeline; Claw and Agent App current event gateways consume the same pipeline output.
- Task Center now includes a Project Shell panel and Electron / App Server project shell current command chain for start, write, resize, kill, drain events, and multi-tab terminal workflows.

### Fixes
- Fixed the runtime event layer relying only on per-event schema checks without cross-event state-machine enforcement; tool/action/model/turn pairing and post-terminal execution pollution are now guarded.
- Fixed `state.delta` patch failures so they mark hydration as stale with diagnostics instead of corrupting projection / read model state.
- Fixed fragmented Agent Runtime pipeline wiring across App Server notifications, local publish, bridge listeners, and Agent App runtime clients, reducing inconsistent behavior for invalid streams.
- Fixed several synchronization and regression gaps in App Sidebar recent sessions, Agent thread resume, Chat navbar, Workspace conversation scene, and Task Center tab state.

### Improvements and Refactors
- Agent Workbench roadmap advanced from v0.4 to v2.10, with v2.11 focused on projection reconciliation, tool args buffering, reasoning continuity, and external transport compatibility.
- `@limecloud/agent-ui-contracts` now includes capability / resume contracts, sequence verifier, schema constants, and validation APIs so protocol constraints are executable contracts rather than prose-only rules.
- `@limecloud/agent-runtime-projection` now strengthens fixture replay, read model, runtime status, subagents, and `state.delta` apply; batch and incremental projectors share the same merge semantics.
- `@limecloud/agent-runtime-client` now centralizes event pipeline, event verifier, runtime client, and session gateway behavior, reducing duplicate GUI, SDK, and Agent App wiring.
- App Server protocol schemas, the TypeScript app-server-client, and governance catalog now include project shell, runtime capability manifest, resume contract, and thread resume shapes.

### Tests and Quality
- Expanded targeted regression coverage for Agent UI contracts, runtime projection, runtime client, app-server-client, and Agent App current runtime, including bad-stream fail-closed behavior, fan-out / flush, capability manifest, and resume contract.
- Expanded Rust App Server runtime / protocol / schema gate tests for event schema gate, sequence gate, `state.delta` validation, and the project shell processor path.
- Expanded Task Center shell terminal, utility toolbar, Workspace main area, App Sidebar conversations, Chat navbar, MessageList, and streaming renderer regressions.
- Updated the root app, Rust workspace, CLI npm package, App Server client package, Agent Runtime client dependency, and lockfiles to `1.67.0`.
- Release version consistency passes `npm run verify:app-version`.

### Documentation
- Added `internal/roadmap/agentworkbench/v2.md` to capture the Workbench v2 executable protocol core, AG-UI mechanism choices, v2.0-v2.11 staged scope, and completion criteria.
- Updated the Agent Workbench README with v2.0-v2.10 completion status, current event gateway, Rust/App Server schema + sequence enforcement, capability / resume contract, and next work.

### Other
- This release continues to consolidate runtime facts around App Server JSON-RPC, RuntimeCore, Electron Desktop Host, current npm clients, checked-in schemas, and machine-readable guards instead of leaving protocol rules only in docs or downstream GUI projection.

**Full changes**: `v1.66.0` -> `v1.67.0`
