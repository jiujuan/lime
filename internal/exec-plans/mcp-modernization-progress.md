# MCP 现代化进度

## 目标

参考 Codex MCP 设计，把 Lime MCP 功能从简化 stdio-only 形态收敛到 App Server current 主链下的可治理 runtime：

`src/lib/api/mcp.ts -> App Server JSON-RPC -> lime-rs/crates/mcp`

## 分类

- `current`：`lime-rs/crates/mcp`、App Server `mcp*` JSON-RPC methods、前端 `src/lib/api/mcp.ts`
- `current`：runtime 工具命名 `mcp__<server>__<tool>`，extension surface key 继续使用 `mcp__<server>`
- `current`：`ToolSearchBridgeTool` 消费 MCP inventory / search 结果
- `test-only`：`src/lib/desktop-host/mcpMocks.ts` 空 mock 与 retired facade 负向测试
- `dead`：旧 Tauri MCP facade / desktop-host 默认 mock 回退；不得恢复为生产入口

## 2026-06-20 本轮完成

- `McpServerConfig` 支持 legacy stdio 配置与 `streamable_http` 配置。
- MCP manager 支持 stdio / streamable HTTP 两类 transport 启动。
- 状态列表新增 `runtime_status`，暴露 transport、enabled、required、timeout、parallel tool calls 与 server capabilities。
- 工具策略拆出 `naming.rs` 与 `tool_policy.rs`，统一 runtime 命名、caller 校验、deferred loading、tool search scoring。
- `enabled_tools` / `disabled_tools` 以 inner tool name 过滤，不受 `mcp__<server>__<tool>` runtime 名影响。
- streamable HTTP 目前只接入 `bearer_token_env_var`；自定义 header / env header 配置 fail closed，避免假支持。
- 前端 MCP API 类型同步 stdio / streamable HTTP union，并保留 `runtime_status`。

## 2026-06-21 本轮完成

