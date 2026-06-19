## Lime v1.73.0

### 新功能

- 新增 App Server `memoryStore/*` current 记忆主链，覆盖 `addNote`、`list`、`read` 与 `search` 的协议 schema、Rust processor、本地数据源和 TS client 类型。
- 聊天消息支持更完整的图片与媒体预览：Markdown 图片 fallback、图片附件不可用占位、preview artifact fallback surface 和媒体 renderer 进入 current UI。
- Runtime 工具过程展示升级为流式分组、工具结果详情、URL preview snapshot 和按工具族拆分的 display config，工具轨更适合长任务扫描。
- LLM / media runtime 补齐 OpenAI Images、Responses image generation 与 FAL video generation 的事件 mapper，媒体任务可复用统一 LLM event 投影。
- 新增 turn 路线图文档，明确主线程 turn、前后端合同、时序和测试用例的后续收口路径。

### 修复

- 修复 Agent streaming 终态、静默 turn 恢复和 thread item 投影的多处边界，降低完成态 UI 卡住、输入框未恢复或陈旧终态误停新流的风险。
- 修复 Codex / 本地历史导入的 runtime event、source metadata、工具详情和视觉审计断言，导入后的过程信息更稳定可追踪。
- 修复工具结果、搜索结果、artifact preview 和 Markdown 图片在缺少资源、URL 或媒体元数据时的展示退化路径。
- 修复 App Server sidecar host 与 HTTP client 的边界测试，增强外部后端、JSON lines 事件和命令策略异常路径覆盖。
- 修复记忆设置、导航和资源页在旧 MemoryPage / UnifiedMemory 下线后的入口残留。

### 优化与重构

- 下线旧 `unifiedMemory/*` 命令、前端 `unifiedMemory` API、独立 `lime-rs/crates/memory` crate 和旧 MemoryPage，记忆能力收敛到 MemoryStore current 事实源。
- 将超大 `toolDisplayInfo` 拆成 `toolDisplayConfig/*`、copy、subject、types 和 result detail 等小模块，降低工具展示逻辑的耦合。
- 聊天消息列表、timeline、process summary、turn grouping、workspace send/navigation/runtime hooks 继续拆分为可测试的 projection / view model / controller。
- 会话导入、artifact preview、工作台任务 rail 和 curated task launcher 继续收敛到更窄的 view model 与稳定组件边界。
- 五语言 i18n 资源同步更新 `agent`、`agentRuntime`、`agentMessageList`、`workspace`、`settings` 和导航文案。

### 测试与质量

- 扩展 MemoryStore protocol / App Server / app-server-client 合同测试，并把 UnifiedMemory 回流纳入 legacy surface guard。
- 新增和更新 Agent streaming、timeline projection、tool display、message sanitizer、conversation projection、workspace runtime 和 artifact preview 回归。
- 增强 Codex import click-through、real-sample visual audit、session-history fixture、Claw chat fixture 与 ready-streaming smoke 的断言。
- 更新 `test:contracts` 相关脚本，覆盖 App Server client contract、command contract、protocol type generation 和 legacy surface 报告。
- 根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock 的发布版本统一更新到 `1.73.0`。

### 文档

- 重写记忆路线图、PRD、架构、验收、rollout 和 diagrams，记录 MemoryStore current owner 与旧 UnifiedMemory 退场口径。
- 更新 App Server 实施计划、模型 runtime 统一计划、前端集成矩阵、artifact roadmap 和 Codex import acceptance matrix。
- 更新 command / governance / quality / memory compaction 文档，明确 current App Server、DevBridge 和记忆主链边界。
- 新增 turn roadmap 文档集，为后续 turn lifecycle、前后端合同和测试矩阵提供版本化依据。

### 其他

- 本版继续把记忆、工具过程、媒体事件、历史导入和 artifact preview 收敛到 App Server JSON-RPC / RuntimeCore / current GUI 主链；旧 UnifiedMemory、旧 MemoryPage 和并列记忆 crate 不再作为新增能力入口。

**完整变更**: `v1.72.0` -> `v1.73.0`
