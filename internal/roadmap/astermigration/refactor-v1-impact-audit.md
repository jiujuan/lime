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

## 2. 已迁能力复核

| 已迁能力                                                                                                            | 当前落点                                                                                                                           | Thread / Turn / Item 归属                       | refactor v1 判定                              | 后续动作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session record create / exists / working_dir / extension_data / default working_dir                                 | `lime_core::database::agent_session_repository`                                                                                    | Thread metadata                                 | `refactor-aligned current`                    | 保持为数据库 repository 边界；不得把 runtime item / provider event 塞入该 repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| session metadata/delete writes                                                                                      | `lime_core::database::agent_session_repository` + `lime_session_repository.rs` thin adapter                                        | Thread metadata mutation                        | `refactor-aligned current`                    | `lime_session_repository.rs` 只保留 trait adapter；写入 SQL 不得回流                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| session row pure projection defaults                                                                                | `thread-store::session_record`                                                                                                     | Thread read model projection                    | `refactor-aligned current`                    | 保持 DB 无关；继续承接 title/session_type/timestamp/json 默认值规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| session row SQLite loading                                                                                          | `lime-agent/src/session_record_sql.rs`                                                                                             | Thread read adapter                             | `transitional current adapter`                | 仅作为搬空 Aster `SessionStore` 的过渡 adapter；不得长期扩张；Aster `SessionStore` 删除后优先删除该文件，若仍需 SQLite read model，再并入 App Server / read model owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Aster `SessionStore` get/list/search adapter                                                                        | `aster_session_store/aster_trait.rs` + `session_projection.rs`                                                                     | Thread compat DTO adapter                       | `compat blocker`                              | 只能调用 current read helpers 和 DTO 转换；不得恢复 `SESSION_RECORD_SELECT_COLUMNS` / `agent_sessions` SELECT / row mapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Aster `SessionStore` export/import/copy/truncate                                                                    | Lime impl、vendor public wrapper、vendor trait 方法和 test fake 均已删除                                                           | 历史 bulk session 操作                          | `dead / deleted`                              | 当前无生产客户；不再迁成服务；Lime / vendor 不得重新实现这些 bulk 方法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| conversation transcript / legacy conversation / history search / todo / memory stub / insights                      | `thread-store::*` pure modules + Aster compat adapters                                                                             | Thread history / read model                     | `refactor-aligned current`                    | 保持 pure rule owner；Aster adapter 只做 DTO 回填，迁完后删除 adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| runtime queue contract                                                                                              | `agent-runtime::runtime_queue` + `runtime_queue_aster_adapter.rs`                                                                  | Turn queue                                      | `refactor-aligned current` + `compat blocker` | current queue service 继续在 `agent-runtime`；Aster store adapter 迁完 persistence 后删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| runtime timeline / conversation / snapshot projection                                                               | `agent-runtime::*` + `runtime_*_aster_adapter.rs`                                                                                  | Turn / Item projection                          | `refactor-aligned current` + `compat blocker` | source / projector 归 `agent-runtime`；Aster item payload adapter 仍是 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| App Server context evidence export summary / session compaction item                                                | `app-server` `evidence/export` + `runtime/evidence_provider/context.rs` + `runtime/memory_prompt.rs` + `thread_item_projection.rs` | Turn runtime metadata -> Item / Evidence 投影   | `refactor-aligned current`                    | 只消费 current `context_packet_telemetry` / turn runtime metadata，输出 `context-evidence-summary.v1`；不从 Aster vendor、Aster `SessionStore` 或 prompt 文本重建 context 策略；`session_compaction_prompt_context` 已透传真实 `sidecarRef` 到 next-turn `ContextPacket` metadata，`context.compaction.completed` 已 materialize 成 read model `context_compaction` Item；memory summary sidecarRef skeleton 已接入并通过回归，且明确不保存 Soul prompt / Style Pack / full system prompt；media input attachment reference 已进入 `ContextPacket` telemetry skeleton，inline `data:` media fail closed；full media preview / binary sidecar read / Workbench GUI smoke 仍是 refactor v1 后续 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| App Server media message delta Item skeleton                                                                        | `app-server` `runtime/thread_item_projection/agent_message.rs`                                                                     | Turn `message.delta` -> Item `agent_message`    | `refactor-aligned current`                    | 消费 RuntimeCore `RuntimeMessageDeltaContent::from_payload(...)` parser；media-only `message.delta.contentPart/contentParts` 可 materialize 成 `agent_message.contentParts`，同 `itemId` text/media delta 可合并；`contentPart/contentParts` alias mismatch 与 inline `data:` media fail closed；这是 Item projection current owner，不在 Aster vendor、provider wire 或 GUI 中重新解释媒体。App Server 定向测试 `media_only_delta_creates_agent_message_content_parts` 已通过；退出条件是继续接协议 / generated client / projection package / Workbench。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| tool execution shell/path/web/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan helpers | `tool-runtime::*` + Lime reply-loop Aster `Tool` adapter                                                                           | Turn tool lifecycle / Item tool projection      | `refactor-aligned current` + `compat blocker` | 已迁 helper 不再回 vendor；`tool-runtime::native_overlay` 已承接 Lime native overlay 清单，GUI inventory 只把该清单标为 `current_surface`；`tool-runtime::native_dispatch` 已承接无 gateway 工具 dispatcher，并通过 gateway-aware builder 接入 `memory_store` / `image_task`；`tool-runtime::web_fetch` / `tool-runtime::web_search` 已承接 Web executor，vendor Web wrapper 已删除，`lime-agent/src/native_tools/web_retrieval.rs` 只保留临时 Aster `Tool` 接线；`tool-runtime::apply_patch` 已承接 patch 执行、路径权限和 metadata/diff 构造；`tool-runtime::skill_search` 已承接 skill metadata search、workspace 解析和 evidence metadata 构造；`tool-runtime::memory_store` 已承接 memory tools DTO/gateway、权限和 metadata 构造；`tool-runtime::image_task` 已承接 image generation task 的 App Server media DTO gateway、输入校验、project root / thread / turn 约束和 task metadata 投影；`tool-runtime::sleep` 已按 Codex `clock.sleep` / `duration_ms` 语义承接等待 executor、strict schema、elapsed/interrupted metadata 和 cancel token 中断，GUI display/process summary 消费 current `sleep`；`tool-runtime::view_image` 已按 Codex `view_image` 语义承接本地图片读取、strict schema、data URL 和 model-visible image metadata，GUI/imported runtime event 已消费 current `view_image` key；`tool-runtime::update_plan` 已按 Codex TODO/checklist 语义承接 plan/explanation metadata、Plan mode 禁用和 App Server `plan.final` 真实消费链；下一步处理 Aster reply loop native tool registry 壳、sleep input queue activity signal 与 provider/reply loop |
| Aster session memory stub / automatic memory injection                                                              | 已删除：`thread-store::memory_stub`、`aster_session_store/memory_stub.rs`、vendor `session/memory*`                                | 旧 Thread memory 旁路，不进入 refactor v1 主链  | `dead / deleted / guarded`                    | Lime memory current 主链是 App Server memory store + `tool-runtime::memory_store` tool lifecycle；Aster `SessionStore` memory trait、`SessionManager` memory API、reply loop 自动 system prompt memory 注入、vendor memory repository/pipeline/FTS schema 均已删除，不保 disabled stub 兼容层                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| provider/reply stream request/event/host DTO                                                                        | `agent-runtime::*` / `model-provider::*` + `aster_reply_adapter.rs`                                                                | Turn execution / provider event materialization | `partial current` + `compat blocker`          | 必须继续迁出 `Agent::reply`、Aster `Message`、Aster `AgentEvent`、provider trait object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| vendor unused public modules                                                                                        | 已从 `aster-core` `lib.rs` 和物理目录删除                                                                                          | 不进入 Thread / Turn / Item current 主链        | `dead / deleted`                              | `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome*`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 不得恢复为 valuable reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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
- 仍是 Aster `SessionStore` trait compat blocker。

