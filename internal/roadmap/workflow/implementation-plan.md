# Workflow 标准化实施计划

> 状态：current planning source
> 更新时间：2026-07-04
> 作用：把 Workflow 从多套局部语义收敛为 App Server Runtime facts + Workflow Read Model。

## 1. 固定实施原则

1. 先统一合同，再迁 UI。
2. 先让 App Server 能恢复，再做可视化增强。
3. 先支持线性 workflow，后续再考虑 DAG。
4. 先复用现有 `workflow.run.* / workflow.step.*` 事件族，不另起命名。
5. 前端 DSL 和旧 Hook 只做 compat / deprecated，不作为新 runtime。
6. 每阶段必须有结构测试、契约测试或 GUI smoke 中至少一种可验证证据。
7. 完成重构后必须删除旧实现；只有测试夹具或 catalog-only dead guard 可以留下路径名。

## 2. 阶段总览

| 阶段 | 目标 | 关键产物 | 退出条件 |
| --- | --- | --- | --- |
| P0 | 文档和事实源冻结 | 本目录文档、执行计划 | 团队对 current / compat / deprecated / dead 无歧义 |
| P1 | Workflow Contract | `WorkflowDefinition / Run / Step / Event / ReadModel` schema | fixture 覆盖 manifest、skill、image、content workflow |
| P2 | Event Projection | App Server workflow events 投影为 durable read model | 不再在 frontend projection 删除 workflow facts |
| P3 | Surface Mapping | Plugin manifest / Skill workflow / image command 统一映射 | 同一 status 和 id 规则覆盖所有 source |
| P4 | Runtime Control | cancel / retry / resume / respond 进入 current API | GUI 操作只调用 App Server control API |
| P5 | UI Projection | General Workbench / Article Workspace / Plugin iframe 读取 read model | 用户可见 run detail 可恢复、可重试 |
| P6 | Governance Cleanup | 旧 Hook、前端 DSL、content workflow dead surface 删除或封口 | 无生产引用，守卫阻止旧路回流 |

## 3. P0：文档和事实源冻结

已完成目标：

1. 新增 `internal/roadmap/workflow/` 路线图文档。
2. 明确 App Server RuntimeCore + `workflow.*` event + Workflow Read Model 是 current 主链。
3. 明确前端 `WorkflowRuntimeHost`、旧 `useWorkflow`、Skill 轻量 steps 的分类。

退出条件：

- 本文档集进入仓库。
- 执行计划进入 `internal/exec-plans/workflow-standardization-plan.md`。

## 4. P1：Workflow Contract

目标：

- 定义统一 workflow schema 和 status mapping。

关键工作：

1. 新建后端 current owner 目录：
   - `lime-rs/crates/app-server/src/runtime/workflow/mod.rs`
   - `lime-rs/crates/app-server/src/runtime/workflow/definition.rs`
   - `lime-rs/crates/app-server/src/runtime/workflow/status.rs`
   - `lime-rs/crates/app-server/src/runtime/workflow/read_model.rs`
2. 在 App Server protocol 或 RuntimeCore domain 中定义：
   - `WorkflowDefinition`
   - `WorkflowStepDefinition`
   - `WorkflowRun`
   - `WorkflowStepRun`
   - `WorkflowReadModel`
3. 定义 status mapping：
   - `active -> running`
   - `pending -> queued`
   - `succeeded / success -> completed`
   - `error -> failed`
   - `cancelled -> canceled`
4. 建立 definition source mapping：
   - Plugin manifest steps
   - Skill workflow steps
   - image command builtin workflow
   - content factory workflow
5. 当前实现入口为 `runtime/workflow/source_map.rs`；后续如果 source 规则继续膨胀，再拆成 `manifest_map.rs / skill_map.rs` 等专用模块。
6. 将 `plugin_worker_workflow*.rs` 保持为 compat source adapter，不继续在这些文件中新增独立 workflow 合同。

退出条件：

- 有 fixture 证明四类 source 都能映射到统一 definition。
- 没有新代码把旧状态直接写入 current run。
- `runtime/workflow/status.rs + definition.rs + read_model.rs` 成为 P2/P3 的唯一合同入口。

## 5. P2：Event Projection

目标：

- 把已有 `workflow.*` RuntimeEvent 投影为 durable Workflow Read Model。

关键工作：

1. App Server event log 增加 workflow projector。
2. Thread/session read API 返回 `workflow_runs / workflow_steps` 或新的 `workflow` 字段。
3. 前端 `appServerReadModelProjection` 停止删除 workflow facts。
4. `appServerEventStream` 对 workflow events 不再简单 `return null`；至少进入 workflow projection buffer 或 read model refresh signal。

退出条件：

- `workflow.run.started` + step events 能恢复为 run detail。
- 关闭重开后仍能看到 workflow run 和 steps。
- 结构测试覆盖 completed / failed / canceled / retrying。

## 6. P3：Surface Mapping

目标：

- 所有 Workflow 来源统一进入 current definition/run 合同。

关键工作：

1. Plugin manifest `PluginWorkflowDeclaration.steps` 映射为 `WorkflowStepDefinition`。
2. `WorkflowRuntimeHost` controlled DSL 的 step kind 映射到 current step kind，或明确降为 test-only。
3. Skill catalog `workflow_steps` 不再表示执行合同，只表示 definition summary。
4. 图片命令补齐 `threadId`、`stepIndex`、`stepCount` 等字段一致性。
5. 内容工厂 worker contract 中的 `orchestration` 只作为 definition source。

