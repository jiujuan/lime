# Lime AgentRuntime Profile 分阶段落地计划

> 状态：implementation-audited
> 更新时间：2026-05-12
> 作用：把 AgentRuntime Profile 从标准文档推进到 Lime current runtime、证据导出和 GUI 展示。
> 完成审计：见 [./completion-audit.md](./completion-audit.md)。本文件保留阶段计划与退出条件，实际落地证据以完成审计为准。

相邻标准边界同步纳入本计划：`AgentContext` 负责上下文 owner facts，`AgentPolicy` 负责策略/审批 owner facts，`AgentEvidence` 负责证据与 completeness owner facts，`AgentUI` 负责只读投影。详细合同见 [./adjacent-protocols.md](./adjacent-protocols.md)。

## 1. 固定实施原则

1. 先做主链闭环，再做全量事件族。
2. 先补 correlation ids，再补漂亮展示。
3. 先让 evidence/replay/review 读同源事实，再做 dashboard 聚合。
4. 先保守收紧 Lime Profile schema，不收紧公开 schema。
5. 每阶段都要有可运行的结构测试或 GUI smoke。
6. 全球本地化必须在 presentation 层完成：profile facts 保持 stable value，AgentUI/Workspace/Evidence Markdown 通过 i18n key 或导出 locale 渲染。

## 2. 阶段总览

| 阶段 | 目标 | 关键产物 | 退出条件 |
| --- | --- | --- | --- |
| P0 | 文档与 profile 冻结 | 本 roadmap、PRD、架构图、AgentRuntime v0.4.0 Lime Profile | 团队对主链、owner、非目标无歧义 |
| P1 | Identity 与事件最小闭环 | `runtimeId/sessionId/threadId/turnId/taskId/runId` 贯穿 submit turn | submit turn fixture 能映射真实 runtime |
| P2 | ThreadReadModel 与 Context 收口 | read model 消费 runtime events，不由 GUI 拼状态；Context refs 进入 read model | Workspace/Harness 只读 read model |
| P3 | Evidence 同源导出 | evidence/replay/review 消费同一 runtime facts，并保留 context/policy refs | evidence pack 含 runtime correlation spine |
| P4 | Task / routing / permission 扩展 | task retry、routing single candidate、tool approval / policy fixtures 落地 | 核心 fixtures 全部有实现测试 |
| P5 | 子代理 / job / remote channel | parent-child graph、channel resume、job item retry | 断线/重试/关闭可恢复可审计 |
| PX | 全球本地化守卫 | profile facts 与用户可见 presentation 分层 | 新增 UI 文案有 locale resources，profile fixture 不含 locale 文案状态值 |

## 3. P0：文档与 profile 冻结

已完成目标：

1. `agentruntime` 标准项目新增 Lime AgentRuntime Profile。
2. Lime 主仓库新增 `internal/roadmap/agentruntime/`。
3. 固定 current / compat / deprecated / dead 分类。

后续如果改 Profile，必须同步：

- `internal/roadmap/agentruntime/prd.md`
- `internal/roadmap/agentruntime/architecture.md`
- `internal/aiprompts/harness-engine-governance.md`，仅当事实源规则改变时

## 4. P1：Identity 与事件最小闭环

目标：

- 任一 `agent_runtime_submit_turn` 都能生成 AgentRuntime Profile 需要的核心关联键。

关键工作：

1. 在 runtime turn 创建点统一生成或读取：
   - `runtimeId`
   - `sessionId`
   - `threadId`
   - `turnId`
   - `taskId`，如果该 turn 属于目标任务
   - `runId`，如果该 task 有执行尝试
2. 事件 envelope 统一携带：
   - `eventId`
   - `timestamp`
   - `sequence`
   - `schemaVersion`
   - `payload`
3. 输出最小事件：
   - `turn.submitted`
   - `turn.started`
   - `model.requested`
   - `model.completed` 或 `model.failed`
   - `turn.completed` 或 `turn.failed`
4. AgentUI 对 `schemaVersion = lime-profile-0.4.0` 的 dotted profile event 保持 stream 活跃且不告警，不把它转换成 UI-owned truth。
5. AgentUI 对 profile event 的展示必须通过 i18n key 映射，不把 `type/status/message` 原样当作用户可见主文案。

退出条件：

- 本地结构测试能用真实 runtime 输出构造 `submit-turn-event.json` 等价 fixture。
- 无 `session/thread/turn` 的 runtime 主路径事件不能进入 current read model。
- 前端未知事件控制器能识别 Lime Profile 事件为已知旁路事实，不污染用户可见 projection。
- AgentUI projection presentation mapper 支持用 key-based i18n 渲染 event type、phase/status、control、surface；Subagents、Harness、可靠性诊断和 Artifact timeline 这类 current projection 入口不得退回中文 fallback，不把 stable facts 翻译回写到 runtime/read model。
- `turn.submitted / model.failed / task.failed` 等 profile fixtures 的 `type/status/failureCategory` 在不同 locale 下保持不变。

