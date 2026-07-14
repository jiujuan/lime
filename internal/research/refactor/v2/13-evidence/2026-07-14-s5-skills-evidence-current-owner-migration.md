# S5 Skills And Evidence Current Owner 迁移证据

> date: 2026-07-14
> slice: S5-skills-evidence-current-owner-migration
> owner: root

## 事实源

Skills/capability-drafts 与 renderer evidence presentation 只依赖对应的细粒度 owner：

```text
workspace skill binding DTO -> agentRuntime/toolInventoryTypes
workspace skill binding read -> agentRuntime/inventoryClient
evidence pack export -> agentRuntime/exportClient
completion / verification / task-index DTO -> agentRuntime/evidenceTypes
```

根 `src/lib/api/agentRuntime.ts` 只是 compat re-export，不是以上能力的 owner。

## 已迁移

- capability-drafts、Skills workspace 与测试夹具的
  `AgentRuntimeWorkspaceSkillBinding` 改为 `toolInventoryTypes`；
- capability-drafts presentation 的 completion audit，以及 harness/modality presentation
  的 verification/task-index DTO 改为 `evidenceTypes`；
- `WorkspaceRegisteredSkillsPanel` 的 binding read 与 evidence export 改为分别导入
  `inventoryClient` 和 `exportClient`，三个 Panel 测试及 Skills fixture mock 同步拆分；
- 新增 `currentOwnerBoundary.test.ts`，覆盖本切片 16 个 source/test 文件，禁止 root barrel
  import/mock，并断言四个分域 owner。

本切片不修改 Skills、automation、evidence projection 或 App Server 的业务语义。

## 验证

- capability-drafts、Skills workspace、evidence presentation 与边界 guard 的定向 Vitest：57 tests 通过；
- 精确写集 `npx eslint ... --max-warnings 0`：通过；
- `npm run typecheck`：通过；
- 精确写集 `git diff --check`：通过。

没有变更 Electron、bridge 或用户可见交互，未重复 GUI smoke。

## 分类

- `current`：`toolInventoryTypes`、`evidenceTypes`、`inventoryClient`、`exportClient`；
- `compat`：`src/lib/api/agentRuntime.ts`，其余 renderer consumer 未迁完前不得删除；
- `deprecated`：本 slice 未新增；
- `dead / forbidden-to-restore`：本切片 Skills/evidence 域对 root compat barrel 的 import/mock。

## 后续

中央实施计划仍由 active S4w owner 持有。本 evidence 应由协调者在 S4w 释放后汇入 S5/S6
状态；根 barrel 继续按不交叠领域分批迁移。
