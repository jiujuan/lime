## Lime v1.56.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Expanded the Harness status panel with issue evidence packs, handoff bundles, replay cases, review decisions, file review, output signals, tool inventory, and runtime facts so real Agent runs can be preserved as reviewable evidence.
- Converged the Agent input bar onto the unified `react` runtime path, removing the pre-send execution strategy / thinking / web search controls so search, reasoning effort, and tool use are decided by the model from task context.

### Fixes

- Fixed legacy `auto` / `code_orchestrated` execution strategy normalization across the frontend, metadata, and Rust turn context so old strategies no longer leak into current submit payloads.
- Fixed Agent runtime status copy for search, browser, reasoning, and collaboration capability states so the status strip matches the current tool surface and runtime strategy.
- Fixed input bar submit payload boundaries so thinking, web search, and execution strategy fields already owned by the session/runtime are not resubmitted redundantly.

### Improvements And Refactors

- Split the Harness status panel from one large component into dedicated section, shell, primitive, preview dialog, handoff export, tool inventory, file review, and output signal modules.
- Moved more Harness presentation logic into View Models / selectors / helpers, covering file review, diff summaries, output signals, text path parsing, tool inventory, runtime facts, and handoff / evidence / replay / analysis artifacts.
- Simplified state assembly in Workspace, Inputbar, Agent Chat session, auto-title, task-center draft, and submit paths, reducing business coupling inside React components and hooks.

### Tests And Quality

- Strengthened the Vitest layer classifier so explicit low-risk suffixes cannot hide React/jsdom, DevBridge/Tauri, filesystem, network, or Playwright boundaries.
- `test:layers:stats` now reports component unit-migration candidates based on case count, file size, and business-logic keywords.
- Updated local and CI quality policy: PR fast gates focus on `lint`, `typecheck`, `test:unit`, and `test:contract`, while `main` / manual runs keep full frontend, Rust, and GUI smoke coverage.
- Added and updated unit / component / contract regressions for Harness, Inputbar, Workspace, Agent runtime, test layering, and submit protocol paths.

### Documentation

- Updated `AGENTS.md`, `internal/aiprompts/quality-workflow.md`, and `internal/test/unit-tests.md` to require new frontend logic to move first into View Models / projections / selectors / helpers with `*.unit.test.ts` coverage.
- Updated `internal/roadmap/test/README.md` with frontend test-layer governance stats, Harness split progress, and anti-regression rules.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, and lockfile versions to `1.56.0`.

**Full changes**: `v1.55.0` -> `v1.56.0`