## 5. P2：ThreadReadModel 与 Context 收口

目标：

- GUI 不再从散落状态推断 thread 状态。
- AgentContext facts 只以 refs/summary 进入 read model，不复制大上下文。

关键工作：

1. `AgentRuntimeThreadReadModel` 增加或统一字段：
   - `status`
   - `profileStatus`
   - `activeTurnId`
   - `turns`
   - `pendingRequests`
   - `queuedTurns`
   - `incidents`
   - `toolCalls`
   - `modelRouting`
   - `limitState`
   - `evidenceSummary`
   - `telemetrySummary`
   - `contextSummary`
   - `missingContext`
   - `compactionSummary`
   - `contextRefs / policyRefs`，只存 owner refs 或短 summary
2. Workspace / Harness 只消费 read model。
3. 旧 GUI 状态路径标记为 `compat` 并只做映射。
4. 现有 `turn_context`、`context_trace`、memory budget、context compaction metadata 收敛为 `context.*` facts 或 read model summary。
5. Context 侧必须保留 selected / omitted / budget / assembly / injection / compaction / missing context 的 owner refs；Runtime 不复制大 context payload。

退出条件：

- 主路径 GUI smoke 能展示 preparing/running/waiting_permission/completed/failed。
- 搜索不到新增 UI-only runtime truth builder。
- `context.resolved/context.compaction.*` 可 join 到 `session/thread/turn`，且 omitted / missing context 不被静默丢弃。

## 6. P3：Evidence 同源导出

目标：

- evidence pack、replay、analysis、review 共享 runtime facts。

关键工作：

1. `agent_runtime_export_evidence_pack` 加入 runtime correlation spine。
2. `agent_runtime_export_replay_case` 复用 evidence pack。
3. analysis handoff 和 review template 不再重建 observability summary。
4. known gaps 只从适用信号覆盖表导出。
5. evidence pack 引用 AgentContext source/selection refs 与 AgentPolicy decision/grant refs，不复制完整 owner payload。

退出条件：

- evidence fixture 包含 `session/thread/turn/task/run/evidence/trace`。
- replay/review/analysis 均能指向同一 evidence pack ref。
- completeness 按 `runtime/telemetry/sources/claims/artifacts/verification/privacy/replay` 分类声明，缺失事实标为 `unknown/unavailable/not_collected` 等，不推断成功。

## 7. P4：Task / routing / permission 扩展

目标：

- 让 Profile 覆盖 Lime 当前最关键的复杂运行态。
- 让 AgentPolicy 的 allow/deny/ask/defer/escalate/waive/not_applicable/indeterminate 结果成为可测试 runtime facts。

关键工作：

1. Task retry：
   - `task.created`
   - `task.attempt.started`
   - `task.attempt.failed`
   - `task.retrying`
   - `task.completed / task.failed`
2. Routing single candidate：
   - `task.profile.resolved`
   - `routing.single_candidate`
   - `routing.not_possible`
   - `routing.decided`
   - `cost.estimated`
   - `limit.changed`
3. Tool approval：
   - `permission.evaluated`
   - `action.required`
   - `action.resolved`
   - `tool.started`
   - `tool.result / tool.failed`
   - 真实 stream hook 以 `RuntimeAgentEvent::ToolStart / ToolEnd` 为首选事实源，`ItemStarted / ItemCompleted(ToolCall)` 只作同一执行流 fallback，并按 `toolCallId` 去重。
4. Policy linkage：
   - `policy.decision.created` owner ref
   - `approvalRequestId`
   - `permissionGrantId`
   - `riskLevel`
   - `reasonCodes`
   - `obligations / constraints`

退出条件：

- `tool-approval-action-required-event.json`、`task-retry-attempt-failed-event.json`、`routing-single-candidate-event.json`、`routing-not-possible-event.json`、`routing-decided-multi-candidate-event.json` 都有对应实现测试。
- `runtime_tool_profile_should_follow_real_tool_start_and_end_once`、`runtime_tool_profile_should_fallback_to_item_tool_call_failure` 必须通过，证明 tool facts 已从 read-model 反推前移到真实执行事件 hook，且不会被 ToolStart/ItemStarted 双路重复写入。
- `ask` 必须产生 `action.required`，`deny/indeterminate` 不能继续执行工具，`defer/escalate` 不能被 UI 当作允许，`allow/waive` 必须保留 obligations/constraints/scope refs。

## 8. P5：Subagent / Job / Remote Channel

目标：

- 把并行、后台和远程工作接入同一 profile。

关键工作：

