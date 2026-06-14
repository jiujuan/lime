# Lime Coding Workbench 路线图

> 状态：active
> 更新时间：2026-06-13
> 范围：Lime 在 Agent Workbench 标准下的编程能力、执行运行时、文件/命令/补丁工具、前端 Coding Workbench 渲染与验收。

## 主目标

把 Lime 的编程能力收敛成 Agent Workbench 标准下的一个 `coding profile`，而不是新增第二套 runtime、第二套聊天入口或第二套 CLI 主链。

固定主链：

```text
User coding intent
  -> App Server JSON-RPC
  -> RuntimeCore thread / turn / task / action facts
  -> ExecutionBackend coding tools
  -> RuntimeEvent / ThreadReadModel / TaskSnapshot
  -> AgentUI projection
  -> Coding Workbench UI
```

外部参考只能提供实现素材和结构经验。进入 Lime 后，事实源、命名、协议、Provider、UI 投影和验证都必须服从 Lime current 架构。

## 标准事实源

| 层 | current 事实源 | 禁止方向 |
| --- | --- | --- |
| 标准 | `/Users/coso/Documents/dev/ai/limecloud/lime-agent-workbench` | 把外部 SDK 或 CLI 协议当 Lime 标准。 |
| Runtime API | App Server JSON-RPC + RuntimeCore | 恢复 legacy desktop facade 或产品页本地 runtime。 |
| 执行 | ExecutionBackend + Tool inventory + Policy service | 让模型自由拼 shell 作为长期主路径。 |
| Provider | API Key Provider / Provider Store / Model Registry | 单 Provider 假设或产品应用直连模型 API。 |
| UI | AgentUI projection + shared Coding Workbench surfaces | 从 assistant prose 推断工具、文件、审批、测试状态。 |
| 证据 | Evidence pack / replay / review refs | UI 或日志后处理重新构造运行事实。 |

## 用户闭环

目标用户用自然语言让 Lime 创建、修改、测试、审阅或解释代码项目。

最小闭环：

1. 用户提交编程意图。
2. Runtime 选择 coding profile 与模型槽位。
3. Agent 读取上下文、执行文件/命令/补丁工具。
4. UI 实时展示计划、工具、文件变更、输出、审批和预览。
5. 用户审批、拒绝、继续修复或审阅变更。
6. Artifact / Evidence 可导出和回放。

完成标准不是“模型能改文件”，而是用户能在同一个工作台里看到：当前在做什么、改了哪些文件、命令输出如何、哪里被权限拦住、下一步如何继续。

## current / compat / deprecated / dead

### current

- Agent Workbench 标准下的 `coding profile`。
- App Server `agentSession/*` current 主链。
- RuntimeCore session / thread / turn / task / action / event facts。
- ExecutionBackend 的文件、命令、补丁、测试、搜索、MCP、浏览器执行面。
- `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack`。
- `@limecloud/agent-ui-contracts`、`@limecloud/agent-runtime-projection`、`@limecloud/agent-runtime-ui`、`@limecloud/agent-runtime-client`。
- Coding Workbench 只消费 AgentUI projection state。

### compat

- 旧 `code_orchestrated` scene runtime 可作为 coding profile 的现有入口语义，但后续必须映射到标准 RuntimeEvent / ReadModel。
- 外部 CLI agent 会话可作为 `external_harness` adapter，但只能输出 RuntimeEvent，不能拥有主事实。
- 现有 Workspace / Harness 局部状态可短期作为迁移缓存；接入标准 projection 后必须退出。

退出条件：同一状态能从 RuntimeEvent + ReadModel 重建后，删除本地缓存或只保留 UI collapse/focus/draft。

### deprecated

- 编程 UI 自建过程状态机。
- 从正文推断文件变更、工具结果、测试成功、审批完成。
- 产品页直接读取 Provider key 或环境变量。
- 把 CLI 当成模型规划层或长期执行入口。
- 为编程能力新增一组平行命令协议。

### dead

- 恢复 `lime-rs/src/**` 或旧 Tauri command wrapper。
- 新增第二套 app-server、第二套 Provider store、第二套 artifact/evidence truth。
- mock runtime 作为生产 fallback。
- 无 session/thread/turn/action/tool correlation 的编程事件。

## 文档索引