- streamable HTTP 已接入 `http_headers` 与 `env_http_headers`，使用自定义 `reqwest::Client` 默认 header 注入到 rmcp transport。
- `env_http_headers` 缺失环境变量、非法 header name/value、重复 header、`bearer_token_env_var` 与 `authorization` header 冲突都会 fail closed。
- HTTP transport 构造拆到 `lime-rs/crates/mcp/src/streamable_http.rs`，避免继续向超大 `manager.rs` 追加传输细节。
- `McpServerConfig` 补充 snake_case / camelCase header 配置解析回归。
- MCP config 层已识别 Codex 对齐字段：`scopes`、`oauth.client_id` / `oauth.clientId`、`oauth_resource` / `oauthResource`。
- OAuth 配置只允许保存到 `streamable_http` server；stdio 携带 OAuth 配置、inline `bearer_token`、非法 OAuth 形状都会在保存或解析阶段 fail closed。
- runtime 启动时遇到显式 `oauth.client_id` / `oauth_resource` 仍明确 fail closed，提示当前 rmcp connector 还不能无损承接这类配置；可先使用动态 OAuth 登录、`bearer_token_env_var` 或 HTTP headers。
- `runtime_status.auth_status` 已投影 MCP server 授权可用性：`none` / `static_headers` 标记为可用；动态 OAuth 标记为 `available=true` 且 `reason_code=oauth_login_required`；显式 `client_id/oauth_resource` 标记为 `available=false` 且 `reason_code=oauth_runtime_not_implemented`。
- OAuth 状态新增 `action_plan`，把下一步明确投影为 `oauth_login + login_required + mcp_server_oauth_login`，并保留 `scopes / oauth_resource / client_id`，为后续 GUI approval event 链和持久 token storage 接入留单一状态入口。
- MCP 授权状态逻辑已从超大 `types.rs` 拆到 `lime-rs/crates/mcp/src/auth_status.rs`，避免继续向中心类型文件追加业务投影逻辑。
- MCP 事件 payload 已从 `types.rs` 拆到 `lime-rs/crates/mcp/src/events.rs`，把中心类型文件从超过 1000 行拉回代码体量边界内。
- 新增 App Server current method `mcpServer/oauth/login`，链路为 `src/lib/api/mcp.ts -> packages/app-server-client -> App Server processor -> RuntimeCore -> LocalAppDataSource -> McpClientManager`。
- 新增 `McpOAuthRegistry`，基于 rmcp `AuthorizationManager` / `OAuthState` 启动本地 callback server `/oauth/callback`，动态 OAuth 登录返回 `authorizationUrl + state`。
- streamable HTTP OAuth 启动接入 `AuthClient<reqwest::Client>`；未完成登录或内存 token 缺失时启动 fail closed，错误提示先运行 `mcpServer/oauth/login`。
- MCP OAuth token store 已从进程内 `InMemoryCredentialStore` 收敛到 `PersistentCredentialStore`，凭据落在 app data runtime `mcp/oauth` 子目录，key 同时包含 server name 与 server URL，避免同名换 URL token 串用。
- OAuth 凭据文件采用 versioned JSON envelope；损坏 JSON、版本不匹配、server name / URL 不匹配均 fail closed，不会把异常凭据当成已授权状态。
- `runtime_status.auth_status` 已接入持久 token 查询；动态 OAuth server 有 token 时投影为 `mode=oauth, available=true` 且不再返回 `oauth_login_required` action plan。
- OAuth 登录完成后写入持久 token store，App 重启后的 streamable HTTP OAuth 启动可通过 `AuthorizationManager::initialize_from_store()` 恢复。
- App Server protocol schema、schema fixtures、npm client generated types、package client 测试与 MCP API fail-closed 测试已同步 `mcpServer/oauth/login`。
- MCP 管理面已消费 `runtime_status.auth_status.action_plan`：动态 OAuth 缺授权时显示登录入口，调用 `mcpServer/oauth/login` 并用系统浏览器打开 `authorizationUrl`；显式 `client_id/oauth_resource` unsupported 状态只显示不可用提示，不提供假登录入口；已授权状态显示为“已授权”。
- MCP OAuth 登录入口已补五语言 `settings` 文案与 `McpPanel` 组件回归，覆盖登录打开、unsupported fail-closed 和已授权状态。
- OAuth callback 完成后会发出 `mcp:oauth_completed` 事件，前端 `useMcp` 监听事件后自动刷新 server/tool 列表，`McpPanel` 给出“授权已完成，状态已刷新”的五语言 toast。
- 参考 Codex 的 `mcpServer/oauth/login -> async completion notification` 设计后，补齐本地回环 OAuth provider completion 回归：测试真实跑 rmcp metadata discovery、dynamic client registration、authorization redirect、callback、token exchange、持久 token store 与 `mcp:oauth_completed` 事件发射。
- 动态 OAuth 登录现在复用 streamable HTTP 的 `http_headers` / `env_http_headers` 构造路径；metadata discovery、dynamic client registration、持久凭据恢复和授权后的 MCP HTTP transport 使用同一组默认 headers，避免 OAuth 登录链路与普通 streamable HTTP 链路分叉。
- 动态 OAuth scopes 对齐 Codex 解析优先级：登录参数 scopes > server 配置 scopes > provider discovery `scopes_supported` > 空；discovery scopes 会去重、trim 并过滤空值，只在用户未显式传入且 server 未配置 scopes 时启用。
- OAuth callback 支持标准 provider error 回调（如 `error=invalid_scope&error_description=...`），不再等到 5 分钟超时；后台立即通过既有 `mcp:server_error` 事件把失败投影给 GUI。
- OAuth 回归测试已拆到 `lime-rs/crates/mcp/src/oauth_tests.rs`，`oauth.rs` 保持在代码体量边界内；`manager.rs` 巨型文件未继续追加新逻辑。
- MCP manager 已按职责拆分为 `manager/lifecycle.rs`、`manager/tools.rs`、`manager/prompts.rs`、`manager/resources.rs` 与 `manager/tests/*`；`manager.rs` 从 3000+ 行收敛到状态、连接池、缓存与事件 facade，当前最大子模块约 533 行，避免后续 transport / 工具 / prompt / resource 逻辑继续堆回中心文件。
- MCP GUI OAuth 登录打开授权页已从 `window.open` 收敛到 `openExternalUrlWithSystemBrowser` current 外链网关，避免 Electron 下绕过 Desktop Host 的浏览器打开链路；组件回归覆盖授权 URL 通过系统浏览器网关打开且不回退 `window.open`。
- 删除 OAuth 授权页旧 `window.open` popup blocked 五语言文案 `settings.mcpPage.runtime.auth.oauthPopupBlocked`；该 key 在系统浏览器 current 网关接入后已零引用。
- MCP crate 顶层与 client 注释去掉旧 `Tauri AppHandle` 绑定说法，统一为 `DynEmitter` / 桌面宿主解耦表述；旧 Tauri wrapper 只保留在 MCP README 的防回流说明中。
- `smoke:mcp-current` 新增 `--allow-oauth-fixture` 可选证据路径：同一 MCP current smoke 入口会创建本地 OAuth provider，走 `app_server_handle_json_lines -> mcpServer/oauth/login`，调用 Electron `open_external_url` 系统浏览器 current 网关，并等待 callback token exchange 后的 `runtime_status.auth_status` 授权回流；该 fixture 不依赖真实外部账号或 live Provider。
- OAuth Rust 本地 provider 回归已补 loopback `NO_PROXY` 测试保护，覆盖开发机系统代理会把 `127.0.0.1` 误送代理导致 fixture 502 的场景；生产 OAuth discovery / dynamic registration / authorized MCP transport 继续使用 Lime 构造的 no-proxy/custom-header reqwest client。
- 当前 refresh 生命周期仍交给 rmcp `AuthorizationManager`；GUI 已能完成登录完成后的状态回流，并已有本地 OAuth provider + Electron 系统浏览器 current 网关可重复 smoke 入口，但真实第三方 OAuth provider 账号流仍是后续人工 / live-gated 证据项。
- MCP control-plane 已补 `structuredContent` 端到端 current 证据：临时 stdio MCP fixture 的 `tools/list` 暴露 `outputSchema.structuredContent`，`tools/call` 返回 `structuredContent`，`smoke:mcp-current -- --allow-write-fixture` 经 `app_server_handle_json_lines -> App Server JSON-RPC` 断言 `mcpTool/list`、`mcpTool/listForContext`、`mcpTool/search` 与 `mcpTool/call` 都保留结构化结果事实。
- `scripts/check-app-server-client-contract.mjs` 已把 MCP current smoke 的 `outputSchemaStructuredContentSeen`、`structuredContentEcho`、`outputSchema`、`structuredContent` 与 legacy 命令禁回流断言纳入 `npm run test:contracts`，避免该证据只停留在单独 vitest。
- profiling 文档已把旧 `mcp_call_tool` / `mcp_start_server` / `mcp_list_tools` 示例收口为 `mcpTool/call` / `mcpServer/start` / `mcpTool/list` current method 口径，并明确旧 `mcp_*` / `get_mcp_servers` Tauri facade 不再作为 profiling 目标。
- MCP runtime/read model 到 Agent Chat 的基础 GUI 展示闭环已补：`AgentToolExecutionResult` 承载 `structuredContent` / `structured_content`，历史 hydrate 从 `thread_read.tool_calls.structured_content` 透传到 `toolCall.result.structuredContent`，`ToolCallDisplay` 与 `InlineToolProcessStep` 在纯协议包络输出时优先展示结构化结果里的用户正文（含 MCP 常见 `answer` 字段），避免 GUI 退回展示 `request_metadata` / diagnostics JSON。
- MCP `structuredContent` 已补真实 Electron fixture 级 Agent Chat GUI 可见证据：`smoke:claw-chat-current-fixture -- --scenario mcp-structured-content` 通过真实 Electron Desktop Host、GUI 输入框、`app_server_handle_json_lines -> agentSession/turn/start -> external fixture backend -> agentSession/read` current 链路，断言 `mcp__docs__diagnostic_probe` 工具结果的 `structuredContent.answer` 在 GUI 可见，同时 `request_metadata` / `diagnostics` / `mcp_tool_result_projection` 协议包络不外泄到聊天展示。
- `smoke:agent-runtime-current-fixture` 聚合 guard 已纳入 MCP structuredContent Electron fixture，避免该证据只停留在单项脚本；仍保持 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=0`、`LIME_REAL_API_TEST=0`，不调用真实 Provider，不使用 App Server mock backend 或 renderer mock fallback。
- MCP 旧 Desktop facade 回流守卫收口：`internal/aiprompts/commands.md` 已补 MCP 控制面 current method 清单，明确 `src/lib/api/mcp.ts -> AppServerClient.request(...) -> app_server_handle_json_lines -> App Server JSON-RPC -> lime-rs/crates/mcp` 为唯一主链，并把 `get_mcp_servers`、`mcp_list_*`、`mcp_call_*`、`mcp_get_prompt`、`mcp_read_resource`、`mcp_start_server`、`mcp_stop_server`、`add/update/delete/toggle/import/sync_mcp*` 归类为 `dead / retired guard-only`。
- `scripts/check-app-server-client-contract.mjs` 已把 MCP 控制面文档事实源纳入 `npm run test:contracts`，并补齐 `src/lib/api/mcp.ts` 禁止 legacy list / prompt / resource 命令字符串的 renderer gateway guard，防止后续把旧 MCP facade 当成前端网关 fallback。
- MCP resource templates 已进入 current 控制面投影：`mcpResource/list` 继续返回 `resources`，同时新增 `resourceTemplates`，由 `McpClientManager::list_resource_templates()` 调 rmcp `resources/templates/list` 聚合 running server 的资源模板；前端保持 `listResources()` 兼容资源数组，并新增 `listResourcesWithTemplates()` 返回 `{ resources, resourceTemplates }`。
- App Server protocol schema fixture 与 `packages/app-server-client` generated types 已同步 `McpResourceListResponse.resourceTemplates`；`smoke:mcp-current -- --allow-write-fixture` 的 stdio fixture 现在响应 `resources/templates/list` 并在 summary 记录 `resourceTemplatesSeen / resourceTemplateUriTemplate`，契约守卫已纳入 `npm run test:contracts`。

## 已验证

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema --lib --test schema_fixtures`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol catalog --lib`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core mcp_model --lib`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server mcp --lib`
- `npm test -- "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `npm test -- "src/components/mcp/McpPanel.test.tsx" "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp oauth`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `node --check "scripts/mcp/current-smoke.mjs" && node --check "scripts/mcp/oauth-fixture-smoke.mjs"`
- `npm test -- "scripts/mcp/current-smoke.test.mjs"`
- `npm test -- "src/components/mcp/McpPanel.test.tsx" "src/hooks/useMcp.test.tsx" "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `npm run governance:scripts`
- `git diff --check -- "scripts/mcp/current-smoke.mjs" "scripts/mcp/oauth-fixture-smoke.mjs" "scripts/mcp/current-smoke.test.mjs" "scripts/README.md" "internal/exec-plans/mcp-modernization-progress.md" "lime-rs/crates/mcp/src/oauth.rs" "lime-rs/crates/mcp/src/oauth_tests.rs" "lime-rs/crates/mcp/src/streamable_http.rs"`
- `npm run smoke:mcp-current -- --allow-oauth-fixture --timeout-ms 30000`：未通过，当前环境未启动 Electron DevBridge，失败为 `DevBridge 未就绪 ... fetch failed`，未进入 MCP JSON-RPC / OAuth fixture 逻辑。
- `npm test -- "src/hooks/useMcp.test.tsx" "src/components/mcp/McpPanel.test.tsx" "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `npm run verify:gui-smoke`
- `npm test -- "scripts/mcp/current-smoke.test.mjs"`
- `node -e "for (const f of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) JSON.parse(require('fs').readFileSync('src/i18n/resources/'+f+'/settings.json','utf8')); console.log('settings json ok')"`
- `rg -n "oauthPopupBlocked|window\\.open" "src/components/mcp" "src/i18n/resources"`
- `rg -n "Tauri|tauri" "lime-rs/crates/mcp/src" "src/components/mcp"`
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `npm test -- "src/components/mcp/McpPanel.test.tsx" "src/hooks/useMcp.test.tsx" "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp start_login_completes_against_local_oauth_provider_and_persists_token`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp`
- `npm test -- "src/hooks/useMcp.test.tsx" "src/components/mcp/McpPanel.test.tsx" "src/lib/api/mcp.test.ts" "src/lib/api/mcp.failClosed.test.ts"`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp oauth`
- `npm --prefix "packages/app-server-client" test`
- `npm run test:contracts`
- `npm run verify:app-version`
- `npm run verify:gui-smoke`
- `npm test -- "scripts/mcp/current-smoke.test.mjs"`
- `git diff --check -- <MCP/App Server protocol/client/API 写集>`
- `rg -n "[ \\t]+$" -- <MCP/App Server protocol/client/API 写集>`
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" -- <MCP/App Server protocol/client/API 写集>`
- `node --check "scripts/mcp/current-smoke.mjs"`
- `npx vitest run "scripts/mcp/current-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `npm run smoke:mcp-current -- --allow-write-fixture --timeout-ms 120000`：通过，summary 显示 `ok=true`、`appServerHandleJsonLinesSeen=true`、`legacyMcpCommandsSeen=[]`、`missingFixtureMethods=[]`、`outputSchemaStructuredContentSeen=true`、`structuredContentEcho.echoedMessage="hello current MCP"`。
- `npm run test:contracts`
- `npm run governance:scripts`
- `npm run docs:boundary`
- `git diff --check -- "scripts/mcp/current-smoke.mjs" "scripts/mcp/current-smoke.test.mjs" "scripts/README.md" "internal/aiprompts/performance-profiling.md" "scripts/check-app-server-client-contract.mjs"`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_agent_tool_end_preserves_structured_content_in_result_payload -- --nocapture`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_merges_tool_started_arguments_into_completed_tool_calls -- --nocapture`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_records_skill_invocation_from_tool_metadata -- --nocapture`
- `npx vitest run "src/lib/api/agentRuntime/appServerEvidenceExportProjection.test.ts" "src/lib/api/agentRuntime/appServerSessionClient.test.ts" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `npx vitest run "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/hooks/agentChatHistory.test.ts" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `npx eslint "src/lib/api/agentProtocol.ts" "src/components/agent/chat/utils/toolResultDetailText.ts" "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/hooks/agentChatHistory.test.ts" --max-warnings 0`
- `git diff --check -- "src/lib/api/agentProtocol.ts" "src/lib/api/agentProtocol.d.ts" "src/components/agent/chat/utils/toolResultDetailText.ts" "src/components/agent/chat/hooks/agentChatToolResult.ts" "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/hooks/agentChatHistory.test.ts"`
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache hydration、final_done 工具收尾、Claw 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench、cancel-then-continue 与 Skills Runtime 三入口，`liveProviderUsed=false`。
- 过滤名误试：`read_session_preserves_tool_arguments_and_structured_content` 与 `export_evidence_projects_workspace_skill_tool_invocations` 匹配 0 个测试，不能作为有效证据；已改用上面两个准确测试名复跑通过。
- `node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs"`
- `node --check "scripts/agent-runtime/current-fixture-regression-smoke.mjs"`
- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --prefix claw-chat-current-fixture-mcp-structured-content-regression --timeout-ms 180000`：通过，真实 Electron fixture 显示 `mcp__docs__diagnostic_probe` 的结构化答案进入 Agent Chat GUI，且协议包络未外泄。
- `npm run smoke:agent-runtime-current-fixture`：通过，聚合 guard 额外覆盖 MCP structuredContent 到 Agent Chat GUI 可见 Electron fixture，`liveProviderUsed=false`。
- `cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures`
- `npm run generate:protocol-types`
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp --package app-server-protocol --package app-server`
- `npm run check:protocol-types`
- `node --check "scripts/mcp/current-smoke.mjs" && node --check "scripts/check-app-server-client-contract.mjs"`
- `CARGO_TARGET_DIR="/tmp/lime-target-mcp-resource-templates" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp resource`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema --lib --test schema_fixtures`
- `npx vitest run "src/lib/api/mcp.test.ts" "scripts/mcp/current-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `node "scripts/check-app-server-client-contract.mjs"`：通过，281 checks。
- `npm run test:contracts`
- `CARGO_TARGET_DIR="/tmp/lime-target-appserver-mcp-resource-templates" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource -- --nocapture`

