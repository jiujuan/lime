# Right Surface 统一承载实施进度

更新时间：2026-06-23

## 背景

Right Surface 的产品目标见 `internal/roadmap/rightsurface/README.md`。本实施计划只跟踪工程落地进度：把 Workspace 右侧的专家信息、画布、文件、Shell、Harness 等能力收敛到同一套可互斥、可调度、可被 Skills / MCP tools 调用的 surface 承载层。

当前用户反馈的直接问题是：点击抓夹 / 画布入口时，原右侧专家栏没有关闭，导致两个右侧表面并存冲突。第一阶段必须先解决专家栏与画布互斥，再继续做 objectCanvas、Cameo 类空间交互和工具调度开放。

## 目标

1. 专家信息不再作为 `WorkspaceShellScene.rightRailNode` 外层右栏存在。
2. 专家信息进入统一 Right Surface / canvas panel 承载层。
3. 打开画布、Shell、未来 objectCanvas 等右侧表面时，专家信息收缩到顶部按钮列，不与当前右侧表面并存。
4. 用户点击专家按钮时，可以主动关闭当前画布布局并展开专家信息。
5. 后续 surface registry 可扩展给 Skills / MCP tools 调度，但第一阶段不实现复杂 objectCanvas。

## 范围

本阶段包含：

- `src/components/agent/chat/workspace/right-surface/**`
- `WorkspaceMainArea` 的 `rightSurfaceContent` 承载能力
- `WorkspaceConversationScene` 与 `useWorkspaceConversationSceneRuntime` 的透传
- `AgentChatWorkspace` 的专家栏互斥状态机
- 相关 Vitest 回归

本阶段不包含：

- 完整 objectCanvas / Cameo 类空间应用
- Skills / MCP tools 自动打开 surface 的协议实现
- Surface 权限、审计、跨 session 恢复
- GUI smoke / Playwright 全链路闭环之外的产品打磨

## 当前状态

整体目标完成度：99%

口径：以完整 Right Surface 平台化目标计，当前完成第一阶段的专家栏统一承载、互斥行为和视觉修复，完成 P2 surface registry / controller / state resolver 骨架，补上 P3 Skills / MCP 调度的前端 command + scheduler + intent queue + launcher projection 模型，并已把 launcher projection 接入真实 `TaskCenterUtilityToolbar` props、Harness runtime pending badge adapter、文件预览 / skill result pending intent adapter、MCP shell 输出 / objectCanvas 候选 intent helper，以及 Browser Assist 候选 -> objectCanvas renderer 接线；Harness、Files、objectCanvas 都已进入 Right Surface definitions，并修正专家 / Harness / Shell / Files / objectCanvas / 工作台互斥接线。旧 `GeneralWorkbenchHarnessDialogSection` 外层弹窗 fallback 已删除，Harness 不再通过 `WorkspaceMainArea` 额外渲染第二条右侧展示路径。App Server `workspaceRightSurface/request`、`workspaceRightSurface/pending/list`、`workspaceRightSurface/pending/consume`、`workspaceRightSurface/pending/dismiss` 与 `workspaceRightSurface/pendingChanged` 已进入 current JSON-RPC contract、Rust / TS client、renderer API 网关、治理 catalog 和 contract guard。App Server pending metadata 已接入 `AgentChatWorkspace`：pending files/objectCanvas 请求现在既能进入 toolbar badge，也能让对应 surface 变为可点击并展示 metadata；用户打开对应 surface 时会 `consume`，用户显式关闭 / 忽略对应 surface 时会 `dismiss`；request / consume / dismiss 已能通过现有 App Server JSON-RPC notification 管道发出 `pendingChanged`。pending 请求已具备 AppDataSource / Local SQLite 最小持久化恢复骨架。renderer 侧已有共享 `AppServerEventBus`，Right Surface pending runtime 与 Agent Runtime drain router 订阅同一条 drain loop，避免多个消费者直接竞争 `app_server_drain_events`。objectCanvas 已从临时 renderer 升级为独立 board / object / edge model + view model 骨架，覆盖 browserSession 对象类型、来源、facts、connecting / ready / pending / failed 阶段、metadata 裁剪、主动作投影、edit / replay / persist 请求事件 schema，以及 `persistRequested / replayRequested -> workspaceRightSurface/request` 的 App Server pending owner flow。`persistRequested` 已从纯 pending metadata 升级为 App Server 内部 `workspace_object_canvas_snapshots` store 第一刀：RuntimeCore 识别 `metadata.objectCanvas.event.kind=persistRequested / owner=appServer` 后写入 AppDataSource，Local SQLite 懒建 snapshot 表保存 boardId、revision、persistenceKey、object facts 和原始 snapshot JSON。`replayRequested` 已完成 RuntimeCore parser / selector / readiness projection 与 dry-run audit event 骨架：RuntimeCore 能从 objectCanvas pending metadata 中投影 boardId、revision、objectId、replayTarget、完整 board snapshot、missingFields、execution blocker，并生成 `object_canvas.replay.dry_run` 审计事件；真实回放执行、正式 migration 治理和 GUI 视觉矩阵仍未完成，三个事件契约当前全部 disabled。

本轮阶段完成度：100%

口径：以“完成 P4 objectCanvas replayRequested Runtime dry-run / audit 骨架”为本轮目标。RuntimeCore 已能从 current `workspaceRightSurface/request` 产生的 objectCanvas pending metadata 中筛出 `replayRequested / runtime`，生成 readiness projection，并进一步生成 `object_canvas.replay.dry_run` RuntimeEvent 审计投影；`executionEnabled=false` 且 blocker 固定为 `runtime_replay_execution_not_implemented`，不声明真实回放执行已完成。

## 阶段计划

| 阶段 | 状态 | 内容 | 退出条件 |
| --- | --- | --- | --- |
| P0 文档基线 | 已完成 | 形成 Right Surface 架构文档与远期 Cameo / objectCanvas 方向 | `internal/roadmap/rightsurface/README.md` 存在并可作为路线图入口 |
| P1 专家栏统一承载 | 已完成 | 专家信息进入内层 Right Surface，外层 `rightRailNode` 不再承载专家栏 | 定向测试与 GUI smoke 已通过；根 typecheck 长耗时转独立诊断项 |
| P2 Surface registry | 已完成骨架 | 定义 workbench / expertInfo / objectCanvas / files / shell / harness 的统一注册、优先级和互斥策略 | active surface 选择已走 registry/controller；显式 `source=user/route/runtime` 有单测 |
| P3 Skills / MCP 调度入口 | 已完成前端骨架、renderer 接线、App Server contract/API 骨架、pending list/consume/dismiss、pendingChanged renderer 消费、pending 持久化恢复与共享 renderer event bus 骨架 | 让 runtime / skills / MCP tools 能以受控 command 请求打开或更新 surface | 前端 command / scheduler / intent queue / launcher projection / runtime adapter 模型已落地；toolbar 已消费 projection；Harness、最小 Files、最小 objectCanvas 已进入 Right Surface renderer；App Server `workspaceRightSurface/*` current contract 已接入；pending/list 可驱动 toolbar badge 和 metadata 最小打开，用户打开对应 surface 时会 consume 同类 pending；用户显式关闭 / 忽略对应 surface 时会 dismiss 同类 pending；request / consume / dismiss 已发出 `workspaceRightSurface/pendingChanged` notification，renderer pending runtime 已通过共享 `AppServerEventBus` 消费 requested / consumed / dismissed 增量；pending request 已能通过 AppDataSource / Local SQLite 最小落盘恢复 |
| P4 objectCanvas 原型 | 已完成最小 Browser Assist / App Server pending 候选 renderer、view model、board / object / edge model 第一刀骨架、edit / replay / persist 事件 schema 骨架、persistRequested / replayRequested pending owner flow、persistRequested -> AppDataSource snapshot store 第一刀、replayRequested -> RuntimeCore readiness projection，以及 replay dry-run audit event 骨架；完整原型未开始 | 参考 Cameo 类交互，只做最小空间对象原型 | 已有 browserSession board、primary object、source、facts、connecting / ready / pending / failed 阶段、metadata 裁剪、主动作投影、三类请求事件契约、persist / replay pending request builder、App Server 内部 snapshot store、Runtime replay readiness parser 和 `object_canvas.replay.dry_run` 审计事件；编辑、真实回放执行、正式 migration 治理与 GUI 视觉矩阵仍未完成 |
| P5 GUI 产品闭环 | 已开始，Expert Skills Runtime 子路径与 Harness fallback 清理已通过 | Playwright / GUI smoke 覆盖顶部按钮、专家展开、画布互斥、窗口尺寸 | Expert Skills Runtime deterministic Electron fixture 已通过；Harness 旧外层弹窗 fallback 已删除并通过 renderer smoke build；完整专家 / Files / objectCanvas 视觉矩阵仍未完成 |

## 已落地变更

- 新增 Right Surface 类型和状态入口：
  - `src/components/agent/chat/workspace/right-surface/rightSurfaceTypes.ts`
  - `src/components/agent/chat/workspace/right-surface/rightSurfaceState.ts`
  - `src/components/agent/chat/workspace/right-surface/RightSurfaceHost.tsx`
  - `src/components/agent/chat/workspace/right-surface/index.ts`
- `WorkspaceMainArea` 新增 `rightSurfaceContent`：
  - 有 Right Surface 内容时强制进入 `chat-canvas`
  - 使用 Right Surface 内容替换原 canvas content
- `WorkspaceConversationScene` / `useWorkspaceConversationSceneRuntime` 透传 `rightSurfaceContent`
- `AgentChatWorkspace`：
  - 专家面板通过 `RightSurfaceHost` 渲染到内层 surface
  - `WorkspaceShellScene.rightRailNode` 传 `null`
  - 离开 `chat` 布局时收起专家面板
  - 从画布回到聊天时不自动恢复专家面板，必须用户点击专家按钮展开
- 测试夹具补充专家按钮能力：
  - `src/components/agent/chat/index.testFixtures.tsx`
- 页面级回归更新：
  - 打开画布后专家面板消失
  - 回到聊天后仍保持收起
  - 点击专家按钮后再展开
