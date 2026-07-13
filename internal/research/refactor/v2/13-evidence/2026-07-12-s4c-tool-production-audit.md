# S4c Tool Production Audit

> date: 2026-07-12
> scope: read-only production caller audit
> next slice: S4c-tool-production-wiring

## Production Caller Evidence

- `RuntimeTool`, `ToolCall` and `ToolLifecycleEmitter` are currently referenced only by S4a contract tests.
- `agent-runtime/src/provider_turn.rs::execute_calls` emits `CurrentProviderTurnEvent::ToolStart`, calls `RuntimeToolExecutorHandle::execute` directly, then emits `CurrentProviderTurnEvent::ToolEnd`.
- `agent/src/current_provider_turn.rs::handle_provider_event` converts those manual events to legacy `AgentEvent::ToolStart/ToolEnd`.
- `app-server/src/runtime_backend/tool_events.rs` converts the legacy Agent event pair to raw `tool.started`, `tool.result` or `tool.failed` events.

The model-visible definitions are already `RuntimeToolDefinition`, and the executor is already a `RuntimeToolExecutorHandle`; the missing production step is binding them through S4a `RuntimeTool` and creating a stable `ToolCall`.

## Codex Owner Pattern

Codex keeps tool invocation identity, executor dispatch and lifecycle emission in the tool runtime path (`core/src/tools/context.rs`, `tools/registry.rs`, `tools/events.rs`). App Server consumes typed begin/end items; it does not manufacture a second tool lifecycle from terminal text.

## First Cut

`S4c-tool-production-wiring` is intentionally limited to:

- `agent-runtime/src/provider_turn.rs`
- `agent/src/current_provider_turn.rs`

It must make S4a the production execution owner while preserving the existing App Server wire boundary for one short follow-up. This keeps the slice disjoint from active S4b protocol/materializer files.

## Mandatory Exit

The remaining `AgentEvent::ToolStart/ToolEnd` path is `deprecated`, not a compat owner. S4d must migrate the host emitter and the workspace-patch orchestrator consumer to S4b canonical Tool Item, then delete:

- manual/legacy Agent tool start/end variants and constructors;
- `agent_tools/tool_lifecycle` event conversion;
- App Server raw tool event mapping and positive tests.

S4 cannot be marked production complete until S4d deletion and runtime fixture evidence pass.
