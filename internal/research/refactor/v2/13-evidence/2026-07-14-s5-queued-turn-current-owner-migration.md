# S5 Queued Turn Current Owner Migration

时间：2026-07-14

## 结论

6 个 Agent Chat queued-turn consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel
迁到 DTO 唯一 current owner `@/lib/api/queuedTurn`。本切片只改变
`QueuedTurnSnapshot` 类型 import owner，不改变队列排序、恢复计划、提升/移除动作或 Inputbar UI。

## 写集

- `agentStreamInputRestorePlan.ts`
- `agentStreamInputRestoreTypes.ts`
- `agentQueuedTurnProjection.ts` 及 unit test
- `InputbarCore.tsx`
- `QueuedTurnsPanel.tsx`
- `queuedTurnCurrentBoundary.test.ts`

S6r Inputbar runtime/MessageList/scene、provider stream 执行、AgentChatWorkspace、Electron、Rust 与协议均未触碰。

## 分类

- `current`：`src/lib/api/queuedTurn.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 6 个 consumer 对 root compat barrel 的直接 import，受 boundary test 防回流。
- `deprecated`：无新增。

## 验证

- focused Vitest：2 files / 4 tests passed。
- exact-set ESLint passed。
- exact-set Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift / 0 boundary violations。
- claimed write set `git diff --check` passed。

验证时共享工作树的 Agent Chat 精确 root import 计数为 146；并行 S6r 同时在迁移其他 consumer，
因此全局净变化只作为共享状态记录，本轮归属固定为上述 6 个文件。

## 下一刀

继续按 queued-turn/session/thread-read 领域迁出剩余 root-barrel consumer；session roster DTO 的物理删除
应等待 S6r 释放 MessageList/scene/deferral 写集后再进行。
