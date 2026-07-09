# Plan Runtime Implementation Progress

> 状态：active
> 更新时间：2026-06-23
> 主路线图：`internal/roadmap/plan/README.md`
> PRD：`internal/roadmap/plan/prd.md`

## 目标

把 Lime Plan 能力从路线图推进到 current 主链实现：Codex 风格 `Plan Mode + update_plan + <proposed_plan>` 驱动 GUI 计划轨，同时支持多模型 reasoning / thinking 过程展示。

## 当前原则

1. 先完成骨架，再填细节。
2. 不新增平行 planner；只扩展 App Server / RuntimeCore / AsterBackend / AgentUI current 主链。
3. 不恢复 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` 生产事实源或 mock fallback。
4. Plan facts 与 reasoning facts 分层：`plan.delta/final` 驱动计划轨，`reasoning.delta/final` 只进过程层。
5. 多模型能力走标准化 resolver / adapter，不让前端业务组件拼 Provider 私有字段。

## 分阶段计划

### P0：骨架与写集边界

- [x] 新增 Plan roadmap 与 PRD。
- [x] 新增骨架优先的 implementation plan。
- [x] 放行 `internal/roadmap/plan/*.md`，保证路线图可版本化。
- [x] 新增本执行计划并放行。
- [x] 建立后端 skeleton：model capability、provider request options、reasoning event、plan event builder。
- [x] 建立前端 skeleton：PlanState selector、model reasoning state selector。
- [x] 骨架层最小单测通过。

退出条件：

- 骨架文件存在且只做保守归一 / no-op adapter，不接复杂运行时细节。
- 不触碰当前并行脏写集中的 right-surface 实现。
- 后端骨架模块暂时允许 `dead_code`，因为 P0 不接主链；P1 接入事件主链时移除或收窄该标注。
- `ReasoningLevel::XHigh` 序列化固定为 `xhigh`，与前端 reasoning 档位归一保持一致。

### P1：后端事件主链

- [x] Aster `<proposed_plan>` 流式 parser 输出 `plan.delta/final`。
- [x] `tool.result(update_plan)` 统一投影为 `plan.final` 或等价 plan fact。
- [x] `thinking_delta` 标准化为 `reasoning.delta`。
- [x] reasoning start / end / final 映射为标准 runtime events。
- [x] `model.effective` 记录本轮 provider/model/reasoning 有效能力。

退出条件：

- Rust 定向测试覆盖 plan delta/final、update_plan metadata、reasoning event、model effective。

### P2：前端协议与状态

- [x] `AgentEvent` 一等支持 `plan_delta / plan_final / reasoning_delta`。
- [x] `AgentEvent` 一等支持 `model_effective`。
- [x] `AgentEvent` 一等支持 `reasoning_final`。
- [x] live `plan_delta / plan_final` 可进入 `AgentThreadItem type="plan"`。
- [x] 建立 live events 与 ThreadReadModel 共用的 `PlanState` / `ReasoningState` hydrator 纯函数。
- [x] 标准 `PlanState` 只接收 live plan event 和带 `revisionId` 的历史 plan item，并清退旧 per-step thread item / `update_plan` metadata 计划恢复路径。
- [x] PlanRail 通过 TaskRail projection 消费标准 `PlanState`。
- [x] Runtime strip 通过 `harnessState.plan` 消费标准 `PlanState`。
- [x] Runtime UI 消费标准 `ReasoningState`。

退出条件：

- 前端纯单元测试覆盖 event parser、PlanState reducer、reasoning hydrator。

### P3：UI 工作台闭环

- [x] 输入栏 Plan Mode 状态、模型选择、reasoning 档位显示。
- [x] 对话内 `<proposed_plan>` 去重展示。
- [x] 右侧计划轨 / 运行控制面显示 latest plan revision。
- [x] 右侧计划轨、Runtime Strip 与 Harness 摘要不再从旧 `update_plan` metadata 或无 revision `plan` thread item 直读计划。
- [x] Plan Mode ready 后出现实施确认，确认绑定 latest revision。
- [x] thinking / reasoning 过程行默认折叠，不抢 PlanRail 主对象。
- [x] latest revision / 实施确认绑定文案覆盖五语言。
- [x] thinking / reasoning 折叠相关文案覆盖五语言。

退出条件：

- 用户可见回归测试覆盖计划轨、实施确认、模型/推理档位。
- GUI smoke 覆盖显式 Plan Mode 和默认 `update_plan`。

### P4：多模型验证

- [x] Codex/OpenAI fixture。
- [x] Anthropic fixture。
- [x] Gemini fixture。
- [x] OpenAI-compatible fixture。
- [x] 无 reasoning 模型降级 fixture。

退出条件：

- 不支持 thinking 的模型不伪造 reasoning。
- 支持 reasoning 的模型能保留过程 event，PlanRail 仍只消费 plan facts。

### P5：provider-native reasoning metadata 保真

- [x] Aster `ThinkingContent.signature` 投影到 `ItemRuntimePayload::Reasoning.metadata.provider_metadata.signature`。
- [x] `ItemRuntimePayload::Reasoning.metadata` 透传到 `AgentThreadItemPayload::Reasoning.metadata`。
- [x] App Server thread read model 合并 reasoning item payload 中的 `metadata.provider_metadata`。
- [x] App Server thread read model 合并标准 `reasoning.final` payload 中的 `providerMetadata / provider_metadata`。
- [x] `reasoning.final` 进入历史 thread item 投影并标记为 completed，不再只依赖旧 `reasoning.completed`。

退出条件：

- Provider 原生 metadata 只进入 reasoning metadata，不驱动 PlanState。
- `PlanState` 仍只消费 `plan.delta/final` 与带 `revisionId` 的历史 plan item。
- 不新增平行 planner、不恢复旧 `agent_runtime_*` 生产事实源。

### P6：current read model / hydrator fixture 回归

- [x] `AgentRuntimeThreadReadModel` 显式声明 current `thread_items` 字段，避免 history hydrate 依赖未知字段透传。
- [x] App Server `detail.thread_read.thread_items` fixture 覆盖 reasoning `metadata.provider_metadata` 与 plan `metadata.revisionId` 保留。
- [x] `PlanState` 回归覆盖历史 reasoning provider metadata 不会恢复成计划；带 revision 的 plan item 仍是唯一历史计划事实。
- [x] `ReasoningState` 回归覆盖带 provider metadata 的历史 reasoning item 仍可水合完成态 / 运行态，metadata 不改变状态语义。

退出条件：

- App Server read model 能把 current thread item history 带到前端，不把 provider 私有字段提升成 Plan 输入。
- Plan / Reasoning hydrator 的职责继续分离：Plan 只读 plan facts，Reasoning 只读 reasoning facts。
- 本阶段不新增生产 mock、不恢复旧 `agent_runtime_*`，fixture 只作为测试夹具。

### P7：current fixture GUI evidence

- [x] `web-tools-rendering` external backend fixture 发出标准 `reasoning.final`，并携带 `providerMetadata / provider_metadata`。
- [x] 同一 fixture 的 historical reasoning `item.updated / item.completed` 携带 `metadata.provider_metadata` 与 `native_reasoning_item_id`。
- [x] current read model helper 纳入 `thread_read.thread_items / threadItems`，用于 fixture smoke 读取 history item。
- [x] WebSearch/WebFetch Electron GUI summary 断言 reasoning provider metadata 不会打开 PlanRail，也不会出现计划实施确认。
- [x] 真实 Electron 窄场景 `web-tools-rendering` 通过，证据落到 `.lime/qc/gui-evidence/claw-chat-current-fixture/plan-reasoning-provider-metadata-regression-summary.json`。

退出条件：

- Provider 原生 reasoning metadata 能从 external fixture backend 进入 App Server read model，并被 GUI smoke 作为 current evidence 验证。
- GUI 过程层能看到 reasoning/web process，但 PlanRail 仍只由 plan facts 驱动。
- 不把 fixture backend、renderer mock 或 App Server mock backend 当作生产 fallback。

### P8：aggregate current fixture regression

- [x] 聚合 `npm run smoke:agent-runtime-current-fixture` 覆盖 P7 新增 `web-tools-rendering` evidence，不破坏历史 / 缓存、流式收尾、Coding Workbench、cancel-then-continue、Skills Runtime、MCP structuredContent、Expert Skills Runtime / Plaza / Panel 等 current fixture。
- [x] 修正 `claw-chat-current-fixture-smoke.mjs` 成功路径截图采集为 best-effort，并设置短 timeout，避免 `page.screenshot` 超时覆盖已经通过的 read model / GUI / evidence pack 断言。
- [x] 保持失败路径截图同样有短 timeout；失败 evidence 仍会写入 `summary.error / screenshotError`，不会吞掉真实断言失败。

退出条件：

- 聚合 current fixture smoke 通过，且输出仍明确 `liveProviderUsed=false`。
- 截图失败只作为 evidence 缺口记录，不再把已完成场景误判为产品链路失败。
- 不降低 scenario assertions：read model、GUI、backend ledger、evidence pack 断言仍必须通过。

### P9：旧 update_plan 工具轨迹收口

- [x] 盘点 PlanRail、Runtime Strip、Harness 摘要和 MessageList inline process 的 plan 消费路径。
- [x] 确认 `PlanState` / TaskRail / Runtime Strip / Harness 摘要只消费标准 plan facts：live `plan.delta/final`、带 `revisionId` 的 `type=plan` thread item，以及 `<proposed_plan>` 消息级 fallback。
- [x] 将 `isUpdatePlanToolName` 收敛到共享 tool name family helper，避免 TaskRail 和 MessageList 各自维护旧工具名判断。
- [x] MessageList inline timeline 不再把 `update_plan` / `UpdatePlanTool` thread `tool_call` 渲染成工具过程卡；旧工具项只作为 provenance / retired guard，不驱动 UI 计划展示。
- [x] 历史 hydrate 不再把 `update_plan` / `UpdatePlanTool` thread `tool_call` 恢复到 message `toolCalls / contentParts`。
- [x] 补充回归：只有 `update_plan` 工具项时不生成 inline process；标准 plan item 存在时不重复展示旧工具卡；外置 timeline process 判断不被 `update_plan` 误触发；历史 hydrate 不带出旧工具卡。

退出条件：

- `update_plan` 只能通过标准 `plan.final` / revisioned plan item 进入 Plan UI。
- `update_plan` thread `tool_call` 不再作为 MessageList / TaskRail / Harness / history hydrate 的计划恢复入口。
- 仍保留导入来源和历史 provenance，不删除 current Codex import evidence。

### P10：plan item history hydrate current 闭环

- [x] 历史 hydrate 支持带 `revisionId` 的标准 `type=plan` item，将其恢复为 `<proposed_plan>` 内容块。
- [x] 无 `revisionId` 的历史 plan item 仍不进入 current hydrate，避免旧计划残留回流。
- [x] 同一 turn 内的旧 `update_plan` / `UpdatePlanTool` tool_call 仍被过滤，不恢复为消息工具卡。

退出条件：

- `plan.final -> revisioned plan item -> history hydrate -> GUI proposed_plan block` 有稳定单测覆盖。
- 旧 `update_plan` tool_call 只作为 provenance / retired guard，不参与 GUI 计划渲染。

### P11：真实 Electron current fixture

- [x] `claw-chat-current-fixture` 的 `plan` 场景发出 current `plan.final(source=proposed_plan)`，不依赖旧 `update_plan` tool_call。
- [x] App Server `thread_item type="plan"` metadata 保留 `revisionId/source/plan`，作为历史 hydrate 的 current 事实源。
- [x] `plan` 场景完成后 reload renderer，并从侧栏重新打开同一 session，验证 `plan.final -> revisioned plan item -> history hydrate -> GUI proposed_plan`。
- [x] GUI 负向断言覆盖 `UpdatePlanTool / update_plan` 旧工具卡不可见。
- [x] 聚合 `npm run smoke:agent-runtime-current-fixture` 纳入 `--scenario plan`，防止 plan fixture 只停留在手工入口。

退出条件：

- 真实 Electron Desktop Host + App Server current JSON-RPC + external fixture backend 的 `plan` 场景通过。
- read model summary 能看到 completed `type=plan` item、`revisionId`、`source=proposed_plan` 和全部 plan steps。
- 历史重开后 GUI 仍显示计划步骤和实施确认，不显示旧 `UpdatePlanTool / update_plan` 工具过程卡。

## 本轮骨架写集

预计写集：

- `.gitignore`
- `internal/roadmap/plan/README.md`
- `internal/roadmap/plan/implementation-plan.md`
- `internal/exec-plans/plan-runtime-implementation-progress.md`
- `lime-rs/crates/app-server/src/runtime_backend.rs`
- `lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`
- `lime-rs/crates/app-server/src/runtime_backend/plan_events.rs`
- `lime-rs/crates/app-server/src/runtime_backend/reasoning_events.rs`
- `src/components/agent/chat/utils/planState.ts`
- `src/components/agent/chat/utils/planState.unit.test.ts`
- `src/components/agent/chat/utils/modelReasoningState.ts`
- `src/components/agent/chat/utils/modelReasoningState.unit.test.ts`
- `src/lib/api/agentRuntime/types.ts`
- `src/lib/api/agentRuntime/types.d.ts`
- `src/lib/api/agentRuntime/appServerReadModelProjection.test.ts`
- `scripts/agent-runtime/claw-chat-current-fixture-constants.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs`
- `scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs`

避让：

- 当前 right-surface 相关脏写集。
- Electron Host / App Server protocol 大范围生成文件。
- GUI 组件深改和 i18n 文案扩展。

## Plan 事实源治理分类

- `current`：App Server / RuntimeCore 输出的 live `plan.delta/final`，前端标准 `PlanState`，以及带 `revisionId` 的 latest plan revision 投影。
- `current`：Electron fixture `plan` 场景中的 `plan.final(source=proposed_plan)`，只用于验证 current read model 与 GUI hydrate，不作为生产 mock fallback。
- `current`：历史 `thread_item type="plan"` 只有带 `revisionId` 时才允许进入标准 `PlanState`。
- `current`：`<proposed_plan>` 仍可作为当前消息级计划兜底，用于 plan fact 尚未持久化前的 UI 显示。
- `compat / test-only`：`isUpdatePlanToolName` 只用于过滤 `update_plan` 工具活动，避免工具轨重复展示；不再负责解析计划步骤。
- `dead`：`PlanState`、TaskRail、Runtime Strip 与 Harness 摘要不再从 message toolCall `update_plan.result.metadata.plan`、历史 `tool_call.metadata.plan` 或无 `revisionId` 的 `thread_item type="plan"` 直读计划。
- `fallback`：`todoItems` 仍作为无 PlanState、无 `<proposed_plan>` 时的弱恢复来源，不作为 Plan Mode 主事实源。

## 验证记录

- 2026-06-23：
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 4 个测试；本轮新增 implementation plan 后回归。
  - `rg -n "[ \t]+$" "internal/roadmap/plan" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配，新增 / 更新计划文档无尾随空白。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 4 个测试。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_capability`
    - 结果：通过，3 个测试。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plan_events`
    - 结果：通过，1 个测试。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server reasoning_events`
    - 结果：通过，1 个测试。
  - `git diff --check -- ".gitignore" "lime-rs/crates/app-server/src/runtime_backend.rs"`
    - 结果：通过，已跟踪改动无空白错误。
  - `rg -n "[ \t]+$" <P0 新增文件>`
    - 结果：无匹配，新增文件无尾随空白。
  - `npx vitest run "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/hooks/agentStreamPlanEventController.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 63 个测试；覆盖 `plan.delta/final`、`reasoning.delta` parser / projection / live plan thread item。
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`
    - 结果：通过。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server proposed_plan_parser`
    - 结果：通过，5 个测试；覆盖 `<proposed_plan>` 闭合、跨 chunk 标签、未闭合计划、半截闭合标签和 RuntimeEvent 投影。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plan_events`
    - 结果：通过，3 个测试；覆盖 `plan.delta` skeleton、`proposed_plan -> plan.final`、`update_plan -> plan.final`。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_events`
    - 结果：通过，16 个相关测试；覆盖 `thinking_delta -> reasoning.delta`、工具事件和 `update_plan` plan fact 投影。
  - `npx tsc --noEmit --pretty false --skipLibCheck false --project tsconfig.json`
    - 结果：失败；该手工严检暴露 `node_modules` / `vite-env.d.ts` 全局声明冲突、right-surface 并行改动中的 `null -> boolean`，以及本轮新增 plan event 两处 TS 窄化问题。本轮相关 TS 问题已修复；该命令不是仓库默认类型入口。
  - `npm run typecheck`
    - 结果：失败；仅剩 `src/components/agent/chat/workspace/useWorkspaceDebugRuntime.unit.test.ts(22,3): Type 'null' is not assignable to type 'boolean'`，归属当前 right-surface 并行写集，不属于本轮 Plan 主链改动。
  - `npm run smoke:agent-runtime-current-fixture`
    - 结果：失败在 `Claw Expert Panel Skills Runtime override Electron fixture` 的 Harness 证据导出入口，错误为未找到可打开 Harness 证据导出的入口；同次 smoke 中历史 / 缓存恢复、流式完成与运行态收尾、Electron/App Server fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza click-through 均已通过。失败点归属 Expert Panel / Harness UI 证据入口，不是本轮 `plan.delta/final` 事件链路。
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`
    - 结果：通过。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_capability`
    - 结果：通过，4 个测试；覆盖 reasoning level 归一、reasoning capability 降级和 `xhigh` 稳定序列化。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_effective`
    - 结果：通过，1 个测试；覆盖 `model.effective` payload 中 provider/model/source/service slot/reasoning policy。
  - `npx vitest run "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 83 个测试；覆盖 `model.effective -> model_effective` parser、App Server event stream projection、event sequence gate 和 Agent UI projection。
  - `npm run test:contracts`
    - 结果：通过；覆盖 app-server client contract、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow、harness cleanup contract 和 docs boundary。曾因 `runtimeLifecycleProjection.ts` 静态 guard 要求 `model_change` 直接委托 `model: event.model` / `mode: event.mode` 失败，已通过拆出 `buildModelEffectiveEvent` 修复。
  - `git diff --check`
    - 结果：通过。
  - `rg -n "[ \t]+$" "internal/roadmap/plan" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配，Plan 路线图与执行计划无尾随空白。
  - `npm run typecheck`
    - 结果：本轮重跑超过多轮等待无输出，主动中断，退出码 130，未形成有效类型结论；上一轮已知失败归属 `src/components/agent/chat/workspace/useWorkspaceDebugRuntime.unit.test.ts` 的 right-surface 并行写集，不属于本轮 Plan 主链。
  - `npm run smoke:agent-runtime-current-fixture`
    - 结果：失败在 `Claw Expert Panel Skills Runtime override Electron fixture` 的 Harness panel evidence export；Playwright 点击 Harness 按钮时被窗口 drag region 覆盖并超时。同次 smoke 中历史 / 缓存恢复、流式收尾、Electron/App Server fixture guard、Coding Workbench、Claw cancel-then-continue、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza click-through 均已通过。失败点归属 Expert Panel / Harness UI 点击层，不是本轮 Plan / `model.effective` 事件链路。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 9 个测试；覆盖结构化 `update_plan` plan 状态、历史 plan 初始态 + live plan 覆盖、`model.effective` 顶层 / modelRef 多模型归一、历史 reasoning item hydrate、`reasoning.started/delta/final/ended` lifecycle hydrate。
  - `npx vitest run "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/hooks/agentStreamPlanEventController.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，4 个文件 84 个测试；覆盖 `plan.delta/final`、`reasoning.final`、`model.effective` parser / App Server event stream projection / Agent UI projection / live plan thread item。输出中的 `blocked invalid runtime event sequence` 为既有负向测试断言。
  - `npx eslint "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮新增 / 修改的 PlanState 与 ReasoningState 纯状态文件。
  - `git diff --check -- "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：通过；该命令仅覆盖已跟踪 diff，新文件尾随空白由下一条 `rg` 检查覆盖。
  - `rg -n "[ \t]+$" "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮写集无尾随空白。
  - `npm run typecheck`
    - 结果：两次运行均超过长时间等待无输出，分别因用户打断和主动中断退出，退出码 `130`；未形成有效类型结论。上一轮已知有效失败仍归属 `src/components/agent/chat/workspace/useWorkspaceDebugRuntime.unit.test.ts` 的 right-surface 并行写集，不属于本轮 Plan 状态层。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 29 个测试；覆盖 TaskRail view model 消费标准 `PlanState`、带 revision 的标准 plan item 单步解析。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/hooks/agentStreamPlanEventController.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，7 个文件 118 个测试；覆盖 Plan/Reasoning 状态 hydrator、TaskRail PlanState 消费、协议 parser、App Server event projection、Agent UI projection 与 live plan thread item。输出中的 `blocked invalid runtime event sequence` 为既有负向测试断言。
  - `npx eslint "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮 PlanState / ReasoningState 与 TaskRail view model 写集。
  - `npx vitest run "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 15 个测试；覆盖 runtime strip 依赖的 `harnessState.plan` 从标准 `PlanState` 恢复 plan revision，并保持旧计划摘要和输出信号行为。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/hooks/agentStreamPlanEventController.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，9 个文件 133 个测试；覆盖 Plan/Reasoning hydrator、TaskRail / PlanRail 间接消费、runtime strip 计划状态消费、协议和 projection 链路。
  - `npx eslint "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --max-warnings 0`
    - 结果：通过；覆盖本轮标准状态层、TaskRail/PlanRail 间接消费与 runtime strip 写集。
  - `npx vitest run "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 18 个测试；覆盖 `harnessState.reasoning` 从标准 `ReasoningState` 恢复，以及 runtime strip 只在真实 reasoning lifecycle / text 信号下显示思考状态，单纯 `model.effective` 能力快照不伪装成运行状态。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/hooks/agentStreamPlanEventController.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，9 个文件 136 个测试；覆盖 Plan/Reasoning hydrator、TaskRail / PlanRail 间接消费、runtime strip 标准 `ReasoningState` 消费、协议和 projection 链路。输出中的 `blocked invalid runtime event sequence` 为既有负向测试断言。
  - `npx eslint "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --max-warnings 0`
    - 结果：通过；覆盖本轮状态层、TaskRail / PlanRail 间接消费与 runtime strip reasoning UI 写集。
  - `rg -n "[ \t]+$" "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮写集无尾随空白。
  - `npm run smoke:agent-runtime-current-fixture`
    - 结果：失败在 `Claw Expert Panel Skills Runtime override Electron fixture`，错误为专家技能选择器候选未达到预期状态（`candidateVisible=false`、`addButtonVisible=false`）。同次 smoke 中历史 / 缓存恢复、流式完成与运行态收尾、Electron/App Server fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza click-through 均已通过。失败点归属 Expert Panel Skills Runtime / picker 候选状态，不是本轮 Plan / Reasoning UI 状态链路。
  - `npx vitest run "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 16 个测试；覆盖 `HarnessPlanState` 从标准 `PlanState` 恢复 `revisionId / turnId / source`，以及本地实施确认请求携带 `plan_revision_id / source_item_id / turn_id / plan_source`。
  - `npx eslint "src/components/agent/chat/workspace/planImplementationDecision.ts" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx" --max-warnings 0`
    - 结果：通过；覆盖 latest plan revision metadata builder、harness state 投影和 `AgentChatWorkspace` 本地实施确认发送接线。
  - `npx vitest run "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，5 个文件 46 个测试；覆盖计划确认识别、实施确认 latest revision metadata、确认抽屉回归、runtime strip plan / reasoning 状态消费。
  - `npx eslint "src/components/agent/chat/workspace/PlanComposerDecisionPanel.tsx" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.ts" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/planImplementationDecision.ts" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" --max-warnings 0`
    - 结果：通过；覆盖计划确认抽屉、计划确认识别和实施确认 metadata 写集。
  - `npx vitest run "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 21 个测试；覆盖确认抽屉在存在 latest plan revision 时显示绑定状态，缺少 revision metadata 时不显示噪声状态，并保持提交 / 调整 / 忽略行为。
  - `npx eslint "src/components/agent/chat/workspace/PlanComposerDecisionPanel.tsx" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/components/agent/chat/workspace/planComposerDecision.ts" "src/components/agent/chat/workspace/planComposerDecision.unit.test.ts" "src/components/agent/chat/workspace/planImplementationDecision.ts" "src/components/agent/chat/workspace/planImplementationDecision.unit.test.ts" --max-warnings 0`
    - 结果：通过；覆盖确认抽屉 latest revision UI、五语言 key 接入和计划实施确认纯逻辑。
  - `git diff --check -- "src/components/agent/chat/workspace/PlanComposerDecisionPanel.tsx" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json"`
    - 结果：通过；本轮确认抽屉与五语言资源写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.tsx" "src/components/agent/chat/workspace/PlanComposerDecisionPanel.test.tsx" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮确认抽屉、五语言资源和执行计划无尾随空白。
  - `npx vitest run "src/components/agent/chat/utils/proposedPlan.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 65 个测试；覆盖 Markdown checklist 状态解析、标准 `PlanState` latest revision 投影、右侧计划轨 / 运行控制面 revision badge 与完整 `data-*` metadata。
  - `npx eslint "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchRunControlSurfaceViewModel.ts" "src/components/agent/chat/components/TaskCenterTaskRail.tsx" "src/components/agent/chat/components/TaskCenterRunControlSurface.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" "src/components/agent/chat/components/generalWorkbenchTaskRailText.ts" "src/components/agent/chat/utils/proposedPlan.ts" "src/components/agent/chat/utils/proposedPlan.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮 right rail / run control projection、latest revision UI 接线和共享 proposed plan parser。
  - `git diff --check -- "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchRunControlSurfaceViewModel.ts" "src/components/agent/chat/components/TaskCenterTaskRail.tsx" "src/components/agent/chat/components/TaskCenterRunControlSurface.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" "src/components/agent/chat/components/generalWorkbenchTaskRailText.ts" "src/components/agent/chat/utils/proposedPlan.ts" "src/components/agent/chat/utils/proposedPlan.test.ts" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：通过；本轮 Plan UI / i18n / 执行计划写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchRunControlSurfaceViewModel.ts" "src/components/agent/chat/components/TaskCenterTaskRail.tsx" "src/components/agent/chat/components/TaskCenterRunControlSurface.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.tsx" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" "src/components/agent/chat/components/generalWorkbenchTaskRailText.ts" "src/components/agent/chat/utils/proposedPlan.ts" "src/components/agent/chat/utils/proposedPlan.test.ts" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 Plan UI / i18n / 执行计划写集无尾随空白。
  - `npx vitest run "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/utils/proposedPlan.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 65 个测试；覆盖旧 Plan 恢复路径负向守卫、Markdown checklist 状态解析、标准 `PlanState` latest revision 投影、右侧计划轨 / 运行控制面 revision badge 与完整 `data-*` metadata。
  - `npx eslint "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" --max-warnings 0`
    - 结果：通过；覆盖 TaskRail view model、旧 `update_plan` 工具活动过滤、`<proposed_plan>` 投影和对应负向守卫。
  - `git diff --check -- "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts"`
    - 结果：通过；本轮 Plan 旧恢复清理写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 Plan 旧恢复清理写集与执行计划无尾随空白。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "src/components/agent/chat/utils/proposedPlan.test.ts" "src/components/agent/chat/components/TaskCenterUtilityToolbar.integration.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，6 个文件 88 个测试；覆盖 `PlanState` 源头只接收带 revision 的历史 plan item、无 revision 历史 plan 负向守卫、TaskRail、Runtime Strip、Harness 摘要和右侧计划轨消费面。
  - `npx eslint "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --max-warnings 0`
    - 结果：通过；覆盖 PlanState、HarnessState、TaskRail、旧 `update_plan` 工具活动过滤和 Runtime Strip 写集。
  - `git diff --check -- "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：通过；本轮 Plan 事实源治理写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/harnessState.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" "src/components/agent/chat/components/AgentRuntimeStrip.tsx" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 Plan 事实源治理写集和执行计划无尾随空白。
  - `npx vitest run "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 77 个测试；覆盖 Plan Mode 左侧状态 chip、模型 / reasoning 只读上下文、右侧模型选择器位置不回流，以及既有输入栏发送 / 工具状态回归。
  - `npx eslint "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx" "src/components/agent/chat/components/Inputbar/components/inputbarComposerSectionCopy.ts" "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx" "src/components/agent/chat/components/Inputbar/styles.ts" --max-warnings 0`
    - 结果：通过；覆盖输入栏 Plan Mode 上下文展示、copy 构造和样式写集。
  - `npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，1 个文件 7 个测试；覆盖新增 `agentInputbar` 五语言 key 能合并进 `agent` namespace。
  - `git diff --check -- "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx" "src/components/agent/chat/components/Inputbar/components/inputbarComposerSectionCopy.ts" "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx" "src/components/agent/chat/components/Inputbar/styles.ts" "src/i18n/resources/zh-CN/agentInputbar.json" "src/i18n/resources/zh-TW/agentInputbar.json" "src/i18n/resources/en-US/agentInputbar.json" "src/i18n/resources/ja-JP/agentInputbar.json" "src/i18n/resources/ko-KR/agentInputbar.json"`
    - 结果：通过；本轮输入栏 Plan Mode UI 与五语言资源写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx" "src/components/agent/chat/components/Inputbar/components/inputbarComposerSectionCopy.ts" "src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx" "src/components/agent/chat/components/Inputbar/styles.ts" "src/i18n/resources/zh-CN/agentInputbar.json" "src/i18n/resources/zh-TW/agentInputbar.json" "src/i18n/resources/en-US/agentInputbar.json" "src/i18n/resources/ja-JP/agentInputbar.json" "src/i18n/resources/ko-KR/agentInputbar.json"`
    - 结果：无匹配；本轮输入栏 Plan Mode UI 与五语言资源写集无尾随空白。
  - `npx vitest run "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 22 个测试；覆盖标准 plan timeline fact 已存在时聊天正文不再重复渲染 `AgentPlanBlock`，同时没有 plan fact 的 `<proposed_plan>` 仍保留消息级 fallback。
  - `npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" --max-warnings 0`
    - 结果：通过；覆盖本轮消息投影去重判断与回归测试写集。
  - `git diff --check -- "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：通过；本轮 `<proposed_plan>` 去重写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 `<proposed_plan>` 去重写集和执行计划无尾随空白。
  - `npx vitest run "src/components/agent/chat/components/thinkingBlockDisplay.test.ts" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/i18n/__tests__/loadNamespace.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，5 个文件 48 个测试；覆盖流式纯 thinking / reasoning 默认折叠、展开后可查看详情、thinking 状态文案可注入本地化，以及新增 `agentChat.thinkingBlock.*` 五语言 key 能加载。
  - `npx vitest run "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/MessageList.reasoningPersistence.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，6 个文件 46 个测试；覆盖 `<proposed_plan>` 去重、reasoning / thinking 从 MessageList timeline 到 StreamingRenderer 的顺序与持久化回归、Web 检索过程顺序回归。
  - `npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "src/components/agent/chat/components/StreamingProcessGroupModel.ts" "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/StreamingProcessGroup.tsx" "src/components/agent/chat/components/ThinkingBlock.tsx" "src/components/agent/chat/components/thinkingBlockDisplay.ts" "src/components/agent/chat/components/thinkingBlockDisplay.test.ts" "src/components/agent/chat/components/StreamingProcessGroupModel.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.testMocks.tsx" --max-warnings 0`
    - 结果：通过；覆盖本轮消息投影、过程组默认折叠、ThinkingBlock i18n 和测试 mock 写集。
  - `git diff --check -- <本轮 Plan UI tracked 写集>`
    - 结果：通过；覆盖本轮已跟踪 TS / TSX / i18n 写集无 diff 空白错误。`internal/exec-plans/plan-runtime-implementation-progress.md` 当前仍是 untracked 文件，由下一条 `rg` 覆盖尾随空白。
  - `rg -n "[ \t]+$" <本轮 Plan UI 写集 + internal/exec-plans/plan-runtime-implementation-progress.md>`
    - 结果：无匹配；本轮 Plan UI 写集与执行计划无尾随空白。
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`
    - 结果：通过；格式化本轮 Rust model capability 写集。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_capability`
    - 结果：通过，8 个测试；覆盖 Codex/OpenAI、Anthropic、Gemini、OpenAI-compatible、多模型 reasoning 能力矩阵，OpenAI-compatible 普通聊天模型降级，`none` 不误升 reasoning，默认档位为 `medium`，以及 `xhigh` 序列化稳定。
  - `npx vitest run "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/planState.unit.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 13 个测试；覆盖多模型 `model.effective` payload 归一、无 reasoning 模型不伪造运行态、`minimal` 档位归一，以及 PlanState 只消费 `plan.delta/final` facts、不从 model / reasoning 事件恢复计划。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_effective`
    - 结果：通过，1 个测试；覆盖运行时 `model.effective` payload 仍记录选中模型、service slot 与 reasoning policy。
  - `npx vitest run "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 83 个测试；覆盖 Plan / Reasoning / `model.effective` 事件 parser、App Server event stream projection 与 Agent UI projection。输出中的 `blocked invalid runtime event sequence` 为既有负向测试断言。
  - `npx eslint "src/components/agent/chat/utils/modelReasoningState.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/components/agent/chat/utils/planState.ts" "src/components/agent/chat/utils/planState.unit.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮 P4 前端状态层写集。
  - `npm run smoke:agent-runtime-current-fixture`
    - 结果：通过；覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、Claw 终态 UI、Electron fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue、Skills Runtime natural / 显式 `$skill` / 工作台试用入口、MCP structuredContent、Expert Skills Runtime、Expert Plaza、ExpertInfoPanel skillRefs override 与 Harness panel Evidence Pack 导出；`liveProviderUsed=false`。
  - `npm run verify:gui-smoke`
    - 结果：通过；完成 renderer smoke build、Electron host build、App Server sidecar asset build，Electron smoke 中 renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready。
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`
    - 结果：通过；格式化本轮 reasoning metadata Rust 写集。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent test_convert_item_started_reasoning_runtime_item_preserves_summary`
    - 结果：通过，1 个测试；覆盖 `ItemRuntimePayload::Reasoning.metadata` 透传到 `AgentThreadItemPayload::Reasoning.metadata`。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server reasoning_item_payload_metadata_is_preserved_in_thread_items`
    - 结果：通过，1 个测试；覆盖 App Server thread read model 保留 reasoning item payload 中的 `metadata.provider_metadata` 与 provider 原生字段。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server reasoning_final_provider_metadata_is_projected_to_thread_item_metadata`
    - 结果：通过，1 个测试；覆盖标准 `reasoning.final` payload 中的 `providerMetadata` 进入历史 thread item metadata，并标记 completed。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_thinking_delta_emits_reasoning_lifecycle_events`
    - 结果：通过，1 个测试；确认 `reasoning.started/delta/final/ended` lifecycle 事件序列保持稳定。
  - `CARGO_TARGET_DIR="/Users/coso/Documents/dev/ai/aiclientproxy/lime/lime-rs/target" cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core test_project_message_emits_reasoning_summary_runtime_item`
    - 结果：通过，1 个测试；覆盖 Aster projector 将 thinking signature 保真投影到 reasoning metadata。显式设置 `CARGO_TARGET_DIR`，未生成 `lime-rs/crates/aster-rust/target`。
  - `npx vitest run "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，3 个文件 21 个测试；覆盖 current read model `thread_items` metadata 保留、历史 reasoning metadata 不污染 PlanState、ReasoningState 历史水合完成态 / 运行态。
  - `npx eslint "src/lib/api/agentRuntime/types.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮 TS 源码与测试写集。
  - `npx eslint "src/lib/api/agentRuntime/types.d.ts" --max-warnings 0 --no-warn-ignored`
    - 结果：通过；`.d.ts` 按仓库 ignore 规则不进入 ESLint 解析，本命令确认不会因 ignored warning 干扰本轮门禁。
  - `git diff --check -- "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts"`
    - 结果：通过；本轮 touched 写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/modelReasoningState.unit.test.ts" "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 touched 写集与执行计划无尾随空白。
  - `node --check "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs"`
    - 结果：通过；覆盖 fixture constants 语法。
  - `node --check "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs" && node --check "scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs" && node --check "scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs" && node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs" && node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`
    - 结果：通过；覆盖本轮 fixture mjs 写集语法。
  - `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 23 个测试；覆盖 current fixture guard、非 live provider / 非 mock backend 边界、WebSearch/WebFetch scenario guard。
  - `npx eslint "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs" "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs" "scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" --max-warnings 0`
    - 结果：通过；覆盖本轮 fixture mjs 写集 lint。
  - `node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario web-tools-rendering --prefix plan-reasoning-provider-metadata-regression --timeout-ms 180000`
    - 结果：通过；真实 Electron Desktop Host + App Server current JSON-RPC + external fixture backend。Summary 关键证据：`includesReasoningFinal=true`、`includesReasoningFinalProviderMetadata=true`、`includesReasoningItem=true`、`includesReasoningItemProviderMetadata=true`、`hasAllPlanSteps=false`、`planDecisionVisible=false`、assertions 中 `readModelWebToolsReasoningProviderMetadataPreserved=true`、`guiWebToolsReasoningDidNotOpenPlanRail=true`。
  - `git diff --check -- "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs" "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs" "scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`
    - 结果：通过；本轮 fixture 写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs" "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs" "scripts/agent-runtime/claw-chat-current-fixture-read-model-core.mjs" "scripts/agent-runtime/claw-chat-current-fixture-gui-web-tools-waits.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 fixture 写集与执行计划无尾随空白。
  - `node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs"`
    - 结果：通过；覆盖截图 best-effort 修正后的 smoke 主脚本语法。
  - `npx eslint "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --max-warnings 0`
    - 结果：通过；覆盖 smoke 主脚本 lint。
  - `npm run smoke:agent-runtime-current-fixture`
    - 第一次结果：失败在 `Claw Expert Skills Runtime declared + selected + invoked Electron fixture` 成功路径截图采集，`page.screenshot: Timeout 180000ms exceeded`。failure summary 证明该场景 read model、evidence pack 与 GUI 已完成：`latestTurnStatus=completed`、`readModelTurnTerminal=true`、`skillSearchToolStatus=completed`、`skillToolStatus=completed`、`skillGateObserved=true`、`guiExpertSkillsRuntimeCompleted.hasAssistantSummary=true`。
    - 修正：成功路径截图改为 best-effort，并设置 `timeout: 15000`；失败路径截图同样设置短 timeout。
    - 第二次结果：通过；聚合入口完成 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、Claw 终态 UI、Electron fixture guard、Coding Workbench Electron fixture、cancel-then-continue、Skills Runtime 三入口、MCP structuredContent、Expert Skills Runtime / Plaza / Panel Electron fixture；输出 `liveProviderUsed=false`。
  - `npx vitest run "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts" "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/utils/planState.unit.test.ts" "src/components/agent/chat/utils/harnessState.test.ts" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，8 个文件 81 个测试；覆盖 MessageList 不再渲染旧 `update_plan` 工具过程、外置 timeline process 判断不被 `update_plan` 误触发、历史 hydrate 不带出旧工具卡、TaskRail 计划恢复负向守卫、PlanState / Harness / Runtime Strip 仍只走标准 plan facts，以及共享工具名 helper。
  - `npx eslint "src/components/agent/chat/utils/toolNameFamily.ts" "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/messageListTimelineContentParts.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts" "src/components/agent/chat/components/generalWorkbenchTaskRailThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" --max-warnings 0`
    - 结果：通过；覆盖本轮共享 helper、MessageList 过滤、历史 hydrate 过滤、TaskRail re-export 和回归测试写集。
  - `git diff --check -- "src/components/agent/chat/utils/toolNameFamily.ts" "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/messageListTimelineContentParts.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts"`
    - 结果：通过；本轮 P9 tracked 写集无 diff 空白错误。
  - `rg -n "[ \t]+$" "src/components/agent/chat/utils/toolNameFamily.ts" "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/components/planToolProjection.ts" "src/components/agent/chat/components/messageListTimelineContentParts.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts" "internal/exec-plans/plan-runtime-implementation-progress.md"`
    - 结果：无匹配；本轮 P9 写集与执行计划无尾随空白。
  - `node --check "scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs"`
    - 结果：通过；覆盖新增 plan history hydrate helper 语法。
  - `node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs"`
    - 结果：通过；覆盖 plan 场景接入 history hydrate helper 后的语法。
  - `node --check "scripts/agent-runtime/current-fixture-regression-smoke.mjs"`
    - 结果：通过；覆盖聚合 current fixture 增加 `--scenario plan` 后的语法。
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all --check`
    - 结果：通过；本轮 App Server plan thread item metadata 投影符合格式。
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plan_item_preserves_revision_source_and_plan_metadata`
    - 结果：通过，1 个测试；覆盖 `plan.final` 投影到 `thread_item type=plan` 时保留 `metadata.revisionId/source/plan`。
  - `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept`
    - 结果：通过，2 个文件 26 个测试；覆盖 Plan revisioned history hydrate guard、非 live provider / 非 mock backend 边界和聚合 plan scenario 入口。
  - `npx eslint "scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs" "scripts/agent-runtime/claw-chat-current-fixture-plan-history.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" --max-warnings 0`
    - 结果：通过；覆盖本轮 Plan fixture 脚本写集 lint。
  - `node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario plan --prefix plan-current-history-hydrate --timeout-ms 180000`
    - 第一次结果：失败，暴露 `PLAN_STEPS` 未导入到 `claw-chat-current-fixture-scenario-flow.mjs`。修正：补齐导入。
    - 第二次结果：失败，暴露 external backend 没有显式 current `plan.final`，read model 只有 GUI `<proposed_plan>` fallback。修正：`plan` 分支补 `plan.final(source=proposed_plan, revisionId=proposed_plan:fixture-1)`。
    - 第三次结果：通过；真实 Electron Desktop Host + App Server current JSON-RPC + external fixture backend。Summary 关键证据：`readModelPlanThreadItem.planThreadItemCount=1`、`hasRevisionId=true`、`source=proposed_plan`、`includesAllPlanSteps=true`、`readModelPlanHistoryHydrate.hasRevisionId=true`、`guiPlanHistoryHydrateCompleted.hasAllPlanSteps=true`、`legacyUpdatePlanToolVisible=false`、scenario assertions 中 `readModelPlanThreadItemRevisioned=true`、`guiPlanHistoryHydrateCompleted=true`、`readModelPlanHistoryHydratePreserved=true`、`legacyUpdatePlanToolHidden=true`。

拆分说明：

- `src/components/agent/chat/utils/harnessState.ts` 已超过 `1000` 行，本轮只删除旧 Plan 恢复路径并调整既有状态投影，没有继续追加新业务逻辑。后续若继续扩展 Harness 状态，应优先拆出 `harnessPlanState` / `harnessReasoningState` 子模块，避免在中心文件继续膨胀。
- `src/components/agent/chat/components/messageListItemProjection.ts` 已超过 `800` 行预警线。本轮只把既有 `shouldRenderProposedPlanBlocks` 判断收敛到标准 timeline plan fact，没有追加新的消息投影业务分支；后续若继续扩展 MessageList 投影，应优先拆出 plan / reasoning projection helper。
- `src/components/agent/chat/components/StreamingRenderer.test.tsx` 已超过 `800` 行预警线。本轮只保留既有回归并把新增 thinking / reasoning 折叠覆盖放到 `StreamingRenderer.processGroups.test.tsx`，没有继续扩展该大测试文件；后续 StreamingRenderer 过程流回归应优先进入分域测试文件。
- `src/lib/api/agentRuntime/types.ts` 已超过 `1000` 行。本轮只补 `AgentRuntimeThreadReadModel.thread_items` 类型字段并同步 `.d.ts` 镜像，没有追加新业务逻辑；后续若继续扩展 agent runtime read model 类型，应优先拆出 session read / thread read / runtime summary 分域类型文件，再由当前 `types.ts` 做 facade re-export。
- `scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs` 已超过 `800` 行预警线。本轮追加的 `plan.final` 是 current fixture 最小事实源事件；后续继续扩展 external backend fixture 时，应拆出 plan / web-tools event renderer 子模块。
- `scripts/agent-runtime/claw-chat-current-fixture-scenario-flow.mjs` 已超过 `800` 行预警线。本轮只接入 `verifyPlanHistoryHydrate` helper，新增逻辑放到小模块；后续新增 scenario 或继续扩展 read model summary 时，应拆出 scenario-specific flow helpers。

GUI 交付状态：

- `npm run smoke:agent-runtime-current-fixture` 已通过，先前 Expert Panel / Harness blocker 当前不再复现。
- `npm run verify:gui-smoke` 已通过，Plan 主线本轮具备最小 GUI smoke 交付证据。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix plan-reasoning-provider-metadata-regression --timeout-ms 180000` 已通过，补齐 P7 provider metadata reasoning current fixture GUI evidence。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario plan --prefix plan-current-history-hydrate --timeout-ms 180000` 已通过，补齐 P11 Plan revisioned thread item + history hydrate current fixture GUI evidence。
- `npm run smoke:agent-runtime-current-fixture` 在 P8 已通过；本轮 P11 新增 plan 场景后未重跑全量聚合，下一刀优先补该回归。

## 下一刀

P11 真实 Electron current fixture 已完成。下一刀若继续增强 Plan 主链，优先补一次聚合 `npm run smoke:agent-runtime-current-fixture` 全量回归；如果继续做工程收口，则优先拆分已登记的大文件风险，不再向 `harnessState.ts`、`types.ts` 或 agent-runtime fixture 巨型脚本追加新业务逻辑。
