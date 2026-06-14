# Coding Profile 实施计划

> 状态：active
> 更新时间：2026-06-14

## 完成口径

Coding profile 完成不是单次模型能改文件，而是以下链路成立：

```text
turn start
  -> coding profile resolved
  -> model/tool/policy resolved
  -> file/patch/command/test/action facts emitted
  -> read model hydratable
  -> AgentUI projection stable
  -> Coding Workbench usable
  -> evidence export joinable
```

本计划按全量实现制定，不按 MVP 口径收口。每个阶段必须同时回答三件事：

1. `current owner` 是否明确，不能把 compat adapter 或旧 UI 当主链。
2. 运行事实是否可 replay / hydrate，不能只靠当前页面内存可见。
3. GUI 是否能展示下一步动作，不能只证明事件或单测存在。

## 阶段依赖

| 阶段 | 依赖 | 交付物 | 不能替代它的事项 |
| --- | --- | --- | --- |
| P0 标准与盘点 | Agent Workbench 标准、现有 Workspace coding surface | current/compat/deprecated/dead 分类和退出条件 | 继续修旧 `code_orchestrated` 局部行为。 |
| P1 RuntimeEvent | P0 | schema、sequence、fixture、Rust emission contract | 只在前端 adapter 合成事件。 |
| P2 ExecutionBackend | P1 | file/patch/command/test/search/browser/MCP tool owner | 模型直接输出 shell 或 patch 文本。 |
| P3 Projection | P1 | `CodingWorkbenchView` 与 replay/hydration guard | React 组件自建状态机。 |
| P4 UI | P3，部分依赖 P2 fixture | 完整 Coding Workbench surfaces 和 GUI smoke | 只迁 change view 或只显示正文。 |
| P5 多模型 | P1 | profile slot、routing diagnostics、provider readiness | 产品页直连 key 或固定供应商。 |
| P6 外部 harness | P1/P3 | compat event adapter 和 degraded UI | 让外部 CLI 成为生产必需主链。 |
| P7 Conformance | P1-P6 持续输入 | fixture、contract、projection、GUI、evidence 验收矩阵 | 单一 `verify:local` 结果。 |
| P8 清理守卫 | P1-P7 current 闭环成立后 | 删除/限制旧入口和回流守卫 | 口头约定旧入口不再用。 |

## 实现 owner 矩阵

| 能力 | Rust owner | TS / UI owner | 必需测试 |
| --- | --- | --- | --- |
| coding profile resolve | `lime-rs/crates/app-server` + `lime-rs/crates/agent` | runtime client request builder | Rust profile unit + client contract。 |
| model slot routing | Provider Store / Model Registry crates | settings / diagnostics projection | provider readiness unit + UI diagnostics test。 |
| file read/write | ExecutionBackend file module + artifact/checkpoint owner | `CodingWorkbenchView.files/changes` | Rust file tool + projection fixture。 |
| patch apply | `patch-apply` crate + ExecutionBackend patch module | `PatchView` / change tab | patch parser/apply unit + failure fixture。 |
| command execution | ExecutionBackend command module + Project Shell bridge | output/log tab | command lifecycle Rust test + GUI fixture。 |
| test execution | ExecutionBackend test module | test result / continue fix action | test lifecycle unit + projection fixture。 |
| approval / policy | Policy service + RuntimeCore action owner | action card callbacks | action required/resolved contract + hydrate test。 |
| sandbox blocked | sandbox manager + policy service | blocked state / diagnostics | platform policy unit + UI blocked fixture。 |
| evidence export | evidence owner + read model | evidence lane / diagnostics drawer | evidence join test + replay fixture。 |

## P0：标准与现状盘点

目标：把现有编程能力分类到 `current / compat / deprecated / dead`，避免后续实现继续长平行链路。

动作：

- 盘点 `code_orchestrated`、Project Shell、file checkpoint、AgentUI projection、sequence gate、Workspace Harness 编程面板。
- 把每个能力映射到 `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack`。
- 确认当前哪些 facts 已可从 App Server current API 读取。
- 建立 coding conformance fixture 名单。
- 在 `internal/roadmap/coding/` 内维护 current/compat/deprecated/dead 表，所有后续代码实现必须回挂到对应阶段。
- 对旧 coding 实现执行“无兼容需求优先清退”判断：如果旧实现只是在 UI 内解释 thread item，不再承接新业务逻辑。

