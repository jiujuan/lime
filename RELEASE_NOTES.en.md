## Lime v1.94.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Moved Soul Style Packs onto the App Server current path with install, list, enable / disable, and uninstall protocol methods, plus a settings UI that imports five-locale packs and shows built-in and installed profiles together.
- Improved Agent chat unfinished-session recovery, queued turns, input restoration after stop, structured `contentParts`, media reference cards, provider safety buffering diagnostics, and sidebar session projection for long-running and interrupted conversations.
- Expanded the runtime native tool surface to include `view_image`, `apply_patch`, `skill_search`, `sleep`, `update_plan`, `WebFetch`, `WebSearch`, memory, and image task tools through current `tool-runtime` dispatch modules.
- Added App Server protocol coverage for content references, message content parts, session archive / update / list responses, and config warning projection so GUI, client, and schema export share one contract source.

### Fixes

- Fixed Claw / Agent chat interrupt, queued-turn, history hydrate, and input-restore boundaries so tool side effects, placeholder output, and stale terminal events no longer trigger the wrong restore or cleanup path.
- Fixed App Server config warning propagation through frontend toasts, API responses, Electron bridge, and runtime read models so local configuration failures are visible sooner.
- Fixed model provider stream safety buffering and message projection to preserve structured content parts, media references, media-only history messages, and final-answer phases across reasoning / tool / final text rendering.
- Fixed Electron renderer packaging builds to use a relative asset base, reducing packaged fixture and desktop resource path mismatches.
- Fixed Soul profile resolution and fallback behavior so unknown profiles, built-in registries, and installed pack profiles stay aligned between settings and prompt context.

### Improvements and Refactors

- Continued shrinking Aster residuals under the Codex-first boundary by deleting dead vendor Aster session memory, config, cron, notebook edit, plan, remote trigger, task, workflow, web, view image, and worktree tool surfaces.
- Moved image task, memory, Skill search, sleep, update plan, view image, and web retrieval implementations from the agent crate into narrower `tool-runtime` modules, leaving central files focused on registration and dispatch.
- Split App Server runtime context media, evidence context, Soul style pack registry / store / paths / installer, and session projection into smaller domain modules.
- Split frontend chat logic for unfinished session projection, thread message content parts, runtime status, workspace projection, input restore policy, and tool display copy out of heavy React components.

### Tests and Quality

- Added and updated regressions for Soul style pack API / UI, style profile registry, queued turns, App Server warnings, content part projection, unfinished-session recovery, and sidebar conversation rows.
- Added Rust targeted tests for Soul style pack store / processor, media context, queue order, session list projection, message diagnostics, agent skill telemetry, and provider safety buffering.
- Added `smoke:agent-session-recovery-cdp-gate` and expanded the Claw current fixture suite with a CDP recovery gate, media reference smoke, scenario registry, GUI completion waits, and assertion context coverage.
- Updated App Server protocol schemas, generated TypeScript types, client contracts, Aster migration boundaries, scripts governance, and release workflow guards to keep retired tool surfaces from returning.

### Documentation

- Updated `AGENTS.md`, engineering navigation, governance, quality workflow, release workflow, and the Codex skill index with current release boundaries and Aster migration rules.
- Updated Aster migration, Soul style output / pack installation / profiles, Claw stream, unfinished-session recovery, and refactor v1 research materials with the v1.94.0 release context and exit criteria.

### Other

- Bumped version facts to `1.94.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, `lime-rs/vendor/aster-rust/Cargo.lock`, and release notes.

**Full changes**: `v1.93.0` -> `v1.94.0`
