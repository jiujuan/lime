# S4o MCP Control Plane Owner Split

## Fact source

Codex freezes only the model-visible MCP Tool catalog and manager identity for one sampling step.
Resource contents are read live when a resource tool or management request executes; App Server
status is a separate live management query. Prompts have no Codex product owner. Server-originated
elicitation is request/connection scoped and must not be modeled as a sampling-step inventory fact.

Lime therefore keeps two current owners:

- `tool-runtime::McpStepSnapshot`: model-visible tool definitions, caller policy, exact dispatch
  route, immutable connection handle, notification stream, and tool timeout.
- `App Server -> lime-mcp::McpClientManager`: live server status, prompt, resource, template,
  subscription, and direct management tool calls used by the GUI control plane.

## Audit

- `McpConnectionRegistry::dispatch` had no production caller and was caller-unaware. The current
  provider already dispatches exclusively through `McpStepSnapshot`.
- Registry prompt/resource/capability summary methods had no production caller. App Server's
  `local_data_source/mcp.rs` uses `McpClientManager` directly for those management methods.
- `McpConnection` still forced every model bridge and test connection to implement resource,
  prompt, and server-info methods never used by the sampling step.
- `McpBridgeSnapshot.server_info` was only copied into that dead bridge surface; manager status and
  description already own the live initialization facts.
- Codex uses request identity for elicitation and only nullable best-effort Turn correlation. Lime
  does not yet have that reverse JSON-RPC chain, so it remains a separate next slice.

## Changes

- Narrowed `McpConnection` to `list_tools`, `call_tool`, and `subscribe`.
- Removed caller-unaware live registry dispatch, prompt reads, capability summaries, and their
  connection lookup helpers.
- Removed server-info and resource/prompt facts from the runtime bridge snapshot/client/adapter.
- Preserved App Server MCP prompt/resource/status management methods unchanged.
- Added a contract guard that forbids the dead bridge management surface from returning.

## Validation

- `CARGO_TARGET_DIR=/tmp/lime-s4o-target cargo check -p tool-runtime -p lime-mcp -p lime-agent -p app-server`: passed.
- `CARGO_TARGET_DIR=/tmp/lime-s4o-target cargo test -p tool-runtime mcp_connection`: 7 passed.
- `CARGO_TARGET_DIR=/tmp/lime-s4o-target cargo test -p lime-mcp --lib`: 114 passed.
- `CARGO_TARGET_DIR=/tmp/lime-s4o-target cargo test -p lime-agent current_provider_turn`: 10 passed, with no final warning.
- `npm run test:contracts`: passed after the concurrent S4q prompt target guard converged; protocol generation reported 690 v0 types with no drift and the App Server client guard reported 290 checks.
- `npm run governance:legacy-report`: zero reference candidates, zero classification drift, and zero boundary violations.
- Direct `rustfmt --edition 2021 --check` on the seven affected Rust files: passed.
- Scoped `git diff --check`: passed.

This slice does not change Electron, App Server JSON-RPC, generated client, or Renderer wire behavior.
The GUI continues to use the existing live management chain, so an Electron Gate B rerun would not
add evidence for this owner deletion and is not claimed here.

## Classification

- `current`: per-sampling-step MCP Tool snapshot and independent App Server live management read.
- `compat`: none.
- `deprecated`: none retained.
- `dead`: caller-unaware registry dispatch and unused bridge resource/prompt/capability methods.

## Next cut

Implement server-originated MCP elicitation as typed reverse App Server JSON-RPC with a public
request token, exact response routing across connection replacement, and nullable best-effort Turn
correlation. Do not reuse generic action IDs or raw MCP request IDs as cross-connection identity.