判定：

- `compat blocker`。

退出条件：

- runtime conversation source 不再依赖 Aster `Conversation` / `Message` DTO。
- provider/reply loop 不再要求 Aster `Session` DTO。
- Aster `SessionStore` trait 不再是 `lime-agent` 编译依赖后，删除该 adapter，而不是继续补兼容实现。
- export/import/copy/truncate 不得恢复；后续 `SessionStore` 剩余 blocker 只讨论 get/list/message DTO、runtime conversation 和 provider/reply 对 Aster `Session` / `Message` 的依赖。

### 4.4 vendor unused public modules

当前状态：

- `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome`、`chrome_mcp`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 已从 vendored `aster-core` public module surface 删除。
- 这些模块没有 Lime `aster::...` 消费，也没有保留 Aster 模块的外部引用。
- `claude_plugin_cache` 仍被 `skills/loader.rs` 使用，本批未删除。
- `tools::lsp` / `tools::search`、`mcp::logging` / `mcp::notifications`、Lime 自有 `lime_core::memory` / `lime_agent::prompt` 不属于本批 top-level vendor module 删除对象。
- Lime 自有 `infra::telemetry` 不属于本批 top-level vendor module 删除对象。
- nested session wrapper `session/cleanup.rs` 与 `session/statistics.rs` 已删除；`cleanup_expired_data` / `CleanupStats`、`calculate_statistics` / `SessionStatistics` 等旧 Aster public API 没有 Lime current 消费，也没有进入 Thread / Turn / Item current owner。

