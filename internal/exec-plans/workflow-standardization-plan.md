# Workflow 标准化执行计划

> 状态：in_progress
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
2. `lime-rs/crates/app-server/src/runtime/plugin_worker_workflow*.rs`，仅用于 compat 委托和 source adapter 收口。
3. `lime-rs/crates/app-server/src/runtime_backend/image_command/**`，仅用于对齐 workflow audit 字段。
4. `packages/app-server-client/src/protocol*`
5. `src/lib/api/agentRuntime/**`
6. `src/features/plugin/manifest/**`
7. `src/features/plugin/runtime/**`，仅用于 adapter/test-only 边界收缩
8. `src/components/agent/chat/workspace/**`
9. `src/lib/governance/**`
10. `internal/roadmap/workflow/**`

不主动触碰：

1. 旧 `content_workflow_*` 生产实现。
2. `src/components/workspace/hooks/useWorkflow.ts`，除非本计划进入 P6 退场守卫。
3. Electron / App Server 命令边界之外的 GUI 壳。

## 3. 当前分类

| 分类 | Surface |
| --- | --- |
| `current` | App Server `workflow.run.* / workflow.step.*` RuntimeEvent，event log，Evidence workflow id 关联，后续 Workflow Read Model。 |
| `compat` | Plugin manifest workflow declaration、Skill `workflow_steps` summary、Article Workspace workflow facts helper。 |
| `deprecated` | 前端 `WorkflowRuntimeHost` controlled DSL、GUI 自行拼 workflow 状态、read model projection 删除 workflow facts 后的旁路读取。 |
| `dead / dead-candidate` | 旧 `useWorkflow` steps Hook、旧 `content_workflow_*` 命令和 `src/lib/api/content-workflow.ts` 作为新入口、前端 DSL 生产 runtime。 |

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

- [ ] App Server event log 增加 workflow projector。
- [x] session/thread read API 返回 workflow runs 和 steps；`read_session` 会合并普通 runtime events 与 workflow audit log。
- [x] 前端 `appServerReadModelProjection` 停止删除 workflow facts。
- [x] `appServerEventStream` 对 workflow events 触发 read model 更新：投影为 diagnostics-only `runtime_status` refresh signal，不进入普通 item timeline。

退出条件：

- completed / failed / canceled / retrying fixtures 可恢复 run detail。
- 关闭重开后 workflow 状态不丢。

### P3：Surface Mapping

状态：in_progress

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

状态：in_progress

任务：

- [x] 收敛或新增 `workflow/read`：App Server JSON-RPC、Rust client、TS client、schema fixture、processor 和 `src/lib/dev-bridge/commandPolicy.ts` current method profile 已同步。
- [ ] 收敛或新增 `workflow/cancel`。
- [ ] 收敛或新增 `workflow/retry`。
- [ ] 收敛或新增 `workflow/respond`。
- [ ] 补 control API contract tests。

退出条件：

- GUI 不直接写 workflow status。
- cancel / retry 事件和 read model 一致。

### P5：UI Projection

状态：pending

任务：

- [ ] General Workbench run detail 读取 Workflow Read Model。
- [ ] Article Workspace workflow facts helper 改为 current read model adapter。
- [ ] Plugin iframe 只订阅 projected workflow events。
- [ ] 图片命令聊天 presentation 与内部 audit facts 分层。
- [ ] 用户可见文案补五语言 i18n。

退出条件：

- GUI smoke 覆盖至少一个真实 workflow。
- 运行详情可恢复、可解释失败、可触发可用动作。

### P6：治理清理

状态：in_progress

任务：

- [x] 从生产 `AgentChatWorkspace` 撤掉 `useWorkflow` legacy steps Hook；当前只保留 `getWorkflowSteps(...)` 空 steps 测试作为 dead-candidate 退场守卫。
- [x] 为 `WorkflowRuntimeHost` 生产调用添加边界测试：legacy catalog 禁止 `src/components/agent` / `src/lib/api/agentRuntime` / AgentUI packages 重新引用。
- [x] 从生产 `PluginsPage` 撤掉 `WorkflowRuntimeHost` 本地 DSL 假完成路径；workflow entry 现在 fail closed，提示必须接入 App Server Workflow API。
- [x] 确认旧 `content_workflow_*` / `content-workflow.ts` dead 分类。
- [x] 更新 legacy catalog 或 contract guard。
- [ ] P5 UI 全量读取 Workflow Read Model 后，删除 `src/components/workspace/hooks/useWorkflow.ts` 及其测试，或将守卫迁入 catalog-only dead path。
- [ ] P5 Plugin iframe / UI projection 改读 projected workflow events 后，删除或 test-only 隔离 `src/features/plugin/runtime/workflowRuntimeHost.ts` 生产入口。

退出条件：

- `npm run governance:legacy-report` 无 workflow 旧路回流。
- `npm run test:contracts` 覆盖 current API 和 test-only 边界。
- `rg "useWorkflow|WorkflowRuntimeHost|content_workflow_|content-workflow" src packages lime-rs/crates` 只能命中测试夹具、治理目录册、路线图或已登记的 compat adapter；不得命中生产 AI workflow 主链。
- 重构完成后不得保留无调用旧实现：`useWorkflow`、`content_workflow_*` 和前端 DSL runtime 必须删除或被 catalog 明确标记为 `dead / test-only`，不能长期停留在 `deprecated`。

