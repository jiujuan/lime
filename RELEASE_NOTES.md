## Lime v1.69.0

### 新功能
- 新增 App Server `executionProcess/*` JSON-RPC 能力，覆盖进程启动、状态读取、输出 drain、stdin 写入、中断与终止，并同步 schema、protocol types、client 与契约测试。
- Agent 工具执行主路径升级为可持续进程执行模型，补齐 shell 输出缓冲、restricted token、sandbox 后端、tool orchestrator 与执行策略兼容投影，为编码任务提供更稳定的命令运行能力。
- Settings 增加执行策略与网络访问聚焦面板，Provider 设置迁移路径进入 Electron fixture smoke，用户可以更清晰地检查运行策略与 Provider 配置状态。
- Agent Chat 增加 runtime policy / routing evidence 展示卡片与 reliability panel 证据投影，模型路由、策略判断与执行来源可以在会话侧被审阅。
- App Server runtime 新增 artifact sidecar、projection store、projection repair、event log、storage roots 与 legacy message backfill 模块，继续把会话读模型、代码产物和历史恢复收敛到 current App Server 事实源。

### 修复
- 修复 session history、message projection、subagent context、todo projection 与 runtime detail 的历史可见性和投影一致性问题，降低历史会话恢复时的信息缺口。
- 修复 App Server session read model、turn lifecycle、tool timeline 与 evidence export 在 artifact / coding event / external event 混合场景下的同步问题。
- 修复 Electron App Server host 与 update notification window URL 的边界处理，补齐 host 启动、连接与更新提示的回归覆盖。
- 修复 Agent Runtime client、thread client、DevBridge HTTP client 与 command policy 的 current/compat 边界回归，避免 retired surface 被误当成生产事实源。

### 优化与重构
- 继续拆分 App Server runtime / processor / runtime_backend 中心文件，把 projection、artifact、event、storage、coding events 与 execution process 下沉到领域模块。
- Core / infra / services 增加产品数据库迁移清理、telemetry store、runtime conversation、model registry runtime metadata 等模块，减少旧会话存储和模型路由逻辑耦合。
- Canvas Workbench 的 changes / diff / toolbar / tabs 继续拆出 ViewModel 与细粒度组件，减少 UI 状态和渲染职责混杂。
- API Key Provider、Settings v2、侧边栏、归档会话、About 页与 App Sidebar 样式继续对齐当前设置主路径与视觉规范。
- 更新 coding 与 db 路线图、执行计划、persistence map 和脚本治理说明，记录数据库瘦身、Codex 对齐和 current runtime 能力边界。

### 测试与质量
- 扩展 App Server protocol manifest / schema、app-server-client、Agent Runtime client、execution process、session history fixture 与 code artifact workbench fixture 覆盖。
- 扩展 Rust App Server runtime、projection store、legacy message backfill、event log、evidence export、runtime backend coding events 与 model routing 回归。
- 扩展 aster sandbox、restricted token、process output buffer、bash tool、tool registry 与 tool orchestrator 测试。
- 扩展 Agent Chat reliability / routing / policy evidence、Canvas Workbench changes、Settings execution policy、Provider 设置迁移与 i18n 资源回归。
- 根应用、Rust workspace、CLI npm package、App Server client package、Agent Runtime client 依赖、pnpm lock 与 Cargo lock 版本统一更新到 `1.69.0`。

### 文档
- 新增数据库路线图、库存、PRD 与 Codex 对齐分析，明确产品数据库瘦身、迁移清理和持久化主链后续切分。
- 更新 coding roadmap、architecture、implementation plan、runtime capability map 与 UI projection，记录 execution process、策略证据和工作台拆分进展。
- 更新 persistence map 与执行计划，补齐 artifact sidecar、projection store、event log、legacy backfill 与 storage roots 的 current owner。

### 其他
- 本版继续把编码任务、会话读模型、工具执行、设置策略与数据库治理收敛到 App Server JSON-RPC、RuntimeCore、Electron Desktop Host、current npm clients、checked-in schema 与机器可读守卫。

**完整变更**: `v1.68.0` -> `v1.69.0`
