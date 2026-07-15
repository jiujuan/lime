# Refactor v2 多进程实施计划

> status: skeleton-and-post-gate-closeout / refinement-backlog-active / not-archive-ready
> owner: refactor-v2-coordinator
> coordination: required
> started: 2026-07-12
> execution: post-skeleton-refinement
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
| `S3g-runtime-core-dual-algebra-retirement` | `runtime-core/src/lib.rs`、`llm_protocol.rs`、`llm_protocol/{types,events,tests}.rs` | S3f canonical media cutover；与 active S2o/S7ab 无交集 | `provider-runtime-core-cleanup` |
| `S3h-model-provider-generic-lowering-retirement` | `model-provider/src/lowering/{mod,common,anthropic_messages,gemini,ollama_chat,openai_chat,openai_images,openai_responses,openai_responses_image_generation}.rs` | S3f canonical media cutover；保留 current client 与 canonical media body | `provider-lowering-cleanup` |
| `S3i-provider-dual-algebra-retired-guard` | `scripts/check-app-server-client-contract.mjs::checkRetiredRuntimeCoreMapperSurface` | S3g/S3h landed；只加 physical path 与 symbol guard，不改 provider behavior | `coordinator` |
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
| `S2j-projection-thread-identity` | `projection_store.rs`、`projection_store_tests.rs` | 后续 guard：session 首 event 必须提供 threadId；后续缺失字段只可精确继承既有 session owner；session/turn owner 冲突与 repair replay 冲突必须在同一 SQLite 事务 fail closed。不得修改 Electron Host、schema、MCP runtime 或 protocol。 |
| `S2l-canonical-history-repair` | `canonical_thread_store.rs`、`projection_repair.rs`、history Item ordering projection 与定向 tests | EventLog 全量 replay 必须识别并原子替换已存在但 Item 不完整的 canonical history，保留 Thread metadata；Renderer 的 live/history 路径必须统一按 canonical ordinal 排列 Item，再以 mutable sequence 做同 ordinal tie-break。只从正式 Item lifecycle 决定 terminal，禁止从 `turn.completed` 合成 Message completion；不得修改 Electron、protocol 或恢复 projected fallback。 |
| `S2s-canonical-agent-message-content-parts` | `agent-protocol::ThreadItemPayload::AgentMessage` typed content parts、App Server materializer/merge/read model、schema/generated client 与定向 tests | 对齐 Codex message content 数组与 OpenCode typed message parts，让 text/media/reference 随 canonical ThreadItem 持久化并进入 `thread/read`、`agentSession/read`。禁止把 raw provider payload/inline data URI 写入 Item，禁止 metadata escape hatch、presentation fallback 或第二 read model。 |

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

### 4.5a S6 默认 MCP seed 删除切片

Codex 的未配置 MCP 状态为 empty map；Lime 的 current MCP 管理入口只承接用户显式创建、导入或启用的 server。历史 `migration_v3` 自动注入 `@modelcontextprotocol/server-playwright` 的行为不属于 schema 升级，也不属于 GUI 产品预设，必须直接删除而不是保留 compat cleanup。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S6b-dead-default-playwright-mcp-seed` | `core/database/{mod,startup_migrations}.rs`、`migration_v3.rs`（删除）、`legacySurfaceCatalog.{json,test.ts}`、S6b evidence | fresh database 不生成默认 `playwright` 行；module/export/startup dispatch 不在编译图；旧包、marker 和调用受 dead guard 保护；不得删除或按名称重写显式用户 MCP，且不触碰 App Server runtime、Electron 或 Renderer。 |

### 4.5b S6 重复 agent session store 删除切片

App Server RuntimeCore、ThreadStore 与 ProjectionStore 已是 session CRUD、Thread/Turn/Item 持久化和 read model 的唯一 current 链。`lime-agent/session_store` family 仅在自身与 crate-root re-export 中循环，既无跨 crate 生产 consumer，也不承接 GUI/JSON-RPC 主链，必须整体删除，不能保留 compat public API。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S6c-dead-agent-session-store` | `agent/src/{lib,session_state_snapshot,session_store,session_store_*}.rs`（删除）、`agentMigrationBoundary.test.ts`、`legacySurfaceCatalog.{json,test.ts}`、S6c evidence | 删除 module/export、CRUD/read/subagent aggregation 及内嵌正向 tests；`lime-agent` 与 `app-server`/`lime-scheduler`/`lime-server` 反向依赖编译通过；路径、module/export 与旧符号由 dead guard 阻止回流。不得触碰 App Server runtime/event_store/runtime_backend、Electron、Renderer 或 current `thread-store` session repository/runtime snapshot/task board。 |

### 4.5c S6 无调用 Lime-Agent runtime sidecar 删除切片

App Server RuntimeCore、ThreadStore、ProjectionStore 与 `agent-runtime` 是唯一 current runtime
链。`lime-agent` 内没有 Rust caller 的 execution-strategy compat、local subagent sidecar、
aggregate execution runtime 和 direct session query 不是过渡 owner，直接删除并以 guard 禁止恢复。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S6e-dead-rust-execution-strategy-compat` | `agent/src/{lib,execution_strategy_compat}.rs`（删除）、agent migration/catalog guards、S6e evidence | Rust compat normalizer 与 module declaration 必须离开编译图；React typed request/lowering 与仍有 renderer caller 的 TypeScript `executionStrategyCompat.ts` 保持 current/compat 原状；不得触碰 App Server、Electron 或 Renderer。 |
| `S6f-dead-agent-subagent-sidecars` | `agent/src/{lib,subagent_control,subagent_profiles}.rs`（删除）、agent migration/catalog guards、S6f evidence | local queue、旧 extension、profile/skill DTO 物理删除；`agent-runtime/session_execution` generic DTO 与 App Server canonical graph/mailbox/Thread projection 保持唯一 current chain；不得触碰 legacy Team GUI 或 App Server runtime。 |
| `S6g-dead-agent-runtime-aggregate` | `agent/src/{lib,session_execution_runtime,session_execution_runtime/runtime_payload}.rs`（aggregate-only 删除）、runtime/catalog guards、S6g evidence | aggregate builder、metadata parser、permission fallback 与专属 DTO 必须离开编译图；保留 `AgentEvent` task/routing/limit/cost DTO 和 App Server read-model projection；不得修改 protocol、Electron、Renderer 或 wire。 |
| `S6h-dead-agent-runtime-session-query` | `agent/src/{lib,session_execution_runtime,session_execution_runtime_query}.rs`（query 删除）、agent migration/catalog guards、S6h evidence | direct `agent_sessions` execution runtime query、module、alias/re-export 必须删除；App Server `session_metadata` read model 与 `agent-runtime` generic projection 保持 current，token usage projection 不受影响；不得触碰 App Server runtime、Electron、Renderer 或 protocol。 |

### 4.5d S6 Renderer fake Team 删除切片

RuntimeCore AgentControl 与 canonical Thread/Turn/Item 是 Multi-Agent 成员、活动和状态的唯一事实源。
Renderer 不得根据 selected Team、输入长度或正则在发送前宣布组队成功，也不得伪造成员、work-board
事件或 assistant preview。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S6i-dead-team-formation-preview` | `useRuntimeTeamFormation`、`teamFormationAgentUiProjection`、send preview helper/state、shell preview flag 与对应正向 tests | fake formation、虚拟成员、`runtime-team-dispatch:*` 消息和 preview layout 输入物理删除；发送直接进入 current Agent runtime，canonical child Thread/Item GUI 保持不变；负向 boundary guard 禁止回流。 |
| `S6j-dead-team-runtime-sidecar` | `team-workspace-runtime/**`、`useTeamWorkspaceRuntime`、session/control wrappers、`teamWorkspaceRuntime` 与对应 tests/i18n | 删除 raw status/stream 订阅、本地 live/draft/tool/queue map、restored synthetic facts 和 unavailable control stubs；Workspace 只从真实 child facts 派生标题/可见性并直接委托主输出 stop；canonical reader/projection/timeline/navigation 不得删除。 |
| `S6k-canonical-child-roster` | App Server canonical `thread/list`、canonical child selector/hook、Harness/Workspace roster wiring 与 focused tests | 成员和状态只读 canonical child Thread/lifecycle，保留 threadId/sessionId；不得恢复 raw Team sidecar、mock 或旧 roster owner。与 S6l 并行时拥有 `AgentChatWorkspace` roster wiring。 |
| `S6l-thread-first-subagent-navigation-guards` | current `thread/read` session identity helper、Workspace navigation hook、project-thread/dead/i18n/scenario guards 与 current docs | canonical activity 的 child ThreadId 必须解析真实 sessionId 后导航，真实 roster sessionId 直接进入 session view；修复 S6j 漏跑 ENOENT guard，补 sidecar 回流 monitor，不触碰 raw status API/roster DTO 删除。 |
| `S6m-raw-subagent-channel-retirement` | raw status sync effect、runtime adapter alias、status/stream event API、DevBridge truth prefixes、stale fixture 与 dead-channel guard | `agent_subagent_status:*` / `agent_subagent_stream:*` 无 producer/consumer，必须从生产订阅、API 与 mock policy 删除；generic `agentSession/event` transport、canonical read refresh 和 child roster 保持 current。 |
| `S6n1-raw-subagent-status-parser-retirement` | Renderer raw status parser、Agent UI dispatcher、正向 parser/projector tests 与负向 fail-closed guard | `subagent_status_changed` 不再进入 Renderer typed event 或 Agent UI projection；canonical SubAgent Item、runtime status team projection 与 generic historical EventLog read 不变。本切片不冒充 raw type/package/fixture 已物理删除。 |
| `S6n-raw-subagent-type-package-fixture-retirement` | raw status TS type/local projector、projection package helper/barrel/runtime facts、summary/i18n/fixture 正向口径、docs 与回流守卫 | raw status 类型、独立 local/package projector、fixture producer、summary/i18n 和正向文档全部物理删除；`runtime_status -> team.changed`、canonical SubAgent Item、thread/list child lifecycle 与 generic EventLog/hydration 保持 current。legacy roster DTO 不混删。 |
| `S6o-legacy-subagent-roster-dto-retirement` | team-memory shadow legacy child/sibling metadata、selected-team memory runtime wiring 与 focused guards | 删除无 current consumer 的 `team.subagents` / `team.parent_context` shadow entries、legacy roster DTO 类型依赖与 Workspace memory-runtime 传参；保留 `team.selection` 和 canonical child Thread roster。不得删除 canonical roster/projection/navigation 或恢复 raw status/stream。 |
| `S6o-canonical-gui-fallback-retirement` | Harness delegation/status、AgentRuntimeStrip 与 Workspace Harness 的 canonical child roster 接线 | GUI roster surfaces 只消费 `CanonicalChildThreadSummary[]`，删除 legacy list、DTO prop、状态 helper 与 fallback；不改变 canonical child Thread、navigation、session state 或 protocol。 |
| `S6p-a-canonical-navigation-and-runtime-strip-fallback-retirement` | `useWorkspaceSubagentNavigationRuntime` legacy known-session 分支、AgentRuntimeStrip legacy roster 统计、对应 fixture、Workspace wiring 与 boundary guard | SubAgent 导航只接受 canonical child ThreadId，命中 roster sessionId 直达，缺失时通过 current `readThreadSessionId` 解析；runtime strip 只消费 canonical child summaries。Harness delegation/status fallback、Task Rail stats、session state 与 legacy DTO 仍留给后续独立切片。 |
| `S6q-canonical-task-rail-subtask-stats` | Workspace scene -> Task Rail runtime -> Task Center Toolbar -> Task Rail ViewModel canonical child summaries 与定向 tests | Task Rail 子任务统计只消费 canonical child 七态：pendingInit/running 为 active，completed/shutdown 为 completed，errored/notFound/interrupted 为需处理；删除 Task Rail 的 `childSubagentSessions` 输入。MessageList、Inputbar、Harness 与 session DTO 不混入。 |
| `S6r-canonical-inputbar-subtask-stats` | Workspace scene -> landing task card / MessageList / Inputbar runtime status canonical child summaries 与定向 tests | landing、MessageList、Inputbar 子任务统计只消费 canonical child 七态；删除这些 surface 的 `childSubagentSessions` 输入和 projection deferral 搬运字段。session state、normalizer、API fixture、Rust metrics 留给后续 contract 切片。 |
| `S6s-legacy-subagent-session-contract-retirement` | React session state plumbing、Renderer session API/normalizer/fixture、canonical parent identity、Rust export active count 与三条窄 claim | 物理删除 child/sibling/parent session roster DTO 与 state；API spread 不得穿透旧 roster；parent visibility 只读 canonical thread family；export `activeSubagentCount` 保持输出契约但只读 canonical AgentGraph/open child status。 |
| `S6u-post-s6-team-memory-shadow-and-selection-retirement` | **pending follow-on，不计入已完成 S6 aggregate**；先做 Renderer `team_memory_shadow`/TeamDefinition metadata 与 localStorage owner，再做共享 projection/package，最后做 Rust session/read-model/schema consumer；每段独立 guard 与证据 | 将本地 Team memory shadow、无执行消费者的 `recent_team_selection` 和 selected-team metadata 直接删除；ContextPacket/file-backed memory 与 AgentControl/canonical child Thread 继续作为唯一 owner。不得删除 typed `team_memory_refs` 的真实 memory owner，不得恢复 Team compat 包装或第二套 child roster。三段按顺序施工，禁止并行写同一 `AgentChatWorkspace/workspaceSendHelpers` 热区。 |

### 4.5e S7 post-skeleton gate correction

