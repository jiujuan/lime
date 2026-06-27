## Lime v1.81.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Claw Trace moved onto the current path with renderer / App Server / provider checkpoints, W3C trace-context carriers, a summary-only raw trace JSONL store, Trace list / read / export diagnostics APIs, and Developer & Labs controls for enabling Trace, copying lists, reading the latest Trace, and exporting it.
- Support bundles can now explicitly attach a single summary-only Trace export. Default support bundles still include only trimmed summaries and do not write prompt text, provider payloads, assistant deltas, or raw sensitive content.
- App Server JSON-RPC and `@limecloud/app-server-client` now include `diagnostics/trace/list`, `diagnostics/trace/read`, `diagnostics/trace/export`, support-bundle trace selection params, and the matching schemas / generated types / client methods.
- Plugin Marketplace productization continued with history-session candidate selection, refresh, exact session opening, runtime authorization contracts, renderer output contracts, history restore, and installed-state view-model improvements.
- Content Factory / Product Profile Right Surface worker turns now support pane-action metadata, including action intent, risk, source artifacts, output artifact kind, and authorization fail-closed behavior.
- Claw / Agent UI performance metrics can now connect provider wait, App Server emit, renderer receive, text apply, render flush, and first paint into one trace summary for first-token latency diagnosis.
- execution process and MCP tool-log metadata now flow through the current event projection with process id, output sequence, stdin writability, and lifecycle phase.

### Fixes

- Fixed first-token latency attribution so provider/API wait and Lime local rendering/output phases are projected separately.
- Fixed metadata-only MCP process lifecycle logs being rendered as visible JSON tool output; these events now keep structured metadata without polluting the transcript.
- Fixed Plugin Marketplace history actions opening only a generic Agent view; the detail panel now opens the selected historical session candidate.
- Fixed pane-action workers without a valid runtime contract being treated as ordinary worker runs; invalid requests now fail closed with a configuration failure.
- Fixed invalid W3C `traceparent` values being eligible for remote-parent propagation. Invalid carriers now preserve Lime trace identity but are not inherited by OTEL spans.

### Improvements and Refactors

- Split Trace storage into append-only events, summary projection, export zip, and support-bundle attachment modules while keeping diagnostics reads on the current App Server processor / local data-source path.
- App Server request spans now initialize OTEL and handle remote parents, allowing `agentSession/turn/start` to record safe session / turn / trace attributes.
- Expanded `packages/app-server-client` request and connection method tables across the current protocol surface to reduce manually missed client methods.
- Continued separating Agent Chat streaming into trace metadata, text delta, render flush, and runtime metrics controllers instead of mixing state-machine, performance, and render side effects in one hook.
- Split Product Profile / plugin Right Surface rendering into image cells, renderer-host models, pane actions, and renderer-output projections so UI code stays decoupled from worker contracts.

### Tests and Quality

- Added and expanded Trace regressions across Rust and frontend code: trace store list/read/export, request trace spans, W3C carriers, Developer Claw Trace panel, trace timeline, and serverRuntime diagnostics APIs.
- Added and expanded App Server protocol / client contract tests for diagnostics trace methods, support-bundle trace export selection, execution process drain output, and generated protocol types.
- Added and expanded Claw streaming regressions for agent message content sync, runtime metrics controller, text delta controller, render flush controller, prepared send env, performance metrics, and history merge.
- Added and expanded Plugin Marketplace productization tests for manifest contracts, runtime authorization, renderer output, history session selection, marketplace actions / loader / registry hook, and the Marketplace page.
- Added a cross-repository plugin E2E evidence pack with a `plugin-productization-e2e` real Electron fixture summary covering current bridge usage, App Server JSON-RPC, local installed state, worker dogfood, Right Surface, artifact read, and remote-run fail-closed behavior.
- Updated five-locale i18n resources for new visible copy in Trace, Developer settings, Plugin, Workspace, and Agent surfaces.
- Updated release version facts to `1.81.0` across the root app, CLI npm package, App Server client package, Rust workspace, main Cargo lock, and the Aster sub-workspace lock. This repository currently has no `package-lock.json` / `pnpm-lock.yaml`, so no npm lockfile was added.

### Documentation

- Added the `internal/roadmap/trace/` documentation set for the Trace PRD, architecture, diagrams, code map, and staged implementation plan.
- Added `internal/exec-plans/claw-trace-system-implementation-plan.md`, tracking Claw Trace from skeleton work through provider phase, Developer UI, raw trace store, and OTEL exporter stages.
- Added the plugin cross-repository E2E evidence pack and user / operations guide, documenting Marketplace consumption, installed-state reports, explicit activation, Right Surface behavior, history restore, and fail-closed boundaries.
- Updated coding / plugin roadmaps and implementation plans with this round of Trace, plugin productization, Content Factory dogfood, and App Server current-path evidence.

### Other

- This release continues converging Claw Trace, Plugin Marketplace, Content Factory pane actions, Product Profile Right Surface, execution process output, and diagnostic support bundles onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current path. Old plugin command families, mock fallback, and parallel runtime entry points are not restored.

**Full changes**: `v1.80.0` -> `v1.81.0`
