# S7l Plugin Host Bridge Thread Fixture Alignment Evidence

## 结论

Plugin Runtime Page 的 production client 已通过 session gateway 调用 App Server canonical
`readThread`，batch 55 失败来自 Host Bridge page fixture 只提供 `readSession`。S7l 为测试 client 补齐
`readThread` 和 canonical Thread/Turn response，并把断言对齐 thread-first 读取；生产页面、gateway、
Host Bridge 和 App Server 均未修改。

## 实际补丁

- `PluginRuntimePage.testFixtures.tsx` 的 App Server mock catalog 与 factory 返回值补 `readThread`。
- `readThread` fixture 返回 canonical thread identity、`turnsView`、完整 Turn identity/status 与空 Item
  列表；fixture response id 顺延，避免复用同一 JSON-RPC id。
- `PluginRuntimePage.hostBridge.test.tsx` 从期待
  `readSession({ sessionId: "plugin-session-1" })` 改为期待
  `readThread({ threadId: "plugin-thread-1", turnsView: "full" })`。
- 既有 `readSession` mock 没有被声明为全局 dead；本切片只否定它作为 Plugin runtime task refresh
  owner 的旧测试语义。

## 分类

- `current`：`createPluginRuntimeClientFromAppServer` 的 session gateway、App Server
  `thread/read`、canonical Thread/Turn projection。
- `test-only`：Runtime Page App Server mock、canonical read response 与 Host Bridge assertion。
- `dead / forbidden-to-restore`：Plugin runtime task refresh 通过 session-only `readSession` 完成的旧
  fixture/fallback 语义。
- `compat / deprecated`：本切片没有新增或保留项。

## 验证

```text
npm exec vitest run src/features/plugin/ui/PluginRuntimePage.hostBridge.test.tsx
=> 1 file / 9 tests passed
```

验证针对当前共享工作树；test-only fixture 没有引入生产 mock fallback，也没有恢复 session-only task
identity。

## 聚合收尾

- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed；S7l 为 9/9。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已推进并完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。
