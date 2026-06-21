## Lime v1.75.0

### 新功能

- MCP current 主链升级为支持 `stdio` 与 `streamable_http` 两类 transport，HTTP 配置支持静态 header、环境变量 header、bearer token 环境变量和 Codex 对齐的 scope / OAuth 字段解析。
- 新增 App Server current 方法 `mcpServer/oauth/login`，打通前端 MCP 管理面、App Server JSON-RPC、RuntimeCore、本地 callback server 与 `lime-rs/crates/mcp` 的动态 OAuth 登录链路。
- MCP 授权状态新增 `runtime_status.auth_status` 与 `action_plan` 投影，GUI 可区分无需授权、静态 header 已可用、需要 OAuth 登录、显式 `client_id/oauth_resource` 暂不支持等状态。
- MCP OAuth token store 从进程内内存收敛到 app data 下的 versioned 持久凭据，按 server name 与 URL 隔离，登录完成后可在 App 重启后恢复授权。
- Agent Skill runtime 新增工作区 `.agents/skills` 发现、Skill metadata 检索排序、显式 / catalog-bound skill 选择、选中 Skill 正文注入、运行时 allowlist 与 evidence skill invocation 摘要。
- Service Skill 场景和命令绑定新增 `skill_locator`，Growth / Voice / catalog scene launch 可以把本地 skill 定位信息带入 Agent turn metadata。
- Agent 聊天 timeline 增强 reasoning item、WebSearch / WebFetch、Service Skill tool result 与工具结果 envelope 投影，流式和历史导入都能显示更完整的过程证据。

### 修复

- 修复 MCP HTTP header 配置的假支持风险：缺失环境变量、非法 header、重复 header、inline bearer token、stdio 携带 OAuth 配置和 authorization 冲突都会 fail closed。
- 修复动态 OAuth 登录与普通 MCP HTTP transport header 路径不一致的问题，metadata discovery、dynamic registration、凭据恢复和授权后的 MCP 请求共享同一 header 构造链。
- 修复 MCP OAuth callback provider error 只能等待超时的问题，现在会立即通过 `mcp:server_error` 投影到 GUI。
- 修复 MCP GUI 授权页打开绕过 Desktop Host 的问题，登录入口统一走 `openExternalUrlWithSystemBrowser` current 外链网关，不再回退 `window.open`。
- 修复 WebSearch / WebFetch 已完成但最终正文尚未出现时过早折叠的问题，“正在整理最终答复”阶段继续保持搜索过程展开。
- 修复 timeline 已有最终正文但工具状态滞后为 running 时最终答复被吞掉的问题，保证最终正文继续显示在过程之后。
- 修复 Codex 导入态 `web_search_end.output` 丢失、搜索结果噪音外露、完整 URL 外露和松散 Markdown 流式渲染抖动的问题。
- 修复 App Server client contract 中 Agent chat active stream event 同步守卫的 `getThreadItems` 回归，恢复闭包读取当前 session timeline。

### 优化与重构

- 将 MCP manager 拆分为 lifecycle、tools、prompts、resources 和 tests 子模块，`manager.rs` 从巨型文件收敛为连接池、缓存和事件 facade。
- 将 MCP 授权状态、事件 payload、HTTP transport 构造、runtime 命名与工具策略拆到独立模块，避免继续向中心类型文件追加业务逻辑。
- 将 WebSearch 展开态 timeline 抽为 `StreamingWebSearchProcessTimeline`，保留搜索来源、思考、读取页面的原始顺序，同时隐藏传输层 JSON 与完整 URL。
- 将 `StreamingRenderer` WebSearch / Codex 回归测试拆出专项 harness 和 mocks，降低单文件维护体量。
- Agent evidence export 新增 Skill invocation 审计摘要，并把 workspace skill tool call 纳入 completion audit 的 required evidence。
- MCP 管理面补齐五语言授权状态、登录、完成刷新和 unsupported 提示文案。

### 测试与质量

- 扩展 MCP Rust 回归，覆盖 streamable HTTP header、OAuth 配置 fail-closed、动态 OAuth 本地 provider、callback completion、持久 token store、manager 拆分后的 lifecycle / tools / prompts / resources。
- 扩展 App Server protocol schema、schema fixtures、npm client generated types 与 app-server-client 测试，覆盖 `mcpServer/oauth/login`。
- 扩展 MCP 前端 API、`useMcp`、`McpPanel` 和 smoke 脚本测试，覆盖 OAuth 登录打开、completion 自动刷新、unsupported 状态和系统浏览器 current 网关。
- 扩展 Agent Skill runtime / Service Skill / evidence export / thread read model 定向测试，覆盖 skill 选择、运行时 enable、tool invocation evidence 与历史投影。
- 扩展 StreamingRenderer、MessageList、MarkdownRenderer、SearchResultPreview、tool batch grouping、Codex import 和 Playwright CLI 回归，覆盖 WebSearch / WebFetch 折叠、展开、Markdown、顺序和 JSON 隐藏。
- 本版发布事实源统一更新到 `1.75.0`：根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock。

### 文档

- 新增 `internal/exec-plans/mcp-modernization-progress.md`，记录 MCP current 主链、OAuth、GUI 登录、测试证据、剩余缺口和后续 live-gated 项。
- 更新 Turn / Tool 生命周期测试矩阵，补充 WebSearch / WebFetch 折叠展开、synthesizing、Codex Markdown、live WebSearch / WebFetch 和 GUI fixture 验证口径。
- 更新命令边界、执行计划索引、技术债追踪、MCP smoke 脚本说明和相关治理文档。

### 其他

- 本版继续把 MCP、Agent Skill runtime、Service Skill 场景、聊天过程证据和 GUI 冒烟验证收敛到 App Server JSON-RPC / RuntimeCore / Electron Desktop Host current 主链；旧 Tauri / legacy mock / 假 OAuth 支持不作为新增能力入口。

**完整变更**: `v1.74.0` -> `v1.75.0`
