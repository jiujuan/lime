## Lime v1.78.0

### 新功能

- Agent App Host v3 进入 current 主链：新增 host lifecycle、历史恢复、产品工作台 profile、Right Surface contract 与 readiness 能力描述，App Server protocol schema 和 TS/Rust client 类型同步生成。
- Workspace Right Surface 接入 App Server JSON-RPC：新增 `workspaceRightSurface/request`、`pending/list`、`pending/consume`、`pending/dismiss` 与 `workspaceRightSurface/pendingChanged`，支持后台请求进入 pending badge、用户打开后 consume、显式忽略后 dismiss。
- Right Surface pending 增加 AppDataSource / Local SQLite 最小持久化恢复骨架，并在 renderer 侧通过共享 `AppServerEventBus` 消费同一条 App Server event drain，避免多个消费者竞争事件流。
- objectCanvas 完成最小产品化骨架：Browser Assist 候选可进入 Right Surface，board / object / edge model、view model、metadata 裁剪、persist / replay 请求事件 schema 和 App Server snapshot store 已落地。
- objectCanvas replay 增加 RuntimeCore readiness projection 与 `object_canvas.replay.dry_run` 审计事件，当前固定为 dry-run blocker，不启动真实回放执行。
- 计划与推理过程进入流式 UI 主链：新增 plan state、plan event controller、model reasoning state、计划状态输入栏展示和计划决策面板接线。
- `@limecloud/app-server-client` 拆出 connection、request client、sidecar manifest、sidecar lifecycle/process 等模块，便于 Electron Host 与独立 App 复用同一套 App Server client 能力。

### 修复

- 修复 Right Surface 多条渲染路径并存的问题：Harness 旧外层 dialog fallback 移除，Files / objectCanvas / Harness / Shell / Workbench / Expert 通过统一 surface host 互斥展示。
- 修复无结果文件或无候选对象时暴露假入口的问题，Files 与 objectCanvas 按真实 target / candidate availability 控制按钮可用状态。
- 修复 pending right surface 请求只停留在 toolbar badge 的问题，App Server pending metadata 现在可以驱动对应 surface 可点击、打开、consume 与 dismiss。
- 修复 App Server event drain 被多个前端 runtime 直接竞争的风险，Agent Runtime drain router 与 Right Surface pending runtime 统一复用共享 event bus。
- 修复聊天过程展示中的推理、计划、工具调用和 Markdown streaming 分组问题，过程摘要、thinking block、tool family 标签和 inline process projection 更稳定。
- 修复 Context7 工具展示命名，把 `resolve_library_id / query_docs` 统一为 current `resolve-library-id / query-docs` 口径。

### 优化与重构

- 拆分 `src/lib/api/appServer.ts` 为 constants、types、transport、response、client 和 method modules，降低单文件职责和 contract guard 维护成本。
- 拆分 `packages/app-server-client/src/index.ts`，新增独立 protocol、connection、sidecar 和 request helper 模块，同时保持包入口 re-export。
- App Server protocol 新增 Right Surface、Agent App Host lifecycle、产品 profile、历史恢复和 objectCanvas 相关 schema，并同步更新 generated TS types。
- Claw / Agent Runtime current fixture 继续模块化，新增 plan history、right surface visual、专家技能 live runner 和 tool execution smoke 支撑模块。
- Workspace 对话区进一步把 Right Surface 状态、objectCanvas 模型、产品 profile 模型、计划决策、runtime projection 和 UI view model 分层到可测纯模块。
- Agent tools / external data / MCP dynamic tool 展示逻辑继续收口到 family classifier 与 projection helpers，减少前端渲染分支重复。

### 测试与质量

- 新增 / 扩展 Right Surface registry、controller、runtime adapter、pending runtime、host rendering、Workspace scene 和 toolbar integration 回归。
- 新增 objectCanvas model、view model、persistence、replay、App Server snapshot store 和 RuntimeCore replay dry-run 定向测试。
- 新增 plan state、model reasoning state、plan event controller、计划决策面板、输入栏计划状态和 streaming process grouping 回归。
- 扩展 Agent App manifest、readiness、host lifecycle、Agent Apps 页面 view model 和 App Server API / protocol client 测试。
- 扩展 `scripts/check-app-server-client-contract.mjs` 与 current entrypoint guard，覆盖拆分后的 App Server client、Right Surface methods 和 sidecar release manifest helpers。
- 五语言 i18n 资源同步覆盖 agent、agentInputbar 与 workspace 新增可见文案。
- 本版发布事实源统一更新到 `1.78.0`：根应用、Rust workspace、CLI npm package、App Server client package、Cargo lock 与 Aster 子工作区 lock。

### 文档

- 新增 Agent App v3 路线图、PRD、架构、接口契约、Electron / App Server 技术基线、历史产品工作台与内容工厂工作台文档。
- 新增 Plan runtime 路线图与实施计划，记录计划事件、推理状态、输入栏状态和后续 Runtime executor 边界。
- 更新 Right Surface 路线图与执行进度，记录从单 surface 到 dock / tab / pane 模型的演进、App Server contract、pending 持久化、objectCanvas snapshot 与 replay dry-run。
- 更新 agent tools 批次测试文档和覆盖矩阵，记录 external info/data tools、Context7 docs tool 与动态 tool family 展示覆盖。
- 更新 Desktop Host / App Server 命令边界文档，补充 Agent App Host lifecycle current method。

### 其他

- 本版继续把 Agent App、Right Surface、计划 / 推理事件、objectCanvas、App Server client 和 GUI smoke fixture 收敛到 App Server JSON-RPC / RuntimeCore / Electron Desktop Host current 主链；旧 mock fallback、旧外层 dialog 和并行前端事件消费路径不作为新增能力入口。

**完整变更**: `v1.77.0` -> `v1.78.0`
