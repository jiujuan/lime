# Clawstream Codex-derived Guardrail 推进计划

> 状态：active
> 创建时间：2026-07-06
> 关联路线图：`internal/roadmap/test/clawstream/README.md`
> 关联账本：`internal/roadmap/test/clawstream/scenario-ledger.md`
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

本计划不再停留在“列出需要覆盖的能力”。每一批推进都必须让 `scenario-ledger.md` 中的场景状态前进，并为后续删除 Claw 旧 helper、旧 fallback、旧 mock / compat 旁路提供准入证据。

## 2. Current / Compat / Deprecated / Dead

| 分类 | 对象 | 处理 |
| --- | --- | --- |
| `current` | `RuntimeEvent -> Thread / Turn / Item -> Projection / ReadModel / ContentPart -> GUI / Electron fixture` | 继续演进，所有新测试和重构都落这里 |
| `compat` | 无 `itemId / phase / sequence` 的历史 text delta、历史 `Message.content` hydrate 兜底 | 只允许 fail-closed 历史兜底，不作为新场景通过证据 |
| `deprecated` | timeline 二次重建完整过程流、overlay 全局助手文本缓冲、旧 Plan/update_plan UI owner、多套 input restore fallback | 对应 guard 成立后删除 |
| `dead` | 生产 mock fallback、`agent_runtime_*` 生产 surface、旧 Tauri wrapper、自然语言 lifecycle regex、无 turnId terminal fallback | 删除或 retired guard-only |

## 3. 执行原则

1. Codex-first 是默认执行准则；除多模型 / 多模态 provider capability、media part、模型能力矩阵和 provider lowering 参考 opencode 外，命名、架构、状态机、工具生命周期、MCP、Skills、Multi-Agent、Plan hydrate、history hydrate、projection 和测试护栏都按 Codex 对齐。
2. 先补护栏，再删旧实现；没有对应 scenario ledger 行的旧实现不动刀。
3. 每个场景至少推进两层证据；用户主路径、history hydrate、MCP、Skills、Multi-Agent、artifact 必须三层齐备。
4. P0 先解决首字慢、reasoning 顺序、terminal 收尾、输入恢复；这些直接影响当前 Claw 可用性。
5. 现有 Electron fixture 不能当作完成态；已有 fixture 的场景还要补 item/projection oracle。
6. 不新增 parallel legacy path；新增能力默认走 App Server JSON-RPC current 主链和前端 projection。
7. 验证以当前风险为上限，先定向 `unit/projection/component`，再跑对应 Electron fixture 和聚合 smoke。

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
- [x] 本计划落地并被 Clawstream README 反链。
- [x] 文档 diff 基础检查通过。

### S1：P0 Event / Item fixture skeleton

状态：in_progress

执行细节见 `internal/exec-plans/clawstream-s1-p0-implementation-plan.md`。S1 不做泛化清理，只推进 parser boundary、inputbar restore、stale terminal 和 running status 四个 P0 工作包；每个工作包完成后回写 `scenario-ledger.md`。

优先场景：

| scenarioId | 目标状态 | 最小实现落点 |
| --- | --- | --- |
| `startup-prewarm-first-output` | `missing -> partial` | fixture schema + projection unit，断言 startup/prewarm 不阻塞首个 reasoning/text |
| `reasoning-first-visible` | `partial -> partial+guard` | reasoning item oracle + MessageList/StreamingRenderer DOM 回归 |
| `stream-parser-boundary` | `missing -> partial` | added/delta/completed parser boundary fixture |
| `terminal-contract-after-answer` | `partial -> partial+guard` | terminal event controller / completion controller 单测 |
| `inputbar-restore-matrix` | `missing -> partial+guard` | inputbar restore pure reducer / hook unit matrix + Inputbar rich restore component guard |

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

- [x] `startup-prewarm-first-output` 已推进到 projection 层 `partial`：`clawstreamP0.test.mjs` 证明 startup/prewarm 状态不会进入 visible messages，首个 reasoning/text 可见。
- [x] `reasoning-first-visible` 已补 projection 层命名 oracle：同一测试证明 reasoning 先于 text 成为 UI message part。
- [x] `terminal-contract-after-answer` 已补 projection 层命名 oracle：同一测试证明 `turn.completed` 只更新 runtime status，不合成正文；无 assistant text 时 fail closed。
- [x] guard 已禁止核心投影文件重新引入“启动处理流程 / 已接收请求”启动说明文案。
- [x] `stream-parser-boundary` 已推进到 projection 层 `partial+guard`：message seed/delta/completed full text 只保留一个 final text part，不把 completed 全量正文追加成重复 finish tail；`<proposed_plan>` 跨 message added / delta / completed 边界会 materialize 为独立 `plan` part。
- [x] `plan-parser-boundary` 已推进到 projection 层 `partial+guard`：结构化 `plan.delta/final` 与 proposed_plan block 都进入 `plan` part；仍缺 Plan rail / decision drawer / history hydrate DOM 与 Electron evidence。
- [x] 无 turnId terminal fallback / stale terminal active-turn oracle 已推进到 hook 层 `partial`：pure guard 对缺失 `terminalTurnId` fail closed，handler 回归证明旧 turn terminal 不误停新 active stream；Electron fixture 证据仍留到 S2。
- [x] `inputbar-restore-matrix` 已推进到 hook + component 层 `partial+guard`：pure policy 覆盖 output-free / visible-output / thinking-only / patch-active / queued steer，manual stop 不再本地抢先清空 queued turns；rich restore 已接到 active stream stop -> Inputbar restore request，组件 guard 覆盖 text / images / pathReferences / inputCapabilityRoute；Electron current fixture 与 pending steer rich restore 全量证据仍留后续补齐。
- [x] `running-status-preserved` 已推进到 `partial+guard`：projection guard 覆盖首字前启动态、首字后正文仍 running、completed/stale runtimeStatus 不丢 reasoning/tool/text；DOM guard 保留 inline running indicator 且禁止 startup note 回流。
- [x] `mcp-structured-content` 追加 current item / converter / display guard：`structuredContent` 从 stream / read model tool item 贯穿到 `toolCall.result`，GUI 显示 answer + reference id，transport envelope 不外露；MCP Electron fixture 和聚合 current fixture 均通过。