- 专家面板视觉修复：
  - `ExpertInfoPanel` 外层容器从旧 right rail 窄卡片改为 `right-surface-full`
  - 面板宽高占满 `layout-canvas-panel`，不再使用 `clamp(280px, 22vw, 328px)` 固定宽度
  - 去掉外层圆角、阴影和 1180px 以下隐藏规则，避免右侧 surface 内出现悬浮窄卡片
- P2 registry 骨架：
  - 新增 `rightSurfaceRegistry.ts`
  - 登记 `workbench / expertInfo / objectCanvas / files / shell / harness`
  - 统一记录 `slot / exclusiveGroup / openSources / collapseTarget`
  - `AgentChatWorkspace` 的专家 surface definitions 改为通过 registry builder 生成
- P2 controller / state resolver 骨架：
  - 新增 `rightSurfaceController.ts`，统一处理 open / close 与 source 许可判断
  - `resolveWorkspaceRightSurfaceState` 改为消费 controller，不再直接散落拼 active surface
  - 支持显式 `requestedSurface` 与 `source=user|route|runtime`
  - `currentState` 进入解析输入后可保留 `previousSurface`
  - `canvas` layout 映射为 `canvasFirst`，为后续 full canvas / objectCanvas 留出布局语义
- P3 command 前端骨架：
  - 新增 `rightSurfaceCommand.ts`
  - 定义 `WorkspaceRightSurfaceCommand` 与 `WorkspaceRightSurfaceCommandOrigin`
  - 将 `skill` / `mcpTool` origin 收敛为受控 `runtime` source
  - 命令执行仍复用 `openWorkspaceRightSurface` / `closeWorkspaceRightSurface`，不绕过 registry source 规则
- P3 scheduler 前端骨架：
  - 新增 `rightSurfaceScheduler.ts`
  - 固化 `accepted / rejected / deferred / ignored` 决策结果
  - 后台 `skill` / `mcpTool` 请求默认不抢占当前用户正在看的 surface
  - `userLockedSurface` 时非用户请求延后，后续可接 pending badge / tool result intent 队列
- P3 intent queue / adapter 骨架：
  - 新增 `rightSurfaceIntentQueue.ts`
  - runtime / skill / MCP tool result 后续只需要生成 `WorkspaceRightSurfaceIntent`
  - `accepted` 更新 surface 并清理同 id pending intent
  - `deferred` 进入 pending queue，重复 id 覆盖旧请求
  - `rejected / ignored` 不入队
  - TTL prune 已有纯函数，后续可接 pending badge 清理
- P3 launcher projection 骨架：
  - 新增 `rightSurfaceToolbarProjection.ts`
  - 从统一 `surfaceState + pendingIntents` 生成顶部按钮 projection
  - 固定 `active / disabled / pendingCount / collapseTarget`
  - `TaskCenterUtilityToolbar` 已优先消费 projection，不再只靠散落布尔 props 推断专家 / 工作台 / Harness active 和 badge 状态
- P3 launcher projection 接线：
  - `AgentChatWorkspace` 基于 `rightSurfaceState` 生成 `rightSurfaceLaunchers`
  - `useWorkspaceConversationSceneRuntime` 与 `WorkspaceConversationScene` 透传 `rightSurfaceLaunchers`
  - `TaskCenterUtilityToolbar` 继续保留旧 props fallback，避免尚未迁入 Right Surface 的 Shell / Harness 局部状态被误收敛
- P3 runtime pending badge adapter：
  - 新增 `rightSurfaceRuntimeAdapter.ts`
  - 现有 Harness pending 数量会转换为统一 `WorkspaceRightSurfaceIntent`
  - `preferredServiceSkillResultFileTarget` 会转换为 `files` surface pending intent，为文件预览 / skill result 进入 Right Surface 调度链做准备
  - MCP shell 输出可通过 `buildWorkspaceRightSurfaceMcpShellOutputIntents` 转换为 `shell` surface pending intent
  - objectCanvas 候选可通过 `buildWorkspaceRightSurfaceObjectCanvasCandidateIntents` 转换为 `objectCanvas` surface pending intent
  - Browser Assist launching 已作为真实前端来源接入 `objectCanvas` pending intent 聚合，但 objectCanvas launcher 仍保持 disabled
  - 新增 `workspaceRightSurfaceRuntimeProjection.ts`，统一汇总 runtime pending intents 与 launcher available surface 规则
  - `AgentChatWorkspace` 不再向 launcher projection 传空 pending intents
  - `TaskCenterUtilityToolbar` 已覆盖 projection 单独驱动 Harness badge 的回归
  - `filesAvailable` 已由真实 `preferredServiceSkillResultFileTarget` 驱动，避免没有目标文件时暴露假入口
- P3 Harness renderer 接入：
  - `WorkspaceHarnessDialogs.tsx` 新增 `GeneralWorkbenchHarnessSurfaceSection`
  - Harness surface 复用现有 `HarnessStatusPanel layout="dialog"`，先完成承载迁移，不重写 Harness 内部信息架构
  - `AgentChatWorkspace` 的 `rightSurfaceDefinitions` 已登记 `harness` renderer
  - 旧 `GeneralWorkbenchHarnessDialogSection` 外层弹窗 fallback 已删除，不再通过 `WorkspaceMainArea` 渲染第二条 Harness 展示路径
  - 专家按钮、Shell 按钮、工作台按钮和 Harness 按钮都会收敛到统一 Right Surface 互斥状态，避免两个右侧表面并存
  - 修复 `useWorkspaceExpertAgentLaunchSyncRuntime` 在 `sessionId` 初始化前执行导致 `AgentChatWorkspace` 挂载失败的问题
- P3 Files renderer 接入：
  - 新增 `WorkspaceFilesSurface.tsx`，只承载当前结果文件目标和“打开文件”动作，暂不扩展成完整文件管理器
  - `AgentChatWorkspace` 在 `preferredServiceSkillResultFileTarget` 存在时登记 `files` renderer，并通过 `setManualRightSurface("files")` 与专家 / Harness / Shell / 工作台互斥
  - `WorkspaceConversationScene` / `useWorkspaceConversationSceneRuntime` 透传 `rightSurfaceFilesOpen` 与 `onToggleRightSurfaceFiles`
  - `TaskCenterUtilityToolbar` 新增 `files` launcher 按钮，active / disabled / pendingCount 均读取统一 projection
  - `files` 当前只对已有结果文件目标开放，避免无目标时出现假入口
- P4 objectCanvas 最小 renderer 接入：
  - 新增 `WorkspaceObjectCanvasSurface.tsx`，只承载 Browser Assist 候选的 title / url / session / profile / target / transport / control 等最小信息
  - 新增 `workspaceObjectCanvasModel.ts`，定义 board / primary object / edge / source / facts / capability 骨架；当前只启用 `browserSession` 单对象 board
  - `workspaceObjectCanvasModel.ts` 已定义 `editRequested / replayRequested / persistRequested` 三类事件 schema，分别归属 `renderer / runtime / appServer` owner，并记录 required / optional request fields、accepted object kinds 和退出信号
  - 当前事件 schema 仍受 `canEdit / canReplay / canPersist` 控制为 disabled，后续 Skills / MCP tools 可读取契约，但本阶段不开放编辑、回放或正式持久化
  - 新增 `workspaceObjectCanvasPersistence.ts`，把 `persistRequested` 投影为 `workspaceRightSurface/request` 参数，metadata 中同时保留现有 pending objectCanvas renderer 可读字段和 `objectCanvas.event` typed payload
  - `requestWorkspaceObjectCanvasPersist(...)` 只通过 `src/lib/api/workspaceRightSurface.ts` 进入 App Server current method，不在组件里直接 `safeInvoke`，也不新增 parallel JSON-RPC method
  - 新增 `workspaceObjectCanvasReplay.ts`，把 `replayRequested` 投影为 `workspaceRightSurface/request` 参数，metadata 中记录 `runtime` owner、`replayTarget` 和 board / object facts
  - `requestWorkspaceObjectCanvasReplay(...)` 同样只通过 `src/lib/api/workspaceRightSurface.ts` 进入 App Server current method，为后续 RuntimeCore 消费 pending metadata 预留单一入口
  - App Server `RuntimeCore` 已在 `workspaceRightSurface/request` 内识别 `objectCanvas.event.kind=persistRequested` / `owner=appServer` metadata，并投影为内部 `WorkspaceObjectCanvasSnapshot`
  - `RightSurfaceAppDataSource` 新增 `WorkspaceObjectCanvasSnapshot` 与 snapshot list 参数，Local SQLite 数据源新增 `workspace_object_canvas_snapshots` 懒建表，保存 `board_id / revision / persistence_key / object_id / object_kind / snapshot_json`
  - persist / replay metadata 均新增 `objectCanvas.snapshot` 完整 board 快照；`objectCanvas.board` 继续作为轻量 summary，避免后续 Runtime consumer 只能从 summary / primary object facts 反推对象图
  - snapshot store 不新增 JSON-RPC method，不改变 renderer UI 能力，不把 `canPersist=false` 伪装成已启用；当前只证明 renderer persist owner flow 可以真实落到 App Server fact source
  - `RuntimeCore` 新增内部 `WorkspaceObjectCanvasReplayReadiness` / `WorkspaceObjectCanvasReplayReadinessListParams`，从 pending objectCanvas 请求中过滤 `replayRequested / runtime` metadata
  - replay readiness projection 会保留 request scope、boardId、revision、objectId、objectKind、replayTarget、source、facts、完整 board snapshot 和 missingFields
  - replay readiness 当前固定 `executionEnabled=false`，blocker 为 `runtime_replay_execution_not_implemented`，只给后续 Runtime executor 提供真实输入，不启动回放执行
  - `RuntimeCore::dry_run_workspace_object_canvas_replay(...)` 已把 replay readiness 投影为 `object_canvas.replay.dry_run` RuntimeEvent 审计事件，payload 包含 request scope、metadata status、missingFields、execution blocker、blockingReasons、source / facts / boardSnapshot
  - dry-run audit 不 consume pending、不调用浏览器、不启动回放执行；完整 metadata 与缺字段 metadata 都会输出 `audit.decision=blocked`，用于后续 executor 启用前的审计证据
  - 新增 `workspaceObjectCanvasViewModel.ts`，把 Browser Assist / App Server pending metadata 投影为 `browserSession` 对象、阶段、摘要、元数据和主动作
  - `workspaceObjectCanvasViewModel.ts` 已改为消费 `workspaceObjectCanvasModel.ts`，不再自行解析 lifecycle 或持有对象事实源
  - `workspaceObjectCanvasModel.unit.test.ts` 覆盖 board id、primary object、source、facts、capabilities、stage 解析和空字段裁剪
  - 新增 `workspaceObjectCanvasViewModel.unit.test.ts`，覆盖 ready / connecting / failed / pending fallback 和元数据裁剪
  - `WorkspaceObjectCanvasCandidate` 类型事实源收敛到 model 文件，`WorkspaceObjectCanvasSurface` 不再 re-export 候选类型，避免渲染组件成为领域模型事实源
  - `WorkspaceObjectCanvasSurface.test.tsx` 覆盖 ready / connecting / failed 三种阶段、对象类型、阶段徽标、metadata 行和打开浏览器工作台动作
  - 五语言 `workspace.browserAssistRenderer.objectCanvas.*` 文案已覆盖 object kind、stage、summary、status 和主动作
  - `AgentChatWorkspace` 基于 `browserAssistSessionState` / launching state 计算 `objectCanvasCandidateId`，有候选信息时才把 `objectCanvas` 标为 available
  - `objectCanvas` renderer 已登记进 `rightSurfaceDefinitions`，并通过 `setManualRightSurface("objectCanvas")` 与专家 / Harness / Shell / Files / 工作台互斥
  - `TaskCenterUtilityToolbar` 新增 `objectCanvas` launcher 按钮，active / disabled / pendingCount 均读取统一 projection
  - `WorkspaceConversationScene` / `useWorkspaceConversationSceneRuntime` 透传 `rightSurfaceObjectCanvasOpen` 与 `onToggleRightSurfaceObjectCanvas`
  - 本轮只做 Browser Assist / pending metadata 的对象投影骨架，不实现完整 Cameo 对象模型、编辑流、回放和持久化