验收：

- `runtime-capability-map.md` 的 `copy/rewrite/reference/forbidden` 分类可执行。
- 旧 UI / hook / local state 都有退出条件。
- 路线图中不再把外部品牌、外部 CLI 或参考仓库名写成 Lime current owner。
- 文档能直接指导下一刀进入 `lime-rs/crates/**` current owner。

当前状态：`in_progress`。现有 Workspace coding UI、file checkpoint、thread item 仍是 compat 输入；标准 `RuntimeEvent + AgentUI projection` 是 current 目标。

## P1：RuntimeEvent 完整事件族

目标：让 coding turn 的关键事实进入标准事件流。

必须新增或对齐事件语义：

- `file.read`
- `file.changed`
- `patch.started`
- `patch.applied`
- `patch.failed`
- `command.started`
- `command.output`
- `command.exited`
- `test.started`
- `test.completed`
- `sandbox.blocked`
- `permission.requested`
- `permission.resolved`
- `action.required`
- `action.resolved`
- `artifact.changed`
- `evidence.changed`
- `snapshot.updated`

动作：

- 事件入库前执行 schema gate。
- 扩展 sequence gate，检查 command/patch/test/action 配对。
- 大输出写入 output ref，不重复塞事件。
- 失败事件包含 failure category、exit code、recovery hint refs。
- Rust App Server 分发前复用同等 schema/sequence 语义，不只在 TS conformance 包里校验。
- `ThreadReadModel` 同步记录 active / terminal command、patch、test、action，支持断流后 hydrate。
- `state.delta` 或 read model repair 不能绕过同一事件字段要求。

验收：

- 纯文本 turn、文件写入、补丁失败、命令审批、沙箱阻断、测试失败修复、hydration repair fixture 可 replay。
- Projection 不从 assistant prose 推断状态。
- sequence gate 能拒绝孤立 `patch.applied`、`command.exited`、`test.completed`。
- `turn.completed / failed / canceled` 后同 turn 不能再追加 file/patch/command/test/action 执行流事件。
- App Server fixture backend 产出的 events 能通过 `@limecloud/agent-ui-contracts` 校验。

当前状态：`completed for P1 spine / backend read-model enrichment completed / P3 read-model adapter connected`。已完成 App Server Rust 侧 schema gate、patch/command/test sequence gate、backend emission fail-closed 测试；RuntimeCore 会拒绝孤立 `command.exited`、缺 artifact 的 `file.changed` 和 turn 终态后的 execution stream。active command/test/action 后端 read model 与 current timeline hydrate 已完成；`@limecloud/agent-runtime-projection` 已能从 `thread_read.commands/tests/pending_requests` 合并出 `CodingWorkbenchView.commands/tests/actions` 和 active ids，Workspace coding adapter 已把 `threadRead` 传入 selector，输出 tab 已直接渲染 `CodingWorkbenchView.commands/tests/actions/diagnostics`。剩余是把 log/action-submit 面板继续改为直接消费 `CodingWorkbenchView`，并补 GUI smoke evidence。

## P2：ExecutionBackend Coding Tools

目标：补齐文件、补丁、命令、测试、搜索、MCP、browser 执行面，并接 policy。

### 2026-06-13 Runtime 模块化进度

本轮完成 App Server runtime 巨型文件拆分收口：

- `lime-rs/crates/app-server/src/runtime.rs` 已从约 7500 行级中心文件收缩到约 527 行，保留 facade、核心类型、构造和共享 helper。
- 领域能力下沉到 `runtime/**`，当前约 66 个 runtime 子文件；新增 coding/runtime 后端逻辑不得再回填中心文件。
- `runtime/app_data.rs` 拆成 facade + `runtime/app_data/*.rs` 分域 trait，`AppDataSource` 只作为组合 trait 保留。
- `local_data_source.rs` 收缩到约 420 行，分域 impl 下沉到 `local_data_source/impls/**`，避免数据源 impl 继续堆回根文件。
- `RuntimeGatewayAgentRunner` 接入 App Server current `RuntimeCore::start_turn`，Gateway 入站消息不再把 `DbConnection` 误传给 Telegram / Feishu / Discord runner 参数。