S7 skeleton closeout 后继续按 smart Vitest 失败点做窄写集修正。测试只能跟随 current 事实源，
不得为了恢复旧断言而把 retired 路径、重复规则文案或旧 package entrypoint 写回生产和文档。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S7a-electron-ipc-contract-ordering` | `electron/ipcChannels.test.ts` 的 truth-bridge exact-set expectation | 只把已排序的期望数组改为确定性字典序；生产 command catalog、preload、host、App Server、catalog/mock 均不变。focused 与 smart batch 9 必须通过。 |
| `S7b-current-electron-guard-alignment` | `scripts/electron/current-entrypoints.test.mjs`、`scripts/electron/current-rules-guard.test.mjs` | renderer alias 断言跟随 current `browser.ts`；根规则只断言仓库级 owner，retired 细节只在 internal/roadmap guard 检查；质量断言绑定 Gate A/B、GUI smoke 与 no-mock 语义。不得修改生产 Vite、AGENTS、aiprompts 或 skill。 |
| `S7c-app-server-runtime-guard-currentization` | `src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`internal/roadmap/appserver/app-server-agent-runtime-boundary-governance.md` | 修正 `lime_agent::`/`CollabAgentState`/registry wrapper 误报，排除 test-only；正向断言 current `stream_current_provider_turn`、`session_configuration`、`workspace_patch_host`、`tool-runtime` owner。不得放宽真实 boundary，不得触碰 active Rust 实现。 |
| `S7d-image-command-events-split` | `lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs`、新增 `image_command/events.rs`、模块 tests/exports | 将 262-908 行 canonical image/tool/turn event projection 抽到 current `events` owner，`mod.rs` 保持 <=800 行 workflow facade；不改协议、provider、GUI 或 S2l 文件。 |
| `S7e-runtime-value-fields-split` | `lime-rs/crates/app-server/src/runtime.rs`、新增 `runtime/value_fields.rs`、module/tests/exports | 将 runtime.rs 652-738 的 id/JSON/timestamp helpers 抽到 current `value_fields` owner，runtime facade 保持 <=720 行；不触碰 canonical history/store/projection 或 S2l 写集。 |
| `S7f-runtime-backend-execution-trait-split` | `runtime_backend.rs`、新增 `runtime_backend/execution_backend.rs` 与边界/contract guards | ExecutionBackend trait 适配整体迁入 current 子模块，root facade <=480 行；不改变 turn/message lifecycle、协议或 provider 行为。 |
| `S7h-batch40-current-fixture-alignment` | `agentProtocol.test.ts`、`agentRuntimeEvents.test.ts` | Approval 只接受 canonical request ID，Thread/Turn/Item lifecycle fixture 只走 canonical envelope；不得恢复 raw dual-ID、synthetic terminal/tool fan-out。 |
| `S7i-plugin-runtime-thread-fixture-alignment` | `pluginRuntime.test.ts` | Plugin task start/get/cancel fixture 保留 canonical threadId；不得恢复 session-only task lookup。 |
| `S7j-plugin-capability-thread-fixture-alignment` | Plugin capability dispatcher test fixture | Capability Host fixture 的 start/cancel 使用同一 canonical threadId；不改 production host。 |
| `S7k-client-factory-session-read-owner-alignment` | `clientFactory.test.ts` | standard client 只注入 turn lifecycle，session read 仍由 App Server session owner 承接；不得路由到错误的 `readThread` mock。 |
| `S7l-plugin-host-bridge-thread-fixture-alignment` | Plugin Runtime Page Host Bridge fixture/test | task refresh 改读 canonical `thread/read(full)`；不得恢复 session-only refresh。 |
| `S7m-image-workbench-boundary-guard-alignment` | Image Workbench boundary guard | 守卫对齐 `Workspace -> SendSurface -> ImageRuntime` current 组合链；不改 GUI 行为。 |
| `S7n-agent-chat-current-api-fixture-alignment` | `index.testFixtures.tsx` | Skills fixture 走 execution current API，工具库存 mock 绑定 inventoryClient；不得扩展 compat root barrel。 |
| `S7o-live-reasoning-unsequenced-tool-order` | historical reasoning content sync 与 unit tests | 历史切片曾让无 position Tool 的到达顺序参与 production reasoning 排序；S7x 冷审确认该输入不可能通过 current canonical reader，现已 superseded，不能作为 current 规则或正向 fixture。 |
| `S7p-stream-binding-canonical-lifecycle-fixture-alignment` | stream binding / tail recovery tests | 正向 fixture 全部补 canonical Item/Turn envelope，production raw lifecycle 继续 fail closed。 |
| `S7q-runtime-sync-canonical-turn-fixture` | runtime sync effects terminal fixture | completed Turn 通过 canonical `turn/updated` 触发 deferred reconcile；不清 mock、不改 production fallback。 |
| `S7r-canonical-tool-order-fixture-alignment` | runtime handler integration fixture | WebSearch -> Reasoning -> WebFetch 顺序来自 canonical Tool/Reasoning Item sequence，不恢复 raw tool start/end。 |
| `S7s-streaming-renderer-checkpoint-mock-owner` | StreamingRenderer test mock | checkpoint restore mock 绑定 current threadClient owner；不恢复 agentRuntime root compat mock。 |
| `S7t-vitest-smart-targeted-state-isolation` | smart runner 与 runner unit tests | `--only-batch` / `--list-batches` 不写 resume state；该 runner slice 从冲突的旧 S7i 治理编号迁入 S7t，旧 claim 保留为 superseded evidence。 |
| `S7u-image-title-current-owner-fixture` | Image Workbench action shared test fixture | 标题生成 mock 绑定 current agentClient；不改 production local fallback。 |
| `S7v-inputbar-objective-current-owner-fixture` | `Inputbar/index.test.tsx` | objective persistence mock 绑定 current objectiveClient；plan/goal metadata 与 production send 保持不变。 |
| `S7x-canonical-reasoning-position-only` | `agentStreamReasoningContentSync.ts` 与 unit test | 删除由无 position Tool arrival order 决定 production reasoning 顺序的特判和 sentinel 正向 fixture；只保留 canonical ordinal/sequence、稳定 Item identity 与 reasoning 位于正文前的 GUI 规则。不得回退 S2l ordinal-first、恢复 raw lifecycle 或修改 projector/reader。 |
| `S7y-approval-cold-read-typed-response` | `runtime/read_model.rs`、新增 `runtime/read_model/approval.rs`、read model tests、canonical Approval projector、timeline Approval view-model/tests | cold/live terminal Approval response 输出 canonical `{ decision, decision_scope, reason_code }`，pending 不输出 response；wire 保持 `approved/approvedForSession/denied/timedOut/abort`，仅 GUI view-model lower 为现有显示值。不得新增 method、IPC、mock、legacy scalar parser 或触碰 conversation import/materializer。 |
| `S7ad-content-factory-action-identity-fixture` | completed / focused-and-Gate-B-validated / released / synthetic-probe-superseded-by-S7ae | workflow/read 只发布匹配 canonical pending action 的 respond；Content Factory fixture 不再伪造 `action.required` 或调用无 continuation 的 `workflow/respond`。S7ad 曾用 typed metadata 修正后序 contract probe；该重复 synthetic probe 已由 S7ae 整组删除，不再是 current Gate B 组成。 |
| `S7ae-content-factory-synthetic-contract-probe-retirement` | Content Factory Article Workspace fixture、scenario assertions/constants/domain guard、no-synthetic-action regression guard 与 plugin worker focused Rust tests | 删除产品闭环内额外制造的 contract-mismatch Turn、等待器、summary、专用常量和正向 assertion；plugin worker output contract 由 Rust fail-closed 测试承接，通用 worker failure read-model 测试承接投影，Content Factory Gate B 只验证真实成功 worker、真实失败 worker evidence、workspace、workflow control 与 GUI 恢复主链。不得修改生产 runtime、协议、Renderer 或恢复 mock/fallback。 |
| `S7af-code-artifact-recovery-turn-identity-fixture` | `scripts/electron/code-artifact-workbench-fixture-smoke.mjs` 与对应 guard test | recovery Turn 的 tool/file/patch/command/test execution identity 必须按 Turn 唯一；初轮失败 operation ID 只作为 recovery source reference。失败路径同样写当前 backend ledger。不得放宽 canonical cross-Turn Item fail-closed、修改 Runtime/ThreadStore/read model 或新增 ID normalization fallback。 |

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
| `S4e-canonical-tool-consumers` | `app-server/src/runtime/provider_history.rs`、`output_refs.rs`、`tool_item_projection.rs`、`tool_item_projection/extract.rs` 与同文件/紧邻定向 tests | provider 第二轮历史保留 canonical ToolCall/ToolResult，nested ToolOutput 可落 sidecar 并 hydrate，`thread_read.tool_calls` 使用 callId/typed output；不碰 conversation import、evidence、GUI 或 active approval restart 写集。此前 import-only raw 退出条件已由 S4i-S4m 完成，不再保留 compat。 |
| `S4f-image-command-canonical-tool` | `app-server/src/runtime_backend/image_command/{mod,tests}.rs`、`runtime_backend/tests/turn_flows.rs` | image command 只发 canonical Tool Item，保留 image-task/workflow/turn 领域事件、scope、arguments、text/structured output、error、metadata 与 duration；生产 raw tool lifecycle 清零。 |
| `S4g-current-tool-approval-identity` | `tool-runtime/src/tool_executor.rs`、`agent/src/current_provider_turn.rs` 与紧邻 tests | `execute_call` 显式绑定 typed call/turn identity，current executor 持有 canonical thread identity；approval/request-user-input 禁止 metadata 反推和 session-as-thread fallback，真实 confirmation resume 回归通过。 |
| `S4h-delete-live-tool-args` | `app-server/src/runtime_backend/tool_events.rs`、`runtime/{event_store,tool_lifecycle,tool_lifecycle_tests,projection_item_events}.rs` 与 stale fixtures/contract guard | 删除 canonical ItemStarted 后额外合成的 live `tool.args`；arguments 唯一来自 nested typed Item，EventStore 对 raw tool args fail-closed。 |
| `S4i-conversation-import-tool-items` | `app-server/src/runtime/conversation_import/{commit,commit_events}.rs`、`conversation_import/tests/runtime_events.rs`、`runtime/{event_store,projection_item_events,tool_item_projection}.rs`、external canonical tool tests 与 contract guard | 已完成：Codex import 内部中间态在 commit 的真实 session/thread/turn identity 边界 lowering 为 `item.started/item.completed`；arguments/output/error/provenance/预算与 incomplete lifecycle 保真。已删除 `is_imported_tool_wire_payload` bypass、raw projection allowlist 与正向 compat test；outer AgentEvent identity/sequence/time 是 nested Item projection 的事实源。 |
| `S4i4-canonical-media-reference-fixture-lifecycle` | `scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs` media-reference 分支、既有 smoke guard、evidence/handoff | test-only external backend 的媒体 AgentMessage 必须先发同 ID `item.started` 再发 `item.completed`；保持 contentParts/reference、GUI/read model 与 sidecar 断言不变。不得修改生产 Rust/GUI、恢复 raw Message lifecycle 或加入 mock fallback。 |
| `S4j-import-typed-draft` | `app-server/src/runtime/conversation_import/{codex,commit_events}.rs` 与其定向 tests | 已完成：Codex ResponseItem/EventMsg/`item_completed(TurnItem)` Tool 先进入 typed draft；selector、normalizer、预算和 commit lowering 不再解析 raw Tool JSON。缺失 call ID 按 source sequence 唯一补齐，重复 lifecycle 幂等，terminal-only/incomplete 使用隔离的 synthetic draft；structured output 保真。`commit_events.rs` 从 922 行拆为 675 行入口、362 行 lowering 和独立 tests。StoredSession canonical wire、raw bypass 与 GUI/read fallback 均未恢复。 |
| `S4k-evidence-canonical-tool-consumers` | `app-server/src/runtime/{provider_history,context_compaction,evidence_provider}.rs`、`evidence_provider/**`、紧邻 evidence export tests 与 contract guard | 已完成：provider transcript、compaction 与 coding/Skills/MCP/browser/artifact evidence 统一消费 nested canonical Tool Item；共享 typed view 保留 call ID、ItemStatus、arguments、metadata、structured output、output ref 与 MCP server identity。raw lifecycle 生产 consumer 和旧正向 fixture 已删除，非 lifecycle `tool.output.delta` side-channel 保持原语义；999 行 browser action index 已按 extraction/presentation 拆为 528/390/100 行。 |
| `S4l-mcp-step-snapshot` | `tool-runtime/src/mcp_connection/**`、`tool_extension.rs`；`agent-runtime/src/provider_turn/**`；`agent/src/current_provider_turn/**`、`mcp_bridge.rs`；`mcp/src/{manager,bridge_client}.rs`；tool execution fixture | 每个 sampling step 同时冻结 definitions、allowlist、caller policy、route、connection handle 与其 tool timeout；unknown/hidden call fail closed，单 server error/timeout 不清空健康 surface，`tool_search` selection 只在本 Turn 下一 step 生效。禁止写成整 Turn snapshot，禁止全局 deferred selection、live registry redispatch 或恢复 raw `tool.input.delta` product event。 |
| `S4m-canonical-tool-residuals` | `app-server/src/runtime/{event_store,output_refs,thread_item_projection}.rs` 与职责子模块；output snapshot/external Tool tests、contract/governance guards | 已完成：`tool_end` 在 normalization 前 fail-closed；Tool/MCP/Collab 大输出只从 nested ToolOutput 落 sidecar/hydrate，outer legacy output fallback 删除；图片 media projection 只消费 completed+succeeded canonical Tool metadata/structured output，pending/raw/无 sidecar fail closed。触碰的 953/859/1444/1174 行热区均拆到单文件低于 800 行。 |
| `S4n-dead-backend-event-stream-surface` | `app-server/src/{backend_event,lib}.rs`、`core/src/agent/types.rs`、contract guard | 已完成：零消费者 backend event-name mapper/module/export 物理删除；零消费者 `StreamEvent`、`ToolExecutionResult`、`StreamResult` 整族删除，仍被数据库与 session 使用的 `TokenUsage` 保留。canonical `ThreadItem` 与 Item lifecycle 是唯一 current owner，旧路径/导出/DTO 均有回流守卫。 |
| `S4o-mcp-control-plane-step-snapshot-audit` | MCP resource/prompt/capability/elicitation consumer 与生命周期只读审计 | 已完成：Resource/Prompt/status 是 App Server management surface，不进入 S4l provider Tool snapshot；server capabilities 随 initialized connection replacement；server-originated elicitation 尚未实现，generic Tool approval 与 `request_user_input` 不是替代品。审计发现 resource 与 prompt 的 target identity 缺陷，分别交给 S4p/S4q。 |
| `S4o-mcp-control-plane-owner-split` | `tool-runtime/src/mcp_connection{,/registry,/step_snapshot}.rs`、`mcp/src/{manager,bridge_client}.rs`、`agent/src/{mcp_bridge,current_provider_turn}.rs`、contract guard | 已完成：model bridge 只保留 sampling-step tool discovery、exact dispatch 与 notification handle；零消费者 caller-unaware live dispatch、resource/prompt/capability summary API 与 bridge facts 已删除。GUI Prompt/Resource/status 继续由 App Server -> `lime-mcp::McpClientManager` live management read 承接；server-originated elicitation 保持独立后续协议 slice。 |
| `S4p-mcp-resource-target-identity` | `app-server-protocol` MCP DTO/schema、Rust/TS client、`lime-mcp` manager、App Server local data source、native resource helper、Renderer API/Hook/资源浏览器与 MCP fixture/guard | 已完成：read/subscribe/unsubscribe 统一使用精确 `(server, uri)`，manager 删除跨连接 URI 扫描；协议/schema/client/gateway 对缺失或空 target fail closed；native Tool metadata 与 GUI preview/subscription key 保留 server identity。两个真实内存 MCP server 的同 URI 回归证明三种操作只命中指定 server；真实 Electron Host current smoke 走 `app_server_handle_json_lines -> App Server JSON-RPC`，legacy MCP 命令零命中。Prompt identity 已由 S4q 收口，server elicitation 保持独立后续 slice。 |
| `S4q-mcp-prompt-target-identity` | `app-server-protocol` MCP prompt DTO/schema、Rust/TS client、`lime-mcp` prompt manager、App Server local data source、Renderer API/Hook/提示词浏览器与 MCP guard | 已完成：prompt get 统一使用精确 `(server, name)`，manager 删除 prompt name 前缀解析与跨连接扫描；protocol/schema/client/gateway 对空 target fail closed；GUI active/result identity 同时绑定 server/name，并用 request generation 丢弃切换后的迟到结果。两个真实内存 MCP server 的同名 prompt 回归只命中指定 server；后置 processor/package client server-less fixture 已清零并通过 2/2、62/62。 |
| `S4s-mcp-sampling-capability-fail-closed` | `mcp/src/client.rs`、App Server contract guard | 已完成：复制 Codex fail-closed initialize 口径，删除无 `sampling/createMessage` handler 的虚假 sampling 广告并补负向回归；stdio/HTTP 共享同一 client info producer。lime-mcp 116、focused 1 与 App Server check 通过，guard 禁止 `enable_sampling()` 回流。 |
| `S4t-agent-graph-edge-persistence` | `thread-store/src/agent_graph.rs`、ProjectionStore canonical SQLite graph 模块/schema/tests | 已完成：复制并适配 Codex AgentGraphStore，持久化 child-unique parent 与 Open/Closed 状态，children/descendants 稳定排序，close 保留 audit 且 reopen 可读。只建立 edge storage owner，不读取 legacy session metadata；生产 AgentControl 接线归 S4v。 |
| `S4u-agent-mailbox-persistence` | `thread-store/src/{agent_identity,agent_mailbox}.rs`、App Server `agent_{identity,mailbox}_store.rs` | 已完成 durable storage foundation：同一 Projection SQLite 持久化 root-tree agent identity 与 mailbox；path/task-name 双重唯一/派生、message-id idempotency/conflict fail-closed、QueueOnly/TriggerTurn、root+recipient 隔离 FIFO 与 delivered audit/reopen 均有定向回归。shared LocalAppDataSource fixture 同步后 App Server mailbox store 4/4 通过。未接入 AgentControl、Turn trigger、canonical Item append/ack 或 GUI；这些 production consumer 归后续 S4w，禁止 legacy metadata、临时 map 或第二套 queue。 |
| `S4v-agent-control-production-wiring` | `app-server/src/runtime{,.rs/agent_control.rs}` | RuntimeCore first control boundary 已完成：loaded parent 创建 canonical child session/thread 后写 Open edge，edge failure 删除 child session/thread 并在补偿失败时 fail closed。Closed edge 与 descendants traversal 由 `AgentGraphStore` contract 保留；无 current consumer 的 RuntimeCore close/read 包装已在 S4x 收口时删除。未注册 gateway/tool/catalog/JSON-RPC/GUI，未消费 mailbox、未做 restart recovery 或删除 legacy Team；S4w 才能接 mailbox Item/ack 与 Turn trigger，六工具、GUI 与旧 Team 删除继续拆为后续窄 slice。禁止把内部 API 误报为 Multi-Agent 产品完成。原 S4v `agent_control` 6/6 已通过，S4x 当前 focused 11/11 覆盖 graph/gateway 生产边界。 |
| `S4w-agent-mailbox-production-consumer` | `RuntimeCore` 只消费 S4u durable mailbox/identity：以 `message_id` 派生 canonical Item，Item 可读后才 delivered ack；`TriggerTurn` 使用确定性 turn，`QueueOnly` 只在下一真实 turn 前注入。EventLog-first 后 canonical projection 失败保留 pending，并以 exact mailbox fields + contiguous durable tail fail-closed recovery；activity 查询只读 durable mailbox。 | completed / focused-validated：6/6 App Server focused tests、独立 App Server library check、S4w write-set rustfmt/diff 通过。consumer production module 已拆至 423 行，focused test module 独立为 557 行；不得使用 `RuntimeQueuedTurn`、legacy session metadata、临时 map 或第二队列；未注册六个模型工具、JSON-RPC、GUI，也未执行旧 Team 删除或完整重启恢复。 |
| `S4x-agent-control-tool-gateway` | RuntimeCore durable graph/identity/mailbox control、tool-runtime V2 AgentControl gateway contract、current provider per-turn gateway injection | 已完成 / focused-validated：`RuntimeCore -> per-turn opaque gateway -> ExecutionRequest -> RuntimeBackend pass-through -> current provider` 已接通；仅 gateway 存在时广告六工具，strict schema、canonical call/turn identity、root-tree target isolation、QueueOnly/TriggerTurn、interrupt 保持 Open edge 均 fail-closed。S4x 当时尚缺的 child terminal activity、prequeued steer 和 wait durable recovery 已由 S4aa 在同一 owner 内补齐；S4x 本身无 JSON-RPC/GUI，见 `internal/research/refactor/v2/13-evidence/2026-07-14-s4x-agent-control-tool-gateway.md`。 |
| `S4y-dead-team-tool-surface` | 删除 `tool-runtime::collab_agent`、旧 Team catalog/prompt/discovery/registry surface；迁移工具执行 smoke 与 dead guards | 已完成 / focused-and-governance-validated：旧模块族及五个 Team 工具/alias 已离开编译图和 current 静态事实源，工具执行 smoke 改用六个 V2 AgentControl 工具；catalog/discovery/native allowlist 与物理路径均有负向守卫。canonical Collab/SubAgent 历史/展示协议保持独立 read/projection 边界；JSON-RPC/GUI 与完整 restart recovery 不属于本 slice。 |
| `S4ab-legacy-collab-projection-boundary` | 收紧共享 Multi-Agent taxonomy/schema/visual projection 的 V2 名称边界 | 已完成 / package-contract-and-governance-validated：六个 AgentControl V2 名称是唯一 current projection taxonomy；裸 `send_input/resume_agent/wait/close_agent` fail closed 且不计入 V2 coverage，V2 visual name 不再降回 V1。历史 Rust enum/schema/import/display 保持 deprecated read-only。package 298/298、typecheck、contracts 与 legacy report 0/0/0 通过。 |
| `S4z-agent-control-restart-on-demand` | 跨 RuntimeCore 重启后的 exact-target child hydrate 与 durable control 语义 | 已完成 / focused-and-App-Server-validated：root hydrate 不递归加载 descendants；send_message QueueOnly 不唤醒 child，followup/interrupt 只加载 exact target，Closed edge 不可寻址且不 reopen。App Server check 与 agent_control 12/12 通过；无 BFS registry、第二队列、legacy metadata、JSON-RPC 或 GUI。 |
| `S4aa-agent-terminal-mailbox-activity` | canonical child terminal -> direct-parent durable Result mailbox；EventLog crash recovery；steer-first wait | 已完成 / focused-Rust-App-Server-and-GUI-smoke-validated / product-chain-closed-by-S4ad-S4ah：completed/failed 先 canonical 后写 direct-parent QueueOnly Result，interrupted/canceled 不写；Result 作为 assistant canonical Item 并保留 mailbox metadata，completed 长文本不静默截断。两类 EventLog-first crash window、repairable/empty-prefix tail、direct-parent isolation、pre-existing/new steer 优先、deadline final recovery、SQLite CAS 与 RuntimeCore/EventLog single-consume 已固定。原 JSON-RPC/Multi-Agent Gate B 缺口已由 targeted producer、canonical GUI 与 visible-DOM Gate B 关闭。 |
| `S4ac-wait-agent-canonical-item` | `agent/src/protocol.rs` 与独立 AgentControl projection tests | 已完成 / focused-and-lime-agent-validated：`wait_agent` Started/Completed 直接产同一 canonical `CollabAgentToolCall::Wait` Item，terminal ToolOutput 保真；list/non-AgentControl 继续为 generic Tool。S4aa 已完成并释放 gateway，targeted SubAgent activity 可由 S4ad 用真实 ThreadId 接入。focused 1、protocol 19、current provider 13 与 lime-agent check 通过；无协议/schema/GUI 改动。 |
| `S4ad-targeted-subagent-producer` | App Server AgentControl gateway typed fact、tool-runtime internal transport、current provider canonical emitter、SubAgent activity protocol/schema | 已完成 / focused-Rust-schema-and-S4ae-Gate-B-validated：spawn 成功追加真实 child ThreadId 的 Started；send/followup 成功追加 resolved target ThreadId 的 Interacted；interrupt 成功追加 Interrupted。四工具保留普通 Tool lifecycle，并在成功 terminal 后追加独立稳定 SubAgent Item；typed fact 不进入 model output、structured content 或 Tool metadata，失败/错配/wait/list 不伪造 activity。三新 activity为 current；S4ad 临时保留七个 historical wire 的决定已被 S4ae 按 Codex 三值与无兼容前提推翻，七旧值现为 `dead / forbidden-to-restore`。六工具真实 managed Gate B 已全绿。 |
| `S4ae-canonical-subagent-gui` | canonical cold/live SubAgent GUI、activity projection/i18n、synthetic sidecar 删除、三值协议收口 | 已完成 / focused-GUI-Rust-governance-and-AgentControl-managed-Gate-B-validated：spawn/followup 在 durable commit 与 `turn.accepted` admission 后返回，child 后台执行并继承 parent 显式 provider/runtime request；parent-only output contract 已清除。provider Text/Reasoning Item identity 提升为 Turn + sampling attempt scope，修掉 followup 跨 Turn raw ID 复用及其 EventLog sequence 次生错误，未放宽 canonical fail-closed。六个 AgentControl 工具全部 completed，15 项断言全真；旧 Team E2E 口径和 compat inventory evidence 字段已删除并补负向守卫。S4ag 已关闭 effective session-default/profile route 缺口，S4ah 已补完整可见 DOM Gate B。 |
| `S4af-codex-subagent-import-fidelity` | `app-server/src/runtime/conversation_import/codex/events{,/tests}.rs` 的 SubAgent activity kind lowering | 已完成 / focused-and-App-Server-validated：Codex `sub_agent_activity` / `subagent_activity` source kind 显式写入 canonical `activity`，Started/Interacted/Interrupted 精确保真；statusLabel/status/role 只作来源展示，不替代 typed activity。focused 1+1 与 App Server check 通过，无 raw Codex product wire、协议或 GUI 改动。 |
| `S4r1-mcp-elicitation-router` | `mcp/src/{elicitation,elicitation_tests,client,manager}.rs` 与 lifecycle/Cargo feature | 已完成：复制并强化 Codex connection-shared request router 与 RMCP form handler；opaque request ID、replacement 后旧 waiter 精确响应、bounded single-consumer、cancel/consumer-drop/`cancel_all` cleanup、typed action/content/schema 校验与 request `_meta` 已通过 focused 13、lime-mcp 128 和 App Server check。该 foundation 当时保持 capability absent；S4ak 已在 runtime owner 与 Gate B 完成后广告 form capability。 |
| `S4r2-app-server-reverse-jsonrpc` | `app-server-protocol` serverRequest catalog/schema、App Server broker、TS connection、Electron drain、Renderer event bus/dispatcher | 已完成并经 S4r2b correctness closeout：outer ID 使用 boot UUID + counter，aborted wait remove-on-drop，ambiguous client fail closed，Renderer 对 connection-scoped in-flight/settled id at-most-once。App Server 7、protocol 45+1、package 63、Electron 22、Renderer 6、contracts 290、legacy 0/0/0 与 GUI smoke 证据成立。S4r3 adapter、GUI、五语言、thread-owned runtime connection 和专用 Gate B 仍是后续；MCP elicitation 不产生 canonical Item。 |
| `S4r3-mcp-elicitation-adapter` | `app-server/src/{local_data_source,main,lib,mcp_elicitation}.rs` | 已完成 backend/transport foundation：启动期 clone 唯一 manager router，App Server transport lifecycle 并发 pump typed reverse request；R1 token 只留在 adapter task，R2 outer id 只留在 JSON-RPC，运行期不重锁 manager。真实 RMCP duplex 走 R1→R2→R1 已通过；当时的 GUI/product blocker 已由 S4r8-S4r9/S4ak 关闭。 |
| `S4r4-mcp-active-timeout` | `mcp/src/{active_time,client,bridge_client,manager}.rs` 与 lifecycle/tools、Agent bridge | 已完成：复制 Codex `68a1d82a` connection-local counted pause/RAII/active-time timeout；真实 handler 在整个用户等待期持 guard，overlap 计数，取消立即生效。删除 manager 第二套 wall-clock timeout 与 wrapper/snapshot/Agent bridge 假 handler。focused 4、lime-mcp 132 与三 crate check 通过。 |
| `S4r5-mcp-response-meta` | `mcp/src/{elicitation,client_service,client,bridge_client,manager}.rs` 与 lifecycle/tools、Agent bridge | 已完成：Codex custom `Service<RoleClient>` 只拦截 elicitation 并用 raw `CustomResult` 保真 result `_meta`；其余 request/notification/info 委托现有 handler，stdio/HTTP 无 typed service 旁路。S4ak raw wire 与完整 lime-mcp 140/140 继续覆盖。 |
| `S4r6a-server-request-resolved` | `app-server-protocol` resolved notification/schema/generated client、`app-server/src/{server_request,mcp_elicitation,lib}.rs` | 已完成：Codex `serverRequest/resolved` terminal notification 保持 request id/connection owner；正常、错误、RMCP cancellation 均向创建 outer request 的同一 client 有序发送 resolved，不新增第二 pending 表或 transport。S4r9/S4ak Gate B 已覆盖 resolved 后表单关闭。 |
| `S4r6b-mcp-elicitation-gui` | `src/lib/api/{appServerEventBus,appServerServerRequest,mcpServerElicitation}.ts`、全局 MCP elicitation modal、`App.tsx`、五语言 `agent.json` 与定向测试 | 已完成：Renderer dispatcher 使用 per-request `AbortController` 与 settled tombstone，支持 resolved 先于 request；主窗口根部一次性注册 typed handler，按 MCP primitive schema 渲染 GUI 表单并在远端撤销后静默关闭。重复 GUI claim 已合并到单一 owner，无 Approval、ask-user、生产 mock 或页面级挂载。S4ak 真实 Gate B 再次证明 visible/submitted/closed。 |
| `S4r7c-canonical-elicitation-producer` | 无 | 已 superseded：Codex `5c19155cbd93` 定义 MCP server elicitation 为 thread-scoped、turn-correlated 的 in-memory reverse JSON-RPC waiter；不创建 durable Item、read-model projection 或 persistence producer。已删除本 slice 写入的 durable surface，禁止恢复。 |
| `S4r8-mcp-runtime-thread-owner` | `tool-runtime/src/mcp_connection/**`、`mcp/src/{manager,bridge_client,client,elicitation}.rs`、`agent/src/mcp_bridge.rs`、`app-server/src/{local_data_source,local_data_source/mcp}.rs` 与定向 tests | owner/lifecycle 已完成：runtime MCP tool call 在 provider 边界构造完整 canonical scope，并只将 public `threadId`/nullable `turnId` lower 到 reverse request；management 无 scope nested elicitation fail closed。router 按 opaque id 精确结算，同 server 跨 thread 不串线；已转发 cancel/shutdown 保持 `serverRequest/resolved -> RMCP terminal`，未转发 waiter直接 Cancel。未新建 durable Item/read model，未公开 `sessionId`/`parentToolCallId`/raw token；S4r9 关闭 server fault isolation，S4ak 只对持有 immutable runtime owner 的 connection 广告 form capability。 |
| `S4r9-mcp-runtime-server-fault-isolation` | `agent/runtime_state/{,mcp_runtime,mcp_runtime_tests}.rs`、定向 Rust 与 Gate B evidence | 已完成：Codex 式并发 per-server runtime startup 已收敛到 `McpThreadRuntime` current owner。optional failure 仅使该 server absent；required failure 关闭候选 connection、拒绝 replacement 并保留已发布 generation/pending elicitation；健康 server snapshot 原子发布，不复用 management `RunningService`、global registry 或 mock。故障默认 Playwright MCP + 健康 stdio elicitation MCP 的真实 Electron Gate B 已通过。 |
| `S4ak-mcp-elicitation-capability-advertisement` | `mcp/src/{client,elicitation_tests}.rs`、`scripts/electron/mcp-elicitation-gate-b*` | 已完成：runtime-owned client 使用 MCP `2025-06-18` 并广告精确 `{"elicitation": {}}`；management/router-only client 保持 `2025-03-26` 且 capability absent。Gate B 按 stdio pid 绑定 initialize 与 accepted elicitation，缺 capability 时禁止发 request；lime-mcp 140/140、static 4/4 与真实 Electron Gate B 通过。 |
| `S1k-approval-session-cache-audit-only` | `app-server/src/runtime/thread_item_projection/materializer/lowering.rs`、`thread_item_projection/typed_tests/canonical_lifecycle.rs`、`event_store/canonical_notifications.rs`、`canonical_thread_store_tests.rs` 与 S1j blocker evidence | `approval.session_cache.hit` 只保留 audit evidence，不创建或通知 canonical Approval Item；cache-backed `action.resolved` 是唯一 terminal Approval，保持 `permission-<turnId>` identity。materialize/replay/restart 后不得残留 pending Approval，严格 approval-request-resume Gate B 必须通过。禁止放宽 Renderer pending guard或修改 approval producer。 |

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

### 4.13a S5 Managed Objective current owner migration

