# Workflow 标准化路线图

> 状态：current planning source
> 更新时间：2026-07-04
> Owner：App Server Runtime / Plugin Runtime / Agent UI Projection

## 1. 定位

本目录定义 Lime Workflow 的产品目标、架构合同、事件语义、用户路径和分阶段计划。

这轮路线图来自一次横向复核：`claudecode`、`codex` 和 `hermes-agent` 中都能找到 workflow 相关代码，但只有 `hermes-agent` 的 ComfyUI workflow 更接近完整闭环：定义、schema、参数注入、提交、监控、下载输出和测试在同一条执行链内。Lime 当前不是没有 Workflow，而是存在多套不同构的 Workflow 语义，导致声明、执行、审计、read model 和 UI 投影无法稳定 join。

目标形态：

```text
Workflow Definition
  -> Workflow Run
  -> Workflow Step Events
  -> RuntimeEvent / Audit Log
  -> Workflow Read Model
  -> Evidence / Replay / UI Projection
```

## 2. 事实源声明

从本路线图起，Workflow 只允许向下面的事实源收敛：

```text
App Server + RuntimeCore + workflow.run.* / workflow.step.* RuntimeEvent + Workflow Read Model
```

Plugin manifest、Skill workflow、图片命令、内容工厂、Agent App 和 GUI 工作台都只是不同 surface。它们可以声明或投影 workflow，但不能各自拥有一套执行事实源。

## 3. 文档索引

| 文档 | 作用 |
| --- | --- |
| [prd.md](./prd.md) | 背景、即时收益、用户故事、用户使用路径、范围和验收。 |
| [architecture.md](./architecture.md) | 统一合同、对象模型、状态机、owner 边界和治理分类。 |
| [diagrams.md](./diagrams.md) | 架构图、流程图、时序图和状态流转图。 |
| [implementation-plan.md](./implementation-plan.md) | 分阶段路线图、退出条件、验证策略和风险。 |
| [../../exec-plans/workflow-standardization-plan.md](../../exec-plans/workflow-standardization-plan.md) | 可持续更新的执行计划和进度日志。 |

## 4. 固定结论

1. **Workflow 是 runtime orchestration facts，不是前端步骤 UI。**
   前端可以展示 workflow，但不能用 `useWorkflow`、本地 DSL 或组件状态定义执行真相。

2. **Workflow Definition 和 Workflow Run 必须分离。**
   Manifest / Skill / App 只声明 definition；真正的 run 由 App Server RuntimeCore 创建、执行、审计和恢复。

3. **Workflow Step 只允许有一套状态语义。**
   current 状态固定为 `queued / running / waiting / completed / failed / canceled / retrying / skipped`。旧 `active/error/succeeded/cancelled` 等只能在 adapter 边界映射。

4. **Workflow facts 必须进入 durable read model。**
   如果 workflow 只存在于 `workflow-events.jsonl` 或 transient event stream，GUI 恢复、Evidence、Replay 和用户查看运行详情都会继续旁路读取。

5. **Plugin manifest steps 和 runtime DSL steps 必须同构或显式映射。**
   `id/title/subagent/skillRefs/expectedOutput` 与 `storage.set / knowledge.search / agent.startTask / artifacts.create / evidence.record` 不能长期并存为两套“标准”。

6. **Workflow UI 是投影层。**
   Chat、General Workbench、Article Workspace、图片预览和 Plugin iframe 只能读取 Workflow Read Model 或 runtime events 的投影结果。

7. **生产路径禁止 mock。**
   `WorkflowRuntimeHost` 这类前端 controlled DSL 可以作为测试夹具或迁移 adapter，不得继续作为真实 AI workflow 后端。

8. **重构完成后必须清理旧实现。**
   `useWorkflow`、旧 `content_workflow_*`、前端 DSL runtime 和 GUI 自行拼状态的路径不能长期以 `deprecated` 名义保留；P5 current UI / control 可用后，P6 必须删除旧文件或降为 catalog-only dead guard。

## 4.1 当前进展

截至 2026-07-04：

1. P1 Workflow Contract 已落到 `lime-rs/crates/app-server/src/runtime/workflow/**`，包含 definition、status、events、read model 和 source map。
2. P2 Read Model 已接入 `agentSession/read.detail.thread_read.workflow / workflow_runs / workflow_steps`，前端 projection 不再删除 workflow facts。
3. P3 Surface Mapping 已把 Plugin manifest、Skill `workflow_steps`、图片命令、内容工厂和 test-only DSL 映射到同一套 `WorkflowDefinition / WorkflowStepDefinition`。
4. P4 第一刀 `workflow/read` 已成为 App Server current JSON-RPC，和 `agentSession/read` 共用同一个 Workflow Read Model projector；`workflow/cancel / retry / respond` 仍是后续控制面。
5. P6 已提前清掉两个最危险的生产旧入口：`AgentChatWorkspace` 不再调用 `useWorkflow`，`PluginsPage` 不再通过 `WorkflowRuntimeHost` 前端 DSL 假完成 workflow entry。

## 5. current / compat / deprecated / dead 分类

### current

后续继续强化的主路径：

1. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow.rs` 的 `workflow.run.* / workflow.step.*` 事件族。
2. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow_cancel.rs` 与 `plugin_worker_workflow_retry.rs` 对 cancel / retry 的事件补齐。
3. `lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs` 中图片命令复用 workflow audit 事件族的方向。
4. `RuntimeEvent`、event log、Evidence provider 对 `workflowRunId` 的关联。
5. Workflow Read Model 与 App Server JSON-RPC 查询 API：当前 `workflow/read` 与 `agentSession/read.detail.thread_read.workflow / workflow_runs / workflow_steps` 共用同源 facts。
6. Plugin manifest workflow declaration，前提是它只作为 definition source，不直接拥有 execution truth。

