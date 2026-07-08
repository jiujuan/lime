# Clawstream Codex-derived Guardrail 推进计划

> 状态：active
> 创建时间：2026-07-06
> 关联路线图：`internal/roadmap/test/clawstream/README.md`
> 关联账本：`internal/roadmap/test/clawstream/scenario-ledger.md`
> 关联骨架：`internal/roadmap/test/clawstream/scenario-registry.json`
> 关联主线：`internal/research/refactor/v1`
> S1 细化计划：`internal/exec-plans/clawstream-s1-p0-implementation-plan.md`

## 1. 主目标

把 Codex 的 Thread / Turn / Item、app-server integration、core session/tool runtime、TUI snapshot 测试体系，转成 Lime Claw 的可执行护栏：

```text
Codex source test
  -> Lime scenarioId
  -> normalized event item
  -> projection / read model oracle
  -> DOM / Electron fixture evidence
  -> legacy cleanup gate
```

本计划不再停留在“列出需要覆盖的能力”。推进方式固定为先快速完成全量骨架，再回头补细节：`scenario-registry.json` 负责固定全量 scenarioId、execution batch、evidence gate、detail order、优先级、状态、目标证据层、下一步细节入口和验证命令；`scenario-ledger.md` 负责记录 Codex 来源、oracle、Electron evidence 和清理目标。每一批细节推进都必须按 registry 的 `detailOrder` 让账本状态前进，并为后续删除 Claw 旧 helper、旧 fallback、旧 mock / compat 旁路提供准入证据。

## 2. Current / Compat / Deprecated / Dead

| 分类         | 对象                                                                                                                        | 处理                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `current`    | `RuntimeEvent -> Thread / Turn / Item -> Projection / ReadModel / ContentPart -> GUI / Electron fixture`                    | 继续演进，所有新测试和重构都落这里                |
| `compat`     | 无 `itemId / phase / sequence` 的历史 text delta、历史 `Message.content` hydrate 兜底                                       | 只允许 fail-closed 历史兜底，不作为新场景通过证据 |
| `deprecated` | timeline 二次重建完整过程流、overlay 全局助手文本缓冲、旧 Plan/update_plan UI owner、多套 input restore fallback            | 对应 guard 成立后删除                             |
| `dead`       | 生产 mock fallback、`agent_runtime_*` 生产 surface、旧 Tauri wrapper、自然语言 lifecycle regex、无 turnId terminal fallback | 删除或 retired guard-only                         |

## 3. 执行原则

1. Codex-first 是默认执行准则；除多模型 / 多模态 provider capability、media part、模型能力矩阵和 provider lowering 参考 opencode 外，命名、架构、状态机、工具生命周期、MCP、Skills、Multi-Agent、Plan hydrate、history hydrate、projection 和测试护栏都按 Codex 对齐。
2. 先补护栏，再删旧实现；没有对应 scenario ledger 行的旧实现不动刀。
3. 每个场景至少推进两层证据；用户主路径、history hydrate、MCP、Skills、Multi-Agent、artifact 必须三层齐备。
4. 全量骨架优先于单点深挖；除 P0 正在修的首字 / reasoning / terminal / inputbar 外，不在缺 registry 的情况下继续追加散点 fixture。
5. P0 先解决首字慢、reasoning 顺序、terminal 收尾、输入恢复；这些直接影响当前 Claw 可用性。
6. 现有 Electron fixture 不能当作完成态；已有 fixture 的场景还要补 item/projection oracle。
7. 不新增 parallel legacy path；新增能力默认走 App Server JSON-RPC current 主链和前端 projection。
8. 验证以当前风险为上限，先定向 `unit/projection/component`，再跑对应 Electron fixture 和聚合 smoke。

## 4. 阶段计划

### S0：索引与推进计划

状态：completed

目标：

- 建立 Clawstream 路线图、Codex-derived index、scenario ledger 和本执行计划。
- 把 Codex 具体测试函数索引到 Lime scenarioId，而不是只列大类。
- 明确下一批 P0 写集、验证入口和删除准入。

退出条件：

- [x] `internal/roadmap/test/clawstream/README.md` 落地。
- [x] `internal/roadmap/test/clawstream/codex-derived-index.md` 落地。
- [x] `internal/roadmap/test/clawstream/scenario-ledger.md` 落地。
- [x] `internal/roadmap/test/clawstream/scenario-registry.json` 全量骨架落地，覆盖 P0/P1/P2 共 59 个场景，并按 8 个 execution batch 固定“先骨架、后细节”的执行顺序、evidence gate、detail order、验证入口、骨架字段定义和 `current / compat / deprecated / dead` 分类。
- [x] `internal/roadmap/test/clawstream/scenario-registry.test.mjs` 落地，守住 registry 与 ledger 同步，并确保每个场景必须且只能属于一个 execution batch、一个 batch detail order，每个 batch 都有非空验证命令，且 ledger 每行必须具备 Codex 来源、标准事件项、Projection / GUI oracle 和清理目标。
- [x] 本计划落地并被 Clawstream README 反链。
- [x] 文档 diff 基础检查通过。

### S1：P0 Event / Item fixture skeleton

状态：in_progress

执行细节见 `internal/exec-plans/clawstream-s1-p0-implementation-plan.md`。S1 不做泛化清理，只推进 parser boundary、inputbar restore、stale terminal 和 running status 四个 P0 工作包；全量 registry 骨架已经先闭合，后续每个工作包完成后同步回写 `scenario-ledger.md` 与 `scenario-registry.json` 状态。

优先场景：

| scenarioId                       | 目标状态                            | 最小实现落点                                                                                          |
| -------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `startup-prewarm-first-output`   | `missing -> partial`                | fixture schema + projection unit，断言 startup/prewarm 不阻塞首个 reasoning/text                      |
| `reasoning-first-visible`        | `partial -> partial+guard`          | reasoning item oracle + MessageList/StreamingRenderer DOM 回归                                        |
| `stream-parser-boundary`         | `missing -> partial`                | added/delta/completed parser boundary fixture                                                         |
| `terminal-contract-after-answer` | `partial+guard -> covered-electron` | terminal event controller / completion controller 单测 + failed-after-answer Electron current fixture |
| `inputbar-restore-matrix`        | `missing -> partial+guard`          | inputbar restore pure reducer / hook unit matrix + Inputbar rich restore component guard              |

