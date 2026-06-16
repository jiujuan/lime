# Agent Workspace MCP 评分卡

> 当前静态分：`3.4 / 5`  
> 更新时间：2026-06-15  
> 目标：把 MCP 作为 Agent Workspace 的独立协议与集成能力评测，而不是把它折叠成“动态工具”或 `mcp__*` 工具名列表。这里评估的是 MCP server 如何配置、连接、授权、暴露 tools/resources/prompts、进入 Agent Runtime、被 UI 观察、被 Evidence 回放、被安全治理。

## 1. 为什么 MCP 必须独立评分

MCP 不是普通 tool family。它至少包含四层对象：

| 对象 | 回答的问题 | 评测重点 |
| --- | --- | --- |
| MCP Server | 外部系统如何接入，怎么启动、认证、声明能力 | transport、startup、OAuth/bearer/env、server instructions、capabilities、required/enabled |
| MCP Primitives | server 暴露了什么协议能力 | tools、resources、resource templates、prompts、roots、sampling、elicitation、logging、progress |
| Runtime Tool Projection | MCP 能力如何进入 Agent Runtime | `mcp__<server>__<tool>` 命名、caller allowlist、deferred loading、tool search、context visibility |
| Product UI / Evidence | 用户如何理解、授权、调试和复盘 | server status、tool schema、resource preview、prompt args、approval、logs、trajectory、artifact refs |

因此 `tools-skill-ui.md` 只应评价 `mcp__*` 动态工具、`ListMcpResourcesTool`、`ReadMcpResourceTool` 的 **工具卡渲染**。完整 MCP 系统必须单独看配置、连接、capability negotiation、工具/资源/提示词边界、授权、server health、runtime inventory、GUI 管理与 evidence。

## 2. 外部标准与 Codex 对标

| 来源 | 本轮采用的标准 | 对 Lime 的约束 |
| --- | --- | --- |
| MCP specification `2025-11-25` | MCP lifecycle 固定为 `initialize` -> `initialized` -> operation -> disconnect；server capability 声明决定可用 primitives | Lime UI 必须能展示 server 是否初始化、协议版本、capabilities、startup failure、required server fail closed |
| MCP tools | `tools/list`、`tools/call`、`notifications/tools/list_changed`；tool 有 `inputSchema` 与 annotations | 不能只显示工具名；必须展示 schema、server、caller、side-effect 风险、list changed 后刷新 |
| MCP resources | `resources/list`、`resources/read`、`notifications/resources/list_changed`，并有 resource templates / subscriptions 语义 | 资源要有 URI、mime、preview/offload、引用证据；不能混成普通 WebFetch |
| MCP prompts | `prompts/list`、`prompts/get`、`notifications/prompts/list_changed` | Prompt 是 workflow template，不是聊天输入；要显示参数、消息内容、来源 server |
| MCP roots / sampling / elicitation | `notifications/roots/list_changed`、`sampling/createMessage`、elicitation form/url | 根目录边界、模型采样、用户补参/授权都需要显式 UI 和安全策略 |
| MCP authorization / security | OAuth / PKCE、protected resource metadata；敏感信息必须走 URL 模式；tool/data access 需 user consent | 远程 server 认证、scope、token 存储、decline/cancel、目标域名、secret redaction 都要评分 |
| Codex manual | Codex 支持 STDIO 和 streamable HTTP、bearer/OAuth、server instructions、`config.toml`、project config、`codex mcp` CLI、`/mcp` 状态、enabled/disabled tools、approval mode、plugin-provided MCP | Lime 应对标：共享配置、server 状态页、启动/停止、工具策略、插件/Skill 依赖、server instructions 与第一屏摘要 |
| Codex 本地源码 | `codex-mcp`、`rmcp-client`、`core/src/session/mcp.rs`、`mcp_tool_call.rs`、`mcp_resource/*`、`app-server/tests/suite/v2/mcp_*`、TUI MCP snapshots | Lime 需要覆盖 server startup、tool call、resource helper、elicitation approval、OAuth、telemetry、sensitive output masking |
| AG-UI / AI SDK | 工具调用、progress、error、approval 需要 typed parts / lifecycle events | MCP tool call 和 resource read 要进入统一 timeline，而不是 raw JSON |

参考链接：

- https://modelcontextprotocol.io/specification/2025-11-25
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
- https://modelcontextprotocol.io/specification/2025-11-25/client/roots
- https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
- https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://developers.openai.com/codex/mcp

## 3. Lime MCP 事实源地图

