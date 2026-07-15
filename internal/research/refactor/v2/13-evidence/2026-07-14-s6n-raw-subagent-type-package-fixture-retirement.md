# S6n raw SubAgent type/package/fixture retirement evidence

> 2026-07-15 后续纠正：本文件记录的 `multi-agent-team` Electron run 包装了 external
> synthetic Team events，只是当时 fixture 结果，不再作为产品 Gate B。current canonical
> AgentControl visible DOM Gate B 见 S4ah evidence；S6n 物理删除与 focused 结论仍有效。

## 结论

raw SubAgent status 侧链已经完整退出生产实现和正向测试口径：

- 删除 Renderer `subagentStatusProjection` 及其正向测试。
- 删除 projection package `subagentStatusEvents` helper 及其正向测试，三个 barrel 不再导出 raw helper。
- 删除 `AgentEventSubagentStatusChanged`、`AgentSubagentRuntimeStatus` 与 union 分支。
- 删除只服务 raw status 的 runtime facts helpers，以及 summary、i18n、fixture 和 current docs 中的正向口径。
- Multi-Agent fixture 只发送 canonical Item，并通过 child identifiers 验证 canonical roster。
- negative guard 阻止已删文件、类型、helper、source type 和 fixture producer 回流。

没有新增 compat parser、fallback 或 mock producer。legacy `AgentSubagentSessionInfo` / `child_subagent_sessions` DTO 仍有任务统计、Team memory、导出指标和 session state 消费者，留给独立切片迁移，未混入本刀。

## 唯一事实源与分类

- `current`：canonical SubAgent Item / `subagent_activity`、`thread/list` child lifecycle、`runtime_status -> team.changed`、generic EventLog/hydration。
- `dead / deleted`：raw status/stream channel、raw TS type/parser/projector、projection package helper、raw fixture producer、summary/i18n 和 current docs 正向口径。
- `test-only`：协议、DevBridge 和治理 guard 中的 retired 负向字符串。
- `follow-up`：legacy roster DTO 与它的统计、memory、export、session-state consumers；不得恢复为 GUI current owner。

## 验证

- `npm --prefix packages/agent-runtime-projection test`：295/295。
- focused Renderer / fixture tests：136/137；本切片相关用例全部通过，唯一失败为既有 `action_required.request_id` fixture 漂移，期望 `req-action-1`、实际 `claw_request_turn_1`。
- raw status governance guards：16/16。
- `npm run typecheck`：通过。
- `npm run i18n:check`：覆盖率 100%，missing/extra 均为 0。
- `npm run i18n:unused`：unused 0。
- `npm run governance:legacy-report`：零引用候选、分类漂移、边界违规均为 0。
- `npm run test:contracts`：App Server client 288 checks 与 command/harness/modality/scripts/release/cleanup 主体 gates 通过；最终 docs boundary 被并行索引的 `internal/exec-plans/release-v1.102.0-plan.md` 阻断，与本切片无关。
- Multi-Agent Electron Gate B：通过；证据为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-multi-agent-team-s6n-summary.json`。
- `npm run smoke:agent-runtime-current-fixture`：历史、stream、首页、Workbench、图片、停止继续、Approval、全部 Inputbar 和 Plan 场景通过；Skills Runtime 因外部 Provider 鉴权失败退出，属于已知环境 blocker。
- `npm run verify:gui-smoke`：通过。

## 路线图关系

本刀关闭 S6 的 raw SubAgent status/stream 侧链，使 GUI 活动和成员状态继续只向 canonical Thread/Turn/Item 与 child lifecycle 收敛。下一刀回到 S6 legacy roster DTO 迁移，优先删除 canonical UI fallback，并让 subtask stats 直接消费 canonical child facts。