当前 `workflow/read` 说明：

- `workflow/read` 与 `agentSession/read.detail.thread_read.workflow / workflow_runs / workflow_steps` 共用 `workflow_read_model_from_stored_session(...)`，均合并 session runtime events 与 workflow audit log，不保留第二套读取规则。
- `workflow/read` 只做 read model 读取，不承担 cancel / retry / respond 控制语义；控制面仍在 P4 后续步骤补齐。
- 前端 bridge 只把 `workflow/read` 识别为 App Server current read method；没有新增 mock fallback 或 legacy facade。

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
- 2026-07-04：开始代码实现。新增 `runtime/workflow/{mod,definition,status,read_model,tests}.rs`，定义 Workflow Contract、统一状态映射和基础 read model projector；`runtime/read_model.rs` 已把 workflow audit events 合并进 `thread_read.workflow / workflow_runs / workflow_steps`；前端 `appServerReadModelProjection` 已停止删除 workflow facts，并更新单测。验证：`npx vitest run "src/lib/api/agentRuntime/appServerReadModelProjection.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过。Rust 定向测试 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow::` 当前被工作树既有删除 `lime-rs/crates/services/src/aster_session_store.rs` 阻塞，错误为 `file not found for module aster_session_store`；未恢复该用户/外部改动。
- 2026-07-04：继续重构和清旧路。新增 `runtime/workflow/events.rs` 并让 `plugin_worker_workflow*.rs` 委托 current 事件 helper；`appServerEventStream` 不再直接吞掉 `workflow.*`，而是投影为 diagnostics-only `runtime_status`，复用现有 runtime sync 触发 `agentSession/read` refresh，避免 workflow audit 进入普通 timeline。`legacySurfaceCatalog.json` 将旧 `content_workflow_*` / `content-workflow.ts` 固定为 `dead`，将 `useWorkflow` 标为 deprecated 空壳，将 `WorkflowRuntimeHost` 限定为 Plugin UI 兼容演示 / 测试夹具，补 catalog 单测封住回流。
- 2026-07-04：按“完成重构后要清理原来的”要求收窄旧前端入口：生产 `AgentChatWorkspace` 不再调用 `src/components/workspace/hooks/useWorkflow.ts`，`useWorkspaceWriteFileAction` 删除旧步骤索引推进分支；legacy catalog 将该 Hook 的 allowed paths 清零并标为 `dead-candidate`，P6 退出条件改为最终删除或 catalog-only dead guard。
- 2026-07-04：完成 P1 source fixtures 与 P3 source mapping 第一刀。新增 `runtime/workflow/source_map.rs`，统一 Plugin manifest、Skill `workflow_steps`、image command builtin workflow、content factory orchestration 与 WorkflowRuntimeHost test-only DSL 到 `WorkflowDefinition / WorkflowStepDefinition`；`plugin_worker_workflow.rs` 删除本地 step parser，改用 current source mapping helper。图片命令 workflow audit 从两步临时事实对齐为五步 current facts，并补 `stepIndex / stepCount / stepKind`。验证：`cargo fmt -p app-server --manifest-path "lime-rs/Cargo.toml"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow:: -- --nocapture` 首轮通过 15 个 Workflow 用例；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command_workflow_creates_task_from_current_intent_metadata -- --nocapture` 通过。一次 `workflow::` 复跑曾被当前工作树非 Workflow 的 `lime-agent` `TurnContextOverride` 类型分裂阻塞，未扩大范围处理。
- 2026-07-04：完成 P4 `workflow/read` current API 第一刀。新增 App Server protocol DTO / method catalog / schema fixture，RuntimeCore `read_workflow_current(...)` 复用 `load_session_current(...)` 与 workflow read model projector，processor 分发到 current read model；Rust client、TS client 与 `packages/app-server-client` method catalog 同步，`src/lib/dev-bridge/commandPolicy.ts` 将 `workflow/read` 纳入 App Server current read timeout profile。验证：`cargo fmt -p app-server -p app-server-protocol -p app-server-client --manifest-path "lime-rs/Cargo.toml"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow_read -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-client typed_request_helper_binds_method_to_protocol_params -- --nocapture` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow:: -- --nocapture` 通过 18 个 Workflow 用例。
- 2026-07-04：按“完成重构后要清理原来的”继续收口前端 DSL 旧路。`PluginsPage` 不再 import / new `WorkflowRuntimeHost`，workflow-only plugin entry 不再通过前端本地 `evidence.record` DSL 伪造完成，改为 fail closed 并提示需要 App Server Workflow API；五语言 i18n 和 `PluginsPage.test.tsx` 已同步。当前 `WorkflowRuntimeHost` 仅剩自身文件、测试、SDK public surface 负向断言和 App Server source mapping test-only fixture，后续 P5/P6 再决定物理删除或迁到 catalog-only/test-only guard。