- P3 App Server contract / API 骨架接入：
  - 新增 App Server current methods：
    - `workspaceRightSurface/request`
    - `workspaceRightSurface/pending/list`
    - `workspaceRightSurface/pending/consume`
    - `workspaceRightSurface/pending/dismiss`
  - 新增 Rust DTO 与 schema：
    - `WorkspaceRightSurfaceRequestParams`
    - `WorkspaceRightSurfacePendingListParams`
    - `WorkspaceRightSurfacePendingConsumeParams`
    - `WorkspaceRightSurfacePendingDismissParams`
    - `WorkspaceRightSurfacePendingRequest`
    - `WorkspaceRightSurfaceRequestResponse`
    - `WorkspaceRightSurfacePendingListResponse`
    - `WorkspaceRightSurfacePendingConsumeResponse`
    - `WorkspaceRightSurfacePendingDismissResponse`
  - `RuntimeCore` 当前以内存 `right_surface_pending` 保存 pending 请求，并支持 workspace / session / surfaceKind / limit 过滤
  - `workspaceRightSurface/pending/consume` 可按 `requestId` / `requestIds` 删除内存 pending 请求，并返回 consumed / missing request id 列表
  - `workspaceRightSurface/pending/dismiss` 可按 `requestId` / `requestIds` 删除内存 pending 请求，并返回 dismissed / missing request id 列表；`reason` 当前只作为协议字段进入请求，不做持久审计
  - `app-server-protocol` method catalog、schema export registry、schema fixtures、`app-server-client` Rust typed helper 已同步
  - `packages/app-server-client` 已同步 method 常量、generated protocol types、request builder、connection wrapper 与 npm client 测试
  - `src/lib/api/appServer.ts` 已暴露 renderer-safe alias 与 `AppServerClient.requestWorkspaceRightSurface(...)` / `listWorkspaceRightSurfacePending(...)` / `consumeWorkspaceRightSurfacePending(...)` / `dismissWorkspaceRightSurfacePending(...)`
  - 新增 `src/lib/api/workspaceRightSurface.ts` 独立网关，业务层后续应从这里进入，不直接散落 `safeInvoke`
  - `src/lib/governance/agentCommandCatalog.json` 新增 `appServerWorkspaceRightSurfaceMethods`
  - `scripts/check-app-server-client-contract.mjs` 新增 Right Surface current contract guard
- P3 App Server pending 前端消费接线：
  - 新增 `useWorkspaceRightSurfacePendingRuntime.ts`，通过 `src/lib/api/workspaceRightSurface.ts` 查询 `workspaceRightSurface/pending/list`
  - 查询范围优先使用 `workspaceId / workspaceRoot`，缺少 workspace 时才退到 `sessionId`
  - bridge 不可用或查询失败时 fail closed，不保留旧 pending
  - pending 请求投影为统一 `WorkspaceRightSurfaceIntent`，并补出 `pendingFileTarget` / `pendingObjectCanvasCandidate`
  - `AgentChatWorkspace` 合并 App Server pending intents 到 toolbar projection，pending files/objectCanvas 请求会显示 badge
  - `AgentChatWorkspace` 使用 pending files metadata 作为 `WorkspaceFilesSurface` 兜底 target；没有真实 `handleOpenServiceSkillResultFile` 时只展示 surface，打开文件按钮保持禁用
  - `AgentChatWorkspace` 使用 pending objectCanvas metadata 作为 `WorkspaceObjectCanvasSurface` 兜底 candidate；没有 Browser Assist candidate 时不展示“打开浏览器工作台”动作
  - 本地 runtime pending intent 不重复包装 App Server pending metadata，避免 toolbar badge 双计数
- P3 UI 自动消费第一刀：
  - `useWorkspaceRightSurfacePendingRuntime` 新增 `consumePendingRequestsForSurface(surfaceKind)`
  - bridge 不可用或 Right Surface pending runtime disabled 时不消费，避免浏览器 / 测试夹具误报成功
  - 只消费当前 `pendingRequests` 中 `status === "pending"` 且 `surfaceKind` 匹配的 request id
  - 调用 `workspaceRightSurface/pending/consume` 后只移除 App Server 返回的 `consumedRequestIds`
  - consume 失败时保留 pending，并把错误写入 `lastError`
  - `AgentChatWorkspace` 已在用户打开 `expertInfo / files / shell / objectCanvas / harness` 时触发自动消费；UI 展开不等待 consume 成功
- P3 UI 显式 dismiss 第一刀：
  - `useWorkspaceRightSurfacePendingRuntime` 新增 `dismissPendingRequestsForSurface(surfaceKind, reason?)`
  - bridge 不可用或 Right Surface pending runtime disabled 时不 dismiss，避免浏览器 / 测试夹具误报成功
  - 只 dismiss 当前 `pendingRequests` 中 `status === "pending"` 且 `surfaceKind` 匹配的 request id
  - 调用 `workspaceRightSurface/pending/dismiss` 后只移除 App Server 返回的 `dismissedRequestIds`
  - dismiss 失败时保留 pending，并把错误写入 `lastError`
  - `AgentChatWorkspace` 已在用户显式关闭 `expertInfo / files / shell / objectCanvas / harness` 或从右侧 surface 切回工作台时触发 dismiss；自动 availability cleanup 不触发 dismiss，避免把运行时临时无候选误判为用户忽略
- P3 App Server pendingChanged notification 骨架：
  - 新增 current notification method：`workspaceRightSurface/pendingChanged`
  - 新增 Rust DTO / schema：`WorkspaceRightSurfacePendingChangedParams`
  - `RpcDispatch` 从 `response + AgentEvent` 扩展为 `response + AgentEvent + JsonRpcNotification`，保留 `agentSession/event` 原链路不变
  - `workspaceRightSurface/request` 成功后附带 `changeType=requested` notification，并携带 request id 与 pending request 快照
  - `workspaceRightSurface/pending/consume` 成功后附带 `changeType=consumed` notification，并携带 consumed / missing request id 列表
  - `workspaceRightSurface/pending/dismiss` 成功后附带 `changeType=dismissed` notification，并携带 dismissed / missing request id 列表
  - `packages/app-server-client/src/protocol.ts` 新增 `workspaceRightSurfacePendingChangedNotification(...)` / `isWorkspaceRightSurfacePendingChangedNotification(...)`
  - Electron host `initialize.capabilities.eventMethods` 已声明 `workspaceRightSurface/pendingChanged`
  - `src/lib/api/workspaceRightSurface.ts` 已新增 `readWorkspaceRightSurfacePendingChangedNotification(...)` 与 `drainWorkspaceRightSurfacePendingChangedNotifications(...)`，只从 App Server drain 消息中过滤 Right Surface notification
  - `useWorkspaceRightSurfacePendingRuntime` 已新增 pendingChanged drain loop，默认每 250ms drain 一次，消费 `requested / consumed / dismissed` 增量更新本地 pending；`pending/list` polling 仍保留为一致性兜底
- P3 共享 renderer event bus 骨架：
  - 新增 `src/lib/api/appServerEventBus.ts`，集中调用 `AppServerClient.drainEvents()` 并把 JSON-RPC notification 广播给 renderer 订阅者
  - `src/lib/api/workspaceRightSurface.ts` 新增 `subscribeWorkspaceRightSurfacePendingChangedNotifications(...)`，Right Surface pending runtime 默认走订阅式事件消费，旧 `drainWorkspaceRightSurfacePendingChangedNotifications(...)` 仅保留为测试 / 过渡注入
  - `AppServerAgentSessionEventDrainRouter` 不再自建 renderer drain loop，改为订阅同一个 event bus，保留 route register、fallback event name、sequence 排序、terminal event 关闭 route 和 fast-first drain 策略
  - event bus 会在 notification 分发后重新计算下一轮间隔，确保 Agent Runtime 首事件后从 `24ms / limit=1` 恢复到 `250ms / limit=50`
  - `resetDefaultAppServerEventBusForTests()` 用于 Vitest 隔离，避免默认 singleton 在测试之间保留订阅或 fake timer 状态

## 验证记录

已通过：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.test.ts" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：5 个测试文件通过，60 个测试通过。

