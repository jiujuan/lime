# S5 Mixed Owner Follow-up

时间：2026-07-15

## 结论

8 个 Agent Chat 双符号 consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel 拆到
唯一 current owners：`agentExecutionRuntime`、`queuedTurn`、`sessionTypes`、
`evidenceTypes` 与 `toolInventoryTypes`。本切片只拆分 type import，不改变类型 identity、
运行时行为、消息投影或 provider lowering。

## 写集

- `components/Inputbar/components/InputbarComposerSection.tsx`
- `components/Inputbar/index.tsx`
- `components/harnessStatusPanelSummary.ts`
- `hooks/agentSessionRefresh.ts`
- `hooks/agentStreamReadModelParsing.ts`
- `hooks/agentStreamRequestStartController.ts`
- `hooks/agentStreamSend.ts`
- `utils/importedSourceProcess.ts`
- execution runtime、queued turn、session types、evidence 与 tool inventory 共 5 个
  current-owner boundary tests

Active S2m/S7、22 个共享脏 root consumer、Electron、Rust、App Server protocol 和
provider 行为均未触碰。

## 分类

- `current`：上述 5 个 direct owner modules 与 8 个直接 consumers。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由扩展后的 5 个 boundary tests 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：5 files / 7 tests passed。
- exact-set ESLint passed。
- boundary tests Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed production write set `git diff --check` passed。
- 8 个生产文件 `git diff --numstat` 均为 `2 4`，并通过 production import-only diff review。
- 过滤 test/fixture 后，Agent Chat root compat import consumer 从 43 降到 35。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，因此未升级到 GUI smoke。

## 下一刀

剩余 35 个 consumer 中，本轮审计时 22 个已脏、13 个仍 clean。下一组继续选择 clean
双/三 owner consumer，拆到 direct owner 并扩展相应守卫；已脏文件等待当前 owner 释放，
不得夹写。
