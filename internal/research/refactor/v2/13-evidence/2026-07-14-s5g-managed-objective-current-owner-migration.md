# S5g Managed Objective Current Owner Migration

时间：2026-07-14

## 结论

Managed Objective 的 7 个 DTO consumer、4 个行为 consumer 与 4 个测试 mock 已从
`@/lib/api/agentRuntime` compat 根 barrel 迁到唯一 current owner：DTO 直连
`agentRuntime/sessionTypes`，行为与 mock 直连 `agentRuntime/objectiveClient`。

本切片只改变 TypeScript import/mock owner，没有改变 Objective 请求、协议、状态转换、
UI 文案或 App Server 行为。两个 `agentStreamSubmitExecution` 文件仍从根 barrel 读取本切片
之外的 runtime 类型；其 Objective 行为已独立直连 `objectiveClient`，未越权迁移无关类型。

## 写集

- `InputbarObjectiveInlinePanel.tsx` 及其测试
- `useInputbarSend.ts` 及其测试
- `ManagedObjectiveAuditSummary.tsx`
- `ManagedObjectiveCurrentView.tsx`
- `ManagedObjectivePanel.tsx` 及其测试
- `managedObjectivePanelModel.ts`
- `agentStreamSubmitExecution.ts` 及其测试
- `managedObjectiveCurrentBoundary.test.ts`

`sessionTypes.ts`、`objectiveClient.ts` 与根 barrel 只读；协议、App Server、Electron、i18n、
中央执行计划及并行 slice 均未触碰。

## 分类

- `current`：`agentRuntime/sessionTypes`、`agentRuntime/objectiveClient` 与上述直接 consumer/mock。
- `compat`：根 `agentRuntime` barrel 继续服务未迁出的其它领域类型，本轮不扩展它。
- `deprecated`：无新增。
- `dead / retired guard-only`：本写集内的 Managed Objective 根 barrel import/mock；
  `managedObjectiveCurrentBoundary.test.ts` 阻止其回流。

## 守卫

新增边界测试分别约束：

- Managed Objective DTO consumer 必须直连 `sessionTypes`。
- Managed Objective 行为 consumer 必须直连 `objectiveClient`。
- Objective 测试必须 mock `objectiveClient`，不得 mock/importActual 根 barrel，避免落到真实
  `AppServerClient`。

## 验证

- focused Vitest：5 files / 32 tests passed。
- exact-set ESLint：12 files passed，`--max-warnings 0`。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。

## 下一刀

继续按领域迁出根 `agentRuntime` barrel 的剩余 consumer；优先选择同一 current owner 已明确、
且不与活跃 Rust/history 或 GUI 热区重叠的 session DTO / client 切片。
