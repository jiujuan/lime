# S5 Claw 中断会话重新进入导航证据

> date: 2026-07-14
> slice: S5-claw-cancel-reentry-navigation
> owner: root
> lime_head: a66afe416f854bb4572d7da392bb397ee8d626f6（dirty working tree）
> codex_head: 5c19155cbd93bfa099016e7487259f61669823ff

## 用户闭环

普通用户在 Claw 停止一个正在执行的任务后，可以回到“新建任务”首页，再从左侧历史列表
重新进入刚才的会话。完成标准是历史正文重新出现、输入框恢复、同一会话可以继续发送，且
链路仍经过真实 Electron、preload/IPC、App Server JSON-RPC 和 current read model。

## 根因

后端没有卡住。现场 session event/read model 已写入 `turn.canceled`，输入框也能在原会话恢复。
阻塞发生在 Renderer 导航：

1. Task Center draft/home surface 会把 `shouldPauseInitialSessionNavigation` 保持为 `true`；
2. 旧 Hook 把所有 `initialSessionId` 恢复都当作内部 draft materialization，因此侧栏高亮变化后
   仍不调用 `switchTopic`；
3. 第一版按 target 变化放行用户导航后，真实 `home-hotpath` 反证了另一条路径：新建任务过渡
   帧仍携带旧 target，若无条件放行会把旧会话抢回首页；
4. 进一步的真实 Electron 复现证明，同一个会话从首页重入时 target 本身也不变化，单靠
   `previousInitialSessionId` 无法区分“内部过渡”和“用户又点击了一次”。

因此根因不是 CSS、遮罩、App Server 或 Provider，而是显式用户导航意图在相同 route target
去重时丢失。

## Codex 对齐与实现

Codex App Server 把 `turn/interrupt` 作为一等终态，把 `thread/resume` 作为带明确
`thread_id` 的显式请求。Lime 对齐该语义：中断不关闭 Thread，重新进入也不能靠 session id
是否变化来猜。

本刀保持一个 owner：

```text
AppSidebar conversation click
  -> requestExplicitInitialSessionNavigation(sessionId)
  -> useWorkspaceInitialSessionNavigation
  -> switchTopic(sessionId)
  -> agentSession/read
  -> Thread/Turn/Item projection
  -> GUI
```

- `useAppSidebarConversationActions.ts` 只登记一次用户显式恢复请求；相同 route target 仍可通知
  当前导航 Hook。
- `useWorkspaceInitialSessionNavigation.ts` 用 `useSyncExternalStore` 消费请求版本。显式请求只覆盖
  stale draft pause、已应用 key 和该 paused navigation 的短时去重；内部 materialization 仍由
  `rememberInitialSessionNavigationStart` 保护。
- 不新增 Session/read model、Electron 命令、JSON-RPC method、生产 mock、compat wrapper 或
  第二套路由状态机。
- 新建任务未发生用户动作时继续暂停旧 `initialSessionId`；不会复发首页 composer 被旧会话
  抢回的问题。

## 回归与静态验证

```text
npm test -- \
  src/components/agent/chat/workspace/useWorkspaceInitialSessionNavigation.test.tsx \
  src/components/agent/chat/workspace/useWorkspaceHomeRecoveryRuntime.unit.test.ts \
  src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts \
  src/components/AppSidebar.conversations.test.tsx
结果：4 files / 108 tests passed；导航 Hook 18/18，侧栏会话 50/50。

npm run typecheck
结果：passed。

npx eslint <3 changed TS/TSX files>
结果：passed。

git diff --check -- <3 changed TS/TSX files>
结果：passed。

npm run verify:gui-smoke
结果：passed；Renderer、Host/preload、App Server 1.102.0、Claw shell、memory settings ready。
```

本刀没有用户可见新文案，不涉及五语言资源；没有协议、read model 或 owner 变化，不构成新的
重大架构变更。

## Gate B

### 真实开发窗口

