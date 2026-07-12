# Thread Timeline / Session Refresh 事实源治理路线图

> 状态：thread-refresh-mainline-complete
> 更新时间：2026-07-02
> 目标：参考 Codex 的 thread / event store 设计，把 Lime AgentChat 的 live timeline、session detail、read model、history transcript 分层，解决流式输出期间前文被 detail refresh 覆盖、移除或乱序的顽疾。

## 1. 使用方式

本目录是 **Thread Timeline 与 Session Refresh 边界治理的事实入口**。它不替代具体执行计划；代码实施仍应回挂到 `internal/exec-plans/` 或对应变更记录。本文件负责定义：

1. 哪些状态拥有 timeline 写入权。
2. 哪些刷新只能补元数据，不能接管正在流式增长的内容。
3. active turn / terminal reconcile / session restore 分别使用什么合并规则。
4. 哪些测试和 GUI evidence 才能证明问题没有回流。

当前主线只处理 AgentChat 线程内容被刷新覆盖的问题，不顺手扩大到 Workspace 右栏、artifact 深水位、工具 UI 重构或历史归档治理。

## 2. 当前问题

用户日志暴露的关键现象：

| 现象                                         | 证据                                                                                        | 判断                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 流式输出期间持续触发 detail refresh          | `AgentStream.inboundTextDelta` 与多次 `AgentApi.runtimeGetSession.start/success` 交错出现   | 后台 detail 拉取不是只在 session restore / terminal reconcile 触发        |
| `runtimeGetSession` 高频且可慢返             | 同一 session 在 streaming 中多次 `durationMs: 9/13/174/594/1366`                            | 慢返 detail 有机会带着旧快照覆盖前端已有 live 内容                        |
| thread item 数量发生回退                     | 运行中出现 `threadItemsCount: 40`，结束后又出现 `threadItemsCount: 29`                      | 这不是单纯渲染抖动，而是状态树被旧 detail 或不同投影重写                  |
| provider attempt 多次重入                    | `AgentStream.providerTrace attempt: 1..8`                                                   | listener / recovery / detail refresh 链路存在多来源写同一 timeline 的风险 |
| topic preview 与 session snapshot 交替 apply | `useAgentTopicSnapshot.apply/skipDuplicate` 与 `useAgentSession.stateSnapshot` 混在流式阶段 | read model / topic preview 与 transcript 主体边界不清晰                   |

当前 Lime 关键路径：

| 文件 / 模块                       | 当前职责                                                              | 风险                                                                 |
| --------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `useAgentRuntimeSyncEffects.ts`   | 监听 runtime / session 事件并调度 `scheduleRefreshSessionDetail`      | turn event 期间触发 detail refresh，缺少 active timeline guard       |
| `agentSessionRefresh.ts`          | `runtime.getSession(...historyLimit: 40)` 后调用 `applySessionDetail` | detail refresh 能整表写入 `messages` / `threadTurns` / `threadItems` |
| `useAgentSession.ts`              | `applySessionSnapshot` 写入完整 session state                         | 缺少按来源区分的写入权限                                             |
| `agentSessionState.ts`            | hydrate detail 并 merge messages / turns / items                      | 合并仍服务于 detail snapshot；不能保证 live text 单调增长            |
| `sessionDetailFetchController.ts` | 采集 detail fetch metrics                                             | 只观测耗时，不参与防覆盖策略                                         |

根因判断：**Lime 目前把 session detail hydration、read model、流式本地状态都接到同一个 snapshot 写入面上。** 当后台 detail 返回的历史窗口比本地 live timeline 更旧、粒度不同或缺少最新 text delta 时，`applySessionDetail` 仍可能重写 transcript 主体，造成前面输出被替换、移除或时序错乱。

## 3. Codex 对照基线

Codex 相关实现位于 `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/`。本路线图只抽取设计原则，不照搬 UI 结构。

| Codex 文件                     | 设计职责                                                                          | Lime 对齐要求                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `app/thread_session_state.rs`  | `ThreadSessionState` 只管理 session lifecycle、配置和线程头信息                   | session detail / header 状态不能拥有 live transcript 的无条件覆盖权                                    |
| `app/thread_events.rs`         | `ThreadEventStore` 持有 `session`、`turns`、`buffer`、pending replay、active turn | Lime 需要把 live timeline 写入权集中到 thread event / turn store，而不是让多种 refresh 都能写主体      |
| `app/thread_events.rs`         | `rebase_buffer_after_session_refresh()` 只保留能跨 refresh 存活的事件             | session refresh 后只允许 rebase pending interactive / hook / MCP status 等可重放事件，不重放已处理内容 |
| `app/replay_filter.rs`         | 过滤 pending interactive request 和 replay notice                                 | pending action / request replay 要有显式规则，不能靠整树 detail 回放                                   |
| `tui/src/thread_transcript.rs` | 从 persisted `thread.turns.flat_map(items)` 派生 transcript cells                 | history transcript 是只读投影，不参与 live 状态合并                                                    |
| `chatwidget/session_flow.rs`   | `handle_thread_session` 更新 session/header/config，不接管 transcript             | session 事件只更新 session 元信息，不接管 active timeline                                              |

Codex 设计结论：

1. 会话配置、线程转录、事件缓冲、交互重放是四层状态。
2. live event store 是运行期事实源；detail / thread read 不是随时接管 UI 的整树事实源。
3. session refresh 是 rebase，不是 replace。
4. transcript 是 persisted turns 的只读投影；active streaming 期间的增量由 event store 单调追加。
5. read model / status 只更新 queued、running、metadata、pending action，不触碰 transcript 主体。

## 4. Lime 目标事实源

| 分类         | 路径 / 能力                                                                                    | 规则                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `current`    | App Server JSON-RPC runtime events、thread item events、active turn stream                     | active turn 期间 timeline 主体的唯一写入事实源                                      |
| `current`    | `threadItems` / `threadTurns` live timeline projection                                         | 以 `turnId`、`itemId`、`sequence`、`eventId` 或稳定时间锚单调合并                   |
| `current`    | read model / topic preview / queued turns / session status                                     | 只更新运行状态、队列、pending action、unread、title、metadata，不写 transcript 主体 |
| `current`    | session detail restore / switch / terminal reconcile                                           | 只在打开历史、切换会话、terminal reconcile 场景拥有 transcript hydrate 权限         |
| `compat`     | active turn 中由 runtime sync 触发的 detail refresh                                            | 短期可保留请求，但必须降级为 metadata/read-model refresh 或 safe merge              |
| `deprecated` | 任意 `runtimeGetSession` 返回后整体覆盖 active live `messages` / `threadTurns` / `threadItems` | 必须下线；没有兼容价值                                                              |
| `dead`       | 依赖旧 detail 快照纠正 streaming 文本顺序的实现假设                                            | 不允许恢复；顺序必须来自 runtime event identity / sequence                          |