验证证据：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -p lime-gateway -p lime-websocket --check`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tests::evidence_exports --no-run`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::gateway_runner::tests -- --nocapture`

剩余风险：

- gateway crate 仍有历史未用函数 warning，属于后续 gateway 运行时清理，不阻塞本轮 runtime 拆分。
- AppServer 仍有未用 `runtime_arc` helper warning，属于 JSON-RPC server 侧后续清理；本轮不扩大为无关重构。
- 真实 output snapshot、file checkpoint snapshot、历史 current timeline hydrate、active command/test/action read model、Basic Evidence Pack snapshot artifact 与基础 policy/sandbox diagnostics facts 已接入 RuntimeCore / RuntimeBackend mirror；sandbox 基础 owner 已进入 `agent_tools::execution::sandbox`，完整 Policy service、分平台 sandbox backend 与 P3/P4 UI evidence 仍属于后续主线。

动作：

- 文件读取/写入统一产生 artifact/checkpoint refs。
- 补丁应用返回结构化 diff 和失败原因。
- 命令执行接入 approval policy、sandbox、stdout/stderr spill refs。
- 测试执行标记 `passed/failed/canceled/timed_out`，不靠输出文本判断。
- 搜索/上下文工具输出 source refs，供 evidence join。
- MCP / browser 工具进入同一 tool inventory，不另建编程专用 registry。
- 所有 tool outcome 都写入 RuntimeEvent，再由 ReadModel 派生 UI。
- 将可复制的 patch parser、policy rule、file search、output truncation 等实现迁入 Lime current owner；迁入时重命名、补许可证记录和定向测试。
- 任何 shell/network/filesystem 副作用先过 policy decision；需要用户介入时必须先产生 `action.required`。
- 浏览器预览和测试服务器属于 tool surface，不允许由 React 组件直接启动。

验收：

- 拒绝审批后工具不继续执行。
- 沙箱阻断后 UI 显示 blocked。
- 测试失败可生成继续修复 turn metadata。
- 大输出不进入 event payload，只进入 output ref / evidence ref。
- 命令、测试和 patch 的失败分类可被 projection 直接消费。
- Windows / macOS / Linux 平台差异进入 policy/sandbox diagnostics，不隐藏为普通失败。

当前状态：`in_progress`。已在 `lime-rs/crates/app-server/src/runtime_backend/coding_events.rs` 接入 runtime tool event mirror：`Read` 派生 `file.read`，`Write/Edit` 成功结果派生 `file.changed + artifactId/artifactRefs`，`Bash/PowerShell` 派生 `command.started/output/exited` 和测试命令的 `test.started/completed`，明确的 `apply_patch` 工具或 shell 命令派生 `patch.started/applied/failed`；`patch-apply` crate 已从 parser-only 推进到真实 workdir apply service，并通过 agent `apply_patch` current tool 入口委托执行，可结构化返回 add/update/delete/move report/error，多文件 patch metadata 会投影为多条 `file.changed`。`apply_patch` tool metadata 现已为每个文件变更生成稳定 `checkpointRef/contentRef/diffRef`、工作区相对路径、内容预览、旧内容字段和受控结构化 diff 预览；RuntimeBackend mirror 会把 per-file refs 与 diff 提升到 `file.changed` 顶层，继续复用 RuntimeCore artifact / checkpoint / evidence owner。tool policy/sandbox 类失败会在 raw `tool.failed` 前派生 `permission.denied` / `sandbox.blocked`，并透传 `policyName/profile/decisionId/sandboxPolicy/platform/command/cwd/diagnostics` 基础诊断 facts；`agent_tools::execution` 生成的 current `ToolPermission` 已写入 `policyName=workspace_tool_execution`、`policyProfile`、`toolSurface`、`restrictionProfile`、`sandboxPolicy` 与字段来源 metadata，`agent_tools::tool_orchestrator` 已在 `ToolRegistry::execute` 返回 `PermissionDenied` / `SafetyCheckFailed` / 沙箱类 `ExecutionFailed` 时合成 `eventClass/failureCategory/reasonCode/reason/command/cwd/platform/arch/approvalPolicy/requestedSandboxPolicy` metadata，使真实拒绝结果能直接进入结构化诊断而不是只靠错误文本。RuntimeBackend action response 已调用 Aster tool confirmation / elicitation owner 并发出标准 `action.resolved`；RuntimeCore 会从历史 `action.required` 回填 `toolCallId`，确保审批后工具生命周期能继续通过 guard。backend metadata 中已有的 `outputRef/refIds/artifactRefs/checkpointRef/contentRef/diffRef` 已会进入 coding facts，且 `file.changed.artifactRefs` 已接入 RuntimeCore artifact read / evidence export 聚合；`tool.result/tool.failed` 的大输出 payload 会在入库前规整为 `outputPreview + outputRef/refIds`，避免 raw tool terminal 违反 AgentUI large payload contract，并可由 `FilesystemOutputSnapshotStore` 持久化到会话文件系统 snapshot，RuntimeCore 只保留 preview/ref，`artifact/read(include_content=true)` 可回读完整输出。`file.changed.change.previousContent` 会由 `FilesystemFileCheckpointSnapshotStore` 持久化到会话文件系统 snapshot，事件/read model 只保留 `checkpointSnapshotFile / previousContentSnapshotFile` refs；`agentSession/fileCheckpoint/list|get|diff|restore` 可从 RuntimeCore read model 读取 checkpointId、contentRef、diffRef、preview、结构化 diff 与 snapshot content，并可创建恢复前备份。`runtime/session_hydration.rs` 已从 current timeline persisted `detail.events / detail.outputs / detail.items` 恢复 output snapshot refs 与 file checkpoint snapshot refs 到 RuntimeCore state，并可把 persisted `thread_read.commands/tests/pending_requests` 反推为标准 `command.* / test.* / action.required` 事件；`read_session.thread_read` 现已输出 `commands/tests/pending_requests` 以及 `active_command_id / active_test_run_id / active_action_id`，刷新或恢复后不会丢 active coding 状态。Basic Evidence Pack 已把 `outputSnapshotFile` 和 `checkpointSnapshotFile` 输出为 `tool_output_snapshot / file_checkpoint_snapshot` evidence artifacts。`agent_tools::execution::sandbox` 已承接基础 sandbox label、命令文本抽取和只读 shell 分类，App Server tool inventory 已补配置来源优先级测试。下一刀补完整 Policy service / 分平台 sandbox backend 和 P3/P4 projection/UI evidence。

2026-06-14 增量：

- `agent_tools::execution` 已拆为 facade + `execution/policy.rs` + `execution/decision.rs` + `execution/tests.rs`，中心入口只 re-export，避免继续把 policy、decision、测试堆回单文件。
- 执行前置决策 owner 已进入 `agent_tools::tool_orchestrator`：真实 `ToolRegistry::execute` 前先计算 `ToolExecutionDecision`，`on_request / unless_trusted / granular` shell 风险会先产出 `ActionRequired(tool_confirmation)` 与 `action.required` metadata，`never` 不做前置人工确认，仍交给既有权限 / sandbox 执行路径判定。
- `ToolExecutionDecision` 已补 `SandboxBlocked` 分支：`read-only` sandbox 下的非只读 shell 命令会在真实执行前产出 `sandbox.blocked` metadata，保守放行 `pwd/ls/find/rg/grep/cat/git status/git diff` 等只读探查命令；主 Aster 工具链通过 `WorkspaceToolPolicyInspector` 复用同一 decision，避免主链绕过 preflight。
- `agent_tools::execution::sandbox` 已成为基础 sandbox owner：集中解析 `read-only/workspace-write/danger-full-access`，抽取 shell command，并用定向测试覆盖 read-only sandbox 的允许/阻断判定；`ToolExecutionDecision` 只消费 sandbox evaluation。
- `agent_tools::execution::rules` 已成为默认 policy rule catalog owner：`policy.rs` 只保留 facade / permission construction，默认工具规则集中声明并通过 catalog guard 测试确保只引用 current 已注册 canonical 工具名，避免未注册工具被伪装成现役 policy；shell command rule classifier 已输出 `commandRuleId/commandRuleSource/commandRiskLevel/commandRiskReasonCode/commandRiskReason` metadata，覆盖 git state mutation、递归/强制删除、提权、网络下载、权限变更和包管理器变更等基础风险，且 `rm` 风险判定已收窄到真实 `-r/-R/-f/--recursive/--force` 选项，避免路径名误触发危险删除规则。
- `agent_tools::execution::service` 已成为 policy resolver owner：集中合并默认规则、持久化 `agent.tool_execution`、请求级 `harness.executionPolicy`，并统一输出 metadata facts；`policy.rs` 继续作为公开 facade 与 permission construction owner，不再承接 override 解析细节。
- `agent.tool_execution.shellCommandRules` 与请求级 `harness.executionPolicy.shellCommandRules` 已接入同一 classifier，支持 `ruleId/pattern/riskLevel/reasonCode/reason` camelCase / snake_case 输入；命中优先级按风险级别和来源共同排序，同风险下 `runtime > persisted > default`，请求级规则可覆盖默认命令风险 metadata。
- `execution/service.rs` 已支持多来源 runtime policy layer：`organizationExecutionPolicy`、`userExecutionPolicy`、`executionPolicy`、`requestExecutionPolicy` 按 `organization -> user -> runtime -> request` 合并，`ToolExecutionPolicySource` 与 `commandRuleSource` 会分别输出 `organization/user/runtime/request`，用于后续 UI / evidence 解释策略来源。
- `ToolExecutionCommandRuleConfig.matchType` 已支持 `regex / prefix / exact`，默认仍为 `regex` 保持兼容；组织 / 用户 / 请求级策略可用 prefix/exact rule 表达稳定命令前缀或精确命令，不必把所有规则写成正则。
- `ToolExecutionPolicyConfig` 已拆出 `config/tool_execution.rs`，避免继续膨胀 `config/types.rs`；`networkRules` 已接入 persisted / organization / user / runtime / request 同一 policy layer，支持 `target=url|host` 与 `matchType=regex|prefix|exact`，可为 `WebFetch` URL 和 `curl/wget` shell 命令中的 URL 输出 `networkRuleId/networkRuleSource/networkRiskLevel/networkRiskReasonCode/networkRiskReason/networkRuleTarget/networkUrl/networkHost` metadata。
- `ToolExecutionBatchInput` 已显式携带 `auto_mode` 与 `bypass_restrictions`，让执行器使用同一份 workspace tool policy，而不是由模型或调用点隐式决定。
- `NativeAgentConfig.agent.tool_execution` 已进入 App Server runtime turn context：`RuntimeBackend` 在 turn start 边界读取当前配置，并把非默认 `agent.toolExecution` 注入 `TurnContextOverride.metadata.config`；`agent_tools::execution`、`tool_orchestrator`、`WorkspaceToolPolicyInspector` 与 App Server tool inventory 均可从同一 metadata / persisted policy 输入解析 effective policy。运行时 `harness.executionPolicy` 仍高于持久化配置。
- 验证证据：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_orchestrator -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_policy_inspector -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_events -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::coding_events -- --nocapture`。
- 追加验证证据：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent -p app-server --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tests -- --nocapture`。
- 本轮追加验证证据：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_inventory -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution -- --nocapture`。
- 本轮新增验证证据：`cargo test --manifest-path "lime-rs/crates/aster-rust/crates/aster/Cargo.toml" --target-dir "lime-rs/target" --lib handle_approval_tool_requests_should_resume_after_manual_confirmation -- --nocapture` 证明人工确认后 Aster 工具请求会继续入队执行；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution -- --nocapture` 证明默认 policy rule catalog、PolicyService resolver owner、shell command rule classifier 与基础 sandbox owner 稳定。
- 本轮追加验证证据：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-core -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_execution_policy_config -- --nocapture`、`CARGO_TARGET_DIR="/tmp/lime-coding-policy-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution -- --nocapture`、`git diff --check` 窄范围检查，证明 `shellCommandRules` config、runtime override metadata 与 classifier 回归稳定。
- 本轮快速落地验证证据：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution::tests -- --nocapture`、`git diff --check` 窄范围检查，证明组织 / 用户 / runtime / 请求策略层级合并和请求级 shell rule 覆盖稳定。
- 本轮 prefix catalog 验证证据：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_execution_policy_config -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution::tests -- --nocapture` 证明 `matchType=prefix/exact` 配置解析、roundtrip 与 shell classifier 命中稳定。
- 未完成：分平台 sandbox backend、network rule 冲突解释 / UI evidence、P3/P4 UI evidence、Provider slot diagnostics 仍按后续主线推进。

