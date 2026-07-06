# P2 Tool / Approval / Sandbox 第一刀 Handoff

> 状态：Tool / Approval / Sandbox combo-evidence-done；后续只做 post-merge regression
> 更新时间：2026-07-06
> 目标：记录 Tool / Approval / Sandbox 从 App Server lifecycle owner 到 `lime-agent` execution owner 的完成证据；当前 bridge、Aster pending resume、governance、contract、runtime fixture 与 frontend projection 组合证据均已通过。

## 1. 结论

P2 第一刀不做完整 tool runtime 重写，也不落 Codex `unified_exec` current executor。App Server 外部事件边界已经固定 Tool / Approval / Sandbox 的 typed lifecycle owner，并把 approval / permission / sandbox blocked 收进同一套可测试 gate。`lime-agent` 第二刀已新增 `agent_tools/tool_lifecycle.rs`，让 `RuntimeAgentEvent::ToolStart`、`ActionRequired`、`ToolEnd` 的构造从 tool domain typed snapshot 进入；approval-required / sandbox-blocked tool 不再发出 `ToolOutputDelta`，terminal 后重复 outcome 不再发事件。第三刀已把 approval-required 从“失败终态”改为 `AwaitingApproval`：只发 `ActionRequired`，不抢先发失败 `ToolEnd`，避免与 App Server `action.required -> action.resolved -> tool.result/tool.failed` lifecycle guard 冲突。第四刀已把 live process lifecycle / stdout stderr delta 构造收进 `tool_lifecycle` owner，并补 `toolCallId` / `toolId` / `tool_id` correlation metadata。第五刀已让 terminal `ToolEnd` metadata 也稳定补同一组 correlation，且不覆盖上游已有 metadata。第六刀已把 approval resolved + terminal 的 typed transition helper 收进 `ToolExecutionLifecycleEvents`：批准后才允许同一 tool 的 terminal/output 继续 materialize，拒绝后不允许成功 terminal。第七刀在 App Server `evidence/export` coding summary 输出 `actionRequestIds` / `actionToolCallIds`，并用 coding snapshot 回归证明 `action.resolved` 可继承 pending action 的 `toolCallId`。第八刀已把 action id / request id 与 `toolCallId` / `toolId` 的解耦前移到 `ToolApprovalActionSnapshot`、`ToolApprovalResolutionSnapshot` 和 lifecycle state key。第九刀已证明正式 `RuntimeCore::respond_action(...)` 会回填 pending tool id 并释放 App Server lifecycle guard。第十刀已在 `lime-agent` current 入口证明 `AgentRuntimeState::confirm_tool_action(...)` 会通过 Aster manual approval gate 释放 pending tool execution future，并产出 `ToolEnd` 和最终模型文本。第十二刀已补 App Server bridge 用例；第十四刀已把该 fixture 改为携带 live `ExecutionProcessServer`、timeout 输出 provider requests，并把 shell 命令收窄为 `printf runtime-confirmed`。第十五刀已补 `coding_event_projection.rs` import，并跑通 App Server bridge 用例，证明 `RuntimeBackend::respond_action(ToolConfirmation)` 会释放同一 pending Aster tool future。

后续必须继续避让未移交源码热区：