一句事实源声明：

> AgentChat 的 active timeline 只能由 runtime event / live thread store 单调推进；session detail 只能在 restore、switch、terminal reconcile 中补齐历史，不得在 running turn 期间删除、回退或重排本地已显示内容。

## 5. 设计规则

### 5.1 写入权限

| 场景                     | 允许写入                                                                          | 禁止写入                                                              |
| ------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| active streaming         | append / patch 当前 turn 的 live item、text delta、tool lifecycle、reasoning part | 用 detail snapshot 替换 `messages`、删除本地 item、回退 streamed text |
| read model refresh       | queued turns、currentTurnId、running/done 状态、topic preview、unread             | transcript 主体、message content、thread item content                 |
| session restore / switch | 从 persisted detail hydrate transcript                                            | 与另一个 active live stream 竞争写入                                  |
| terminal reconcile       | 补齐最终 tool result、artifact refs、server sequence、final status                | 覆盖比本地更长的 text、打乱已有 item 顺序                             |
| recovery / watchdog      | 触发补拉和连接修复                                                                | 在无 terminal 证据时把 live turn 判定为旧 detail 的最终形态           |

### 5.2 单调合并

active turn 中必须满足：

1. 已展示文本只能增长或被同一 `itemId` / `contentPartId` 的更高 sequence 替换。
2. detail 中缺失的 local item 不能删除，除非 turn 已 terminal 且 server 明确给出 tombstone / final ordering。
3. 没有 sequence 的 detail 只能补缺，不能覆盖 local streamed text。
4. 相同 `itemId` 合并时保留更完整的 content parts、tool lifecycle 和 artifact refs。
5. 不同来源的 snapshot 必须标注 source / mode：`restore`、`switch`、`live-refresh`、`silent-recovery`、`terminal-reconcile`、`read-model`。

### 5.3 Replay 与 pending action

参考 Codex `replay_filter`：

1. 已 resolve 的 action / request 不因 session refresh 重放。
2. pending interactive request 可以跨 refresh 存活，但必须由 pending 状态驱动，不从 assistant 文本推断。
3. hook / MCP / feedback / status 类 notice 可按规则保留；普通 text delta 不通过 replay notice 重建。

## 6. 实施计划

| 阶段                         | 目标                                                      | 交付物                                                                                                | 退出条件                                                                         |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Phase 1：规范与诊断          | 固定事实源边界和回流判定                                  | 本文件；必要时补 debug source / mode 字段                                                             | 能从日志判断一次 timeline 写入来自 live event、detail、read model 还是 reconcile |
| Phase 2：低风险防覆盖        | active turn 运行中 detail refresh 不再整表覆盖 transcript | 为 `refreshAgentSessionDetailState` / `applySessionDetail` 增加 mode 或 active timeline guard；补单测 | text delta 后多次 stale `runtimeGetSession` 不减少内容、不回退 item 数           |
| Phase 3：timeline store 收敛 | 把 live timeline 合并策略从 React snapshot 写入中抽出     | `ThreadTimelineStore` 或等价 reducer / merge policy；read model 独立 apply                            | active / restore / terminal 三类合并都有独立 fixture                             |
| Phase 4：GUI 与 evidence     | 证明真实桌面流式不再覆盖前文                              | GUI smoke / Playwright / fixture evidence                                                             | 用户日志中的高频 getSession 场景不再导致前文消失或时序错乱                       |

实施顺序已完成：先用 Phase 2 止血 active detail overwrite，再用 Phase 3 抽实 timeline merge policy，最后用 Phase 4 fixture / GUI evidence 证明高频 refresh 不再覆盖前文。后续若继续深化完整 `ThreadTimelineStore` reducer，应作为增量优化，不再改变本路线图主流程完成状态。

## 7. P0 回归场景

| 场景 id                                    | 输入 / 触发                                                          | 必须证明                                                        |
| ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `thread-live-stream-no-regression`         | `text_delta` 后连续触发多个 stale `getSession` 返回                  | 已显示文本不减少；`threadItems` 不因旧 detail 回退              |
| `thread-detail-refresh-terminal-reconcile` | active turn 结束后补拉 session detail                                | 可补齐 tool result / artifact refs / final status；文本顺序不乱 |
| `thread-read-model-isolation`              | topic preview / list sessions / read model refresh 与 streaming 并发 | queued/status/title 更新不触碰 transcript 主体                  |
| `thread-switch-restore-transcript`         | 切换到历史 session                                                   | persisted turns/items 能重建 transcript；不依赖 live buffer     |
| `thread-pending-action-replay`             | refresh 发生在 pending HITL/action_required 期间                     | 只重放仍 pending 的 request；已处理 request 不重复出现          |

## 8. 最小验证门禁

文档变更本身不需要运行产品测试。代码实施后的最小验证顺序：

```bash
npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts
```

若改动触及 GUI 主路径或实际流式渲染：

```bash
npm run verify:gui-smoke
```

若改动触及 App Server JSON-RPC、runtime event、bridge 或 mock 边界，再追加：

```bash
npm run test:contracts
```

## 9. 完成判定

| 层级         | 完成标准                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档完成     | 本路线图存在，且明确 Codex 对齐规则、Lime 事实源分类、Phase 2 下一刀和 P0 场景                                                                |
| Phase 2 完成 | 有单测证明 running turn 中 stale detail 不能删除或回退 local timeline；有 GUI fixture 覆盖停止后继续、Plan history hydrate 与 history restore |
| 主线完成     | GUI 或 fixture 证明用户日志中的高频 `runtimeGetSession` 不再覆盖前文内容                                                                      |
| 治理完成     | `deprecated` 的 active detail overwrite 路径被移除或守卫封住，后续新增只能走 current timeline merge                                           |

