# S7j Plugin Capability Thread Fixture Alignment Evidence

## 结论

Plugin capability current owner 会在 startTask 后持久化 canonical `threadId`，后续 get/cancel 必须以
该 thread identity 访问并校验返回身份。batch 52 的 shared fixture 仍返回 session-only start/cancel
结果，导致测试与 production contract 漂移；S7j 只修正测试 fixture 和对应断言。

## 实际补丁

- `capabilityDispatcherTestFixtures.ts` 的 startTask fixture 返回
  `threadId: "agent-runtime-thread-1"`。
- cancelTask fixture 改为返回完整 cancel result，并回显请求中的 canonical `threadId`。
- `capabilityDispatcher.unit.test.ts` 的 cancel handoff 断言从 `sessionId` 改为
  `threadId: "agent-runtime-thread-1"`。
- `AgentRuntimeCapabilityHost`、dispatcher production implementation 和协议类型均未由本切片修改。

## 分类

- `current`：`AgentRuntimeCapabilityHost` 持久化的 `RuntimeTaskState.threadId`，以及 get/cancel 的
  canonical thread lookup 和 identity conflict check。
- `test-only`：shared capability dispatcher fixture 与 cancel handoff assertion。
- `dead / forbidden-to-restore`：仅凭 `sessionId` 执行 Plugin task get/cancel、缺失 thread identity 的
  accepted/cancel result。
- `compat / deprecated`：本切片没有新增或保留项。

## 验证

```text
npm exec vitest run src/features/plugin/runtime/capabilityDispatcher.unit.test.ts
=> 1 file / 20 tests passed
```

该测试真实加载 `src/features/plugin/testing/capabilityDispatcherTestFixtures.ts`，因此同时覆盖 shared
fixture 与 dispatcher assertion；验证针对当前共享工作树。