## P3：AgentUI Coding Projection

目标：把 RuntimeEvent / ReadModel 投影成 Coding Workbench view model。

动作：

- 在 projection 包内新增或扩展 coding selectors。
- 派生 `FileChangeView / PatchView / CommandOutputView / TestRunView / ApprovalView`。
- Hydration 支持 active command/test/action 恢复。
- `model.completed` 可修正 streaming delta，不重复追加文本。
- sequence gap 标记 `stale`，通过 read model repair。
- selector 输入统一为 RuntimeEvent / ReadModel / TaskSnapshot，不直接接受 Workspace thread item。
- migration adapter 必须先把 thread item 转为 RuntimeEvent，再调用 selector。
- diagnostics 要明确 `missing_scope`、`missing_ref`、`sequence_gap`、`unsupported_fact`、`blocked`。

验收：

- fixture replay 输出稳定 projection snapshot。
- 重复 event 幂等。
- 乱序或缺 id 进入 degraded，不伪造完成态。
- `CodingWorkbenchView` 包含 files / changes / patches / commands / tests / actions / artifacts / evidence / diagnostics。
- 迁移期 thread item / file checkpoint 必须先 adapter 成 RuntimeEvent，再进入 coding selector。
- `coding-command-approval` resolved 后不要求 pending actions 数量保留历史 required/resolved 两条；生命周期历史应由 timeline/diagnostics 或 raw events 表达。
- `expected.coding` fixture 能证明每类 coding fact 都被投影到对应 view。

