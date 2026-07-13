# Refactor v2 多进程实施计划

> status: ready-for-parallel-implementation
> owner: refactor-v2-coordinator
> coordination: required
> started: 2026-07-12
> execution: active-parallel-implementation
> source plan: `internal/research/refactor/v2/12-plan/slices.md`
> architecture: `internal/research/refactor/v2/04-target/architecture.md`

## 1. 主目标

在没有外部用户和历史兼容负担的前提下，按 v2 `copy -> adapt -> delete` 顺序实施 Codex-first runtime 重构，并让多个本地进程能够并行施工而不夹写、不抢占、不恢复旧路径。

固定产品链：

```text
Electron Desktop Host
  -> App Server JSON-RPC
  -> agent-runtime / RuntimeCore
  -> model-provider + tool-runtime
  -> Thread / Turn / Item materialization
  -> thread-store / ProjectionStore / read model
  -> React GUI projection
```

OpenCode 只参与 provider/model/multimodal 和 package ownership 参照；Codex TUI 不作为 GUI 实现目标。

## 2. 协调角色

| 角色 | 唯一职责 | 是否可以改中央计划 |
| --- | --- | --- |
| `coordinator` | 分配 slice、处理冲突、更新状态、收集 evidence、批准跨区变更 | 可以，只有一个进程 |
| `worker` | 只实现已领取 slice 的窄写集，提交独立 handoff | 不可以 |
| `reviewer` | 只读检查边界、测试和删除证明 | 不可以 |
| `gate-runner` | 执行共享验证，记录当前工作树 scope | 不可以 |

中央计划是协调者单写文件。worker 不直接编辑本文件的状态表，避免多个进程争用同一 Markdown 文件。

## 3. 共享协调目录

每个进程使用唯一 `<slice>-<owner>` 名称，不使用 PID 或模糊名称。协调文件不放进代码目录：

```text
.lime/refactor-v2/locks/<slice>/owner       # 本地原子锁，不提交
.lime/refactor-v2/claims/<slice>-<owner>.md # 本地认领快照，不提交
.lime/refactor-v2/handoffs/<timestamp>-<slice>-<owner>.md # 交接证据，不提交
```

`.lime` 下的文件可以被任意进程读取，但不能加入产品构建图。若需要把交接纳入仓库事实源，由协调者把不可变摘要复制到 `internal/exec-plans/` 的 evidence 文件，不把本地锁文件提交。

`<slice>` 必须逐字使用本计划写集表中的 canonical ID。禁止用单复数、缩写、`recovery/final` 后缀或同义别名另建平级锁；恢复与复核仍锁定原 canonical ID，阶段信息只写入 owner/claim。否则两个进程可能分别取得 `S5a-host-capability` 与 `S5a-host-capabilities` 这类同义锁并夹写同一写集。

### 3.1 原子认领

先创建目录再写 owner 文件；`mkdir` 成功才算拿到锁。两个进程同时认领同一 slice 时，只有一个能成功。

```bash
SLICE="S1"
OWNER="protocol-a"
LOCK=".lime/refactor-v2/locks/${SLICE}"

if ! mkdir "${LOCK}" 2>/dev/null; then
  echo "slice already claimed: ${SLICE}"
  exit 2
fi

printf 'slice=%s owner=%s pid=%s host=%s started_at=%s\n' \
  "${SLICE}" "${OWNER}" "$$" "$(hostname)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "${LOCK}/owner"
```

释放锁必须由原 owner 完成，并在 handoff 中写明 `released_at`。不得删除别人的锁、覆盖 owner 文件或用 `git clean` 清理锁目录。

### 3.2 认领前检查

worker 获锁前必须执行并保存结果：

```bash
git status --short -- <declared-write-set>
git diff --name-only -- <declared-write-set>
rg -n "<slice>|<path>" "internal/exec-plans/refactor-v2-implementation.md" \
  ".lime/refactor-v2/claims" 2>/dev/null || true
```

发现写集已有非本人改动、已有 claim、或路径属于其他 slice，立即停止，不通过临时副本绕开冲突。

claim 必须记录精确文件/函数范围、依赖的 handoff、只读集、避让集、最小验证和进程 PID/host。PID 只是诊断信息，所有权仍以唯一 `<slice>-<owner>` 和原子锁为准。

### 3.3 异常退出与陈旧锁

- 锁没有自动超时。长测试、模型调用或暂停不能被当成失联。
- worker 异常退出后，只能由 coordinator 恢复；其他 worker 继续避让该写集。
- coordinator 必须同时确认 owner 进程已不存在、目标写集没有继续变化、最近 claim/handoff 已读完，才可把原锁标记为 `stale` 并重新分配。
- 恢复时先写一份 `status: stale-recovered` handoff，记录旧 owner、判断证据和新 owner；禁止静默删除锁后抢占。
- 若无法证明旧 owner 已退出，保持阻塞并改派不相交 slice，不以并行速度为由强占热区。

## 4. 写集分区

每个 slice 只能有一个 active owner。目录级写集必须进一步列出实际文件；“整个 `src/`”“整个 `runtime/`”不是有效认领。

| Slice | 默认写集 | 依赖 | 默认 owner |
| --- | --- | --- | --- |
| `S0` 事实冻结 | `internal/research/refactor/v2/01-current-facts/**`、快照脚本 | 无 | `coordinator` |
| `S1` protocol/runtime | `app-server-protocol`、`agent-protocol`、`agent-runtime`、相关 fixtures | S0 | `protocol-a` |
| `S1b` request serialization | `app-server/src/processor/request_serialization.rs`、`processor/mod.rs`、`processor/dispatch.rs`、定向 tests | S1 canonical review | `protocol-scope-a` |
| `S1-contract-correct` canonical correction | `agent-protocol/src/lib.rs`、`agent-protocol/src/thread.rs` | S1 coordinator review | `protocol-contract-a` |
| `S1c` production protocol cutover | `app-server-protocol` 的 thread/turn/item method 与 schema、App Server processor、generated TS client、Renderer typed gateway | S1 contract、S2 read model contract | `protocol-cutover-a` |
| `S1d` package canonical consumer | `packages/agent-runtime-client/src/{runtimeClient,eventPipeline,sessionGateway,eventVerifier}.ts` 与定向 tests | S1c canonical notification | `runtime-client-a` |
| `S1e` package API/test cleanup | `packages/agent-runtime-client/src/index.ts`、compat middleware/export、`tests/client.test.mjs` | S1d handoff | `runtime-client-cleanup-a` |
| `S2` materialization/store | `app-server/src/runtime/thread_item_projection/**`、`read_model/**`、`thread-store` | S1 | `projection-a` |
| `S3` provider lowering | `runtime-core/src/llm_protocol/**`、`model-provider/**`、provider fixtures | S1 canonical types | `provider-a` |
| `S3c` provider consumer cutover | `media-runtime/src/image_request/openai_images.rs`、`media-runtime/src/video_worker.rs`、`agent-runtime/src/provider_turn.rs`、`app-server/src/runtime_backend/tool_events.rs`、对应 fixtures | S3 lowering spike、S1 event contract | `provider-consumer-a` |
| `S3d` provider stream cutover | `model-provider/src/current_client*.rs`、`runtime-core/src/llm_protocol/{canonical,events}.rs`、`agent-runtime/src/provider_turn.rs`、App Server provider event consumers、对应 fixtures | S3c handoff、S1 canonical event contract | `provider-client-a` |
| `S3e` media event cutover | `media-runtime/src/llm_events.rs` 与定向 tests | S3d ready-for-review | `provider-media-a` |
| `S3f` legacy request mapper exit | `media-runtime/src/image_request/responses.rs`、`runtime-core/src/{lib,llm_protocol}.rs` 与旧 mapper positive tests | S3e ready-for-review | `provider-request-a` |
| `S4` tool/MCP/skills/agent graph | `tool-runtime`、`mcp`、`skills`、graph/store、approval projection | S1、S2 Item contract、S3c event contract | `runtime-tools-a` |
| `S5` GUI/Electron | `src/components/agent/chat/**` 精确文件、`src/lib/api/agentRuntime/**`、必要 host tests | S2 read model、S3 capability、S4 tool display contract | `gui-a` |
| `S6` 删除/守卫 | `legacySurfaceCatalog`、command policy、mock policy、旧 fixture、文档链接 | S1、S2-S5 对应 handoff | `governance-a` |
| `S7` 收口 | evidence、architecture confirmation、中央计划 | S0-S6 | `coordinator` |

### 4.1 永久热区

以下路径同一时间只允许一个 owner，其他进程只能只读：

```text
lime-rs/crates/app-server-protocol/**
lime-rs/crates/app-server/src/processor/**
lime-rs/crates/app-server/src/runtime.rs
lime-rs/crates/app-server/src/runtime/**
packages/app-server-client/**
src/lib/api/appServer.ts
src/lib/api/channelsRuntime.ts
src/lib/dev-bridge/**
scripts/check-command-contracts.mjs
src/components/agent/chat/AgentChatWorkspace.tsx
```

