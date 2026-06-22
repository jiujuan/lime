## Lime v1.77.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Extended the MCP current control plane with `mcpResource/subscribe` and `mcpResource/unsubscribe`; the GUI resource preview now subscribes and unsubscribes as previews open, switch, and close.
- Filled out MCP streamable HTTP and OAuth with a Context7 preset, system-browser authorization, callback completion events, persistent token storage, resource templates, resource update notifications, and live-gated smoke entry points.
- Connected Agent Workspace `agentSession/toolInventory/read` to the MCP current snapshot so dynamic `mcp__<server>__<tool>` tools, MCP server status, and resource helpers can appear in runtime inventory.
- Completed the deterministic Expert Skills Runtime chain: expert `skillRefs` now drive selection, `SKILL.md` body reads, turn-scoped `LimeSkillTool` allowlists, skill invocations, and evidence-pack review.
- Added the Right Surface foundation: expert info, workbench, files, shell, harness, and objectCanvas candidates now share a registry, controller, scheduler, intent queue, and toolbar projection.
- Added project-level Skill scaffold creation in the Skills Workspace. It writes `.lime/registration.json` and refreshes `workspaceSkillBindings/list` readiness for expert missing-skill recovery flows.

### Fixes

- Fixed expert info and canvas / clip entry points rendering as two parallel right-side panels; expert info now lives inside the unified Right Surface and is mutually exclusive with the active surface.
- Fixed current tool item lifecycle events being overwritten by conflicting legacy terminal events; conflicts now become diagnostics without rewriting final success.
- Fixed missing imports introduced during Claw / Agent runtime fixture splitting, and reran cancel-then-continue, Skills runtime, and WebTools rendering scenarios.
- Fixed MCP resource-read evidence only appearing in backend summaries; the GUI Evidence Pack now shows server, URI, mime types, content refs, and read status summaries.
- Fixed the risk of MCP events silently using browser-mode mock fallback by adding the `mcp:` event prefix to no-mock event fallback guards.

### Improvements and Refactors

- Split MCP GUI settings and runtime surfaces: `McpPage`, `McpPanel`, server list, tools, prompts, and resources now use focused view models and child components.
- Split MCP smoke and contract guards so `scripts/mcp/current-smoke.mjs` and MCP-specific parts of `scripts/check-app-server-client-contract.mjs` delegate to `scripts/mcp/lib/**`.
- Split the Agent Runtime / Claw Electron fixture into assertion, GUI action, session, read-model wait, and tool-wait modules.
- Split large App Server runtime tests: `coding_events`, `external_events`, `evidence_exports`, and `read_model` now use facade files plus focused submodules.
- Removed the MCP desktop-host default mock surface by deleting `src/lib/desktop-host/mcpMocks.*` and guarding against old MCP facade / mock loader backflow.
- Split MCP frontend API types and response guards into `mcpTypes.ts` and `mcpResponseGuards.ts`; `mcp.ts` keeps compatible re-exports and current JSON-RPC API methods.

### Tests and Quality

- Added and expanded tests for MCP resource subscriptions, resource preview, Context7 preset, OAuth, resource evidence, inventory snapshots, GUI event bridge behavior, and legacy facade backflow prevention.
- `smoke:agent-runtime-current-fixture` now covers history/cache hydration, streaming completion control, Coding Workbench, cancel-then-continue, Skills Runtime, MCP structuredContent, and Expert Skills / Plaza / Panel flows.
- Added `smoke:expert-skills-live-gate` as a read-only Expert Skills validation gate. By default it audits deterministic evidence and reports `pending_live_provider` when no live summary is supplied.
- Updated App Server protocol schema fixtures, generated `packages/app-server-client` types, MCP API tests, and contract guards for resource subscribe / unsubscribe.
- Added focused Vitest coverage for Right Surface models, toolbar projection, Workspace wiring, expert full-surface rendering, and page-level workbench behavior.
- Updated release version facts to `1.77.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock.

### Documentation

- Updated MCP current documentation so server / tools / prompts / resources / OAuth / subscriptions all converge on the App Server JSON-RPC -> `lime-rs/crates/mcp` chain.
- Updated the service-layer map to remove old `lime-rs/src/services/mcp_service.rs` current ownership language and point MCP ownership to `lime-rs/crates/mcp` plus App Server `mcp*` methods.
- Added the Right Surface roadmap and implementation progress notes covering expert-panel unification, registry / controller / scheduler / intent queue work, and the remaining App Server contract gap.
- Updated Agent Skills Runtime status notes to mark the P0-P5 runtime foundation complete and move the next focus to live Provider gated validation.
- Updated the MCP modernization plan with OAuth, resource subscriptions, resource preview, inventory snapshots, Evidence Pack integration, fixture splitting, and GUI smoke evidence.

### Other

- This release continues converging MCP, Agent Skills, Right Surface, chat process evidence, and GUI smoke validation onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current chain. Old MCP Desktop facades, desktop-host MCP mocks, and legacy runtime fallback are not sources for new capabilities.

**Full changes**: `v1.76.0` -> `v1.77.0`