| 文档 | 作用 |
| --- | --- |
| [architecture.md](./architecture.md) | Coding profile 的运行时、工具、Provider、UI 和证据架构。 |
| [ui-projection.md](./ui-projection.md) | 前端 Coding Workbench 如何消费 AgentUI projection。 |
| [runtime-capability-map.md](./runtime-capability-map.md) | 外部参考能力到 Lime current 落点的迁移分类。 |
| [implementation-plan.md](./implementation-plan.md) | 分阶段落地计划、验收和测试入口。 |
| [reference-boundary.md](./reference-boundary.md) | 参考外部实现时的命名、许可、复制和禁止边界。 |

## 全量完成口径

本路线图不以 MVP 为完成口径。全量完成必须同时满足：

1. **Runtime 完整**：coding turn 的 profile、model slot、tool inventory、policy、sandbox、approval、file/patch/command/test facts 都由 App Server / RuntimeCore current 主链产生。
2. **执行完整**：文件读取/写入、补丁应用、命令执行、测试执行、搜索上下文、MCP / browser 工具都通过 ExecutionBackend owner 执行，失败结构化。
3. **投影完整**：`@limecloud/agent-ui-contracts` 和 `@limecloud/agent-runtime-projection` 能从 RuntimeEvent / ReadModel 派生 `CodingWorkbenchView`，不从 assistant 正文推断状态。
4. **UI 完整**：Coding Workbench 的预览、文件、变更、输出、日志、审批、诊断都消费标准 projection；旧 thread item / checkpoint 只能作为迁移期输入 adapter。
5. **多模型完整**：coding/review/fast/local 等模型槽位走 Provider Store / Model Registry，不绑定单供应商或单协议。
6. **证据完整**：conformance fixture、GUI smoke、Evidence Pack、hydration repair、失败恢复和 replay 都可机械验证。
7. **治理完整**：旧 `code_orchestrated`、Workspace / Harness 局部状态、正文推断和生产 mock fallback 都有 current / compat / deprecated / dead 分类与退出条件。

## 不完整即不完成

以下任一项缺失，都不能宣称 coding 主线已完成：

- 只有文档或 fixture，没有 App Server / RuntimeCore 真实事件 emission。
- 只有 RuntimeEvent，没有 ExecutionBackend 真实 file/patch/command/test 副作用 owner。
- 只有 change view 迁移，输出、日志、审批、诊断仍由旧 thread item 直驱。
- 只有单 Provider 或本地 key 配置，未接 Provider Store / Model Registry / model slots。
- 只有单测，没有 GUI smoke 或可交互 fixture 证明。
- 外部 CLI / harness 是生产必需路径。
- 生产路径依赖 mock fallback。

## 主线优先级

当前最值得推进的主问题按优先级排序：

1. **真实事件产生**：App Server / RuntimeCore current crates 产生 `file.changed`、`patch.*`、`command.*`、`test.*`、`sandbox.blocked`、`action.*`。
2. **执行工具 owner**：ExecutionBackend file / patch / command / test / search / browser / MCP 子域落地，并接 policy / output refs。
3. **UI 完整投影**：`changeView / outputView / logView / actionView / diagnosticsView` 全部从 `CodingWorkbenchView` 派生。
4. **多模型 slot**：coding/review/fast/local 槽位接 Provider Store / Model Registry，未配置时结构化 blocked。
5. **GUI 证据闭环**：coding fixture smoke 能看到变更、输出、审批、阻断、失败继续和 hydrate。

清理旧实现只能服务以上主线；如果清理不能直接推进这些项，先登记，不抢主线。

## 当前落地状态

