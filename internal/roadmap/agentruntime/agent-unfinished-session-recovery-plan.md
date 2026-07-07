# Agent 未完成会话自动恢复计划

> 状态：implemented-in-progress
> 日期：2026-07-07
> 主链：AgentRuntime current session / thread / turn read model
> 关联入口：[AgentRuntime Profile 路线图](./README.md)、[状态 / 历史 / 遥测主链](../../aiprompts/state-history-telemetry.md)、[Clawstream S1 P0 执行计划](../../exec-plans/clawstream-s1-p0-implementation-plan.md)

## 1. 背景

用户在 Claw 首页或侧栏看到一个未完成会话时，当前体验还不够产品化：

1. 意外退出或刷新后，用户回到首页时不知道后台是否仍在跑。
2. 侧栏能显示最近会话，但运行态、终态和输入框状态仍容易被局部状态误判。
3. 已修复的 `running / terminal` 投影仍需要上升为统一产品模型，避免后续在首页、侧栏、输入框、工作区继续各自判断。

这不是单个按钮或单个入口问题，而是 AgentRuntime current 主链里 `Session -> Thread -> Turn -> ReadModel -> GUI projection` 的恢复产品化问题。

## 2. Codex 参考口径

参考 `/Users/coso/Documents/dev/rust/codex` 时只采纳通用架构原则，不照搬文件结构：

- Codex 的 rollout/session 以可发现的持久事实源组织：`sessions`、`ThreadItem`、`ThreadsPage`、`recency_at / updated_at`、session meta 和 rollout JSONL。
- 恢复不是 UI 猜测“最近按钮”，而是从 session / thread / turn 事实源读取当前状态，再决定是否 resume / reconnect。
- running、interrupted、terminal 和 queued user input 都是一等状态，不能靠固定 timeout 合成完成态。

Lime 对应 current 主链必须继续走：

```text
React / Agent UI
  -> src/lib/api/agentRuntime/*
  -> AppServerClient / safeInvoke
  -> Electron IPC app_server_handle_json_lines
  -> App Server JSON-RPC agentSession/*
  -> RuntimeCore / backend / read model
```

禁止为了恢复体验新增 `agent_runtime_*` production truth、renderer mock fallback、App Server mock backend 或旧 Tauri wrapper。

## 3. 产品原则

### 3.1 默认体验

采用“自动恢复但留首页”：

1. App 启动、刷新、从后台恢复、回到首页时自动扫描未完成 Agent 会话。
2. 如果存在最近一个可恢复会话，后台自动 reconnect / resume。
3. 不强制跳转到会话详情；首页保留当前首屏，但显示轻量恢复卡。
4. 用户点击首页恢复卡或侧栏会话后进入详情观察流式输出。

不采用“启动后自动跳回会话”。强制跳转会让首页成为不稳定入口，也会在多个未完成任务时制造抢焦点问题。

### 3.2 状态事实源

状态只来自 App Server read model：

- 可恢复：`running`、`queued`、`waitingAction`
- 终态：`completed`、`failed`、`canceled`
- 终态必须 fail closed：即使存在残留 `active_turn_id`，也不能再判定为 running。

前端本地 `isSending / activeStream` 只能作为瞬时交互态，不允许成为重启后的持久事实源。

### 3.3 V1 范围

V1 只覆盖 Agent session：

- Claw 普通会话
- 首页首发后 materialized 的 Agent session
- 侧栏最近对话中的 current session
- queued turn 和 waiting action 的可见状态

V1 不覆盖：

- 图片 / 视频 / 媒体 task file 全生命周期
- 内容工厂 workflow 全生命周期
- right surface pending request 的统一异步收件箱
- live Provider 专项联网证明

这些后续可以挂到同一异步恢复模型，但不阻塞本轮未完成 Agent 会话体验。

## 4. 设计

### 4.1 未完成会话投影

新增一个纯投影层，输入为 `agentSession/list` 的 session overview 和必要时的 `agentSession/read`：

```text
session overview
  -> candidate filter
  -> read detail for active candidate
  -> unfinished session projection
  -> home card / sidebar status / inputbar state
```

投影输出至少包含：

- `sessionId`
- `title`
- `preview`
- `status`
- `latestTurnStatus`
- `activeTurnId`
- `updatedAt`
- `actionLabel`

候选排序使用 `updatedAt` 或 read model 等价 recency 字段；没有稳定时间时 fail closed，不自动恢复。

### 4.1.1 运行态事实源收敛

截至 2026-07-07，运行态不再允许由 list / read / evidence / GUI 各自猜测：

