# S6r canonical Inputbar and landing subtask stats

日期：2026-07-14

## 事实源

Landing task card、MessageList runtime status 和 Inputbar runtime status 的子任务统计
统一消费 Workspace scene 已有的 `CanonicalChildThreadSummary[]`。canonical child Thread
是唯一 roster owner；本刀没有新增 fetch、compat 包装或第二套状态源。

## 本轮收口

- `agentTaskRuntime.ts` 新增 `summarizeAgentTaskChildren`，复用
  `summarizeCanonicalChildThreads` 的 Codex 七态统计。
- `pendingInit/running` 计入 active，`pendingInit` 额外计入 queued；
  `completed/shutdown` 计入 completed；`errored/notFound/interrupted` 计入 failed。
- landing task card、MessageList、Inputbar 和 scene runtime 透传 `canonicalChildren`，删除
  `childSubagentSessions` 输入与只搬运空 legacy roster 的 projection deferral 字段。
- MessageList runtime status 与 landing task card 保留原有 turn、action、usage 和发送中
  状态行为；空 canonical roster 不生成子任务统计。
- 新增 boundary guard，禁止 Inputbar/landing/message-list owner 回流
  `childSubagentSessions`。

## 分类

- `current`：App Server canonical child Thread -> `CanonicalChildThreadSummary[]` ->
  Workspace scene -> landing/MessageList/Inputbar。
- `dead / retired guard-only`：上述 surface 的 legacy `childSubagentSessions` prop、
  reducer 和 deferral 搬运字段。
- `deprecated / follow-up`：`AgentSubagentSessionInfo`、session state/normalizer、
  App Server adapter 空字段、插件 fixture 与 export metrics 的 legacy roster contract；
  下一刀物理删除，不新增 compat。
- `compat`：本刀未新增。

## 验证

- focused Vitest：6 files / 41 tests passed，包含七态统计期望
  `total=7, active=2, queued=1, completed=2, failed=3`。
- `npm run typecheck`：renderer/node TypeScript 通过。
- claimed write set 的 exact ESLint 与 Prettier：通过。
- `npm run governance:legacy-report`：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- `npm run verify:gui-smoke`：退出码 0；renderer build、Electron host/preload、App Server
  `appserver.v0` 初始化、Claw workbench shell 和 memory settings smoke 完成。
- claimed tracked write set `git diff --check`：通过。

## 路线图关系

本刀关闭 canonical child roster 在 landing、MessageList 和 Inputbar 的统计旁路，完成
S6 的 GUI roster 收敛。下一刀回到 session contract 主链，删除剩余
`AgentSubagentSessionInfo` / `child_subagent_sessions` 的 state、normalizer、API fixture
和 export metrics 读取。
