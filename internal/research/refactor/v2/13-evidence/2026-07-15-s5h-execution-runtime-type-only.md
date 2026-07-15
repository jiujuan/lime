# S5h Execution Runtime Type-only

时间：2026-07-15

## 结论

`useAgentChat.ts` 与 `WorkspaceConversationScene.tsx` 已从
`@/lib/api/agentRuntime` compat 根 barrel 迁到 execution runtime 唯一 current owner
`@/lib/api/agentExecutionRuntime`。本切片只改变 TypeScript type import owner，并扩展现有
boundary guard；没有改变 runtime、send、projection、状态或 GUI 行为。

## 写集与避让

- `src/components/agent/chat/hooks/useAgentChat.ts`
- `src/components/agent/chat/workspace/WorkspaceConversationScene.tsx`
- `src/components/agent/chat/utils/executionStrategyCurrentBoundary.test.ts`

active S7y Approval、其它 Agent Chat compat consumer、协议、App Server、Electron、Rust、i18n
和中央实施计划均未触碰。证据目录中的其它并行脏文件保持不变。

## 分类

- `current`：`src/lib/api/agentExecutionRuntime.ts` 与两个直接 consumer。
- `compat`：`src/lib/api/agentRuntime.ts` 仍服务剩余 production consumer，本轮不扩展。
- `deprecated`：本切片未新增。
- `dead / forbidden-to-restore`：两个 consumer 对 root compat barrel 的直接 import；扩展后的
  `executionStrategyCurrentBoundary.test.ts` 防止回流。

## 验证

- focused Vitest：`1 file / 1 test passed`。
- exact-set ESLint：通过，零 warning。
- exact-set Prettier：通过。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移候选 `0`、边界违规 `0`。
- claimed production write set `git diff --check`：通过。
- production import-only diff：`useAgentChat.ts` 为 `4/2`，scene 为 `1/1`；boundary test
  为 `2/0`。

统一过滤 test/fixture 后，共享工作树的 Agent Chat root compat production consumer 在认领时为
`19`，本切片精确净减 `2`，完成后为 `17`。中央计划中的 `22` 是更早快照；期间另有并行切片
收掉 `3` 个，不归本切片计数。

本切片释放后的最终只读审计又观察到其它 owner 收掉 `5` 个，当前共享工作树计数为 `12`；
这 `5` 个不归 S5h，coordinator 汇总时应以最新 `12` 为全局事实、以 `2` 为 S5h 归属。

## 下一刀

继续由 coordinator 在剩余 `12` 个 production consumer 中按 current owner 和已释放写集拆分
窄切片；不得恢复 root barrel 或越过 active owner 夹写。