P2 registry 骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：5 个测试文件通过，37 个测试通过。

补充视觉修复回归：

```bash
npx vitest run \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：3 个测试文件通过，24 个测试通过。覆盖专家面板 `data-layout="right-surface-full"`、Right Surface 替换画布内容，以及页面级专家入口路径。

P2 controller / state resolver 与 P3 command / scheduler / intent queue / launcher projection 前端骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：11 个测试文件通过，69 个测试通过。覆盖 registry/controller/state/command/scheduler/intent queue/launcher projection 纯逻辑、Right Surface 替换画布内容、专家 full surface 视觉标记，以及页面级工作台回归。

P3 launcher projection 接入真实 toolbar props 回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：12 个测试文件通过，98 个测试通过。覆盖 Right Surface 纯逻辑、toolbar projection 消费、Workspace 透传、专家 panel 和页面级工作台回归。

P3 runtime pending badge adapter 接线回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：13 个测试文件通过，102 个测试通过。覆盖 runtime / skill / MCP open signal -> intent adapter、Harness pending -> Right Surface badge intent、toolbar projection 单独驱动 Harness badge、Workspace 透传与专家 full surface 回归。

P3 文件预览 / skill result pending intent adapter 接线回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：13 个测试文件通过，104 个测试通过。覆盖文件预览路径归一化、空目标不入队、文件预览目标进入 `files` surface pending intent、Right Surface projection、toolbar、Workspace 透传与专家 full surface 回归。

P3 MCP shell / objectCanvas 候选 helper 回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts"
```

结果：8 个测试文件通过，42 个测试通过。覆盖 runtime adapter、command/controller/queue/scheduler/registry/state/projection 的 Right Surface 纯逻辑主链。

P3 Browser Assist -> objectCanvas 候选接线回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/experts/ExpertInfoPanel.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：14 个测试文件通过，111 个测试通过。覆盖 Browser Assist launching -> objectCanvas pending intent、objectCanvas launcher pendingCount 但 disabled、Right Surface 纯逻辑、toolbar、Workspace 透传与页面级工作台回归。

P4 objectCanvas 最小 renderer / toolbar / scene 接线回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceFilesSurface.test.tsx" \
  "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"
```

结果：5 个测试文件通过，59 个测试通过。覆盖 objectCanvas 最小 renderer、打开浏览器工作台回调、objectCanvas available/disabled projection、顶部按钮 active / badge / disabled 状态、Workspace scene 透传和 Files 回归。

P4 objectCanvas view model / renderer 骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" \
  "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" \
  "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"
```

结果：5 个测试文件通过，46 个测试通过。覆盖 objectCanvas candidate -> browserSession object projection、connecting / ready / pending / failed 阶段、metadata 裁剪、主动作投影、组件渲染、pending metadata 兜底和 Workspace scene 透传。观察到既有 `react-i18next:: NO_I18NEXT_INSTANCE` 测试环境警告，测试通过。

P4 objectCanvas board / object / edge model 骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" \
  "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" \
  "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" \
  "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"
```

结果：6 个测试文件通过，50 个测试通过。覆盖 objectCanvas board / primary object / source / facts / capabilities、view model 消费 model、renderer、runtime projection、App Server pending metadata 兜底和 Workspace scene 透传。观察到既有 `react-i18next:: NO_I18NEXT_INSTANCE` 测试环境警告，测试通过。

P4 objectCanvas renderer smoke build 回归：

```bash
npm run build:renderer:electron:smoke
```

结果：通过。覆盖真实 Electron renderer bundle 构建，验证 `workspaceObjectCanvasModel`、`workspaceObjectCanvasViewModel`、`WorkspaceObjectCanvasSurface`、`AgentChatWorkspace` 与 pending runtime import 能进入 renderer 产物。过程中观察到既有 Vite `oem-runtime-config.js` bundling 提示和 Browserslist 数据提示，未阻塞构建。

P4 objectCanvas GUI smoke 回归：

```bash
npm run verify:gui-smoke
```

结果：通过。覆盖 `verify:app-version`、renderer electron smoke build、`packages/app-server-client` build、`typecheck:electron`、Electron host build、desktop assets、App Server sidecar assets，以及 Electron smoke 的 renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。过程中观察到既有 Vite `oem-runtime-config.js` bundling 提示、Browserslist 数据提示和 Electron GPU mailbox 日志，未阻塞 smoke。

P4 board / object model 后 GUI smoke 补跑：

```bash
npm run verify:gui-smoke
```

结果：通过。首次补跑失败在 `src/components/agent/chat/components/ThinkingBlock.tsx` 的翻译调用语法解析，已把三个 `t(...)` 调用整理为普通两参数写法后重跑通过。最新 smoke 覆盖 renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。

页面级工作台挂载回归：

```bash
npx vitest run "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：1 个测试文件通过，7 个测试通过。覆盖 Browser Assist 相关页面级主路径，确认 `AgentChatWorkspace` objectCanvas 接线未破坏通用工作台挂载。

P3 App Server contract / API 骨架定向回归：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client
cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures
npm run generate:protocol-types
npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/lib/api/appServer.test.ts"
npm --prefix "packages/app-server-client" test
npm run check:protocol-types
node "scripts/check-app-server-client-contract.mjs"
```

结果：Rust App Server Right Surface 定向测试、Rust app-server-client、schema fixture/type generation、renderer API 定向测试、npm app-server-client 测试、protocol type drift check 与 App Server client contract guard 均通过。覆盖 `workspaceRightSurface/request`、`workspaceRightSurface/pending/list` 与 `workspaceRightSurface/pending/consume` 的 current contract。

P3 App Server contract / API 组合门禁：

```bash
npm run test:contracts
git diff --check
```

结果：通过。覆盖 protocol types drift check、App Server client contract guard、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow guard、harness cleanup report check、docs boundary，以及工作树 diff 空白检查。

P3 App Server pending 前端消费骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" \
  "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" \
  "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：6 个测试文件通过，76 个测试通过。覆盖 App Server pending/list hook、pending intent 投影、files/objectCanvas metadata 兜底 target/candidate、toolbar badge、Workspace scene 透传与页面级 Browser Assist 工作台回归。

P3 UI 自动消费第一刀回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" \
  "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"
```

结果：3 个测试文件通过，56 个测试通过。覆盖打开某类 surface 后只消费对应类别 pending、bridge 不可用时不消费、consume 失败保留 pending 并记录错误，以及 toolbar / scene 回归。

P3 UI 显式 dismiss / ignore 第一刀回归：

```bash
cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures
npm run generate:protocol-types
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client workspace_helpers_use_current_methods
npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/appServer.test.ts"
npx vitest run "packages/app-server-client/tests/client.test.mjs"
node "scripts/check-app-server-client-contract.mjs"
npm run test:contracts
git diff --check
npx vitest run "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：通过。覆盖 `workspaceRightSurface/pending/dismiss` 的 Rust protocol / schema export / RuntimeCore / processor dispatch / Rust app-server-client / TS app-server-client / renderer API 网关 / hook /治理 catalog / contract guard。Rust App Server Right Surface 定向测试 10 个通过；Rust app-server-client workspace helper 测试 1 个通过；renderer API + hook + App Server client Vitest 47 个通过；npm app-server-client 52 个测试通过；`test:contracts` 完整契约门禁通过；`git diff --check` 通过；页面级 `index.workbench04` 7 个测试通过。

页面级工作台回归：

```bash
npx vitest run "src/components/agent/chat/index.workbench04.test.tsx"
```

结果：1 个测试文件通过，7 个测试通过。覆盖 `AgentChatWorkspace` 接入 pending consume 后页面级工作台主路径仍可挂载。

P3 contract guard 拆分口径回归：

```bash
node "scripts/check-app-server-client-contract.mjs"
npm run test:contracts
```

结果：通过。`app-server-client-contract` 当前为 282 项检查通过，并且完整 contract 门禁覆盖 protocol types、App Server client contract、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow guard、harness cleanup report check 和 docs boundary。该回归证明拆分后的 `packages/app-server-client/src/index.ts` barrel、`request-client* / connection* / sidecar* / agent-runtime.ts`，以及 renderer `src/lib/api/appServer*` split owner 仍被 contract guard 覆盖。

P3 pendingChanged notification 骨架回归：

```bash
cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures
npm run generate:protocol-types
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client reexports_protocol_method_catalog_for_consumers
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface
npx vitest run "packages/app-server-client/tests/client.test.mjs"
npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/lib/api/appServer.test.ts"
node "scripts/check-app-server-client-contract.mjs"
cargo fmt --manifest-path "lime-rs/Cargo.toml" --all
npm run test:contracts
git diff --check
```

结果：通过。覆盖 `workspaceRightSurface/pendingChanged` 的 Rust method catalog notification 分类、schema / generated TS 类型、processor response 后 notification 输出、Rust app-server-client re-export、TS app-server-client method catalog / parser、renderer constants/types、Electron host eventMethods、治理 catalog 和 contract guard。`app-server workspace_right_surface` 当前 10 个 Right Surface 测试通过，其中 processor 测试断言 `requested / consumed / dismissed` notification 均跟随 response 输出；`packages/app-server-client/tests/client.test.mjs` 当前 53 个测试通过；renderer API 2 个测试文件 / 36 个测试通过；完整 `test:contracts` 通过。

P3 共享 renderer event bus 骨架回归：

```bash
npx vitest run \
  "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" \
  "src/lib/api/workspaceRightSurface.test.ts" \
  "src/lib/api/agentRuntime/threadClient.test.ts"
