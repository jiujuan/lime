# Aster 迁移与 Codex 原点重构 v1 影响审计

状态：active  
创建时间：2026-07-06  
关联计划：`internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`  
重构基线：`internal/research/refactor/v1/README.md`

## 1. 审计结论

Aster 迁移必须服从 `internal/research/refactor/v1` 的 Codex-first 重构基线：

- Thread 管历史：session tree、metadata、history hydrate、export/replay 的事实源必须收敛到 Thread/read model owner。
- Turn 管执行：reply loop、queue、tool lifecycle、provider stream、interrupt/resume 必须收敛到 Turn/runtime owner。
- Item 管投影：message、reasoning、tool、media、artifact、approval 必须先 materialize 成 Item/read model，再给 GUI / Evidence 消费。

2026-07-07 起，Aster 迁移复核新增硬口径：**Codex 有则迁，Codex 没有则删**。判断一个 Aster 能力是否迁移时，必须先对照 `/Users/coso/Documents/dev/rust/codex`；Codex 有的能力才进入 Thread / Turn / Item current owner，且迁移后必须被 Lime 前后端或 Evidence / runtime 主链真实消费。Codex 没有的 Aster-only 能力不进入 refactor v1 owner，直接 `dead / deleted / forbidden-to-restore`。

命名也纳入复核：current API 必须短、领域化、可读。可以学习 Aster 的简洁命名品味和 Codex 的工具名，但不得把 `lime_*`、`aster_*`、`agent_runtime_*` 或冗长历史词带入 refactor v1 current owner。

因此，已迁出 Aster 的能力需要重新分成三类：

| 分类                           | 处理                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `refactor-aligned current`     | 与 refactor v1 owner 一致，继续作为 current owner 演进                                                  |
| `transitional current adapter` | 当前为了搬空 Aster 暂存于 Lime current crate，但不是最终 refactor owner；退出条件明确后删除或并入 owner |
| `compat blocker`               | 仍依赖 Aster trait / DTO / store / provider loop，下一步继续迁出，不允许新增业务逻辑                    |

### 1.1 Approval / HITL 边界

Approval decision 不属于 Aster vendor、Aster tool adapter 或 `runtime_tool_bridge` 的 owner。当前 owner 固定为：

- `current`：App Server `agentSession/action/respond`、RuntimeCore pending action / permission preflight、`tool-runtime::execution_approval` 的 tool execution approval contract/scope projection、Thread / Item read model、输入区 `InputbarApprovalPrompt`。
- `dead / forbidden-to-restore`：在 Aster vendor、Aster `Tool` trait adapter、`runtime_tool_bridge`、`runtime_overlay` 中新增或恢复 approval hook、approval cache、pending approval map、session approval key、`PendingToolConfirmation`、`SessionToolApprovalKey`、`install_session_tool_approval_hook`。
- `compat`：Aster reply loop 未迁完前，只允许把 current permission decision 转成临时 Aster `PermissionCheckResult`，不得持有 approval decision 语义或 session-scoped cache。

`tool_confirmation` 必须通过 App Server / RuntimeCore 的 `AgentSessionApprovalDecision` 处理；`ask_user` / `elicitation` 携带 approval decision 必须 fail closed。后续 P2 session-scoped approval cache 也只能落到 RuntimeCore / Thread owner，再由 Item/read model 给 GUI / Evidence 消费，不得为了“少改 reply loop”写回 Aster。

2026-07-09 复核：P2 browser_control session-scoped approval cache 的 Gate A 聚合与 Gate B second-request 证据已落在 App Server / RuntimeCore / 输入区 current 主链。Gate A `smoke:agent-runtime-current-fixture` 已覆盖 Plan hydrate、Inputbar pending steer、Claw GUI current fixture 与相关 current projection，证明 approval 改造没有让输入区 / plan / current read model 回流旧面；真实 Electron CDP Gate B 第一轮通过 `agentSession/action/respond decision=allow_for_session` 写入 session cache，第二轮同 session / 同 `browser_control` contract 自动 resolved 且 GUI 不再弹 approval prompt。fixture backend 仅投影 `approval.session_cache.hit` 与 `action.resolved source=approval_session_cache` 到 read model，不在 vendored Aster、Aster `Tool` trait adapter、`runtime_tool_bridge` 或 native tool overlay 新增 approval hook / cache / pending map。

2026-07-09 补充复核：P2 scope/lifecycle 继续落在 App Server current owner。`SessionApprovalCacheKey` 已扩展 `scope`，包含 `riskClass`、`workspaceId`、`workingDirHash`、`projectRootHash`、`networkHost`；path 只保存 sha256 摘要，URL 只保存 scheme/host/port，不保存 query/token/response preview。`agentSession/turn/cancel`、approval `decision=cancel` 与 `agentSession/delete` 清理 RuntimeCore session cache；不同 network host 的 browser_control request 不复用 `allow_for_session` 授权。该改造没有向 `lime-rs/vendor/aster-rust`、Aster `Tool` trait adapter、`runtime_tool_bridge` 或 native tool overlay 写入任何 approval hook/cache/pending map。

2026-07-09 追加复核：shell / command execution 的 approval contract、默认 decision set、runtime contract 与非敏感 `approvalScope` projection 已收敛到 `tool-runtime::execution_approval`。`lime-agent` 的 tool lifecycle 只把该 projection materialize 成 `RuntimeAgentEvent::ActionRequired`，不再持有 URL 归一化或 scope hash 规则；`runtime_tool_bridge` / `runtime_overlay` 仍不得新增 session cache、pending map 或 approval hook。shell 当前没有运行中 cache consumer，因此默认仍不宣告 `allow_for_session`。

2026-07-10 复核：R4 Bash / PowerShell foreground shell execution 的完全授权不打扰语义已通过 GUI Gate A/B 复验。`tool-runtime::shell_execution` 在 `approval_policy=never`、`sandbox_policy=danger-full-access` 或 turn metadata `accessMode=full-access` 时直接处理 warning command，不生成 `ActionRequired`，因此输入区不出现 approval prompt；非 full-access warning 仍 fail back 到现有 HITL 退场边界。随后 background shell start first slice 也迁入 `tool-runtime::shell_execution`：Bash `background: true` 与 PowerShell `run_in_background: true` 直接生成 task id / output file，使用 `AGENT_BACKGROUND=1`，日志读取继续走 current Read / file read owner，不新增 query/kill tool surface。Gate B `approval-request-full-access` 通过真实 Electron CDP fixture 验证“完全授权下不弹确认”，Gate A 聚合验证 approval resume/decline/cancel/full-access、Plan hydrate、Inputbar pending steer 和 current read model 没有回流 Aster approval hook/cache/pending map。GUI 输入 helper 的 controlled setter / `InputEvent("input")` 只属于 fixture harness 稳定性，不是 production fallback。

### 1.2 Agent compat 文件移动纠偏

2026-07-09 复核：`vendor/aster-rust/crates/aster*` 被移入 `lime-rs/crates/agent-compat*` 只是临时破局，不是 refactor v1 current owner。`agent-compat` 是待迁出 staging / compat blocker，不是“暂时不要改”的保护区；它的允许改动只有迁出生产调用、删除 Aster-only surface、减少本地 burn-down 依赖。`agent-compat` 现存指向 Lime current owner 的依赖也只能作为 burn-down allowlist，退出条件是迁出对应调用并删除依赖；不得再通过新增 owner 依赖给旧 reply loop、provider、tool、session 或 event source 续命。后续必须按 Thread / Turn / Item 和现有 crate owner 移动文件：

- Thread：session / thread / history / transcript / task board 进入 `thread-store` 或 `agent-protocol`，不继续让 Aster `SessionStore` / `ThreadRuntimeStore` 当事实源。
- Turn：reply loop / provider stream / tool lifecycle / MCP / Skill execution 进入 `agent-runtime`、`model-provider`、`tool-runtime`、`lime-mcp`、`lime-skills`。
- Item：message、tool output、media、approval、evidence projection 进入 current Item/read model owner，不通过 Aster `Message` / `ToolResult` 旁路投影。

第一批 owner 文件移动已完成：`plan/**` -> `tool-runtime/src/compat/aster_reference/plan/**`、`rules/**` -> `agent-runtime/src/compat/aster_reference/rules/**`、`streaming/**` -> `model-provider/src/compat/aster_reference/streaming/**`，并从 `agent-compat/src/lib.rs` 删除 public module surface。`agent-compat-models/**` 已确认由 `agent-protocol::{openai, anthropic}` 承接并物理删除，不再作为 refactor v1 owner 或 compat crate。`agent-compat/tests/**` 与 `agent-compat/src` 下独立 `tests.rs` / `*_tests.rs` / `*_property_tests.rs` 已删除；旧 Aster integration / property / replay 测试不进入 Thread / Turn / Item current owner，必要回归必须回补到各 Lime owner crate。`config/signup_{openrouter,tetrate}/**` 已按 Codex 无对应 current 面删除；provider credential onboarding 若需要必须进入 Lime current provider/settings 主链，不通过 Aster config signup 目录。上述 reference 目录只是待吸收 / 待删除 reference，不是新的 current API；后续若 Codex 无对应能力，按 `dead / deleted / forbidden-to-restore` 删除。

2026-07-10 补充：`agent-compat/src/agents/mod.rs` 的无外部生产消费者子模块已从 public API 收缩为 crate-private staging，`COMPACT_TRIGGERS` / `PromptManager` / `TaskConfig` re-export 已删除；Aster prompt snapshot `.snap.new` 产物、`prompt_manager` snapshot 测试和 `insta` direct dependency 已删除并由治理守卫禁止恢复。`Agent::reply(...)` 没有 Lime 外部生产调用，subagent staging adapter 已直接调用 pinned-provider `reply_with_provider(...)`，`Agent::reply(...)` wrapper 已删除；`reply_with_provider(...)` 仍因 `provider_reply_exit_source.rs` 最后一跳暂时 public，继续是 R2/R3 blocker。这一步不宣称 R2/R4/R7 完成，只是切断 Aster agents public surface 与旧正向测试 evidence 的无谓续命，剩余 `Agent` / `AgentEvent` / MCP extension bridge / live execution hook / session config 仍按 Thread / Turn / Item owner 继续迁出。

2026-07-11 纠偏：`agent-compat/src/agents/{subagent_handler.rs,subagent_task_config.rs,subagent_tool.rs}` 已删除。旧 foreground subagent fallback 会在没有 callback-backed current runtime 时重新启动一套 Aster `Agent::reply_with_provider(...)` loop，并保留 `TaskConfig`、`ASTER_SUBAGENT_MAX_TURNS`、ad-hoc recipe delegation tool 和本地 Agent tool parser/projection；这不符合 refactor v1 的 Turn owner 和 Codex-first Multi-Agent 口径。后续 Multi-Agent / Team 只能继续走 `tool-runtime::collab_agent`、App Server / RuntimeCore callback-backed current runtime、Thread / Item read model 和 Evidence 投影；不得恢复 Aster foreground subagent handler 作为“简化实现”。

2026-07-11 provider/session surface 纠偏：`agent-compat` 删除无消费者 provider 默认模型创建 helper和 subagent session 创建/root metadata re-export。`providers::create_with_default_model(...)` / `ProviderEntry::create_with_default_model(...)` 属于 Aster provider convenience API，不进入 `model-provider` current owner；`session::create_subagent_session(...)` 和 `session::SubagentSessionMetadata` root API 不进入 Thread / Turn / Item current owner。内部 metadata struct 仅作为 source adapter 解析历史 extension data，current presentation projection 已归 `lime-agent` read-model helper。

2026-07-11 SessionStore public surface 纠偏：`agent-compat` 删除无消费者 `NoopSessionStore` 空实现和 `agent-compat/src/session/README.md` 旧对外用法说明。Aster “可插拔 SessionStore / 默认 SQLite / 自定义存储”不是 refactor v1 current owner；Session persistence/read model 后续只能继续向 `thread-store`、App Server read model 和 `agent-runtime` 收敛。后续已删除 `session_manager.rs`、root `SessionManager`、`query_session` 和 `apply_session_update` convenience；剩余 `SessionStore` trait / Aster durable source 只是 R5/R6 compat blocker，不得恢复为对外 API。

2026-07-11 root convenience surface 纠偏：`ConversationToolResult` root alias、`conversation::ToolResult` public re-export、`RecipeBuilder` 和 `Recipe::builder()` 已删除。Aster recipe builder convenience API 不进入 Thread / Turn / Item；剩余 `Recipe` / `Response` / `SubRecipe` DTO 只作为 session metadata / reply config blocker 暂留，后续要么迁到 `agent-protocol` / App Server owner，要么按 Codex 无对应能力删除。

2026-07-10 追加补充：`agent-compat/src/conversation/mod.rs` 的 `message` 子模块，以及 `agent-compat/src/lib.rs` 的 `model`、`recipe`、`tool_inspection` 顶层模块已从 public API 收缩为 crate-private staging；`lime-agent` 外部生产引用已改为最小 root re-export。Aster `Message` / `Conversation` / `ModelConfig` / `Recipe` / tool inspection DTO 仍是 R2/R5/R6/R4 未迁完前的 compat blocker，不进入 refactor v1 current owner；最终必须迁到 Thread / Turn / Item、`agent-protocol`、`model-provider`、`tool-runtime` 或 App Server read model 后删除这些 re-export。

2026-07-10 再追加：`agent-compat/src/lib.rs` 的 `conversation`、`session`、`tools` 顶层模块也已从 public API 收缩为 private staging；`lime-agent` 外部生产引用改为 root `aster::{...}` 过渡面，`aster::conversation::*` / `aster::session::*` / `aster::tools::*` module path 不得恢复。该改动只减少 Aster public surface，不改变 Thread / Turn / Item 判定：message/conversation 归 Turn/Item blocker，session/runtime store 归 Thread/Turn blocker，tool registry 归 Turn tool lifecycle blocker。

2026-07-10 provider reply 事实覆盖：旧 `request_tool_policy/provider_reply_exit_source.rs` 与 `model-provider::provider_stream::source_execution` wrapper 已删除并由治理守卫禁止恢复。当前 R2/R3 唯一 Aster provider reply 最后一跳是 `request_tool_policy/aster_reply_backend_adapter.rs::run_aster_reply_backend(...)` 内的一次 `.reply_with_provider(...)`；`agent-runtime::reply_backend` 只保留 provider handle 校验、wire policy、session metadata 注入和 `RuntimeReplyBackendRunPath` 分派，`model-provider::provider_stream` 只保留 provider handle / stream request / response event 等 current contract。本轮进一步把 Aster provider trait object 包进 `credential_bridge::CompatReplyProvider` 退场句柄，`aster_reply_backend_adapter.rs` 不再暴露 `Arc<dyn Provider>` / `dyn Provider` 签名；Aster message/session lowering 也已收进 `AsterReplyBackendRequest::from_current(...)` 单一退场 request，后续替换 current provider backend 时应整体删除该 lowering 壳。后续所有历史段落中关于 `ProviderReplyExitSource`、`ReplyExitSourceExecutor`、`run_provider_reply_exit_source(...)` 或 `source_execution` 的“当前”说法均按本段覆盖，只作为历史 evidence，不作为恢复许可。

2026-07-10 runtime timeline / conversation 事实覆盖：`RuntimeSessionSnapshotRecord` / `RuntimeTurnSnapshotRecord` / `RuntimeItemSnapshotRecord` 到 `RuntimeTimeline*` 的 snapshot flatten、status folding、item payload mapping、tool output extraction 与 request-user-input schema projection 已归属 `agent-runtime::runtime_timeline_record`。runtime item record -> conversation message 的 transcript / user / agent 三分支投影已归属 `thread-store::conversation_transcript`，`RuntimeItemPayloadRecord::InternalTranscript` 保留 transcript role、content_json、metadata_json 和 created_timestamp。`lime-agent/src/runtime_timeline_adapter.rs` 只允许把 Aster `TurnRuntime` / `ItemRuntime` 降成 `thread-store::runtime_snapshot` record，并注入 tool-output dynamic filtering policy；Aster `ItemRuntime` 到 current record 的 lowering 统一停留在 `runtime_store_aster_adapter.rs::runtime_item_record_from_aster(...)`，conversation traversal 与 projection 统一由 `thread-store::runtime_store` / `thread-store::conversation_transcript` 承接。`runtime_conversation_aster_adapter.rs` 不得再承接 `RuntimeTimelineSnapshotSource`、`RuntimeTimelineSnapshotThread`、`RuntimeConversationItemSource`、item payload projection 规则或单件 Aster item -> conversation record adapter。R5/R6 仍未完成，因为 Aster durable source、Aster `SessionStore` 和 `AgentEvent` source adapter 仍在边界内。

2026-07-11 runtime store read/write skeleton 事实覆盖：`thread-store::runtime_store` 已承接 runtime store read contract、`RuntimeThreadRecord`、session snapshot traversal、conversation record traversal、`RuntimeThreadWriteStore` / `RuntimeTurnWriteStore` / `RuntimeThreadTurnStore`、thread/turn ensure helper、`RuntimeItemWriteStore` / `RuntimeItemStore`、item upsert helper、按 thread 计算下一条 item sequence helper 和 transcript item 删除 helper；该模块是 Thread store contract current owner，不依赖 DB 也不依赖 Aster。`thread-store::conversation_transcript` 已承接 `TranscriptItemRecordInput`、`build_transcript_item_record(...)`、`next_runtime_item_sequence(...)` 和 transcript item 判定，Aster adapter 不再拥有 transcript item id / sequence / status / timestamp 纯规则。`runtime_support.rs` 读取 runtime overlay 时只通过 `thread-store::runtime_store::load_runtime_snapshot_record(...)` 产出 current snapshot record；`runtime_conversation_aster_adapter.rs` 与 `aster_session_store/runtime_conversation.rs` 均只调用 `thread-store::runtime_store::collect_runtime_conversation_records(...)` 读取 conversation records，生产代码不再直接遍历 Aster `ThreadRuntimeStore`；`aster_session_store/runtime_conversation.rs` 不再直接 `ThreadRuntime::new(...)` / `TurnRuntime::new(...)` / `upsert_thread/get_turn/create_turn` / `create_item/update_item/delete_item` / `store.list_threads(...)` / `store.list_items(...)` 或构造 Aster transcript payload，而是把 Aster action scope / turn context 降成 current `RuntimeTurnEnsureInput`，把 append sequence 交给 current `next_runtime_item_sequence_for_thread(...)`，并把 Aster `Message` 降成 current transcript item record 后调用 current write helper。Aster `ThreadRuntimeStore` 只允许停留在 `runtime_store_aster_adapter.rs::AsterRuntimeStoreAdapter` 的 durable source lowering 内。R5/R6 仍未完成，因为 Aster durable source、Aster `SessionStore` trait 和 `AgentEvent` source adapter 尚未迁出。

2026-07-11 runtime snapshot public surface 事实覆盖：`agent-compat::Agent::runtime_snapshot(...)`、`session::load_shared_session_runtime_snapshot` public re-export、`load_managed_session_runtime_snapshot(...)`、`load_runtime_snapshot_from_store(...)` 和 root public re-export 已删除。`lime-agent` 测试和生产读取都应先把 Aster durable source 适配为 current `RuntimeStore`，再调用 `thread-store::runtime_store::load_runtime_snapshot_record(...)` 产出 `RuntimeSessionSnapshotRecord`；不得为了测试方便恢复 Aster `Agent` convenience method 或 Aster snapshot loader function。生产 `runtime_store_aster_adapter.rs` 不再 import / lower whole `SessionRuntimeSnapshot`，`session_execution_runtime`、`session_store_tests` 与 `subagent_runtime_adapter` 测试中的 Aster snapshot fixture 已改成 current `RuntimeSessionSnapshotRecord` / `RuntimeThreadSnapshotRecord` / `RuntimeTurnSnapshotRecord`，`runtime_snapshot_record_from_aster(...)` / `runtime_thread_snapshot_record_from_aster(...)` test bridge 已删除并由治理测试禁止恢复。该刀把 snapshot read API 和测试 fixture 归属从 Aster Agent/Session public surface 收回 Thread store owner，但 R5/R6 仍未完成，因为 root `SessionRuntimeSnapshot` / `ThreadRuntimeSnapshot` DTO allowlist、Aster durable source、Aster `SessionStore` trait 和 `AgentEvent` source adapter 仍未删除。

2026-07-11 runtime event persistence 事实覆盖：`request_tool_policy::runtime_turn_event` 与 `runtime_item_event` 是 Aster event source 未迁完前的 transitional current adapter；它们只把 `AgentEvent::{TurnStarted,ItemStarted,ItemUpdated,ItemCompleted}` 降成 current turn/item record 并调用 `thread-store::runtime_store` helper。`aster_reply_backend_adapter.rs` 在 provider stream 前预创建 current turn，`aster_reply_stream_adapter.rs` 只在 source boundary 完成 turn/item persistence，且必须接收显式 `AsterThreadRuntimeStore`；禁止恢复全局 `require_aster_runtime_store()`、`agent-compat::Agent` 内部 turn/item writer 或旧 `persist_aster_runtime_item_events(stream)` 形状。该刀把 Turn / Item materialization 的写入规则继续收回 Thread store owner，但仍不能删除 Aster `AgentEvent` source adapter。

2026-07-11 request_tool_policy global store 事实覆盖：`runtime_status_item` 与 `runtime_request_item` 不再自行调用全局 `require_aster_runtime_store()`，而是由 `AsterReplyRuntimeHost`、approval confirmation 和 action-required response completion 从当前 `Agent` 显式传入 `AsterThreadRuntimeStore`。这一步把 RuntimeStatus item 与 request item completion 的写入边界继续收回 request_tool_policy source adapter，避免 writer 自己寻找 Aster durable source；但 `AsterThreadRuntimeStore` 本身仍是 R5/R6 durable source blocker，后续需要继续迁到 Thread/App Server owner。

2026-07-11 runtime status item owner 事实覆盖：`thread-store::runtime_status_item` 已承接 runtime status item id、sequence、payload 和 upsert 判定；`request_tool_policy/runtime_status_item.rs` 只保留确保 turn/thread 与 current record -> GUI item event 投影，不再直接构造 `RuntimeItemPayloadRecord::RuntimeStatus` 或直接调用 item sequence/upsert helper。该模块从 `runtime_store.rs` 拆出，是为了避免继续膨胀已约 `827` 行的 runtime store contract 文件。

2026-07-11 runtime request item completion 事实覆盖：approval / request_user_input response payload completion 已归 `thread-store::runtime_store::complete_runtime_request_item_record(...)` 与 `lime-agent::request_tool_policy::runtime_request_item` adapter。`submit_runtime_tool_action_confirmation(...)` 和 action-required response stream 入口在 current-facing boundary 完成 Item 状态写入，`agent-compat::Agent::complete_runtime_request_item(...)` 已删除。该能力属于 Item materialization，不属于 Aster confirmation channel 或 elicitation response 分支；Aster `ActionRequiredManager` / confirmation channel 只作为 reply loop blocker 暂留，不得恢复为 item completion owner。

2026-07-11 runtime item event persistence 事实覆盖：Aster `AgentEvent::{ItemStarted, ItemUpdated, ItemCompleted}` 的持久化已从 `agent-compat::Agent::persist_item_runtime(...)` 前移到 `lime-agent::request_tool_policy::runtime_item_event` + `aster_reply_stream_adapter.rs` source stream boundary；原始 Aster `ItemRuntime` 只在边界降成 `RuntimeItemSnapshotRecord`，随后统一通过 `thread-store::runtime_store::upsert_runtime_item_record(...)` 写入 current store contract。`agent-compat::Agent` 不再直接 `thread_runtime_store.get_item/update_item/create_item`，避免把 Item persistence 规则留在 Aster Agent 内部。该刀仍是 `transitional current adapter`，因为 Aster `AgentEvent` source 和 durable source 尚未删除；退出条件是 provider/reply loop 迁出 Aster 后删除 Aster event adapter 和 `runtime_store_aster_adapter`。

2026-07-11 runtime turn persistence 事实覆盖：runtime turn/thread 写入已从 `agent-compat::Agent::{ensure_thread_runtime, create_turn_runtime, create_turn_runtime_for_session_id, finalize_turn_runtime}` 前移到 `thread-store::runtime_store::{ensure_runtime_turn_record, complete_runtime_turn_record}` 与 `lime-agent::request_tool_policy::runtime_turn_event` source stream boundary。`RuntimeReplyStartRequest` 现在携带 `working_directory`，first attempt 和 retry attempt 都把真实工作目录传给 backend adapter；`RuntimeTurnEnsureInput` 携带 `input_text`、`context_override` 和 `output_schema_runtime`，existing turn 只补缺失字段。`agent-compat::Agent` 只保留纯 `build_turn_runtime(...)` 生成 Aster `TurnStarted` source event，不再直接操作 Aster `ThreadRuntimeStore` 创建 / 完成 thread/turn。该刀是 Thread/Turn owner 对齐，但仍属 `transitional current adapter`：Aster durable source、Aster `AgentEvent` source、provider/reply loop 和 `SessionStore` trait 未删除前，`runtime_store_aster_adapter` 仍是退场边界。

2026-07-11 runtime turn persistence 验证闭环：`asterMigrationBoundary.test.ts` 已更新为要求 `project_aster_reply_stream(...)` 传入 `runtime_store`、`working_directory`、`cancel_token` 与 `initial_turn_id`，并允许 stream boundary 使用 `persist_aster_runtime_events(...)` 做 source event 持久化；同时继续禁止 `agent-compat::Agent` 恢复 turn/item direct store helper。定向验证已覆盖 `lime-agent request_tool_policy`、`thread-store runtime_store`、`agent-runtime reply_backend` 与 Aster 迁移治理守卫。

2026-07-11 request policy SessionManager fallback 事实覆盖：取消上下文 marker 写入不再从 `lime-agent::request_tool_policy/aster_reply_adapter.rs` fallback 到全局 `aster::SessionManager::add_message(...)`；该入口只使用当前 `Agent` 注入的 session store，缺 store 时 fail closed 记录 warning。该刀减少 Lime request policy 对 Aster global session manager 的生产引用，但仍是 `transitional current adapter`：注入 `SessionStore` trait、Aster `Message` marker DTO、`query_session` / `apply_session_update` helper 与 provider/reply session lowering 未迁出前，R5/R6 不能关闭。

2026-07-11 Agent session helper fallback 事实覆盖：`agent-compat::Agent` 的 session 读写 helper、history replacement 分支、session name generation 后台任务、`reply_parts::update_session_metrics(...)` 和 `/clear` token reset 均不再回退全局 `SessionManager` / `query_session` / `apply_session_update`；缺注入 `SessionStore` 时 fail closed。无消费者 `delete_managed_session(...)` 与 `replace_session_conversation(...)` 已删除，后续 `session/update.rs` 也已物理删除，不再作为 `session/mod.rs` public surface。后续又删除了 `session_manager.rs` 与 root `SessionManager` re-export，该刀把 Thread/session 写入方向继续压到注入 current store adapter；但 `SessionStore` trait、Aster `Session` / `Message` DTO、Aster durable source 仍是 `compat blocker`，不能把 `agent-compat` 误报为搬空。

2026-07-11 team/chatrecall SessionManager fallback 事实覆盖：`agent_control`、`team_tools` 与 `session/team` 已全部改为显式消费注入 `SessionStore`，缺 store fail closed；`chatrecall_extension` 的 load/search 改为从 `PlatformExtensionContext.session_store` 读取，其中搜索继续消费 `LimeSessionStore::search_chat_history(...)` 背后的 `thread-store::history_search` current owner。`session/query.rs` 与 `session/update.rs` 已物理删除，`session/mod.rs` 不再 re-export `query_session` 或 `SessionUpdateBuilder`。判定：Thread/session read/search 方向继续收敛到 current store adapter 与 `thread-store`；MCP platform extension bridge、Aster `SessionStore` trait、Aster durable source 和 provider/reply `Session` / `Message` lowering 仍是 `compat blocker`。

2026-07-11 subagent session lookup 事实覆盖：`session/subagent.rs::resolve_named_subagent_child_session(...)` 不再调用全局 `SessionManager::list_sessions_by_types(...)`，而是显式接收 `&dyn SessionStore`；`agent_control` 从注入 store 调用该 helper。无消费者 `list_subagent_sessions_with_metadata(...)` 已删除。判定：Subagent session relationship 属于 Thread metadata/read model；当前仍是注入 store adapter 过渡形态，退出条件是删除 Aster `SessionStore` trait / durable source 和 provider/reply Aster DTO lowering。

2026-07-11 SessionManager 文件删除事实覆盖：`agent-compat/src/session/session_manager.rs` 已整体删除；`session/mod.rs` 不再声明 `mod session_manager;` 或 re-export `SessionManager`，`agent-compat/src/lib.rs` root allowlist 也不再导出 `SessionManager`。`SessionInsights` Aster DTO 已删除，insights current owner 是 `thread-store::session_insights::SessionInsightsRecord`；`session/session_record.rs` 只保留 provider/reply session lowering 尚需的 `Session` / `SessionType` 最小数据形状。该文件不得恢复 `SessionManager` / `SessionStorage` / `SessionInsights` / `SessionUpdateBuilder` / update/search convenience。`session/chat_history_search.rs`、`session/query.rs`、`session/update.rs` 仍保持删除态。判定：Aster global session manager、SQLite manager storage、session insights DTO、session convenience builder、批量 update wrapper 和 SQLite chat history search wrapper 是 `dead / deleted / guarded`；Thread/history current owner 不在 `agent-compat`。R5/R6 仍是 `compat blocker`，但剩余原因已收窄为 Aster `SessionStore` trait、Aster durable source、provider/reply Aster `Session` / `Message` lowering 和 `AgentEvent` source adapter。

2026-07-11 global SessionStore install path 删除事实覆盖：`agent-compat/src/session/store.rs` 已删除 global `SessionStore` OnceCell、`install_global_session_store(...)`、`get_global_session_store(...)` 和 `is_global_session_store_set(...)`；`bootstrap.rs` 的 `initialize_shared_session_runtime_with_root(...)` 不再接收 `session_store` 参数，也不再安装无消费者 global store。`lime-agent::runtime_store_aster_adapter::initialize_aster_runtime_with_root(...)` 与 `runtime_support::initialize_agent_runtime(...)` 不再把 `LimeSessionStore` cast 成 Aster `SessionStore` 写入 global；`initialize_agent_runtime(_db)` 暂保外部签名，后续可在 App Server 调用面收口时删除 `_db` 参数。判定：global store install path 是 `dead / deleted / guarded`；剩余 R5/R6 blocker 不是 global fallback，而是显式注入 `SessionStore` trait、Aster durable source、provider/reply Aster DTO lowering 与 `AgentEvent` source adapter。

2026-07-11 SessionStore orphan convenience 删除事实覆盖：`agent-compat/src/session/store.rs` 不再定义 `list_sessions`、`delete_session`、`get_insights`、`update_working_dir`、`update_session_type` 或 `update_recipe`；`lime-agent` 的 Aster trait adapter、测试 fake 和旧正向测试同步删除这些方法，`session_record_sql.rs` 也不再保留只服务 `get_insights` 的 SQL loader。判定：这组 convenience 属于 `dead / deleted / guarded`，不是 Thread / Turn / Item current owner；Aster `SessionStore` 剩余 compat surface 只允许服务仍有生产消费者的 create/get/add/replace/list_by_types/update_name/extension/token/provider/search，退出条件仍是迁出 durable source 和 provider/reply 对 Aster `Session` / `Message` 的 lowering。

2026-07-11 runtime queue source lowering 事实覆盖：Turn queue gate / submit / resume owner 仍是 `agent-runtime::runtime_queue`，Aster `QueuedTurnRuntime` <-> current `RuntimeQueuedTurn` 的 source lowering 已从独立 `runtime_queue_aster_adapter.rs` 折叠进 `runtime_store_aster_adapter.rs`，并删除原文件。`runtime_support.rs` 只通过 `runtime_queue_store_from_aster(require_runtime_store(...))` 把 Aster durable source 立即适配为 current `RuntimeQueueStore` / `RuntimeQueueService`，不得重新接触 Aster queue DTO 或实现 `RuntimeQueueStore`。R5/R6 仍未完成，因为 queue durable source 仍来自 Aster `ThreadRuntimeStore` compat adapter，下一刀要继续迁出 Aster `SessionStore` trait / durable source 和 `AgentEvent` source adapter。

## 2. 已迁能力复核

| 已迁能力                                                                                                                        | 当前落点                                                                                                                                                                                                                           | Thread / Turn / Item 归属                       | refactor v1 判定                              | 后续动作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session record create / exists / working_dir / extension_data / default working_dir                                             | `lime_core::database::agent_session_repository`                                                                                                                                                                                    | Thread metadata                                 | `refactor-aligned current`                    | 保持为数据库 repository 边界；不得把 runtime item / provider event 塞入该 repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| session metadata/delete writes                                                                                                  | `lime_core::database::agent_session_repository` + `lime_session_repository.rs` thin adapter                                                                                                                                        | Thread metadata mutation                        | `refactor-aligned current`                    | `lime_session_repository.rs` 只保留 trait adapter；写入 SQL 不得回流                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| session row pure projection defaults                                                                                            | `thread-store::session_record`                                                                                                                                                                                                     | Thread read model projection                    | `refactor-aligned current`                    | 保持 DB 无关；继续承接 title/session_type/timestamp/json 默认值规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| session row SQLite loading                                                                                                      | `lime-agent/src/session_record_sql.rs`                                                                                                                                                                                             | Thread read adapter                             | `transitional current adapter`                | 仅作为搬空 Aster `SessionStore` 的过渡 adapter；不得长期扩张；Aster `SessionStore` 删除后优先删除该文件，若仍需 SQLite read model，再并入 App Server / read model owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Aster `SessionStore` get/list/search adapter                                                                                    | `aster_session_store/aster_trait.rs` + `session_projection.rs`                                                                                                                                                                     | Thread compat DTO adapter                       | `compat blocker`                              | 只能调用 current read helpers 和 DTO 转换；不得恢复 `SESSION_RECORD_SELECT_COLUMNS` / `agent_sessions` SELECT / row mapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Aster `SessionStore` export/import/copy/truncate                                                                                | Lime impl、vendor public wrapper、vendor trait 方法和 test fake 均已删除                                                                                                                                                           | 历史 bulk session 操作                          | `dead / deleted`                              | 当前无生产客户；不再迁成服务；Lime / vendor 不得重新实现这些 bulk 方法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| conversation transcript / legacy conversation / history search / todo / memory stub / insights                                  | `thread-store::*` pure modules + Aster compat adapters                                                                                                                                                                             | Thread history / read model                     | `refactor-aligned current`                    | 保持 pure rule owner；Aster adapter 只做 DTO 回填，迁完后删除 adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| runtime queue contract                                                                                                          | `agent-runtime::runtime_queue` + `runtime_store_aster_adapter.rs`                                                                                                                                                                  | Turn queue                                      | `refactor-aligned current` + `compat blocker` | current queue service 继续在 `agent-runtime`；Aster queue DTO lowering 已折叠到 store source adapter，独立 `runtime_queue_aster_adapter.rs` 已删除并禁止恢复；Aster `ThreadRuntimeStore` durable source 迁完后删除该 compat 分支                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| runtime timeline / conversation / snapshot / store read/write contract                                                          | `thread-store::runtime_store` / `thread-store::runtime_snapshot` / `agent-runtime::runtime_timeline_record` / `thread-store::conversation_transcript` + `runtime_store_aster_adapter.rs` / `runtime_conversation_aster_adapter.rs` | Thread store contract / Turn / Item projection  | `refactor-aligned current` + `compat blocker` | runtime store read contract、session snapshot traversal、conversation record traversal、thread/turn ensure write skeleton、item write skeleton、append sequence helper、transcript item upsert/delete helper 归 `thread-store::runtime_store`；snapshot record DTO 归 `thread-store::runtime_snapshot`；snapshot record -> timeline projection 归 `agent-runtime::runtime_timeline_record`；runtime item record -> conversation message projection、transcript item record 构造、sequence 和 transcript 判定归 `thread-store::conversation_transcript`。Aster adapter 只允许 source lowering 和 Aster `Conversation` / `Message` DTO 回填；Aster durable source、Aster `SessionStore` 和 `AgentEvent` source adapter 仍是 R5/R6 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| App Server context evidence export summary / session compaction item                                                            | `app-server` `evidence/export` + `runtime/evidence_provider/context.rs` + `runtime/memory_prompt.rs` + `thread_item_projection.rs`                                                                                                 | Turn runtime metadata -> Item / Evidence 投影   | `refactor-aligned current`                    | 只消费 current `context_packet_telemetry` / turn runtime metadata，输出 `context-evidence-summary.v1`；不从 Aster vendor、Aster `SessionStore` 或 prompt 文本重建 context 策略；`session_compaction_prompt_context` 已透传真实 `sidecarRef` 到 next-turn `ContextPacket` metadata，`context.compaction.completed` 已 materialize 成 read model `context_compaction` Item；memory summary sidecarRef skeleton 已接入并通过回归，且明确不保存 Soul prompt / Style Pack / full system prompt；media input attachment reference 已进入 `ContextPacket` telemetry skeleton，inline `data:` media fail closed；full media preview / binary sidecar read / Workbench GUI smoke 仍是 refactor v1 后续 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| App Server media message delta Item skeleton                                                                                    | `app-server` `runtime/thread_item_projection/agent_message.rs`                                                                                                                                                                     | Turn `message.delta` -> Item `agent_message`    | `refactor-aligned current`                    | 消费 RuntimeCore `RuntimeMessageDeltaContent::from_payload(...)` parser；media-only `message.delta.contentPart/contentParts` 可 materialize 成 `agent_message.contentParts`，同 `itemId` text/media delta 可合并；`contentPart/contentParts` alias mismatch 与 inline `data:` media fail closed；这是 Item projection current owner，不在 Aster vendor、provider wire 或 GUI 中重新解释媒体。App Server 定向测试 `media_only_delta_creates_agent_message_content_parts` 已通过；退出条件是继续接协议 / generated client / projection package / Workbench。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| tool execution shell/path/web/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan/tool_search helpers | `tool-runtime::*` + Lime reply-loop Aster bridge                                                                                                                                                                                   | Turn tool lifecycle / Item tool projection      | `refactor-aligned current` + `compat blocker` | 已迁 helper 不再回 vendor；`tool-runtime::native_overlay` 已承接 Lime native overlay 清单、registration plan、install plan、turn-context source、stateless surface 和 `RuntimeNativePermissionDecision` / `check_runtime_native_tool_permissions(...)` permission owner，GUI inventory 通过 install plan 把命中的工具标为 `current_surface`；`tool-runtime::native_dispatch` 已承接无 gateway 工具 dispatcher，并通过 gateway-aware builder 接入 `memory_store` / `image_task` / `tool_search`，gateway-backed wrapper 也从同一个 dispatch 读取模型可见 definitions；`tool-runtime::web_fetch` / `tool-runtime::web_search` 已承接 Web executor，vendor Web wrapper 已删除，`lime-agent/src/native_tools/web_retrieval.rs`、`native_tools/{sleep,view_image,update_plan}.rs`、`tools/{apply_patch_tool,skill_search_tool}.rs` 已删除，Aster `PermissionCheckResult` / `ToolContext` / `ToolResult` 适配集中到 `runtime_tool_bridge.rs`，但 permission / confirmation 规则不再归属该 bridge；`tool-runtime::apply_patch` 已承接 patch 执行、路径权限和 metadata/diff 构造；`tool-runtime::skill_search` 已承接 skill metadata search、workspace 解析和 evidence metadata 构造；`tool-runtime::memory_store` 已承接 memory tools DTO/gateway、权限和 metadata 构造；`tool-runtime::image_task` 已承接 image generation task 的 App Server media DTO gateway、输入校验、project root / thread / turn 约束和 task metadata 投影；`tool-runtime::sleep` 已按 Codex `clock.sleep` / `duration_ms` 语义承接等待 executor、strict schema、elapsed/interrupted metadata 和 cancel token 中断，GUI display/process summary 消费 current `sleep`；`tool-runtime::view_image` 已按 Codex `view_image` 语义承接本地图片读取、strict schema、data URL 和 model-visible image metadata，GUI/imported runtime event 已消费 current `view_image` key；`tool-runtime::update_plan` 已按 Codex TODO/checklist 语义承接 plan/explanation metadata、Plan mode 禁用和 App Server `plan.final` 真实消费链；`tool-runtime::tool_search` 已对齐 Codex deferred tool discovery，canonical name 收敛为 `tool_search`，接入 App Server MCP `search_mcp_tools` current gateway 和前端结构化 ToolSearch summary；per-tool `#[cfg(test)] create_*_tool()` helper 已删除，adapter 回归集中到 `runtime_tool_bridge.rs`；下一步处理 Aster reply loop native tool registry 壳、sleep input queue activity signal 与 provider/reply loop |
| Aster session memory stub / automatic memory injection                                                                          | 已删除：`thread-store::memory_stub`、`aster_session_store/memory_stub.rs`、vendor `session/memory*`                                                                                                                                | 旧 Thread memory 旁路，不进入 refactor v1 主链  | `dead / deleted / guarded`                    | Lime memory current 主链是 App Server memory store + `tool-runtime::memory_store` tool lifecycle；Aster `SessionStore` memory trait、`SessionManager` memory API、reply loop 自动 system prompt memory 注入、vendor memory repository/pipeline/FTS schema 均已删除，不保 disabled stub 兼容层                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| provider/reply stream request/event/host DTO                                                                                    | `agent-runtime::*` / `model-provider::*` + `aster_reply_adapter.rs`                                                                                                                                                                | Turn execution / provider event materialization | `partial current` + `compat blocker`          | `model-provider` 已承接 provider notification envelope / text classification、response event/item DTO、sampling、poll/cancel、first-text delta、tool-input delta、model-change、progress、failure logging、plaintext tool-use 和 image input policy；`Agent::reply(...)` wrapper 已删除。仍必须继续迁出 Aster internal reply loop、Aster `Message`、Aster `AgentEvent`、provider trait object 和 `reply_with_provider(...)` 最后一跳                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| vendor unused public modules                                                                                                    | 已从 `aster-core` `lib.rs` 和物理目录删除                                                                                                                                                                                          | 不进入 Thread / Turn / Item current 主链        | `dead / deleted`                              | `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome*`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、root `mcp` manager、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 不得恢复为 valuable reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. 立即生效的迁移规则

1. 每个后续 Aster 迁移批次必须写清 Thread / Turn / Item 归属。
2. 不能把“从 Aster 搬出来”直接等同于“已经符合 refactor v1”；落点必须能对应 `module-alignment-plan.md` 的 current owner。
3. `lime-agent/src/**` 里的新 helper 如果只是服务 Aster trait adapter，应标为 `transitional current adapter`，并写清删除条件。
4. `thread-store` 只承接 DB 无关的 Thread/read-model 规则；不要为了搬 SQL 把 `rusqlite` 引入 `thread-store`。
5. `agent-runtime` 只承接 Turn / runtime / projection contract；不要把 Aster DTO 或 provider wire event 变成 current API。
6. `tool-runtime` 承接 tool definition / execution / policy；GUI 或 App Server 不得重新推断 tool lifecycle。
7. 迁移后的功能必须进入 App Server / frontend read model / GUI projection / Evidence 中至少一条真实消费链；否则只能标为 reference，不算迁移完成。

## 4. 当前影响项

### 4.1 `session_record_sql.rs`

当前状态：

- 已从 `lime_session_repository.rs` 和 `aster_session_store` 中收走 row loading。
- 已改为 row mapping error fail-fast，禁止 silent row drop。
- 仍位于 `lime-agent`，因为 `thread-store` 目前是 DB 无关 pure crate，且 Aster `SessionStore` trait 仍在 `lime-agent` compat 边界内。

判定：

- `transitional current adapter`。
- 不应继续扩成永久 Thread store。

退出条件：

- Aster `SessionStore` trait 删除后，如果 `lime-agent` 不再需要直接读取 `agent_sessions` rows，则删除 `session_record_sql.rs`。
- 如果仍有非 Aster current 消费者需要 SQLite row loading，应迁到 App Server read model / repository owner，并保留 `thread-store::session_record` 作为 pure projection。

### 4.2 `agent_session_repository.rs`

当前状态：

- 负责 session metadata/create/update/delete repository。
- 主文件已拆测试，低于 800 行。

判定：

- `refactor-aligned current`，但只限 Thread metadata repository。

边界：

- 不承接 Turn item、tool lifecycle、provider event、GUI projection。
- 后续如果继续增长，优先拆 read/write 子模块，不回到巨型 repository。

### 4.3 `aster_trait.rs`

当前状态：

- direct write SQL 已迁出。
- get/list/search 的 session record SELECT 已改为调用 `session_record_sql` helper。
- export/import/copy/truncate 只有 Aster trait impl 自己命中，已按“无客户，不保兼容”从 Lime `SessionStore` impl 删除；vendor `session/export.rs`、`session/archive.rs`、`session/diagnostics.rs`、`SessionManager` bulk wrapper、vendor `SessionStore` trait 方法和 `agents/agent.rs` 测试 fake 已删除。
- `list_sessions` / `delete_session` / `get_insights` / `update_working_dir` / `update_session_type` / `update_recipe` 也已按无生产消费者删除；`session_record_sql.rs` 不再保留 insights SQL loader。
- 仍是 Aster `SessionStore` trait compat blocker。

判定：

- `compat blocker`。

退出条件：

- runtime conversation source 不再依赖 Aster `Conversation` / `Message` DTO。
- provider/reply loop 不再要求 Aster `Session` DTO。
- Aster `SessionStore` trait 不再是 `lime-agent` 编译依赖后，删除该 adapter，而不是继续补兼容实现。
- export/import/copy/truncate 和 orphan convenience methods 不得恢复；后续 `SessionStore` 剩余 blocker 只讨论 create/get/add/replace/list_by_types/update_name/extension/token/provider/search 这些仍有生产消费者的最小 surface、runtime conversation 和 provider/reply 对 Aster `Session` / `Message` 的依赖。

### 4.4 vendor unused public modules

当前状态：

- `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome`、`chrome_mcp`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、root `mcp` manager、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 已从 vendored `aster-core` public module surface 删除。
- 这些模块没有 Lime `aster::...` 消费，也没有保留 Aster 模块的外部引用。
- `claude_plugin_cache` 仍被 `skills/loader.rs` 使用，本批未删除。
- `tools::lsp` 与 vendor `parser` LSP 子系统已在 2026-07-08 按 Codex 无对应工具面判为 `dead / deleted / forbidden-to-restore`，不再作为 top-level vendor module 例外或 valuable reference 编译留存。
- `tools::search`、Lime 自有 `lime_core::memory` / `lime_agent::prompt` 不属于本批 top-level vendor module 删除对象；旧 `mcp::logging` / `mcp::notifications` 已随 root MCP manager 删除，MCP current owner 是 `lime-mcp` / App Server gateway / `tool-runtime::mcp_*`。
- Lime 自有 `infra::telemetry` 不属于本批 top-level vendor module 删除对象。
- nested session wrapper `session/cleanup.rs` 与 `session/statistics.rs` 已删除；`cleanup_expired_data` / `CleanupStats`、`calculate_statistics` / `SessionStatistics` 等旧 Aster public API 没有 Lime current 消费，也没有进入 Thread / Turn / Item current owner。
- `agent-compat/src/session/{fork,resume,worktree}.rs` 已删除；Aster session fork/merge、summary cache resume 和 worktree extension public API 没有 Lime current/compat 生产调用，不进入 Thread / Turn / Item current owner。后续若需要 branch、resume 或 worktree 产品能力，必须进入 Thread / App Server / project_git current owner。
- `agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs` 已删除；Aster provider live test、record/replay provider 和 API-key auto-detect 不进入 provider current owner。Provider test/check 只能走 App Server / `model-provider` current 主链。
- `agent-compat/src/providers/mod.rs` 已把 concrete provider implementation / helper modules 收缩为 crate-private staging，`providers/formats/mod.rs` 也已把 provider-specific wire-format helper 收缩为 crate-private；外部只保留 R2/R3 未迁完前必需的 `base`、`errors`、`formats::openai_responses` 与 factory exports。provider backend / connection test / stream execution 归 `model-provider` / App Server current owner，不得恢复 `aster::providers::<provider>` public API。
- `agent-compat/src/config/mod.rs` 已把 `aster_mode`、`base`、`declarative_providers`、`extensions`、`permission`、`search_path` 和相关 re-export 收缩为 crate-private staging；外部只保留 `paths`，因为 `lime-agent` session/runtime store adapter 仍读取 `initialized_path_root()`。provider/settings/config UI/API 归 Lime current provider/settings/App Server 主链，不得恢复 `aster::config::*` public API。
- `agent-compat/src/permission/mod.rs` 已把 `permission_confirmation`、`permission_inspector`、`permission_judge`、`permission_store` 子模块收缩为 crate-private staging；外部只保留 root 最小 re-export。Approval / HITL current owner 仍是 App Server RuntimeCore pending action、`agentSession/action/respond` 与 `tool-runtime::execution_approval`，不得恢复 `aster::permission::permission_*` public API。
- `agent-compat/src/tools/mod.rs`、`tools/file/mod.rs`、`tools/search/mod.rs` 与 `session/mod.rs` 已把实现子模块收缩为 crate-private staging；外部只保留 root 最小 re-export。`tools/file/diff_summary.rs` 与 `tools/search/ripgrep.rs` 已删除；文件改动摘要、搜索执行和工具生命周期不得继续从 Aster staging 暴露。
- `agent-compat/src/mcp/**` 已删除；R7 剩余 blocker 只保留 `agents/mcp_client.rs`、Aster extension manager / built-in extension clients 的 reply loop adapter，不得把 root MCP manager 当作 valuable reference 或 current owner 恢复。
- `agent-compat/src/{context_mgmt,mcp_utils,posthog,prompt_template,security,slash_commands,tool_monitor,user_message_manager,utils}.rs`、`agent-compat/src/{execution,hints,hooks,network}/**`、`agent-compat/src/{oauth,token_counter}.rs`、`agent-compat/src/tools/hooks.rs`、`agent-compat/src/prompts/**` 已删除或迁出；这些只是 no-op telemetry、空 security / repetition inspector、custom slash recipe stub、空 user message queue、empty hints loader、root OAuth bail stub、dummy token counter、历史 `mcp_utils::ToolResult` 别名、root helper 垃圾桶、root hook public stub、Aster-only tool hook framework、返回原 conversation 的 context compaction 假实现、只缓存 `Agent::new()` 的 execution manager 和空模板系统，不进入 Thread / Turn / Item current owner。真实 permission inspection、ActionRequired elicitation、AGENTS.md runtime prompt context、provider HTTP proxy policy、provider usage fallback、App Server / agent-runtime context compaction、Codex-style multi-agent/task orchestration、agent control request DTO 和 GUI / Evidence projection 继续归属 current 主链，不能为了“看起来兼容”恢复 Aster 空壳。
- `agent-compat/src/agents/{context,parallel,resume}/**` 已删除；这些 Aster agent context inheritance / isolation、parallel execution pool 和 checkpoint resume framework 没有 Lime current / compat 主链消费，也没有外部 `aster::agents::*` 生产引用。Codex-first current owner 分别是 Thread / Turn / Item、App Server task orchestration、file checkpoint API 和 `agent-runtime`，不得把 `AgentContextManager`、`ParallelAgentExecutor`、`AgentResumer` 等 Aster framework 当 valuable reference 编译留存。
- `agent-compat/src/scheduler.rs`、`agent-compat/src/scheduler_trait.rs`、`agent-compat/src/recipe/{build_recipe,local_recipes,read_recipe_file_content,template_recipe,validate_recipe,yaml_format_utils}.rs` 已删除；Aster 本地 recipe 文件 loader / template renderer / validator / YAML formatter 与 recipe scheduler 不进入 Thread / Turn / Item current owner。`Agent::create_recipe(...)`、`Recipe::from_content(...)`、`Author`、`Settings`、`RecipeParameter*` 和 builder `author/settings/parameters` 旧 metadata 入口已删除；`Recipe` / `SubRecipe` DTO 暂留 session metadata / subagent staging blocker。真正 automation scheduler 与 Codex-style multi-agent 后续只允许进入 Lime current owner，不恢复 Aster recipe runtime helper或旧 recipe metadata parser。
- `agent-compat/src/context_mgmt.rs` 已删除；Aster `/compact` 不再通过 no-op summarizer 写空 summary 或假成功。真正 context compaction 若恢复，必须落在 App Server / `agent-runtime` current owner，并把 Thread history / Item projection / Evidence 接起来。
- `agent-compat/src/execution/**` 已删除；Aster `AgentManager` 只是 global cache / factory stub，子 agent staging 直接创建局部 `Agent::new()`，不把该 stub 当作 current multi-agent owner。真正 multi-agent / task orchestration 必须进入 App Server / `agent-runtime` current owner。
- `agent-compat/src/mcp_utils.rs` 已删除；原 `ToolResult<T>` / `ToolError` 历史别名已内联为调用点局部 `Result<T, rmcp::model::ErrorData>`，不作为 Thread / Turn / Item current API。
- `agent-compat/src/utils.rs` 已删除；unicode tag 清洗归 `conversation::unicode_tags`，provider text truncation 归 `providers::utils`，reply loop cancel 判断归 `agent.rs` 局部 helper，不保留 root utils 垃圾桶。

判定：

- `dead / deleted / forbidden-to-restore`。
- 不属于 Thread / Turn / Item current owner，也不应作为 valuable reference 编译留存。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求上述目录不存在，且 `vendor/aster-rust/crates/aster/src/lib.rs` 不得恢复对应 `pub mod`。
- `asterMigrationBoundary.test.ts` 持续要求 `session/cleanup.rs`、`session/statistics.rs`、对应 `mod` 和 public re-export 不得恢复。
- `asterMigrationBoundary.test.ts` 持续要求 `session/{fork,resume,worktree}.rs`、provider test/autodetect helper 和 `tools/hooks.rs` 不得恢复，且对应 `mod` / re-export / public API 字符串不得重新挂回 `agent-compat` public surface。
- `asterMigrationBoundary.test.ts` 持续要求 concrete provider implementation modules 与 provider-specific wire-format helper 不得恢复为 `pub mod` public API；这些模块只能随 R2/R3 作为 crate-private staging 存活，最终迁到 `model-provider` 后删除。
- `asterMigrationBoundary.test.ts` 持续要求 `config` 除 `paths` 外不得恢复 public module / public re-export；`paths` 最终随 session/runtime store adapter 迁出后删除。
- `asterMigrationBoundary.test.ts` 持续要求 permission 子模块不得恢复为 public module；permission root 最小 re-export 最终随 R4 reply loop native tool execution / approval bridge 迁出后删除。
- `asterMigrationBoundary.test.ts` 持续要求 tools/session 实现子模块不得恢复为 public module；`diff_summary` / `ripgrep` helper 不得恢复。root `Tool` / `ToolRegistry` / `ToolContext` / `SessionStore` 等最小 re-export 最终随 R4/R5/R6 迁出后删除。
- `asterMigrationBoundary.test.ts` 持续要求 `agent-compat/src/mcp/**` 目录和 `pub mod mcp;` 不得恢复。
- `asterMigrationBoundary.test.ts` 持续要求 Aster recipe runtime / scheduler 文件、module exports、旧函数名、旧依赖、`scheduler_service`、`set_scheduler`、recipe generation/parser 和旧 metadata DTO 不得恢复。
- `asterMigrationBoundary.test.ts` 持续要求 root hook stub、root `pub mod hooks;` 和 `crate::hooks::FrontmatterHooks` 不得恢复；`FrontmatterHooks` 只能作为 `tools::agent_control` 的局部 request DTO，后续随 R4/R9 迁出或删除。
- `asterMigrationBoundary.test.ts` 持续要求 Aster agent context / parallel / resume framework 目录和相关 public re-export 不得恢复。
- 如果后续确有产品需求，只能按 refactor v1 归属进入 Lime current owner；不得恢复 vendor public module 当作实现入口。

### 4.4.1 Batch A/D reply event stream projector contract

当前状态：

- `agent-runtime::event_stream::EventProjector<SourceEvent, RuntimeEvent>` 已建立 source-agnostic runtime event materialization contract；它对齐 Codex 把内部执行事件 materialize 成 Turn / Item / server notification 的方式。
- `request_tool_policy/aster_event_adapter.rs` 的迁移期 projector 已命名为 `AsterEventProjector`，并实现 `EventProjector<AsterAgentEvent, RuntimeAgentEvent>`。
- `aster_reply_adapter.rs` 通过 current `EventProjector` contract 消费 Aster event projection，同时继续把 provider stream notification 和 inline provider error suppression 放进 `RuntimeReplyStreamEvent` current envelope。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::event_stream::EventProjector`，归属 Turn execution event materialization contract。
- `compat blocker`：`AsterEventProjector` 仍依赖 Aster `AgentEvent` / `Message`，只能作为 reply loop 未迁出前的 source adapter。

退出条件：

- 具体 `RuntimeAgentEvent` / Thread Item DTO 继续从 `lime-agent::protocol` 拆到 current owner 后，`EventProjector` 的 RuntimeEvent 类型应改为 current DTO。
- Aster `Agent::reply` 不再产生 Aster `AgentEvent` 后，删除 `AsterEventProjector` 和 `aster_runtime_projection.rs`，不得保留旧 `RuntimeEventProjector` 名称或 Aster event facade。
- App Server / GUI / Evidence 继续消费 materialized current event / item read model，不得重新直接读取 Aster `AgentEvent`。

### 4.4.2 Batch A/D reply message contract

当前状态：

- `agent-runtime::reply_message::{RuntimeReplyMessage, RuntimeReplyMessageRole, RuntimeReplyMessageContent}` 已建立 不依赖 Aster reply message contract，承接 Turn reply input 的 text / image / action-required response content、`agent_only`、`concat_text` 与 image presence 规则。
- `agent_reply_stream.rs` current 主循环先把 `RuntimeReplyAttemptInput` materialize 成 `RuntimeReplyRequest` / `RuntimeReplyMessage`；`aster_reply_adapter.rs::start_aster_reply_stream(...)` 只从 `RuntimeReplyStartRequest` 取出已 materialize 的 current message。
- `request_tool_policy/aster_reply_message_adapter.rs` 集中承接 current `RuntimeReplyMessage` -> Aster `Message` lowering、action-required response scope 映射和取消 turn context marker 的 Aster `Message` 构造。
- Aster `Message` / `MessageContent` 仍存在，但只停留在 provider/reply loop 未迁出前的 message compat adapter；它不再作为 reply input / message 的 current 事实源，`aster_reply_adapter.rs` 也不再拥有 `MessageContent::ActionRequired` / `ActionRequiredData::ElicitationResponse` 细节。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::reply_message`，归属 Turn reply input materialization contract。
- `compat blocker`：`aster_reply_message_adapter.rs` 的 current message -> Aster `Message` lowering，仍被 Aster `Agent::reply` / provider trait 依赖。
- `dead / guarded`：`aster_reply_adapter.rs` 重新持有 Aster `MessageContent` / action-required response lowering 细节。

退出条件：

- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_message_adapter.rs`、`lower_aster_reply_message(...)`、Aster `Message` import、取消 marker message 构造和对应 action response lowering。
- `RuntimeReplyMessage` 后续如果需要进入 Thread Item / provider-neutral request DTO，应迁到最终 owner 或与 `agent-protocol` DTO 收敛；不得让 `lime-agent` adapter 成为长期 owner。
- App Server / GUI / Evidence 继续消费 current event / item / provider trace，不得重新解析 Aster `MessageContent`。

### 4.4.3 Batch A/D reply request contract

当前状态：

- `agent-runtime::reply_request::RuntimeReplyRequest` 已建立 不依赖 Aster reply request materialization contract，承接 `RuntimeReplyAttemptInput` 到 current `RuntimeReplyMessage` 与 `model-provider::RuntimeReplyStreamRequest` 的构造规则。
- `RuntimeReplyRequest::from_attempt_input(...)` 统一计算 `input_kind`、`message_chars`、provider handle 和 model request policy，`aster_reply_adapter.rs` 不再直接调用 `RuntimeReplyStreamRequest::new(...)`。
- `RuntimeReplyRequest::from_attempt_input(...)` 已从 Aster backend adapter 上提到 `agent_reply_stream.rs` current 主循环；`RuntimeReplyStreamHost::start_reply_stream(...)` 只接收已 materialize 的 `RuntimeReplyRequest`，Aster backend adapter 不再拥有 model request policy / provider handle / stream request 构造规则。
- image input modality validation 已从 `aster_reply_adapter.rs` 的 Aster `Message` lowering 前移到 `agent_reply_stream.rs` current 主循环；future current provider/reply backend 不需要继承 Aster lowering 才能获得 image policy fail-closed 行为。
- `agent-runtime::reply_host::RuntimeReplyStartRequest` 已承接 Turn reply backend start request，合并 current request、session config、provider cancel token 与 `emitted_any`；`RuntimeReplyStreamHost::start_reply_stream(...)` 不再暴露 Aster adapter 形状的散参。
- `agent-runtime::reply_session` 已承接 reply start 前 session metadata preparation 纯规则：`tool_scope.disallowed_tools` 合并与 provider request wire shape metadata 注入；`RuntimeReplyBackendStart::prepare_session_metadata(...)` 作为 backend start handoff 调用该 current owner，`aster_reply_backend_adapter.rs` 不再直接 import / 调用 session metadata helper 或手写这两类 metadata 拼装。
- Aster provider/reply backend 仍存在，但现在只消费 current `RuntimeReplyStreamRequest`；provider wire shape 继续归属 `model-provider`，不是 Aster adapter 的本地规则。
- `model-provider::provider_stream` 已承接 provider request wire shape 对 backend / provider protocol 的支持判定：`RuntimeReplyStreamRequest::provider_request_wire_support_issue(...)` 生成 current issue；`aster_reply_adapter.rs` 不再直接判断 Aster compat backend、OpenAI provider 名称或 Responses protocol。
- `model-provider::provider_stream::RuntimeReplyProviderStreamStart` 已承接 provider stream start 前的 provider handle 存在性和 pinned handle 一致性校验；`aster_reply_adapter.rs` 只负责构造 start handoff，不再让 credential bridge 通过 debug-only assertion 拥有 provider handle contract。
- `model-provider::provider_stream::RuntimeReplyProviderSourceBackendCall` / `RuntimeReplyProviderSourceFuture` / `RuntimeReplyProviderSourceBackend` 已承接 provider source backend execution contract。该 contract 不引用 Aster，也不再暴露 host 泛型，只通过 source request 泛型描述“source request -> provider stream”的 current handoff；Aster host 只能停留在 `lime-agent` 私有 compat source 内。
- `model-provider::provider_stream::RuntimeReplyProviderStreamTrace` 已承接 provider stream start diagnostics snapshot：session、input kind、message chars、provider backend/name/model 均由 current provider stream start owner 选择；`ReplyExitSourceExecutor::run_provider(...)` 只消费 `call.trace()` 做日志，再把 provider source request 交给 current helper，不再让 credential bridge 从 provider call 或 `provider_start.stream_request()` 拆字段做日志。
- `agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall` 已承接 default source call envelope：current reply message、current session config 与 cancel token 由 Turn owner 一次性交接给 source runner；`run_reply_source(...)` 不再向 default source 散传三个字段。`RuntimeReplyDefaultCall::into_source_request(...)` 与 `run_default_provider_source_backend(...)` 已承接 default path 的 source request materialization 和 backend call handoff；`ReplyExitSourceExecutor::run_default(...)` 只显式取 Aster provider 后委托 current helper，不再本地 lowering 到 Aster `Message` / `SessionConfig`，也不再直接调用 `Agent::reply_with_provider(...)`。
- `agent-runtime::reply_backend::RuntimeReplyProviderSourceCall` 已承接 provider source call envelope：provider start、current reply message、current stream request、current session config 与 cancel token 由 Turn owner 一次性交接给 source runner；`run_reply_source(...)` 不再向 provider source 散传字段。`ReplyExitSource` 不再通过 `call.map(lower_aster_reply_message, to_aster_session_config)` 提前把 source call lowering 成 Aster DTO，且 `RuntimeReplyDefaultSourceCall::map(...)`、`RuntimeReplyProviderSourceCall::map(...)`、`RuntimeReplySourceRun::map(...)` 已删除并由守卫禁止恢复；`agent-runtime::reply_backend::RuntimeReplyProviderSourceBackendRequest` / `RuntimeReplyProviderSourceRunCall` 已固定 provider source request / backend run call 的 current shape，`RuntimeReplyProviderSourceRequest::into_backend_call(...)` 承接 backend call materialization。`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 进一步承接 source request / run call -> current source execution parts 的 Turn payload materialization，包含 `RuntimeReplyMessage`、`RuntimeReplyStreamRequest`、`AgentSessionConfig` 与 cancel token；`model-provider::provider_stream::{RuntimeReplyProviderExecutionRunner, RuntimeReplyProviderExecutionSource, run_provider_source_execution}` 承接 provider source backend trait implementation wrapper，compat source 只能提供短生命周期 runner。`ConfiguredReplyProvider` 已删除 Aster-host `stream_reply_with_agent(...)` facade，也不再直接实现 provider source backend；`credential_bridge/runtime_provider_adapter.rs` 只保留 current provider binding factory、capability projection 与 `into_compat_provider()` 临时出口。Aster `Agent` host、Aster provider trait object 与 `Message` / `SessionConfig` lowering 被集中到 `request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitRunner` / 私有 `run_provider_reply_exit_source(...)` 退场模块。
- `request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 的 source backend 输出已从 Aster `AgentEvent` stream 收敛为 `RuntimeReplyStream<RuntimeAgentEvent>`；Aster `AgentEvent` stream 只留在私有 `run_provider_reply_exit_source(...)` 内部，并立即通过 `project_aster_reply_stream(stream, stream_request)` 投影成 current reply stream。`request_tool_policy/aster_reply_backend_adapter.rs` 因此只消费 current source stream result，不再拥有 Aster provider source backend impl 或 Aster stream projection handoff。
- `agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 已承接 provider source backend run call 到 current execution parts 的 materialization，保留 `RuntimeReplyMessage`、`RuntimeReplyStreamRequest`、`AgentSessionConfig` 与 cancel token；`request_tool_policy/provider_reply_exit_source.rs::run_provider_reply_exit_source(...)` 只通过该 current owner 拆 call，不再直接调用 `call.into_source_request().into_parts()`。
- `agent-runtime::reply_backend::RuntimeReplySourceCall` 已承接 default / provider source call union：`run_reply_source(...)` 只构造 `RuntimeReplySourceCall::{Default, Provider}` 并调用单一 `RuntimeReplySource::run(call)`；`ReplyExitSource` 不再实现 `run_default(...)` / `run_provider(...)` 两个方法，source method topology 不再属于 compat adapter。
- `request_tool_policy/provider_reply_exit_source.rs::ReplyExitSourceExecutor` 已退化为 Aster source delegate：`ReplyExitSource::run(call)` 只做 current call delegate，不再直接 match default/provider path。default path 只显式取 Aster provider 后调用 `agent-runtime::reply_backend::run_default_provider_source_backend(...)`；provider path 的 binding / source request / backend call 由 `agent-runtime::reply_backend::run_provider_source_backend(...)` 承接。Aster `Message` / `SessionConfig` lowering 与 `Agent::reply_with_provider(...)` 最后一跳只剩 `ProviderReplyExitSource` / 私有 `run_provider_reply_exit_source(...)` 退场模块一处；backend adapter 不再定义 provider source backend impl。该 executor 是删除前 compat blocker，不是 refactor v1 current backend owner。
- `agent_reply_stream.rs` current 主循环已把 provider stream idle timeout 限定在 stream 创建后的 `stream.next()` 等待；Aster compat `start_reply_stream(...)` 仍包含 context prep / Aster session config 转换，不再套 provider idle timeout，避免把 Aster context prep 误判成 provider stream idle。真正的 backend start guard 应在 provider/reply loop 迁出 Aster 后落到 current backend runner。
- `agent-runtime::reply_stream::RuntimeReplyStreamProjector` 已建立 source event -> current reply stream envelope materialization contract；`request_tool_policy/aster_reply_stream_adapter.rs` 作为 Aster source adapter 实现该 contract，集中处理 Aster provider side-channel、inline provider error suppression 与 `AsterEventProjector` 调用。`aster_reply_adapter.rs` 不再同时拥有 backend start 和 stream projection 细节，文件已降回 800 行以下。
- `agent-runtime::reply_stream::project_reply_stream(...)` 已承接 source stream -> current reply stream envelope 的通用 runner：source stream 读取、多事件 projection flush 与 source error propagation 不再属于 Aster adapter；`aster_reply_stream_adapter.rs::project_aster_reply_stream(...)` 只创建 `AsterReplyStreamProjector` 并委托 current runner。
- `request_tool_policy/aster_reply_message_adapter.rs` 作为 Aster message source adapter 承接 `RuntimeReplyMessage` lowering；`aster_reply_adapter.rs` 进一步退化为 Aster backend start facade，不再拥有 stream projection 或 message content lowering 细节。
- `request_tool_policy/aster_reply_backend_adapter.rs` 作为 Aster backend source adapter 承接 current `RuntimeReplyStartRequest` -> Aster `Agent::reply` / pinned provider stream execution body；`aster_reply_adapter.rs` 不再直接持有 `.reply(...)`、`.stream_reply_with_agent(...)`、provider wire support、reply session metadata preparation 或 stream projection handoff。
- `request_tool_policy/aster_reply_backend_adapter.rs` 的 backend start 失败边界已收敛到 `agent-runtime::reply_host::RuntimeReplyStartError` / `RuntimeReplyStartResult`；该 adapter 不再 import / 构造 policy 层 `ReplyAttemptError`，attempt error conversion 只留在 Turn stream policy 主循环。
- `agent-runtime::reply_host::RuntimeReplyStartError::from_provider_wire_support_issue(...)` 已承接 provider wire support issue -> backend start error 的 current 映射；`aster_reply_backend_adapter.rs` 只记录 issue 诊断并调用 current helper，不再直接读取 `issue.message()` 拼 error。
- `agent-runtime::reply_backend::RuntimeReplyBackend` 已建立 不依赖 Aster reply backend execution contract；`agent_reply_stream.rs` current 主循环通过 `host.reply_backend()` 启动 backend stream，`AsterReplyRuntimeHost` 只组合 `AsterReplyBackend` 并负责 runtime status / cancelled marker side effect，不再代表 backend contract 本身。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart` 已承接 backend start request materialization：`RuntimeReplyStartRequest` 拆包、current message / stream request 持有、message chars、session config / cancel token / emitted state 交接，以及 provider wire support issue -> start error 判断；`aster_reply_backend_adapter.rs` 不再直接解构 start request、调用 `request.into_parts()` 或维护本地 unsupported provider wire shape helper。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::provider_stream_start(...)` 已承接 pinned provider stream start handoff：复用 `model-provider::RuntimeReplyProviderStreamStart::new(...)` 的 missing / mismatched provider handle 校验，并把 provider start error 映射到 `RuntimeReplyStartError`；`aster_reply_backend_adapter.rs` 不再 import / 直接构造 `RuntimeReplyProviderStreamStart::new(...)`，也不再本地复制 provider start error mapping。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)` 已承接 backend start 阶段的 session metadata preparation handoff：返回 `RuntimeReplySessionPreparation` 表达 provider wire shape 是否请求 / 是否成功注入；`aster_reply_backend_adapter.rs` 只负责计算 native tool policy disallowed names 并把 prepared current session config lowering 成 Aster `SessionConfig`。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_run(...)` 已承接 backend start -> run path 的 current handoff：provider wire support fail-closed、session metadata preparation、default / pinned provider run path 选择和 provider stream start error 映射均在 Turn owner 内完成；`aster_reply_backend_adapter.rs` 只按 `RuntimeReplyBackendRunPath::{Default, Provider}` 调用 Aster source backend，不再直接调用 provider wire check、session metadata prepare 或 provider stream start construction。
- `agent-runtime::reply_backend::RuntimeReplyBackendRunOutcome::finish_stream(...)` 已承接 source backend stream result -> `RuntimeReplyStartResult` 的 current materialization：成功时附带 `message_chars`，失败时统一映射 `Agent error: ...` 与 `emitted_any`；`aster_reply_backend_adapter.rs` 不再 import / 构造 `RuntimeReplyStartError`，也不再本地拼 start result tuple 或 source backend error 文案。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::trace(...)` 与 `RuntimeReplyBackendTrace` 已承接 backend start tracing snapshot：provider backend/name/model、Responses Lite policy、reasoning context、parallel tool calls、Responses Lite header requirement、input kind 与 message chars 均由 Turn owner 选择；`aster_reply_backend_adapter.rs` 只消费 current trace snapshot，不再直接读取 `RuntimeReplyStreamRequest` 的 provider/model/policy 字段。
- `agent-runtime::reply_backend::RuntimeReplySource` 与 `run_reply_source(...)` 已承接 backend run path -> source backend call 的 current runner contract：default / provider path 分派、source call future lifetime、default/provider source call envelope 构造、single-call source execution、source result 和 original stream request 回传都在 Turn owner 内完成。`provider_reply_exit_source.rs::ReplyExitSource` 只保留 `run(call)` 一个 Aster source call；`start_aster_reply_stream(...)` 不再本地 `match RuntimeReplyBackendRunPath`，也不直接调用 `.reply(...)` / `.stream_reply_with_agent(...)`。
- `agent-runtime::reply_backend.rs` 的测试已拆入 `reply_backend/tests.rs`，运行时代码从超过 `1200` 行降至约 `486` 行；这修复 refactor v1 的 Rust crate 抗膨胀风险，后续 source backend 细化不得继续把测试或额外业务逻辑堆回中心文件。
- `agent-runtime::reply_loop` 已承接 provider/reply loop 的 `max_turns` 默认值、attempt 计数和 max-turn reached 文案。该模块是 Turn owner 的纯状态骨架，不引入 provider、tool、session store、Aster `AgentEvent` 或 Aster DTO。2026-07-09 纠偏后，`agent-compat/src/agents/agent.rs::reply_internal(...)` 仍保留本地 `turns_taken` / `DEFAULT_MAX_TURNS` 残留，不能通过给 `agent-compat` 增加 `agent-runtime` 依赖来伪装迁移完成；真实退出条件是 provider/reply loop 执行体迁到 current backend 后删除该 staging 残留。
- `agent-protocol::provider_trace::{ProviderTraceEvent, ProviderTraceFailure, ProviderTraceResponseContext, runtime_event_type_for_provider_trace_stage}` 已承接 provider trace public DTO、failure projection contract、provider response context projection 和 runtime event type mapping；`app-server` 的 provider trace event type 映射改为消费 `agent-protocol` current owner，不再在 App Server 本地复制 stage -> event type match。
- `agent-runtime::provider_trace::RuntimeProviderTraceAttempt` 已建立 不依赖 Aster Turn lifecycle 骨架，承接 request started、first event、first text delta、failed 和 canceled 的 elapsed-time / once-only 规则；该骨架当前不写入 `agent-compat`，避免给迁移对象继续补逻辑。
- `model-provider::provider_stream::RuntimeReplyProviderTraceMetadata` 已承接 provider handle 到 provider trace runtime metadata 的字段选择；`apply_runtime_provider_metadata(...)` 直接消费 current `RuntimeReplyProviderHandle` 并写入 `ProviderTraceEvent` 的 `runtime_provider_backend`、`runtime_provider_selector`、`runtime_provider_protocol`、`runtime_provider_active_model`。`agent-runtime::provider_trace` 因此只保留 Turn lifecycle，不再 import `RuntimeReplyProviderHandle` / `ModelProviderProtocol` 或持有 metadata helper；`agent_reply_stream.rs` 只调用 `model-provider` current helper。
- `model-provider::provider_stream::RuntimeReplyProviderStreamEvent::from_notification_payload(...)` 已承接 provider stream side-channel notification payload materialization，固定 safety buffering event kind、payload `responseEvent` 读取与 header 投影规则；`aster_reply_stream_adapter.rs` 只负责从 Aster `Message` 抽取 notification payload 并委托 current owner。
- `agent-runtime::reply_execution::RuntimeReplyAttemptState` 已建立 Turn reply attempt state current skeleton，承接 text output、event errors 与 emitted state；`request_tool_policy.rs` 只创建 state 并在成功 / fallback / cancel / empty final error 时消费 current state，`agent_reply_stream.rs` 负责按 current stream event 变更 state。
- `RuntimeReplyAttemptState::error(...)` 已承接 attempt emitted state -> `RuntimeReplyAttemptError` 的 current outcome helper；`request_tool_policy.rs` 不再保留 `build_stream_reply_execution(...)` 本地薄包装，`agent_reply_stream.rs` 的 stream error / inline provider error 分支也通过 current attempt state 生成 error。
- `agent-runtime::reply_execution` 已承接 `RuntimeReplyStartError -> RuntimeReplyAttemptError` 的 current conversion；`agent_reply_stream.rs` 不再保留 `reply_attempt_error_from_runtime(...)` 本地字段复制函数。
- `agent-runtime::reply_stream::RuntimeReplyStreamState` 已建立 Turn reply stream lifecycle current skeleton，承接 first-event timeout、stream event seen 与 suppressed inline provider error；`agent_reply_stream.rs` 只消费该 current state，不再本地维护 provider stream timeout helper 或 inline provider error holder。
- `agent-runtime::reply_stream::RuntimeReplyStreamIdleTimeout` 已承接 provider stream idle timeout 的 current error message contract；`stream_idle.rs` 只保留 env timeout 解析，不再持有 idle error 文案。
- `RuntimeReplyStreamState` 把首个 stream item 前的 Aster compat 准备窗口与首 item 后 provider idle 窗口分开：首事件前最小 `5s`，避免把 Aster 首 poll 的 `prepare_reply_context` / prompt / tool surface 成本误判成 provider 首事件缺失；首事件后继续使用配置的 `provider_stream_idle_timeout`，因此 `provider_stream_idle` fixture 用 `200ms` 验证真正的尾部 idle retry，首事件前 fail-closed fixture 则跟随 `MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，不再用过期 `3s` 外层上限误判 current first-event guard。
- `agent-runtime::reply_stream::RuntimeReplyInlineProviderError::from_text(...)` 已承接 inline provider error 文本解析规则；`aster_reply_stream_adapter.rs` 只从 Aster `Message` 读取 concat text 并委托 current owner，不再持有 provider error 文案常量、retry suffix 或本地 split 解析。
- `agent-runtime::reply_stream::RuntimeReplyStreamProjection` 已承接 reply stream source facts 到 current stream envelope 的 materialization priority：provider stream event 优先于 inline provider error，inline provider error 优先于普通 runtime events；`aster_reply_stream_adapter.rs` 只收集 Aster source facts 并调用 current projection，不再直接构造 stream envelope variant 或持有本地排序。
- 接力验证补充：`agent-runtime reply_stream` 定向测试已通过 `13 passed`，证明 `RuntimeReplyStreamProjector`、`RuntimeReplyStreamState`、inline provider diagnostic materialization 与 stream projection priority current contract 可独立编译；`agent-runtime reply_backend` 定向测试已通过 `20 passed`，证明 `RuntimeReplyBackend` / `RuntimeReplyBackendStart` / provider stream start handoff / session metadata preparation handoff / backend run path handoff / backend stream outcome materialization / backend trace snapshot / source runner current contract 可独立编译；`agent-runtime reply_execution` 定向测试已通过 `5 passed`，证明 `RuntimeReplyAttemptState` current contract 可独立编译；`model-provider provider_stream` 定向测试已通过 `18 passed`，证明 provider wire support issue、provider stream start handoff、provider source backend contract 与 notification payload event materialization contract 可独立编译；`lime-agent request_tool_policy` 定向测试已通过 `68 passed`，且 `provider_stream_notification_projects_safety_buffering_event` 过滤测试已通过 `1 passed`，证明 current attempt state / first-event guard skeleton、backend run path handoff、backend stream outcome materialization、backend trace snapshot、source runner contract、source backend contract 与 provider notification projection 仍能驱动现有 reply policy 主链；`asterMigrationBoundary.test.ts` 完整治理守卫已通过 `144 passed`，并固定 `reply_backend` current contract、`model-provider` provider source backend contract 以及 `aster_reply_backend_adapter.rs` / `aster_reply_message_adapter.rs` / `aster_reply_stream_adapter.rs` 三个 compat source adapter 的唯一职责。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::reply_request`，归属 Turn reply request materialization contract。
- `refactor-aligned current skeleton`：`agent_reply_stream.rs` 作为 Turn stream policy 主循环，负责把 input、turn context policy 和 provider handle 汇合成 current request。
- `refactor-aligned current skeleton`：`agent-runtime::reply_host::RuntimeReplyStartRequest`，归属 Turn provider/reply execution handoff contract。
- `refactor-aligned current skeleton`：`agent-runtime::reply_session`，归属 Turn provider/reply execution handoff 的 session metadata preparation。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderWireSupportIssue` 与 `provider_request_wire_support_issue(...)`，归属 provider request capability check。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamStart` 与 `RuntimeReplyProviderStartError`，归属 Turn provider/reply execution handoff 的 provider stream start contract。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderSourceBackendCall`、`RuntimeReplyProviderSourceFuture` 与 `RuntimeReplyProviderSourceBackend`，归属 provider source backend execution contract；Aster provider trait object 只能作为 compat implementation detail。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamTrace`，归属 Turn provider/reply execution handoff 的 provider source call diagnostics snapshot。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::{RuntimeReplyDefaultSourceCall, RuntimeReplyDefaultCall::into_source_request, RuntimeReplyProviderSourceRequest::into_backend_call, run_default_provider_source_backend}`，归属 Turn default source call / source request / backend call handoff；default path 不得再 materialize 成 mapped `RuntimeReplyDefaultCall<Message, aster::agents::SessionConfig>`，`RuntimeReplyDefaultSourceCall::map(...)` 已按 `dead / guarded` 删除。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyProviderSourceCall`，归属 Turn provider source call handoff；provider path 不得再 materialize 成 mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`，`RuntimeReplyProviderSourceCall::map(...)` 与 `RuntimeReplySourceRun::map(...)` 已按 `dead / guarded` 删除。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::{RuntimeReplyProviderSourceRequest, RuntimeReplyProviderSourceBackendRequest, RuntimeReplyProviderSourceRunCall, RuntimeReplyProviderSourceExecution}`，归属 Turn provider source request / execution payload materialization；`model-provider::provider_stream::{RuntimeReplyProviderExecutionRunner, RuntimeReplyProviderExecutionSource, run_provider_source_execution}` 归属 provider source backend wrapper；credential bridge 不得消费 source request，compat source implementation 只允许消费 current alias 和 execution envelope。
- `refactor-aligned current skeleton`：`RuntimeReplyStream<RuntimeAgentEvent>` 作为 provider reply backend 输出形状，归属 Turn source backend stream output contract；Aster `AgentEvent` stream 只能留在 `run_provider_reply_exit_source(...)` 私有退场点内部输入侧。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplySourceCall` 与 `RuntimeReplySource::run(call)`，归属 Turn source backend execution handoff；Aster adapter 的 source method topology 已降级为 compat implementation detail。
- `compat blocker`：`request_tool_policy/provider_reply_exit_source.rs::ReplyExitSourceExecutor`，只允许作为删除前的 Aster source executor；后续 provider/reply loop 迁出 Aster 后必须整块删除，不得升级为 current backend。
- `compat blocker`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitRunner` 只作为 `RuntimeReplyProviderExecutionRunner` 的私有 Aster implementation；Aster `Agent` host、Aster provider trait object 与 `Agent::reply_with_provider(...)` 仍未迁出，`credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider` 只保存 current provider binding，不得恢复 source execution owner。`request_tool_policy/aster_reply_backend_adapter.rs` 只允许做 backend start / source call 分派，不得恢复 `ProviderReplyExitSource` 本地 backend impl 或 Aster provider trait import。
- `refactor-aligned current skeleton`：`agent-runtime::reply_execution::RuntimeReplyAttemptState`，归属 Turn reply attempt accumulation / retry state。
- `refactor-aligned current skeleton`：`RuntimeReplyAttemptState::error(...)` 与 direct `into_execution(...)` / `into_execution_with_text(...)` 消费，归属 Turn reply attempt outcome materialization。
- `refactor-aligned current skeleton`：`RuntimeReplyStartError -> RuntimeReplyAttemptError` conversion，归属 Turn backend start outcome materialization。
- `refactor-aligned current skeleton`：`RuntimeReplyStartResult` 作为 backend start result boundary，归属 Turn backend execution handoff；policy attempt error 不再进入 Aster backend adapter。
- `refactor-aligned current skeleton`：`RuntimeReplyStartError::from_provider_wire_support_issue(...)` 作为 provider request capability issue -> backend start outcome helper；Aster adapter 不再拥有 provider wire support issue 到 start error 的本地映射。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendStart`，归属 Turn backend start materialization；Aster adapter 不再拥有 start request shape 或 provider wire support issue 判断。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendStart::provider_stream_start(...)`，归属 Turn provider stream start handoff；provider handle mismatch -> backend start error 映射不再属于 Aster backend adapter。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)`，归属 Turn backend start/session preparation handoff；Aster adapter 不再拥有 `tool_scope` / provider wire shape metadata mutation 规则。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::project_reply_stream(...)`，归属 Turn event materialization runner；Aster source adapter 不再拥有 stream loop plumbing。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_run(...)`、`RuntimeReplyBackendRun` 与 `RuntimeReplyBackendRunPath`，归属 Turn backend run handoff；provider/default path selection 和 provider start failure materialization 不再属于 Aster backend adapter。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendRunOutcome::finish_stream(...)`，归属 Turn backend stream start outcome materialization；source backend error 文案、`emitted_any` 和 `message_chars` tuple 不再属于 Aster backend adapter。
- `refactor-aligned current skeleton`：`agent-runtime::reply_loop::{RuntimeReplyLoop, RuntimeReplyLoopStep}`，归属 Turn provider/reply loop attempt gate；`agent-compat` 不得为了旧 loop 反向依赖该 current owner，现有本地 attempt / max-turn 状态按 R2/R9 staging 残留追踪。
- `refactor-aligned current contract`：`agent-protocol::provider_trace::{ProviderTraceEvent, ProviderTraceFailure, ProviderTraceResponseContext, runtime_event_type_for_provider_trace_stage}`，归属 provider trace public DTO 与 event type mapping；App Server 已消费该 mapping，后续 event_converter 只允许做 Aster source adapter。
- `refactor-aligned current skeleton`：`agent-runtime::provider_trace::RuntimeProviderTraceAttempt`，归属 Turn provider trace lifecycle；request started、first event、first text delta、failed、canceled 的 elapsed-time 和 once-only 规则不得继续新增到 `agent-compat`。
- `refactor-aligned current contract`：`model-provider::provider_stream::RuntimeReplyProviderTraceMetadata` 与 `apply_runtime_provider_metadata(...)`，归属 provider handle metadata projection；`agent-runtime` 不得恢复 provider handle / protocol 字段选择，`lime-agent` 不得恢复本地 enrichment helper。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackendTrace` 与 `RuntimeReplyBackendStart::trace(...)`，归属 Turn backend start observability snapshot；provider/model/policy trace field selection 不再属于 Aster backend adapter。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplySource` 与 `run_reply_source(...)`，归属 Turn backend source execution runner；default/provider source call 分派与 runner lifetime 不再属于 Aster backend adapter。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamEvent::from_notification_payload(...)`，归属 Turn provider stream event materialization；Aster source adapter 不再拥有 provider event kind/header/safety buffering 投影规则。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::RuntimeReplyInlineProviderError::from_text(...)`，归属 Turn reply stream diagnostic materialization；Aster source adapter 不再拥有 provider error text parser。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::RuntimeReplyStreamProjection`，归属 Turn reply stream materialization priority；Aster source adapter 不再拥有 provider event / inline error / runtime event 的排序和 envelope variant 构造。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::RuntimeReplyStreamState`，归属 Turn reply stream lifecycle state；Aster compat start/context prep 暂不套 provider idle timeout，首 stream item 前提供稳定窗口，首 item 后才按 provider stream idle 判定 retry / fail-closed。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::RuntimeReplyStreamIdleTimeout`，归属 Turn reply stream lifecycle error contract。
- `refactor-aligned current skeleton`：`agent-runtime::reply_stream::RuntimeReplyStreamProjector`，归属 Turn reply stream materialization contract。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyBackend`，归属 Turn provider/reply backend execution contract。
- `compat blocker`：`aster_reply_adapter.rs` 仍持有 Aster `Agent` host facade 和 runtime status / cancellation marker persistence，只能作为 provider/reply loop 未迁出前的 host adapter。
- `compat blocker`：`aster_reply_backend_adapter.rs` 仍依赖 Aster `Agent::reply` / provider trait / session config / `AgentEvent` source，只能作为 provider/reply loop 未迁出前的 backend start adapter。
- `compat blocker`：`aster_reply_message_adapter.rs` 仍依赖 Aster `Message` / `MessageContent`，只能作为 provider/reply loop 未迁出前的 message lowering adapter。
- `compat blocker`：`aster_reply_stream_adapter.rs` 仍依赖 Aster `AgentEvent` / `Message`，只能作为 provider/reply loop 未迁出前的 source adapter。

退出条件：

- provider/reply loop 迁出 Aster `Agent::reply` 后，`RuntimeReplyRequest` 应直接喂给 current provider/reply backend；Aster provider branch、`CompatAsterReplyProviderBackend` 和 Aster `Message` lowering 同轮删除。`ConfiguredReplyProvider::stream_reply_with_agent(...)` 已删除，不得恢复。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_backend_adapter.rs`，不得把它升级成 current backend implementation。
- provider/reply loop 迁出 Aster `Agent::reply` 后，补 current backend start guard：backend start 不得再混入 Aster context prep / session config conversion，provider idle timeout 与 retry state 必须只针对 provider stream lifecycle。
- provider/reply loop 迁出 Aster `Agent::reply` 后，current backend 可以直接实现 `RuntimeReplyBackend` 或后续并入最终 Turn executor；不得让 `AsterReplyRuntimeHost` / `AsterReplyBackend` 继续作为 runtime backend owner。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_message_adapter.rs`，不得把它升级成 current provider-neutral message adapter。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_stream_adapter.rs`、`AsterReplyStreamProjector` 和 Aster provider side-channel extraction；current backend 应直接产生 `RuntimeReplyStreamEvent` 或实现同一 不依赖 Aster projector contract。
- provider stream start contract 必须继续归属 `model-provider` / Turn execution handoff；不得在 `credential_bridge`、`aster_reply_adapter.rs` 或 `aster_reply_backend_adapter.rs` 恢复 provider handle 匹配、backend 特判或 debug-only 校验作为事实源。
- provider source call diagnostics 必须继续通过 `RuntimeReplyProviderStreamStart::trace()` 暴露；`credential_bridge/runtime_provider_adapter.rs` 不得恢复 `provider_start.stream_request()` 字段拆解、`stream_request.provider_backend()` / `provider_name()` / `model_name()` 日志选择，避免把 provider request DTO 重新当成 adapter 内部事实源。
- default source call handoff 必须继续通过 `agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall`；`ReplyExitSource` 不得恢复 `RuntimeReplyMessage + AgentSessionConfig + CancellationToken` 三散参入口，也不得让 default path 在 compat adapter 内重新拥有 source call shape。
- provider source call handoff 必须继续通过 `agent-runtime::reply_backend::RuntimeReplyProviderSourceCall`；`ReplyExitSource` 和 `ConfiguredReplyProvider` 不得恢复 `provider_start + Message + SessionConfig + cancel_token` 四散参入口，也不得让 credential bridge 重新接收 `&RuntimeReplyProviderStreamStart`、`RuntimeReplyProviderCall`、`provider_call.trace()` 或 `provider_call.into_source_request()`。`ProviderReplyExitSource` 只能作为 `model-provider::provider_stream::RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` type alias，provider source backend wrapper 必须留在 `model-provider` current owner，Turn source execution payload 只留在 `agent-runtime`；Aster `Agent` host、Aster `Message` / `SessionConfig` lowering 和 `.reply_with_provider(...)` 只能停留在私有 `run_provider_reply_exit_source(...)` 内，不得在 `aster_reply_backend_adapter.rs` 恢复 `ProviderReplyExitSource` 本地 backend impl、`ConfiguredReplyProviderSource`、`into_reply_source(agent)`、`RuntimeReplyProviderSourceBackend<Agent, ...>`、mapped `RuntimeReplyProviderSourceRequest<Message, aster::agents::SessionConfig>`、本地完整 `RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>` 泛型拼装、本地 inherent `stream_reply_with_agent(...)` owner / `user_message` / `session_config` / `cancel_token` 三散参签名，或把 `run_provider_reply_exit_source(...)` 升级为 public API。
- provider source execution 输入 materialization 必须继续通过 `agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution::from_run_call(...)`；`run_provider_reply_exit_source(...)` 不得恢复 `call.into_source_request().into_parts()` 直拆，也不得把 `RuntimeReplyStreamRequest` 丢回 compat adapter 本地规则。
- source backend execution topology 必须继续通过 `agent-runtime::reply_backend::RuntimeReplySourceCall` 与 `RuntimeReplySource::run(call)`；不得在 `RuntimeReplySource` trait 或 `ReplyExitSource` 中恢复 `run_default` / `run_provider` 双方法，把 source path method topology 重新交回 compat adapter。
- provider stream notification payload materialization 必须继续归属 `model-provider`；`aster_reply_stream_adapter.rs` 只允许抽取 Aster `Message` 中的 notification payload，不得恢复本地 event kind、header extraction 或 safety buffering projection。
- inline provider error diagnostic materialization 必须继续归属 `agent-runtime::reply_stream`；`aster_reply_stream_adapter.rs` 只允许从 Aster `Message` 抽 concat text，不得恢复本地 provider error 文案常量、retry suffix 或 split 解析。
- reply stream projection priority 必须继续归属 `agent-runtime::reply_stream::RuntimeReplyStreamProjection`；`aster_reply_stream_adapter.rs` 不得恢复直接构造 `RuntimeReplyStreamEvent::ProviderStreamEvent` / suppressed inline provider error 或本地排序。
- Aster backend adapter 不得恢复 `RuntimeReplyProviderStreamStart::new(...)`、`RuntimeReplyProviderStartError` 或 provider start error -> `RuntimeReplyStartError` 的本地映射；该 handoff 必须继续通过 `RuntimeReplyBackendStart::provider_stream_start(...)`。
- Aster backend adapter 不得恢复直接调用 `provider_wire_support_start_error(...)`、`prepare_session_metadata(...)` 或 `provider_stream_start(provider.runtime_handle())` 作为 run path 选择逻辑；backend run path 必须继续通过 `RuntimeReplyBackendStart::prepare_run(...)` materialize。
- Aster backend adapter 不得恢复直接 import / 构造 `RuntimeReplyStartError`、`Agent error:` source backend error 文案或 `(stream, message_chars)` start result tuple；backend stream outcome 必须继续通过 `RuntimeReplyBackendRunOutcome::finish_stream(...)` materialize。
- Aster backend adapter 不得恢复直接读取 `RuntimeReplyStreamRequest` 的 provider/model/policy 字段作为 tracing 事实源；backend start trace snapshot 必须继续通过 `RuntimeReplyBackendStart::trace(...)` materialize。
- Aster backend adapter 主函数不得恢复 `RuntimeReplyBackendRunPath::{Default, Provider}` 本地分派，也不得在 `start_aster_reply_stream(...)` 直接调用 `.reply(...)` / `.stream_reply_with_agent(...)`；source backend call 必须继续通过 `RuntimeReplySource` / `run_reply_source(...)` 封装，直到 current provider/reply backend 替换 Aster source。
- 当前 compat 阶段 provider idle guard 只覆盖已创建 stream 后的 lifecycle；provider/reply loop 迁出 Aster `Agent::reply` 后，backend start guard 必须由 current Turn backend runner 持有，且不得把 pre-stream hang 处理下沉回 vendored Aster。
- provider first-event guard 必须继续由 current Turn 主循环持有；测试或生产不得用“禁用 idle guard”掩盖 provider 首事件前准备成本，也不得把 Aster compat 首 poll 时序失败误报成 `emitted_any=false` 的不可恢复 provider idle。
- current provider/reply backend 迁出后继续复用 `agent-runtime::reply_session` 或并入最终 Turn execution owner；不得在 backend adapter 内恢复 `tool_scope` / provider wire shape metadata 第二份实现。
- provider wire support 判定必须继续归属 `model-provider`；Aster backend adapter 只允许调用 `provider_request_wire_support_issue()` 并转成 fail-closed error，不得在任意 Aster adapter 内恢复 `RuntimeProviderBackend::*` 白名单、provider-name 特判或 protocol 判定。
- App Server / GUI / Evidence 继续消费 `provider_trace`、runtime events 和 Item read model，不得通过 Aster `Message` 或 Aster provider metadata 旁路重建 reply request 状态。
- provider trace runtime provider metadata 必须继续由 `model-provider` 的 provider handle owner 生成；不得在 `agent-runtime::provider_trace`、Aster backend adapter 或 `lime-agent` policy loop 中恢复第二份 provider/protocol/active model 字段选择。

### 4.5 native tool overlay current owner

当前状态：

- `tool-runtime::native_overlay` 持有 Lime-owned native tool overlay 清单：`view_image`、`apply_patch`、`skill_search`、`Skill`、`sleep`、`update_plan`、`WebFetch`、`WebSearch`。`Write` / `Edit` 与 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 已按 Codex 口径从 production overlay / allowlist、agent prompt、agent tool catalog 和 GUI current capability 检查中移除，只保留为 historical frontend / hook matcher / transcript alias 或待细化删除的 vendor residual。
- `tool-runtime::native_overlay` 进一步持有 `RuntimeNativeToolRegistration` plan，明确每个 overlay tool 的注册名与 owner：除 `Skill` 仍是 skill gate overlay 外，`view_image`、`apply_patch`、`skill_search`、`sleep`、`update_plan`、`WebFetch`、`WebSearch` 均必须由 `tool-runtime::native_dispatch` backing。
- `tool-runtime::native_overlay` 也持有 `RuntimeNativeToolInstallStep` / `runtime_native_tool_install_plan()`，把 overlay tool 的安装顺序、registration contract 和 `RuntimeNativeToolTurnContextSource` 固定到 current owner；`runtime_native_tool_install_definitions()` 进一步把 current model-visible definition 也固定在 `tool-runtime`。`native_tools/runtime_overlay.rs` 只消费该 current install plan 再落到临时 Aster `ToolRegistry`；`AgentRuntimeState` 在初始化和 gateway-backed tool 注册时只维护 `native_tool_definitions` current read model，`contains_native_tool(...)` 也从同一份 definition map 派生。GUI / Evidence inventory 只消费 `native_tool_definitions_snapshot()`，不再维护或读取单独的 current-name set。Aster overlay 仍保留 `create_runtime_native_tool(...)` 工厂适配，但该工厂只负责把 current install step 映射到统一 compat adapter，不再让主安装循环、inventory adapter 或 per-tool wrapper 自己从 Aster registry 反推 registration source / turn context / surface / definition。
- `tool-runtime::native_overlay` 也持有 `RuntimeNativeToolSurface`，承接 stateless overlay tool 的 definition、lookup-only aliases 和 retry override；`RuntimeNativePermissionDecision` / `check_runtime_native_tool_permissions(...)` 承接 stateless overlay tool 的 permission / confirmation 分派。`runtime_tool_bridge::RuntimeNativeToolAdapter` 统一读取该模型可见 surface、执行 current dispatcher，并只把 current permission decision 转换成临时 Aster `PermissionCheckResult`。`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`、`apply_patch`、`skill_search` 的 per-tool wrapper 文件已删除，不再各自保留 permission delegate、adapter 创建、`*_tool_definition()` 调用、legacy alias 常量、surface/options 读取、turn context 接线、本地 `Tool` trait 样板或 test-only `create_*_tool()` helper；临时 `Tool` 创建和 adapter 回归统一由 `runtime_tool_bridge.rs` 承接。
- vendored Aster `task_list_tools.rs`、`task_output_tool.rs`、`task_stop_tool.rs` 已删除；`tools/mod.rs` 不再导出或默认注册 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop`，SubAgent production allowlist、ToolSearch production alias 与 `lime-core::tool_calling` discovery profiles 也不得恢复 Task\*。历史 frontend transcript / display 读面仍按 compat 处理，后续单独收缩。
- `tool-runtime::native_dispatch` 持有已迁 native tool 的 current definition / executor dispatch：`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`，并通过 gateway-aware builder 接入 `memory_store` / `image_task` / `tool_search`；gateway-backed memory/image/tool_search adapter 也从同一个 dispatch 取模型可见 definitions，不再直接调用各自 definition helper 或 vendor ToolSearch surface。这对齐 Codex registry/router 的骨架，但还没有替代 Aster reply loop 的 `ToolRegistry`。
- `tool-runtime::tool_result_projection` 持有 native tool execution result 到 MCP `CallToolResult` 的 current projection：success/error 文本选择、metadata -> `structured_content`、`model_visible_image` / `image_url` 模型可见图片内容附加，以及 `tool_surface_updated` 判定。`agent-compat/src/agents/agent.rs` 只能搬运 Aster `ToolResult` 字段到 `RuntimeToolResultParts`，不得重新持有这些 result projection 规则。
- `lime-agent/src/native_tools/runtime_tool_bridge.rs` 集中已迁 tool 仍需的 Aster `PermissionCheckResult` / `ToolContext` / `ToolResult` / `ToolError` 临时转换；其中无 App Server gateway 的 stateless adapter 创建已进一步集中到 `create_runtime_native_tool_adapter(...)` / `RuntimeNativeToolAdapter`，但 bridge 不再持有 per-tool permission helper、`WebFetchInput` 或 preapproved host logic。需要 App Server gateway executor 的 `memory_store` / `image_task` / `tool_search` 已集中到 `native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter`，旧 `native_tools/{memory_store,image_tasks,tool_search}.rs` 已删除。`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch` 的 per-tool wrapper 也已删除。
- `native_tools/runtime_overlay.rs::NativeRegistration` 现在集中承接 Aster `Box<dyn Tool>` 到 current `RuntimeToolDefinition` 的临时封装；`AgentRuntimeState` 只接收 `NativeRegistration` 并维护 current definition snapshot，不再直接 import `aster::tools::Tool`、不维护第二份 name set，也不从 `Box<dyn Tool>` 反推 current read model。gateway-backed `memory_store` / `image_task` / `tool_search` adapter factory 也只返回 `NativeRegistration`。
- `tool-runtime::native_overlay` 现在同时持有 `runtime_native_tool_registration_allowlist()` 与 `runtime_native_tool_registration_is_allowed(...)`，作为 Lime 初始化 Aster registry 与后续 gateway-backed `NativeRegistration` 写入的 current policy owner；Lime 只允许注册 Codex-first/current 最小工具面，不再使用 Aster 默认全量工具池，也不允许测试专用或 Aster-only wrapper 名称绕过 allowlist 写回 production registry。
- current owner API 使用 `runtime_native_tool_overlay_*` 领域命名；不为刚迁出的 `lime_native_tool_overlay_*` 保留别名。
- `native_tools/runtime_overlay.rs` 只把 current 清单落到临时 Aster `ToolRegistry`；WebFetch/WebSearch 的短期 Aster permission 接线已集中到 `runtime_tool_bridge.rs`，执行事实源仍是 `tool-runtime`。
- `runtime_state_support::create_lime_tool_config()` 已传入 `runtime_native_tool_registration_allowlist()`；未进入 allowlist 的 Aster 默认工具注册面按 `dead / production-disabled` 处理，后续不得为了“兼容”重新暴露到模型或 GUI inventory。
- `agent_tools/tool_inventory_runtime_adapter.rs` 只从 `AgentRuntimeState::native_tool_definitions_snapshot()` 读取 current native definitions；不再读取 Aster `ToolRegistry::get_definitions()`，也不再用 `current_surface_tool_names` / `registry_native` 区分 current tool source。外部 App Server / frontend 契约已收敛到 `native_tools`、`native_total`、`native_visible_total`、`native_catalog_unmapped_total`；旧 `registry_tools` JSON 字段、`AgentRuntimeToolInventoryRegistryEntry` 类型名和 Harness registry 组件名均为 `dead / guarded`。

判定：

- `refactor-aligned current`：`tool-runtime::native_overlay`。
- `refactor-aligned current skeleton`：`tool-runtime::native_overlay::RuntimeNativeToolRegistration`，归属 Turn tool registration plan。
- `refactor-aligned current skeleton`：`tool-runtime::native_overlay::RuntimeNativeToolInstallStep`，归属 Turn tool install plan / registration order。
- `refactor-aligned current skeleton`：`tool-runtime::native_overlay::runtime_native_tool_install_definitions()`，归属 Turn tool definition read model。
- `refactor-aligned current skeleton`：`AgentRuntimeState::native_tool_definitions_snapshot()` 与 `contains_native_tool(...)`，归属 Turn native tool availability / definition read model；GUI / Evidence inventory 不再从 Aster registry definitions 反推 current surface 或 current definition。
- `refactor-aligned current skeleton`：`tool-runtime::native_overlay::RuntimeNativeToolSurface`，归属 Turn tool model-visible surface / Item inventory projection。
- `refactor-aligned current skeleton`：`tool-runtime::native_overlay::RuntimeNativePermissionDecision` 与 `check_runtime_native_tool_permissions(...)`，归属 Turn tool permission / confirmation policy。
- `refactor-aligned current skeleton`：`tool-runtime::native_dispatch`。
- `refactor-aligned current`：`runtime_native_tool_registration_allowlist()` / `runtime_native_tool_registration_is_allowed(...)` 作为 Turn tool lifecycle / Item tool inventory 的当前注册面 policy。
- `transitional current adapter / compat blocker`：`native_tools/runtime_tool_bridge.rs` 与 `native_tools/gateway_bridge.rs`，只服务 Aster reply loop 尚未迁出的 `Tool` trait wrapper；它们不是最终 Turn owner。
- `transitional current adapter / compat blocker`：`native_tools/runtime_overlay.rs::NativeRegistration`，只用于把当前仍需注册到 Aster `ToolRegistry` 的临时 `Tool` trait 对象和 current definition 绑定在一个边界内；Aster reply loop 删除后必须随 registry 壳删除。
- `compat blocker`：Aster `ToolRegistry` / `Tool` trait 的实际执行壳仍在 `native_tools/runtime_overlay.rs` 与 reply loop。
- `dead / deleted / guarded`：未进入 allowlist 的 Aster vendor 默认工具注册面，例如 Aster `WriteTool` / `EditTool`、`TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` vendor 实现、`NotebookEdit`、`EnterWorktree`、`ExitWorktree`、`Workflow`、`Config`、Aster `SleepTool` 旧面、`Cron`、`RemoteTrigger`。Codex-style current 等待工具只能是 `sleep` / `clock.sleep`，文件修改只能走 `apply_patch` current executor，规划只能走 `update_plan` current executor。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 调用 WebFetch/WebSearch/native tools 后，删除 `native_tools/runtime_overlay.rs` 中的 Aster registry 注册壳。
- 删除 `native_tools/runtime_overlay.rs` 前，所有 production native tool registration 必须先由 `tool-runtime` current router / dispatch plan 直接喂给 Turn executor；不得让 `RuntimeNativeToolRegistration` 退化成长期 Aster wrapper 清单。
- stateless wrapper 文件已删除并由 `asterMigrationBoundary.test.ts` 守卫；模型可见 surface 和 permission / confirmation policy 必须继续由 `tool-runtime` owner 生成，不得在 Aster wrapper、GUI inventory 或 prompt template 中恢复第二份 description/schema/alias/retry/permission 事实源。
- Aster reply loop 不再通过 Aster `Tool` trait 调用已迁 native tools 后，删除 `native_tools/runtime_tool_bridge.rs`；不得把该桥接层升格为长期 current API。
- Aster reply loop 不再通过 Aster `Tool` trait 调用已迁 native tools 后，删除 `NativeRegistration`；`AgentRuntimeState` 只能保留 current Turn executor / native inventory 的 name / definition snapshot。
- Aster adapter 不得再直接选择 `memory_store` / `image_task` executor handle；需要 App Server gateway 的工具只能通过 `NativeDispatch::builder().with_*_gateway(...)` 接线。
- allowlist 中仍由 Aster 实现的工具必须逐步迁到 `tool-runtime` executor；不再需要的工具先从 allowlist 移除，再删除 vendor 实现和测试。
- Aster Task\* vendor 实现不得恢复；历史 transcript / display 读面回头细化时继续收缩。
- GUI / Evidence 继续消费 current inventory `source_kind`，不得把整个 Aster registry 重新标为 `current_surface`。

### 4.6 apply_patch native executor current owner

当前状态：

- `tool-runtime::apply_patch` 持有 `apply_patch` native tool 的 current executor、input schema、permission check、patch apply、summary、metadata、file change/diff/checkpoint refs 构造。
- `lime-agent/src/tools/apply_patch_tool.rs` 已删除；Aster `PermissionCheckResult` 适配和临时 `Tool` 创建集中到 `native_tools/runtime_tool_bridge.rs`。
- `lime-agent` 不再直接依赖 `patch-apply`；该依赖由 `tool-runtime` 持有。

判定：

- `refactor-aligned current`：`tool-runtime::apply_patch`。
- `compat blocker`：`runtime_tool_bridge.rs` / `runtime_overlay.rs` 仍把 current apply_patch executor 暂时落到 Aster `Tool` trait / registry，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：`lime-agent/src/tools/apply_patch_tool.rs`。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 apply_patch permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- GUI / Evidence 继续消费 current tool result metadata，不得在 Aster wrapper 中恢复 metadata/diff/hash 第二份实现。

### 4.7 skill_search native executor current owner

当前状态：

- `tool-runtime::skill_search` 持有 `skill_search` native tool 的 current executor、input schema、permission check、输入解析、workspace / project root 解析、Skills metadata search、输出 JSON 和 evidence metadata 构造。
- `lime-agent/src/tools/skill_search_tool.rs` 已删除；Aster `PermissionCheckResult` 适配和临时 `Tool` 创建集中到 `native_tools/runtime_tool_bridge.rs`。
- App Server evidence provider 已消费 `tool_family=skill_search`、`skill_search_query`、`skill_search_result_count` 等 metadata；这不是为了迁移而迁移。

判定：

- `refactor-aligned current`：`tool-runtime::skill_search`。
- `compat blocker`：`runtime_tool_bridge.rs` / `runtime_overlay.rs` 仍把 current skill_search executor 暂时落到 Aster `Tool` trait / registry，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：`lime-agent/src/tools/skill_search_tool.rs`。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 skill_search permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- GUI / Evidence 继续消费 current skill search metadata，不得在 Aster wrapper 中恢复 workspace 解析或 output / metadata 第二份实现。

### 4.7.1 Skill gate current owner

当前状态：

- `tool-runtime::skill_gate` 持有 Skill 工具的 name / description / input schema 模型可见 surface、调用参数规范化、session enable、allowed skills、allowed capabilities、workspace skill source gate、disabled/not-allowed message 与 image generation contract gate。
- App Server `runtime_backend/skill_runtime_enable.rs` 直接消费 `tool_runtime::skill_gate`，不再通过 `lime_agent::tools` 读写 Skill gate。
- `lime-agent/src/tools/skill_tool_gate.rs` 只在 native hook path 消费 `tool_runtime::skill_gate` / `skill_execute`，`LimeSkillTool::name()` / `description()` / `input_schema()`、Aster `Tool` trait impl、generic Aster `ToolResult` metadata attach 已删除；Skill model-visible definition 由 current `skill_tool_definition()` 注入。
- `lime-agent/src/tools/mod.rs` 不再公开 `LimeSkillTool`，也不再把 Skill gate API 作为 `lime-agent::tools` 公共事实源。

判定：

- `refactor-aligned current`：`tool-runtime::skill_gate`，归属 Turn tool lifecycle 的 model-visible surface、invocation input materialization、session gate / source metadata owner。
- `compat blocker`：`lime-agent/src/tools/skill_tool_gate.rs::CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call，因为 provider/reply loop 尚未迁出 Aster。
- `dead / guarded`：`LimeSkillTool` Aster `Tool` trait wrapper、`impl Tool for LimeSkillTool`、generic Aster `ToolResult` metadata attach、`lime-agent` wrapper 本地 `SkillToolSessionAccess` store、skill allowlist/source metadata gate、`workspace_skill_source_for_session_skill` 第二份实现、wrapper 代理 Aster `SkillTool::name()` / `input_schema()` 的 surface、wrapper 本地参数规范化规则、`lime-agent::tools` 公共 re-export gate API，以及 App Server 通过 `lime_agent::tools` 读写 gate。

退出条件：

- provider/reply loop 迁出 Aster 后删除 `CurrentSessionSkillProvider` Aster provider bridge。`LimeSkillTool` wrapper 已删除，不得作为过渡方案恢复；App Server 和 Turn executor 继续直接消费 `tool-runtime::skill_gate` / `skill_execute`。
- Skill source metadata 继续由 current gate owner 投影，不得在 Aster wrapper 或 App Server runtime enable 中恢复第二份 session/source store。

验证记录：

- `tool-runtime skill_gate --lib` 最新通过，`4 passed`；`lime-agent skill_tool --lib` 通过，`7 passed`；`asterMigrationBoundary.test.ts` 通过，`134 passed`。这证明 Skill surface、invocation normalization 与 session gate 已归属 不依赖 Aster current owner；后续补测 `lime-skills::run` 与 `tool-runtime::skill_execute` 证明 prompt/workflow backend 迁出 Aster `SkillTool`。

### 4.7.2 Skill runtime contract current owner

当前状态：

- `tool-runtime::skill_runtime_contract` 持有 Skill runtime contract metadata、modality runtime contract registry 读取、execution profile / executor adapter 合成、policy snapshot skeleton、entry source 提取和 provided runtime contract preflight。
- `tool-runtime::skill_result` 持有 Skill runtime contract result metadata、runtime preflight failure projection 与 workspace skill source metadata projection。
- `lime-agent/src/tools/skill_tool_gate.rs` 只调用 current owner 构造 metadata map，并通过 `tool-runtime::tool_result_projection` 投影成 MCP `CallToolResult`；Aster `ToolResult` attach 已随 `LimeSkillTool` wrapper 删除。
- 该模块服务 Lime 多模型 / 多模态 runtime contract，不把 Aster `SkillTool` 或 Aster registry 当事实源。

判定：

- `refactor-aligned current`：`tool-runtime::skill_runtime_contract` 与 `tool-runtime::skill_result`，归属 Turn tool lifecycle / Item tool metadata projection 的 contract / result metadata owner。
- `compat blocker`：`skill_tool_gate.rs` 内 Aster provider bridge。
- `dead / guarded`：generic Aster `ToolResult` metadata attach、Aster `Tool` trait wrapper、本地 governance JSON include、contract spec、default runtime contract 构造、policy snapshot、runtime contract extraction 和 preflight 校验第二份实现。

退出条件：

- wrapper 里的 Aster `ToolResult` 转换已删除；current Turn executor 直接消费 `SkillPreflightFailureProjection` / metadata map。
- runtime contract registry 读取只能留在 `tool-runtime` owner；App Server、Aster wrapper 或前端不得恢复各自解析一份 governance contract JSON。

验证记录：

- `tool-runtime skill_runtime_contract --lib` 通过，`3 passed`；`tool-runtime skill_result --lib` 通过，`3 passed`；`lime-agent skill_tool --lib` 通过，`7 passed`。这证明 runtime contract / result metadata owner 已在 不依赖 Aster current crate 内闭环；后续 Skill prompt/workflow runner 迁移已删除 Aster `SkillTool` backend，2026-07-11 又删除 `LimeSkillTool` / generic `ToolResult` attach，`lime-agent` 侧只剩 Aster provider bridge。

### 4.8 memory_store native executor current owner

当前状态：

- `tool-runtime::memory_store` 持有 `memory_list` / `memory_read` / `memory_search` / `memory_add_note` native tools 的 current executor、input schema、permission check、App Server memory store gateway trait、请求 DTO 构造、summary 和 GUI / Evidence metadata 构造。
- `lime-agent/src/native_tools/gateway_bridge.rs` 只通过 `NativeDispatch::builder().with_memory_store_gateway(...)` 构造 per-gateway dispatch，从同一个 dispatch 读取 definitions 并创建 `RuntimeDefinitionToolAdapter`，并保留 memory permission function；旧 `lime-agent/src/native_tools/memory_store.rs` 已删除。集中 adapter 不再本地实现 Aster `Tool` trait、定义 gateway trait、直接选择 executor handle、直接调用 `memory_store_tool_definitions()` 或维护第二份 root params、path validation、参数解析、metadata/output 规则。
- `app-server/src/runtime_backend/memory_tools.rs` 直接实现 `tool_runtime::memory_store::MemoryStoreGateway`，App Server memory store 主链不再从 `lime-agent` compat 边界拿 trait。
- 前端 memory evidence 已消费 `memory_search` / `memory_read` / `memory_add_note` metadata；这不是为了迁移而迁移。

判定：

- `refactor-aligned current`：`tool-runtime::memory_store` 承接 tool lifecycle 规则；App Server memory store / protocol DTO 继续承接 memory 数据主链。
- `transitional current adapter / compat blocker`：`native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter` 仍让 memory store current executor 创建 Aster `Tool` trait 对象，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/memory_store.rs`、本地 `MemoryStoreTool` / `impl Tool` 样板和 wrapper 级 memory DTO / metadata / path 规则。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `native_tools/gateway_bridge.rs` 中的 memory adapter factory 与 `RuntimeDefinitionToolAdapter` 的 memory 使用点。
- GUI / Evidence 继续消费 current memory tool metadata，不得在 Aster wrapper 中恢复 path permission、DTO 构造或 output / metadata 第二份实现。

### 4.9 image_task native executor current owner

当前状态：

- `tool-runtime::image_task` 持有 `lime_create_image_generation_task` native tool 的 current executor、input schema、permission check、App Server media task gateway trait、请求 DTO 构造和 tool result metadata 投影。
- `lime-agent/src/native_tools/gateway_bridge.rs` 只通过 `NativeDispatch::builder().with_image_task_gateway(...)` 构造 per-gateway dispatch，从同一个 dispatch 读取 definitions 并创建 `RuntimeDefinitionToolAdapter`，并保留 image permission function 与 Aster action scope 到 current turn metadata 的临时投影；旧 `lime-agent/src/native_tools/image_tasks.rs` 已删除。集中 adapter 不再本地实现 Aster `Tool` trait、直接选择 executor handle、直接调用 `image_task_tool_definition()`、重复 RuntimeTool result/error 转换或维护第二份 image task metadata projection。
- App Server media task artifact 主链直接实现 `tool_runtime::image_task::ImageTaskGateway`；GUI / workbench / evidence 继续消费 media task artifact 和 image preview record，不靠 Aster wrapper 推断结果。

判定：

- `refactor-aligned current`：`tool-runtime::image_task` 承接 Turn tool lifecycle 规则；App Server media task artifact / GUI image preview 是真实消费链。
- `transitional current adapter / compat blocker`：`native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter` 仍让 image task current executor 创建 Aster `Tool` trait 对象，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/image_tasks.rs`、本地 `ImageTaskTool` / `impl Tool` 样板和 wrapper 级 image schema / DTO / metadata projection。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `native_tools/gateway_bridge.rs` 中的 image adapter factory 与 `RuntimeDefinitionToolAdapter` 的 image 使用点。
- GUI / Evidence 继续消费 current media task metadata，不得在 Aster wrapper 中恢复 image task schema、DTO 构造、project root 校验或 metadata projection 第二份实现。

### 4.10 Codex-style sleep native executor current owner

当前状态：

- `tool-runtime::sleep` 持有 Codex-style `sleep` current executor、`clock.sleep` alias 常量、`duration_ms` strict schema、12 小时上限、permission check、elapsed/interrupted metadata 和 cancel token 中断。
- `lime-agent/src/native_tools/sleep.rs` 已删除；临时 Aster permission adapter 与 `Tool` trait adapter 由 `native_tools/runtime_tool_bridge.rs` / `native_tools/runtime_overlay.rs` 按 current install plan 统一创建。对外 tool name 是 `sleep`，alias 是 `clock.sleep`，不恢复 Aster `SleepTool` 旧名。
- Rust catalog、frontend normalization、GUI display config 和 process summary 已消费 current `sleep`；`SleepTool` 只允许作为 dead / unmapped 名称出现在负向测试和守卫里。
- vendored Aster `tools/sleep_tool.rs` 已删除，`tools/mod.rs` 不恢复 `pub mod sleep_tool` / `SleepTool::new()`。

判定：

- `refactor-aligned current`：`tool-runtime::sleep` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item tool projection。
- `compat blocker`：`runtime_overlay.rs` + `runtime_tool_bridge.rs::RuntimeNativeToolAdapter` 仍为 Aster reply loop 创建 `sleep` 临时 `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/sleep.rs`、Aster `SleepTool` vendor 实现、旧 `SleepTool` alias、前端 `sleeptool -> sleep` 正向映射。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 sleep permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- Turn input queue / activity signal 迁入 current runtime 后，把 Codex 的“新输入打断 sleep”接到 `RuntimeSleepExecutor`；当前骨架只支持 cancel token 中断，不得误报为完整等价 Codex。
- GUI / Evidence 继续消费 current `sleep` metadata，不得在 Aster wrapper 或前端旧 alias 中恢复等待语义。

### 4.11 Codex-style view_image native executor current owner

当前状态：

- `tool-runtime::view_image` 持有 Codex-style `view_image` current executor、`path` / `detail` strict schema、permission check、file URL / relative path 解析、50MB 文件上限、data URL 构造、token 估算、PNG/GIF/JPEG/WebP 头部尺寸解析和 model-visible image metadata。
- `lime-agent/src/native_tools/view_image.rs` 已删除；临时 Aster permission adapter 与 `Tool` trait adapter 由 `native_tools/runtime_tool_bridge.rs` / `native_tools/runtime_overlay.rs` 按 current install plan 统一创建。对外 tool name 是 `view_image`，`ViewImage` / `ViewImageTool` 只作为 lookup-only legacy alias。
- Rust catalog、frontend normalization、GUI display config、process summary 和 imported runtime event detail 已消费 current `view_image` key；不再要求 Aster `ViewImageTool` 成为执行事实源。
- vendored Aster `tools/view_image.rs` 已删除，`tools/mod.rs` 不恢复 `mod view_image` / `pub use view_image` / `ViewImageTool::new()`；Aster 默认 `Agent::new()` 不再把 `view_image` 当 vendor 默认工具。
- `agent-compat/src/media/**` 已删除；`ReadTool::read_image(...)` 与 `read_pdf(...)` 已 fail-closed，不再通过 Aster `Read` 生成 base64 image/PDF multimodal payload。图片查看归 `tool-runtime::view_image`，PDF 文本归 current document preview / ingestion。

判定：

- `refactor-aligned current`：`tool-runtime::view_image` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item tool projection。
- `compat blocker`：`runtime_overlay.rs` + `runtime_tool_bridge.rs::RuntimeNativeToolAdapter` 仍为 Aster reply loop 创建 `view_image` 临时 `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/view_image.rs`、Aster `ViewImageTool` vendor 实现、vendor media helper 依赖、Aster `Read` image/PDF base64 分支、vendor 默认注册。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 view_image permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- GUI / Evidence / provider lowering 继续消费 current model-visible image metadata，不得在 Aster wrapper、vendor media helper 或 `ReadTool` 中恢复 `read_image_file_enhanced`、`estimate_image_tokens`、`Base64 Data` 或第二份 schema。
- `ViewImage` / `ViewImageTool` alias 只服务历史 transcript lookup；current API、catalog 和文档继续使用 `view_image`。

### 4.12 Codex-style update_plan native executor current owner

当前状态：

- `tool-runtime::update_plan` 持有 Codex-style `update_plan` current executor、`PlanUpdate` / `PlanStep` 领域 DTO、strict schema、最多一个 `in_progress` 校验、Plan mode 禁用、`Plan updated` ack 和 plan/explanation metadata。
- `lime-agent/src/native_tools/update_plan.rs` 已删除；临时 Aster permission adapter 与 `Tool` trait adapter 由 `native_tools/runtime_tool_bridge.rs` / `native_tools/runtime_overlay.rs` 按 current install plan 统一创建。对外 tool name 是 `update_plan`，`UpdatePlan` / `UpdatePlanTool` / `update_plan_tool` 只作为 lookup-only legacy alias。
- App Server `runtime_backend::plan_events::plan_final_event_from_update_plan_result(...)` 和前端计划轨已消费 current `source=update_plan` 链路；迁移不是只搬 DTO。
- vendored Aster `tools/plan_tool.rs` 已删除，`tools/mod.rs` 不恢复 `pub mod plan_tool` / `pub use plan_tool` / `UpdatePlanTool::new()`；Aster 默认工具注册面不再包含 `update_plan`。

判定：

- `refactor-aligned current`：`tool-runtime::update_plan` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item plan projection。
- `compat blocker`：`runtime_overlay.rs` + `runtime_tool_bridge.rs::RuntimeNativeToolAdapter` 仍为 Aster reply loop 创建 `update_plan` 临时 `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted`：`lime-agent/src/native_tools/update_plan.rs`、vendor `UpdatePlanTool` 实现、默认注册和非 Codex status alias 接受逻辑。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 update_plan permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- App Server / GUI 继续消费 `plan.final` / `source=update_plan`，不得在 Aster wrapper 中恢复 plan event projector 第二份实现。
- `UpdatePlan` / `UpdatePlanTool` alias 只服务历史 transcript lookup；current API、catalog 和文档继续使用 `update_plan`。

### 4.12.0 Native registration definition / registry boundary

当前状态：

- `NativeRegistration::new(definition: RuntimeToolDefinition, tool: Box<dyn Tool>)` 已成为 native tool 注册封装入口；production overlay 的 current definition 来自 `tool-runtime::native_overlay::runtime_native_tool_definition(step.tool())`，gateway-backed tools 的 definition 来自 `NativeDispatch::definitions()`。
- `NativeRegistration::from_tool(...)` 已删除；测试 fixture 也必须显式构造 `RuntimeToolDefinition` 后注册，不能从 Aster `Tool::{name,description,input_schema}` 反推 current definition。
- `RuntimeNativeToolRegistry` wrapper 与 `runtime_native_tool_registry(agent)` 外泄入口已删除；`AgentRuntimeState::register_native_tool(...)` 只调用 `native_tools::register_native_tool_on_agent(...)`，Aster `ToolRegistry` clone / lock / register 生命周期集中在 `native_tools/runtime_overlay.rs` 内部。
- `native_tools/runtime_overlay.rs::configure_lime_native_tool_overlay(...)` 返回实际注册的 `Vec<RuntimeToolDefinition>`；`AgentRuntimeState` 用该返回值维护 current `native_tool_definitions` read model，用于 GUI / Evidence inventory 和 availability 查询。它不再读取 Aster registry definitions、维护第二份 current-name set，也不再单独调用 `runtime_native_tool_install_definitions()` 形成第二条初始化 read-model 链。

判定：

- `refactor-aligned current skeleton`：`RuntimeToolDefinition`、`tool-runtime::native_overlay::runtime_native_tool_definition(...)`、gateway `NativeDispatch::definitions()` 和 `AgentRuntimeState.native_tool_definitions`，归属 Turn native tool availability / Item tool inventory read model。
- `transitional current adapter / compat blocker`：`register_native_tool_on_agent(...)` 在写入 Aster `ToolRegistry` 前已调用 `tool-runtime` current registration policy fail closed；但它内部仍把 `NativeRegistration` 的 Aster `Tool` payload 注册进 Aster `ToolRegistry`，因为 Aster reply loop 尚未迁出 native tool execution。
- `dead / guarded`：`NativeRegistration::from_tool(...)`、从 Aster `Tool` trait 反推 current definition、`RuntimeNativeToolRegistry` wrapper、`runtime_native_tool_registry(...)` 外泄入口、runtime state 先获取 registry 再注册的旧模式，以及 runtime state 绕过 overlay 实际注册结果直接读取 `runtime_native_tool_install_definitions()` 的旧初始化链。

退出条件：

- Aster reply loop 不再通过 Aster `ToolRegistry` / `Tool` trait 执行 native tools 后，删除 `NativeRegistration` 的 Aster payload、`register_native_tool_on_agent(...)` 和 `runtime_tool_bridge.rs` / `gateway_bridge.rs` 的 `Tool` trait adapter。
- GUI / Evidence inventory 必须继续消费 current definition snapshot，不得恢复从 `ToolRegistry::get_definitions()` 反推 current surface。

### 4.12.1 Gateway-backed native permission owner

当前状态：

- `tool-runtime::native_overlay::check_runtime_gateway_tool_permissions(...)` 已承接 gateway-backed native tools 的 permission decision 聚合，覆盖 `memory_store`、`image_task`、`tool_search`、`list_mcp_resources` 和 `read_mcp_resource`。
- `tool-runtime::{memory_store,image_task,tool_search,mcp_resource}` 仍分别持有 per-tool 详细校验、DTO 解析、gateway contract 和 execution metadata；`native_overlay` 只做 Turn permission preflight 聚合，不重新实现各工具业务规则。
- `native_tools/gateway_bridge.rs` 只保留 Aster `ToolContext` -> current context 输入提取，并通过 `RuntimeDefinitionToolAdapter` 把 current decision 转成临时 Aster `PermissionCheckResult`；不再直接调用 `check_runtime_memory_store_permissions(...)`、`check_runtime_image_task_permissions(...)`、`check_runtime_tool_search_permissions(...)` 或 `check_runtime_mcp_resource_permissions(...)`。
- `asterMigrationBoundary.test.ts` 已固定该 owner：gateway bridge 必须调用 `check_runtime_gateway_tool_permissions(...)`，不得恢复 agent 侧 per-tool permission helper。

判定：

- `refactor-aligned current`：`tool-runtime::native_overlay::check_runtime_gateway_tool_permissions(...)`，归属 Turn tool lifecycle permission preflight。
- `refactor-aligned current`：`tool-runtime::{memory_store,image_task,tool_search,mcp_resource}`，继续持有各自工具的参数校验、gateway contract 和 result metadata。
- `compat blocker`：`native_tools/gateway_bridge.rs` / `RuntimeDefinitionToolAdapter` 仍依赖 Aster `ToolContext` 与 `PermissionCheckResult`，只允许作为 Aster reply loop 删除前的转换壳。
- `dead / guarded`：gateway bridge 内 per-tool permission helper、直接 per-tool permission import 和 agent 侧 policy owner。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `RuntimeDefinitionToolAdapter` 和 `native_tools/gateway_bridge.rs` 的 permission conversion。
- 后续新增 gateway-backed native tool 必须先进入 `tool-runtime` current owner，再通过 unified gateway permission API 接入临时 Aster adapter；不得在 `lime-agent` compat 壳里新增 per-tool policy。

### 4.12.2 Codex-style tool_search native executor current owner

当前状态：

- Codex 对照确认 `tool_search` 是 current deferred tool discovery 能力：`codex-rs/tools/src/tool_discovery.rs` 固定 `TOOL_SEARCH_TOOL_NAME = "tool_search"`，`core/src/tools/handlers/tool_search.rs` 负责搜索 deferred tools，`core/src/tools/spec_plan.rs` 在存在 deferred runtime 时追加 tool_search executor。
- `tool-runtime::tool_search` 已承接 `tool_search` current executor 骨架、`ToolSearchGateway`、`McpToolSearchParams` 构造、`McpToolListResponse` 输出归一化、`tools/matches/count/query/caller/notes/retry_allowed/terminal_reason/next_action` JSON shape 与 GUI / retry policy metadata；模型可见 canonical name 已收敛为 Codex `tool_search`。
- `lime-agent/src/native_tools/gateway_bridge.rs` 只通过 `NativeDispatch::builder().with_tool_search_gateway(...)` 构造 per-gateway dispatch，从同一个 dispatch 读取 definitions 并创建 `RuntimeDefinitionToolAdapter`，并从 `TOOL_SEARCH_LOOKUP_ALIASES` 接入历史 lookup alias；旧 `lime-agent/src/native_tools/tool_search.rs` 已删除。集中 adapter 不直接依赖 Aster vendor `ToolSearchTool`、`ExtensionManager` 或 executor body。
- `app-server/src/runtime_backend/tool_search_tools.rs` 直接实现 `tool_runtime::tool_search::ToolSearchGateway`，唯一后端调用是 `AppDataSource::search_mcp_tools(params)`；App Server MCP current 主链是真实消费链。
- 前端 ToolSearch summary 已能消费 `{tools,matches,count,query,caller,notes}` shape；本刀补齐后端 current executor 和 App Server gateway，不再靠 Aster vendor wrapper 生成结构化输出。
- vendored Aster `tools/tool_search_tool.rs` 已删除，`tools/mod.rs` 不再导出或默认注册 `ToolSearchTool`，Aster `ExtensionManager` 搜索实现不再是可恢复的第二事实源。
- `RuntimeDefinitionToolAdapter` 已支持静态 lookup alias，`ToolSearch` / `ToolSearchTool` / `mcp__system__tool_search` 的历史 alias 由 `tool-runtime::native_dispatch::TOOL_SEARCH_LOOKUP_ALIASES` 驱动并 canonicalize 到 `tool_search`；vendored Aster `tools/registry.rs` 不再保留 ToolSearch 默认 alias。

判定：

- `refactor-aligned current`：`tool-runtime::tool_search` 承接 Turn tool lifecycle 规则；App Server MCP `search_mcp_tools` 和前端 ToolSearch summary 是真实消费链。
- `transitional current adapter / compat blocker`：`native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter` 仍让 `tool_search` current executor 创建 Aster `Tool` trait 对象，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/tool_search.rs` per-tool wrapper；历史 alias 只能由 Lime current dispatch / concentrated adapter 提供。
- `dead / deleted / guarded`：vendored Aster `ToolSearchTool`、`register_tool_search_tool`、`config.allows_tool("ToolSearch")` 默认注册路径与 Aster `ExtensionManager` executor body。
- `dead / deleted / guarded`：vendored Aster ToolSearch default alias matrix；历史 `ToolSearch` / `ToolSearchTool` / `mcp__system__tool_search` lookup alias 只能由 Lime current dispatch / adapter 提供。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `native_tools/gateway_bridge.rs` 中的 tool_search adapter factory 与 `RuntimeDefinitionToolAdapter` 的 tool_search 使用点。
- 保持 current API、catalog、prompt 和文档使用 Codex `tool_search`；`ToolSearch` / `ToolSearchTool` 只作为历史 transcript lookup alias，不能继续作为 current API 命名。
- App Server / GUI 继续消费 MCP current gateway 和结构化 ToolSearch summary，不得恢复 Aster `ExtensionManager` 搜索、vendor executor 或第二份 retry/terminal metadata 规则。

### 4.12.3 Codex-style MCP resource native executor current owner

当前状态：

- Codex 对照确认 MCP resource current canonical names 是 `list_mcp_resources` / `read_mcp_resource`：`codex-rs/core/src/tools/handlers/mcp_resource_spec.rs` 定义模型可见 spec，`core/src/tools/handlers/mcp_resource/*` 提供 handler，`core/src/tools/spec_plan.rs` 把两个 handler 加入 tool plan。
- `tool-runtime::mcp_resource` 已承接 `McpResourceGateway`、`RuntimeMcpResourceExecutor`、`McpResourceListResponse` / `McpResourceReadParams` gateway contract、`list_mcp_resources` / `read_mcp_resource` definitions、结果 metadata、permission stub 与 lookup-only legacy alias；该 owner 不依赖 Aster。
- `tool-runtime::native_dispatch::NativeDispatchBuilder::with_mcp_resource_gateway(...)` 统一注册 MCP resource definition + executor；`lime-agent/src/native_tools/gateway_bridge.rs::create_mcp_resource_tools(...)` 从同一个 dispatch 读取 definitions 并创建 `RuntimeDefinitionToolAdapter`，旧 `ListMcpResourcesTool` / `ReadMcpResourceTool` 只作为 lookup-only alias。
- `app-server/src/runtime_backend/mcp_resource_tools.rs` 直接实现 `tool_runtime::mcp_resource::McpResourceGateway`，唯一后端调用是 `AppDataSource::list_mcp_resources()` / `AppDataSource::read_mcp_resource(params)`；App Server MCP current 主链是真实消费链。
- `agent_tools/tool_inventory_runtime_adapter.rs` 的 runtime inventory seed 不再读取 Aster `ToolRegistry::get_definitions()`；GUI / Evidence inventory 只从 `AgentRuntimeState::native_tool_definitions_snapshot()` 获取 current native definitions，并把 `list_mcp_resources` / `read_mcp_resource` 投影为 `current_surface`。
- vendored Aster `tools/mcp_resource_tools.rs` 已删除，`tools/mod.rs` 不再导出或默认注册 `ListMcpResourcesTool` / `ReadMcpResourceTool`，也不再调用 `register_extension_resource_tools(...)` 或 `config.allows_any_tool(&["ListMcpResources", "ReadMcpResource"])`；旧 Aster `ExtensionManager` resource executor 不再是可恢复的第二事实源。
- vendored Aster reply loop 残留的 resource gating / compact surface / prompt 文案已改用 `list_mcp_resources` / `read_mcp_resource`；旧 `ListMcpResourcesTool` / `ReadMcpResourceTool` 不再作为正向模型提示，只能由 Lime current adapter 和前端 normalization 作为历史 transcript alias 识别。

判定：

- `refactor-aligned current`：`tool-runtime::mcp_resource` 承接 Turn tool lifecycle 规则；App Server MCP resource gateway 与 GUI inventory `current_surface` 是真实消费链。
- `transitional current adapter / compat blocker`：`native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter` 仍让 MCP resource current executor 创建 Aster `Tool` trait 对象，因为 Aster reply loop 尚未迁出 native tool registry。
- `dead / deleted / guarded`：vendored Aster `McpResourceTools` implementation、`register_extension_resource_tools`、Aster default registration、旧 vendor prompts 中的 `ListMcpResourcesTool` / `ReadMcpResourceTool` 正向 surface。
- `dead / guarded`：inventory adapter 从 Aster registry definitions 反推 current tool surface 的旧读模型。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `native_tools/gateway_bridge.rs` 中的 MCP resource adapter factory 与 `RuntimeDefinitionToolAdapter` 的 MCP resource 使用点。
- 保持 current API、catalog、prompt 和文档使用 Codex `list_mcp_resources` / `read_mcp_resource`；`ListMcpResourcesTool` / `ReadMcpResourceTool` 只作为历史 transcript lookup alias，不能继续作为 current API 命名。
- App Server / GUI / Evidence 继续消费 MCP current gateway 和 inventory current surface，不得恢复 Aster `ExtensionManager` resource executor、vendor tool implementation 或从 Aster `ToolRegistry::get_definitions()` 反推 current definitions。

### 4.12.4 MCP extension surface current DTO

当前状态：

- `tool-runtime::tool_extension::{RuntimeExtensionConfig, RuntimeExtensionToolSurface, RuntimeExtensionRegistration, RuntimeExtensionSyncPlan}` 是 MCP extension surface / registration plan 的 current skeleton，不依赖 Aster。
- `RuntimeExtensionConfig::from_tool_surfaces(...)` 已承接 extension `available_tools` 去重排序、`always_visible` / `deferred_loading` 可见性和 single `allowed_caller` collapse 规则。
- `RuntimeExtensionSyncPlan::from_registrations(...)` 已承接 registration 去重、空工具过滤、active names 与 stale names diff 规则；adapter 不再自己决定哪些 bridge 应新增或移除。
- `lime-agent/src/agent_tools/catalog.rs::build_mcp_extension_surface(...)` 只负责把 `lime_mcp::McpToolDefinition` 投影成 `RuntimeExtensionToolSurface`，不再定义 `McpExtensionSurface` 或本地维护 allowed caller collapse 逻辑。
- `agent_tools/tool_inventory_runtime_snapshot.rs` 直接消费 `RuntimeExtensionConfig`，不再把 MCP surface DTO 拆开后重新组装。
- `mcp_bridge.rs` 先把 `McpBridgeSnapshot` 投影为 `RuntimeExtensionRegistration` 并消费 `RuntimeExtensionSyncPlan`，再在 adapter 内把 current config 降到 Aster `ExtensionConfig::Builtin`，并实现 Aster `McpClientTrait` 转发到 Lime 的 `RunningService`；这仍是 Aster reply loop 未迁出前的 compat blocker。

判定：

- `refactor-aligned current`：`tool-runtime::tool_extension::RuntimeExtensionConfig` / `RuntimeExtensionToolSurface` / `RuntimeExtensionRegistration` / `RuntimeExtensionSyncPlan`，归属 Turn tool lifecycle / MCP extension surface and registration planning。
- `transitional current adapter / compat blocker`：`mcp_bridge.rs` 的 Aster `McpClientTrait` / `ExtensionConfig::Builtin` / extension manager registration。
- `dead / guarded`：`lime-agent` catalog 恢复 `McpExtensionSurface`、`collapse_extension_allowed_caller` 或 extension surface 规则副本。
- `dead / guarded`：`mcp_bridge.rs` 恢复 adapter 内 direct active/stale bridge diff、空工具过滤或 registration 去重规则。

退出条件：

- Aster reply loop 不再通过 Aster extension manager 注册 MCP tools 后，删除 `mcp_bridge.rs` 里的 Aster adapter 和 `McpClientTrait` 实现。
- MCP extension surface 规则继续只归属 `tool-runtime::tool_extension`；`lime-agent` 只能做 MCP definition 投影或最终删除 compat 投影层，不得恢复第二份可见性 / caller collapse 规则。
- MCP extension registration 规则继续只归属 `RuntimeExtensionSyncPlan`；删除 Aster adapter 前不得把 active/stale diff 重新下沉到 `mcp_bridge.rs`。

### 4.12.5 Aster BrowserTool MCP wrapper deletion

当前状态：

- `lime-agent/src/tools/browser_tool.rs` 已删除，`tools/mod.rs` 不再声明 `browser_tool` module 或 re-export `BrowserTool`，`lime-agent/src/lib.rs` 也不再公开 `BrowserAction` / `BrowserTool` / `BrowserToolError` / `BrowserToolResult`。
- Codex current 对 Playwright/browser MCP 工具的处理方式是通用 MCP tool call / tool router；没有 Aster 风格 `BrowserTool` wrapper。
- Lime current 浏览器能力已经归属 `browser-runtime`、App Server browser action evidence 与前端 Browser Assist。该 current 链保留，不依赖旧 `BrowserTool` wrapper。
- `McpClientTrait` 在 `lime-agent/src` 的持有点已减少到 `mcp_bridge.rs`，剩余 blocker 是 Aster extension manager adapter 本身。

判定：

- `dead / deleted / guarded`：`BrowserTool` / `BrowserAction` Aster MCP wrapper 与 `lime-agent` public re-export。
- `refactor-aligned current`：`browser-runtime`、App Server evidence `browser_action_index`、通用 MCP tool call / tool lifecycle。
- `compat blocker`：`mcp_bridge.rs` 仍实现 Aster `McpClientTrait` 并注册到 Aster extension manager。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `browser_tool.rs` 保持不存在，并禁止 `tools/mod.rs` / `lib.rs` 恢复 BrowserTool wrapper re-export。
- 后续继续删除 `mcp_bridge.rs` 的 Aster adapter 时，不得借由 BrowserTool wrapper 恢复专用 MCP client 持有点；浏览器产品能力只能继续走 `browser-runtime` / App Server / 通用 MCP tool call。

### 4.12.6 MCP bridge request forwarding current client

当前状态：

- `lime-mcp::McpBridgeClient` 已承接 rmcp request forwarding：`ClientRequest` 构造、`send_cancellable_request(...)`、`PeerRequestOptions`、timeout、cancel notification 和 unexpected response 映射均归属 `lime-mcp` current client。
- `lime-mcp::McpBridgeClient` 不依赖 Aster session context；它只接收调用方传入的 `Extensions`，因此可以继续作为 不依赖 Aster MCP bridge 请求转发 owner。
- `lime-agent/src/mcp_bridge.rs` 只保留 Aster `McpClientTrait` adapter、`current_session_id()` / `SESSION_ID_HEADER` metadata 注入、`ExtensionConfig::Builtin` 降级注册和 Aster extension manager add/remove 接线。
- `mcp_bridge.rs` 不再持有 `ClientRequest::`、`send_cancellable_request`、`PeerRequestOptions`、`CancelledNotification*`、各 rmcp request DTO 或 `ServiceError::{UnexpectedResponse,Timeout,Cancelled}` 请求转发规则。

判定：

- `refactor-aligned current`：`lime-mcp::McpBridgeClient`，归属 Turn MCP tool lifecycle / bridge request forwarding。
- `compat blocker`：`mcp_bridge.rs` 的 Aster `McpClientTrait` / session metadata injection / extension manager registration。
- `dead / guarded`：在 `mcp_bridge.rs` 恢复 rmcp request forwarding、timeout/cancel 或 unexpected-response 规则；在 `lime-mcp::McpBridgeClient` 引入 `aster::`、`current_session_id` 或 `SESSION_ID_HEADER`。

退出条件：

- Aster reply loop 不再通过 Aster extension manager 注册 MCP tools 后，删除 `mcp_bridge.rs` 的 Aster adapter 与 `McpClientTrait` 实现。
- `lime-mcp::McpBridgeClient` 继续作为 不依赖 Aster current bridge client；后续若 App Server / runtime 直接消费 MCP bridge，请求转发仍不得回流到 `lime-agent` adapter。
- 治理守卫继续禁止 adapter 内恢复 rmcp request forwarding 细节，直到 `mcp_bridge.rs` 整体删除。

### 4.12.7 Tool output truncation current owner

当前状态：

- `tool-runtime::tool_io` 已承接 `ToolOutputTruncationPolicy`、`format_tool_output_for_model(...)`、byte/token middle truncation、Codex-style warning 文案和 UTF-8 边界处理。
- `lime-agent/src/tool_output_truncation.rs` 只保留 `AgentTurnContext` / model request policy -> current `ToolOutputTruncationPolicy` 的解析，并临时 re-export `tool-runtime` current helper 给现有调用点。
- `message_content_adapter.rs`、`tool_orchestrator.rs` 与 `live_execution_process.rs` 仍通过该 thin resolver 消费截断策略；后续 live execution runner 迁出 Aster hook adapter 时，应直接消费 `tool-runtime::tool_io`。

判定：

- `refactor-aligned current`：`tool-runtime::tool_io` 的 model-visible output truncation contract，归属 Turn tool lifecycle / Item tool output projection。
- `transitional current adapter`：`lime-agent/src/tool_output_truncation.rs` 的 turn-context policy resolver / re-export；它只允许读取 turn context，不拥有截断算法。
- `dead / guarded`：在 `lime-agent` 恢复 `formatted_truncate_*`、`truncate_middle_*`、byte/token prefix/suffix helper 或直接 `estimate_tool_io_tokens` 算法。

退出条件：

- live execution process runner 和 tool result projection 继续收敛后，优先让调用点直接 import `tool-runtime::tool_io` 的 current helper；`lime-agent` 只保留与 `AgentTurnContext` 绑定的策略解析，或随 turn context owner 迁出一起删除。
- 治理守卫持续禁止 `lime-agent/src/tool_output_truncation.rs` 重新承接模型可见输出截断算法。

### 4.12.8 Live execution process current runner

当前状态：

- `tool-runtime::execution_process::live` 已承接 live shell process runner：gateway contract、start/status/drain/terminate loop、output delta notification metadata、最终 `CallToolResult` 构造、stdin writable metadata、shell argv 构造和模型可见输出截断均归属 current owner。
- App Server `ExecutionProcessServer` 直接实现 `tool_runtime::execution_process::live::RuntimeLiveExecutionGateway`，因此 live runner 的真实后端仍是 App Server execution process server / GUI process read-control 主链，不是空 DTO 迁移。
- `lime-agent/src/live_execution_process.rs` 只保留 Aster `NativeToolExecutionHook` adapter：从 Aster `NativeToolExecutionRequest` 读取 shell command、workspace、turn policy、approval / sandbox / metadata / cancellation token，构造 `RuntimeLiveExecutionRequest`，并把 current notification payload 包成 rmcp `ServerNotification`。
- `lime-agent/src/live_execution_process.rs` 不再持有本地 `PreparedLiveExecution`、process polling/drain loop、snapshot/output metadata 构造、shell argv helper、PowerShell executable probe 或 status/output label helper。

判定：

- `refactor-aligned current`：`tool-runtime::execution_process::live`，归属 Turn live process tool lifecycle；模型可见输出截断继续归属 `tool-runtime::tool_io`。
- `refactor-aligned current`：App Server `ExecutionProcessServer` gateway implementation，作为 Desktop GUI / App Server execution process read-control 的真实后端消费链。
- `compat blocker`：`lime-agent/src/live_execution_process.rs` 的 Aster `NativeToolExecutionHook` adapter；它只允许做 request lowering / notification wrapping，不能继续新增 runner 语义。
- `dead / guarded`：在 `lime-agent` adapter 内恢复 process runner、metadata 构造、shell argv / PowerShell probe、status/output label 或 `execution_error`。

退出条件：

- provider/reply loop 和 Aster `Tool` trait 注册壳迁出后，删除 Aster `NativeToolExecutionHook` 安装点和 `live_execution_process.rs` adapter。
- App Server execution process server 继续直接实现 current gateway；后续 unified exec / process control 细化也必须进入 `tool-runtime` / App Server current owner，不得回流到 Aster hook adapter。
- 治理守卫持续要求 `tool-runtime::execution_process::live` 持有 runner/request/gateway，禁止 current runner import Aster，并禁止 adapter 恢复 runner/helper 实现。

### 4.13 Aster session memory deletion

当前状态：

- Aster `SessionStore` trait 中的 memory 方法已删除，`LimeSessionStore` 不再实现 disabled memory stub。
- Aster `SessionManager` memory API、reply loop 自动 memory 注入、vendor `session/memory*` source、memory FTS schema / trigger / index 创建逻辑已删除。
- `thread-store::memory_stub` 和 `aster_session_store/memory_stub.rs` 也已删除；该能力不再作为 transitional current adapter 存活。

判定：

- `dead / deleted / guarded`。
- 不进入 Thread / Turn / Item current 主链；Lime 当前记忆能力由 App Server memory store + `tool-runtime::memory_store` 承接。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 vendor memory 子系统、Aster memory trait/API 和 Lime disabled stub 保持删除态。
- 后续如需产品化长期记忆，只能从 App Server memory store / Thread read model owner 设计，不得恢复 Aster `SessionStore` memory trait 或隐式 system prompt 注入。

### 4.13 App Server context evidence export summary

当前状态：

- App Server `evidence/export` 已通过 `EvidencePackRequest.turn_runtime_metadata` 收集 stored turn runtime metadata，并由 `runtime/evidence_provider/context.rs` 读取 `context_packet_telemetry`。
- `observability_summary.context` 输出 `context-evidence-summary.v1`，包含 packet/admitted/rejected、budget status、source、source turn id 与 sidecar reference 摘要。
- Evidence 只报告 `sha256Present` 与 sidecar reference 存在性，不导出 sidecar hash 值；`model_visible_preview` 只进入 redacted 计数，不进入 evidence 正文。
- 定向验证已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_context_fragment_summary_from_turn_metadata -- --nocapture`。

判定：

- `refactor-aligned current`。
- Thread / Turn / Item 归属：Turn runtime metadata 进入 Item / Evidence projection；不是 Aster session memory、Aster `SessionStore`、Aster prompt builder 或 vendor context 能力。
- 不改变 root workspace `aster` dependency 状态，也不允许因此继续在 Aster vendor 补 context / compaction 逻辑。

退出条件：

- 本节的 `session_compaction_prompt_context` sidecar source 与 `ContextCompaction` Item 已由后续切片关闭。
- memory summary sidecarRef 已进入 `ContextPacket` metadata 并通过回归；media input attachment reference 已进入 `ContextPacket` telemetry skeleton。
- full media preview / binary sidecar read / Workbench GUI smoke 仍需在 Realtime / Media 主链补齐。
- Aster provider/reply loop、Aster `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` 与 root `aster` dependency 仍按 Phase 6 blocker 收口。

### 4.14 App Server media input reference context skeleton

当前状态：

- App Server `runtime/context_media.rs` 已把 turn `AgentInput.attachments` 中的非 inline media URI 转成 `ContextPacket::media_reference(...)`。
- `media_prompt_context` 只保存 reference metadata，合并到 `context_packet_telemetry`，不读取二进制、不解析 provider payload、不把媒体正文写入 prompt。
- inline `data:` media URI fail closed，不进入 prompt / context telemetry / evidence。
- 定向验证已通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_context -- --nocapture` 2 tests；`context_packet` 4 tests；`memory_prompt` 14 tests。

判定：

- `refactor-aligned current skeleton`。
- Thread / Turn / Item 归属：Turn input attachment -> ContextPacket telemetry；后续 full media preview 仍需进入 Item/read model/Workbench。
- 不改变 root workspace `aster` dependency 状态，也不允许在 Aster vendor 恢复 media/context 逻辑。

退出条件：

- Workbench media preview 与 binary sidecar read 接到 current Item/read model。
- GUI media smoke 通过。
- Aster provider/reply loop 与 root `aster` dependency 仍按 Phase 6 blocker 另行收口。

### 4.15 Plugin runtime capability consumer skeleton

当前状态：

- App Center / plugin projection 已把 App Server plugin package `runtimeCapabilities` snapshot 投影成 skill / tool / MCP / workflow capability，不再由 UI 卡片反推 runtime truth。
- Workspace plugin activation metadata 已透传 `plugin_activation.runtime_capabilities` 与顶层 `plugin_runtime_capabilities`。
- App Server `runtime_backend/plugin_runtime_context.rs` 已消费 plugin activation / harness 中的 `runtimeCapabilities`，解析 `skills[].promptInjectionPolicy`、`workflowBindings[]` 与 `mcpBindings[]`。
- `agent_skills_context.rs` 已把 workflow-scoped plugin skill candidate 接入 Agent Skills selection；同名 skill 已存在于统一 Agent Skills registry / `.agents/skills` 时会注入 skill body；本地 folder plugin package skill 也可通过 `package_source_uri` 与包内 `runtimeCapabilities.skills[].path` 合入同一 `AgentSkillSnapshot` 后注入，非本地 source、绝对路径、`../` 与缺失文件 fail closed。
- `session_config.rs` 已渲染 `<plugin_runtime_capabilities>` guidance；`agent_skills_telemetry.rs` 已输出 `plugin_runtime_capabilities` runtime status。
- `runtime_backend/plugin_runtime_context.rs` 已把 `runtimeCapabilities.mcpBindings[]` 归一化为 MCP runtime target，生成 `plugin:<plugin_id>` caller 与 `mcp__server__tool` 预期工具名。
- `runtime_backend/tool_inventory.rs` 已消费 request metadata 中的 plugin MCP target，并在现有 MCP server status / tool snapshot 上追加 `plugin_mcp_targets` 投影，输出 target runtime status、`serverRunning`、`toolListRequest`、`prepareStatus`、candidate `prepareRequests` skeleton 与显式 `callProofRequest`。
- 前端 API `mcpApi.executePrepareRequests(...)` 已能顺序执行 candidate `prepareRequests`，只复用 App Server current `mcpServer/importFromApp`、`mcpServer/start` 与 `mcpTool/listForContext`；`mcpApi.executeCallProofRequests(...)` 只接受 candidate `mcpTool/callWithCaller`，要求显式 `toolName/caller/arguments`，工具返回 `is_error=true` 时 fail closed；非 candidate、未知 method、malformed params 均 fail closed，且不回退 legacy `safeInvoke`。
- MCP binding 当前已具备 runtime prepare request skeleton、API execution helper、Workspace GUI trigger / refresh skeleton、caller-scoped list proof、显式 call proof skeleton 与 default list proof skeleton；它仍不自动触发，也不把 target 可见性、candidate `prepareRequests`、显式 proof skeleton 或 list proof 误报成 runtime-complete。

判定：

- `refactor-aligned current skeleton`：App Server `runtime_backend/plugin_runtime_context.rs`、`runtime_backend/tool_inventory.rs`、前端 API `mcpApi.executePrepareRequests(...)` / `mcpApi.executeCallProofRequests(...)`、Workspace default list proof、local folder package source metadata、Agent Skills selection / package root consumer、session prompt guidance、runtime status telemetry、inventory `plugin_mcp_targets` prepare request skeleton 与显式 call proof skeleton。
- Thread / Turn / Item 归属：Turn prompt/context selection 与 Turn tool inventory prepare skeleton；API helper 只是执行 prepare candidate 的前端 gateway，后续 MCP import/start 成功、刷新 inventory 并被工具调用消费后再进入完整 Turn tool lifecycle 与 Item tool projection。
- `compat`：旧 `skillRefs` / `toolRefs` / raw manifest MCP binding 只作为 snapshot / projection 缺失 fallback。
- `deprecated`：local archive / cloud package skill root 暂时只能作为 guidance，不能伪造 skill instruction 正文；MCP GUI smoke 与自动触发仍未完成。
- `dead`：Aster vendor / App Center UI 卡片不得反推 runtime capability；MCP guidance / target skeleton / candidate `prepareRequests` / 显式 proof skeleton / list proof 不得写成 MCP runtime import 完成或 runtime-complete。

退出条件：

- `runtimeCapabilities.mcpBindings[]` 已接入 GUI 手动触发、执行后 inventory refresh、caller-scoped list proof、显式 `callProofRequest -> mcpTool/callWithCaller` skeleton 与无显式 call proof 时的 default list proof skeleton；下一步补 GUI smoke 与自动触发。
- local archive / cloud package skill 文件从 package cache / install materialization 边界进入统一 Agent Skills registry root；本地 folder package skill skeleton 已完成。
- MCP GUI smoke / 自动触发 与 plugin skill registry 有定向 runtime / contract 测试后，再把本节从 skeleton 提升为 runtime-complete。

### 4.16 Frontend runtime init API naming

当前状态：

- 前端 `src/lib/api/agentRuntime/agentClient.ts` 的公开 API 已从 `initAsterAgent()` 收敛为 `initAgentRuntime()`。
- 初始化状态类型已从 `AsterAgentStatus` 收敛为 `AgentRuntimeInitStatus`。
- `agentRuntimeAdapter.init()`、Chat runtime warmup 测试夹具和模型选择集成测试均消费 current API / mock 名称。
- 底层 Electron IPC 命令已在后续命令契约批次从 `aster_agent_init` 收敛为 `agent_init`，旧名不再是 current command boundary。

判定：

- `refactor-aligned current`：`initAgentRuntime`、`AgentRuntimeInitStatus`、`AgentRuntimeAdapter.init()`。
- Thread / Turn / Item 归属：Turn runtime warmup / provider readiness 入口；初始化结果继续驱动 GUI workspace provider/model 回填与发送链。
- `compat`：本 API 命名切片自身已无公开 Aster init API；旧 `aster_agent_init` 仅作为后续命令契约切片的 retired guard / replacement 记录。
- `dead / guarded`：前端公开 API、adapter 或测试夹具继续暴露 `initAsterAgent`、`AsterAgentStatus`、`mockInitAsterAgent`。

退出条件：

- 命令边界批次已同步 Electron IPC channel、DevBridge policy、contract tests 和前端 gateway；`aster_agent_init` 不得回到 production IPC / DevBridge truth / runtime gateway。
- `asterMigrationBoundary.test.ts` 持续禁止旧 frontend init API 命名回流。

### 4.17 Agent init command boundary naming

当前状态：

- Electron IPC / Desktop Host command current 名称是 `agent_init`。
- 前端 `initAgentRuntime()` 只通过 `agent_init` 触发 runtime warmup。
- DevBridge truth / startup timeout policy、runtime gateway catalog、runtime smoke / E2E 脚本均使用 `agent_init`。
- 旧 `aster_agent_init` 只允许出现在 `deprecatedCommandReplacements`、contract retired command set、负向 mock 清理测试或历史 evidence。

判定：

- `refactor-aligned current`：`agent_init`，归属 Turn runtime warmup / provider readiness 入口。
- Thread / Turn / Item 归属：Turn 初始化前置检查，只投影 provider/model readiness，不拥有 Thread history 或 Item projection。
- `dead / guarded`：`aster_agent_init` 作为 production IPC command、DevBridge truth command、mock priority command、runtime gateway command 或 smoke 探测命令回流。

退出条件：

- `scripts/check-command-contracts.mjs` 保持 `aster_agent_init` retired leak 检测，不再设置豁免。
- `asterMigrationBoundary.test.ts` 持续禁止 current IPC / DevBridge / runtime init scripts 恢复 `aster_agent_init`。

### 4.18 Request user input / Ask current runner

当前状态：

- Codex 有 `request_user_input` 协议事件、`UserInputAnswer` 操作与 MCP elicitation 链路，因此 Aster `AskTool` 对应能力按 Codex-first 迁移。
- `tool-runtime::request_user_input` 已承接 `request_user_input` 工具名、current `RequestUserInput*` DTO、输入 schema、parse、current surface validation 与 requested schema；response extraction / elicitation schema / result normalization 已拆到 `request_user_input/response.rs`，execution helper 已拆到 `request_user_input/execution.rs`，这是模型工具面的 current owner。
- `agent-runtime::request_user_input` 已承接 `RequestUserInputRunRequest`、`RequestUserInputAction`、`RequestUserInputGateway` 和 `run_request_user_input(...)`，负责 Turn-side prompt、requested schema、等待 gateway response 和 response normalization 调用编排，不再本地拥有 DTO/schema/helper。
- `agent-compat/src/tools/ask.rs` 已删除；`register_all_tools(...)` 不再注册 Aster `AskTool`，reply loop 在 Aster registry fallback 前直接调用 `tool-runtime::request_user_input::execute_request_user_input(...)`，且 `Agent::new()` / `Agent::with_tool_config(...)` 不再创建隐式默认 request_user_input callback。
- `agent-compat/src/lib.rs` 与 `agent-compat/src/tools/mod.rs` 不再公开 re-export `AskRequest` / `AskOption` / `AskQuestion`，也不再保留 `AskCallback` alias；`ToolRegistrationConfig` 只保存 current `RequestUserInputCallback` 过渡字段。
- `lime-agent/src/request_user_input_bridge.rs` 只保留 current `RequestUserInputCallback` adapter、current request DTO 转交、Aster action scope -> `agent_protocol::ActionRequiredScope` 映射，以及临时 `ActionRequiredManager` gateway；旧 `ask_bridge.rs` 已删除。
- `ActionRequiredManager` 已删除无 scope `request_and_wait(...)` / `submit_response(...)` convenience，只保留 scope-aware request / response / drain 入口；这对齐 Codex thread/turn/request scoped `request_user_input` / elicitation 口径。
- `request_user_input_bridge.rs` 不再直接调用 `resolve_request_prompt`、`build_requested_schema` 或 current response extractor。

判定：

- `refactor-aligned current`：`tool-runtime::request_user_input::{parse_request_user_input_tool_input, request_user_input_tool_input_schema, build_requested_schema, build_elicitation_schema, normalize_request_user_input_result, execute_request_user_input}` 与 `agent-runtime::request_user_input::{run_request_user_input, RequestUserInputGateway, RequestUserInputRunRequest}`。
- Thread / Turn / Item 归属：Turn action_required / elicitation lifecycle；GUI / App Server action response 主链继续消费用户输入。
- `compat blocker`：Aster reply loop 仍通过显式注入的 `RequestUserInputCallback` 配置字段和 `ActionRequiredManager` 触发 request_user_input；这只是 reply loop 未迁出前的 adapter。
- `dead / guarded`：恢复 `agent-compat/src/tools/ask.rs`、Aster `AskTool` registry registration、本地 DTO/schema/parse/validation/normalization owner、隐式默认 callback；`request_user_input_bridge.rs` 恢复 prompt/schema/response runner、`extract_current_ask_response` 直连，root / tools public re-export 恢复 `AskRequest` / `AskOption` / `AskQuestion`，或 `ActionRequiredManager` 恢复无 scope convenience / `ActionRequiredScope::default()` fallback。

退出条件：

- Aster `Agent::reply` / native tool registry 迁出后，删除 `request_user_input_bridge.rs` 的 callback / `ActionRequiredManager` gateway。
- `asterMigrationBoundary.test.ts` 持续要求 tool surface / definition / execution owner 存在于 `tool-runtime::request_user_input`、current runner 存在于 `agent-runtime::request_user_input` 且不含 `aster::`，并要求 Aster `AskTool` 文件与 registry 注册保持删除。
- 迁出最终阶段必须让 request_user_input 直接由 current Turn executor / App Server action_required 主链触发，不再经 Aster registry fallback。

### 4.19 Gateway-backed native dispatch surface

当前状态：

- `tool-runtime::native_dispatch` 已新增 `RuntimeNativeDispatchSurface` 与 `NativeDispatch::surfaces()`，current owner 同时返回 gateway-backed tool definition 与 lookup-only aliases。
- `lime-agent/src/native_tools/gateway_bridge.rs` 的 memory_store、image_task、tool_search、mcp_resource adapter 只消费 `dispatch.surfaces()`；Aster adapter 不再传 `TOOL_SEARCH_LOOKUP_ALIASES`，也不再按 MCP resource tool name match aliases。
- `RuntimeDefinitionToolAdapter` 仍存在，但只把 current surface 包成临时 Aster `Tool` trait object。

判定：

- `refactor-aligned current`：`tool-runtime::native_dispatch::{NativeDispatch, RuntimeNativeDispatchSurface, NativeDispatch::surfaces}`。
- Thread / Turn / Item 归属：Turn tool lifecycle / Item tool inventory；模型可见 surface 与 lookup aliases 归 current tool runtime owner。
- `compat blocker`：`gateway_bridge.rs` 的 Aster `Tool` trait wrapper 与 `RuntimeDefinitionToolAdapter` 仍是 reply loop 未迁出前的桥接。
- `dead / guarded`：gateway bridge 恢复本地 alias 常量、MCP resource `match definition.name.as_str()` 或 per-tool gateway wrapper。

退出条件：

- Aster reply loop native tool registry 迁出后删除 `RuntimeDefinitionToolAdapter` 和 `gateway_bridge.rs` 的 Aster `Tool` 包装。
- `asterMigrationBoundary.test.ts` 持续要求 gateway adapter 只消费 `NativeDispatch::surfaces()`，不重新拥有 model-visible surface / alias matrix。

### 4.20 Native tool execution outcome current owner

当前状态：

- `tool-runtime::tool_executor` 已新增 `RuntimeToolExecutionOutcome`、`RuntimeToolExecutionFailure`、`RuntimeToolExecutionFailureKind` 与 `run_runtime_tool_execution(...)`。
- `lime-agent/src/native_tools/runtime_tool_bridge.rs` 的 `execute_runtime_tool(...)` 改为消费 current outcome，再做 Aster `ToolResult` / `ToolError` 类型映射。
- `runtime_tool_bridge.rs` 不再持有 `RuntimeToolPolicyErrorKind` 分类，也不再保留 `tool_result_from_runtime(...)` / `runtime_error_to_tool_error(...)`。

判定：

- `refactor-aligned current`：`tool-runtime::tool_executor::{run_runtime_tool_execution, RuntimeToolExecutionOutcome, RuntimeToolExecutionFailureKind}`。
- Thread / Turn / Item 归属：Turn tool lifecycle 的 execution outcome materialization；Item tool output 的 success/error 文本和 metadata 仍由 current result 承接。
- `compat blocker`：`runtime_tool_bridge.rs` 仍把 current outcome 映射回 Aster `ToolResult` / `ToolError`，这是 Aster reply loop 未迁出前的 adapter。
- `dead / guarded`：在 Aster bridge 里恢复 policy error 分类、直接消费 `RuntimeToolExecutionError` / `RuntimeToolExecutionResult`，或恢复 `tool_result_from_runtime(...)` / `runtime_error_to_tool_error(...)`。

退出条件：

- current Turn executor 直接消费 `RuntimeToolExecutionOutcome` 后，删除 `runtime_tool_bridge.rs` 的 Aster outcome 映射和 `Tool` trait wrapper。
- `asterMigrationBoundary.test.ts` 持续要求 execution outcome owner 不依赖 Aster，bridge 只做类型映射。

### 4.21 Skill access gate current owner

当前状态：

- `tool-runtime::skill_gate` 已新增 `SkillToolAccessError`、`check_skill_tool_access(...)` 与 `workspace_skill_source_for_invocation_params(...)`。
- `lime-agent/src/tools/skill_tool_gate.rs` 不再直接判断 session enabled / allowlist / workspace skill source lookup；native hook path 只调用 current access gate，并把 current error 转成 MCP `ErrorData`，不再转换成 Aster `ToolError` / `PermissionCheckResult`。
- `tool-runtime::skill_execute` 已承接 Skill execution envelope、session access gate、workspace skill source lookup、runtime contract preflight、调用参数规范化和 result metadata 合并。
- `lime-skills::run` 已承接 prompt / workflow Skill runner；`tool-runtime::skill_execute::RuntimeSkillDefinitionBackend` 通过 `find_skill_by_name(...)` + `SkillRunner::new(...)` 执行 current Skill definition。
- `lime-skills::skill_loader` 已承接 current Skill registered-directory lookup，`register_skill_directory(...)` / `register_project_skill_directory(...)` / `is_registered_skill(...)` 负责 workspace `project:<directory>` Skill 的运行时注册；`find_skill_by_name(...)` 优先解析 current registry，再回落标准 Skills 根目录。
- `lime-agent/src/runtime_state_support.rs` 只作为 App Server / Aster reply loop 删除前的 host adapter 调用 `lime-skills` registry；生产段不再写 Aster `global_registry`，App Server `skill_runtime_enable` 通过 `register_project_skill_from_directory(...)` 真实消费该 current registry。
- `LimeSkillTool` Aster `Tool` trait wrapper 与最终 Aster `ToolResult` 类型转换已删除；`skill_tool_gate.rs` 只保留当前 turn provider bridge 和 current execution hook。runtime contract / workspace source metadata shape 已归属 `tool-runtime::skill_result`，execution envelope 已归属 `tool-runtime::skill_execute`。

判定：

- `refactor-aligned current`：`tool-runtime::skill_gate::{check_skill_tool_access, SkillToolAccessError, workspace_skill_source_for_invocation_params}`。
- `refactor-aligned current`：`lime-skills::run::{SkillRunner, SkillRunResult, requires_turn_runtime, interpolate_variables}`，归属 Turn Skill prompt/workflow execution backend。
- `refactor-aligned current`：`lime-skills::skill_loader::{register_skill_directory, register_project_skill_directory, is_registered_skill, find_skill_by_name}`，归属 Turn Skill invocation definition lookup / runtime enable preparation。
- Thread / Turn / Item 归属：Turn tool lifecycle 的 Skill invocation access gate；workspace skill source metadata 是 Item tool output metadata 的 source fact。
- `compat blocker`：`lime-agent/src/tools/skill_tool_gate.rs::CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call。
- `compat adapter`：`lime-agent/src/runtime_state_support.rs` 只允许调用 current Skill registry 与 Aster reply loop 初始化接线；Aster reply loop 删除后，应把 App Server Skill runtime enable 直接接到 current owner，不再经 `lime-agent`。
- `dead / guarded`：恢复 `LimeSkillTool` Aster `Tool` trait wrapper、wrapper 内 direct session enabled / allowlist / workspace source 判断，重新维护第二份 Skill gate store，或恢复 Aster Skills `global_registry` 作为 Lime Skill lookup truth。

退出条件：

- provider/reply loop 迁出后删除 Aster provider bridge。
- `asterMigrationBoundary.test.ts` 持续要求 Skill access gate / execution owner 不含 Aster，并禁止恢复 `LimeSkillTool` / Aster `Tool` trait 临时映射。

### 4.22 Reply source dispatch current owner

当前状态：

- `agent-runtime::reply_backend` 已新增 `RuntimeReplySourceExecutor<M, C>` 与 `RuntimeReplySourceCall::run_with(...)`。
- default/provider reply source path 的分派由 `agent-runtime` current owner 执行，`lime-agent/src/request_tool_policy/provider_reply_exit_source.rs` 的 `ReplyExitSource` 不再 match `RuntimeReplySourceCall::Default` / `Provider`。
- Aster adapter 只保留两层临时边界：`ReplyExitSource` 只委托 current source call，`ReplyExitSourceExecutor` 在 default path 只显式取 provider 并调用 `agent-runtime::reply_backend::run_default_provider_source_backend(...)`；provider path 只委托 `agent-runtime::reply_backend::run_provider_source_backend(...)` 并提供短生命周期 compat source factory。Aster DTO lowering 与 `Agent::reply_with_provider(...)` 最后一跳只允许留在 `provider_reply_exit_source.rs::ProviderReplyExitSource` / 私有 `run_provider_reply_exit_source(...)` 退场模块。
- 2026-07-09 approval Gate B 复验期间补齐 `RuntimeReplySourceCall::run_with(...)` 的 `M: Send` / `C: Send` 泛型边界；该方法返回 `BoxFuture`，async block 会持有 call payload 跨 await，边界收紧与既有 Send future contract 一致。
- `agent-runtime::reply_backend` 已新增 `RuntimeReplyProviderSourceBindingError` 与 `RuntimeReplyProviderCall::required_provider(...)`，承接 provider source path 必须绑定 configured provider 的 fail-closed 规则；缺 provider 时生成包含 session/provider/model 的 current error。
- `agent-runtime::reply_backend::run_provider_source_backend(...)` 已承接 provider source path 的 configured provider binding、source request materialization 与 `RuntimeReplyProviderSourceRequest::into_backend_call(...)` backend call materialization；缺 provider 时仍由 current `RuntimeReplyProviderSourceBindingError` fail closed。
- `request_tool_policy/provider_reply_exit_source.rs::ReplyExitSourceExecutor` 不再用本地 `expect("provider run path requires configured provider")` 表达 provider path 规则，也不再本地调用 `required_provider(...)` / `into_source_request(...)` / `RuntimeReplyProviderSourceBackendCall::new(...)`；provider path 只调用 current helper。
- `agent-runtime::reply_backend::run_default_provider_source_backend(...)` 已承接 default source path 的 source request materialization 与 `RuntimeReplyProviderSourceRequest::into_backend_call(...)` backend call materialization；`ReplyExitSourceExecutor::run_default(...)` 不再本地调用 `lower_aster_reply_message(...)`、`to_aster_session_config(...)` 或 `Agent::reply_with_provider(...)`。
- `agent-runtime::reply_backend` 已新增 `RuntimeReplyProviderSourceRequest<M, C>` 与 `RuntimeReplyProviderCall::into_source_request(...)`，承接 provider source backend 执行前的 message / session config / cancel token request payload materialization；credential bridge 不再直接拆 `RuntimeReplyProviderCall` 的 provider start / payload 四元组。
- `request_tool_policy/provider_reply_exit_source.rs::ReplyExitSourceExecutor` 直接消费 current `RuntimeReplyProviderCall<RuntimeReplyMessage, AgentSessionConfig>`，但只把 call 交给 `run_provider_source_backend(...)`；provider path 不再 materialize mapped Aster call，也不再持有 provider trace / binding / source request 规则。
- `credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider` 已退回 provider binding factory：只保留 current `RuntimeReplyProviderBinding<CompatAsterReplyProviderBackend>`、provider capability projection 与 `into_compat_provider()` 临时出口；不再 import Aster `Agent` / `AgentEvent`，不再实现 provider source backend，也不再调用 Aster `Agent::reply_with_provider(...)`。
- `model-provider::provider_stream::RuntimeReplyProviderExecutionSource<R>` 已承接 provider source backend trait implementation；`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 只保留 Turn execution payload materialization；`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 退化为 `RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` type alias，不再本地实现 `RuntimeReplyProviderSourceBackend`。
- `request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitRunner` 承接唯一剩余 Aster provider runner implementation；default / provider path 都只通过 current helper 交接 `RuntimeReplyProviderSourceBackendRequest` / `RuntimeReplyProviderSourceRunCall`，Aster `Agent` host 与 `Agent::reply_with_provider(...)` 被限制在私有 `run_provider_reply_exit_source(...)` 内。`aster_reply_backend_adapter.rs` 不再定义 provider source backend impl，也不再 import Aster provider trait。
- `agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 已承接 `RuntimeReplyProviderSourceRunCall` 的 current execution input materialization；`run_provider_reply_exit_source(...)` 只消费 `RuntimeReplyProviderSourceExecution` 并通过 `execution.into_parts()` 取 `RuntimeReplyMessage`、`RuntimeReplyStreamRequest`、`AgentSessionConfig` 与 cancel token，不再直接拆 backend call。

判定：

- `refactor-aligned current`：`agent-runtime::reply_backend::{RuntimeReplySourceExecutor, RuntimeReplySourceCall::run_with}`。
- `refactor-aligned current`：`agent-runtime::reply_backend::{RuntimeReplyProviderSourceBindingError, RuntimeReplyProviderCall::required_provider, run_provider_source_backend}`，归属 Turn provider source binding fail-closed contract。
- `refactor-aligned current`：`agent-runtime::reply_backend::{RuntimeReplyProviderSourceRequest, RuntimeReplyProviderSourceBackendRequest, RuntimeReplyProviderSourceRunCall, RuntimeReplyProviderSourceExecution, RuntimeReplyProviderCall::into_source_request, RuntimeReplyProviderSourceRequest::into_backend_call, run_provider_source_backend}`，归属 Turn provider source request / execution payload materialization 与 backend call handoff contract；`model-provider::provider_stream::{RuntimeReplyProviderExecutionRunner, RuntimeReplyProviderExecutionSource, run_provider_source_execution}` 归属 provider source backend wrapper contract。
- `refactor-aligned current`：`agent-runtime::reply_backend::{RuntimeReplyDefaultCall::into_source_request, RuntimeReplyProviderSourceRequest::into_backend_call, run_default_provider_source_backend}`，归属 Turn default source request payload materialization 与 backend call handoff contract；default path 同样携带 current `RuntimeReplyStreamRequest`。
- `refactor-aligned current`：`RuntimeReplyStream<RuntimeAgentEvent>` 作为 provider reply backend 输出形状，归属 Turn source backend stream output contract；Aster `AgentEvent` stream 不再作为 `ReplyExitSource` / `ProviderReplyExitSource` 对外输出。
- Thread / Turn / Item 归属：Turn reply source execution path selection；Provider stream 与 reply backend start 仍归 Turn runtime owner，Item 投影仍由后续 stream projector 处理。
- `compat blocker`：私有 `run_provider_reply_exit_source(...)` 仍最终调用 Aster `Agent::reply_with_provider(...)`，provider trait execution 尚未迁出；这是删除点，不是 refactor v1 current backend。
- `dead / guarded`：`ReplyExitSource` 或 `start_aster_reply_stream(...)` 恢复 default/provider match、Aster `AgentEvent` stream 对外输出、direct `.reply(...)`、direct `.stream_reply_with_agent(...)`，把 provider wire support / session metadata preparation 规则写回 Aster adapter，在 `ReplyExitSourceExecutor` 恢复 direct `.reply(...)`、direct `.reply_with_provider(...)`、provider path 本地 `expect` / panic、mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`、本地 `required_provider(...)` / `into_source_request(...)` / `RuntimeReplyProviderSourceBackendCall::new(...)`，或在 credential bridge 恢复 `ConfiguredReplyProviderSource`、`into_reply_source(agent)`、`ConfiguredReplyProvider::stream_reply_with_agent(...)`、`RuntimeReplyProviderCall`、`provider_call.trace()`、`provider_call.into_source_request()`、`provider_call.into_parts()` 直接拆 provider start / payload 四元组。

退出条件：

- Aster `Agent::reply` / provider trait loop 迁出后，删除 `ReplyExitSourceExecutor`、Aster `Message` lowering 和 `project_aster_reply_stream(...)`。
- current Turn executor 直接消费 current provider stream / tool lifecycle 后，root workspace `aster` dependency 才能进入删除检查。
- `asterMigrationBoundary.test.ts` 持续要求 reply source path ownership、provider source binding、source request alias 和 backend call materialization 留在 `agent-runtime`，Aster adapter 只保留显式 compat executor，credential bridge 只能保存 provider binding。

验证记录：

- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent` 通过。
- `validated`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture` 通过，`19 passed`；覆盖 `RuntimeReplyProviderSourceExecution` 与 provider source request / stream request materialization。
- `validated`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture` 通过，`68 passed`；验证 compat adapter 消费 current source execution 后仍能驱动现有 request policy 主链。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent-runtime/src/reply_backend/tests.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。

### 4.23 Skill result metadata current owner

当前状态：

- `tool-runtime::skill_result` 已新增 `SkillPreflightFailureProjection`、`skill_preflight_failure_projection(...)`、`skill_runtime_contract_metadata_map(...)` 与 `workspace_skill_source_metadata_map(...)`。
- `lime-agent/src/tools/skill_tool_gate.rs` 不再持有 Skill-specific result JSON shape，不再本地维护 `build_runtime_preflight_error_result(...)`、`workspace_skill_source_metadata_value(...)` 或 runtime/source metadata attach helper；只把 current metadata map 写入临时 Aster `ToolResult`。

判定：

- `refactor-aligned current`：`tool-runtime::skill_result`，归属 Turn tool lifecycle / Item tool output metadata projection。
- Thread / Turn / Item 归属：Turn 执行前 preflight 与 Skill invocation source fact 进入 Item tool output metadata。
- `compat blocker`：`skill_tool_gate.rs` 内 Aster provider bridge。
- `dead / guarded`：恢复 `LimeSkillTool` Aster `Tool` trait wrapper、generic `ToolResult::with_metadata(...)` 类型转换、Skill result JSON shape、runtime preflight metadata、workspace source metadata 或 Skill-specific attach helper。

退出条件：

- `LimeSkillTool` / Aster `SkillTool` wrapper 和 generic `ToolResult` attach 已删除，后续不得恢复。
- `asterMigrationBoundary.test.ts` 持续要求 Skill result metadata owner 不依赖 Aster，且 `skill_tool_gate.rs` 不再做 Aster result 类型映射。

### 4.24 Skill execution envelope current owner

当前状态：

- `tool-runtime::skill_execute` 已新增 `RuntimeSkillExecutionRequest`、`RuntimeSkillBackendRequest`、`RuntimeSkillExecutionResult`、`RuntimeSkillExecutionError`、`RuntimeSkillExecutionBackend` 与 `run_skill_execution(...)`。
- `run_skill_execution(...)` 统一执行 Skill session access gate、runtime contract preflight、参数规范化、backend 调用、runtime contract metadata 与 workspace skill source metadata 合并；该 owner 不依赖 Aster，也不返回 Aster `ToolResult`。
- `tool-runtime::skill_execute` 已新增 `RuntimeSkillDefinitionBackend`，把 Skill definition lookup、prompt/workflow runner handoff 与 `SkillRunResult` metadata 投影纳入 current owner。
- `lime-agent/src/tools/skill_tool_gate.rs` 不再实现 Aster `SkillTool` backend adapter 或 Aster `Tool` trait wrapper；它只把 current turn provider 暂时桥接成 `lime-skills::LlmProvider`，调用 `RuntimeSkillDefinitionBackend`，最终通过 `tool-runtime::tool_result_projection` 投影成 MCP `CallToolResult`。
- `lime-agent/src/tools/skill_tool_gate.rs::execute_current_skill_tool_request(...)` 不再接收 Aster `NativeToolExecutionRequest`，也不再返回 Aster `ToolCallResult`；Aster live execution hook request/result 类型只允许停留在 `live_execution_process.rs` adapter，Skill gate helper 只返回 current rmcp `CallToolResult` future。

判定：

- `refactor-aligned current`：`tool-runtime::skill_execute`，归属 Turn tool lifecycle / Skill invocation execution envelope。
- `refactor-aligned current`：`lime-skills::run`，归属 Turn prompt/workflow Skill execution backend。
- Thread / Turn / Item 归属：Turn 负责执行 envelope 与 backend handoff；Item metadata projection 仍由 `tool-runtime::skill_result` 负责。
- `compat blocker`：`CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call；Aster live hook request/result 类型已收回 live execution process adapter。
- `dead / guarded`：恢复 `LimeSkillTool` Aster `Tool` trait wrapper、Aster `SkillTool` backend、wrapper 内 runtime contract lookup、preflight failure projection、参数规范化、workspace source metadata 合并、Skill result JSON shape 或 Aster `ToolResult` 类型转换。

退出条件：

- `LimeSkillTool` wrapper 已删除；后续继续清理通用 Aster `ToolRegistry` / `Tool` trait 注册壳。`agent` / `allowed_tools` Skill 的执行必须进入 Turn runtime owner，不得恢复 Aster 子 Agent。
- `asterMigrationBoundary.test.ts` 持续要求 Skill execution envelope owner 不依赖 Aster，并禁止恢复 wrapper 生产段的 provider/result 类型映射。
- `asterMigrationBoundary.test.ts` 持续要求 `NativeToolExecutionHook` / `NativeToolExecutionRequest` / Aster `ToolCallResult` 只出现在 `live_execution_process.rs` adapter。

验证记录：

- `CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-skills run --lib -j 2` 通过，`5 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_execute --lib -j 2` 通过，`4 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool_gate --lib -j 1 -- --nocapture` 通过，`10 passed`。
- `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- live hook 类型边界收口后，`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`175 passed`。

### 4.24.1 Vendored SkillTool backend deletion

当前状态：

- Codex 对照：Codex 有 `core-skills` loader / metadata / render / injection 主链，但没有 Aster 式 vendored `SkillTool` execution backend、全局 Skill registry 作为 tool runtime truth，或 default tool registration。
- `lime-rs/vendor/aster-rust/crates/aster/src/skills/tool.rs` 已物理删除，`skills/mod.rs` 不再导出 `tool` module。
- `tools/mod.rs` 不再 re-export `crate::skills::SkillTool`，也不再通过 `config.allows_tool("Skill")` 注册 `SkillTool::new()`。
- `tools/registry.rs` 的 default alias matrix 不再包含 `("Skill", &["SkillTool"])`；vendored Aster 不再提供 `SkillTool` lookup alias。

判定：

- `refactor-aligned current`：`lime-skills::run`、`lime-skills::skill_loader` 与 `tool-runtime::{skill_execute, skill_gate, skill_result, skill_runtime_contract}`。
- Thread / Turn / Item 归属：Turn Skill invocation definition lookup、prompt/workflow execution、access gate 与 result metadata materialization；Item 只消费 current result metadata。
- `compat blocker`：`CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call。
- `dead / deleted / forbidden-to-restore`：`LimeSkillTool` Aster `Tool` trait wrapper、vendored Aster `SkillTool` backend、Aster default registration、Aster SkillTool alias matrix，以及 Aster Skills `global_registry` 作为 Lime Skill lookup truth。

退出条件：

- `LimeSkillTool` wrapper 已删除；provider/reply loop 迁出后删除 Aster provider bridge。
- `asterMigrationBoundary.test.ts` 必须持续要求 `skills/tool.rs` 不存在，并禁止 vendor `skills/mod.rs` / `tools/mod.rs` / `tools/registry.rs` 恢复 `SkillTool` backend、默认注册或 alias matrix。

验证记录：

- `CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools --lib -j 2` 通过，`4 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。

### 4.24.1.1 Aster skills registry / loadSkill extension deletion

当前状态：

- Codex 对照：Codex 有 Skills 发现 / metadata / render / injection 和 MCP skill 工具面，但不采用 Aster 式全局 skills registry 作为 runtime truth，也没有 `loadSkill` platform extension 通过 Aster extension manager 暴露。
- Lime current owner 已是 `lime-skills::skill_loader` / `run`、`tool-runtime::{skill_execute,skill_gate,skill_result,skill_runtime_contract}`、App Server skill data source 与 GUI runtime enable 链路。
- `agent-compat/src/skills/**` 与 `agent-compat/src/agents/skills_extension.rs` 已删除，`agent-compat/src/lib.rs`、`agents/mod.rs`、`agents/extension.rs` 不再导出或注册 `skills` / `skills_extension` / `loadSkill`。

判定：

- `refactor-aligned current`：`lime-skills` + `tool-runtime` + App Server skill data source。
- Thread / Turn / Item 归属：Turn 负责 Skill invocation / execution envelope，Item 只消费 current result metadata；Thread 不再通过 Aster global registry 表达 Skill lookup truth。
- `compat blocker`：`CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call，等待 R2/R3 provider backend 迁出。
- `dead / deleted / forbidden-to-restore`：Aster skills registry / loader / executor / workflow helper、`loadSkill` platform extension 和 `LimeSkillTool` Aster `Tool` trait wrapper。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `agent-compat/src/skills` 和 `agents/skills_extension.rs` 不存在，并禁止恢复 `pub mod skills`、`skills_extension` 或 `loadSkill` 注册。
- `LimeSkillTool` Aster `Tool` trait wrapper 已删除；后续 Skill 能力只通过 current owner 进入 runtime / App Server / GUI。

验证记录：

- 待本刀验证后回填。

### 4.24.2 Aster-only plan mode tool deletion

当前状态：

- Codex 对照：Codex current 只有 `update_plan` 作为模型可调用 checklist tool；Plan mode 是 Turn/session runtime state、stream parser 和 TUI / GUI interaction policy，不是 `EnterPlanModeTool` / `ExitPlanModeTool` 这类工具 API。
- `tool-runtime::update_plan` 已作为 current owner 承接 checklist DTO、schema、校验和 executor；App Server `plan.final` event 与前端计划轨已经消费 `source=update_plan`。
- 本刀删除 vendored `tools/plan_mode_tool.rs`，并移除 Aster default registration、registry alias、Lime catalog / allowlist / discovery profile 与前端正向展示。Inputbar plan mode 文案保留，因为它属于 current 协作模式入口，不是 Aster 工具。

判定：

- `refactor-aligned current`：`tool-runtime::update_plan`，归属 Turn checklist / plan update tool lifecycle；Item 只消费 current plan update projection。
- `refactor-aligned current`：Inputbar 协作模式元数据，归属 Turn request context / interaction mode，不是模型工具。
- Thread / Turn / Item 归属：Turn 决定 plan/collaboration mode；Item 展示 `update_plan` 结构化 plan state；Thread 不保存 Aster `SavedPlan` 或 Enter/Exit 工具状态作为 current read model。
- `dead / deleted / forbidden-to-restore`：Aster `EnterPlanModeTool` / `ExitPlanModeTool` backend、default registration、alias matrix、Lime catalog / allowlist / discovery 正向 surface、frontend normalization / display / process summary / harness signal / locale copy。
- `compat blocker`：仍未迁出的 Aster reply loop `ToolRegistry` / `Tool` trait 执行壳本身；本刀没有新增 plan-mode compat。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `plan_mode_tool.rs` 不存在，并禁止 `EnterPlanMode` / `ExitPlanMode` 回到 vendor、catalog、allowlist、frontend display 或 locale copy。
- 后续如继续做 Plan mode，应落 Turn runtime / request context owner，并以 Codex plan mode 语义接入 App Server / GUI；不得恢复 Aster 工具 API。

验证记录：

- `cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime --package lime-core -- --check` 通过。
- `CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools --lib -j 2` 通过，`4 passed`。
- `CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`11 passed`。
- `CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-aster-planmode-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 在临时 target 写满前已通过，`20 passed`。
- `npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/projection/threadItemProjection.test.ts" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`6 files / 205 tests passed`。

### 4.24.3 Aster-only SendUserMessage tool deletion

当前状态：

- Codex 对照：Codex current 没有 Aster 式 `SendUserMessage` / `BriefTool` 模型可调用工具。用户发起消息是 Turn input / Thread message；模型需要向用户提问时使用 `request_user_input`。
- `tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 本来已不包含 `SendUserMessage`，但 `lime-agent` catalog 和前端 display 仍把它当 current，形成“GUI 可见但生产不可执行”的假入口。
- 本刀删除 vendored `tools/send_user_message_tool.rs`、default registration 和 `BriefTool` alias，并删除 Rust catalog、workspace allow、前端 normalization/display/summary/i18n 正向展示；前端正向测试和 vendored subagent hidden-list 测试也不再用已删除工具名做样本。

判定：

- `refactor-aligned current`：Turn input message、Thread message persistence、Item message projection，以及 Codex-style `request_user_input` tool。
- Thread / Turn / Item 归属：Turn 接收用户输入或 request_user_input response；Thread 保存会话消息；Item 只展示 message/action_required/request_user_input read model，不再把 Aster `SendUserMessage` tool call 当用户消息同步事件。
- `dead / deleted / forbidden-to-restore`：vendored Aster `SendUserMessageTool` backend、`BriefTool` alias、Lime `SendUserMessage` catalog entry、workspace default allow、frontend normalization/display/process summary/tool label/group copy。
- `compat blocker`：Aster reply loop `ToolRegistry` / `Tool` trait 执行壳仍存在，但不再承载 `SendUserMessage`。

退出条件：

- `asterMigrationBoundary.test.ts` 必须持续要求 `send_user_message_tool.rs` 不存在，并禁止 vendor `tools/mod.rs` / `tools/registry.rs` / `agents/agent.rs`、`lime-agent` catalog、frontend normalization/display/summary 及其正向测试恢复 `SendUserMessage` / `BriefTool` surface。
- 后续若需要模型向用户同步状态，只能通过 current runtime event / message projection 或 `request_user_input`，不得恢复 Aster `SendUserMessage` tool。

验证记录：

- `cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `npx prettier --check ...` 覆盖本刀 TS / JSON / guard 文件通过。
- `npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/ToolCallDisplay.toolSearchActions.test.tsx" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`4 files / 162 tests passed`。
- `rg -n "SendUserMessage|BriefTool|sendusermessage|brieftool|send_user_message_tool|SEND_USER_MESSAGE_TOOL_NAME|toolCall\\.processSummary\\.userMessage|toolCall\\.label\\.userMessage|toolCall\\.groupTitle\\.userMessage" "src" "lime-rs/crates" "lime-rs/vendor/aster-rust/crates/aster/src" -g '*.rs' -g '*.ts' -g '*.tsx' -g '*.json'` 只剩负向断言命中。
- `interrupted`：vendored Aster `test_register` Rust 测试使用独立 target 冷编译约 20 分钟仍未进入测试阶段；共享 target 同时被并行 App Server Cargo 进程占用，本轮中断该验证，未计为通过。

### 4.24.4 Aster-only AnalyzeImageTool deletion

当前状态：

- Codex 对照：Codex current 没有 Aster 式 `analyze_image` 模型可调用工具。图片输入属于 Turn input image / local image preparation；模型查看本地图片使用 `view_image`；图片生成走 image generation item。
- Lime current 的 `analyze_image_input` 是 tool execution restriction profile，只控制权限 / policy，不是模型工具、catalog entry 或 GUI tool display surface。
- 本刀删除 vendored `tools/analyze_image.rs` 和 `tools/mod.rs` 私有 module；删除前端 `analyzeimage` exact display、subject extraction、vision analyze process summary/i18n 文案和正向测试。

判定：

- `refactor-aligned current`：Turn input image / local image preparation、`tool-runtime::view_image`、Item image projection，以及 `analyze_image_input` policy profile。
- Thread / Turn / Item 归属：Turn 接收图片输入或执行 `view_image`；Item 展示 image/view_image projection；`analyze_image_input` 仅属于 Turn policy，不产生独立 Item 工具展示。
- `dead / deleted / forbidden-to-restore`：vendored Aster `AnalyzeImageTool` backend、private `mod analyze_image`、frontend `imageAnalyze` / `visionAnalyze` display/process summary/i18n surface。
- `compat blocker`：Aster reply loop `ToolRegistry` / `Tool` trait 执行壳仍存在，但不再承载 `AnalyzeImageTool`。

退出条件：

- `asterMigrationBoundary.test.ts` 必须持续要求 `analyze_image.rs` 不存在，并禁止 vendor module、vendor agent hidden-list、frontend display config/copy/summary/subject/test 和 locale 文案恢复 `AnalyzeImageTool` / `analyze_image` / `imageAnalyze` / `visionAnalyze` surface。
- `analyze_image_input` policy profile 保留为 current 权限配置；后续若要改名，应按 config schema / App Server / frontend settings 成组迁移，不能因为删除 Aster 工具误删该 profile。

验证记录：

- `validated`：五语言 `agentRuntime.json` / `agentMessageList.json` JSON parse 通过。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check ...` 覆盖本刀 TS / JSON / guard / roadmap 文件通过。
- `validated`：`npx vitest run "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`3 files / 180 tests passed`。
- `validated`：残留扫描 `analyze_image|AnalyzeImage|analyzeimage|imageAnalyze|visionAnalyze|toolCall\\.processSummary\\.vision\\.analyze|图像分析|圖片分析|Image analysis|画像分析|이미지 분석` 只剩 `analyze_image_input` current policy profile、governance forbidden-to-restore guard 和 legacy evidence 文本命中。

### 4.24.5 Aster Write/Edit vendor deletion

当前状态：

- Codex 有文件写入 / 编辑能力：模型侧 current 文件修改入口是 `apply_patch`，App Server / exec-server 另有受控 `write_file` / `fs_write_file` 文件系统 API；Aster `WriteTool` / `EditTool` 不进入 refactor v1 Turn tool lifecycle。
- Lime current 已由 `tool-runtime::apply_patch`、catalog / execution policy、GUI summary、prompt guidance 和 Artifact / workspace 写入投影链承接文件修改能力；Aster `Write/Edit` 之前只剩 production-disabled vendor 残留。
- 本刀删除 vendored `tools/file/write.rs` / `tools/file/edit.rs`，并同步清理 default registration、alias matrix、reply surface 白名单、subagent allowlist、Lime catalog、execution policy 和 `lime-core::tool_calling` discovery profiles。

判定：

- `refactor-aligned current`：`tool-runtime::apply_patch` 与 `apply_patch` Item tool output projection；Host / App Server 受控 FS 写入 API 保留在对应边界，不回填为 Aster tool。
- Thread / Turn / Item 归属：Turn 执行 patch；Item 展示 patch diff / metadata；Thread 只记录最终消息 / tool item，不承接 Aster read-before-write 状态。
- `dead / deleted / forbidden-to-restore`：vendored Aster `WriteTool` / `EditTool` backend、`FileWriteTool` / `FileEditTool` alias、`write_file` / `edit_file` / `create_file` reference alias、reply surface、Lime catalog fake current entry 和 `tool_search` discovery fake profile。
- `compat blocker`：Aster reply loop `ToolRegistry` / `Tool` trait 执行壳仍存在，但不再承载 Aster Write/Edit。

退出条件：

- `asterMigrationBoundary.test.ts` 必须持续要求 `tools/file/write.rs` / `tools/file/edit.rs` 不存在，并禁止 vendor tools、reply_parts、agent subagent allowlist、hooks、Lime catalog、execution policy 与 `lime-core::tool_calling` 恢复 Aster Write/Edit surface。
- 若未来需要新模型侧文件修改能力，只能扩展 `apply_patch` 或 Codex-style current tool owner；若需要 host/App Server 直接写文件，走受控 FS API / Artifact 写入链；不能恢复 Aster Write/Edit。

验证记录：

- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`143 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 通过，`21 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution --lib -j 2` 通过，`33 passed`。

### 4.24.6 Agent-compat Aster-only config CLI / manager deletion

当前状态：

- `agent-compat/src/config/{agents_md_parser,config_command,config_manager,experiments,watcher}.rs` 只服务 Aster `/config` CLI、多源 config manager、AGENTS.md config watcher、experiments 和 atomic watcher validator。
- 这些 surface 没有 Lime App Server / frontend / Evidence / current owner 真实消费链；`config_manager.rs` 单文件已超过 1000 行，继续保留会让 `agent-compat` 变成第二套配置系统。
- 本刀删除上述 5 个文件，并从 `config/mod.rs` 移除 public module / re-export；`AsterMode`、`PermissionManager`、`DeclarativeProviderConfig` 仍作为生产引用的最小 blocker 保留。

判定：

- `dead / deleted / forbidden-to-restore`：Aster `/config` CLI、多源 config manager、AGENTS.md config watcher、experiments manager 和 atomic watcher validator。
- `compat blocker`：仍被 `lime-agent` provider/reply/config 路径生产引用的 `AsterMode`、`PermissionManager`、`DeclarativeProviderConfig` 等最小 config 面。
- Thread / Turn / Item 归属：本批不进入 Thread / Turn / Item current owner；后续配置能力如有产品需求，只能按 provider/settings/App Server current 主链设计。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求上述 5 个文件不存在，并禁止 `config/mod.rs` / README 恢复 `ConfigCommand`、`ConfigManagerOptions`、`ExperimentManager`、`AtomicConfigUpdate` 等旧 public surface。
- 后续若需要 AGENTS.md / system prompt 处理，必须走 Codex-first prompt/context owner；不得恢复 Aster config watcher。

验证记录：

- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check ...` 覆盖本刀 guard / roadmap / config README 文件通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`143 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-config-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过；共享 target 首次验证因并行 Cargo build directory lock 等待超过 60 秒中断，未计为失败。

### 4.24.7 Agent-compat unused context framework deletion

当前状态：

- `agent-compat/src/context/{agents_md_parser,cache_controller,compressor,file_mention,manager,priority_sorter,summarizer,window_manager}.rs` 没有 Lime App Server / frontend / Evidence / runtime current 消费链，也没有 `lime-agent` 生产 `use aster::context::*` 命中。
- Codex 有 AGENTS.md / context 事实源，但对应实现是 `core/src/agents_md.rs`、session step context、Thread/Turn context materialization，不是 Aster 的 `AgentsMdParser`、`EnhancedContextManager`、`MessageCompressor`、`CacheController`、`ContextWindowManager` public API。
- 本刀删除上述 8 个文件；后续两刀已继续删除 Aster-only `ContextService` / `ContextUri`，以及 Aster context `tool_io` / pruning / token estimator duplicate。2026-07-10 继续删除 `agent-compat/src/context/**` root public surface，`ContextTraceStep` 的 current DTO 已迁到 `agent-protocol::context_trace`。
- `context/types.rs` 已物理删除；`AgentsMdConfig`、`ContextConfig`、`ConversationTurn`、`Cache*`、`Compression*`、`FileMentionResult`、`ContextWindowStats`、`PruningConfig`、`PruningLevel` 等只服务已删 helper 的 DTO 均不再留在 `agent-compat`。

判定：

- `dead / deleted / forbidden-to-restore`：Aster unused context framework helper。
- `compat blocker`：Aster `AgentEvent::ContextTrace` 在 R2/R6 未迁完前仍携带 `aster::agents::ContextTraceStep` 最小字段类型。
- `refactor-aligned current`：`agent-protocol::context_trace::ContextTraceStep` 服务 Lime runtime event / App Server / frontend context trace projection。
- `refactor-aligned current`：`tool-runtime::tool_io` 服务 Turn tool lifecycle / Item tool output projection；Aster context duplicate 不再保留。
- Thread / Turn / Item 归属：保留 surface 归 Turn event materialization；被删除 helper 不进入 refactor v1 owner。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `agent-compat/src/context/**` 不存在，root `pub mod context;`、`crate::context::ContextTraceStep` 与外部 `aster::context::ContextTraceStep` 不得恢复，并禁止旧 context framework DTO 留在 `agent-compat` root context 下。
- 后续如需要 AGENTS.md / context hydrate，只能按 Codex-first prompt/context owner 进入 Lime current 主链，不得恢复 Aster `AgentsMdParser` / `EnhancedContextManager`。
- Aster reply loop / event source 迁出后，删除 `aster::agents::ContextTraceStep` compat 字段类型；current 侧继续只保留 `agent-protocol::context_trace`。

验证记录：

- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过；保留既有 `reqwest default-features` workspace warning。

### 4.24.7A Agent-compat inline test deletion

当前状态：

- `agent-compat/src` 下 88 个 `#[cfg(test)] mod tests` 内联正向测试模块已批量删除；这些测试只证明 Aster staging 行为，不能作为 refactor v1 current owner 的验收证据。
- 少量 `#[cfg(test)]` helper/import 暂留在生产文件中，但不会进入生产编译；后续随对应 compat 文件删除。

判定：

- `dead / deleted / forbidden-to-restore`：Aster compat staging crate 内联正向测试面。
- `refactor-aligned current`：必要回归必须迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 或 App Server owner tests。
- `compat blocker`：生产 reply/provider/tool/session/event source 文件仍需继续迁出，不因测试删除而完成。

退出条件：

- `asterMigrationBoundary.test.ts` 持续禁止 `agent-compat/src` 恢复 inline `#[cfg(test)] mod tests {`，并继续禁止 `agent-compat/tests/**` 和源码独立测试文件回流。

### 4.24.8 Agent-compat context service / URI deletion

当前状态：

- Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 没有 Aster `ContextService`、`ContextUri`、`ContextNamespace` 或 `aster://` context storage API。Codex context 能力归属 AGENTS.md、Thread / Turn context materialization 和 current read model，不采用这套 Aster URI-backed service。
- 本刀删除 `agent-compat/src/context/context_service.rs` 与 `context_uri.rs`，当时把仍需的 `ContextTraceStep` 移到 `context/trace.rs`；2026-07-10 已继续删除 root context 目录，并把 current DTO 固定到 `agent-protocol::context_trace`。
- `context/mod.rs` 不再导出 `ContextService`、`ContextUri`、`ContextDocument`、`ContextLayer`、`ContextNamespace*` 或 `ContextReadResult`。

判定：

- `dead / deleted / forbidden-to-restore`：Aster context service、context URI parser、`aster://` storage API 和相关 DTO。
- `compat blocker`：Aster `AgentEvent::ContextTrace` 仍是 R6 未迁完前的 source adapter。
- `refactor-aligned current`：`agent-protocol::context_trace::ContextTraceStep`。
- Thread / Turn / Item 归属：保留的 trace DTO 暂归 Turn event materialization / Item read model projection；被删除的 URI context service 不进入 refactor v1 owner。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `context_service.rs` / `context_uri.rs` 不存在，并禁止在 `agent-compat/src/context` 下恢复 `ContextService`、`ContextUri`、`ContextNamespace`、`ContextLayer`、`ContextDocument`、`ContextReadResult` 或 `aster://`。
- 后续如需要 AGENTS.md / context hydrate，只能按 Codex-first prompt/context owner 进入 Lime current 主链，不得恢复 Aster URI storage API。

验证记录：

- `validated`：`rg -n "context_service|context_uri|ContextService|ContextUri|ContextNamespace|ContextLayer|ContextDocument|ContextReadResult|aster://" "lime-rs/crates/agent-compat/src/context" "lime-rs/crates/agent-compat/src/lib.rs"` 无命中。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-service-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，`Finished dev profile ... in 10m 03s`；保留既有 `reqwest default-features` workspace warning。

### 4.24.9 Agent-compat tool I/O duplicate deletion

当前状态：

- `tool-runtime::tool_io` 已是 model-visible tool output truncation、tool payload stats、history eviction planning 与 offload metadata helper 的 current owner，并被 `lime-agent/src/tool_io_offload.rs`、live execution process runner 和相关 current tests 消费。
- `agent-compat/src/context/tool_io.rs`、`token_estimator.rs`、`pruner.rs` 与 `types.rs` 没有 Lime App Server / frontend / Evidence / runtime current 消费链；其中 `ProgressivePruner` 只被 `OverflowHandler::handle_overflow_with_pruning(...)` 这个零调用方法使用。
- 本刀删除上述 4 个 context duplicate 文件，并删除 `OverflowHandler::handle_overflow_with_pruning(...)`、零引用 `OverflowResult` 与 `compaction_attempted()` getter；`OverflowHandler` 只保留实际被 `Agent::reply` 使用的 compaction retry 状态。

判定：

- `refactor-aligned current`：`tool-runtime::tool_io`，归属 Turn tool lifecycle / Item tool output projection。
- `compat blocker`：Aster `AgentEvent::ContextTrace` 的最小 compat 字段类型，仍服务 Aster event -> Lime runtime event projection。
- `refactor-aligned current`：`agent-protocol::context_trace::ContextTraceStep`，服务 current context trace projection。
- `dead / deleted / forbidden-to-restore`：Aster context `tool_io`、heuristic `TokenEstimator`、`ProgressivePruner`、`PruningConfig` / `PruningLevel`、未调用 progressive pruning overflow path 和零引用 overflow result/getter API。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 `pruner.rs`、`token_estimator.rs`、`tool_io.rs`、`types.rs` 不存在，并禁止在 `agent-compat/src/context` 下恢复 `ProgressivePruner`、`TokenEstimator`、`ToolIo*`、`PruningConfig` 或 `PruningLevel`。
- 后续 tool I/O / token / truncation 需求必须继续进入 `tool-runtime::tool_io` 或其拆分子模块，不得恢复 Aster context helper。

验证记录：

- `validated`：`rg -n "ProgressivePruner|TokenEstimator|ToolIo|PruningConfig|PruningLevel|handle_overflow_with_pruning|OverflowResult|compaction_attempted\\(|pub mod tool_io|pub mod pruner|pub mod token_estimator|pub\\(crate\\) mod types" "lime-rs/crates/agent-compat/src/context" "lime-rs/crates/agent-compat/src/agents/error_handling/overflow_handler.rs"` 无命中。
- `superseded`：早期 `find "lime-rs/crates/agent-compat/src/context" ...` 曾显示 context 目录只剩 `mod.rs` 与 `trace.rs`；2026-07-10 已继续删除 root context 目录。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-service-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，`Finished dev profile ... in 20.78s`；保留既有 `reqwest default-features` workspace warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。

### 4.24.10 Agent-compat integrated permission framework deletion

当前状态：

- Codex / refactor v1 口径确认 approval / permission 的 current owner 是 App Server RuntimeCore pending action、`agentSession/action/respond`、`tool-runtime::execution_approval`、Thread / Item read model 与输入区 approval prompt；不是 Aster staging crate 的 integrated permission / policy framework。
- `agent-compat/src/permission/{audit,condition,integration,manager,merger,migration,pattern,policy,restriction,templates,types}*` 已删除；`permission/mod.rs` 不再导出 `ToolPermissionManager`、`ToolPolicyManager`、`PermissionContext`、`AuditLogger`、policy profile 或 parameter restriction surface。
- `PermissionInspector` 已删除 optional integrated manager 分支，只保留当前 reply loop 仍需要的 legacy permission manager / readonly / regular tool 判定。
- `ToolRegistry` 已删除 optional permission/audit manager、`with_managers(...)`、`set_permission_manager(...)`、`set_audit_logger(...)`、permission-context materialization 和 audit log hook。
- `agents/tool_execution.rs` 已删除未调用的 ToolPermissionManager / AuditLogger helper；生产仍通过 Tool 自身 `check_permissions`、permission request callback、最小 `PermissionInspector`、`PermissionConfirmation` 和 `permission_judge` 维持 reply loop 过渡行为。

判定：

- `dead / deleted / forbidden-to-restore`：Aster integrated permission / policy / audit framework、registry-level optional permission/audit manager、ToolPermissionManager helper、policy profile / group / restriction / audit DTO。
- `refactor-aligned current`：App Server RuntimeCore approval / pending action、`tool-runtime::execution_approval` 和 current tool permission projection。
- `compat blocker`：最小 Aster `PermissionInspector` / `PermissionConfirmation` / `permission_judge` / `ToolPermissionStore` 仍服务 Aster reply loop，退出条件是 reply loop / Tool trait adapter 迁出后删除。
- Thread / Turn / Item 归属：Turn 负责 permission preflight / approval lifecycle；Item / Evidence 只消费 current projection；被删除 framework 不进入 Thread / Turn / Item owner。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 deleted permission framework paths 不存在，并禁止 `ToolPermissionManager` / `ToolPolicyManager` / `PermissionContext` / `AuditLogger`、`with_integrated_manager(...)`、registry `with_managers(...)` 等 surface 恢复。
- R2/R4 完成后，继续删除最小 Aster permission adapter；不得把它升级为 current approval owner。

验证记录：

- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2` 通过；保留既有 `lime-agent` warning：`RuntimeReplyResponseEvent` unused import、`NativeRegistration::name` 未使用。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`151 passed`。
- `validated`：`git diff --check -- "lime-rs/crates/agent-compat/src/permission" "lime-rs/crates/agent-compat/src/agents/tool_execution.rs" "lime-rs/crates/agent-compat/src/tools/registry.rs" "lime-rs/crates/agent-compat/src/tool_inspection.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。

### 4.25 Approval HITL session cache scope

当前状态：

- Approval / HITL 的 current owner 固定为 App Server RuntimeCore pending action、`agentSession/action/respond`、session approval cache、Inputbar compact approval prompt、Thread/Item read model 与 Evidence export。
- shell / command execution approval 的 contract / scope / default decision projection 已归属 `tool-runtime::execution_approval`；`lime-agent` lifecycle 只做 runtime event materialization。
- P2 scope/lifecycle 已在 App Server current owner 完成：session approval key 包含 `riskClass`、`workspaceId`、`workingDirHash`、`projectRootHash`、`networkHost`，path 只保存 sha256 摘要，URL 只保存 scheme/host/port。
- 2026-07-09 Gate B 复验修复只触达受控 Electron fixture：新增 `scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs`，让 approval resume external backend 的 `action.required/action.resolved` 携带与 production `permission_preflight` 同构的 `approvalScope/approval_scope`；没有修改 Aster vendor、Aster native tools 或 Aster pending approval hook。

判定：

- `refactor-aligned current`：`lime-rs/crates/app-server/src/runtime/approval_cache.rs`、`runtime_backend/permission_preflight.rs`、`turn_execution.rs` / `session_lifecycle.rs` 中的 session cache scope、lifecycle 与 read-model/evidence 投影。
- `refactor-aligned current`：`lime-rs/crates/tool-runtime/src/execution_approval.rs` 中的 shell/tool execution approval projection，归属 Turn tool lifecycle policy projection，不归属 Aster adapter。
- Thread / Turn / Item 归属：Turn permission preflight / action_required lifecycle；Item timeline / evidence 只读投影；Thread/session scope 只在 current App Server session cache 内生效。
- `controlled-fixture`：`scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs` 只服务 Gate B Electron CDP 证据，负责模拟 production external backend event shape，不是 production fallback。
- `dead / guarded`：approval A2UI 表单、消息流 pending approval submit、Harness inline approval submit、Aster approval hook/cache/pending map。
- `compat blocker`：Aster reply loop 只允许把 current permission decision 转成临时 `PermissionCheckResult`，不得持有 session cache、decision scope 或 pending approval map 语义。

验证：

- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture`，`7 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_session_cache_auto_resolved --lib -- --nocapture`，`1 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server coding_snapshot --lib -- --nocapture`，`3 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_approval --lib -- --nocapture`，`2 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle --lib -- --nocapture`，`14 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib -- --nocapture`，`16 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:agent-runtime-current-fixture`，Gate A 通过，`liveProviderUsed=false`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9231 --prefix claw-chat-current-fixture-approval-request-resume-cdp --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`，Gate B 通过，summary proofLevel 为 `Gate B CDP controlled fixture`，18 项 approval 场景断言全 true。

退出条件：

- 后续补 P4 Timeline / replay 只读分类时仍必须消费 App Server current approval facts，不得在 Aster 或 A2UI 中新增 approval submit/cache 逻辑。
- 若继续扩展 Gate B decline/cancel 分支，先拆 `scripts/agent-runtime/claw-chat-current-fixture-approval-resume.mjs`，避免继续扩展接近 800 行的 scenario 文件。

### 4.26 Provider stream poll lifecycle

当前状态：

- Codex 对照确认 provider streaming 是 turn-scoped lifecycle，不应把 cancel poll、first event、first text、failure / cancellation reason 留在外部 framework 的局部实现里。
- 本刀把 provider stream cancel poll interval、timeout outcome、event-boundary cancel outcome 和 stable cancel reason 的 target contract 建在 `model-provider::provider_stream`，作为 R2/R3 迁出后的 current owner 形状。
- 2026-07-10 继续纠偏：`agent-compat` 不是保护区，已允许 staging loop 临时消费 `model-provider::provider_stream` current helper 来删除本地 provider stream poll policy。该文件仍执行 Aster provider stream 和 tool loop，消费 current helper只是缩短 compat blocker，不是 refactor v1 current 证据。

判定：

- `refactor-aligned current`：`model-provider::provider_stream::{ProviderStreamPoll, ProviderStreamCancelReason}`，归属 Turn provider stream lifecycle。
- `compat blocker`：Aster `Agent::reply_with_provider(...)` / `reply_internal(...)` 仍执行 provider trait object stream、tool loop、session/event source。
- `dead / guarded`：`agent-compat` 本地 provider stream poll policy、本地 cancel reason 字符串，或把消费 current poll helper写成迁移完成态。
- Thread / Turn / Item 归属：Turn 负责 provider stream lifecycle；Item/read model 仍暂由 Aster event adapter 投影，后续必须迁到 current event source。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求 provider stream poll contract 存在于 `model-provider::provider_stream`，并要求 `agent-compat` 生产代码消费 current poll helper；本地 cancel reason 常量和字符串不得恢复。
- 后续把 provider stream start / event loop execution 从 Aster `reply_internal(...)` 迁出后，删除 `agent-compat` 中本地 cancel reason 字符串和整个 staging loop 残留。

验证记录：

- `passed`：`model-provider provider_stream` 单测 `23 passed`，Aster migration boundary guard `144 passed`，Prettier / rustfmt / `git diff --check` 均通过。
- `passed`：2026-07-10 复验 `model-provider provider_stream`，`28 passed`；`lime-agent request_tool_policy`，`81 passed`。`agent-compat/src/agents/agent.rs` 已删除本地 provider stream cancel constants，并消费 `model-provider::provider_stream` current helper。
- `passed`：2026-07-10 继续复验 `model-provider provider_stream`，`29 passed`；`lime-agent request_tool_policy`，`81 passed`。`provider_stream_first_text_delta_chars(...)` 已进入 `model-provider::provider_stream::text_delta`，`agent-compat` 只做 Aster `MessageContent::Text` 字符串投影。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-execution-module" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖私有 `run_provider_reply_exit_source(...)` 退场点和现有 request policy 主链。

### 4.27 Provider reply execution runner

当前状态：

- `model-provider::provider_stream::source_execution` 已持有 `RuntimeReplyProviderSourceBackendCall`、`RuntimeReplyProviderSourceFuture`、`RuntimeReplyProviderExecutionRunner<R>`、`RuntimeReplyProviderExecutionSource<R>` 与 `run_provider_source_execution(...)`，把 provider source backend trait implementation wrapper 下沉到 provider owner 并从 `provider_stream.rs` 主文件拆出；`model-provider::provider_stream::response_event` 持有 `RuntimeReplyResponseEvent`、`RuntimeReplyResponseItem` 与 `RuntimeReplyResponseItemPayload`；`model-provider::provider_stream::poll` / `sampling` 分别持有 provider poll/cancel policy 与 provider sampling / empty-first-content retry policy。`agent-runtime::reply_stream` 只 re-export DTO 并保留 materializer / projection；`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 只负责把 Turn source request materialize 为 current execution payload，并由 default/provider source helper 在进入 provider backend 前统一完成 materialization。
- `request_tool_policy/provider_reply_exit_source.rs` 只保留私有 `ProviderReplyExitRunner` 作为 Aster provider reply 最后一跳退场实现；`ProviderReplyExitSource` 已退化为 `model-provider::provider_stream::RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` type alias，不再直接实现 provider source backend 或调用 `run_provider_reply_exit_source(self.agent, self.provider, call)`。
- `agent-compat/src/prompts` 空目录残留已删除；prompt template surface 继续按 `dead / deleted / forbidden-to-restore` 处理，不能作为 staging crate 可保留面。
- Codex 对照确认下一刀应迁向 provider `ResponseEvent` / `ResponseItem` stream contract：Codex 在 `codex-api` 规整 provider stream event，在 `core/src/session/turn.rs` 消费 response item loop，并经 `ToolRouter` / `ToolCallRuntime` 执行工具；Lime 不应把 Aster `AgentEvent` 长期作为 current stream event。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::source_execution::{RuntimeReplyProviderExecutionRunner, RuntimeReplyProviderExecutionSource, run_provider_source_execution}`、`model-provider::provider_stream::response_event::{RuntimeReplyResponseEvent, RuntimeReplyResponseItem, RuntimeReplyResponseItemPayload}`、`model-provider::provider_stream::{poll,sampling}`，归属 provider source backend wrapper、provider response event/item contract、provider poll/cancel 与 sampling policy；`agent-runtime::reply_backend::{RuntimeReplyProviderSourceExecution, run_default_provider_source_backend, run_provider_source_backend}` 归属 Turn execution payload materialization；`agent-runtime::reply_stream::RuntimeReplyResponseMaterializer` 归属 Turn Item projection。
- `compat blocker`：`ProviderReplyExitRunner` / `run_provider_reply_exit_source(...)` 仍依赖 Aster `Agent` host、Aster provider trait object、Aster `Message` / `SessionConfig` lowering 和 Aster stream projector。
- `dead / guarded`：provider reply exit source impl 自己从 backend call 拆 execution、backend adapter 恢复 provider source implementation、`agent-runtime` 重新定义 provider response DTO、`agent-compat` 反向依赖 current owner。
- Thread / Turn / Item 归属：Turn owner 只承接 execution payload 与 backend call handoff，provider owner 承接 backend wrapper；Item/read model 仍未脱离 Aster event projector，必须由下一刀的 response event/item stream contract 继续推进。

退出条件：

- 建立 Lime-owned provider response event/item stream contract，覆盖 text delta、output item added/done、tool call input delta、reasoning delta、completed/end-turn、rate limit / safety buffering 等最小 Codex 对齐事件。
- `run_provider_reply_exit_source(...)` 不再调用 `Agent::reply_with_provider(...)`，`ProviderReplyExitRunner` 删除，provider source backend 输出不再以 Aster `AgentEvent` 投影为前提。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`25 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`151 passed`。
- `validated`：2026-07-10 子模块化后复验 `model-provider provider_stream`，`42 passed`；`agent-runtime reply_backend`，`20 passed`；`lime-agent request_tool_policy`，`81 passed`；`asterMigrationBoundary.test.ts`，`165 passed`。随后继续拆出 `poll.rs`、`sampling.rs`、`response_event.rs` 并复验 `model-provider provider_stream`，`42 passed`；`lime-agent request_tool_policy`，`81 passed`；`asterMigrationBoundary.test.ts`，`167 passed`。`provider_stream.rs` 当前约 `701` 行，`source_execution.rs` 约 `105` 行；provider source execution / poll / sampling / response event contract 不得回流到 `agent-runtime`、`agent-compat` 或 `provider_stream.rs` 主文件。

### 4.28 Provider response event stream materializer

当前状态：

- Codex 对照确认 provider stream current 形状应先规整成 typed `ResponseEvent` / `ResponseItem`，再由 Turn loop 和 tool router materialize Item / tool lifecycle，而不是直接暴露外部 agent framework event。
- `model-provider::provider_stream::RuntimeReplyResponseEvent` 已承接 Lime-owned response stream event skeleton，覆盖 `OutputItemAdded`、`OutputItemDone`、`TextDelta`、`ToolCallInputDelta`、`ReasoningDelta`、`Completed`、`RateLimits`；`agent-runtime::reply_stream` 只 re-export provider response DTO 并保留 Turn-side materializer / projection。
- `agent-runtime::reply_stream::RuntimeReplyResponseMaterializer` 已把 response event materialize 为 current projection：`OutputItemAdded` / `OutputItemDone` -> `ItemStarted` / `ItemCompleted`，`ReasoningDelta` -> `ThinkingDelta` + `ItemUpdated`，`ToolCallInputDelta` -> 带累积参数的 `ToolInputDelta`，并在工具名可识别或已由 `OutputItemAdded` 记录时同步投影 `ItemUpdated` 工具项；未知工具名 fail-closed，不伪造 item；`Completed` -> `Done`，`RateLimits` -> rate-limit provider stream event。
- `RuntimeReplyStreamEvent<E>` 已新增 `ResponseEvent(RuntimeReplyResponseEvent)`；`request_tool_policy/agent_reply_stream.rs` 已真实消费该 variant，并把 response projection 适配到现有 `RuntimeAgentEvent` / timeline item 主链。非文本 response delta 不再被吞掉。
- `request_tool_policy/aster_reply_stream_adapter.rs::AsterReplyStreamProjector` 已把 Aster Message text/thinking/tool-input delta、direct `AgentEvent::ToolInputDelta` 和可表达为 provider response item 的 `ItemStarted` / `ItemCompleted` 前移成 `RuntimeReplyResponseEvent`；Aster source adapter 不再让工具参数流或 provider item lifecycle 直接绕过 current response materializer。不属于 provider response item 的 payload 继续保留原 runtime event，避免信息丢失。
- provider source 仍没有直接产出 Lime-owned response event；`ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` 仍调用 Aster `Agent::reply_with_provider(...)`，Aster `AgentEvent` projector 仍是迁移期输入。这不是完成态。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyResponseEvent` / `RuntimeReplyResponseItem` / `RuntimeReplyResponseItemPayload` 归属 provider response stream contract；`agent-runtime::reply_stream::RuntimeReplyResponseMaterializer` 归属 Turn response item materialization skeleton。
- `transitional current adapter`：`agent_reply_stream.rs::runtime_agent_events_from_response_event(...)`，暂时把 response projection 适配到现有 `RuntimeAgentEvent` / timeline item 主链；后续应改为正式 Item materializer / read model owner。
- `compat blocker`：`ProviderReplyExitSource`、`run_provider_reply_exit_source(...)`、Aster `Agent::reply_with_provider(...)` 和 `AsterReplyStreamProjector` 仍是 provider/reply loop 最后一跳；Aster `Message` 反推 provider notification / inline provider error 仍是迁移期兼容输入。
- `dead / guarded`：response event 只消费 text delta、吞掉 tool input / reasoning / item / completed / rate limits、provider response item lifecycle 或工具参数 item update 绕过 materializer，或把 Aster `AgentEvent` 当长期 current stream event contract。
- Thread / Turn / Item 归属：Turn 拥有 response stream event 和 materializer；Item/read model 已有过渡 timeline projection；Tool lifecycle execution 仍经 Aster native `ToolRegistry` / `Tool` trait，不能删除 Aster event projector 和 native tool 壳。

退出条件：

- provider source 直接产出 `RuntimeReplyResponseEvent` / response item stream，不再以 Aster `AgentEvent` projector 为前提。
- `ToolCallInputDelta` 和 output tool call item 进入 current tool router / `tool-runtime` execution，不再经 Aster `ToolRegistry` / `Tool` trait。
- `Completed` 的 end-turn / usage、reasoning 和 output item lifecycle 进入正式 Item/read model、Evidence / replay projection，而不是只停留在 `RuntimeAgentEvent` 过渡适配层。
- 上述完成后删除 Aster `AgentEvent` 作为 reply stream 对外形状，以及 `project_aster_reply_stream(...)` 中对 Aster `Message` 的 provider notification / inline error 反推路径。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`20 passed`；覆盖 response materializer 的 item lifecycle、reasoning 累积、tool input 累积、completed 和 rate limits。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`77 passed`；覆盖 response projection 适配到 `RuntimeAgentEvent` / timeline item 主链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`。
- `note`：同一 `lime-agent` 命令首次冷编译在第三方依赖阶段被外部 SIGTERM 结束，退出码 `143`，无 Rust 源码错误；复用同一 target dir 重跑后通过。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-projector-response-event-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`22 passed`；覆盖 current response event mapper/materializer。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`146 passed`；覆盖 direct Aster `AgentEvent::ToolInputDelta` 必须进入 `RuntimeReplyResponseEvent::ToolCallInputDelta`，以及已删除 hook 文件不阻塞 Task\* dead 守卫。
- `blocked`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-projector-response-event-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 在编译 `aster-core` 时先失败于当前 `agent-compat` 脏树缺失模块：`subagent_execution_tool`、`subagent_scheduler`、`communication`、`monitor`、`specialized`、`error_handling`、`recipe/build_recipe`、`scheduler/types.rs`；未触达本次 adapter 测试。该阻塞属于 R9 staging 删除/迁出未收口，不应通过恢复 Aster modules 解决。
- `resolved`：上述 `agent-compat` 编译阻塞已按迁出方向清障：不恢复旧目录，只做最小 no-op / 解析型 shim 和残留引用收缩，让 staging crate 能编译以验证 current 主线。该清障仍归类为 `compat blocker`，不作为 refactor v1 current owner 或迁移完成证据。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-mapper-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`；覆盖 provider accumulated tool input delta、unknown tool name fail-closed、item lifecycle、reasoning、completed 和 rate limits。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；证明 current response projection adapter 已穿过 `lime-agent` request policy 主链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`147 passed`。

### 4.29 Provider sampling policy owner

当前状态：

- `model-provider::provider_stream` 已承接 `RuntimeReplyProviderSamplingRequest` 与 `RuntimeReplyProviderSamplingMode`，用于表达 provider / model / message count / tool count / system chars / tool surface / streaming support 这些采样决策输入。
- `model-provider::provider_stream` 已承接 `PROVIDER_EMPTY_STREAM_RETRY_MARKER` 与 `provider_stream_should_retry_empty_first_content(...)`，把 Anthropic empty-first-content retry 判定从 Aster reply loop 本地硬编码前移到 provider owner。
- `agent-compat/src/agents/reply_parts.rs` 只消费上述 current helper，以继续驱动尚未删除的 Aster provider reply 最后一跳；这属于 R2/R3 compat blocker 收缩，不是 `agent-compat` 成为 provider sampling owner。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderSamplingRequest, RuntimeReplyProviderSamplingMode, provider_stream_should_retry_empty_first_content, PROVIDER_EMPTY_STREAM_RETRY_MARKER}`，归属 provider sampling / retry policy。
- `compat blocker`：`agent-compat/src/agents/reply_parts.rs::stream_response_from_provider(...)` 仍执行 Aster provider loop 和 non-stream fallback；它只能引用 current helper，不能新增 provider sampling policy。
- `dead / guarded`：在 `agent-compat` 重新硬编码 `"Anthropic stream ended without assistant content or tool call"`，或把 provider sampling request/mode 定义回 `agent-runtime` / `agent-compat`。
- Thread / Turn / Item 归属：provider owner 负责 sampling policy；Turn owner 只消费 provider execution payload；Item/read model 不应依赖 Aster reply loop 的 provider sampling 分支。

退出条件：

- `run_provider_reply_exit_source(...)` 删除后，provider stream sampling 与 retry 由 `model-provider` current backend 直接调用，`agent-compat/src/agents/reply_parts.rs` 不再被生产 reply path 命中。
- `model-provider/src/provider_stream.rs` 继续增长前拆出 response / sampling 子模块，避免 provider owner 中心文件继续膨胀。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`28 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`152 passed`。

### 4.30 Response event adapter naming split

当前状态：

- `request_tool_policy/response_event_adapter.rs` 已承接 `RuntimeAgentEvent` -> `RuntimeReplyResponseEvent` 的过渡映射，以及 `AgentThreadItem` 中可表达 provider response item 的 payload projection。
- `request_tool_policy/aster_reply_stream_adapter.rs` 降回 Aster source adapter：只读取 Aster `AgentEvent` / `Message`，抽取 provider side-channel notification、inline provider error，并生成 response hints 后委托 current adapter。
- `asterMigrationBoundary.test.ts` 已把守卫从“要求 Aster 文件持有 response mapper”改为“要求非 Aster 文件持有 response mapper，并禁止 Aster 文件重新持有 response item projection”。

判定：

- `refactor-aligned transitional current adapter`：`request_tool_policy/response_event_adapter.rs`，负责 current response event 过渡映射。
- `compat blocker`：`AsterReplyStreamProjector` 仍消费 Aster source stream，直到 provider source 直接产出 Lime-owned response event。
- `dead / guarded`：在 `aster_reply_stream_adapter.rs` 重新定义 `RuntimeAgentResponseEventMapper`、`response_item_from_agent_thread_item(...)` 或直接持有 response item lifecycle projection。
- Thread / Turn / Item 归属：Turn response event materialization 不再挂在 Aster 命名文件；Item/read model projection 仍通过现有 timeline item 过渡接线。

退出条件：

- provider source 直接产出 `RuntimeReplyResponseEvent` / response item stream 后，删除 `AsterReplyStreamProjector` 与 Aster `Message` hint 生成。
- response event adapter 后续迁入更合适的 owner，或被直接 provider response stream 替代；不得回流到 Aster 命名文件。

验证记录：

- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/response-event-adapter-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。

### 4.31 Provider tool-input delta policy owner

当前状态：

- `model-provider::provider_stream::tool_input_delta` 已承接 provider tool-input delta 的 current policy：整条 provider message 必须全是 tool-input delta，空 `call_id` / 空 `delta` 跳过，并统一构造 `RuntimeReplyResponseEvent::ToolCallInputDelta`。
- `agent-compat/src/agents/agent.rs` 只把 Aster `MessageContent::ToolInputDelta` 投影成 `RuntimeReplyProviderToolInputDelta`，再把 current response event 映射回临时 `AgentEvent`，用于维持尚未删除的 Aster provider stream source。
- 这属于削薄 `agent-compat` staging loop，不是让 `agent-compat` 成为 current owner；它仍必须迁出或删除。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderToolInputDelta, provider_stream_tool_input_delta_events}`，归属 provider response event policy。
- `compat blocker`：Aster `MessageContent` 仍是 provider stream item source，`collect_provider_tool_input_delta_events(...)` 仍存在于 staging loop 作为 source adapter。
- `dead / guarded`：在 `agent-compat` 本地恢复 tool-input delta 空值过滤、message-content 全量判定或 current response event 构造规则。
- Thread / Turn / Item 归属：provider owner 负责 response delta policy；Turn/Item materializer 消费 `RuntimeReplyResponseEvent::ToolCallInputDelta`；Aster source adapter 只做临时 DTO 投影。

退出条件：

- provider source 直接产出 `RuntimeReplyResponseEvent::ToolCallInputDelta` 后，删除 `agent-compat` 的 `collect_provider_tool_input_delta_events(...)` 和 Aster `MessageContent` 投影。
- `ToolCallInputDelta` 进入 current tool router / `tool-runtime` execution 后，删除 Aster native `ToolRegistry` / `Tool` trait 壳。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-tool-input-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`32 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-tool-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。

### 4.32 Provider model-change policy owner

当前状态：

- `model-provider::provider_stream::model_change` 已承接 provider active model -> lead / worker / unknown 的 metadata policy。
- `agent-compat/src/agents/agent.rs` 只从 Aster lead-worker provider 读取 `usage.model`、lead model 和 worker model，再调用 current helper 生成临时 `AgentEvent::ModelChange`。
- 这属于削薄 Aster provider loop；`agent-compat` 仍是待迁出 source adapter，不是 model-change owner。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderModelChange, RuntimeReplyProviderModelChangeMode, provider_stream_model_change}`，归属 provider metadata / stream policy。
- `compat blocker`：Aster `LeadWorkerProviderTrait`、Aster usage DTO 与 `AgentEvent::ModelChange` 仍是 source / sink adapter。
- `dead / guarded`：在 `agent-compat` 本地恢复 `active_model == lead_model` / `active_model == worker_model` 字符串分类，或把 lead-worker provider trait 继续扩成 current owner。
- Thread / Turn / Item 归属：provider owner 负责 active model metadata policy；Turn/Item 只消费 current provider response / runtime event projection。

退出条件：

- provider execution 迁出 Aster 后，由 current provider backend 直接产出 model-change metadata 或 provider trace metadata；删除 `agent-compat` 中这段 lead-worker source adapter。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-model-change-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`33 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-model-change-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。

### 4.33 Provider stream notification envelope owner

当前状态：

- `model-provider::provider_stream::notification` 已承接 provider stream side-channel notification 的 current envelope 和 text classification：`provider_stream_notification_text(...)` 构造 JSON payload text，`provider_stream_notification_payload_from_text(...)` / `provider_stream_notification_payload_from_texts(...)` 解析 text，`provider_stream_has_notification_text(...)` 判定文本集合是否包含 provider notification，`PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX` 固定为 `__provider_stream_event__:`。
- `agent-compat/src/providers/formats/openai_responses.rs` 不再定义 `PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX` 或 `PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING`，只把 current notification text 包成 Aster `SystemNotification`；`agent-compat/src/agents/agent.rs` 不再 import Aster format 判断函数，只把 Aster system notification 文本投影给 current helper。
- 旧内部 prefix `__aster_provider_stream_event__:` 已直接下线；当前没有外部客户或持久化兼容要求，不为 Aster 命名保留双轨。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{provider_stream_notification_text, provider_stream_notification_payload_from_text, provider_stream_notification_payload_from_texts, provider_stream_has_notification_text, PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX}`，归属 provider stream event envelope / text classification。
- `compat blocker`：Aster `Message` / `SystemNotification` 仍作为 provider side-channel source container，`aster_reply_stream_adapter.rs` 仍从 Aster message 读取 payload 后委托 `RuntimeReplyProviderStreamEvent::from_notification_payload(...)`。
- `dead / guarded`：在 Aster Responses 格式文件里恢复 notification prefix、event kind、JSON envelope 组包/解析规则，恢复 `__aster_provider_stream_event__:`，或让 `agent.rs` 重新 import Aster format 判断函数。
- Thread / Turn / Item 归属：provider owner 负责 provider stream event envelope；Turn stream projection 只消费 typed `RuntimeReplyProviderStreamEvent`；Item/read model 不依赖 Aster notification text。

退出条件：

- provider source 直接产出 Lime-owned provider stream event 后，删除 Aster `SystemNotification` side-channel 和 `provider_stream_event_notification_payload_from_message(...)`。
- `run_provider_reply_exit_source(...)` 删除后，Aster Responses 格式文件不再作为 current provider notification source。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`32 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-aster-core" cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core responses_streaming_safety_buffering --lib -j 1 -- --nocapture`，`1 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。

### 4.34 Provider stream progress / milestone policy owner

当前状态：

- `model-provider::provider_stream::progress` 已承接 provider stream first event、first content、first text delta 与 empty-first-content retry state。
- `agent-compat/src/agents/agent.rs` 只在 current progress helper 返回 milestone 时构造临时 `AgentEvent::ProviderTrace`；`agent-compat/src/agents/reply_parts.rs` 只从 Aster `Message` 投影文本并调用 current helper。
- 这属于削薄 Aster provider loop；`agent-compat` 仍是待迁出 source adapter，不是 progress state owner。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamProgress`，归属 provider stream progress / milestone policy。
- `compat blocker`：Aster provider trait object stream、Aster `Message` 与 local `ProviderTraceEvent` 仍是 source / sink adapter。
- `dead / guarded`：在 `agent-compat` 本地恢复 `provider_first_event_seen`、`provider_first_text_delta_seen`、`first_provider_content_seen` 或 `first_provider_text_delta_seen`。
- Thread / Turn / Item 归属：provider owner 负责 stream milestone state；Turn trace / Item projection 只消费 materialized provider events。

退出条件：

- provider execution 迁出 Aster 后，由 current provider backend 直接维护 stream progress 并产出 current provider trace / response event；删除 `agent-compat` 中这段 milestone source adapter。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`34 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。

### 4.35 Provider failure logging classification owner

当前状态：

- `model-provider::provider_stream::failure` 已承接 provider failure kind、retryable、non-retryable rejection 到 error/warn 日志等级的 current policy。
- `agent-compat/src/agents/agent.rs` 只把 Aster `ProviderError` 投影成 `RuntimeReplyProviderFailure`，不再本地维护 `ProviderError::ServerError | ExecutionError | UsageError` 的日志等级匹配，也不再直接调用 `ProviderError::message_is_non_retryable_provider_rejection(...)` 判定 session description warn/debug。
- `lime-agent` 的 `aster_session_store_tests.rs` 只补测试 fixture builder，避免 `Recipe` DTO 变化阻塞 current provider policy 验证；这不是恢复 Aster recipe runtime。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderFailure, RuntimeReplyProviderFailureKind, provider_stream_failure_should_log_as_error, provider_stream_failure_message_should_log_as_warning}`，归属 provider failure classification。
- `compat blocker`：Aster `ProviderError` 仍是 provider/reply loop source error，`agent-compat` 仍只是 source adapter。
- `dead / guarded`：在 `agent-compat` 本地恢复 `matches!(ProviderError::ServerError | ExecutionError | UsageError)`、`ProviderError::message_is_non_retryable_provider_rejection(...)` 日志决策，或把 provider failure classification 写回 Aster error 类型。
- Thread / Turn / Item 归属：provider owner 负责 failure classification；Turn loop 只消费分类结果决定临时日志等级；Item/read model 不依赖 Aster error variant。

退出条件：

- provider execution 迁出 Aster 后，由 current provider backend 直接构造 provider failure facts；删除 `agent-compat` 的 `ProviderError` source adapter。
- `ProviderReplyExitSource` 删除后，provider failure classification 不再通过 Aster reply loop 间接消费。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-policy-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`36 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。

### 4.36 Provider plaintext tool-use normalization owner

当前状态：

- `model-provider::provider_stream::plaintext_tool_use` 已承接 provider 输出中的 `<tool_use>` XML block、JSON code fence、`WebSearch` / `Search` inline alias 和 split-stream tool input delta progress。
- `agent-compat/src/agents/reply_parts.rs` 只把 Aster `MessageContent::Text` 投影成字符串，再把 current DTO 装回临时 `CallToolRequestParam` / `MessageContent::ToolInputDelta`，不再本地持有 marker、XML attribute、JSON fence、Search alias 或 tag scanning parser。
- 这属于 provider stream normalization 外迁；Aster `Message` / Aster provider stream 仍是 source adapter，不是迁移完成态。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderPlaintextToolCall, RuntimeReplyProviderPlaintextToolUse, RuntimeReplyProviderPlaintextToolUseProgress, provider_stream_plaintext_tool_uses, provider_stream_plaintext_tool_use_progress}`，归属 provider output normalization。
- `compat blocker`：Aster `Message` / `CallToolRequestParam` 仍是 provider/reply loop source adapter。
- `dead / guarded`：在 `agent-compat` 本地恢复 `PLAINTEXT_TOOL_USE_OPEN_MARKER`、`extract_plaintext_tool_use_name`、`extract_xml_attribute`、`strip_json_code_fence`、`parse_plaintext_tool_use_arguments`、`find_next_plaintext_tool_tag` 或 Search alias parser owner。
- Thread / Turn / Item 归属：provider owner 负责 provider text -> structured tool call / tool input delta normalization；Turn loop 暂时消费 current DTO 并通过 Aster source adapter 回填，Item/read model 继续通过 response materializer 过渡。

退出条件：

- provider execution 迁出 Aster 后，由 current provider backend 直接产出 `RuntimeReplyResponseEvent::ToolCallInputDelta` 或 provider response item；删除 `reply_parts.rs` 中的 Aster `Message` 装配层。
- `ProviderReplyExitSource` 删除后，plaintext tool-use normalization 不再通过 Aster `Message` 间接消费。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-plaintext-tool-use-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`39 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`154 passed`。

### 4.37 Provider image input policy owner

当前状态：

- `model-provider::provider_stream::image_input` 已承接 provider image input policy：canonical model image modality lookup、turn runtime `image_input_policy` / `imageInputPolicy` 解析，以及 model capability + runtime policy 组合后的 image omission decision。
- `agent-compat/src/agents/reply_parts.rs` 不再直接依赖 `model_provider::canonical::maybe_get_canonical_model`，也不再本地维护 `image_input_policy` parser；它只读取当前 turn 的 `lime_runtime` metadata，并在 provider 请求前做 Aster `MessageContent::Image` / rmcp image content stripping。
- 这属于 provider request normalization 外迁；Aster `Message` / `ToolResponse` 仍是 source adapter，不是迁移完成态。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::{RuntimeReplyProviderImageInputPolicy, provider_stream_model_supports_image_input, provider_stream_image_input_policy_disables_provider_images, provider_stream_should_omit_image_input}`，归属 provider request image input policy。
- `compat blocker`：Aster `MessageContent::Image` / `ToolResponse` 仍是 provider request source adapter，`reply_parts.rs` 仍负责把图片内容从 Aster message 形状中剥离。
- `dead / guarded`：在 `agent-compat` 本地恢复 `model_config_supports_image_input(...)`、`image_input_policy_disables_provider_images(...)`、`LIME_RUNTIME_IMAGE_INPUT_POLICY_KEY` parser 或 direct `maybe_get_canonical_model` lookup。
- Thread / Turn / Item 归属：provider owner 负责 provider image capability / runtime policy 判定；Turn adapter 暂时做 Aster message stripping；Item/read model 不依赖 Aster image policy。

退出条件：

- provider execution 迁出 Aster 后，由 current provider backend 直接依据 `model-provider` image input policy lower provider request；删除 `reply_parts.rs` 中 Aster message image stripping adapter。
- `ProviderReplyExitSource` 删除后，provider image input policy 不再通过 Aster `Message` 间接消费。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`42 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`157 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`、`npx prettier --check ...`、`git diff --check -- ...`。

### 4.38 Turn tool surface / scope policy owner

当前状态：

- `tool-runtime::turn_tool_surface` 已承接 turn-level tool surface / scope 纯策略：`direct_answer` / `local_workspace` / `compact_tools` 工具面、turn metadata 中 allowed / disallowed tools、prompt guidance、extension prompt context 与 workspace hints 判定。
- `agent-compat/src/agents/reply_parts.rs` 不再本地维护 `normalize_turn_metadata_tool_list`、`matches_turn_tool_scope`、tool surface 常量或 prompt policy；它只读取 current turn metadata，并把 Aster `ToolRegistry::canonical_name(...)` 作为迁移期 alias resolver 传给 `tool-runtime`。
- 这属于 Turn tool planning / tool surface policy 外迁；Aster `ToolRegistry` / rmcp `Tool` 仍是未迁 reply loop 的 source adapter，不是迁移完成态。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::turn_tool_surface::{RuntimeTurnToolSurfaceMode, RuntimeTurnToolScope, runtime_turn_tool_surface_mode_from_metadata, runtime_turn_tool_scope_from_metadata, runtime_turn_tool_surface_allows_tool_name, runtime_turn_tool_scope_allows_tool_name}`，归属 Turn tool surface / scope policy。
- `compat blocker`：Aster `ToolRegistry` / rmcp `Tool` 仍服务未迁 reply loop native tool surface；`reply_parts.rs` 仍负责把 current policy 套到 Aster-shaped tool list。
- `dead / guarded`：在 `agent-compat` 本地恢复 turn tool surface/scope parser、prompt policy 或本地 `LIME_RUNTIME_TOOL_SURFACE_KEY` / `LOCAL_WORKSPACE_TOOL_NAMES` / `COMPACT_TOOL_SURFACE_TOOL_NAMES` owner。
- Thread / Turn / Item 归属：Turn 负责本回合模型可见工具面与工具 scope；Item/read model 不参与策略判定；Evidence 只消费后续 tool lifecycle / approval projection。

退出条件：

- R4 native tool registry 迁出 Aster 后，`tool-runtime` current tool planner 直接接收 current tool definitions / native dispatch surface，不再通过 Aster `ToolRegistry::canonical_name(...)`。
- R2/R3 provider reply loop 删除后，`reply_parts.rs` 中的 Aster `Tool` list 过滤 adapter 随 source adapter 一并删除。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/turn-tool-surface-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_tool_surface --lib -j 1 -- --nocapture`，`5 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`162 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。

#### 4.38.1 Tool exposure / registration gate owner

当前状态：

- `tool-runtime::turn_tool_surface` 已继续承接 tool exposure / registration gate 纯策略：MCP resource-gated tools、PowerShell registration gate、subagent native/coordination/team tool allowlist 和 extension-prefixed tool exposure。
- `agent-compat/src/agents/agent.rs` 不再维护 `RESOURCE_GATED_TOOL_NAMES`、`SUBAGENT_ALLOWED_NATIVE_TOOL_NAMES`、`SUBAGENT_ALLOWED_COORDINATION_TOOL_NAMES`、`SUBAGENT_TEAMMATE_ALLOWED_TOOL_NAMES` 或 `is_extension_prefixed_tool(...)`；它只把 Aster `SessionType`、resource support、team state 与 `Agent` / `StructuredOutput` 名称适配给 current helper。
- `agent-compat/src/tools/mod.rs` 不再维护 `CurrentSurfaceToolGates`、PowerShell env parser 或 `should_register_current_surface_tool(...)`；它只在注册 Aster `Tool` trait fallback 时调用 current gate。
- `agent-compat/src/session/mod.rs` 不再 re-export 零引用 `SessionPlanModeState`；Aster plan-mode tool 已删除，session extension state 不能继续作为 public root surface 续命。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::turn_tool_surface::{RuntimeToolSurfaceGates, runtime_tool_surface_gates_from_env_map, runtime_tool_surface_should_register_name, runtime_registered_tool_exposure_allows_tool_name, runtime_turn_tool_exposure_allows_tool_name}`，归属 Turn tool lifecycle / model-visible tool surface owner。
- `compat blocker`：Aster `ToolRegistry` / `Tool` / `ToolContext` 与 Aster `SessionType` 仍服务未迁 reply loop fallback。
- `dead / guarded`：在 `agent-compat` 本地恢复 resource gate、subagent allowlist、extension-prefixed tool exposure、PowerShell registration gate owner 或 `SessionPlanModeState` public re-export。
- Thread / Turn / Item 归属：Turn 负责工具可见性、注册 gate 与 subagent tool exposure；Thread 只提供 session/team metadata；Item/read model 只消费后续工具调用和结果投影。

退出条件：

- R4 native registry fallback 删除后，`agent-compat` 不再注册或过滤 Aster `Tool` trait 壳，tool exposure 直接由 current tool router / planner 消费。
- R2/R3 provider reply loop 删除后，`Agent` / `StructuredOutput` 等迁移期 tool name adapter 不再通过 Aster `Agent` 文件传递。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/turn_tool_surface.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/tools/mod.rs" "lime-rs/crates/agent-compat/src/session/mod.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/turn-tool-exposure-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_tool_surface --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`npx prettier --check ...` 与 `git diff --check -- ...`。

### 4.39 Tool call surface normalization owner

当前状态：

- `tool-runtime::tool_call_surface` 已承接 provider/reply loop 工具调用 surface normalization：available tool exact / case-insensitive match、canonical alias 结果落回当前 surface name、`Read` 的 `file_path` / `filePath` / `head` 参数兼容，以及 `Glob` / `Grep` 的 `query -> pattern` 参数兼容。
- `agent-compat/src/agents/reply_parts.rs` 不再本地维护 `current_surface_tool_name`、`normalize_current_surface_tool_call`、`normalize_current_surface_tool_arguments`、`integer_argument` 或 `copy_string_argument_if_missing`；它只把 Aster `ToolRegistry::canonical_name(...)` 与 `rmcp::CallToolRequestParam` 作为迁移期输入适配给 `tool-runtime`。
- 这属于 Turn tool routing / current tool surface normalization 外迁；Aster `ToolRegistry` / rmcp `Tool` / native `Tool` trait 执行仍是未迁 reply loop source adapter，不是迁移完成态。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::tool_call_surface::{runtime_tool_call_surface_name, runtime_tool_call_normalize_arguments}`，归属 Turn tool routing / tool call normalization。
- `compat blocker`：Aster `ToolRegistry`、rmcp `Tool` 与 Aster native `Tool` trait 仍服务未迁 reply loop native tool execution；`reply_parts.rs` 仍负责把 Aster-shaped tool call 投影给 current helper。
- `dead / guarded`：在 `agent-compat` 本地恢复工具名 exact / case-insensitive match、canonical alias surface mapping、`Read` / `Glob` / `Grep` 参数补齐 helper。
- Thread / Turn / Item 归属：Turn 负责工具调用进入 current tool surface 前的 normalization；Tool lifecycle 后续必须进入 `tool-runtime` executor；Item/read model 只消费已执行工具事件和结果，不参与参数补齐。

退出条件：

- R4 native tool registry 迁出 Aster 后，tool call normalization 直接作用在 current tool definitions / native dispatch surface，不再通过 Aster `ToolRegistry::canonical_name(...)`。
- R2/R3 provider reply loop 删除后，`reply_parts.rs` 中的 `rmcp::CallToolRequestParam` 适配层随 source adapter 一并删除。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-call-surface-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_call_surface --lib -j 1 -- --nocapture`，`5 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`164 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。

### 4.40 Provider response content owner

当前状态：

- `model-provider::provider_stream::response_content` 已承接 provider response content 的 current 组合入口：`RuntimeReplyProviderResponseContent`、`provider_stream_response_text_chars(...)`、`provider_stream_response_has_notification_text(...)`、`provider_stream_response_tool_input_delta_events(...)`。
- `agent-compat/src/agents/agent.rs` 不再直接组合 `provider_stream_first_text_delta_chars(...)`、`provider_stream_tool_input_delta_events(...)`、`provider_stream_has_notification_text(...)` 或 `RuntimeReplyProviderToolInputDelta`；它只把 Aster `MessageContent` 适配成 current `RuntimeReplyProviderResponseContent`。
- `agent-compat/src/agents/reply_parts.rs` 的 provider 首字文本日志也已改为消费 `RuntimeReplyProviderResponseContent` + `provider_stream_response_text_chars(...)`，不再直接调用 low-level `provider_stream_first_text_delta_chars(...)`；该文件只负责把 Aster `MessageContent` 降成 current response content input。
- 这属于 provider stream content interpretation 外迁；Aster `MessageContent` 仍是未迁 provider source container，不是迁移完成态。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::response_content`，归属 Provider response content contract。
- `compat blocker`：Aster `MessageContent` / `AgentEvent` projector 仍服务 `ProviderReplyExitSource`，`run_provider_reply_exit_source(...)` 仍调用 `Agent::reply_with_provider(...)`。
- `dead / guarded`：在 `agent-compat` 本地恢复 provider response text / notification / tool-input delta 直接规则，或把 `RuntimeReplyProviderResponseContent` helper 消费写成 R2/R3 完成态。
- 追加 `dead / guarded`：`reply_parts.rs` 恢复 `provider_stream_first_text_delta_chars(...)` 直接调用，代表 provider response content 规则重新散回 Aster staging。
- Thread / Turn / Item 归属：Provider owner 负责 response content 解释；Turn owner 负责 materialization；Item/read model 只消费 materialized projection。

退出条件：

- `ProviderReplyExitSource` 删除后，provider response content 不再通过 Aster `MessageContent` 间接消费。
- provider source backend 直接产出 Lime-owned response event / item stream，不再经过 Aster `AgentEvent` projector。

验证记录：

- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-content-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`44 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`168 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。

### 4.41 Provider failure category projection owner

当前状态：

- `model-provider::provider_stream::failure` 已承接 provider telemetry category 到 current failure DTO 的映射：`RuntimeReplyProviderFailureKind::from_category(...)` / `as_category(...)` 与 `RuntimeReplyProviderFailure::from_category(...)`。
- `agent-compat/src/agents/agent.rs` 不再维护 `provider_failure_kind(...)` 或 `ProviderError::* -> RuntimeReplyProviderFailureKind` 本地分支；它只把 Aster `ProviderError` 暴露的 category / retryable / non-retryable rejection 事实投影给 current DTO。
- `agent-compat/src/agents/provider_trace.rs` 不再直接依赖 `crate::providers::errors::ProviderError`；failed trace event 只消费 current `RuntimeReplyProviderFailure`。这一步减少 provider trace 与 Aster provider error enum 的耦合，但不宣称 R2/R3 完成。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::failure` 的 provider failure category projection，归属 Provider stream / Turn failure classification。
- `compat blocker`：Aster `ProviderError` 仍是 reply loop source error；`ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` 仍调用 Aster `Agent::reply_with_provider(...)`。
- `dead / guarded`：在 `agent-compat` 本地恢复 `provider_failure_kind(...)`、`ProviderError::*` 分类表，或让 `provider_trace.rs` 重新直接 import Aster `ProviderError`。
- Thread / Turn / Item 归属：Provider owner 负责 failure category 归一化；Turn owner 负责失败事件生命周期和 retry / completion 决策；Item/read model 只消费已 materialized 的 failed trace / turn status。

退出条件：

- provider/reply loop 迁出 Aster 后，Aster `ProviderError` source adapter 删除，current provider backend 直接产出 current failure DTO / response event。
- `agent-compat` 的 `ProviderTraceEvent` 临时 DTO 随 Aster `AgentEvent` projector 删除；最终 provider trace DTO 继续归 `agent-protocol`，attempt lifecycle 归 `agent-runtime`。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream/failure.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/agents/provider_trace.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-category-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`45 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`169 passed`。
- `note`：该历史刀当时用窄写集 fmt 验证；旧 `ask_bridge.rs` 后续已删除，当前 request_user_input 收口轮次已复跑相关 package fmt。

### 4.42 Provider response context extraction owner

当前状态：

- `model-provider::provider_stream::response_context` 已承接 provider response request-id header extraction：header allowlist、长度限制和可见 ASCII 清洗集中在 provider owner。
- response context DTO 继续复用 `agent-protocol::provider_trace::ProviderTraceResponseContext`，在 `model-provider` 中 re-export 为 `RuntimeReplyProviderResponseContext`，避免在 Aster staging crate 再定义第三套 provider trace response context。
- `agent-compat/src/session_context.rs` 不再维护 `PROVIDER_REQUEST_ID_HEADERS`、`MAX_PROVIDER_REQUEST_ID_LEN` 或 `normalize_provider_request_id(...)`；它只负责从 `reqwest::HeaderMap` 读取 header pairs 并交给 current helper，同时作为未迁 reply loop 的 task-local carrier 暂存 response context。

判定：

- `refactor-aligned current skeleton`：`model-provider::provider_stream::response_context` 的 response context extraction；DTO owner 是 `agent-protocol::provider_trace::ProviderTraceResponseContext`。
- `compat blocker`：Aster `session_context` 仍是 reply loop 内的 task-local carrier；provider/reply loop 未迁出前，Aster provider client 仍通过它记录 provider response headers。
- `dead / guarded`：在 `agent-compat/src/session_context.rs` 恢复 request-id header allowlist、最大长度常量或 request-id 清洗函数。
- Thread / Turn / Item 归属：Provider owner 负责 provider response metadata extraction；Turn trace lifecycle 负责把 response context 附到 trace event；Item/read model 只消费 materialized provider trace。

退出条件：

- provider/reply loop 迁出 Aster 后，response context carrier 应进入 current provider backend / Turn execution context，删除 Aster `session_context` task-local 载体。
- `ProviderReplyExitSource` 删除后，provider response headers 不再通过 Aster provider client 间接进入 trace event。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/response_context.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/session_context.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-category-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`47 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。

### 4.43 Agent compat agents root re-export boundary

当前状态：

- `agent-compat/src/lib.rs` 不再暴露 `pub mod agents;`，只保留 private `mod agents;` 和 root 最小 re-export。
- `lime-agent` 外部引用已从 `aster::agents::*`、`aster::agents::extension::*`、`aster::agents::mcp_client::*` 改为 root `aster::{...}` 过渡面。
- `rg -n "aster::agents::|aster::agents\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。

判定：

- `compat blocker`：root re-export 的 `Agent` / `AgentEvent` / `SessionConfig` 仍服务 R2/R6 reply/event source；`ExtensionConfig` / `McpClientTrait` 仍服务 R7；`NativeToolExecutionHook` / `ToolCallResult` 仍服务 R4。
- `dead / guarded`：外部 `aster::agents::*` public module path。后续不得恢复 `aster::agents::Agent`、`aster::agents::extension::*` 或 `aster::agents::mcp_client::*`。
- Thread / Turn / Item 归属：Turn 应最终拥有 reply/event source 与 live execution lifecycle；MCP gateway 归 `lime-mcp` / App Server；tool call result projection 归 `tool-runtime`；`agent-compat` 不拥有这些 current API。

退出条件：

- R2/R3/R6 删除 Aster reply/event source 后，移除 `Agent` / `AgentEvent` / `SessionConfig` root re-export。
- R7 删除 Aster extension manager / MCP bridge 形状后，移除 `ExtensionConfig` / `McpClientTrait` root re-export。
- R4 删除 Aster native registry / hook adapter 后，移除 `NativeToolExecutionHook` / `ToolCallResult` root re-export。

验证记录：

- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。

### 4.44 Agent compat config root re-export boundary

当前状态：

- `agent-compat/src/lib.rs` 不再暴露 `pub mod config;`，只保留 private `mod config;`。
- 唯一外部 path root 消费已从 `aster::config::paths::initialized_path_root()` 改为 root `aster::initialized_path_root()`。
- `rg -n "aster::config::|aster::config\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。

判定：

- `compat blocker`：root `initialized_path_root()` 只服务 R5/R6 runtime store adapter 的 path root 读取。
- `dead / guarded`：外部 `aster::config::*` public module path。后续不得恢复 `aster::config::paths`、`aster::config::Config` 或 Aster config 子模块 public API。
- Thread / Turn / Item 归属：runtime store root path 最终应随 Thread/runtime store adapter 迁出；provider/settings/config 能力归 App Server / current settings 主链，不归 Aster config。

退出条件：

- R5/R6 迁出 Aster `ThreadRuntimeStore` / runtime store adapter 后，删除 root `initialized_path_root()` re-export 和 Aster config staging 依赖。

验证记录：

- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。

### 4.45 Agent compat providers root re-export boundary

当前状态：

- `agent-compat/src/lib.rs` 不再暴露 `pub mod providers;`，只保留 private `mod providers;`。
- `providers::{base,errors,formats}` 与 `formats::openai_responses` 均已降为 crate-private staging。
- `lime-agent` 外部 provider 引用已从 `aster::providers::*` 改为 root `aster::{Provider, ProviderError, MessageStream, RetryConfig, create_provider, ...}` 过渡面。
- `rg -n "aster::providers::|aster::providers\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。

判定：

- `compat blocker`：root provider re-export 仍服务 R2/R3 provider trait object / provider reply source 最后一跳。
- `dead / guarded`：外部 `aster::providers::*` public module path。后续不得恢复 `aster::providers::base`、`aster::providers::errors`、`aster::providers::formats` 或 concrete provider 子路径。
- Thread / Turn / Item 归属：provider stream / backend / response event owner 是 `model-provider`；Turn execution 只应消费 current provider backend source；Aster provider trait object 不进入 refactor v1 current owner。

退出条件：

- R2/R3 迁出 `ProviderReplyExitSource` / `reply_with_provider(...)` 后，删除 provider root re-export 和 Aster provider trait object source adapter。

验证记录：

- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。

### 4.46 R4 standard native dispatch execution owner

当前状态：

- `tool-runtime::native_dispatch` 已成为标准 dispatch-backed native tools 的执行事实源；`runtime_native_tool_overlay_for_dispatch_name(...)` 用 current dispatch canonical lookup 反查 overlay，避免 `agent-compat` 复制工具名表。
- `tool-runtime::native_dispatch_execution::execute_runtime_native_dispatch_tool(...)` 已承接 dispatch-backed 标准 native tools 的接管、current permission preflight、cancel fail-fast、`runtime_native_dispatch_handle().execute(...)` 和 `CallToolResult` 投影；`agent-compat` 只把 Aster `ToolContext` / current turn context 适配成 `RuntimeNativeDispatchToolRequest`。
- Aster reply loop native branch 在 live-execution hook 之后，先调用 current native dispatch execution；只有未迁工具继续 fallback 到 Aster `ToolRegistry::execute(...)`。
- 这一步只迁出标准 native dispatch 执行路径，不宣称 R4 完成：foreground shell 与 Read/Glob/Grep 后续已迁到 `tool-runtime`，Ask / Skill、gateway-backed tools、MCP / extension bridge、background / sandbox shell 与 Aster `Tool` trait 壳仍是 compat blocker。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::native_dispatch`、`tool-runtime::native_dispatch_execution`、`tool-runtime::native_overlay::runtime_native_tool_overlay_for_dispatch_name(...)` 与 `check_runtime_native_tool_permissions(...)`，归属 Turn tool execution / permission preflight。
- `compat blocker`：Aster `ToolRegistry` / `Tool` / `ToolContext` fallback 仍服务未迁 native tools；`agent-compat` helper 只能做 current request 适配。
- `dead / guarded`：标准 native tools 重新优先走 `registry.execute(...)`、`agent-compat` 恢复本地 overlay/tool-name 表，或把 current approval / permission preflight 写回 Aster session cache、hook 或 pending map。
- Thread / Turn / Item 归属：Turn 拥有 tool dispatch、permission preflight 与 tool lifecycle；Item/read model 只消费 materialized tool call / result projection；Approval / HITL 仍由 App Server RuntimeCore pending action 与 `tool-runtime::execution_approval` current owner 处理。

退出条件：

- 未迁 fallback 工具进入 `tool-runtime` / App Server / `lime-mcp` / `lime-skills` current owner 后，删除 Aster `ToolRegistry` execution fallback 和 root `Tool` / `ToolContext` re-export。
- `ToolCallInputDelta` / tool call item 直接进入 current tool router 后，删除 `agent-compat` reply loop native tool adapter，而不是继续扩展 Aster `Tool` trait 壳。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/native-dispatch-reply-loop-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 1 -- --nocapture`，`13 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/native_dispatch_execution.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch_execution --lib -j 2 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `note`：该历史刀当时未扩大到无关写集；旧 `ask_bridge.rs` 后续已删除，当前 request_user_input 收口轮次已复跑相关 package fmt。

### 4.46 R4 tool execution scheduling policy owner

当前状态：

- `tool-runtime::tool_batch` 已承接 reply loop 工具执行调度中的纯规则：单个 tool call 是否允许并发执行，以及相邻并发安全请求如何合批。
- `agent-compat/src/agents/agent.rs` 只保留 Aster `ToolRequest` source adapter：从旧 `CallToolRequestParam` 提取 tool name 和 optional `command` 后调用 `runtime_tool_call_concurrency_safe(...)` / `partition_tool_execution_requests(...)`。
- 这一步不迁出 Aster `ToolRegistry::execute(...)` 和 Aster `Tool` trait fallback；它只是把 Turn tool scheduling policy 从 staging loop 中移出，避免 reply loop 继续持有工具调度事实源。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::tool_batch::{ToolExecutionScheduleBatch, runtime_tool_call_concurrency_safe, partition_tool_execution_requests}`，归属 Turn tool scheduling / lifecycle policy。
- `compat blocker`：Aster `ToolRequest`、Aster `ToolRegistry`、Aster `Tool` trait 和 tool response assembly 仍服务未迁 reply loop fallback。
- `dead / guarded`：`agent-compat` 本地恢复 `ToolExecutionBatch`、`is_concurrency_safe_tool_request(...)`、`partition_tool_requests_for_execution(...)`，或直接 import shell concurrency analysis 作为 reply loop 调度事实源。
- Thread / Turn / Item 归属：Turn 拥有 tool execution scheduling；Item/read model 只消费 materialized tool lifecycle；Aster `Message` / `ToolRequest` 只是 provider/reply loop 未迁完前的 source adapter。

退出条件：

- R4 迁出 Aster native registry fallback 后，current tool router 应直接接收 current tool call DTO 并使用 `tool-runtime` scheduling policy；删除 `agent-compat` 的 `ToolRequest` adapter、Aster registry fallback 和 Aster `Tool` trait壳。
- R2/R3 provider reply loop 删除后，tool request source 不再经过 Aster `MessageContent::ToolRequest`。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/tool_batch.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/mod.rs" "lime-rs/crates/agent-compat/src/providers/mod.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-batch-schedule-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_batch --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。

### 4.47 Provider trace DTO alias owner

当前状态：

- `agent-protocol::provider_trace` 继续作为 provider trace DTO owner；`model-provider::provider_stream` 现在以 `RuntimeReplyProviderTraceEvent`、`RuntimeReplyProviderTraceStage`、`RuntimeReplyProviderTraceFailure` alias 暴露给 provider stream owner。
- `model-provider::provider_stream::failure::provider_stream_trace_failure(...)` 承接 current provider failure DTO 到 provider trace failure DTO 的投影，避免 Aster staging loop 或 `event_converter` 重新拼 trace failure。
- `agent-compat/src/agents/provider_trace.rs` 不再定义或 alias 本地 `ProviderTraceStage`，也不再定义本地 `ProviderTraceEvent`；只保留 request started / first event / first text / failed / canceled thin wrapper，服务未迁 Aster reply loop source adapter。
- `agent-compat` root 不再 re-export `ProviderTraceStage`；`ProviderTraceEvent` 只因 Aster `AgentEvent::ProviderTrace` public 字段暂留 root surface。
- `agent/src/event_converter.rs` 对 `AgentEvent::ProviderTrace` 直接透传 current DTO，不再恢复 `AsterProviderTraceStage`、`convert_provider_trace_stage(...)` 或字段复制。

判定：

- `refactor-aligned current skeleton`：`agent-protocol` provider trace DTO + `model-provider` provider trace alias / failure projection，归属 Provider stream metadata / trace fact。
- `compat blocker`：Aster `AgentEvent::ProviderTrace` 仍从未迁 `reply_with_provider(...)` 最后一跳传出；provider/reply loop 删除前仍需要 source adapter。
- `dead / guarded`：`agent-compat` 本地 `ProviderTraceStage` enum / alias / root re-export、`ProviderTraceEvent` struct、`event_converter` stage 映射和字段复制。
- Thread / Turn / Item 归属：Provider owner 持有 trace fact / failure projection，Turn adapter 只透传 typed event，Item/read model 消费已 materialized provider trace；Aster stage 字段不进入 refactor v1 current owner。

退出条件：

- provider/reply loop 迁出 Aster 后，删除 `agent-compat` provider trace thin wrapper 和 Aster `AgentEvent` source adapter。
- `ProviderReplyExitSource` 删除后，current provider backend 直接产出 provider trace / response event，不再经过 Aster `AgentEvent::ProviderTrace`。
- `ProviderTraceEvent` root re-export 随 Aster `AgentEvent` source adapter 删除；`ProviderTraceStage` root re-export 已下线，不得恢复。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/failure.rs" "lime-rs/crates/agent-compat/src/agents/provider_trace.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent/src/event_converter.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-trace-dto-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`47 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`git diff --check` 本轮 provider trace DTO 写集。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/agents/provider_trace.rs" "lime-rs/crates/agent-compat/src/agents/mod.rs" "lime-rs/crates/agent-compat/src/lib.rs"`；复跑 `lime-agent request_tool_policy` 仍为 `81 passed`，验证下线 `ProviderTraceStage` root re-export 不影响外部生产编译。

### 4.48 Agent compat session/tools explicit root allowlist

当前状态：

- `agent-compat/src/lib.rs` 不再以 `pub use session::*;` / `pub use tools::*;` 暴露 staging module 全量 surface。
- root 只显式导出 `ThreadRuntimeStore` / `SessionRuntimeSnapshot` / `QueuedTurnRuntime`、`Tool` / `ToolContext` / `ToolRegistry` / `PermissionCheckResult` 等 `lime-agent` adapter 仍命中的 blocker。
- `Agent::runtime_snapshot(...)`、`session::load_shared_session_runtime_snapshot`、`load_managed_session_runtime_snapshot(...)` 与 `load_runtime_snapshot_from_store(...)` public loader 已删除；snapshot 读取的 current owner 是 `thread-store::runtime_store::load_runtime_snapshot_record(...)`，`runtime_snapshot_record_from_aster(...)` / `runtime_thread_snapshot_record_from_aster(...)` test bridge 已删除；root `SessionRuntimeSnapshot` / `ThreadRuntimeSnapshot` 只剩 durable source blocker。
- `session/mod.rs`、`tools/mod.rs`、`tools/search/mod.rs` 同步删除无消费者 re-export，并移除已删除 vendored ripgrep helper 的过期说明。

判定：

- `compat blocker`：显式 root allowlist 仍服务 R4/R5/R6；这些类型不进入 refactor v1 current owner。
- `dead / guarded`：`session::*` / `tools::*` broad root surface 和无消费者 private re-export。
- Thread / Turn / Item 归属：Thread/runtime store blocker 继续迁向 Thread owner；Tool registry / Tool trait blocker 继续迁向 Turn tool lifecycle owner；Item/read model 不再通过 wildcard surface 扩散。

退出条件：

- R4 删除 Aster native registry fallback 后，移除 root `Tool` / `ToolContext` / `ToolRegistry` / `PermissionCheckResult` allowlist。
- R5/R6 删除 Aster runtime store source 后，移除 root `ThreadRuntimeStore` / `SessionRuntimeSnapshot` / `ThreadRuntimeSnapshot` / `QueuedTurnRuntime` allowlist。

验证记录：

- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。

### 4.49 Provider input modality policy owner

当前状态：

- `model-provider::provider_stream::image_input` 已承接 input modality metadata 解析和 image input allowed 判定，暴露 `provider_stream_input_modality_policy_from_metadata(...)`、`provider_stream_input_modality_policy_allows_image_input(...)` 与 `provider_stream_metadata_allows_image_input(...)`。
- `agent-compat/src/agents/prompt_input_modalities.rs` 不再维护 `input_modality_policy_*` parser；它只把 Aster `MessageContent::Image` 与 RMCP image content 降级为文本占位，服务未迁 provider prompt source adapter。

判定：

- `refactor-aligned current skeleton`：`model-provider` provider/media input policy，归属 Provider stream / media lowering owner。
- `compat blocker`：Aster `Message` / RMCP `Content` 仍是未迁 reply loop 的 provider prompt source adapter。
- `dead / guarded`：`agent-compat` 本地 input modality parser 和重复 metadata key walk。
- Thread / Turn / Item 归属：Provider owner 负责 provider/media capability 与 input policy；Turn adapter 只做未迁 source lowering；Item/read model 不消费 Aster input modality parser。

退出条件：

- R2/R3 provider/reply loop 删除后，provider prompt source 不再经过 Aster `Message`；`prompt_input_modalities.rs` 随 Aster reply source adapter 一并删除。
- `lime-agent` 侧现有 `model_request_policy` parser 后续应继续收敛到 provider/current policy owner，避免再次形成平行 parser。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/image_input.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/agents/prompt_input_modalities.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/input-modality-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`49 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。

### 4.50 BashTool root surface retired from external tests

当前状态：

- `lime-agent/tests/windows_shell_runtime.rs` 不再通过 `aster::BashTool` 验证 Windows shell fallback，改为直接调用 `tool-runtime::shell_runtime::build_platform_shell_command(...)`。
- `agent-compat/src/lib.rs` root allowlist 不再 re-export `BashTool`。
- 后续 R4 shell deletion 已删除 `agent-compat/src/tools/{bash.rs,powershell_tool.rs,task.rs}`；`tool-runtime::shell_execution` 接管 `BashTool` / `PowerShellTool` legacy alias。

判定：

- `refactor-aligned current skeleton`：`tool-runtime::shell_runtime` 作为平台 shell command 构造 owner，归属 Turn tool execution。
- `dead / deleted / guarded`：外部 `aster::BashTool` root surface、测试入口、内部 `BashTool` / `PowerShellTool` / `TaskManager` registry fallback。
- `compat blocker`：generic Aster `Tool` trait registry fallback，退出条件是 MCP source adapter / true workspace sandbox backend / root allowlist 继续迁出。

退出条件：

- 已完成：Bash / PowerShell execution 与 legacy shell alias 进入 current tool router 后，Aster 内部 `BashTool` / `PowerShellTool` / `TaskManager` 已删除；后续只剩 generic registry fallback 和 root blocker 继续收口。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/tests/windows_shell_runtime.rs" "lime-rs/crates/agent-compat/src/lib.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `blocked-by-env`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --target x86_64-pc-windows-msvc --test windows_shell_runtime -j 2` 在 `ring` 的 C 编译阶段因 `assert.h` missing 失败，未进入本次测试代码；需要完整 Windows C target toolchain 后复跑。

### 4.51 Aster concrete tool implementation surface made crate-private

当前状态：

- `agent-compat/src/tools/mod.rs` 不再公开 re-export `BashTool` / `PowerShellTool` / `ReadTool` / `GlobTool` / `GrepTool` / `AskTool` / `DEFAULT_ASK_TIMEOUT_SECS`。
- `agent-compat/src/tools/file/{mod.rs,read.rs}` 与 `agent-compat/src/tools/search/{mod.rs,glob.rs,grep.rs}` 已随 Read / Glob / Grep current owner 接管而删除；`SharedFileReadHistory` 不再存在。
- `TaskManager` 不再作为内部 import；`agent-compat/src/tools/task.rs` 已随 Bash / PowerShell background current owner 接管而删除。
- `register_all_tools(...)` 只保留 crate-private 空 fallback registration 函数；remaining model-visible built-ins 已在 registry fallback 前由 current hooks 执行。
- 公开面只保留 `Tool` / `ToolRegistry` / `ToolContext`、`ToolRegistrationConfig` 和 permission 类型等最小 blocker；`AskCallback` alias 已删除，`AskRequest` / `AskOption` / `AskQuestion` DTO 已归 current `tool-runtime::request_user_input` / `agent-runtime::request_user_input`。

判定：

- `dead / deleted / guarded`：Aster 具体工具实现 public surface、Bash / PowerShell / Task registry fallback、Read / Glob / Grep 壳、Skill wrapper 和 gateway-backed Aster tool 壳；这些类型不得再作为 `aster` 对外 API 或 registry fallback。
- `compat blocker`：generic crate-private Aster `Tool` trait / registry fallback，退出条件是 R4 current tool router 接管 MCP source adapter、真实 workspace sandbox backend 和剩余 root allowlist；request_user_input、shell、Read/Glob/Grep、Skill 和 gateway-backed tools 已由 current executor 接管。
- `refactor-aligned current`：`tool-runtime::native_dispatch`、`tool-runtime::request_user_input` 与后续 current gateway executor。
- Thread / Turn / Item 归属：Turn tool execution 只消费 current tool surface / dispatcher；具体 Aster `*Tool` 类型只是未迁 source adapter，不进入 Item/read model 或 App Server protocol。

退出条件：

- R4 native registry 迁出后，删除 generic `register_all_tools(...)` fallback、`ToolRegistry` / `Tool` / `ToolContext` / `PermissionCheckResult` root allowlist；root `aster` dependency 才能继续向删除收敛。
- `RequestUserInputCallback` 配置字段在 request_user_input 直接由 current Turn executor / App Server action-required 主链触发后删除。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/tools/mod.rs" "lime-rs/crates/agent-compat/src/tools/file/mod.rs" "lime-rs/crates/agent-compat/src/tools/search/mod.rs"`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-impl-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`，仅有既有 `SessionPlanModeState` unused import warning。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning。

### 4.4.11 R4 team tool 具体实现 public surface 下线

当前状态：

- `agent-compat/src/tools/mod.rs` 不再公开 re-export `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool`，后续也不再声明 `mod team_tools`。
- `agent-compat/src/tools/team_tools.rs` 已删除；剩余 team runtime storage adapter 位于 `agent-compat/src/agents/team_runtime.rs`，只服务 `tool-runtime::collab_agent` current execution 的 source lowering。
- `SpawnAgentRequest` / `SpawnAgentResponse` 归 `tool-runtime::collab_agent`；`AgentControlToolConfig` 仍因 callback bridge 暂留，后续随 `agents/collab_runtime.rs` 删除。

判定：

- `dead / guarded`：Aster team 具体工具实现 public surface，外部不得恢复 `aster::TeamCreateTool` / `aster::TeamDeleteTool` / `aster::ListPeersTool`。
- `compat blocker`：`agents/team_runtime.rs` 内 Aster team extension-data / session-store source adapter。
- `refactor-aligned current`：team / multi-agent 执行应进入 Turn owner（`agent-runtime` / `tool-runtime` current executor），协作状态和工具结果经 Item/read model 投影。

退出条件：

- Team/Agent/SendMessage 执行壳迁入 current owner 后，删除 Aster `team_tools.rs` 的 `Tool` trait 实现和 registry fallback。
- `asterMigrationBoundary.test.ts` 持续禁止 team 具体工具类型 public re-export 与外部 `aster::*Tool` 引用回流。

### 4.52 Aster session plan-mode extension dead deletion

当前状态：

- `agent-compat/src/session/plan.rs` 已删除，`session/mod.rs` 不再声明 `mod plan;`。
- `SessionPlanModeState` / `session_plan_mode` extension 没有 Lime 外部生产消费者；Codex-style plan / checklist 能力已经归 `tool-runtime::update_plan` 与 App Server / 前端计划轨。

判定：

- `dead / deleted / forbidden-to-restore`：Aster session plan-mode extension 文件、`mod plan;`、`SessionPlanModeState`。
- `refactor-aligned current`：`tool-runtime::update_plan`，归 Turn tool execution / Item read model 投影链。
- `compat blocker`：其余 Aster `SessionStore` / `ThreadRuntimeStore` / runtime DTO 仍按 R5/R6 继续迁出。

退出条件：

- `asterMigrationBoundary.test.ts` 持续禁止恢复 `session/plan.rs`、`mod plan;`、`SessionPlanModeState`。
- 后续计划能力只允许沿 `tool-runtime::update_plan`、App Server event 和前端计划轨演进，不得恢复 Aster session extension。

### 4.53 R4 collab agent tool surface owner

当前状态：

- Agent / SendMessage / Team / ListPeers 的工具名、描述、DTO、schema、结构化消息和 team helper 已归 `tool-runtime::collab_agent`。
- `agent-compat/src/tools/agent_control.rs` 已删除，剩余 session/team callback adapter 迁到 `agent-compat/src/agents/collab_runtime.rs`；`SpawnAgentTool` / `SendInputTool` 与注册函数已删除，Agent / SendMessage 不再通过 Aster `Tool` trait 壳进入 registry。
- SendMessage 输出/metadata、unsupported bridge peer 返回，以及 TeamCreate / TeamDelete / ListPeers metadata 已归 `tool-runtime::collab_agent` projection 子模块。
- Agent spawn request 归一化与结果 metadata 投影已归 `tool-runtime::collab_agent`；`agent-compat` 不再本地构造 `SpawnAgentRequest { ... }` 或 agent metadata。
- SendMessage peer address parse / scheme contract 直接由 `tool-runtime::collab_agent` 提供；旧 `agent-compat/src/tools/peer_address_surface.rs` re-export helper 已删除。
- SendMessage peer target normalization、summary requirement、structured cross-session/broadcast rejection、shutdown response 和 plan approval sender 校验已归 `tool-runtime::collab_agent::validation`。
- Agent spawn / SendMessage 执行编排已归 `tool-runtime::collab_agent::execution`：参数 parse、target normalization、team-lead validation、message 构造、callback dispatch、routing/result projection 和 metadata 包装由 Turn tool owner 承接。
- `agent-compat` 不再经 `tools/mod.rs` 代理 re-export `SpawnAgentRequest` / `SpawnAgentResponse`；未迁完的 `agent.rs` 直接消费 `tool-runtime::collab_agent` current DTO。
- `agent-compat/src/agents/collab_runtime.rs` 只实现 `CollabAgentExecutionBackend` 的 session/team resolver 与 callback adapter；`agents/team_runtime.rs` 的 TeamCreate / TeamDelete / ListPeers execution owner 已在 4.55 迁到 `tool-runtime::collab_agent::execution`，自身只保留 team/session 状态接线与 storage adapter，不再保留 Aster `Tool` trait 实现。
- `tool-runtime::collab_agent` 还承接 `collab_agent_canonical_tool_name(...)`、`collab_agent_tool_definition(...)` 与 `collab_agent_tool_definitions(...)`；`agent.rs` 的 `list_tools` 从 current definitions 注入协作工具，并在执行时先走 current collab canonical lookup。
- `agent-compat/src/agents/agent.rs` 的 native branch 已在 Aster `registry.execute(...)` 前优先调用 `execute_runtime_collab_tool(...)`，其中 `SendMessage` 走 current collab runtime adapter，`TeamCreate` / `TeamDelete` / `ListPeers` 走 current team runtime adapter；`Agent` 特殊 nested subagent 分支仍单独暂留，后续随 R4/R2 继续迁出。

判定：

- `refactor-aligned current`：`tool-runtime::collab_agent::{execution,projection,validation}`，归 Turn tool surface / collaboration tool contract / tool execution orchestration。
- `compat blocker`：callback adapter、session/team resolver 与 R5/R6 session/team storage adapter；`Agent` 特殊 nested subagent 语义还需另行迁入 current Turn owner。
- `dead / guarded`：在 `agent-compat` 恢复本地协作工具 DTO、schema builder、canonical / definition owner、Agent spawn request/projection、SendMessage validation / execution owner、peer address re-export helper、公开具体工具实现类型、Aster `Tool` trait 壳或 root/public re-export。

退出条件：

- Aster `SpawnAgentTool` / `SendInputTool` / `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` 和协作工具注册壳已删除；后续不得恢复。
- `asterMigrationBoundary.test.ts` 持续要求协作工具 surface 只来自 `tool-runtime::collab_agent`。
- `asterMigrationBoundary.test.ts` 持续禁止 `agent-compat` 恢复本地 SendMessage / Team result projection。
- `asterMigrationBoundary.test.ts` 持续禁止 `agent-compat` 恢复本地 Agent spawn request/projection。
- `asterMigrationBoundary.test.ts` 持续禁止 `agent-compat` 恢复本地 SendMessage validation 分支。
- `asterMigrationBoundary.test.ts` 持续禁止 `agent_control.rs` 恢复本地 SendMessage 投递循环、`MessageRouting` / `SendMessageDelivery` 构造和 `project_*` 调用。
- `asterMigrationBoundary.test.ts` 持续禁止恢复 `agent-compat/src/tools/peer_address_surface.rs`。
- `asterMigrationBoundary.test.ts` 持续禁止恢复 `agent_control.rs` 对 current collab DTO 的 `pub use` 代理出口，并禁止旧 `agent-compat/src/tools/agent_control.rs` 路径恢复。
- `asterMigrationBoundary.test.ts` 持续要求 reply loop 在 Aster `registry.execute(...)` 前调用 current collab executor。

### 4.54 R4 Bash / PowerShell foreground execution owner

当前状态：

- `tool-runtime::shell_execution` 已承接 Bash / PowerShell 前台执行 owner：参数解析、shell permission、missing read target / blocked sleep / Windows WSL path preflight、foreground subprocess、bounded output、decode / truncation metadata 和 `CallToolResult` projection。
- `tool-runtime::shell_execution` 已承接 Bash / PowerShell background start first slice：生成 task id、写入 `std::env::temp_dir()/agent_tasks/<task_id>.log`、异步监控 stdout/stderr、返回 `task_id` / `output_file` / `background=true` metadata；现有模型可见读取链继续走 Read / file read owner。
- `tool-runtime::shell_execution` 已接管 legacy shell alias：`BashTool`、`Shell`、`developer__shell`、`mcp__system__shell`、`shell_command`、`exec_command`、`local_shell_call` 和 `PowerShellTool`；Bash / PowerShell 参数解析接受 `command` / `cmd` / `script`，不再需要 Aster registry fallback 兼容旧模型可见形状。
- `tool-runtime::shell_execution` 已接管 workspace sandbox shell 的 fail-closed guard：`RuntimeShellToolRequest.has_workspace_sandbox=true` 时返回 current `CallToolResult` error 和 `current_workspace_sandbox_guard` metadata，不再 `return None` 回落到 Aster registry；旧 Aster sandbox executor 只是空成功 stub，不能作为 refactor v1 current backend。
- `tool-runtime::shell_execution` 已接管非 full-access warning shell 的 current permission guard：已知 Bash / PowerShell 的 `RequiresConfirmation` 返回 `current_shell_permission_guard` structured result，不再 `return None` 回落到 Aster registry；后续真实 HITL 只能接 App Server RuntimeCore pending action / `agentSession/action/respond` 主链。
- `agent-compat/src/agents/agent.rs` 在 live-execution hook 后先调用 `execute_runtime_shell_tool(...)`，再调用 `execute_runtime_native_dispatch_tool(...)`，最后才 fallback 到 Aster `registry.execute(...)`。
- `agent-compat/src/tools/{bash.rs,powershell_tool.rs,task.rs}` 已删除；`tools/mod.rs::register_all_tools(...)` 不再注册 Bash / PowerShell / Task fallback，`tools/registry.rs::DEFAULT_NATIVE_ALIAS_PAIRS` 不再声明 shell alias ownership。
- `agent-compat/src/sandbox.rs` 只保留 `SandboxConfig` marker 供 Aster `ToolContext.workspace_sandbox` 降到 current guard；空成功 `execute_in_sandbox_with_options(...)`、`ExecutorOptions` / `ExecutorResult`、`SandboxType` 和 Aster output buffer 已删除。
- full-access 不确认语义已进入 current owner：`approval_policy=never`、`sandbox_policy=danger-full-access` 或 turn metadata `accessMode=full-access` 时，warning shell command 不回落到 Aster approval / registry。
- `AGENT_TERMINAL=1` 与 `AGENT_BACKGROUND=1` 是 current shell execution 环境标记；live shell process、tool orchestrator、remaining Bash / PowerShell fallback 和 background task helper 均不得恢复 `ASTER_TERMINAL` / `ASTER_BACKGROUND`。

判定：

- `refactor-aligned current`：`tool-runtime::shell_execution`，归属 Turn tool execution / permission preflight / process result projection。
- `compat blocker`：真实 workspace sandbox backend、MCP / extension bridge、generic Aster `ToolRegistry` fallback 和 root `Tool` / `ToolContext` / `PermissionCheckResult` allowlist；这些仍阻塞 root `aster` dependency 删除。
- `dead / deleted / guarded`：Aster shell execution owner、Aster Bash/PowerShell/Task registry fallback 文件、Aster shell alias registry ownership、Aster empty sandbox executor / output buffer / `SandboxType`、Aster approval hook/cache/pending map、`ASTER_TERMINAL` 环境标记，以及在 `agent-compat` 中恢复 shell permission / process execution 编排。
- Thread / Turn / Item 归属：Thread 只保存 session/runtime policy；Turn 负责 shell execution 和 approval/sandbox 决策输入；Item/read model 只消费 materialized tool result / metadata，不通过 Aster `ToolResult` 旁路新增 approval 事实。

退出条件：

- 真实 workspace sandbox backend 和 MCP source adapter 迁到 current owner 后，删除 generic Aster `ToolRegistry::execute(...)` fallback、root `Tool` / `ToolContext` / `PermissionCheckResult` allowlist；Aster 内部 `BashTool` / `PowerShellTool` / `TaskManager` 已删除，不得作为退出条件重新引入。
- App Server / RuntimeCore approval session cache 继续作为 HITL owner；不得为了完成 R4 在 Aster vendor 或 Aster adapter 中新增 session cache、pending map 或 approval hook。

验证记录：

- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/shell_execution.rs" "lime-rs/crates/tool-runtime/src/shell_execution/tests.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`7 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：Gate B Electron CDP `approval-request-full-access`：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 240000 --cdp-port 9232 --prefix claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`；summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper-summary.json`。
- `passed`：Gate A 聚合 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 approval resume/decline/cancel/full-access、inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `passed`：background first slice 迁入后，`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 1 -- --nocapture`，`7 passed`，覆盖 background current start、`output_file` metadata 和 `agent_tasks` 非 Aster 路径。
- `passed`：background first slice 迁入后，`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning；`asterMigrationBoundary.test.ts` 为 `173 passed`。
- `passed`：后续命名收口把 current / fallback shell 执行写入的环境标记统一为 `AGENT_TERMINAL`，并由 `asterMigrationBoundary.test.ts` 禁止 `ASTER_TERMINAL` 回流。
- `passed`：命名收口后，`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=".lime/cargo-target/read-search-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 与同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1` 通过。
- `passed`：workspace sandbox guard 变更后，`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 1 -- --nocapture`，`8 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`；`asterMigrationBoundary.test.ts`，`175 passed`。
- `passed`：shell warning current guard 变更后，`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`；`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/shell-no-warning-fallback" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`8 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`176 passed`；`npx prettier --check` 与 scoped `git diff --check` 通过。
- `passed`：shell registry fallback 文件删除后，`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/shell-registry-fallback-delete" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`9 passed`；`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/aster-shell-registry-delete" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过；`asterMigrationBoundary.test.ts`，`176 passed`。后续本小节又删除 `agent-compat` 空 sandbox executor，消除 `sandbox.rs` unused re-export warning。

### 4.55 R4 collab team execution owner

当前状态：

- `tool-runtime::collab_agent::execution` 已承接 TeamCreate / TeamDelete / ListPeers 的 runtime-neutral execution owner：参数解析、team name 冲突处理、lead 校验、active member 拒绝删除、membership cleanup 调度、peer output 与 metadata projection。
- `agent-compat/src/tools/team_tools.rs` 已删除，剩余 Aster session/team storage DTO 转换、reachable member 查询和 local peer 查询 adapter 迁到 `agent-compat/src/agents/team_runtime.rs`；`TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` Aster `Tool` trait 壳已删除。
- `agent-compat/src/agents/agent.rs` 已在 Aster `registry.execute(...)` 前优先调用 `execute_team_runtime_tool(...)`，TeamCreate / TeamDelete / ListPeers 不再等到 Aster registry fallback 才执行。
- `asterMigrationBoundary.test.ts` 禁止 `team_tools.rs` 恢复 TeamCreate / TeamDelete / ListPeers 输出构造、metadata 投影和本地 cleanup loop。

判定：

- `refactor-aligned current`：`tool-runtime::collab_agent::execution`，归属 Turn tool lifecycle / multi-agent collaboration execution。
- `compat blocker`：`agents/team_runtime.rs` 内的 Aster `TeamSessionState` / `TeamMembershipState` storage adapter；这些仍阻塞 root `aster` dependency 删除。
- `dead / guarded`：`agent-compat` 本地 team mutation / output owner 和 Team Aster `Tool` trait 壳。
- Thread / Turn / Item 归属：Thread 仍保存 team membership extension data；Turn 执行 TeamCreate / TeamDelete / ListPeers；Item/read model 只消费 materialized tool output / metadata，不再从 Aster team tool 旁路推断协作状态。

退出条件：

- `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` Aster `Tool` trait 壳已删除；后续不得恢复。
- R5/R6 session/runtime store 迁完后，删除 Aster `TeamSessionState` / `TeamMembershipState` storage adapter 和 root `aster` dependency。

验证记录：

- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/collab_agent.rs" "lime-rs/crates/tool-runtime/src/collab_agent/execution.rs" "lime-rs/crates/agent-compat/src/tools/team_tools.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/collab-agent-team-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`19 passed`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1`。
- `passed`：后续体量收口将 `execution.rs` inline tests 拆到 `collab_agent/execution_tests.rs` 后，`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/collab_agent/execution.rs" "lime-rs/crates/tool-runtime/src/collab_agent/execution_tests.rs"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture` 仍为 `19 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 为 `81 passed`；`asterMigrationBoundary.test.ts` 为 `172 passed`。
- `passed`：删除协作 Aster `Tool` trait 壳后，`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture` 为 `20 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 为 `81 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools --lib -j 1 -- --nocapture` 为 `102 passed`；`asterMigrationBoundary.test.ts` 为 `172 passed`。
- `passed`：reply-loop current executor 接管后，`rustfmt --edition 2021 --check` 覆盖 `agent.rs`、`agent_control.rs`、`team_tools.rs`、`tools/mod.rs`；`CARGO_TARGET_DIR=".lime/cargo-target/collab-reply-loop-takeover" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过；同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib -j 1` 通过；同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`20 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。

### 4.56 R4 Read / Glob / Grep execution owner

当前状态：

- `tool-runtime::file_read_execution` 已承接 Read 的 Turn tool execution owner：路径解析、文本 line-numbered 输出、document preview、SVG / Notebook 文本抽取、图片 / PDF retired fail-closed 和 result metadata projection。
- `tool-runtime::file_search_execution` 已承接 Glob / Grep 的 Turn tool execution owner：Glob pattern / exclude / mtime 排序 / truncation，Grep regex parse、content / files_with_matches / count 模式、hidden 文件策略、binary skip 和 result metadata projection。
- `agent-compat/src/agents/agent.rs` 已在 Aster `registry.execute(...)` 前优先调用 current read/search executor；`agent-compat` 只传递 working directory 与 cancellation token，不持有文件读取或搜索执行规则。
- `agent-compat/src/tools/file/{mod.rs,read.rs}` 与 `agent-compat/src/tools/search/{mod.rs,glob.rs,grep.rs}` 已删除；`agent-compat/Cargo.toml` 已删除旧 ReadTool 专用 `document-preview` burn-down 依赖。
- `asterMigrationBoundary.test.ts` 禁止 current owner import Aster，禁止 reply loop 把 Read / Glob / Grep 放回 registry 优先，禁止恢复 Aster file/search 壳、`SharedFileReadHistory` 或 `agent.rs` 本地文件读取 / 搜索执行 owner。

判定：

- `refactor-aligned current`：`tool-runtime::{file_read_execution,file_search_execution}`，归属 Turn tool lifecycle / tool execution。
- `compat blocker`：R4 剩余 MCP source adapter、真实 workspace sandbox backend、通用 `ToolRegistry` / `Tool` / `ToolContext` fallback 和 root permission allowlist；这些仍阻塞 root `aster` dependency 删除。
- `dead / deleted / guarded`：Aster Read/Glob/Grep `Tool` trait 壳、file/search 模块、`SharedFileReadHistory`、Aster Read image/PDF multimodal payload、`agent-compat` 本地 Read / Glob / Grep execution owner 和 `agent-compat` 的旧 `document-preview` burn-down 依赖。
- Thread / Turn / Item 归属：Thread 只提供工作目录 / session context；Turn 负责 Read/Glob/Grep 执行；Item/read model 只消费 materialized tool result / metadata，不再从 Aster read/search implementation 推断状态。

退出条件：

- R4 registry fallback 全部迁完后，删除剩余 MCP source adapter、真实 workspace sandbox backend 相关临时 Aster `Tool` 壳与 registry fallback；Read / Glob / Grep / Bash / PowerShell / Task 壳不得恢复。
- `document-preview` 只能由 current `tool-runtime::file_read_execution` 直接依赖；不得重新加回 `agent-compat`。

验证记录：

- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/file_read_execution.rs" "lime-rs/crates/tool-runtime/src/file_search_execution.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/file-search-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_read_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_search_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：删除 Aster file/search 壳后，`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。

### 4.57 R4 request_user_input execution owner

当前状态：

- `tool-runtime::request_user_input` 已承接 `request_user_input` 的 tool surface current DTO、strict input schema、parse / validation、model-visible definition、callback timeout 和 reply-loop execution helper；response extraction / elicitation schema / result normalization 已拆到 `request_user_input/response.rs`，主文件低于 `800` 行预警线。
- `agent-runtime::request_user_input` 只保留 Turn-side `RequestUserInputGateway` runner，并 re-export current `RequestUserInputCallback` 类型；它不反向承接 Aster registry。
- `agent-compat/src/tools/ask.rs` 已删除，`register_all_tools(...)` 不再注册 Aster `AskTool`；`agent-compat/src/agents/agent.rs` 只保存显式注入的 callback 配置并在 registry fallback 前调用 `execute_request_user_input(...)`，不再提供默认 callback。
- `tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 已从旧 `"Ask"` 迁到 current `request_user_input` 名称。
- `agent-compat/src/action_required_manager.rs` 已删除无 scope `request_and_wait(...)` / `submit_response(...)` convenience；迁移期只允许 `request_and_wait_scoped(...)`、`submit_response_scoped(...)` 与 `drain_messages_for_scope(...)` 作为 scope adapter。

判定：

- `refactor-aligned current`：`tool-runtime::request_user_input` + `agent-runtime::request_user_input`，归属 Turn HITL / action-required lifecycle。
- `compat blocker`：`agent-compat` 显式 callback 配置字段与 `lime-agent/src/request_user_input_bridge.rs` 到 ActionRequiredManager 的 scope adapter；退出条件是 request_user_input 直接由 current Turn/App Server action主链触发，不再需要 root Aster callback。
- `dead / deleted / guarded`：Aster `AskTool` 文件、Aster registry 注册、旧 `"Ask"` allowlist 名、旧 `AskRequest` / `AskCallback` 命名、本地 DTO/schema/parse/validation/normalization/execution owner、隐式默认 callback，以及 `ActionRequiredManager` 无 scope convenience。
- Thread / Turn / Item 归属：Turn 拥有 request_user_input lifecycle；Thread 只提供 session/thread/turn scope；Item/read model 只消费 action_required / answer projection 和 evidence，不从 Aster Tool trait 推断用户输入状态。

退出条件：

- R4 剩余 MCP source adapter、真实 workspace sandbox backend 和 root allowlist 全部迁出后，删除 Aster `ToolRegistry` / `Tool` / `ToolContext` fallback。
- action-required current 主链完成后，删除 `agent-compat` 的 `RequestUserInputCallback` 配置字段；root `AskCallback` re-export 已删除并不得恢复。

验证记录：

- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime request_user_input --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime request_user_input --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_user_input_bridge --lib -j 1 -- --nocapture`，`3 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 request_user_input Rust 写集。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：Gate A `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 approval resume/decline/cancel/full-access no prompt、Inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `passed`：Gate B Electron CDP `approval-request-full-access` 通过，summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-request-user-input-r4-summary.json`。

### 4.58 R4 MCP registry wrapper removal

当前状态：

- `agent-compat/src/tools/registry.rs` 不再保存 MCP tool wrapper，不再提供 `register_mcp` / `unregister_mcp` / `contains_mcp` / `mcp_tool_count` / `mcp_tool_names` / `is_mcp` 这类 registry MCP API。
- `Agent::register_mcp_tool(...)` 无生产调用且已删除；MCP tool model-visible surface 仍来自 `ExtensionManager::get_prefixed_tools(...)`，执行仍来自 `extension_manager.dispatch_tool_call(...)`。
- `tool-runtime::mcp_resource` / `tool-runtime::tool_search` 与 App Server MCP gateway 继续作为 current MCP resource / tool search owner；本刀不把 Aster extension manager 宣称为完成态。

判定：

- `dead / guarded`：Aster `ToolRegistry` MCP wrapper / register / query 面。
- `compat blocker`：Aster extension manager / MCP client bridge 仍是未迁 reply loop 的 MCP source adapter。
- `refactor-aligned current`：`lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search}`，归属 Turn tool lifecycle 与 Item tool inventory projection。

退出条件：

- MCP bridge / extension execution 继续迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager / MCP client bridge adapter。
- 不得为了补工具列表或 tool search，把 MCP tool definition 再塞回 Aster `ToolRegistry` 或 Aster `Tool` trait wrapper。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`；该守卫现在显式读取 `agent-compat/src/tools/registry.rs` 与 `tools/mod.rs`，防止 MCP wrapper/register/query API 回流。
- `passed`：scoped `git diff --check` 覆盖 MCP registry owner 写集。

### 4.59 R4 MCP source adapter public surface shrink

当前状态：

- `agent-compat` root 不再 re-export `ExtensionManager`，`agents/mod.rs` 不再 re-export `ExtensionManager`，`agents::extension_manager` 降为 `pub(crate)` staging module。
- `code_execution_extension.rs` 仍可作为内部 extension/MCP caller adapter 使用 `ExtensionManager`，但必须显式走 `crate::agents::extension_manager::ExtensionManager`，不得依赖 agents 顶层 re-export。
- `lime-agent/src/native_tools/runtime_overlay.rs::NativeRegistration::name()` 已删除；gateway-backed tool registration 不再需要该无引用 accessor，也不恢复 Aster registry 事实源。

判定：

- `dead / guarded`：`aster::ExtensionManager` root re-export、`agents::ExtensionManager` re-export、`pub mod extension_manager` public module surface 和 agent-compat 内部 `crate::agents::ExtensionManager` 捷径。
- `compat blocker`：Aster extension manager / MCP client bridge 仍是未迁 reply-loop MCP source adapter。
- `refactor-aligned current`：`lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search}`，归属 Turn tool lifecycle 与 Item tool inventory projection。

退出条件：

- MCP bridge / extension execution 继续迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager / MCP client bridge adapter。
- 不得因为 `ExtensionManager` 仍为内部 adapter，就恢复任何 root/public `aster::ExtensionManager` API。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`174 passed`。

### 4.59.1 R4 MCP extension/client module surface shrink

当前状态：

- `agent-compat/src/agents/mod.rs` 的 `extension` 与 `mcp_client` 已降为 `pub(crate)` staging module，外部不再能通过 `aster::agents::extension::*` 或 `aster::agents::mcp_client::*` 消费这些类型。
- root `aster::{ExtensionConfig, McpClientTrait, McpClientError}` 仍暂留为最小过渡 re-export，只服务 `lime-agent/src/mcp_bridge.rs`、tool inventory adapter 和 Aster extension manager 未迁完前的 source adapter。
- `tool-runtime::tool_extension::RuntimeExtensionConfig` 继续作为 extension/inventory current DTO；MCP request forwarding 继续归 `lime-mcp::McpBridgeClient`，不是 Aster `mcp_client.rs`。

判定：

- `dead / guarded`：`pub mod extension;`、`pub mod mcp_client;`、外部 `aster::agents::extension::*` / `aster::agents::mcp_client::*` module path。
- `compat blocker`：root `ExtensionConfig` / `McpClientTrait` / `McpClientError` 与 Aster extension manager source adapter。
- `refactor-aligned current`：`lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`，归属 Turn tool lifecycle 与 Item tool inventory projection。

退出条件：

- MCP bridge / extension execution 迁到 current gateway 后，删除 root re-export、`McpClientTrait` adapter、Aster `ExtensionConfig` source DTO 和 Aster extension manager。
- 任何后续 inventory / gateway / App Server 能力不得恢复 `aster::agents::{extension,mcp_client}` module path。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-module-private" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。

### 4.60 R4 Skill execution native hook owner

当前状态：

- `tool-runtime::skill_execute` 已承接 Skill execution envelope、session access gate、workspace skill source lookup、runtime contract preflight、调用参数规范化和 result metadata 合并。
- `lime-agent/src/tools/skill_tool_gate.rs::execute_current_skill_tool_request(...)` 在 `NativeToolExecutionHook` 中先于 live shell 与 Aster `registry.execute(...)` 执行 `Skill`，并把 `RuntimeSkillExecutionResult` 通过 `tool-runtime::tool_result_projection` 投影成 MCP `CallToolResult`。
- `LimeSkillTool` 临时 Aster `Tool` trait wrapper 已删除；Skill model-visible registration 由 current `skill_tool_definition()` / `Agent::list_tools` 提供，native hook 执行由 `execute_current_skill_tool_request(...)` 接管；剩余 provider bridge 是 `CurrentSessionSkillProvider`。

判定：

- `refactor-aligned current`：`tool-runtime::skill_execute` + `lime-agent` native hook first slice，归属 Turn Skill execution lifecycle。
- `compat blocker`：`lime-agent::tools::CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call，最终随 R2/R3 provider backend 迁出后删除。
- `dead / guarded`：在 `agent-compat` 恢复 Skill registry / loader / executor / `loadSkill` platform extension，恢复 `LimeSkillTool` Aster `Tool` trait wrapper，或让 Skill 执行重新优先走 Aster `registry.execute(...)`。
- Thread / Turn / Item 归属：Thread 只提供 session / workspace skill source scope；Turn 执行 Skill prompt/workflow 与 gate/preflight；Item/read model 只消费 materialized tool result / metadata，不从 Aster Skill wrapper 推断运行时事实。

退出条件：

- Skill model-visible surface 已由 current owner 注入，`LimeSkillTool` Aster `Tool` trait wrapper 已删除；provider bridge 随 R2/R3 provider backend 迁出后删除。
- MCP source adapter、真实 workspace sandbox backend 与 provider/session source 继续迁完后，再删除通用 Aster `ToolRegistry` / `ToolContext` fallback。

验证记录：

- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool_gate --lib -j 1 -- --nocapture`，`10 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime --package aster-core -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。

### 4.61 R4 gateway-backed native execution owner

当前状态：

- `tool-runtime::gateway_dispatch_execution` 已承接 gateway-backed native tools 的 Turn execution owner：current execution registration、canonical lookup、permission check、cancel fail-fast、RuntimeToolExecutor 调用和 MCP `CallToolResult` 投影。
- `lime-agent/src/native_tools/gateway_bridge.rs` 只从 `NativeDispatch.surfaces()` 生成 `RuntimeGatewayToolExecutionRegistration`；`NativeRegistration::gateway(...)` 只携带 current definition 与 current execution registration，注册时调用 `register_runtime_gateway_tool_execution(...)` 后立即返回，不再创建或注册 Aster `Tool` trait 壳。
- `agent-compat/src/agents/agent.rs` 只保存 `RuntimeGatewayToolExecutionRegistry`，并把 Aster `ToolContext` / current turn context 适配成 `RuntimeGatewayDispatchToolRequest`；reply loop 在标准 native dispatch 和 Aster registry fallback 前调用 current gateway executor。
- `AgentRuntimeState.native_tool_definitions` 与 `Agent::list_tools(...)` 已从 current execution registration / definitions snapshot 暴露 gateway-backed model-visible surface；Aster `ToolRegistry` 中不再存在 gateway-backed 工具或 alias。
- `NativeRegistration::name()` 已删除，避免 gateway registration 恢复成第二套 tool registry / gateway owner。

判定：

- `refactor-aligned current`：`tool-runtime::gateway_dispatch_execution`，归属 Turn gateway-backed tool execution lifecycle。
- `transitional current adapter`：`lime-agent::native_tools::NativeRegistration`，只把 current definition、current gateway execution registration 与非 gateway 的临时 Aster `Tool` payload 绑定在同一注册边界内；gateway 分支不再携带 Aster payload。
- `compat blocker`：Aster extension manager / MCP source adapter、通用 `ToolRegistry` fallback。
- `dead / guarded`：gateway-backed Aster `RuntimeDefinitionToolAdapter`、gateway-backed `ToolRegistry` payload、gateway-backed native tools 重新优先走 Aster `registry.execute(...)`，或在 `agent-compat` / `lime-agent` gateway bridge 恢复 gateway DTO、permission、canonical lookup、result projection owner。
- Thread / Turn / Item 归属：Thread 只提供 session / workspace / turn scope；Turn 负责 gateway-backed execution 与 permission preflight；Item/read model 只消费 materialized tool result / metadata，不从 Aster `Tool` trait 推断 gateway 工具状态。

退出条件：

- MCP bridge / source adapter 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager adapter。
- R4 registry fallback 全部迁完后，删除 `NativeRegistration` 的非 gateway Aster payload 和 root `Tool` / `ToolContext` / `ToolRegistry` allowlist；`RuntimeDefinitionToolAdapter` 已按 `dead / guarded` 处理，不得恢复。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package aster-core -- --check`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime gateway_dispatch_execution --lib -j 1 -- --nocapture`，`4 passed`；隔离 target `.lime/cargo-target/gateway-dispatch-execution` 复跑同命令也为 `4 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 1 -- --nocapture`，`3 passed`（默认 target）。
- `blocked`：继续用隔离 target 复跑 `lime-agent gateway_bridge` 时本机磁盘仅剩约 `369MiB`，编译 `time` crate 阶段因 `No space left on device` 中止；该环境限制不改变 current / compat 分类。

### 4.62 R5/R6 runtime status item write owner

当前状态：

- `thread-store::runtime_store` 新增 `RuntimeTurnWriteStore::update_turn(...)` 与 `complete_runtime_turn_record(...)`，补齐 Turn write current contract。
- `thread-store::runtime_status_item` 承接 runtime status item 写入规则：`turn_summary:<turn_id>` id、create/update 判定、existing sequence 复用、缺失时按 thread 分配下一 sequence、`RuntimeItemPayloadRecord::RuntimeStatus` 构造和 upsert。
- `lime-agent/src/request_tool_policy/runtime_status_item.rs` 只按 current `AgentSessionConfig` 找 existing thread、调用 `ensure_runtime_turn_record(...)`，再把 status 字段交给 `thread-store::runtime_status_item::upsert_runtime_status_item_record(...)` 并投影成 `RuntimeAgentEvent::{ItemStarted,ItemUpdated}`。
- `AsterReplyRuntimeHost::emit_runtime_status(...)` 不再调用 `agent.upsert_runtime_status_item(...)`，不再把 `AgentSessionConfig` 降成 Aster `SessionConfig`，也不再通过 Aster `AgentEvent` projector 返回 runtime item event。
- 如果当前 turn/thread 还不存在，helper 只发送 transient `RuntimeStatus` 事件，不伪造 working_dir 创建 thread；真正 turn/thread 创建仍由 reply loop 主 turn 初始化承担。
- `agent-compat::Agent::upsert_runtime_status_item(...)`、`complete_runtime_status_item(...)` 与本地 `runtime_status_item_id(...)` 已删除；status item public write surface 不再停留在 Aster Agent 上。

判定：

- `transitional current adapter`：`request_tool_policy/runtime_status_item.rs`，因为 durable source 仍经 `runtime_store_aster_adapter` 包装 Aster `ThreadRuntimeStore`，但 status item 写入规则和 projection 已不再由 `agent-compat::Agent` public method 拥有。
- `refactor-aligned current`：`thread-store::runtime_status_item` 与 `thread-store::runtime_store` 的 turn/item write helper，归属 Thread / Turn / Item persistence contract。
- `compat blocker`：Aster `ThreadRuntimeStore` durable source、Aster `Agent` 内部 turn/item persistence helper、provider/reply `AgentEvent` source adapter。
- `dead / guarded`：恢复 `Agent::upsert_runtime_status_item(...)` / `complete_runtime_status_item(...)` public method、Lime 外部 runtime status 写入重新调用 Aster Agent、重新构造 Aster `SessionConfig` 或通过 `project_aster_runtime_event_with_turn_context(...)` 绕回。

Thread / Turn / Item 归属：

- Thread：existing thread 仍来自 durable store；本刀不伪造 thread working_dir。
- Turn：`ensure_runtime_turn_record(...)` 负责当前 turn record materialization。
- Item：`RuntimeItemPayloadRecord::RuntimeStatus` 是 Item read-model materialized payload，payload/id/sequence/upsert 判定由 `thread-store::runtime_status_item` 生成，GUI / Evidence 只消费 current projected item event。

退出条件：

- Aster `Agent` 内部 turn/item persistence helper 继续迁到 `agent-runtime` / `thread-store` current owner 后，删除剩余 Aster Agent item persistence 边界。
- Aster durable source 迁出后，`runtime_status_item.rs` 应直接消费 current Thread store / App Server runtime store，而不是 `runtime_store_aster_adapter`。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/runtime-status-item-current-owner" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_status_item --lib -j 2 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p thread-store -p lime-agent --lib -j 2` 通过，耗时 `7m06s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-status-current-item" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`9 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`，冷编耗时 `28m37s`；本刀新增 import warning 已清理。
- `passed`：删除 Aster Agent status public methods 后复跑 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1` 通过，耗时 `8m35s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`176 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `remaining`：继续迁出内部 turn/item persistence helper 和 Aster durable source；本刀只清掉已迁 status item 的 public write surface。

### 4.63 R4/R7 inline Python extension surface removal

当前状态：

- `agent-compat/src/agents/extension.rs` 已删除 `ExtensionConfig::InlinePython` 和 `inline_python(...)` constructor。
- `agent-compat/src/agents/extension_manager.rs` 已删除 `uvx --with mcp` 临时 Python 文件执行分支。
- `agent-compat/src/recipe/recipe_extension_adapter.rs` 已删除 recipe `inline_python` extension variant。
- `lime-agent/src/agent_tools/tool_inventory_runtime_adapter.rs` 不再把 Aster `InlinePython` 投影成 current `RuntimeExtensionConfig`。

判定：

- `dead / guarded`：Aster `inline_python` 任意代码 extension config、`uvx --with mcp` 执行分支、recipe inline Python adapter 和 GUI/tool inventory 投影。
- `compat blocker`：Aster extension manager / MCP client bridge 仍是未迁 reply-loop MCP source adapter。
- `refactor-aligned current`：`lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`，归属 Turn tool lifecycle 与 Item inventory projection。

Thread / Turn / Item 归属：

- Thread：不承接 Aster inline Python extension 配置或 recipe metadata。
- Turn：工具生命周期只接受 remaining MCP source adapter；Codex 无 inline Python extension 语义，因此不迁入 current owner。
- Item：tool inventory/read model 不再展示或归一化已删除 variant。

退出条件：

- MCP bridge / extension execution 继续迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager、root `ExtensionConfig` re-export 和 `McpClientTrait` adapter。
- 不得因为需要“快速扩展 MCP”恢复 Aster inline Python / `uvx` 任意代码执行形状。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/inline-python-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，`Finished`，耗时 `13m41s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。

### 4.64 R4/R7 SSE extension config removal

当前状态：

- `agent-compat/src/agents/extension.rs` 已删除 `ExtensionConfig::Sse` 和 `#[serde(rename = "sse")]`。
- `agent-compat/src/agents/extension_manager.rs` 已删除旧 SSE fail-closed 分支和 disabled extension 展示文案。
- `agent-compat/src/config/extensions.rs` 已删除 SSE warning 分支，不再为旧 `sse` 配置保留迁移提示兼容。
- `lime-agent/src/agent_tools/tool_inventory_runtime_adapter.rs` 不再把 Aster `Sse` variant 投影成 current `RuntimeExtensionConfig`。

判定：

- `dead / guarded`：Aster SSE extension config、旧 unsupported warning、GUI/tool inventory 投影。
- `refactor-aligned current`：Codex-style `streamable_http` / `stdio` MCP transport、`tool-runtime::tool_extension` extension DTO、`lime-mcp` / App Server MCP gateway。
- `compat blocker`：Aster extension manager / MCP client bridge 仍作为 source adapter 暂留，后续要迁到 current gateway 后删除。

Thread / Turn / Item 归属：

- Thread：不承接旧 SSE 配置兼容或 session metadata。
- Turn：MCP tool lifecycle 只允许继续向 current `stdio` / `streamable_http` transport 收敛。
- Item：tool inventory/read model 不再展示 SSE variant，避免 GUI / Evidence 持有不可执行的旧配置面。

退出条件：

- MCP bridge / extension execution 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager、root `ExtensionConfig` re-export 和 `McpClientTrait` adapter。
- 不得恢复 `ExtensionConfig::Sse` 或把旧 SSE unsupported 文案当作兼容入口。

验证记录：

- `passed`：`rg -n "ExtensionConfig::Sse|serde\\(rename = \\\"sse\\\"\\)|SSE is unsupported|SSE extension|AsterExtensionConfig::Sse" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 无命中。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/sse-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过，耗时 `7m47s`。

### 4.65 R4/R7 extension config convenience removal

当前状态：

- `agent-compat/src/config/extensions.rs` 已删除 `get_warnings()`、`get_enabled_extensions()`、`get_all_extension_names()` 和 config-level `is_extension_enabled(key)`。
- `ExtensionManager::is_extension_enabled(&self, name)` 仍保留在 MCP source adapter 内部，并被 `reply_parts.rs` 的 code execution gate 调用；它不是 config-level convenience。
- `asterMigrationBoundary.test.ts` 已把上述 config helper 纳入禁止恢复清单，避免删除 SSE 后旧 warning/query 面以“便利 API”形式回流。

判定：

- `dead / guarded`：Aster extension config warning/query convenience。
- `refactor-aligned current`：`tool-runtime::tool_extension` extension DTO、`lime-mcp`、App Server MCP gateway 与 Item/tool inventory projection。
- `compat blocker`：Aster extension manager / MCP client bridge 仍作为 Turn source adapter 暂留，最终需要迁出后删除。

Thread / Turn / Item 归属：

- Thread：不承接旧 extension config query/warning 或配置迁移提示。
- Turn：MCP bridge / extension execution 只允许继续向 current gateway 收敛；剩余 `ExtensionManager::is_extension_enabled` 只是 source adapter 内部状态。
- Item：tool inventory/read model 不再消费空 warning/query helper，避免 GUI / Evidence 误持有 Aster config convenience。

退出条件：

- MCP bridge / extension execution 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager、root `ExtensionConfig` re-export 和 `McpClientTrait` adapter。
- 不得恢复 `get_warnings()`、`get_enabled_extensions()`、`get_all_extension_names()` 或 config-level `is_extension_enabled(key)`。

验证记录：

- `passed`：`rg -n "is_extension_enabled|get_warnings|get_enabled_extensions|get_all_extension_names" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 只剩 `ExtensionManager::is_extension_enabled` 与真实调用，不命中已删 config helper。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/extension-config-convenience-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。

### 4.66 R4/R7 MCP extension surface owner migration

当前状态：

- `lime-mcp::extension_surface` 承接 MCP runtime extension name 与 `McpToolDefinition` -> `RuntimeExtensionConfig` surface 构造；`lime-agent::agent_tools::catalog` 不再持有 MCP-specific extension surface helper 或旧正向测试。
- `tool-runtime::tool_extension` 继续持有 `RuntimeExtensionConfig` / `RuntimeExtensionToolSurface` / `RuntimeExtensionRegistration` / `RuntimeExtensionSyncPlan` DTO 与 caller collapse / visibility 折叠规则。
- `lime-agent/src/mcp_bridge.rs`、`agent_tools/tool_inventory_runtime_snapshot.rs` 与 `agent_tools/inventory.rs` 消费 `lime_mcp::{runtime_extension_name, build_runtime_extension_surface}`；`mcp_bridge.rs` 仍把 current registration 降成 Aster `ExtensionConfig::Builtin`，该转换只是未迁 MCP source adapter。
- `lime-mcp` 新增 `tool-runtime.workspace = true`，用于消费 current extension DTO；`tool-runtime` 不反向依赖 `lime-mcp`，未引入 crate 循环。

判定：

- `refactor-aligned current`：`lime-mcp::extension_surface`，归属 Turn MCP runtime owner；`tool-runtime::tool_extension`，归属 Turn tool extension DTO / Item inventory DTO。
- `transitional current adapter`：`lime-agent/src/mcp_bridge.rs` 的 sync 注册逻辑，仍需在后续删除 Aster `ExtensionConfig::Builtin` lowering。
- `compat blocker`：Aster extension manager、root `ExtensionConfig`、`McpClientTrait`、Aster MCP client bridge execution source adapter。
- `dead / guarded`：`lime-agent::agent_tools::catalog` 恢复 `mcp_extension_runtime_name(...)`、`build_mcp_extension_surface(...)`、`RuntimeExtensionToolSurface::new` 或 `RuntimeExtensionConfig::from_tool_surfaces` owner。

Thread / Turn / Item 归属：

- Thread：不承接 MCP extension surface 构造。
- Turn：MCP bridge / extension sync surface 归 `lime-mcp` + `tool-runtime`；Aster bridge 只剩 source adapter。
- Item：tool inventory/read model 继续消费 current `RuntimeExtensionConfig` / extension tool seeds，不从 Aster catalog 推断 MCP extension surface。

退出条件：

- MCP bridge / extension execution 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，删除 Aster extension manager、root `ExtensionConfig` re-export 和 `McpClientTrait` adapter。
- `agent_tools/catalog.rs` 只允许保留 static tool catalog，不得重新成为 MCP runtime extension surface owner。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp extension_surface --lib -j 2 -- --nocapture`，`6 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1`，`Finished`，耗时 `12m07s`；首次 check 因本地 rustc/dep-info 文件不存在中止，未暴露代码错误。

### 4.67 R4 tools 目录协作 adapter 迁出

当前状态：

- `agent-compat/src/tools/agent_control.rs` 与 `agent-compat/src/tools/team_tools.rs` 已删除；旧 `tools` 目录不再拥有 Agent / SendMessage / TeamCreate / TeamDelete / ListPeers 的具体 adapter 文件。
- 新落点是 `agent-compat/src/agents/collab_runtime.rs` 与 `agent-compat/src/agents/team_runtime.rs`，只服务 Aster reply loop 未迁完前的 source adapter：callback bridge、session/team resolver、local peer 查询和 Aster team extension-data DTO 转换。
- `agent-compat/src/tools/mod.rs` 不再声明 `mod agent_control` / `mod team_tools`，也不再 re-export `execute_agent_control_runtime_tool` / `execute_team_runtime_tool`；`ToolRegistrationConfig` 只保留 callback 配置字段。
- `agent-compat/src/agents/agent.rs` 直接从 `agents::{collab_runtime,team_runtime}` 调用 current executor adapter，并继续在 Aster `registry.execute(...)` 前优先走 `tool-runtime::collab_agent` current execution。

判定：

- `refactor-aligned current`：`tool-runtime::collab_agent::{execution,projection,validation}`，归 Turn tool lifecycle。
- `transitional adapter`：`agent-compat/src/agents/{collab_runtime.rs,team_runtime.rs}`，只负责把 Aster session/team source 降成 current execution backend。
- `dead / guarded`：`agent-compat/src/tools/{agent_control.rs,team_tools.rs}`、协作 Aster `Tool` trait 壳、协作 DTO/schema/canonical/projection 本地 owner。
- `compat blocker`：Aster `SessionStore`、team extension-data DTO、`Agent` 特殊 nested subagent 分支和 generic `ToolRegistry` fallback。

Thread / Turn / Item 归属：

- Thread：只保存 session/team metadata；不承接协作工具执行规则。
- Turn：`tool-runtime::collab_agent` 持有协作工具 surface / validation / execution；`agent-compat` adapter 只能做 source lowering。
- Item：GUI / Evidence 只消费 materialized tool result / metadata，不从 Aster tools 路径推断协作状态。

验证记录：

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，`Finished`，耗时 `4m27s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。

退出条件：

- R5/R6 删除 Aster `SessionStore` / team extension-data DTO adapter 后，删除 `agents/collab_runtime.rs` / `agents/team_runtime.rs`。
- R4 删除 generic `ToolRegistry` fallback 后，root `Tool` / `ToolContext` / `ToolRegistrationConfig` allowlist 继续收缩；不得把协作 adapter 放回 `tools/` 目录。

### 4.68 provider/tool 目录删除对 refactor v1 的影响复核

当前状态：

- `agent-compat/src/providers/**`、`agent-compat/src/tools/**` 与 `config::declarative_providers` 已物理删除；不存在 Aster provider/tool 的第二实现或仅供兼容的空 provider 配置面。
- `agent-compat/src/reply_provider.rs` 只维持 Aster reply loop 尚未去除的协议形状，factory fail closed；它不是 provider current owner。

判定：

- `current`：模型 provider 的配置、连接与 GUI 主入口继续归 App Server provider/settings backend；provider stream contract 归 `model-provider`；模型工具 surface、权限与执行归 `tool-runtime`。
- `compat blocker`：`reply_provider.rs`、Aster `Message` / `Session` lowering 与 `run_aster_reply_backend(...)` 的最后 Aster execution。
- `dead / deleted / forbidden-to-restore`：`providers/**`、`tools/**`、declarative provider、Aster provider registry/factory/toolshim、Aster Tool trait registry 与相关前端正向 catalog/display alias。

Thread / Turn / Item 归属：

- Thread：不新增 provider/tool durable source。
- Turn：provider stream 继续通过 `model-provider` contract 投影，工具通过 `tool-runtime` dispatch/gateway dispatch 执行。
- Item：GUI / Evidence 只消费 App Server current event projection，不从已删 Aster 目录读取状态。

验证记录：

- `passed`：`asterMigrationBoundary.test.ts`，`183 passed`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。

退出条件：R2/R3 用 current provider/reply backend 替换 `run_aster_reply_backend(...)` 的 provider trait、`Message` / `Session` lowering 和 `reply_with_provider(...)` 后，删除 `reply_provider.rs` 与 root `aster` provider re-export；不得重建 `providers/**` 或 `tools/**`。

## 5. 下一刀排序修正

按 refactor v1 重新排序后，Aster 迁移下一刀不应继续只做 SQL 小修，应优先选择能减少 `compat blocker` 的主链切片：

| 优先级 | 下一刀                                                                                       | 原因                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1      | provider/reply loop：`Agent::reply` / Aster `Message` / `AgentEvent` / provider trait object | Phase 6 最大 blocker，属于 Turn execution 主链                                                           |
| 2      | Aster reply loop native tool registry 壳                                                     | 已迁能力仍通过 Lime/Aster `Tool` trait 壳消费，影响 Tool / Item lifecycle                                |
| 3      | runtime store persistence：Aster `ThreadRuntimeStore` / item payload source                  | 影响 Turn / Item read model 与 Evidence，阻塞 root `aster` dependency 删除                               |
| 4      | Aster `SessionStore` remaining minimal DTO adapter                                           | orphan convenience 已删除；剩余 blocker 是仍有生产消费者的最小 store surface 和 provider/reply Aster DTO |
| 5      | `session_record_sql.rs` 二次归位或删除                                                       | 只在 Aster `SessionStore` trait 删除后执行，避免现在过早搬到错误 owner                                   |

## 6. 验证要求

后续每一刀至少记录：

- Thread / Turn / Item 归属。
- current / transitional adapter / compat blocker / dead 分类。
- 是否被 App Server / frontend / Evidence 真实消费。
- 对应 Rust 定向测试。
- `src/lib/governance/asterMigrationBoundary.test.ts` 或 refactor boundary guard。

整体目标完成前仍不得删除 root `aster` dependency，直到：

- `rg -n "use aster::|aster::|aster.workspace|package = \"aster-core\"" "lime-rs/crates"` production 命中清零。
- `lime-agent` 不再依赖 `aster.workspace = true`。
- vendor Aster 不再参与 Lime workspace 编译。