当前 Thread Timeline / Session Refresh 主线已完成：Phase 2 完成代码止血，Phase 3 抽实 timeline merge policy，Phase 4 已补最小 GUI evidence。后续只保留增量优化项，不再作为本路线图主流程阻塞。

## 10. Phase 2 首刀实施记录

2026-07-01 首刀只收敛 `useAgentRuntimeSyncEffects` 的 detail refresh 触发权：

1. `currentTurnEventName` 存在时，`runtimeSync.event`、team event、recovered poll、browser bridge poll 都不能直接触发 session detail refresh。
2. 运行中收到的 read model refresh 只记录为 deferred source，等 `isSending=false` 且当前 turn event binding 清空后再合并触发一次。
3. 当前测试文件 `useAgentRuntimeSyncEffects.test.tsx` 已超过 1000 行；本轮只更新既有用例，不继续扩展新 harness。下一次新增 runtime sync 行为测试前，优先把 runtime event / bridge polling 用例拆到 `useAgentRuntimeSyncEffects.runtimeEvents.test.tsx` 或等价分域测试文件。

## 11. Phase 2 第二刀实施记录

2026-07-01 第二刀补上 session detail safe-merge 兜底，并清理本地历史合并文件体量：

1. `runtimeSync.*` 来源的 session detail refresh 在 `agentSessionState.ts` 中分流处理：running / queued detail 按 rebase 处理，同 session 下保留当前 timeline；当 detail messages 与本地用户消息不兼容时，丢弃该批 hydrated transcript，只合入 turns、items、queued turns、read model 与 execution runtime。带明确 terminal turn / read model 的 detail 进入 terminal reconcile，允许最终 transcript 接管 pending 壳。
2. 相同 `agent_message` thread item 合并时，若 incoming text 只是本地长文本的短前缀，不允许截断已显示内容；状态、时间戳等 metadata 仍可从 incoming item 更新。
3. `agentChatHistoryLocalMerge.ts` 不再继续承接所有职责，已拆为：
   - `agentChatHistoryLocalMerge.ts`：主编排与字段级 merge。
   - `agentChatHistoryLocalMergeMatching.ts`：本地 / 远端 user、assistant 匹配与可恢复 user turn 插入。
   - `agentChatHistoryLocalMergeState.ts`：本地可保留状态、process state 与 assistant 可见输出保护。
4. 新增 `agentSessionState.runtimeSync.test.ts`，避免继续向已经超过 1000 行的 `agentSessionState.test.ts` 堆用例。

本阶段的 `deprecated` 行为是：active runtimeSync detail refresh 直接用远端 history snapshot 覆盖本地 live transcript。当前实现已把它降级为 safe rebase；下一刀应继续把 terminal reconcile 与 restore/switch 的写入模式显式化，避免后续又回到整树覆盖。

## 12. Phase 2 第三刀实施记录

2026-07-01 第三刀把 detail 写入权限从裸 source 字符串收敛为显式 merge mode：

1. `agentSessionState.ts` 不再读取或解析 `runtimeSync.*` 字符串，只接收 `detailMergeMode`：
   - `history_hydrate`：历史恢复 / 会话切换默认模式。
   - `runtime_sync`：运行期 refresh 的 safe rebase 模式，非 terminal detail 不覆盖 active timeline。
   - `terminal_reconcile`：已有 terminal 证据的恢复模式，允许最终 transcript 接管 pending 壳。
2. `agentSessionRefresh.ts` 是唯一把请求观测 `source` 映射为 `detailMergeMode` 的边界：`runtimeSync.*` -> `runtime_sync`，其它 source -> `history_hydrate`。
3. `silentTurnRecovery` 已显式使用 `terminal_reconcile`，避免恢复终态时继续依赖默认 hydrate 语义。
4. 新增单测覆盖 source -> mode 映射，确保后续不会把 `runtimeSync.*` 字符串重新塞回状态层。

当前 `compat` 面缩小为：refresh 请求仍保留 `runtimeSync.*` source 作为日志 / metrics / fetch 观测字段；状态写入策略已经切到 typed mode。下一刀应继续把 `useAgentRuntimeSyncEffects` 里的 runtimeSync source 常量化，并让 terminal event 直接声明 `terminal_reconcile`，减少 runtimeSync source 作为策略信号的剩余空间。

## 13. Phase 2 第四刀实施记录

2026-07-01 第四刀继续清理 runtime sync refresh 的策略边界：

1. `useAgentRuntimeSyncEffects.ts` 不再把裸 `runtimeSync.*` 字符串传给 `refreshSessionDetail`；运行期刷新统一传递 `{ source, detailMergeMode }` typed request。
2. `turn_completed`、`turn_failed`、`turn_canceled` 与当前 turn event 上的 `error` 直接声明 `terminal_reconcile`；普通 runtime status、queue、action、artifact、warning 与 poll / send-settled 只声明 `runtime_sync`。
3. 多个 deferred runtime event 合并时，`terminal_reconcile` 优先级高于普通 `runtime_sync`，避免 terminal 证据被后续非终态状态事件降级。
4. `agentSessionRefresh.ts` 删除 source -> mode 映射语义，`source` 只保留为日志 / metrics / fetch 观测字段；缺省 mode 只按 `history_hydrate` 兜底。

当前 `compat` 面进一步缩小为：`runtimeSync.*` source 字符串仍存在，但只作为可观测标签，不再参与状态写入策略选择。Phase 2 剩余风险已转为验证闭环；下一刀在 Phase 3 把 live timeline reducer / store 边界继续抽实。

## 14. Phase 2 验证收口记录

2026-07-01 验证 Phase 2 主流程：

1. 定向单测通过：
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/agentSessionRefresh.test.ts" "src/components/agent/chat/hooks/agentSessionState.runtimeSync.test.ts" "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx"`
   - 结果：`3 files / 26 tests passed`。
2. 发送与 provider 边界回归通过：
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/useAgentChat.test.tsx" "src/components/agent/chat/utils/clawWorkspaceProviderSelection.test.ts"`
   - 结果：`2 files / 186 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts" "src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts"`
   - 结果：`3 files / 50 tests passed`。
3. Electron / GUI fixture 通过：
   - `npm run smoke:agent-session-history-electron-fixture`
   - `npm run smoke:claw-chat-current-fixture -- --scenario cancel-then-continue --timeout-ms 180000`
   - `npm run smoke:claw-chat-current-fixture -- --scenario plan --timeout-ms 180000`
   - `npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --timeout-ms 180000`