| 区域 | 当前状态 | 下一步 |
| --- | --- | --- |
| Runtime 模块化 | `lime-rs/crates/app-server/src/runtime.rs` 已从巨型中心文件拆成 facade + `runtime/**` 领域模块，当前约 527 行；`RuntimeCore` 根文件只保留核心类型、构造、共享状态和模块出口。`runtime/app_data.rs` 已 facade 化为组合 trait，`LocalAppDataSource` 根文件约 420 行，领域 impl 下沉到 `local_data_source/impls/**`。Gateway channel 已接入 `RuntimeGatewayAgentRunner`，Telegram / Feishu / Discord / WeChat 入站消息走 App Server current `RuntimeCore::start_turn`；旧 `aster_agent_state` 字段已从 `LocalAppDataSource` 移除。 | 继续把新增后端能力落到对应 `runtime/<domain>.rs`、`runtime/app_data/<domain>.rs` 或 `local_data_source/impls/<domain>.rs`，不得回填 `runtime.rs`；后续清理 gateway crate 的历史 warning 与 AppServer 未用 `runtime_arc` helper。 |
| 合约 fixture | `coding-file-change`、`coding-command-approval`、`coding-sandbox-blocked`、`coding-patch-failure`、`coding-test-failure-fix`、`coding-hydration-repair` 已进入 conformance 计划；App Server Rust 侧已补 `outputRef/refIds/artifactRefs/checkpointRef/contentRef/diffRef` 透传、read/evidence 聚合测试和 tool terminal 大输出 payload 规整测试；`tool.result/tool.failed` 大输出已可经 `FilesystemOutputSnapshotStore` 落到会话文件系统 snapshot，RuntimeCore 只保留 preview/ref，`artifact/read(include_content=true)` 可从 snapshot 回读完整内容；`file.changed.change.previousContent` 已可经 `FilesystemFileCheckpointSnapshotStore` 落到会话文件系统 snapshot，RuntimeCore 事件只保留 `checkpointSnapshotFile / previousContentSnapshotFile` refs；历史 current timeline hydrate 已能从 persisted `detail.events / detail.outputs / detail.items` 恢复 output snapshot refs 与 file checkpoint snapshot refs 到 RuntimeCore read model；`thread_read.commands/tests/pending_requests` 已可 hydrate 回标准 `command.* / test.* / action.required` 事件，`read_session` 可输出 `active_command_id / active_test_run_id / active_action_id`；Basic Evidence Pack 已输出 `tool_output_snapshot` 与 `file_checkpoint_snapshot` 文件化 evidence artifacts；`permission.denied / sandbox.blocked` 已透传 `policyName/profile/decisionId/sandboxPolicy/platform/command/cwd/diagnostics` 基础诊断 facts | 继续补完整 Policy service / sandbox manager、P4 UI evidence 和 GUI smoke。 |
| sequence gate | 已扩展到 patch / command / test / action lifecycle，并能把 `action.resolved` 从历史 `action.required` 回填到对应 tool | 继续用 GUI fixture 验证 active command/test/action 刷新后可见。 |
| projection | `CodingWorkbenchView` selector 已能合并 RuntimeEvent 与 `thread_read.commands/tests/pending_requests`，并输出 active command/test ids、actions 与 diagnostics | 继续补 log/action-submit 面板接线和 UI smoke evidence。 |
| Workspace UI | 现有 coding mode 保留为 compat/current surface；change view 已通过标准 projection adapter 派生，`threadRead` 已传入 selector；输出 tab 已直接渲染 `CodingWorkbenchView.commands/tests/actions/diagnostics`，不再由 React 组件过滤 thread item 自建输出状态 | 日志、审批提交动作继续迁到 projection adapter，并补 GUI smoke。 |
| ExecutionBackend | P2 已接入 RuntimeBackend tool event mirror：Aster `Read/Write/Edit/Bash/PowerShell/apply_patch` tool stream 会在保留 `tool.*` 原始事件的同时派生 `file.read`、`file.changed`、`patch.*`、`command.*`、`test.*` coding facts；`patch-apply` crate 已提供真实 workdir apply service，agent `apply_patch` current tool 已委托该 service 执行，支持 add/update/delete/move、缺父目录创建、Unicode 标点模糊匹配和 path escape 拒绝，并把多文件 patch metadata 投影为多条 `file.changed`；tool policy/sandbox 类失败会在 `tool.failed` 前派生 `permission.denied` / `sandbox.blocked`，并携带基础 policy/sandbox/platform diagnostics；RuntimeBackend action response 已回写 Aster tool confirmation / elicitation owner并发出标准 `action.resolved`；agent execution 已拆出 policy/decision 子模块，`tool_orchestrator` 会在真实工具执行前计算 `ToolExecutionDecision`，shell 风险在 `on_request / unless_trusted / granular` 下先产出 `action.required`，`read-only` sandbox 下非只读 shell 命令会在真实执行前产出 `sandbox.blocked`，`never` 不做前置人工确认；`WorkspaceToolPolicyInspector` 已把同一 decision 接入 Aster 主工具 inspection 链，避免主工具链绕过 approval / sandbox preflight；App Server turn start 会把非默认 `NativeAgentConfig.agent.tool_execution` 注入 turn metadata，execution / orchestrator / inspector / inventory 使用同一 effective policy，且 runtime `harness.executionPolicy` 仍高于持久化配置；backend metadata 中已有的 `outputRef/refIds/artifactRefs/checkpointRef/contentRef/diffRef` 会进入 coding facts，`file.changed.artifactRefs` 已能被 RuntimeCore artifact read 和 evidence export 聚合；`tool.result/tool.failed` 大输出会入库前规整为 `outputPreview + outputRef/refIds`，并可由文件系统 output snapshot owner 持久化完整内容；`file.changed` 旧内容会入库前落到文件系统 checkpoint snapshot owner，事件和 read model 只保留 snapshot refs，restore 可创建恢复前备份；历史 hydrate / evidence export 已能带上 output/checkpoint snapshot refs；active command/test/action 已进入 App Server read model 与 current timeline hydrate | 继续补完整 Policy service / sandbox manager、approval resume/resolve 生产续跑、P3/P4 projection/UI evidence。 |
| 多模型 slot | 文档定义完成，工程实现未完成 | 接 Provider Store / Model Registry profile facts。 |