当前进展：

1. `runtime/workflow/source_map.rs` 已覆盖上述 source mapping 的第一刀。
2. `plugin_worker_workflow.rs` 已复用 source mapping helper，不再保留独立 step parser。
3. 图片命令 workflow audit 已统一为五步 current facts：`intent / route / create_tasks / generate / persist_outputs`。
4. `WorkflowRuntimeHost` DSL 只作为 adapter/test-only 输入映射到 current step kind，不能作为生产 runtime。

退出条件：

- 同一个 workflow key 的 manifest、runtime event、read model 使用同一组 step ids。
- StepStatus 在 surface adapter 外不再出现旧拼写。

## 7. P4：Runtime Control

目标：

- Workflow 可以被取消、重试、恢复和响应等待点。

当前进展：

1. `workflow/read` 已进入 App Server current JSON-RPC：protocol DTO、method catalog、schema fixture、RuntimeCore read owner、processor、Rust client、TS client 与 DevBridge current method profile 已同步。
2. `workflow/read` 与 `agentSession/read.detail.thread_read.workflow / workflow_runs / workflow_steps` 使用同一个 Workflow Read Model projector，读取同一组 session runtime events + workflow audit log。
3. `workflow/read` 当前只承担读取和恢复，不替代后续 `workflow/cancel / workflow/retry / workflow/respond` 控制面。

关键工作：

1. App Server JSON-RPC 增加或收敛：
   - `workflow/read`（已完成）
   - `workflow/cancel`
   - `workflow/retry`
   - `workflow/respond`
2. Control API 必须校验：
   - `workflowRunId`
   - `sessionId / threadId`
   - step terminal 状态
   - permission / policy scope
3. Runtime 生成 control events：
   - `workflow.step.canceled`
   - `workflow.run.canceled`
   - `workflow.step.retrying`
   - `workflow.run.retrying`

退出条件：

- GUI 不直接修改 workflow status。
- cancel / retry 有 contract test 和至少一个 product smoke。

## 8. P5：UI Projection

目标：

- 用户能在主工作台看到可恢复的 workflow 运行详情。

关键工作：

1. General Workbench run detail 读取 Workflow Read Model。
2. Article Workspace 使用同一 workflow projection，不再旁路读取不稳定字段。
3. Plugin iframe 只订阅 projected events。
4. 图片命令普通聊天区不展示内部 step rail，但诊断面板可追踪 workflowRunId。
5. 用户可见文案走五语言 i18n；runtime facts 保持 stable values。

退出条件：

- 用户关闭重开后 workflow 详情仍一致。
- 失败 step 显示可解释原因和可用动作。
- GUI smoke 覆盖至少一个内容 workflow 或图片 workflow。

## 9. P6：Governance Cleanup

目标：

- 收掉旧路，防止 Workflow 再次分裂。

关键工作：

1. 为 `src/components/workspace/hooks/useWorkflow.ts` 添加守卫：不得恢复非空 legacy steps。
2. 为 `WorkflowRuntimeHost` 添加 import/usage 边界：生产 AI workflow 不得直接使用。
3. 在 `legacySurfaceCatalog.json` 或相关治理测试中确认旧 `content_workflow_*` 和 `content-workflow.ts` 为 dead。
4. 文档回链到本路线图，避免后续路线图继续把前端 DSL 写成 current。
5. `PluginsPage` 已下线 `WorkflowRuntimeHost` 本地 DSL 假完成路径；workflow entry 在 App Server Workflow API 可用前 fail closed。
6. P5 current UI / control 可用后，删除 `useWorkflow` 旧 Hook 文件和前端 DSL runtime 残留，或把保留项降为 test-only / catalog-only dead guard。

退出条件：

- `npm run governance:legacy-report` 不出现 workflow 旧路回流。
- `npm run test:contracts` 覆盖 workflow current API 和 mock/test-only 边界。
- `useWorkflow`、`WorkflowRuntimeHost`、`content_workflow_*` 不再出现在生产 AI workflow 主链。
- 旧实现没有长期 `deprecated` 存活项；确需保留的路径必须有删除条件、owner 和下一阶段入口。

## 10. 验证策略

最小验证按改动范围选择：

1. 文档-only：
   - `git diff --check`
2. Contract / protocol：
   - `npm run test:contracts`
3. 前端 projection：
   - `npm run test:related -- <changed files>`
   - 对应 `*.unit.test.ts`
4. Rust RuntimeCore：
   - `npm run test:rust:related -- <paths...>`
5. GUI 主路径：
   - `npm run verify:gui-smoke`

## 11. 风险和处理

| 风险 | 处理 |
| --- | --- |
| 现有 workflow facts 已被前端 projection 删除 | P2 优先修 read model，不先改 UI。 |
| Plugin manifest steps 与 DSL steps 不同构 | P3 做显式 mapping，不保留双标准。 |
| 图片 workflow 不应暴露内部步骤 | P5 区分用户进度 presentation 与内部 audit facts。 |
| Skill workflow 只有轻量 steps | 降为 definition summary，不承诺可执行。 |
| 旧前端 Hook 被重新使用 | 先撤生产引用；P6 删除旧 Hook 或迁为 catalog-only dead guard。 |