4. 聚合门禁说明：
   - `npm run smoke:agent-runtime-current-fixture` 已通过本路线图相关的 history、streaming、cancel-then-continue、Plan history hydrate、Expert Panel provider 隔离场景。
   - 聚合最终失败在 `contentFactoryArticleWorkspaceArticleWritingStructureVisible`，证据显示 provider/model 仍为 `fixture-provider/fixture-model`，不是 thread/session refresh 或图片 provider 污染问题；该区域由并行进程处理，不作为本路线图 Phase 2 阻塞。
5. `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts` 当时命中仓库脚本 / Vite `EISDIR: illegal operation on a directory, read .../electron`，未产出有效业务断言；该缺口已在 2026-07-02 后续收口，见 §21。

Phase 2 完成口径：

- active streaming 期间 detail refresh 不再拥有整表覆盖 transcript 权限。
- `runtime_sync` / `terminal_reconcile` / `history_hydrate` 已成为状态写入策略事实源。
- stale detail 不得删除、回退或截断本地 live timeline 的单测已覆盖。
- 真实 Electron fixture 已覆盖停止后继续输出、历史恢复和 Plan history hydrate，能证明用户日志中的刷新覆盖类问题已完成止血。

## 15. Phase 3 / Phase 4 主流程收口记录

2026-07-01 继续完成 Phase 3 与最小 Phase 4 evidence：

1. Phase 3 抽实 timeline merge policy：
   - 新增 `agentSessionTimelineMergePolicy.ts`，集中承接 `history_hydrate` / `runtime_sync` / `terminal_reconcile` 的 transcript 写入策略。
   - `agentSessionState.ts` 降级为 hydrate 编排层，不再内联 runtime sync 的终态判断、历史兼容判断和 agent message 单调合并策略。
   - `mergeRuntimeSyncThreadItems` 进入 policy 模块，明确 runtime sync detail 只能更新 metadata / status，不能把本地较长 `agent_message.text` 截断为旧前缀。
2. Phase 3 独立策略回归：
   - `agentSessionTimelineMergePolicy.test.ts` 覆盖 history restore、runtime active safe rebase、terminal reconcile 三类写入模式。
   - 定向命令：`./node_modules/.bin/vitest run "src/components/agent/chat/hooks/agentSessionTimelineMergePolicy.test.ts" "src/components/agent/chat/hooks/agentSessionState.runtimeSync.test.ts" "src/components/agent/chat/hooks/agentSessionRefresh.test.ts" "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx"`
   - 结果：`4 files / 31 tests passed`。
