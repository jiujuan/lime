# S4ai dead synthetic Team fixture evidence

日期：2026-07-15

## 结论

`scripts/agent-runtime/multi-agent-team-fixture-scenario.mjs` 通过 external backend 伪造
`subagent_status_changed`、`team.changed`、`task.changed`、`agent.handoff`、
`agent.completed` 与 `worker.notification`。它没有经过 RuntimeCore AgentControl、durable
AgentGraph/mailbox 或 canonical SubAgent producer，不能继续作为真实 Multi-Agent Gate B。

该 scenario 及 15 个直接 consumer 已物理删除/迁出，净删 707 行，包括 constants、CLI option、
backend synthetic branches、scenario flow、read-model/evidence summary、assertions、regression runner
与正向 guard。`src/lib/governance/agentSubagentStatusChannelBoundary.test.ts` 中最后一个已删文件读取
也已清除。

路线图与 Project/Thread 执行记录已改用 S4ae/S4ah canonical AgentControl evidence。remote task 等
真实 structured source 的 `worker.notification` 明确保留，不属于本切片。

## 验证

- 14 个剩余脚本 `node --check`：14/14。
- Claw current fixture guard：54/54。
- current fixture regression guard：16/16。
- `npm run governance:scripts`：通过。
- `npm run docs:boundary`：通过。
- scoped `git diff --check`：通过。

## 分类

- `current`：six AgentControl + AgentGraph/identity/mailbox + canonical Thread/Turn/Item/SubAgent GUI。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：synthetic `multi-agent-team` scenario 及其正向证据消费者。