拟写集：

- `packages/agent-ui-contracts/**` 或现有 Claw fixture type owner。
- `packages/agent-runtime-projection/**`。
- `src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`。
- `src/components/agent/chat/hooks/agentStreamCompletionController.test.ts`。
- `src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts`。
- `src/components/agent/chat/components/MessageList*.test.tsx`。
- 必要时新增 `scripts/agent-runtime/fixtures/clawstream/**`，不要在 `scripts/` 根目录新增脚本。

退出条件：

- `scenario-ledger.md` 中上述 5 个 P0 场景至少推进到 `partial`。
- guard 明确禁止自然语言 lifecycle regex、无 turnId terminal fallback、startup note 闪现。
- 定向 unit/projection/component 通过。

当前进度：

- [x] `startup-prewarm-first-output` 已推进到 `covered-electron`：`clawstreamP0.test.mjs` 证明 startup/prewarm 状态不会进入 visible messages，首个 reasoning/text 可见；Agent UI performance summary 与 Electron fixture 公共断言要求 text-stream 场景携带 first visible output marker，并分离 provider wait 与 client local output；`complete` Electron current fixture 已实跑通过并导出 first text paint 证据。
- [x] `reasoning-first-visible` 已推进到 `covered-electron`：projection oracle 证明 reasoning 先于 text 成为 UI message part；MessageList / AgentThreadTimeline DOM guard 证明首字前 reasoning 不展示启动说明、hydrate 后不重复，且 summary 默认可见、raw reasoning 只在展开后出现；Electron current `reasoning-first-visible` fixture 已捕获 final/done 前 `思考中 + 正在输出` 中间态，完成态与 read model 均证明 reasoning sequence 早于 final message。
- [x] `terminal-contract-after-answer` 已推进到 `covered-electron`：projection 层命名 oracle 证明 `turn.completed` 只更新 runtime status、不合成正文，无 assistant text 时 fail closed；hook/runtime guard 证明已显示 partial answer 后 `turn_failed` 只补一个失败说明，不重复 error、不吞过程卡；Electron current `terminal-failed-after-answer` fixture 已实跑，证明 partial 保留、失败说明可见且只出现一次、输入框恢复、read model 标记 `failed`；Electron current `terminal-canceled-after-answer` fixture 已实跑，证明 stop 前 partial 与 running 同屏，`turn.canceled` 后 partial 保留且只出现一次、输入框恢复、read model 标记 `canceled`。2026-07-08 已补真实 App Server normalizer 负向矩阵，并把 current smoke 迁到 `turn.completed`；剩余 `final_done` 只允许负向 schema / test-only guard / live runner timeout grace。
- [x] guard 已禁止核心投影文件重新引入“启动处理流程 / 已接收请求”启动说明文案。
- [x] `stream-parser-boundary` 已推进到 projection 层 `partial+guard`：message seed/delta/completed full text 只保留一个 final text part，不把 completed 全量正文追加成重复 finish tail；`<proposed_plan>` 跨 message added / delta / completed 边界会 materialize 为独立 `plan` part。
- [x] `plan-parser-boundary` 已推进到 projection 层 `partial+guard`：结构化 `plan.delta/final` 与 proposed_plan block 都进入 `plan` part；仍缺 Plan rail / decision drawer / history hydrate DOM 与 Electron evidence。
- [x] 无 turnId terminal fallback / stale terminal active-turn oracle 已推进到 `covered-electron`：pure guard 对缺失 `terminalTurnId` fail closed，handler 回归证明旧 turn terminal 不误停新 active stream；Electron current `terminal-stale-guard` 骨架证明同 session 两轮 GUI/read model 完成，第二轮期间旧 terminal marker 不污染 UI。
- [x] `inputbar-restore-matrix` 已推进到 hook + component + read model 层 `partial+guard`：pure policy 覆盖 output-free / visible-output / thinking-only / patch-active / queued steer，manual stop 不再本地抢先清空 queued turns；rich restore 已接到 active stream stop -> Inputbar restore request，组件 guard 覆盖 text / images / pathReferences / inputCapabilityRoute；Electron current fixture 已覆盖 rich draft text/image/path/skill 取消恢复；App Server queued snapshot 与前端 normalizer 已保留 pending steer 的 attachments / pathReferences / textElements / skill route；frontend normalizer 已按 explicit `position` 恢复多 queued turn 顺序，同 position 或 legacy 缺 position 时保持输入稳定顺序；App Server oracle 已证明多 queued read model 顺序、pop-front resume 后剩余 queued reindex 为 `position=0`，且 top-level `queued_turns` 与 `thread_read.queued_turns` hydrate 同构；devserver 与 packaged Electron Gate B fixture 已覆盖正在输出时排队富输入、stop queued rich turn 后恢复 text/image/path/skill；Electron 多队列骨架已证明 rich queued turn 与第二个 plain queued turn 按 FIFO `position=0/1` 进入 read model；`inputbar-pending-steer-pop-front-resume` 已接入真实 Electron 骨架，并完成 product-current 细化，覆盖 GUI queued panel 的“立即执行”一键触发 `agentSession/queuedTurn/promote -> agentSession/turn/cancel -> agentSession/thread/resume`、rich backend turnStart、read model second reindex 与 reload hydrate；`EmptyStateComposerPanel` 与 `AgentChatWorkspace` 两条 text/path-only fallback 已删除并加 source guard，且 production source guard 已证明 UI restore draft 只能由 `EmptyState` 与 `Inputbar/useInputbarController` 写回；stop restore 的 `getSessionReadModel` optional runtime fallback 已删除并加 current guard；stop restore queued draft、explicit remove/promote queued turn、submit failure 与 terminal completion/failure/cancel 分支都不再手动裁剪本地队列；`queue_*` current event projection 只过滤 id、不重排 position，两个 Hook 的 queued turn upsert/remove 已收敛到 `agentQueuedTurnProjection` current helper；旧 `removeQueuedTurnState` 本地状态命名已改为 `removeQueuedTurnsFromProjection` 并封 production hook 回流；Agent UI 标准 `queue_added` 与 team live runtime 摘要已按 App Server `queued_turn.position + 1` 推导 `queuedTurnCount`，projection 旁路只允许产出 timeline/task capsule、live summary 或 read model refresh，不允许写 queuedTurns / input restore / 本地重排，UI 恢复和队列状态只保留 `EmptyState` / `Inputbar` current owner、`queue_*` current event projection 与 current read model。
- [x] W2 input restore policy owner 已拆出巨型 flow control：`resolveInterruptedInputRestorePlan` / `resolveQueuedTurnsForRestore` 现在由 `agentStreamInputRestorePlan.ts` 承接，read model queue 解析由 `agentStreamReadModelParsing.ts` 承接；`agentStreamFlowControl.ts` 只做 stop/remove/promote 编排并降到 639 行，source guard 防止 rich queued draft 解析、restore sort 和 policy export 回流。
- [x] W2 package-side queue projection guard 补齐：`agentStreamFlowControl.currentGuard.test.ts` 现在把 `packages/agent-runtime-projection/src/queueEvents.ts` 纳入旁路扫描，禁止标准事件 package 回流 queuedTurns 写入、input restore owner、本地 reindex 或本地 sort。
- [x] W2 input restore request 清单固化：`AgentChatWorkspace.inputRestoreGuard.test.ts` 增加 production source 白名单，`inputRestoreRequest` / `InterruptedInputRestoreRequest` 只能停留在 source / flow owner、父级 request holder、pass-through scene/runtime/props/types，以及 `EmptyState` / `Inputbar` current UI owner。
- [x] W2 聚合 current fixture gate 已恢复：Aster reply backend source adapter lifetime 修复后，`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`npm run smoke:agent-runtime-current-fixture` 完整通过并覆盖 pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP、media、Expert Skills 与 Content Factory Article Editor，`liveProviderUsed=false`；该证据不把 W2 改口为完成态。
- [x] `running-status-preserved` 已推进到 `covered-electron`：projection guard 覆盖首字前启动态、首字后正文仍 running、completed/stale runtimeStatus 不丢 reasoning/tool/text；DOM guard 保留 inline running indicator 且禁止 startup note 回流；Electron current `cancel` / `cancel-then-continue` fixture 证明 stop 前同一 turn 的 scoped text 同时包含 assistant 正文和“正在输出”，且 startup note 不可见；stop helper 已要求 `requireVisibleOutput`，避免首字前 loading 被误作 running-status 证据。
- [x] `no-natural-language-lifecycle-regex` 已推进到 `partial+guard`：核心 Claw 投影 owner 已有扫描守卫，禁止展示文案、正文正则、动态 regex 和旧 duplicate helper 回流；剩余细节是扩大扫描面并删除旧 helper。
- [x] `mcp-structured-content` 追加 current item / converter / display guard：`structuredContent` 从 stream / read model tool item 贯穿到 `toolCall.result`，GUI 显示 answer + reference id，transport envelope 不外露；MCP Electron fixture 和聚合 current fixture 均通过。

### S2：现有 Electron fixture 补 projection oracle

状态：pending

优先场景：

| scenarioId                        | 现状               | 目标                                                                                                              |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `cancel-then-continue`            | `covered-electron` | 补 stale terminal / active stream projection oracle                                                               |
| `plan-parser-boundary`            | `partial+guard`    | 补 Plan rail / decision drawer / history hydrate DOM + Electron oracle，并封住 legacy `update_plan` UI owner 回流 |
| `mcp-structured-content`          | `covered-electron` | 补 structuredContent precedence / truncation / envelope hiding projection oracle                                  |
| `skills-runtime-search-read-gate` | `covered-electron` | 补 search/read/gate/invoke item-level oracle                                                                      |
| `multi-agent-resume-lineage`      | `covered-electron` | 补 parent/child Thread/Turn/Item lineage oracle                                                                   |
| `image-generation-item`           | `covered-electron` | 补 ImageGeneration item taxonomy oracle                                                                           |
| `web-search-item-sequence`        | `covered-electron` | 补 WebSearch / WebFetch / final text sequence oracle                                                              |

退出条件：

- 已有 Electron scenarios 不再只靠 GUI 文案和 backend ledger 证明。
- 每个 covered-electron 场景都有 event item 和 projection oracle。
- `npm run smoke:agent-runtime-current-fixture` 仍覆盖这些场景。

### S3：P1 Runtime capability gaps

状态：pending

优先场景：

| scenarioId                  | Codex 对齐点                          | 目标                                                            |
| --------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `mcp-resource-read`         | `mcp_resource.rs`                     | resource/template read 成为 read model item / evidence          |
| `mcp-elicitation-resume`    | `mcp_server_elicitation.rs`           | form/OpenAI form request/resolution 绑定 thread/turn/capability |
| `mcp-inventory-status`      | `mcp_server_status.rs`                | raw/sanitized/collision/auth-only 状态稳定                      |
| `selected-capability-stack` | `selected_capability_stack.rs`        | availability/resume 进入 request metadata / runtime item        |
| `multi-agent-tool-schema`   | `multi_agents_spec_tests.rs`          | Team schema 与 UI 展示同源，legacy field fail closed            |
| `command-execution-item`    | `command_exec.rs` / `process_exec.rs` | command/process lifecycle live + hydrate 同构                   |
| `apply-patch-filechange`    | `apply_patch_tests.rs`                | patch diff / approval / failure 共用 FileChange item            |

退出条件：

- MCP / Skills / Multi-Agent 不再靠裸 tool name、全局 registry、文本摘要或 mock success 证明。
- command / patch / approval 进入统一 item taxonomy。
- 对应旧实现状态从 `deprecated` 推进到 `dead` 或 retired guard-only。

### S4：History / compaction / visual snapshot gaps

状态：pending

优先场景：

| scenarioId                     | 目标                                               |
| ------------------------------ | -------------------------------------------------- |
| `thread-read-page-isomorphic`  | read/list/resume/page/items view 同构              |
| `thread-resume-running-stream` | running thread resume 继续绑定 active stream       |
| `thread-fork-lineage`          | parent/child lineage 进入 sidebar/history/evidence |
| `thread-rollback-projection`   | rollback marker 与 read model replay 同步          |
| `context-compaction-item`      | compaction item 不 rewrite old items               |
| `markdown-render-snapshot`     | markdown/code/table/file link/CJK snapshot         |
| `diff-artifact-snapshot`       | add/delete/update/rename/multi-file diff snapshot  |
| `electron-resize-reflow`       | MessageList/Inputbar/right surface resize anchor   |

退出条件：

- history hydrate 与 live stream 同构有 fixture replay 证明。
- visual snapshot 不再只靠 `pageText.includes`。
- 可以开始拆 Claw 巨型文件和删除重复 projection。

### S5：删除旧路与拆大文件

状态：pending

删除准入：

1. `scenario-ledger.md` 对应场景已至少 `partial`，高风险场景已三层齐备。
2. guard 已阻止旧路回流。
3. 定向测试和必要 Electron fixture 通过。
4. 删除对象已分类为 `dead`，或 `deprecated` 且退出条件满足。

优先清理：

- 自然语言 lifecycle regex。
- startup note / timeout 合成首字。
- 无 turnId terminal fallback。
- legacy `update_plan` UI owner。
- overlay 全局 final answer 缓冲。
- timeline 二次重建完整过程流。
- 多套 input restore fallback，包括仍绕过 current read model / normalizer / `EmptyState` / `Inputbar` owner 的 queue / steer / draft 并行状态；已收掉 stop restore queued draft、explicit remove/promote、submit failure、terminal side-effect 本地队列裁剪、queue event 本地 position 重排、Hook 内联 queued turn projection helper、旧本地队列删除命名和非 current UI restore owner。
- MCP naked tool/mock fallback。
- expert skillRefs 直连。
- agent-first orphan history。

## 5. 验证矩阵

### 文档 / 计划

```bash
git diff --check -- ".gitignore" "internal/roadmap/test/README.md" "internal/roadmap/test/clawstream/README.md" "internal/roadmap/test/clawstream/codex-derived-index.md" "internal/roadmap/test/clawstream/scenario-ledger.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md"
rg -n "[ \t]+$" ".gitignore" "internal/roadmap/test/README.md" "internal/roadmap/test/clawstream/README.md" "internal/roadmap/test/clawstream/codex-derived-index.md" "internal/roadmap/test/clawstream/scenario-ledger.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md"
```

### P0 定向

```bash
npm test -- streamingProjectionGuard.unit.test.ts streamingContentPartOrder.unit.test.ts streamingContentPartSegments.unit.test.ts
npm test -- agentStreamRuntimeHandler.unit.test.ts agentStreamCompletionController.test.ts agentStreamUserInputSendPreparation.test.ts
npm test -- MessageList.reasoningFlow.test.tsx MessageList.streamingTurns.test.tsx MessageList.runtimeStatus.test.tsx
```

### Electron fixture

```bash
npm run smoke:agent-runtime-current-fixture
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario cancel-then-continue
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario plan
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario mcp-structured-content
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario inputbar-rich-restore
```

### 高风险 GUI

```bash
npm run verify:gui-smoke
```

## 6. 当前进度日志

### 2026-07-06

- 建立 Clawstream 路线图、Codex-derived index、scenario ledger。
- 从 Codex app-server v2、core session/tool handlers、TUI chatwidget、TUI suite/snapshots 抽出 P0/P1/P2 场景账本。
- 新增本推进计划，后续实现必须按 `scenario-ledger.md` 更新状态。
- 文档级检查通过：`git diff --check -- ".gitignore" "internal/roadmap/test/README.md" "internal/roadmap/test/clawstream/README.md" "internal/roadmap/test/clawstream/codex-derived-index.md" "internal/roadmap/test/clawstream/scenario-ledger.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md"`；尾随空白扫描无命中。
- 新增 `packages/agent-runtime-projection/tests/clawstreamP0.test.mjs`，把 `startup-prewarm-first-output`、`reasoning-first-visible`、`terminal-contract-after-answer` 推进到 projection 层护栏。
- 扩展 `streamingProjectionGuard.unit.test.ts`，禁止核心投影文件重新引入“启动处理流程 / 已接收请求”启动说明文案。
- 定向验证通过：`npm --prefix "packages/agent-ui-contracts" run build && npm --prefix "packages/agent-runtime-projection" run build && node --test "packages/agent-runtime-projection/tests/clawstreamP0.test.mjs"`；`npx vitest run "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"`。
- 当前仍未实现 DOM / Electron fixture 层，也未删除旧 runtime/UI 实现。
- 按最新准则补充 Codex-first 执行原则：除多模型 / 多模态 provider capability、media part、模型能力矩阵和 provider lowering 参考 opencode 外，Clawstream 命名、架构、状态机、工具生命周期和测试护栏都回到 Codex。
- W1 parser/projection oracle 继续补齐：`stream-parser-boundary` 与 `plan-parser-boundary` 推进到 `partial+guard`，projection guard 证明 completed full text 不再作为重复 finish tail 追加，且 `<proposed_plan>` 跨 added / delta / completed 边界会 materialize 为独立 `plan` part；结构化 `plan.final` payload 也会投影为 `plan` part。
- W2 第一段落地：`inputbar-restore-matrix` 从 `missing` 推进到 `partial`，`resolveInterruptedInputRestorePlan` 成为输入恢复判定 pure owner；`agentStreamInputRestorePolicy.unit.test.ts` 覆盖 output-free、visible-output、thinking-only、patch-active、queued steer/manual interrupt；`stopActiveAgentStream` 不再本地清空 queued turns。
- W2 追加聚合验证通过：`npm run smoke:agent-runtime-current-fixture` 覆盖 `cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel 与 Content Factory Article Editor，`liveProviderUsed=false`。
- W2 rich restore 接线落地：`submittedDraft` 随 active stream 保存，`stopActiveAgentStream` 只在 output-free / thinking-only 中断时请求恢复；`Inputbar` 恢复 text、images、pathReferences 与 installed skill route，且不把纯空白输入恢复成 whitespace；定向验证通过 `npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx"`。
- 聚合 current fixture guard 同步加严：Expert Panel scenario 不再把空会话壳误判为目标 session，侧栏打开必须匹配 inputbar `data-session-id`；单场景 `expert-panel-skills-runtime` 和完整 `npm run smoke:agent-runtime-current-fixture` 均通过，完整聚合覆盖 Content Factory Article Editor，`liveProviderUsed=false`。
- W4 落地：`messageListItemProjection.unit.test.ts`、`MessageList.runtimeStatus.test.tsx`、`MessageList.streamingTurns.test.tsx` 覆盖输出中 running status preserved、terminal 后只清运行态、startup note 不回流。
- MCP structuredContent current fixture 缺口已修复：`agentStreamThreadItemController.test.ts`、`agentStreamToolItemMessageSync.unit.test.ts`、`components/timeline-utils/itemConverters.unit.test.ts` 与 `ToolCallDisplay.test.tsx` 覆盖 structuredContent answer/reference id 的 item -> toolCall -> GUI 链路。
- 定向验证通过：`npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`。
- GUI / current fixture 验证通过：`npm run build:renderer:electron`；`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture`，完整覆盖 `cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。

### 2026-07-08

- W2 Expert Panel follow-up provider/model 回流修复：`expert-panel-skills-runtime` 的失败根因是新 session 创建后没有把当前 workspace provider/model preference 同步到 session refs，follow-up turn 因此回落到全局默认 `lime-hub/gpt-5.2-pro`。`createFreshSession` 已按 current workspace preferences 初始化新 session，并只在 provider/model 均非空时标记 synced，避免空偏好污染 workspace。验证通过：单场景 `expert-panel-skills-runtime`、完整 `npm run smoke:agent-runtime-current-fixture` 与相关定向 Vitest 均通过，完整聚合覆盖 history/cache hydration、Coding Workbench、图片命令、`cancel-then-continue`、Inputbar rich restore、pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。该证据只恢复 current fixture gate，不把 W2 改口为完成态。
- W3 legacy terminal 注入 owner 与 current smoke 收口：App Server 原始事件 normalizer 已直接 fail closed `done / final_done / cancelled / turn.done / turn.final_done / turn.cancelled`，代码产物工作台 Electron fixture 与 standalone App Server external backend smoke 都改为只使用 current `turn.completed`，live web-tool evidence terminal detector 只认 `turn.completed`；合同守卫禁止这两条 current smoke 回流 `turn.final_done`。验证通过：相关 7 个 Vitest 文件 142 tests passed、`npm run test:contracts`、`npm run smoke:app-server-external-backend`，真实 sidecar evidence events 包含 `turn.completed`。剩余 `final_done` 字符串只允许停留在负向 schema / test-only guard、legacy fail-closed detector 和 live runner 的超时 grace 观测参数中，不再作为 product current 完成态证据。
- W3 terminal legacy surface 第一刀收口：Claw GUI 完成计划命名从旧 `FinalDone` 改成 `TerminalCompletion`，current `turn_completed` 是唯一成功收尾入口；fixture event summary 只把 `turn.completed / turn.failed / turn.canceled` 计为 current terminal，不再把 `turn.final_done` 或 `turn.done / turn.cancelled` 算作 terminal 证据。legacy `turn.final_done` 仍保留在 App Server event projection 的 fail-closed detector 和负向测试里，分类为 `compat / test-only`，用于证明它不关闭 current 路由、不投递 GUI。
- W3 仍不标 complete：本轮已补 App Server normalizer 注入 owner 负向矩阵，并迁掉两条 current smoke 的 `turn.final_done` 依赖；下一刀继续清点剩余 terminal 残留，确保除负向 schema / test-only guard / live runner timeout grace 外没有 product current 入口，并补跑代码产物 Electron fixture 作为 GUI 侧 current `turn.completed` 证据。

### 2026-07-07

- 按“先快速完成骨架，再回头完成细节”收口 `scenario-registry.json`：8 个 execution batch 均补齐 `evidenceGate`、全量 `detailOrder` 和 batch 级 `verificationCommands`，后续 P0/P1/P2 细节必须按 registry 顺序推进。
- 加严 `scenario-registry.test.mjs`：除 registry / ledger 同步与 batch 覆盖外，新增 detail order 全量覆盖、无重复、验证命令非空、禁止 `agent_runtime_` 旧命名回流的结构守卫。
- 继续把“骨架完成”机械化：`scenario-registry.json` 新增 `skeletonDefinition` 与 `governanceClassification`，`scenario-registry.test.mjs` 解析 `scenario-ledger.md` 六列表格，强制每个 scenario 都有 Codex 来源、标准事件项、Projection / GUI oracle、清理目标和同步状态，避免后续只登记场景名却没有验收口径。
- `no-natural-language-lifecycle-regex` 从 `guard-needed` 推进到 `partial+guard`：`streamingProjectionGuard.unit.test.ts` 已作为核心投影 owner 的回流守卫；`running-status-preserved` 追加 Electron current `cancel` fixture 证据并推进到 `covered-electron`；registry 状态统计同步更新为 `covered-electron=10 / partial+guard=6 / partial=7 / missing=36 / guard-needed=0`。
- `reasoning-first-visible` 追加 Electron current `reasoning-first-visible` fixture 证据并推进到 `covered-electron`：`npm run smoke:claw-chat-current-fixture -- --scenario reasoning-first-visible --timeout-ms 240000` 通过，session=`claw-chat-current-1783403517680-48086`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`；中间态 `hasFinalText=false / hasDoneText=false / startupNoteVisible=false`，完成态 `reasoningIndex=38 < finalAnswerIndex=63`，read model `reasoningSequence=1 < finalSequence=9`。registry 状态统计更新为 `covered-electron=11 / partial+guard=5 / partial=7 / missing=36 / guard-needed=0`。
- `terminal-contract-after-answer` 从 `partial` 推进到 `partial+guard`：新增 hook/runtime guard，证明 `turn_failed` 在已有 partial answer 时保留过程卡、partial answer 只出现一次、失败说明只出现一次；同时修正 `turn_failed` toast 使用真实 runtime error presentation，不再误报“模型未输出最终答复”。`stale-terminal-does-not-stop-new-turn` 同步按已有 pure guard / handler oracle 校正到 `partial+guard`。registry 状态统计更新为 `covered-electron=11 / partial+guard=7 / partial=5 / missing=36 / guard-needed=0`。
- `stale-terminal-does-not-stop-new-turn` 追加 Electron current `terminal-stale-guard` 骨架：第一轮和第二轮都经 GUI 输入、App Server current read model 完成，第二轮 backend ledger 记录旧 terminal marker，GUI 断言 stale done marker 不可见且第二轮完成态恢复输入框。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-stale-guard --timeout-ms 240000`，session=`claw-chat-current-1783406820348-36412`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。registry 状态统计更新为 `covered-electron=12 / partial+guard=6 / partial=5 / missing=36 / guard-needed=0`；真实旧 terminal event 注入 owner 投影仍留作细节补强。
- `terminal-contract-after-answer` 追加 Electron current `terminal-failed-after-answer` 骨架：后端先发 `message.delta` partial，再发 `turn.failed`，GUI 证明 partial 与 failure marker 各只出现一次、输入框恢复且 stop 隐藏，read model 证明 `latestTurnStatus=failed` 并保留 prompt / partial / failure，backend ledger 记录 `turn.failed`。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-failed-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783408449429-62469`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。registry 状态统计更新为 `covered-electron=13 / partial+guard=5 / partial=5 / missing=36 / guard-needed=0`。
- `terminal-contract-after-answer` 追加 Electron current `terminal-canceled-after-answer` 骨架：后端先发 `message.delta` partial 并等待 GUI stop，`turnCancel` 走 current `turn.canceled`；GUI 证明 stop 前 partial 与“正在输出”同屏且启动说明不出现，取消后 partial 保留且只出现一次、输入框恢复、stop 隐藏，read model 证明 `latestTurnStatus=canceled` 并保留 prompt / partial，backend ledger 记录 `turn.canceled`。验证通过：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario terminal-canceled-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783417713111-42454`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`；未设 `LIME_ELECTRON_FIXTURE_BUILD_READY` 的首次运行在 packaged renderer/assets build 阶段以 `143/SIGTERM` 退出，未进入场景执行。registry 状态统计保持 `covered-electron=13 / partial+guard=5 / partial=5 / missing=36 / guard-needed=0`；`final_done` grace timer 删除留作真实旧 terminal owner 投影细节之后。
- fixture 结构债继续收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-after-answer.mjs`，把 `terminal-failed-after-answer` 与 `terminal-canceled-after-answer` 的 GUI / read model / backend ledger flow 从中心 `claw-chat-current-fixture-scenario-flow.mjs` 拆出；中心 flow 从 `1671` 行降到 `1530` 行，新增模块 `208` 行。随后新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-stale-guard.mjs`，把 `terminal-stale-guard` 双回合 GUI / read model / backend ledger flow 拆出；再新增 `scripts/agent-runtime/claw-chat-current-fixture-web-tools-rendering.mjs`，把 reasoning/tool/text 时序 fixture 的 GUI 中间态、失败 probe 和 read model 汇总拆出；最后新增 `scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-flow.mjs`，把 Skills Runtime / Expert Skills Runtime / Expert Plaza / Expert Panel 的长流程拆出。中心 flow 已降到 `810` 行，新模块分别为 `208` / `136` / `172` / `586` 行；结构守卫已把四个模块纳入 source 聚合。下一步继续拆 backend-file / scenario-assertions / smoke test 的长段落，然后再回到真实旧 terminal owner 投影和 `final_done` grace timer 删除。
- 模块拆分后验证通过：`node --check` 覆盖 `claw-chat-current-fixture-scenario-flow.mjs` 与四个新 scenario module；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）；真实 Electron devserver smoke 通过 `skills-runtime`、`web-tools-rendering`、`terminal-stale-guard`，sessions 分别为 `claw-chat-current-1783420240239-58404`、`claw-chat-current-1783420289456-67638`、`claw-chat-current-1783420326278-71150`。
- assertion 结构债继续收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-assertions.mjs` 与 `scripts/agent-runtime/claw-chat-current-fixture-web-tools-assertions.mjs`，把 terminal failed/canceled/stale 与 reasoning/tool/text 时序断言从中心 `claw-chat-current-fixture-scenario-assertions.mjs` 拆出；中心断言文件从 `1849` 行降到 `1566` 行。验证通过：`node --check` 覆盖两个新 assertion module 与中心断言文件；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- assertion 结构债第二轮收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-assertions.mjs`，把 Skills Runtime / Expert Skills / Expert Plaza / Expert Panel 断言从中心文件拆出；新增 `scripts/agent-runtime/claw-chat-current-fixture-runtime-surface-assertions.mjs`，把 reasoning-first、MCP structured content、media reference 与 Multi-Agent Team runtime surface 断言拆出；`claw-chat-current-fixture-smoke.test.mjs` 的 source guard 已纳入两个新模块。
- 代码体量登记：`claw-chat-current-fixture-scenario-flow.mjs` 已从 `1671` 行降到 `810` 行，退出 `1000` 行硬风险；`claw-chat-current-fixture-scenario-assertions.mjs` 已从 `1849` 行降到 `944` 行，退出 `1000` 行硬风险；`claw-chat-current-fixture-smoke.test.mjs` 已从 `2023` 行降到 `855` 行，退出 `1000` 行硬风险；`scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs`（`1786` 行）仍超过 `1000` 行。退出条件是在 fixture 细节回补前，继续把 backend fixture script 渲染从 runtime env / provider server owner 中拆出，避免新场景继续向巨型文件追加。
- assertion 第二轮验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-runtime-surface-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- assertion 第二轮真实 Electron current fixture 验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario skills-runtime --timeout-ms 240000`，session=`claw-chat-current-1783421964581-73521`；`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000`，session=`claw-chat-current-1783421964570-73526`。两条均使用 external fixture backend，不调用正式模型。
- smoke guard 结构债收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-smoke-domain-guards.mjs`，承接 Image Command / Content Factory Article Workspace / Multi-Agent Team 结构守卫；新增 `scripts/agent-runtime/claw-chat-current-fixture-smoke-skills-runtime-guards.mjs`，承接 Skills Runtime / Expert Skills / Expert Plaza / Expert Panel 结构守卫与 evidence summarizer 单测。两个 helper 只由 `claw-chat-current-fixture-smoke.test.mjs` 注册执行，不加入 `readSmokeScript()` source 聚合，避免测试 helper 字符串污染 current fixture 负向断言。
- smoke guard 拆分验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke-domain-guards.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke-skills-runtime-guards.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）。
- backend fixture 结构债收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs` 承接 `writeFixtureBackend` 与主 backend script 模板；新增 `scripts/agent-runtime/claw-chat-current-fixture-backend-tool-skill-events.mjs` 承接 Web tools / MCP structuredContent / Skills Runtime / Expert / Multi-Agent tool event fragment；`claw-chat-current-fixture-backend-file.mjs` 从 `1786` 行降到 `545` 行，新增模块为 `761` / `518` 行，三者均低于 `1000` 行硬风险。
- 拆分后修复 MCP structuredContent live GUI 回归：`tool.result.payload.result` 必须是完整 ToolExecutionResult，不能只放 `structuredContent`；否则前端 `appServerEventStream` 会以 nested `result` 为 source，丢失 `success/output/metadata`，GUI 只显示工具已完成而不显示 structured answer / reference id。本轮补齐 nested `result.success/output/metadata/structuredContent`，并在 smoke guard 中要求 MCP nested result 保持完整形状。
- backend 拆分与 MCP 修复验证通过：`node --check` 覆盖 `claw-chat-current-fixture-backend-file.mjs`、`claw-chat-current-fixture-backend-script.mjs`、`claw-chat-current-fixture-backend-tool-skill-events.mjs`、`claw-chat-current-fixture-smoke.test.mjs`；临时生成 backend script 后 `node --check` 通过，手动 turnStart stdout 已确认 MCP `tool.result` 带完整 nested result；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts"`（12 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`（55 tests passed）。
- backend 拆分后的真实 Electron current fixture 验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000`，session=`claw-chat-current-1783424714794-33605`；`npm run smoke:claw-chat-current-fixture -- --scenario skills-runtime --timeout-ms 240000`，session=`claw-chat-current-1783425064534-56136`。两条均使用 external fixture backend，不调用正式模型。观察到 packaged renderer 每次强制重建分别约 `4m48s` / `4m44s`，这是当前 fixture 执行慢的主要来源；下一刀应把 build reuse / `LIME_ELECTRON_FIXTURE_BUILD_READY` 口径纳入 current fixture 骨架加速，而不是把耗时误判成模型首字慢。
- Electron fixture build reuse 骨架落地：`scripts/lib/electron-fixture-build.mjs` 不再在单场景 smoke 中无条件重建；现在先检查 `dist/index.html`、Electron main/preload、App Server release manifest 与 packaged app-server binary，若这些产物新于 `src` / `electron` / `public` / `packages/app-server-client/src` / `lime-rs/crates` 及相关构建配置则复用，否则按 `stale-source` fail-closed 重建。聚合入口仍先准备一次构建并向子场景透传 `LIME_ELECTRON_FIXTURE_BUILD_READY=1`。当前脏工作树若有源码新于现有 dist，会继续正确判定 `stale-source` 并默认重建一次；受控复用验证 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000` 通过，session=`claw-chat-current-1783426222579-25809`，约 `16s` 完成且未进入 packaged build 阶段。
- W2 rich restore Electron current fixture 收口：Inputbar 取消恢复已覆盖 text、image attachment、path reference 与 installed skill route；fixture 断言绑定本场景 `turnStart.sessionId / turnId`，不再裸比动态 `SESSION_ID` 常量。
- Gate B 验证通过：`APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" npm run smoke:claw-chat-current-fixture -- --scenario inputbar-rich-restore --timeout-ms 180000`，session=`claw-chat-current-1783381197658-93694`。
- 结构守卫与卫生检查通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（27 tests passed）；`git diff --check`。
- W2 pending steer rich snapshot guard 落地：App Server queued read model 从 current `turn_inputs + turn_runtime_options.metadata` 投影 `attachments / pathReferences / textElements / inputCapabilityRoute`；前端 `queuedTurn` normalizer 与 restore policy 保留这些字段，发送准备会把 input restore draft 的 path references、text elements 和 skill route 写入 current turn metadata。
- 定向验证通过：`npx vitest run "src/lib/api/queuedTurn.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_projects_queued_turn_input_snapshot -- --nocapture`。
- 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，覆盖 Inputbar rich restore、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。
- W2 pending steer rich restore devserver Electron Gate B 收口：`inputbarPendingSteerQueuedRichTextPreserved` 按结构化 `textElementTexts` 验证用户可编辑正文，允许 queued raw `text` 保留 slash command 前缀；验证通过 `node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`、`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（28 tests passed）、`npm run smoke:claw-chat-current-fixture -- --app-url "http://127.0.0.1:1420/" --scenario inputbar-pending-steer-rich-restore --prefix claw-chat-current-fixture-inputbar-pending-steer-rich-restore-devserver-text-element-assertion --timeout-ms 180000`，session=`claw-chat-current-1783389967237-36808`。
- W2 pending steer fixture 骨架补齐 packaged 证据：`inputbar-pending-steer-rich-restore` 语义收敛为 queued rich turn restore，而不是 active turn cancel；验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-rich-restore --prefix claw-chat-current-fixture-inputbar-pending-steer-rich-restore-packaged-current --timeout-ms 300000`，session=`claw-chat-current-1783428460310-22335`。
- W2 pending steer 多队列 Electron 骨架落地：新增 `inputbar-pending-steer-multi-queue`，在 active streaming 期间先 defer rich draft，再 defer 第二条 plain steer，read model 证明 queued rich / second plain turn 的 FIFO `position=0/1`、`promptOrder=["rich","second"]`，且 rich turn 未提前发到 backend。修复 external backend fixture 对该场景的 active turn 长流式保持，并将该场景从通用 completed 新闻正文等待中排除。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-multi-queue --prefix claw-chat-current-fixture-inputbar-pending-steer-multi-queue-packaged-current --timeout-ms 240000`，session=`claw-chat-current-1783429458391-18636`。
- W2 pending steer pop-front / hydrate 骨架接入并补齐 packaged 证据：新增 `inputbar-pending-steer-pop-front-resume`，沿 `active streaming -> rich/second defer -> GUI queued panel promote -> App Server current cancel active -> agentSession/thread/resume -> rich backend turnStart -> second queue position=0 -> renderer reload hydrate` 验证真实 pop-front 顺序。公共 `guiNotStuckStreaming` 对该场景改为验证 hydrate 后 active/rich 输出仍可见、second queue 为 `position=0` 且输入框可用；`stopButtonVisible=true` 在这里是预期“正在输出”状态，不再按普通完成态误判 stuck。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-pop-front-resume --prefix claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-packaged-current --timeout-ms 300000`，session=`claw-chat-current-1783433643324-49596`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-packaged-current-summary.json`。
- W2 pending steer GUI 产品闭环完成：`QueuedTurnsPanel` 的“立即执行”不再靠 fixture 代发 cancel/resume，而是从产品路径串联 `promoteQueuedTurn -> interruptTurn -> resumeThread -> refreshSessionReadModel`；read model active turn 解析不再把 queued turn 当成 interrupt target，queued panel 缺 current handler 时 fail closed。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-pop-front-resume --prefix claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-product-current --timeout-ms 300000`，session=`claw-chat-current-1783437285396-26073`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-product-current-summary.json`；summary 中 `appServerRequestMethods` 包含 `agentSession/queuedTurn/promote`、`agentSession/turn/cancel`、`agentSession/thread/resume`，rich backend turnStart 保留 image/file reference，second queue reload hydrate 为 `position=0` 且“正在输出”状态保留。
- W2 pending steer fixture 拆分完成：`claw-chat-current-fixture-inputbar-pending-steer.mjs` 从 1050 行降为 348 行 scenario facade，GUI DOM / queued panel 操作移到 `claw-chat-current-fixture-pending-steer-gui-actions.mjs`，queued read-model 投影与 wait 移到 `claw-chat-current-fixture-pending-steer-read-model.mjs`；source guard 已纳入新模块。验证通过 `node --check` 三个 pending-steer 模块、`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs" "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（51 tests passed）、`npm run governance:scripts`、`jq empty "internal/roadmap/test/clawstream/scenario-registry.json"`、`git diff --check`。
- W2 旧 input restore fallback 第一刀删除：`EmptyStateComposerPanel` 不再接收 `inputRestoreRequest`，删掉只恢复 `draft.text` 的子面板 fallback；首页 current owner 固定为父 `EmptyState`，inline 输入框 current owner 固定为 `Inputbar/useInputbarController`。新增 `EmptyState.test.tsx` 回归证明首页中断恢复会完整恢复 text、image、path reference 与 installed skill route，并在发送时带 `inputRestoreDraft`；`EmptyStateComposerPanel.inputFlow.test.tsx` 增加 source guard，禁止子面板重新声明 `inputRestoreRequest` 或 `InterruptedInputRestoreRequest`。验证通过 `npx vitest run "src/components/agent/chat/components/EmptyState.test.tsx"`；`npx vitest run "src/components/agent/chat/components/EmptyStateComposerPanel.inputFlow.test.tsx" "src/components/agent/chat/components/EmptyState.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts"`（212 tests passed）。
- W2 旧 input restore fallback 第二刀删除：`AgentChatWorkspace` 不再在收到 `inputRestoreRequest` 时执行 text/path-only 预恢复；父级只转发 request，完整恢复继续由 `EmptyState` / `Inputbar/useInputbarController` current owner 执行。新增 `AgentChatWorkspace.inputRestoreGuard.test.ts` source guard，禁止父级重新写入 `setInput(request.draft.text)`、`handleClearPathReferences()`、`handleAddPathReferences`、`replacePendingImages` 或 `setActiveCapability`。
- W4 fixture 时序护栏补强：`cancel` / `cancel-then-continue` stop helper 必须 `requireVisibleOutput`，停止前先等同一 turn 的 assistant 正文与 running status 同屏。验证通过 `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`、`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario cancel-then-continue --prefix claw-chat-current-fixture-cancel-then-continue-require-visible-output --timeout-ms 300000`、`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture`，`liveProviderUsed=false`。

## 7. 下一刀

下一刀只做 S1 的第一批，不穿插大规模清理；具体领取口径见 `internal/exec-plans/clawstream-s1-p0-implementation-plan.md`：

1. 继续补 input restore fallback inventory：`EmptyStateComposerPanel` text-only fallback 与 `AgentChatWorkspace` 父级 text/path-only 预恢复 fallback 已删且 source guard 已封住；queue projection 旁路已限定为 timeline/task capsule、live summary 与 read model refresh，后续只保留 current read model / normalizer / `resolveInterruptedInputRestorePlan` / 父 `EmptyState` / inline `Inputbar` / product queued panel 主链。
2. 给 stale terminal 补真实旧 terminal event 注入 owner 投影细节，然后再删除无 turnId terminal fallback。
3. 补 Plan rail / decision drawer / history hydrate 的 DOM 或 Electron oracle，证明 proposed_plan 与结构化 plan event 不回退到 legacy `update_plan` UI owner。
4. S2 接续已有 Electron 场景的 item/projection oracle：优先 MCP truncation / resource / elicitation、Skills search-read-gate、Multi-Agent lineage。
