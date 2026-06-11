## Lime v1.66.0

### 新功能
- Agent App runtime 增加 App Server current client / capability API 接入，独立 Agent App 可以复用当前 JSON-RPC 客户端、能力宿主与运行态投影。
- Agent Runtime 标准包补齐 App Server facts、fixture replay、subagents、refs 与 validation 支持，方便外部运行态、投影层和 UI 组件消费同一组事实。
- App Server workspace 协议新增项目摘要读取能力，并同步到 Rust client、npm `app-server-client` 与前端项目 API。
- Agent 输入框增加项目上下文读取与展示能力，支持把当前工作区项目摘要带入主对话编排。

### 修复
- 修复 Agent UI projection summary 与 subagents read model 的命名和汇总口径，减少 Team Workbench 旧语义残留。
- 修复 Agent App runtime 页面和投影桥接对 current capability host / client API 的接线，降低独立 App 与桌面宿主之间的协议漂移。
- 修复输入框、工具展示、workspace send runtime 与 thread grouping 的若干状态同步问题。
- 修复 DevBridge command policy 与 legacy surface catalog 对旧命令面的分类，避免已退场路径继续被误判为 current。

### 优化与重构
- Agent Chat 工作台主线从旧 Team Workspace 组件、selector、canvas runtime 与 suggestion 工具收敛到 subagents / workbench current 表达，删除大批旧 team workspace UI 面。
- `AppSidebar` 拆分为 account、appearance、invite、search、session、navigation target 与样式等子模块，显著降低单文件复杂度。
- 下线 Companion 相关 API、设置卡片、provider overview、desktop mock 与侧边入口残留，减少旧 companion 能力对当前设置页和 provider 面的干扰。
- 输入框项目上下文、team preference、project storage 与 workspace selection 逻辑继续向 hook / helper 分层收敛。
- Agent Runtime / Agent UI npm 包继续补齐标准 contracts、fixtures、projection、runtime facts 与 UI exports，减少 GUI 与 SDK 的重复实现。

### 测试与质量
- 扩展 App Server protocol catalog、workspace project API、npm `app-server-client`、Agent Runtime client、projection、UI contracts 与 fixture replay 回归。
- 更新 AppSidebar、Agent Chat inputbar、workspace scene、workspace send、settings v2、Agent App runtime page 与 i18n 资源相关测试。
- 更新 Electron SDK fixture smoke、tool surface smoke、command contract 检查、质量任务规划与 i18n readiness 报告。
- 根应用、Rust workspace、CLI npm package、Agent App runtime package、App Server client package、Agent Runtime client 依赖与锁文件版本统一更新到 `1.66.0`。

### 文档
- 新增 Agent Workbench 与 Subagents 路线图入口，补充 acceptance、iteration plan、parallel workstreams 与 task board。
- 更新 Agent Runtime、Agent UI 标准落差、completion audit、implementation plan、test cases 与 adjacent protocols 文档。
- 更新工程质量、命令边界、Playwright E2E、协议标准地图与技术债追踪文档，记录当前 workbench / subagents / App Server 主线边界。

### 其他
- 本版继续把发布事实源收敛到 App Server JSON-RPC、Electron Desktop Host、current npm clients、`lime-rs/crates/**` 与机器可读守卫，避免旧 Team Workspace、Companion 和 legacy command 面回流。

**完整变更**: `v1.65.0` -> `v1.66.0`