Managed Objective 的 DTO 已归 `agentRuntime/sessionTypes`，行为已归 `agentRuntime/objectiveClient`；
Agent Chat 叶子组件继续从 root `@/lib/api/agentRuntime` compat barrel 导入只会扩大旧入口。
本切片只迁 import/mock 并补负向守卫，不改变 Objective 行为、协议、文案或 App Server。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S5g-managed-objective-current-owner-migration` | Inputbar Objective panel/send、ManagedObjective panel/view/model、`agentStreamSubmitExecution` 的 Objective imports/mocks 与新增 current-boundary guard | ManagedObjective 类型只从 `sessionTypes` 导入，行为只从 `objectiveClient` 导入；测试 mock 同步指向 current owner，禁止本域恢复 root compat barrel。不得触碰 `agentRuntimeAdapter`、`appServerSessionClient`、S2l history/read model、S6o roster 或协议。 |
| `S5h-execution-runtime-type-only` | `useAgentChat.ts`、`WorkspaceConversationScene.tsx` 与 `executionStrategyCurrentBoundary.test.ts` | `AgentExecutionStrategy`、`AgentSessionExecutionRuntime` 只从 `agentExecutionRuntime` current owner 导入；只改 type owner 与回流守卫，不改变 runtime、send、projection、协议或 GUI 行为。 |
| `S5-session-types-root-barrel-residual` | history、Task Rail、Harness 三个 session DTO consumer 与 `sessionTypesCurrentBoundary.test.ts` | session DTO 只从 `agentRuntime/sessionTypes` 导入；只迁 import owner，不改变 history、roster 或 Harness 行为。 |
| `S5-session-types-status-surface-residual` | MessageList、task/status、projection deferral 五个 consumer 与 session/queued-turn guards | ThreadReadModel 与 Todo 归 `sessionTypes`，QueuedTurn 归 `queuedTurn`；只迁 type owner。 |
| `S5-components-current-owner-clean-remainder` | Harness types、Task Center、General Workbench Task Rail 三个 component type consumer | session、tool inventory、queued turn、execution runtime 各自直连 current owner；不改 component 行为。 |
| `S5-session-hooks-current-owner-migration` | `agentRuntimeAdapter`、`agentSessionState`、`agentStreamSubmitExecution`、`useAgentSession` import hunks | client/request/session/queued/execution/protocol 类型分别直连 current owner；不改 hook 行为或 public type。 |
| `S5-workspace-current-owner-clean-remainder` | Workspace context/conversation/send/subagent navigation/task rail 五个 consumer | session、execution、thread client 与 protocol search mode 分别直连 current owner；不改 Workspace 行为。 |
| `S5i-root-barrel-dynamic-type-residual` | `agentSessionRefresh.ts`、`agentStreamUserInputSendPreparation.ts` 与两个 current-owner guards | 删除最后三处 dynamic root type query，并让 guard 同时禁止 static/dynamic exact root specifier；production root consumer 归零。 |
| `S5j-history-test-session-type-owner` | 三个 Agent history 测试的 `AgentSessionDetail` type import | 直连 `agentRuntime/sessionTypes`；只迁 test type owner，不改变 fixture 或 assertion。 |
| `S5k-session-detail-test-owner` | 五个 session/history tests 的 `AgentSessionDetail` type import | 直连 `agentRuntime/sessionTypes`；只迁 test type owner，避开并行 stream-runtime tests。 |
| `S5l-session-presentation-test-owner` | 三个 session presentation tests 的 `AgentSessionInfo` / `AgentSessionDetail` type import | 直连 `agentRuntime/sessionTypes`；只迁 test type owner，不改变 presentation、topic 或 history merge fixture。 |
| `S5m-history-state-test-owner` | 五个 history/session-state tests 的 `AgentSessionDetail` type import | 直连 `agentRuntime/sessionTypes`；只迁 test type owner，不改变 state fixture 或 assertion。 |
| `S5n-read-checkpoint-test-owner` | timeline fixture 与 workspace view-model test 的 Thread read/checkpoint summary type import | 直连 `agentRuntime/sessionTypes`；只迁 test type owner，不改变 fixture 数据或运行时行为。 |
| `S5o-prepared-send-test-owner` | 四个 prepared-send tests 的 execution runtime / queued turn type import | 分别直连 `agentExecutionRuntime` 与 `queuedTurn`；只迁 test type owner。 |
| `S5p-event-binding-test-owner` | 三个 resume/event-binding tests 的 Thread read、execution runtime 与 queued turn type import | 分别直连 `sessionTypes`、`agentExecutionRuntime` 与 `queuedTurn`；root aggregate static test consumer 归零。 |
| `S5-client-factory-test-mock-owner` | `agentRuntimeAdapter.test.ts`、`useAgentChat.testUtils.tsx` 与 client owner boundary guard | test mock 直连 `agentRuntime/clientFactory`；禁止 root aggregate mock 回流，不改 production adapter。 |
| `S5q-root-barrel-retirement` | `agentRuntime.ts/.d.ts`、`agentRuntime/index.ts/.d.ts`、Agent API aggregate test、剩余 component mocks/helpers 与 retired shell guard | production/test/fixture static、dynamic 与 mock consumers 归零后物理删除四个 root aggregate 文件，不创建替代 barrel；direct clients 为唯一 current owner。 |
| `S5s-automation-managed-objective-type-owner` | 五个 Automation Managed Objective type consumers | `ManagedObjectiveStatus` / objective request 直连 `sessionTypes`；只迁 type owner。 |
| `S5t-plugin-respond-request-type-owner` | Plugin runtime 与 capability host 的 respond request type import | `AgentRuntimeRespondActionRequest` 直连 `requestTypes`；不改变 Plugin transport 或 thread identity。 |
| `S5u-experts-type-owner` | Experts skill binding/evidence 的四个 production 与两个 test consumers | skill binding 直连 `toolInventoryTypes`，evidence pack 直连 `evidenceTypes`；不改变 Experts 行为。 |
| `S5v-evidence-normalizer-type-owner` | 六个 evidence projection/normalizer modules | Evidence/Handoff/Replay/Analysis/ReviewDecision 类型直连 `evidenceTypes`；不改变 normalization 行为。 |
| `S5w-workspace-skill-binding-type-owner` | 三个 clean Workspace helper/test consumers | workspace skill binding 直连 `toolInventoryTypes`；避让仍脏的 `useWorkspaceSendActions.ts`。 |
| `S5x-agent-client-type-owner` | `agentClient.ts` 与 `executionStrategyCompat.ts` 的 title/provider/strategy type imports | session DTO 直连 `sessionTypes`，strategy 直连 `agentExecutionRuntime`；不改变 title generation 或 value normalization。 |
| `S5y-session-read-types-owner` | `agentRuntime` 内 session/read/objective/thread 的九个 clean TS/test consumers | session/read DTO 直连 `sessionTypes`，request DTO 直连 `requestTypes`；不改 client、normalizer 或 projection 行为。 |
| `S5z-declaration-types-owner` | 九个手写 `.d.ts` consumers：Agent protocol 与 `agentRuntime` clients/factory declarations | 每个 declaration 按符号直连 session/request/evidence/tool/execution current owner；不新增 declaration barrel，不修改运行时实现。 |
| `S5aa-protocol-media-types-owner` | `agentProtocolEventTypes.ts`、`agentProtocolOps.ts`、`mediaTasks.ts` | execution policy 直连 `agentExecutionRuntime`，session/provider DTO 直连 `sessionTypes`，media DTO 直连 `mediaTaskTypes`；不改变 wire protocol 或 media behavior。 |
| `S5ab-workspace-article-request-types-owner` | 三个 clean Workspace article/helper modules 的 update-session request import | `AgentRuntimeUpdateSessionRequest` 直连 `requestTypes`；不触碰 dirty `useWorkspaceSendActions.ts` 或 Workspace 行为。 |
| `S5ac-inventory-export-types-owner` | `inventoryClient.ts` 与 `exportClient.ts` | inventory/workspace binding 直连 `toolInventoryTypes`，evidence/review DTO 直连 `evidenceTypes`；不改变 client behavior。 |
| `S5ad-workspace-skill-binding-type-residual` | `useWorkspaceSendActions.ts` 的单个 skill-binding type import hunk | 在已释放 S5 Workspace direct-owner diff 上将最后一个 binding DTO 直连 `toolInventoryTypes`；不改 send behavior 或其余脏 diff。 |
| `S5ae-types-barrel-retirement` | `agentRuntime/types.ts/types.d.ts`、session roster boundary、ESLint import rule、retired shell contract guard | 真实 consumer 归零后物理删除两个 compat/deprecated type barrel；移除手写镜像读取，反转 lint 推荐并把两路径纳入 forbidden-to-restore guard，不创建替代 barrel。 |
| `S5ag-workspace-command-wiring` | `AgentChatWorkspace.tsx` command/task-center/workbench composition block、新增 `workspace/useAgentChatWorkspace{Command,TaskCenter,Workbench}Wiring.ts` 与 command boundary guard | 延续 S5b 明确未完成的 `<800` 结构目标：本切片只把既有 domain hook 的 command/task-center/workbench 组合迁入三个各自 `<800` 行的 current owner，主文件至少降到 `<2100`；不得搬移 Thread/Turn/Item、queue、stream、approval 或 provider 事实源，不得创建 mega-hook、context store、兼容层或可见行为变化。后续仍按 entry/bootstrap、conversation/runtime、scene prop projection 分片，直到主文件 `<800`。 |

### 4.14 S2 canonical active Turn read timing hardening

Gate B 的首次复现曾在长流期间读到 queued Turn，却没有 active Turn；Rust canonical store
按 `turn.accepted -> message.delta -> queue.added` 顺序可稳定保留 active Turn，后续两次
`--keep-temp` Gate B 也在同一 SQLite/event log 中证明 active Turn 已 durable。该切片用于固定
服务端增量 apply/read 的时序回归，并把一次早读失败留作不可交付的 flaky evidence，禁止 GUI
用 local active stream 兜底掩盖。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S2i-canonical-active-turn-read` | `app-server/src/runtime/thread_item_projection/{materializer,typed_tests}.rs`、`app-server/src/runtime/canonical_thread_store_tests.rs`、必要时 `app-server/src/runtime/turn_execution.rs` 的 active admission 相关测试 | 增量 apply/read 覆盖 active admission、provider/message progress、queue.added 并发时序；canonical `thread/read` 必须返回唯一 active Turn，queued promotion 必须能取出 active identity；只允许 current Thread/Turn/Item store，禁止 legacy read/local fallback。若没有可复现 Rust 丢写，Gate B 失败必须归类为 timing/environment evidence 并保留重跑证据。 |

### 4.14a S2 canonical Message / Plan lifecycle

聚合 fixture 的 Plan revision identity blocker 暴露出 canonical Message/Plan 终态不完整：user/agent
Item 缺少一致 completed lifecycle，Plan delta/final 没有正式 typed Item 与可跨重启恢复的 revision
identity，Plan-only 输出还可能创建空白 assistant message。该切片直接按 Codex Item lifecycle 收口，
不新增第二 read model、Tool alias 或 Renderer fallback。