### compat

允许短期存在但只能委托、映射或展示：

1. `src/features/plugin/manifest/types.ts` 的 `PluginWorkflowDeclaration.steps` 简化声明。
2. `src/lib/api/skill-execution.ts` 的 `workflow_steps` 轻量展示字段。
3. `src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts` 对历史 `workflow_runs / workflow_steps` 的读取 helper。
4. `src/lib/api/agentRuntime/types.ts` 中保留的 `workflow_runs / workflow_steps` 类型字段。
5. `src/features/plugin/runtime/workflowRuntimeHost.ts`，仅限 controlled DSL adapter / test fixture；`PluginsPage` 已停止生产调用，P5 后继续物理删除或迁为 test-only guard。

退出条件：current Workflow Read Model 与查询 API 落地后，compat 入口只能调用 current API 或被删除；不能继续保留平行 runtime。

### deprecated

禁止继续扩展的方向：

1. `src/components/workspace/hooks/useWorkflow.ts` 旧工作区步骤 Hook；当前 `getWorkflowSteps()` 已返回空数组，生产链路不得引用，P6 删除文件或迁为 catalog-only dead guard。
2. GUI 组件自行从 tool log、message、artifact 或 local state 拼 workflow run。
3. App / Plugin iframe 自行运行多步 AI 任务并把成功状态写回宿主。
4. Skill catalog 把 `id/name/dependencies` 当作可执行 workflow 合同。
5. `appServerReadModelProjection` 主动删除 workflow facts 后再由业务页面旁路读取历史记录；该行为已清理，后续不得恢复。

### dead

可以直接否定的方向：

1. 旧 `content_workflow_*` 命令与 `src/lib/api/content-workflow.ts` 作为新能力入口。
2. 新建第二套 `plugin_workflow_runtime` 后端执行器。
3. 用前端 `WorkflowRuntimeHost` 作为生产 AI workflow runtime。
4. 让 UI-only workflow step 成为 Evidence / Replay / Review 的事实源。

## 6. 先读顺序

1. [prd.md](./prd.md)
2. [architecture.md](./architecture.md)
3. [diagrams.md](./diagrams.md)
4. [implementation-plan.md](./implementation-plan.md)
5. [../../exec-plans/workflow-standardization-plan.md](../../exec-plans/workflow-standardization-plan.md)
6. `internal/roadmap/agentruntime/README.md`
7. `internal/roadmap/appserver/README.md`
8. `internal/aiprompts/governance.md`

## 7. 完成判定

本路线图完成时，Lime 至少应该能做到：

1. 任意 Workflow definition 都能被解析成统一 schema，并生成稳定 `workflowDefinitionId / workflowRunId / stepId`。
2. Workflow run 全生命周期进入 `workflow.run.* / workflow.step.*` event stream。
3. App Server 暴露 Workflow Read Model，GUI、Evidence、Replay 和恢复路径读取同源 facts。
4. Plugin manifest、Skill workflow、图片命令和内容工厂不再各自定义状态机。
5. 旧 Hook、前端 DSL runtime 和旧 content workflow 命令完成清理：无生产引用，最终删除或被标记为 `dead / test-only`，并有守卫防回流。

## 8. 代码建议目录

Workflow 后端 current owner 固定为：

```text
lime-rs/crates/app-server/src/runtime/workflow/
```

建议模块拆分：

```text
lime-rs/crates/app-server/src/runtime/workflow/
  mod.rs
  definition.rs      # WorkflowDefinition / WorkflowStepDefinition
  events.rs          # workflow.run.* / workflow.step.* 事件构造与校验
  read_model.rs      # WorkflowReadModel / projector
  source_map.rs      # Plugin / Skill / Image / Content source -> WorkflowDefinition
  status.rs          # queued/running/... 统一状态与旧状态映射
  read.rs            # workflow/read current JSON-RPC 读取入口
  control.rs         # cancel / retry / respond
  manifest_map.rs    # 后续 source_map 膨胀后再拆出的 Plugin manifest 专用映射
  skill_map.rs       # 后续 source_map 膨胀后再拆出的 Skill workflow_steps 专用映射
  tests.rs
```

配套协议和前端投影落点：

```text
packages/app-server-client/src/protocol*
src/lib/api/agentRuntime/workflowReadModel.ts
src/lib/api/agentRuntime/workflowProjection.ts
src/components/agent/chat/workspace/workspaceWorkflowFacts.ts
```

现有文件退场关系：

| 分类 | 文件 | 后续处理 |
| --- | --- | --- |
| `current` | `lime-rs/crates/app-server/src/runtime/workflow/**` | 新增合同、状态、read model 和 control 的唯一演进位置。 |
| `compat` | `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow*.rs` | 先委托 `runtime/workflow/**`，再逐步收窄为 source adapter。 |
| `compat` | `src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts` | 改为读取 current Workflow Read Model 的业务投影。 |
| `deprecated -> dead` | `src/components/workspace/hooks/useWorkflow.ts` | 不恢复旧 steps；生产引用清零后，P6 删除文件或迁为 catalog-only dead guard。 |
| `test-only / compat -> dead` | `src/features/plugin/runtime/workflowRuntimeHost.ts` | 仅作为 controlled DSL adapter 或测试夹具；P5 后删除生产入口或隔离为 test-only。 |

第一刀已完成：`status.rs + definition.rs + read_model.rs + events.rs + source_map.rs` 已钉住标准合同，`workflow/read` 已提供 current 查询入口。下一刀应继续补 `workflow/cancel / retry / respond`，随后推进 P5 UI Projection 和 P6 旧实现删除。
