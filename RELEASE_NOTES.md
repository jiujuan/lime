## Lime v1.62.0

### 新功能
- App Server JSON-RPC 扩展文件系统写入协议，覆盖创建目录、创建文件、删除文件和重命名文件，并补齐统一 mutation response。
- App Server 新增使用统计 current 数据面，支持摘要读取、日期趋势、模型排行与区间参数，前端 `usageStats` 网关迁移到同一组协议 schema。
- 知识包详情读取迁移到 App Server `knowledgePack/read` 主链，知识库详情页不再依赖前端 legacy command gate。
- Agent Runtime typed client 扩展会话、线程、产物、导出、媒体、目标、站点、子代理和 inventory 能力，前端与 App Server client 共用更完整的 current 方法面。
- Agent App 页面补充 cloud bootstrap、安装状态投影和应用 Logo / icon 展示，应用卡片和安装确认弹窗可以呈现更明确的运行时状态与视觉识别。
- 启动页在缺少外部图标资源时使用内置 Lime 图形 Logo 兜底，避免退回纯文字块。

### 修复
- 修复多组前端 API 在 App Server 或 Electron current 路径不可用时可能继续走 renderer mock / legacy fallback 的问题，改为 fail closed 并暴露真实错误。
- 修复 MCP 服务器列表刷新成功后旧错误状态残留的问题，并取消首次空列表时自动导入外部应用配置的副作用，改为用户手动触发。
- 修复 MCP server / tool 读取、Agent Runtime session 读取、App Server artifact 读取等路径中返回形状不一致导致的 UI 状态误判。
- 修复官方技能市场对异常响应包容过宽的问题，新增 envelope、列表、bundle 和视觉资源返回结构校验。
- 修复 Electron 主窗口配置、IPC channel 与 host command 边界中部分命令未纳入 current 白名单或测试覆盖的缺口。
- 修复 browser、model、skill、session file、config system 等 desktop-host mock 默认值过宽的问题，避免测试夹具误模拟生产能力。
- 移除 Agent App 安装成功的重复 toast，避免确认弹窗关闭时产生噪声提示。

### 优化与重构
- DevBridge dispatcher 继续收敛到 App Server / Desktop Host current 主链，删除或收缩旧 agent session export、files、models、voice、workspace 等 dispatcher 分支。
- `src/lib/desktop-host/*Mocks` 大幅瘦身，未显式注册的 mock 命令默认失败，减少生产路径被测试默认值掩盖的风险。
- App Server protocol schema export、Rust client、TypeScript client 与 contract guard 同步扩展，降低协议新增时的手工同步成本。
- 文件浏览、连接、记忆、项目资源、gallery materials、provider、server runtime、voice、update 等前端 API 网关继续向 current 边界收敛。
- Rust services 新增独立使用统计服务，App Server processor / runtime / local data source 统一承接 usage statistics 读取职责。
- Connect 旧 Tauri 命令改为明确退场错误，生产路径统一到 Electron deep link bridge 与 App Server JSON-RPC。

### 测试与质量
- 新增和扩展 App Server client contract，覆盖文件系统 mutation、使用统计、Agent Runtime 多客户端、schema export 与 Rust/TypeScript client 同步。
- 新增 MCP hooks、MCP fail-closed、手动导入行为、Agent Runtime agent/media/objective/site/subagent/thread/export、App Server read model、file system、usage stats 等定向回归。
- 扩展 Agent Apps 页面、ViewModel、cloud bootstrap、官方 Skill marketplace、desktop-host mock 边界和 `webview-api` 测试。
- 新增生产 UI command current boundary、Knowledge current boundary 与 Rust command current boundary 守卫，覆盖 App Server current 方法和 legacy 命令退出边界。
- 命令契约守卫继续阻止 legacy / mock priority / DevBridge 旧入口回流到 current 生产路径。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package 与锁文件版本统一更新到 `1.62.0`。

### 文档
- 更新 App Server 协议 schema 与 manifest，新增机器可读协议定义，覆盖使用统计、文件系统写操作、知识包读取等能力。
- 五语言 i18n 资源同步新增官方技能市场非法响应错误文案，并移除不再使用的安装成功文案。

### 其他
- 继续减少旧 Tauri / legacy desktop facade / renderer mock 对 GUI 主路径的影响，让发布版本以 App Server JSON-RPC、Electron Desktop Host 与 current client 为单一事实源。

**完整变更**: `v1.61.0` -> `v1.62.0`
