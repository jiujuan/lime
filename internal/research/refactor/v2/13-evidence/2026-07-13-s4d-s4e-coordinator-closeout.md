# S4d/S4e coordinator closeout

> date: 2026-07-13
> status: completed / coordinator-validated

## S4d Tool wire

Current production execution is owned by `RuntimeTool`, typed `ToolCall`,
`ToolLifecycleEmitter` and normalized output. Live App Server lifecycle uses canonical
`item.started/updated/completed`; the old agent lifecycle/orchestrator, workspace-patch adapter,
ToolStart/ToolEnd wire and zero-consumer tool batch owner are deleted and covered by
forbidden-to-restore guards.

Focused evidence records workspace-patch identity `8/8` and canonical lifecycle/sequence guards
passing. The separate S4h closeout proves live `tool.args` synthesis is also removed.

## S4e durable consumers

Provider history, output references and `thread_read.tool_calls` consume typed canonical Tool
Items. Imported raw read fallback, synthetic Item creation, legacy merge/ID normalization and
conflict diagnostics are removed. Focused provider history `3/3` and read-model `27/27` passed.

Conversation import production lowering is not hidden in S4e: it is the separately active
`S4i-conversation-import-tool-items` slice and owns the remaining import-only raw intermediate.

## Current-tree verification

- `npm run test:contracts`: passed; App Server client `290 checks`.
- S4d and S4e coordination locks are released without deleting their lock directories.

## Governance

- `current`: RuntimeTool execution, canonical Tool Item lifecycle and typed durable consumers.
- `compat`: conversation import source-local intermediate only, owned by S4i until cutover.
- `deprecated`: none retained by S4d/S4e.
- `dead / deleted / forbidden-to-restore`: raw live Tool wire, legacy tool lifecycle/orchestrator,
  workspace-patch adapter, tool batch owner and imported raw read fallback.