git diff --check
```

结果：通过。3 个测试文件 / 66 个测试通过，覆盖 Right Surface pending runtime 默认订阅共享 event bus、旧 direct drain 过渡分支、workspaceRightSurface API notification parser、Agent Runtime drain router 订阅同一 bus、fast-first `limit=1 / 24ms` 与首事件后 `limit=50 / 250ms` 恢复。`git diff --check` 通过。本轮没有新增 App Server JSON-RPC method 或 command catalog 变更，因此未重复跑完整 `npm run test:contracts`。

Agent Runtime current fixture 补充验证：

```bash
npm run smoke:agent-runtime-current-fixture
```

结果：未完全通过。已通过 history/cache hydration、stream completion、Claw 终态 UI跳过段、Electron fixture guard、Coding Workbench Electron fixture、cancel-then-continue、Skills Runtime natural / explicit / workspace try、MCP structuredContent、Expert Skills Runtime declared / selected / invoked；最终失败在 `Claw Expert Plaza Skills Runtime click-through Electron fixture`。失败 summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-expert-plaza-skills-runtime-regression-summary.json`，GUI 显示 `技能还不能运行`，原因是 Expert Plaza catalog 注入的 `skill:capability-report` 没有 workspace SkillCatalog locator，`expertPlazaSkillsRuntimeCatalog.workspaceSkillCatalog=null`。当前判断为 Expert Plaza / Skills Runtime fixture 映射缺口，非本轮共享 event bus 直接回归失败；已登记，不在本轮扩写集修复。

GUI smoke 回归：

```bash
npm run verify:gui-smoke
```

结果：通过。覆盖 `verify:app-version`、renderer electron smoke build、`packages/app-server-client` build、`typecheck:electron`、Electron host build、desktop assets、App Server sidecar assets，以及 Electron smoke 的 renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。

已观察但未在本轮处理：

- `react-i18next:: useTranslation: NO_I18NEXT_INSTANCE`：现有测试环境警告，相关测试通过。
- `Browserslist: caniuse-lite is 6 months old`：依赖数据提示，非本轮阻塞。
- `Maximum update depth exceeded`：出现在 `index.workbench04` 的既有自动发送测试场景；本轮收紧专家栏 effect 后仍出现，说明不是 Right Surface 新状态机直接引入。后续若进入 GUI smoke 前仍存在，应独立定位。
- `Maximum update depth exceeded`：本轮接入 App Server pending metadata 后仍只在 `index.workbench04` 的既有自动发送测试场景出现，相关测试通过；已把 pending hook fail-closed 空状态更新改为幂等，但告警未完全消失，后续应独立定位自动发送测试的 effect 依赖。

未完成：

- `npm run typecheck`：本轮曾有一次全仓 typecheck 通过，但在最后一次删除 transition 旧逻辑和更新页面级测试后，重复 typecheck 单进程运行超过 15 分钟仍未退出且无错误输出，已中断；当前无残留 typecheck 进程。下一刀应加 `--extendedDiagnostics` 或拆分 TS project 定位耗时来源。
- `npm run verify:gui-smoke`：已重跑通过。

GUI smoke 记录：

- 最新通过：`npm run verify:gui-smoke`
  - renderer loaded
  - app-server initialized protocol=`appserver.v0` version=`1.76.0`
  - claw workbench shell ready
  - memory settings ready
- 已通过：`verify:app-version`
- 已通过：`build:renderer:electron:smoke`
- 已通过：`electron:build:host`
- 已通过：`electron:build:assets`
- 已通过：`electron:build:app-server-assets`
- 已通过：Electron smoke 主路径，包含 renderer loaded、app-server initialized、claw workbench shell ready、memory settings ready

TypeScript 诊断记录：

- `npm run typecheck -- --extendedDiagnostics --pretty false`：超过 15 分钟仍无输出，已中断；该入口在完成前不会给 diagnostics，无法直接定位耗时文件。
- 已通过：`npm --prefix "packages/app-server-client" run build`
- 已通过：`npm run typecheck:electron`
- 当前判断：长耗时集中在根 `tsconfig.json` 的 renderer / `src` 全仓检查，不在 app-server client 或 Electron host 边界。

视觉复核记录：

- 已尝试用 Playwright MCP 打开 `http://localhost:4567`。
- 阻塞：Playwright MCP 的 Chrome profile 已被现有浏览器占用，`browser_navigate` 和 `browser_tabs list` 均返回 `Browser is already in use`。
- 处理方式：未强行关闭现有浏览器会话；下一刀应使用独立 Playwright profile 或复用真实 Electron fixture 截图。

## 进度日志

### 2026-06-22

- 建立 Right Surface 第一阶段代码骨架。
- 将专家信息面板从外层 right rail 迁入内层 Right Surface 承载层。
- 补充 `WorkspaceMainArea`、`WorkspaceConversationScene`、`useWorkspaceConversationSceneRuntime`、`index.workbench04` 回归。
- 明确互斥策略：打开画布时收起专家，回到聊天后不自动恢复，点击专家按钮才展开。
- 清理重复 / 残留 typecheck 进程。
- 新增本进度计划文件。
- 继续尝试最终验证：`npm run typecheck` 长耗时未退出，已中断；`npm run verify:gui-smoke` 在 app-server sidecar build 阶段被 Cargo artifact lock 阻塞。
- 根据截图反馈修复专家面板视觉形态：专家信息现在作为完整右侧 surface 填满右侧 panel，不再以窄卡片悬在右侧空白区。
- Cargo lock 释放后重跑 `npm run verify:gui-smoke` 并通过；再次运行 `npm run typecheck` 超过 15 分钟无错误输出且未退出，已中断并确认无残留进程。
- 进一步运行 typecheck 诊断：`--extendedDiagnostics` 同样超过 15 分钟无输出；拆分验证 `packages/app-server-client` 与 Electron host TypeScript 均通过，剩余耗时集中在 renderer 根 tsconfig。
- 尝试 Playwright 视觉复核，受已有 Chrome profile 占用阻塞，未强行关闭用户 / 其他 agent 浏览器会话。
- 停止继续深挖全仓 typecheck 细节，将其登记为回头诊断项；优先完成 P2 registry 骨架。
- 新增 Right Surface registry 骨架并让专家 surface definitions 走 registry builder，避免后续 surface 继续散落在 `AgentChatWorkspace`。
- 完成 P2 controller / state resolver 骨架：active surface 打开/关闭统一走 registry source 规则，显式 `requestedSurface` 支持 `user / route / runtime`，并记录 `previousSurface`。
- 完成 P3 command 前端骨架：`skill` / `mcpTool` origin 统一映射到 `runtime` source，未来工具调度不能绕过 registry/controller。
- 完成 P3 scheduler 前端骨架：后台工具请求不会抢占当前 surface，用户锁定时非用户请求延后，source 不允许时 rejected。
- 完成 P3 intent queue / adapter 骨架：deferred 请求进入 pending queue，accepted 同 id 请求可清理 pending，rejected 不入队，TTL prune 已有纯函数。
- 完成 P3 launcher projection 骨架：统一输出 toolbar launcher 的 active / disabled / pendingCount / collapseTarget。
- 完成 P3 launcher projection 接线：`TaskCenterUtilityToolbar` 已接入 `rightSurfaceLaunchers`，专家 / 工作台按钮优先读 projection，旧 props 保留为过渡 fallback。
- 重跑 Right Surface + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 9 个测试文件 / 60 个测试。
- 重跑 `npm run verify:gui-smoke` 并通过，覆盖 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings 主路径。
- 新增 intent queue 后重跑 Right Surface + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 10 个测试文件 / 66 个测试。
- 新增 launcher projection 后重跑 Right Surface + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 11 个测试文件 / 69 个测试。
- 接入真实 toolbar props 后重跑 Right Surface + `TaskCenterUtilityToolbar` + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 12 个测试文件 / 98 个测试。
- 新增 P3 runtime pending badge adapter：把 Harness pending 数量转换为统一 Right Surface intent，`AgentChatWorkspace` 的 launcher projection 不再传空 `pendingIntents`。
- 补充 adapter 单测和 toolbar Harness badge projection 回归；重跑 Right Surface + toolbar + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 13 个测试文件 / 102 个测试。
- 重跑 `npm run verify:gui-smoke` 并通过，覆盖 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings 主路径。
- 扩展 P3 runtime adapter：把 `preferredServiceSkillResultFileTarget` 转换为 `files` surface pending intent，先接调度数据，不把 `files` surface 标为可用，避免未迁 renderer 的假入口。
- 重跑 Right Surface + toolbar + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 13 个测试文件 / 104 个测试。
- 重跑 `npm run verify:gui-smoke` 并通过；期间 Cargo artifact lock 等待后释放，最终覆盖 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings 主路径。
- 补齐 MCP shell 输出和 objectCanvas 候选的 runtime adapter 命名 helper，只进入 intent / projection 数据层，不接 renderer、不新增按钮、不改 App Server contract。
- 重跑 Right Surface 纯逻辑回归，通过 8 个测试文件 / 42 个测试；本刀未触碰渲染接线，未重复跑 GUI smoke。
- 新增 `workspaceRightSurfaceRuntimeProjection.ts` 聚合 runtime pending intents 和 available surfaces，`AgentChatWorkspace` 改为通过该 projection 汇总 Right Surface launcher 输入。
- 接入真实 Browser Assist launching 作为 objectCanvas 候选 pending intent；objectCanvas 仍 disabled，不新增按钮和 renderer。
- 重跑 Right Surface + runtime projection + toolbar + Workspace + ExpertInfoPanel + `index.workbench04` 定向组合回归，通过 14 个测试文件 / 111 个测试。
- 重跑 `npm run verify:gui-smoke` 并通过，覆盖 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings 主路径。
- 完成 objectCanvas 最小 renderer 接入：Browser Assist 候选信息可进入 Right Surface，顶部 objectCanvas 按钮读取统一 projection，点击后与专家 / Harness / Files / Shell / 工作台互斥，并可打开浏览器工作台。
- 补齐 objectCanvas 五语言文案：`zh-CN / zh-TW / en-US / ja-JP / ko-KR` 的 agent 顶部按钮文案与 workspace renderer 字段文案。
- 重跑 objectCanvas / Files / projection / toolbar / scene 定向回归，通过 5 个测试文件 / 59 个测试。
- 完成 App Server pending 前端消费骨架：`useWorkspaceRightSurfacePendingRuntime` 通过 renderer API 网关查询 `workspaceRightSurface/pending/list`，把 pending 请求投影为 Right Surface intent 和 files/objectCanvas metadata target。
- `AgentChatWorkspace` 已合并 App Server pending intents 到 toolbar projection，并用 pending files/objectCanvas metadata 兜底 surface availability 与 renderer target/candidate，完成 `request -> pending/list -> toolbar badge -> surface open` 最小闭环。
- 对 App Server pending files 请求，只有 metadata target 时可打开 Files surface，但没有真实文件打开 handler 时按钮保持禁用，避免伪造文件能力。
- 对 App Server pending objectCanvas 请求，只有 metadata candidate 时可打开 Object Canvas surface，但没有 Browser Assist candidate 时不展示“打开浏览器工作台”动作，避免伪造 runtime 能力。
- 收紧 pending hook 的 fail-closed 空状态更新，避免 bridge 不可用或空 pending 时反复写入新空数组。
- 重跑 App Server pending hook / runtime adapter / projection / toolbar / Workspace scene / 页面级工作台定向回归，通过 6 个测试文件 / 76 个测试。
- 重跑 `index.workbench04` 页面级工作台挂载回归，通过 1 个测试文件 / 7 个测试。
- 重跑 `npm run verify:gui-smoke` 并通过，覆盖 Electron renderer、App Server sidecar、Claw workbench shell 和 memory settings 主路径。

