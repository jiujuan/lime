# S5 Claw 首字与页面稳定性证据

> 日期：2026-07-13
> 状态：controlled fixture Gate B 已通过；真实 Agnes Provider Gate B 未完成
> 计划：`internal/exec-plans/refactor-v2-claw-first-token-stability-plan.md`
> 证据等级：Gate B CDP controlled fixture

## 结论边界

本证据验证 Claw 首页首发的真实 Electron 产品链：Desktop Host、preload/contextBridge、Electron IPC、`app_server_handle_json_lines`、App Server JSON-RPC、controlled external backend、read model 与用户可见状态。它不调用 live Provider，因此不能证明第三方模型网络 TTFT、Agnes 可用性或真实请求成功率；可以区分 renderer 本地绘制、App Server/fixture 等待和页面结构稳定性。

## 基线事实

基线文件：

- `.lime/qc/gui-evidence/claw-chat-current-fixture/refactor-v2-claw-first-token-baseline-20260713-summary.json`
- `.lime/qc/gui-evidence/claw-chat-current-fixture/refactor-v2-claw-home-first-token-baseline-20260713-summary.json`

两次均为 `Gate B CDP controlled fixture`，`pageLifecycleEvents=[]`，说明闪缩不是 reload。首页首发性能摘要：

| 指标                        |  基线 |
| --------------------------- | ----: |
| pending preview paint       |  18ms |
| send dispatch               |  19ms |
| submit accepted             | 208ms |
| request to first text paint | 366ms |
| first text delta to paint   |  20ms |

因此 renderer 从收到首个 text delta 到绘制只需约 `20ms`；受控基线中的“首字慢”主要在首 delta 之前，不是 MessageList 绘制本身。

## 根因

`homeHotpathPendingShell.ts` 在点击后于 React 树外创建 `position: fixed; 100vw x 100vh; z-index: 45` 的假消息页，隐藏真实首页，再等待真实 MessageList 出现后用双 `requestAnimationFrame` 删除。视觉上先覆盖整个窗口和侧栏，再收回真实 Workspace，形成页面闪现、缩回和内容接管抖动。

React 内已经存在唯一 current projection：

```text
buildHomePendingPreviewMessages
  -> useTaskCenterHomePendingPreviewRuntime
  -> workspaceSceneSessionProjection
  -> WorkspaceMainArea / MessageList
```

imperative shell 是重复 scene owner，并非首字性能所需。

## 修复

- 删除 `homeHotpathPendingShell.ts` 及其单测。
- 首页首发保留 `flushSync`，同步提交 React pending preview。
- 失败恢复只回写 React state，不再操作 body DOM 或首页 `display`。
- 删除无 producer 的 `homeInput.pendingShellApplied` metric 及其 summary 字段。
- Task Center boundary guard 阻止 legacy 文件、import 和 metric 回流。
- home-hotpath fixture 每帧记录 imperative shell 数量及 `workspace-main-area` 边界，并新增：
  - `homeHotpathNoImperativePendingShell`
  - `homeHotpathMainAreaBoundsStable`
- 修复 frame 判定语义：点击后的完整首页帧允许短暂保留，`250ms` 内必须单向进入 conversation；任何空白中间态、conversation 后回首页或空会话仍立即失败。
- 新 session 已写入 `activeSessionIdRef.current` 后，不再因旧 render 捕获的 `currentSessionId=null` 触发第二次 `forceRefresh switchTopic`。
- 删除 Renderer `fastResponseRouting` owner、800 字阈值、localStorage 开关、假状态和旧 metadata fallback；App Server 以结构化 turn policy 独占首轮 `model_slot=fast / tool_surface=compact_tools / auto_compact=false` 决策。
- provider sampling step 按结构化 tool surface 冻结 definitions + executor snapshot；compact 保留 `ToolSearch`、必要 core tools 与 auto tool choice。
- 每次 sampling attempt 恢复 `provider.request.started / first_event.received / first_text_delta.received`，只输出 summary-only trace。

## 验证结果

Gate B 证据：

- `.lime/qc/gui-evidence/claw-chat-current-fixture/s5-home-hotpath-monotonic-summary.json`
- `.lime/qc/gui-evidence/claw-chat-current-fixture/s5-complete-final-summary.json`

`home-hotpath` 结果：

| 指标                                |  结果 |
| ----------------------------------- | ----: |
| React pending preview commit        |  16ms |
| React pending preview paint         |  34ms |
| DOM conversation 首次可见           | 144ms |
| submit accepted                     | 261ms |
| request 到首字 paint                | 497ms |
| first delta 到 paint                |  24ms |
| provider wait（controlled fixture） |  90ms |
| 主区域最大几何漂移                  |   0px |
| imperative pending shell 最大数量   |     0 |

页面经历完整首页到 conversation 的单向切换：conversation 前 4 帧均为完整首页，无空白态；conversation 后 89 帧均未返回首页。`pageLifecycleEvents=[]`，`readModel.latestTurnStatus=completed`，actionable console error 与 invoke error 均为 0。