当前状态：`in_progress / read-model coding facts connected / output-actions-diagnostics tab projection-driven`。`@limecloud/agent-runtime-projection` 已提供 `CodingWorkbenchView` selector，并可从 RuntimeEvent 与 App Server `thread_read` 双路径合并 `commands/tests/actions`；`active_command_id / active_test_run_id` 会进入 `mainObject`，`pending_requests` 会投影为标准 action projection；Workspace adapter 已将 `threadRead` 传入 selector，输出 tab 已直接渲染 `CodingWorkbenchView.commands/tests/actions/diagnostics`，runtime workbench 计数也从同一 projection 推导。下一步需要把 Coding Workbench 的 log/action-submit view 全部从 `CodingWorkbenchView` 派生，并加入 GUI smoke evidence，不再让 React 组件维护 command/test/action 状态机。

## P4：前端 Coding Workbench

目标：把编程首屏改成中央主画布 + 右侧对话 + 诊断抽屉，并完全消费 projection。

动作：

- 中央固定 tab：预览 / 文件 / 变更 / 输出 / 日志。
- 右侧固定对话、任务进度、审批和输入框。
- 诊断抽屉承载 runtime capability、provider readiness、policy、evidence。
- 失败输出、测试失败、补丁失败共用继续修复入口。
- 用户可见文案覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- 复杂工作台采用对象带 + 阶段状态 + 主任务画布 + 收纳式诊断，不做营销式 hero 或多层套卡。
- `changeView / outputView / logView / actionView / diagnosticsView` 全部从 `CodingWorkbenchView` adapter 派生。
- 审批、继续修复、停止、刷新预览只调用 runtime client callbacks，不写 runtime truth。
- tab disabled/empty 状态稳定保留，运行中不能因数据为空造成布局跳动。
- 诊断抽屉可显示技术词；普通主流程文案使用业务动作词。

