## Lime v1.64.0

### 新功能
- App Server JSON-RPC current 协议继续扩展，补齐图库素材、项目素材、会话文件、统一记忆、语音 ASR 凭证、语音指令和视频任务产物等 schema 与客户端类型。
- 新增 Agent Runtime 标准化 npm 包面，包括 `@limecloud/agent-runtime-client` 与 `@limecloud/agent-ui-contracts`，并增强 Agent Runtime projection / UI 的共享事件、read model、runtime facts 与路由能力。
- App Server local data source 按领域拆分为 agent apps、automation、channels、connect、diagnostics、gallery、knowledge、MCP、media、model providers、project materials、session files、skills、unified memory、voice 与 workspaces 等 current 模块。
- Agent App、Skills、Resource Manager、Memory、Connect、Artifact、Video Workspace 与 Agent Chat 工作台继续接入 current App Server / Desktop Host 主链。

### 修复
- 修复多组前端 API、Desktop Host、DevBridge 与 command contract 仍可能引用旧命令、旧 mock 或 legacy wrapper 的边界缺口。
- 修复 App Server client 对 session files、gallery materials、materials、media tasks、voice models、ASR、unified memory、system settings 与 agent runtime current 方法的返回形状和测试覆盖缺口。
- 修复 Agent Chat 工作台在 session files、外链、Markdown 渲染、工具过程、工作台上下文与空态输入流中的回归风险。
- 修复 Electron host command / IPC channel current 白名单与命令合同守卫中的残留旧入口。

### 优化与重构
- 继续下线旧 Tauri command wrapper，收缩 ASR、execution run、gallery material、layered design、material、session files、video generation、voice model、memory feedback 等 legacy 命令面。
- 将 App Server protocol v0 从巨型文件拆成领域模块，并把 schema export registry 独立出来，降低协议维护成本。
- 将 App Server local data source 从单文件巨型实现拆成领域模块，减少交叉修改和重复分支。
- 收缩 Agent Runtime UI 包中的重复实现，把共享合同、事件存储、read model、summary、UI state 与 runtime facts 放到更明确的包边界。
- 继续更新治理、质量工作流、并行协作、App Server 路线图和 current migration 执行计划，明确 current / compat / deprecated / dead 边界。

### 测试与质量
- 扩展 App Server client contract、command contracts、Rust current boundary、legacy surface catalog、desktop-host core 与 Electron host / IPC 回归。
- 新增 session files Electron fixture smoke，并补充 session files、gallery materials、materials、media tasks、voice、ASR、document import、frontend diagnostics、image search、logs、skills 与 system settings current boundary 测试。
- 扩展 Agent App runtime、Agent Runtime projection、Agent Runtime UI、Agent UI contracts、Skills workspace、Resource Manager、Memory page、Artifact toolbar、Connect external link 与 Agent Chat 工作台测试。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package、Agent Runtime client 依赖、App Server release manifest 与锁文件版本统一更新到 `1.64.0`。

### 文档
- 新增 Agent UI Runtime 标准文档，更新工程导航、命令边界、治理、质量工作流、远程 runtime、并行协作和路线图入口。
- 更新 production command current migration、Tauri wrapper cleanup、diagnostics fail-closed、tech debt tracker 与下一阶段实现路线图。
- 更新 Agent Runtime UI、App Server client、default video generation skill、voice current 边界和相关 package 文档。

### 其他
- 继续以 App Server JSON-RPC、Electron Desktop Host、current clients、机器可读 schema 与领域化模块作为发布事实源，减少旧 wrapper、legacy dispatcher 与 renderer mock 对 GUI 主路径的影响。

**完整变更**: `v1.63.0` -> `v1.64.0`