| 层级 | Lime 事实源 | 当前结论 |
| --- | --- | --- |
| 工程标准 | `internal/aiprompts/mcp.md` | 已明确 MCP 新能力默认收敛到 App Server JSON-RPC 与 Agent runtime；旧 Tauri wrapper 不再承接事实 |
| 前端管理 UI | `src/components/mcp/**` | 有 `McpPanel`、`McpPage`、server list、tools browser、tool caller、prompts browser、resources browser |
| Hooks | `src/hooks/useMcp.ts`、`useMcpServers.ts` | 有 runtime 状态、工具/提示词/资源刷新、启动/停止、调用、导入/同步 |
| 前端 API | `src/lib/api/mcp.ts` | current App Server gateway 覆盖 server CRUD、enabled set、import/sync、status/start/stop、tool list/search/call、prompt list/get、resource list/read |
| App Server 协议 | `packages/app-server-client/src/protocol.ts`、`lime-rs/crates/app-server-protocol/src/protocol/v0/mcp.rs` | current 方法包括 `mcpServer/*`、`mcpServerStatus/list`、`mcpTool/*`、`mcpPrompt/*`、`mcpResource/*` |
| App Server 实现 | `lime-rs/crates/app-server/src/processor/mcp.rs`、`runtime/mcp.rs`、`runtime/app_data/mcp.rs` | MCP processor 与 runtime 已进入 App Server current 主链 |
| Rust MCP crate | `lime-rs/crates/mcp/src/manager.rs`、`client.rs`、`types.rs`、`tool_converter.rs` | 有 connection manager、stdio 启停、工具名正规化、工具/提示词/资源调用、progress/logging handler |
| Agent Runtime | `lime-rs/crates/agent/src/mcp_bridge.rs`、`agent_tools/inventory.rs`、`ToolSearch`、`ListMcpResourcesTool`、`ReadMcpResourceTool` | 动态 MCP 工具和 resource helper 已能进入 tool inventory / tool UI 分类 |
| Browser MCP | `mcp__lime-browser__*`、`chrome_mcp/**` | BrowserAssist 通过 MCP tool naming 进入 agent workspace；需要轨迹和截图证据 |
| 测试 | `src/lib/api/mcp*.test.ts`、`useMcp*.test.tsx`、`McpPanel.test.tsx`、`McpToolsBrowser.test.tsx`、`toolNameFamily.unit.test.ts`、Rust MCP tests | 有 App Server fail-closed、hooks、组件、动态工具分类和 Rust 单测覆盖 |
| Smoke | `scripts/mcp/current-smoke.mjs` | current smoke 验证 read methods、可选 stdio fixture、tool call、resource read、legacy command 防回流 |

## 4. 端到端能力链评分

