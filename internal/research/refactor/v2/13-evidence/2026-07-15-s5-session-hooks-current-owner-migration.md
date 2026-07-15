# S5 Session Hooks Current Owner Migration

日期：2026-07-15

状态：completed / focused-import-boundary-validated / released

## 事实源

Session hook 消费者直接依赖各领域 current owner：client 构造归
`agentRuntime/clientFactory`，session 请求归 `agentRuntime/requestTypes`，session/read/todo/
auto-continue 归 `agentRuntime/sessionTypes`，queued turn 归 `queuedTurn`，执行策略与执行
runtime 归 `agentExecutionRuntime`，协议搜索模式归 `@limecloud/app-server-client`。
`agentRuntime` package root 仅为迁移期 compat barrel，不再是本切片四个 production consumer
的 import owner。

## 变更

- `agentRuntimeAdapter.ts` 将 client、request、session 与 execution strategy 分别迁到 direct owner。
- `agentSessionState.ts` 与 `useAgentSession.ts` 将 execution runtime、session read/todo、queued turn
  分别迁到 direct owner。
- `agentStreamSubmitExecution.ts` 将 execution runtime、auto-continue、queued turn 与
  `RuntimeSearchMode` 分别迁到 direct owner。
- 四个文件只改 import；函数体、请求参数、状态机和运行时行为未改变。
- 缩窄后的四文件没有 `readThreadSessionId` 直接 import，因此未新增无消费者的
  `agentRuntime/threadClient` import。

`useAgentChat.ts` 在开工 gate 时已有外部未暂存改动，本切片明确避让；中央计划、S7y、
active status-surface residual 与 i18n 均未触碰。

## 验证

```text
npx eslint --max-warnings 0 <four hook files>
# passed

npx prettier --check <four hook files>
# passed

npx vitest run \
  agentRuntimeAdapter.test.ts \
  agentSessionState.test.ts \
  agentSessionState.localSnapshot.test.ts \
  agentSessionState.runtimeSync.test.ts \
  agentSessionState.webTools.test.ts \
  agentStreamSubmitExecution.test.ts --reporter=dot
# 6 files passed; 66 tests passed

npm run typecheck
# passed

rg 'from "@/lib/api/agentRuntime"' <four hook files>
# no matches

git diff --check -- <four hook files>
# passed
```

## 治理分类

- `current`：`clientFactory`、`requestTypes`、`sessionTypes`、`queuedTurn`、
  `agentExecutionRuntime` 与 app-server-client protocol type direct imports。
- `compat`：`agentRuntime` root barrel 仍服务未迁出的其它 consumer；本切片四文件已退出。
- `deprecated`：无新增。
- `dead`：本切片未删除代码；四个 root-barrel import 已从 production consumer 消失。

下一刀是等待 `useAgentChat.ts` 外部写集释放后，以独立 clean gate 迁移其剩余 root-barrel
imports；不得把本切片扩大到该脏文件。