1. `subagent.spawned / subagent.status / subagent.completed / subagent.failed / subagent.closed`
2. `job.created / job.item.started / job.item.failed / job.completed`
3. `channel.connected / channel.disconnected / channel.resumed / snapshot.repaired`
4. parent-child graph 写入 TaskSnapshot。

退出条件：

- `subagent-parent-child-event.json` 有对应实现测试，且 profile event 能回挂 `parentSessionId/parentThreadId/parentTaskId/createdFromTurnId`。
- `job-owner-run-event.json` 有对应实现测试，且 automation owner run 能输出 `job.created/job.status/job.item.started/job.item.failed/job.completed|job.failed`。
- `remote-channel-resume-event.json` 有对应实现测试，且 remote task owner run 能输出 `channel.connected/channel.disconnected/channel.resumed/snapshot.repaired`。
- 子代理失败能回挂 parent task。
- remote reconnect 后先读 snapshot，再补 replay 或标记 stale。

## 9. 测试计划

详细测试矩阵见 [./test-cases.md](./test-cases.md)。本节只保留阶段级测试口径。

### 9.1 结构测试

- 校验 Lime Profile fixtures。
- 校验 runtime 输出事件 required ids。
- 校验 snapshot 必含 thread/task/evidence/routing/telemetry summary。

### 9.2 Contract 测试

- Electron Desktop Host / App Server / legacy facade、frontend gateway、catalog、mock 与 profile control plane 映射一致。
- frontend gateway / App Server method / legacy facade handler / command catalog / mocks 同步。

### 9.3 Replay 测试

- 从 runtime event stream 重建 ThreadReadModel。
- 从 ThreadReadModel + evidence pack 生成 review/replay。

### 9.4 GUI smoke

- submit turn。
- tool approval。
- failed tool / denied permission。
- routing single candidate 展示。
- evidence export 展示。

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 改动面扩散到所有 runtime 模块 | 高 | 每阶段只收一个主链切片。 |
| UI 状态短期双轨 | 高 | compat 只允许委托，并写退出条件。 |
| Profile schema 过早收紧 | 中 | public schema 宽松，Lime profile 只约束 current core。 |
| Evidence 与 GUI 迁移不同步 | 中 | evidence 先修事实，GUI 后读 read model。 |
| 子代理/job 复杂度过早进入 | 中 | P5 后置，P1-P4 先证明主链。 |

## 11. PX / Markdown 本地化收口

2026-05-12 补记：

1. Evidence `summary.md` 保持 facts JSON 稳定，presentation copy 已按应用语言支持 zh-CN / zh-TW / en-US / ja-JP / ko-KR。
2. Replay `grader.md` 已接 `RuntimeReplayMarkdownCopy`，artifact title、主标题、读取顺序、评分原则、通过条件、阻塞检查和输出模板可按 locale 渲染。
3. Analysis `analysis-brief.md` 与 `copyPrompt` 已接 `RuntimeAnalysisMarkdownCopy`，外部分析标题、证据覆盖、读取顺序、文件分组、人工审核清单和关键摘录标题可按 locale 渲染。
4. Review `review-decision.md` 已接 `RuntimeReviewMarkdownCopy`，不再用标题替换后处理作为主方案，审核上下文、验证摘要、决策状态、风险、回归、后续动作等结构标题与核心标签由 locale copy 输出。
5. Runtime facts、`runtime.json`、`analysis-context.json`、`review-decision.json` 的 schema key 与 stable value 不随 locale 改变；locale 只影响 Markdown / copy prompt presentation。

退出条件：

- Rust 定向测试覆盖 Evidence / Replay / Analysis / Review Markdown locale。
- `cargo check -p lime --lib` 不出现 presentation copy unused warning。
- 未新增 legacy desktop facade、前端 gateway、mock 或 request shape；不得在 `lime-rs/src/commands/**` 新增业务逻辑。

## 12. 实施后的下一刀

P1-P5/PX 的 current MVP 已按 [./completion-audit.md](./completion-audit.md) 完成审计。Evidence service 已先拆出 request telemetry、profile projection、completion audit / controlled GET evidence、modality contract、auxiliary runtime、verification / artifact validator、observability / signal coverage、known gaps、pack output renderer、Markdown locale copy、artifact index、JSON/path/tool helper 与单测 fixture 模块；后续不再从 P1 重走，而是优先收这些非阻塞弱项：

1. 继续把 Replay / Analysis / Review Markdown 的正文段落、验证摘要和 review checklist 做细粒度 copy 化；当前已完成结构标题与核心标签 locale-aware。
2. 把文档 fixture 名补成真实 JSON fixtures，或在测试用例文档中明确“结构测试等价覆盖”的映射表。
3. 继续收敛超大测试 fixture，优先拆 `runtime_evidence_pack_service_tests.rs` 的 artifact / telemetry / approval 场景 fixture builder。
4. 用 Playwright 补一个最小 tool approval approve/deny 和 remote resume 产品级 E2E。