| 能力链路 | 当前分 | 已有证据 | 主要缺口 | 5 分标准 |
| --- | ---: | --- | --- | --- |
| Server 配置与导入 | 3.6 | `mcpServer/list/create/update/delete/enabled/set/importFromApp/syncAllToLive`、`useMcpServers` 测试 | 缺 Codex 风格 project/user config 合并视图、plugin-provided MCP、env secret 健康检查 | server 来源、scope、transport、env、enabled app、sync 状态、冲突和回滚全可见 |
| Lifecycle / Status | 3.5 | `mcpServerStatus/list`、`start/stop`、Rust manager startup/stop、current smoke fixture | 缺 protocol version、initialize capabilities、server instructions、required startup fail UI | 每个 server 有 initializing/running/failed/stopped、stderr、安全摘要、重启/停止/诊断 |
| Tools discovery | 3.6 | `mcpTool/list`、`listForContext`、`search`、`deferred_loading`、`allowed_callers`、tool search tests | 缺 `notifications/tools/list_changed` 实测、annotation/side-effect UI、tool policy editor | 工具列表按 server/schema/tags/caller/policy/deferred 可查，变化自动刷新 |
| Tool call execution | 3.3 | `mcpTool/call`、`callWithCaller`、ToolCallDisplay family、MCP dynamic tool classification | 缺 approval mode、progress token、cancel、timeout、large output/offload 的 GUI evidence | tool args/result/error/progress/approval/timeout 全进入 timeline 和 Evidence |
| Resources | 3.2 | `mcpResource/list/read`、`ListMcpResourcesTool`、`ReadMcpResourceTool`、resource browser | 缺 resource templates、subscribe/list_changed、mime preview/offload、最终引用验证 | URI、mime、preview、blob/text、安全来源、引用、订阅变化全部可回放 |
| Prompts | 3.1 | `mcpPrompt/list/get`、prompts browser、prompt result schema guard | Prompt 与 composer / skill workflow 未闭环；缺参数表单和来源解释 evidence | prompt template 可选择、补参、预览、插入/运行、回放，且与 Skill 不混淆 |
| Roots / Workspace boundary | 2.4 | Rust/aster MCP roots 存在；Lime product UI 证据弱 | 缺 roots/list_changed、workspace root 可见性和安全边界 UI | 明确展示哪些 workspace roots 暴露给哪个 server，变更有通知和审计 |
| Sampling | 1.8 | Rust/aster sampling tests 存在；Lime Agent Workspace product evidence 弱 | 缺 client sampling capability UI、server-initiated sampling approval、prompt visibility | 任何 sampling 请求都需显式可审计，用户知道 server 看到什么上下文 |
| Elicitation / HITL | 2.4 | Codex 有强参考；Lime 目前本地 evidence 弱 | 缺 MCP elicitation form/url、decline/cancel、目标域名、安全文本 | form/url elicitation 有审批、表单预览、敏感字段禁止、URL 目标域名提示 |
| Auth / OAuth / Secrets | 2.5 | API 层可管理 server config；smoke 有 secret redaction | 缺 OAuth login flow、token store、scope、expiry、reauth UI | bearer/OAuth/PKCE、scope、token 存储、过期、撤销和 secret redaction 全可见 |
| Agent Workspace integration | 3.4 | 动态 MCP tool family、browser MCP、ToolSearch、tool inventory、projection tests | MCP server status 与工具卡、runtime inventory、final evidence 尚未完全同屏 | agent 能解释可见 MCP 来源、选择原因、调用轨迹、结果引用和失败 |
| Evidence / Telemetry | 2.9 | current smoke 写 evidence；Codex 有 mcp tool call telemetry 对标 | 缺 MCP 专项 evidence pack schema、server/tool/resource/prompt counters | 每次 MCP 任务保存 server version、tool schema hash、args、result refs、approval、verdict |
| Security / Governance | 3.0 | legacy command 防回流、fail-closed tests、secret sanitize | 缺 tool poisoning、server instructions 风险、annotation policy、remote trust boundary | 默认最小权限，危险 tools 需要审批，server instructions 透明，输出和 secrets 防泄漏 |

## 5. MCP Inventory 评分口径

| 类别 | 当前事实源 | 静态分 | 必须补证 |
| --- | --- | ---: | --- |
| Fixed MCP helpers | `ListMcpResourcesTool`、`ReadMcpResourceTool` | 3.2 | resource URI、mime、preview/offload、引用回放 |
| Dynamic runtime tools | `mcp__<server>__<tool>` | 3.4 | 每次评测保存 `agentSession/toolInventory/read` snapshot、caller policy、tool schema |
| Browser MCP tools | `mcp__lime-browser__*` | 3.6 | WebArena / OSWorld 风格 trajectory、截图、cleanup |
| MCP management UI | `src/components/mcp/**` | 3.5 | 真实桌面 E2E、server failure、schema 参数表单、auth 状态 |
| MCP App Server API | `mcpServer/*`、`mcpTool/*`、`mcpPrompt/*`、`mcpResource/*` | 3.8 | required / auth / protocol capability 细节与 GUI 绑定 |
| MCP runtime manager | `lime-rs/crates/mcp/src/manager.rs` | 3.5 | streamable HTTP / OAuth / list_changed / elicitation 的 current 产品证据 |
| Legacy boundary | `scripts/mcp/current-smoke.mjs` | 4.0 | 把 smoke evidence 接入 release gate 和路线图 P0 |

## 6. P0 评测矩阵