## 完成百分比口径

后续汇报必须区分：

| 口径 | 含义 |
| --- | --- |
| 本轮完成度 | 本轮选定阶段的完成比例，例如 P1 contract/projection 或 P2 Rust event emission。 |
| 整体目标完成度 | P0-P8 全量 coding profile 的完成比例，不因文档完成而大幅提高。 |
| 可交付状态 | 是否达到 Lime GUI 产品可用闭环：真实 current 主链 + GUI smoke + evidence。 |

当前整体目标完成度只能按工程闭环估算；P2 已进入 execution decision owner 第一刀，但在完整 sandbox manager、P4 UI evidence、P5 多模型 slot、P7 GUI smoke 未完成前，仍不能按产品可交付闭环判满。

## 下一刀

下一刀继续沿主链推进，而不是继续写标准站：

```text
App Server / RuntimeCore coding event emission
  -> ExecutionBackend file/patch/command/test tools
  -> AgentUI coding projection hydration
  -> Coding Workbench full UI adapter
  -> GUI smoke + evidence export
```

当前最优先补 P2 policy/sandbox 与 P3/P4 UI evidence：真实 turn 已能从 Aster tool stream 派生 `file.read`、`file.changed`、`patch.*`、`command.*`、`test.*`、`permission.denied`、`sandbox.blocked` 和 `action.*` 基础 facts，`patch-apply` 已具备真实 workdir apply service，并已通过 agent `apply_patch` current tool 入口执行；agent tool orchestrator 已接入执行前置 `ToolExecutionDecision`，shell approval policy 会先产出 `action.required`，`read-only` sandbox 下非只读 shell 命令会先产出 `sandbox.blocked`，且 Aster 主工具 inspector 已复用同一 decision；backend 已透传真实 output/artifact/checkpoint/diff/content refs，并让 `file.changed.artifactRefs` 进入 RuntimeCore artifact/evidence 聚合；tool terminal 大输出、file checkpoint previous content、历史 hydrate、active command/test/action read model、evidence pack snapshot artifacts、policy/sandbox 基础 diagnostics、P3 read model projection adapter 和 P4 输出/actions/diagnostics projection 渲染都已进入 current facts。下一刀补完整 Policy service / sandbox manager、approval resume/resolve 生产续跑，再让 Coding Workbench 日志和审批提交动作继续直接消费 `CodingWorkbenchView`，补 GUI smoke。

执行顺序：

1. 继续在 `lime-rs/crates/**` current owner 内补完整 Policy service / sandbox manager，不恢复 legacy wrapper。
2. 为 `apply_patch` 成功/失败补 diff/checkpoint owner，让 patch report 可进入 artifact/evidence refs。
3. 回到 Workspace UI，把 log/action-submit 从 `CodingWorkbenchView` 派生，当前 `threadRead`、output/actions/diagnostics tab 内容已进入 selector / UI。
4. 补 code artifact workbench fixture / GUI smoke，证明刷新后 active command/test/action 可见。
5. 接 Provider slot diagnostics。
