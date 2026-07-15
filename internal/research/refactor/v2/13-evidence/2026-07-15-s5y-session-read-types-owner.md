# S5y Session Read Types Owner

## 结论

9 个 session/read-model client、projector 与对应测试 consumer 已停止从
`agentRuntime/types` compat barrel 取类型。session、objective、read-model 与 checkpoint DTO
直连 `sessionTypes`，command request 直连 `requestTypes`，execution strategy 直连
`agentExecutionRuntime`；运行时行为与测试夹具未改变。

## 分类

- `current`：`agentRuntime/sessionTypes`、`agentRuntime/requestTypes` 与
  `agentExecutionRuntime`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：本轮 9 个 `./types` import。

## 写集与避让

- 修改：`sessionNormalizers.ts`、`appServerReadModelClient.ts`、`objectiveClient.ts`、
  `objectiveClient.test.ts`、`sessionClient.ts`、`appServerSessionClient.ts`、
  `threadClient.ts`、`threadClient.test.ts`、`appServerReadModelProjection.ts`。
- 避让：中央计划、`types.ts` / `types.d.ts`、declaration、protocol、media、Workspace、
  Electron、App Server Rust、i18n 与其他 active claim。

## 验证

- focused Vitest：6 files / `88/88` 通过。
- exact ESLint、Prettier 与 `git diff --check`：通过。
- claimed compat consumer：`9 -> 0`。
- fresh 非声明 production `./types` scan：剩 `exportClient.ts`、`inventoryClient.ts`；不在本轮写集。
- 按协调约束未运行 shared typecheck / contracts，留给 coordinator 在合并工作树统一执行。

## 下一刀

由新的窄 claim 迁移 `exportClient.ts` / `inventoryClient.ts` 到各自 evidence/tool owner，随后按
declaration owner 拆除声明残留；最终反转守卫并物理删除 `types.ts` / `types.d.ts`。
