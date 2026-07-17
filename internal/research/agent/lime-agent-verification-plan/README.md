# Lime Agent 可验证研发体系计划

> 状态：planning skeleton
> 更新时间：2026-07-02
> 目标：把 `lime-verifiable-agent-development-researched.md` 中的判断拆成可执行计划，尤其解决 Agent QC token 成本过高、难以长期全量运行的问题。

## 0. 核心判断

Lime 不是缺测试入口，而是缺一套默认节制的验证调度策略。

当前已存在：

- `verify:local`
- `test:contracts`
- `verify:gui-smoke`
- `smoke:agent-runtime-*`
- `harness:eval`
- `agent-qc:*`
- qcloop worker / verifier / Evidence Pack
- Agent UI projection
- Managed Objective evidence audit

真正的问题是：

```text
如果每次改动都让 Agent QC / qcloop / LLM verifier 全量跑，
token、时间、GUI owner、Provider 额度都会不可控。
```

所以本计划采用一个原则：

**默认低 token，证据复用优先；只有高风险、发布、或语义不确定时才升级到 LLM / qcloop / live Provider。**

## 1. 阅读顺序

1. [当前资产地图](./00-current-assets.md)
2. [Token 预算策略](./01-token-budget-strategy.md)
3. [Agent QC 分级策略](./02-agent-qc-triage.md)
4. [验证合同模板](./03-verification-contract-template.md)
5. [P0 green 计划](./04-p0-green-plan.md)
6. [场景分层与命令选择](./05-scenario-lanes.md)
7. [Supervisor / LLM judge 使用边界](./06-supervisor-and-judges.md)
9. [30 / 60 / 90 天路线图](./08-30-60-90-roadmap.md)
10. [推进进度追踪](./09-progress-tracker.md)
11. [样例：command-bridge-contract Verification Contract](./10-example-contract-command-bridge.md)
12. [样例：command-bridge-contract structured evidence summary](./11-command-bridge-evidence-summary-example.md)
13. [样例：harness-replay-regression structured evidence summary](./12-harness-replay-evidence-summary-example.md)
14. [样例：workspace-ready-session-restore structured evidence summary](./13-workspace-ready-evidence-summary-example.md)
15. [样例：browser-runtime-site-adapter structured evidence summary](./14-browser-runtime-site-adapter-evidence-summary-example.md)
16. [样例：skill-forge-register-bind-enable structured evidence summary](./15-skill-forge-evidence-summary-example.md)
17. [样例：tool-approval-sandbox-boundary structured evidence summary](./16-tool-approval-sandbox-evidence-summary-example.md)
18. [样例：claw-chat-ready-streaming structured evidence summary](./17-claw-chat-ready-streaming-evidence-summary-example.md)
19. [样例：release-package-startup-smoke structured evidence summary](./18-release-package-startup-evidence-summary-example.md)
20. [Managed Objective 场景草案](./19-managed-objective-scenario-draft.md)

## 2. 和现有文档的关系

本目录不替代现有事实源。

它只做一件事：把现有事实源组织成“预算可控的研发验证计划”。

主要依赖：

- `internal/research/agent/lime-verifiable-agent-development-researched.md`
- `internal/tests/agent-ops-qc.md`
- `internal/tests/agent-qc-p0-scenarios.md`
- `internal/tests/lime-agent-autonomous-test-execution-matrix.md`
- `internal/tests/lime-agent-qc-evidence-contract.md`
- `internal/tests/lime-agent-qc-current-blockers.md`
- `internal/aiprompts/harness-engine-governance.md`
- `internal/roadmap/agentui/lime-agentui-standard-alignment.md`
- `internal/roadmap/managed-objective/implementation-plan.md`

## 3. 近期优先级

短期不要继续盲目补全量 qcloop。

近期只做三件事：

1. 把 Agent QC 切成 token 分级模式。
2. 让每个 Agent 主链改动先填 Verification Contract。
3. 把官方 P0 Evidence Pack 的 blocker 拆成可低成本关闭的小项。
4. 把 Managed Objective 收成单独的 P1 / P2 场景草案，优先复用 `objective-checklist`、`managed-objective-continuation`、`managed-objective-automation`，不要直接跳 full qcloop。

当前进度统一记录在 [推进进度追踪](./09-progress-tracker.md)。

## 4. 完成标准

本计划第一阶段完成时，应满足：

- 普通 Agent 改动不默认消耗 live Provider token。
- qcloop 只在明确场景集合上运行，不做开放式探索。
- LLM judge 只处理模糊语义，不审 deterministic contract。
- P0 release gate 仍保持硬门槛，但日常开发使用 cheaper lanes。
- 每个失败都能回写成更便宜的 deterministic check / fixture / replay。