判定：

- `dead / deleted / forbidden-to-restore`。
- 不属于 Thread / Turn / Item current owner，也不应作为 valuable reference 编译留存。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求上述目录不存在，且 `vendor/aster-rust/crates/aster/src/lib.rs` 不得恢复对应 `pub mod`。
- `asterMigrationBoundary.test.ts` 持续要求 `session/cleanup.rs`、`session/statistics.rs`、对应 `mod` 和 public re-export 不得恢复。
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

- `agent-runtime::reply_message::{RuntimeReplyMessage, RuntimeReplyMessageRole, RuntimeReplyMessageContent}` 已建立 Aster-free reply message contract，承接 Turn reply input 的 text / image / action-required response content、`agent_only`、`concat_text` 与 image presence 规则。
- `aster_reply_adapter.rs::start_aster_reply_stream(...)` 先把 `RuntimeReplyAttemptInput` materialize 成 current `RuntimeReplyMessage`，再由 `lower_aster_reply_message(...)` lowering 到 Aster `Message`。
- Aster `Message` / `MessageContent` 仍存在，但只停留在 provider/reply loop 未迁出前的 compat adapter；它不再作为 reply input / message 的 current 事实源。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::reply_message`，归属 Turn reply input materialization contract。
- `compat blocker`：`aster_reply_adapter.rs` 的 current message -> Aster `Message` lowering，仍被 Aster `Agent::reply` / provider trait 依赖。

退出条件：

- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `lower_aster_reply_message(...)`、Aster `Message` import 和对应 action response lowering。
- `RuntimeReplyMessage` 后续如果需要进入 Thread Item / provider-neutral request DTO，应迁到最终 owner 或与 `agent-protocol` DTO 收敛；不得让 `lime-agent` adapter 成为长期 owner。
- App Server / GUI / Evidence 继续消费 current event / item / provider trace，不得重新解析 Aster `MessageContent`。

### 4.4.3 Batch A/D reply request contract

当前状态：

- `agent-runtime::reply_request::RuntimeReplyRequest` 已建立 Aster-free reply request materialization contract，承接 `RuntimeReplyAttemptInput` 到 current `RuntimeReplyMessage` 与 `model-provider::RuntimeReplyStreamRequest` 的构造规则。
- `RuntimeReplyRequest::from_attempt_input(...)` 统一计算 `input_kind`、`message_chars`、provider handle 和 model request policy，`aster_reply_adapter.rs` 不再直接调用 `RuntimeReplyStreamRequest::new(...)`。
- `RuntimeReplyRequest::from_attempt_input(...)` 已从 Aster backend adapter 上提到 `agent_reply_stream.rs` current 主循环；`RuntimeReplyStreamHost::start_reply_stream(...)` 只接收已 materialize 的 `RuntimeReplyRequest`，Aster backend adapter 不再拥有 model request policy / provider handle / stream request 构造规则。
- image input modality validation 已从 `aster_reply_adapter.rs` 的 Aster `Message` lowering 前移到 `agent_reply_stream.rs` current 主循环；future current provider/reply backend 不需要继承 Aster lowering 才能获得 image policy fail-closed 行为。
- `agent-runtime::reply_host::RuntimeReplyStartRequest` 已承接 Turn reply backend start request，合并 current request、session config、provider cancel token 与 `emitted_any`；`RuntimeReplyStreamHost::start_reply_stream(...)` 不再暴露 Aster adapter 形状的散参。
- Aster provider/reply backend 仍存在，但现在只消费 current `RuntimeReplyStreamRequest`；provider wire shape 继续归属 `model-provider`，不是 Aster adapter 的本地规则。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::reply_request`，归属 Turn reply request materialization contract。
- `refactor-aligned current skeleton`：`agent_reply_stream.rs` 作为 Turn stream policy 主循环，负责把 input、turn context policy 和 provider handle 汇合成 current request。
- `refactor-aligned current skeleton`：`agent-runtime::reply_host::RuntimeReplyStartRequest`，归属 Turn provider/reply execution handoff contract。
- `compat blocker`：`aster_reply_adapter.rs` 后续仍把 current request/message 送进 Aster `Agent::reply` / provider trait。

