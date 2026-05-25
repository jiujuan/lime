## Lime v1.51.0

### ✨ 新功能
- Managed Objective 支持 agent session 受控空闲自动续跑：turn 成功后自动投递下一轮，受 continuation_policy 约束，达到最大轮数/耗时/成本时置为 budget_limited
- 新增自动续跑守卫机制：guard audit 记录 allow / skip / budget_limited 决策，pending request 置为 needs_input
- 补齐 automation due job 完成审计策略：支持 required_successes / failure_block_after / evidence_pack_ref / artifact_refs，连续成功并具备证据引用时自动标记完成
- 补齐 automation due job 重启恢复契约：服务重启复用原 objective_id，不重建目标或丢失 owner 关系
- 新增 agent_runtime_export_evidence_pack 命令，支持导出 agent session 证据包
- ExecutionTracker 新增 session_id 支持，automation run 可关联到 agent session
- DecisionPanel 支持运行时权限确认请求，区分拒绝/允许状态并显示对应提示文案；新增用户答案记录与确认流
- ToolCallDisplay 新增命令执行摘要面板，展示命令、工作目录、退出码、输出大小、沙箱状态等信息
- AgentThreadTimelineArtifactCard 支持快照、Diff、验证问题等元数据徽章
- Markdown 代码块显示行数与语言标签，提升可读性
- 工具偏好系统新增 subagent 偏好支持，与执行策略联动；代码编排策略下自动应用工具偏好与团队预设默认值
- 执行策略标签从「计划」改为「编程」
- 工具结果支持自动保存到项目、Markdown 导出与内容预览；搜索结果支持分组与批量展开
- 扩展 @代码 命令触发词（@code、@coding、@开发 等），并新增 mention 命令前缀匹配工具，支持多触发词、规范化匹配与边界检测
- 新增 live provider smoke 防护机制：通过 --allow-live-provider 标志与环境变量控制真实 API 调用，避免误耗额度
- 新增 vitest 网络守卫（vitest-network-guard），拦截外部 HTTP/HTTPS 请求，仅放行本地请求；vite.config.ts 自动注入 setupFiles 并条件排除 *.live.test.*
- 11 个 smoke 脚本（agent-apps-smoke、claw-chat-ready-streaming、design-canvas-smoke 等）统一集成 --allow-live-provider 选项

### 🐛 修复
- test_image_api.py 改为 dry run 模式，默认不发送真实 API 请求，需显式 opt-in
- knowledge-provider-e2e.mjs 统一使用 --allow-live-provider 标志替代 --allow-external-provider

### 🔧 优化与重构
- 拆分 automation agent turn 组包逻辑到 agent_turn_runtime_request.rs，并将 completion policy 解析提取到独立模块
- 重构 dev_bridge dispatcher 中的 objective 处理逻辑，提取到独立模块简化主流程
- 代码工作台命令解析统一使用通用 mention 前缀匹配，移除前端任务类型推断

### 🧪 测试与质量
- 新增 14 条 objective continuation 定向测试，覆盖 auto guard 决策、budget limit、pending request、interrupt marker 等停止条件
- 新增 managed objective 实现守卫：禁止 goal_runtime / objective_scheduler / objective_queue / objective_evidence_pack 等 parallel runtime 命名出现在实现代码
- 补齐 continuation smoke 非 live fixture 回归：buildSmokeEvidence 要求 budget_limited / guard summary / completion audit / 至少两轮 turn 同时满足
- 新增 runtime_evidence_pack_owner_session_tests 与 runtime_skill_binding_service_tests
- 统一 E2E 真实 API 调用控制，通过 LIME_REAL_API_TEST 环境变量管理 Tetrate、embedding、ASR 等联网测试
- run-vitest-smart.mjs 增强智能过滤，默认跳过 live provider 测试
- 新增自动化目标摘要组件测试，验证 UI 展示后端状态而非推断完成状态

### 📚 文档
- 明确 @代码 命令语义：由运行时而非前端判断任务类型，前端不维护任务类型词表
- 建立 live provider smoke 测试隔离策略：默认不消耗真实模型额度，需显式 opt-in
- 更新 QC 场景入口：claw-chat-ready-streaming 与 tool-approval-sandbox-boundary 需显式允许 live provider

### 📦 其他
- 新增 app-version.d.mts 类型定义，导出 readCargoVersions 与 readWorkspaceAppVersion 函数签名

**完整变更**: `v1.50.0` -> `v1.51.0`
