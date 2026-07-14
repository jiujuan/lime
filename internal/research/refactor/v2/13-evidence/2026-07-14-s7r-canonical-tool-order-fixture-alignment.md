# S7r Canonical Tool Order Fixture Alignment

## 结论

WebSearch -> Reasoning -> WebFetch 的 live 顺序测试已从已退役 `tool_start/tool_end` 正向输入迁到
canonical Tool Item completion。S2l 的 ordinal-first reasoning 排序实现不需要修改，也没有为
缺少 Tool Item position 的 raw card 增加 fallback。

## 分类

- `current`：canonical Tool/Reasoning Item sequence 与 ordinal、现有 live content-part projection。
- `test-only`：`agentStreamRuntimeHandler.test.ts` 的完整链 fixture。
- `compat / deprecated`：无新增。
- `dead / forbidden-to-restore`：raw Tool wire 作为正向时间线事实源。

## 验证

- `agentStreamRuntimeHandler.test.ts`：`7/7` passed。
- 与 S7p/S7v 合并 focused：`4 files / 110 tests` passed。
- exact ESLint、Prettier、`git diff --check`：passed。
- smart Vitest resumable state：`passed`。

本切片是 test-only currentization，不声明新的 GUI Gate B。