退出条件：

- provider/reply loop 迁出 Aster `Agent::reply` 后，`RuntimeReplyRequest` 应直接喂给 current provider/reply backend；Aster provider branch、`ConfiguredReplyProvider::stream_reply_with_agent(...)` 和 Aster `Message` lowering 同轮删除。
- App Server / GUI / Evidence 继续消费 `provider_trace`、runtime events 和 Item read model，不得通过 Aster `Message` 或 Aster provider metadata 旁路重建 reply request 状态。

### 4.5 native tool overlay current owner

当前状态：

- `tool-runtime::native_overlay` 持有 Lime-owned native tool overlay 清单：`view_image`、`apply_patch`、`skill_search`、`Skill`、`sleep`、`update_plan`、`WebFetch`、`WebSearch`。`Write` / `Edit` 与 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 已按 Codex 口径从 production overlay / allowlist、agent prompt、agent tool catalog 和 GUI current capability 检查中移除，只保留为 historical frontend / hook matcher / transcript alias 或待细化删除的 vendor residual。
- vendored Aster `task_list_tools.rs`、`task_output_tool.rs`、`task_stop_tool.rs` 已删除；`tools/mod.rs` 不再导出或默认注册 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop`，SubAgent production allowlist 与 ToolSearch production alias 也不得恢复 Task\*。历史 frontend transcript / display 读面仍按 compat 处理，后续单独收缩。
- `tool-runtime::native_dispatch` 持有已迁 native tool 的 current definition / executor dispatch：`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`，并通过 gateway-aware builder 接入 `memory_store` / `image_task`；这对齐 Codex registry/router 的骨架，但还没有替代 Aster reply loop 的 `ToolRegistry`。
- `lime-agent/src/native_tools/runtime_tool_bridge.rs` 集中已迁 wrapper 仍需的 Aster `ToolContext` / `ToolResult` / `ToolError` 临时转换；`apply_patch`、`skill_search`、`memory_store`、`image_task`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch` wrapper 不再各自复制 runtime context/result/error 转换。
- `tool-runtime::native_overlay` 现在同时持有 `runtime_native_tool_registration_allowlist()`，作为 Lime 初始化 Aster registry 的 current policy owner；Lime 只允许注册 Codex-first/current 最小工具面，不再使用 Aster 默认全量工具池。
- current owner API 使用 `runtime_native_tool_overlay_*` 领域命名；不为刚迁出的 `lime_native_tool_overlay_*` 保留别名。
- `native_tools/runtime_overlay.rs` 只把 current 清单落到临时 Aster `ToolRegistry`；`native_tools/web_retrieval.rs` 是 WebFetch/WebSearch 的短期 Aster `Tool` 接线，执行事实源仍是 `tool-runtime`。
- `runtime_state_support::create_lime_tool_config()` 已传入 `runtime_native_tool_registration_allowlist()`；未进入 allowlist 的 Aster 默认工具注册面按 `dead / production-disabled` 处理，后续不得为了“兼容”重新暴露到模型或 GUI inventory。
- `agent_tools/tool_inventory_runtime_adapter.rs` 只把该清单命中的 registry tool 标成 `current_surface`；其他 Aster registry tool 显示为 `registry_native`。

判定：

