## Lime v1.97.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added Agent Runtime provider source backend, response event materialization, tool input delta projection, and reasoning delta projection so provider streaming can feed the current timeline / read model more directly.
- Added the App Server / protocol `voiceTranscription/polishText` path and connected it to frontend voice input for live transcription preview and final text polishing.
- Extended the Agent / Claw workspace with task-center home hot paths, plan confirmation, approval input-bar priority, image-workbench send routing, and guarded session-file auto initialization.
- Added version-level benchmark release gate scripts and manifest support for context, checklist, P1 dry-run / preflight, summary, baseline, and strict-gate evidence.

### Fixes

- Fixed provider tail idle handling so an existing plain-text output can complete instead of being reported as a failed empty response.
- Fixed Electron App Server sidecar runtime-library environment propagation on macOS / Linux / Windows and added main-window media permission handling.
- Fixed history session hydration, thread item projection, reasoning content sync, input-bar send, task-center draft, and workspace initial-navigation state boundaries.
- Fixed model selector auto-switching when models are not loaded or when the current model is unknown, avoiding unnecessary replacement of still-valid user selections.

### Improvements and Refactors

- Physically removed `lime-rs/vendor/aster-rust`, moved the remaining Aster-shaped adapters into the temporary `crates/agent-compat` owner, and tightened the related governance guards.
- Split provider trace, reply backend, reply loop, tool lifecycle, approval decision contract, projection store, and voice text processing into clearer runtime domain boundaries.
- Removed the legacy browser workspace home hint, old `StreamingWriteFileCard`, old text normalization helpers, and several legacy tool-display copy branches.
- Improved voice-input sampling, live transcription merging, CJK spacing, image-generation preference refresh, and resource-manager search / toolbar presentation.

### Tests and Quality

- Added and updated regressions for provider stream idle, reply source backend, response materializer, approval decision, permission preflight, session hydration projection, voice polish, and Electron media permissions.
- Expanded Claw current fixtures, session history fixture, code artifact workbench fixture, benchmark runner, and app-server asset / sidecar script tests.
- Updated App Server protocol schemas, generated TypeScript types, client methods, command policy guards, Aster migration boundary tests, and script governance checks.
- The benchmark release gate still fails closed: P1 Terminal-Bench / DeepSWE true-run depends on Docker / runner availability and is not yet a formal release pass signal.

### Documentation

- Added and updated Aster Phase 6 provider reply backend, migration closure, dead-code deletion, benchmark release, approval HITL, and Clawstream guardrail plans.
- Updated Aster migration, governance, execution-plan indexes, benchmark dataset / progress / version-test-plan materials, and test scenario ledger / registry files.

### Other

- Bumped version facts to `1.97.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and release notes.

**Full changes**: `v1.96.0` -> `v1.97.0`