验收：

- 有预览 artifact 时默认展示预览。
- 无预览但有文件时展示主文件。
- 变更、输出、日志 tab 不改变 runtime facts。
- GUI smoke 覆盖提交编程需求、查看输出、继续修复。
- 审批 pending 刷新后可恢复。
- sandbox blocked 不显示成普通失败回答。
- 窄屏和宽屏下按钮文字不溢出，右侧对话不遮挡主画布。
- `*.test.tsx` / view model 单测覆盖 tab 默认选择、blocked、failed、waiting action、changes ready。

当前状态：`in_progress`。现有 `CanvasWorkbenchLayout` coding mode 是 compat UI surface；保留展示结构，但事实解释必须迁到 `CodingWorkbenchView` adapter。

## P5：多模型 Routing 与 Profile Slot

目标：让 coding profile 显式使用 Lime 多模型能力。

动作：

- 定义 base/coding/review/fast/local 槽位。
- Provider Store 支持 custom endpoint model 的 stable id、alias 和 capability tags。
- Runtime 记录 routing decision、fallback reason、provider readiness diagnostics。
- 前端只展示选择和诊断，不持有 key。
- slot resolver 输出 `model_slot.resolved` 或等价 diagnostics fact，供 evidence/replay join。
- 未配置或能力不足时，Runtime 以 `needs_setup / blocked` 结束或等待 action，不降级 mock。
- review / fast / local 只作为 task/subtask routing，不改变主 coding turn owner。