- `refactor-aligned current`：`tool-runtime::native_overlay`。
- `refactor-aligned current skeleton`：`tool-runtime::native_dispatch`。
- `refactor-aligned current`：`runtime_native_tool_registration_allowlist()` 作为 Turn tool lifecycle / Item tool inventory 的当前注册面 policy。
- `transitional current adapter / compat blocker`：`native_tools/runtime_tool_bridge.rs`，只服务 Aster reply loop 尚未迁出的 `Tool` trait wrapper；它不是最终 Turn owner。
- `compat blocker`：Aster `ToolRegistry` / `Tool` trait 的实际执行壳仍在 `native_tools/runtime_overlay.rs` 与 reply loop。
- `dead / deleted / guarded`：未进入 allowlist 的 Aster vendor 默认工具注册面，例如 Aster `WriteTool` / `EditTool`、`TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` vendor 实现、`NotebookEdit`、`EnterWorktree`、`ExitWorktree`、`Workflow`、`Config`、Aster `SleepTool` 旧面、`Cron`、`RemoteTrigger`。Codex-style current 等待工具只能是 `sleep` / `clock.sleep`，文件修改只能走 `apply_patch` current executor，规划只能走 `update_plan` current executor。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 调用 WebFetch/WebSearch/native tools 后，删除 `native_tools/runtime_overlay.rs` 中的 Aster registry 注册壳。
- Aster reply loop 不再通过 Aster `Tool` trait 调用已迁 native tools 后，删除 `native_tools/runtime_tool_bridge.rs`；不得把该桥接层升格为长期 current API。
- Aster adapter 不得再直接选择 `memory_store` / `image_task` executor handle；需要 App Server gateway 的工具只能通过 `NativeDispatch::builder().with_*_gateway(...)` 接线。
- allowlist 中仍由 Aster 实现的工具必须逐步迁到 `tool-runtime` executor；不再需要的工具先从 allowlist 移除，再删除 vendor 实现和测试。
- Aster Task\* vendor 实现不得恢复；历史 transcript / display 读面回头细化时继续收缩。
- GUI / Evidence 继续消费 current inventory `source_kind`，不得把整个 Aster registry 重新标为 `current_surface`。

### 4.6 apply_patch native executor current owner

当前状态：

- `tool-runtime::apply_patch` 持有 `apply_patch` native tool 的 current executor、input schema、permission check、patch apply、summary、metadata、file change/diff/checkpoint refs 构造。
- `lime-agent/src/tools/apply_patch_tool.rs` 只保留 Aster `Tool` wrapper 和 DTO 转换，不再直接 import `patch_apply`。
- `lime-agent` 不再直接依赖 `patch-apply`；该依赖由 `tool-runtime` 持有。

判定：

- `refactor-aligned current`：`tool-runtime::apply_patch`。
- `compat blocker`：Aster `Tool` trait wrapper 仍在 `lime-agent/src/tools/apply_patch_tool.rs`，因为 Aster reply loop 尚未迁出 native tool registry。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/tools/apply_patch_tool.rs` wrapper。
- GUI / Evidence 继续消费 current tool result metadata，不得在 Aster wrapper 中恢复 metadata/diff/hash 第二份实现。

### 4.7 skill_search native executor current owner

当前状态：

- `tool-runtime::skill_search` 持有 `skill_search` native tool 的 current executor、input schema、permission check、输入解析、workspace / project root 解析、Skills metadata search、输出 JSON 和 evidence metadata 构造。
- `lime-agent/src/tools/skill_search_tool.rs` 只保留 Aster `Tool` wrapper 和 DTO 转换，不再直接 import `lime_skills` 或维护第二份 search/output 规则。
- App Server evidence provider 已消费 `tool_family=skill_search`、`skill_search_query`、`skill_search_result_count` 等 metadata；这不是为了迁移而迁移。

判定：

- `refactor-aligned current`：`tool-runtime::skill_search`。
- `compat blocker`：Aster `Tool` trait wrapper 仍在 `lime-agent/src/tools/skill_search_tool.rs`，因为 Aster reply loop 尚未迁出 native tool registry。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/tools/skill_search_tool.rs` wrapper。
- GUI / Evidence 继续消费 current skill search metadata，不得在 Aster wrapper 中恢复 workspace 解析或 output / metadata 第二份实现。