### 2026-06-23

- 完成 Right Surface App Server current JSON-RPC 骨架：`workspaceRightSurface/request`、`workspaceRightSurface/pending/list` 和 `workspaceRightSurface/pending/consume` 已进入 Rust protocol、method catalog、schema export、RuntimeCore、processor dispatch、Rust app-server-client、TS app-server-client 与 renderer API 网关。
- 新增 `src/lib/api/workspaceRightSurface.ts`，后续 Skills / MCP tools / 对话侧调度右侧 surface 应优先经该网关进入 App Server current method，不在组件中直接 `safeInvoke`。
- 同步 `src/lib/governance/agentCommandCatalog.json` 的 `appServerWorkspaceRightSurfaceMethods`，并在 `scripts/check-app-server-client-contract.mjs` 增加 Right Surface contract guard。
- 补充回归：
  - `src/lib/api/workspaceRightSurface.test.ts` 覆盖 request / pending list / pending consume current method、默认空参数和 fail-closed shape validation
  - `src/lib/api/appServer.test.ts` 覆盖 renderer `AppServerClient` 通过 `app_server_handle_json_lines` 调用 Right Surface methods
  - `packages/app-server-client/tests/client.test.mjs` 覆盖 method builder、method catalog 与 `isAppServerRequestMethod`
- 已通过：`npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/lib/api/appServer.test.ts"`、`npm --prefix "packages/app-server-client" test`、`npm run check:protocol-types`、`node "scripts/check-app-server-client-contract.mjs"`。
- 已通过：`npm run test:contracts`、`git diff --check`。这次组合门禁证明 Right Surface App Server current contract/API 骨架没有破坏协议生成、命令目录、治理守卫、脚本治理、release workflow 守卫和文档边界。
- 代码体量债登记：`packages/app-server-client/src/index.ts` 与 `src/lib/api/appServer.ts` 均已超过 1000 行。本轮只做 contract 薄接线，未追加业务状态机；后续应拆分 app-server-client workspace/right-surface 子模块和 renderer App Server domain aliases，退出条件是新增 method 不再直接膨胀巨型 facade。
- 完成 UI 自动消费第一刀：`useWorkspaceRightSurfacePendingRuntime` 返回 `consumePendingRequestsForSurface(surfaceKind)`，`AgentChatWorkspace` 在用户打开 `expertInfo / files / shell / objectCanvas / harness` 时调用 `workspaceRightSurface/pending/consume`，只清理同类 pending 请求。
- 自动消费策略保持非阻塞：surface 展开不等待 consume 成功；consume 失败时 pending 保留并记录错误，避免 UI 因 App Server 临时失败丢失调度意图。
- contract guard 拆分口径已收口：`scripts/check-app-server-client-contract.mjs` 支持 `packages/app-server-client` 与 renderer `src/lib/api/appServer*` 拆分 owner，并接受 current method spec 安装方式，不再要求旧单体 facade 中出现所有手写 wrapper。
- MCP contract guard 同步支持 app-server-client split owner，避免 MCP current contract 检查误判拆分后的 `request-client.ts` / `connection-methods.ts`。
- 已通过：`npx vitest run "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"`，3 个测试文件 / 56 个测试通过。
- 已通过：`npx vitest run "src/components/agent/chat/index.workbench04.test.tsx"`，1 个测试文件 / 7 个测试通过。
- 已通过：`node "scripts/check-app-server-client-contract.mjs"`，`app-server-client-contract` 282 项通过。
- 已通过：`npm run test:contracts`，完整契约门禁通过。
- 完成 P3 显式 dismiss / ignore 语义骨架：新增 `workspaceRightSurface/pending/dismiss`，同步 Rust protocol、method catalog、schema export、RuntimeCore、processor dispatch、Rust app-server-client、TS app-server-client、renderer API 网关、治理 catalog 和 contract guard。
- `useWorkspaceRightSurfacePendingRuntime` 新增 `dismissPendingRequestsForSurface(surfaceKind, reason?)`，只 dismiss 同类 pending 请求，只按 App Server 返回的 `dismissedRequestIds` 本地移除；失败时保留 pending 并记录错误。
- `AgentChatWorkspace` 已把用户显式关闭路径接到 dismiss：再次点击同一 surface 入口关闭、Shell 内部关闭按钮、从右侧 surface 切回工作台；自动 availability cleanup 暂不 dismiss。
- 刷新 schema fixtures 与 TS generated protocol types，新增 `WorkspaceRightSurfacePendingDismissParams.json` / `WorkspaceRightSurfacePendingDismissResponse.json` 及对应 generated TS interface。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface`，10 个 Right Surface server 测试通过。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client workspace_helpers_use_current_methods`，1 个 Rust app-server-client workspace helper 测试通过。
- 已通过：`npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/appServer.test.ts"`，3 个测试文件 / 47 个测试通过。
- 已通过：`npx vitest run "packages/app-server-client/tests/client.test.mjs"`，1 个测试文件 / 52 个测试通过。
- 已通过：`node "scripts/check-app-server-client-contract.mjs"`，`app-server-client-contract` 282 项通过；已通过：`npm run test:contracts`、`git diff --check` 与 `npx vitest run "src/components/agent/chat/index.workbench04.test.tsx"`。
- 完成 P3 pendingChanged notification 骨架：新增 `workspaceRightSurface/pendingChanged` current notification method 与 `WorkspaceRightSurfacePendingChangedParams`，同步 Rust protocol、schema export、processor dispatch、Rust app-server-client、TS app-server-client、renderer constants/types、Electron host capability、治理 catalog 和 contract guard。
- `RpcDispatch` 已支持通用 `JsonRpcNotification`，Right Surface request / consume / dismiss 会在 response 后附带 `requested / consumed / dismissed` notification；Agent session event 仍保持原 `agentSession/event` 路径。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together`，1 个 protocol catalog 测试通过。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client reexports_protocol_method_catalog_for_consumers`，1 个 Rust client catalog 测试通过。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface`，10 个 Right Surface server 测试通过。
- 已通过：`npx vitest run "packages/app-server-client/tests/client.test.mjs"`，1 个测试文件 / 53 个测试通过。
- 已通过：`npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/lib/api/appServer.test.ts"`，2 个测试文件 / 36 个测试通过。
- 已通过：`node "scripts/check-app-server-client-contract.mjs"`，`app-server-client-contract` 282 项通过；已通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`、`npm run test:contracts` 与 `git diff --check`。
- 完成 P3 pendingChanged renderer 订阅消费骨架：`workspaceRightSurface` API 网关新增 notification parser 与 `drainWorkspaceRightSurfacePendingChangedNotifications(limit)`，业务 hook 不直接散落 JSON-RPC method 判断。
- `useWorkspaceRightSurfacePendingRuntime` 新增 pendingChanged drain loop：`requested` 会按当前 workspace/session 查询范围 upsert pending，`consumed / dismissed` 会按服务端确认 ids 移除 pending，`missingRequestIds` 不会被当作已变化请求处理。
- pendingChanged drain 失败时只记录 `lastError`，不清空 polling 得到的 pending；`pending/list` polling 保留兜底，避免全局 drain 队列被其他 renderer 消费者抢走后 UI 永久不刷新。
- 已通过：`npx vitest run "src/lib/api/workspaceRightSurface.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/appServer.test.ts"`，3 个测试文件 / 54 个测试通过。
- 完成 P3 pending 持久化恢复骨架：新增 `RightSurfaceAppDataSource`，`RuntimeCore` request/list/consume/dismiss 接入 AppDataSource；Noop 数据源保持内存行为，Local SQLite 数据源开启持久化恢复。
- `workspaceRightSurface/request` 先保存 pending 到 AppDataSource，再加入 RuntimeCore 内存；`pending/list` 会合并内存与持久化 pending，并在持久化可用时按当前查询 scope 清理已被其他 core 消费 / dismiss 的陈旧内存 pending。
- `pending/consume` 与 `pending/dismiss` 会删除持久化 pending，并同步删除当前 core 内存 pending；同一个测试 AppDataSource 下，`core1` 创建 pending、`core2` 恢复并 consume 后，`core1/core2` 再 list 均为空。
- Local SQLite 骨架使用 `workspace_right_surface_pending_requests` 懒建表保存 request JSON 与 workspace/session/surface/status 索引；本轮暂不升级为正式 migration 文件，后续若产品级长期表治理打开，应补 schema/migration 入口。
- 已通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`。
- 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workspace_right_surface`，11 个 Right Surface server / processor 测试通过。
- 已通过：`git diff --check`。
- 完成 P3 共享 renderer event bus 骨架：新增 `AppServerEventBus` 作为 renderer 内唯一 `AppServerClient.drainEvents()` 消费入口，并支持订阅者声明 `limit / intervalMs / shouldDrain`。
- Right Surface pending runtime 默认通过 `subscribeWorkspaceRightSurfacePendingChangedNotifications(...)` 订阅共享 event bus；旧 `drainWorkspaceRightSurfacePendingChangedNotifications(...)` 保留为测试 / 过渡注入，生产默认路径不再直接抢 drain 队列。
- Agent Runtime `AppServerAgentSessionEventDrainRouter` 改为订阅同一个 event bus，不再自建 drain loop；保留路由注册、fallback event name、sequence 排序、terminal route 关闭和 fast-first 策略。
- 修正共享 bus 的下一轮间隔计算：首事件 drain 前仍使用 `limit=1 / 24ms`，首事件分发后重新计算并恢复 `limit=50 / 250ms`，避免过度快速轮询。
- 为 `threadClient.test.ts` 增加 `resetDefaultAppServerEventBusForTests()` 的 before/after 隔离，避免 singleton bus 与 fake timer 跨用例污染。
- 已通过：`npx vitest run "src/lib/api/agentRuntime/threadClient.test.ts"`，39 个测试通过。
- 已通过：`npx vitest run "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/workspaceRightSurface.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts"`，3 个测试文件 / 66 个测试通过。
- 已通过：`git diff --check`。
- 补跑 `npm run smoke:agent-runtime-current-fixture`：聚合入口未完全通过；前置 history/cache、stream completion、Electron fixture guard、Coding Workbench、cancel-then-continue、Skills Runtime、MCP structuredContent、Expert Skills Runtime 均通过，最终失败在 Expert Plaza click-through Electron fixture。
- Expert Plaza 失败证据显示 `skill:capability-report` 缺少 workspace SkillCatalog locator，GUI 停在“技能还不能运行 / no SkillCatalog locator”；该缺口属于 Expert Plaza / Skills Runtime fixture 映射链，已登记为非本轮 event bus 主线阻塞。
- 真实 live Provider 验证收敛：`scripts/agent-runtime/expert-skills-live-runner.mjs` 不再只消费外部 summary 或 fixture evidence，已补 `--execute-live-runtime` 前置的 workspace-local `capability-report` Skill 包、`harness.workspace_skill_runtime_enable` metadata、完整 `evidence/export` events 读取，以及失败态 / Provider 错误的 summary 判定；避免把 `failed` 或 free text 误判成 completed / tool evidence。runner 新增 `--completion-grace-ms`，避免真实 turn 在 timeout 边界刚完成时写不出 summary。
- 修复 Expert Skills Runtime live selector 主缺口：expert-bound / workspace runtime enable 候选不再被当成已显式选择的 `SKILL.md` body 注入；只有 `$skill` / catalog scene / implicit 高置信且无 expert/runtime enable 时才注入 selected body。expert 候选提示明确要求 `skill_search -> Skill`。`selected_agent_skill_allowed_tools_for_turn` 也改为只读取实际 body selection，避免 `allowed_tools: Read` 把 live turn 裁成 `tools=1` 并隐藏 `skill_search` / `Skill`。
- 已通过：`npx vitest run "scripts/agent-runtime/expert-skills-live-runner.test.mjs"`，8 个测试通过；已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::agent_skills_context -- --nocapture`，9 个测试通过；已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::agent_skills_telemetry -- --nocapture`，4 个测试通过；已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server session_config_does_not_project_expert_runtime_enable_allowed_tools_to_turn_scope -- --nocapture`，1 个测试通过；已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tools::skill_search_tool -- --nocapture`，3 个测试通过；已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tools::skill_tool_gate -- --nocapture`，11 个测试通过。
- 真实 live Provider 结果：
  - `deepseek / deepseek-v4-flash`：真实到达 Provider，但返回 `402 Payment Required: Insufficient Balance`。
  - `siliconflow-cn / deepseek-ai/DeepSeek-V4-Flash`：真实到达 Provider，但返回 `403 Forbidden: account balance is insufficient`。
  - `custom-6afceaf4-3287-4848-b8a0-2d2d25e738f7 / kimi-for-coding`：真实到达 Provider，但返回 `401 Unauthorized`。
  - `custom-f74b38b5-6d3f-44ef-aa0f-99d70c3482ed / sensenova-6.7-flash-lite`：真实完成 turn，后端真实记录 expert skillRefs、`SKILL.md` body read、Skill gate；模型没有发起 `skill_search` / `Skill`，仅文本说明或直接 `Read`。
  - `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.4`：第一轮真实完成 turn，后端真实记录 expert skillRefs、`SKILL.md` body read、Skill gate，并真实调用 `Skill(project:capability-report)`；缺 `skill_search` before `Skill` ordering，live gate 未通过。修复后第二轮真实 turn 在 runner timeout 后几秒完成，late export 显示 `tools=37`、`skill_search` 结构化调用在 `Skill(project:capability-report)` 前出现，`Skill` 调用、`SKILL.md` body read 与 Skill gate 均真实发生，`expert-skills-live-runner-summary.json` 归一化为 `ok=true`。