## 当前缺口

- OAuth、动态授权与用户 approval 已具备 GUI 登录入口、completion 自动刷新闭环、本地回环 OAuth provider completion 证据，以及 `smoke:mcp-current -- --allow-oauth-fixture` 的 Electron `open_external_url` 网关证据；下一刀应补真实第三方 provider 账号流的 live-gated / 手工 E2E 证据。
- 显式 `oauth.client_id` / `oauth_resource` 仍按 unsupported fail-closed 处理，后续需要等 connector 能无损支持后再打开。
- rmcp 0.12 的 `exchange_code_for_token` 内部仍新建 reqwest client；Lime 目前能保证 OAuth discovery / dynamic registration / authorized MCP requests 复用自定义 headers，但不能无损保证 token endpoint 也接收自定义 headers。后续若要支持需要 upstream connector seam 或本地 OAuth flow 封装，不应靠假支持打开。
- rmcp 0.12 的 token exchange 内部自建 client 也意味着本地 loopback OAuth provider 在带系统代理的开发机上需要测试进程级 `NO_PROXY` 保护；当前保护只放在 Rust fixture 测试里，不修改生产进程环境。
- MCP GUI 管理面仍缺真实第三方 OAuth provider 账号流 smoke；当前本地 OAuth fixture 已证明系统浏览器 current 网关、provider redirect、callback completion 与状态回流闭环。
- MCP `structuredContent` control-plane、runtime/read model/evidence projection、基础 Agent Chat 展示回归与真实 Electron fixture 可见证据已覆盖；下一刀若继续提升完整度，应补 Playwright 人工交互式证据或真实第三方 MCP provider 工具结果的 live-gated E2E。
- MCP resource templates 的 control-plane、App Server JSON-RPC、前端网关与 current smoke 证据已覆盖；resources 主链下一刀应转向 `notifications/resources/list_changed` / subscriptions、resource mime preview/offload 与最终引用验证。
- `lime-rs/crates/mcp/src/manager.rs` 巨型文件已按生命周期、工具、提示词、资源与测试拆分；后续新增逻辑仍应优先进入对应子模块，若 runtime status / cache / event facade 继续增长，再按同一模式继续拆出独立子模块。

