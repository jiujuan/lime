# S5i Root Barrel Dynamic Type Residual

## 结论

`agentSessionRefresh.ts` 与 `agentStreamUserInputSendPreparation.ts` 最后的三处
`import("@/lib/api/agentRuntime").Type` 已迁到 direct current owner type import：

- `AgentExecutionStrategy` -> `@/lib/api/agentExecutionRuntime`
- `AutoContinueRequestPayload` -> `@/lib/api/agentRuntime/sessionTypes`

两条已有 boundary guard 同时从“只禁止 static `from`”收紧为“禁止 exact root module
specifier”，因此 dynamic type query 不能再绕过守卫。实现只改变 TypeScript type owner，不改变
refresh、prepared-send、queue intent、协议或 GUI 行为。

## 分类

- `current`：`agentExecutionRuntime` 和 `agentRuntime/sessionTypes` direct owner。
- `compat`：`src/lib/api/agentRuntime` root barrel 仅剩 test / fixture / guard 文本消费者。
- `deprecated`：无。
- `dead / forbidden-to-restore`：production static import 或 dynamic type query 指向 exact root
  `@/lib/api/agentRuntime`。

## 验证

- focused Vitest：4 files / `30/30` 通过。
- exact ESLint、Prettier 与 claimed diff check：通过。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移候选 `0`、边界违规 `0`。
- 两个 claimed production 文件的 exact root specifier：`0`。
- 全仓 `src/**` production exact root module specifier：`0`；剩余命中全部位于
  test / fixture / mock / current-boundary 文件。

## 并行边界

S5i 没有触碰 active component/session-hook/workspace 切片。它们随后均按各自 claim 完成并释放；
S5i 只收掉两个未被其它 claim 覆盖的 dynamic type query residual。

## 下一刀

生产路径已经不需要 root barrel。下一阶段应分批迁移 test mock / fixture import，并在测试面归零后
物理删除 `src/lib/api/agentRuntime` root barrel；不得用新的 test compat helper 延长旧入口。
