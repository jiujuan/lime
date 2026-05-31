## Lime v1.55.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added a more durable Agent Chat action-required resume path, preserving submitted, queued, and replayed confirmation state while reconnecting fallback requests to real runtime actions.
- Added layered frontend test entry points: `test:unit`, `test:component`, `test:contract`, `test:integration`, `test:e2e`, `test:layers:stats`, and `test:frontend:all`.

### Fixes

- Fixed state boundaries around session switching, session restore, metadata sync, post-finalize persistence, and snapshot sync to reduce lost state and duplicate scheduling during Agent Chat recovery.
- Fixed fallback action response and replayed action-required mapping edges so user confirmations are not dropped and can continue into the runtime submit path.
- Fixed live Provider smoke test detection to support `*.live.test.*`, `*.live.spec.*`, and common separator variants.

### Improvements And Refactors

- Moved Agent Chat page shell, workspace shell, auto title, session restore, session topic, and Harness status panel display decisions into View Models, reducing state coupling inside large React components and hooks.
- Simplified inline state logic in `useAgentSession`, `useAgentTools`, and `useAsterAgentChat`, making restore, switch, submit, and finalize paths easier to verify directly.
- Removed the old `benchmarks/lime-agent-runtime` task sample so deprecated benchmark surfaces are no longer confused with current Agent runtime release evidence.

### Tests And Quality

- Added the Vitest layer classifier, layer runner, and layer stats report with unit coverage.
- Added unit regressions for multiple Agent Chat View Models and action state flows, covering workspace shell state, auto title, session restore, session topic, Harness status panel, and fallback actions.
- Updated quality workflow and unit-test documentation to define the TDD fast path and its boundary with GUI smoke / full frontend validation.
- Release gates cover version consistency, layered frontend regressions, contract checks, GUI smoke, and the release tag workflow.

### Documentation

- Added `internal/roadmap/test/README.md` for the frontend test-layer governance roadmap and migration rules.
- Updated `internal/aiprompts/quality-workflow.md` and `internal/test/unit-tests.md` so test layers are first-class quality workflow entry points.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, and lockfile versions to `1.55.0`.

**Full changes**: `v1.54.0` -> `v1.55.0`
