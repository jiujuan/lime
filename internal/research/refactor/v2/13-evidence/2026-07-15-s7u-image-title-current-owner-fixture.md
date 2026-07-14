# S7u Image Title Current Owner Fixture Evidence

时间：2026-07-15

## 结论

图片工作台 command action 已通过 `agentRuntime/agentClient` current owner 生成标题，
共享测试 fixture 原先仍 mock `agentRuntime` compat 根 barrel，导致 mock 无法拦截生产
import，batch 101 实际落入本地 `local_preview_title` fallback。

本切片只把测试 mock 与 `importOriginal` 类型路径迁到同一个 current `agentClient`
owner。生产提交、标题生成、fallback、请求 payload 与 GUI 行为均未修改。

## 写集与避让

- 修改：`useWorkspaceImageWorkbenchActionRuntime.testFixtures.tsx`。
- 只读：`useWorkspaceImageWorkbenchCommandActionRuntime.ts`、`agentClient.ts`。
- 避让：S7d Rust image command、S7m boundary guard、S7r 中央执行计划与生产
  image workbench 热区。

## 分类

- `current`：`agentRuntime/agentClient` 及其 production consumer。
- `compat`：`agentRuntime` package root；本切片不扩展它。
- `deprecated`：无新增。
- `dead / retired guard-only`：该 production consumer 的 compat root import。
- `test-only`：共享 action-runtime fixture 对 current owner 的显式 mock。

## 验证

- 复现：目标测试修复前 `2 failed / 5 passed`，真实返回
  `fallbackReason: local_preview_title`，且旧 mock spy 为 `0` 次。
- focused Vitest：3 files / 16 tests passed。
- smart Vitest：batch 101 通过；随后共享 resume 完成至 batch 110，状态为
  `passed`、`failed_batch: null`。
- `npm run typecheck` passed。
- exact ESLint passed，`--max-warnings 0`。
- exact Prettier passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。

## 下一刀

继续收尾 smart Vitest 暴露的其它 test-only current-owner mock 漂移；不得为测试恢复
compat barrel 或 production fallback。