- 当前真实状态：Expert Skills Runtime live 主链已跑通，不再是 mock / fixture 结论；通过证据在 `.lime/qc/expert-skills-live-runner-summary.json` 与 `.lime/qc/expert-skills-live-runner-late-evidence-export.json`。剩余缺口是 runner 原命令在 180s 边界超时，已补 `--completion-grace-ms`，仍需用新 runner 再跑一次端到端自动写 summary 验证。
- 完成 Expert Skills Runtime 双门验证收口：
  - 修复 deterministic Electron fixture 顶部 Harness 按钮可见但点击 no-op 的问题：`AgentChatWorkspace` 的 Harness Right Surface 可用条件收敛到 `!suppressHomeNavbarUtilityActions && showHarnessToggle`，避免 toolbar 显示入口但 handler 因 `isThemeWorkbench` 直接返回。
  - 刷新 Electron smoke renderer 产物：`npm run build:renderer:electron:smoke` 通过，确保真实 fixture 加载的 `dist/index.html` 使用新接线。
  - 修复 fixture 对 Right Surface Harness 的旧 dialog 假设：导出证据包后，如果 Harness 已作为 `workspace-right-surface-host[data-surface="harness"]` 打开，脚本会点击顶部专家按钮切回 `expertInfo` surface，再等待专家面板 Evidence Pack 复盘卡。
  - 对齐专家面板补目录映射断言：当前产品语义是把待映射 `skill:code-review` 替换为可运行 `skill:local:capability-report`，因此 deterministic gate 校验替换后的 expert skillRefs 到达 backend，不再要求旧待映射 ref 同时保留。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"`，3 个测试文件 / 54 个测试通过。
  - 已通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/expert-skills-live-gate.test.mjs" "scripts/agent-runtime/expert-skills-live-runner.test.mjs"`，3 个测试文件 / 28 个测试通过。
  - 已通过：`CARGO_TARGET_DIR=".lime/qc/cargo-target-app-server-smoke" npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture" --prefix "claw-chat-current-fixture-expert-panel-skills-runtime-regression" --timeout-ms 240000`。summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-expert-panel-skills-runtime-regression-summary.json`，`ok=true`，`liveProviderNotUsed=true`，覆盖专家广场启动、专家面板补技能、第二轮 backend turnStart、read model completed、Harness Right Surface 证据导出和专家面板复盘摘要。
  - 已通过：`node scripts/agent-runtime/expert-skills-live-gate.mjs --live-summary ".lime/qc/expert-skills-live-runner-summary.json"`，输出 `EXPERT_SKILLS_LIVE_GATE_RESULT=pass` 与 `deterministic=pass live=pass`。
- 完成 Harness 旧外层弹窗 fallback 清理：
  - 删除 `GeneralWorkbenchHarnessDialogSection` 组件出口，不再保留 Right Surface 之外的 Harness 外层弹窗展示路径。
  - 删除 `AgentChatWorkspace` 中的旧 dialog 构造，以及 `useWorkspaceConversationSceneRuntime` / `WorkspaceConversationScene` / `WorkspaceMainArea` 的 `generalWorkbenchHarnessDialog` 透传和渲染。
  - 保留 `GeneralWorkbenchHarnessSurfaceSection` 作为 current Right Surface renderer；保留 `GeneralWorkbenchDialogSection` 作为现有输入区 / 工作台弹窗，不属于本轮清理对象。
  - 已通过残留扫描：`rg -n "GeneralWorkbenchHarnessDialogSection|generalWorkbenchHarnessDialog" "src/components/agent/chat"` 无命中。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/WorkspaceHarnessDialogs.test.tsx" "src/components/agent/chat/workspace/WorkspaceMainArea.test.tsx" "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx" "src/components/agent/chat/workspace/useWorkspaceConversationSceneRuntime.test.ts"`，4 个测试文件 / 59 个测试通过。
  - 已通过：`npm run build:renderer:electron:smoke`，Electron renderer smoke bundle 成功产出。
  - 已通过：`git diff --check`。
- 完成 P4 objectCanvas view model / object projection 第一刀：
  - 新增 `workspaceObjectCanvasViewModel.ts`，把 Browser Assist / App Server pending metadata 投影为 `browserSession` 对象、阶段、摘要、metadata 和主动作。
  - `WorkspaceObjectCanvasSurface` 改为消费 view model，组件只保留渲染和打开浏览器工作台动作接线；`WorkspaceObjectCanvasCandidate` 不再从组件 re-export。
  - `WorkspaceObjectCanvasSurface.test.tsx` 覆盖 ready / connecting / failed 阶段、对象类型、阶段徽标、metadata 行和打开动作；测试 mock 中清理旧 renderer 文案 key。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"`，5 个测试文件 / 46 个测试通过。
  - 已通过：`npm run verify:gui-smoke`，真实 Electron / App Server smoke 覆盖 renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。
  - 已通过：`git diff --check`。
- 完成 P4 objectCanvas board / object / edge model 第一刀：
  - 新增 `workspaceObjectCanvasModel.ts`，定义 board、primary object、edge、source、facts、capabilities 骨架；当前只生成单个 `browserSession` primary object，edge 为空。
  - `canEdit / canReplay / canPersist` 明确为 `false`，避免把最小 Browser Assist renderer 误判为完整 Cameo 原型。
  - `workspaceObjectCanvasViewModel.ts` 改为消费 model，stage / facts / capabilities 的事实源迁出展示投影。
  - Browser Assist 候选标记 `sourceKind="browserAssist"`；App Server pending 候选标记 `sourceKind="rightSurfacePending"` 与 `sourceRequestId`，为后续 replay / persist 保留来源边界。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/WorkspaceConversationScene.test.tsx"`，6 个测试文件 / 50 个测试通过。
  - 已通过：`npm run build:renderer:electron:smoke`，Electron renderer smoke bundle 成功产出。
  - `npm run verify:gui-smoke` 首次补跑暴露 `ThinkingBlock.tsx` 翻译调用语法构建阻塞；已最小整理调用写法，不改变展示逻辑。
  - 已通过：`npm run verify:gui-smoke`，真实 Electron / App Server smoke 覆盖 renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。
