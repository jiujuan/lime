## Lime v1.75.0

<sub>The Simplified Chinese release notes are the primary version. This English page is a companion for international readers.</sub>

### New Features

- Upgraded the current MCP chain to support both `stdio` and `streamable_http` transports, including static headers, environment-backed headers, bearer-token environment variables, and Codex-aligned scope / OAuth field parsing.
- Added the current App Server `mcpServer/oauth/login` method across the MCP settings UI, App Server JSON-RPC, RuntimeCore, the local callback server, and `lime-rs/crates/mcp`.
- Added `runtime_status.auth_status` and `action_plan` projections for MCP authorization so the GUI can distinguish no-auth, static headers, OAuth login required, and unsupported explicit `client_id/oauth_resource` states.
- Persisted MCP OAuth credentials under app data with a versioned envelope keyed by server name and URL, allowing authorized streamable HTTP servers to recover after app restart.
- Added Agent Skill runtime support for workspace `.agents/skills` discovery, metadata ranking, explicit / catalog-bound selection, selected SKILL.md body injection, runtime allowlists, and evidence skill-invocation summaries.
- Added `skill_locator` to Service Skill scenes and command bindings so Growth / Voice / catalog launches can carry local skill location metadata into Agent turn metadata.
- Improved Agent chat timeline projections for reasoning items, WebSearch / WebFetch, Service Skill tool results, and tool-result envelopes so streaming and imported history both show richer process evidence.

### Fixes

- Closed MCP HTTP header false-support cases: missing env vars, invalid headers, duplicate headers, inline bearer tokens, OAuth on stdio servers, and authorization conflicts now fail closed.
- Unified the header path for dynamic OAuth and normal MCP HTTP transport; metadata discovery, dynamic registration, credential restore, and authorized MCP requests share the same header construction.
- Fixed MCP OAuth provider-error callbacks so failures are emitted immediately through `mcp:server_error` instead of waiting for timeout.
- Routed MCP OAuth authorization opening through the current Desktop Host external URL gateway instead of `window.open`.
- Fixed premature WebSearch / WebFetch collapse while the Agent is still synthesizing the final answer.
- Fixed cases where delayed running tool states swallowed an already available final answer.
- Fixed Codex import rendering for preserved `web_search_end.output`, search-result noise, full URL exposure, and loose streaming Markdown.
- Fixed the App Server client contract regression in Agent chat active stream synchronization by restoring the `getThreadItems` closure over current session state.

### Improvements and Refactors

- Split the MCP manager into lifecycle, tools, prompts, resources, and tests modules; `manager.rs` is now a connection-pool, cache, and event facade.
- Split MCP authorization status, event payloads, HTTP transport construction, runtime naming, and tool policy into focused modules.
- Moved expanded WebSearch timeline rendering into `StreamingWebSearchProcessTimeline`, preserving source / thinking / fetch order while hiding transport JSON and full URLs.
- Split StreamingRenderer WebSearch / Codex regression coverage into dedicated harness and mock files.
- Added Skill invocation audit details to evidence exports and included workspace Skill tool calls in completion-audit required evidence.
- Added five-locale MCP settings copy for authorization states, login, completion refresh, and unsupported states.

### Tests and Quality

- Expanded MCP Rust coverage for streamable HTTP headers, OAuth fail-closed validation, local OAuth provider completion, persistent token storage, and the split manager modules.
- Updated App Server protocol schemas, schema fixtures, generated npm client types, and app-server-client tests for `mcpServer/oauth/login`.
- Expanded MCP frontend API, `useMcp`, `McpPanel`, and smoke-script tests for OAuth login, completion refresh, unsupported states, and the system-browser gateway.
- Expanded Agent Skill runtime, Service Skill, evidence export, and thread read-model tests for skill selection, runtime enablement, tool invocation evidence, and history projection.
- Expanded StreamingRenderer, MessageList, MarkdownRenderer, SearchResultPreview, tool grouping, Codex import, and Playwright CLI coverage for WebSearch / WebFetch collapse, expansion, Markdown, ordering, and JSON hiding.
- Updated release version facts to `1.75.0` across the root app, Rust workspace, CLI npm package, App Server client package, Cargo lock, and Aster sub-workspace lock.

### Documentation

- Added `internal/exec-plans/mcp-modernization-progress.md` with the current MCP chain, OAuth work, GUI login behavior, evidence, gaps, and follow-up live-gated items.
- Updated the Turn / Tool lifecycle matrix with WebSearch / WebFetch collapse and expansion, synthesizing state, Codex Markdown, live WebSearch / WebFetch, and GUI fixture validation.
- Updated command-boundary, execution-plan index, tech-debt tracking, MCP smoke script notes, and related governance docs.

### Other

- This release continues converging MCP, Agent Skill runtime, Service Skill scenes, chat process evidence, and GUI smoke validation onto the App Server JSON-RPC / RuntimeCore / Electron Desktop Host current chain. Old Tauri, legacy mock, and false OAuth support paths are not sources for new capabilities.

**Full changes**: `v1.74.0` -> `v1.75.0`
