## Lime v1.110.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Improved current Agent runtime Thread/Turn/Item projection, history recovery, fork handling, and tool-turn snapshots around one canonical history and read model.
- Added App Server v2 reasoning summary/text-delta notifications with schema and frontend projection support.
- Extended image/video task routing and provider lowering for credential-aware, protocol-explicit, multimodal requests and events.

### Fixes

- Fixed duplicate, missing, and out-of-order provider stream, reasoning, MCP, and tool events across runtime, read model, and GUI projections.
- Fixed lost credential and protocol context between scoped model metadata, route resolution, media workers, and plugin workers.
- Fixed Electron/App Server boundary, history merge, projection rebuild, and cold-start inconsistencies, and removed temporary production logging.

### Improvements and Refactors

- Removed managed-objective, retired media-task, and legacy session/objective production protocols, schemas, services, and test entrypoints in favor of current owners.
- Moved App Server, Agent runtime, and plugin-runtime server-request/approval responses to typed contracts, reducing metadata waiter and compatibility branches.
- Centralized MCP environment identity, auth scopes, step snapshots, and elicitation provenance under one stdio launcher/process owner.
- Cleaned legacy catalogs, scripts, and documentation entrypoints while updating governance baselines, generated protocol artifacts, and five-language GUI contracts.

### Tests and Quality

- Expanded unit, integration, and smoke coverage for Agent runtime, App Server JSON-RPC, provider/media routes, MCP lifecycle, projections, and plugin contracts.
- Updated v2 schemas, generated types, client gateways, Electron boundaries, and legacy/governance guards for reasoning, snapshots, credentials, and multimodal events.

### Documentation

- Updated architecture, runtime convergence, protocol boundaries, governance, and execution plans with current/compat/dead owner changes.

### Other

- Bumped version facts to `1.110.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.109.0` -> `v1.110.0`
