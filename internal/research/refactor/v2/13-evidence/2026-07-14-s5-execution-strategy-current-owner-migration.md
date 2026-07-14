# S5 Execution Strategy Current Owner Migration

时间：2026-07-14

## 结论

5 个干净的 Agent Chat execution-strategy consumer 已从
`@/lib/api/agentRuntime` compat 根 barrel 迁到唯一 current owner
`@/lib/api/agentExecutionRuntime`。本切片只改变 TypeScript 类型 import owner，
不改变 runtime lowering、发送策略或 UI 行为。

## 写集

- `commands/types.ts`
- `skill-selection/runtimeInputCapabilityCatalog.ts`
- `utils/agentRuntimeStatus.ts`
- `utils/chatToolPreferences.ts`
- `hooks/agentChatStorage.ts`
- `utils/executionStrategyCurrentBoundary.test.ts`

S6r Inputbar/MessageList/scene、provider stream/send、AgentChatWorkspace、Electron、Rust 与协议均未触碰。

## 分类

- `current`：`src/lib/api/agentExecutionRuntime.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 5 个 consumer 对 root compat barrel 的直接 import，受 boundary test 防回流。
- `deprecated`：无新增。

## 验证

- focused Vitest：1 file / 1 test passed。
- exact-set ESLint passed。
- exact-set Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift / 0 boundary violations。
- claimed write set `git diff --check` passed。

共享工作树中的 Agent Chat 精确 root import 计数从此前 159 降到 151；其中本轮归属 5 个，
另外 3 个由并行 S6r 迁出，不归入本 slice。

## 下一刀

继续按领域迁出剩余 151 个 root-barrel consumer；优先选择干净的 queued-turn、thread-read 或
session-detail 类型 consumer，并避让仍在进行的 S6r 与 provider/session 热区。
