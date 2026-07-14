# S7i Plugin Runtime Thread Fixture Alignment Evidence

## 结论

Plugin runtime production contract 已要求 start/cancel/get 结果和 task lookup 携带 canonical
`threadId`，batch 44 失败来自 `pluginRuntime.test.ts` 仍构造 session-only fixture。S7i 只把测试
输入输出对齐现有 current contract，没有修改 command、Electron Host、App Server 或生产实现。

## 实际补丁

- start task accepted fixture 补 `threadId: "thread-1"`。
- cancel/get task 的返回 fixture 补 canonical `threadId`。
- cancel/get 请求从 `sessionId` 改为 contract 要求的 `threadId`。
- task snapshot 与 diagnostic/error-envelope 负向用例同步使用 `threadId`，没有增加 session fallback。

## 分类

- `current`：`src/lib/api/pluginRuntime.ts` 的 `PluginRuntimeStartTaskResult`、
  `PluginRuntimeCancelTaskRequest/Result`、`PluginRuntimeGetTaskRequest` 与
  `PluginRuntimeTaskSnapshot` canonical thread identity。
- `test-only`：`src/lib/api/pluginRuntime.test.ts` 的 command facade fixtures。
- `dead / forbidden-to-restore`：cancel/get 仅凭 `sessionId` 定位 Plugin task 的旧 fixture 与 fallback
  语义。
- `compat / deprecated`：本切片没有新增或保留项。

## 验证

```text
npm exec vitest run src/lib/api/pluginRuntime.test.ts
=> 1 file / 6 tests passed
```

验证针对当前共享工作树；S7i 的 claimed patch 为 test-only，未把相邻生产或其他并行 diff 归入本
切片。
