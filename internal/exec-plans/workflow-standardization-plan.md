# Workflow 标准化执行计划

> 状态：completed
> 创建日期：2026-07-03
> 更新时间：2026-07-04
> 路线图：`internal/roadmap/workflow/README.md`
> 主目标：把 Lime Workflow 从多套局部语义收敛为 App Server RuntimeCore + `workflow.*` RuntimeEvent + Workflow Read Model 的 current 主链。

## 1. 背景结论

本计划承接 `internal/roadmap/workflow/`。当前复核结论：

1. Lime 已有 Workflow 事件基础，尤其是 App Server `plugin_worker_workflow`、cancel/retry 补偿和图片命令 workflow audit。
2. Lime 的问题是定义、执行、read model 和 UI 投影不统一，而不是完全缺少 workflow。
3. 后续新增能力必须进入 App Server RuntimeCore / Workflow Read Model，不再扩展前端 WorkflowRuntimeHost 或旧 workspace Hook。

## 2. 写集边界

本计划后续允许触碰的主路径：

1. `lime-rs/crates/app-server/src/runtime/workflow/**`，Workflow 后端 current owner。
2. `lime-rs/crates/app-server-protocol/src/protocol/v0/workflow.rs` 及 method catalog / schema registry。
3. `lime-rs/crates/app-server/src/processor/workflow.rs`，仅用于 App Server JSON-RPC 分发。
4. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow*.rs`，仅用于 compat 委托和 source adapter 收口。
5. `lime-rs/crates/app-server/src/runtime_backend/image_command/**`，仅用于对齐 workflow audit 字段。
6. `lime-rs/crates/app-server-client/src/lib.rs`
7. `packages/app-server-client/src/protocol*`
8. `src/lib/api/agentRuntime/**`
9. `src/features/plugin/manifest/**`
10. `src/features/plugin/runtime/**`，仅用于 adapter/test-only 边界收缩
11. `src/components/agent/chat/workspace/**`
12. `src/lib/dev-bridge/commandPolicy.ts`
13. `src/lib/governance/**`
14. `internal/roadmap/workflow/**`

不主动触碰：

1. 旧 `content_workflow_*` 生产实现。
2. 已删除的 `src/components/workspace/hooks/useWorkflow.ts` / `useWorkflow.test.ts`，只允许作为治理 dead guard 路径出现。
3. Electron / App Server 命令边界之外的 GUI 壳。

## 3. 当前分类

| 分类 | Surface |
| --- | --- |
| `current` | App Server `workflow.run.* / workflow.step.*` RuntimeEvent，event log，Workflow Read Model，`workflow/read|cancel|retry|respond` JSON-RPC，以及 General Workbench / Article Workspace / Plugin iframe 的 read model projection。 |
| `compat` | Plugin manifest workflow declaration、Skill `workflow_steps` summary、历史 `workflow_runs / workflow_steps` 类型字段；只能映射到 current read model 或 definition source。 |
| `deprecated` | GUI 自行拼 workflow 状态、read model projection 删除 workflow facts 后的旁路读取、Plugin iframe / SDK `lime.workflow` 本地 `start/checkpoint/awaitHuman` DSL 表达。 |
| `dead` | 已删除的旧 `useWorkflow` steps Hook、已删除的 `WorkflowRuntimeHost` / `runtimePolicy` 前端 DSL runtime、旧 `content_workflow_*` 命令和 `src/lib/api/content-workflow.ts` 作为新入口；这些路径为 `forbidden-to-restore`。 |

## 4. 分阶段任务

### P0：路线图落库

状态：completed

任务：

- [x] 新增 `internal/roadmap/workflow/README.md`
- [x] 新增 `internal/roadmap/workflow/prd.md`
- [x] 新增 `internal/roadmap/workflow/architecture.md`
- [x] 新增 `internal/roadmap/workflow/diagrams.md`
- [x] 新增 `internal/roadmap/workflow/implementation-plan.md`
- [x] 新增本执行计划

退出条件：

- `git diff --check` 通过。

### P1：统一 Workflow Contract

状态：completed

任务：

- [x] 新建 `lime-rs/crates/app-server/src/runtime/workflow/mod.rs`。
- [x] 新建 `lime-rs/crates/app-server/src/runtime/workflow/definition.rs`，定义 `WorkflowDefinition / WorkflowStepDefinition`。
- [x] 新建 `lime-rs/crates/app-server/src/runtime/workflow/status.rs`，增加 status mapping helper，只允许 adapter 使用旧状态。
- [x] 新建 `lime-rs/crates/app-server/src/runtime/workflow/read_model.rs`，定义 `WorkflowRun / WorkflowStepRun / WorkflowReadModel`。
- [x] 新建 `lime-rs/crates/app-server/src/runtime/workflow/events.rs`，集中 `workflow.*` event name、worker progress allowlist、step binding 和 required payload 校验。
- [x] 将 `plugin_worker_workflow*.rs` 标成 compat source adapter，事件名、allowlist、terminal 判断和状态归一开始委托 `runtime/workflow/**`。
- [x] 建立 manifest / skill / image / content workflow fixture。
- [x] 补基础结构测试：状态归一、definition/run 分离、从 `workflow.*` 事件恢复 run/steps。

退出条件：

- 四类 definition source 都能映射到同一 schema。
- current runtime 不直接写旧状态。
- `runtime/workflow/status.rs + definition.rs + read_model.rs` 成为 P2/P3 唯一合同入口。

### P2：Workflow Read Model

状态：completed

任务：

- [x] App Server event log 增加 workflow projector：`workflow_read_model_from_stored_session(...)` 合并 session runtime events 与 workflow audit log，供 `workflow/read` 和 control response 复用。
- [x] `workflow/read` 返回 workflow runs / steps / actions current read model；`agentSession/read` / `read_session` 隐藏 workflow facts，避免普通 thread read 与 workflow projection 形成双事实源。
- [x] 前端 `appServerReadModelProjection` 停止删除 workflow facts。
- [x] `appServerEventStream` 对 workflow events 触发 read model 更新：投影为 diagnostics-only `runtime_status` refresh signal，不进入普通 item timeline。

退出条件：

- completed / failed / canceled / retrying fixtures 可恢复 run detail。
- 关闭重开后 workflow 状态不丢。

### P3：Surface Mapping

状态：completed

任务：

- [x] Plugin manifest steps 映射为 current `WorkflowStepDefinition`：`runtime/workflow/source_map.rs` 已提供 source mapping，`plugin_worker_workflow.rs` 已复用该 helper 解析 runtime steps。
- [x] `WorkflowRuntimeHost` DSL 明确 test-only 或 adapter mapping：`storage.set / knowledge.search / agent.startTask / artifacts.create / evidence.record` 已在 source mapping fixture 中映射到 current step kind，生产运行仍不得使用前端 DSL。
- [x] Skill workflow steps 降为 definition summary：Skill `workflow_steps` source mapping 带 `summaryOnly` policy，不承诺执行合同。
- [x] 图片命令 workflow audit 字段补齐一致性：内置 image workflow 固定五步 `intent / route / create_tasks / generate / persist_outputs`，step event 补齐 `stepIndex / stepCount / stepKind`。
- [x] 内容工厂 worker orchestration 只作为 definition source：content factory orchestration fixture 已映射到 `WorkflowDefinition`，运行态 step 解析同源于 `source_map.rs`。

退出条件：

- 同一 workflow key 的 step ids 在 manifest、event 和 read model 一致。
- 旧状态只出现在 adapter mapping 测试中。

### P4：Runtime Control

状态：completed

任务：

- [x] 收敛或新增 `workflow/read`：App Server JSON-RPC、Rust client、TS client、schema fixture、processor 和 `src/lib/dev-bridge/commandPolicy.ts` current method profile 已同步。
- [x] 收敛或新增 `workflow/cancel`：App Server JSON-RPC、RuntimeCore audit-log control、Rust client、TS client、schema fixture、processor 和 DevBridge current method profile 已同步。
- [x] 收敛或新增 `workflow/retry`：App Server JSON-RPC、RuntimeCore audit-log control、source turn 级 executor 重调度、Rust client、TS client、schema fixture、processor 和 DevBridge current method profile 已同步；返回 `rescheduledTurnId` 用于追踪新 turn。
- [x] 收敛或新增 `workflow/respond`：App Server JSON-RPC、RuntimeCore action respond bridge、Rust client、TS client、schema fixture、processor 和 DevBridge current method profile 已同步；只对能解析到现有 `action.required` 的 waiting step 生效。
- [x] 补 control API contract tests：覆盖 cancel / retry / respond read model 更新。
- [x] 实现 `workflow/retry` source turn 级 executor 重调度语义：复用 source turn input / runtime options，通过 current `agentSession/turn/start` 主链提交新 turn。
- [x] 确认 P4 core 范围只包含 `read/cancel/retry/respond` control API；更多 waiting presentation 已归入 P5 UI Projection 并完成。

退出条件：

- GUI 不直接写 workflow status。
- cancel / retry 事件、read model 和 `rescheduledTurnId` linkage 一致。
- retry 已能重提交流程，但不承诺在原 workflow run / step 内就地恢复执行；P5 UI 需要把旧 run 的 retry metadata 和新 turn / run 关联展示清楚。

### P5：UI Projection

状态：completed

任务：

- [x] renderer App Server client 暴露 `readWorkflow / cancelWorkflow / retryWorkflow / respondWorkflow` 薄方法，直接走 package protocol 常量和类型，不新增 mock/fallback。
- [x] General Workbench run detail 读取 Workflow Read Model：`useWorkspaceGeneralWorkbenchSidebarRuntime` 已在 sidebar 可见时调用 `workflow/read`，并用 `workspaceWorkflowReadModel.ts` 将 current run / step / action 投影到通用工作台 run detail、步骤和活动日志。
- [x] General Workbench control UI 接入 `workflow/cancel / retry / respond`：按钮级操作由 read model action 派生，只调用 App Server current control API，成功后用返回的 read model 刷新。
- [x] Article Workspace workflow facts helper 改为 current read model adapter：兼容 `workflow/read` response / `WorkflowReadModel` 的 `workflow.workflowRuns / workflow.workflowSteps / actions`，保留 retry metadata、request/action identity 和 artifact/evidence refs。
- [x] Article Workspace 自身读取 `workflow/read` 并渲染 step-level failure/retry/waiting/action/attempt；页面级 detail panel 与 Article Workspace projection 共用 current read model facts。
- [x] Plugin iframe 只订阅 projected workflow events；SDK/profile 本地 `lime.workflow` DSL/runtime 成功路径已封为 disabled/blocked。`lime.agent.readWorkflow` 与 `capability:subscribe topic=workflow` 均只读取 App Server `workflow/read` projection，不开放本地 DSL 或 workflow control。
- [x] 真实 Electron `content-factory-article-workspace` fixture 覆盖 `workflow/read -> workflow/respond -> workflow/cancel -> workflow/retry` current JSON-RPC 链路，并写入可审计 summary evidence。
- [x] 图片命令聊天 presentation 与内部 audit facts 分层：模型生成 payload 只保留用户可见 `planning_summary / assistant_intro / completion_caption / result_captions` 等 presentation 合同，workflowRunId / requestId / redaction 等内部 audit facts 不进入 generated presentation payload。
- [x] 扩展 `workflow/respond` 更多等待点类型的 GUI presentation：General Workbench respond control 按 `ask_user / elicitation / tool_confirmation` 选择不同五语言文案键，并识别 `waiting_permission` waiting step。
- [x] General Workbench workflow detail rows 用户可见文案补五语言 i18n。
- [x] Article Workspace workflow detail 用户可见文案补五语言 i18n。

退出条件：

- 真实 Electron Playwright fixture 已覆盖至少一个真实 workflow：`.lime/qc/gui-evidence/content-factory-article-workspace-workflow-control-20260704-playwright-regenerated-summary.json` 的 `ok=true`，`appServerRequestMethods` 包含 `workflow/read`、`workflow/respond`、`workflow/cancel`、`workflow/retry`。
- 运行详情可恢复、可解释失败、可触发可用动作。
- 图片命令聊天 presentation 与 workflow audit facts 分层已有 Rust 定向回归；`workflow/respond` 的 `ask_user / elicitation / tool_confirmation` GUI presentation 已有前端单元回归和五语言 i18n。

### P6：治理清理

状态：completed

任务：

- [x] 从生产 `AgentChatWorkspace` 撤掉并删除 `useWorkflow` legacy steps Hook；旧路径只保留 catalog-only `dead` 回流守卫。
- [x] 为 `WorkflowRuntimeHost` 生产调用添加边界测试：legacy catalog 禁止 `src/components/agent` / `src/lib/api/agentRuntime` / AgentUI packages 重新引用。
- [x] 从生产 `PluginsPage` 撤掉 `WorkflowRuntimeHost` 本地 DSL 假完成路径；workflow entry 现在 fail closed，提示必须接入 App Server Workflow API。
- [x] 确认旧 `content_workflow_*` / `content-workflow.ts` dead 分类。
- [x] 更新 legacy catalog 或 contract guard。
- [x] 删除 `src/components/workspace/hooks/useWorkflow.ts` 及其测试，并迁入 catalog-only `dead` guard。
- [x] 删除 `src/features/plugin/runtime/workflowRuntimeHost.ts`、`workflowRuntimeHost.test.ts` 与 `runtimePolicy.ts`，并迁入 catalog-only `dead` guard。
- [x] 插件本地 workflow DSL/profile 生产面封口：`appCenterRuntimeProfile` 只暴露 UI runtime capability profile，`workerRuntimeEnabled=false`；`PluginLabPage` 不再构建 workflow runtime profile；`AdapterCapabilityHost` 对 workflow entry fail closed 并要求 App Server Workflow API。
- [x] Plugin Manager launch 与 P14 runtime guard 对齐：runtime 可用但 workflow guard 未放行时允许触发 guard 评估，blocked launch 只更新 runtime guard / lifecycle evidence，不生成本地 workflow run success。
- [x] Plugin iframe / SDK `lime.workflow` 的 `start/checkpoint/awaitHuman` 旧表达封为 disabled/blocked；本地 DSL/runtime 不再作为 production success path，只允许负向测试或历史文档引用。
- [x] 清理阻塞 P6 收口的既有 governance residual：`session_store` 删除会话改走 `agent_session_repository` current 边界，legacy catalog 同步已移动的 migration/test/sidecar 边界，`npm run governance:legacy-report` 边界违规降为 0。

退出条件：

- `npm run governance:legacy-report` 无 workflow 旧路回流。
- `npm run test:contracts` 覆盖 current API 和 test-only 边界。
- 精确扫描旧路：`rg -n "WorkflowRuntimeHost|src/features/plugin/runtime/workflowRuntimeHost|src/features/plugin/runtime/runtimePolicy|src/components/workspace/hooks/useWorkflow|content_workflow_|content-workflow" src packages lime-rs/crates eslint.config.js` 只能命中治理目录册、lint 守卫、路线图、负向测试或同名但非旧路的 `runtimePolicyEvidence` 诊断 helper；`useWorkflowInputState` 不是旧 Hook，不应作为 P6 红点。
- 重构完成后不得保留无调用旧实现：`useWorkflow`、`content_workflow_*` 和前端 DSL runtime 必须删除或被 catalog 明确标记为 `dead / test-only`，不能长期停留在 `deprecated`。

当前 `workflow/read` 说明：

- `workflow/read` 使用 `workflow_read_model_from_stored_session(...)` 合并 session runtime events 与 workflow audit log，是 current workflow run / step / action projection 的唯一读取 API；`agentSession/read` / `read_session` 隐藏 workflow fields，避免普通 thread read 与 workflow projection 形成第二套展示事实源。
- `workflow/read` 只做 read model 读取，不承担 cancel / retry / respond 控制语义。
- `workflow/cancel` 是 current control 第一刀：只按 `sessionId + workflowRunId + stepId?` 写 workflow audit log 的 `workflow.step.canceled / workflow.run.canceled`，然后复用同一个 read model 返回，不调用旧 turn cancel。
- `workflow/retry` 是 current control 第二刀：按 `sessionId + workflowRunId + stepId?` 校验可重试的 failed / canceled / skipped run 或 step，写 workflow audit log 的 `workflow.step.retrying / workflow.run.retrying`，提升 step attempt；随后读取 source turn 的 `turn_inputs / turn_runtime_options`，生成 `rescheduledTurnId`，通过 current `agentSession/turn/start` 主链重新提交执行，并在 retry metadata 中记录 `sourceTurnId / rescheduledTurnId`。如果重调度启动失败，会追加 `workflow.step.failed / workflow.run.failed`，避免旧 run 长期卡在 `retrying`。当前语义是 source turn 级重提交，不是原 run / step 原地续跑。
- `workflow/respond` 是 current control 第三刀：只对 waiting step 生效，必须能从 step 或参数解析到现有 `action.required` 的 `requestId/actionType`，随后复用 `agentSession/action/respond` 提交响应；action respond 成功后写 workflow audit log 的 `workflow.step.progress status=running` 并复用同一个 read model 返回。缺少 action identity 或不处于 waiting 状态时 fail closed。
- 前端 bridge 只把 `workflow/read / cancel / retry / respond` 识别为 App Server current read profile；没有新增 mock fallback 或 legacy facade。Plugin iframe 侧只新增 `lime.agent.readWorkflow` 和 `capability:subscribe topic=workflow` read-only projection，内部仍调用 App Server `workflow/read`。
- 真实 Electron workflow control evidence 已落到 `content-factory-article-workspace` current fixture：`workflow/read` 读取 waiting action，`workflow/respond` 将 waiting step 投影回 running，`workflow/cancel` 将 run/step 投影为 canceled，`workflow/retry` 返回 `rescheduledTurnId` 并把 `retrySource=workflow/retry`、`retryReasonCode=fixture_retry_requested`、`sourceTurnId/rescheduledTurnId` linkage 写入 read model；该 fixture 继续禁止 live Provider、App Server mock backend 和 renderer mock fallback。
- 图片命令 `ImageCommandWorkflow` 的用户可见 presentation 与 workflow audit facts 已分层：presentation generation 使用独立 text-capable model selection 和 `image_task.presentation.generated` 事件输出可见文案，workflow run / step facts 继续写 metadata-only audit log；generated payload 会丢弃模型夹带的 workflowRunId / requestId / redaction 等内部字段。
- General Workbench `workflow/respond` GUI presentation 已覆盖 `ask_user / elicitation / tool_confirmation`：按钮仍只调用 App Server current `workflow/respond`，但文案按 action type 区分；`waiting_permission` 与 `waiting_action` 同样作为 waiting step 投影。

## 5. 验证命令

按阶段选择：

```bash
git diff --check
npm run test:contracts
npm run test:related -- <changed files>
npm run test:rust:related -- <paths...>
npm run verify:gui-smoke
```

## 6. 进度日志

- 2026-07-03：创建 Workflow 标准化路线图与执行计划。当前只做文档落库，不改运行时代码。主链目标固定为 App Server RuntimeCore + `workflow.*` RuntimeEvent + Workflow Read Model。
- 2026-07-04：补充代码建议目录。后端 current owner 固定为 `lime-rs/crates/app-server/src/runtime/workflow/**`；第一刀顺序固定为 `status.rs + definition.rs + read_model.rs`，现有 `plugin_worker_workflow*.rs` 只作为 compat source adapter 逐步委托新模块。
- 2026-07-04：开始代码实现。新增 `runtime/workflow/{mod,definition,status,read_model,tests}.rs`，定义 Workflow Contract、统一状态映射和基础 read model projector；`runtime/read_model.rs` 提供 `workflow_read_model_from_stored_session(...)`，让 `workflow/read` 合并 session runtime events 与 workflow audit log；前端 `appServerReadModelProjection` 保持兼容旧 workflow facts，但 current UI 后续改由 `workflow/read` 读取。验证：`npx vitest run "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。Rust 定向测试 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow::` 当前被工作树既有删除 `lime-rs/crates/services/src/agent_session_store.rs` 阻塞，错误为 `file not found for module agent_session_store`；未恢复该用户/外部改动。
- 2026-07-04：继续重构和清旧路。新增 `runtime/workflow/events.rs` 并让 `plugin_worker_workflow*.rs` 委托 current 事件 helper；`appServerEventStream` 不再直接吞掉 `workflow.*`，而是投影为 diagnostics-only `runtime_status`，复用现有 runtime sync 触发 `agentSession/read` refresh，避免 workflow audit 进入普通 timeline。`legacySurfaceCatalog.json` 将旧 `content_workflow_*` / `content-workflow.ts` 固定为 `dead`，先将 `useWorkflow` 和 `WorkflowRuntimeHost` 限定为退场对象并补 catalog 单测封住回流。
- 2026-07-04：按“完成重构后要清理原来的”要求收窄旧前端入口：生产 `AgentChatWorkspace` 不再调用 `src/components/workspace/hooks/useWorkflow.ts`，`useWorkspaceWriteFileAction` 删除旧步骤索引推进分支；legacy catalog 将该 Hook 的 allowed paths 清零并先标为退场候选，P6 退出条件改为最终删除或 catalog-only dead guard。
- 2026-07-04：完成 P1 source fixtures 与 P3 source mapping 第一刀。新增 `runtime/workflow/source_map.rs`，统一 Plugin manifest、Skill `workflow_steps`、image command builtin workflow、content factory orchestration 与 WorkflowRuntimeHost test-only DSL 到 `WorkflowDefinition / WorkflowStepDefinition`；`plugin_worker_workflow.rs` 删除本地 step parser，改用 current source mapping helper。图片命令 workflow audit 从两步临时事实对齐为五步 current facts，并补 `stepIndex / stepCount / stepKind`。验证：`cargo fmt -p app-server --manifest-path "lime-rs/Cargo.toml"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow:: -- --nocapture` 首轮通过 15 个 Workflow 用例；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command_workflow_creates_task_from_current_intent_metadata -- --nocapture` 通过。一次 `workflow::` 复跑曾被当前工作树非 Workflow 的 `lime-agent` `TurnContextOverride` 类型分裂阻塞，未扩大范围处理。
- 2026-07-04：完成 P4 `workflow/read` current API 第一刀。新增 App Server protocol DTO / method catalog / schema fixture，RuntimeCore `read_workflow_current(...)` 复用 `load_session_current(...)` 与 workflow read model projector，processor 分发到 current read model；Rust client、TS client 与 `packages/app-server-client` method catalog 同步，`src/lib/dev-bridge/commandPolicy.ts` 将 `workflow/read` 纳入 App Server current read timeout profile。验证：`cargo fmt -p app-server -p app-server-protocol -p app-server-client --manifest-path "lime-rs/Cargo.toml"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_read -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client typed_request_helper_binds_method_to_protocol_params -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow:: -- --nocapture` 通过 18 个 Workflow 用例。
- 2026-07-04：按“完成重构后要清理原来的”继续收口前端 DSL 旧路。`PluginsPage` 不再 import / new `WorkflowRuntimeHost`，workflow-only plugin entry 不再通过前端本地 `evidence.record` DSL 伪造完成，改为 fail closed 并提示需要 App Server Workflow API；五语言 i18n 和 `PluginsPage.test.tsx` 已同步。随后 P6 物理删除 `src/features/plugin/runtime/workflowRuntimeHost.ts`、`workflowRuntimeHost.test.ts`、`runtimePolicy.ts`，只保留 SDK public surface 负向断言和 App Server source mapping test-only fixture。
- 2026-07-04：推进 P4 control API。新增 App Server `workflow/cancel / workflow/retry / workflow/respond` protocol DTO、method catalog、schema fixture、processor、Rust client、TS client 和 DevBridge current method profile；`runtime/workflow/control.rs` 实现 `workflow/cancel`，按 workflow read model 找到 run / 非 terminal steps 后只写 workflow audit log，并返回同源 read model。当时 retry/respond 均先保持 fail-closed，避免恢复旧前端 DSL 或 mock fallback；下一条日志已把 retry 提升为 audit-log control。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -p app-server-protocol -p app-server-client` 通过；默认 `lime-rs/target` 当前存在 Cargo 缓存异常，后续 Rust 验证使用隔离 `CARGO_TARGET_DIR=/tmp/lime-workflow-target`。
- 2026-07-04：继续推进 P4 retry control。`workflow/retry` 从 fail-closed 提升为 current audit-log control：校验 session/run/step，只允许 failed / canceled / skipped run 或 step 进入 retry，写入 `workflow.step.retrying / workflow.run.retrying`，step attempt 递增并清理旧 failure / finishedAt 投影；read model 现在只为 failed/canceled/skipped run 或 step 暴露真实可用的 `retry` action。`workflow/respond` 仍保持 fail-closed，避免伪造等待点执行。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_retry -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server projects_retry_actions -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_ -- --nocapture` 通过 34 个 Workflow 用例。
- 2026-07-04：继续推进 P4 respond control。`workflow/respond` 从 fail-closed 提升为 current action respond bridge：waiting step 必须带 `requestId/actionType`，或由参数提供 action identity；RuntimeCore 复用现有 `agentSession/action/respond`，成功后再写 workflow audit `workflow.step.progress status=running`。workflow audit 仍执行 metadata-only redaction，response 原文不会进入 Workflow Read Model；read model 只暴露带 action identity 的 `respond` action。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -p app-server-protocol -p app-server-client` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_respond -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures` 通过；`npm run generate:protocol-types` / `npm run check:protocol-types` 通过；`npm --prefix "packages/app-server-client" test` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_ -- --nocapture` 通过 33 个 Workflow 用例；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client typed_request_helper_binds_method_to_protocol_params -- --nocapture` 通过。
- 2026-07-04：完成 P4 retry source turn 级重调度第一刀。`workflow/retry` 现在不只写 audit log：它从 source turn 读取原始 input 与 runtime options，生成 `rescheduledTurnId`，通过 current `agentSession/turn/start` 主链重新提交执行，并把 `sourceTurnId / rescheduledTurnId` 写入 retry metadata 和 `WorkflowRetryResponse.rescheduledTurnId`。若新 turn 启动失败，会追加 `workflow.step.failed / workflow.run.failed`，避免旧 run 停留在假 `retrying`。该语义是 source turn 级重提交流程，不是原 run / step 就地恢复 executor；P5 UI 需要展示这一 linkage。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -p app-server-protocol -p app-server-client` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_retry -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo run --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol --bin write_schema_fixtures` 通过；`npm run generate:protocol-types` / `npm run check:protocol-types` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_ -- --nocapture` 通过 33 个 Workflow 用例；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client typed_request_helper_binds_method_to_protocol_params -- --nocapture` 通过；`npm --prefix "packages/app-server-client" test` 通过。
- 2026-07-04：启动 P5 UI Projection 第一刀。`workspaceArticleWorkspaceWorkflowFacts.ts` 不再只吃历史 `thread_read.workflow_runs / workflow_steps` 旁路形状，已兼容 current `workflow/read` response 的 `workflow.workflowRuns / workflow.workflowSteps / actions`，并透传 run / step 的 `retry` metadata、`requestId / agentActionType`、artifact / evidence refs，给后续 run detail 和 retry/respond 按钮展示提供同源 projection。验证：`npx vitest run "src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.unit.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过；`npm run test:related -- src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.ts` 跑到 534/535 通过，但既有 `src/components/agent/chat/index.workbench01.test.tsx` 的“轻量预览”断言失败，定向复跑同一用例仍失败，和本次 workflow projection helper 无直接依赖，未在本轮扩范围修复。
- 2026-07-04：完成 P6 旧实现物理删除第一刀。删除 `src/components/workspace/hooks/useWorkflow.ts`、`useWorkflow.test.ts`、`src/features/plugin/runtime/workflowRuntimeHost.ts`、`workflowRuntimeHost.test.ts` 与 `runtimePolicy.ts`；`legacySurfaceCatalog.json` 将旧 Hook 与前端 DSL runtime 标记为 `dead / deleted`，`eslint.config.js` 将旧 `content_workflow_*` 文案改为禁止恢复并指向 App Server `workflow/read|cancel|retry|respond` current methods；`PluginsPage.runtime.test.tsx` 改为断言 workflow entry fail closed，避免测试回拉前端本地 DSL 成功路径。
- 2026-07-04：补 P5 renderer workflow current client 薄层。`src/lib/api/appServerConstants.ts`、`appServerTypes.ts` 与 `appServerClientMethods.ts` 转出 `workflow/read|cancel|retry|respond` constants、types 和 `readWorkflow/cancelWorkflow/retryWorkflow/respondWorkflow` 方法，直接复用 `packages/app-server-client` protocol；`src/lib/api/appServer.test.ts` 覆盖 `readWorkflow` 发出 App Server current `workflow/read` 请求。该改动只补 UI 后续接线入口，不新增 renderer mock、legacy facade 或第二套 workflow 网关。
- 2026-07-04：推进 P5 General Workbench workflow projection。新增 `workspaceWorkflowReadModel.ts`，`useWorkspaceGeneralWorkbenchSidebarRuntime.ts` 在 sidebar 可见时读取 App Server current `workflow/read`，并优先用 Workflow Read Model 投影步骤、活动日志与 run detail；`GeneralWorkbenchWorkflowPanel` / view model 展示 failure reason、retry linkage、waiting action、attempt/source 等 detail rows，并补五语言 i18n。验证：`npx vitest run "src/components/agent/chat/workspace/useWorkspaceGeneralWorkbenchSidebarRuntime.test.tsx" "src/components/agent/chat/components/generalWorkbenchWorkflowPanelViewModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.unit.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。
- 2026-07-04：继续 P6 插件本地 workflow DSL/profile 封口。`src/features/plugin/runtime/appCenterRuntimeProfile.ts` 改为 UI runtime capability profile 且 `workerRuntimeEnabled=false`；`PluginLabPage` 删除生产 `buildWorkflowRuntimeCapabilityProfile` 调用；`AdapterCapabilityHost` 对 `entry.kind === "workflow"` 抛 `WORKFLOW_RUNTIME_DISABLED`，不再本地跑 workflow entry；`legacySurfaceCatalog.json` 增加插件本地 workflow runtime profile / adapter success runner 回流守卫；Plugin Manager launch 在 runtime 可用但 guard blocked 时复用 P14 guard 评估，不生成本地 run success。验证：`npx vitest run "src/features/plugin/adapters/AdapterCapabilityHost.test.ts" "src/features/plugin/ui/PluginLabPage.test.tsx" "src/lib/governance/legacySurfaceCatalog.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。
- 2026-07-04：完成 P5 General Workbench control 接线。`workspaceWorkflowControls.ts` 从 current read model actions 派生 cancel / retry / respond 控制项，`GeneralWorkbenchWorkflowControlBar` 只负责展示和触发，`useWorkspaceGeneralWorkbenchSidebarRuntime` 调用 App Server `workflow/cancel|retry|respond` 后用返回 read model 刷新；不新增 mock fallback 或 legacy facade。验证：`npx vitest run "src/components/agent/chat/workspace/workspaceWorkflowControls.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceGeneralWorkbenchSidebarRuntime.test.tsx" "src/components/agent/chat/components/GeneralWorkbenchSidebar.test.tsx" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。
- 2026-07-04：完成 P5 Article Workspace 页面级 `workflow/read` detail。`useWorkspaceArticleWorkflowReadModel.ts` 调用 App Server current `workflow/read`，`WorkspaceArticleEditorRightSurface` 将 live workflow runs 合并进 Article Workspace projection，`WorkspaceArticleWorkflowDetailPanel` 展示 step-level failure / retry linkage / waiting action / attempt，并补五语言 i18n。验证：`npx vitest run "src/components/agent/chat/workspace/useWorkspaceArticleWorkflowReadModel.test.tsx" "src/components/agent/chat/workspace/WorkspaceArticleEditorRightSurface.test.tsx" "src/components/agent/chat/workspace/workspaceArticleWorkspaceWorkflowFacts.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleEditorOrchestrationModel.unit.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过；`WorkspaceArticleEditorRightSurface.test.tsx` 仍有 React act warning，未阻塞通过。
- 2026-07-04：完成 Plugin SDK/profile 本地 workflow DSL 封口。`src/features/plugin/sdk/capabilityCatalog.ts` 将 `lime.workflow` 降为 `planned` 且 profile 为空；`buildWorkflowRuntimeCapabilityProfile` 返回 disabled/none；`UiExtensionHost` 对 `lime.workflow` 无条件 blocked 为 `current-api-required`；Host Bridge discovery 暴露 disabled/none，`capabilityDispatcher` 对 `start/checkpoint/awaitHuman` 负向 fail closed。旧 `WorkflowRuntimeHost`、`runtimePolicy`、`useWorkflow`、`content_workflow_*` 继续按 `dead / forbidden-to-restore` 处理。验证：`npx vitest run "src/features/plugin/sdk/capabilityContract.test.ts" "src/features/plugin/sdk/publicSdkSurface.test.ts" "src/features/plugin/runtime/capabilityDispatcher.unit.test.ts" "src/features/plugin/runtime/uiExtensionHost.test.ts" "src/features/plugin/ui/PluginRuntimePage.hostBridge.test.tsx" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。
- 2026-07-04：完成 Plugin iframe projected workflow events 第一刀。新增 `src/features/plugin/runtime/workflowReadProjection.ts`，`capabilityDispatcher` 支持 `lime.agent.readWorkflow` 只读读取 App Server `workflow/read`，Host Bridge 支持 `capability:subscribe topic=workflow` 并发送 `workflow:readModel` event；`lime.workflow start/checkpoint/awaitHuman` 继续 disabled/blocked，不恢复本地 DSL/runtime。同步 `capabilityCatalog`、`capabilityContract` 和 `.d.ts`。验证：`npm test -- --run "src/features/plugin/runtime/capabilityDispatcher.unit.test.ts" "src/features/plugin/ui/PluginRuntimePage.hostBridge.test.tsx" "src/features/plugin/sdk/capabilityContract.test.ts" "src/features/plugin/sdk/publicSdkSurface.test.ts"` 通过；`npm run test:contracts` 通过；`npm run verify:gui-smoke` 通过；`git diff --check` 通过。`npm run typecheck` 曾在多个并发 tsc 进程下超过可用反馈窗口，已中断，未取得退出码。
- 2026-07-04：`/subagents` 继续收口 P6 与验证缺口。`hostBridge.ts` 的 workflow subscription poll 去掉 `readWorkflow as never` 类型逃逸；`session_store.rs` 删除会话不再 direct 调 `AgentDao::delete_session`，改走 `agent_session_repository::delete_session` current 边界，并补 `delete_session_should_remove_session_record` 单测；`legacySurfaceCatalog` 同步 `legacy_conversation.rs` 已迁到 `lime-agent`、Plugin worker runtime response/tests 拆分后的 sidecar/generated-content 边界。验证：Plugin/SDK 定向 36 个测试通过；`npm run test:contracts` 通过；`npm run governance:legacy-report` 通过且边界违规 0；`npm run verify:gui-smoke` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过；`CARGO_TARGET_DIR="/tmp/lime-workflow-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core delete_session_should_remove_session_record -- --nocapture` 通过；`git diff --check` 通过。`tsconfig.node.json` 单独通过；renderer typecheck 多次无诊断输出但被 SIGTERM 143 终止，未宣称通过。
- 2026-07-04：补齐真实 workflow GUI smoke。扩展现有 `content-factory-article-workspace` Electron fixture，而不是新增平行脚本：同一场景依次覆盖 `workflow/read -> workflow/respond -> workflow/cancel -> workflow/retry`，并断言生产链路经 Electron preload `app_server_handle_json_lines`、App Server current JSON-RPC、RuntimeCore Workflow Read Model，不回流 `WorkflowRuntimeHost`、旧 Hook、`content_workflow_*` 或 mock fallback。最终通过命令：`npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --app-url http://127.0.0.1:1420/ --evidence-dir .lime/qc/gui-evidence --prefix content-factory-article-workspace-workflow-control-20260704-final --timeout-ms 240000`；summary：`.lime/qc/gui-evidence/content-factory-article-workspace-workflow-control-20260704-final-summary.json`，`ok=true`，session=`claw-chat-current-1783148942708-61851`，`appServerRequestMethods` 包含四个 workflow methods，`workflow/retry` 返回 `rescheduledTurnId=turn_0e6700a325a247e88d9a135d391ff3a9`，step attempt=`2`，host generation fixture `requestCount=4`。
- 2026-07-04：文档收口同步 `internal/roadmap/workflow/README.md`、`implementation-plan.md` 与本执行计划，记录真实 workflow GUI smoke 已完成，并把图片命令 presentation / 更多 respond 等待点归入 P5 收口。随后修正 `scripts/check-app-server-client-contract.mjs` 中 runtime provider façade contract 片段，使守卫跟随 current `SessionProviderConfig`、`.configure_provider(config.clone().into(), ...)` 与 `route_protocol_from_session_provider_config` 命名，不再要求旧 `ProviderConfig / route_protocol_from_provider_config`。验证：`npm run governance:legacy-report` 通过且边界违规 0；`npm run test:contracts` 通过；`git diff --check` 通过。
- 2026-07-04：完成 P5 剩余两项。图片命令 presentation 边界补 `generated_payload_excludes_workflow_audit_facts` Rust 回归，证明模型输出夹带的 `workflowRunId / requestId / redaction` 不进入 generated presentation payload；General Workbench `workflow/respond` control 按 `ask_user / elicitation / tool_confirmation` 输出不同五语言文案键，并把 `waiting_permission` 纳入 waiting step respond target。随后按子代理盘点继续补齐多 respond action 去重展示、`skipped` retry 投影、非 respond action 不误触发 respond、General Workbench / Article Workspace run detail 类型化等待动作文案和 `waiting_permission` 状态归一。验证：`npx vitest run "src/components/agent/chat/workspace/workspaceWorkflowControls.unit.test.ts" "src/components/agent/chat/components/generalWorkbenchWorkflowPanelViewModel.unit.test.ts" "src/components/agent/chat/workspace/WorkspaceArticleEditorRightSurface.test.tsx" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server presentation -- --nocapture` 通过；五语言 `agent.json / workspace.json` JSON parse 通过。
- 2026-07-04：收口复核 P2 / P5 文档口径。当前实现与测试明确为 `workflow/read` 唯一暴露 workflow projection，`agentSession/read` / `read_session` 隐藏 workflow fields；本计划同步移除“thread read 返回 workflow facts”的过期表述，并将 P5 状态改为 completed。下一步只剩路线图归档判定或后续新增交互时补更窄 product smoke，不再有 Workflow 标准化主链代码缺口。
- 2026-07-04：按用户要求补 Playwright E2E 证据。重新创建 `.lime/qc/gui-evidence` 后运行 `npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --evidence-dir .lime/qc/gui-evidence --prefix content-factory-article-workspace-workflow-control-20260704-playwright-regenerated --timeout-ms 240000`，通过真实 Playwright Electron fixture 覆盖 `workflow/read -> workflow/respond -> workflow/cancel -> workflow/retry`。summary：`.lime/qc/gui-evidence/content-factory-article-workspace-workflow-control-20260704-playwright-regenerated-summary.json`，`ok=true`，`noInvokeErrors=true`，`noConsoleErrors=true`，`workflow/retry` 返回 `rescheduledTurnId=turn_09c99f319a694cca8ded970b7999e877`，step attempt=`2`。
