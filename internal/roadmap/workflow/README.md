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
   `id/title/subagent/skillRefs/expectedOutput` 与 `storage.set / knowledge.search / agent.startTask / artifacts.create / evidence.record` 不能长期并存为两套“标准”；历史 DSL 只能作为 test-only mapping fixture 或负向守卫语义。

6. **Workflow UI 是投影层。**
   Chat、General Workbench、Article Workspace、图片预览和 Plugin iframe 只能读取 Workflow Read Model 或 runtime events 的投影结果。

7. **生产路径禁止 mock。**
   `WorkflowRuntimeHost` 这类前端 controlled DSL 已删除，只允许作为历史 fixture / 负向守卫语义被引用，不得恢复为真实 AI workflow 后端。

8. **重构完成后必须清理旧实现。**
   `useWorkflow`、旧 `content_workflow_*`、前端 DSL runtime 和 GUI 自行拼状态的路径不能长期以 `deprecated` 名义保留；旧 Hook 与前端 DSL runtime 已在 P6 删除并迁为 catalog-only dead guard。

## 4.1 当前进展

截至 2026-07-04：

1. P1 Workflow Contract 已落到 `lime-rs/crates/app-server/src/runtime/workflow/**`，包含 definition、status、events、read model 和 source map。
2. P2 Read Model 已接入 App Server `workflow/read` current projection；`agentSession/read` / `read_session` 隐藏 workflow fields，避免普通 thread read 与 workflow projection 形成双事实源。
3. P3 Surface Mapping 已把 Plugin manifest、Skill `workflow_steps`、图片命令、内容工厂和 test-only DSL 映射到同一套 `WorkflowDefinition / WorkflowStepDefinition`。
4. P4 control API 已有 current JSON-RPC 边界：`workflow/read` 使用同一个 Workflow Read Model projector 合并 session runtime events 与 workflow audit log；`workflow/cancel` 已写入 workflow audit log 并返回同源 read model；`workflow/retry` 已写入 `workflow.step.retrying / workflow.run.retrying` audit log，并通过 current `agentSession/turn/start` 以 source turn 级重提交流程启动新 turn，返回 `rescheduledTurnId`；`workflow/respond` 已复用现有 `agentSession/action/respond` 处理带 `requestId/actionType` 的 waiting step，并在 action respond 成功后写 workflow audit log。
5. P6 已清掉两个最危险的生产旧入口：`useWorkflow` 旧 Hook 与 `WorkflowRuntimeHost` / `runtimePolicy` 前端 DSL runtime 已物理删除，`PluginsPage` workflow entry 继续 fail closed；插件本地 workflow DSL/profile 生产面已封口，workflow entry 必须走 App Server Workflow API 或 fail closed；`npm run governance:legacy-report` 当前边界违规为 0。
6. P5 UI Projection 已完成 General Workbench、Article Workspace 与 Plugin iframe 三条主路径：renderer App Server client 已暴露 `readWorkflow / cancelWorkflow / retryWorkflow / respondWorkflow` current 薄方法；General Workbench 已读取 `workflow/read` 并接入 `workflow/cancel / retry / respond` 控制按钮；Article Workspace 已接入页面级 `workflow/read` detail，展示 step-level failure、retry linkage、waiting action 和 attempt/source；Plugin iframe 已通过 `lime.agent.readWorkflow` 和 `capability:subscribe topic=workflow` 获取 App Server `workflow/read` 只读投影。Plugin SDK `lime.workflow` 已封为 disabled/blocked；通用 `verify:gui-smoke` 已通过，真实 Playwright Electron `content-factory-article-workspace` fixture 已覆盖 `workflow/read -> workflow/respond -> workflow/cancel -> workflow/retry` current JSON-RPC 链路，summary evidence 为 `.lime/qc/gui-evidence/content-factory-article-workspace-workflow-control-20260704-playwright-regenerated-summary.json`。图片命令聊天 presentation 与内部 workflow audit facts 已分层，`workflow/respond` 的 `ask_user / elicitation / tool_confirmation`、`waiting_permission`、多 respond action 与 skipped retry 投影已有前端回归和五语言文案。