3. Agent Chat 主路径回归：
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/useAgentChat.test.tsx" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts" "src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts"`
   - 结果：`4 files / 230 tests passed`。
4. Phase 4 GUI / Electron evidence：
   - `npm run smoke:agent-session-history-electron-fixture`
   - `npm run smoke:claw-chat-current-fixture -- --scenario cancel-then-continue --timeout-ms 180000`
   - `npm run smoke:claw-chat-current-fixture -- --scenario plan --timeout-ms 180000`
   - 三项均通过，分别覆盖历史恢复、active turn 停止后继续输出、Plan history hydrate。
5. 类型检查说明：
   - `npm run typecheck` 启动后超过四分钟无输出，为避免卡死本主流程已手动中止，未作为通过证据。
   - 本轮以贴近改动边界的 261 个 Vitest 断言、格式检查、diff 检查和 GUI fixture 作为有效证据。
6. 聚合门禁说明：
   - `npm run smoke:agent-runtime-current-fixture` 的 thread/session refresh 相关子场景已在本轮单独通过。
   - 聚合完整运行仍受 content factory 并行写集的 `contentFactoryArticleWorkspaceArticleWritingStructureVisible` 影响；该失败不属于本路线图主流程。

主流程完成口径：

- active streaming / runtime sync / terminal reconcile / history restore 的 transcript 写入权已经有显式 policy 模块承接。
- session detail 不再是无条件替换 live transcript 的事实源。
- read model / queued/status 与 transcript 主体写入权已在策略层分离。
- 最小 GUI evidence 已覆盖用户日志里的核心风险：高频 detail refresh 不应让前文消失、停止后继续不应乱序、历史 hydrate 不应覆盖错误主体。

后续增量优化：

- 可继续把 `AgentSessionTimelineMergeDecision` 扩展为完整 `ThreadTimelineStore` reducer，但这属于结构深化，不再阻塞本路线图主流程。
- 若 content factory 聚合门禁回绿后，可再补一次完整 `npm run smoke:agent-runtime-current-fixture` 作为跨主线最终总证据。

## 16. Provider / Model 污染门禁收口记录

2026-07-01 补齐 Agent Runtime 聚合门禁的 Expert Panel provider 隔离缺口：

1. 根因：图片 fixture provider 的 image-only model 曾被普通 Claw / Expert Panel 文本回合当作 general chat fallback，导致 follow-up `turnStart` 携带图片 provider 与 `gpt-image-1`。
2. 修复：
   - `modelThemePolicy.ts` 的 `general` 主题不再在 chat model 为空时 fallback 全部模型。
   - `clawWorkspaceProviderSelection.ts` 在普通聊天选择中继续过滤 image-only model，只有图片任务链路可以使用图片模型默认值。
   - `claw-chat-current-fixture-gui-completion-waits.mjs` 在同 prompt 多 turn group 时优先定位已包含期望 assistant 内容的 turn group，避免 GUI completion 等待误读 pending 草稿。
3. 回归：
   - `modelThemePolicy.test.ts` 覆盖只有 `gpt-image-1 / gpt-images-2` 时 general 主题返回空模型。
   - `clawWorkspaceProviderSelection.test.ts` 覆盖 image-only provider 不会被选为普通 Claw 聊天 provider。
4. 验证：
   - `npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --timeout-ms 180000` 通过。
   - `npm run smoke:agent-runtime-current-fixture` 通过，summary 明确 `liveProviderUsed=false`。
   - 最终 Expert Panel backend ledger 中两轮 `turnStart` 的 `providerPreference / modelPreference` 均为 `null`。
   - `npx vitest run "src/components/agent/chat/utils/modelThemePolicy.test.ts" "src/components/agent/chat/utils/clawWorkspaceProviderSelection.test.ts"` 通过，`npx prettier --check ...` 与 `git diff --check` 通过。

完成口径：图片 fixture provider 只保留为 media / image defaults，不再污染普通 Agent Chat / Expert Panel 文本 turn 的 provider/model 选择链路；此前聚合门禁中的 `liveProviderNotUsed` 失败已收口。

## 17. Codex WebSearch / Thinking 工具面对齐记录

2026-07-01 复核“今天国际新闻没有搜索、没有思考”的现象时，确认该问题不属于 Thread Timeline refresh 覆盖主线，而是 AgentChat 发送边界与 App Server runtime 工具面策略问题。对齐 Codex 的设计口径如下：

1. Codex 参考点：
   - `codex-rs/core/src/client.rs` 构造 Responses 请求时随 prompt 携带 `tools`，并固定 `tool_choice: "auto"`。
   - `codex-rs/core/src/tools/hosted_spec.rs` 只根据 `WebSearchMode` 暴露或隐藏 hosted `web_search` tool。
   - `codex-rs/protocol/src/config_types.rs` 中 `WebSearchMode` 默认不是前端关键词规则，而是配置级工具面模式。
2. Lime current 口径：
   - 前端 `fast_response` 只声明轻量路由与展示偏好，不按“今天 / 新闻 / 价格 / 最新”等关键词判断 WebSearch 是否 required。
   - App Server / Runtime 是工具面事实源：默认 `search_mode=auto` 时保留 WebSearch 工具面，由模型按 tool_choice auto 自行选择是否调用。
   - 只有显式 `web_search=false` 或 `search_mode=disabled` 时，fast-response 才允许延迟工具面准备并走 direct answer。
   - 只有显式 `search_mode=required` 时才注入“必须先调用 WebSearch”的请求级约束；`auto` 不再把硬编码搜索触发词写进 system prompt。
3. 禁止回流：
   - 不得恢复 `freshFactualSearchPolicy.ts` 或同类前端关键词策略文件。
   - 不得在 `buildUserInputSubmitOp` / `fastResponseRouting` 中按自然语言关键词写入 `search_mode=required`。
   - 不得用“新闻 / 价格 / 今天”等正文正则作为 thinking、search 或 final answer 的生命周期判定；UI 顺序仍只认结构化事件与 provenance。

这一步服务路线图主目标的方式：它避免前端为了修复“没搜索”而新增第二套内容语义路由，从而保持 Thread Timeline / Session Refresh 主线的结构化事件事实源不被正文关键词策略污染。

## 18. 2026-07-02 完成审计记录

本轮 completion audit 按当前工作树重新核对路线图主目标、Codex 对齐口径、代码体量边界、hardcode 清退和最小验证证据：

1. 路线图主目标：
   - `agentSessionTimelineMergePolicy.ts` 已作为 current timeline 写入策略事实源，承接 `history_hydrate` / `runtime_sync` / `terminal_reconcile`。
   - `agentSessionState.ts` 保持 hydrate 编排层，运行期 detail refresh 不再按裸 `runtimeSync.*` source 字符串决定 transcript 写入策略。
   - `useAgentRuntimeSyncEffects.ts` 传递 typed refresh request；terminal event 直接声明 `terminal_reconcile`，普通 runtime sync 只走 safe rebase。
2. `agentChatHistoryLocalMerge.ts` 拆分审计：
   - `agentChatHistoryLocalMerge.ts`：493 行，主编排与字段级 merge。
   - `agentChatHistoryLocalMergeMatching.ts`：313 行，匹配与可恢复 user 插入。
   - `agentChatHistoryLocalMergeState.ts`：254 行，本地可保留状态与 visible output 保护。
   - 三个文件均低于 800 行预警线，不再继续向单文件追加主线逻辑。
3. Codex WebSearch / Thinking 对齐：
   - `freshFactualSearchPolicy.ts` 当前已不存在，也不在 git tracked files 中。
   - `freshFactualSearchPolicy` / `requiresFreshFactualWebSearch` / `fresh-factual-tool-required` 只剩本路线图禁止回流记录。
   - 前端自然语言输入不按“今天 / 新闻 / 价格 / 最新”等正文关键词写入 `searchMode=required`；默认由 App Server / Runtime 暴露 `search_mode=auto` 工具面，模型按 tool choice auto 自行选择。
4. 2026-07-02 已重新执行的贴边界验证：
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/agentSessionTimelineMergePolicy.test.ts" "src/components/agent/chat/hooks/agentSessionState.runtimeSync.test.ts" "src/components/agent/chat/hooks/agentSessionRefresh.test.ts" "src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx"`：`4 files / 31 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/useAgentChat.test.tsx" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts" "src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts"`：`4 files / 230 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/utils/generalAgentPrompt.test.ts" "src/components/agent/chat/utils/fastResponseRouting.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts"`：`3 files / 34 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/utils/generalAgentPrompt.test.ts" "src/components/agent/chat/utils/fastResponseRouting.test.ts" "src/components/agent/chat/utils/modelThemePolicy.test.ts" "src/components/agent/chat/utils/clawWorkspaceProviderSelection.test.ts"`：`4 files / 34 tests passed`。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy::policy_config`：`10 tests passed`。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-scheduler request_tool_policy`：passed。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server fast_response`：`8 tests passed`。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server natural_language_news_turn_exposes_search_tool_surface_by_default`：passed。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server explicit_auto_search_mode_uses_model_tool_choice`：passed。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server explicit_web_search_false_keeps_search_disabled`：passed。
   - `npm run smoke:agent-runtime-current-fixture`：passed，summary 明确 `liveProviderUsed=false`，覆盖 history/cache hydration、停止后同会话继续输出、Plan history hydrate、Claw GUI current fixture guard、内容工厂 Article Editor 等 current fixture 回归。
   - `npm run smoke:agent-session-history-electron-fixture`：passed，覆盖 Electron Desktop Host 经 App Server current `initialize`、`agentSession/start`、`agentSession/read`、`agentSession/update`、`agentSession/list`。
   - `npm run smoke:claw-chat-current-fixture -- --timeout-ms 180000`：passed，覆盖 GUI 自然语言新闻输入到 `agentSession/turn/start`、read model completed 与 event read probe。
