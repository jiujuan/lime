## Lime v1.82.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added the Content Factory Writing loop: `@写文章` / `@写作` can route into the seeded Content Factory, create an article-draft artifact card, and open the right-side Product Profile.
- Upgraded the Agent App fixture into a v4 production-style Content Factory with interface metadata, activation entries, workflow, subagents, skill refs, tool refs, runtime package metadata, and a seeded release descriptor.
- Added a Workspace right-surface Trace panel and separated the Product Profile right rail from the object canvas surface.
- Added a Claw Trace regression alert channel, desktop notification toggle, alert export / clear actions, and five-locale copy in Developer settings.
- Split Electron Desktop Host capabilities into current host modules for desktop notifications, file / project shell, Agent App shell, Agent App runtime tasks, system diagnostics, voice models, and layered design exports.

### Fixes

- Fixed seeded Content Factory activation when installed state lacked cloud release evidence; installed state is now migrated on save / read.
- Fixed installed Agent Apps being treated as non-activatable when marketplace package references were absent or hashes needed refresh; they now expose refresh install actions and visible blockers.
- Fixed App Server read-model history loading by supporting `history_limit`, `history_offset`, and `history_before_message_id`.
- Fixed Agent App workers failing closed too aggressively for optional-signature release evidence; only required signature failures now block execution.
- Fixed several Claw Trace dynamic i18n-key paths that could hit fragile TypeScript `5.9.3` overload inference.

### Improvements and Refactors

- Split `electron/hostCommands.ts` into smaller single-responsibility host modules so filesystem, shell, notification, Agent App, and voice-model logic no longer live in one large dispatcher.
- Added projected message window queries to App Server projection store, reducing history-restore dependence on replaying the full event stream.
- Changed request-level web-search policy from `allowed` to `auto`: WebSearch is available by default for model choice, `disabled` closes it, and `required` enforces at least one search.
- Workspace Product Profile can now recover preview objects from message artifacts and connect Content Factory output, the right-side Product Profile, and history restore through one projection model.
- Plugin Marketplace now includes capability profiles, visible blockers, manifest interface projection, subagents / workflows projection, and stronger registry-loader state modeling.
- `verify:local` and the Rust layered runner now support changed / related scope, deriving workspace crates from Git diffs or explicit paths and expanding reverse dependents.

### Tests and Quality

- Added Electron Host module regressions for Agent App runtime task, Agent App shell, desktop notification, file shell, project shell, system utility, voice model, and related surfaces.
- Added regressions for the Content Factory worker, seeded Agent Apps, Agent App APIs, Marketplace registry / view model / visible blockers, plugin activation, and browser intent routing.
- Added Workspace regressions for Product Profile, right surfaces, Trace tab, message artifacts, history restore, send actions, and scoped storage.
- Added Claw Trace regression alert channel, dispatcher, monitor, notifier, presentation, and Developer-panel regressions.
- Added Rust regressions for projection store, session history windows, Agent App worker turns, seeded installed state, and request tool policy.
- Updated version facts to `1.82.0` across the root app, CLI npm package, App Server client package, Rust workspace, main Cargo lock, and the Aster sub-workspace lock. The repository uses `pnpm-lock.yaml`; no npm lockfile was changed.

### Documentation

- Added the `internal/roadmap/Writing/` documentation set for product requirements, architecture, workflow, sequence diagrams, and implementation plan.
- Updated the Claw Trace execution plan, trace roadmap / code map, and Agent UI latency map with regression alerts, Developer UI, the Trace right panel, and validation state.
- Updated `AGENTS.md`, the quality-workflow skill, `internal/aiprompts/quality-workflow.md`, and `scripts/README.md` with Rust changed / related scope, frontend resume testing, and compressed release-validation defaults.

### Other

- `right-sidebar-buttons.json` is a local UI-inspection temporary file and is excluded from this release candidate.
- This release continues moving Writing, Agent App, Plugin Marketplace, Claw Trace, and Electron Desktop Host onto the current App Server JSON-RPC / RuntimeCore / Electron Host path without restoring old Tauri wrappers or mock fallback.

**Full changes**: `v1.81.0` -> `v1.82.0`
