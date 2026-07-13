# S4d Tool Wire Delete Audit

> date: 2026-07-12
> canonical slice: `S4d-tool-wire-delete`
> mode: read-only audit
> status: active / awaiting explicit delete confirmation

## Current Owner

The production tool owner is `tool-runtime::{RuntimeTool, ToolCall,
ToolLifecycleEmitter, NormalizedToolOutput}`. Display truth is the canonical
`ThreadItemPayload::{Tool, McpToolCall, CollabAgentToolCall}` contract.

`AgentEvent::ToolStart/ToolEnd`, the old agent tool lifecycle/orchestrator,
workspace-patch adapter and App Server raw mapper are deprecated. S4d must make
them `dead / deleted / forbidden-to-restore`; it must not introduce compat.

## Required Cutover

1. Materialize nested canonical Item payloads without losing tool identity,
   output, structured content, duration, truncation or sidecar reference.
2. Emit canonical Item started/completed from the current provider host boundary.
3. Migrate App Server lifecycle validation from only `tool.*` to canonical Tool
   `item.started/updated/completed`; non-Tool Item families remain no-op.
4. Move workspace patch directly onto RuntimeTool and preserve request
   session/thread/turn identity and evidence metadata.
5. Migrate coding, artifact and process consumers, then delete raw ToolStart/End,
   the old orchestrator/emitter and any zero-consumer tool batch owner.
6. Replace positive legacy contract assertions with forbidden-to-restore guards.

## Coordination

S1g released `app-server/src/runtime/event_store.rs`; S2f also completed and the
home-hotpath Gate B evidence passes. The older S3d claim that listed
`runtime_backend/tool_events.rs` is closed by the repository's stale-recovered
and released S3d handoffs. S4d is now claimed by the coordinator. Physical
source deletion remains paused until the user explicitly confirms the hazardous
operation. GUI raw consumer deletion remains S5 work after canonical Item
production is proven.

## Codex Provenance

- `codex-rs/tools/src/{tool_call,tool_executor}.rs`
- `codex-rs/core/src/tools/{router,parallel,events}.rs`
- `codex-rs/protocol/src/items.rs`
- `codex-rs/core/src/event_mapping.rs`
- `codex-rs/app-server-protocol/src/protocol/event_mapping.rs`

The reusable rule is typed Item lifecycle from the tool boundary to App Server;
Lime adapts the consumer to React GUI and does not copy Codex TUI rendering.