### 4.8 memory_store native executor current owner

当前状态：

- `tool-runtime::memory_store` 持有 `memory_list` / `memory_read` / `memory_search` / `memory_add_note` native tools 的 current executor、input schema、permission check、App Server memory store gateway trait、请求 DTO 构造、summary 和 GUI / Evidence metadata 构造。
- `lime-agent/src/native_tools/memory_store.rs` 只保留 Aster `Tool` wrapper 和 DTO 转换，并通过 `NativeDispatch::builder().with_memory_store_gateway(...)` 接线；不再定义 gateway trait，也不再直接选择 executor handle 或维护第二份 root params、path validation、参数解析、metadata/output 规则。
- `app-server/src/runtime_backend/memory_tools.rs` 直接实现 `tool_runtime::memory_store::MemoryStoreGateway`，App Server memory store 主链不再从 `lime-agent` compat 边界拿 trait。
- 前端 memory evidence 已消费 `memory_search` / `memory_read` / `memory_add_note` metadata；这不是为了迁移而迁移。

判定：

- `refactor-aligned current`：`tool-runtime::memory_store` 承接 tool lifecycle 规则；App Server memory store / protocol DTO 继续承接 memory 数据主链。
- `compat blocker`：Aster `Tool` trait wrapper 仍在 `lime-agent/src/native_tools/memory_store.rs`，因为 Aster reply loop 尚未迁出 native tool registry。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/native_tools/memory_store.rs` wrapper。
- GUI / Evidence 继续消费 current memory tool metadata，不得在 Aster wrapper 中恢复 path permission、DTO 构造或 output / metadata 第二份实现。

### 4.9 image_task native executor current owner

当前状态：

- `tool-runtime::image_task` 持有 `lime_create_image_generation_task` native tool 的 current executor、input schema、permission check、App Server media task gateway trait、请求 DTO 构造和 tool result metadata 投影。
- `lime-agent/src/native_tools/image_tasks.rs` 只保留 Aster `Tool` wrapper、runtime context 转换、Aster action scope 到 current turn metadata 的临时投影，以及 RuntimeTool result/error 到 Aster result/error 的转换，并通过 `NativeDispatch::builder().with_image_task_gateway(...)` 接线，不再直接选择 executor handle。
- App Server media task artifact 主链直接实现 `tool_runtime::image_task::ImageTaskGateway`；GUI / workbench / evidence 继续消费 media task artifact 和 image preview record，不靠 Aster wrapper 推断结果。

判定：

- `refactor-aligned current`：`tool-runtime::image_task` 承接 Turn tool lifecycle 规则；App Server media task artifact / GUI image preview 是真实消费链。
- `compat blocker`：Aster `Tool` trait wrapper 仍在 `lime-agent/src/native_tools/image_tasks.rs`，因为 Aster reply loop 尚未迁出 native tool registry。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/native_tools/image_tasks.rs` wrapper。
- GUI / Evidence 继续消费 current media task metadata，不得在 Aster wrapper 中恢复 image task schema、DTO 构造、project root 校验或 metadata projection 第二份实现。

### 4.10 Codex-style sleep native executor current owner

当前状态：

- `tool-runtime::sleep` 持有 Codex-style `sleep` current executor、`clock.sleep` alias 常量、`duration_ms` strict schema、12 小时上限、permission check、elapsed/interrupted metadata 和 cancel token 中断。
- `lime-agent/src/native_tools/sleep.rs` 只保留 `ClockSleepAdapter`，作为 Aster reply loop 尚未迁出时的临时 `Tool` trait adapter；对外 tool name 是 `sleep`，alias 是 `clock.sleep`，不恢复 Aster `SleepTool` 旧名。
- Rust catalog、frontend normalization、GUI display config 和 process summary 已消费 current `sleep`；`SleepTool` 只允许作为 dead / unmapped 名称出现在负向测试和守卫里。
- vendored Aster `tools/sleep_tool.rs` 已删除，`tools/mod.rs` 不恢复 `pub mod sleep_tool` / `SleepTool::new()`。

判定：

