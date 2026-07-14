# S5 Automation Current Owner 迁移证据

> date: 2026-07-14
> slice: S5-automation-current-owner-migration
> owner: root

## 事实源

Automation 的策略类型和 managed objective audit 分别只允许依赖：

```text
Automation payload / lineage -> agentExecutionRuntime policy types
Automation settings objective audit -> agentRuntime/objectiveClient
```

`src/lib/api/agentRuntime.ts` 不拥有这些类型或行为，只保留 compat re-export；
automation command 继续通过 current App Server JSON-RPC gateway `src/lib/api/automation.ts`。

## 已迁移

- `automation.ts` 与其 `.d.ts` 的 `AgentApprovalPolicy` / `AgentSandboxPolicy` 改为直接
  导入 `agentExecutionRuntime`；
- `automationThreadLineage.ts` 同步直连 `agentExecutionRuntime`；
- automation settings 页的 `auditAgentRuntimeObjective` 改为直接导入
  `agentRuntime/objectiveClient`，对应测试 mock 同步迁移；
- 新增 `automationCurrentBoundary.test.ts`，阻止上述五个 source/test 文件重新依赖 root
  compat barrel，并断言两个 current owner。

本切片不改 automation App Server method、payload、lineage fail-closed 行为、SceneApp
residual 或 Electron bridge。

## 验证

- `npx vitest run src/lib/api/automation.test.ts src/components/settings-v2/system/automation/automationThreadLineage.unit.test.ts src/components/settings-v2/system/automation/index.test.tsx src/components/settings-v2/system/automation/automationCurrentBoundary.test.ts`：30 tests 通过；
- 精确写集 `npx eslint ... --max-warnings 0`：通过；
- `npm run typecheck`：通过；
- 精确写集 `git diff --check`：通过。

本切片没有可见布局、Electron bridge 或 App Server 行为改动。完成时本机可用空间约
`437MB`，不重复运行会创建完整 Electron build 的 GUI smoke；该命令已在紧邻的 Sidebar
compat 迁移切片中以既有构建产物完成 Gate A。

## 分类

- `current`：`agentExecutionRuntime` policy types、`agentRuntime/objectiveClient`、
  automation App Server gateway；
- `compat`：`src/lib/api/agentRuntime.ts`，其余 consumer 未迁完前不得删除；
- `deprecated`：本 slice 未新增；
- `dead / forbidden-to-restore`：已声明 automation 域对 root compat barrel 的 import/mock。

## 后续

中央实施计划仍由 active S4w owner 持有。本 evidence 应由协调者在 S4w 释放后汇入 S5/S6
状态；其余 root barrel consumer 继续按独立领域迁移。
