## Lime v1.72.0

### 新功能

- 新增多模型 / 多模态统一运行时主线的首批强类型合同：模型、Provider、Provider Key、任务能力、路由决策、失败分类和可执行模型路由都进入 App Server protocol / schema / TS client。
- 媒体任务开始写入标准 `ModelTaskRequest`、`ResolvedModelRoute`、`RouteFailure` 与 `model_route_execution` evidence，图片 / 视频任务可复用统一路由语义。
- Codex 本地历史导入补齐真实点击闭环：导入后的 Markdown、HTML、DOCX 和图片附件可从工具轨进入 current Canvas Workbench 预览。
- 新增真实长样本本地历史导入视觉审计 smoke，覆盖大规模 Codex rollout 导入后的消息列表、timeline、输入框、截图和泄漏边界。

### 修复

- 修复 Codex 导入在跨重启后重复导入同一 source thread 的问题；导入业务引用现在可从 projection hydrate 恢复并复用既有 session。
- 修复导入计划、reasoning、命令、patch、web search、approval 和 `read_file` 参数在历史 hydrate 后丢失或展示不完整的问题。
- 修复 Canvas Workbench 在预览请求早于 artifact 入库时误判已处理，导致 HTML / 文件预览停留在上一份 artifact 的竞态。
- 修复 `@配音` / voice generation 把 TTS preferred provider/model 误提升为聊天 turn 模型覆盖的问题，避免把音频偏好伪装成聊天路由。
- 修复图片工作台草稿重试从 `runtimeContract` 展示元数据恢复 provider/model 的问题，新任务重新交给 App Server RouteResolver 决策。

### 优化与重构

- Provider 与模型 API 从 raw JSON 投影收敛到 typed App Server DTO，前端网关只做 UI view model 投影，不再把 App Server 原始对象透传给页面。
- App Server route 组装拆出 `model_task_contract`、`model_route_assembly`、`model_route_execution` 和媒体 runtime contract builder，减少聊天、媒体和列表索引中的重复 JSON 拼装。
- `runtime_contract` 降级为 GUI / Skill 元数据展示 contract；真正可执行路由只认 `model_task_request` / `resolved_route` / `model_route_execution`。
- 侧栏会话导入和会话菜单继续拆分到独立 controller / view model / menu 组件，降低 `AppSidebarConversationShelf` 的体量和耦合。
- Codex 导入 smoke helper 拆到 `scripts/electron/lib/`，点击闭环脚本保留场景编排，公共 GUI / App Server helper 复用。

### 测试与质量

- 扩展 App Server protocol schema、app-server-client 生成物、模型 Provider API、RouteResolver、媒体 route execution、conversation import 和 read model 回归。
- 新增 / 更新 Codex import continuation、click-through、local-history visual audit、real-sample visual audit、artifact preview、Canvas Workbench、AppSidebar 和媒体工作台回归。
- 增强 `npm run test:contracts`，把 protocol type check 纳入契约入口。
- 增强 modality runtime governance，metadata-only voice contract 禁止声明 current executor 或 `executor_invoked`，防止假音频 worker 回流。
- 根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock 的发布版本统一更新到 `1.72.0`。

### 文档

- 新增多模型多模态统一运行时 PRD 与执行计划，明确 typed catalog、RouteResolver、canonical LLM runtime 和媒体任务复用路线。
- 更新 Codex 导入实施跟踪与进度文档，记录真实文件预览、导入来源边界、视觉审计和组件拆分状态。
- 更新 Warp / modality / quality / command 边界文档，把 voice generation 当前口径收敛为 metadata-only，避免继续宣称不存在的音频 worker。
- 更新 refactor 与 artifact roadmap 文档，沉淀 current owner、模块拆分和后续治理入口。

### 其他

- 本版继续把模型、Provider、媒体任务和历史导入能力收敛到 App Server JSON-RPC / RuntimeCore current 主链；旧 Tauri wrapper、renderer 本地扫描、假执行器和并列 runtime route 不再作为新增能力入口。

**完整变更**: `v1.71.0` -> `v1.72.0`