验收：

- 未配置 Provider 时返回 needs-setup / blocked。
- fallback 有 runtime diagnostics。
- 不存在产品页 local key 生产 fallback。
- review / fast / local 槽位不抢占 coding 主 turn owner。
- 自定义兼容端点作为 Provider Store entry 参与 registry，不写入 Coding Workbench 本地设置。
- UI diagnostics 可解释当前使用哪个槽位、为什么 fallback、下一步如何配置。

当前状态：`pending`。

## P6：External Harness Compat Adapter

目标：允许外部 CLI agent 作为兼容执行器接入，但不让它成为主链。

动作：

- 定义 `external_harness` event adapter。
- 解析 session start、prompt submit、permission request、tool complete、stop 等事件。
- 输出标准 RuntimeEvent 和 diagnostics refs。
- 所有 artifact/evidence 写入仍委托 Lime owner。
- 外部 harness 的 Provider、模型、权限、MCP 配置只进入 diagnostics，不覆盖 Lime current facts。
- 外部 harness 产物必须先进入 artifact/evidence owner，不能直接喂 UI component。
- 外部 harness 缺 scope id 时，adapter 产生 degraded diagnostics，不补假 id 伪造完整链路。

验收：

- 外部 harness 缺事件时 UI degraded。
- 外部 harness 不能直接写 Provider key、artifact truth、evidence verdict。
- 生产默认不依赖外部 CLI。
- App Server current coding turn 不需要 external harness 也能完成 file/patch/command/test 主闭环。

当前状态：`pending`。仅作为兼容，不是全量完成的前置事实源。

## P7：Conformance 与证据闭环

目标：coding profile 可被机械验证。

Fixture 矩阵：

| Fixture | 覆盖 |
| --- | --- |
| `coding-text-basic` | 文本 turn、delta/final reconciliation。 |
| `coding-file-change` | 文件写入、checkpoint、diff。 |
| `coding-patch-failure` | patch failed、recovery hint。 |
| `coding-command-approval` | action required/resolved。 |
| `coding-sandbox-blocked` | sandbox blocked、UI blocked state。 |
| `coding-test-failure-fix` | 测试失败、继续修复 turn。 |
| `coding-hydration-repair` | sequence gap、read model repair。 |

验证矩阵：

| 验证层 | 必跑条件 | 命令 / 入口 | 证明内容 |
| --- | --- | --- | --- |
| Contract | 改 RuntimeEvent、fixture、schema、sequence | `npm --prefix packages/agent-ui-contracts run test` 或 `npm run test:contracts` | event shape 和配对规则。 |
| Projection | 改 selector、fixture replay、UI adapter | `npm --prefix packages/agent-runtime-projection run test` | `CodingWorkbenchView` 可 replay。 |
| Workspace VM | 改 Workspace adapter / view model | 定向 vitest 覆盖 workspace view model / runtime tests | 旧 thread item 只能 adapter 成 RuntimeEvent。 |
| Rust runtime | 改 App Server / RuntimeCore / ExecutionBackend | `cargo test --manifest-path "lime-rs/Cargo.toml" -p <crate> <filter>` | current crates 能产生同构 events。P2 tool mirror 入口至少覆盖 `runtime_backend::coding_events`、`runtime::tool_lifecycle`、`agent_ui_event_schema`、`coding_events`、`evidence_exports`、`read_model`、`runtime_agent_tool_events_are_mirrored_to_coding_facts`、`runtime_agent_read_tool_result_is_mirrored_to_file_read`、`runtime_agent_shell_apply_patch_is_mirrored_to_patch_lifecycle`、`runtime_agent_permission_denied_fact_precedes_tool_failed_terminal`、`append_external_runtime_events_infers_action_resolved_tool_from_pending_action`、`read_model_projects_active_coding_activity_and_pending_action`、`read_model_clears_resolved_coding_activity`、`start_turn_hydrates_persisted_coding_snapshot_refs_into_runtime_state`、`start_turn_hydrates_persisted_active_coding_read_model_facts`、`export_evidence_pack_includes_coding_snapshot_artifacts`。 |
| GUI smoke | 改 Coding Workbench 可见主路径 | `npm run verify:gui-smoke` 或 coding fixture smoke | GUI 能查看变更、输出、审批、失败继续。 |
| Governance | 改旧入口分类 / mock / bridge | `npm run governance:legacy-report` + `npm run test:contracts` | 旧路未回流，生产不 mock。 |