### S2：现有 Electron fixture 补 projection oracle

状态：pending

优先场景：

| scenarioId | 现状 | 目标 |
| --- | --- | --- |
| `cancel-then-continue` | `covered-electron` | 补 stale terminal / active stream projection oracle |
| `plan-parser-boundary` | `partial+guard` | 补 Plan rail / decision drawer / history hydrate DOM + Electron oracle，并封住 legacy `update_plan` UI owner 回流 |
| `mcp-structured-content` | `covered-electron` | 补 structuredContent precedence / truncation / envelope hiding projection oracle |
| `skills-runtime-search-read-gate` | `covered-electron` | 补 search/read/gate/invoke item-level oracle |
| `multi-agent-resume-lineage` | `covered-electron` | 补 parent/child Thread/Turn/Item lineage oracle |
| `image-generation-item` | `covered-electron` | 补 ImageGeneration item taxonomy oracle |
| `web-search-item-sequence` | `covered-electron` | 补 WebSearch / WebFetch / final text sequence oracle |

退出条件：

- 已有 Electron scenarios 不再只靠 GUI 文案和 backend ledger 证明。
- 每个 covered-electron 场景都有 event item 和 projection oracle。
- `npm run smoke:agent-runtime-current-fixture` 仍覆盖这些场景。

### S3：P1 Runtime capability gaps

状态：pending

优先场景：

| scenarioId | Codex 对齐点 | 目标 |
| --- | --- | --- |
| `mcp-resource-read` | `mcp_resource.rs` | resource/template read 成为 read model item / evidence |
| `mcp-elicitation-resume` | `mcp_server_elicitation.rs` | form/OpenAI form request/resolution 绑定 thread/turn/capability |
| `mcp-inventory-status` | `mcp_server_status.rs` | raw/sanitized/collision/auth-only 状态稳定 |
| `selected-capability-stack` | `selected_capability_stack.rs` | availability/resume 进入 request metadata / runtime item |
| `multi-agent-tool-schema` | `multi_agents_spec_tests.rs` | Team schema 与 UI 展示同源，legacy field fail closed |
| `command-execution-item` | `command_exec.rs` / `process_exec.rs` | command/process lifecycle live + hydrate 同构 |
| `apply-patch-filechange` | `apply_patch_tests.rs` | patch diff / approval / failure 共用 FileChange item |

退出条件：

- MCP / Skills / Multi-Agent 不再靠裸 tool name、全局 registry、文本摘要或 mock success 证明。
- command / patch / approval 进入统一 item taxonomy。
- 对应旧实现状态从 `deprecated` 推进到 `dead` 或 retired guard-only。

### S4：History / compaction / visual snapshot gaps

状态：pending

优先场景：

| scenarioId | 目标 |
| --- | --- |
| `thread-read-page-isomorphic` | read/list/resume/page/items view 同构 |
| `thread-resume-running-stream` | running thread resume 继续绑定 active stream |
| `thread-fork-lineage` | parent/child lineage 进入 sidebar/history/evidence |
| `thread-rollback-projection` | rollback marker 与 read model replay 同步 |
| `context-compaction-item` | compaction item 不 rewrite old items |
| `markdown-render-snapshot` | markdown/code/table/file link/CJK snapshot |
| `diff-artifact-snapshot` | add/delete/update/rename/multi-file diff snapshot |
| `electron-resize-reflow` | MessageList/Inputbar/right surface resize anchor |

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
- 多套 input restore fallback。
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

## 7. 下一刀

下一刀只做 S1 的第一批，不穿插大规模清理；具体领取口径见 `internal/exec-plans/clawstream-s1-p0-implementation-plan.md`：

1. 给 W2 rich restore 补 Electron current fixture，并补 pending steer 的 textElements / attachments / skill binding 全量恢复证据。
2. 给 stale terminal 补独立 Electron current fixture 证据，然后再删除无 turnId terminal fallback / input restore 旧 helper。
3. 补 Plan rail / decision drawer / history hydrate 的 DOM 或 Electron oracle，证明 proposed_plan 与结构化 plan event 不回退到 legacy `update_plan` UI owner。
4. S2 接续已有 Electron 场景的 item/projection oracle：优先 MCP truncation / resource / elicitation、Skills search-read-gate、Multi-Agent lineage。
