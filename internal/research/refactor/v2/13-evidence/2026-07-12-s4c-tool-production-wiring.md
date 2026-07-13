# S4c Tool Production Wiring Evidence

> date: 2026-07-12
> slice: S4c-tool-production-wiring
> owner: runtime-tools-production-a -> refactor-v2-coordinator
> upstream basis: codex `5c19155cbd93bfa099016e7487259f61669823ff`

## Current Production Path

```text
RuntimeToolDefinition + RuntimeToolExposure + RuntimeToolExecutorHandle
  -> RuntimeTool::bind
  -> ToolCall(turn_id, call_id, tool_name, arguments, environment)
  -> ToolLifecycleEmitter::started
  -> tool execution
  -> NormalizedToolOutput
  -> ToolLifecycleEmitter::completed
  -> model tool-result transcript + host event projection
```

The current provider no longer calls the executor directly and no longer owns duplicate start/end generation, timing or terminal normalization. Missing canonical `turn_id` fails before provider sampling.

## Output Fidelity

- `structured_content` remains a first-class terminal field.
- `duration_ms`, truncation, sidecar reference and extension metadata survive the temporary host projection.
- Parallel calls retain stable call identity and local environment identity.
- Unknown or failed execution still completes through one normalized lifecycle.

## Ordering Correction

Coordinator review found that two ready channels could otherwise reorder tool-start and approval events. The corrected host loop uses deterministic host-first scheduling and drains queued policy events immediately before ToolEnd. The regression asserts:

```text
ToolStart -> ActionRequired -> ToolEnd
```

## Verification

- `cargo test -p agent-runtime provider_turn`: pass, 4 passed.
- `cargo test -p lime-agent current_provider_turn`: pass, 5 passed.
- `cargo check -p app-server`: pass with six unrelated existing dead-code warnings in active App Server files.
- exact rustfmt and diff checks: pass.
- The first `npm run smoke:agent-runtime-current-fixture` attempt failed before tool execution because a newly created empty session had no canonical Thread; S2f removed that blocker.
- The final controlled Electron rerun completed with `ok = true`, current session start/read/list, completed GUI/read model and `readModelToolCallAligned = true`; no live provider or renderer/App Server mock fallback was used.

## Governance

- `current`: `RuntimeTool`, `ToolCall`, `ToolLifecycleEmitter`, `NormalizedToolOutput` production execution path.
- `deprecated`: `AgentEvent::ToolStart/ToolEnd`, workspace-patch old orchestrator event conversion and App Server raw tool mapper.
- `compat`: none introduced.
- `dead / deleted`: current-provider manual lifecycle variants, direct executor call, duplicate timing and result normalization.

S4d must project the host lifecycle directly to S4b canonical Tool Item, migrate the workspace-patch consumer and physically delete the deprecated wire path. Runtime fixture evidence is now present; S4 remains incomplete until deprecated wire deletion and the remaining control-plane slices.
