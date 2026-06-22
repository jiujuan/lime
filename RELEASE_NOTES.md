## Lime v1.77.0

### 新功能

- MCP current 控制面继续扩展资源能力：新增 `mcpResource/subscribe` / `mcpResource/unsubscribe`，GUI 资源预览在打开、切换和关闭时自动订阅 / 退订标准 MCP resource subscription。
- MCP streamable HTTP 与 OAuth 链路补齐 Context7 preset、系统浏览器授权、callback 完成事件、持久 token store、resource templates、resource updated 通知和 live-gated smoke 入口。
- Agent Workspace 的 `agentSession/toolInventory/read` 接入 MCP current snapshot，动态 `mcp__<server>__<tool>` 工具、MCP server 状态和 resource helper 可进入 Agent runtime inventory。
- Agent Skills Runtime 专家闭环完成 deterministic 主链：专家 `skillRefs` 可触发 selector、`SKILL.md` body read、turn-scoped `LimeSkillTool` allowlist、skill invocation 与 evidence pack 复盘。
- Right Surface 统一承载骨架落地：专家信息、workbench、files、shell、harness、objectCanvas 候选进入统一 registry / controller / scheduler / intent queue / toolbar projection。
- Skills 工作台新增项目级 scaffold 创建链路，会写 `.lime/registration.json` 并刷新 `workspaceSkillBindings/list` readiness，用于专家缺失技能的恢复入口。

### 修复

- 修复专家信息面板与画布 / 抓夹入口并排出现的问题，专家信息迁入统一 Right Surface 后与当前右侧工作面互斥。
- 修复 current tool item lifecycle 与 legacy tool terminal 冲突时可能把已完成成功结果覆盖为失败的问题，冲突现在进入诊断而不改写最终 success。
- 修复拆分后的 Claw / Agent runtime fixture 漏导入问题，`cancel-then-continue`、Skills runtime 和 WebTools 渲染场景均重新跑通。
- 修复 MCP 资源读取 evidence 只停留在后端摘要的问题，GUI Evidence Pack 现在展示 server、URI、mime、content refs 和读取状态摘要。
- 修复 MCP 事件在浏览器模式下可能静默走 mock fallback 的风险，`mcp:` 事件前缀已进入禁止 mock event fallback 守卫。

### 优化与重构

- 拆分 MCP GUI 设置页与运行面板：`McpPage`、`McpPanel`、server list、tools、prompts、resources 均下沉 view model / 子组件，减少单文件职责。
- 拆分 MCP smoke 与 contract guard：`scripts/mcp/current-smoke.mjs`、`scripts/check-app-server-client-contract.mjs` 的 MCP 逻辑下沉到 `scripts/mcp/lib/**`。
- 拆分 Agent Runtime / Claw fixture：大型 Electron fixture 入口拆到 assertion、GUI action、session、read model waits、tool waits 等职责模块。
- 拆分 App Server runtime 测试大文件：`coding_events`、`external_events`、`evidence_exports`、`read_model` 改为 facade + 子模块目录。
- 收口 MCP desktop-host 默认 mock：删除 `src/lib/desktop-host/mcpMocks.*`，并用命令契约守卫防止旧 MCP facade 和 mock loader 回流。
- MCP 前端 API 网关拆出 `mcpTypes.ts` / `mcpResponseGuards.ts`，`mcp.ts` 继续保留兼容 re-export 与 current JSON-RPC API 方法。

### 测试与质量

- 新增 / 扩展 MCP resource subscription、resource preview、Context7 preset、OAuth、resource evidence、inventory snapshot、GUI event bridge 与 legacy facade 禁回流测试。
- `smoke:agent-runtime-current-fixture` 聚合覆盖 history/cache hydration、流式完成控制器、Coding Workbench、停止后继续、Skills Runtime、MCP structuredContent、Expert Skills / Plaza / Panel。
- `smoke:expert-skills-live-gate` 落地为专家 Skills 只读验收门禁：默认审计 deterministic evidence，缺 live summary 时明确返回 `pending_live_provider`。
- App Server protocol schema fixtures、`packages/app-server-client` generated types、MCP API 测试和 contract guard 同步新增 resource subscribe / unsubscribe。
- Right Surface 纯模型、toolbar projection、Workspace 透传、专家 full surface 和页面级工作台回归已补定向 Vitest。
- 本版发布事实源统一更新到 `1.77.0`：根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock。

### 文档

- 更新 MCP current 文档，把 server / tools / prompts / resources / OAuth / subscriptions 全部收敛到 App Server JSON-RPC -> `lime-rs/crates/mcp` 主链。
- 更新服务层导航，删除旧 `lime-rs/src/services/mcp_service.rs` 现役表述，MCP owner 指向 `lime-rs/crates/mcp` 与 App Server `mcp*` methods。
- 新增 Right Surface 路线图与实施进度，记录专家栏统一承载、registry / controller / scheduler / intent queue 和剩余 App Server contract 缺口。
- 更新 Agent Skills runtime 状态文档，明确 P0-P5 runtime 骨架已完成，后续重点转向 live Provider gated 验收。
- 更新 MCP 现代化执行计划，记录 OAuth、resource subscription、resource preview、inventory snapshot、Evidence Pack、fixture 拆分与 GUI smoke 证据。

### 其他

- 本版继续把 MCP、Agent Skills、Right Surface、聊天过程证据和 GUI 冒烟验证收敛到 App Server JSON-RPC / RuntimeCore / Electron Desktop Host current 主链；旧 MCP Desktop facade、desktop-host MCP mock、legacy runtime fallback 不作为新增能力入口。

**完整变更**: `v1.76.0` -> `v1.77.0`