- App Server current 事实源为 `runtime/status.rs::SessionRuntimeState`。
- `read_model.rs`、`projection_store.rs`、`session_lifecycle.rs` 均消费同一个 `resolve_agent_session_runtime_state(...)` / `resolve_session_runtime_state(...)`。
- `evidence_provider.rs` 与 `exports/*` 也必须消费同一投影，避免 handoff / evidence 把 stale running 继续判成 `in_progress`。
- 前端 `threadReadActivity.ts`、`unfinishedSessionProjection.ts`、`agentStreamResumeBinding.ts`、`AgentChatWorkspace.tsx` 只消费 read model / overview 投影；`isSending / activeStream` 只能作为当前 renderer 交互态。

固定规则：

- terminal session fail closed：即使存在残留 `active_turn_id`，也清空 active / queued 投影。
- stale running 降级为 `idle`，但 `diagnostics.latest_turn_status` / `latest_turn_status` 保留原始 `running`，用于诊断而不是恢复。
- queued / waitingAction 仍是一等 active 状态。

### 4.2 自动恢复调度器

调度器只做三件事：

1. 扫描最近 Agent 会话。
2. 自动恢复最近一个可恢复会话。
3. 发布只读投影给首页和侧栏。

约束：

- 同一 `sessionId / activeTurnId` 只恢复一次，避免重复 `runtimeGetSession` 轮询。
- 最多自动恢复 1 个 active session；其余未完成会话只显示状态。
- 如果 read model 返回终态，立即清理本地 active stream。
- 如果恢复失败，记录诊断但不把首页卡死；侧栏显示失败或可重试状态。

### 4.2.1 前台 / 后台 presentation

本轮采用窄接口拆开两种恢复 presentation：

- `foreground`：默认行为，用于会话详情、URL 带 `initialSessionId`、用户显式点击最近会话或任务 tab。允许应用本地 / cached snapshot，允许 `switchTopic(...)` 绑定详情输出。
- `background`：仅用于新任务首页且无 `contentId / initialSessionId`。允许扫描会话和调用 `agentSession/read` 恢复后台运行态，但不写前台 `sessionId / messages / threadRead`，不自动 `switchTopic(...)`，只更新 topics / 最近会话 / 侧栏投影。

这把“恢复后台任务”和“打开会话详情”拆成两步：系统可以继续跑未完成任务，用户仍停留在首页；只有用户显式打开会话后，输入框按钮和流式输出才绑定到该 session。

### 4.3 首页与侧栏 UI

首页：

- 在输入框下方或推荐区上方显示轻量卡：`正在继续：{title}`。
- 卡片只提供进入会话，不直接暴露内部 `sessionId / turnId / JSON-RPC`。
- 如果恢复中的会话输出已完成，卡片变为“已完成，查看结果”或自动消失，具体由 read model 决定。

侧栏：

- 最近对话使用同一投影显示状态图标。
- `running / queued` 显示运行态；`waitingAction` 显示等待用户操作；终态不显示运行图标。
- 侧栏点击会话时只打开该 session，不重新创建 session。

输入框：

- 当前 active session 正在输出时，发送按钮显示“正在输出”态，停止按钮可用。
- 终态刷新后输入框立即恢复可输入。
- 首页首发 pending preview 只能作为临时视觉态，一旦 materialized session 可读，必须切到 read model 投影。

## 5. 实施切片

### P0：文档与事实源锁定

- 本文档作为 current roadmap 入口。
- `internal/roadmap/agentruntime/README.md` 增加导航。
- 不修改 reliability compat 文档作为 current 主入口。

### P1：纯投影与单测

- 已新增 `unfinishedSessionProjection` 和侧栏 / topics 映射。
- 已覆盖：
  - running / queued / waitingAction 被识别为未完成
  - completed / failed / canceled 不进入恢复队列
  - terminal + stale `active_turn_id` 不误判
  - 多个候选只选择最近一个自动恢复

### P2：首页恢复调度器

- 已在 Agent Chat workspace / session hook 层接入 `sessionRestorePresentation`。
- 新任务首页进入 `background` presentation，后台 `runtime.getSession(... source: "homeBackgroundRecovery")` 后只合入 topics projection，不强制跳转详情。
- `foreground` presentation 保留已有详情页、显式会话恢复、action_required、压缩和 runtime hydrate 行为。

### P3：侧栏与输入框状态统一