## 5. current / compat / deprecated / dead 分类

### current

后续继续强化的主路径：

1. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow.rs` 的 `workflow.run.* / workflow.step.*` 事件族。
2. `lime-rs/crates/app-server/src/runtime/workflow/control.rs` 的 `workflow/cancel`、`workflow/retry` 和 `workflow/respond` current control；retry 通过 source turn 级重提交接回 current `agentSession/turn/start` 主链。
3. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow_cancel.rs` 与 `plugin_worker_workflow_retry.rs` 的 turn cancel / worker retry 补偿事件 adapter。
4. `lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs` 中图片命令复用 workflow audit 事件族的方向。
5. `RuntimeEvent`、event log、Evidence provider 对 `workflowRunId` 的关联。
6. Workflow Read Model 与 App Server JSON-RPC 查询 API：当前 `workflow/read` 是 workflow run / step / action 的唯一 current 读取入口；`agentSession/read` / `read_session` 不暴露 workflow fields。
7. Plugin manifest workflow declaration，前提是它只作为 definition source，不直接拥有 execution truth。
8. General Workbench workflow projection 与 control：只读取 Workflow Read Model，并通过 `workflow/cancel / retry / respond` current control API 触发动作。
9. Article Workspace workflow detail：页面级读取 `workflow/read`，只展示 current read model 派生的 run / step / action facts。
10. Plugin iframe workflow projection：`lime.agent.readWorkflow` 与 `capability:subscribe topic=workflow` 只读取 App Server `workflow/read`，不开放本地 DSL 或 control API。

### compat

允许短期存在但只能委托、映射或展示：

1. `src/features/plugin/manifest/types.ts` 的 `PluginWorkflowDeclaration.steps` 简化声明。
2. `src/lib/api/skill-execution.ts` 的 `workflow_steps` 轻量展示字段。
3. `src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts` 对历史 `workflow_runs / workflow_steps` 的兼容读取分支。
4. `src/lib/api/agentRuntime/types.ts` 中保留的 `workflow_runs / workflow_steps` 类型字段。

退出条件：current Workflow Read Model 与查询 API 落地后，compat 入口只能调用 current API 或被删除；不能继续保留平行 runtime。

### deprecated

禁止继续扩展的方向：

1. GUI 组件自行从 tool log、message、artifact 或 local state 拼 workflow run。
2. App / Plugin iframe 自行运行多步 AI 任务并把成功状态写回宿主。
3. Skill catalog 把 `id/name/dependencies` 当作可执行 workflow 合同。
4. `appServerReadModelProjection` 主动删除 workflow facts 后再由业务页面旁路读取历史记录；该行为已清理，后续不得恢复。
5. Plugin iframe / SDK `lime.workflow start/checkpoint/awaitHuman` 本地 DSL/runtime；SDK/profile 已封为 disabled/blocked，不再作为 production success path，iframe 只能通过 `lime.agent.readWorkflow` / workflow subscription 读取 App Server projection。

### dead

可以直接否定的方向：

1. 旧 `content_workflow_*` 命令与 `src/lib/api/content-workflow.ts` 作为新能力入口。
2. 新建第二套 `plugin_workflow_runtime` 后端执行器。
3. 用前端 `WorkflowRuntimeHost` 作为生产 AI workflow runtime。
4. 让 UI-only workflow step 成为 Evidence / Replay / Review 的事实源。
5. 恢复 `src/components/workspace/hooks/useWorkflow.ts`、`useWorkflow.test.ts`、`src/features/plugin/runtime/workflowRuntimeHost.ts`、`workflowRuntimeHost.test.ts` 或 `runtimePolicy.ts`。
6. 通过旧 `runtimePolicy`、`content_workflow_*` 或本地 WorkflowRuntimeHost DSL 绕过 App Server `workflow/read|cancel|retry|respond` current API。

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
5. 旧 Hook、前端 DSL runtime 和旧 content workflow 命令完成清理：无生产引用，已删除或被标记为 `dead / test-only`，并有守卫防回流。
6. General Workbench、Article Workspace 和 Plugin iframe 只读取 Workflow Read Model / projected events；Plugin SDK `lime.workflow` 本地 DSL profile 不再 enabled。

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
  tests.rs