`complete` 结果：`electronPreloadBridge`、`appServerJsonRpcUsed`、current session start/read/list、external fixture backend、GUI 用户消息/assistant 输出、输入框恢复、read model completed 全部为 true；trace 顺序包含 `provider.request.started -> provider.first_event.received -> provider.first_text_delta.received -> message.delta -> turn.completed`，且 `redaction_mode=summary_only`。未调用 live Provider。

工程验证：

- Frontend focused：8 files / 264 tests passed。
- Fixture guard：54 tests passed；单调 frame 状态机覆盖完整首页保留、conversation 后回闪、空白中间态。
- `npm run typecheck`、`npm run typecheck:electron`、本轮 ESLint、`node --check`：passed。
- Rust：provider phase trace 1 test、provider structured tool surface 1 test、App Server first-turn/session policy 10 tests：passed。
- `npm run verify:gui-smoke`：passed，真实 Electron Host、preload、App Server sidecar 与 Claw shell ready。
- `npm run smoke:agent-runtime-current-fixture`：前端/guard 部分通过（31 + 32 + 64 个实际断言；MessageList 17 项由脚本过滤），sidecar 重建被并行未跟踪 `lime-rs/crates/app-server/src/mcp_elicitation.rs` 的未完成编译挡住。此前同一当前产物的独立 `home-hotpath`、`complete` 和 GUI smoke 已通过；本证据不把并行热区失败归为本轮产品回归。

## 分类

| 路径                                                | 分类                                  | 说明                                                         |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| React pending preview / scene projection            | current                               | 唯一继续演进的 GUI owner                                     |
| App Server turn policy                              | current                               | 首轮 model slot / tool surface / auto-compact 唯一策略 owner |
| RuntimeCore preferred slot + provider step snapshot | current                               | 通用消费结构化 policy，不解析 Renderer 产品语义              |
| Renderer `fastResponseRouting` / 本地开关 / 阈值    | dead / deleted / forbidden-to-restore | 自然语言策略与 runtime owner 冲突                            |
| `homeHotpathPendingShell.ts`                        | dead / deleted / forbidden-to-restore | React 树外全视口重复实现                                     |
| `homeInput.pendingShellApplied`                     | dead / deleted                        | producer 随 legacy shell 删除                                |
| session switch pending shell plan                   | current / unchanged                   | 会话切换占位，不属于首页全视口 DOM shell                     |

## S5 follow-up：发送热路径 warmup 解耦

### 新证据与根因

用户重启后短问候仍出现微闪体感和长时间无首字。聚合失败样本中，React pending preview commit/paint 分别为 `17ms / 40ms`，但 conversation owner 接管为 `910ms`、submit accepted 为 `1093ms`；session 创建仅 `11ms`、provider wait 为 `90ms`。因此慢点位于 Renderer 进入 stream request 前，而不是 Provider、App Server session 创建或首字绘制。

源码证据是 `useAgentChat.sendMessage` 无条件执行：

```text
await warmupRuntime({ allowDetached: true })
-> getRuntimeProviderSelection()
-> resolveClawWorkspaceProviderSelection(...)
-> rawSendMessage(...)
```

这让已有完整 provider/model 快照的用户输入仍等待配置刷新。Codex `codex-rs/app-server/src/request_processors/turn_processor.rs::turn_start_inner` 直接从已加载 thread/config snapshot 构建 `ThreadSettingsBuildParams` 并提交 `Op::UserInput`；没有在每次输入前刷新全局 provider 配置。Context7 查询 React 官方文档也确认：用户交互保持 urgent，外部状态同步放入后台，非紧急加载不应替换或隐藏已经显示的 UI。独立 WebSearch 工具在当前环境不可用，本结论只使用 Context7 官方 React 文档、本地 Codex 源码和 Gate B 实测。

### 最终实现

- 完整 `providerTypeRef + modelRef`：立即使用快照发送，同时 fire-and-observe 去重 warmup；失败由 warmup 自身记录，不回滚已启动 turn。
- 不完整快照：仍等待 warmup 完成后发送，保留 `lime_model_selection_required` fail-closed 契约。
- 删除“所有消息都先等待 warmup”的旧发送行为；没有新增快速路由、短问候特判、800 字阈值、localStorage 开关、timeout fallback 或 renderer 默认模型。
- 测试 client 补齐 current `readAgentRuntimeThread`，promote queue 测试以 canonical `ThreadReadResponse` 作为决策事实，不再隐含依赖旧 `thread_read.queued_turns` 决策面。

### 最终 Gate B

