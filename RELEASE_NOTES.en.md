## Lime v1.96.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the current approval HITL path for the Agent / Claw workspace, including App Server action replay / respond protocol, approval cache, input-bar approval prompts, approval record cards, trace attribution, and GUI fixtures.
- Added Codex-first ToolSearch, MCP resource, Skill execution, gateway bridge, native overlay, and live execution process modules so Rust runtime, App Server backend, and frontend tool display share the same current owner.
- Expanded Agent runtime projection coverage for context compaction, dynamic tool calls, live tail commits, MCP elicitation / inventory / resource reads, multi-agent visual snapshots, thread fork / rollback / resume, and token usage replay.
- Continued converging media reference previews, resize / reflow, coding activity evidence, session media refs, and artifact snapshot projection onto the App Server read-model and evidence chain.

### Fixes

- Fixed Agent / Claw terminal read-model, tail recovery, stop / continue, session hydrate, input-bar scene restoration, and timeline merge boundaries so stale events are less likely to stop newer streams or restore incorrect UI state.
- Fixed App Server event store, read model, turn execution, permission preflight, action response, and external backend protocol drift, including action-required / replay schemas and client types.
- Fixed MCP current smoke, Electron fixture build, workspace plugin runtime fixture, and split script assertions around path handling, build state, and evidence collection.
- Fixed Soul style profile, settings, video workspace tips, tooltip, and HelpTip presentation edges, while removing the old sound context and default audio asset dependency.

### Improvements and Refactors

- Removed Aster vendor / Lime agent LSP, legacy web retrieval, old native tools, and old tool-search implementations, moving retained capability into current App Server / tool-runtime owners.
- Split `tool-runtime` extension, executor, IO, skill gate, MCP resource, skill execute / result, and live execution process modules to keep central files from continuing to grow.
- Split App Server runtime evidence provider, session media reader, permission preflight, runtime backend native tools, and workflow control so domain modules own their state and projection logic.
- Continued separating frontend HarnessStatusPanel, tool inventory, timeline conversion, message projection, workspace trace, task center, media preview, and input-bar runtime into view-model and helper layers.
- Updated five-locale i18n resources for new Agent, input-bar, message-list, and settings presentation copy.

### Tests and Quality

- Added and updated regressions for approval flow, tool inventory, ToolSearch, timeline projection, media preview, task center, workspace trace, terminal read model, tail recovery, and App Server event streams.
- Added Rust targeted tests for permission preflight, external event sequence, tool lifecycle, objectives, coding evidence snapshots, tool orchestrator cancellation, runtime backend tool inventory, and Skill runtime enablement.
- Expanded Claw current fixtures for approval, resize / reflow, live tail, runtime surface, scenario assertions, and read-model evidence to strengthen GUI release coverage.
- Updated App Server protocol schemas, generated TypeScript types, client contracts, command catalog, legacy boundary guards, MCP smoke, and Electron current entrypoint checks.

### Documentation

- Added the approval roadmap and HITL decision model execution plan.
- Updated Aster capability intake, refactor v1 impact audit, Clawstream Codex-derived guardrails, Soul style output, MCP modernization, plan runtime, and test scenario ledger / registry materials.
- Updated command boundary, Playwright E2E, script governance, and execution-plan index materials with current runtime and GUI validation guidance.

### Other

- Bumped version facts to `1.96.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/vendor/aster-rust/Cargo.lock`, and release notes.

**Full changes**: `v1.95.0` -> `v1.96.0`
