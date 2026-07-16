# S6n2 Synthetic Team Projection Retirement

日期：2026-07-15

## 事实源判断

RuntimeCore AgentControl、canonical child Thread 和 Thread/Turn/Item projection 是 GUI Subagents 的唯一 current owner。`runtime_status -> team.changed` 与 Team control 生成的独立 Team snapshot 没有真实执行消费者，只是旧的 summary/board 旁路。

## 已删除

- projection package 的 `buildAgentUiRuntimeTeamChangedEvent` 及输入类型。
- taxonomy/visual snapshot 生成 synthetic `team.changed` 的两个 builder；保留 snapshot 提取器作为结构化测试事实。
- App Server replay 的 raw `subagent.status_changed` 正向映射；旧事件 fail-closed。
- Renderer runtime lifecycle 的 Team snapshot 分支。
- Renderer Team control projection 的 `team.changed` 事件；保留 `task.changed` 和 `agent.handoff`。
- summary 的 synthetic Team 正向 label/fixture、runtime-facts 中仅测试消费的 Team topology helper、过时 README 文案。
- package 正向测试中 raw `subagent.status` fixture，改为 canonical `agent.changed`。

## 保留边界

- `run.status` 仍携带并发/队列 facts（`team_phase` 等）作为 runtime 状态字段，不再包装成 Team snapshot。
- canonical `team_roster` surface、AgentControl 六工具、`subagent_activity`、`task.changed`、`agent.handoff` 和 child Thread navigation 继续 current。
- `team.changed` wire 类型与 Rust evidence 历史读取暂不扩散为 producer；新代码不得生成该事件。

## 分类

- `current`：`run.status`、AgentControl/task/handoff、canonical SubAgent Item/Thread。
- `compat -> dead`：runtime Team snapshot 与 synthetic Team control event，已删除。
- `deprecated`：raw `subagent.status_changed` replay，已 fail-closed。
- `dead`：package/Renderer synthetic Team builder、正向 summary/i18n 入口。

## 验证

- `packages/agent-runtime-projection`: build/typecheck/test 293/293。
- `lime-core workspace::types::tests`: 14/14。
- `git diff --check`、治理扫描与后续全局 contracts/typecheck 作为收口门禁。
