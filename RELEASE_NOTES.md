## Lime v1.63.0

### 新功能
- App Server JSON-RPC 扩展到目标管理、会话压缩、线程恢复、排队 turn、review decision、handoff / replay / evidence 导出、文件 checkpoint、日志持久化、媒体任务、Gateway tunnel / channel、微信渠道、技能包与技能仓库等 current 协议面。
- 新增 MCP current smoke 入口，覆盖 App Server current MCP 链路的基本可用性。
- Agent App shell prepare、应用卸载 current UI、provider store data root、桌面平台产品 App 边界等主线文档和执行计划补齐，发布目标更明确。
- App Server client 与前端 Agent Runtime typed client 继续扩展，新增 skill package、media、objective、session、thread、subagent、site、gateway、diagnostics 等 current 方法和类型。

### 修复
- 修复 DevBridge / desktop-host 多组 API 在 current 主链不可用时仍可能走 legacy 或 mock fallback 的问题，进一步 fail closed。
- 修复 skill package、本地技能导入 / 替换 / 重命名 / 导出等路径的 current 边界和返回形状不一致问题。
- 修复 App Server diagnostics、gateway tunnel、channel、media task、session archive / replay 等协议 schema 和客户端类型缺口。
- 修复 Electron host command、IPC channel、update host 和 release workflow 守卫中的 current 白名单覆盖缺口。

### 优化与重构
- 继续从旧 Tauri wrapper / legacy desktop facade 迁出业务能力，收缩 agent session、skill、media task、gateway、wechat、capability draft、runtime query 等旧命令面。
- App Server runtime、processor、local data source、protocol schema export 和 Rust / TypeScript client 统一承接更多 current 能力，减少双轨实现。
- 技能执行入口从旧弹窗 / hook / mock 命令路径收缩到 Skill Forge / package current 主链。
- Desktop Host mock、DevBridge policy、command catalog 与 mock priority 继续收缩，避免测试路径伪装生产能力。
- 脚本入口继续按领域迁移，新增 `scripts/mcp/` current smoke，并更新 scripts governance 文档。

### 测试与质量
- 扩展 App Server client contract、command contracts、Rust current boundary、desktop-host mock boundary 与 Agent Runtime command schema 守卫。
- 新增 / 扩展 skill package current、media current boundary、session current boundary、app config provider current、channels runtime、gateway tunnel、usage stats、MCP fail-closed 等前端与协议回归。
- 扩展 Agent Apps、Capability Draft、Harness Status、settings stats、skills 页面、desktop-host core、webview API、Electron host commands / IPC 等测试。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package 与锁文件版本统一更新到 `1.63.0`。

### 文档
- 更新 App Server / Desktop Host 命令边界、治理、质量工作流、并行协作、执行计划索引与 appserver 路线图。
- 新增 provider store data root、desktop platform product app boundary、agent app uninstall current UI、diagnostics current fail-closed 等 PRD / 执行计划。
- 更新默认知识构建技能说明，补齐知识库路线图和脚本治理说明。

### 其他
- 继续以 App Server JSON-RPC、Electron Desktop Host、current client 和机器可读 schema 作为发布事实源，减少 legacy wrapper 与 renderer mock 对 GUI 主路径的影响。

**完整变更**: `v1.62.0` -> `v1.63.0`