建议验证：

```bash
npm run test:contracts
npm run governance:legacy-report
npm exec vitest run "packages/agent-runtime-projection/tests/*.test.mjs"
npm exec vitest run "packages/agent-runtime-ui/tests/*.test.mjs"
npm run verify:gui-smoke -- --reuse-running --timeout-ms 600000
cargo test --manifest-path "lime-rs/Cargo.toml"
```

按实际改动选择最小验证；触及 GUI 主路径时必须补 GUI smoke。

当前状态：`in_progress`。fixture 矩阵已开始进入 `agent-ui-contracts`，projection replay 已开始校验 coding 期望。

## P8：旧实现清理与守卫

目标：全量完成后不保留第二套 coding 事实源。

动作：

- `code_orchestrated` 只保留为 profile 选择或迁移入口，不再拥有独立状态机。
- Workspace / Harness thread item 只允许作为 migration adapter 输入，不能直接驱动 Coding Workbench。
- 删除从正文解析文件名、测试结果、补丁结果的路径。
- 合约守卫禁止生产 mock fallback、legacy desktop facade 和旧 Tauri wrapper 回流。
- 文档和 GUI smoke 明确 current 路径。
- 把旧 UI adapter 的保留范围写成白名单：只能服务历史 thread item hydrate，不能承接新 coding event。
- 清理完成后，`code_orchestrated` 相关测试只证明迁移入口或 legacy guard，不再作为 current 可交付证据。
- 对 `mockPriorityCommands`、`defaultMocks`、legacy command catalog 做负向守卫，禁止新增 coding 主链 mock fallback。

验收：

- `rg "code_orchestrated"` 只剩兼容、测试或迁移说明。
- Coding Workbench 可只用 RuntimeEvent / ReadModel hydrate。
- `npm run test:contracts` 和 GUI smoke 证明 current 主链可用。
- `rg "file_artifact|command_execution|approval_request"` 在 Workspace coding 主路径中只出现在 adapter、测试或历史 hydrate 说明。
- 新增 coding 能力没有进入 `lime-rs/src/**`、legacy desktop facade 或产品页本地 Provider key。

当前状态：`pending`。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 复制外部 runtime 后形成第二套事实源 | 先落 RuntimeEvent / ReadModel adapter，禁止 UI 直连。 |
| 多模型能力被单 Provider 假设污染 | Provider slot 和 routing decision 作为 profile facts。 |
| UI 继续从正文猜状态 | Projection tests 和 conformance fixture fail closed。 |
| 大输出拖慢流式 UI | output spill refs + timeline 摘要。 |
| 外部 CLI adapter 变成主链 | 标记 compat，生产默认不依赖。 |
| 文档完成被误当实现完成 | 每阶段必须写 owner、测试入口和退出条件；最终汇报区分本轮/整体完成度。 |
| 只迁 change view，输出/审批/诊断仍走旧状态 | P4 把五个 view 全部列为退出条件。 |
| UI 技术词外露 | 普通主流程使用业务动作词，技术状态只进诊断抽屉。 |

## 当前实施入口

P1/P2 交界已经进入 App Server / RuntimeCore current crates：真实 runtime backend tool stream 会派生 `file.read/file.changed/patch/command/test/permission/sandbox/action` 基础 coding events，并经 schema / sequence / tool lifecycle guard 入库；`patch-apply` 已具备真实 workdir apply service，并已接入 agent `apply_patch` current tool 入口；tool output、file checkpoint previous content、历史 current timeline hydrate、active command/test/action read model、Basic Evidence Pack snapshot artifacts、policy/sandbox 基础 diagnostics、sandbox 基础 owner 与 inventory 配置来源测试都已具备 current facts。后续实施不要回到纯文档或旧 UI 修补；下一刀继续沿 P2 补完整 Policy service / 分平台 sandbox backend，并进入 P3/P4 projection/UI evidence。
