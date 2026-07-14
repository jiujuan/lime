# S7n Agent Chat Current API Fixture Alignment Evidence

## 结论

Agent Chat 集成测试的共享 fixture 已对齐生产 hook 实际消费的 current API：Skills 使用
`skillExecutionApi.listExecutableSkills` 后按 stable ID 读取详情；工具库存 mock 绑定精确的
`agentRuntime/inventoryClient` owner，不再假设 compat `agentRuntime` root barrel 导出库存方法。
本切片只修复 test-only fixture，没有增加生产 fallback 或改变 GUI 行为。

## 变更边界

- `current test fixture`：对 `@/lib/api/skill-execution` 使用 partial actual mock，保留模块 current
  surface，并显式 mock `listExecutableSkills` 与 `getSkillDetail`。
- 默认 executable skill fixture 提供稳定 `skill_id` 与名称，使自动引导覆盖真实的“先列举、后详情”
  调用顺序。
- 工具库存 mock 从 `@/lib/api/agentRuntime` root 移到
  `@/lib/api/agentRuntime/inventoryClient`，与 `useWorkspaceHarnessInventoryRuntime` 的 current import
  边界一致。
- `compat` / `deprecated`：没有为旧 root barrel 补导出或测试 wrapper。
- `dead / forbidden-to-restore`：测试继续从 compat root mock `getAgentRuntimeToolInventory`，或省略
  `listExecutableSkills` 后依赖偶然 fallback 的路径。

## 验证

```text
npx vitest run \
  src/components/agent/chat/index.autoGuide03.test.tsx \
  src/components/agent/chat/index.workbench01.test.tsx
=> 2 files / 22 tests passed (7 + 15)

npx eslint src/components/agent/chat/index.testFixtures.tsx
=> passed

npx prettier --check src/components/agent/chat/index.testFixtures.tsx
=> passed

git diff --check -- src/components/agent/chat/index.testFixtures.tsx
=> passed
```

测试 stderr 包含既有 i18n 初始化提示，以及无 Electron Host 时 Workflow Read Model 的 fail-closed
诊断；两份 focused 测试仍以退出码 `0` 完成。这组回归证明 current API mock 与组件接线，不证明
Electron/preload/App Server 的 Gate B 产品链。

## 协调

- claim 的唯一源码写集是 `index.testFixtures.tsx`；`index.autoGuide03.test.tsx`、
  `index.workbench01.test.tsx` 与两个 production hook 只读。
- 复核时 S7l、S7m、S7n 的完整 canonical slice claim 均存在，但三个 slice 都没有对应 lock
  owner 文件。该事实只用于说明协调缺口，不能把短号或相邻 fixture 当作共同写集。
- 本次证据收尾只写本 evidence，没有修改源码、claim、lock、handoff 或中央计划。

S7n current API fixture alignment 完成度：`100%`；smart suite 的继续续跑与 slice 状态同步由
coordinator 处理。

## 聚合收尾

- S7l-S7q current-tree 聚合 Vitest：9 files / 86 tests passed；S7n 为 22/22。
- claimed files exact ESLint、Prettier 与 `git diff --check` passed。
- smart Vitest resume 已推进并完成 batch 110，`failed_batch: null`。
- `npm run typecheck` passed；`npm run governance:legacy-report` 为 0/0/0。
