## Lime v1.70.0

### 新功能
- Agent 会话列表新增按工作目录过滤能力，App Server 协议、schema、Rust runtime、Projection DB 与前端侧边栏会话列表同步支持按当前项目 root path 收敛最近对话。
- Projection Store 承接会话更新、批量归档、会话标题推导和 metadata 持久化，历史会话列表、归档状态和标题展示进一步收敛到 App Server current 读模型。
- Coding Workbench 增加更完整的任务中心运行控制、任务轨、文件变更卡片和工作台投影适配，常规工作台与编码工作台共用更稳定的任务上下文。
- App Server / Agent Runtime 事件投影新增 tool args、tool input/output delta、tool progress、file.read、command.started/output/exited 等事件映射，前端工具轨迹和命令输出展示能消费更细粒度的 current 事件。

### 修复
- 修复侧边栏会话打开时项目归属不稳定的问题，按会话 `working_dir` 反查已打开项目，避免跨项目最近对话误跳转。
- 修复会话标题为空时的展示退化逻辑，优先从首条用户消息推导标题，降低历史会话和投影会话的无标题噪声。
- 修复 App Server host 进程启动和 readiness 探测边界，移除不再需要的旧 current timeline / legacy message backfill 产品 fallback。
- 修复 agent session list / update / archive 在 projection-first 路径下的读写一致性，缺失投影时直接暴露未找到而不是回落旧产品路径。

### 优化与重构
- Product DB 清理继续推进：`agent_messages`、旧 thread item/outcome/incident、A2UI form 等 retired runtime 表从 schema 创建路径移除，并增加 drop 入口防止旧表继续成为产品事实源。
- App Server runtime 删除 `current_timeline` 与 legacy message backfill 旧桥，session list / hydrate / archive 统一走 event log、Projection DB 和 RuntimeCore current owner。
- App Sidebar 拆掉侧边栏内语言/外观弹层残留，账号、设置、更新和会话列表区域进一步收敛到当前侧边栏职责。
- Agent Chat / Workbench 多个组件继续抽出 ViewModel、projection helper 和 runtime hook，降低 UI 组件中的状态机和格式化逻辑。
- Coding 与 DB 路线图更新到 2026-06-15 状态，补齐 S3 legacy migration 状态机、S4/S5 可执行切分和 current owner 边界。

### 测试与质量
- 扩展 App Server protocol schema、app-server-client、session list cwd filter、projection update/archive、session title 和 thread client 事件投影回归。
- 扩展 Electron session history fixture、code artifact workbench fixture、claw chat current fixture 和 App Server contract guard，覆盖新的 projection-first 会话路径。
- 扩展 App Sidebar、Agent Chat、Task Center、Canvas Workbench、MessageList、Inputbar 和 i18n 五语言资源回归。
- 扩展 Rust agent tool orchestrator、session store、runtime backend coding events、Projection DB、legacy boundary 与 Product DB schema 清理测试。
- 根应用、Rust workspace、CLI npm package、App Server client package、Agent Runtime client 依赖、pnpm lock 与 Cargo lock 版本统一更新到 `1.70.0`。

### 文档
- 更新数据库瘦身 PRD、执行计划和技术债追踪，明确 `agent_messages` / legacy DAO / current timeline 退场策略、迁移状态机与后续 drop 条件。
- 更新 Coding Workbench 路线图和实现计划，记录 execution process policy 后续、Agent Workspace 工作台拆分和任务中心投影进展。
- 新增 Agent Workspace 路线图资料和 package 边界说明，沉淀 Agent capability catalog / workbench adapter 的包级 owner。

### 其他
- 本版继续把会话历史、工作台投影、编码任务、工具轨迹和数据库治理收敛到 App Server JSON-RPC、RuntimeCore、Projection DB、Electron Desktop Host、current npm clients、checked-in schema 与机器可读守卫。

**完整变更**: `v1.69.0` -> `v1.70.0`
