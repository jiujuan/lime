# S5 Thread Read UI Current Owner Migration

时间：2026-07-14

## 结论

5 个 Agent Chat UI `AgentRuntimeThreadReadModel` consumer 已从
`@/lib/api/agentRuntime` compat 根 barrel 迁到唯一 current owner
`@/lib/api/agentRuntime/sessionTypes`。本切片只改变 TypeScript 类型 import owner，
不改变 Thread/Turn/Item read model identity、投影行为或 UI 行为。

## 写集

- `components/MessageTimelineSection.tsx`
- `components/useMessageListTelemetry.ts`
- `components/MessageListItem.tsx`
- `components/AgentThreadTimeline.tsx`
- `components/generalWorkbenchRunControlSurfaceViewModel.ts`
- `components/threadReadCurrentBoundary.test.ts`

S6r Inputbar/MessageList/scene/deferral、S2l history repair、provider stream/send、
AgentChatWorkspace、Electron、Rust 与协议均未触碰。

## 分类

- `current`：`src/lib/api/agentRuntime/sessionTypes.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 5 个 consumer 对 root compat barrel 的直接 import，
  受 `threadReadCurrentBoundary.test.ts` 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：1 file / 1 test passed。
- exact-set ESLint passed。
- boundary test Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。
- 5 个生产文件 `git diff --numstat` 均为 `1 1`，并通过 production import-only diff review。

共享工作树仍有其他 S5/S6 进程迁移 Agent Chat root-barrel consumers；全局计数受并行写入影响，
本切片归属固定为上述 5 个生产文件，不以全局净变化替代精确写集证据。

## 下一刀

继续按领域迁出剩余 Agent Chat root-barrel consumers；session roster DTO 的物理删除应等待
S6r 释放 Inputbar/MessageList/scene/deferral 写集后再进行。随后回到 S6 legacy session roster
contract retirement 与最终 S7/`verify:local` 审计。