热区 owner 需要在 claim 中列出函数/模块级范围。没有 coordinator 明确拆分，不允许两个 slice 同时夹写同一个热区。

### 4.2 共享只读资源

Codex/OpenCode 外部仓库、`internal/aiprompts/**`、v2 research 文档和生成的测试报告对 worker 默认只读。重大架构 slice 的 handoff 被接受时，由 coordinator 在同一变更集中同步 `internal/aiprompts/architecture.md`；S7 只做最终确认，不允许把必需的架构更新统一拖到最后。

### 4.3 S2 并行拆分

S2 不允许继续以一个模糊的 `materialization/store` 写集施工。下一轮只能按以下文件边界认领；前三项可并行，后两项必须按依赖串行：

| 子 slice | 精确写集 | 依赖与禁止交集 |
| --- | --- | --- |
| `S2a` store contract | `thread-store/src/{lib,store,types}.rs` | 定义 async storage-neutral typed store/page/cursor contract；不碰 App Server |
| `S2b` typed materializer | `app-server/src/runtime/thread_item_projection/{change_set,materializer,typed_tests}.rs`，以及 `thread_item_projection.rs` 仅 module/export 接线 | 依赖 S1 item family；不碰 schema、ProjectionStore、read model |
| `S2c` event-log repair | `app-server/src/runtime/event_log.rs`、对应 tests、`projection_repair.rs` 与独立 repair tests | 负责 malformed/unterminated tail、fingerprint、gap/divergence、audit；不碰 ProjectionStore/schema |
| `S2d` SQLite typed store | `projection_schema.rs`、`projection_store.rs`、`projection_item_events.rs`、`projection_store_tests.rs` | 依赖 S2a/S2b；单 owner 保留现有 collision hardening，并接入 changeset、ordinal、opaque cursor |
| `S2e` read-model cutover | `load_context.rs`、`read_model.rs`、`read_model/**` 定向 tests | 依赖 S2d；只消费 typed store，JSON-RPC/schema/client 接线归 S1c |

旧 timeline/store 只有在 S2e 与 S1c production consumer 均通过后才能交给 S6 删除；不得提前删除仍有真实 consumer 的 `agent_timeline`、`session_repository` 或 runtime snapshot 路径。

### 4.4 S4 首个并行切片