- `refactor-aligned current`：`tool-runtime::sleep` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item tool projection。
- `compat blocker`：`ClockSleepAdapter` 仍是 Aster `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted / guarded`：Aster `SleepTool` vendor 实现、旧 `SleepTool` alias、前端 `sleeptool -> sleep` 正向映射。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/native_tools/sleep.rs` wrapper。
- Turn input queue / activity signal 迁入 current runtime 后，把 Codex 的“新输入打断 sleep”接到 `RuntimeSleepExecutor`；当前骨架只支持 cancel token 中断，不得误报为完整等价 Codex。
- GUI / Evidence 继续消费 current `sleep` metadata，不得在 Aster wrapper 或前端旧 alias 中恢复等待语义。

### 4.11 Codex-style view_image native executor current owner

当前状态：

- `tool-runtime::view_image` 持有 Codex-style `view_image` current executor、`path` / `detail` strict schema、permission check、file URL / relative path 解析、50MB 文件上限、data URL 构造、token 估算、PNG/GIF/JPEG/WebP 头部尺寸解析和 model-visible image metadata。
- `lime-agent/src/native_tools/view_image.rs` 只保留 `ImageViewAdapter`，作为 Aster reply loop 尚未迁出时的临时 `Tool` trait adapter；对外 tool name 是 `view_image`，`ViewImage` / `ViewImageTool` 只作为 lookup-only legacy alias。
- Rust catalog、frontend normalization、GUI display config、process summary 和 imported runtime event detail 已消费 current `view_image` key；不再要求 Aster `ViewImageTool` 成为执行事实源。
- vendored Aster `tools/view_image.rs` 已删除，`tools/mod.rs` 不恢复 `mod view_image` / `pub use view_image` / `ViewImageTool::new()`；Aster 默认 `Agent::new()` 不再把 `view_image` 当 vendor 默认工具。

判定：

- `refactor-aligned current`：`tool-runtime::view_image` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item tool projection。
- `compat blocker`：`ImageViewAdapter` 仍是 Aster `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted / guarded`：Aster `ViewImageTool` vendor 实现、vendor media helper 依赖、vendor 默认注册。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/native_tools/view_image.rs` wrapper。
- GUI / Evidence / provider lowering 继续消费 current model-visible image metadata，不得在 Aster wrapper 或 vendor media helper 中恢复 `read_image_file_enhanced`、`estimate_image_tokens` 或第二份 schema。
- `ViewImage` / `ViewImageTool` alias 只服务历史 transcript lookup；current API、catalog 和文档继续使用 `view_image`。

### 4.12 Codex-style update_plan native executor current owner

当前状态：

- `tool-runtime::update_plan` 持有 Codex-style `update_plan` current executor、`PlanUpdate` / `PlanStep` 领域 DTO、strict schema、最多一个 `in_progress` 校验、Plan mode 禁用、`Plan updated` ack 和 plan/explanation metadata。
- `lime-agent/src/native_tools/update_plan.rs` 只保留 `PlanUpdateAdapter`，作为 Aster reply loop 尚未迁出时的临时 `Tool` trait adapter；对外 tool name 是 `update_plan`，`UpdatePlan` / `UpdatePlanTool` / `update_plan_tool` 只作为 lookup-only legacy alias。
- App Server `runtime_backend::plan_events::plan_final_event_from_update_plan_result(...)` 和前端计划轨已消费 current `source=update_plan` 链路；迁移不是只搬 DTO。
- vendored Aster `tools/plan_tool.rs` 已删除，`tools/mod.rs` 不恢复 `pub mod plan_tool` / `pub use plan_tool` / `UpdatePlanTool::new()`；Aster 默认工具注册面不再包含 `update_plan`。

判定：