## 阻塞记录

- `npm run verify:local` 当前被非 MCP 脏改动阻塞：`StreamingRenderer.test.tsx` / `StreamingRenderer.testHarness.tsx` 有未使用变量，`StreamingRenderer.tsx` 有 fast-refresh warning。本轮 MCP 定向校验已通过。
- 历史上 `npm run test:contracts` 曾被非 MCP `useAsterAgentChat.ts` 脏改动阻塞；当前复跑已通过，MCP current smoke structuredContent 守卫已进入同一 contract 入口。
- 本轮尝试 `npm run smoke:mcp-current -- --allow-oauth-fixture --timeout-ms 30000`，当前环境没有运行 `npm run electron:dev` / DevBridge，health check 直接 `fetch failed`；该 smoke 未能作为 GUI 证据使用，需在 Electron DevBridge 运行后复跑。
- `scripts/mcp/current-smoke.mjs` 当前约 1134 行，`scripts/check-app-server-client-contract.mjs` 当前约 8824 行，均已超过非生成代码体量边界。本轮只为同一 MCP current 链路补 resource templates 字段和守卫，直接拆分会扩大验证面；退出条件：下一次继续扩 `smoke:mcp-current` 时先把 fixture writer / assertion helpers 拆到 `scripts/mcp/lib/`，下一次继续扩 MCP contract guard 时先把 MCP runtime current contract 拆成独立检查模块或 data-driven snippets。
- 本轮曾并行复用 `/tmp/lime-target-mcp-resource-templates` 触发 cargo incremental / rmeta 写入竞争（`No such file or directory (os error 2)`）；已改用独立 `CARGO_TARGET_DIR="/tmp/lime-target-appserver-mcp-resource-templates"` 复跑 App Server MCP fixture 并通过。
