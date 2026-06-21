## Lime v1.76.0

### 新功能

- MCP current 控制面新增 resource templates 投影：`mcpResource/list` 继续返回 resources，同时返回 `resourceTemplates`，前端新增 `listResourcesWithTemplates()` 读取同一 App Server JSON-RPC 主链。
- MCP 工具结果新增 `outputSchema` / `structuredContent` 端到端保留：`mcpTool/list`、`mcpTool/listForContext`、`mcpTool/search`、`mcpTool/call` 与 Agent Chat read model 都能保留结构化结果事实。
- Agent Skill runtime 新增 `skill_search` 元数据检索工具，只返回 Skill 名称、作用域、locator 与匹配理由，不默认读取 `SKILL.md` 正文或扩大工具权限。
- 专家与 Skills 工作台新增 Agent Skill runtime 接线：专家 `skillRefs` 会进入候选提示和排序线索，Skills 工作台可把 workspace Skill 作为本轮运行时启用 metadata 发送到 Agent turn。
- Evidence export 新增 Skill search、Skill invocation 与 MCP structuredContent 观测摘要，方便发布和回放证据包审计当前 runtime 行为。

### 修复

- 修复 MCP / Service Skill / SkillTool 结果在聊天里暴露 `request_metadata`、`diagnostics`、`metadata` 等协议包络的问题，GUI 优先展示结构化结果中的用户正文。
- 修复 MCP `structuredContent` 在 runtime event、read model、历史 hydrate、完整工具卡和内联过程卡之间丢失的问题。
- 修复 MCP OAuth 本地 loopback 场景受系统代理影响的问题，并把 callback 后 token exchange 纳入同一登录超时窗口。
- 修复历史 timeline 中未知 runtime item 直接展开原始 JSON 的问题，改为用户态 unsupported item 提示并补齐五语言文案。
- 修复 App Server client contract 对 MCP current smoke 的覆盖缺口，把旧 MCP Desktop facade 回流和 structuredContent 断言纳入统一契约入口。

### 优化与重构

- 拆分聊天渲染链超大文件：`MessageList`、`MarkdownRenderer`、`StreamingRenderer`、`ToolCallDisplay`、`InlineToolProcessStep`、`AgentThreadTimeline` 与投影 / history / grouping helper 均按职责拆到更小模块。
- 拆分 Skills 工作台页面，把 copy、content、view、visual、默认 project、detail content 与 runtime launch 参数构造分离，降低页面组件职责。
- 拆分 App Server evidence provider observability 逻辑，Skill invocation / Skill search / MCP tool result 摘要各自收敛到独立投影函数。
- MCP manager 继续按 resources / tools 子模块演进，resource templates 与 tool result schema 的转换逻辑不再回塞中心文件。
- 前端工具结果展示增加协议包络识别 helper，同时保留命令类工具 JSON stdout，避免把真实命令输出误判为诊断包络。

### 测试与质量

- 更新 App Server protocol schema fixtures、`packages/app-server-client` generated types 与 MCP 前端 API 测试，覆盖 `resourceTemplates` 和 `structuredContent`。
- 扩展 MCP current smoke 与 contract guard，覆盖 `outputSchemaStructuredContentSeen`、`structuredContentEcho`、resource templates、legacy MCP command 禁回流。
- 扩展真实 Electron fixture：`smoke:claw-chat-current-fixture -- --scenario mcp-structured-content` 验证 MCP structuredContent 在 Agent Chat GUI 可见且协议包络不外泄。
- 扩展 Agent Skill runtime fixture，覆盖普通 Skills runtime、显式 Skill、手动启用 workspace Skill、专家 Skill refs 与专家面板 Skill refs。
- 扩展 MarkdownRenderer、StreamingRenderer、MessageList、ToolCallDisplay、InlineToolProcessStep、AgentThreadTimeline、SkillsWorkspacePage、专家 Skill runtime 候选与 i18n 回归。
- 本版发布事实源统一更新到 `1.76.0`：根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock。

### 文档

- 更新 MCP current 控制面边界，明确 `src/lib/api/mcp.ts -> AppServerClient.request(...) -> app_server_handle_json_lines -> App Server JSON-RPC -> lime-rs/crates/mcp` 为唯一主链。
- 更新 MCP modernization 执行计划，记录 structuredContent、resource templates、Electron fixture、contract guard 与剩余 live-gated 缺口。
- 更新 Turn / Tool 生命周期测试矩阵，记录协议包络隐藏、渲染链拆分、MessageList / projection 拆分和 GUI smoke 证据。
- 更新性能 profiling 与脚本文档，把旧 `mcp_*` / `get_mcp_servers` 示例收口为 current App Server method。

### 其他

- 本版继续把 MCP、Agent Skill runtime、专家 Skill 绑定、聊天过程证据和 GUI 冒烟验证收敛到 App Server JSON-RPC / RuntimeCore / Electron Desktop Host current 主链；旧 MCP Desktop facade、legacy mock 与协议包络展示不作为新增能力入口。

**完整变更**: `v1.75.0` -> `v1.76.0`