证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`

| 指标                   | 修复前聚合样本 | 最终样本 |
| ---------------------- | -------------: | -------: |
| pending preview commit |           17ms |      9ms |
| pending preview paint  |           40ms |     21ms |
| conversation 首次可见  |          910ms |    114ms |
| submit accepted        |         1093ms |    221ms |
| request 到首字 paint   |          530ms |    382ms |
| first delta 到 paint   |           25ms |     27ms |
| provider wait          |           90ms |     90ms |
| 主区最大漂移           |            0px |      0px |
| imperative shell       |              0 |        0 |

最终场景为 `Gate B controlled fixture`，覆盖真实 Electron main/preload、IPC、`app_server_handle_json_lines`、App Server JSON-RPC、external fixture backend、read model completed 与 GUI 完成态。`pageLifecycleEvents=[]`，actionable console errors `0`，invoke errors `0`；未调用 live Provider，不能外推第三方网络 TTFT。

工程验证：

- `useAgentChat.test.tsx`：`193/193` passed。
- Workspace send：`191/191` passed。
- canonical queue projection + adapter：`16/16` passed。
- fixture guard：`64/64` passed。
- `npm run typecheck`、定向 ESLint、`git diff --check`：passed。
- `npm run verify:gui-smoke`：passed，真实 Electron/App Server/Claw shell ready。
- 聚合 current fixture 已通过本轮首页、停止继续、approval、输入恢复与 queue 场景；后续 `plan-history-hydrate` 因并行 revision identity 为空失败，不扩大为本轮首页回归。

### 最终分类

| 路径                                          | 分类                                  | 说明                                 |
| --------------------------------------------- | ------------------------------------- | ------------------------------------ |
| refs/session/runtime model snapshot           | current                               | turn 提交直接消费的结构化快照        |
| background runtime warmup                     | current                               | 配置刷新与自愈，不阻塞完整快照发送   |
| incomplete-selection blocking warmup          | current                               | 仅缺失 provider/model 时 fail closed |
| unconditional send-time `await warmupRuntime` | dead / deleted                        | 重构前 Renderer 配置 owner 残留      |
| Renderer fast-response routing                | dead / deleted / forbidden-to-restore | 不得用文本策略替代 runtime owner     |

## 最终复测补证

最终独立证据：

- `.lime/qc/gui-evidence/claw-chat-current-fixture/refactor-v2-s5-final-home-summary.json`
- `.lime/qc/gui-evidence/claw-chat-current-fixture/refactor-v2-s5-final-complete-summary.json`

`home-hotpath` 最终结果：

| 指标                                | 结果  |
| ----------------------------------- | ----: |
| React pending preview commit        |  12ms |
| React pending preview paint         |  29ms |
| DOM conversation 首次可见           | 115ms |
| submit accepted                     | 297ms |
| request 到首字 paint                | 442ms |
| first delta 到 paint                |  20ms |
| provider wait（controlled fixture） |  90ms |
| 主区域最大几何漂移                  |   0px |
| imperative pending shell 最大数量   |     0 |

该样本的 `91/91` 帧均有可比较的主区边界；conversation 前保持完整首页，进入 conversation 后未回首页或空白态。`pageLifecycleEvents=[]`、actionable console errors `0`、invoke errors `0`。raw console 中 packaged fixture 静态图标的 `ERR_FILE_NOT_FOUND` 被 evidence 分类为非 actionable 资源噪音，没有影响 current bridge、消息或输入框状态。

`complete` 最终结果：Electron preload bridge、`electron-ipc -> app_server_handle_json_lines`、`agentSession/start/read/list/turn/start`、external fixture backend、GUI 用户/assistant 消息、输入框恢复和 read model `completed` 均通过。summary-only trace 顺序为：

```text
provider.request.started
-> provider.first_event.received
-> provider.first_text_delta.received
-> message.delta
-> turn.completed
```

最终工程验证：

- 前端定向：`9 files / 468 tests`；其中 `useAgentChat 193/193`、Workspace send `158/158`。
- `npm run typecheck`、定向 ESLint、`node --check`、`npm run test:contracts`：通过。
- Rust：provider trace `1/1`、structured tool surface `1/1`、App Server first-turn policy `5/5`、`cargo check -p app-server`、`cargo check -p lime-mcp`：通过。
- App Server production check 不再生成最初的 6 条 dead-code warning；测试专用 helper 已退出 production 编译图。
- `npm run verify:gui-smoke`：通过，真实 Electron Host/preload/App Server/Claw shell ready。
- 聚合 `smoke:agent-runtime-current-fixture` 已通过首页、短问候、Coding、图片、停止继续、approval、rich draft 与 queue；仅 `plan-history-hydrate` 因计划块缺 `revisionId/revisionSource` fail closed。计划正文、三步计划、完成态和确认面板均已可见，该问题归并行 plan/read-model owner，不属于 S5 首字链。

聚合重建 sidecar 期间还暴露 `lime-rs/crates/mcp/src/elicitation.rs` 使用 `Weak<RouterState>` 却漏导入 `std::sync::Weak`。本轮只补该标准库 import；没有改变 MCP elicitation 路由、scope、身份或协议语义，随后 `lime-mcp` check 和 App Server sidecar build 均通过。
