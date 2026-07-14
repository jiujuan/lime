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
| `S7y-approval-cold-read-typed-response` | `runtime/read_model.rs`、新增 `runtime/read_model/approval.rs`、read model tests、Agent protocol TS source/declaration、timeline Approval view-model/tests | cold read terminal Approval response 输出 canonical `{ decision, decision_scope, reason_code }`，pending 为 null；wire 保持 `approved/approvedForSession/denied/timedOut/abort`，仅 GUI view-model lower 为现有显示值。不得新增 method、IPC、mock、legacy scalar parser或触碰 conversation import/materializer。 |

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
| `S4aa-agent-terminal-mailbox-activity` | canonical child terminal -> direct-parent durable Result mailbox；EventLog crash recovery；steer-first wait | 已完成 / focused-Rust-App-Server-and-GUI-smoke-validated / product-chain-pending：completed/failed 先 canonical 后写 direct-parent QueueOnly Result，interrupted/canceled 不写；Result 作为 assistant canonical Item 并保留 mailbox metadata，completed 长文本不静默截断。两类 EventLog-first crash window、repairable/empty-prefix tail、direct-parent isolation、pre-existing/new steer 优先、deadline final recovery、SQLite CAS 与 RuntimeCore/EventLog single-consume 已固定。graph/mailbox 1+1、canonical graph 8、store/delivery/terminal/EventLog/control 7+6+13+24+12、最终 App Server library check 与通用 GUI smoke 通过；JSON-RPC/Multi-Agent Gate B 未声明完成。 |
| `S4ac-wait-agent-canonical-item` | `agent/src/protocol.rs` 与独立 AgentControl projection tests | 已完成 / focused-and-lime-agent-validated：`wait_agent` Started/Completed 直接产同一 canonical `CollabAgentToolCall::Wait` Item，terminal ToolOutput 保真；list/non-AgentControl 继续为 generic Tool。S4aa 已完成并释放 gateway，targeted SubAgent activity 可由 S4ad 用真实 ThreadId 接入。focused 1、protocol 19、current provider 13 与 lime-agent check 通过；无协议/schema/GUI 改动。 |
| `S4ad-targeted-subagent-producer` | App Server AgentControl gateway typed fact、tool-runtime internal transport、current provider canonical emitter、SubAgent activity protocol/schema | 已完成实现 / focused-Rust-and-schema-validated / aggregate-gates-running：spawn 成功追加真实 child ThreadId 的 Started；send/followup 成功追加 resolved target ThreadId 的 Interacted；interrupt 成功追加 Interrupted。四工具保留普通 Tool lifecycle，并在成功 terminal 后追加独立稳定 SubAgent Item；typed fact 不进入 model output、structured content 或 Tool metadata，失败/错配/wait/list 不伪造 activity。三新 activity 为 current；S4ad 临时保留七个 historical wire 的决定已被 S4ae 按 Codex 三值与无兼容前提推翻，七旧值现为 `dead / forbidden-to-restore`。tool-runtime 5、agent-protocol 1、lime-agent agent_control 5/current provider 14、App Server agent_control 12、schema fixture 1 已通过；contracts/current fixture 待最终记录。 |
| `S4ae-canonical-subagent-gui` | canonical cold/live SubAgent GUI、activity projection/i18n、synthetic sidecar 删除、三值协议收口 | Gate B AgentControl 修复中：GUI/protocol focused 实现已完成；重启 current Sidecar 后排除旧 binary/SQLite CANTOPEN，真实 `agent-control-tools` 证明 `spawn_agent` 已提交 child Thread/Open edge/identity/mailbox，但同步等待 child `RuntimeCore::start_turn` terminal，且 child 未继承父 turn provider/runtime options，导致父 Tool 卡在 `provider.request.started`。当前窄修复要求 durable commit 后立即返回、后台 child turn 继承有效 provider/runtime request，并以 canonical failed turn 或 pending mailbox 保留失败可观测性；禁止恢复 `real:subagent:*`、activity `worker.notification` 或第二队列。七旧 activity 值仍为 `dead / forbidden-to-restore`。 |
| `S4r1-mcp-elicitation-router` | `mcp/src/{elicitation,elicitation_tests,client,manager}.rs` 与 lifecycle/Cargo feature | 已完成：复制并强化 Codex connection-shared request router 与 RMCP form handler；opaque request ID、replacement 后旧 waiter 精确响应、bounded single-consumer、cancel/consumer-drop/`cancel_all` cleanup、typed action/content/schema 校验与 request `_meta` 已通过 focused 13、lime-mcp 128 和 App Server check。capability 仍保持 absent。 |
| `S4r2-app-server-reverse-jsonrpc` | `app-server-protocol` serverRequest catalog/schema、App Server broker、TS connection、Electron drain、Renderer event bus/dispatcher | 已完成并经 S4r2b correctness closeout：outer ID 使用 boot UUID + counter，aborted wait remove-on-drop，ambiguous client fail closed，Renderer 对 connection-scoped in-flight/settled id at-most-once。App Server 7、protocol 45+1、package 63、Electron 22、Renderer 6、contracts 290、legacy 0/0/0 与 GUI smoke 证据成立。S4r3 adapter、GUI、五语言、thread-owned runtime connection 和专用 Gate B 仍是后续；MCP elicitation 不产生 canonical Item。 |
| `S4r3-mcp-elicitation-adapter` | `app-server/src/{local_data_source,main,lib,mcp_elicitation}.rs` | 已完成 backend/transport foundation：启动期 clone 唯一 manager router，App Server transport lifecycle 并发 pump typed reverse request；R1 token 只留在 adapter task，R2 outer id 只留在 JSON-RPC，运行期不重锁 manager。真实 RMCP duplex 走 R1→R2→R1 已通过，GUI/product blockers 仍保持 capability absent。 |
| `S4r4-mcp-active-timeout` | `mcp/src/{active_time,client,bridge_client,manager}.rs` 与 lifecycle/tools、Agent bridge | 已完成：复制 Codex `68a1d82a` connection-local counted pause/RAII/active-time timeout；真实 handler 在整个用户等待期持 guard，overlap 计数，取消立即生效。删除 manager 第二套 wall-clock timeout 与 wrapper/snapshot/Agent bridge 假 handler。focused 4、lime-mcp 132 与三 crate check 通过。 |
| `S4r5-mcp-response-meta` | `mcp/src/{elicitation,client_service,client,bridge_client,manager}.rs` 与 lifecycle/tools、Agent bridge | 并行实施中：复制 Codex custom `Service<RoleClient>`，只拦截 elicitation 并用 raw `CustomResult` 保真 result `_meta`；其余 request/notification/info 委托现有 handler，stdio/HTTP 禁止残留 typed service 旁路。 |
| `S4r6a-server-request-resolved` | `app-server-protocol` resolved notification/schema/generated client、`app-server/src/{server_request,mcp_elicitation,lib}.rs` | 并行实施中：复制 Codex `serverRequest/resolved` terminal notification，并把 request id/connection owner 保留在既有 S4r2 broker；正常、错误、RMCP cancellation 均向创建 outer request 的同一 client 有序发送 resolved，不新增第二套 pending 表或 transport。 |
| `S4r6b-mcp-elicitation-gui` | `src/lib/api/{appServerEventBus,appServerServerRequest,mcpServerElicitation}.ts`、全局 MCP elicitation modal、`App.tsx`、五语言 `agent.json` 与定向测试 | 集成实施中：Renderer dispatcher 使用 per-request `AbortController` 与 settled tombstone，支持 resolved 先于 request；主窗口根部一次性注册 typed handler，按 MCP primitive schema 渲染 GUI 表单并在远端撤销后静默关闭。重复 GUI claim 已立即合并到先落地的 `S4r6a-server-request-form-gui` 单一 owner，未保留双实现；禁止复用 Approval、ask-user、生产 mock 或页面级挂载。 |
| `S4r7c-canonical-elicitation-producer` | 无 | 已 superseded：Codex `5c19155cbd93` 定义 MCP server elicitation 为 thread-scoped、turn-correlated 的 in-memory reverse JSON-RPC waiter；不创建 durable Item、read-model projection 或 persistence producer。已删除本 slice 写入的 durable surface，禁止恢复。 |
| `S4r8-mcp-runtime-thread-owner` | `tool-runtime/src/mcp_connection/**`、`mcp/src/{manager,bridge_client,client,elicitation}.rs`、`agent/src/mcp_bridge.rs`、`app-server/src/{local_data_source,local_data_source/mcp}.rs` 与定向 tests | owner/lifecycle foundation 已完成：runtime MCP tool call 在 provider 边界构造完整 canonical scope，并只将 public `threadId`/nullable `turnId` lower 到 reverse request；management 无 scope nested elicitation fail closed。router 按 opaque id 精确结算，同 server 跨 thread 不串线；已转发 cancel/shutdown 保持 `serverRequest/resolved -> RMCP terminal`，未转发 waiter 直接 Cancel。未新建 durable Item/read model，未公开 `sessionId`/`parentToolCallId`/raw token，elicitation capability 继续 absent。最新真实 Gate B 被 runtime 单 server startup failure 阻断，归 S4r9；不得再标为已验证。 |
| `S4r9-mcp-runtime-server-fault-isolation` | `agent/runtime_state/{,mcp_runtime,mcp_runtime_tests}.rs`、定向 Rust 与 Gate B evidence | 已完成：Codex 式并发 per-server runtime startup 已收敛到 `McpThreadRuntime` current owner。optional failure 仅使该 server absent；required failure 关闭候选 connection、拒绝 replacement 并保留已发布 generation/pending elicitation；健康 server snapshot 原子发布，不复用 management `RunningService`、global registry 或 mock。故障默认 Playwright MCP + 健康 stdio elicitation MCP 的真实 Electron Gate B 已通过。 |
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
| S1 | canonical-live-renderer-projection-Gate-B-validated / deprecated-agentSession-cleanup-pending | S1-coordinator -> coordinator | S1 claims + `.lime/refactor-v2/claims/S1j-canonical-live-renderer-projection-coordinator.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | S1 handoffs + `20260712T143428Z-S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `20260712T150644Z-S1c-renderer-sequence-gate-followup-coordinator.md` + `20260713T031243Z-S1j-canonical-live-renderer-projection-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s1j-canonical-live-renderer-projection.md` | production Renderer 的 Thread/Turn/Item lifecycle 只消费 canonical entity；raw 仅保留 provider/runtime status/image/media side-channel，未知 raw/lifecycle fail-closed。Coding Workbench 首轮失败、recovery 与终态 artifact 审查 Gate B 已通过；deprecated `AgentSession` envelope/namespace 删除仍待 S5/S6。 |
| S1b | ready-for-review / coordinator-validated | s1b-request-serialization-fix -> S2e canonical handler | `.lime/refactor-v2/claims/S1b-recovery-final-s1b-request-serialization-fix.md` | `20260712T104434Z-S1b-recovery-final-s1b-request-serialization-fix.md` + `20260712T121237Z-S1b-thread-identity-ownership-conflict.md` + `2026-07-12-s1f-s2e-canonical-thread-read.md` | Thread key 使用 RuntimeCore 只读 session→thread 解析；双 session FIFO、mismatch、SESSION_NOT_FOUND、fairness/admission 共 15 tests 在 canonical handler 合并后的当前树复测通过 |
| S1-contract-correct | ready-for-review | protocol_s1_fix | `.lime/refactor-v2/claims/S1-contract-correct-protocol-contract-a.md` | `20260712T090659Z-S1-contract-correct-protocol_s1_fix.md` | Codex status、typed ThreadItem、ItemId prefix、Turn/Thread fields、pagination contract 与 provenance 已落地；需 coordinator 做跨层 consumer cutover |
| S1c | ready-for-review / renderer-gate-cutover / domain-side-channel-Gate-B-validated | s1-canonical-cutover -> coordinator | `.lime/refactor-v2/claims/S1c-canonical-cutover-s1-canonical-cutover.md` + `.lime/refactor-v2/claims/S1c-renderer-sequence-gate-followup-coordinator.md` | `20260712T124000Z-S1c-renderer-sequence-gate-cutover.md` + `20260712T150644Z-S1c-renderer-sequence-gate-followup-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1c-image-domain-side-channel.md` | package 与 Renderer sequence gate 只接受 canonical lifecycle；旧 ID normalization/tool terminal fanout 已删除；显式 allowlist 仅旁路 provider diagnostic、runtime.status 与 image_task domain notifications，未知 raw/lifecycle 仍 fail-closed；13 focused tests、typecheck、图片命令与普通画图意图 Gate B 通过 |
| S1g-canonical-live-producer | ready-for-review / coordinator-integrated | s1g-canonical-live-producer -> coordinator | `.lime/refactor-v2/claims/S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `.lime/refactor-v2/claims/S1g-notification-json-assertions-coordinator.md` | `20260712T143428Z-S1g-canonical-live-producer-s1g-canonical-live-producer.md` + `20260712T150644Z-S1g-notification-json-assertions-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s1g-canonical-live-producer.md` | durable append 前 materialize notification-only canonical Turn/Item clone，source payload 不改写，`turn.canceled -> Interrupted`，无 turn compaction 保留 raw；stdio JSON-RPC 明确验证 canonical Item，最新 sessions 30/30 |
| S1j-canonical-live-renderer-projection | completed / coordinator-validated / Gate-B-passed | coordinator | `.lime/refactor-v2/claims/S1j-canonical-live-renderer-projection-coordinator.md` | `20260713T031243Z-S1j-canonical-live-renderer-projection-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s1j-canonical-live-renderer-projection.md` | canonical Item 覆盖 Tool/MCP/Approval/Command/File/Media/SubAgent/Compaction/Extension，Approval terminal 可投影 resolved；冻结 raw fixture 仅走 test-only helper。104 项 canonical 投影、18 项 Workbench、21 项 scene、41 项 package projection、typecheck、contracts 290 checks 与真实 Electron Gate B 通过。此前并行 S4j draft 中间态造成的 sidecar 重编 blocker 已由 typed source contract、`cargo check` 与 conversation import 48/48 解除。 |
| S1h-notification-test-correction | ready-for-review / validated | coordinator | `.lime/refactor-v2/claims/S1h-notification-test-correction-coordinator.md` | `20260712T150612Z-S1h-notification-test-correction-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2g-s1h-canonical-fixture-corrections.md` | notification JSONL 回归先断言 canonical Item，再移除 notification-only 字段比较 durable source payload；定向 JSONL loop 1/1 |
| S1f | ready-for-review / handler-validated | s1f-thread-read-protocol -> S2e canonical handler | `.lime/refactor-v2/claims/S1f-thread-read-protocol-s1f-thread-read-protocol.md` + `.lime/refactor-v2/claims/S2e-canonical-read-handler-coordinator.md` | `20260712T120619Z-S1f-thread-read-protocol-s1f-thread-read-protocol.md` + `20260712T123500Z-S2e-canonical-write-read-coordinator.md` + `2026-07-12-s1f-s2e-canonical-thread-read.md` | 四个 canonical Thread read protocol/schema/Rust+TS client、direct ThreadStore handler、shared-read metadata 与 contracts 已在当前树通过 |
| S1d | ready-for-review / package-cleanup-complete | runtime-client-a -> runtime-client-cleanup-a | `.lime/refactor-v2/claims/S1d-runtime-client-a.md` + `.lime/refactor-v2/claims/S1e-runtime-client-cleanup-a.md` | `20260712T104756Z-S1d-runtime-client-a.md` + `20260712T110746Z-S1e-runtime-client-cleanup-a.md` | production/package API/tests 已只消费 canonical lifecycle；raw 仅保留验证后的 media non-thread channel；18 tests 与 typecheck 通过，旧 raw mapper/export/tests 和 no-op schema middleware 已删除 |
| S2 | completed / canonical-write-read-and-message-plan-lifecycle-Gate-B-validated / imported-message-plan-lifecycle-closed | coordinator -> root | S2a-S2n claims | S2a-S2n handoffs + `20260712T123500Z-S2e-canonical-write-read-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2f-empty-thread-create.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s2g-s1h-canonical-fixture-corrections.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s2-canonical-message-plan-lifecycle.md` + S2m/S2n evidence | event-driven typed write/read、empty canonical Thread、user/agent completed Item 与 typed Plan lifecycle 已验证；Plan delta/final 共享 turn-scoped revision，final snapshot authoritative，restart/GUI history hydrate 保真，Plan-only 不创建空 AgentMessage。Codex imported Plan 与 User/Agent Message 均保持 source identity、canonical lifecycle 和 source ordinal，关闭 S2l related failure。 |
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
| S2j-projection-thread-identity | completed / focused-validated | coordinator | `.lime/refactor-v2/claims/S2j-projection-thread-identity-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s2j-projection-thread-identity.md` | ProjectionStore 已删除 `threadId = sessionId` fallback；首次缺 identity、后续 explicit conflict、turn 跨 owner reuse 与 repair clear/replay rollback 均 fail closed。`projection_store_tests` 23/23、rustfmt/diff 通过。Electron synthetic admission identity 修复是独立 Host write set；旧 turn first-notification fallback race 已登记给 Host owner。 |
| S2k-canonical-message-plan-lifecycle | completed / focused-contract-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S2-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2-canonical-message-plan-lifecycle.md` | Codex 对齐的 user/agent completed lifecycle、typed Plan、turn-scoped revision identity、authoritative final snapshot、restart/read model/GUI hydrate 与 Plan-only whitespace suppression 已完成。Rust focused、protocol、canonical reader、typecheck、694 types 零漂移、290 client checks 与 Plan history Electron Gate B 通过；完整 `test:contracts` 仅被无关已跟踪 release plan 的 docs ignore 边界阻断。 |
| S2l-canonical-history-repair | completed / focused-and-Gate-B-validated / related-import-concern-closed-by-S2m | root | `.lime/refactor-v2/claims/S2l-canonical-history-repair-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2l-canonical-history-repair.md` + S2l/S2m handoffs | canonical Item 的 live/history 展示统一使用 ordinal；持久化 Reasoning 接管反序临时 thinking 时重新插入正文前。TS 12/12、Rust 8+21、typecheck/lint、history Electron fixture、GUI smoke 与真实 CDP `thinking#6 -> text#314` 通过。原 related 1093/1094 的 completed Plan 唯一失败已由 S2m 关闭，当前 related app-server 1097/1097。 |
| S2m-conversation-import-plan-lifecycle | completed / focused-and-related-rust-validated | root | `.lime/refactor-v2/claims/S2m-conversation-import-plan-lifecycle-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2m-conversation-import-plan-lifecycle.md` + S2m handoff | Codex `item_completed(Plan.id)` 是 completed Plan 的 authoritative Item/revision identity；presentation/canonical read 同为 `item-plan-1`，不再按 turn/event 合成第二 identity。focused 2/2、related app-server 1097/1097、rustfmt/diff 通过。`events.rs` 1002 行，后续业务扩展前必须先拆 specialized event 子模块。 |
| S2n-conversation-import-message-lifecycle | completed / focused-related-rust-and-history-Gate-B-validated | root | `.lime/refactor-v2/claims/S2n-conversation-import-message-lifecycle-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s2n-conversation-import-message-lifecycle.md` + S2n handoff | Codex imported User/Agent Message 使用 source call ID / source event sequence 的稳定 identity 与 ordinal，并写入完整 `item.started` / presentation / `item.completed` lifecycle；focused 2/2、shared related app-server 1097/1097、rustfmt/diff 与 history Electron fixture 通过。 |
| S3 | production-canonical / retired-mapper-deleted | provider-a -> refactor-v2-coordinator | `.lime/refactor-v2/claims/S3f-provider-request-cutover-coordinator-provider-request-cutover.md` | `20260712T102744Z-S3d-provider-cutover-recovery.md` + `20260712T103500Z-S3e-media-event-cutover.md` + `20260712T105500Z-S3f-provider-request-cutover.md` + `20260712T115000Z-S3f-runtime-core-mapper-delete-validation.md` | provider stream、agent consumer、media RuntimeEvent 和媒体 request lowering 均走 canonical/current；retired runtime-core mapper、正向测试与导出已物理删除并补回流守卫，runtime-core 49、model-provider 118、contract 287 checks 通过 |
| S3c | completed / environment-blocker-resolved-by-S3e-S3f | provider-consumer-a -> coordinator | `.lime/refactor-v2/claims/S3c-provider-consumer-a.md` | S3c handoff + S3e/S3f evidence | media consumer 已迁移；历史 ENOSPC 已由 S3e/S3f 的 media-runtime 50+51、route integration 9+9 与 model-provider 118 tests 关闭，不再是 current blocker。 |
| S3d | completed / stale-recovered-and-current-tree-validated | coordinator-s3d-recovery -> root | S3d provider client/cutover/recovery claims | S3d recovery handoffs + active-claim audit handoff | CurrentProviderEvent 投影已删除；既有 model-provider、App Server provider history/tool event 验证保持，fresh current-tree `provider_turn` 10/10 通过并覆盖 reasoning-only 无用户可见输出 fail closed。 |
| S4 | canonical-tool-and-approval-restart-ready / S4h-completed / S4i-typed-skills-and-stable-read-ready / S4l-step-snapshot-ready / S4m-output-media-residuals-completed / S4n-dead-stream-surface-deleted / S4o-control-plane-owner-split-completed / S4p-resource-identity-completed / S4q-prompt-identity-completed / S4s-sampling-fail-closed / S4t-edge-store-completed / S4u-durable-mailbox-storage-validated / S4v-runtime-control-boundary-validated / S4w-mailbox-consumer-focused-validated / S4x-agent-control-gateway-focused-validated / S4y-dead-team-surface-deleted / S4z-restart-on-demand-validated / S4aa-terminal-mailbox-recovery-validated / S4ab-v1-projection-alias-dead / S4ac-wait-collab-item-validated / broader-control-plane-pending | coordinator | S4a-S4q + S4s/S4t/S4u/S4v/S4w/S4x/S4y/S4z/S4aa/S4ab/S4ac claims + `.lime/refactor-v2/claims/S4e-approval-restart-production-coordinator.md` | S4a-S4q + S4s/S4t/S4u/S4v/S4w/S4x/S4y/S4z/S4aa/S4ab/S4ac handoffs/evidence + `20260712T192327Z-S4e-approval-restart-production-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4w-agent-mailbox-production-consumer.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4x-agent-control-tool-gateway.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4y-dead-team-tool-surface.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4z-agent-control-restart-on-demand.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4aa-agent-terminal-mailbox-activity.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4ab-legacy-collab-projection-boundary.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4ac-wait-agent-canonical-item.md` | RuntimeTool、canonical Tool Item、provider history/output refs/read model/evidence/media、typed approval/restart、raw lifecycle 删除、typed Skills stable-id read、MCP sampling-step Tool snapshot、独立 GUI live management owner、Resource/Prompt 精确 target、sampling fail-closed、AgentGraphStore edge persistence、durable root-tree identity/mailbox storage、RuntimeCore loaded-parent graph control boundary及 mailbox internal consumer 已收敛。S4x 已将六个 AgentControl 工具通过 per-turn opaque gateway 接入 current provider；S4y 已删除旧 Team/collab_agent 可执行 surface 并补回流守卫；S4z 已证明重启后 root-only hydrate 与 exact-target control；S4aa 已接通 direct-parent terminal result、两类 crash recovery 与 steer-first wait；S4ab 已删除 V1 projection alias；S4ac 已把 wait_agent lifecycle 收敛为 canonical Collab Wait Item。JSON-RPC/GUI 与真实 Multi-Agent Gate B 仍为后续 current slice；targeted SubAgent producer 由 S4ad 继续。 |
| S4a-tool-core | ready-for-review / production-consumer-present | tool-core-a -> runtime-tools-production-a | `.lime/refactor-v2/claims/S4a-tool-core-tool-core-a.md` + `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | `20260712T122741Z-S4a-tool-core-tool-core-a.md` + `20260712T131753Z-S4c-tool-production-wiring-runtime-tools-production-a.md` + `20260712T132422Z-S4c-tool-production-wiring-ordering-correction.md` | canonical spec/executor/emitter/output contract 97 tests 通过；S4c 已接入 current provider 生产 caller，旧 AgentEvent/App Server raw mapper 与残余 backend/core stream DTO 已由 S4d-S4n 删除。 |
| S4b-display-items | ready-for-review / review-and-governance-corrected | coordinator | `.lime/refactor-v2/claims/S4b-display-items-coordinator.md` | `20260712T124000Z-S4b-review-resolved-without-decision.md` + `20260712T135000Z-S4b-display-items-coordinator.md` + `20260712T141234Z-S4b-display-items-governance-correction.md` | Tool/MCP/Collab/Approval typed display DTO、schema/client 与 25 materializer tests 通过；ask-user resolved-without-decision 为 terminal + decision null + Turn Resolved。MCP server elicitation 是独立瞬时 reverse request，不投影为该表中的 Item；sidecar 字段复用集中 owner，legacy report 边界违规为 0 |
| S4c-tool-production-wiring | ready-for-review / coordinator-unit-validated / Gate-B-home-passed-tool-path-pending | runtime-tools-production-a -> coordinator | `.lime/refactor-v2/claims/S4c-tool-production-wiring-runtime-tools-production-a.md` | `20260712T131753Z-S4c-tool-production-wiring-runtime-tools-production-a.md` + `20260712T132422Z-S4c-tool-production-wiring-ordering-correction.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s4c-tool-production-wiring.md` | current provider 已唯一走 RuntimeTool/ToolCall/Emitter/NormalizedOutput；缺 turn ID fail-closed，host-first 调度保证 canonical ItemStarted -> ActionRequired -> ItemCompleted；home-hotpath Gate B 已越过 S2f blocker并通过，旧 wire DTO、backend mapper 与 core stream DTO 已由 S4d-S4n 删除。 |
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
| S4l-mcp-step-snapshot | ready-for-review / focused-and-live-MCP-chain-validated / deferred-Gate-B-pending | coordinator | `.lime/refactor-v2/claims/S4l-mcp-turn-snapshot-coordinator.md` | S4l handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4l-mcp-step-snapshot.md` | per-sampling-step definitions/executor 与 caller-bound MCP route/handle 同 snapshot；unknown call 不触发真实 executor，deferred selection Turn-local 且 next-step-only，discovery 按 server 部分成功，bridge 保留 configured tool timeout。agent-runtime 112、tool-runtime 268、lime-mcp 112、lime-agent focused 9、fixture 9、contracts 290 与 GUI smoke 通过；真实 Electron Context7 tool_search/query-docs 通过，但其 2-tool surface 非 deferred，专用 deferred Gate B 仍待补。related matrix 在 App Server 并行热区为 990/1002，12 个 raw tool/tool.args/sequence/approval stale fixture 失败；聚合 Agent fixture 在既有 approval compact 断言失败。 |
| S4m-canonical-tool-residuals | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4m-canonical-tool-residuals-coordinator.md` | S4m handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4m-canonical-tool-residuals.md` | `tool_end` 与 raw Tool lifecycle 全部入口拒绝；Tool/MCP/Collab 大输出 sidecar、restart hydration 与 completed+succeeded image media projection 只读 canonical Item。output 6/6、snapshots 6/6、external 4/4、thread projection 34/34、media 5/5、App Server check、contracts 290、governance catalog 199 与 legacy boundary 0 通过；触碰的四个超线生产文件均拆到 800 行以下，GUI wire 未变化。 |
| S4n-dead-backend-event-stream-surface | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4n-dead-backend-event-stream-surface-coordinator.md` | S4n handoff + `internal/research/refactor/v2/13-evidence/2026-07-13-s4n-dead-backend-event-stream-surface.md` | zero-consumer `backend_event.rs`、App Server export 与 core `StreamEvent/ToolExecutionResult/StreamResult` 已物理删除并补路径/symbol 守卫；`TokenUsage` current consumers 保留。Rust/contract/governance 定向验证见 evidence；GUI wire 未变化。 |
| S4o-mcp-control-plane-step-snapshot-audit | completed / read-only-audit | coordinator | `.lime/refactor-v2/claims/S4o-mcp-control-plane-step-snapshot-audit-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T080102Z-S4o-mcp-control-plane-step-snapshot-audit.md` + S4o evidence | Resource/Prompt/status management owner、connection capability lifetime 与未实现的 server elicitation 已分类；resource/prompt identity 分拆为 S4p/S4q。 |
| S4o-mcp-control-plane-owner-split | completed / coordinator-validated | coordinator | `.lime/refactor-v2/claims/S4o-mcp-control-plane-owner-split-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T094900Z-S4o-mcp-control-plane-owner-split-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4o-mcp-control-plane-owner-split.md` | tool-runtime bridge 已净减 caller-unaware dispatch 与 management APIs，只保留 same-step Tool snapshot/dispatch；tool-runtime 7、lime-mcp 114、lime-agent 10 与四 crate check 通过，contract/governance 见 evidence。 |
| S4p-mcp-resource-target-identity | completed / focused-contracts-current-smoke-and-GUI-validated | coordinator | `.lime/refactor-v2/claims/S4p-mcp-resource-target-identity-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T090851Z-S4p-mcp-resource-target-identity.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4p-mcp-resource-target-identity.md` | read/subscribe/unsubscribe 从 protocol 到 manager/native helper/GUI 全部使用 exact `(server, uri)`；同 URI 双 server backend/GUI 回归通过。manager 13、Rust client 2、tool-runtime 2、schema drift 1、Renderer 38、contracts 290、legacy governance、五 crate check、MCP current smoke 与 GUI smoke 通过；live provider 未配置且非本 slice 门禁。 |
| S4q-mcp-prompt-target-identity | completed / focused-and-current-fixture-validated | coordinator | `.lime/refactor-v2/claims/S4q-mcp-prompt-target-identity-coordinator.md` + `.lime/refactor-v2/claims/S4q-closeout-current-fixtures-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T095214Z-S4q-mcp-prompt-target-identity.md` + `.lime/refactor-v2/handoffs/20260713T101000Z-S4q-closeout-current-fixtures-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4q-mcp-prompt-target-identity.md` | Prompt get 从协议到 GUI 统一 exact `(server, name)`，跨连接扫描/前缀解析与迟到结果串目标已删除；manager 10、typed Rust 3、schema 1、Renderer 43、App Server processor 2、package client 62、contracts 290 与 legacy 0/0/0 通过。deterministic fixture 不实现 prompt get，不冒充 Gate B。 |
| S4s-mcp-sampling-capability-fail-closed | completed / coordinator-validated | s4s-sampling-cap-impl -> coordinator | `.lime/refactor-v2/claims/S4s-mcp-sampling-capability-fail-closed-s4s-sampling-cap-impl.md` | `.lime/refactor-v2/handoffs/20260713T101000Z-S4s-mcp-sampling-capability-fail-closed.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4s-mcp-sampling-capability-fail-closed.md` | 无 handler 的 sampling 正向广告已删除并补回流守卫；focused 1、lime-mcp 116、App Server check、contracts 290、legacy 0/0/0 与 rustfmt/diff 通过。GUI/protocol wire 未变。 |
| S4t-agent-graph-edge-persistence | completed / coordinator-validated / production-wiring-pending | s4t-edge-store-impl -> coordinator | `.lime/refactor-v2/claims/S4t-agent-graph-edge-persistence-s4t-edge-store-impl.md` | `.lime/refactor-v2/handoffs/20260713T101800Z-S4t-agent-graph-edge-persistence.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4t-agent-graph-edge-persistence.md` | Codex AgentGraphStore 已适配到 thread-store + ProjectionStore canonical SQLite；child unique parent、Open/Closed audit、stable BFS/reopen、transactional self/cycle rejection 通过 1+6 tests 与两 crate check。AgentControl 生产 caller、canonical Collab/SubAgent producer 和 legacy metadata 删除归 S4v；mailbox 未混入。 |
| S4u-agent-mailbox-persistence | completed / durable-storage-and-App-Server-validated / production-consumer-pending | coordinator | `.lime/refactor-v2/claims/S4u-agent-mailbox-persistence-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s4u-agent-mailbox-persistence.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-local-data-source-fixture-sync.md` | `thread-store` contract 与 ProjectionStore 同 SQLite implementation 已建立：identity `thread_id`/`(root,path)` 双唯一、canonical path 末段派生 task name；mailbox message-id idempotency/冲突拒绝、QueueOnly/TriggerTurn、root+recipient FIFO 隔离、delivered audit/reopen 完成。`thread-store` 21/21、App Server mailbox store 4/4、diff/rustfmt 通过。S4w 在共享热区释放后接 canonical Item append-before-ack、Turn trigger 与 wait activity，禁止恢复 legacy metadata/map/queue。 |
| S4v-agent-control-production-wiring | completed / control-boundary-and-focused-test-validated | coordinator | `.lime/refactor-v2/claims/S4v-agent-control-production-wiring-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4v-agent-control-production-wiring.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-local-data-source-fixture-sync.md` | RuntimeCore 仅在 loaded parent 下通过 canonical `start_session` 创建 child，再写 Open edge；edge failure 会补偿删除 child session/Thread，close 仅接受 durable descendant 并保留 Closed audit，restart 无 legacy metadata fallback。rustfmt/diff、App Server library check 与 `agent_control` 6/6 通过。mailbox、gateway/tool、JSON-RPC、GUI、旧 Team 删除均不属于该 slice。 |
| S4r8-local-data-source-fixture-sync | completed / focused-validated | coordinator | `.lime/refactor-v2/claims/S4r8-local-data-source-fixture-sync-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-local-data-source-fixture-sync.md` | LocalAppDataSource fixture 与 production router field 已同步；trait implementation 显式 clone owner router，真实 stdio MCP resource fixture 1/1、S4u mailbox store 4/4、S4v agent control 6/6 与 App Server check 通过。macOS test worker stack 以仓库既有 `RUST_MIN_STACK=8388608` 口径运行；不新增 MCP runtime/router owner 或 mock。 |
| S4w-agent-mailbox-production-consumer | completed / focused-validated / production-module-split / product-chain-pending | coordinator | `.lime/refactor-v2/claims/S4w-agent-mailbox-production-consumer-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4w-agent-mailbox-production-consumer.md` | RuntimeCore 已消费 durable mailbox：message ID 派生 canonical Item 和 TriggerTurn deterministic turn，QueueOnly 不自行启动而在下一真实 turn 前投影；canonical Item-before-ack、EventLog-first canonical failure recovery、existing Item retry ack 与 durable activity query 已由 6/6 focused tests 覆盖。consumer production module 已降至 423 行，focused tests 独立；无 RuntimeQueuedTurn、metadata/map/second queue；六工具、JSON-RPC/GUI、完整 restart recovery 与旧 Team 删除仍为后续 slice。 |
| S4x-agent-control-tool-gateway | completed / focused-validated / product-chain-pending | coordinator | `.lime/refactor-v2/claims/S4x-agent-control-tool-gateway-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4x-agent-control-tool-gateway.md` | 六个 V2 AgentControl 工具仅在 RuntimeCore 签发 per-turn gateway 时进入 current provider sampling-step；RuntimeBackend 只透传 opaque handle。S4x 原有 wait terminal/steer 缺口已由 S4aa 关闭；JSON-RPC、GUI 与真实 Electron Gate B 仍 pending。 |
| S4y-dead-team-tool-surface | completed / focused-and-governance-validated / product-chain-pending | root | `.lime/refactor-v2/claims/S4y-dead-team-tool-surface-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4y-dead-team-tool-surface.md` | `tool-runtime::collab_agent` 及旧 Team catalog/prompt/discovery/native allowlist 已物理删除，工具执行 smoke 改用六个 V2 工具；tool-runtime 249、lime-agent catalog 9/current provider 13、lime-core tool-calling 23、smoke guard 4、governance 205 通过。protocol/GUI 历史投影未混删；JSON-RPC/GUI、完整 restart recovery 仍 pending。 |
| S4ab-legacy-collab-projection-boundary | completed / package-contract-and-governance-validated / product-chain-pending | root | `.lime/refactor-v2/claims/S4ab-legacy-collab-projection-boundary-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ab-legacy-collab-projection-boundary.md` | 六个 AgentControl V2 名称是唯一 current schema/taxonomy/visual surface；四个裸 V1 alias 已判 `dead` 并由负向测试防回流，历史 Rust operation/activity 与 schema/import/display 仅保留 `deprecated / historical-read-only`。package 298/298、typecheck、contracts、legacy report 0/0/0 通过。 |
| S4z-agent-control-restart-on-demand | completed / focused-and-App-Server-validated / product-chain-pending | root | `.lime/refactor-v2/claims/S4z-agent-control-restart-on-demand-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4z-agent-control-restart-on-demand.md` | 新 RuntimeCore 只 hydrate root；QueueOnly 不加载 child，followup/interrupt 精确 hydrate target，Closed edge 不可寻址且不 reopen，grandchild 不被递归加载。App Server check、agent_control 12/12、rustfmt/diff 通过；JSON-RPC/GUI/Gate B pending。 |
| S4aa-agent-terminal-mailbox-activity | completed / focused-Rust-App-Server-and-GUI-smoke-validated / product-chain-pending | root | `.lime/refactor-v2/claims/S4aa-agent-terminal-mailbox-activity-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4aa-agent-terminal-mailbox-activity.md` | direct-parent completed/failed Result、assistant Item/mailbox metadata、两类 EventLog-first crash recovery、repairable/empty-prefix tail、long Unicode、pre-existing/new steer priority、deadline final recovery 与 concurrent wait CAS/dedupe 已完成。focused 1+1+8+7+6+13+24+12、最终 App Server library check 与通用 GUI smoke 通过；聚合 Agent fixture 被独立 Plan revision binding 阻断，JSON-RPC/Multi-Agent Gate B 未运行。 |
| S4ac-wait-agent-canonical-item | completed / focused-and-lime-agent-validated / targeted-SubAgent-producer-ready | root | `.lime/refactor-v2/claims/S4ac-wait-agent-canonical-item-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ac-wait-agent-canonical-item.md` | `wait_agent` canonical lifecycle 复用既有 `CollabAgentToolCall::Wait`，Started/Completed identity/ordinal 与 terminal output 保真；focused 1、protocol 19、current provider 13、lime-agent check、rustfmt/diff 通过。S4aa 已释放 gateway，S4ad 可用真实 target ThreadId 产 SubAgent；list 保持 generic Tool。 |
| S4ad-targeted-subagent-producer | implemented / focused-Rust-and-schema-validated / aggregate-gates-running | root | `.lime/refactor-v2/claims/S4ad-targeted-subagent-producer-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4ad-targeted-subagent-producer.md` | gateway 成功结果携带真实 resolved ThreadId 的 typed internal fact；current provider 保留普通 Tool 并追加 distinct completed SubAgent Item。fact 不进入模型或 Tool metadata；失败、错配、wait/list 零 activity。S4ae 已将临时十值 contract 收口为 Codex 三值；七旧值无兼容约束，禁止恢复。focused Rust 5+1+5+14+12、schema fixture 1 通过；contracts/current fixture 待最终记录，GUI/Gate B 归 S4ae。 |
| S4r1-mcp-elicitation-router | completed / coordinator-validated / foundation-only | s4r-router-impl -> coordinator | `.lime/refactor-v2/claims/S4r1-mcp-elicitation-router-s4r-router-impl.md` | `.lime/refactor-v2/handoffs/20260713T122925Z-S4r1-mcp-elicitation-router.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s4r1-mcp-elicitation-router.md` | manager-shared opaque exact router、bounded single consumer、closed token、cancel cleanup、typed form schema validation 与真实 RMCP duplex 已完成；focused 13、lime-mcp 128、两 crate check、rustfmt/diff 通过。capability 保持 absent。 |
| S4r2-app-server-reverse-jsonrpc | completed / correctness-closeout-validated / product-chain-pending | coordinator | `.lime/refactor-v2/claims/S4r2-app-server-reverse-jsonrpc-coordinator.md` + `.lime/refactor-v2/claims/S4r2b-reverse-jsonrpc-correctness-coordinator.md` | `.lime/refactor-v2/handoffs/20260713T121706Z-S4r2-app-server-reverse-jsonrpc.md` + `.lime/refactor-v2/handoffs/20260713T123857Z-S4r2b-reverse-jsonrpc-correctness.md` + S4r2/S4r2b evidence | 三类 catalog、transport 与 dispatcher foundation 已完成；boot-scope exact id、abort cleanup、ambiguous-client fail closed 与 settled replay suppression 经 App Server 7/7、Renderer 6/6 复核。专用 Gate B 等待 S4r3 adapter 与 Phase C。 |
| S4r8-mcp-runtime-thread-owner | completed / owner-lifecycle-revalidated / Gate-B-blocked | coordinator | `.lime/refactor-v2/claims/S4r8-mcp-runtime-thread-owner-coordinator.md` | `internal/research/refactor/v2/13-evidence/2026-07-13-s4r8-mcp-runtime-thread-owner.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-gate-b-runtime-server-failure.md` | `AgentRuntimeState[sessionId] -> McpThreadRuntime` 创建期绑定 immutable thread 与独立 RMCP generation；management manager 只提供 typed runtime server specs。per-call scope 只留 nullable turn correlation，不重传 session/thread/parent identity；management nested elicitation fail closed。session/turn mismatch、delete exact close、A 取消不影响 B 与 forwarded waiter terminal 顺序已回归。最新真实 Electron Gate B 在 provider sampling 前被默认 Playwright MCP 的 E404 阻断，故不能宣称 GUI 闭环通过；S4r9 必须先完成 per-server fault isolation。 |
| S4r9-mcp-runtime-server-fault-isolation | completed / focused-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S4r9-mcp-runtime-server-fault-isolation-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s4r8-gate-b-runtime-server-failure.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s4r9-mcp-runtime-server-fault-isolation.md` | `McpThreadRuntime` 现在并发启动 typed enabled specs；optional failure 被记录并从 snapshot 排除，required failure 只关闭候选 manager、拒绝 replacement 并保留旧 generation。真实保留故障默认 Playwright MCP 的 Electron Gate B 已获得 provider 2 requests、Renderer form accept、resolved close 和 final text；无 legacy command/console error。 |
| S4-approval-restart-production | completed / focused-and-approval-Gate-B-validated | coordinator -> root | `.lime/refactor-v2/claims/S4e-approval-restart-production-coordinator.md` | S4e evidence/handoff + resolved-blocker audit handoff | RuntimeCore 直接从 StoredSession current event 恢复 type/scope/descriptor；restart reopen、not-resumable、cancel waiter、terminal reason 与 processor error.data 均通过。S4h raw fixture 已关闭；真实 Electron 证据覆盖 resume 内 `allow_for_session -> action.resolved`、decline、cancel 与 fresh cancel closeout。Skills Provider 鉴权仍是独立 aggregate residual，不再归为 S4e blocker。 |
| S5 | ready-for-review / canonical-read-control-Gate-B-passed / compat-consumer-subtraction-active | coordinator | `.lime/refactor-v2/claims/S5-coordinator.md` + `.lime/refactor-v2/claims/S5-agent-runtime-compat-current-owner-migration-root.md` | `20260712T192800Z-S5-coordinator.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s5-canonical-terminal-gui.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s5-sidebar-session-compat-migration.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s5-automation-current-owner-migration.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s5-skills-evidence-current-owner-migration.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s5-agent-runtime-compat-current-owner-migration.md` | canonical terminal/Approval history 与 queued-turn canonical read control 已收敛；S5f Gate B 在约 5 秒内完成 `thread/read -> promote -> real cancel -> resume`，不再等待 120 秒 watchdog。Sidebar、automation、skills/evidence、plugin history、legacy summary 与 reliability/file-checkpoint domain 已直连 current owner；当前 Agent Chat 仍有 22 个 production consumer file 直连 root compat barrel，必须继续按域迁移，禁止扩展 compat。Approval resume external fixture blocker 仍归 S4 approval evidence。 |
| S5a | ready-for-review | gui-s5a-host-capabilities | `.lime/refactor-v2/claims/S5a-host-capabilities-gui-s5a-host-capabilities.md` | `20260712T103640Z-S5a-host-capabilities-gui-s5a-host-capabilities.md` | typed host facade已通过3 unit、51 focused、360 related tests与eslint；最终GUI Gate B仍归S5 |
| S5c-canonical-read-consumer | completed / focused-contracts-and-Gate-B-validated | gui-s5-canonical-read -> coordinator | `.lime/refactor-v2/claims/S5c-canonical-read-consumer-gui-s5-canonical-read.md` | `20260712T162548Z-S5c-canonical-read-consumer-minimal-audit.md` + `20260712T200156Z-S5c-canonical-read-consumer.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | package/Renderer queue control 只读 canonical `thread/read` narrow projection；queued promotion Gate B 解析唯一 active Turn，并完成 promote、真实 cancel、resume 与 reload queue restore；focused 77 tests、typecheck、contracts 289 checks 通过 |
| S5d-plugin-canonical-thread-read | ready-for-review / focused-and-contracts-validated | plugin-canonical-thread -> coordinator | `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-plugin-canonical-thread.md` + `.lime/refactor-v2/claims/S5d-plugin-canonical-thread-read-coordinator.md` | `20260713T041500Z-S5d-plugin-canonical-thread-read.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | canonical threadId 已贯穿 start/get/cancel/reload；缺失、冲突、错误 identity、queued/terminal/multiple-active 全部 fail closed；Plugin focused 26/26、typecheck、contracts 通过，静态守卫只接受 canonical Thread/Item |
| S5e-terminal-queue-history | completed / focused-and-unified-Gate-B-validated | canonical-terminal-queue | `.lime/refactor-v2/claims/S5e-terminal-queue-history-canonical-terminal-queue.md` | `20260712T202403Z-S5e-terminal-queue-history.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | terminal Turn 可保留 historical Running/NotQueued 且 activeTurnId 为 null；terminal+Queued 仍 fail closed；projection + adapter + flow 与同一 Electron queued promotion Gate B 通过 |
| S5f-active-stream-queue-intent | completed / focused-contracts-and-Gate-B-validated | coordinator | `.lime/refactor-v2/claims/S5f-active-stream-queue-intent-coordinator.md` | `20260712T215632Z-S5f-active-stream-queue-intent.md` + `internal/research/refactor/v2/13-evidence/2026-07-13-s5-canonical-read-consumers.md` | 同会话真实 active turn 强制 queue intent；queued listener 不覆盖 active binding，accepted 后立即 canonical hydrate；Gate B 约 5 秒完成且 backend ledger 真实 cancel，focused 77 tests、typecheck、contracts 与 GUI smoke 通过 |
| S5g-managed-objective-current-owner-migration | completed / focused-32-tests-eslint-typecheck-governance-validated | managed-objective-current-owner | `.lime/refactor-v2/claims/S5g-managed-objective-current-owner-migration-managed-objective-current-owner.md` | S5g evidence + handoff | Managed Objective 类型已直连 `sessionTypes`，行为与 mocks 已直连 `objectiveClient`；focused 32/32、ESLint、typecheck、legacy 0/0/0 与 diff check 通过，无 blocker。 |
| S6 | completed / raw-sidechain-and-legacy-roster-contract-deleted / canonical-GUI-and-export-validated | refactor-v2-coordinator | S6a-S6t narrow claims | S6a-S6t handoffs/evidence | runtime 与 Renderer Team sidecar、专用 status/stream channel、raw parser/type/projector/package/fixture、legacy child/sibling/parent session roster DTO/state/normalizer/fallback 已迁出并受回流守卫保护；canonical child roster/navigation/Harness/Task Rail/Inputbar、canonical parent identity、AgentGraph export stats 和 Gate B/GUI smoke 已完成。 |
| S6a-thread-store-dead | completed / coordinator-validated | thread-store-dead-a -> coordinator | `.lime/refactor-v2/claims/S6a-thread-store-dead-thread-store-dead-a.md` | `20260712T124908Z-S6a-thread-store-dead-thread-store-dead-a.md` + `internal/research/refactor/v2/13-evidence/2026-07-12-s6a-thread-store-dead.md` | 六个零 crate 外 consumer 的 transcript/search/runtime-store/insight 模块及内嵌正向测试共 1923 行已删除，八个旧路径纳入 forbidden-to-restore 守卫；三个反向依赖 check 与 coordinator 定向复核通过 |
| S6b-dead-default-playwright-mcp-seed | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6b-dead-default-playwright-mcp-seed-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6b-dead-default-playwright-mcp-seed.md` + S6b handoff | `migration_v3`、module export 与 startup dispatch 已删除；fresh database regression 证明不再写默认 Playwright MCP。旧 npm package、migration marker 与调用已纳入 `dead` guard；用户显式配置的 MCP 不迁移、不删除、不改名。`lime-core` 全量、related Rust、治理目录册、legacy report、rustfmt/diff 全部通过；GUI/bridge wire 未变化，Gate B 不适用。 |
| S6c-dead-agent-session-store | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6c-dead-agent-session-store-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6c-dead-agent-session-store.md` + S6c handoff | `session_store`、12 个 sibling、`session_state_snapshot` 与 crate-root CRUD/read/DTO export 共 4182 行已删除；App Server RuntimeCore -> ThreadStore/ProjectionStore 保持唯一 session owner。`lime-agent` 265/265、`app-server`/`lime-scheduler`/`lime-server` check、目录册 200、删除路径守卫和 legacy report 0/0/0 通过；GUI/bridge wire 未变化，Gate B 不适用。 |
| S6e-dead-rust-execution-strategy-compat | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6e-dead-rust-execution-strategy-compat-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6e-dead-rust-execution-strategy-compat.md` | 无 caller 的 Rust `execution_strategy_compat` module/normalizer 已删除并受 dead guard 保护；React typed request/lowering 保持 current，仍有三个 renderer consumer 的 TypeScript compat helper 未混删。 |
| S6f-dead-agent-subagent-sidecars | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6f-dead-agent-subagent-sidecars-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6f-dead-agent-subagent-sidecars.md` | 无 caller 的 local subagent control/profile sidecar、旧 extension 与专属 DTO 已删除；App Server canonical graph/mailbox 与 `agent-runtime/session_execution` 保持唯一 current owner。 |
| S6g-dead-agent-runtime-aggregate | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6g-dead-agent-runtime-aggregate-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6g-dead-agent-runtime-aggregate.md` | 无 caller aggregate execution runtime builder、metadata parser、permission fallback 与专属 DTO 已删除；`AgentEvent` task/routing/limit/cost DTO 及 App Server read-model projection 保持 current。 |
| S6h-dead-agent-runtime-session-query | completed / focused-and-governance-validated | root | `.lime/refactor-v2/claims/S6h-dead-agent-runtime-session-query-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6h-dead-agent-runtime-session-query.md` | direct `agent_sessions` execution-runtime query、module、alias/re-export 已删除；App Server `session_metadata` read model 与 `agent-runtime` generic projection 是唯一 current owner，`lime-agent` 259/259、反向依赖 compile、215 governance tests 和 legacy report 0/0/0 通过。 |
| S6i-dead-team-formation-preview | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6i-dead-team-formation-preview-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6i-dead-team-formation-preview.md` | 输入长度/正则 + selected Team 的本地 formation、虚拟 member AgentUI event、`runtime-team-dispatch:*` 伪消息、send preview state 与 layout preview flag 已删除；发送不再等待或记录 Renderer 组队结果。focused 188、typecheck、legacy report 0/0/0、diff guard 与 GUI smoke 通过；canonical child Thread/Item GUI 未删除。 |
| S6j-dead-team-runtime-sidecar | completed / S6k-S6l-followup-validated | root | `.lime/refactor-v2/claims/S6j-dead-team-runtime-sidecar-root.md` | S6j/S6k/S6l evidence | 第二 Team runtime 与 dead i18n 已删除；follow-up 发现的 project-thread ENOENT 和 ThreadId 直传 session bug 已由 S6k/S6l 修复并补 Gate。 |
| S6k-canonical-child-roster | completed / focused-Rust-contracts-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S6k-canonical-child-roster-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6k-canonical-child-roster.md` + S6k handoff | App Server canonical read/list join AgentGraph/Identity；selector/hook/Harness 只读 canonical child roster/status，保留 threadId/sessionId 和 notFound。Rust 精确 4、app-server check、unified focused 91、typecheck、contracts 290、Multi-Agent Gate B 与 GUI smoke 通过；Rust related 被无关 MCP stack overflow 阻断。 |
| S6l-thread-first-subagent-navigation-guards | completed / focused-contracts-governance-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S6l-thread-first-subagent-navigation-guards-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6l-thread-first-subagent-navigation-guards.md` + S6l handoff | canonical roster sessionId 优先，缺失时 `thread/read(notLoaded)` 严格解析；project-thread/dead/i18n/scenario/docs 已收口。unified focused 91、stop 1、typecheck、contracts 290、i18n/legacy、Multi-Agent Gate B 与 GUI smoke 通过；aggregate 只在已知 Skills Provider 鉴权失败处 exit 1。 |
| S6m-raw-subagent-channel-retirement | completed / focused-typecheck-contract-core-governance-and-current-fixture-validated | third-worker -> root | S6m third-worker + continuation claims | S6m partial + continuation handoffs/evidence | status/stream 专用 channel、listener API、adapter alias、sync effect 与 DevBridge truth policy 已删除，stale adapter fixture 清理并补 negative guard。continuation focused 25/25、typecheck、legacy 0/0/0，contracts 290 与主体 gate 通过；最终 docs boundary 只被并行 release plan 阻断。current aggregate 通过此前全部场景后在 Inputbar pending-steer 首跑超时，精确 Electron 场景复跑通过。 |
| S6n1-raw-subagent-status-parser-retirement | completed / focused-typecheck-validated | root | `.lime/refactor-v2/claims/S6n1-raw-subagent-status-parser-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6n1-raw-subagent-status-parser-retirement.md` + S6n1 handoff | `parseAgentEvent` 对 raw status fail closed，Agent UI dispatcher 不再投影；精确 2/2、dispatcher 全量 22/22、typecheck/diff 通过。完整 agentProtocol 的 1 个 action request id fixture 漂移与本切片无关。 |
| S6n-raw-subagent-type-package-fixture-retirement | completed / focused-typecheck-i18n-governance-contract-core-and-Gate-B-validated | root | `.lime/refactor-v2/claims/S6n-raw-subagent-type-package-fixture-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6n-raw-subagent-type-package-fixture-retirement.md` + S6n handoff | raw status local/package projector、TS type、barrel/helper、runtime facts、summary/i18n/fixture 正向口径已物理删除；package 295/295、focused 136/137（唯一失败为既有 action request id 漂移）、guards 16/16、typecheck、i18n、legacy 0/0/0、Multi-Agent Gate B 与 GUI smoke 通过。contracts 主体通过后被并行 release plan 阻断；current aggregate 只在已知 Skills Provider 鉴权失败处退出。 |
| S6o-legacy-subagent-roster-dto-retirement | completed / memory-shadow-and-canonical-GUI-fallback-retired | root | `.lime/refactor-v2/claims/S6o-legacy-subagent-roster-dto-retirement-root-memory-shadow.md` + `.lime/refactor-v2/claims/S6o-legacy-subagent-roster-dto-retirement-root-canonical-gui-fallback.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6o-legacy-roster-memory-shadow.md` + `internal/research/refactor/v2/13-evidence/2026-07-14-s6o-canonical-gui-fallback-retirement.md` + S6o handoffs | team-memory child/sibling roster shadow 与 Harness/AgentRuntimeStrip GUI fallback 均已删除；focused、typecheck、legacy 0/0/0、diff 与 GUI smoke 通过。剩余 session contract 已由 S6s/S6t 物理删除。 |
| S6p-a-canonical-navigation-and-runtime-strip-fallback-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6p-a-canonical-navigation-and-runtime-strip-fallback-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6p-a-canonical-navigation-and-runtime-strip-fallback-retirement.md` + S6p-a handoff | 导航删除 legacy known-session 直达分支，runtime strip 删除 legacy roster 统计；navigation/guard 5/5、strip 10/10、typecheck、legacy report 0/0/0、GUI smoke 与 diff check 通过。Harness fallback 已由 S6o canonical GUI slice 收口，Task Rail stats 已由 S6q 收口。 |
| S6q-canonical-task-rail-subtask-stats | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6q-canonical-task-rail-subtask-stats-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6q-canonical-task-rail-subtask-stats.md` + S6q handoff | Task Rail 从 Workspace scene 到 Toolbar/ViewModel 只透传 canonical children；七态映射锁定 interrupted 为需处理。focused 78/78、最终映射 7/7、typecheck、legacy 0/0/0、GUI smoke 与 diff check 通过。Inputbar/Harness/session DTO 未混入。 |
| S6r-canonical-inputbar-subtask-stats | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6r-canonical-inputbar-subtask-stats-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6r-canonical-inputbar-subtask-stats.md` + S6r handoff | landing、MessageList、Inputbar runtime status 已从 legacy roster 收敛到 canonical children；七态统计回归 `total=7, active=2, queued=1, completed=2, failed=3`。focused 41/41、typecheck、ESLint/Prettier、legacy 0/0/0、GUI smoke 与 diff check 通过。后续 S6s/S6t 已删除 session DTO/state/normalizer/API fixture/metrics fallback。 |
| S6s-legacy-subagent-session-contract-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated | root -> react/api/rust narrow owners | `.lime/refactor-v2/claims/S6s-legacy-subagent-session-contract-retirement-root.md` + React/Rust subclaims + S6t | `internal/research/refactor/v2/13-evidence/2026-07-14-s6s-legacy-subagent-session-contract-retirement.md` + subclaim evidence/handoffs | React/API 删除 child/sibling/parent roster DTO/state/normalizer/fixture；canonical thread family 独占 parent identity；Rust export active count 改读 canonical AgentGraph。React 255+5、API 60+1、Rust focused 2、typecheck、legacy 0/0/0 与 GUI smoke 通过；Rust related 被无关 MCP stack overflow 阻断。 |
| S6t-legacy-session-roster-contract-retirement | completed / focused-typecheck-governance-and-GUI-smoke-validated | root | `.lime/refactor-v2/claims/S6t-legacy-session-roster-contract-retirement-root.md` | `internal/research/refactor/v2/13-evidence/2026-07-14-s6t-legacy-session-roster-contract-retirement.md` + S6t handoff | session API 类型、normalizer、两个 spread 边界、Electron/smoke fixture 与 dead display leaf 已收口；API 60/60、相关 clientFactory 1/1、typecheck、lint/format/diff、legacy 0/0/0 与 GUI smoke 通过。完整 clientFactory 唯一失败为未触及 turn-lifecycle 旧期望。 |
| S7 | completed / skeleton-and-post-gate-closeout / smart-suite-and-S7x-focused-Gate-B-validated / refinement-active / not-archive-ready | root | `.lime/refactor-v2/claims/S7-root.md` + S7a-S7y claims | S7 skeleton evidence + S7a-S7y evidence/handoffs + historical claim audit handoffs | Codex-first GUI 架构骨架与 post-skeleton refinement 已收口。S7c-S7f 完成 runtime guard/模块职责拆分，S7h-S7v 将 smart Vitest 失败对齐 current protocol/client/projector/mock owner；smart suite 已完成 batch 110，`failed_batch: null`。S7x 删除无 position raw Tool 排序 fallback，focused 55/55、reasoning-first Gate B 与 history replay Gate B 通过。S2m/S2n 已关闭，历史 active/blocked claim 元数据已按后续事实源释放。fresh `verify:gui-smoke` 通过；current aggregate 再次只在独立 Skills Provider 鉴权场景退出。S7y Approval cold-read 正 active；S5 剩余 22 个 dirty compat consumer、fresh aggregate 全绿与 PR architecture confirmation 未关闭，因此 v2 不标记 archive-ready。 |
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
| S7y-approval-cold-read-typed-response | active / canonical-cold-read-and-GUI-lowering | root | `.lime/refactor-v2/claims/S7y-approval-cold-read-typed-response-root.md` | pending | 只修 canonical ThreadStore -> read model -> typed Renderer -> GUI view-model；不新增 Approval server request、IPC 或第二响应 owner。 |

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
确认内容：已核对每次 provider request 前 capture、同 step exact executor、unknown call fail-closed lifecycle、per-server discovery isolation、Turn-local deferred next-step activation、per-tool caller 双重门禁、registry replace 后旧 handle/timeout 保持、raw tool.input.delta producer 删除，以及真实 Electron Context7 tool_search/query-docs。Context7 当前 2-tool surface 非 deferred，因此专用 deferred Gate B 不冒充完成；Resource/Prompt/status 归 App Server live management read，capability 归 initialized connection，server-originated elicitation 归独立 reverse JSON-RPC 协议，均不扩张 sampling-step snapshot。
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
确认内容：已核对 App Server cold read 从 canonical ThreadStore 回填 detail.items/thread_read.thread_items，Renderer live reader 保留相同 Item ID 与 child ThreadId；activity Item 的 completed 只表示事实落盘，started/interacted 投影 running/acting，interrupted 投影 cancelled/interrupted，child terminal 仍只由 S4aa Result mailbox/thread lifecycle 表达。GUI 使用五语言文案且 unknown wire 不直接显示；real:subagent:* producer/test、activity worker.notification 和 Harness child-terminal 推断已删除。协议已收口 Codex 三值并同步 schema/TS；focused、typecheck、i18n 与 GUI smoke 通过。current fixture 已越过此前 ENOSPC 及首页/Workbench/Approval/Inputbar/Plan 等真实 Electron 场景，最终 Skills Runtime fixture Provider 鉴权失败；不将该外部鉴权 blocker 冒充 SubAgent GUI 回归或 aggregate Gate 通过。
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
确认内容：`thread/list` 暴露 parentThreadId、agentPath/nickname/role、lastTaskMessage 与 Codex 七态 agentState；selector/hook 保留 threadId/sessionId，parent Item 引用缺失 child 显式 notFound。Harness 和 RuntimeStrip 显式传入 canonical roster 时不回退 raw sessions，pendingInit+running 才计 active，interrupted 独立；导航优先 canonical ThreadId -> sessionId，未知才 thread/read。unified focused 91、Rust 精确 4、app-server check、scoped ESLint、typecheck、contracts 290、五语言、multi-agent-team Gate B 与 GUI smoke 通过。Rust related 被无关 MCP stdio stack overflow 阻断；aggregate 只在已知 Skills Provider 鉴权失败处 exit 1。
```

### 9.20n S6l Thread-first SubAgent 导航与守卫确认

```text
架构影响：非重大；复用既有 App Server thread/read 与 canonical child roster 修正 Renderer 身份转换，不新增协议、Electron 后端、事件总线、compat 或 fallback。
架构图更新章节：不适用；既有 canonical Thread/Turn/Item 主链未变化。
责任开发者确认：root，2026-07-14
确认内容：canonical roster 保留 threadId/sessionId，activity target 优先使用 roster sessionId，缺失时通过 `thread/read(turnsView=notLoaded)` 严格解析；真实 child session id 仍可直达，mismatch/空值/read 失败均 fail closed。unified focused 91、stop 1、project-thread 10、catalog/registry 213、typecheck、contracts 290、五语言/unused/legacy、Multi-Agent Gate B 与 GUI smoke 通过；完整 aggregate 只在已知 Skills Provider 鉴权失败提示处 exit 1。
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
确认内容：已核对 domain token 与 outer JSON-RPC id 双层 identity、boot UUID + counter、请求 `_meta` 保真、Response/Error exact remove-once、aborted wait remove-on-drop、ambiguous client fail closed、Renderer connection-scoped in-flight/settled at-most-once、unknown/duplicate/late/disconnect fail closed、notification/request 不偷 client response、Electron 仅 JSONL 转发、Renderer method dispatcher 与错误码、nullable turn/parent correlation，以及 generic Approval/request_user_input/mock fallback 禁止复用。S4r1 MCP producer foundation 已完成；S4r3 adapter、GUI、五语言和真实 Electron Gate B 尚未完成。按 Codex `5c19155cbd93`，server-originated elicitation 是瞬时 reverse request，不进入 canonical Item、`thread/read` 或 durable projection；S4r2 不冒充完整 elicitation 交付。
```

### 9.21 S4r5-S4r6 MCP elicitation GUI 闭环确认

```text
架构影响：重大；在既有 reverse JSON-RPC 主链补 response `_meta` raw-wire 保真、connection-owned `serverRequest/resolved` terminal notification、Renderer AbortSignal 撤销语义与主窗口全局 GUI 表单，不新增 Electron 业务后端、兼容层、Approval/ask-user 复用或生产 mock fallback。
架构图更新章节：internal/aiprompts/architecture.md 第 6.1 节 App Server 与协议组、第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：S4r5-S4r6 protocol、renderer 和 GUI form foundation 已集成验证；公开 wire 固定为 required `threadId` + nullable `turnId` + required `serverName` + `mode: "form"`，不含 `sessionId`、`parentToolCallId` 或 raw MCP identity。最终关闭仍被 Codex per-Session runtime connection owner 阻塞：Lime 的全局 `McpClientManager` 只可作控制面，普通管理面 nested elicitation 在无可信 thread owner 时必须 fail closed。S4r8 需完成 session/thread-owned connection 后，才可执行完整普通 MCP server 的真实 Electron Gate B；在此之前 capability 继续 absent，不得把局部 Rust 或 Gate A 结果写成产品完成。
```

### 9.22 S4r8 MCP runtime thread owner 确认

```text
架构影响：重大；`AgentRuntimeState[sessionId] -> McpThreadRuntime` 在创建期固定 canonical threadId，且独立持有 runtime manager、RMCP connection 与 bridge registry。App Server reverse request 只公开 threadId、nullable turnId、serverName 与 form payload；per-call scope 只保留 turn correlation。全局 McpClientManager 继续只负责控制面，不新增 durable elicitation Item、read model、transport 或兼容层。
架构图更新章节：internal/aiprompts/architecture.md 第 6.3 节 Provider 与工具组。
责任开发者确认：refactor-v2-coordinator，2026-07-13
确认内容：已核对 runtime 只从 management typed server specs 创建自有 connection generation，配置不变则复用、变更则原子发布新 generation，旧 step 继续持有旧 handle。McpCallScope 只保留 nullable turn correlation；session/thread owner 不再随 call 传递或推断；management nested elicitation Decline。公开 wire 不含 sessionId/parentToolCallId/raw MCP id/progress token、session/turn thread mismatch fail closed、delete 按 exact (sessionId, threadId) close runtime、session A 取消不影响 B 且 forwarded waiter 必须等 serverRequest/resolved terminal。2026-07-14 的隔离 Gate B 重跑发现默认 Playwright MCP startup E404 会使 `McpThreadRuntime::start` 在 provider sampling 前失败；因此此前 Gate B 通过结论撤销，S4r9 必须先实现 per-server fault isolation，再以故障 server + 健康 stdio elicitation MCP 重跑完整 Electron/preload/JSONL/App Server/runtime/Renderer 闭环。elicitation capability 继续 absent。
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

## 10. 完成定义

v2 实施不能因为“几个进程都有改动”而标记完成。每个 slice 必须同时具备：

1. 唯一 owner 和不相交写集。
2. copy/adapt/delete 记录和上游 provenance。
3. positive/negative tests、协议/fixture 同步。
4. 正常、失败、中断、队列、stale event、resume/pagination 中与 slice 相关的证据。
5. handoff 已发布、锁已释放、下一 owner 已明确。

最终完成由 coordinator 统一执行 `npm run verify:local`、相关 GUI Gate B 和治理扫描，并在 `internal/research/refactor/v2/13-evidence/` 写入不可变 evidence。