- `lime-rs/crates/agent/src/agent_tools/**` 中未列入第二刀写集的相邻改动，例如 catalog / inventory / native policy / truncation tests
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime/**` 中未列入本轮写集的并行改动
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/components/agent/chat/hooks/**`
- `src/lib/governance/**` 中未移交的并行改动

本文件继续作为 `lime-agent` execution owner handoff 事实源；不得用 App Server storage guard 替代真正的 tool execution owner。`agent_tools/tool_orchestrator.rs` 已接入 typed event construction owner、active state gate 第一刀、approval pending transition 第一刀、process lifecycle correlation 第一刀与 terminal metadata correlation 第一刀；`tool_lifecycle.rs` 已接入 approval resolved terminal helper 与 action/tool identity split，App Server `evidence/export` 已接入 action/tool correlation summary，RuntimeCore `respond_action` API 已有 lifecycle guard。App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge 回归与 final combo evidence 均已完成；下一刀应进入 P2 Context / Token / Compaction 或其它深层模块第一代码刀，不再继续补 storage 事后校验，也不再把 bridge 当 blocker。

2026-07-06 补充验证：App Server runtime 级 `tool_lifecycle.rs` 已落 `ToolLifecycleSnapshot` / approval action / sandbox decision typed gate，并通过 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture`，23 个相关测试通过。该证据证明 App Server external runtime event lifecycle owner 可用，但不替代 `lime-agent` tool execution typed owner / orchestrator consumer 完成。

2026-07-06 并行刷新：当前 scoped status 仍显示 `agent_tools/**`、App Server `runtime/**` 未列入本轮的文件、前端 chat hooks 与 `src/lib/governance/**` 有并行脏改；`runtime/tool_lifecycle_tests.rs` 已成为 App Server lifecycle owner 的相邻测试模块，不再视作未归属残留。下一个源码进程必须重新跑 scoped status 后再接管 `lime-agent` 写集。

2026-07-06 第二刀补充：`lime-agent` typed event construction owner 与 active state gate 第一刀已完成，写集为 `agent_tools/tool_lifecycle.rs`、`agent_tools/mod.rs`、`agent_tools/tool_orchestrator.rs`、`agent_tools/tool_orchestrator/tests.rs`、`agent_tools/tool_orchestrator/lifecycle_gate_tests.rs`。`ToolExecutionLifecycleSnapshot`、`ToolApprovalActionSnapshot`、`ToolSandboxDecisionSnapshot`、`ToolExecutionTerminalSnapshot`、`ToolExecutionLifecycleEvents` 已进入 owner；`tool_orchestrator.rs` 不再内联拼 `ToolStart` / `ActionRequired` / `ToolEnd`，approval-required / sandbox-blocked tool 不再发出 `ToolOutputDelta`，terminal 后重复 outcome 不再发事件。验证：scoped rustfmt check、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture` 通过。测试中仅出现既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写。

2026-07-06 第三刀补充：approval-required outcome 现在只发 `ActionRequired` 并把 tool 状态置为 `AwaitingApproval`，不再同步发失败 `ToolEnd`；pending approval 重复 outcome 返回空事件，避免重复 action；sandbox / permission block 仍保持失败终态。验证：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture` 通过。测试中仅出现既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写。

2026-07-06 第四刀补充：live process lifecycle / stdout stderr `ToolOutputDelta` 构造已从 `tool_orchestrator.rs` 收进 `tool_lifecycle.rs`：`ToolProcessLifecycleSnapshot` 和 `ToolExecutionOutputDeltaSnapshot` 统一补 `toolCallId`、`toolId`、`tool_id`、`executionSurface=live_process`。`tool_orchestrator` 真实 live process 测试已覆盖 process start / terminal / stdout delta 均带 correlation metadata。验证：scoped rustfmt check、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture` 通过。测试中仅出现既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写。

2026-07-06 第五刀补充：terminal `ToolEnd` metadata correlation 已前移到 `ToolExecutionTerminalSnapshot` owner：无 metadata 的终态会补 `toolCallId`、`toolId`、`tool_id`，已有 correlation metadata 不会被覆盖；`rewrite_tool_terminal_event(...)` 通过 `tool_end_event_from_update(...)` 也继承同一规则。验证：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs"`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture` 通过。测试中仅出现既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写。

2026-07-06 第六 / 第七刀补充：approval resolved terminal transition 第一刀已进入 `ToolExecutionLifecycleEvents`：`approval_resolved_terminal_events(...)` 显式接收 `ToolApprovalResolutionSnapshot` 与 terminal outcome，只有 resolved tool 与 terminal tool 匹配时才先发 `ActionResolved`，再按状态机释放后续 terminal/output；pending approval 状态下，普通 terminal outcome 继续返回空事件。`confirmed=true` 允许同一 terminal outcome 发出 output delta 和 `ToolEnd`；`confirmed=false` / deny 决策进入 `ApprovalDenied`，拒绝成功 terminal，只允许失败 `ToolEnd` 且不透传输出 delta。Evidence export correlation 第一刀已由第七刀完成：`coding_evidence_summary(...)` 输出 `actionRequestIds` / `actionToolCallIds`，`coding_snapshot` 回归把事件顺序固定为 `tool.started -> action.required -> action.resolved -> tool.result`，并断言 `action.resolved` payload 与 evidence summary 都能关联 `tool_snapshot_evidence`。验证：第七刀时 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture` 为 11 tests passed；第八刀 action/tool identity split 后同一 owner 当前为 13 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_coding_snapshot_artifacts -- --nocapture` 1 test passed。

2026-07-06 第八刀补充：action/respond resumed execution 的前置 identity split 已进入 `ToolExecutionLifecycleEvents`：`ToolApprovalActionSnapshot` 从 approval metadata 解析独立 `actionId` / `requestId`，并用 `toolCallId` / `toolId` 作为 lifecycle tool id；`ToolApprovalResolutionSnapshot` 用同一规则释放 pending tool；terminal snapshot 也归到解析出的 tool id，避免 action id 被误当成 tool call id。验证：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs"`、`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture` 13 tests passed、`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture` 15 tests passed。仍有既有 `WorkspaceToolSurface` / Aster snapshot adapter unused warning，本轮不夹写。

2026-07-06 第九刀补充：RuntimeCore `action/respond` lifecycle guard 已补齐。`respond_action_infers_tool_id_and_unblocks_pending_tool_result` 先写入 pending `tool.started -> action.required`，再通过正式 `core.respond_action(...)` approve，断言 `action.resolved` 自动回填同一 `toolCallId`，并允许后续 `tool.result` 通过 App Server lifecycle guard。验证：`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/tests/external_events/actions.rs"`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture` 1 test passed。该证据不等于真实 Aster pending tool execution future 已端到端恢复。

2026-07-06 第十刀第一半补充：`lime-agent` `runtime_state.rs` 新增 `confirm_tool_action_resumes_pending_aster_tool_execution`，用测试 provider 发出 `RuntimeApprovalResume` tool request，并通过测试专用 `ToolInspector` 强制该 tool 进入 Aster manual approval gate；流式任务在收到 `ActionRequired(tool_confirmation)` 后保持 pending，调用 `AgentRuntimeState::confirm_tool_action("req-runtime-confirm", true)` 后，Aster pending tool future 被释放，随后产出 `ToolEnd { output: "runtime-confirmed" }` 与最终文本 `provider observed resumed tool`。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check` 通过，`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture` 1 test passed。该证据覆盖 `AgentRuntimeState -> Aster Agent::handle_confirmation -> pending tool future`，但仍不覆盖 App Server `RuntimeBackend::respond_action` 到 `AgentRuntimeState` 的桥接；该桥接位于当前并行脏写集 `lime-rs/crates/app-server/src/runtime_backend/**`，本刀未夹写。

2026-07-06 第十一刀复跑补充：当前工作树第一次重新执行 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture` 曾失败；随后并行源码变化后再次复跑通过，结果为 1 test passed。当前最新结论：RuntimeState/Aster pending resume 底层证据已恢复绿色。

2026-07-06 第十二刀补充（历史）：App Server bridge 回归用例已新增但当时运行失败。`lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs` 中的 `respond_action_tool_confirmation_resumes_pending_aster_tool_future` 目标正确：使用本地 OpenAI-compatible SSE fixture 通过 `ExecutionBackend::start_turn` 触发 `req-runtime-confirm`，再经正式 `ExecutionBackend::respond_action(... ToolConfirmation confirmed=true ...)` 验证 pending future 释放。当时验证命令 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture` 编译通过但测试失败，panic 位于 `initialization_tests.rs:223` 的 `tool confirmation request id`。该失败已被第十五刀通过证据 supersede。

2026-07-06 第十三刀只读诊断：`RuntimeBackend::handle_turn_start(...)` 已在 provider route 后执行 `ensure_agent_initialized(...)`，随后调用 `install_live_execution_process_hook_if_available(...)`；但该 hook 只有在 backend 构造时携带 `ExecutionProcessServer` 才会安装。第十三刀复核时 bridge fixture 仍使用无 live process server 的 backend 构造，因此 live shell execution gateway 为 `None`，`Bash` tool call 不会进入 App Server process / approval 链，也就不会向测试 sink 送出 `ActionRequired(tool_confirmation)`。`tool_events.rs` 已支持 `action_required -> action.required`，问题不应继续归因到 event mapper。该 fixture 构造缺口已由第十四刀接管并修正；下一步不是重复该诊断，而是在 App Server runtime/backend 热区稳定后复跑 bridge fixture。

2026-07-06 第十四刀补充：当前进程接管最小 fixture 写集 `lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs`，已把 bridge 用例 backend 构造改为 `RuntimeBackend::with_db_and_execution_process_server(db, ExecutionProcessServer::default())`，让 `install_live_execution_process_hook_if_available(...)` 能安装 live shell execution gateway；同时把 timeout panic 增加 `provider_requests={:?}`，并把本地 OpenAI fixture 里的 Bash arguments 从 `cargo test --help >/dev/null; printf runtime-confirmed` 收窄为 `printf runtime-confirmed`，避免 approval 释放后启动多余 Cargo 子进程。验证：`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture` 启动后在共享 Rust 编译资源中超过 7 分钟仍未产出测试运行结果，当前进程已终止自己启动的 Cargo 进程以避免占用并行资源。该中断结果已被第十五刀通过证据 supersede。

2026-07-06 第十五刀补充：当前进程只补 `lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs` 的 missing import，避让已脏的 `runtime_state.rs` 与 `initialization_tests.rs`。验证：`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs" "lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target-bridge" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture` 通过，`1 passed; 0 failed; 800 filtered out`。该测试证明 `ExecutionBackend::start_turn -> action.required -> ExecutionBackend::respond_action(ToolConfirmation confirmed=true) -> pending Aster tool future resumes -> tool.result/final text/turn.completed` bridge 已绿，并断言 provider 第二次 request 包含 tool response。早先临时 target archive/object 异常和本轮第一次 `/tmp` 冷编译期间的并行 thread-store metadata stale，均已由同一 `/tmp` target 复跑关闭，不计入 bridge 源码失败。

2026-07-06 第十六刀补充：Tool / Approval / Sandbox final combo evidence 已完成。本刀不改 Aster vendor、不接管 `lime-agent` / App Server runtime/backend / 前端 GUI 源码，只补 `scripts/check-app-server-client-contract.mjs` 的 current owner 文件列表，让 contract guard 扫描到 `runtime_backend/tool_process_runtime_metadata.rs` 中的 `parse_tool_arguments(arguments)`。验证：`npm run governance:legacy-report` 通过，边界违规 0，保留既有分类漂移候选 `rust-agent-subagent-metadata-direct-read -> deprecated / 零引用`；`node scripts/check-app-server-client-contract.mjs` 通过 287 checks；`npm run test:contracts` 完整通过；`npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 Electron/App Server current fixture、Coding Workbench、Claw 图片 / 画图 / 停止继续 / Plan history、Skills Runtime、Multi-Agent、MCP structuredContent、Expert Skills、内容工厂 Article Editor，`liveProviderUsed=false`；`npx vitest run "src/components/agent/chat/projection/toolEventProjection.test.ts" "src/components/agent/chat/projection/actionProjection.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts"` 通过，27 tests。该证据说明 current 主链没有通过 legacy / mock / old runtime 回流来伪通过。

## 2. Thread / Turn / Item 归属

| 对象 | 归属 | 第一刀要求 |
| --- | --- | --- |
| tool call request | Turn | 绑定 `session_id`、`turn_id`、`tool_id`、`tool_name` 和 arguments，不能只靠 GUI 文案或日志定位 |
| approval action | Turn scoped action | `ActionRequired` / `ActionResolved` 必须能阻断或释放同一 turn 内的 tool output，不允许未批准先输出 |
| sandbox decision | Turn policy decision | `allow`、`requires_approval`、`deny`、`sandbox_blocked` 需要有结构化 reason / policy metadata |
| execution output | Item delta | stdout / stderr / process lifecycle 只作为 active tool item delta，不产生无归属输出 |
| tool result | Item terminal state | success / error / truncated output / structured metadata 合并成同一个 terminal item |
| evidence export | Thread evidence | tool decision、approval、sandbox、output truncation 都带 session/thread/turn/item correlation |

## 3. Lime Current Owner Map

| 层 | current owner | 本刀处理方式 |
| --- | --- | --- |
| Tool catalog / inventory | `lime-rs/crates/agent/src/agent_tools/catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs` | 保持目录事实源；避免把 catalog 的 `ToolLifecycle` 和执行生命周期混用 |
| Tool execution policy | `lime-rs/crates/agent/src/agent_tools/execution/**` | 继续作为 approval / sandbox policy decision owner，不搬到 App Server 顶层 loop |
| Tool lifecycle emission | `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`、`lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`lime-rs/crates/agent/src/runtime_state.rs`、`lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs` | `ToolStart` / `ActionRequired` / `ToolEnd` 构造已委托给 typed lifecycle helper；approval / blocked output delta gate、terminal 后重复 outcome 去重、approval-required pending 而非失败终态、process lifecycle / stdout stderr correlation metadata、terminal `ToolEnd` correlation metadata、approval resolved terminal helper、evidence export action/tool correlation summary、action id / tool id 解耦、RuntimeCore action/respond lifecycle guard、RuntimeState/Aster pending future resume 与 App Server RuntimeBackend bridge evidence 已完成 |
| Runtime sequence validation | `lime-rs/crates/app-server/src/runtime/tool_lifecycle.rs`、`lime-rs/crates/app-server/src/runtime/tool_lifecycle_tests.rs`、`lime-rs/crates/app-server/src/runtime/tests/external_events/tool_lifecycle.rs`、RuntimeCore sequence verifier | 已完成 App Server lifecycle owner；后续 `lime-agent` 代码刀仍优先保持 event shape 不变 |
| App Server process / sandbox bridge | `lime-rs/crates/app-server/src/execution_process.rs` | 只作为平台执行和 sandbox backend，不承接 Agent tool truth |
| Frontend projection | `src/components/agent/chat/projection/toolEventProjection.ts`、`actionProjection.ts` | GUI 继续消费 projection；第一刀不要求改 GUI |
| Evidence / telemetry | App Server `evidence/export` 与 provider telemetry tests | `coding_evidence_summary` 已输出 `actionRequestIds` / `actionToolCallIds`，coding snapshot 已证明 `action.resolved` 可关联 pending action 的 `toolCallId`；不新增独立 trace store |

## 4. Codex 对标边界

可采纳：

- Codex `core/src/unified_exec/mod.rs` 把 interactive process、approval、sandbox、retry、output cap 放在同一条 orchestrated flow。
- Codex `core/src/unified_exec/process_manager.rs` 证明 PTY/process lifecycle 与 approval/sandbox 决策需要分层：policy 在 orchestrator，process 在 executor。
- Codex app-server protocol 的 `ThreadItem` 将 MCP / dynamic / collab tool call 表达成 item status，而不是 GUI 本地状态。
- Codex `AskForApproval`、`SandboxPolicy`、`ApprovalsReviewer` 是 turn-level runtime input，不是 tool output 文案。

不可照搬：

- 不把 Codex TUI / CLI 输出形态搬进 Lime GUI。
- 不在本刀新增 `exec_command/write_stdin` current executor；在 current executor 落地前，`unified_exec` 模型继续 fail-closed 隐藏旧 `Bash` / `PowerShell`。
- 不把 opencode Tool / Session / Effect runtime 作为 P2 Tool 架构来源。

## 5. 第一代码切片

已完成窄写集：

```text
lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs      # 新 typed owner
lime-rs/crates/agent/src/agent_tools/mod.rs                 # 暴露 owner
lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs   # consumer 接线
lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs # output gate regression
lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs # lifecycle gate regression
```

本刀在 `tool_lifecycle.rs` 内补独立 owner 单测，并在 `tool_orchestrator/lifecycle_gate_tests.rs` 固定 approval / sandbox blocked 不发 `ToolOutputDelta` 的负向断言。不要继续把执行生命周期规则追加到 App Server storage guard。

已落 typed owner：

```text
ToolExecutionLifecycleSnapshot
ToolApprovalActionSnapshot
ToolApprovalResolutionSnapshot
ToolSandboxDecisionSnapshot
ToolExecutionTerminalSnapshot
ToolProcessLifecycleSnapshot
ToolExecutionOutputDeltaSnapshot
ToolExecutionLifecycleEvents
```

命名理由：`agent_tools/catalog.rs` 已有 `ToolLifecycle` 表示 current / compat / deprecated 的目录生命周期，P2 执行生命周期避免继续复用同名短词。

已完成行为边界：

1. `ToolStart` 构造只从 `PlannedToolExecution` / typed snapshot 进入，不在多个分支手写 tool id / name / arguments。
2. `ActionRequired` 只由 approval-required decision metadata 构造；有独立 `actionId` / `requestId` 时 event request id 使用 action id，lifecycle state 继续绑定 `toolCallId` / `toolId`；metadata 保留 `toolCallId`、`toolName`、`approvalPolicy`、`requestedSandboxPolicy` 和 reason code；approval-required tool 停在 `AwaitingApproval`，不发失败 `ToolEnd`。
3. `SandboxBlocked` / `Deny` 结果已能被 terminal snapshot 标记为 `ToolSandboxDecisionSnapshot`；approval-required / sandbox-blocked tool 不再发出 `ToolOutputDelta`；App Server runtime sequence guard 仍负责 storage 前 fail-closed。
4. `ToolEnd` 统一携带 success / error / output / metadata；process lifecycle / stdout stderr delta 与 terminal `ToolEnd` metadata 统一携带 `toolCallId` / `toolId` / `tool_id` correlation metadata；output truncation 继续复用 `tool_output_truncation.rs` owner；approval action resolved 后的 terminal helper 已进入 `ToolExecutionLifecycleEvents`，并可用 metadata 里的 `toolCallId` 释放 pending lifecycle。
5. 本刀未改协议 event shape；下一刀若新增字段，必须同步 `agentProtocol.ts`、runtime schema、projection Vitest 和 `npm run test:contracts`。

下一刀行为边界：

1. 把 `agentSession/action/respond` 后的真实 resumed tool execution 接回 `lime-agent` current owner，而不是只发 `action.resolved` storage event。
2. 继续保持 process / stdout / stderr lifecycle snapshot 由 `tool_lifecycle` owner 构造，不改变现有 event shape。
3. 保持 `tool_output_truncation.rs` 只负责 output budget，不把 lifecycle state 混进去。

## 6. 验证门槛

文档 / handoff 本身：

```bash
rg -n "[ \t]+$" "internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md" "internal/research/refactor/v1/p2-runtime-skeleton.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md" "internal/research/refactor/v1/priority-tracking-plan.md"
```

源码第一刀最小验证：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs" "lime-rs/crates/agent/src/agent_tools/mod.rs"
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
```

若触碰 App Server runtime lifecycle：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture
```

若触碰 App Server evidence export：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_coding_snapshot_artifacts -- --nocapture
```

若触碰 `AgentRuntimeState` approval resume：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture
```

若触碰 App Server RuntimeBackend approval bridge：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs"
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target-bridge" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture
```

若触碰前端 projection 或协议 shape：

```bash
npx vitest run "src/components/agent/chat/projection/toolEventProjection.test.ts" "src/components/agent/chat/projection/actionProjection.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts"
npm run test:contracts
```

整体完成前仍需补：

```bash
npm run governance:legacy-report
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
```

`verify:gui-smoke` 只在 GUI 主路径或可见交互变化后作为交付证据；纯 Rust typed owner 切片不把 GUI smoke 作为本刀阻塞门槛。

## 7. 后续接管条件

继续 P2 Tool / Approval / Sandbox post-merge regression 或其它深层模块代码刀前仍需先做 scoped status，满足任一条件后可接源码刀：

1. `git status --short -- <推荐窄写集>` 显示目标文件干净。
2. 隔壁进程在 `priority-tracking-plan.md` 标注移交 `agent_tools/tool_orchestrator*` 或 `execution/**`。
3. 用户明确授权当前进程接管对应热区。

未满足前，只允许继续做文档证据收口、P3 upstream diff 或只读验证，不夹写 `lime-agent` / App Server runtime 源码。

当前相邻热区补充：`lime-rs/crates/app-server/src/runtime/tool_lifecycle.rs` / `tool_lifecycle_tests.rs` / `tests/external_events/tool_lifecycle.rs` 已有通过证据；`runtime/context_auto_compaction.rs`、`runtime/tests/context_auto_compaction.rs`、`agent_tools/native_tool_policy_gate.rs`、`agent_tools/tool_orchestrator/truncation_tests.rs` 与 `src/lib/governance/asterContextPolicyBoundary.test.ts` 仍属于其它并行写集，本进程不改名、不删除、不合并。

## 8. 治理分类

- `current`：`lime-agent` tool domain 的 typed lifecycle owner、App Server RuntimeCore sequence validation、App Server RuntimeBackend approval bridge fixture（evidence done）、frontend projection owner、`evidence/export` correlation。
- `compat`：vendor Aster / existing registry executor 只作为事件和执行兼容面，不承接 Tool / Approval / Sandbox truth。
- `deprecated`：旧 `agent_runtime_*` production surface、旧 shell alias 入口，不允许新增依赖。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 `exec_command` 折回 legacy `Bash` alias 的路径。
