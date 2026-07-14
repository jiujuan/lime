# S7s StreamingRenderer Checkpoint Mock Owner Evidence

## 结论

`StreamingRenderer.fileChanges.test.tsx` 的 checkpoint 撤销断言失败不是生产行为回归。Release
v1.102.0 已把 `fileChangesUndo.ts` 迁到 current
`@/lib/api/agentRuntime/threadClient`，但共享测试 harness 仍 mock deprecated
`@/lib/api/agentRuntime` root barrel，导致 list/restore spy 均为零调用。

S7s 将 test-only mock 改为同一个 current `threadClient` owner；没有修改生产组件、恢复逻辑、
App Server method、协议或 GUI 行为。Prettier 另要求收敛同文件一处既有条件换行，未触及语义。

## 治理分类

- `current`：`fileChangesUndo.ts -> agentRuntime/threadClient -> App Server file checkpoint methods`。
- `test-only current fixture`：`StreamingRenderer.testMocks.tsx` 对 current `threadClient` 的 list/restore
  mock。
- `deprecated`：`@/lib/api/agentRuntime` root barrel；本 fixture 不再把它作为 checkpoint owner。
- `compat / dead`：本刀未新增 compat；未恢复 legacy command、fallback 或 production mock。

## 验证

- 原失败 focused test：`1` file / `4` tests passed。
- StreamingRenderer + fileChangesUndo current boundary：`12` files / `99` tests passed。
- `npm test -- --only-batch 79`：当前动态分批为 `16` files / `149` tests passed；并行文件变化已
  使 batch 内容重新编号，因此原失败的直接证据以上述 focused test 为准。
- exact ESLint、Prettier、deprecated root mock 扫描与 claimed `git diff --check`：通过。
- targeted run 前后 `.lime/test/vitest-smart-last-run.json` SHA-256 均为
  `3f188a8943ea59ef9d4e9a40311f77afca214fd3dfe9698832061f018d08caa7`。

## 并行边界

本轮实际源码写集只有 `StreamingRenderer.testMocks.tsx`。S7o/S7p/S7q/S7r、Rust、protocol、
Electron、中央执行计划、dirty roadmap 与共享 resume state 均避让。S7s 验证结束后，相邻进程已
把共享 state 推进到新的 failed batch 78；该变化不属于 S7s。

## 下一刀

继续用 targeted 模式向共享失败点之后探测；若命中新的失败，先按 active claim/dirty 文件重新
划分 owner，不能用动态 batch 编号替代精确文件归属。