| 子 slice | 精确写集 | 退出条件与禁止交集 |
| --- | --- | --- |
| `S2k-canonical-message-plan-lifecycle` | `agent-protocol` Plan payload/status、App Server runtime event mapper/parser、canonical materializer/store/read model/notification 与 tests、generated schema/client、Renderer canonical Item reader、Plan history Gate B fixture | `message.created` 形成 completed UserMessage；AgentMessage 仅在真实正文出现后启动，并由同一 Item 在 `message.completed` 终结，取消映射 Interrupted；Plan 是正式 typed Item，delta/final 按 `(turnId, revisionId)` 共用 identity，completed final snapshot authoritative 且跨重启保真。Plan 前空白缓存，Plan-only 不创建空 AgentMessage；read model/GUI reload 保留 revision、steps/status，legacy `update_plan` Item 为 0。禁止新增 compat、第二状态机、mock fallback 或 Renderer lifecycle synthesis。 |

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
| S1 | canonical-live-renderer-projection-Gate-B-validated / agentSession-current-presentation-boundary | S1-coordinator -> root | S1 claims + S2q boundary claim | S1 handoffs + S2q evidence/handoff | production Renderer 的 Thread/Turn/Item lifecycle 只消费 canonical entity；raw 仅保留 provider/runtime status/image/media side-channel，未知 raw/lifecycle fail-closed。旧“删除整个 AgentSession namespace”退出条件已 superseded：`agentSession/read` 是 ThreadStore-backed current 产品 presentation endpoint，`thread/read/list/...` 是同源 identity/control edge；禁止恢复的是 event/app-data/Renderer synthesis。 |
| S1b | completed / coordinator-validated / merged-into-S2e-canonical-handler | s1b-request-serialization-fix -> S2e canonical handler | `.lime/refactor-v2/claims/S1b-recovery-final-s1b-request-serialization-fix.md` | S1b + S1f/S2e evidence | Thread key 使用 RuntimeCore 只读 session→thread 解析；双 session FIFO、mismatch、SESSION_NOT_FOUND、fairness/admission 共 15 tests 在 canonical handler 合并后的当前树复测通过。 |
| S1-contract-correct | completed / consumer-cutover-closed-by-S1c-S1j | protocol_s1_fix | `.lime/refactor-v2/claims/S1-contract-correct-protocol-contract-a.md` | S1 contract + S1c/S1j evidence | Codex status、typed ThreadItem、ItemId prefix、Turn/Thread fields、pagination contract 与 provenance 已落地；package/Renderer consumer cutover 与 Gate B 已由 S1c/S1j 关闭。 |
| S1c | completed / renderer-gate-cutover-and-domain-side-channel-Gate-B-validated | s1-canonical-cutover -> coordinator | `.lime/refactor-v2/claims/S1c-canonical-cutover-s1-canonical-cutover.md` + `.lime/refactor-v2/claims/S1c-renderer-sequence-gate-followup-coordinator.md` | S1c/S1j evidence | package 与 Renderer sequence gate 只接受 canonical lifecycle；旧 ID normalization/tool terminal fanout 已删除；显式 allowlist 仅旁路 provider diagnostic、runtime.status 与 image_task domain notifications，未知 raw/lifecycle fail closed，focused/typecheck 与 Gate B 通过。 |
| S1g-canonical-live-producer | completed / coordinator-integrated-and-S1j-Gate-B-validated | s1g-canonical-live-producer -> coordinator | `.lime/refactor-v2/claims/S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `.lime/refactor-v2/claims/S1g-notification-json-assertions-coordinator.md` | S1g/S1j evidence | durable append 前 materialize notification-only canonical Turn/Item clone，source payload 不改写，`turn.canceled -> Interrupted`，无 turn compaction 保留 raw；stdio JSON-RPC 与 S1j Gate B 明确验证 canonical Item。 |
| S1j-canonical-live-renderer-projection | completed / coordinator-validated / Gate-B-passed | coordinator | `.lime/refactor-v2/claims/S1j-canonical-live-renderer-projection-coordinator.md` | `20260713T031243Z-S1j-canonical-live-renderer-projection-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s1j-canonical-live-renderer-projection.md` | canonical Item 覆盖 Tool/MCP/Approval/Command/File/Media/SubAgent/Compaction/Extension，Approval terminal 可投影 resolved；冻结 raw fixture 仅走 test-only helper。104 项 canonical 投影、18 项 Workbench、21 项 scene、41 项 package projection、typecheck、contracts 290 checks 与真实 Electron Gate B 通过。此前并行 S4j draft 中间态造成的 sidecar 重编 blocker 已由 typed source contract、`cargo check` 与 conversation import 48/48 解除。 |
| S1h-notification-test-correction | completed / validated-and-consumed-by-S1j | coordinator | `.lime/refactor-v2/claims/S1h-notification-test-correction-coordinator.md` | S1h/S1j evidence | notification JSONL 回归先断言 canonical Item，再移除 notification-only 字段比较 durable source payload；定向 JSONL loop 与 downstream Gate B 通过。 |
| S1f | completed / handler-and-S2e-consumer-validated | s1f-thread-read-protocol -> S2e canonical handler | `.lime/refactor-v2/claims/S1f-thread-read-protocol-s1f-thread-read-protocol.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | S1f/S2e evidence | 四个 canonical Thread read protocol/schema/Rust+TS client、direct ThreadStore handler、shared-read metadata 与 contracts 已在 current tree 通过。 |
| S1d | completed / package-cleanup-and-S1j-consumer-validated | runtime-client-a -> runtime-client-cleanup-a | `.lime/refactor-v2/claims/S1d-runtime-client-a.md` + `.lime/refactor-v2/claims/S1e-runtime-client-cleanup-a.md` | S1d/S1e/S1j evidence | production/package API/tests 只消费 canonical lifecycle；raw 仅保留 media non-thread channel；旧 raw mapper/export/tests 与 no-op schema middleware 已删除，package cleanup 与 Renderer Gate B 完成。 |
| S2 | completed / canonical-write-read-and-per-item-message-reasoning-plan-lifecycle-Gate-B-validated | coordinator -> root | S2a-S2q claims + S2o3 | S2a-S2q/S2o3 handoffs/evidence | event-driven typed write/read、empty canonical Thread、User/Agent/Reasoning/Plan Item lifecycle 已验证；provider Start/Delta/End 使用 canonical Turn + sampling attempt scoped identity，terminal Item 拒绝 late delta，per-item Plan parser 不串 buffer。`agentSession/read` 与 `thread/read/list/...` 共享 ThreadStore 事实源，缺失 canonical detail fail closed；imported Plan/User/Agent Message 保留 source identity、lifecycle 和 ordinal。 |
| S2a | completed | s2a-store-contract | `.lime/refactor-v2/claims/S2a-store-contract-s2a-store-contract.md` | `20260712T095953Z-S2a-store-contract-s2a-store-contract.md` | async storage-neutral typed ThreadStore、cursor/page/metadata patch 已通过 check 与 45 tests；S2d 必须实现该 trait |
| S2b | completed / workspace-and-S2d-S2e-consumer-validated | s2b_typed_materializer | `.lime/refactor-v2/claims/S2b-materializer-s2b_typed_materializer.md` | S2b/S2d/S2e evidence | typed materializer 已在真实 App Server workspace 通过 thread_item_projection 22 tests，并由 SQLite store/read consumer cutover 使用。 |
| S2c | completed / event-log-repair-and-downstream-recovery-validated | s2c_event_log_repair -> coordinator | `.lime/refactor-v2/claims/S2c-event-log-repair-s2c-event-log-repair.md` + `.lime/refactor-v2/claims/S2c-validation-fix-coordinator.md` | S2c + S2l/S2v evidence | canonical event log 16 tests 与 projection repair 7 tests 通过；invalid fixture 不绕过 production append guard，后续 history repair/fail-closed 已建立在该 owner 上。 |
| S2d | completed / canonical-ThreadStore-and-S2e-consumer-validated | coordinator | `.lime/refactor-v2/claims/S2d-sqlite-thread-store-coordinator.md` | S2d/S2e evidence | ProjectionStore 直接实现 canonical ThreadStore；canonical/projection/thread-store tests 通过，S2e consumer cutover 已完成。 |
| S2e | completed / canonical-read-owner-and-presentation-boundary-superseded | coordinator -> root | S2e claims + `.lime/refactor-v2/claims/S2q-agent-session-canonical-presentation-boundary-root.md` | S2e handoff + S2q evidence/handoff | block_on 与静默 store fallback 已移除；`thread/read/list/...` 负责 identity/control，`agentSession/read` 保留为同一 ThreadStore-backed current 产品 presentation endpoint。旧整段删除 AgentSession presentation namespace 的退出条件已 superseded；Renderer 缺 detail fail closed，production App Server 必须显式注入 runtime。 |
| S2f-empty-thread-create | completed / current-read-and-Electron-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S2f-empty-thread-create-coordinator.md` | S2f evidence/handoffs | empty canonical create、跨 RuntimeCore session identity、delete/import replace 清理与错误原子性已验证；真实 Electron Gate B 创建/列出/打开首个 Turn 前会话，不允许 GUI fallback。 |
| S2g-sessions-canonical-fixtures | completed / validated-and-consumed-by-current-read-model | coordinator | `.lime/refactor-v2/claims/S2g-sessions-canonical-fixtures-coordinator.md` | S2g/S2k evidence | 旧 gap、legacy process-item seed 与 delta batch fixture 已迁到 contiguous event/projection + canonical ThreadStore/Item；sessions/read fixtures 与 downstream lifecycle Gate B 已通过。 |
| S2g-message-batch-materialization | completed / validated-and-consumed-by-S2k | coordinator | `.lime/refactor-v2/claims/S2g-message-batch-materialization-coordinator.md` | S2g/S2k evidence | `message.delta_batch` 读取 `deltas`，Approval 使用 requestId，commentary/final 使用显式 itemId，Codex warning notification-only；projection 与 downstream canonical lifecycle 已验证。 |
| S2h-canonical-queue-state | completed / focused-and-unified-Gate-B-validated | canonical-queue-state | `.lime/refactor-v2/claims/S2h-canonical-queue-state-canonical-queue-state.md` | `20260712T201546Z-S2h-canonical-queue-state.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | `queue.added -> InProgress + Queued`、`queue.removed` 按 queuedTurnId 删除、`queue.promoted` 不生成 phantom Turn、`turn.started -> Running`；producer/materializer focused tests 与 S5 queued promotion 统一 Gate B 通过 |
| S2i-canonical-active-turn-read | completed / coordinator-validated / Gate-B-3-pass-1-flaky-evidence-closed | coordinator | `.lime/refactor-v2/claims/S2i-canonical-active-turn-read-coordinator.md` | `20260713T055500Z-S2i-canonical-active-turn-read-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s2i-canonical-active-turn-read.md` | 增量 `turn.accepted -> message.delta -> queue.added` canonical read 回归通过；三次 kept Electron Gate B 均在 promotion 前解析唯一 active Turn、收到 cancel，并由 SQLite/event log 证明 active durable；coordinator 复核 Rust 1/1、queue/read TS 32/32、typecheck 与 contracts 290 checks 通过；一次不保留目录的首跑早读失败仅保留为 timing/environment evidence，禁止 GUI fallback |
| S2j-projection-thread-identity | completed / focused-validated | coordinator | `.lime/refactor-v2/claims/S2j-projection-thread-identity-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s2j-projection-thread-identity.md` | ProjectionStore 已删除 `threadId = sessionId` fallback；首次缺 identity、后续 explicit conflict、turn 跨 owner reuse 与 repair clear/replay rollback 均 fail closed。`projection_store_tests` 23/23、rustfmt/diff 通过。Electron synthetic admission identity 修复是独立 Host write set；旧 turn first-notification fallback race 已登记给 Host owner。 |
| S2k-canonical-message-plan-lifecycle | completed / focused-contract-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S2-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2-canonical-message-plan-lifecycle.md` | Codex 对齐的 user/agent completed lifecycle、typed Plan、turn-scoped revision identity、authoritative final snapshot、restart/read model/GUI hydrate 与 Plan-only whitespace suppression 已完成。Rust focused、protocol、canonical reader、typecheck、694 types 零漂移、290 client checks 与 Plan history Electron Gate B 通过；完整 `test:contracts` 仅被无关已跟踪 release plan 的 docs ignore 边界阻断。 |
| S2l-canonical-history-repair | completed / focused-and-Gate-B-validated / related-import-concern-closed-by-S2m | root | `.lime/refactor-v2/claims/S2l-canonical-history-repair-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2l-canonical-history-repair.md` + S2l/S2m handoffs | canonical Item 的 live/history 展示统一使用 ordinal；持久化 Reasoning 接管反序临时 thinking 时重新插入正文前。TS 12/12、Rust 8+21、typecheck/lint、history Electron fixture、GUI smoke 与真实 CDP `thinking#6 -> text#314` 通过。原 related 1093/1094 的 completed Plan 唯一失败已由 S2m 关闭，当前 related app-server 1097/1097。 |
| S2m-conversation-import-plan-lifecycle | completed / focused-and-related-rust-validated / file-size-residual-closed-by-S2r | root | `.lime/refactor-v2/claims/S2m-conversation-import-plan-lifecycle-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2m-conversation-import-plan-lifecycle.md` + S2m/S2r evidence/handoffs | Codex `item_completed(Plan.id)` 是 completed Plan 的 authoritative Item/revision identity；presentation/canonical read 同为 `item-plan-1`，不再按 turn/event 合成第二 identity。focused 2/2、related app-server 1097/1097、rustfmt/diff 通过。原 1002 行 `events.rs` 已由 S2r 拆出 Plan 子模块并降至 921 行。 |
| S2n-conversation-import-message-lifecycle | completed / focused-related-rust-and-history-Gate-B-validated / ordinal-owner-superseded-by-S2u | root | `.lime/refactor-v2/claims/S2n-conversation-import-message-lifecycle-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2n-conversation-import-message-lifecycle.md` + S2n/S2u handoffs | Codex imported User/Agent Message 使用 source call ID / source event sequence 派生稳定 identity，并写入完整 `item.started` / presentation / `item.completed` lifecycle；`sourceEventSeq` 仅保留 provenance，canonical ordinal 后续已由 S2u 统一为首次 Lime outer EventLog sequence。focused 2/2、shared related app-server 1097/1097、rustfmt/diff 与 history Electron fixture 通过。 |
| S2o-runtime-message-reasoning-item-lifecycle | completed / focused-related-history-and-reasoning-Gate-B-validated / identity-superseded-by-S2o3 / released | root | `.lime/refactor-v2/claims/S2o-runtime-message-reasoning-item-lifecycle-root.md` + S2o2/S2o3 follow-up | S2o/S2o2/S2o3 evidence | provider text/reasoning Start/Delta/End 的 raw ID 经 canonical Turn + sampling attempt scope 后贯穿 Agent/App Server；Message parser 与 Reasoning accumulator 按 Item ID 隔离，Plan 仅记录 sourceItemId。S2o2 的 attempt-only identity 已由 S2o3 判为 dead；current provider Turn 11/11、related Rust 全绿与六工具 Gate B 通过。 |
| S2o3-provider-output-turn-identity | completed / related-Rust-and-AgentControl-managed-Gate-B-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s2o3-provider-output-turn-identity.md` | `provider:{turn_id}:{attempt}:{family}:{source_item_id}` 成为唯一 current output identity；同 raw ID 跨 Turn/attempt 不复用，Start/Delta/End 同源。related Rust：agent-runtime 117、App Server 1119、lime-agent 263、scheduler 24、server 111 全绿；fresh Gate B 15/15 assertions、六工具 completed。 |
| S2q-agent-session-canonical-presentation-boundary | completed / focused-typecheck-history-Gate-B-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S2q-agent-session-canonical-presentation-boundary-root.md` | S2q evidence/handoff | `agentSession/read` 保留为 ThreadStore-backed current presentation endpoint；无 detail Renderer fallback 已删除并反转测试，`AppServer::new()` 仅 test build。client 22/22、typecheck、history Electron fixture 与 GUI smoke 通过。 |
| S2r-import-plan-module-split | completed / focused-rust-and-line-guard-validated / released | root | `.lime/refactor-v2/claims/S2r-import-plan-module-split-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s2r-import-plan-module-split.md` + handoff | conversation import root 只保留 `item_completed` Plan-vs-Tool 分派；Plan ResponseItem/completed Item lowering 与 markdown helpers 迁入 specialized module，root `1002 -> 921` 行。Plan 24/24、App Server lib check、scoped rustfmt/diff 通过；协议、wire、GUI 与 shared S2o2 测试文件未改。 |
| S2s-canonical-agent-message-content-parts | completed / focused-and-media-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S2s-canonical-agent-message-content-parts-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s2s-canonical-agent-message-content-parts.md` + S2s/S2s1 handoffs | canonical AgentMessage typed Text/Media/reference parts 已贯穿 materializer、ThreadStore/read model、schema/generated client 与 live reader；agent-protocol 29、projection 39、read-model 47、canonical store 21、schema 1、client 63、reader 16、contracts 与 media Gate B 通过。后序 Content Factory `action_not_found` 已由 S7ad 关闭。 |
| S2t-app-data-session-fallback-removal | completed / focused-related-GUI-smoke-and-governance-validated / released | root | `.lime/refactor-v2/claims/S2t-app-data-session-fallback-removal-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s2t-app-data-session-fallback-removal.md` + handoff | app-data `AgentSessionReadResponse` hydration、session/thread identity/read fallback 与 681 行 `session_hydration.rs` 已物理删除；RuntimeCore + EventLog + ProjectionStore/ThreadStore 是 session read/resume 唯一 current owner，objective/session-file app-data 能力保持 current。focused 100/100、App Server 1118/1118、GUI smoke、legacy 0/0/0 与 scoped rustfmt/diff 通过。 |
| S2u-canonical-threadstore-ordinal-owner | completed / focused-related-and-import-live-continuation-validated / released | root | `.lime/refactor-v2/claims/S2u-canonical-threadstore-ordinal-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s2u-canonical-threadstore-ordinal-owner.md` + handoff | App Server canonical materializer 以首次 Lime outer `AgentEvent.sequence` 作为 Item ordinal 唯一事实源；后续 lifecycle merge 保留首次 ordinal，Tool/Message/Reasoning/Plan/import producer ordinal 与 Codex `sourceEventSeq` 不再进入持久化 ordering，ThreadStore 不做 `MAX+1` 重编号。projection 40/40、store 10/10、import 13/13 与 import 后 live continuation 1/1 通过。 |
| S2v-canonical-projection-fail-closed | completed / focused-external-sequence-and-app-server-validated / released | root | `.lime/refactor-v2/claims/S2v-canonical-projection-fail-closed-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s2v-canonical-projection-fail-closed.md` + handoff | EventLog-first 保持不变；普通 canonical ThreadStore apply 失败现在返回显式错误，不返回 notification、不推进内存 history，durable tail 留给 restart/repair 恢复。focused 1/1、external sequence 5/5、App Server 1118/1118 与 scoped rustfmt/diff 通过。 |
| S3 | production-canonical / provider-dual-algebra-deleted-forbidden-to-restore | provider-a -> root | S3f + S3g/S3h/S3i claims | S3f + `internal/research/refactor/v2/13-evidence/2026-07-15-s3-provider-dual-algebra-retirement.md` + S3g/S3h/S3i handoffs | provider stream、agent consumer 与 media request lowering 只走 canonical/current。runtime-core 旧 request/event algebra、event mapper/tests 与 model-provider generic old-request lowering 共净删 1561 行；8 个 pure-old 文件进入物理回流守卫，存活 lowering 禁止 `LlmRequest/ProviderWireRequest`。runtime-core 43、model-provider 126、media 51+9、client contract 288 通过。 |
| S3c | completed / environment-blocker-resolved-by-S3e-S3f | provider-consumer-a -> coordinator | `.lime/refactor-v2/claims/S3c-provider-consumer-a.md` | S3c handoff + S3e/S3f evidence | media consumer 已迁移；历史 ENOSPC 已由 S3e/S3f 的 media-runtime 50+51、route integration 9+9 与 model-provider 118 tests 关闭，不再是 current blocker。 |
| S3d | completed / stale-recovered-and-current-tree-validated | coordinator-s3d-recovery -> root | S3d provider client/cutover/recovery claims | S3d recovery handoffs + active-claim audit handoff | CurrentProviderEvent 投影已删除；既有 model-provider、App Server provider history/tool event 验证保持，fresh current-tree `provider_turn` 10/10 通过并覆盖 reasoning-only 无用户可见输出 fail closed。 |
| S3g-runtime-core-dual-algebra-retirement | completed / coordinator-recovered / runtime-core-validated / released | provider-runtime-core-cleanup -> root | `.lime/refactor-v2/claims/S3g-runtime-core-dual-algebra-retirement-provider-runtime-core-cleanup.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s3g-runtime-core-dual-algebra-retirement.md` + recovery handoff | runtime-core 旧 types/events/tests 与 crate exports 已物理删除；worker HTTP 400 后由 coordinator 基于完整 diff、停止变化与 43/43 shared tests 恢复收尾。 |
| S3h-model-provider-generic-lowering-retirement | completed / focused-and-shared-rust-validated / released | provider-lowering-cleanup | `.lime/refactor-v2/claims/S3h-model-provider-generic-lowering-retirement-provider-lowering-cleanup.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s3h-model-provider-generic-lowering-retirement.md` + handoff | 五个 generic old-request module 删除，四个存活 lowering 文件只保留 canonical media builder/options/error；model-provider 126、media 51+9 通过。 |
| S3i-provider-dual-algebra-retired-guard | completed / architecture-contract-validated / released | root | `.lime/refactor-v2/claims/S3i-provider-dual-algebra-retired-guard-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s3-provider-dual-algebra-retirement.md` + handoff | architecture provider 单代数口径已更新；8 个 dead path 与四个 old symbol 纳入 contract guard，App Server client contract 288、exact format/diff 通过。 |
| S4 | completed / canonical-tools-skills-MCP-AgentControl-and-visible-DOM-Gate-B-validated | coordinator -> root | S4a-S4al claims | S4a-S4al evidence，重点见 S4i2、S4l、S4aa、S4ad-S4al | RuntimeTool、canonical Tool Item、approval/restart、Skills、MCP sampling-step snapshot/live management/form elicitation、AgentGraph、durable mailbox、restart recovery、terminal Result 和 canonical SubAgent GUI 已收敛。S4ag/S4aj 让 spawn 与 warm followup 消费 effective target route；S4ah 证明六工具 runtime/DOM completed 与三类 activity 可见；S4ai 删除 synthetic Team fixture；S4al 再证明关闭并重启 Electron/App Server 后 Tool/SubAgent/child Thread identity 完全恢复，且首页 bundle 资源不再产生 `file:///home-covers` 缺失。S4ak 让 runtime MCP initialize 如实广告 `2025-06-18 + {"elicitation": {}}`，management 保持 absent，并以同 pid Gate B 关闭 capability 假绿。`agentSession/read` 是 ThreadStore-backed current presentation endpoint，不是 compat。 |
| S4a-tool-core | completed / production-consumer-closed-by-S4c | tool-core-a -> runtime-tools-production-a | `.lime/refactor-v2/claims/S4a-tool-core-tool-core-a.md` + `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | S4a/S4c evidence | canonical spec/executor/emitter/output contract 97 tests 通过；S4c 已接入 current provider 生产 caller，旧 AgentEvent/App Server raw mapper 与残余 backend/core stream DTO 已由 S4d-S4n 删除。 |
| S4b-display-items | completed / review-and-governance-corrected | coordinator | `.lime/refactor-v2/claims/S4b-display-items-coordinator.md` | S4b review/closeout evidence | Tool/MCP/Collab/Approval typed display DTO、schema/client 与 25 materializer tests 通过；ask-user resolved-without-decision 为 terminal + decision null + Turn Resolved。MCP server elicitation 是独立瞬时 reverse request，不投影为 Item；legacy report 边界违规为 0。 |
| S4c-tool-production-wiring | completed / coordinator-unit-and-downstream-Gate-B-validated / product-chain-closed-by-S4f-S4l-S4ae | runtime-tools-production-a -> coordinator | `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | S4c + S4f/S4l/S4ae evidence | current provider 已唯一走 RuntimeTool/ToolCall/Emitter/NormalizedOutput；缺 turn ID fail-closed，host-first 调度保证 canonical ItemStarted -> ActionRequired -> ItemCompleted。旧 wire DTO、backend mapper 与 core stream DTO 已由 S4d-S4n 删除，image/MCP/AgentControl 产品工具链 Gate B 已关闭原 tool-path pending。 |
| S4d-tool-wire-delete | completed / canonical-wire-and-deletion-validated | coordinator | `.lime/refactor-v2/claims/S4d-tool-wire-delete-coordinator.md` | S4d/S4e closeout evidence | host/backend/artifact/workspace patch 已切 canonical Item；nested materializer、lifecycle/sequence guard 已迁；旧 enum/orchestrator/emitter/batch 已物理删除并补回流守卫，workspace patch identity 8/8。 |
| S4e-canonical-tool-consumers | completed / canonical-only-read-projection-validated | coordinator | `.lime/refactor-v2/claims/S4e-canonical-tool-consumers-coordinator.md` | S4d/S4e + S4i evidence | provider history、nested output refs 与 thread/read-model tool projection 只消费 typed Tool Item；imported raw fallback、synthetic item、legacy merge/ID/conflict diagnostics 已删除并有 forbidden guard。projection 3/3、read model 27/27、contracts 通过，import producer 已由 S4i cutover。 |
| S4f-image-command-canonical-tool | completed / canonical-and-Gate-B-validated | s4d-readonly-review -> coordinator | `.lime/refactor-v2/claims/S4f-image-command-canonical-tool-s4d-readonly-review.md` | `20260712T180729Z-S4f-image-command-canonical-tool-s4d-readonly-review.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1c-image-domain-side-channel.md` | image command raw Tool lifecycle 清零；canonical Tool started/completed 同 identity 可投影，image task domain side-channel 进入既有 GUI 投影；图片命令、普通画图意图、terminal preview 与 reload restore Gate B 均通过 |
| S4g-current-tool-approval-identity | completed / coordinator-validated | s4g-approval-identity-a -> coordinator | `.lime/refactor-v2/claims/S4g-current-tool-approval-identity-s4g-approval-identity-a.md` | `20260712T181403Z-S4g-current-tool-approval-identity-coordinator.md` | typed call/turn + canonical thread identity 已替代 metadata 反推；tool-runtime 7/7、current provider 8/8、真实 approval resume 1/1 |
| S4h-delete-live-tool-args | completed / coordinator-validated | s4h-live-tool-args -> coordinator | `.lime/refactor-v2/claims/S4h-delete-live-tool-args-s4h-live-tool-args.md` | `20260713T050800Z-S4h-delete-live-tool-args-stale-recovered.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4h-live-tool-args-closeout.md` | live `tool.args` synthesis 已删除并纳入 EventStore retired guard；canonical sequence fixture 与 approval terminal backend 已修正；lifecycle 13/13、tool events 13/13、external events 4/4、sequence 6/6、approval terminal 1/1 |
| S4i-skills-metadata-policy | completed / typed-catalog-body-and-S4i2-Gate-B-validated | coordinator -> S4i2 | `.lime/refactor-v2/claims/S4i-skills-metadata-policy-coordinator.md` + S4i2 claim | S4i + S4i2 evidence/handoff | typed stable skillId/source/authority/scope/enabled/interface/dependencies/capabilities 已贯穿 snapshot、search、selection、App Server catalog、schema/client 与 Renderer；真实 `SKILL.md + references` 累计预算只注入 allow body，omitted/deny 有稳定 reason/evidence。此前 GUI “Provider 鉴权”已重分类为 retired raw Tool fixture，不是外部凭证 blocker；S4i2 canonical fixture Gate B 与 stable `skill/read` 已关闭当前链路。 |
| S4i2-skills-runtime-canonical-fixture-gate-b | completed / skills-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S4i2-skills-runtime-canonical-fixture-gate-b-root.md` + S4i3 guard claim | `internal/research/refactor/v2/13-evidence/2026-07-15-s4i2-skills-runtime-canonical-fixture-gate-b.md` + S4i2 handoff | Skills search/invocation fixture 已改发 canonical `item.started/item.completed` nested Tool Item；focused `57/57`、专用 Skills Gate B、GUI smoke、scripts governance 与格式/diff 均通过。natural、显式 `$skill`、workspace manual-enable 三入口的 search/Skill Tool 均 completed；后续 media-reference Gate B 已由 S2s/S4i4 通过，不回退 S4i2。 |
| S4i4-canonical-media-reference-fixture-lifecycle | completed / focused-and-media-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S4i4-canonical-media-reference-fixture-lifecycle-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s4i4-canonical-media-reference-fixture-lifecycle.md` + handoff | external media AgentMessage 使用稳定同 ID `item.started/item.completed` lifecycle；focused guard 55/55、governance:scripts 与真实 Electron media Gate B 通过，read model/media card/preview/reference/no-inline-payload 均有证据。 |
| S4i-stable-skill-read-id | completed / stable-id-current-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S4i-stable-skill-read-id-coordinator.md` | S4i stable-id evidence/handoff | default provider roots 保留 project/user/app scope；`skill/read` wire 只接受 stable `skillId`，catalog/read 共享 first-provider winner locator，name/path/scope guess 已删除。skills 66、protocol/schema、Rust/TS client、Renderer、contracts、GUI smoke 与 Electron stable-id roundtrip 全通过。 |
| S4i-conversation-import-tool-items | completed / canonical-wire-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S4i-conversation-import-tool-items-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s4i-conversation-import-tool-items.md` | Codex import 在 commit identity 边界 lower 为 canonical typed Tool lifecycle；raw import bypass、projection allowlist 和正向 compat fixture 已删除，read/write wire 均 fail-closed。conversation import 10/10、external canonical Tool 4/4、tool projection 4/4、read model 27/27、contracts 290 checks、typecheck 通过；home-hotpath Gate B 重跑通过。approval resume Gate B 在 `action.required` 前遭 fixture provider 鉴权失败，保留为环境 blocker。 |
| S4j-import-typed-draft | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4j-import-typed-draft-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T033127Z-S4j-import-typed-draft-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4j-import-typed-draft.md` | source-local raw Tool envelope 已删除；typed draft 覆盖 ResponseItem、specialized EventMsg 与 current paginated `item_completed(TurnItem)`，unknown completed Item 显式记为 unsupported/provenance-only。conversation import 48/48、canonical external Tool 4/4、contracts 290 checks、legacy governance boundary 0 通过；本 slice 不改变 GUI，Gate B 继承 S4i canonical wire evidence。 |
| S4j1-codex-import-tool-search-internal | completed / parser-and-import-focused-validated / released | root | `.lime/refactor-v2/claims/S4j1-codex-import-tool-search-internal-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s4j1-codex-import-tool-search-internal.md` + handoff | Codex `tool_search_call/output` 只保留在 provider/rollout history，不再 lower 为公开 canonical Tool Item，也不计入 imported Tool fidelity；function/custom/web/MCP import 保持不变。parser 1/1、conversation import 13/13 与 scoped rustfmt/diff 通过。 |
| S4k-evidence-canonical-tool-consumers | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4k-evidence-canonical-tool-consumers-coordinator.md` | S4k handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4k-evidence-canonical-tool-consumers.md` | provider history、context compaction、coding/Skills/MCP/browser evidence 与 snapshot artifact 只消费 canonical Tool Item；browser action index 已拆离 999 行热区。provider 6/6、compaction 3/3、evidence unit 8/8、export integration 5/5、browser split 1/1、App Server check、contracts 290 checks 与 legacy boundary 0 通过；本 slice 不改变 GUI wire，未重跑 Gate B。 |
| S4l-mcp-step-snapshot | completed / runtime-read-model-16-of-16 / visible-DOM-12-of-12-Gate-B-validated / released | coordinator -> root | S4l claims + `.lime/refactor-v2/claims/S4l-visible-dom-gate-b-s4l-visible-dom-gate-b.md` | S4l handoffs + `internal/research/refactor/v2/13-evidence/2026-07-15-s4l-visible-dom-gate-b.md` | per-sampling-step definitions/executor 与 caller-bound MCP route/handle 同 snapshot；unknown call fail closed，deferred selection Turn-local/next-step-only。独立 Electron run 已导航目标 session，证明 runtime/read model `16/16`、visible DOM `12/12`、new-Turn no-leak、`agentSession/read` electron-ipc、deferred Tool completed row、最终文本与零 invoke/console error。`tool_search` 按 Codex App Server 语义只保留在 provider/rollout history，不投影 public ThreadItem；focused `5/5`、Prettier/diff/scripts governance 与截图检查通过。 |
| S4m-canonical-tool-residuals | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4m-canonical-tool-residuals-coordinator.md` | S4m handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4m-canonical-tool-residuals.md` | `tool_end` 与 raw Tool lifecycle 全部入口拒绝；Tool/MCP/Collab 大输出 sidecar、restart hydration 与 completed+succeeded image media projection 只读 canonical Item。output 6/6、snapshots 6/6、external 4/4、thread projection 34/34、media 5/5、App Server check、contracts 290、governance catalog 199 与 legacy boundary 0 通过；触碰的四个超线生产文件均拆到 800 行以下，GUI wire 未变化。 |
| S4n-dead-backend-event-stream-surface | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4n-dead-backend-event-stream-surface-coordinator.md` | S4n handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4n-dead-backend-event-stream-surface.md` | zero-consumer `backend_event.rs`、App Server export 与 core `StreamEvent/ToolExecutionResult/StreamResult` 已物理删除并补路径/symbol 守卫；`TokenUsage` current consumers 保留。Rust/contract/governance 定向验证见 evidence；GUI wire 未变化。 |
| S4o-mcp-control-plane-step-snapshot-audit | completed / read-only-audit | coordinator | `.lime/refactor-v2/claims/S4o-mcp-control-plane-step-snapshot-audit-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T080102Z-S4o-mcp-control-plane-step-snapshot-audit.md` + S4o evidence | Resource/Prompt/status management owner、connection capability lifetime 与未实现的 server elicitation 已分类；resource/prompt identity 分拆为 S4p/S4q。 |
| S4o-mcp-control-plane-owner-split | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4o-mcp-control-plane-owner-split-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T094900Z-S4o-mcp-control-plane-owner-split-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4o-mcp-control-plane-owner-split.md` | tool-runtime bridge 已净减 caller-unaware dispatch 与 management APIs，只保留 same-step Tool snapshot/dispatch；tool-runtime 7、lime-mcp 114、lime-agent 10 与四 crate check 通过，contract/governance 见 evidence。 |
| S4p-mcp-resource-target-identity | completed / focused-contracts-current-smoke-and-GUI-validated | coordinator | `.lime/refactor-v2/claims/S4p-mcp-resource-target-identity-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T090851Z-S4p-mcp-resource-target-identity.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4p-mcp-resource-target-identity.md` | read/subscribe/unsubscribe 从 protocol 到 manager/native helper/GUI 全部使用 exact `(server, uri)`；同 URI 双 server backend/GUI 回归通过。manager 13、Rust client 2、tool-runtime 2、schema drift 1、Renderer 38、contracts 290、legacy governance、五 crate check、MCP current smoke 与 GUI smoke 通过；live provider 未配置且非本 slice 门禁。 |
| S4q-mcp-prompt-target-identity | completed / focused-and-current-fixture-validated | coordinator | `.lime/refactor-v2/claims/S4q-mcp-prompt-target-identity-coordinator.md` + `.lime/refactor-v2/claims/S4q-closeout-current-fixtures-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T095214Z-S4q-mcp-prompt-target-identity.md` + `.lime/refactor-v2/handoffs/20260713T101000Z-S4q-closeout-current-fixtures-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4q-mcp-prompt-target-identity.md` | Prompt get 从协议到 GUI 统一 exact `(server, name)`，跨连接扫描/前缀解析与迟到结果串目标已删除；manager 10、typed Rust 3、schema 1、Renderer 43、App Server processor 2、package client 62、contracts 290 与 legacy 0/0/0 通过。deterministic fixture 不实现 prompt get，不冒充 Gate B。 |
| S4s-mcp-sampling-capability-fail-closed | completed / coordinator-validated | s4s-sampling-cap-impl -> coordinator | `.lime/refactor-v2/claims/S4s-mcp-sampling-capability-fail-closed-s4s-sampling-cap-impl.md` | `.lime/refactor-v2/handoffs/20260713T101000Z-S4s-mcp-sampling-capability-fail-closed.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4s-mcp-sampling-capability-fail-closed.md` | 无 handler 的 sampling 正向广告已删除并补回流守卫；focused 1、lime-mcp 116、App Server check、contracts 290、legacy 0/0/0 与 rustfmt/diff 通过。GUI/protocol wire 未变。 |
| S4t-agent-graph-edge-persistence | completed / coordinator-validated / production-wiring-closed-by-S4v-S4ad | s4t-edge-store-impl -> coordinator | `.lime/refactor-v2/claims/S4t-agent-graph-edge-persistence-s4t-edge-store-impl.md` | S4t + S4v/S4ad evidence | Codex AgentGraphStore 已适配到 thread-store + ProjectionStore canonical SQLite；child unique parent、Open/Closed audit、stable BFS/reopen、transactional self/cycle rejection 已验证。AgentControl production caller 与 canonical SubAgent producer 已由 S4v/S4ad 接通。 |
| S4u-agent-mailbox-persistence | completed / durable-storage-and-production-consumer-closed-by-S4w-S4aa | coordinator | `.lime/refactor-v2/claims/S4u-agent-mailbox-persistence-coordinator.md` | S4u + S4w/S4aa evidence | `thread-store` contract 与 ProjectionStore 同 SQLite implementation 已建立；identity 双唯一、message-id idempotency/conflict、QueueOnly/TriggerTurn、FIFO、delivered audit/reopen 已验证。canonical Item append-before-ack、Turn trigger、wait/terminal activity 已由 S4w/S4aa 接通，无 legacy metadata/map/second queue。 |
| S4v-agent-control-production-wiring | completed / control-boundary-and-focused-test-validated | coordinator | `.lime/refactor-v2/claims/S4v-agent-control-production-wiring-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4v-agent-control-production-wiring.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-local-data-source-fixture-sync.md` | RuntimeCore 仅在 loaded parent 下通过 canonical `start_session` 创建 child，再写 Open edge；edge failure 会补偿删除 child session/Thread，close 仅接受 durable descendant 并保留 Closed audit，restart 无 legacy metadata fallback。rustfmt/diff、App Server library check 与 `agent_control` 6/6 通过。mailbox、gateway/tool、JSON-RPC、GUI、旧 Team 删除均不属于该 slice。 |
| S4r8-local-data-source-fixture-sync | completed / focused-validated | coordinator | `.lime/refactor-v2/claims/S4r8-local-data-source-fixture-sync-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-local-data-source-fixture-sync.md` | LocalAppDataSource fixture 与 production router field 已同步；trait implementation 显式 clone owner router，真实 stdio MCP resource fixture 1/1、S4u mailbox store 4/4、S4v agent control 6/6 与 App Server check 通过。macOS test worker stack 以仓库既有 `RUST_MIN_STACK=8388608` 口径运行；不新增 MCP runtime/router owner 或 mock。 |
| S4w-agent-mailbox-production-consumer | completed / focused-validated / product-chain-closed-by-S4ad-S4ah | coordinator | `.lime/refactor-v2/claims/S4w-agent-mailbox-production-consumer-coordinator.md` | S4w + S4ad/S4ah evidence | RuntimeCore 已消费 durable mailbox：message ID 派生 canonical Item，TriggerTurn deterministic，QueueOnly 在下一真实 turn 前投影；Item-before-ack 与 EventLog recovery 已验证。六工具、GUI、restart 与旧 Team 退出已由后续 AgentControl/canonical GUI slices 关闭。 |
| S4x-agent-control-tool-gateway | completed / focused-and-product-chain-closed-by-S4aa-S4ah | coordinator | `.lime/refactor-v2/claims/S4x-agent-control-tool-gateway-coordinator.md` | S4x + S4aa/S4ah evidence | 六个 V2 AgentControl 工具仅在 RuntimeCore per-turn gateway 存在时进入 current provider；wait terminal/steer 由 S4aa 关闭，真实 Electron/GUI visible-DOM Gate B 由 S4ah 关闭。 |
| S4y-dead-team-tool-surface | completed / focused-governance-and-current-product-chain-validated | root | `.lime/refactor-v2/claims/S4y-dead-team-tool-surface-root.md` | S4y + S4ae/S4ai evidence | `tool-runtime::collab_agent`、旧 Team catalog/prompt/discovery/native allowlist 已物理删除；current 六工具与 canonical GUI 已接管，synthetic Team fixture 已由 S4ai 删除。 |
| S4ab-legacy-collab-projection-boundary | completed / package-contract-governance-and-S4ae-S4ah-product-chain-validated | root | `.lime/refactor-v2/claims/S4ab-legacy-collab-projection-boundary-root.md` | S4ab + S4ae/S4ah evidence | 六个 AgentControl V2 名称是唯一 current projection taxonomy；四个裸 V1 alias 为 `dead`，历史 Rust operation/activity 只读。canonical GUI 与 visible-DOM Gate B 已关闭原产品链缺口。 |
| S4z-agent-control-restart-on-demand | completed / focused-App-Server-and-product-chain-closed-by-S4aa-S4ah | root | `.lime/refactor-v2/claims/S4z-agent-control-restart-on-demand-root.md` | S4z + S4aa/S4ah evidence | 新 RuntimeCore 只 hydrate root；QueueOnly 不加载 child，followup/interrupt 精确 hydrate target，Closed edge 不可寻址且不 reopen。restart terminal activity 与真实 GUI Gate B 已由 S4aa/S4ah 关闭。 |
| S4aa-agent-terminal-mailbox-activity | completed / focused-Rust-App-Server-and-product-chain-closed-by-S4ad-S4ah | root | `.lime/refactor-v2/claims/S4aa-agent-terminal-mailbox-activity-root.md` | S4aa + S4ad/S4ah evidence | direct-parent completed/failed Result、assistant Item/mailbox metadata、EventLog recovery、steer priority、deadline recovery 与 CAS/dedupe 已完成；targeted producer、六工具与 visible-DOM Gate B 已关闭原 JSON-RPC/Multi-Agent pending。 |
| S4ac-wait-agent-canonical-item | completed / focused-and-lime-agent-validated / targeted-SubAgent-producer-ready | root | `.lime/refactor-v2/claims/S4ac-wait-agent-canonical-item-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ac-wait-agent-canonical-item.md` | `wait_agent` canonical lifecycle 复用既有 `CollabAgentToolCall::Wait`，Started/Completed identity/ordinal 与 terminal output 保真；focused 1、protocol 19、current provider 13、lime-agent check、rustfmt/diff 通过。S4aa 已释放 gateway，S4ad 可用真实 target ThreadId 产 SubAgent；list 保持 generic Tool。 |
| S4ad-targeted-subagent-producer | completed / focused-Rust-schema-and-S4ae-Gate-B-validated | root | released | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ad-targeted-subagent-producer.md` + S4ae evidence | gateway 成功结果携带真实 resolved ThreadId 的 typed internal fact；current provider 保留普通 Tool 并追加 distinct completed SubAgent Item。fact 不进入模型或 Tool metadata；失败、错配、wait/list 零 activity。S4ae 已将临时十值 contract 收口为 Codex 三值，并用六工具 managed Gate B 关闭 GUI/产品链验证。七旧值无兼容约束，禁止恢复。 |
| S4ae-canonical-subagent-gui | completed / focused-GUI-Rust-governance-and-AgentControl-managed-Gate-B-validated | root | released | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ae-canonical-subagent-gui.md` | canonical SubAgent cold/live GUI、三值 activity、后台 child admission、显式 parent runtime request 继承与 Turn-scoped provider output identity 已收口；六工具 managed Gate B `status=pass`、15 assertions 全真、六项 completed。旧 Team current 文档、compat inventory evidence、synthetic sidecar 与七旧值均已删除/禁止回流；当时登记的 effective route、warm followup route 与 visible DOM 缺口已由 S4ag/S4aj/S4ah 关闭。 |
| S4af-codex-subagent-import-fidelity | completed / focused-and-App-Server-validated / registered-by-S7ah | root | `.lime/refactor-v2/claims/S4af-codex-subagent-import-fidelity-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4af-codex-subagent-import-fidelity.md` + S4af handoff | imported Codex SubAgent activity 保留 Started/Interacted/Interrupted exact kind，status labels 只作 presentation；focused 1+1、App Server check 与 scoped format/diff 通过。实现早于 S4ae 释放完成，本行补齐当时明确延期的中央计划登记。 |
| S4ag-effective-child-route | completed / focused-App-Server-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s4ag-effective-child-route.md` | RuntimeBackend 复用既有 selection/reasoning/turn-policy/workspace/search 解析，回写唯一 `StoredSession.turn_runtime_options` 后再构造 gateway；child 不复制 session metadata 或 parent-only output contract。focused 2/2、AgentControl 14/14。 |
| S4ah-agent-control-visible-dom-gate-b | completed / focused-Rust-Renderer-and-Electron-Gate-B-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s4ah-agent-control-visible-dom-gate-b.md` | 删除 smoke 从 SubAgent status 反推 Tool 的 compat 逻辑；`wait_agent` read presentation 修为普通 Tool。真实 Electron Gate B 28/28，六个 typed Tool row completed/visible，Started/Interacted/Interrupted activity 可见，`agentSession/read=electron-ipc`，console/invoke error 0。 |
| S4ai-dead-synthetic-team-fixture | completed / deleted-forbidden-to-restore / focused-governance-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s4ai-dead-synthetic-team-fixture.md` | `multi-agent-team-fixture-scenario.mjs` 与 15 个脚本 consumer 已物理删除/迁出；路线图和 Project/Thread 执行记录改用 canonical AgentControl evidence。净删 707 行，fixture 54/54、regression 16/16 与 scripts governance 通过。 |
| S4aj-followup-target-route | completed / focused-library-and-Electron-Gate-B-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s4aj-followup-target-route.md` | warm followup 优先 target 最近 effective Turn options；仅 cold/unloaded target 使用 caller effective snapshot。focused 1/1、AgentControl 15/15、App Server check、exact rustfmt/diff 与同代码状态 S4ah Electron Gate B 28/28 通过。 |
| S4al-agent-control-cold-restart-visible-dom | completed / focused-asset-unit-renderer-build-and-Electron-Gate-B-validated / released | root | released | `internal/research/refactor/v2/13-evidence/2026-07-15-s4al-agent-control-cold-restart-visible-dom.md` | managed Gate B 显式关闭 Electron/App Server 后重启，PID `8923 -> 9920`；六 Tool、SubAgent activity、child Thread identity 前后稳定，`agentSession/read`/`thread/list` 为 electron-ipc，console/invoke 0。同步删除重复 JPG 与 `/home-covers` file-root 假设，保留 WebP bundle owner；9/9 unit、renderer build 和 diff/format 通过。 |
| S4r1-mcp-elicitation-router | completed / coordinator-validated / product-chain-closed-by-S4r9-S4ak | s4r-router-impl -> coordinator | `.lime/refactor-v2/claims/S4r1-mcp-elicitation-router-s4r-router-impl.md` | S4r1 + S4r9/S4ak evidence | manager-shared opaque exact router、bounded single consumer、closed token、cancel cleanup、typed form schema validation 与 RMCP duplex 已完成；runtime-only capability advertisement 和真实 Electron product chain 已由 S4ak 关闭。 |
| S4r2-app-server-reverse-jsonrpc | completed / correctness-and-product-chain-validated | coordinator | `.lime/refactor-v2/claims/S4r2-app-server-reverse-jsonrpc-coordinator.md` + `.lime/refactor-v2/claims/S4r2b-reverse-jsonrpc-correctness-coordinator.md` | S4r2/S4r2b + S4r9/S4ak evidence | boot-scope exact id、abort cleanup、ambiguous-client fail closed、settled replay suppression 与 typed reverse request/resolved 已完成；S4ak Gate B 证明真实 Electron/App Server/runtime/Renderer form 闭环。 |
| S4r8-mcp-runtime-thread-owner | completed / owner-lifecycle-and-S4r9-S4ak-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S4r8-mcp-runtime-thread-owner-coordinator.md` | S4r8/S4r9/S4ak evidence | `AgentRuntimeState[sessionId] -> McpThreadRuntime` 绑定 immutable thread 与独立 RMCP generation；management 只提供 typed specs 且 nested elicitation fail closed。S4r9 关闭 per-server fault isolation，S4ak 证明 runtime `2025-06-18 + elicitation {}` 与 management absent 的同 pid Gate B。 |
| S4r9-mcp-runtime-server-fault-isolation | completed / focused-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S4r9-mcp-runtime-server-fault-isolation-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-gate-b-runtime-server-failure.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r9-mcp-runtime-server-fault-isolation.md` | `McpThreadRuntime` 现在并发启动 typed enabled specs；optional failure 被记录并从 snapshot 排除，required failure 只关闭候选 manager、拒绝 replacement 并保留旧 generation。真实保留故障默认 Playwright MCP 的 Electron Gate B 已获得 provider 2 requests、Renderer form accept、resolved close 和 final text；无 legacy command/console error。 |
| S4ak-mcp-elicitation-capability-advertisement | completed / focused-full-Rust-static-and-Electron-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S4ak-mcp-elicitation-capability-advertisement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s4ak-mcp-elicitation-capability-advertisement.md` | runtime client 广告 `2025-06-18 + {"elicitation": {}}`，management/router-only client 保持 `2025-03-26` + absent；Gate B 同 pid 绑定 initialize/accept，management pid 独立且 `capabilityMissingCount=0`。lime-mcp 140/140、static 4/4、Electron Gate B 与 scripts/legacy governance 通过。 |
| S4-approval-restart-production | completed / focused-and-approval-Gate-B-validated | coordinator -> root | `.lime/refactor-v2/claims/S4e-approval-restart-production-coordinator.md` | S4e evidence/handoff + resolved-blocker audit handoff | RuntimeCore 直接从 StoredSession current event 恢复 type/scope/descriptor；restart reopen、not-resumable、cancel waiter、terminal reason 与 processor error.data 均通过。S4h raw fixture 已关闭；真实 Electron 证据覆盖 resume 内 `allow_for_session -> action.resolved`、decline、cancel 与 fresh cancel closeout。Skills Provider 鉴权仍是独立 aggregate residual，不再归为 S4e blocker。 |
| S5 | refinement-active / canonical-read-control-and-type-retirement-validated / workspace-structure-exit-pending | coordinator | `.lime/refactor-v2/claims/S5-coordinator.md` + S5 current-owner migration/S5ag claims | S5 canonical read evidence + S5g-S5ag evidence/handoffs | canonical read/control、root/type retirement 已收敛；completion audit 复核发现 `AgentChatWorkspace.tsx` 仍为 2603 行，且 S5b handoff 明确登记 `<800` 未完成。S5ag 起继续拆 command/task-center/workbench composition；不得用后续 Gate B 替代结构退出条件。 |
| S5a | completed / host-capability-and-S5-Gate-B-validated | gui-s5a-host-capabilities | `.lime/refactor-v2/claims/S5a-host-capabilities-gui-s5a-host-capabilities.md` | S5a + S5 canonical read evidence | typed host facade 通过 unit/focused/related tests 与 ESLint，最终 GUI Gate B 已由 S5 canonical read/control product chain 关闭。 |
| S5c-canonical-read-consumer | completed / focused-contracts-and-Gate-B-validated | gui-s5-canonical-read -> coordinator | `.lime/refactor-v2/claims/S5c-canonical-read-consumer-gui-s5-canonical-read.md` | `20260712T162548Z-S5c-canonical-read-consumer-minimal-audit.md` + `20260712T200156Z-S5c-canonical-read-consumer.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | package/Renderer queue control 只读 canonical `thread/read` narrow projection；queued promotion Gate B 解析唯一 active Turn，并完成 promote、真实 cancel、resume 与 reload queue restore；focused 77 tests、typecheck、contracts 289 checks 通过 |
| S5d-plugin-canonical-thread-read | completed / coordinator-fresh-reviewed / focused-typecheck-and-contracts-validated / released | plugin-canonical-thread -> coordinator -> root | `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-plugin-canonical-thread.md` + `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-coordinator.md` | `20260713T041500Z-S5d-plugin-canonical-thread-read.md` + `.lime/refactor-v2/handoffs/20260715T074247Z-S5d-plugin-canonical-thread-read-review-closeout-root.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | canonical threadId 已贯穿 start/get/cancel/reload；缺失、冲突、错误 identity、queued/terminal/multiple-active 全部 fail closed；fresh Plugin focused 26/26、typecheck、700 protocol types、288 client checks 与完整 contracts 通过，静态守卫只接受 canonical Thread/Item。 |
| S5e-terminal-queue-history | completed / focused-and-unified-Gate-B-validated | canonical-terminal-queue | `.lime/refactor-v2/claims/S5e-terminal-queue-history-canonical-terminal-queue.md` | `20260712T202403Z-S5e-terminal-queue-history.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | terminal Turn 可保留 historical Running/NotQueued 且 activeTurnId 为 null；terminal+Queued 仍 fail closed；projection + adapter + flow 与同一 Electron queued promotion Gate B 通过 |
| S5f-active-stream-queue-intent | completed / focused-contracts-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S5f-active-stream-queue-intent-coordinator.md` | `20260712T215632Z-S5f-active-stream-queue-intent.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | 同会话真实 active turn 强制 queue intent；queued listener 不覆盖 active binding，accepted 后立即 canonical hydrate；Gate B 约 5 秒完成且 backend ledger 真实 cancel，focused 77 tests、typecheck、contracts 与 GUI smoke 通过 |
| S5g-managed-objective-current-owner-migration | completed / focused-32-tests-eslint-typecheck-governance-validated | managed-objective-current-owner | `.lime/refactor-v2/claims/S5g-managed-objective-current-owner-migration-managed-objective-current-owner.md` | S5g evidence + handoff | Managed Objective 类型已直连 `sessionTypes`，行为与 mocks 已直连 `objectiveClient`；focused 32/32、ESLint、typecheck、legacy 0/0/0 与 diff check 通过，无 blocker。 |
| S5h-execution-runtime-type-only | completed / focused-eslint-typecheck-governance-validated / released | s5-execution-type-only | `.lime/refactor-v2/claims/S5h-execution-runtime-type-only-s5-execution-type-only.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5h-execution-runtime-type-only.md` + handoff | 两个 execution runtime type-only production consumer 已直连 `agentExecutionRuntime`，boundary guard 防止 root compat import 回流；本切片精确净减 2，focused 1/1、ESLint、Prettier、typecheck、legacy 0/0/0 与 diff check 通过。 |
| S5-session-types-root-barrel-residual | completed / focused-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S5-session-types-root-barrel-residual-root.md` | evidence + handoff | history、Task Rail、Harness 三个 production consumer 直连 `sessionTypes`；focused 23/23、typecheck、ESLint、legacy 0/0/0 与 diff check 通过。 |
| S5-session-types-status-surface-residual | completed / focused-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S5-session-types-status-surface-residual-root.md` | evidence + handoff | 五个 status/timeline/projection consumer 直连 `sessionTypes` 与 `queuedTurn`；focused 29/29、typecheck、lint/format、legacy 0/0/0 与 diff check 通过。 |
| S5-components-current-owner-clean-remainder | completed / focused-typecheck-and-governance-validated / released | s5-components-current-owner | `.lime/refactor-v2/claims/S5-components-current-owner-clean-remainder-s5-components-current-owner.md` | evidence + handoff | 三个 component type consumer 直连 current owner；focused 79/79、lint/format、typecheck、legacy 0/0/0、root import 0 与 diff check 通过。 |
| S5-session-hooks-current-owner-migration | completed / focused-import-boundary-validated / released | root-session-hooks-current-owner | `.lime/refactor-v2/claims/S5-session-hooks-current-owner-migration-root.md` | evidence + handoff | 四个 session hook consumer 拆到 client/request/session/queued/execution/protocol owner；6 files / 66 tests、lint/format、typecheck、root scan 与 diff check 通过。 |
| S5-workspace-current-owner-clean-remainder | completed / focused-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S5-workspace-current-owner-clean-remainder-root.md` | evidence + handoff | 五个 Workspace consumer 的六处 root specifier 已迁到 session/execution/thread/protocol current owner；focused、lint/format、typecheck、legacy 0/0/0 与 diff check 通过。 |
| S5i-root-barrel-dynamic-type-residual | completed / focused-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S5i-root-barrel-dynamic-type-residual-root.md` | S5i evidence + handoff | 最后三处 dynamic root type query 已删除，guard 同时封住 static/dynamic exact root specifier；focused 30/30、lint/format、typecheck、legacy 0/0/0 与 diff check 通过，`src/**` production root consumer 为 0。 |
| S5j-history-test-session-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5j-history-test-session-type-owner-root.md` | S5j evidence + handoff | 三个 history tests 的 `AgentSessionDetail` 已直连 `sessionTypes`；focused 23/23、lint/format、typecheck、root scan 与 diff check 通过，test consumer 净减 3。 |
| S5k-session-detail-test-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5k-session-detail-test-owner-root.md` | S5k evidence + handoff | 五个 session/history tests 的 `AgentSessionDetail` 已直连 `sessionTypes`；focused 52/52、lint/format、typecheck、root scan 与 diff check 通过，test consumer 净减 5。 |
| S5l-session-presentation-test-owner | completed / focused-typecheck-validated / released | s5l-session-presentation-tests | `.lime/refactor-v2/claims/S5l-session-presentation-test-owner-s5l-session-presentation-tests.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5l-session-presentation-test-owner.md` + handoff | 三个 presentation tests 已直连 `sessionTypes`；focused 38/38、lint/format、typecheck、root scan 与 diff check 通过。 |
| S5m-history-state-test-owner | completed / coordinator-recovered-focused-validated / released | s5m_history_state_tests -> root | `.lime/refactor-v2/claims/S5m-history-state-test-owner-s5m_history_state_tests.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5m-history-state-test-owner.md` + handoff | 五个 history/state tests 已直连 `sessionTypes`；focused 41/41、lint/format、root scan 与 diff check 通过，shared typecheck 由 S5q 统一完成。 |
| S5n-read-checkpoint-test-owner | completed / focused-typecheck-and-governance-validated / released | s5n-read-checkpoint-tests | `.lime/refactor-v2/claims/S5n-read-checkpoint-test-owner-s5n-read-checkpoint-tests.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5n-read-checkpoint-test-owner.md` + handoff | timeline/read-checkpoint tests 已直连 `sessionTypes`；focused 60/60、lint/format、typecheck、legacy 0/0/0 与 diff check 通过。 |
| S5o-prepared-send-test-owner | completed / focused-and-shared-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5o-prepared-send-test-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5o-prepared-send-test-owner.md` + handoff | 四个 prepared-send tests 已直连 `agentExecutionRuntime` / `queuedTurn`；focused 12/12、lint/format、root scan 与 diff check 通过。 |
| S5p-event-binding-test-owner | completed / focused-and-shared-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5p-event-binding-test-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5p-event-binding-test-owner.md` + handoff | 三个 event-binding tests 已拆到 session/execution/queue current owners；focused 27/27、lint/format、root scan 与 diff check 通过，static test root consumer 归零。 |
| S5-client-factory-test-mock-owner | completed / coordinator-recovered-focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5-client-factory-test-mock-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5-client-factory-test-mock-owner.md` + handoff | 两个 test mocks 已直连 `clientFactory`，boundary guard 禁止 root mock 回流；focused 204/204、lint/format、typecheck 与 diff check 通过。 |
| S5q-root-barrel-retirement | completed / focused-typecheck-client-contract-governance-validated / released | root -> coordinator recovery | `.lime/refactor-v2/claims/S5q-root-barrel-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5q-root-barrel-retirement.md` + handoff | 四个 root aggregate 文件已物理删除，真实 static/dynamic/mock consumer 为 0，retired shell guard 禁止恢复；focused 125/125 + 204/204、typecheck、client contract 288、legacy 0/0/0 与 docs boundary 通过。完整 contracts 后续只被独立 active i18n modality guard 阻断。 |
| S5s-automation-managed-objective-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5s-automation-managed-objective-type-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5s-automation-managed-objective-type-owner.md` + handoff | 五个 Automation consumers 已直连 `sessionTypes`；focused 6/6、lint/format、typecheck、compat scan 与 diff check 通过。 |
| S5t-plugin-respond-request-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5t-plugin-respond-request-type-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5t-plugin-respond-request-type-owner.md` + handoff | 两个 Plugin consumers 已直连 `requestTypes`；focused 18/18、lint/format、typecheck、compat scan 与 diff check 通过。 |
| S5u-experts-type-owner | completed / focused-and-shared-typecheck-validated / released | s5u-experts-type-owner | `.lime/refactor-v2/claims/S5u-experts-type-owner-s5u-experts-type-owner.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5u-experts-type-owner.md` + handoff | 六个 Experts consumers 已直连 `toolInventoryTypes` / `evidenceTypes`；focused 27/27、lint/format、compat scan、shared typecheck 与 diff check 通过。 |
| S5v-evidence-normalizer-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5v-evidence-normalizer-type-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5v-evidence-normalizer-type-owner.md` + handoff | 六个 evidence projection/normalizer modules 已直连 `evidenceTypes`；focused 16/16、lint/format、typecheck、compat scan 与 diff check 通过。 |
| S5w-workspace-skill-binding-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5w-workspace-skill-binding-type-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5w-workspace-skill-binding-type-owner.md` + handoff | 三个 clean Workspace consumers 已直连 `toolInventoryTypes`；focused 25/25、lint/format、typecheck、compat scan 与 diff check 通过；脏的 `useWorkspaceSendActions.ts` 继续避让。 |
| S5x-agent-client-type-owner | completed / focused-typecheck-validated / released | root | `.lime/refactor-v2/claims/S5x-agent-client-type-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5x-agent-client-type-owner.md` + handoff | 两个内部 Agent client consumers 已直连 `sessionTypes` / `agentExecutionRuntime`；focused 4/4、lint/format、typecheck、compat scan 与 diff check 通过。 |
| S5y-session-read-types-owner | completed / focused-and-shared-gates-validated / released | s5y_session_read_types_owner | `.lime/refactor-v2/claims/S5y-session-read-types-owner-s5y_session_read_types_owner.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5y-session-read-types-owner.md` + handoff | 九个 session/read client/projector/test consumers 已直连 session/request/execution owners；focused 88/88、lint/format、compat scan、shared typecheck 与完整 contracts 通过。 |
| S5z-declaration-types-owner | completed / declaration-boundary-and-shared-gates-validated / released | s5z-declaration-types-owner | `.lime/refactor-v2/claims/S5z-declaration-types-owner-s5z-declaration-types-owner.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5z-declaration-types-owner.md` + handoff | 九个手写 declaration consumers 已拆到 session/request/evidence/tool/execution 与 app-server-client owner；format、no-ignore lint、compat scan、shared typecheck 与完整 contracts 通过。 |
| S5aa-protocol-media-types-owner | completed / focused-typecheck-full-contracts-validated / released | root | `.lime/refactor-v2/claims/S5aa-protocol-media-types-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5aa-protocol-media-types-owner.md` + handoff | 三个 protocol/media consumers 已直连 execution/session/media/package owners；focused 39/39、lint/format、typecheck 与完整 contracts 通过。 |
| S5ab-workspace-article-request-types-owner | completed / focused-typecheck-full-contracts-validated / released | root | `.lime/refactor-v2/claims/S5ab-workspace-article-request-types-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5ab-workspace-article-request-types-owner.md` + handoff | 三个 Workspace request consumers 已直连 `requestTypes`；focused 46/46、lint/format、typecheck 与完整 contracts 通过。 |
| S5ac-inventory-export-types-owner | completed / focused-typecheck-full-contracts-validated / released | root | `.lime/refactor-v2/claims/S5ac-inventory-export-types-owner-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5ac-inventory-export-types-owner.md` + handoff | inventory/export clients 已直连 tool/evidence owners；focused 17/17、lint/format、typecheck 与完整 contracts 通过。 |
| S5ad-workspace-skill-binding-type-residual | completed / focused-typecheck-full-contracts-validated / released | root | `.lime/refactor-v2/claims/S5ad-workspace-skill-binding-type-residual-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5ad-workspace-skill-binding-type-residual.md` + handoff | 最后一个 GUI skill-binding compat consumer 已直连 `toolInventoryTypes`；focused 159/159、lint/format、typecheck 与完整 contracts 通过。 |
| S5ae-types-barrel-retirement | completed / deleted-forbidden-to-restore / typecheck-full-contracts-validated / released | root | `.lime/refactor-v2/claims/S5ae-types-barrel-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s5ae-types-barrel-retirement.md` + handoff | `types.ts` 35 行 facade 与 `types.d.ts` 2026 行手写镜像已删除；session roster 不再读镜像，ESLint recommendation 已反转，两路径进入 physical guard。真实 consumer 0，boundary 4/4、typecheck、client contract 288、legacy 0/0/0 与完整 contracts 通过。 |
| S5ag-workspace-command-wiring | active / narrow-structural-extraction | root | `.lime/refactor-v2/claims/S5ag-workspace-command-wiring-root.md` | pending | 从 S5b 的明确 remaining exit list 继续：把 command/task-center/workbench composition 迁入两个 `<800` 行 owner，主 Workspace 先降到 `<2100` 并补负向回流 guard；行为、协议、runtime truth 与 GUI 层级不变。 |
| S6 | completed / raw-sidechain-and-legacy-roster-contract-deleted / production-reader-zero-retired-key / canonical-GUI-and-export-validated | refactor-v2-coordinator -> root | S6a-S6v narrow claims | S6a-S6v handoffs/evidence | runtime 与 Renderer Team sidecar、专用 status/stream channel、raw parser/type/projector/package/fixture、legacy child/sibling/parent session roster DTO/state/normalizer/fallback 已迁出并受回流守卫保护；S6v 进一步删除两个 production read sanitizer、正向旧 payload fixture 与允许规则。canonical child roster/navigation/Harness/Task Rail/Inputbar、canonical parent identity、AgentGraph export stats 和 Gate B/GUI smoke 已完成。 |
| S6a-thread-store-dead | completed / coordinator-validated | thread-store-dead-a -> coordinator | `.lime/refactor-v2/claims/S6a-thread-store-dead-thread-store-dead-a.md` | `20260712T124908Z-S6a-thread-store-dead-thread-store-dead-a.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s6a-thread-store-dead.md` | 六个零 crate 外 consumer 的 transcript/search/runtime-store/insight 模块及内嵌正向测试共 1923 行已删除，八个旧路径纳入 forbidden-to-restore 守卫；三个反向依赖 check 与 coordinator 定向复核通过 |
| S6b-dead-default-playwright-mcp-seed | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6b-dead-default-playwright-mcp-seed-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6b-dead-default-playwright-mcp-seed.md` + S6b handoff | `migration_v3`、module export 与 startup dispatch 已删除；fresh database regression 证明不再写默认 Playwright MCP。旧 npm package、migration marker 与调用已纳入 `dead` guard；用户显式配置的 MCP 不迁移、不删除、不改名。`lime-core` 全量、related Rust、治理目录册、legacy report、rustfmt/diff 全部通过；GUI/bridge wire 未变化，Gate B 不适用。 |
| S6c-dead-agent-session-store | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6c-dead-agent-session-store-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6c-dead-agent-session-store.md` + S6c handoff | `session_store`、12 个 sibling、`session_state_snapshot` 与 crate-root CRUD/read/DTO export 共 4182 行已删除；App Server RuntimeCore -> ThreadStore/ProjectionStore 保持唯一 session owner。`lime-agent` 265/265、`app-server`/`lime-scheduler`/`lime-server` check、目录册 200、删除路径守卫和 legacy report 0/0/0 通过；GUI/bridge wire 未变化，Gate B 不适用。 |
| S6e-dead-rust-execution-strategy-compat | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6e-dead-rust-execution-strategy-compat-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6e-dead-rust-execution-strategy-compat.md` | 无 caller 的 Rust `execution_strategy_compat` module/normalizer 已删除并受 dead guard 保护；React typed request/lowering 保持 current，仍有三个 renderer consumer 的 TypeScript compat helper 未混删。 |
| S6f-dead-agent-subagent-sidecars | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6f-dead-agent-subagent-sidecars-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6f-dead-agent-subagent-sidecars.md` | 无 caller 的 local subagent control/profile sidecar、旧 extension 与专属 DTO 已删除；App Server canonical graph/mailbox 与 `agent-runtime/session_execution` 保持唯一 current owner。 |
| S6g-dead-agent-runtime-aggregate | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6g-dead-agent-runtime-aggregate-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6g-dead-agent-runtime-aggregate.md` | 无 caller aggregate execution runtime builder、metadata parser、permission fallback 与专属 DTO 已删除；`AgentEvent` task/routing/limit/cost DTO 及 App Server read-model projection 保持 current。 |
| S6h-dead-agent-runtime-session-query | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6h-dead-agent-runtime-session-query-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6h-dead-agent-runtime-session-query.md` | direct `agent_sessions` execution-runtime query、module、alias/re-export 已删除；App Server `session_metadata` read model 与 `agent-runtime` generic projection 是唯一 current owner，`lime-agent` 259/259、反向依赖 compile、215 governance tests 和 legacy report 0/0/0 通过。 |
| S6i-dead-team-formation-preview | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6i-dead-team-formation-preview-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6i-dead-team-formation-preview.md` | 输入长度/正则 + selected Team 的本地 formation、虚拟 member AgentUI event、`runtime-team-dispatch:*` 伪消息、send preview state 与 layout preview flag 已删除；发送不再等待或记录 Renderer 组队结果。focused 188、typecheck、legacy report 0/0/0、diff guard 与 GUI smoke 通过；canonical child Thread/Item GUI 未删除。 |
| S6j-dead-team-runtime-sidecar | completed / S6k-S6l-followup-validated | root | `.lime/refactor-v2/claims/S6j-dead-team-runtime-sidecar-root.md` | S6j/S6k/S6l evidence | 第二 Team runtime 与 dead i18n 已删除；follow-up 发现的 project-thread ENOENT 和 ThreadId 直传 session bug 已由 S6k/S6l 修复并补 Gate。 |
| S6k-canonical-child-roster | completed / focused-Rust-contracts-validated | root | `.lime/refactor-v2/claims/S6k-canonical-child-roster-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6k-canonical-child-roster.md` + S6k handoff | App Server canonical read/list join AgentGraph/Identity；selector/hook/Harness 只读 canonical child roster/status，保留 threadId/sessionId 和 notFound。Rust 精确 4、app-server check、unified focused 91、typecheck、contracts 290 与 GUI smoke 通过；当时 synthetic Team run 不再计产品 Gate，canonical Gate 由 S4ah 补齐。 |
| S6l-thread-first-subagent-navigation-guards | completed / focused-contracts-governance-validated | root | `.lime/refactor-v2/claims/S6l-thread-first-subagent-navigation-guards-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6l-thread-first-subagent-navigation-guards.md` + S6l handoff | canonical roster sessionId 优先，缺失时 `thread/read(notLoaded)` 严格解析；project-thread/dead/i18n/scenario/docs 已收口。unified focused 91、stop 1、typecheck、contracts 290、i18n/legacy 与 GUI smoke 通过；当时 synthetic Team run 已撤销为产品 Gate。 |
| S6m-raw-subagent-channel-retirement | completed / focused-typecheck-contract-core-governance-and-current-fixture-validated | third-worker -> root | S6m third-worker + continuation claims | S6m partial + continuation handoffs/evidence | status/stream 专用 channel、listener API、adapter alias、sync effect 与 DevBridge truth policy 已删除，stale adapter fixture 清理并补 negative guard。continuation focused 25/25、typecheck、legacy 0/0/0，contracts 290 与主体 gate 通过；最终 docs boundary 只被并行 release plan 阻断。current aggregate 通过此前全部场景后在 Inputbar pending-steer 首跑超时，精确 Electron 场景复跑通过。 |
| S6n1-raw-subagent-status-parser-retirement | completed / focused-typecheck-validated | root | `.lime/refactor-v2/claims/S6n1-raw-subagent-status-parser-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6n1-raw-subagent-status-parser-retirement.md` + S6n1 handoff | `parseAgentEvent` 对 raw status fail closed，Agent UI dispatcher 不再投影；精确 2/2、dispatcher 全量 22/22、typecheck/diff 通过。完整 agentProtocol 的 1 个 action request id fixture 漂移与本切片无关。 |
| S6n-raw-subagent-type-package-fixture-retirement | completed / focused-typecheck-i18n-governance-contract-core-validated | root | `.lime/refactor-v2/claims/S6n-raw-subagent-type-package-fixture-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6n-raw-subagent-type-package-fixture-retirement.md` + S6n handoff | raw status local/package projector、TS type、barrel/helper、runtime facts、summary/i18n/fixture 正向口径已物理删除；package 295/295、focused 136/137（唯一失败为既有 action request id 漂移）、guards 16/16、typecheck、i18n、legacy 0/0/0 与 GUI smoke 通过。当时 synthetic Team run 已撤销为产品 Gate。 |
| S6o-legacy-subagent-roster-dto-retirement | completed / memory-shadow-and-canonical-GUI-fallback-retired | root | `.lime/refactor-v2/claims/S6o-legacy-subagent-roster-dto-retirement-root-memory-shadow.md` + `.lime/refactor-v2/claims/S6o-legacy-subagent-roster-dto-retirement-root-canonical-gui-fallback.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6o-legacy-roster-memory-shadow.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s6o-canonical-gui-fallback-retirement.md` + S6o handoffs | team-memory child/sibling roster shadow 与 Harness/AgentRuntimeStrip GUI fallback 均已删除；focused、typecheck、legacy 0/0/0、diff 与 GUI smoke 通过。剩余 session contract 已由 S6s/S6t 物理删除。 |
| S6p-a-canonical-navigation-and-runtime-strip-fallback-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6p-a-canonical-navigation-and-runtime-strip-fallback-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6p-a-canonical-navigation-and-runtime-strip-fallback-retirement.md` + S6p-a handoff | 导航删除 legacy known-session 直达分支，runtime strip 删除 legacy roster 统计；navigation/guard 5/5、strip 10/10、typecheck、legacy report 0/0/0、GUI smoke 与 diff check 通过。Harness fallback 已由 S6o canonical GUI slice 收口，Task Rail stats 已由 S6q 收口。 |
| S6q-canonical-task-rail-subtask-stats | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6q-canonical-task-rail-subtask-stats-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6q-canonical-task-rail-subtask-stats.md` + S6q handoff | Task Rail 从 Workspace scene 到 Toolbar/ViewModel 只透传 canonical children；七态映射锁定 interrupted 为需处理。focused 78/78、最终映射 7/7、typecheck、legacy 0/0/0、GUI smoke 与 diff check 通过。Inputbar/Harness/session DTO 未混入。 |
| S6r-canonical-inputbar-subtask-stats | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6r-canonical-inputbar-subtask-stats-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6r-canonical-inputbar-subtask-stats.md` + S6r handoff | landing、MessageList、Inputbar runtime status 已从 legacy roster 收敛到 canonical children；七态统计回归 `total=7, active=2, queued=1, completed=2, failed=3`。focused 41/41、typecheck、ESLint/Prettier、legacy 0/0/0、GUI smoke 与 diff check 通过。后续 S6s/S6t 已删除 session DTO/state/normalizer/API fixture/metrics fallback。 |
| S6s-legacy-subagent-session-contract-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated | root -> react/api/rust narrow owners | `.lime/refactor-v2/claims/S6s-legacy-subagent-session-contract-retirement-root.md` + React/Rust subclaims + S6t | `internal/research/refactor/v2/13-evidence/2026-07-14-s6s-legacy-subagent-session-contract-retirement.md` + subclaim evidence/handoffs | React/API 删除 child/sibling/parent roster DTO/state/normalizer/fixture；canonical thread family 独占 parent identity；Rust export active count 改读 canonical AgentGraph。React 255+5、API 60+1、Rust focused 2、typecheck、legacy 0/0/0 与 GUI smoke 通过；Rust related 被无关 MCP stack overflow 阻断。 |
| S6t-legacy-session-roster-contract-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated / sanitizer-residual-closed-by-S6v / parent-thread-residual-closed-by-S6t | root | `.lime/refactor-v2/claims/S6t-legacy-session-roster-contract-retirement-root.md` + `.lime/refactor-v2/claims/S6t-canonical-parent-thread-identity-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s6t-parent-thread-residual-closeout.md` + S6t/S6v handoffs | session API 类型、normalizer、dead display leaf、projection parent identity 与 Evidence Pack team facts 已收口；`parentSessionId(s)` 不再进入 current contract。API focused 28/28、projection Node 10/10、fixture guards 71/71、Vitest 32/32、Rust 1/1、typecheck、治理与 GUI smoke 通过；旧 synthetic 41/41 仅是历史 fixture 结果，不再计产品 Gate。 |
| S6v-retired-roster-sanitizer-removal | completed / focused-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S6v-retired-roster-sanitizer-removal-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s6v-retired-roster-sanitizer-removal.md` + handoff | 两个 production session read sanitizer、正向 retired roster fixture 与允许规则已删除；production reader 对旧 key/函数零引用。focused 28/28、typecheck、ESLint/Prettier/diff 与 legacy 0/0/0 通过；未触碰 Rust app-data session fallback。 |
| S7 | completion-audit-reopened / workspace-structure-and-fresh-current-tree-gates-pending / architecture-confirmation-pending / not-archive-ready | root | `.lime/refactor-v2/claims/S7-root.md` + S7a-S7ag/S5ag claims | S7 evidence + completion audit | S7ag 证明当时工作树 `verify:local` 通过；后续 S4ak 改动使最终 current-tree 证据需要刷新。completion audit 同时发现 S5b `<800` 明确退出条件未关闭，现由 S5ag 继续拆分。完成结构退出和 fresh local gates 后，仍必须在真实 PR context 完成 architecture confirmation，禁止本地伪造 event。 |
| S7ae-content-factory-synthetic-contract-probe-retirement | completed / focused-and-Gate-B-validated / released / aggregate-independent-blocker-recorded | root | `.lime/refactor-v2/claims/S7ae-content-factory-synthetic-contract-probe-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s7ae-content-factory-synthetic-contract-probe-retirement.md` + S7ae handoff | Content Factory 产品 Gate B 已删除额外 contract-mismatch Turn、waiter、summary、常量与 assertion；JS 71/71、Rust worker/read model 9/9 + contract boundary 1/1、scripts governance、format/diff 与 Electron Gate B 53/53 通过，console error 0，synthetic 符号/请求 0。聚合 fixture 后序暴露的 Coding Workbench recovery identity bug 归 S7af，不恢复本 slice。 |
| S7af-code-artifact-recovery-turn-identity-fixture | completed / focused-and-electron-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S7af-code-artifact-recovery-turn-identity-fixture-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-15-s7af-code-artifact-recovery-turn-identity-fixture.md` + `.lime/refactor-v2/handoffs/20260715T063354Z-S7af-code-artifact-recovery-turn-identity-fixture-root.md` | Coding Workbench recovery 的 tool/file/patch/command/test 与关联 refs 使用 recovery Turn-scoped execution identity；首轮失败 ID 只作 source refs，失败路径覆盖当前 ledger。focused 6/6、syntax/format/diff、scripts governance 与真实 Electron Gate B 通过；initial/recovery 均 completed，所有 assertion true，invoke/console/page error 0。App Server client contract guard 已对齐当前 `persistBackendLedgerEvidence` owner，`npm run test:contracts` 的 700 protocol types、288 client checks 与全套 governance checks 通过。 |
| S7a-electron-ipc-contract-ordering | completed / focused-and-smart-batch-validated | root | `.lime/refactor-v2/claims/S7a-electron-ipc-contract-ordering-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s7a-electron-ipc-contract-ordering.md` + S7a handoff | truth-bridge production set 无缺项；只修正 test-only sorted expectation。focused 4/4、smart batch 9 的 16 files/132 tests 与 diff check 通过。 |
| S7b-current-electron-guard-alignment | completed / focused-and-smart-batch-validated | root | `.lime/refactor-v2/claims/S7b-current-electron-guard-alignment-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s7b-current-electron-guard-alignment.md` + S7b handoff | packaged renderer alias guard 跟随 `browser.ts`；规则 guard 不再强迫根/事实源复制 retired 细节或固定旧文案。focused 25/25，后续 smart batch 15/16 覆盖两 guard，batch 12 current run 16 files/151 tests 通过。 |
| S7c-app-server-runtime-guard-currentization | completed / focused-format-contract-and-governance-validated | root | `.lime/refactor-v2/claims/S7c-app-server-runtime-guard-currentization-root.md` | S7c evidence/handoff | stale guard 已对齐 current runtime owner，不增加 whitelist 或放宽真实体量阈值。 |
| S7d-image-command-events-split | completed / stale-recovered-and-released | image-command-events | `.lime/refactor-v2/claims/S7d-image-command-events-split-image-command-events.md` | S7d evidence/handoff | canonical image/tool/turn event projection 已迁入 `image_command/events.rs`，workflow facade 回到体量门槛内且行为不变。 |
| S7e-runtime-value-fields-split | completed / focused-validated | runtime-value-fields | `.lime/refactor-v2/claims/S7e-runtime-value-fields-split-runtime-value-fields.md` | S7e evidence/handoff | id/JSON/timestamp helpers 已迁入 `runtime/value_fields.rs`，runtime facade 职责与行为保持。 |
| S7f-runtime-backend-execution-trait-split | completed / focused-contract-and-rustfmt-validated | root | `.lime/refactor-v2/claims/S7f-runtime-backend-execution-trait-split-root.md` | S7f evidence/handoff | ExecutionBackend trait 适配迁入独立 current 子模块，root facade <=480 行；App Server check/contract/guard 通过。 |
| S7h-S7s-current-fixture-and-ordering-closeout | completed / focused-and-smart-validated / S7o-current-semantics-superseded | root + narrow owners | S7h-S7s claims | S7h-S7s evidence/handoffs | Approval、Plugin、stream/runtime、checkpoint 与 API fixtures 跟随 canonical Thread/Turn/Item 和 current module owner；S7o 的无 position Tool 原位排序结论已由 S7x 推翻，历史 evidence 不再作为 current 规则。 |
| S7t-vitest-smart-targeted-state-isolation | completed / governance-renumbered-and-validated | root | `.lime/refactor-v2/claims/S7t-vitest-smart-targeted-state-isolation-root.md` | original runner evidence/handoff | `--only-batch` / `--list-batches` 不覆盖 resumable state，unit 11/11 与 scripts governance 通过；旧 runner S7i claim 保留为 superseded。 |
| S7u-image-title-current-owner-fixture | completed / full-resume-typecheck-and-governance-validated / released | root | `.lime/refactor-v2/claims/S7u-image-title-current-owner-fixture-root.md` | S7u evidence/handoff | batch 101 的 title mock 对齐 current agentClient；focused 16/16、full resume、typecheck、lint/format、legacy 0/0/0 通过。 |
| S7v-inputbar-objective-current-owner-fixture | completed / focused-and-smart-validated | root | `.lime/refactor-v2/claims/S7v-inputbar-objective-current-owner-fixture-root.md` | S7v evidence/handoff | batch 108 的 objective mock 对齐 current objectiveClient；Inputbar 87/87 与 batch 108-110 通过。 |
| S7x-canonical-reasoning-position-only | completed / focused-and-reasoning-Gate-B-validated | root | `.lime/refactor-v2/claims/S7x-canonical-reasoning-position-only-root.md` | S7x evidence/handoff | canonical Tool/Reasoning ordinal 是唯一 ordering fact；无 position raw Tool 特判与 sentinel 正向 fixture 已删除。focused 55/55、ESLint/Prettier/diff 与真实 Electron reasoning-first-visible 通过；aggregate 首页场景另受 250ms sampling budget 阻断，实测 pending paint 为 21ms。 |
| S7y-approval-cold-read-typed-response | completed / focused-contracts-and-approval-resume-Gate-B-validated / released | root | `.lime/refactor-v2/claims/S7y-approval-cold-read-typed-response-root.md` | S7y evidence + handoff | canonical ThreadStore -> read model -> typed Renderer 保留五种 decision，GUI view-model 才 lower；Rust 47/47、Renderer 52/52、contracts 288、legacy 0/0/0 与 Approval resume Gate B 通过，无新增 request、IPC、mock 或第二响应 owner。 |

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
确认内容：已核对 Renderer typed client -> App Server JSON-RPC -> direct ThreadStore read 的依赖方向；后续 S2q 已确认 `agentSession/read` 是同一 ThreadStore-backed current presentation endpoint，旧整段 namespace 删除条件已 superseded。
```