5. `test:related` 入口状态：
   - 早前 `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts` 命中过 Vite `EISDIR: illegal operation on a directory, read .../electron`，没有进入业务断言。
   - 该入口已在 2026-07-02 后续收口，当前有效证据见 §21；本路线图不再把 EISDIR 作为未完成缺口。

审计结论：Thread Timeline / Session Refresh 主流程已达到本路线图完成口径；WebSearch hardcode 清退是本主线的结构化事件事实源保护项，已按 Codex 设计收口。剩余可选项只包括更完整的 `ThreadTimelineStore` reducer 深化和并行工作树回绿后的全仓聚合复跑，不作为本路线图主流程阻塞。

## 19. 2026-07-02 Route Shell / Remount 治理收口记录

本轮继续处理用户日志中的页面反复 mount、前文输出被替换刷新和首屏慢问题。结论是：Thread Timeline 写入权已经收口后，路由层不应再通过 React `key` 把 Agent workspace 当成可重建对象；项目、文稿、主题、入口、初始会话和能力启动都必须交给同一个 `AgentChatPage` / `AgentChatWorkspace` 实例内的 runtime state machine 消化。

1. Route shell 事实源调整：
   - `src/components/AppPageContent.tsx` 删除 `AgentChatPage` 静态 import，改为 `lazy(() => import("./agent/chat"))`。
   - `src/components/AppPageContent.tsx` 删除 `serializeAgentChatPageInstanceKey` 及所有子序列化 helper。
   - `AgentChatPage` 不再接收 React `key`；`initialSessionId`、`agentEntry`、`initialInputCapability`、Knowledge selection、pending service skill、project file open、expert launch、`projectId`、`contentId`、`theme`、`lockTheme` 等变化都只作为 props 进入现有实例。
   - `src/components/agent/chat/index.tsx` 删除 `AgentChatWorkspace` 内部 `forcedMountKey`，直达工作区只调整 `agentEntry/showChatPanel` props，不再留下子树 key 级重建语义。
   - `src/components/agent/chat/index.tsx` 将 `AgentChatWorkspace` 改为内部 `React.lazy`，让 `AgentChatPage` route shell 先加载，重工作台实现单独拆 chunk；这一步不改变 workspace state machine，只拆首屏同步 import 重活。
   - `src/hooks/useAppNavigation.ts` 将导航去重 key 改为稳定序列化；同语义 params 不再因对象字段插入顺序不同而产生新的 `navigationRequestId`。
   - `src/App.tsx` / `AppPageContent` 删除不再消费的 `navigationRequestId` props 接线，避免 route shell 继续暴露“请求号可驱动重建”的旧语义。
2. Codex 对齐口径：
   - Codex 的 thread/session 分层不会用 UI route remount 作为 transcript 刷新策略；session header、runtime events、thread transcript、pending replay 分层更新。
   - Lime 本轮 route shell 对齐为：路由只负责传递参数和 lazy loading，不能拥有 timeline reset 权；状态迁移由 Agent workspace 内部 current runtime / effect / merge policy 承担。
3. 回流禁止：
   - 不得重新把 `initialSessionId`、`agentEntry`、`initialInputCapability`、Knowledge selection、service skill launch、expert launch 等加入 `AgentChatPage` 的 React key。
   - 不得在 `AgentChatPage` 内部重新给 `AgentChatWorkspace` 增加按直达意图生成的 React key。
   - `protocol-fact-source-guard.test.ts` 必须继续禁止 `serializeAgentChatPageInstanceKey`、`forcedMountKey`、`freshFactualSearchPolicy`、`requiresFreshFactualWebSearch`、`fresh-factual-tool-required` 回流到 Agent Chat 生产源码。
   - 不得用“重建整个 AgentChatPage”修复旧状态闪烁；必须在 `AgentChatWorkspace` 内按 mode / source / requestKey 做局部消费和状态收敛。
   - 真正需要清空 transcript 的场景只能由明确的新会话 / 切换会话 / terminal reconcile / history hydrate 语义驱动，不能由路由 props 差异隐式触发。
   - 不得用普通 `JSON.stringify(params)` 作为导航去重事实源；对象 key 顺序不是业务语义，不能触发重复导航请求。
4. 回归：
   - `src/components/AppPageContent.test.tsx` 覆盖 `initialSessionId`、`agentEntry`、`newChatAt`、`initialInputCapability`、Knowledge selection、curated task、项目 / 文稿 / 主题 / lockTheme 切换均复用同一 `AgentChatPage` 实例，同时继续断言新 props 能透传。
   - `src/components/agent/chat/index.shell-routing.test.tsx` 覆盖 `new-task` 首页 props 切到直达工作区意图时复用同一 `AgentChatWorkspace` DOM 实例，不再通过内部 key 修复旧状态闪烁。
   - `src/components/agent/chat/protocol-fact-source-guard.test.ts` 覆盖旧前端关键词搜索策略文件保持 deleted，并禁止 route remount key / fresh factual 关键词策略标识回流到非测试源码。
   - `src/components/AppPageContent.test.tsx` 覆盖真实导航的 pending path：`requestedPage="agent"` 先渲染，随后 `currentPage` 追平同一 agent route 时，不重建 `AgentChatPage`。
   - `src/hooks/useAppNavigation.test.tsx` 覆盖同页同语义参数重复跳转，即使 top-level 与 nested metadata 字段顺序不同，也不更新导航状态或递增 `navigationRequestId`。
5. 验证：
   - `./node_modules/.bin/vitest run "src/components/AppPageContent.test.tsx"`：`28 tests passed`。
   - `./node_modules/.bin/vitest run "src/hooks/useAppNavigation.test.tsx" "src/components/AppPageContent.test.tsx"`：`39 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/index.shell-routing.test.tsx" "src/components/agent/chat/agentChatPageShellViewModel.unit.test.ts" "src/components/AppPageContent.test.tsx" "src/hooks/useAppNavigation.test.tsx"`：`55 tests passed`。
   - `./node_modules/.bin/vitest run "src/components/agent/chat/protocol-fact-source-guard.test.ts" "src/components/agent/chat/index.shell-routing.test.tsx" "src/components/agent/chat/utils/fastResponseRouting.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts"`：`39 tests passed`。
   - `npm run smoke:agent-runtime-current-fixture`：passed，覆盖 history/cache hydration、停止后同会话继续输出、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Panel、内容工厂 Article Editor 等 current fixture，`liveProviderUsed=false`。
   - `npm run verify:gui-smoke`：passed，覆盖 Electron renderer build、Desktop Host、App Server sidecar、claw workbench shell 和 memory settings。
   - renderer 构建继续保持 Agent route lazy chunk；内部 `AgentChatWorkspace` 二级 lazy 后，`AgentChatPage` shell 产物约 `2.59 KB`，`AgentChatWorkspace` 独立产物约 `3.27 MB`，App route shell 不再静态拖入完整 workspace 实现。

