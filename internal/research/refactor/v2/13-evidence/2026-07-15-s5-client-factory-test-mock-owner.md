# S5 Client Factory Test Mock Owner

## 结论

`agentRuntimeAdapter.test.ts` 与 `useAgentChat.testUtils.tsx` 已把
`createAgentRuntimeClient` mock 从已删除的 root barrel 迁到
`agentRuntime/clientFactory` current owner。`agentRuntimeClientOwnerBoundary.test.ts` 同时守卫两个
test surfaces 必须 mock direct owner，禁止 root mock 回流。

## 分类

- `current`：`agentRuntime/clientFactory` 与 production adapter。
- `dead / deleted / forbidden-to-restore`：两个 test root mocks。

## 验证

- focused Vitest：3 files / `204/204` 通过，其中 `useAgentChat` 191、adapter 11、guard 2。
- exact ESLint、Prettier、typecheck、mock-owner scan 与 diff check：通过。
- 运行日志仅包含既有 provider fallback 和 React `act()` warnings，无 assertion failure。

## 协调恢复

原 claim 源码 diff 完成后长时间未更新 evidence/lock，且无对应测试进程；coordinator 在不改源码的
前提下补齐验证并释放元数据。