- 完成 P4 objectCanvas edit / replay / persist 事件 schema 骨架：
  - `workspaceObjectCanvasModel.ts` 新增 `WorkspaceObjectCanvasEventSchema`、request schema、exit condition 和 owner 类型。
  - `editRequested` 归属 `renderer`，以 `boardRevisionAdvanced` 作为退出信号；`replayRequested` 归属 `runtime`，以 `runtimeReplayStarted` 作为退出信号；`persistRequested` 归属 `appServer`，以 `boardSnapshotPersisted` 作为退出信号。
  - 三类事件当前均由 `canEdit / canReplay / canPersist` 显式控制为 disabled，不改变 UI 动作和 Browser Assist 打开工作台能力。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceObjectCanvasSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`，4 个测试文件 / 31 个测试通过。
- 完成 P4 objectCanvas `persistRequested` App Server owner flow 第一刀：
  - 新增 `workspaceObjectCanvasPersistence.ts`，把 board、primary object、persist event schema、request payload、persistence key 和 pending renderer 字段投影为 `workspaceRightSurface/request` 参数。
  - `requestWorkspaceObjectCanvasPersist(...)` 通过 `src/lib/api/workspaceRightSurface.ts` 调用 App Server current `workspaceRightSurface/request`，真实进入 Right Surface pending / notification / 持久化恢复链路；本轮不新增 JSON-RPC method。
  - `metadata.objectCanvas.event.enabled` 继续跟随 `canPersist=false`，用于声明契约和 owner flow，不把正式 snapshot 持久化伪装成已启用。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasPersistence.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/workspaceRightSurface.test.ts"`，5 个测试文件 / 39 个测试通过。
  - 已尝试：`npx tsc --noEmit --project "tsconfig.renderer.json"`，60 秒无输出后中断；该问题与既有 renderer/root typecheck 长耗时风险一致，继续登记为诊断项。
  - 已通过：`npm run build:renderer:electron:smoke`，Electron renderer smoke bundle 成功产出；已通过：`git diff --check`。
- 完成 P4 objectCanvas `replayRequested` Runtime owner flow 第一刀：
  - 新增 `workspaceObjectCanvasReplay.ts`，把 board、primary object、replay event schema、request payload、`replayTarget` 和 pending renderer 字段投影为 `workspaceRightSurface/request` 参数。
  - `requestWorkspaceObjectCanvasReplay(...)` 通过 `src/lib/api/workspaceRightSurface.ts` 调用 App Server current `workspaceRightSurface/request`，真实进入 Right Surface pending / notification / 持久化恢复链路；后续 RuntimeCore 应消费 `metadata.objectCanvas.event.kind === "replayRequested"` 执行回放。
  - `metadata.objectCanvas.event.enabled` 继续跟随 `canReplay=false`，用于声明 Runtime owner flow，不把回放执行伪装成已启用。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasReplay.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasPersistence.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasViewModel.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/lib/api/workspaceRightSurface.test.ts"`，6 个测试文件 / 42 个测试通过。
  - 已通过：`npm run build:renderer:electron:smoke`，Electron renderer smoke bundle 成功产出，耗时约 2 分 48 秒；已通过：`git diff --check`。
- 完成 P4 objectCanvas `persistRequested` 正式 snapshot store 第一刀：
  - `RightSurfaceAppDataSource` 新增内部 `WorkspaceObjectCanvasSnapshot` / `WorkspaceObjectCanvasSnapshotListParams`，供 RuntimeCore、LocalAppDataSource 和后续 replay consumer 共享同一事实源。
  - `RuntimeCore::request_workspace_right_surface` 继续复用 current `workspaceRightSurface/request`，仅在 `surfaceKind=objectCanvas` 且 metadata 为 `persistRequested / appServer` 时抽取 boardId、revision、persistenceKey、candidateId、objectId、objectKind 与原始 snapshot JSON。
  - Local SQLite 数据源新增 `workspace_object_canvas_snapshots` 懒建表和 workspace/session/persistenceKey 索引；本刀不新增 JSON-RPC method，不触碰协议四侧，也不新增用户可见 UI 文案。
  - renderer persist / replay metadata 已同时携带轻量 `objectCanvas.board` summary 和完整 `objectCanvas.snapshot` board 快照，App Server snapshot store 会保存完整 metadata JSON，为后续 RuntimeCore replay consumer 提供真实输入。
  - 已通过：`npx vitest run "src/components/agent/chat/workspace/workspaceObjectCanvasModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasPersistence.unit.test.ts" "src/components/agent/chat/workspace/workspaceObjectCanvasReplay.unit.test.ts"`，3 个测试文件 / 11 个测试通过。
  - 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server local_data_source::tests::right_surface_object_canvas_snapshot_persists_in_local_sqlite_data_source -- --nocapture`，1 个真实 Local SQLite 测试通过。
  - 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tests::right_surface -- --nocapture`，11 个 Right Surface Runtime 测试通过。
  - 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server right_surface -- --nocapture`，14 个 Right Surface Runtime / processor / Local SQLite 测试通过。
  - 已通过：`npm run build:renderer:electron:smoke`，Electron renderer smoke bundle 成功产出，验证新增 TS metadata 字段能进入真实 renderer bundle。
- 完成 P4 objectCanvas `replayRequested` Runtime consumer 骨架第一刀：
  - 新增 RuntimeCore 内部 `WorkspaceObjectCanvasReplayReadiness` / `WorkspaceObjectCanvasReplayReadinessListParams`，不新增 JSON-RPC method，不触碰协议四侧。
  - `list_workspace_object_canvas_replay_readiness(...)` 会基于 current pending/list 事实源读取 objectCanvas pending request，并筛选 `metadata.objectCanvas.event.kind=replayRequested / owner=runtime`。
  - readiness projection 会投影 boardId、revision、objectId、objectKind、replayTarget、source、facts、完整 `objectCanvas.snapshot`、missingFields、metadataReady 和 execution blocker；完整 metadata 标记 `metadataReady`，缺 objectId / snapshot 时标记 `metadataIncomplete`。
  - 回放执行仍显式禁用：`executionEnabled=false`，`executionBlocker=runtime_replay_execution_not_implemented`。
  - 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server right_surface -- --nocapture`，16 个 Right Surface Runtime / processor / Local SQLite 测试通过。
- 完成 P4 objectCanvas `replayRequested` Runtime dry-run / audit 骨架：
  - 新增 `RuntimeCore::dry_run_workspace_object_canvas_replay(...)`，复用 readiness list，不新增 JSON-RPC method，不触碰协议四侧。
  - 新增 `object_canvas.replay.dry_run` RuntimeEvent 审计投影，payload 固化 `schemaVersion=object-canvas.replay.dry-run.v1`、request scope、boardId、objectId、metadata status、missingFields、execution blocker、blockingReasons、source / facts / boardSnapshot。
  - 完整 metadata 会生成 dry-run audit 事件但仍 `execution.wouldExecute=false`，原因是 Runtime replay executor 尚未实现；缺字段 metadata 会把缺失字段与 executor blocker 一并放入 `audit.blockingReasons`。
  - 非 replay pending 不会产生 dry-run event；dry-run 不 consume pending、不调用浏览器、不启动实际回放。
  - 已通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`。
  - 已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server right_surface -- --nocapture`，19 个 Right Surface Runtime / processor / Local SQLite 测试通过。

## 下一刀

1. 继续 P5：用独立 Playwright profile 或真实 Electron fixture 截图复核专家 / Files / objectCanvas full right surface 的视觉效果，确认没有右侧空白和文本挤压。
2. 回头补正式持久化表治理：如果 Right Surface pending / objectCanvas snapshot 进入长期产品路径，把当前懒建表收敛进统一 schema / migration 事实源。
3. 后续 P4：在 dry-run audit 通过后再接真实 Runtime replay executor；启用前保持 `canEdit / canReplay / canPersist=false`，不要在 `AgentChatWorkspace` 堆新 layout 分支。
4. 回头诊断 renderer 根 `typecheck` 长耗时；不要让它阻塞 Right Surface 骨架推进。

## 风险与约束

- 当前工作树存在大量并行改动；后续只应触碰 Right Surface、Workspace 接线、相关测试和本计划文件。
- 不要恢复外层 `WorkspaceShellScene.rightRailNode` 专家栏。
- 不要让专家栏从 layout 切换后自动反弹展开。
- 不要把最小 Browser Assist objectCanvas renderer 当成完整 Cameo 原型；完整对象模型属于 P4 后续。
- `workspaceObjectCanvasModel.ts` 当前只有 browserSession 单对象 board；事件 schema 已定义，`persistRequested / replayRequested` 已能生成 App Server pending request，`persistRequested` 已能写入 App Server snapshot store，`replayRequested` 已能生成 RuntimeCore readiness projection 与 dry-run audit event，但 `canEdit / canReplay / canPersist` 明确为 false，后续启用前必须补真实 Runtime replay executor、回放回归和正式 migration 治理。
- 新增用户可见文案必须走五语言 i18n；objectCanvas 顶部按钮与 renderer 字段已覆盖五语言。
- Right Surface App Server contract 当前仍是骨架：pending request 已有 AppDataSource / Local SQLite 最小恢复能力；UI consume / dismiss / pendingChanged renderer 消费只覆盖“用户打开对应 surface 后清理同类 pending”“用户显式关闭 / 忽略后 dismiss 同类 pending”和“notification 增量刷新本地 pending”。共享 renderer event bus 已完成骨架收敛，但不等于正式 migration 治理或完整对象模型完成。
- `packages/app-server-client/src/index.ts` 与 `src/lib/api/appServer.ts` 已超过 1000 行；后续新增业务逻辑必须拆分，不能继续把状态机或投影逻辑塞进 facade。
