# S6t legacy session roster contract retirement

日期：2026-07-14

## 结论

Renderer session API 不再定义、normalize、返回或缓存 legacy SubAgent roster：

- 删除 `AgentSubagentSessionInfo`、`AgentSubagentParentContext`、
  `AgentSubagentSkillInfo` 和 child/sibling/parent roster 字段。
- 删除 legacy subagent session/parent normalizer 与两个零调用 runtime-status helper。
- App Server session detail 的两个 object-spread 边界显式删除 retired child/parent key，
  防止旧输入穿透类型边界。
- Electron plugin runtime 与 tool-surface smoke 不再构造空 roster fixture。
- 删除零调用 `teamWorkspaceCopy.ts` dead leaf；parent-thread visibility 已由
  `useCanonicalChildThreads.hasParentThread` 承接。

## 分类

- `current`：canonical thread family 的 `parentThreadId`、
  `CanonicalChildThreadSummary[]` 与 canonical AgentGraph。
- `dead / deleted`：session detail child/sibling/parent roster DTO、normalizer、React
  plumbing、空 fixture producer 和零调用 display helper。
- `compat`：无。
- `deprecated`：无；API 读取边界只保留对旧 key 的显式删除，不解释或消费旧值。

## 验证

- App Server session client、agent API 与 contract boundary：3 files / 60 tests passed。
- `clientFactory` 的 session create/list/get 精确回归：1/1 passed。
- shared `npm run typecheck`：renderer/node 通过。
- exact ESLint、Prettier 与 claimed diff check：通过。
- `npm run governance:legacy-report`：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- shared `npm run verify:gui-smoke`：退出码 0；renderer、Electron host/preload、
  App Server `appserver.v0`、Claw workbench shell 与 memory settings ready。

首次把完整 `clientFactory.test.ts` 纳入 API focused 时为 69/70；唯一失败是未触及的
turn-lifecycle `standardRuntimeClient.readThread` 旧期望。与本刀直接相关的 session
create/list/get 用例单独复跑 1/1 通过。
