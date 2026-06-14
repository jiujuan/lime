## Lime v1.68.0

### 新功能
- 代码工作台主路径升级：新增 Canvas Workbench 分层面板、顶部工具页签、项目文件视图、变更列表、review 菜单、预览模式与代码输出面板，工作台从单体布局推进为可扩展的编码执行界面。
- 新增 Project Git current 能力与 App Server JSON-RPC schema，前端可以读取项目 diff、文件变更与工作区上下文，并在工作台变更面板中稳定呈现。
- Electron Desktop Host 增加 embedded browser host 与主窗口加载错误捕获，编码工作台内的浏览器预览、加载状态和错误诊断进入 current host 边界。
- Agent tool execution 引入工具编排、策略检查、sandbox / rules / decision 分层，以及 apply_patch 工具链，为编码任务提供更接近真实工程执行的工具面。
- App Server runtime 新增 coding events、file checkpoint projection、artifact projection、tool lifecycle、turn execution、session hydration / lifecycle 等模块，支撑代码产物、工具轨迹和会话状态的统一读模型。

### 修复
- 修复 Canvas Workbench 单体组件过重、文件 / diff / preview / toolbar 状态互相牵连的问题，拆出 ViewModel 与子面板后减少状态漂移和渲染回归风险。
- 修复 Agent session 完成态、继续输出、browser assist、workspace conversation scene 与 active stream 清理的一批同步问题，降低旧 terminal 事件误停新 stream 的风险。
- 修复 runtime backend 工具事件、tool inventory、request context 与 coding event 归集不完整的问题，使工具执行、文件 patch 和 read model 更一致。
- 修复 gateway / websocket / scheduler 部分职责平铺和旧 executor 残留，统一转向当前 App Server / RuntimeCore owner。

### 优化与重构
- App Server `runtime.rs`、`local_data_source.rs`、`runtime_backend.rs` 等中心文件继续拆分到 domain 子模块，降低中心文件膨胀，并保持 processor 只做 dispatch 接线。
- Agent prompt assets、目标续跑、权限、review 与 realtime 模板改为 checked-in upstream asset，减少运行时 prompt 拼装分散和不可审计内容。
- Gateway wechat / telegram / feishu / discord 运行逻辑抽出 agent runner 和 task context，减少重复执行分支。
- 删除 legacy agent runtime mock / command manifest 残留，DevBridge 与治理 catalog 更聚焦 current App Server / Electron Desktop Host 边界。
- 更新 coding roadmap、Agent Workbench、App Server integration matrix、治理文档与执行计划，记录本轮 current coding workbench 与 tool execution 主线状态。

### 测试与质量
- 扩展 Rust App Server runtime、runtime backend、coding events、tool inventory、file checkpoint、evidence export 与 session archive JSON-RPC 回归。
- 扩展 Agent tool execution、tool orchestrator、policy inspector、apply patch、request tool policy 与 aster tool execution 测试。
- 扩展 Canvas Workbench、Workspace main area、Project Shell、Inputbar、Agent Runtime Strip、Layout Transition、Agent App runtime 与 i18n 资源回归。
- 扩展 app-server-client、agent-runtime-client、agent-runtime-projection、agent-runtime-ui 与 agent-ui-contracts 测试，覆盖新增协议、投影和工具轨迹。
- 根应用、Rust workspace、CLI npm package、App Server client package、Agent Runtime client 依赖与 Cargo lock 版本统一更新到 `1.68.0`。

### 文档
- 更新 coding workbench 架构、实现计划、runtime capability map、UI projection 与 reference boundary，明确代码工作台的 current owner 和交付口径。
- 更新工程质量、命令边界、Harness Engine、状态 / 历史 / 遥测、记忆压缩、服务与 query-loop 文档，收敛 App Server current 主链和遗留边界。
- 更新工具 PRD、工具 inventory、Agent Workbench 路线图和执行计划，补齐 tool execution 与 coding workbench 的发布证据。

### 其他
- 本版继续把编码任务主路径收敛到 App Server JSON-RPC、RuntimeCore、Electron Desktop Host、current npm clients、checked-in schema 与机器可读守卫；本地工作区截图证据不纳入发布提交。

**完整变更**: `v1.67.0` -> `v1.68.0`
