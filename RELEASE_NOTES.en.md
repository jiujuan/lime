## Lime v1.91.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added typed notification projection to the App Server `agentSession` event path, covering `message/created`, `turn/*`, `item/*`, and assistant message deltas with regenerated protocol schemas and npm client types.
- Consolidated App Center into the current Plugins page: the old marketplace page is retired, while installed state, cloud state, capability lists, activation entries, subagents / skills, permissions, and version summaries now share one app detail surface.
- Plugin activation can now route into the Agent workspace with project context, turning workflow / runtime entries into `@` trigger prompts instead of continuing through the old adapter mock execution path.
- Agent Turn automation now carries session / thread lineage so jobs created from a workspace stay bound to the originating conversation context.

### Fixes

- Fixed Agent Runtime boundaries around typed deltas, turn lifecycle events, runtime status, web-search preflight, credential provider bridge, and session recovery projection to reduce stream ordering, stale terminal state, and context-loss risks.
- Fixed restored team facts, workspace team runtime, subagent timelines, right-surface readiness, and service-skill entry action projections.
- Fixed plugin install / uninstall flows for destructive-data confirmation, dry-run gating, manifest normalization, source versions, capability tags, and detail summaries.
- Fixed Claw current fixture waits, right-surface visual assertions, scenario assertion split, and multi-agent team fixture coverage.

### Improvements and Refactors

- Split `tool-runtime` ownership for execution policy, execution rules, shell planning, tool batch plan / outcome, and policy service so App Server no longer reads plain shell argv text through the `lime-agent` Aster adapter.
- Refactored App Server protocol / client request and notification methods, catalog data, schema export, and generated types around the current JSON-RPC contract.
- Continued shrinking Aster residuals in `lime-agent` by moving tool inventory, workspace patching, event / reply handling, session store, and subagent profiles behind narrower adapter boundaries.
- Removed the old plugin marketplace page and route branch; Skills workspace project resolution now uses the current project hook to avoid parallel UI entry points.

### Tests and Quality

- Added App Server event notification, protocol schema, plugin task evidence, team facts, provider telemetry, turn lifecycle, and media task JSON-RPC regressions.
- Added or updated regressions for workspace plugin activation, intent routing, runtime readiness, service-skill actions, team session runtime, restored team facts, automation thread lineage, and plugin UI flows.
- Updated current fixture smoke coverage, OpenAI-compatible fixture server tests, managed-objective automation smoke helpers, MCP contract guards, App Server client contract checks, and governance boundaries.
- Kept five-language i18n resources in sync for App Center, automation, and Agent workspace copy.

### Documentation

- Added the `2026-07-05 Aster migration reality check`, recalibrating the exit-condition progress estimate to about `69%` and explicitly rejecting the previous `99%` or no-Aster-dependency completion framing.
- Updated the Aster migration main plan, ProjectThread-first execution plan / PRD, tech-debt tracker, and workflow reference to match the current implementation.

### Other

- Bumped version facts to `1.91.0` across the root app, CLI npm package, Rust workspace, `lime-rs/Cargo.lock`, and the current-turn smoke client.

**Full changes**: `v1.90.0` -> `v1.91.0`