| 场景 | 覆盖链路 | 必须证明 |
| --- | --- | --- |
| `mcp-current-boundary` | App Server / legacy guard | `mcpServer/*`、`mcpTool/*`、`mcpPrompt/*`、`mcpResource/*` 走 current JSON-RPC；legacy Tauri command 不回流 |
| `mcp-stdio-fixture-lifecycle` | server lifecycle | 创建临时 stdio server、start、status、tool list、stop、delete，stderr / failure 可见 |
| `mcp-tool-call-with-caller` | runtime policy | `listForContext`、`search`、`callWithCaller` 能按 caller 过滤，拒绝未授权 caller |
| `mcp-resource-read-grounding` | resources | list/read resource、preview/offload、最终答案引用同一个 URI |
| `mcp-prompt-get-to-composer` | prompts | list/get prompt、参数补全、插入 composer 或 Skill workflow，并保留来源 server |
| `mcp-browser-task` | Browser MCP | `mcp__lime-browser__*` 执行真实页面任务，保留操作轨迹、截图/snapshot、cleanup |
| `mcp-auth-elicitation` | auth / HITL | OAuth / URL elicitation / form elicitation 有 server identity、target domain、decline/cancel、review |
| `mcp-large-output-safety` | output / security | 大结果不刷屏，secret redaction、生效的 offload/ref、copy diagnostics 可见 |
| `mcp-list-changed-refresh` | protocol notifications | tools/resources/prompts list changed 后 UI 和 runtime inventory 自动刷新 |
| `mcp-skill-dependency` | Skill + MCP | Skill `agents/openai.yaml` 依赖 MCP server，安装/启用/运行链路可证 |
| `mcp-evidence-pack` | evidence / replay | server config hash、capabilities、tool schema hash、args、result、approval、artifact refs、verdict 可回放 |

## 7. 失败模式分类

| 失败模式 | 现象 | 判定方式 | 应归属 |
| --- | --- | --- | --- |
| Server 未初始化 | UI 显示可用但工具调用失败 | status / initialize / capabilities 缺失 | Lifecycle |
| Tool list 漂移 | runtime 能调的工具和 UI 列表不一致 | `toolInventory` 与 `mcpTool/listForContext` 对比 | Discovery |
| Caller 绕过 | 未授权 caller 能调用工具 | `callWithCaller` negative case | Policy |
| Resource 黑盒 | 资源被读到但最终证据无 URI | transcript / evidence 缺 resource refs | Resources |
| Prompt 混淆 | MCP prompt 被当普通用户输入或 Skill | prompt get / composer provenance 缺失 | Prompts |
| Auth 死路 | server 需要 OAuth 但 UI 无登录/重试 | auth status / 401 / elicitation 无处理 | Auth |
| 过度授权 | destructive 或 remote action 未审批 | annotations / approval policy 缺失 | Security |
| Tool poisoning | server instructions/tool description 诱导越权 | server instructions 未透明展示或未隔离 | Security |
| 大输出失控 | MCP 返回大 JSON / blob 刷屏或吞结果 | offload / preview / truncation 失败 | UI / Evidence |
| 兼容回流 | 旧 MCP facade command 被恢复 | current boundary smoke 失败 | Governance |

## 8. 下一刀

| 优先级 | 工作项 | 主线收益 |
| --- | --- | --- |
| P0 | 把 `scripts/mcp/current-smoke.mjs --allow-write-fixture` 固定为 MCP current evidence pack | 先证明 MCP current 主链不是假入口 |
| P0 | 在 Agent Workspace tool inventory 中保存 MCP snapshot：server、tool schema、caller、visible、deferred | 解决动态 MCP 工具不可复核的问题 |
| P0 | 补 `mcp-resource-read-grounding` 与 `mcp-browser-task` 两个 GUI 证据场景 | 覆盖资源引用和 browser MCP 的高影响路径 |
| P1 | MCP 管理页增加 server instructions、protocol version、capabilities、auth status、required/enabled policy | 对标 Codex `/mcp` 状态和 config 可解释性 |
| P1 | 增加 MCP approval / elicitation UI 设计与 smoke | 补齐安全边界，避免 remote tools 隐式越权 |
| P1 | 将 Skill dependency 中的 MCP server 健康接入 SkillsPage / Skill 执行前检查 | 打通 Skill + MCP，而不是两套孤立系统 |
| P2 | 支持 list_changed / resource templates / subscriptions 的端到端 evidence | 对齐 MCP 完整协议能力 |

## 9. 结论

Lime 的 MCP 底座已经超过“工具名列表”：有 App Server current API、Rust MCP manager、前端 MCP 管理面板、tools/prompts/resources 浏览器、runtime 动态工具分类、browser MCP、current smoke 和 legacy guard。当前 `3.4 / 5` 的主要扣分点是：协议高级能力和安全体验还没有产品化，尤其是 OAuth / elicitation、server instructions、capability negotiation、list_changed、resource templates、caller policy UI、MCP 专项 Evidence Pack。

要升到 `4.0+`，优先做 current smoke evidence pack、runtime inventory snapshot、resource grounding 和 browser MCP GUI 证据，而不是继续把 MCP 当工具表的一行扩展。
