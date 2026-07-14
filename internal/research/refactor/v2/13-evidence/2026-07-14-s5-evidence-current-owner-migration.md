# S5 Evidence Current Owner Migration

时间：2026-07-14

## 结论

Agent Chat 的 evidence/review 消费者已向唯一 current owner 收敛：

- DTO、evidence pack、replay、review decision 类型直接来自 `agentRuntime/evidenceTypes`。
- evidence export、review template export/save 直接来自 `agentRuntime/exportClient`。
- Harness 与 Scene review 测试 mock 同步改为 mock `exportClient`，没有新增 compat wrapper。
- Harness tool-inventory fixture 的 DTO 也直接来自 `toolInventoryTypes`。

本切片只改变 TypeScript import owner 和测试 mock 边界，不改变 export payload、review request、MCP/浏览器 evidence
展示或 GUI 交互行为。

## 分类

- `current`：`evidenceTypes.ts`、`exportClient.ts` 及其直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 Agent Chat consumer，本切片不扩展它。
- `deprecated`：无新增。
- `dead`：本切片没有物理删除 surface；迁出的 evidence/review root import 受 boundary guard 禁止回流。

## 写集与避让

本切片改动 19 个干净的 evidence/review 组件、selector、workspace hook、工具和测试 fixture，新增
`evidenceCurrentBoundary.test.ts`。

没有触碰：`AgentChatWorkspace.tsx`、S6n raw subagent type/package/fixture 写集、脏的 HarnessStatus
实现/投影/i18n、Electron、App Server protocol/runtime、Rust 或生成 schema。

## 验证

- isolated evidence/Scene tests：4 files / 18 tests passed。
- Harness/Expert/curated regressions：9 files / 66 tests passed。
- 精确写集 ESLint：passed。
- 精确写集 Prettier check：passed。
- `npm run typecheck`：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0。
- claimed write set `git diff --check`：passed。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，未升级到 GUI smoke；S5/S6 聚合仍需 coordinator 在
并行写集合并后执行。

## 下一刀

共享工作树当前有 165 个 Agent Chat root-barrel 直接 import。继续按 session/stream、tool inventory、evidence
等明确领域迁移；legacy roster DTO 与 team-memory child/sibling shadow 仍需等待 S6n handoff 和
`AgentChatWorkspace.tsx` 写窗口。
