## Lime v1.74.0

### 新功能

- 扩展 App Server `memoryStore/*` current 记忆主链，新增 `consolidate`、`review/list`、`review/resolve` 与 `index/rebuild` 协议、schema、Rust processor、本地数据源和 TS client 类型。
- 新增 `agentSession/delete` current JSON-RPC 方法，补齐会话删除的协议目录、生成 schema、App Server client 与归档测试覆盖。
- 记忆设置页升级为可操作的 MemoryStore 管理面，支持健康刷新、手工添加笔记、整理笔记、重建索引、审阅候选笔记和工作区 rollout 候选摘要。
- Agent runtime 在 WebSearch / WebFetch 结果返回后新增“正在整理联网结果”状态投影，让联网检索到最终答复之间的等待态可见。
- 工具结果预览扩展为按音频转写、图片、视频、Web 图片搜索和记忆证据拆分的预览模型，聊天过程轨能展示更丰富的任务证据。

### 修复

- 修复联网工具流在结果已返回但最终文本尚未开始时缺少中间状态的问题，降低用户误判为卡住的风险。
- 修复流式取消轮询路径，避免长时间等待下一条 runtime event 才响应取消。
- 修复旧 `project_memory_get` / `src/lib/api/memory.ts` 网关仍被当作 current bridge truth 的残留，项目记忆读取收敛到 `projectMemory` current API。
- 修复记忆设置页只显示健康状态、无法处理待审阅笔记和 rollout 摘要的交付缺口。
- 修复工具结果预览超大单文件带来的维护风险，媒体、搜索和转写预览边界更清晰。

### 优化与重构

- 将 MemoryStore 后端整理为 `audit`、`consolidation`、`review`、`rollout` 等子模块，中心 processor 只保留分发接线。
- 将 `taskPreviewFromToolResult` 拆成音频转写、图片、视频、Web 图片搜索、copy 与 shared helper 等小模块，移除超大预览聚合文件。
- 收紧 Electron Host、DevBridge、command contract 和 legacy surface catalog，防止旧项目记忆 CRUD / prompt helper 回流。
- 继续完善 runtime memory prompt、context compaction、evidence export 和 session lifecycle 的文件化记忆集成。
- 五语言 i18n 资源同步更新 `agent`、`agentMessageList`、`settings`、`navigation` 与相关测试夹具。

### 测试与质量

- 扩展 MemoryStore protocol / App Server / app-server-client 合同测试，覆盖整理、审阅、索引重建和会话删除协议。
- 新增记忆设置页、rollout candidates、MemoryStore 状态面板和 project memory current API 的前端回归。
- 增强 Claw chat current fixture、ready-streaming smoke、command contract、App Server client contract 和 i18n unused key 检查。
- 新增 Web retrieval synthesis status、tool preview 拆分、搜索预览、工具批次分组和 memory evidence panel 的单测。
- 根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock 的发布版本统一更新到 `1.74.0`。

### 文档

- 更新记忆路线图、PRD、架构、验收、rollout 和 diagrams，记录 MemoryStore 整理 / 审阅 / rollout 的 current owner。
- 更新 turn roadmap、前后端合同、测试用例和 sequence 文档，补齐会话删除与记忆上下文相关边界。
- 更新 memory compaction、Playwright E2E、App Server 前端集成矩阵和 Codex import acceptance 文档。
- 更新技术债追踪，记录旧记忆网关和 current 事实源收口状态。

### 其他

- 本版继续把记忆治理、工具过程、联网检索状态、会话管理和设置页操作收敛到 App Server JSON-RPC / RuntimeCore / current GUI 主链；旧项目记忆 CRUD 网关不再作为新增能力入口。

**完整变更**: `v1.73.0` -> `v1.74.0`
