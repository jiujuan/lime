# S5 Agent Runtime Compat Current Owner 迁移证据

> date: 2026-07-14
> slice: S5-agent-runtime-compat-current-owner-migration
> owner: root

## 事实源

`src/lib/api/agentRuntime.ts` 只保留待清退的 compat re-export。每个 consumer 必须直接依赖
拥有其类型或行为的 current owner：

```text
session/read-model DTO -> agentRuntime/sessionTypes
queued-turn DTO -> queuedTurn
file checkpoint command -> agentRuntime/threadClient
review decision DTO -> agentRuntime/evidenceTypes
```

## 已迁移

- plugin history session selection 的 `AgentSessionInfo` 迁至 `sessionTypes`；
- legacy SceneApp execution summary 仅保留的 review-decision DTO 迁至 `evidenceTypes`；
- Agent Chat reliability/file-checkpoint 显示域的 Thread read-model、outcome/request/
  incident、summary 和 provider safety buffering DTO 全部迁至 `sessionTypes`；
- queued turn 迁至 `queuedTurn`；file checkpoint list/get/diff/restore 调用以及对应测试 mock
  迁至 `threadClient`；
- 新增 plugin history、legacy summary、reliability 三个局部 boundary test，禁止这些域回绕
  root compat barrel。

本切片不修改 App Server protocol/runtime、stream/send、`AgentChatWorkspace`、
`useWorkspaceSendActions` 或 legacy Team runtime。

## 验证

- plugin history boundary + unit：4 tests 通过；
- legacy SceneApp summary boundary：2 tests 通过；
- reliability/file-checkpoint boundary + panel + utility 定向集：54 tests 通过；
- 精确写集 ESLint：通过；
- `npm run typecheck`：通过；
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移候选 `0`、边界违规 `0`；
- 精确写集 `git diff --check`：通过。

静态计数从本轮开始前的 root-barrel consumer `228` 降至 `213`。非 Agent Chat 的生产
consumer 已清零；搜索剩余命中均为 boundary test 的负向断言。

## 分类

- `current`：`sessionTypes`、`queuedTurn`、`threadClient`、`evidenceTypes`；
- `compat`：`src/lib/api/agentRuntime.ts`，仍有 207 个 Agent Chat consumer 待按领域迁移；
- `deprecated`：本切片未新增；
- `dead / forbidden-to-restore`：已迁 domain 对 root compat barrel 的 import 或 mock。

## 协调与后续

S4w 的过期 active lock 已按协议写入 stale-recovery handoff，并标为 `released`，未删除锁目录或
修改其 Rust 写集。中央实施计划存在并行脏改，本切片不夹写；coordinator 应从本 evidence 和
`.lime/refactor-v2/handoffs/20260713T233516Z-S4w-agent-mailbox-production-consumer-stale-recovery-root.md`
汇入 S4w、S5 与 S6 状态。

下一刀应继续按独立 Agent Chat 显示域迁移 remaining root-barrel consumer；不得把类型直连扩展成
第二套 read model 或改动 runtime 主链。