S4 broader contract 先从不依赖 App Server 热区的 tool core 开始。canonical ID 为 `S4a-tool-core`，精确写集如下：

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S4a-tool-core` | `tool-runtime/src/{tool_definition,tool_executor,tool_result_projection,tool_io,lib}.rs`、新增 `tool_call.rs`、`tool_lifecycle.rs` 与同模块 tests | 绑定 spec/executor/exposure；ToolCall 带 turn/call/environment；host emitter 输出 success/text/structured content/duration/truncation/sidecar。只建 contract 与 fake emitter，不碰 `collab_agent/**`、`lime-agent`、App Server、protocol、GUI；生产 cutover 另开依赖 S4b display DTO 的后续 slice。 |
| `S4b-display-items` | `agent-protocol/src/thread.rs`、`app-server/src/runtime/thread_item_projection/{materializer,change_set,typed_tests}.rs`、`app-server/src/runtime/tests/approval_decision_contract.rs` | 冻结 Tool/Approval/MCP/Collab/SubAgent display DTO，metadata 只保留 extension；补 create/update/terminal/replay merge，并修复 resolved-without-decision 误判。不得碰 App Server protocol/schema/client、read model、GUI 或 S4a/S4c 写集。 |

`S1f-thread-read-protocol`、`S2e-canonical-write-path` 与 `S2e` 已在 `20260712T123500Z-S2e-canonical-write-read-coordinator.md` 发布并完成验证，`S4b-display-items` 现已解锁。approval resolved-without-decision 的误判已登记到 `20260712T120403Z-S4-gap-audit.md`，归 S4b 一并修复。

### 4.5 S6 首个 store 删除切片

S2e canonical write/read 已完成，`thread-store` 内部零外部生产 consumer 的旧模块可以单独删除。canonical ID 为 `S6a-thread-store-dead`：

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S6a-thread-store-dead` | `thread-store/src/{conversation_transcript,history_search,legacy_conversation,runtime_store,runtime_status_item,session_insights,lib}.rs` 与对应内部 tests | 重新证明无 crate 外生产 consumer后物理删除 module/export/positive tests并补缺失守卫；不得触碰 `session_repository.rs`、`runtime_snapshot.rs`、`session_record.rs`、`task_board.rs`、S2 current `store.rs/types.rs` 或 App Server/agent consumer。 |

### 4.6 S1 canonical live producer 收口

S1c Renderer sequence gate 已只接受完整 canonical entity，但生产 App Server notification 仍直接包装 raw `AgentEvent`。canonical store 已写入不等于 live notification 已 canonical；不得让 GUI 恢复 ID normalization 或 lifecycle synthesis。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S1g-canonical-live-producer` | `app-server-protocol/src/protocol/v0/agent_session.rs`、`app-server/src/runtime/event_store.rs`、`app-server/src/processor/tests/event_notifications.rs`、`app-server/src/runtime/tests/turn_lifecycle.rs` | 依赖 S4b 释放 App Server protocol/generated schema 热区。EventStore 在持久化前用 canonical materializer 为 notification clone 生成完整 Turn/Item，materialization 失败必须在落盘前 fail-closed；durable internal event 不得因嵌入 canonical clone 改写 source payload。将 current `turn.canceled` 投影为 `TurnStatus::Interrupted`，删除协议层无生产来源的 `turn.interrupted` 接受分支。不得碰 S4b materializer/display DTO、Renderer 或生成 schema/client。 |

### 4.7 S4 production tool lifecycle 接线

S4a contract 已通过测试，但代码级审计证明 `RuntimeTool::execute_call` 与 `ToolLifecycleEmitter` 只有测试 caller。current provider 生产链仍在 `agent-runtime/provider_turn.rs` 直接调用 executor 并手工生成 start/end；先迁执行 owner，再迁出旧传输 DTO，避免与 S4b display contract 夹写。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S4c-tool-production-wiring` | `agent-runtime/src/provider_turn.rs`、`agent/src/current_provider_turn.rs` 与两文件内嵌 tests | 让 current provider 为每个 call 绑定 `RuntimeToolDefinition + RuntimeToolExposure + RuntimeToolExecutorHandle`，构造带 canonical turn/call/environment 的 `ToolCall`，由 host channel emitter 唯一发 started/completed；模型 transcript 使用 normalized output，保留 structured content、duration、truncation、sidecar 与 metadata。删除 `CurrentProviderTurnEvent` 手工 ToolStart/ToolEnd 生成，但本 slice 不改 App Server、S4b DTO 或旧 AgentEvent wire enum。 |
| `S4d-tool-wire-delete` | `agent/src/{protocol,current_provider_turn,write_artifact_events,lib}.rs`、`agent/src/agent_tools/{mod,workspace_patch_host}.rs` 并删除旧 `workspace_patch_runtime_adapter`、`tool_lifecycle/**`、`tool_orchestrator/**`；`app-server/src/runtime/thread_item_projection/{materializer,typed_tests}.rs`、`app-server/src/runtime/{event_store,tool_lifecycle,tool_lifecycle_tests}.rs`、`app-server/src/agent_ui_sequence_verifier.rs`（含内嵌 tests）、`app-server/src/runtime_backend/{tool_events,tool_process_runtime_metadata,coding_events,workspace_patch_host_execution,workspace_patch_host_tools}.rs` 与对应定向 tests；视零 consumer 结果删除 `tool-runtime/src/tool_batch.rs` 并清 `lib.rs`；同步 contract/governance guards 与架构确认 | 必须等待 S1g 释放 `event_store.rs`。host emitter 直接构造 S4b canonical Item，materializer 保真接收 nested Item，lifecycle/sequence guard 同步迁到 `item.started/updated/completed`，workspace patch 直连 RuntimeTool；最后物理删除 `AgentEvent::ToolStart/ToolEnd` 和旧 orchestrator/emitter。不得碰 GUI raw consumer；S5 后续只消费 canonical Item。 |

S4c 完成后必须执行 canonical `S4d-tool-wire-delete`。该 slice 将 host emitter 直接投影为 S4b canonical Tool Item，并迁移 workspace-patch 唯一旧 orchestrator consumer与 App Server lifecycle guard，最后物理删除 `AgentEvent::ToolStart/ToolEnd`、旧 `agent_tools/tool_lifecycle` emitter 与 App Server raw tool mapper。S4d 未完成前 S4 仍为 production cutover pending，不得把旧 wire DTO 改称 compat owner。

### 4.8 Canonical Tool durable consumer 收口

S4d live producer 切到 `item.started/updated/completed` 后，第二轮 provider
transcript、大输出持久化和 `thread_read.tool_calls` 必须同步消费 typed
`ThreadItemPayload::Tool`。S4e 已删除 read-model imported raw fallback；conversation
import 必须在 commit 边界一次性 lowering 成 canonical Item，不得再用 raw bypass 或
duplicate live event 维持 consumer。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S4e-canonical-tool-consumers` | `app-server/src/runtime/provider_history.rs`、`output_refs.rs`、`tool_item_projection.rs`、`tool_item_projection/extract.rs` 与同文件/紧邻定向 tests | provider 第二轮历史保留 canonical ToolCall/ToolResult，nested ToolOutput 可落 sidecar 并 hydrate，`thread_read.tool_calls` 使用 callId/typed output；不碰 conversation import、evidence、GUI 或 active approval restart 写集。旧 tool.* 分支只可作为带退出条件的 import-only compat。 |
| `S4f-image-command-canonical-tool` | `app-server/src/runtime_backend/image_command/{mod,tests}.rs`、`runtime_backend/tests/turn_flows.rs` | image command 只发 canonical Tool Item，保留 image-task/workflow/turn 领域事件、scope、arguments、text/structured output、error、metadata 与 duration；生产 raw tool lifecycle 清零。 |
| `S4g-current-tool-approval-identity` | `tool-runtime/src/tool_executor.rs`、`agent/src/current_provider_turn.rs` 与紧邻 tests | `execute_call` 显式绑定 typed call/turn identity，current executor 持有 canonical thread identity；approval/request-user-input 禁止 metadata 反推和 session-as-thread fallback，真实 confirmation resume 回归通过。 |
| `S4h-delete-live-tool-args` | `app-server/src/runtime_backend/tool_events.rs`、`runtime/{event_store,tool_lifecycle,tool_lifecycle_tests,projection_item_events}.rs` 与 stale fixtures/contract guard | 删除 canonical ItemStarted 后额外合成的 live `tool.args`；arguments 唯一来自 nested typed Item，EventStore 对 raw tool args fail-closed。 |
| `S4i-conversation-import-tool-items` | `app-server/src/runtime/conversation_import/{commit,commit_events}.rs`、`conversation_import/tests/runtime_events.rs`、`runtime/{event_store,projection_item_events,tool_item_projection}.rs`、external canonical tool tests 与 contract guard | 已完成：Codex import 内部中间态在 commit 的真实 session/thread/turn identity 边界 lowering 为 `item.started/item.completed`；arguments/output/error/provenance/预算与 incomplete lifecycle 保真。已删除 `is_imported_tool_wire_payload` bypass、raw projection allowlist 与正向 compat test；outer AgentEvent identity/sequence/time 是 nested Item projection 的事实源。 |
| `S4j-import-typed-draft` | `app-server/src/runtime/conversation_import/{codex,commit_events}.rs` 与其定向 tests | 已完成：Codex ResponseItem/EventMsg/`item_completed(TurnItem)` Tool 先进入 typed draft；selector、normalizer、预算和 commit lowering 不再解析 raw Tool JSON。缺失 call ID 按 source sequence 唯一补齐，重复 lifecycle 幂等，terminal-only/incomplete 使用隔离的 synthetic draft；structured output 保真。`commit_events.rs` 从 922 行拆为 675 行入口、362 行 lowering 和独立 tests。StoredSession canonical wire、raw bypass 与 GUI/read fallback 均未恢复。 |
| `S4k-evidence-canonical-tool-consumers` | `app-server/src/runtime/{provider_history,context_compaction,evidence_provider}.rs`、`evidence_provider/**`、紧邻 evidence export tests 与 contract guard | 已完成：provider transcript、compaction 与 coding/Skills/MCP/browser/artifact evidence 统一消费 nested canonical Tool Item；共享 typed view 保留 call ID、ItemStatus、arguments、metadata、structured output、output ref 与 MCP server identity。raw lifecycle 生产 consumer 和旧正向 fixture 已删除，非 lifecycle `tool.output.delta` side-channel 保持原语义；999 行 browser action index 已按 extraction/presentation 拆为 528/390/100 行。 |

S4j 完成后按 current 风险拆 evidence/context-compaction consumer。Codex parser 的 rollout
JSON 只能在输入边界存在，进入 selector/normalizer 前必须是 typed import draft；任何 source-local
raw Tool event、StoredSession raw wire、ProjectionStore/read model/GUI fallback 均为
`dead / forbidden-to-restore`。

### 4.9 S2 empty Thread 创建修复

Gate B fixture 证明 `start_session` 只写内存 `StoredSession`，canonical Thread 要等首个 RuntimeEvent 才由 `apply_canonical_events` 延迟创建；GUI 在首个 Turn 前打开新会话时，`agentSession/read` 因 Thread 不存在 fail-closed，产品停在恢复态。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S2f-empty-thread-create` | `app-server/src/runtime/session_lifecycle.rs`、`app-server/src/runtime/canonical_thread_store.rs`、`app-server/src/runtime/canonical_thread_store/persistence.rs`、`app-server/src/runtime/projection_store.rs`、`app-server/src/runtime/conversation_import/commit.rs`、`app-server/src/runtime/tests/sessions.rs` | `start_session` 必须在返回成功前原子建立 empty canonical Thread，失败不得留下仅内存 session 或仅 SQLite thread；canonical `session_id` 必须跨 RuntimeCore 唯一；显式 delete 与 import replace 必须清除 canonical/projected SQLite 数据后再移除内存状态。补 create/read/list、duplicate/restart、store failure/retry、delete/recreate 与空 turns/items tests，并复跑 home-hotpath Gate B。不得通过 AgentSession fallback、mock 或 GUI 特判掩盖。 |

### 4.10 S5 canonical Thread queue control consumer

S5 terminal 与 Approval projection 收口后，首个 canonical production read consumer 只迁 queued-turn
“立即执行”的 active/queued Turn 判定，不提前迁移 history、diagnostics、artifact 或 interrupted-input
restore 等尚未由 canonical Item 完整表达的 rich detail consumer。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S5c-canonical-read-consumer` | `packages/app-server-client/src/agent-runtime.ts` 与 tests/README、`packages/agent-runtime-client/src/{index,runtimeClient,sessionGateway}.ts` 与 tests/README；Renderer `appServer{Constants,Types,ClientMethods,ClientMethodSpecs}.ts` 与 tests；`src/lib/api/agentRuntime/{threadClient,threadClient.test}.ts`；新增 `src/components/agent/chat/projection/chatRuntimeQueueControlProjection{,.unit.test}.ts`；`hooks/{agentRuntimeAdapter,agentRuntimeAdapter.test,useAgentStream,agentStreamFlowControl,agentStreamFlowControl.test}.ts`；`scripts/check-app-server-client-contract.mjs` | package `readThread` 必须直接调用 `thread/read {threadId, turnsView:"full"}`，package root 只公开 canonical read params/response；queue control 只消费 narrow canonical projection，零 `agentSession/read`/`getSessionReadModel` Turn truth，identity 或 queue/status 非法时 fail closed。不得写回 rich `AgentSessionDetail`、不得迁 history/detail family、不得触碰 active S4h Rust 写集。Gate B 必须证明 `thread/read -> promote -> cancel canonical activeTurnId -> resume`。 |
| `S5d-plugin-canonical-thread-read` | `src/lib/api/pluginRuntime.ts`；`src/features/plugin/runtime/agentRuntime{AppServerClient,AppServerClient.test,ClientApi,ClientApi.test,CapabilityHost,CapabilityHost.test,TaskState}.ts`；`src/features/plugin/sdk/CapabilityHost{,.d}.ts` 的 `PluginTaskLookup.threadId`，仅限 canonical thread identity/read 迁移 | 从 `startTurn` 的 `turn.threadId` 建立唯一真实 identity，并贯穿 Plugin task result、snapshot/request、持久化 `RuntimeTaskState`、reload、typed lookup、get/cancel 与 session gateway；`readThread` 只调用 canonical `thread/read {threadId, turnsView:"full"}`。缺 threadId fail closed，禁止隐藏 cast、`sessionId === threadId` 假设、readSession fallback、进程内临时 map 或双读。不得触碰 S5c queue-control 文件。 |

### 4.11 S2 canonical queued Turn state correction

S5c read consumer review 证明 production 只发 `queue.added`，而 canonical materializer 只识别不存在的
`turn.queued`，导致 queued Turn 被错误物化为第二个 `inProgress/notQueued` Turn。该缺口必须在 canonical
materializer owner 修复，GUI 不得读取 legacy queue shadow 兜底。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S2h-canonical-queue-state` | `app-server/src/runtime/thread_item_projection/{materializer,typed_tests}.rs`、`app-server/src/runtime/canonical_thread_store_tests.rs`，必要时仅追加 `app-server/src/runtime/tests/queue.rs` 的 canonical read assertion | `queue.added` 物化为 `TurnStatus::InProgress + TurnQueueState::Queued`；`queue.removed` 按真实 `queuedTurnId` 删除 canonical Turn；`queue.promoted` 在 resume 前保持 queued；后续 `turn.started` 将同一 Turn 推进为 Running。补 sequential apply/restart read、active+queued full read、remove、promote/start 状态转移；不改 emitter/protocol，不触碰 active S4h `projection_item_events.rs`。 |

### 4.12 S5 terminal queue history projection correction

首次 S5c Gate B 证明 canonical terminal Turn 会保留历史 `queue.state=running`；该状态不代表当前 active。
GUI queue projection 只能要求 `queue.state=queued` 的 Turn 仍为 `inProgress`，并继续只用
`status=inProgress && queue.state!=queued` 判定 active。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S5e-terminal-queue-history` | `src/components/agent/chat/projection/chatRuntimeQueueControlProjection.ts` 与 unit test | 接受 completed/failed/interrupted + historical Running/NotQueued，且 activeTurnId 必须为 null；terminal+Queued 仍 fail closed。不得放宽 identity/full hydration/multiple active/queued membership 约束，不改 flow-control、Rust 或 fixture。 |

### 4.13 S5 active stream queue intent correction

S5c Gate B 的完整 AgentDebug 证明 `queuedPromotion.start` 本身直到 120 秒 inactivity watchdog
才发生；并非 `thread/read` 早发晚回。两个真实 queued submit 均记录 `expectingQueue:false`，
因为 queue 判定把“同会话 activeStream + canonical read model 暂未 busy”误当成 stale binding。
真实 active stream 已有 turnId；无 turnId 的同会话残留 binding 才允许按 stale 处理。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S5f-active-stream-queue-intent` | `hooks/agentStreamUserInputSendPreparation{,.test}.ts`、`agentStreamPreparedSendEnv{,.test}.ts`、`agentStreamUserInputSubmission{,.test}.ts`、`agentStreamSubmitExecution{,.test}.ts`、`useAgentStream.ts` prepared-env wiring | queue intent 必须把同会话、带真实 turnId 的 active stream 视为 busy；保留无 turnId stale binding 的既有恢复语义。queued listener 不得覆盖 active binding，accepted 后必须释放 listener 并立即 refresh canonical read model，不创建第二个 active stream或 120 秒 watchdog；复跑同一 Gate B。不得恢复 legacy read truth或 local active turn fallback。 |

### 4.14 S2 canonical active Turn read timing hardening

Gate B 的首次复现曾在长流期间读到 queued Turn，却没有 active Turn；Rust canonical store
按 `turn.accepted -> message.delta -> queue.added` 顺序可稳定保留 active Turn，后续两次
`--keep-temp` Gate B 也在同一 SQLite/event log 中证明 active Turn 已 durable。该切片用于固定
服务端增量 apply/read 的时序回归，并把一次早读失败留作不可交付的 flaky evidence，禁止 GUI
用 local active stream 兜底掩盖。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S2i-canonical-active-turn-read` | `app-server/src/runtime/thread_item_projection/{materializer,typed_tests}.rs`、`app-server/src/runtime/canonical_thread_store_tests.rs`、必要时 `app-server/src/runtime/turn_execution.rs` 的 active admission 相关测试 | 增量 apply/read 覆盖 active admission、provider/message progress、queue.added 并发时序；canonical `thread/read` 必须返回唯一 active Turn，queued promotion 必须能取出 active identity；只允许 current Thread/Turn/Item store，禁止 legacy read/local fallback。若没有可复现 Rust 丢写，Gate B 失败必须归类为 timing/environment evidence 并保留重跑证据。 |

### 4.15 S4i Skills metadata and policy convergence

当前 Skills 已有 stable `scope:name` identity、局部 `allowed_tools` 和 session source/capability
gate，但 catalog、selection 与 tool gate 尚未共享 typed authority/source/capability/dependency/
enabled/token-budget decision。该 slice 只收敛 Skills current owner，不触碰 S4d/S4e/S4h 热区，
也不把 MCP snapshot 偷接入本 slice。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S4i-skills-metadata-policy` | `skills/src/{agent_snapshot,agent_selection,agent_body}.rs`、`tool-runtime/src/{skill_gate,skill_search,skill_execute}.rs`、App Server protocol `v0/skills.rs`、App Server skill catalog、Renderer `skill-execution.ts` 与对应 generated schema/types/tests | catalog 与 selection 使用 stable skillId；metadata 显式区分 source/authority/scope/enabled/interface/dependencies/capabilities；selection 输出统一 allow/deny/omitted reason 与基于真实 `SKILL.md + references` 的 body token-budget decision；path 仅 locator。tool invocation gate 因不拥有 selected body，必须继续输出 `not_evaluated`，不得用 invocation args 代替。executable 与 management list response 必须拆分；`skill/read` name-only 请求的退出条件是上游 source ref 先持有 stable skillId。不得修改 MCP snapshot、S4d/S4e approval/tool consumer、S5 GUI/plugin 或生产 mock 路径。 |
| `S4i-stable-skill-read-id` | `skills/src/agent_snapshot.rs` 的 default root scope、App Server `SkillReadParams`/catalog、Rust/TS client、Renderer `skill-execution`、Workbench Skill detail reader、`skills-current` smoke 与对应 schema/tests | default roots 必须从 project/user/app typed path API 保留 scope，禁止按扁平数组下标猜测；`skill/read` 只接受 catalog stable `skillId` 并从同一 snapshot winner locator 读取。GUI exact ID 优先，裸 name 只允许 catalog 唯一解析，重名/缺失/identity mismatch fail closed；禁止补 `project:`、path fallback 或 legacy wire alias。 |

## 5. Worker 生命周期

### 5.1 Start

1. 读取本计划、v2 对应契约和 `parallel-agent-collaboration.md`。
2. 宣布主线、slice、精确写集、只读集和避让集。
3. 检查当前工作树和既有 claim。
4. 成功创建原子锁后，写本地 claim 快照。
5. 只在声明写集内修改；发现外部变化立即暂停。

### 5.2 During

- 每次跨层改动都保持 `protocol -> client -> bridge -> fixture` 同步，不把半成品暴露给其他 slice。
- 删除旧实现前，先确认新 current owner 已通过最小测试。
- 不创建第二个 runtime、第二个 transcript store、第二个 projection 或临时 compat wrapper。
- 复制上游实现时记录仓库、commit、源文件、许可证和 Lime 适配点；无法确认许可证或依赖边界时先阻塞，不凭相似重写掩盖来源。
- 不执行 `git reset`、`git checkout`、`git clean`、`git commit`、`git push`。
- 需要跨写集修改时，创建 blocker handoff，等待 coordinator 重新切分，不直接抢写。

### 5.3 Finish

worker 必须在释放锁前写一份独立 handoff，内容如下：

```yaml
slice: S1
owner: protocol-a
status: ready-for-review|blocked|released
write_set:
  - lime-rs/crates/app-server-protocol/src/protocol/v0/thread.rs
read_only_set:
  - packages/app-server-client
avoided_set:
  - src/components/agent/chat/AgentChatWorkspace.tsx
changes:
  - copied: <Codex source>@<commit>
  - adapted: <Lime boundary>
  - deleted: <old surface>
tests:
  - command: npm run test:contracts
    result: pass|fail|not-run
evidence: <paths or command output summary>
governance: current|compat|deprecated|dead|test-only
next_owner: coordinator|<slice owner>
released_at: <UTC timestamp>
```

handoff 只写一次，不追加修改已发布记录；修正另开新时间戳文件并由 coordinator 汇总。

## 6. 冲突处理

| 情况 | 处理 |
| --- | --- |
| 同一 slice 已有锁 | 后到进程停止，转只读审阅或领取其他 slice |
| 写集与其他 claim 相交 | 两边停止写入，coordinator 重新拆函数/文件边界 |
| 目标文件出现非本人变化 | 立即暂停；不覆盖、不 reset、不 cherry-pick 外部提交 |
| 必须改共享 protocol/client | 由热区 owner 提交最小 patch，其他 slice 等待 handoff |
| 测试失败但非本 slice 引入 | 记录 baseline failure，不修改他人写集；请求 gate-runner 复核 |
| 发现旧路径仍有真实 consumer | 标记 `deprecated`，建立迁出子任务；不新增 compat |
| 需要更新架构事实源 | worker 在 handoff 标明变更，coordinator 在接受该 slice 时同步更新并确认架构图 |

出现冲突时的优先级是：保护当前工作树 > 保持唯一 owner > 维持并行速度。任何“先改了再说”的补丁都视为未授权写入。

## 7. Slice 依赖与并行窗口

```text
S0 -> S1 -> S2 -> S4 --\
          \-> S3 -> S3c +-> S5 -> S6 -> S7
```

- S0 只能由 coordinator 执行。
- S1 取得 protocol/runtime contract 后，S2 与 S3 可并行，它们不能共享写文件。
- S4 可先做只读盘点；涉及 Item/approval/agent edge 的写入必须等待 S2 contract handoff。
- S5 必须等待 S2 read model、S3c production provider event、S4 tool display contract；各 worker 可提前只读审计 GUI，但不能提前接线。
- S6 只能在相关 slice handoff 为 `ready-for-review` 后删除旧入口。
- S7 只能由 coordinator 执行，负责合并 evidence、架构确认和最终门禁。

## 8. 验证归属

| Slice | worker 最小验证 | coordinator 收口验证 |
| --- | --- | --- |
| S0 | 链接、快照、治理报告 | facts 汇总和 source commit |
| S1 | `npm run test:contracts`、Rust protocol/runtime related、runtime fixture | schema/client/bridge 全链路 |
| S2 | projection、thread-store、resume/pagination/repair tests | Agent runtime smoke + read model replay |
| S3 | provider/lowering/capability tests | contract + media GUI gate |
| S4 | tool/MCP/skills/multi-agent tests | runtime fixture + Gate B |
| S5 | 定向 Vitest/ESLint、GUI smoke | Gate B Electron evidence |
| S6 | governance report、negative guards、scripts governance | 无旧入口回流 |
| S7 | 不新增业务验证 | `npm run verify:local` + architecture confirmation |

共享测试由 gate-runner 执行时，必须注明验证的是当前工作树，不代表替代 worker 的归属测试。

## 9. 中央状态表

| Slice | 状态 | owner | claim | handoff | blocker |
| --- | --- | --- | --- | --- | --- |
| S0 | completed | coordinator | research baseline | `refactor-v2-research.md` | - |
| S1 | canonical-live-renderer-projection-Gate-B-validated / deprecated-agentSession-cleanup-pending | S1-coordinator -> coordinator | S1 claims + `.lime/refactor-v2/claims/S1j-canonical-live-renderer-projection-coordinator.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | S1 handoffs + `20260712T143428Z-S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `20260712T150644Z-S1c-renderer-sequence-gate-followup-coordinator.md` + `20260713T031243Z-S1j-canonical-live-renderer-projection-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s1j-canonical-live-renderer-projection.md` | production Renderer 的 Thread/Turn/Item lifecycle 只消费 canonical entity；raw 仅保留 provider/runtime status/image/media side-channel，未知 raw/lifecycle fail-closed。Coding Workbench 首轮失败、recovery 与终态 artifact 审查 Gate B 已通过；deprecated `AgentSession` envelope/namespace 删除仍待 S5/S6。 |
| S1b | ready-for-review / coordinator-validated | s1b-request-serialization-fix -> S2e canonical handler | `.lime/refactor-v2/claims/S1b-recovery-final-s1b-request-serialization-fix.md` | `20260712T104434Z-S1b-recovery-final-s1b-request-serialization-fix.md` + `20260712T121237Z-S1b-thread-identity-ownership-conflict.md` + `2026-07-12-s1f-s2e-canonical-thread-read.md` | Thread key 使用 RuntimeCore 只读 session→thread 解析；双 session FIFO、mismatch、SESSION_NOT_FOUND、fairness/admission 共 15 tests 在 canonical handler 合并后的当前树复测通过 |
| S1-contract-correct | ready-for-review | protocol_s1_fix | `.lime/refactor-v2/claims/S1-contract-correct-protocol-contract-a.md` | `20260712T090659Z-S1-contract-correct-protocol_s1_fix.md` | Codex status、typed ThreadItem、ItemId prefix、Turn/Thread fields、pagination contract 与 provenance 已落地；需 coordinator 做跨层 consumer cutover |
| S1c | ready-for-review / renderer-gate-cutover / domain-side-channel-Gate-B-validated | s1-canonical-cutover -> coordinator | `.lime/refactor-v2/claims/S1c-canonical-cutover-s1-canonical-cutover.md` + `.lime/refactor-v2/claims/S1c-renderer-sequence-gate-followup-coordinator.md` | `20260712T124000Z-S1c-renderer-sequence-gate-cutover.md` + `20260712T150644Z-S1c-renderer-sequence-gate-followup-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1c-image-domain-side-channel.md` | package 与 Renderer sequence gate 只接受 canonical lifecycle；旧 ID normalization/tool terminal fanout 已删除；显式 allowlist 仅旁路 provider diagnostic、runtime.status 与 image_task domain notifications，未知 raw/lifecycle 仍 fail-closed；13 focused tests、typecheck、图片命令与普通画图意图 Gate B 通过 |
| S1g-canonical-live-producer | ready-for-review / coordinator-integrated | s1g-canonical-live-producer -> coordinator | `.lime/refactor-v2/claims/S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `.lime/refactor-v2/claims/S1g-notification-json-assertions-coordinator.md` | `20260712T143428Z-S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `20260712T150644Z-S1g-notification-json-assertions-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1g-canonical-live-producer.md` | durable append 前 materialize notification-only canonical Turn/Item clone，source payload 不改写，`turn.canceled -> Interrupted`，无 turn compaction 保留 raw；stdio JSON-RPC 明确验证 canonical Item，最新 sessions 30/30 |
| S1j-canonical-live-renderer-projection | completed / coordinator-validated / Gate-B-passed | coordinator | `.lime/refactor-v2/claims/S1j-canonical-live-renderer-projection-coordinator.md` | `20260713T031243Z-S1j-canonical-live-renderer-projection-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s1j-canonical-live-renderer-projection.md` | canonical Item 覆盖 Tool/MCP/Approval/Command/File/Media/SubAgent/Compaction/Extension，Approval terminal 可投影 resolved；冻结 raw fixture 仅走 test-only helper。104 项 canonical 投影、18 项 Workbench、21 项 scene、41 项 package projection、typecheck、contracts 290 checks 与真实 Electron Gate B 通过。此前并行 S4j draft 中间态造成的 sidecar 重编 blocker 已由 typed source contract、`cargo check` 与 conversation import 48/48 解除。 |
| S1h-notification-test-correction | ready-for-review / validated | coordinator | `.lime/refactor-v2/claims/S1h-notification-test-correction-coordinator.md` | `20260712T150612Z-S1h-notification-test-correction-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2g-s1h-canonical-fixture-corrections.md` | notification JSONL 回归先断言 canonical Item，再移除 notification-only 字段比较 durable source payload；定向 JSONL loop 1/1 |
| S1f | ready-for-review / handler-validated | s1f-thread-read-protocol -> S2e canonical handler | `.lime/refactor-v2/claims/S1f-thread-read-protocol-s1f-thread-read-protocol.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | `20260712T120619Z-S1f-thread-read-protocol-s1f-thread-read-protocol.md` + `20260712T123500Z-S2e-canonical-write-read-coordinator.md` + `2026-07-12-s1f-s2e-canonical-thread-read.md` | 四个 canonical Thread read protocol/schema/Rust+TS client、direct ThreadStore handler、shared-read metadata 与 contracts 已在当前树通过 |
| S1d | ready-for-review / package-cleanup-complete | runtime-client-a -> runtime-client-cleanup-a | `.lime/refactor-v2/claims/S1d-runtime-client-a.md` + `.lime/refactor-v2/claims/S1e-runtime-client-cleanup-a.md` | `20260712T104756Z-S1d-runtime-client-a.md` + `20260712T110746Z-S1e-runtime-client-cleanup-a.md` | production/package API/tests 已只消费 canonical lifecycle；raw 仅保留验证后的 media non-thread channel；18 tests 与 typecheck 通过，旧 raw mapper/export/tests 和 no-op schema middleware 已删除 |
| S2 | ready-for-review / canonical-write-read-complete / empty-thread-validated | coordinator | S2a-S2g claims | S2a-S2g handoffs + `20260712T123500Z-S2e-canonical-write-read-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2f-empty-thread-create.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2g-s1h-canonical-fixture-corrections.md` | event-driven typed write/read、empty canonical Thread lifecycle 与 canonical fixture corrections 已验证；Gate B 已越过首个 Turn 前 `thread does not exist` 原 blocker，并到达 GUI/read model completed；S5 consumer cutover 后仍需删除 deprecated AgentSession presentation |
| S2a | completed | s2a-store-contract | `.lime/refactor-v2/claims/S2a-store-contract-s2a-store-contract.md` | `20260712T095953Z-S2a-store-contract-s2a-store-contract.md` | async storage-neutral typed ThreadStore、cursor/page/metadata patch 已通过 check 与 45 tests；S2d 必须实现该 trait |
| S2b | ready-for-review / workspace-validated | s2b_typed_materializer | `.lime/refactor-v2/claims/S2b-materializer-s2b_typed_materializer.md` | `20260712T101755Z-S2b-materializer-status-correction.md` | typed materializer 已在真实 App Server workspace 通过 thread_item_projection 22 tests |
| S2c | ready-for-review | s2c_event_log_repair -> coordinator | `.lime/refactor-v2/claims/S2c-event-log-repair-s2c-event-log-repair.md` + `.lime/refactor-v2/claims/S2c-validation-fix-coordinator.md` | `20260712T104754Z-S2c-event-log-repair-s2c-event-log-repair.md` + `20260712T111200Z-S2c-validation-fix-coordinator.md` | canonical event log 16 tests 与 projection repair 7 tests 全通过；invalid fixture 不再绕过 production append guard |
| S2d | ready-for-review | coordinator | `.lime/refactor-v2/claims/S2d-sqlite-thread-store-coordinator.md` | `20260712T111200Z-S2d-sqlite-thread-store-coordinator.md` | ProjectionStore 直接实现 canonical ThreadStore；4 canonical、20 projection、45 thread-store tests 通过；S2e consumer cutover 待完成 |
| S2e | ready-for-review | coordinator | `.lime/refactor-v2/claims/S2e-read-model-recovery-coordinator.md` + `.lime/refactor-v2/claims/S2e-canonical-write-path-coordinator.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | `20260712T123500Z-S2e-canonical-write-read-coordinator.md` | block_on 与静默 fallback 已移除；write/read/store/projection/repair/contracts 全通过；AgentSession adapter 明确 deprecated，退出条件为 S5 canonical GUI cutover |
| S2f-empty-thread-create | ready-for-review / current-read-validated / Gate-B-passed | coordinator | `.lime/refactor-v2/claims/S2f-empty-thread-create-coordinator.md` | `20260712T141455Z-S2f-empty-thread-create-coordinator.md` + `20260712T142418Z-S2f-empty-thread-current-read-correction.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2f-empty-thread-create.md` | empty canonical create、跨 RuntimeCore session identity、delete/import replace 清理与普通错误原子性已通过 4 条自有回归；真实 Electron Gate B 成功创建/列出/打开首个 Turn 前会话，GUI/read model completed 与 provider/client trace 全通过，不允许 GUI fallback |
| S2g-sessions-canonical-fixtures | ready-for-review / validated | coordinator | `.lime/refactor-v2/claims/S2g-sessions-canonical-fixtures-coordinator.md` | `20260712T150644Z-S2g-sessions-canonical-fixtures-coordinator.md` | 旧 `+100` gap、legacy process-item seed 与 delta batch fixture 已迁到 contiguous event/projection + canonical ThreadStore/Item 语义；`read_session_current_` 6/6、sessions 30/30 |
| S2g-message-batch-materialization | ready-for-review / validated | coordinator | `.lime/refactor-v2/claims/S2g-message-batch-materialization-coordinator.md` | `20260712T150611Z-S2g-message-batch-materialization-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2g-s1h-canonical-fixture-corrections.md` | `message.delta_batch` 读取 `deltas`，Approval identity 使用 `requestId`，commentary/final 使用显式 `itemId`，Codex warning 保持 notification-only；projection 26/26 |
| S2h-canonical-queue-state | completed / focused-and-unified-Gate-B-validated | canonical-queue-state | `.lime/refactor-v2/claims/S2h-canonical-queue-state-canonical-queue-state.md` | `20260712T201546Z-S2h-canonical-queue-state.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | `queue.added -> InProgress + Queued`、`queue.removed` 按 queuedTurnId 删除、`queue.promoted` 不生成 phantom Turn、`turn.started -> Running`；producer/materializer focused tests 与 S5 queued promotion 统一 Gate B 通过 |
| S2i-canonical-active-turn-read | completed / coordinator-validated / Gate-B-3-pass-1-flaky-evidence-closed | coordinator | `.lime/refactor-v2/claims/S2i-canonical-active-turn-read-coordinator.md` | `20260713T055500Z-S2i-canonical-active-turn-read-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s2i-canonical-active-turn-read.md` | 增量 `turn.accepted -> message.delta -> queue.added` canonical read 回归通过；三次 kept Electron Gate B 均在 promotion 前解析唯一 active Turn、收到 cancel，并由 SQLite/event log 证明 active durable；coordinator 复核 Rust 1/1、queue/read TS 32/32、typecheck 与 contracts 290 checks 通过；一次不保留目录的首跑早读失败仅保留为 timing/environment evidence，禁止 GUI fallback |
| S3 | production-canonical / retired-mapper-deleted | provider-a -> refactor-v2-coordinator | `.lime/refactor-v2/claims/S3f-provider-request-cutover-coordinator-provider-request-cutover.md` | `20260712T102744Z-S3d-provider-cutover-recovery.md` + `20260712T103500Z-S3e-media-event-cutover.md` + `20260712T105500Z-S3f-provider-request-cutover.md` + `20260712T115000Z-S3f-runtime-core-mapper-delete-validation.md` | provider stream、agent consumer、media RuntimeEvent 和媒体 request lowering 均走 canonical/current；retired runtime-core mapper、正向测试与导出已物理删除并补回流守卫，runtime-core 49、model-provider 118、contract 287 checks 通过 |
| S3c | released-blocked-environment | provider-consumer-a | `.lime/refactor-v2/claims/S3c-provider-consumer-a.md` | `20260712T085025Z-S3c-provider-consumer-a.md` | media consumer 已迁移并通过 check；完整 tests 被 ENOSPC 阻塞，provider stream consumer 留给 S3d |
| S3d | ready-for-review / app-server-validated | coordinator-s3d-recovery | `.lime/refactor-v2/claims/S3d-provider-cutover-recovery-coordinator-s3d-recovery.md` | `20260712T102744Z-S3d-provider-cutover-recovery.md` + `20260712T112000Z-coordinator-gate-validation.md` | CurrentProviderEvent 投影已删除；model-provider 118、provider_turn 3、lime-agent check 通过，App Server provider_history 3 与 tool_events 23 tests 已复测通过 |
| S4 | canonical-tool-and-approval-restart-ready / S4h-completed / S4i-typed-skills-and-stable-read-ready / broader-control-plane-pending | coordinator | S4a-S4i claims + `.lime/refactor-v2/claims/S4e-approval-restart-production-coordinator.md` | S4a-S4i handoffs/evidence + `20260712T192327Z-S4e-approval-restart-production-coordinator.md` | RuntimeTool、canonical Tool Item、provider history/output refs/read model、image command、typed approval identity、persisted restart/structured error、live tool args 删除，以及 S4i typed Skills catalog/body policy/stable-id read 已收敛。stable-id read 的无 Provider Electron Gate B 已通过；Approval 与 Skills body runtime fixture 仍被 external provider auth 挡在业务断言前。剩余 MCP Turn snapshot 与 mailbox/edge persistence |
| S4a-tool-core | ready-for-review / production-consumer-present | tool-core-a -> runtime-tools-production-a | `.lime/refactor-v2/claims/S4a-tool-core-tool-core-a.md` + `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | `20260712T122741Z-S4a-tool-core-tool-core-a.md` + `20260712T131753Z-S4c-tool-production-wiring-runtime-tools-production-a.md` + `20260712T132422Z-S4c-tool-production-wiring-ordering-correction.md` | canonical spec/executor/emitter/output contract 97 tests 通过；S4c 已接入 current provider 生产 caller，旧 AgentEvent/App Server raw mapper 仍待 S4d 删除 |
| S4b-display-items | ready-for-review / review-and-governance-corrected | coordinator | `.lime/refactor-v2/claims/S4b-display-items-coordinator.md` | `20260712T124000Z-S4b-review-resolved-without-decision.md` + `20260712T135000Z-S4b-display-items-coordinator.md` + `20260712T141234Z-S4b-display-items-governance-correction.md` | Tool/MCP/Collab/Approval typed display DTO、schema/client 与 25 materializer tests 通过；ask-user/MCP elicitation resolved-without-decision 为 terminal + decision null + Turn Resolved；sidecar 字段复用集中 owner，legacy report 边界违规为 0 |
| S4c-tool-production-wiring | ready-for-review / coordinator-unit-validated / Gate-B-home-passed-tool-path-pending | runtime-tools-production-a -> coordinator | `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | `20260712T131753Z-S4c-tool-production-wiring-runtime-tools-production-a.md` + `20260712T132422Z-S4c-tool-production-wiring-ordering-correction.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s4c-tool-production-wiring.md` | current provider 已唯一走 RuntimeTool/ToolCall/Emitter/NormalizedOutput；缺 turn ID fail-closed，host-first 调度保证 ToolStart -> ActionRequired -> ToolEnd；home-hotpath Gate B 已越过 S2f blocker并通过，仍需工具执行专场 Gate B；S4d 删除旧 wire DTO 后方可完成 S4 |
| S4d-tool-wire-delete | ready-for-review / canonical-wire-and-deletion-validated | coordinator | `.lime/refactor-v2/claims/S4d-tool-wire-delete-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-12-s4d-tool-wire-audit.md` + S4d/S4e closeout evidence | host/backend/artifact/workspace patch 已切 canonical Item；nested materializer、lifecycle/sequence guard 已迁；旧 enum/orchestrator/emitter/batch 已物理删除并补回流守卫。用户已用“继续”确认既有删除，workspace patch identity 8/8 |
| S4e-canonical-tool-consumers | ready-for-review / canonical-only-read-projection-validated | coordinator | `.lime/refactor-v2/claims/S4e-canonical-tool-consumers-coordinator.md` | S4d/S4e closeout evidence | provider history、nested output refs 与 thread/read-model tool projection 只消费 typed Tool Item；imported raw fallback、synthetic item、legacy merge/ID/conflict diagnostics 已物理删除并补 forbidden guard。projection 3/3、read model 27/27、contracts 通过；import producer cutover 归 S4i |
| S4f-image-command-canonical-tool | completed / canonical-and-Gate-B-validated | s4d-readonly-review -> coordinator | `.lime/refactor-v2/claims/S4f-image-command-canonical-tool-s4d-readonly-review.md` | `20260712T180729Z-S4f-image-command-canonical-tool-s4d-readonly-review.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1c-image-domain-side-channel.md` | image command raw Tool lifecycle 清零；canonical Tool started/completed 同 identity 可投影，image task domain side-channel 进入既有 GUI 投影；图片命令、普通画图意图、terminal preview 与 reload restore Gate B 均通过 |
| S4g-current-tool-approval-identity | completed / coordinator-validated | s4g-approval-identity-a -> coordinator | `.lime/refactor-v2/claims/S4g-current-tool-approval-identity-s4g-approval-identity-a.md` | `20260712T181403Z-S4g-current-tool-approval-identity-coordinator.md` | typed call/turn + canonical thread identity 已替代 metadata 反推；tool-runtime 7/7、current provider 8/8、真实 approval resume 1/1 |
| S4h-delete-live-tool-args | completed / coordinator-validated | s4h-live-tool-args -> coordinator | `.lime/refactor-v2/claims/S4h-delete-live-tool-args-s4h-live-tool-args.md` | `20260713T050800Z-S4h-delete-live-tool-args-stale-recovered.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4h-live-tool-args-closeout.md` | live `tool.args` synthesis 已删除并纳入 EventStore retired guard；canonical sequence fixture 与 approval terminal backend 已修正；lifecycle 13/13、tool events 13/13、external events 4/4、sequence 6/6、approval terminal 1/1 |
| S4i-skills-metadata-policy | ready-for-review / typed-catalog-body-validated / Gate-B-fixture-blocked | coordinator | `.lime/refactor-v2/claims/S4i-skills-metadata-policy-coordinator.md` | `20260713T032015Z-S4i-skills-metadata-policy.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4i-skills-metadata-policy.md` | typed stable skillId/source/authority/scope/enabled/interface/dependencies/capabilities 已贯穿 snapshot、search、selection、App Server catalog、schema/client 与 Renderer；真实 `SKILL.md + references` 累计预算只注入 allow body，omitted/deny 有稳定 reason/evidence。lime-skills 65、tool-runtime 260、protocol 41、Agent Skills 23、client 62、gateway 5、contracts 290 与 typecheck 通过；专用 body runtime Gate B 在首次 GUI submit 后被 fixture-provider auth 挡住。name-only `skill/read` 已由 `S4i-stable-skill-read-id` 收敛 |
| S4i-stable-skill-read-id | ready-for-review / stable-id-current-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S4i-stable-skill-read-id-coordinator.md` | `20260713T035301Z-S4i-stable-skill-read-id.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4i-stable-skill-read-id.md` | default 9+9+1 provider roots 保留 project/user/app scope；`skill/read` wire 只接受 stable `skillId`，catalog 与 read 共享 first-provider winner locator，name/path/scope guess 已删除。Workbench exact ID 优先、裸 name 仅唯一解析，跨 scope 重名与 response identity mismatch fail closed。skills 66、protocol 43+schema、Rust client 24、TS client 62、Renderer 15、typecheck、contracts 290、GUI smoke 与无 Provider Electron `skills-current` stable-id read roundtrip 全通过 |
| S4i-conversation-import-tool-items | completed / canonical-wire-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S4i-conversation-import-tool-items-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s4i-conversation-import-tool-items.md` | Codex import 在 commit identity 边界 lower 为 canonical typed Tool lifecycle；raw import bypass、projection allowlist 和正向 compat fixture 已删除，read/write wire 均 fail-closed。conversation import 10/10、external canonical Tool 4/4、tool projection 4/4、read model 27/27、contracts 290 checks、typecheck 通过；home-hotpath Gate B 重跑通过。approval resume Gate B 在 `action.required` 前遭 fixture provider 鉴权失败，保留为环境 blocker。 |
| S4j-import-typed-draft | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4j-import-typed-draft-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T033127Z-S4j-import-typed-draft-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4j-import-typed-draft.md` | source-local raw Tool envelope 已删除；typed draft 覆盖 ResponseItem、specialized EventMsg 与 current paginated `item_completed(TurnItem)`，unknown completed Item 显式记为 unsupported/provenance-only。conversation import 48/48、canonical external Tool 4/4、contracts 290 checks、legacy governance boundary 0 通过；本 slice 不改变 GUI，Gate B 继承 S4i canonical wire evidence。 |
| S4k-evidence-canonical-tool-consumers | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4k-evidence-canonical-tool-consumers-coordinator.md` | S4k handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4k-evidence-canonical-tool-consumers.md` | provider history、context compaction、coding/Skills/MCP/browser evidence 与 snapshot artifact 只消费 canonical Tool Item；browser action index 已拆离 999 行热区。provider 6/6、compaction 3/3、evidence unit 8/8、export integration 5/5、browser split 1/1、App Server check、contracts 290 checks 与 legacy boundary 0 通过；本 slice 不改变 GUI wire，未重跑 Gate B。 |
| S4-approval-restart-production | ready-for-review / focused-validated / Gate-B-fixture-blocked | coordinator | `.lime/refactor-v2/claims/S4e-approval-restart-production-coordinator.md` | `20260712T192327Z-S4e-approval-restart-production-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s4-approval-restart-production.md` | RuntimeCore 直接从 StoredSession current event 恢复 type/scope/descriptor；restart reopen、not-resumable、cancel waiter、terminal reason 与 processor error.data 均通过。聚合已越过 home/greeting/workbench/image/cancel 场景，approval external fixture 在 action.required 前因 fixture Provider 鉴权失败；contracts 已随 S5d/S4h 收口恢复通过 |
| S5 | ready-for-review / canonical-read-control-Gate-B-passed | coordinator | `.lime/refactor-v2/claims/S5-coordinator.md` | `20260712T192800Z-S5-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s5-canonical-terminal-gui.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | canonical terminal/Approval history 与 queued-turn canonical read control 已收敛；S5f Gate B 在约 5 秒内完成 `thread/read -> promote -> real cancel -> resume`，不再等待 120 秒 watchdog；focused 77 tests、typecheck、contracts 289 checks 与 GUI smoke 通过。Approval resume external fixture blocker 仍归 S4 approval evidence |
| S5a | ready-for-review | gui-s5a-host-capabilities | `.lime/refactor-v2/claims/S5a-host-capabilities-gui-s5a-host-capabilities.md` | `20260712T103640Z-S5a-host-capabilities-gui-s5a-host-capabilities.md` | typed host facade已通过3 unit、51 focused、360 related tests与eslint；最终GUI Gate B仍归S5 |
| S5c-canonical-read-consumer | completed / focused-contracts-and-Gate-B-validated | gui-s5-canonical-read -> coordinator | `.lime/refactor-v2/claims/S5c-canonical-read-consumer-gui-s5-canonical-read.md` | `20260712T162548Z-S5c-canonical-read-consumer-minimal-audit.md` + `20260712T200156Z-S5c-canonical-read-consumer.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | package/Renderer queue control 只读 canonical `thread/read` narrow projection；queued promotion Gate B 解析唯一 active Turn，并完成 promote、真实 cancel、resume 与 reload queue restore；focused 77 tests、typecheck、contracts 289 checks 通过 |
| S5d-plugin-canonical-thread-read | ready-for-review / focused-and-contracts-validated | plugin-canonical-thread -> coordinator | `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-plugin-canonical-thread.md` + `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-coordinator.md` | `20260713T041500Z-S5d-plugin-canonical-thread-read.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | canonical threadId 已贯穿 start/get/cancel/reload；缺失、冲突、错误 identity、queued/terminal/multiple-active 全部 fail closed；Plugin focused 26/26、typecheck、contracts 通过，静态守卫只接受 canonical Thread/Item |
| S5e-terminal-queue-history | completed / focused-and-unified-Gate-B-validated | canonical-terminal-queue | `.lime/refactor-v2/claims/S5e-terminal-queue-history-canonical-terminal-queue.md` | `20260712T202403Z-S5e-terminal-queue-history.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | terminal Turn 可保留 historical Running/NotQueued 且 activeTurnId 为 null；terminal+Queued 仍 fail closed；projection + adapter + flow 与同一 Electron queued promotion Gate B 通过 |
| S5f-active-stream-queue-intent | completed / focused-contracts-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S5f-active-stream-queue-intent-coordinator.md` | `20260712T215632Z-S5f-active-stream-queue-intent.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | 同会话真实 active turn 强制 queue intent；queued listener 不覆盖 active binding，accepted 后立即 canonical hydrate；Gate B 约 5 秒完成且 backend ledger 真实 cancel，focused 77 tests、typecheck、contracts 与 GUI smoke 通过 |
| S6 | partial-deletion-validated / thread-store-dead-removed | refactor-v2-coordinator | narrow coordinator write set + `.lime/refactor-v2/claims/S6a-thread-store-dead-thread-store-dead-a.md` | `20260712T115000Z-S3f-runtime-core-mapper-delete-validation.md` + `20260712T121200Z-S6-retired-client-shell-delete.md` + `20260712T124908Z-S6a-thread-store-dead-thread-store-dead-a.md` | runtime-core mapper、零 consumer media/subagent client 壳与六个旧 thread-store 模块已物理删除；S6a coordinator 复核 `thread-store` 17/17、治理守卫 11/11 与 diff-check 通过；S4b sidecar 字段已复用集中常量，legacy report 边界违规为 0；其余删除仍等待 S1/S2/S4/S5 对应 consumer cutover |
| S6a-thread-store-dead | completed / coordinator-validated | thread-store-dead-a -> coordinator | `.lime/refactor-v2/claims/S6a-thread-store-dead-thread-store-dead-a.md` | `20260712T124908Z-S6a-thread-store-dead-thread-store-dead-a.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s6a-thread-store-dead.md` | 六个零 crate 外 consumer 的 transcript/search/runtime-store/insight 模块及内嵌正向测试共 1923 行已删除，八个旧路径纳入 forbidden-to-restore 守卫；三个反向依赖 check 与 coordinator 定向复核通过 |
| S7 | pending | coordinator | - | - | S0-S6 |

S2f 架构确认：

```text
- [x] 本次属于重大架构变更
- [ ] 本次不属于重大架构变更
架构影响：改变 session start/delete 与 canonical Thread 的持久化时点和 identity 约束，不改变 ProjectionStore owner
架构图更新章节：internal/aiprompts/architecture.md 6.2 canonical persistence
责任开发者确认：refactor-v2-coordinator，2026-07-12
- [x] 已核对目录归属、数据流、依赖方向、协议边界和验证门禁
```

本地 `npm run governance:architecture-confirmation` 无 PR event/base SHA，无法完成 PR 级判定；进入 PR 时必须把上段复制到 PR body，并由门禁基于 committed diff 复核。

只有 coordinator 可以修改此表。worker 的实时状态以 `.lime/refactor-v2/claims` 和 handoff 文件为准。

### 9.1 S1c 架构确认

```text
架构影响：重大；新增 canonical Thread/Turn/Item live-event contract，并改变 Rust/TypeScript client 的事件消费优先级。
架构图已更新：internal/aiprompts/architecture.md 第 7 节 Agent 产品主链与 7.1 事件边界。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 Renderer -> Desktop Host -> App Server -> runtime -> canonical projection 依赖方向；raw event/typedEvent 明确为 deprecated，S6 删除条件已登记。
```

### 9.2 S1f canonical read edge 架构确认

```text
架构影响：重大；新增四个 canonical Thread read method，并将分页、view 与 shared-read scope/access 收回 protocol + ThreadStore owner。
架构图已更新：internal/aiprompts/architecture.md 第 7 节 Agent 产品主链与第 8.1 节命令数据边界。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 Renderer typed client -> App Server JSON-RPC -> direct ThreadStore read 的依赖方向；AgentSession detail 仅保留迁移期 presentation adapter，并登记 S2e/S5 退出条件。
```

### 9.3 S4c production tool lifecycle 架构确认

```text
架构影响：重大；current provider 工具执行从 direct executor + 手工 lifecycle 切换到 RuntimeTool/ToolCall/ToolLifecycleEmitter/NormalizedToolOutput 唯一生产 owner。
架构图已更新：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 definition/exposure/executor 绑定、turn/call/environment identity、structured/duration/truncation/sidecar 保真与 ToolStart -> ActionRequired -> ToolEnd 确定性顺序；AgentEvent::ToolStart/ToolEnd 与 App Server raw mapper 明确为 S4d 必删 deprecated boundary。
```

### 9.4 S4d Approval canonical contract 架构确认

```text
架构影响：重大；修改 canonical Approval Item 的 decision schema、request identity 与 GUI lowering，消除 available decision/result 混用和 scope 反推。
架构图已更新：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组、第 7.1 节事件与完成态。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 requestId 与 Tool call identity 隔离、Approved/ApprovedForSession/Denied/Abort/TimedOut 保真、pending decision=null、Renderer 显式 lowering、raw action.required 固定列表删除及 Gate B 退出条件。
```

### 9.5 S4d-S4g canonical Tool wire 架构确认

```text
架构影响：重大；live Tool lifecycle、image command、durable P0 consumers 与 approval identity 统一到 canonical Item + typed execution identity，旧 raw wire 物理删除。
架构图已更新：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 session/thread/turn/call identity、typed arguments/output/error/duration/truncation/ref、provider history、sidecar hydration、read model、image command 与 approval resume；conversation import raw event 仅为冻结 compat，persisted restart data-source 与 structured JSON-RPC error 仍登记为 blocker。
```

### 9.6 S4 Approval restart production 架构确认

```text
架构影响：重大；approval restart 从 backend AppDataSource/presentation JSON lazy read 改为 RuntimeCore StoredSession current event + typed descriptor 唯一恢复路径，并前置 canonical action type/scope 校验。
架构图已更新：internal/aiprompts/architecture.md 第 6.2 节 Agent Runtime 组。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：已核对 store handle reopen、session/thread/turn identity、caller type/scope fail-closed、无 oneshot 时 action_not_resumable、JSON-RPC error.data、重复 terminal reason、ask-user canceled terminal 与 no fake resolved；Approval Electron fixture 仍需在 action.required 前修复 external backend 配置后复跑。
```

### 9.7 当前开工门禁

截至 2026-07-12，本轮并行施工暂停扩容，已有工作树必须原地保护：

1. 构建缓存已按用户确认清理，当前 worker 必须使用自己的 claim 声明的独立 target；禁止重新依赖已删除的旧 target 或无声明共享缓存。
2. 当前 active 写集以 `.lime/refactor-v2/locks/**/owner` 为准；S2e canonical write/read model/read handler、S4a tool core 与 S5b 必须保持窄写集。S1b 已因 request_serialization overlap 停止写入，后续只由 canonical handler owner 基于 S1b handoff 合并并验证。
3. 后续任何缓存或锁目录删除仍属于文件系统危险操作，必须再次取得用户明确确认；本轮不得执行额外删除。
4. 所有 ready-for-review dirty set 必须由下一 owner 从现有 diff 继续；禁止从空白重做、覆盖现有内容或把旧 raw/compat 路径重新接回 production。

### 9.8 S1c 非 Thread domain side-channel 确认

```text
架构影响：保持既有 owner 的事件边界修复；不新增 transport、事实源或第二套 lifecycle。
架构图已更新：internal/aiprompts/architecture.md 第 7.1 节事件与完成态。
责任开发者确认：refactor-v2-coordinator，2026-07-12
确认内容：canonical Thread/Turn/Item 仍唯一经过 sequence gate；只有集中 allowlist 的 provider diagnostic、runtime.status 与 image_task domain notification 可旁路，且不得表达 lifecycle。未知 raw event 和 raw Thread lifecycle 继续 fail-closed；真实 Electron 图片命令与普通画图意图 Gate B 已验证 terminal preview 和 reload restore。
```

### 9.9 S1j Renderer canonical lifecycle 确认

```text
架构影响：落实既有重大架构决策，不新增 transport、事实源或第二套 lifecycle；生产 Renderer 的 Thread/Turn/Item 投影从 raw payload 收敛到 canonical entity。
架构图已更新：internal/aiprompts/architecture.md 第 7 节 Agent 产品主链与 7.1 节事件边界。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 canonical Thread/Turn/Item entity、Approval terminal、sequence gate、test-only raw fixture helper 与 provider/runtime status/image/media side-channel；未知 raw lifecycle 保持 fail-closed，Coding Workbench terminal/recovery artifact 已由真实 Electron Gate B 验证。
```

### 9.10 S4j Conversation import typed draft 确认

```text
架构影响：落实既有 canonical Tool owner，不新增产品协议；Codex rollout Tool 从 raw source-local event envelope 收敛为 typed import draft，并保持 commit 后唯一 canonical Item wire。
架构图已更新：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 ResponseItem/EventMsg/paginated TurnItem、typed phase/call/arguments/output/source metadata、structured content、unique missing ID、duplicate/terminal-only/incomplete lifecycle、budget、sidecar 和 commit identity；StoredSession/EventStore/ProjectionStore/read model/notification/GUI 继续禁止 raw Tool wire。
```

### 9.11 S4k Evidence canonical Tool consumer 确认

```text
架构影响：落实既有 canonical Tool owner，不新增产品协议；provider history、context compaction 与 evidence/export 从不可达 raw lifecycle 兼容路径收敛到 typed nested Item。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 provider transcript 顺序、typed output sidecar、ItemStatus terminal 语义、coding count、Skills metadata、MCP server/call identity、browser structured output、snapshot artifact、非 lifecycle side-channel 与 raw lifecycle 负向守卫；GUI wire 未变化，因此 Gate B 不适用。
```

## 10. 完成定义

v2 实施不能因为“几个进程都有改动”而标记完成。每个 slice 必须同时具备：

1. 唯一 owner 和不相交写集。
2. copy/adapt/delete 记录和上游 provenance。
3. positive/negative tests、协议/fixture 同步。
4. 正常、失败、中断、队列、stale event、resume/pagination 中与 slice 相关的证据。
5. handoff 已发布、锁已释放、下一 owner 已明确。

最终完成由 coordinator 统一执行 `npm run verify:local`、相关 GUI Gate B 和治理扫描，并在 `internal/research/refactor/v2/13-evidence/` 写入不可变 evidence。