- 侧栏最近会话状态、任务列表 topic 状态和输入框 running 态已消费 App Server read model / overview 投影。
- 新任务首页旧 task tab fallback 已在 `home-background-recovery` 场景跳过，避免旧 tab 抢回详情。
- 已新增必要 i18n key，覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- 已把 App Server `read / list / session overview / evidence / handoff export` 的运行态收敛到共享 `SessionRuntimeState` projector，避免侧栏、主区、输入框、证据包继续分裂。

### P4：Electron / CDP 验证

- 待扩展 `reopen-running-turn` Electron fixture：运行中刷新 / 重启后回首页，自动恢复同一 session。
- 保留 `cancel-then-continue`、`inputbar-rich-restore` 和 terminal stale 回归。
- CDP Gate B 只保存 method、transport、status、sessionId、turnId 和必要 marker，不保存 prompt、token 或 provider secret。
- 本轮仍必须用真实 Electron CDP 复跑，证明 `window.__LIME_ELECTRON__`、`window.electronAPI.invoke`、`electron-ipc` trace 与用户可见状态同时成立。

## 6. 验收标准

V1 完成必须同时满足：

1. 回到首页后，最近一个未完成 Agent session 自动恢复，但页面不强制跳走。
2. 侧栏对应会话显示运行态；终态后运行图标消失。
3. 输入框按钮在输出中显示正在输出；终态后恢复可输入。
4. stale terminal / failed / canceled session 不再触发无限 `runtimeGetSession` 轮询。
5. 停止后同会话继续输出仍能完成。
6. 生产路径不出现 renderer mock fallback、App Server mock backend 或 legacy runtime command。

## 7. 验证入口

定向测试优先：

```bash
npm test -- --run src/components/agent/chat/hooks/agentSessionState.test.ts src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx
npm test -- --run src/components/agent/chat/workspace/workspaceSceneSessionProjection.unit.test.ts
```

Agent Runtime 聚合门禁：

```bash
npm run smoke:agent-runtime-current-fixture
```

GUI 主路径门禁：

```bash
npm run verify:gui-smoke
```

需要证明真实 Electron CDP 时，证据等级必须标为 Gate B，并证明：

- `window.__LIME_ELECTRON__ === true`
- `window.electronAPI.invoke` 存在
- trace 中存在 `transport: "electron-ipc"`
- JSON-RPC method 包含 `agentSession/read` 和对应恢复动作

CDP 骨架入口：

```bash
node scripts/agent-runtime/agent-session-recovery-cdp-gate.mjs --cdp-port 9239 --timeout-ms 180000 --prefix agent-session-recovery-cdp-gate-skeleton
npm run smoke:reopen-running-turn-cdp-gate -- --cdp-port 9239 --timeout-ms 180000 --prefix reopen-running-turn-cdp-gate-skeleton
```

`agent-session-recovery-cdp-gate` 只证明真实 Electron CDP / preload / `app_server_handle_json_lines` / `agentSession/list|read` 壳层，默认 `APP_SERVER_BACKEND_MODE=unavailable`，不触发 `agentSession/turn/start`。完整 Gate B 必须新增或扩展 `reopen-running-turn` 场景，使用 `APP_SERVER_BACKEND_MODE=external`，并证明 reload/reopen 后同一 `sessionId / turnId` 仍处于 running UI 与 event resume 链路。

`reopen-running-turn-cdp-gate` 当前是 skeleton 聚合入口：先跑 CDP shell gate，再跑 `cancel-then-continue` current fixture，并在 summary 中标记 `completedGateB=false`。它用于防止后续继续口头描述 Gate B，但仍不能替代真正同一 renderer reload/reopen 的完整证明。

## 8. 当前证据

截至 2026-07-07，已有相关证据：

- `.lime/cdp-evidence/reopen-running-turn-cdp-summary.json`：历史证据，只能作为参考；当前仍需用新的 `reopen-running-turn` Gate B 复跑并确认 `agentSession/turn/start`、`agentSession/thread/resume`、reload/reopen 后的同一 `turnId` 事件续接和输入框 running 态。
- `.lime/cdp-evidence/agent-terminal-rich-restore-cdp-summary.json`：证明 direct preload IPC 到 `app_server_handle_json_lines`、App Server current method 与 read model 链路可用。
- `.lime/cdp-evidence/agent-session-recovery-cdp-gate-skeleton-summary.json`：证明真实 Electron CDP attach 到 packaged `file://.../dist/index.html?nativeStartup=1`，`window.__LIME_ELECTRON__`、`window.electronAPI.invoke`、`supportsCommand("app_server_handle_json_lines")` 均成立；renderer `safeInvoke` trace 包含 `transport: "electron-ipc"`、`app_server_handle_json_lines`、`agentSession/list`、`agentSession/read`，并从侧栏打开同一 `sessionId`。该证据使用 `APP_SERVER_BACKEND_MODE=unavailable`，不触发 `agentSession/turn/start`，不证明 live Provider 或运行中 turn 输出。
- `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-cancel-then-continue-regression-summary.json`：证明停止后同会话继续输出。
- `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-rich-restore-regression-summary.json`：证明 output-free cancel 后 inputbar 富草稿恢复。

