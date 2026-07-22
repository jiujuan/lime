## Lime v1.109.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added App Server v2 `thread/fork` with full, turn-scoped, and boundary-scoped canonical Thread/Turn/Item history, including provider-history recovery after restart.
- Added v2 `thread/delete` with atomic subtree cleanup for persisted and pending-only threads, runtime state, goals, mailboxes, traces, telemetry, and projections, followed by `thread/deleted` broadcasts.
- Added terminal Thread Goal continuation, idle wall-time accounting, resume admission, and deferred goal inheritance across forks under one canonical goal owner.
- Added typed reverse server-request responses to the App Server and Agent runtime clients, keyed only by the JSON-RPC outer id.

### Fixes

- Fixed fork-history duplication, loss, and broken lineage across tool calls, MCP, reasoning, context compaction, and cold restart; histories that cannot be represented losslessly continue to fail closed.
- Fixed cross-credential provider model-cache reuse and route reselection after resolved credential identity was lost in host-managed, image, and plugin-worker paths.
- Fixed provider protocol inference from names. Current clients now require an explicit route protocol and return a non-retryable configuration error when it is missing.
- Fixed MCP stdio processes inheriting sensitive host environment state, silently extended startup deadlines, and leaked process trees during shutdown on macOS and Windows.
- Removed temporary Claw empty-layout debug logging that produced console noise during normal empty states.

### Improvements and Refactors

- Removed the production `agentSession/delete` protocol, schemas, dispatch, and client entries; v2 `thread/delete` is now the sole thread-deletion path.
- Migrated plugin-runtime approval, AskUser, and MCP elicitation responses to typed reverse-request responders instead of waiter lookup through action metadata.
- Added explicit MCP environment identity, auth scopes, step-snapshot generation, and elicitation provenance, with one local stdio launcher/process owner.
- Converged provider history, Goal continuation, fork seeds, projection repair, and compaction prompt boundaries on canonical Thread/Turn/Item facts without copying raw EventLog history.
- Reused credential-scoped model metadata in Plugin worker turns and moved application metadata into typed additional context.

### Tests and Quality

- Expanded unit, integration, and public JSON-RPC coverage for Thread Goals, public fork/delete, AgentControl fork, compaction lineage, provider cache/routes, typed reverse requests, and MCP lifecycle/provenance.
- Updated v2 schemas, generated types, package clients, Renderer gateways, and contract/legacy guards to prevent retired session-delete and metadata-routed action-response paths from returning.
- Passed the Content Factory Plugin worker scoped-model-cache Gate B through real Electron, current App Server JSON-RPC, RuntimeCore, provider metadata, and Article Editor projection.

### Documentation

- Updated architecture, Codex alignment coordination, Writing v2 verification evidence, and the release execution plan.

### Other

- Bumped version facts to `1.109.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.108.0` -> `v1.109.0`
