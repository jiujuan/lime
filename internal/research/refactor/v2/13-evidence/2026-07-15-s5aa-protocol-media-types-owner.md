# S5aa Protocol / Media Types Owner

## 结论

`agentProtocolEventTypes.ts`、`agentProtocolOps.ts` 与 `mediaTasks.ts` 已从
`agentRuntime/types` 迁到 `agentExecutionRuntime`、`sessionTypes`、
`mediaTaskTypes` 和 `@limecloud/app-server-client` direct owner。wire protocol、media request 和
export behavior 未改变。

## 分类

- `current`：execution/session/media/package direct owners。
- `dead / forbidden-to-restore`：三个 source consumer 的 compat type import/export。

## 验证

- protocol/media focused Vitest：4 files / `39/39`。
- exact ESLint、Prettier、compat scan 与 diff check：通过。
- shared typecheck、App Server client contract `288`、完整 `test:contracts`：通过。
