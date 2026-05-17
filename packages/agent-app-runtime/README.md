# @limecloud/agent-app-runtime

`@limecloud/agent-app-runtime` is the browser-side SDK surface for Lime Agent Apps.
It lets an Agent App call the Lime Host Bridge instead of rebuilding Lime AgentRuntime,
capability adapters, task orchestration, or AgentUI projection logic inside each app.

## Public surfaces

- `@limecloud/agent-app-runtime`: Host Bridge protocol, capability adapters, task contract helpers, mock host utilities, and projection helpers for static import-map Apps.
- `@limecloud/agent-app-runtime/transport`: Host Bridge transport client.
- `@limecloud/agent-app-runtime/adapters`: Lime core capability adapters.
- `@limecloud/agent-app-runtime/projection`: Dedicated headless AgentUI projection subpath for bundlers or Node consumers.

## Projection contract

`/projection` converts Lime Agent App task events, runtime process timelines, and
AgentUI-compatible events into a view model. Apps can either render that view model
themselves, call `renderLimeAgentRunProjectionStateHtml(...)` for a stable default
HTML surface, or call `mountLimeAgentRunProjectionState(...)` to update a DOM-like
target directly:

- thinking / reasoning stream deltas merge into one `reasoning` part per run scope;
- assistant text stream deltas merge into one `text` part per run scope;
- tool args / output deltas group by `toolCallId`;
- terminal runs collapse by default, but the historical process remains in the view model;
- artifacts, evidence, diagnostics, actions, model/cost metrics, and queue status stay as structured parts.
- `includeStyles: true` injects the package default CSS with an optional escaped nonce.

This package must not fabricate business results such as `workspacePatch` or
`contentFactoryWorkspacePatch`. Production materialization remains owned by Lime
AgentRuntime, Skills, ToolRuntime, and Host Bridge evidence/artifact replay.