这些证据证明底层 current 链路可用，但还不等于首页级产品体验已经完成；本文目标就是把这些底层能力收敛成统一首页 / 侧栏 / 输入框恢复体验。

本轮新增 / 复跑的代码级证据：

- `npx vitest run "src/components/agent/chat/projection/unfinishedSessionProjection.test.ts" "src/components/agent/chat/hooks/agentChatShared.test.ts" "src/components/app-sidebar/AppSidebarConversationRow.test.tsx" "src/components/agent/chat/utils/taskCenterTabs.test.ts"`：通过，64 tests。
- `npx vitest run "src/components/agent/chat/hooks/useAsterAgentChat.test.tsx" -t "首页后台恢复运行候选"`：通过，1 focused test，证明 `background` presentation 只触发 `homeBackgroundRecovery`，不写前台 `sessionId / messages / threadRead`。
- `npx vitest run "src/components/agent/chat/hooks/useAsterAgentChat.test.tsx"`：通过，185 tests；新增 focused test 后该文件为 186 tests，需在最终验证中复跑完整文件。
- `npx vitest run "scripts/agent-runtime/agent-session-recovery-cdp-gate.test.mjs"`：通过，3 tests，守住 CDP Gate B 骨架必须使用真实 Electron、`chromium.connectOverCDP`、`app_server_handle_json_lines`、`agentSession/list/read`，且不启用 live Provider 或 mock backend。
- `node "scripts/agent-runtime/agent-session-recovery-cdp-gate.mjs" --cdp-port 9239 --timeout-ms 180000 --prefix agent-session-recovery-cdp-gate-skeleton`：通过，Gate B skeleton；见 `.lime/cdp-evidence/agent-session-recovery-cdp-gate-skeleton-summary.json`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server session_list_projection --lib`：通过，8 tests；证明 list overview 对 running / stale running / terminal 的投影同源。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server thread_read --lib`：通过，5 tests；证明 read model stale running 降级为 `idle`，但保留 `diagnostics.latest_turn_status=running`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server basic_evidence_pack_downgrades_stale_running_turn --lib`：通过，1 test；证明 evidence pack 不再把 stale running 判成 `in_progress`。
- `npx vitest run "scripts/agent-runtime/reopen-running-turn-cdp-gate.test.mjs"`：通过，3 tests；守住 `reopen-running-turn` skeleton 入口、claim boundary、current runtime signals 和 mock fallback 禁止项。
- `npm run smoke:reopen-running-turn-cdp-gate -- --cdp-port 9239 --timeout-ms 180000 --prefix reopen-running-turn-cdp-gate-systematic`：通过，生成 `.lime/cdp-evidence/reopen-running-turn-cdp-gate-systematic-summary.json`。该 summary 明确 `status=passed_skeleton`、`proofLevel=Gate B skeleton`、`completedGateB=false`，只证明 CDP shell gate 与 `cancel-then-continue` current fixture 分别通过，不证明 reload/reopen 后同一 running `turnId` 续接。

待补 Gate B 细节证据：

- running turn / queued turn 的 CDP Gate B：trace 需包含同一 `sessionId` 的 `agentSession/thread/resume` 或 `agentSession/turn/start`，并证明恢复后仍有正在输出态。
- 用户可见运行态：回首页不强制跳详情；侧栏 / 最近会话显示运行态；显式打开后输出和输入框正在输出态绑定同一 session。
- 终态收口：terminal 后运行图标消失，输入框恢复可输入，不再触发 stale `runtimeGetSession` 轮询。

## 9. 后续扩展

V1 完成后，再考虑把下列异步任务接入同一模型：

- media task artifact：图片、视频、封面、转写、链接解析
- content factory workflow：文章、PPT、表单等产物型 workflow
- right surface pending：对象画布、浏览器、工作台 pending request
- managed objective：长目标自动继续与人工暂停 / 恢复

扩展前必须先回答：

1. 该任务是否有 current owner read model。
2. 是否能稳定提供 `taskId / sessionId / turnId / updatedAt / status`。
3. GUI 是否只读投影，而不是自己猜生命周期。
4. 是否有 Electron fixture 或 CDP Gate B 证据。
