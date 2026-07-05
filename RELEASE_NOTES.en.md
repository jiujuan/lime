## Lime v1.92.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added a shared model capability and send-policy fact source covering context windows, input modalities, native tools, tool calls, reasoning, responses, truncation, Prompt Cache, and send gates across the model picker and App Server protocol.
- Added App Server `pluginLocalPackage/export`, plus plugin publishing workbench, release review, submission status, and OEM Cloud publishing API surfaces to close the local-to-cloud plugin release loop.
- Added production readiness, preflight, evidence bundle, release evidence, signing verification, cloud evidence fetch, and auditable report scripts for the Content Factory release path.
- Expanded Agent chat projections for actions, artifacts, context, diagnostics, queues, routing, runtime lifecycle, subagent status, thread items, and tool events, including more reliable article workspace artifact opening.

### Fixes

- Fixed Agent Runtime terminal events, terminal turn guard, stream metrics, and user input submission boundaries to reduce stale terminal events, stuck input state, and session recovery mismatches.
- Fixed App Server evidence export request telemetry linkage, thread item message projection, artifact projection, and workflow queue / resume audit output.
- Fixed model capability detection and provider model list boundaries so Prompt Cache, input modality, reasoning, native tool, and truncation support stay consistent across UI, protocol, and runtime.
- Fixed plugin capability host, runtime client API, Plugins page summaries, and Content Factory SDK regressions to keep publishing checks aligned with App Center presentation.

### Improvements and Refactors

- Added the current `tool-runtime` crate and moved shell / PowerShell execution, path guarding, command semantics, subprocess handling, Web Search / Web Fetch, and tool extensions out of vendor Aster residuals.
- Split `agent-runtime` and `lime-agent` reply handling, session config, recent settings, runtime payload, model request policy, and session execution runtime modules so central files only dispatch.
- Regenerated App Server protocol and npm client surfaces for model capability fields, plugin local package export schemas, and request methods, while removing the obsolete `ResolvedModelRoute` schema shape.
- Continued retiring old Tauri wrapper / Aster cleanup artifacts and vendor tool implementations, including obsolete cleanup queues and inventory documents.

### Tests and Quality

- Added model strategy and capability governance tests covering Codex / OpenCode policy origins and current boundaries for model execution, native tools, responses, reasoning, truncation, picker, and modality.
- Added regressions for Agent UI projections, runtime export, projection units, terminal turn guard, artifact opening, App Server event stream / evidence export / thread client / model registry, and plugin publishing APIs.
- Updated App Server protocol schema fixtures, generated TypeScript protocol types, App Server client contract checks, harness contracts, and current entrypoint guards.
- Added Content Factory production readiness, preflight, release evidence, signature verifier, workflow evidence, turn-start trace, and signed release gate tests.

### Documentation

- Updated Writing v2, Content Factory plugin reframing, product requirements, Aster migration, and long-term governance roadmaps around plugin publishing, production evidence, model capability policy, and Aster residual retirement.
- Added Aster capability intake strategy / execution plans, long-term governance notes, and plugin publishing center PRD / server plan.

### Other

- Bumped version facts to `1.92.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/vendor/aster-rust/Cargo.lock`, and the current-turn smoke client.

**Full changes**: `v1.91.0` -> `v1.92.0`