- `refactor-aligned current`：`tool-runtime::update_plan` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item plan projection。
- `compat blocker`：`PlanUpdateAdapter` 仍是 Aster `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted`：vendor `UpdatePlanTool` 实现、默认注册和非 Codex status alias 接受逻辑。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `lime-agent/src/native_tools/update_plan.rs` wrapper。
- App Server / GUI 继续消费 `plan.final` / `source=update_plan`，不得在 Aster wrapper 中恢复 plan event projector 第二份实现。
- `UpdatePlan` / `UpdatePlanTool` alias 只服务历史 transcript lookup；current API、catalog 和文档继续使用 `update_plan`。

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
- `agent_skills_context.rs` 已把 workflow-scoped plugin skill candidate 接入 Agent Skills selection；只有同名 skill 已存在于统一 Agent Skills registry / `.agents/skills` 时才注入 skill body，未注册 plugin package skill 只进入 guidance。
- `session_config.rs` 已渲染 `<plugin_runtime_capabilities>` guidance；`agent_skills_telemetry.rs` 已输出 `plugin_runtime_capabilities` runtime status。
- `runtime_backend/plugin_runtime_context.rs` 已把 `runtimeCapabilities.mcpBindings[]` 归一化为 MCP runtime target，生成 `plugin:<plugin_id>` caller 与 `mcp__server__tool` 预期工具名。
- `runtime_backend/tool_inventory.rs` 已消费 request metadata 中的 plugin MCP target，并在现有 MCP server status / tool snapshot 上追加 `plugin_mcp_targets` 投影，输出 target runtime status、`serverRunning`、`toolListRequest`、`prepareStatus` 与 candidate `prepareRequests` skeleton。
- 前端 API `mcpApi.executePrepareRequests(...)` 已能顺序执行 candidate `prepareRequests`，只复用 App Server current `mcpServer/importFromApp`、`mcpServer/start` 与 `mcpTool/listForContext`；非 candidate、未知 method、malformed params 均 fail closed，且不回退 legacy `safeInvoke`。
- MCP binding 当前已具备 runtime prepare request skeleton 与 API execution helper，但不自动触发、不自动刷新 inventory，也不把 target 可见性或 candidate `prepareRequests` 误报成工具已可调用。

判定：

- `refactor-aligned current skeleton`：App Server `runtime_backend/plugin_runtime_context.rs`、`runtime_backend/tool_inventory.rs`、前端 API `mcpApi.executePrepareRequests(...)`、Agent Skills selection consumer、session prompt guidance、runtime status telemetry、inventory `plugin_mcp_targets` prepare request skeleton。
- Thread / Turn / Item 归属：Turn prompt/context selection 与 Turn tool inventory prepare skeleton；API helper 只是执行 prepare candidate 的前端 gateway，后续 MCP import/start 成功、刷新 inventory 并被工具调用消费后再进入完整 Turn tool lifecycle 与 Item tool projection。
- `compat`：旧 `skillRefs` / `toolRefs` / raw manifest MCP binding 只作为 snapshot / projection 缺失 fallback。
- `deprecated`：未注册 plugin package skill 暂时只能作为 guidance，不能伪造 skill instruction 正文。
- `dead`：Aster vendor / App Center UI 卡片不得反推 runtime capability；MCP guidance / target skeleton / candidate `prepareRequests` 不得写成 MCP runtime import 完成。

退出条件：

- `runtimeCapabilities.mcpBindings[]` 在现有 prepare request skeleton 与 API execution helper 之上接入 GUI / runtime 主链触发、执行后 inventory refresh 和 caller-scoped listing 可调用验证。
- plugin package skill 文件进入统一 Agent Skills registry install path。
- MCP prepare trigger / refresh 与 plugin skill registry 有定向 runtime / contract 测试后，再把本节从 skeleton 提升为 runtime-complete。

## 5. 下一刀排序修正

按 refactor v1 重新排序后，Aster 迁移下一刀不应继续只做 SQL 小修，应优先选择能减少 `compat blocker` 的主链切片：

| 优先级 | 下一刀                                                                                       | 原因                                                                              |
| ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1      | provider/reply loop：`Agent::reply` / Aster `Message` / `AgentEvent` / provider trait object | Phase 6 最大 blocker，属于 Turn execution 主链                                    |
| 2      | Aster reply loop native tool registry 壳                                                     | 已迁能力仍通过 Lime/Aster `Tool` trait 壳消费，影响 Tool / Item lifecycle         |
| 3      | runtime store persistence：Aster `ThreadRuntimeStore` / item payload source                  | 影响 Turn / Item read model 与 Evidence，阻塞 root `aster` dependency 删除        |
| 4      | Aster `SessionStore` remaining get/list/message DTO adapter                                  | export/import/copy/truncate 已退役；剩余 blocker 是 provider/reply 仍要 Aster DTO |
| 5      | `session_record_sql.rs` 二次归位或删除                                                       | 只在 Aster `SessionStore` trait 删除后执行，避免现在过早搬到错误 owner            |

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