### 9.2a S2k canonical Message / Plan lifecycle 确认

```text
架构影响：重大；把 user/agent Message 与 proposed Plan 收敛为 Codex 对齐的正式 canonical Item lifecycle，并改变 Plan history/revision 的持久化与 GUI 恢复语义；不新增 runtime owner、Electron 后端、JSON-RPC method、兼容层或第二 read model。
架构图更新章节：internal/aiprompts/architecture.md 第 6.2 节 Agent Runtime 组。
责任开发者确认：root，2026-07-14
确认内容：已核对 `message.created` 直接形成 completed UserMessage，AgentMessage 只在真实正文开始后创建并由同一 Item 在 `message.completed` 进入 terminal，取消映射 Interrupted；Plan delta/final 使用 `plan_{turnId}_{revisionId}` 稳定 identity，completed final snapshot 覆盖流式 delta 并保留首 ordinal。Codex `leading_whitespace_by_item` 语义已复制到 Plan parser，Plan-only 输出不产生空白 AgentMessage。canonical SQLite restart、read model、typed reader 与真实 Electron reload 均保留 revision、source、steps/status；GUI 实施确认绑定同一 revision，legacy update_plan Item 为 0。Gate B 通过；聚合 fixture 后续 Skills Provider 鉴权失败与本切片无关。
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

### 9.12 S4l MCP sampling-step snapshot 确认

```text
架构影响：落实 Codex 的 per-sampling-step 工具面冻结语义，不新增产品协议；tool-runtime 成为 MCP definitions、caller policy、route 与 connection handle 的唯一 snapshot owner，agent-runtime 只拥有通用 step contract。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对每次 provider request 前 capture、同 step exact executor、unknown call fail-closed lifecycle、per-server discovery isolation、Turn-local deferred next-step activation、per-tool caller 双重门禁、registry replace 后旧 handle/timeout 保持、raw tool.input.delta producer 删除，以及真实 Electron Context7 tool_search/query-docs。专用 localhost deferred fixture 已通过真实 Host/preload/App Server/runtime/read model 证明 old-step deny、same-Turn next-step visible/executed 与 Turn-local no-leak，runtime/read model `16/16`；同一 managed Electron run 已导航目标 session，并以 `12/12` visible-DOM assertions 证明 deferred Tool completed row、最终文本、`agentSession/read` electron-ipc 与零 invoke/console error。Codex `ThreadItem` 不包含 ToolSearch，`tool_search_call/output` 只留 provider/rollout history，因此 GUI 明确保持 discovery internal，不把 TUI/内部模型事件复制成 GUI product row。Resource/Prompt/status 归 App Server live management read，capability 归 initialized connection，server-originated elicitation归独立 reverse JSON-RPC 协议，均不扩张 sampling-step snapshot。
```

### 9.12a S2s Canonical AgentMessage content-part 确认

```text
架构影响：重大；canonical AgentMessage 从 text/phase 扩展为 ThreadItem-owned typed Text/Media/reference content_parts，改变 ThreadStore/read model/schema/generated client 与 live Renderer projection 的数据边界，但不新增 runtime、provider 或 Electron 业务 owner。
架构图更新章节：internal/aiprompts/architecture.md canonical Message lifecycle 与 6.2 canonical persistence / 7.1 event boundary。
责任开发者确认：refactor-v2-coordinator / root，2026-07-15
确认内容：已核对 App Server materializer、ThreadStore durable payload、thread/read、agentSession/read、canonical notification、Renderer reader、schema/generated client 与 media Gate B 的同源链路；malformed/inline/provider raw content fail closed，presentation `contentParts` 不得反向成为事实源。PR 级 architecture confirmation 仍需在实际 PR body 中填写并由门禁复核。
```

### 9.13 S4m Canonical Tool output/media residual 确认

```text
架构影响：落实既有 canonical Tool owner，不新增产品协议；App Server output sidecar、hydration、media projection 与 notification/materializer 内部结构从 raw/outer fallback 收敛到 typed nested Item。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 tool_end 入口拒绝、Tool/MCP/Collab terminal output、stable outputRef、filesystem sidecar/read model/artifact/restart hydration、completed+succeeded image owner facts、pending/raw/无 sidecar fail closed、tool.progress/tool.output.delta 精确 side-channel allowlist，以及 event_store/thread projection/materializer/output_refs 文件体量拆分。Electron/JSON-RPC/Renderer wire 未变化，因此不重复执行 Gate B。
```

### 9.14 S4n Dead backend/core stream surface 确认

```text
架构影响：删除与 Codex Item lifecycle 冲突的第二套零消费者 backend event-name mapper 和 core stream DTO，不新增协议或兼容层；canonical Thread/Turn/Item owner 不变。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 App Server mapper/module/export 零消费者，core StreamEvent/ToolExecutionResult/StreamResult 无 import、构造、匹配、schema 或 fixture consumer；TokenUsage 仍有数据库/session current 消费故保留。Codex `item/started`、`item/completed` 和 Lime agent-protocol ThreadItem 是替代事实源；Electron/JSON-RPC/Renderer wire 未变化，因此 Gate B 不适用。
```

### 9.15 S4p MCP resource target identity 确认

```text
架构影响：非重大；不新增 transport、owner 或产品 lifecycle，只修正现有 MCP management/native helper 命令契约，使单资源操作使用精确 (server, uri)，并删除 manager 的 URI 扫描猜测路径。
架构图更新章节：不适用；现有 Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore/management owner -> GUI 依赖方向不变。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 Rust DTO/schema/generated TS、Rust/TS client、App Server handler/local data source、lime-mcp manager、native resource helper、Renderer gateway/Hook/GUI、同 URI 双 server read/subscribe/unsubscribe、非空 fail-closed、canonical Tool metadata、current smoke pair oracle 与 legacy 命令零命中。Prompt identity、server-originated elicitation 和 sampling capability 广告未混入本 slice。
```

### 9.16 S4o MCP control-plane owner split 确认

```text
架构影响：收窄 MCP model bridge 的职责，不新增 transport 或兼容层；tool-runtime 只拥有 model-visible sampling-step Tool discovery、caller policy、exact route/connection handle 与 dispatch，App Server -> lime-mcp::McpClientManager 继续唯一拥有 GUI Prompt/Resource/status live management read。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 model bridge management API 与 caller-unaware registry dispatch 的生产消费者为零，旧 resource/prompt/server-info/capability summary surface 已物理删除并补回流守卫；连接替换后既有 sampling step 仍持有原 immutable handle/timeout，GUI management 命令继续走 App Server JSON-RPC。sampling false advertisement 已由 S4s 删除，edge store 已由 S4t 建立；server-originated elicitation、AgentControl 生产接线与 mailbox delivery semantics 保持为独立后续 slice。
```

### 9.17 S4q MCP prompt target identity 确认

```text
架构影响：同步修正现有 MCP Prompt management 协议与 GUI identity，使单次 get 使用 exact (server, name)；不新增 transport、runtime owner 或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 Rust DTO/schema/generated TS、Rust/TS client、App Server handler/local data source、lime-mcp manager、Renderer gateway/Hook/GUI、同名双 server 路由、request generation 丢弃迟到结果、非空 fail-closed，以及后置 App Server processor/package client current fixtures。deterministic MCP fixture 不实现 prompt get，因此未冒充 Gate B。
```

### 9.18 S4s MCP sampling capability fail-closed 确认

```text
架构影响：删除无 handler 支撑的 MCP client capability 正向广告，不新增协议或 provider 旁路；stdio/HTTP 继续共享 LimeMcpClient initialize owner。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对全仓不存在 sampling/createMessage handler 或产品 consumer，rmcp 默认只会 method not found；复制 Codex ClientCapabilities default 口径，sampling 保持 absent 并补 enable_sampling 回流守卫。App Server JSON-RPC/Electron/Renderer wire 未变化，Gate B 不适用。
```

### 9.19 S4t Agent graph edge persistence 确认

```text
架构影响：新增 Multi-Agent parent/child topology 的 storage-neutral contract，并由既有 App Server ProjectionStore canonical SQLite owner 实现；不新增 crate、数据库、协议或 GUI owner。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 Codex AgentGraphStore/types/schema provenance、child unique parent、Open/Closed audit、stable child/BFS descendants、reopen 与 missing-close no-op。该 slice 不把 mailbox 塞进 RuntimeQueuedTurn，不读取 legacy session metadata；第一段 AgentControl graph boundary 已由 S4v 落地，canonical mailbox Item consumer、Collab/SubAgent producer 和旧 Team surface 删除归后续独立 slice，GUI wire 未变化所以 Gate B 不适用。
```

### 9.20 S4u Durable mailbox and identity persistence 确认

```text
架构影响：重大；新增 Multi-Agent durable identity/mailbox 的 storage-neutral contract，并由既有 App Server ProjectionStore canonical SQLite owner 实现；不新增 crate、数据库、JSON-RPC 或 GUI owner。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-14
确认内容：已核对 root-thread identity 的 thread/path 双唯一与 task-name 派生、message-id 幂等/冲突拒绝、QueueOnly/TriggerTurn durable mode、root+recipient FIFO 隔离、delivered audit/reopen。S4u 不消费 mailbox：canonical Item append-before-ack、Turn trigger 与 wait activity 归后续 S4w；六个 AgentControl tool 与 GUI 必须在该生产消费链稳定后另拆，不得回退 legacy session metadata、临时 map 或 RuntimeQueuedTurn。thread-store 21/21、App Server mailbox store 4/4、check、rustfmt/diff 通过；shared `LocalAppDataSource` fixture 已同步，原并行 MCP 编译阻塞已解除。
```

### 9.20a S4v RuntimeCore AgentControl boundary 确认

```text
架构影响：重大；在既有 App Server RuntimeCore 与 ProjectionStore owner 内新增 Multi-Agent child lifecycle 的第一段控制面，不新增 crate、JSON-RPC、Electron 后端、GUI 或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-14
确认内容：已核对 parent 仅从 loaded RuntimeCore session 解析，child session/thread 先由 canonical start 建立再持久化 Open edge；edge 错误时 child session 与 canonical Thread 必须补偿删除，补偿失败显式 fail closed。Closed edge 与 descendants traversal 归 `AgentGraphStore` contract；无 current consumer 的 RuntimeCore close/read 包装已在 S4x 删除，restart recovery 也不以 memory fallback 冒充实现。S4v 未接 mailbox、turn trigger、tool/catalog/JSON-RPC 或 GUI；S4w 后续接入 canonical Item-before-ack 与 TriggerTurn。原 App Server library check 与 `agent_control` 6/6 通过，S4x 当前 focused 11/11 继续覆盖生产边界。
```

### 9.20b S4w RuntimeCore durable mailbox consumer 确认

```text
架构影响：重大；在既有 RuntimeCore、canonical EventLog 和 ProjectionStore owner 内新增 durable mailbox 的唯一内部消费链，不新增 crate、数据库、JSON-RPC、Electron 后端、GUI 或 compat 层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 `message_id -> ItemId` 与 TriggerTurn deterministic turn identity；QueueOnly 不启动 turn，只在下一真实 turn 前写入 canonical history。canonical Item 必须在 mailbox delivered ack 前可读。canonical EventLog 仍是顺序事实源：EventLog-first 后 projection failure 保留 pending，只有 exact mailbox identity 与 contiguous durable tail 才允许补投影并 ack，任何 identity/sequence conflict fail closed。既有 Item retry 只 ack，不产生 duplicate visible Item；无 ProjectionStore 时 mailbox event 禁止静默成功。S4w 只提供 durable activity query，不注册六工具、JSON-RPC、GUI 或旧 Team 删除。focused 6/6、独立 App Server library check、rustfmt/diff 通过；Gate B 不适用，完整 restart/tool/GUI 产品链仍由后续 slice 负责。
```

### 9.20c S4x Per-turn AgentControl gateway 确认

```text
架构影响：重大；在既有 RuntimeCore、ExecutionRequest、RuntimeBackend 与 current provider 间增加仅本 turn 有效的 opaque AgentControl capability，不新增 RuntimeBackend -> RuntimeCore 依赖、全局 registry、JSON-RPC、Electron 后端、GUI 或 compat 层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对六工具只在 per-turn gateway 存在时进入 sampling-step definitions，executor 用 canonical call/turn/thread identity 调用 RuntimeCore durable graph/identity/mailbox owner；RuntimeBackend 只 clone/pass-through handle。spawn 的 child/edge/identity/mailbox/trigger 失败均 fail closed，send_message 只 QueueOnly，followup_task 禁 root，interrupt 不关闭 Open edge，list 只读同 root Open graph/identity 并稳定排序。S4x 完成时 wait 仅观察 caller pending mailbox/new steer，尚缺 child terminal 回流；该历史缺口已由 S4aa 的 direct-parent Result、EventLog recovery 与 steer-first wait 关闭。tool-runtime 3/3、lime-agent 13/13、App Server focused 11/11、关键 spawn 重跑 1/1、App Server library check、rustfmt/diff 通过；无 JSON-RPC/GUI，Gate B 不适用。
```

### 9.20d S4y Dead Team tool surface 删除确认

```text
架构影响：重大；物理删除与 per-turn AgentControl gateway 冲突的旧 Team/collab_agent 可执行工具实现和静态事实源，不新增协议、兼容层、fallback 或第二套 runtime。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 `tool-runtime::collab_agent` 仅模块内自引用，current provider 只在 gateway 存在时注册六个 V2 工具；旧 module、五工具 catalog/alias、prompt、discovery profile、native allowlist 与 Team smoke 已删除或迁移，并由治理目录册和 contract guard 禁止回流。canonical `CollabAgentToolCall` / SubAgent 历史展示 payload 仍由独立 protocol/projection slice 负责，本删除切片不把历史可读性误判为可执行旧 surface。JSON-RPC/GUI 与完整 restart recovery 未完成，Gate B 不适用于纯删除切片。
```

### 9.20e S4ab Legacy collab projection boundary 确认

```text
架构影响：非重大；收紧既有共享 projection package 的 tool-name taxonomy 与 lineage validation，不新增协议、transport、runtime owner、GUI surface 或兼容层。
架构图更新章节：不适用；Agent 产品主链依赖方向不变。
责任开发者确认：root，2026-07-14
确认内容：已核对只有 spawn_agent/send_message/followup_task/wait_agent/interrupt_agent/list_agents 进入 current projection；裸 send_input/resume_agent/wait/close_agent 只产生 legacy_tool_name，不能计入 V2 coverage。followup_task/interrupt_agent visual name 保真，wait_agent/list_agents 无 target 时不要求 receiver lineage。Rust CollabAgentOperation/SubAgentActivity 历史 variant、canonical item_json decode、schema/import/evidence/display 未修改，继续只读兼容既有历史。
```

### 9.20f S4z AgentControl restart-on-demand 确认

```text
架构影响：非重大；用跨 RuntimeCore 重建回归固定既有 durable graph/identity/mailbox 与 session hydration 的按需恢复语义，不新增 production owner、协议、队列、registry 或兼容层。
架构图更新章节：不适用；既有 App Server RuntimeCore -> ProjectionStore/EventLog 依赖方向不变。
责任开发者确认：root，2026-07-14
确认内容：已核对 root hydrate 不递归打开 Open descendants；send_message QueueOnly 不加载 child，followup_task/interrupt_agent 只 hydrate exact target；Closed edge 保留 audit 但不可寻址、不 reopen；grandchild 不因 root 或 sibling control 被加载。App Server library check 与 agent_control 12/12 在最终并行工作树通过，未引入 BFS restart、process-global registry、第二队列、JSON-RPC 或 legacy metadata fallback。
```

### 9.20g S4ac wait_agent canonical Collab Item 确认

```text
架构影响：非重大；在既有 canonical ToolLifecycleEvent -> AgentEvent::Item* producer 内选择已有 CollabAgentToolCall payload，不新增 runtime owner、协议、transport、队列或兼容层。
架构图更新章节：不适用；Agent -> App Server generic Item event/store/read 依赖方向不变。
责任开发者确认：root，2026-07-14
确认内容：已核对 wait_agent Started/Completed 共享 call-derived Item identity 与 ordinal，operation 固定 Wait，target/message 为空，terminal ToolOutput 保留 text/structured content/duration。list_agents 与普通工具不被重分类；spawn/send/followup/interrupt 在 gateway 提供真实 target ThreadId 前不伪造 SubAgent activity。focused 1/1、protocol 19/19、current provider 13/13、lime-agent library check 与 rustfmt/diff 通过；无 schema/generated client/GUI/Gate B 变化。
```

### 9.20h S4aa Agent terminal mailbox activity 确认

```text
架构影响：重大；在既有 RuntimeCore/EventLog/ProjectionStore 与 AgentGraph/Identity/Mailbox owner 内接入 canonical child terminal -> direct-parent durable Result，并增加 EventLog-first crash recovery 与 Codex-priority wait；不新增 crate、协议、JSON-RPC、队列、registry 或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 completed/failed 先 canonical 后 direct-parent QueueOnly Result，interrupted/canceled 不写 FINAL_ANSWER；Result 以 assistant canonical Item 持久化并保留 sender/kind/sourceTurn/resultStatus metadata，completed 长 Unicode 不静默截断。canonical apply 前和 mailbox append 前两类 crash window 只沿 direct Open child EventLog 恢复 canonical 缺失 tail；session-scoped I/O lock 防止 repair 截断 in-flight append，repairable/empty-prefix tail、stable ID、pending->delivered SQLite CAS 与 RuntimeCore mailbox ID dedupe 共同保证单次 activity/EventLog。wait 对 pre-existing/new steer 均优先，active wait 使用有界退避且 deadline 前强制 final recovery。graph/mailbox 1+1、canonical graph 8、store/delivery/terminal/EventLog/control 7+6+13+24+12、最终 App Server library check 与通用 GUI smoke 通过；聚合 Agent fixture 的独立 Plan revision blocker 已记录，不冒充 JSON-RPC/Multi-Agent Gate B。
```

### 9.20i S4ad targeted SubAgent producer 确认

```text
架构影响：重大；在既有 App Server AgentControl gateway -> RuntimeTool -> canonical ToolLifecycleEmitter -> Thread/Turn/Item 主链增加 success-only typed internal activity 与独立 SubAgent Item，不新增 JSON-RPC、队列、registry、Electron 后端或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 spawn 使用真实 child ThreadId 产生 Started，send/followup 使用 durable identity 解析后的 target ThreadId 产生 Interacted，interrupt 产生 Interrupted；input target path 只作解析输入和 detail，不作为 ThreadId。typed fact 经 serde-skipped RuntimeToolExecutionResult/NormalizedToolOutput 传给 host emitter，不进入 model output、structured content 或普通 Tool metadata。四个 targeted 工具先完成普通 Tool Item，再追加 call-derived stable distinct SubAgent Item；失败、started phase、空/多 fact、tool/activity mismatch、wait/list 均 fail closed。Started/Interacted/Interrupted 是 current 写入值；S4ad 临时保留旧七值的历史兼容决定已由 S4ae 推翻，原因是仓库没有外部用户或历史数据兼容约束，且 Codex contract 只有三值。focused Rust 5+1+5+14+12、schema fixture 1 已通过；contracts/current fixture 与最终 rustfmt/diff 在 evidence 收尾记录。
```

### 9.20j S4ae canonical SubAgent GUI 确认

```text
架构影响：重大；将 canonical SubAgent activity 收敛为 Codex Started/Interacted/Interrupted 三值，并让 GUI cold/live timeline、Harness 与状态文案只消费同一 Item identity；删除 synthetic sidecar 与 activity worker-result，不新增 Electron 后端、JSON-RPC、队列或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 App Server cold read 从 canonical ThreadStore 回填 detail.items/thread_read.thread_items，Renderer live reader 保留相同 Item ID 与 child ThreadId；activity Item 的 completed 只表示事实落盘，started/interacted 投影 running/acting，interrupted 投影 cancelled/interrupted，child terminal 仍只由 S4aa Result mailbox/thread lifecycle 表达。GUI 使用五语言文案且 unknown wire 不直接显示；real:subagent:* producer/test、activity worker.notification 和 Harness child-terminal 推断已删除。协议已收口 Codex 三值并同步 schema/TS。spawn/followup 只等待 durable commit 与 child `turn.accepted` admission，child 后台执行并继承 parent 显式 runtime request；provider output identity 由 canonical Turn + sampling attempt + family + raw ID 唯一化，ThreadStore/EventLog fail-closed 未放宽。六个 AgentControl 工具真实 managed Gate B 全部 completed，15 项断言全真；该 batch 当时不含 SubAgent visible-DOM/console/invoke 断言，后续已由 S4ag/S4ah 关闭 effective route 与完整 visible DOM 缺口。
```

### 9.20j1 S4ag effective child route 确认

```text
架构影响：重大；在既有 RuntimeBackend selection/request-context 与 RuntimeCore per-turn gateway 之间增加 effective options preflight，并回写唯一 StoredSession.turn_runtime_options，不新增 route map、resolver、session metadata 复制、compat 或 fallback owner。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-15
确认内容：已核对 session-default/profile provider、model、effective reasoning、workspace 与 search policy 复用现有 resolver；gateway 只在 effective options 回写后构造，child 清除 event/queue/output contract。effective options 2/2、AgentControl 14/14、rustfmt/diff 通过。
```

### 9.20j2 S4ah AgentControl visible DOM Gate B 确认

```text
架构影响：重大；把 canonical Collab Wait 的产品 presentation 从非 Codex subagent_activity(wait) 修正为普通 wait_agent Tool，并为六 Tool 与 distinct SubAgent activity 增加同一真实 Electron DOM 证据；不改变 storage payload、协议、Electron 后端或 activity 三值 contract。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-15
确认内容：已核对 smoke 不再从 SubAgent status 反推工具执行；wait_agent storage 仍为 CollabAgentToolCall::Wait，agentSession/read 输出 tool_call。Gate B 28/28 assertions，六个 typed Tool row 均 completed/visible，Started/Interacted/Interrupted 均可见且绑定 child Thread，agentSession/read=electron-ipc，console/invoke error 0，localhost fixture 不冒充 live-provider proof。
```

### 9.20j3 S4ai dead synthetic Team fixture 确认

```text
架构影响：非重大；物理删除 external backend 伪造 Team/subagent event 的 test-only scenario 及其 15 个直接 consumer，current evidence 改指 RuntimeCore AgentControl/canonical Item Gate B；不删除 remote task 等真实 structured-source worker.notification。
架构图更新章节：不适用；只删除与既有第 6.3 节 current owner 冲突的伪证据路径。
责任开发者确认：root，2026-07-15
确认内容：已核对 scenario、constants、flow、backend branches、assertions、summary、regression runner 与 production-files guard 引用均已清除；净删 707 行，fixture 54/54、regression 16/16、scripts governance、docs boundary 与 diff check 通过。
```

### 9.20j4 S4aj warm followup target route 确认

```text
架构影响：非重大；只修正既有 RuntimeCore AgentControl gateway 的 TriggerTurn options 优先级，warm target 读取自身最近 effective Turn snapshot，cold/unloaded target 才使用 caller snapshot；不新增协议、持久化、resolver、route map、compat 或 fallback owner。
架构图更新章节：不适用；既有 App Server RuntimeCore -> RuntimeBackend/tool-runtime -> canonical Thread/Turn/Item 数据流与 owner 不变。
责任开发者确认：root，2026-07-15
确认内容：已对照 Codex live followup 与 cold resume 语义，核对 target session 的唯一 StoredSession.turn_runtime_options 反向选择、parent-only event/queue/output contract 清理和 caller cold fallback。focused 1/1、AgentControl 15/15、App Server check、exact rustfmt/diff 与修改后 S4ah Electron visible-DOM Gate B 28/28 通过。
```

### 9.20j5 S4ak MCP elicitation capability advertisement 确认

```text
架构影响：非重大；既有 McpThreadRuntime -> LimeMcpClient -> App Server reverse JSON-RPC -> Renderer form owner 不变，只让 runtime initialize 如实广告已实现的 form capability，management connection 继续 absent；不新增协议、持久化、compat、mock 或第二 request owner。
架构图更新章节：不适用；当前 MCP runtime/control-plane owner 与产品链未变化。
责任开发者确认：root，2026-07-15
确认内容：已对照 Codex form-only capability，核对 runtime `2025-06-18 + {"elicitation": {}}`、management `2025-03-26 + {}`、同 stdio pid initialize/accept 关联和 capability_missing fail closed。lime-mcp 140/140、raw wire 1/1、static guard 4/4、scripts/legacy governance 与真实 Electron Gate B 通过；Provider 2 requests、Renderer form visible/submitted/closed、JSONL bridge 命中、console/legacy command 0。
```

### 9.20j6 S4al AgentControl cold-restart visible DOM 确认

```text
架构影响：非重大；只扩展既有 managed Electron Gate B 的生命周期与 identity 对比，并把首页封面从 public file-root 路径收敛到 Vite/Electron bundle asset owner；RuntimeCore、App Server JSON-RPC、Thread/Turn/Item protocol 与 GUI projection owner 不变。
架构图更新章节：不适用；没有新增业务 owner、协议、存储或兼容层。
责任开发者确认：root，2026-07-15
确认内容：AgentControl batch 显式使用 `--cold-restart`，关闭旧 Electron/App Server 后复用同一 user data/runtime root 启动新进程；PID `8923 -> 9920`，六 Tool `(id,name,status)`、SubAgent `(itemId,kind,threadId)` 与唯一 child Thread identity 完全稳定；`agentSession/read`/`thread/list` 均 `electron-ipc/success`，console/invoke error 0。重复 public/组件 JPG 逐字节相同且无其他引用，已物理删除并由 12 个 WebP bundle asset 接管；9/9 unit、renderer build、Gate B 与 scoped diff/format 通过。
```

### 9.20k S6i Renderer fake Team formation 删除确认

```text
架构影响：重大；删除 Renderer 在发送前按 selected Team、长度和正则构造的第二套 Multi-Agent formation/preview 事实源，不新增 compat、协议或替代状态机。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对真实 Multi-Agent 成员与活动只由 RuntimeCore AgentControl -> canonical Collab/SubAgent ThreadItem 产生；本地 formed state、虚拟 member/work-board event、runtime-team-dispatch 伪消息、send preview state 与 layout preview flag 已删除。canonical child ThreadId 导航、timeline Item 和 SubAgent 工具开关保持 current。focused 188、typecheck、legacy report 0/0/0 与 GUI smoke 通过；aggregate fixture 的外部 Skills Provider 鉴权 blocker 单独记录。
```

### 9.20l S6j Renderer Team runtime sidecar 删除确认

```text
架构影响：重大；删除 Renderer 重复订阅 raw subagent status/stream、维护本地 live/draft/tool/queue map 并再次写 projection store 的第二 runtime，不新增 compat、fallback 或替代事件总线。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：team-workspace-runtime 目录、useTeamWorkspaceRuntime、teamWorkspaceRuntime、wrappers、正向 tests 与 dead 五语言 keys 已删除，stop 直接委托 current owner；canonical reader、ThreadItem projection 和 timeline 卡片保持 current。2026-07-14 follow-up 发现原 focused 集漏跑仍读取已删文件的 project-thread guard，且 canonical activity ThreadId 被直接当 sessionId 导航，因此本确认只覆盖 sidecar 删除，不覆盖 navigation/guard 完成。S6k/S6l 必须完成 canonical roster、ThreadId -> sessionId 解析、补守卫和 Gate 后才能恢复完整完成声明。
```

### 9.20m S6k canonical child roster 确认

```text
架构影响：重大；将 App Server durable AgentGraph/AgentIdentity 与 canonical Thread lifecycle join 为 typed child roster，并让 Workspace GUI 只消费该 roster，不新增协议 owner、Electron 后端、事件总线、compat 或生产 mock。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：`thread/list` 暴露 parentThreadId、agentPath/nickname/role、lastTaskMessage 与 Codex 七态 agentState；selector/hook 保留 threadId/sessionId，parent Item 引用缺失 child 显式 notFound。Harness 和 RuntimeStrip 显式传入 canonical roster 时不回退 raw sessions，pendingInit+running 才计 active，interrupted 独立；导航优先 canonical ThreadId -> sessionId，未知才 thread/read。unified focused 91、Rust 精确 4、app-server check、scoped ESLint、typecheck、contracts 290、五语言与 GUI smoke 通过。当时 multi-agent-team synthetic run 已由 S4ai 撤销为产品 Gate，canonical AgentControl Gate 见 S4ah。
```

### 9.20n S6l Thread-first SubAgent 导航与守卫确认

```text
架构影响：非重大；复用既有 App Server thread/read 与 canonical child roster 修正 Renderer 身份转换，不新增协议、Electron 后端、事件总线、compat 或 fallback。
架构图更新章节：不适用；既有 canonical Thread/Turn/Item 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：canonical roster 保留 threadId/sessionId，activity target 优先使用 roster sessionId，缺失时通过 `thread/read(turnsView=notLoaded)` 严格解析；真实 child session id 仍可直达，mismatch/空值/read 失败均 fail closed。unified focused 91、stop 1、project-thread 10、catalog/registry 213、typecheck、contracts 290、五语言/unused/legacy 与 GUI smoke 通过；当时 synthetic Team run 不再计 Gate，canonical AgentControl Gate 见 S4ah。
```

### 9.20o S6m raw SubAgent channel 退役确认

```text
架构影响：非重大；删除无 producer/consumer 的 Renderer status/stream 专用事件通道、adapter alias 与 DevBridge truth policy，不改变 App Server JSON-RPC、Electron host、canonical read model 或 current event transport。
架构图更新章节：不适用；既有 Electron Desktop Host -> App Server -> RuntimeCore -> Thread/Turn/Item -> GUI 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：`agent_subagent_status:*` / `agent_subagent_stream:*` 已从 production listener、sync effect、runtime adapter、event source API 和 bridge truth prefix 迁出；`agentSession/event`、generic local fanout、sequence gate、thread/read polling 与 canonical child roster 保持 current。negative guard 同时阻止两个 prefix、专用 getter/listener 和 `listenToTeamEvents` 回流。focused 25/25、typecheck、legacy report 0/0/0；contracts protocol/client 290 和主体 gates 通过，最终 docs boundary 仅被并行索引的 release-v1.102.0 plan 阻断。current aggregate 通过历史/stream/首页/Workbench/图片/停止继续/Approval/Inputbar rich restore，pending-steer 首跑输入稳定等待超时，精确 Electron 场景复跑通过。
```

### 9.20p S6n1 raw SubAgent status parser 退役确认

```text
架构影响：非重大；让 Renderer 对无生产协议来源的 raw `subagent_status_changed` fail closed，并删除 Agent UI dispatcher 分支；不改变 canonical Item schema、runtime status team projection、历史 EventLog opaque read 或 GUI current owner。
架构图更新章节：不适用；canonical SubAgent Item -> ThreadItem projection 与 thread/list child roster 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：`parseAgentEvent` 对旧 raw status 返回 null，绕过 parser 直接调用 dispatcher 也得到空投影；canonical `item_* -> subagent_activity` 和 `runtime_status -> team.changed` 保持 current。精确 2/2、dispatcher 全量 22/22、typecheck/diff 通过。本切片当时保留的 raw TS type、独立 helper/package、fixture/i18n 已由后续 S6n 物理删除。
```

### 9.20q S6n raw SubAgent type/package/fixture 退役确认

```text
架构影响：非重大；物理删除已无 producer/consumer 的 raw status TS type、local/package projector、fixture producer 与 summary/i18n 正向口径，不改变 App Server JSON-RPC、canonical Item schema、thread/list child lifecycle、runtime status team projection 或历史 EventLog opaque read。
架构图更新章节：不适用；Electron Desktop Host -> App Server -> RuntimeCore -> Thread/Turn/Item -> GUI 主链与 owner 未变化。
责任开发者确认：root，2026-07-14
确认内容：`subagent_status_changed` 类型、`subagentStatusProjection`、projection package `subagentStatusEvents`、raw-only runtime facts、summary/i18n/fixture 正向输入已删除；barrel 和 current docs 不再导出或宣称 raw helper。`runtime_status -> team.changed`、canonical `item_completed -> subagent_activity`、child roster/navigation 与 generic EventLog/hydration 保持 current。package 295/295、focused 136/137（唯一失败为既有 `action_required.request_id` fixture 漂移）、governance guards 16/16、typecheck、五语言、unused、legacy report 0/0/0、Multi-Agent Electron Gate B 与 GUI smoke 通过；contracts 主体通过后被并行索引的 release plan 阻断，aggregate 仅在已知 Skills Provider 鉴权失败处退出。
```

### 9.20r S6p-a canonical navigation/runtime strip fallback 退役确认

```text
架构影响：非重大；删除 Renderer 导航和 runtime strip 对无 current producer 的 legacy child session fallback，不改变 App Server JSON-RPC、canonical child roster、Thread/Turn/Item schema、Electron host 或 session state owner。
架构图更新章节：不适用；既有 canonical child Thread -> `readThreadSessionId` -> session navigation 与 Thread/Turn/Item -> GUI 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：`useWorkspaceSubagentNavigationRuntime` 只从 canonical child ThreadId 命中 roster sessionId，缺失时调用 `readThreadSessionId`，不再检查 `childSubagentSessions` 或 `isKnownSession`；`AgentRuntimeStrip` 只接受 canonical child summaries 并将空 roster fail closed 为零计数。Harness delegation/status fallback、Task Rail subtask stats、session state 和 legacy DTO 仍明确留在后续写集。导航/guard 5/5、strip 10/10、typecheck、legacy report 0/0/0、`npm run verify:gui-smoke` 与 claimed diff check 通过。
```

### 9.20s S6q canonical Task Rail subtask stats 确认

```text
架构影响：非重大；将 Task Center Task Rail 的子任务统计从无 current producer 的 legacy session detail roster 切换到既有 canonical child Thread summaries，不改变 App Server protocol、Thread schema、Electron host、MessageList 或 session state owner。
架构图更新章节：不适用；既有 canonical child Thread roster -> Workspace scene -> Task Rail GUI 数据流未新增 owner。
责任开发者确认：root，2026-07-14
确认内容：`canonicalChildren` 已贯穿 AgentChatWorkspace scene、`useWorkspaceConversationSceneRuntime`、`useWorkspaceTaskRailRuntime`、TaskCenterUtilityToolbar 与 Task Rail ViewModel；Task Rail 不再接受 `childSubagentSessions`。状态映射为 pendingInit/running -> active，completed/shutdown -> completed，errored/notFound/interrupted -> 需处理，保证七态不静默丢失。focused 四组 78/78、最终映射 7/7、typecheck、legacy report 0/0/0、`npm run verify:gui-smoke` 与 claimed diff check 通过。Inputbar、Harness 与 legacy DTO/state/metrics 仍属后续。
```

### 9.20t S6r canonical Inputbar and landing subtask stats 确认

```text
架构影响：非重大；将 landing task card、MessageList 和 Inputbar runtime status 的子任务统计从无 current producer 的 legacy session detail roster 切换到既有 canonical child Thread summaries，不改变 App Server protocol、Thread schema、Electron host、session state owner 或用户可见文案。
架构图更新章节：不适用；既有 canonical child Thread roster -> Workspace scene -> landing/MessageList/Inputbar GUI 数据流未新增 owner。
责任开发者确认：root，2026-07-14
确认内容：`canonicalChildren` 已从 Workspace scene 贯穿 landing task card、MessageList timeline state 和 Inputbar runtime status；上述 surface 不再接受 `childSubagentSessions`，projection deferral 也不再搬运空 legacy roster。统一七态统计为 pendingInit/running -> active，completed/shutdown -> completed，errored/notFound/interrupted -> failed。focused 6 files/41 tests、typecheck、exact ESLint/Prettier、legacy report 0/0/0、`npm run verify:gui-smoke` 与 claimed diff check 通过。session DTO/state/normalizer/API fixture/export metrics 仍属后续 contract 删除切片。
```

### 9.20u S6s legacy SubAgent session contract retirement 确认

```text
架构影响：非重大；删除无 current producer/consumer 的 Renderer session roster DTO/state/normalizer/fixture 与 raw export metrics fallback，并让已有 canonical thread family/AgentGraph 承接 parent identity 和 active child count；不改变 App Server protocol、Thread schema、Electron command、export response schema 或 RuntimeCore owner。
架构图更新章节：不适用；既有 App Server -> canonical Thread family/AgentGraph -> GUI/export 数据流未新增 owner。
责任开发者确认：root，2026-07-14
确认内容：React session snapshot/hooks/Workspace 不再持有 child/parent roster；session API 删除 AgentSubagentSessionInfo/ParentContext/SkillInfo 和 child/sibling/parent keys，两个 object-spread 边界只允许删除旧 key；Workspace parent visibility 只读 useCanonicalChildThreads.hasParentThread；export activeSubagentCount 只统计 canonical AgentGraph direct open children 中 PendingInit/Running 状态。React 255/255 + final 5/5、API 60/60 + related clientFactory 1/1、Rust focused 2/2、typecheck、exact lint/format/rustfmt/diff、legacy report 0/0/0 与 GUI smoke 通过。Rust related 被未触及 MCP stdio stack overflow/SIGABRT 阻断；完整 clientFactory 唯一失败为未触及 turn-lifecycle readThread 旧期望。
```

### 9.20 S4r2 App Server reverse JSON-RPC 确认

```text
架构影响：重大；在既有 JSONL transport 上新增 App Server -> Renderer 的 typed server-request 方向、独立 method catalog kind、outer request waiter 与 Renderer dispatcher，不新增 Electron 业务后端或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 4 节 Electron Desktop Host、第 6.1 节 App Server 与协议组、第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 domain token 与 outer JSON-RPC id 双层 identity、boot UUID + counter、请求 `_meta` 保真、Response/Error exact remove-once、aborted wait remove-on-drop、ambiguous client fail closed、Renderer connection-scoped in-flight/settled at-most-once、unknown/duplicate/late/disconnect fail closed、notification/request 不偷 client response、Electron 仅 JSONL 转发、Renderer method dispatcher 与错误码、nullable turn/parent correlation，以及 generic Approval/request_user_input/mock fallback 禁止复用。S4r2 当时只交付 foundation；后续 S4r3-S4r9/S4ak 已完成 adapter、GUI、thread-owned runtime、fault isolation、runtime capability 与真实 Electron Gate B。按 Codex `5c19155cbd93`，server-originated elicitation 仍是瞬时 reverse request，不进入 canonical Item、`thread/read` 或 durable projection。
```

### 9.21 S4r5-S4r6 MCP elicitation GUI 闭环确认

```text
架构影响：重大；在既有 reverse JSON-RPC 主链补 response `_meta` raw-wire 保真、connection-owned `serverRequest/resolved` terminal notification、Renderer AbortSignal 撤销语义与主窗口全局 GUI 表单，不新增 Electron 业务后端、兼容层、Approval/ask-user 复用或生产 mock fallback。
架构图更新章节：internal/aiprompts/architecture.md 第 6.1 节 App Server 与协议组、第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：S4r5-S4r6 protocol、renderer 和 GUI form foundation 已集成验证；公开 wire 固定为 required `threadId` + nullable `turnId` + required `serverName` + `mode: "form"`，不含 `sessionId`、`parentToolCallId` 或 raw MCP identity。该阶段的 per-Session runtime owner blocker 已由 S4r8 关闭，server startup blocker 由 S4r9 关闭，capability advertisement 与防假绿 Gate B 由 S4ak 关闭。全局 `McpClientManager` 仍只作控制面，management nested elicitation 在无可信 thread owner 时 fail closed。
```

### 9.22 S4r8 MCP runtime thread owner 确认

```text
架构影响：重大；`AgentRuntimeState[sessionId] -> McpThreadRuntime` 在创建期固定 canonical threadId，且独立持有 runtime manager、RMCP connection 与 bridge registry。App Server reverse request 只公开 threadId、nullable turnId、serverName 与 form payload；per-call scope 只保留 turn correlation。全局 McpClientManager 继续只负责控制面，不新增 durable elicitation Item、read model、transport 或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 runtime 只从 management typed server specs 创建自有 connection generation，配置不变则复用、变更则原子发布新 generation，旧 step 继续持有旧 handle。McpCallScope 只保留 nullable turn correlation；session/thread owner 不再随 call 传递或推断；management nested elicitation Decline。公开 wire 不含 sessionId/parentToolCallId/raw MCP id/progress token、session/turn thread mismatch fail closed、delete 按 exact (sessionId, threadId) close runtime、session A 取消不影响 B 且 forwarded waiter 必须等 serverRequest/resolved terminal。2026-07-14 发现的默认 Playwright MCP startup E404 已由 S4r9 per-server isolation 关闭；S4ak 后续只让具备 immutable runtime owner 的 client 广告 form capability，并以真实 Electron Gate B 证明 runtime/management 分流。
```

### 9.22b S4r9 MCP runtime server fault isolation 确认

```text
架构影响：重大；runtime MCP generation 的 startup policy 从“任一 enabled server fail 整个 turn”改为 Codex 对齐的 per-server isolation：optional server absent，required server 才拒绝 candidate generation。MCP runtime owner、Electron/App Server JSON-RPC、Thread/Turn/Item 与 GUI 链不新增平行路径。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-14
确认内容：已核对 runtime manager 只建立自有 RMCP connection，optional failure 无 bridge route，required replacement failure 关闭候选而不替换或取消旧 generation；真实 Electron/preload/app_server_handle_json_lines/App Server/runtime/Renderer Gate B 保留故障 Playwright server 且完整通过 provider tool -> form -> accept -> second provider request -> final text。
```

### 9.22a S4r8 LocalAppDataSource fixture sync 确认

```text
架构影响：非重大；测试 fixture 与既有 LocalAppDataSource router owner 同步，trait implementation 直接读取已拥有的 router field；不新增 transport、runtime owner、协议、GUI、持久化或 mock fallback。
架构图更新章节：不适用；既有 Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore/tool-runtime 的依赖方向不变。
责任开发者确认：refactor-v2-coordinator，2026-07-14
确认内容：真实 stdio MCP fixture、S4u mailbox store 与 S4v AgentControl focused test 已在 shared fixture 修复后分别 1/1、4/4、6/6 通过。默认 macOS test worker stack 对该既有 stdio fixture 会溢出，遵循仓库已有 RUST_MIN_STACK=8388608 test-runner 口径；这不是生产路径 fallback，也不改变 S4w 仍待 hot write set 释放的事实。
```

### 9.23 S7 v2 skeleton closeout 架构确认

```text
架构影响：非重大；S7 不新增业务实现、协议、runtime owner、Electron 后端、compat 或 fallback，只汇总并确认 S0-S6 已落地的 Codex-first GUI 架构与当前工作树证据。
架构图更新章节：不适用；本轮只读复核 internal/aiprompts/architecture.md，既有 Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item -> GUI 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：已核对 Lime 作为 GUI 产品保留 Renderer 交互与可视投影，但 Agent loop、状态机、工具/MCP/Skills/Multi-Agent、历史恢复和 canonical read model 只向 Codex 语义收敛；provider capability/lowering 与多模态 part 继续按 OpenCode owner 边界收敛。fresh Approval cancel Gate B 证明 recordCount=1、Turn canceled、pendingRequestCount=0 且 GUI composer 恢复；GUI smoke、lint、typecheck、legacy 0/0/0、scripts governance 和 diff 通过。S7 只标记 skeleton closeout，因 verify:local baseline assertion、release docs boundary、Skills Provider 鉴权、PR architecture context、S5 compat consumer 与 S6o GUI/session roster refinement 未关闭，不标记 archive-ready 或 v2 全部完成。
```

### 9.24 S2o-S2q per-item lifecycle 与 canonical presentation boundary 确认

```text
架构影响：重大；provider Text/Reasoning 的 Start/Delta/End 从 turn-family fallback 收敛为 canonical-Turn-and-sampling-attempt-scoped per-item identity，并把 agentSession/read 明确定义为 ThreadStore-backed 产品 presentation endpoint。未新增协议 method、Electron 后端、第二 read model、compat 或生产 mock fallback。
架构图更新章节：internal/aiprompts/architecture.md 第 6.2 节 Agent Runtime、Thread 与持久化，第 7.1 节事件与完成态，第 8.1 节 Turn 请求字段归属。
责任开发者确认：root，2026-07-15
确认内容：已对照 Codex ResponseItem lifecycle，核对 provider raw ID 会在 sampling attempt 间及同一 Thread 的后续 Turn 复用，故 current Agent Item ID 必须同时包含 canonical Turn、sampling attempt、family 与 source item；Message/Reasoning state 按 item identity 隔离，Plan 使用独立 revision identity 并仅记录 sourceItemId，terminal Item 拒绝 late delta，turn terminal 不合成 Item completion。thread/read/list/... 继续负责 canonical identity/control；agentSession/read 从同一 ThreadStore read model 组织 GUI detail。缺失 detail 的 Renderer synthesis 已删除，production App Server 只能显式 with_runtime 构造；event/app-data fallback 与 AppServer::new 只存在于 test build/evidence。focused/related Rust、Renderer、typecheck、真实 Electron history fixture、通用 GUI smoke与 AgentControl managed Gate B 已验证。
```

### 9.25 S3g-S3i provider 单代数退役确认

```text
架构影响：重大；删除 runtime-core 与 model-provider 中重复的旧 provider-neutral request/event algebra 和 generic mapper，使 OpenCode 对齐的 canonical content/capability/lowering 保持唯一 owner。未新增协议、Electron 后端、GUI 状态、compat 或 fallback。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：root，2026-07-15
确认内容：已核对 current chat/responses/anthropic provider 只由 model-provider current_client 消费 runtime-core canonical Request/ContentPart/LlmEvent；图片和视频只调用 canonical media body builder。旧 LlmRequest、ProviderWireRequest、LlmEvent -> LlmRuntimeEvent mapper、generic chat/gemini/ollama lowering无生产 consumer，8 个 pure-old文件已删除并受 physical/symbol guard 保护。runtime-core 43/43、model-provider 126/126、media-runtime 51/51、route integration 9/9 与 client contract 288 通过；全 workspace cargo fmt 仅被 active MCP slice 的非本写集格式差异阻断，S3 claimed files exact rustfmt 通过。
```

### 9.26 S2t-S2v canonical persistence closeout 确认

```text
架构影响：重大；删除 app-data session hydration/read fallback，统一 canonical Item ordinal owner，并把普通 ThreadStore projection 失败从 warning-and-continue 收紧为 EventLog-first fail closed。未新增协议 method、Electron 后端、第二 read model、compat、store renumbering 或生产 mock fallback。
架构图更新章节：internal/aiprompts/architecture.md 第 6.2 节 Agent Runtime、Thread 与持久化，第 7.1 节事件与完成态。
责任开发者确认：root，2026-07-15
确认内容：已核对 RuntimeCore/EventLog/ProjectionStore/ThreadStore 是 session read/resume 唯一 current owner；首次 Item 对应的 Lime outer AgentEvent.sequence 是 canonical ordinal 唯一事实源，后续 lifecycle 保留首次 ordinal，Codex sourceEventSeq 仅为 provenance。EventLog append 后只有 canonical ThreadStore apply 成功才允许返回 notification 与推进内存 history，失败 tail 留给 restart/repair。S2t focused 100/100、S2u projection 40/40 + store 10/10 + import 13/13、S2v focused 1/1 + external sequence 5/5、App Server 1118/1118、GUI smoke、legacy 0/0/0 与 scoped rustfmt/diff 通过；PR 级 architecture confirmation 仍须在实际 PR body 中填写并由门禁复核。
```

### 9.27 S7ae Content Factory synthetic contract probe retirement 确认

```text
架构影响：非重大；只删除 Content Factory 产品 fixture 尾部额外制造的 contract-mismatch Turn、专用 waiter/summary/常量/assertion，并把 contract fail-closed 与通用 worker failure projection 保留在既有 App Server focused Rust owner。不改变 Electron/App Server 协议、RuntimeCore、Thread/Turn/Item schema、Renderer、生产 mock policy 或 GUI 产品结构。
架构图更新章节：不适用；既有 Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> read model -> GUI 主链未新增或迁移 owner。
责任开发者确认：root，2026-07-15
确认内容：Content Factory Electron Gate B 53/53 通过，actionable console error 为 0；真实 worker dogfood、既有失败 worker evidence、Article Editor、artifact read、编辑恢复与 workflow read/cancel/retry 均保留。contract-reject request、summary、常量与 assertion 为 0。聚合门禁后序发现的 Coding Workbench recovery 跨 Turn fixture identity 复用已独立分配给 S7af，不恢复本 synthetic probe。
```

### 9.28 S7af Coding Workbench recovery Turn identity fixture 确认

```text
架构影响：非重大；修复 deterministic Electron external backend fixture 的跨 Turn canonical Item/operation identity 复用，并让失败路径覆盖当前 backend ledger evidence。不改变 RuntimeCore、ThreadStore、read model、协议、Renderer 或生产 GUI owner。
架构图更新章节：不适用；S2v EventLog-first canonical projection fail-closed 保持 current，fixture 改为遵守既有 Thread/Turn/Item identity 约束。
责任开发者确认：root，2026-07-15
确认内容：recovery Turn 的 tool/file/patch/command/test execution ID 与 output/diff/content/checkpoint refs 绑定真实 recovery turnId；首轮失败 command/test/output ID 只保留为 recovery source refs。focused 6/6、syntax/format/diff、scripts governance 与 Coding Workbench Electron Gate B 通过；initial/recovery latest Turn 均 completed，recoveryExecutionIdsTurnScoped=true，invoke/console/page error 为 0。
```

### 9.29 S7ag 最终本地门禁与 ProjectShell 环境归一化确认

```text
架构影响：非重大；ProjectShellManager 仍是项目 Shell PTY 的唯一 current owner，只把已定义但为空的颜色环境变量归一化到既有默认值。不新增协议、Electron IPC、App Server method、runtime owner、compat 或 mock fallback。
架构图更新章节：不适用；Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item -> GUI 主链未变化。
责任开发者确认：root，2026-07-15
确认内容：`npm run test:resume` 真实完成 smart suite 110/110；修复前首次并发 Rust gate 的 3 个时序/PTY 失败已逐项 exact 复验，其中 ProjectShell 的空 `COLORTERM` 已在 current owner 修正；修复后 `npm run test:rust:changed` 通过（App Server 1119/1119），legacy report 0/0/0、rustfmt、diff check 与真实 Electron GUI smoke 全部通过。完整证据见 `internal/research/refactor/v2/13-evidence/2026-07-15-s7ag-final-local-gates-and-project-shell-env.md`。本地 architecture confirmation 因缺少 PR event/base 按预期阻塞，S7 保持 `not-archive-ready`。
```

### 9.30 S6t Canonical parent Thread residual 确认

```text
架构影响：非重大；只把既有 canonical Thread parent identity 贯彻到 Agent UI projection、共享 projection package、Evidence Pack team facts 与 Multi-Agent fixture，不新增协议 method、Electron 后端、runtime owner、compat 或 fallback。
架构图更新章节：不适用；Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore -> Thread/Turn/Item projection -> GUI 主链及 owner 未变化。
责任开发者确认：root，2026-07-15
确认内容：已核对产品 `parentSessionId(s)` 从 GUI/projection/Evidence Pack current contract 删除，parent identity 只读 canonical `parentThreadId(s)`；AgentControl 内部 `parent_session_id` 仍描述 RuntimeCore loaded-parent session 控制边界，不属于本切片 legacy surface。projection 10/10、Renderer/governance 32/32、fixture guards 71/71 与 Rust team facts 1/1 通过。原 synthetic Electron 41/41 与 scenario 11/11 只作为历史 fixture 结果，不再计产品 Gate；current proof 为 S4ah 28/28 canonical AgentControl visible DOM Gate B。
```

## 10. 完成定义

v2 实施不能因为“几个进程都有改动”而标记完成。每个 slice 必须同时具备：

1. 唯一 owner 和不相交写集。
2. copy/adapt/delete 记录和上游 provenance。
3. positive/negative tests、协议/fixture 同步。
4. 正常、失败、中断、队列、stale event、resume/pagination 中与 slice 相关的证据。
5. handoff 已发布、锁已释放、下一 owner 已明确。

最终完成由 coordinator 统一执行 `npm run verify:local`、相关 GUI Gate B 和治理扫描，并在 `internal/research/refactor/v2/13-evidence/` 写入不可变 evidence。
