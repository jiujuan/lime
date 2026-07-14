# S7k Client Factory Session Read Owner Alignment Evidence

## 结论

`createAgentRuntimeClient` 注入 standard runtime client 时，只把它用于 turn lifecycle；
`getAgentRuntimeThreadRead(sessionId)` 仍由 Lime `threadClient` 通过 App Server `readSession` 读取并投影。
batch 53 的测试把 session read 错误地断言给 `standardRuntimeClient.readThread`。S7k 只纠正 owner
断言，没有修改 client factory 或生产路由。

## 实际补丁

- 测试名称明确区分“standard client lifecycle injection”与“App Server session read owner”。
- 保留 `standardRuntimeClient.startTurn` 的正向调用断言。
- `standardRuntimeClient.readThread` 改为零调用断言。
- `appServerClient.readSession({ sessionId: "session-1" })` 改为正向调用断言。
- `appServerClient.startTurn` 与 legacy `bridgeInvoke` 继续保持零调用。

## 分类

- `current`：turn lifecycle 的 standard runtime client 注入；
  `getAgentRuntimeThreadRead(sessionId) -> appServerClient.readSession -> projectAppServerSessionReadResult`
  的 Lime App Server read model owner。
- `test-only`：`src/lib/api/agentRuntime/clientFactory.test.ts` 的 owner assertion。
- `dead / forbidden-to-restore`：把 session read 路由到注入 client `readThread` 的错误 fixture 语义，
  以及 legacy bridge fallback。
- `compat / deprecated`：本切片没有新增或保留项。

## 验证

```text
npm exec vitest run src/lib/api/agentRuntime/clientFactory.test.ts
=> 1 file / 10 tests passed
```

## 后续

`AgentRuntimeLifecycleClient` 类型当前仍包含本聚合路径零调用的 `readThread`。后续可在独立 current
owner 切片确认其他消费者后收窄类型；本 test-only 修复不通过修改 production type 扩大范围。
