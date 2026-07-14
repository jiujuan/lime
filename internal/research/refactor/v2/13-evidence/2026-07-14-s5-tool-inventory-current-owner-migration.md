# S5 Tool Inventory Current Owner Migration

时间：2026-07-14

## 结论

Agent Chat 的 11 个 tool-inventory 生产消费者不再从 `@/lib/api/agentRuntime`
compat 根 barrel 读取 DTO 或行为。DTO 直接归
`agentRuntime/toolInventoryTypes`，库存读取直接归
`agentRuntime/inventoryClient`；专用 hook 测试也改为 mock current owner。

本切片不改变 tool inventory request、DTO shape、MCP prepare/call proof 或 GUI 展示行为，
只收敛 import owner，并用 `toolInventoryCurrentBoundary.test.ts` 阻止这些消费者回绕 compat 根入口。

## 分类

- `current`：`toolInventoryTypes.ts`、`inventoryClient.ts` 及直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 Agent Chat consumer，本切片不扩展它。
- `deprecated`：无新增。
- `dead`：本切片没有物理删除 surface；已迁出的 11 个 root-barrel import 对该领域为禁止回流。

## 写集

- 6 个 Harness tool-inventory 展示组件。
- `useHarnessToolInventoryModel.ts` 与 `harnessToolInventoryViewModel.ts`。
- `runtimeToolAvailability.ts` 及其单测。
- `useWorkspaceHarnessInventoryRuntime.ts` 及其单测。
- `toolInventoryCurrentBoundary.test.ts`。

`AgentChatWorkspace.tsx`、脏的 `index.testFixtures.tsx`、S6n Harness/status/projection/i18n
写集、Electron、Rust 与协议文件均未触碰。

## 验证

- focused Vitest：3 files / 16 tests passed。
- `src/components/agent/chat/index.test.tsx`：16/16 passed。
- 精确写集 ESLint：passed。
- 精确写集 Prettier check：passed。
- `npm run typecheck`：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- claimed write set `git diff --check`：passed。

本切片无用户可见、Bridge、协议或 GUI 行为变化，未升级到 GUI smoke；S5/S6 最终聚合仍需由
coordinator 在并行写集合并后执行。

## 下一刀

共享工作树当前仍有 183 个 Agent Chat root-barrel 直接 import。继续按领域迁到明确 current owner；
legacy roster DTO 与 team-memory child/sibling shadow 应等待 S6n handoff 和
`AgentChatWorkspace.tsx` 写窗口后独立收口。