```

`manifest_map.rs / skill_map.rs` 只是 `source_map.rs` 后续膨胀时的拆分候选；当前仓库尚未创建这两个文件。

配套协议和前端投影落点：

```text
lime-rs/crates/app-server-protocol/src/protocol/v0/workflow.rs
packages/app-server-client/src/generated/protocol-types.ts
src/lib/api/agentRuntime/types.ts
src/lib/api/agentRuntime/appServerReadModelProjection.ts
src/lib/api/appServerClientMethods.ts
src/components/agent/chat/workspace/workspaceWorkflowControls.ts
src/components/agent/chat/workspace/useWorkspaceArticleWorkflowReadModel.ts
src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts
src/features/plugin/runtime/workflowReadProjection.ts
src/features/plugin/runtime/hostBridge.ts
src/features/plugin/runtime/capabilityDispatcher.ts
```

现有文件退场关系：

| 分类 | 文件 | 后续处理 |
| --- | --- | --- |
| `current` | `lime-rs/crates/app-server/src/runtime/workflow/**` | 新增合同、状态、read model 和 control 的唯一演进位置。 |
| `compat` | `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow*.rs` | 先委托 `runtime/workflow/**`，再逐步收窄为 source adapter。 |
| `current` | `src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts` | Article Workspace 的 Workflow Read Model adapter，已兼容 `workflow/read` response；后续只补 presentation，不再拥有独立事实源。 |
| `current` | `src/components/agent/chat/workspace/workspaceWorkflowControls.ts` | General Workbench control projection，只从 current read model action 派生 cancel / retry / respond。 |
| `current` | `src/components/agent/chat/workspace/useWorkspaceArticleWorkflowReadModel.ts` | Article Workspace 页面级 `workflow/read` 读取入口，不新增 mock fallback。 |
| `current` | Plugin iframe projected workflow events | `lime.agent.readWorkflow` / `capability:subscribe topic=workflow` 只读读取 App Server `workflow/read` projection；不得恢复本地 workflow DSL/runtime success path。 |
| `deprecated / blocked` | Plugin SDK `lime.workflow start/checkpoint/awaitHuman` 本地 DSL/profile | 已封为 disabled/blocked；不得作为 production success path。 |
| `dead` | `src/components/workspace/hooks/useWorkflow.ts` | 已物理删除；不恢复旧 steps，只保留 catalog-only dead guard。 |
| `dead` | `src/features/plugin/runtime/workflowRuntimeHost.ts` | 已物理删除；不恢复前端 DSL runtime，只保留负向断言和 source mapping test-only fixture。 |
| `dead` | `src/features/plugin/runtime/runtimePolicy.ts`、旧 `content_workflow_*` | `forbidden-to-restore`；只能出现在治理守卫、路线图或负向测试。 |

第一刀已完成：`status.rs + definition.rs + read_model.rs + events.rs + source_map.rs` 已钉住标准合同，`workflow/read` 已提供 current 查询入口。第二刀已补 `workflow/cancel`、`workflow/retry` 与 `workflow/respond` current control；retry 以 source turn 级重提交流程接回 `agentSession/turn/start`，respond 只桥接已有 action-required 等待点，不伪造新执行器。P6 已按用户要求删除旧 Hook 与前端 DSL runtime，封住插件本地 workflow DSL/profile 生产面，并把 `governance:legacy-report` 边界违规清到 0。P5 renderer client、General Workbench read + control、Article Workspace 页面级 read detail、Plugin iframe read-only projected events、真实 Electron workflow control fixture、图片命令 presentation 分层和更多 `workflow/respond` 等待点展示均已完成。下一刀应转入收口验证与路线图归档判定，只在继续改图片 workflow 或交互控制时补更窄的 product smoke。