- Electron CDP：`http://127.0.0.1:9223`；页面：`http://127.0.0.1:1420/?nativeStartup=1`；
- `window.__LIME_ELECTRON__ === true`；`window.electronAPI.invoke` 存在；
- 从“新建任务”点击同一条中断会话
  `sess_1237fb3fcac548789a1494348eeeb4f6`；
- 结果：首页退出，composer 恢复到目标 session，2 个 runtime turn 可见，输入框可见且未禁用，
  console error `0`，page error `0`。

该窗口已缓存该 session 的完整 topic，重复进入可直接消费 current Renderer cache；因此 live
窗口只声明“同 target 用户点击与可见恢复成功”。跨 Electron/App Server read 的完整声明由下方
隔离 fixture 提供。

### 不可变 controlled fixture

```text
npm run smoke:claw-chat-current-fixture -- \
  --scenario home-hotpath --timeout-ms 240000 \
  --prefix refactor-v2-s5-cancel-reentry-home

summary: .lime/qc/gui-evidence/claw-chat-current-fixture/
  refactor-v2-s5-cancel-reentry-home-summary.json
result: ok=true, proofLevel="Gate B controlled fixture"
session: claw-chat-current-1784006497259-33215
facts: electronPreloadBridge=true, usedCurrentSessionRead=true,
  homeHotpathStartedFromEmptyState=true, homeHotpathReadModelCompleted=true,
  guiInputRemainsReady=true, noInvokeErrors=true, noConsoleErrors=true,
  conversationStartedAtMs=213, mainAreaMaxDriftPx=0

npm run smoke:claw-chat-current-fixture -- \
  --scenario cancel-then-continue --timeout-ms 180000 \
  --prefix refactor-v2-s5-cancel-reentry-continue

summary: .lime/qc/gui-evidence/claw-chat-current-fixture/
  refactor-v2-s5-cancel-reentry-continue-summary.json
result: ok=true, proofLevel="Gate B controlled fixture"
session: claw-chat-current-1784006565215-39366
facts: usedCurrentSessionRead=true, usedCurrentTurnCancel=true,
  readModelCanceled.latestTurnStatus=canceled,
  readModelContinueCompleted.latestTurnStatus=completed,
  guiInputRemainsReady=true, noInvokeErrors=true, noConsoleErrors=true
```

两份 summary 均记录 `transport=electron-ipc`、`app_server_handle_json_lines`、
`agentSession/read` 与 current read model；external fixture backend 只替代正式模型，不绕过
Electron/App Server 产品链。

一次冷启动样本因共享 Cargo 构建后的 Renderer long task 触发
`homeHotpathPendingProjectionVisibleWithinBudget=false`：DOM conversation 为 `825ms`，但内部
pending preview paint 为 `33ms`，read model 与 GUI completed 均成功。未修改阈值；资产热后
不可变重跑为 `213ms` 并通过。

## 非本刀阻塞

- `npm run smoke:agent-runtime-current-fixture` 已通过 history/stream guards、首页普通/短问候、
  Coding、图片与 cancel-then-continue，随后在并行 approval 展示断言
  `guiApprovalRequestResumeRecordCompact` 失败。
- `npm run smoke:agent-session-history-electron-fixture` 在 GUI 点击前的持久化重启阶段失败：
  `agentSession/read failed: thread agent-session-history-electron-persisted does not exist`。

两项都位于当前并行修改的 approval/session-store/App Server 热区，不在本刀写集。它们保留为
仓库级门禁 concern，不能覆盖为通过，也不反证本次同 target 导航的真实 Electron 闭环。

## 治理分类

- `current`：侧栏显式恢复请求、`useWorkspaceInitialSessionNavigation`、既有
  `switchTopic -> agentSession/read -> Thread/Turn/Item -> GUI`。
- `compat`：本刀未新增、未依赖。
- `deprecated`：本刀未新增。
- `dead`：把“route target 必须变化”当作用户导航事实的隐式假设已移除；没有保留 fallback。

请求问题完成度：`100%`。Refactor v2 全局仍为 `in_progress`，下一刀回到真实 Provider
可取消重试与并行 approval/session-store 门禁 owner，不在 Renderer 新增长期补丁。
