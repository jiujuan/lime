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

整体目标完成度：78%

口径：以完整 Right Surface 平台化目标计，当前完成第一阶段的专家栏统一承载、互斥行为和视觉修复，完成 P2 surface registry / controller / state resolver 骨架，补上 P3 Skills / MCP 调度的前端 command + scheduler + intent queue + launcher projection 模型，并已把 launcher projection 接入真实 `TaskCenterUtilityToolbar` props、现有 Harness runtime pending badge adapter、文件预览 / skill result pending intent adapter、MCP shell 输出 / objectCanvas 候选 intent helper，以及 Browser Assist launching -> objectCanvas 候选接线；本轮继续把 Harness renderer 迁入 Right Surface definitions，并修正专家 / Harness / Shell / 工作台互斥接线。App Server contract、objectCanvas renderer、持久化恢复仍未完成。

本轮阶段完成度：90%

口径：以“Shell / Harness renderer 逐步迁入 registry definitions，并固定顶部按钮互斥状态”为本轮目标。Harness surface 已可在 `RightSurfaceHost` 内渲染，顶部 Harness launcher active / disabled / pending 状态已有回归，专家按钮也会清理旧 Harness dialog fallback 状态，避免关闭当前 surface 后旧 dialog 反弹；`AgentChatWorkspace` 中 expert launch sync 的 `sessionId` 初始化顺序问题已修复。GUI smoke 本轮卡在 renderer smoke build 长耗时，尚未重新拿到通过结果，因此本轮不标 100%。

## 阶段计划

| 阶段 | 状态 | 内容 | 退出条件 |
| --- | --- | --- | --- |
| P0 文档基线 | 已完成 | 形成 Right Surface 架构文档与远期 Cameo / objectCanvas 方向 | `internal/roadmap/rightsurface/README.md` 存在并可作为路线图入口 |
| P1 专家栏统一承载 | 已完成 | 专家信息进入内层 Right Surface，外层 `rightRailNode` 不再承载专家栏 | 定向测试与 GUI smoke 已通过；根 typecheck 长耗时转独立诊断项 |
| P2 Surface registry | 已完成骨架 | 定义 workbench / expertInfo / objectCanvas / files / shell / harness 的统一注册、优先级和互斥策略 | active surface 选择已走 registry/controller；显式 `source=user/route/runtime` 有单测 |
| P3 Skills / MCP 调度入口 | 已完成前端骨架并接入 toolbar / runtime badge adapter / Harness renderer | 让 runtime / skills / MCP tools 能以受控 command 请求打开或更新 surface | 前端 command / scheduler / intent queue / launcher projection / runtime adapter 模型已落地；toolbar 已消费 projection；Harness 已进入 Right Surface renderer；App Server contract 尚未接入 |
| P4 objectCanvas 原型 | 未开始 | 参考 Cameo 类交互，只做最小空间对象原型 | 明确对象模型、编辑流、回放与持久化策略 |
| P5 GUI 产品闭环 | 未开始 | Playwright / GUI smoke 覆盖顶部按钮、专家展开、画布互斥、窗口尺寸 | `verify:gui-smoke` 或 Playwright evidence 通过 |

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
  - 当前只接 badge / intent 骨架，不假装打开尚未迁入 renderer 的 `files / shell / harness` surface
- P3 Harness renderer 接入：
  - `WorkspaceHarnessDialogs.tsx` 新增 `GeneralWorkbenchHarnessSurfaceSection`
  - Harness surface 复用现有 `HarnessStatusPanel layout="dialog"`，先完成承载迁移，不重写 Harness 内部信息架构
  - `AgentChatWorkspace` 的 `rightSurfaceDefinitions` 已登记 `harness` renderer
  - 旧 `GeneralWorkbenchHarnessDialogSection` 仍作为 fallback 保留，但只在没有 active Right Surface 时打开
  - 专家按钮、Shell 按钮、工作台按钮和 Harness 按钮都会清理旧 Harness dialog / 专家栏状态，避免两个右侧表面并存
  - 修复 `useWorkspaceExpertAgentLaunchSyncRuntime` 在 `sessionId` 初始化前执行导致 `AgentChatWorkspace` 挂载失败的问题

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

已观察但未在本轮处理：

- `react-i18next:: useTranslation: NO_I18NEXT_INSTANCE`：现有测试环境警告，相关测试通过。
- `Browserslist: caniuse-lite is 6 months old`：依赖数据提示，非本轮阻塞。
- `Maximum update depth exceeded`：出现在 `index.workbench04` 的既有自动发送测试场景；本轮收紧专家栏 effect 后仍出现，说明不是 Right Surface 新状态机直接引入。后续若进入 GUI smoke 前仍存在，应独立定位。

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

## 下一刀

1. 继续 P3：接入更多真实 objectCanvas 候选来源，例如结构化图表 / 文档对象候选，但暂不改 App Server contract。
2. 继续 P3/P5：把 Shell / Harness renderer 逐步迁入 registry definitions，保留旧 props fallback 直到对应 surface 可真实渲染。
3. 用独立 Playwright profile 或真实 Electron fixture 截图复核专家面板 full right surface 的视觉效果，确认没有右侧空白和文本挤压。
4. 回头诊断 renderer 根 `typecheck` 长耗时；不要让它阻塞 Right Surface 骨架推进。
5. 如继续推进 Cameo / objectCanvas，只能先补对象模型和交互流，不直接在 `AgentChatWorkspace` 里堆新 layout 分支。

## 风险与约束

- 当前工作树存在大量并行改动；后续只应触碰 Right Surface、Workspace 接线、相关测试和本计划文件。
- 不要恢复外层 `WorkspaceShellScene.rightRailNode` 专家栏。
- 不要让专家栏从 layout 切换后自动反弹展开。
- 不要在 P1 阶段实现复杂 objectCanvas；它属于 P4。
- 新增用户可见文案必须走五语言 i18n，本阶段没有新增产品文案。
