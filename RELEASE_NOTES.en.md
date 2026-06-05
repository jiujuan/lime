## Lime v1.59.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the local App Server JSON-RPC runtime skeleton, giving Lime Desktop and independent apps a shared protocol boundary for Agent sessions, turns, events, actions, artifacts, and evidence.
- Added the App Server TypeScript client so independent apps can use typed connections to start sessions, submit turns, cancel turns, respond to actions, and consume `agentSession/event` notifications.
- Added App Server sidecar lifecycle support, including packaged resources manifests, platform artifact resolution, sha256 verification, initialize handshake, and event routing.
- Added the standalone App Server app policy source so independent apps can inject scoped capabilities from a JSON policy manifest and constrain capability discovery with `--app-policy`.
- Added the standalone external backend configuration path, allowing App Server to prototype host-independent turn, cancel, and action-response handling through an external backend process.
- Started routing the Desktop Agent runtime main path through an in-process App Server adapter, allowing Electron Desktop Host entry points to submit Agent turns through JSON-RPC.
- Added `capability/list`, `artifact/read`, `evidence/export`, and `agentSession/action/respond` protocol surfaces for capability discovery, artifact reading, evidence export, and approval responses from independent apps.

### Fixes

- Fixed App Server turn id, `queueIfBusy`, `skipPreSubmitResume`, and legacy Aster request parameter propagation, reducing migration risk around lost runtime options or mismatched ids.
- Fixed Desktop direct event bridge scoping and terminal-event cleanup so session / turn events are less likely to be duplicated or leave stale listeners behind.
- Fixed capability discovery filtering across session, workspace, and runtime-enable facts so only executable capabilities are projected into `agentSession/turn/start`.
- Fixed artifact read and evidence export read-model boundaries around pagination, content status, and provider injection so independent apps can read runtime output without relying on UI inference.

### Improvements And Refactors

- Split Agent runtime service boundaries into `RuntimeCore`, `ExecutionBackend`, `AsterBackend`, and host adapters, reducing business logic growth inside desktop host glue.
- Added the `app-server-protocol`, `app-server-transport`, `app-server`, `app-server-client`, `app-server-daemon`, and `app-server-test-client` crate family to separate protocol, transport, server, client, and test boundaries.
- Moved runtime queue, stream, projection, managed objective continuation, and event emission behind host ports so App Server and Desktop can share the same execution path.
- Consolidated Desktop host dependencies for runtime turns into `RuntimeTurnHostContext`, reducing scattered AppHandle, database, config, and service-state parameter passing.
- Kept the public `app-server` crate independent from desktop host shell internals and prevented Aster-private DTOs from becoming part of the public JSON-RPC protocol.

### Tests And Quality

- Added App Server client / protocol contract checks to `npm run test:contracts`, covering key Rust protocol, router, runtime, Desktop adapter, TypeScript client, and sidecar helper consistency.
- Added `app-server:manifest` and `app-server:manifest:test` for generating and validating App Server sidecar release manifests.
- Added `smoke:app-server-stdio` to verify the app-server binary over stdio JSON-RPC initialize, session, and turn flows.
- Added `smoke:app-server-sidecar-lifecycle` to cover packaged manifests, sha256 verification, sidecar startup, connection, and lifecycle recovery.
- Added Rust regressions for app policy manifests, external backends, standalone CLI arguments, and factory injection.
- Added App Server Rust tests, a host boundary guard, TypeScript client tests, and renderer-safe API regressions.
- Updated the root app, Electron config, Rust workspace, CLI npm package, Agent App runtime package, App Server client package, and lockfiles to `1.59.0`.

### Documentation

- Added the `internal/roadmap/appserver/` roadmap set, including PRD, architecture, protocol, sequences, flowcharts, service extraction, independent app integration, and Electron migration planning.
- Added the App Server implementation plan with P0 through P3.61 status, fact-source classification, validation entries, and remaining exit criteria.
- Added `packages/app-server-client/README.md` with the recommended independent-app integration shape for the TypeScript client and sidecar.
- Updated engineering navigation, command boundary, governance, and services docs to converge cross-app Agent runtime work onto the App Server current path.

### Other

- Added App Server release-manifest generation and packaged sidecar resource-path conventions for future independent-app distribution of the App Server binary.

**Full changes**: `v1.58.0` -> `v1.59.0`
