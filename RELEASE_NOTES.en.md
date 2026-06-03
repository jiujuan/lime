## Lime v1.58.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Update notifications now include an automatic install session, letting the UI follow checking, downloading, installing, restarting, failed, and up-to-date states through the `app-update://session` event.
- The model selector can read `reasoning_effort` capabilities exposed by APIs or the registry, then show and persist reasoning-effort choices from the Agent input bar.
- The Agent input bar now has a Plus menu that consolidates attachments, knowledge packs, Plan, Objective, Subagent, and Skill entry points while preserving inline knowledge and skill controls in workspace mode.
- Agent runtime tool inventory now gates MCP resource helper visibility, showing resource-read helpers only when the runtime explicitly supports them.
- Task board tools now accept `snake_case` input aliases and return structured null results for missing tasks, improving model tool-call compatibility.

### Fixes

- Fixed update-install session state, browser mocks, window closing, and manual-download fallback so automatic update failures leave a clear recovery path.
- Fixed model-registry parsing for provider capability fields, reducing missed reasoning-effort, task-family, modality, and runtime-feature signals.
- Fixed normalization in Agent messages, tool process displays, search result previews, site media, and the streaming renderer so protocol residue and empty content are less likely to appear in user-visible messages.
- Fixed state assembly around Workspace sends, task-center drafts, initial knowledge selection, and runtime compaction metadata.
- Fixed Knowledge GUI smoke targeting and diagnostics around the Plus menu, knowledge popovers, page navigation, and long waits.

### Improvements And Refactors

- Reworked input-bar advanced options into the Plus menu, status chips, and a dedicated model-control area, reducing always-visible controls while keeping active modes easy to scan.
- Continued moving complex Agent Chat, Inputbar, Workspace send, Tool display, Model selector, and Settings logic into View Models / helpers / projections.
- Reworked Memory settings into Memory, Soul, and Advanced sections, adding Soul templates, preview, import, and reset flows.
- Provider settings now decide whether to show the companion entry from navigation configuration, reducing invalid entry points mixed with OEM cloud surfaces.
- Update notification UI now has more consistent progress, failure, skip, remind-later, close, and mock-preview states.

### Tests And Quality

- Added `smoke:agent-runtime-tool-execution` for release-time coverage of the Agent runtime tool execution path.
- Strengthened `knowledge-gui-smoke` coverage for the Plus menu, knowledge popovers, navigation timeouts, click diagnostics, and offline fixtures.
- Added or expanded regressions for update notifications, automatic install sessions, model reasoning effort, the input-bar Plus menu, tool displays, Task board, MCP resource helpers, Provider settings, and Soul settings.
- Improved the OpenAI-compatible fixture server, Vitest layer runner, i18n unused-key checks, and test classification coverage.
- Updated the root app, Tauri workspace, Tauri config, CLI npm package, Agent App runtime package, and lockfiles to `1.58.0`.

### Documentation

- Updated the engineering quality workflow and test-governance roadmap with the new layered-test and release-smoke entries.
- Updated the Soul rollout plan with delivery phases and acceptance boundaries for Memory / Soul settings.

### Other

- Tauri updater config now includes Windows `installMode`, aligning installer behavior with the update-install session.

**Full changes**: `v1.57.0` -> `v1.58.0`
