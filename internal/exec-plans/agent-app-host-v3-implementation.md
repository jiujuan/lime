# Agent App Host v3 快速落地计划

> 状态：进行中
> 创建时间：2026-06-23
> 主目标：先把 Lime Agent App 宿主 current 骨架落地，支持应用中心发布门禁、安装 / readiness / runtime 生命周期、Workbench `productProfile`、Right Surface 多 tab 和历史恢复的统一编排；后续再逐步补真实 UI / Electron WebContentsView / App Server 深实现。

## 当前主链

`Agent App package -> App Server JSON-RPC -> src/lib/api/agentApps.ts -> src/features/agent-app/host -> Claw / Right Surface`

固定结论：

1. 中间区域继续由 Claw 承接对话、运行过程、审批和输入主链。
2. 右侧是唯一 Right Surface Dock，Dock 内允许多个 tab。
3. 内容工厂等 Workbench App 的业务产物进入 `productProfile` tab / pane。
4. 旧 Tauri command、iframe-only runtime、`<webview>`、BrowserView 不是 current 上架路径；迁不过 current bridge 的旧 App 进入 `delisted`。

## 本轮写集

- `internal/exec-plans/agent-app-host-v3-implementation.md`
- `src/features/agent-app/types.ts`
- `src/features/agent-app/manifest/normalizeManifest.ts`
- `src/features/agent-app/host/**`
- `src/features/agent-app/ui/AgentAppsPageViewModel.ts`
- `src/features/agent-app/ui/AgentAppsPageViewModel.unit.test.ts`
- `src/lib/api/agentApps.ts`
- `src/lib/api/agentApps.test.ts`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/**`
- `lime-rs/crates/app-server-protocol/src/schema_export/registry.rs`
- `lime-rs/crates/app-server-protocol/schema/json/**`
- `lime-rs/crates/app-server/src/processor/**`
- `lime-rs/crates/app-server/src/runtime.rs`
- `lime-rs/crates/app-server/src/runtime/agent_app_host_lifecycle.rs`
- `packages/app-server-client/src/protocol.ts`
- `packages/app-server-client/src/generated/protocol-types.ts`
- `packages/app-server-client/src/request-client-methods.ts`
- `packages/app-server-client/src/connection-methods.ts`
- `packages/app-server-client/tests/client.test.mjs`
- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/governance/legacySurfaceCatalog.test.ts`
- `scripts/check-app-server-client-contract.mjs`
- `internal/aiprompts/commands.md`
- `src/features/agent-app/index.ts`
- `src/components/agent/chat/AgentChatWorkspace.tsx`
- `src/components/agent/chat/workspace/WorkspaceProductProfileSurface.tsx`
- `src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx`
- `src/components/agent/chat/workspace/workspaceProductProfileModel.ts`
- `src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts`
- `src/components/agent/chat/workspace/workspaceProductProfileActionDispatch.ts`
- `src/components/agent/chat/workspace/workspaceProductProfileActionDispatch.unit.test.ts`
- `src/components/agent/chat/workspace/workspaceProductProfilePreviewArtifact.ts`
- `src/components/agent/chat/workspace/workspaceProductProfilePreviewArtifact.unit.test.ts`
- `src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/workspace.json`
- `src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/agent.json`
- `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/docs/**`
- `/Users/coso/Documents/dev/ai/limecloud/content-factory-app/examples/workspace-patch.sample.json`

除非编译或测试直接需要，不触碰 Electron main、App Server Rust 协议和现有 dirty 文件。`AgentChatWorkspace.tsx` 只允许做 Right Surface / Product Profile 接线，不在大组件内扩展业务实现。

## 快速骨架任务

- [x] 写入本执行计划，声明 current / deprecated / dead 口径。
- [x] 扩展 manifest 类型，保留 `profiles / workbench / distribution` current 字段。
- [x] 新增 `host` 纯编排模块，输出宿主能力生命周期 snapshot。
- [x] 覆盖应用中心发布门禁：ready / blocked / delisted。
- [x] 覆盖 Workbench Product Profile contract：`productProfile`、`file`、`evidence`、`terminal`、`browser`、`sideChat`。
- [x] 覆盖历史恢复 contract：恢复 `activeTabKind / activePaneKind / openTabKinds`。
- [x] 补单元测试，证明内容工厂 Workbench App 会进入右侧 `productProfile` tab，而不是替换 Claw。
- [x] 在 `src/lib/api/agentApps.ts` 暴露 installed state -> host lifecycle snapshot 的薄层，供 UI 先消费，后续可替换为 App Server JSON-RPC。
- [x] 在 App Center view model 上挂载 `hostLifecycle`，让 `delisted / blocked` 宿主门禁先进入 card action projection。
- [x] 补 App Center view model 单测，覆盖 Workbench `productProfile` 投影和旧 Tauri / iframe-only 下架门禁。
- [x] 新增 App Server current JSON-RPC method：`agentAppHostLifecycle/list`。
- [x] 新增 Rust `runtime/agent_app_host_lifecycle.rs`，从 installed state 投影宿主 lifecycle snapshot，避免继续扩大 `runtime/agent_apps.rs`。
- [x] 同步 App Server protocol schema、TS generated protocol types、packages client methods、renderer API 网关和治理 catalog。
- [x] 补 API / client / governance tests，证明 host lifecycle 走 App Server current method 且不回退旧 `agent_app_*` facade。
- [x] App Center 默认并行读取 `agentAppHostLifecycle/list`，服务端 lifecycle snapshot 优先，前端 installed-state 投影只作为未提供 snapshot 时的测试 / 迁移兜底。
- [x] Right Surface registry 新增 `productProfile` 一等 surface kind，运行时 launchers / pending adapter / toolbar 识别该入口。
- [x] Claw 工作台中间对话主链不变，右侧对象入口优先承载内容工厂产物 Profile；首版复用 `WorkspaceObjectCanvasSurface` 渲染，避免在骨架阶段重做业务 UI。
- [x] Right Surface state / host 支持 `openSurfaces` 多 tab 集合，Dock 内可展示 `productProfile / files / shell / harness / expertInfo` 等 tab，并能从 tab 切换回既有 surface。
- [x] 内容工厂独立仓清空旧版后落 v3 Workbench Profile package skeleton，并通过自校验。
- [x] `agentSession/read.detail` 从 `content_factory.workspace_patch` / `productWorkspace` / `workspacePatch` runtime events 物化 `product_workspace` / `productWorkspace`，供历史打开时恢复右侧产物 Profile。
- [x] 前端 Right Surface 从 App Server pending 和历史 `thread_read.product_workspace` 两侧水合 `WorkspaceProductProfileSurface`，真实 Product Profile 优先，旧 objectCanvas 只作为无 profile 数据时的兜底。
- [x] Product Profile 首版 host_builtin 工作台骨架支持 `document / imageGrid / storyboard / checklist / briefForm` 分型渲染，并把对象动作投影成 Claw 输入意图，不新增垂直业务命令。
- [x] Product Profile action 通过 `workspaceProductProfileActionDispatch` 经 Claw `handleSendRef` 直接提交 current turn，透传 `agent_app.product_profile_action` 与 `right_surface` metadata；发送失败时恢复输入框。
- [x] 应用中心卡片 / 详情展示宿主 lifecycle 状态、Right Surface tab 合同和 Product Profile 对象数量，避免宿主门禁只停留在数据层。
- [x] Product Profile 对象列表支持本地选中切换，并按 `workspaceId / sessionId / appId` 做本地选择持久化；同时通过 `agentSession/update.productWorkspaceSelectedObjectRef` 写回 App Server session metadata，历史恢复 / 跨设备恢复以 current read model 为准。
- [x] 内容工厂独立仓补 `docs/development.md`、`docs/release.md` 和 `examples/workspace-patch.sample.json`，并纳入 `npm run validate:app`。
- [x] Product Profile 从 `object.source` 读取结构化预览数据，支持 `markdown / images / shots / items / fields`，右侧可直接预览正文、图片候选、分镜、清单和简报字段。
- [x] 内容工厂 workspace patch schema / sample 明确结构化预览字段，避免 App 侧输出合同停留在 artifact id 占位。
- [x] Product Profile “打开预览”骨架接入 `Preview Artifact Contract`：右侧对象可被投影为 source-backed preview artifact，并复用 Claw 现有 Artifact Workbench 打开链路。
- [x] Product Profile action history / evidence read model：从 `agentSession/turn/start` 的 `RuntimeOptions.metadata.agent_app.product_profile_action` 投影 `thread_read.product_profile_actions` 和 `product_workspace.actionHistory`，不新增内容工厂垂直命令。
- [x] Product Profile 右侧状态骨架：展示当前对象最近 action、状态和历史计数，作为后续审批 / evidence 详情的占位入口。
- [x] Electron Agent App Shell surface strategy contract：`agent_app_launch_shell` 返回 `controlledBrowserWindow / webContentsView` 容器能力声明，先把独立窗口和后续 Right Surface 嵌入能力纳入可治理合同。
- [x] Right Surface Agent App Surface 骨架：复用 `embedded_browser_*` WebContentsView current bridge，从 App Server Right Surface pending metadata 水合 `appSurface` tab，不使用 iframe / BrowserView。
- [x] App Center standalone launch result -> 当前 Claw session `workspaceRightSurface/request` 触发链：Shell 启动成功后复用 `appSurface` metadata 投递 Right Surface pending；无有效 Claw target 时保留独立窗口，不伪造会话。
- [x] Agent App Surface 多实例骨架：同一个 Right Surface `appSurface` tab 内支持多个 Agent App 实例的内部 tab、focus 和 close fallback；pending 按 `containerId` 去重，不新增命令、不复活 iframe / BrowserView。
- [x] Agent App Surface 隐藏实例保活：同一个 `appSurface` 内部 tab 切换时保留多个 WebContentsView，只通过 `visible:false` 和 bounds 管理 inactive 实例，关闭实例时才 destroy。
- [x] App Center standalone launch 目标策略显式化：默认只打开独立窗口，用户选择“当前 Claw 右侧”且存在有效 target 时才投递 `workspaceRightSurface/request`，右侧不可用时禁用选项。
- [x] 内容工厂独立仓真实 worker / task runtime 骨架：`src/runtime/content-factory-worker.mjs` 可从 task request 生成 `content_factory.workspace_patch`，覆盖内容简报、文章草稿、图片组、视频脚本、视频分镜和交付检查清单。
- [x] Lime 宿主 task runtime 合同骨架：从 `runtimePackage.worker` / `agentRuntime.worker/tasks` 投影 `taskRuntime`，同步到 `agentAppHostLifecycle/list` 与 `agentAppUiRuntime/start/status`，但暂不执行 worker executor。

## 进度日志

- 2026-06-23：新增 `src/features/agent-app/host/hostLifecycle.ts` 和定向测试；`npx vitest run "src/features/agent-app/host/hostLifecycle.test.ts"` 通过。
- 2026-06-23：尝试 `npm run typecheck`，`tsc --noEmit` 超过约 3 分钟无输出，按快速骨架策略中止；后续接 GUI / App Server 深实现前必须补跑完整类型检查。
- 2026-06-23：补 `buildAgentAppHostLifecycleForInstalledState(...)` 和 App Center item `hostLifecycle` 投影；`npx vitest run "src/features/agent-app/host/hostLifecycle.test.ts" "src/features/agent-app/ui/AgentAppsPageViewModel.unit.test.ts" "src/features/agent-app/manifest/parseManifest.test.ts" "src/features/agent-app/projection/projectApp.test.ts"` 通过，22 tests。
- 2026-06-23：新增 App Server `agentAppHostLifecycle/list` current method、Rust lifecycle projection、schema fixture、TS client method 和 renderer API 网关；验证通过：
  - `cargo test -p app-server-protocol --manifest-path "lime-rs/Cargo.toml"`
  - `cargo check -p app-server --manifest-path "lime-rs/Cargo.toml"`
  - `npx vitest run "src/lib/api/agentApps.test.ts" "src/features/agent-app/host/hostLifecycle.test.ts" "src/features/agent-app/ui/AgentAppsPageViewModel.unit.test.ts" "src/lib/governance/legacySurfaceCatalog.test.ts"`
  - `npx vitest run "packages/app-server-client/tests/client.test.mjs"`
  - `npm run check:protocol-types`
  - `node scripts/check-app-server-client-contract.mjs`
  - `npm run test:contracts`
- 2026-06-24：App Center refresh 接入 `listAgentAppHostLifecycleSnapshots()`；`buildAppCenterItems(...)` 改为服务端 lifecycle snapshot 优先，并保留前端投影兜底。验证通过：`npx vitest run "src/features/agent-app/ui/AgentAppsPageViewModel.unit.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx" "src/lib/api/agentApps.test.ts"`，57 tests。
- 2026-06-24：Right Surface 骨架接入 `productProfile`：registry / runtime adapter / runtime launcher / toolbar / Claw workspace toggle 均能识别该一等 surface；对象画布旧入口保留，只有存在 Profile active / pending / 独占信号时才显示产物 Profile 文案。验证通过：`npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx"`，54 tests。
- 2026-06-24：契约与 GUI 最小冒烟通过：`npm run test:contracts` 通过；`npm run verify:gui-smoke` 通过，Electron smoke 已加载 renderer、App Server 和 Claw workbench shell。
- 2026-06-24：Right Surface 多 tab 首刀落地：`WorkspaceRightSurfaceState.openSurfaces` 可承接历史 `openTabKinds`，`RightSurfaceHost` 在单一 Dock 内渲染 tab strip，`AgentChatWorkspace` 将当前可用的 `productProfile / files / shell / harness / expertInfo` 投影为 open surfaces 并支持 tab click 切换。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceController.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceState.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceCommand.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceIntentQueue.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceScheduler.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceToolbarProjection.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx"`，36 tests。
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx"`，54 tests。
  - `npm run verify:gui-smoke` 通过，Electron smoke 已加载 renderer、App Server 和 Claw workbench shell。
- 2026-06-24：尝试 `npm run typecheck`，`tsc --noEmit` 超过约 3 分钟无输出，按当前快速落地主线中止；本轮以定向 vitest、renderer smoke build、Electron host typecheck 和 GUI smoke 覆盖交付风险。后续 product workspace read model 深接入前仍需补一次完整 typecheck。
- 2026-06-24：内容工厂新仓 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 保持旧版删除状态并落 v3 package skeleton；`npm run validate:app` 通过，输出 `[content-factory-app] v3 workbench package skeleton OK`。
- 2026-06-24：Product Workspace / Profile 骨架落地：新增 Rust `product_workspace_projection`，`agentSession/read.detail` 与 `thread_read` 同步输出 `product_workspace / productWorkspace`；前端新增 `workspaceProductProfileModel`、`WorkspaceProductProfileSurface`，Right Surface pending runtime 支持 `productProfile` metadata；`AgentChatWorkspace` 真实 Product Profile 优先、objectCanvas 兜底。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，29 tests。
  - `cargo test -p app-server --manifest-path "lime-rs/Cargo.toml" read_session_materializes_content_factory_workspace_patch_into_product_workspace`，1 test。
  - `npm run verify:gui-smoke` 通过，renderer、App Server、Claw workbench shell 和 memory settings ready。
- 2026-06-24：Product Profile 内部工作台首版骨架落地：`workspaceProductProfileModel` 从对象 kind 投影 surface layout、可用 actions 和 artifact ids；`WorkspaceProductProfileSurface` 按文档 / 图片组 / 分镜 / 交付清单 / 简报分型渲染，并将 `revise / continue_writing / generate_images / export_markdown / regenerate / create_variant / apply_to_article / approve / request_revision` 等动作回填为 Claw 输入意图。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，30 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped，用于覆盖 `AgentChatWorkspace` 编译接线。
  - `node -e 'const fs=require("fs"); for (const l of ["zh-CN","zh-TW","en-US","ja-JP","ko-KR"]) { const f="src/i18n/resources/"+l+"/workspace.json"; JSON.parse(fs.readFileSync(f,"utf8")); } console.log("workspace i18n json ok")'` 通过。
- 2026-06-24：Product Profile action dispatch 接入 Claw current turn：新增 `workspaceProductProfileActionDispatch`，点击右侧对象动作时直接调用 `handleSendRef.current(..., { skipSceneCommandRouting: true, requestMetadata })`，metadata 中包含 `agent_app.source=right_surface_product_profile`、`product_profile_action` 和 `right_surface.surface_kind=productProfile`；不新增 App Server method、不新增 `content_factory_*` 命令。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileActionDispatch.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，34 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped，用于覆盖 `AgentChatWorkspace` 新 helper 引入后的编译接线。
- 2026-06-24：App Center 宿主状态可见化与内容工厂开发入口补齐：`AgentAppsPage` 卡片 / 详情显示 host lifecycle、Right Surface tab 数和 Product Profile 对象数量；`WorkspaceProductProfileSurface` 支持对象本地切换；`content-factory-app` 新增开发 / 发布文档和 workspace patch 样例，validate 脚本覆盖样例。验证通过：
  - `npx vitest run "src/features/agent-app/ui/AgentAppsPageViewModel.unit.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx"`，28 tests。
  - 五语言 `agent.json / workspace.json` JSON parse 通过。
  - `npm run validate:app`（`/Users/coso/Documents/dev/ai/limecloud/content-factory-app`）通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：Product Profile 真实预览骨架推进：`workspaceProductProfileModel` 新增结构化预览投影，从 `object.source.markdown / images / shots / items / fields` 读取文档正文、图片候选、分镜、检查项和简报字段；`WorkspaceProductProfileSurface` 优先渲染这些结构化内容，artifact id 只作为兜底。`content-factory-app` schema、sample 和开发文档同步声明这些输出字段。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx"`，9 tests。
  - `npm run validate:app`（`/Users/coso/Documents/dev/ai/limecloud/content-factory-app`）通过。
  - 五语言 `workspace.json` JSON parse 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：Product Profile 选择持久化骨架落地：新增 `workspaceProductProfileSelection`，按 `workspaceId / sessionId / appId` 记录最近选中的对象 key；`WorkspaceProductProfileSurface` 重新挂载时会恢复最近选择，失效对象 key 自动忽略。该实现只做本机 UI 恢复，不新增命令、不替代后续 App Server Product Workspace selection writeback。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileSelection.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx"`，13 tests。
  - `npm run validate:app`（`/Users/coso/Documents/dev/ai/limecloud/content-factory-app`）通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：Product Profile 正式预览打开骨架落地：新增 `workspaceProductProfilePreviewArtifact`，把文档 / 简报 / 分镜 / 清单 / 图片组对象投影为 source-backed preview artifact；`WorkspaceProductProfileSurface` 增加“打开预览”按钮并上抛给 `AgentChatWorkspace -> handleWorkspaceArtifactClick -> Artifact Workbench`，不新增 App Server method、不新增 `content_factory_*` 命令。内容工厂开发文档同步说明 App 只输出 Product Workspace Patch，不自建 viewer。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfilePreviewArtifact.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileSelection.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx"`，16 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped。
  - 五语言 `workspace.json` JSON parse 通过。
  - `npm run validate:app`（`/Users/coso/Documents/dev/ai/limecloud/content-factory-app`）通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：Product Profile selection App Server writeback 落地：`AgentSessionUpdateParams` 增加 `productWorkspaceSelectedObjectRef`，`RuntimeCore / ProjectionStore` 写入 session metadata，`agentSession/read.detail` 在 Product Workspace projection 上覆盖有效 `selectedObjectRef`；前端新增 `workspaceProductProfileSelectionWriteback`，右侧对象点击继续乐观切换并通过 `updateAgentRuntimeSession` 写回，不新增 App Server method、不新增 `content_factory_*` 命令。验证通过：
  - `cargo test -p app-server --manifest-path "lime-rs/Cargo.toml" read_session_materializes_content_factory_workspace_patch_into_product_workspace`，1 test。
  - `cargo run -p app-server-protocol --bin write_schema_fixtures --manifest-path "lime-rs/Cargo.toml"` 通过。
  - `npm run generate:protocol-types` / `npm run check:protocol-types` 通过。
  - `cargo test -p app-server-protocol --manifest-path "lime-rs/Cargo.toml"` 通过，22 tests。
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileSelectionWriteback.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx" "src/lib/api/agentRuntime/appServerSessionClient.test.ts"`，29 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped。
  - `npm run test:contracts` 通过。
  - `npm run validate:app`（`/Users/coso/Documents/dev/ai/limecloud/content-factory-app`）通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：本轮继续快速骨架，下一刀聚焦 Product Profile action history / evidence read model。实现约束：不新增 App Server method，不新增 `content_factory_*` 命令，复用 Claw current turn metadata；`read_model.rs` 和 `workspaceProductProfileModel.ts` 已接近 800 行，本轮只做薄接线，复杂投影分别抽到 `product_profile_action_projection.rs` 和前端 action history helper，后续拆分 Product Profile model / preview / action 模块。
- 2026-06-24：Product Profile action history / evidence read model 骨架落地：新增 Rust `product_profile_action_projection`，从 `RuntimeOptions.metadata.agent_app.product_profile_action` 投影 `thread_read.product_profile_actions / productProfileActions`，并把同一 history 附加到 `product_workspace.actionHistory / action_history`；前端新增 `workspaceProductProfileActionHistory` helper，右侧 Profile 展示当前对象最近操作、状态、turn id 和历史计数。验证通过：
  - `cargo test -p app-server --manifest-path "lime-rs/Cargo.toml" read_session_materializes_content_factory_workspace_patch_into_product_workspace`，1 test。
  - `npx vitest run "src/components/agent/chat/workspace/workspaceProductProfileActionHistory.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceProductProfileSurface.test.tsx" "src/components/agent/chat/workspace/workspaceProductProfileActionDispatch.unit.test.ts" "src/components/agent/chat/workspace/workspaceProductProfileSelectionWriteback.unit.test.ts"`，16 tests。
  - 五语言 `workspace.json` JSON parse 通过。
  - `npm run smoke:agent-runtime-current-fixture` 通过，覆盖 Claw current fixture、历史 hydrate、Workbench fixture、Skills Runtime、MCP structuredContent 与 Expert panel evidence pack。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：继续推进 Electron App Surface 容器缺口。本轮只扩展 `agent_app_launch_shell` 返回合同，不新增命令：独立 App Shell 明确标记为 `controlledBrowserWindow`，同时声明宿主支持的 `webContentsView` 嵌入策略，后续 Right Surface Dock 可以复用同一策略合同接入内嵌 App Surface。
- 2026-06-24：Electron App Surface strategy contract 已落地并通过定向验证：`electron/hostCommands.test.ts`、`src/lib/api/agentApps.test.ts`、`src/features/agent-app/shell/shellDescriptor.test.ts`、`src/features/agent-app/host/hostLifecycle.test.ts`、`src/features/agent-app/ui/AgentAppsPage.runtime.test.tsx`、`cargo check -p app-server --manifest-path "lime-rs/Cargo.toml"`、`npm run test:contracts`、`npm run verify:gui-smoke` 均通过。下一刀进入 Right Surface WebContentsView 嵌入接线。
- 2026-06-24：本轮继续快速骨架，新增 `appSurface` Right Surface kind 与嵌入组件。实现约束：不新增 App Server method，不复活 iframe / BrowserView；Agent App 通过 `workspaceRightSurface/request` 的 metadata 传 `entryUrl / containerId / appId / title / supportedStrategies`，Claw 中间对话主链不变。
- 2026-06-24：Right Surface Agent App Surface 骨架落地：新增 `appSurface` 一等 kind、pending metadata projection、`WorkspaceAgentAppSurface` WebContentsView 嵌入组件、Claw 右侧 Dock 薄接线和五语言文案。pending 到达时若处于 chat 布局且用户没有锁定其它右侧 tab，会自动打开 appSurface；已有其它 tab 或 workbench 布局时只加入多 tab 集合，不抢焦点。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceAgentAppSurfaceModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceAgentAppSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`，23 tests。
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，23 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped。
  - 五语言 `agent.json` JSON parse 通过。
  - `npm run test:contracts` 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host、App Server sidecar、Claw workbench shell 和 memory settings ready。
- 2026-06-24：App Center standalone launch -> Claw Right Surface 触发链落地：`AgentChatWorkspace` 通过现有 `onSessionChange` 把最近有效 Claw session 回传 App shell，`AgentAppsPage` 在 `agent_app_launch_shell` 成功后构造 `workspaceRightSurface/request` 的 `appSurface` pending metadata（`entryUrl / containerId / appId / title / supportedStrategies`），复用 current Right Surface pending 水合链路；不新增 App Server method，不复活 iframe / BrowserView。无 `workspaceId/sessionId` 时只保留独立窗口。验证通过：
  - `npx vitest run "src/features/agent-app/ui/agentAppRightSurfaceLaunch.unit.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx"`，21 tests。
  - `npx vitest run "src/components/AppPageContent.test.tsx" "src/hooks/useAppNavigation.test.tsx"`，33 tests。
  - `npx vitest run "src/components/agent/chat/workspace/workspaceAgentAppSurfaceModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceAgentAppSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`，23 tests。
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，23 tests。
  - `npm run test:contracts` 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host、App Server sidecar、Claw workbench shell 和 memory settings ready。
  - 尝试 `npm run typecheck`，`tsc --noEmit` 约 90 秒无输出后中止；完整 typecheck 仍作为后续门禁缺口。
- 2026-06-24：Agent App Surface 多实例 / focus / close 骨架落地：`workspaceAgentAppSurfaceModel` 增加多 descriptor 水合、合并、active container 解析和关闭 fallback；`useWorkspaceRightSurfacePendingRuntime` 暴露 `pendingAgentAppSurfaces`；`AgentChatWorkspace` 从单个 `activeAgentAppSurface` 升级为实例列表 + active container id；`WorkspaceAgentAppSurface` 在 `appSurface` 内部展示实例 tab，可聚焦和关闭。该刀只做前端宿主管理骨架，不新增 App Server method，不新增 Electron IPC，不复活 iframe / BrowserView。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/workspaceAgentAppSurfaceModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceAgentAppSurface.test.tsx" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`，26 tests。
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，23 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped，用于覆盖 `AgentChatWorkspace` 新 helper 引入后的编译接线。
  - 五语言 `agent.json` JSON parse 通过。
  - `npm run test:contracts` 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
  - 尝试 `npm run typecheck`，`tsc --noEmit` 约 90 秒无诊断输出后中止；完整 typecheck 仍作为后续门禁缺口。
- 2026-06-24：Agent App Surface 隐藏实例保活落地：`WorkspaceAgentAppSurface` 改为同时挂载多个 `WorkspaceAgentAppSurfaceFrame`，内部 tab 切换只对 inactive WebContentsView 发送 `visible:false` / hidden bounds，不再 destroy / remount；同 `containerId` 的 URL 更新继续走 `navigateEmbeddedBrowserView`。该刀复用既有 `embedded_browser_view_set_bounds` current bridge，不新增 Electron IPC，不新增 App Server method。验证通过：
  - `npx vitest run "src/components/agent/chat/workspace/WorkspaceAgentAppSurface.test.tsx"`，4 tests，覆盖切换实例时不 remount / 不 destroy，且旧 active view 收到 `visible:false`。
  - `npx vitest run "src/components/agent/chat/workspace/WorkspaceAgentAppSurface.test.tsx" "src/components/agent/chat/workspace/workspaceAgentAppSurfaceModel.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceRightSurfacePendingRuntime.unit.test.tsx"`，27 tests。
  - `npx vitest run "src/components/agent/chat/workspace/right-surface/rightSurfaceRegistry.unit.test.ts" "src/components/agent/chat/workspace/right-surface/rightSurfaceRuntimeAdapter.unit.test.ts" "src/components/agent/chat/workspace/right-surface/RightSurfaceHost.unit.test.tsx" "src/components/agent/chat/workspace/workspaceRightSurfaceRuntimeProjection.unit.test.ts"`，23 tests。
  - `npx vitest run "src/components/agent/chat/index.workbench01.test.tsx" -t "空白新建任务首页应去掉项目栏和会话标签"`，1 test passed / 12 skipped，用于覆盖 `AgentChatWorkspace` 接线。
  - `npm run test:contracts` 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
  - 尝试 `npm run typecheck`，`tsc --noEmit` 约 90 秒无诊断输出后中止；完整 typecheck 仍作为后续门禁缺口。
- 2026-06-24：App Center launch target 策略显式化：新增 `agentAppLaunchTargetPolicy` 纯 helper 和紧凑 segmented control；App Center 默认独立窗口，只有用户显式选择“当前 Claw 右侧”且 `workspaceId/sessionId` 有效时才在 shell launch 成功后调用 `requestAgentAppRightSurfaceLaunch(...)`。右侧 target 缺失时选项禁用并提示当前无可投递 Claw 对话。该刀不新增 App Server method、不新增 Electron IPC、不新增 `content_factory_*` 命令，继续复用 `workspaceRightSurface/request` current pending 链路。验证通过：
  - `npx vitest run "src/features/agent-app/ui/agentAppLaunchTargetPolicy.unit.test.ts" "src/features/agent-app/ui/agentAppRightSurfaceLaunch.unit.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx"`，27 tests。
  - 五语言 `agent.json` JSON parse 通过。
  - `npm run test:contracts` 通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host typecheck/build、App Server sidecar、Claw workbench shell 和 memory settings ready。
  - `git diff --check` 通过。
- 2026-06-24：内容工厂独立仓 runtime 骨架落地：`/Users/coso/Documents/dev/ai/limecloud/content-factory-app/src/runtime/content-factory-worker.mjs` 支持 `content.factory.generate / content.article.generate / content.image.generate / content.video.script.generate / content.video.storyboard.generate / content.delivery.review`，输出宿主已支持的 `content_factory.workspace_patch`。新增 `examples/runtime-request.sample.json`、`tests/content-factory-worker.test.mjs`，并把 `npm run validate:app` 升级为会调用 worker 生成 patch 的 runtime-aware 校验。该刀不复用旧 `content-studio` 程序，不访问 provider key、文件系统、secret、Electron IPC 或 App Server transport。验证通过：
  - `npm test`（`content-factory-app`），3 tests。
  - `npm run runtime:sample`（`content-factory-app`），输出包含 brief / articleDraft / imageGenerationSet / videoScript / videoStoryboard / deliveryChecklist 的 Product Workspace patch。
  - `npm run validate:app`（`content-factory-app`）通过，输出 `[content-factory-app] v3 workbench package and runtime OK`。
- 2026-06-24：Lime 宿主 task runtime 合同接入骨架落地：新增 `AgentAppTaskRuntimeContract`，App Server 从 installed state 的 `manifest.runtimePackage.worker` 与 `manifest.agentRuntime.worker/tasks` 投影 worker entrypoint、contract、sample request、output artifact kind、task kinds 和 blockers；`agentAppHostLifecycle/list` 与 `agentAppUiRuntime/start/status/stop` 返回同一份 `taskRuntime`。前端 host lifecycle / API 类型同步，seeded `content-factory-app.json` 切到 v3 Workbench + worker 形态，内容工厂仓 `APP.md` 与开发 / 发布文档同步。该刀只声明和校验合同，不新增 `content_factory_*` 命令，不在 Electron 执行 worker，不下发 provider key。验证通过：
  - `cargo check -p app-server --manifest-path "lime-rs/Cargo.toml"`。
  - `cargo run -p app-server-protocol --bin write_schema_fixtures --manifest-path "lime-rs/Cargo.toml"`。
  - `npm run generate:protocol-types`。
  - `cargo test -p app-server --manifest-path "lime-rs/Cargo.toml" agent_app_task_runtime -- --nocapture`，2 tests。
  - `npx vitest run "src/features/agent-app/manifest/parseManifest.test.ts" "src/features/agent-app/projection/projectApp.test.ts" "src/features/agent-app/host/hostLifecycle.test.ts"`，17 tests。
  - `npx vitest run "src/lib/api/agentApps.test.ts"`，35 tests。
  - `cargo test -p app-server-protocol --manifest-path "lime-rs/Cargo.toml"`，22 tests。
  - `npx vitest run "packages/app-server-client/tests/client.test.mjs" "electron/hostCommands.test.ts"`，137 tests。
  - `npm run test:contracts` 通过。
  - `npm test && npm run runtime:sample`（`content-factory-app`）通过。
  - `npm run validate:app`（`content-factory-app`）通过。
  - `npm run verify:gui-smoke` 通过，renderer、Electron host、App Server sidecar、Claw workbench shell 和 memory settings ready。
  - `git diff --check` 通过。
  - 尝试 `npm run typecheck`，`tsc --noEmit` 约 90 秒无诊断输出后中止；完整 typecheck 仍作为后续门禁缺口。

## 后续缺口

1. Electron Desktop Host / Claw：`WebContentsView` App Surface 容器、App Center -> 当前 Claw Right Surface 显式触发策略、前端多实例 / focus / close / hidden preserve 管理已落骨架；后续补多会话目标选择器、目标会话展示名和 Right Surface Playwright 证据。
2. App Server：`agentAppHostLifecycle/list` 已落 current JSON-RPC 骨架；后续需要把完整 manifest / readiness 强类型化，并补 server-side readiness issue 分类。
3. Right Surface UI：`productProfile` 已作为一等 kind 接入，Right Surface state / Host 已有多 tab 骨架；内容工厂 Product Profile 首版 read model / pending 水合、host_builtin 分型渲染、对象本地切换、本地选择持久化、App Server selection writeback、结构化预览、Claw turn action dispatch、action history read model / 状态卡和 Preview Artifact 打开骨架已完成。后续仍需补操作审批、更细 action 结果 evidence、ArtifactDocument 持久化 / 版本链，以及图片实际文件缓存 / 读取能力。
4. 应用中心：`delisted / blocked / ready` 门禁已接数据层、action 禁用、服务端 lifecycle refresh、card / detail 可见状态和五语言 i18n；后续要补发布签名、远程 catalog evidence 和更细的 readiness issue 分类。
5. 内容工厂新仓：v3 package skeleton、开发文档、发布文档、workspace patch 样例和 deterministic worker / task runtime 已可自校验；Lime 宿主已能在 lifecycle / UI runtime status 中读取 task runtime 合同。后续要补 App Server worker executor、发布签名、应用中心包校验 evidence。
6. 验证：骨架阶段已跑定向 unit、Rust read model、`npm run test:contracts` 和 `verify:gui-smoke`；后续补完整 `npm run typecheck` 与 Right Surface Playwright 证据。

## 风险登记

- 当前工作树已有大量未归属改动，本轮只追加窄写集，不清理其它 dirty 文件。
- 本轮先落纯编排骨架，不宣称完整产品可交付。
- Product Profile renderer 仍是 host_builtin 骨架；当前动作已通过 Claw send helper 进入 current turn，selection 已通过 `agentSession/update` 写回 current read model，action history 已可从 turn metadata 复盘，但操作审批、更细 action 结果 evidence 和产物版本链需要后续补齐。
- `WebContentsView` App Surface 容器已有 Right Surface 骨架；App Center standalone launch 默认独立窗口，显式选择当前 Claw 右侧且 target 有效时才投递 `appSurface` pending，`appSurface` 内部已支持多实例 focus / close / hidden preserve；target 目前仍来自 App shell 内存态，不做跨重启恢复。后续要补多 session 选择和 Right Surface 真实交互证据。
- 内容工厂 worker 当前是 deterministic runtime 骨架，用于验证 task request -> Product Workspace Patch 的业务合同；Lime 宿主只读取 task runtime readiness，尚未执行 worker executor。真实模型生成、媒体执行、ArtifactDocument 版本链和发布签名仍由后续主线补齐。