完成口径：Route shell 已不再拥有 Agent timeline 的卸载重建权；用户日志中因路由参数变化导致的 AgentChatPage / AgentChatWorkspace 反复 mount、前文输出被旧实例替换或时序错乱的主路径已封住。剩余性能优化应进入 `AgentChatWorkspace` 内部首屏同步重活拆分或 runtime/provider 首 delta 优化，不再通过 route key 处理。

## 20. 2026-07-02 主流程最终判定

本路线图主流程以 `current` Thread Timeline / Session Refresh / Route Shell 三条事实源完成收口，不再保留需要继续实施的阻塞项。

1. 主流程完成项：
   - live timeline 写入权已从 session detail snapshot 中收回，`history_hydrate` / `runtime_sync` / `terminal_reconcile` 由 typed merge policy 分流。
   - `agentChatHistoryLocalMerge.ts` 已按职责拆分为主编排、匹配、状态保留三个文件，均低于 800 行预警线。
   - Route shell 不再通过 React `key` 重建 `AgentChatPage` / `AgentChatWorkspace`，导航参数变化只进入现有实例内的 runtime state machine。
   - WebSearch / Thinking 对齐 Codex 工具面设计：前端不再按自然语言关键词强制搜索，默认由 App Server / Runtime 暴露 `search_mode=auto` 与 model `tool_choice`。
2. 回流守卫：
   - `protocol-fact-source-guard.test.ts` 禁止 `freshFactualSearchPolicy`、`requiresFreshFactualWebSearch`、`fresh-factual-tool-required`、`serializeAgentChatPageInstanceKey`、`forcedMountKey` 回到 Agent Chat 生产源码。
   - `src/components/agent/chat/utils/freshFactualSearchPolicy.ts` 保持 deleted。
   - 生产源码扫描仅在防回流测试自身命中上述标识，未发现旧关键词搜索策略或 route remount key 回流。
