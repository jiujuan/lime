## Lime v1.79.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Browser Runtime and the Right Surface browser workspace moved onto the current path: App Server `browserSession/*` protocol methods, Electron embedded browser hosting, canvas browser panels, Right Surface browser panels, download shelf, context menu, and session state projection were added together.
- Claw workspace now connects browser assist with product-profile work: browser sessions, product profile artifact documents, worker evidence, document versions, and save evidence can flow through the same Workspace / Evidence Pack path.
- Agent App install and launch flows gained release evidence: cloud release evidence, release signatures, readiness issue classification, launch target controls / persistence, and Agent App task worker wiring.
- App Server protocol and the npm client now cover browser sessions, runtime event append, Agent App host lifecycle snapshot/list responses, and UI runtime status shapes, with Rust schemas and TypeScript protocol types regenerated.
- Claw streaming rendering now has structured content timelines, web retrieval process projection, text delta lifecycle handling, and content part ordering so reasoning, tools, web search, and final answers render more consistently across live streaming and history restore.

### Fixes

- Fixed missing traceable session references between browser assist and Right Surface. Workspace now drives the right-side browser surface through browser session refs, intents, control modes, and runtime navigation.
- Fixed Agent App cloud installs showing entry points without release trust context. Install review can now surface signatures, release evidence, and readiness issues.
- Fixed ordering drift between WebSearch / WebFetch, reasoning, and final answer content across streaming and hydration by relying on structured sequence / provenance instead of display-text regexes.
- Fixed artifact document save evidence missing auditable document versions by adding artifact document versions and product profile artifact document projection in App Server runtime.
- Fixed the Browser Runtime manager growing into a single responsibility hotspot by splitting session lifecycle, target reading, event streams, and evidence output into focused modules.

### Improvements and Refactors

- Split `lime-rs/crates/agent/src/request_tool_policy.rs` into auto compaction, runtime status, stream diagnostics, stream idle, text batching, web search preflight / tracker, and web retrieval process modules; the root file now keeps only dispatch boundaries.
- Split the Browser Runtime manager into CDP targets, session, session events, session lifecycle, session reader, and session stream modules to reduce ownership and testing load.
- Added App Server runtime modules for browser session processing/runtime, browser evidence provider, product workspace/profile projection, and artifact document projection, continuing the move of GUI evidence into the App Server current owner.
- Continued extracting Agent Chat frontend behavior into testable modules for history merge, content part timeline, stream completion, text delta lifecycle, Right Surface runtime projection, browser assist control, and product profile models.
- Continued modularizing Claw current fixture scripts with product profile content factory, browser/right-surface visual checks, web tool waits, scenario assertions, and code artifact workbench fixture support.

### Tests and Quality

- Added and expanded regressions for Browser Runtime API, embedded browser host, browser session protocol, browser panels, Right Surface browser panels, browser assist control, browser runtime navigation, and workspace browser session refs.
- Added and expanded Agent App tests for release evidence, release signatures, readiness issue classification, launch target persistence, Agent Apps page view models, cloud bootstrap, and install review.
- Added and expanded streaming regressions for content part ordering, projection guards, text delta lifecycle, content timelines, web retrieval projection, MessageList reasoning flow / persistence, and stream runtime handling.
- Expanded App Server protocol catalog, generated schemas, app-server-client request methods, contract guards, and release manifest checks.
- Updated five-locale i18n resources for new visible copy in Agent, Agent Runtime, and Workspace namespaces.
- Updated release version facts to `1.79.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and the Aster sub-workspace lock.

### Documentation

- Added the Claw streaming rendering correctness document to lock down content part provenance, lifecycle, and tool / reasoning / final answer ordering boundaries.
- Added traceable agent acceptance methodology and paper drafts to document the evidence model for acceptance.
- Added Browser Runtime / Right Surface execution planning and the browser roadmap for browser sessions, Right Surface integration, Evidence Pack, and validation gates.
- Updated the quality workflow, execution plan index, Agent App Host v3 implementation plan, and scripts directory notes so the release candidate remains traceable.

### Other

- This release continues converging browser assist, Agent App release evidence, Claw streaming display, product-profile workspace, and Evidence Pack onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current path. Old mock fallback, parallel renderer event drains, and unstructured display-text inference are not sources for new capabilities.

**Full changes**: `v1.78.0` -> `v1.79.0`
