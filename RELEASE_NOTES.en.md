## Lime v1.57.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Agent run completion now prefers the final answer text from the timeline when materializing artifacts, memory capture, and file checkpoints, avoiding intermediate reasoning or streaming fragments being persisted as final output.
- Expanded Agent workspace presentation and replay boundaries for file changes, tool processes, internal image placeholders, artifact generation briefs, runtime attachments, and message phases.
- Memory settings and runtime metadata now have clearer file checkpoint, memory profile, and artifact request metadata paths, giving future replayable runs a more stable source of truth.
- Added Rust test-layer commands: `test:rust:unit`, `test:rust:integration`, `test:rust:e2e`, and `test:rust:layers:stats`, aligning backend TDD with the frontend layered test workflow.

### Fixes

- Fixed normalization for final Agent messages, thinking text, tool batches, and search result previews so internal process text, empty fragments, and provider error details are less likely to leak into user-visible messages.
- Fixed Markdown and streaming renderer boundaries for code blocks, placeholder content, and ongoing output states, improving long replies and tool output rendering.
- Fixed state assembly boundaries in Workspace send actions, chat history, task-center tabs, and Agent runtime error presentation to reduce stale-state display issues.
- Fixed regression-covered behavior around expert bindings, memory APIs, artifact protocol, and OEM cloud access.

### Improvements And Refactors

- Continued moving complex UI logic from Agent Chat, App Sidebar, Skills Workspace, Agent Apps, Resource Manager, Settings, and Provider panels into View Models / projections / selectors / helpers.
- Split large component suites by behavior while keeping real React DOM / hook / mock wiring coverage, and moved pure logic into `*.unit.test.ts` where appropriate.
- Simplified responsibility boundaries in Agent workspace, Empty State, General Workbench, Chat Sidebar, File Manager, Curated Task Launcher, and API Key Provider components.
- Updated test-layer governance docs and roadmap entries for frontend and Rust layer commands, candidate statistics, and GUI / Bridge risk rules.

### Tests And Quality

- Added or split regression coverage across Agent workspace, Skills, Agent Apps, Resource Manager, Settings, Browser runtime, Capability Drafts, and App Sidebar without dropping user-visible behavior coverage.
- Added Rust test-layer runners, classifier, and statistics scripts, and wired the commands into root scripts, quality docs, and the Agent guide.
- Strengthened the Vitest layer classifier and unit/component/contract regressions while continuing to reduce oversized component test files.
- Added unit and targeted regressions for Agent runtime final text, request metadata, session execution runtime, message sanitizer, file changes undo, and artifact generation brief metadata.

### Documentation

- Updated `AGENTS.md`, `internal/aiprompts/quality-workflow.md`, and `internal/roadmap/test/README.md` with Rust test-layer entries and frontend test-layer governance progress.
- Added `internal/roadmap/soul/` planning docs for Soul configuration, including PRD, architecture, acceptance criteria, diagrams, and rollout plan.

### Other

- Updated the root app, Tauri workspace, Tauri config, CLI npm package, Agent App runtime package, and lockfiles to `1.57.0`.

**Full changes**: `v1.56.0` -> `v1.57.0`
