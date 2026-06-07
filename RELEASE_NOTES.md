## Lime v1.60.0

### 新功能
- Electron Desktop Host 成为桌面主入口，新增主进程、preload、IPC channel、窗口配置、DevBridge HTTP bridge 与 App Server host bridge。
- 发布与更新链路迁移到 Electron Forge current 主路径，覆盖 macOS DMG/ZIP、Windows Squirrel、Forge release asset staging、包资源校验与本地 ZIP feed 验证。
- App Server JSON-RPC 能力继续扩展，补齐 Agent session/read/list/update/turn/cancel、Connect deep link、workspace、model、knowledge、skill、artifact 与 evidence 等 current 协议面。
- Agent Runtime / Claw 主链进一步接入 App Server current read model，支持真实 Electron fixture 下的会话恢复、代码产物工作台、停止生成、历史读取和完成态投影。
- Agent App runtime 增强 UI runtime 生命周期与 Electron fixture 能力，覆盖 start/status/stop、runtime package、SDK contract、native shell 配置与 standalone release 辅助链路。
- 新增多组 current GUI smoke：设置页全量、侧栏会话、Connect deep link、Agent App UI runtime、Claw current fixture、代码产物工作台和 session history fixture。

### 修复
- 修复 Electron `safeInvoke` JSON-RPC result envelope 解包问题，避免 App Server 返回真实 `result.lines` 时被前端误判为空。
- 修复恢复到 App Server 中不存在的历史 session 后继续发送导致无输出的问题，发送前会先用 `agentSession/read` 确认 session 存在并匹配 workspace。
- 修复最近对话 / 归档列表被陈旧 remembered workspace 污染过滤条件的问题，侧栏查询不再把未验证 workspace 传给 `agentSession/list`。
- 修复 Claw 首 token 等待态中任务卡和输入栏过早显示已完成的问题，只有真实终态和正文投影完成后才展示完成状态。
- 修复停止生成语义，`agentSession/turn/cancel` 会先写入 canceled read model 并快速恢复输入框，迟到的完成事件不再覆盖取消态。
- 修复 Connect deep link 在 Electron 首启参数和二次实例参数中的分发，覆盖 `lime://connect` 的 current resolve、保存和 callback 路径。

### 优化与重构
- 将桌面宿主事实源从 Tauri / legacy facade 收敛到 Electron Desktop Host、App Server JSON-RPC 与 `src/lib/desktop-host/` current mock 边界。
- 大规模拆分 Agent Chat、工作台、侧栏、Harness 面板、Skill 选择器、Agent App 页面等复杂测试和 View Model，降低 React 挂载测试承载业务状态机的比例。
- App Server client contract、command catalog、DevBridge policy 与 governance catalog 继续收敛，减少 mock priority command 和 legacy command 回流。
- Electron release/updater 脚本迁入 `scripts/electron/`，App Server、Agent Runtime、Agent App、i18n、Harness、Agent QC、Knowledge 脚本按领域目录治理。
- 清理旧 Tauri 命名与旧 updater/builder 入口，Forge-only release/updater 成为当前发布事实源。

### 测试与质量
- `npm run test:contracts` 接入 App Server client contract、command contract、modality contract、scripts governance 与 Electron release workflow guard。
- 新增 Electron release workflow 结构化守卫，校验 Forge maker、签名/公证、Windows Squirrel、R2 updater asset 计划，并阻止 electron-builder、NSIS、旧 updater metadata 回流。
- 新增 `npm run governance:scripts`，冻结 `scripts/` 根目录并跟踪领域迁移，根目录 release bucket 已清零。
- 新增 App Server / Electron / Agent Runtime fixture smoke，覆盖 app-server stdio、sidecar lifecycle、packaged backend failure、Electron package resources、Claw current fixture、cancel fixture 与历史恢复。
- 增强 live Provider / WebSearch / WebFetch smoke gate，授权前 fail closed，授权后要求 turn-scoped provider/model/routing、工具完成态和输出证据同时满足。
- 补充 Rust App Server cancel、read model、JSON-RPC、external backend，以及前端 App Server gateway、Agent Runtime client、Connect、Agent App runtime、i18n loader 等定向回归。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package 与锁文件版本统一更新到 `1.60.0`。

### 文档
- 更新 App Server 实施计划，记录 Electron 迁移、Claw current fixture、Connect deep link、Agent App UI runtime、cancel 语义和 release/updater 治理进展。
- 更新工程质量工作流，明确 Electron Desktop Host、App Server JSON-RPC、GUI smoke、current fixture、live Provider 授权和本地化验证口径。
- 更新脚本治理 README，沉淀 Electron、App Server、Agent Runtime、Agent App、i18n、Harness、Agent QC、Knowledge 领域脚本入口。
- 更新命令边界、治理、Playwright/E2E、App Server release/updater 与前端迁移矩阵，明确 legacy / compat / dead surface 的退出条件。

### 其他
- 继续推进 `src-tauri` 到 `lime-rs` 的仓库结构迁移，统一 Rust workspace manifest 与桌面后端事实源。
- 发布工作流 runner 和 asset staging 更明确：macOS arm64 固定 `macos-15`，x64 固定 `macos-15-intel`，Windows 固定 `windows-2022`。

**完整变更**: `v1.59.0` -> `v1.60.0`