3. 本段新增复核：
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server natural_language_news_turn_exposes_search_tool_surface_by_default`：passed。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server explicit_auto_search_mode_uses_model_tool_choice`：passed。
   - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server explicit_web_search_false_keeps_search_disabled`：passed。
   - `./node_modules/.bin/vitest run "scripts/lib/run-vitest-smart.unit.test.mjs"`：`10 tests passed`。
   - `npm run test:related -- electron/hostCommands.ts --bail=1`：`electron/hostCommands.test.ts`，`54 tests passed`。
   - `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts --bail=1`：`31 files / 396 tests passed`。
   - `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts`：`31 files / 396 tests passed`。
   - `git diff --check`：passed。
   - `git diff --no-index --check -- /dev/null internal/roadmap/thread/README.md`：无 whitespace 输出；退出码为 no-index diff 的内容差异信号。
4. 未作为阻塞的可选深化：
   - 可继续把 `agentSessionTimelineMergePolicy.ts` 深化成完整 `ThreadTimelineStore` reducer，但当前已不影响用户日志中的前文覆盖 / 时序错乱主路径。
   - 可在并行内容工厂 / 图片任务工作树回绿后再跑一次全仓 `npm run verify:local`，但本路线图完成判定已由定向 Vitest、Rust WebSearch 边界测试、Agent current fixture 与 GUI smoke 覆盖。

最终结论：Thread Timeline / Session Refresh / Route Shell 主流程完成；剩余项属于性能与结构深化，不再阻塞本路线图主目标。

## 21. 2026-07-02 test:related / i18n 入口收口记录

本轮继续收口 §14 / §18 里遗留的 `test:related` 无效证据问题，并修复 related 批次暴露出的空最终答复中文文案污染。

1. `test:related` EISDIR 根因与修复：
   - 根因：前端源码 related 模式会让 Vitest 依赖图扫描 / transform `electron/**`，进而把仓库根 `electron/` 目录当模块读取，触发 `EISDIR: illegal operation on a directory, read .../electron`。
   - `scripts/run-vitest-smart.mjs` 在前端 related 模式默认追加 `--exclude electron/**`，避免 Vite transform Electron main 源码。
   - Electron 输入不走 Vitest `related` 依赖图，改为直接运行相邻 `*.test.*` 文件；例如 `electron/hostCommands.ts` 解析到 `electron/hostCommands.test.ts`。
   - `scripts/lib/run-vitest-smart.unit.test.mjs` 覆盖前端 related 排除 Electron、Electron 源码相邻测试、Electron 测试文件直跑三条分支。
2. i18n 污染修复：
   - `useAgentChat.testUtils.tsx` 在共享 `beforeEach` 中显式 `changeLimeLocale("zh-CN")`。
   - 空最终答复错误仍走 key-based i18n；测试夹具只固定中文断言环境，不把生产逻辑回退成硬编码中文。
3. 验证：
   - `./node_modules/.bin/vitest run "src/components/agent/chat/hooks/useAgentChat.test.tsx" --testNamePattern "turn_completed 前未收到正文" --bail=1`：`1 test passed`。
   - `./node_modules/.bin/vitest run "scripts/lib/run-vitest-smart.unit.test.mjs"`：`10 tests passed`。
   - `npm run test:related -- electron/hostCommands.ts --bail=1`：`electron/hostCommands.test.ts`，`54 tests passed`。
   - `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts --bail=1`：`31 files / 396 tests passed`。
   - `npm run test:related -- src/components/agent/chat/hooks/agentSessionState.ts src/components/agent/chat/hooks/agentSessionRefresh.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.ts`：`31 files / 396 tests passed`。

完成口径：`test:related` 现在能作为 Thread / Session / Route Shell 主线的有效缩小反馈环；Electron main 输入不会被前端排除策略误伤，前端输入也不会再因 Electron transform 触发 EISDIR。

## 22. 2026-07-02 WebSearch Cell / 流式校验收口记录

本轮继续按 `/Users/coso/Documents/dev/rust/codex` 复核用户日志中的两个问题：后续搜索会合并到前一个搜索工具组，以及首字仍慢。

1. Codex 对照结论：
   - `codex-rs/tui/src/chatwidget/tool_lifecycle.rs` 的 `on_web_search_begin` 会先 `flush_answer_stream_with_separator()`、`flush_active_cell()`，再用 `call_id` 创建新的 `WebSearchCell`。
   - `on_web_search_end` 只更新相同 `call_id` 的 active cell；若 active cell 不匹配，则新增一条 history cell。
   - `codex-rs/tui/src/history_cell/search.rs` 的 `WebSearchCell` 持有 `call_id`，不是把多次 WebSearch 跨 thinking / 正文聚成长期工具组。
2. Lime 收口：
   - `StreamingProcessGroupModel.shouldSplitProcessBeforeEntry` 现在把新的 WebSearch call 作为 process 边界：前置 thinking 不再被吸进 WebSearch；已有检索过程遇到后续 WebSearch 必须 flush，新搜索不回并旧组。
   - 紧随 WebSearch 的 WebFetch 仍可作为同一次检索链的读取步骤展示，避免把“搜索来源 -> 读取页面”的支持关系拆碎；独立 WebFetch 不再并入普通工具过程。后续若 App Server 把 OpenPage / FindInPage 也投影为独立 WebSearch call，应继续按 call 边界处理。
   - `StreamingRenderer` 的 interleaved 与 fallback 渲染都复用同一 split 规则，避免无 `contentParts` 的工具 fallback 继续聚合多个 WebSearch。
   - 外置 `AgentThreadTimeline` 的 `agentThreadGrouping` 同步使用 WebSearch call 边界；内容工厂等工作流不再用特殊聚合规则绕过搜索拆组，完成态默认按普通 WebSearch 过程折叠展示。
3. 活跃流式期间的 detail 校验：
   - `useAgentSession` 的 missing-session hydrate effect 已把 `activeStreamingTimeline` 加入依赖数组，避免流式开始后旧闭包继续触发 `runtime.getSession(source: "missingSessionVerify")`。
   - `useAgentSession.loadTopics` / 初始 `listSessions` 现在遇到 active streaming 会只标记 pending refresh，不在输出中段拉话题列表；收到 terminal 事件后再合并执行一次补刷新。
   - 相关回归改口径为：话题列表暂时不含当前执行会话时，active streaming 期间不得校验；收到 terminal 事件后才允许校验并补回 / 清空会话。
4. 活跃流式期间的 Sidebar 刷新：
   - `AgentChatWorkspace` 现在把真实 `isSending` 上报到 App，再传给 `AppSidebar`；`useAppSidebarSessions` 在 active streaming 期间不再发起最近对话 `listSessions`。
   - active streaming 期间收到 session metadata 更新、focus refresh 或分页触发时，只标记 pending；终态 / idle 后再合并成一次最近对话刷新，避免日志中的全局 / workspace / cwd 三组 `runtimeListSessions` 在长搜索中反复插队。
5. 剩余慢因判断：
   - 用户日志中 `firstTextDelta elapsedMs: 8058`、`firstEventDeltaMs: 7406`，但 `firstTextPaint` 只比首个 delta 晚约 `67ms`；当前首字慢主因在 provider / runtime 首个文本事件，而不是 React paint。
   - `provider_trace(request_started / first_event_received)` 现在会在首字前补一个真实等待态 `runtimeStatus`，让 UI 立即显示“正在启动处理流程”；这只改善首字前可见反馈，不伪造 assistant 正文，也不把 provider 首 token 时间误报为前端渲染问题。
   - Sidebar 的中途刷新已延后；若仍有卡顿，下一刀应继续下钻 provider/runtime 首 token 前的 provider trace、工具调度和后端搜索调用链。
6. 回归：
   - `StreamingProcessGroupModel.unit.test.ts` 覆盖 WebSearch 前置 thinking split 与 WebSearch 后 thinking 仍作为当前检索说明。
   - `StreamingRenderer.webSearch.test.tsx` 覆盖多次 WebSearch 拆成独立过程组，后续搜索不出现在前一个组。
   - `agentThreadGrouping.test.ts` 覆盖外置 timeline 中连续 WebSearch、WebSearch + WebFetch 后再次 WebSearch，以及内容工厂 WebSearch 都按调用边界拆组。
   - `messageListItemProjection.timeline.unit.test.ts` 覆盖运行中工具 timeline 不再把已提交导语挪到搜索过程后。
   - `useAgentChat.test.tsx` 覆盖 active streaming 期间不执行 `missingSessionVerify`，terminal 后再校验缺失会话。
   - `AppSidebar.conversations.test.tsx` 覆盖 active streaming 期间当前 session metadata 更新不会触发最近对话 `listSessions`，终态后只排一次刷新。
   - `agentStreamRuntimeHandler.unit.test.ts` / `agentStreamRuntimeStatusController.test.ts` 覆盖 provider trace 早于首字时的等待态补位，以及后续真实 `runtime_status` 覆盖补位状态。

完成口径：WebSearch UI 过程不再跨 call 合并；active streaming 期间由话题列表缺失触发的 session detail 校验已收口；Sidebar 最近对话 listSessions 不再插入流式中段；首字前有真实 provider trace 等待态可见。剩余性能项集中在 provider/runtime 首 token，不再归因于首字 paint 或侧栏中段刷新。

## 23. 2026-07-02 Codex 流式流畅性架构索引

用户指出“不是只有首 token 慢，过程中也会卡顿”。本路线图只保留结论索引，详细架构图、时序图和流程图已拆到独立文档：

- [`streaming-fluidity-architecture.md`](./streaming-fluidity-architecture.md)

索引结论：

1. Codex 的流畅输出来自 active stream、history cell、工具 lifecycle、redraw / commit tick 分层，不是把每个 token 写进完整 UI 状态树。
2. Lime 的目标是让 final answer delta 先进入轻量 overlay，只有 process boundary / terminal 时才提交 `messages.contentParts`。
3. active streaming 期间的 `getSession` / `listSessions` 默认延后，避免在输出中段抢占主线程和 IO。
4. 后续性能排查分成首字前反馈、中段 UI 抢资源、逐 delta 重渲染、后端多 provider attempt 四条线，不能只看一个 TTFT 指标。
