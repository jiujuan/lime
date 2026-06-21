## Lime v1.76.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Added MCP resource-template projection to the current control plane: `mcpResource/list` still returns resources and now also returns `resourceTemplates`; the frontend adds `listResourcesWithTemplates()` on the same App Server JSON-RPC chain.
- Preserved MCP `outputSchema` / `structuredContent` end to end across `mcpTool/list`, `mcpTool/listForContext`, `mcpTool/search`, `mcpTool/call`, and the Agent Chat read model.
- Added the Agent Skill runtime `skill_search` metadata tool. It returns names, scopes, locators, and match reasons without reading `SKILL.md` bodies by default or expanding tool permissions.
- Connected expert and Skills Workspace flows to Agent Skill runtime metadata: expert `skillRefs` now become candidate hints, and the Skills Workspace can launch an Agent turn with workspace Skill enablement metadata.
- Added evidence-export summaries for Skill searches, Skill invocations, and MCP structuredContent observations.

### Fixes

- Fixed MCP / Service Skill / SkillTool results leaking protocol envelopes such as `request_metadata`, `diagnostics`, and `metadata` into chat; the GUI now prefers user-facing structured result text.
- Fixed MCP `structuredContent` loss across runtime events, read models, history hydration, full tool cards, and inline process cards.
- Fixed MCP OAuth loopback fixture behavior under system proxies and bounded token exchange within the same login timeout window.
- Fixed unknown runtime timeline items expanding raw JSON; unsupported items now render user-facing copy with all five current locales covered.
- Closed App Server client contract gaps for MCP current smoke by adding structuredContent assertions and legacy MCP Desktop facade backflow guards.

### Improvements and Refactors

- Split oversized chat-rendering files by responsibility: `MessageList`, `MarkdownRenderer`, `StreamingRenderer`, `ToolCallDisplay`, `InlineToolProcessStep`, `AgentThreadTimeline`, and related projection / history / grouping helpers now live in smaller modules.
- Split the Skills Workspace page into copy, content, view, visuals, default project, detail content, and runtime-launch parameter helpers.
- Split App Server evidence observability so Skill invocation, Skill search, and MCP tool-result summaries are projected by focused functions.
- Continued moving MCP manager logic into resources / tools modules, including resource-template conversion and tool-result schema handling.
- Added protocol-envelope detection for tool results while preserving command-tool JSON stdout.

### Tests and Quality

- Updated App Server protocol schema fixtures, generated `packages/app-server-client` types, and MCP frontend API tests for `resourceTemplates` and `structuredContent`.
- Expanded MCP current smoke and contract guards for `outputSchemaStructuredContentSeen`, `structuredContentEcho`, resource templates, and legacy MCP command backflow prevention.
- Added real Electron fixture coverage for `smoke:claw-chat-current-fixture -- --scenario mcp-structured-content`, proving MCP structuredContent is visible in Agent Chat without leaking protocol envelopes.
- Expanded Agent Skill runtime fixtures for standard Skills runtime, explicit Skill mention, manually enabled workspace Skill, expert Skill refs, and expert-panel Skill refs.
- Expanded MarkdownRenderer, StreamingRenderer, MessageList, ToolCallDisplay, InlineToolProcessStep, AgentThreadTimeline, SkillsWorkspacePage, expert Skill runtime candidate, and i18n regressions.
- Updated release version facts to `1.76.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock.

### Documentation

- Updated the MCP current control-plane boundary and documented `src/lib/api/mcp.ts -> AppServerClient.request(...) -> app_server_handle_json_lines -> App Server JSON-RPC -> lime-rs/crates/mcp` as the only current chain.
- Updated the MCP modernization execution plan with structuredContent, resource templates, Electron fixture evidence, contract guards, and remaining live-gated gaps.
- Updated the Turn / Tool lifecycle matrix with protocol-envelope hiding, rendering-chain splits, MessageList / projection splits, and GUI smoke evidence.
- Updated performance profiling and script docs to use current App Server methods instead of old `mcp_*` / `get_mcp_servers` examples.

### Other

- This release continues converging MCP, Agent Skill runtime, expert Skill binding, chat process evidence, and GUI smoke validation onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current chain. Old MCP Desktop facades, legacy mocks, and protocol-envelope rendering are not sources for new capabilities.

**Full changes**: `v1.75.0` -> `v1.76.0`
