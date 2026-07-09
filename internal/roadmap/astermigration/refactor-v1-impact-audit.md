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

- `current`：App Server `agentSession/action/respond`、RuntimeCore pending action / permission preflight、Thread / Item read model、输入区 `InputbarApprovalPrompt`。
- `dead / forbidden-to-restore`：在 Aster vendor、Aster `Tool` trait adapter、`runtime_tool_bridge`、`runtime_overlay` 中新增或恢复 approval hook、approval cache、pending approval map、session approval key、`PendingToolConfirmation`、`SessionToolApprovalKey`、`install_session_tool_approval_hook`。
- `compat`：Aster reply loop 未迁完前，只允许把 current permission decision 转成临时 Aster `PermissionCheckResult`，不得持有 approval decision 语义或 session-scoped cache。

`tool_confirmation` 必须通过 App Server / RuntimeCore 的 `AgentSessionApprovalDecision` 处理；`ask_user` / `elicitation` 携带 approval decision 必须 fail closed。后续 P2 session-scoped approval cache 也只能落到 RuntimeCore / Thread owner，再由 Item/read model 给 GUI / Evidence 消费，不得为了“少改 reply loop”写回 Aster。

2026-07-09 复核：P2 browser_control session-scoped approval cache 的 Gate A 聚合与 Gate B second-request 证据已落在 App Server / RuntimeCore / 输入区 current 主链。Gate A `smoke:agent-runtime-current-fixture` 已覆盖 Plan hydrate、Inputbar pending steer、Claw GUI current fixture 与相关 current projection，证明 approval 改造没有让输入区 / plan / current read model 回流旧面；真实 Electron CDP Gate B 第一轮通过 `agentSession/action/respond decision=allow_for_session` 写入 session cache，第二轮同 session / 同 `browser_control` contract 自动 resolved 且 GUI 不再弹 approval prompt。fixture backend 仅投影 `approval.session_cache.hit` 与 `action.resolved source=approval_session_cache` 到 read model，不在 vendored Aster、Aster `Tool` trait adapter、`runtime_tool_bridge` 或 native tool overlay 新增 approval hook / cache / pending map。

2026-07-09 补充复核：P2 scope/lifecycle 继续落在 App Server current owner。`SessionApprovalCacheKey` 已扩展 `scope`，包含 `riskClass`、`workspaceId`、`workingDirHash`、`projectRootHash`、`networkHost`；path 只保存 sha256 摘要，URL 只保存 scheme/host/port，不保存 query/token/response preview。`agentSession/turn/cancel`、approval `decision=cancel` 与 `agentSession/delete` 清理 RuntimeCore session cache；不同 network host 的 browser_control request 不复用 `allow_for_session` 授权。该改造没有向 `lime-rs/vendor/aster-rust`、Aster `Tool` trait adapter、`runtime_tool_bridge` 或 native tool overlay 写入任何 approval hook/cache/pending map。

## 2. 已迁能力复核

| 已迁能力                                                                                                                        | 当前落点                                                                                                                           | Thread / Turn / Item 归属                       | refactor v1 判定                              | 后续动作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session record create / exists / working_dir / extension_data / default working_dir                                             | `lime_core::database::agent_session_repository`                                                                                    | Thread metadata                                 | `refactor-aligned current`                    | 保持为数据库 repository 边界；不得把 runtime item / provider event 塞入该 repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| session metadata/delete writes                                                                                                  | `lime_core::database::agent_session_repository` + `lime_session_repository.rs` thin adapter                                        | Thread metadata mutation                        | `refactor-aligned current`                    | `lime_session_repository.rs` 只保留 trait adapter；写入 SQL 不得回流                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| session row pure projection defaults                                                                                            | `thread-store::session_record`                                                                                                     | Thread read model projection                    | `refactor-aligned current`                    | 保持 DB 无关；继续承接 title/session_type/timestamp/json 默认值规则                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| session row SQLite loading                                                                                                      | `lime-agent/src/session_record_sql.rs`                                                                                             | Thread read adapter                             | `transitional current adapter`                | 仅作为搬空 Aster `SessionStore` 的过渡 adapter；不得长期扩张；Aster `SessionStore` 删除后优先删除该文件，若仍需 SQLite read model，再并入 App Server / read model owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Aster `SessionStore` get/list/search adapter                                                                                    | `aster_session_store/aster_trait.rs` + `session_projection.rs`                                                                     | Thread compat DTO adapter                       | `compat blocker`                              | 只能调用 current read helpers 和 DTO 转换；不得恢复 `SESSION_RECORD_SELECT_COLUMNS` / `agent_sessions` SELECT / row mapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Aster `SessionStore` export/import/copy/truncate                                                                                | Lime impl、vendor public wrapper、vendor trait 方法和 test fake 均已删除                                                           | 历史 bulk session 操作                          | `dead / deleted`                              | 当前无生产客户；不再迁成服务；Lime / vendor 不得重新实现这些 bulk 方法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| conversation transcript / legacy conversation / history search / todo / memory stub / insights                                  | `thread-store::*` pure modules + Aster compat adapters                                                                             | Thread history / read model                     | `refactor-aligned current`                    | 保持 pure rule owner；Aster adapter 只做 DTO 回填，迁完后删除 adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| runtime queue contract                                                                                                          | `agent-runtime::runtime_queue` + `runtime_queue_aster_adapter.rs`                                                                  | Turn queue                                      | `refactor-aligned current` + `compat blocker` | current queue service 继续在 `agent-runtime`；Aster store adapter 迁完 persistence 后删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| runtime timeline / conversation / snapshot projection                                                                           | `agent-runtime::*` + `runtime_*_aster_adapter.rs`                                                                                  | Turn / Item projection                          | `refactor-aligned current` + `compat blocker` | source / projector 归 `agent-runtime`；Aster item payload adapter 仍是 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| App Server context evidence export summary / session compaction item                                                            | `app-server` `evidence/export` + `runtime/evidence_provider/context.rs` + `runtime/memory_prompt.rs` + `thread_item_projection.rs` | Turn runtime metadata -> Item / Evidence 投影   | `refactor-aligned current`                    | 只消费 current `context_packet_telemetry` / turn runtime metadata，输出 `context-evidence-summary.v1`；不从 Aster vendor、Aster `SessionStore` 或 prompt 文本重建 context 策略；`session_compaction_prompt_context` 已透传真实 `sidecarRef` 到 next-turn `ContextPacket` metadata，`context.compaction.completed` 已 materialize 成 read model `context_compaction` Item；memory summary sidecarRef skeleton 已接入并通过回归，且明确不保存 Soul prompt / Style Pack / full system prompt；media input attachment reference 已进入 `ContextPacket` telemetry skeleton，inline `data:` media fail closed；full media preview / binary sidecar read / Workbench GUI smoke 仍是 refactor v1 后续 blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| App Server media message delta Item skeleton                                                                                    | `app-server` `runtime/thread_item_projection/agent_message.rs`                                                                     | Turn `message.delta` -> Item `agent_message`    | `refactor-aligned current`                    | 消费 RuntimeCore `RuntimeMessageDeltaContent::from_payload(...)` parser；media-only `message.delta.contentPart/contentParts` 可 materialize 成 `agent_message.contentParts`，同 `itemId` text/media delta 可合并；`contentPart/contentParts` alias mismatch 与 inline `data:` media fail closed；这是 Item projection current owner，不在 Aster vendor、provider wire 或 GUI 中重新解释媒体。App Server 定向测试 `media_only_delta_creates_agent_message_content_parts` 已通过；退出条件是继续接协议 / generated client / projection package / Workbench。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| tool execution shell/path/web/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan/tool_search helpers | `tool-runtime::*` + Lime reply-loop Aster bridge                                                                                   | Turn tool lifecycle / Item tool projection      | `refactor-aligned current` + `compat blocker` | 已迁 helper 不再回 vendor；`tool-runtime::native_overlay` 已承接 Lime native overlay 清单、registration plan、install plan、turn-context source、stateless surface 和 `RuntimeNativePermissionDecision` / `check_runtime_native_tool_permissions(...)` permission owner，GUI inventory 通过 install plan 把命中的工具标为 `current_surface`；`tool-runtime::native_dispatch` 已承接无 gateway 工具 dispatcher，并通过 gateway-aware builder 接入 `memory_store` / `image_task` / `tool_search`，gateway-backed wrapper 也从同一个 dispatch 读取模型可见 definitions；`tool-runtime::web_fetch` / `tool-runtime::web_search` 已承接 Web executor，vendor Web wrapper 已删除，`lime-agent/src/native_tools/web_retrieval.rs`、`native_tools/{sleep,view_image,update_plan}.rs`、`tools/{apply_patch_tool,skill_search_tool}.rs` 已删除，Aster `PermissionCheckResult` / `ToolContext` / `ToolResult` 适配集中到 `runtime_tool_bridge.rs`，但 permission / confirmation 规则不再归属该 bridge；`tool-runtime::apply_patch` 已承接 patch 执行、路径权限和 metadata/diff 构造；`tool-runtime::skill_search` 已承接 skill metadata search、workspace 解析和 evidence metadata 构造；`tool-runtime::memory_store` 已承接 memory tools DTO/gateway、权限和 metadata 构造；`tool-runtime::image_task` 已承接 image generation task 的 App Server media DTO gateway、输入校验、project root / thread / turn 约束和 task metadata 投影；`tool-runtime::sleep` 已按 Codex `clock.sleep` / `duration_ms` 语义承接等待 executor、strict schema、elapsed/interrupted metadata 和 cancel token 中断，GUI display/process summary 消费 current `sleep`；`tool-runtime::view_image` 已按 Codex `view_image` 语义承接本地图片读取、strict schema、data URL 和 model-visible image metadata，GUI/imported runtime event 已消费 current `view_image` key；`tool-runtime::update_plan` 已按 Codex TODO/checklist 语义承接 plan/explanation metadata、Plan mode 禁用和 App Server `plan.final` 真实消费链；`tool-runtime::tool_search` 已对齐 Codex deferred tool discovery，canonical name 收敛为 `tool_search`，接入 App Server MCP `search_mcp_tools` current gateway 和前端结构化 ToolSearch summary；per-tool `#[cfg(test)] create_*_tool()` helper 已删除，adapter 回归集中到 `runtime_tool_bridge.rs`；下一步处理 Aster reply loop native tool registry 壳、sleep input queue activity signal 与 provider/reply loop |
| Aster session memory stub / automatic memory injection                                                                          | 已删除：`thread-store::memory_stub`、`aster_session_store/memory_stub.rs`、vendor `session/memory*`                                | 旧 Thread memory 旁路，不进入 refactor v1 主链  | `dead / deleted / guarded`                    | Lime memory current 主链是 App Server memory store + `tool-runtime::memory_store` tool lifecycle；Aster `SessionStore` memory trait、`SessionManager` memory API、reply loop 自动 system prompt memory 注入、vendor memory repository/pipeline/FTS schema 均已删除，不保 disabled stub 兼容层                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| provider/reply stream request/event/host DTO                                                                                    | `agent-runtime::*` / `model-provider::*` + `aster_reply_adapter.rs`                                                                | Turn execution / provider event materialization | `partial current` + `compat blocker`          | 必须继续迁出 `Agent::reply`、Aster `Message`、Aster `AgentEvent`、provider trait object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| vendor unused public modules                                                                                                    | 已从 `aster-core` `lib.rs` 和物理目录删除                                                                                          | 不进入 Thread / Turn / Item current 主链        | `dead / deleted`                              | `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome*`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 不得恢复为 valuable reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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
- `tools::lsp` 与 vendor `parser` LSP 子系统已在 2026-07-08 按 Codex 无对应工具面判为 `dead / deleted / forbidden-to-restore`，不再作为 top-level vendor module 例外或 valuable reference 编译留存。
- `tools::search`、`mcp::logging` / `mcp::notifications`、Lime 自有 `lime_core::memory` / `lime_agent::prompt` 不属于本批 top-level vendor module 删除对象。
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

- `agent-runtime::reply_request::RuntimeReplyRequest` 已建立 Aster-free reply request materialization contract，承接 `RuntimeReplyAttemptInput` 到 current `RuntimeReplyMessage` 与 `model-provider::RuntimeReplyStreamRequest` 的构造规则。
- `RuntimeReplyRequest::from_attempt_input(...)` 统一计算 `input_kind`、`message_chars`、provider handle 和 model request policy，`aster_reply_adapter.rs` 不再直接调用 `RuntimeReplyStreamRequest::new(...)`。
- `RuntimeReplyRequest::from_attempt_input(...)` 已从 Aster backend adapter 上提到 `agent_reply_stream.rs` current 主循环；`RuntimeReplyStreamHost::start_reply_stream(...)` 只接收已 materialize 的 `RuntimeReplyRequest`，Aster backend adapter 不再拥有 model request policy / provider handle / stream request 构造规则。
- image input modality validation 已从 `aster_reply_adapter.rs` 的 Aster `Message` lowering 前移到 `agent_reply_stream.rs` current 主循环；future current provider/reply backend 不需要继承 Aster lowering 才能获得 image policy fail-closed 行为。
- `agent-runtime::reply_host::RuntimeReplyStartRequest` 已承接 Turn reply backend start request，合并 current request、session config、provider cancel token 与 `emitted_any`；`RuntimeReplyStreamHost::start_reply_stream(...)` 不再暴露 Aster adapter 形状的散参。
- `agent-runtime::reply_session` 已承接 reply start 前 session metadata preparation 纯规则：`tool_scope.disallowed_tools` 合并与 provider request wire shape metadata 注入；`RuntimeReplyBackendStart::prepare_session_metadata(...)` 作为 backend start handoff 调用该 current owner，`aster_reply_backend_adapter.rs` 不再直接 import / 调用 session metadata helper 或手写这两类 metadata 拼装。
- Aster provider/reply backend 仍存在，但现在只消费 current `RuntimeReplyStreamRequest`；provider wire shape 继续归属 `model-provider`，不是 Aster adapter 的本地规则。
- `model-provider::provider_stream` 已承接 provider request wire shape 对 backend / provider protocol 的支持判定：`RuntimeReplyStreamRequest::provider_request_wire_support_issue(...)` 生成 current issue；`aster_reply_adapter.rs` 不再直接判断 Aster compat backend、OpenAI provider 名称或 Responses protocol。
- `model-provider::provider_stream::RuntimeReplyProviderStreamStart` 已承接 provider stream start 前的 provider handle 存在性和 pinned handle 一致性校验；`ConfiguredReplyProvider::stream_reply_with_agent(...)` 只接收 current start contract，`aster_reply_adapter.rs` 只负责构造 start handoff，不再让 credential bridge 通过 debug-only assertion 拥有 provider handle contract。
- `model-provider::provider_stream::RuntimeReplyProviderStreamTrace` 已承接 provider stream start diagnostics snapshot：session、input kind、message chars、provider backend/name/model 均由 current provider stream start owner 选择；`ConfiguredReplyProvider::stream_reply_with_agent(...)` 只消费 `provider_start.trace()`，不再直接从 `provider_start.stream_request()` 拆字段做日志。
- `agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall` 已承接 default source call envelope：current reply message、current session config 与 cancel token 由 Turn owner 一次性交接给 source runner；`run_reply_source(...)` 不再向 default source 散传三个字段，`AsterReplySource` 只把 current call lowering 到临时 `RuntimeReplyDefaultCall<Message, aster::agents::SessionConfig>` 后调用 Aster `Agent::reply(...)`。
- `agent-runtime::reply_backend::RuntimeReplyProviderSourceCall` 已承接 provider source call envelope：provider start、current reply message、current session config 与 cancel token 由 Turn owner 一次性交接给 source runner；`run_reply_source(...)` 不再向 provider source 散传四个字段，`AsterReplySource` 只把 current call lowering 到临时 `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`，`ConfiguredReplyProvider::stream_reply_with_agent(...)` 只消费 mapped call、用 `provider_call.trace()` 记录 diagnostics，并把 call 原样交给私有 `CompatAsterReplyProviderBackend`；mapped call 只在最内层 `Agent::reply_with_provider(...)` 前解包。
- `agent-runtime::reply_backend::RuntimeReplySourceCall` 已承接 default / provider source call union：`run_reply_source(...)` 只构造 `RuntimeReplySourceCall::{Default, Provider}` 并调用单一 `RuntimeReplySource::run(call)`；`AsterReplySource` 不再实现 `run_default(...)` / `run_provider(...)` 两个方法，source method topology 不再属于 compat adapter。
- `request_tool_policy/aster_reply_backend_adapter.rs::CompatReplySourceExecutor` 已集中承接 Aster source execution body：`AsterReplySource::run(call)` 只做 current call lowering 和 delegate，不再直接 match default/provider path 或直接调用 Aster `Agent::reply(...)` / provider bridge。该 executor 是删除前 compat blocker，不是 refactor v1 current backend owner。
- `agent_reply_stream.rs` current 主循环已把 provider stream idle timeout 限定在 stream 创建后的 `stream.next()` 等待；Aster compat `start_reply_stream(...)` 仍包含 context prep / Aster session config 转换，不再套 provider idle timeout，避免把 Aster context prep 误判成 provider stream idle。真正的 backend start guard 应在 provider/reply loop 迁出 Aster 后落到 current backend runner。
- `agent-runtime::reply_stream::RuntimeReplyStreamProjector` 已建立 source event -> current reply stream envelope materialization contract；`request_tool_policy/aster_reply_stream_adapter.rs` 作为 Aster source adapter 实现该 contract，集中处理 Aster provider side-channel、inline provider error suppression 与 `AsterEventProjector` 调用。`aster_reply_adapter.rs` 不再同时拥有 backend start 和 stream projection 细节，文件已降回 800 行以下。
- `agent-runtime::reply_stream::project_reply_stream(...)` 已承接 source stream -> current reply stream envelope 的通用 runner：source stream 读取、多事件 projection flush 与 source error propagation 不再属于 Aster adapter；`aster_reply_stream_adapter.rs::project_aster_reply_stream(...)` 只创建 `AsterReplyStreamProjector` 并委托 current runner。
- `request_tool_policy/aster_reply_message_adapter.rs` 作为 Aster message source adapter 承接 `RuntimeReplyMessage` lowering；`aster_reply_adapter.rs` 进一步退化为 Aster backend start facade，不再拥有 stream projection 或 message content lowering 细节。
- `request_tool_policy/aster_reply_backend_adapter.rs` 作为 Aster backend source adapter 承接 current `RuntimeReplyStartRequest` -> Aster `Agent::reply` / pinned provider stream execution body；`aster_reply_adapter.rs` 不再直接持有 `.reply(...)`、`.stream_reply_with_agent(...)`、provider wire support、reply session metadata preparation 或 stream projection handoff。
- `request_tool_policy/aster_reply_backend_adapter.rs` 的 backend start 失败边界已收敛到 `agent-runtime::reply_host::RuntimeReplyStartError` / `RuntimeReplyStartResult`；该 adapter 不再 import / 构造 policy 层 `ReplyAttemptError`，attempt error conversion 只留在 Turn stream policy 主循环。
- `agent-runtime::reply_host::RuntimeReplyStartError::from_provider_wire_support_issue(...)` 已承接 provider wire support issue -> backend start error 的 current 映射；`aster_reply_backend_adapter.rs` 只记录 issue 诊断并调用 current helper，不再直接读取 `issue.message()` 拼 error。
- `agent-runtime::reply_backend::RuntimeReplyBackend` 已建立 Aster-free reply backend execution contract；`agent_reply_stream.rs` current 主循环通过 `host.reply_backend()` 启动 backend stream，`AsterReplyRuntimeHost` 只组合 `AsterReplyBackend` 并负责 runtime status / cancelled marker side effect，不再代表 backend contract 本身。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart` 已承接 backend start request materialization：`RuntimeReplyStartRequest` 拆包、current message / stream request 持有、message chars、session config / cancel token / emitted state 交接，以及 provider wire support issue -> start error 判断；`aster_reply_backend_adapter.rs` 不再直接解构 start request、调用 `request.into_parts()` 或维护本地 unsupported provider wire shape helper。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::provider_stream_start(...)` 已承接 pinned provider stream start handoff：复用 `model-provider::RuntimeReplyProviderStreamStart::new(...)` 的 missing / mismatched provider handle 校验，并把 provider start error 映射到 `RuntimeReplyStartError`；`aster_reply_backend_adapter.rs` 不再 import / 直接构造 `RuntimeReplyProviderStreamStart::new(...)`，也不再本地复制 provider start error mapping。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)` 已承接 backend start 阶段的 session metadata preparation handoff：返回 `RuntimeReplySessionPreparation` 表达 provider wire shape 是否请求 / 是否成功注入；`aster_reply_backend_adapter.rs` 只负责计算 native tool policy disallowed names 并把 prepared current session config lowering 成 Aster `SessionConfig`。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_run(...)` 已承接 backend start -> run path 的 current handoff：provider wire support fail-closed、session metadata preparation、default / pinned provider run path 选择和 provider stream start error 映射均在 Turn owner 内完成；`aster_reply_backend_adapter.rs` 只按 `RuntimeReplyBackendRunPath::{Default, Provider}` 调用 Aster source backend，不再直接调用 provider wire check、session metadata prepare 或 provider stream start construction。
- `agent-runtime::reply_backend::RuntimeReplyBackendRunOutcome::finish_stream(...)` 已承接 source backend stream result -> `RuntimeReplyStartResult` 的 current materialization：成功时附带 `message_chars`，失败时统一映射 `Agent error: ...` 与 `emitted_any`；`aster_reply_backend_adapter.rs` 不再 import / 构造 `RuntimeReplyStartError`，也不再本地拼 start result tuple 或 source backend error 文案。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::trace(...)` 与 `RuntimeReplyBackendTrace` 已承接 backend start tracing snapshot：provider backend/name/model、Responses Lite policy、reasoning context、parallel tool calls、Responses Lite header requirement、input kind 与 message chars 均由 Turn owner 选择；`aster_reply_backend_adapter.rs` 只消费 current trace snapshot，不再直接读取 `RuntimeReplyStreamRequest` 的 provider/model/policy 字段。
- `agent-runtime::reply_backend::RuntimeReplySource` 与 `run_reply_source(...)` 已承接 backend run path -> source backend call 的 current runner contract：default / provider path 分派、source call future lifetime、default/provider source call envelope 构造、single-call source execution、source result 和 original stream request 回传都在 Turn owner 内完成。`aster_reply_backend_adapter.rs::AsterReplySource` 只保留 `run(call)` 一个 Aster source call；`start_aster_reply_stream(...)` 不再本地 `match RuntimeReplyBackendRunPath`，也不直接调用 `.reply(...)` / `.stream_reply_with_agent(...)`。
- `agent-runtime::reply_backend.rs` 的测试已拆入 `reply_backend/tests.rs`，运行时代码从超过 `1200` 行降至约 `486` 行；这修复 refactor v1 的 Rust crate 抗膨胀风险，后续 source backend 细化不得继续把测试或额外业务逻辑堆回中心文件。
- `model-provider::provider_stream::RuntimeReplyProviderStreamEvent::from_notification_payload(...)` 已承接 provider stream side-channel notification payload materialization，固定 safety buffering event kind、payload `responseEvent` 读取与 header 投影规则；`aster_reply_stream_adapter.rs` 只负责从 Aster `Message` 抽取 notification payload 并委托 current owner。
- `agent-runtime::reply_execution::RuntimeReplyAttemptState` 已建立 Turn reply attempt state current skeleton，承接 text output、event errors 与 emitted state；`request_tool_policy.rs` 只创建 state 并在成功 / fallback / cancel / empty final error 时消费 current state，`agent_reply_stream.rs` 负责按 current stream event 变更 state。
- `RuntimeReplyAttemptState::error(...)` 已承接 attempt emitted state -> `RuntimeReplyAttemptError` 的 current outcome helper；`request_tool_policy.rs` 不再保留 `build_stream_reply_execution(...)` 本地薄包装，`agent_reply_stream.rs` 的 stream error / inline provider error 分支也通过 current attempt state 生成 error。
- `agent-runtime::reply_execution` 已承接 `RuntimeReplyStartError -> RuntimeReplyAttemptError` 的 current conversion；`agent_reply_stream.rs` 不再保留 `reply_attempt_error_from_runtime(...)` 本地字段复制函数。
- `agent-runtime::reply_stream::RuntimeReplyStreamState` 已建立 Turn reply stream lifecycle current skeleton，承接 first-event timeout、stream event seen 与 suppressed inline provider error；`agent_reply_stream.rs` 只消费该 current state，不再本地维护 provider stream timeout helper 或 inline provider error holder。
- `agent-runtime::reply_stream::RuntimeReplyStreamIdleTimeout` 已承接 provider stream idle timeout 的 current error message contract；`stream_idle.rs` 只保留 env timeout 解析，不再持有 idle error 文案。
- `RuntimeReplyStreamState` 把首个 stream item 前的 Aster compat 准备窗口与首 item 后 provider idle 窗口分开：首事件前最小 `5s`，避免把 Aster 首 poll 的 `prepare_reply_context` / prompt / tool surface 成本误判成 provider 首事件缺失；首事件后继续使用配置的 `provider_stream_idle_timeout`，因此 `provider_stream_idle` fixture 用 `200ms` 验证真正的尾部 idle retry，首事件前 fail-closed fixture 则跟随 `MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，不再用过期 `3s` 外层上限误判 current first-event guard。
- `agent-runtime::reply_stream::RuntimeReplyInlineProviderError::from_text(...)` 已承接 inline provider error 文本解析规则；`aster_reply_stream_adapter.rs` 只从 Aster `Message` 读取 concat text 并委托 current owner，不再持有 provider error 文案常量、retry suffix 或本地 split 解析。
- `agent-runtime::reply_stream::RuntimeReplyStreamProjection` 已承接 reply stream source facts 到 current stream envelope 的 materialization priority：provider stream event 优先于 inline provider error，inline provider error 优先于普通 runtime events；`aster_reply_stream_adapter.rs` 只收集 Aster source facts 并调用 current projection，不再直接构造 stream envelope variant 或持有本地排序。
- 接力验证补充：`agent-runtime reply_stream` 定向测试已通过 `13 passed`，证明 `RuntimeReplyStreamProjector`、`RuntimeReplyStreamState`、inline provider diagnostic materialization 与 stream projection priority current contract 可独立编译；`agent-runtime reply_backend` 定向测试已通过 `13 passed`，证明 `RuntimeReplyBackend` / `RuntimeReplyBackendStart` / provider stream start handoff / session metadata preparation handoff / backend run path handoff / backend stream outcome materialization / backend trace snapshot / source runner current contract 可独立编译；`agent-runtime reply_execution` 定向测试已通过 `5 passed`，证明 `RuntimeReplyAttemptState` current contract 可独立编译；`model-provider provider_stream` 定向测试已通过 `17 passed`，证明 provider wire support issue、provider stream start handoff 与 notification payload event materialization contract 可独立编译；`lime-agent request_tool_policy` 定向测试已通过 `68 passed`，且 `provider_stream_notification_projects_safety_buffering_event` 过滤测试已通过 `1 passed`，证明 current attempt state / first-event guard skeleton、backend run path handoff、backend stream outcome materialization、backend trace snapshot、source runner contract 与 provider notification projection 仍能驱动现有 reply policy 主链；`asterMigrationBoundary.test.ts` 完整治理守卫已通过 `123 passed`，并固定 `reply_backend` current contract 以及 `aster_reply_backend_adapter.rs` / `aster_reply_message_adapter.rs` / `aster_reply_stream_adapter.rs` 三个 compat source adapter 的唯一职责。

判定：

- `refactor-aligned current skeleton`：`agent-runtime::reply_request`，归属 Turn reply request materialization contract。
- `refactor-aligned current skeleton`：`agent_reply_stream.rs` 作为 Turn stream policy 主循环，负责把 input、turn context policy 和 provider handle 汇合成 current request。
- `refactor-aligned current skeleton`：`agent-runtime::reply_host::RuntimeReplyStartRequest`，归属 Turn provider/reply execution handoff contract。
- `refactor-aligned current skeleton`：`agent-runtime::reply_session`，归属 Turn provider/reply execution handoff 的 session metadata preparation。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderWireSupportIssue` 与 `provider_request_wire_support_issue(...)`，归属 provider request capability check。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamStart` 与 `RuntimeReplyProviderStartError`，归属 Turn provider/reply execution handoff 的 provider stream start contract。
- `refactor-aligned current skeleton`：`model-provider::provider_stream::RuntimeReplyProviderStreamTrace`，归属 Turn provider/reply execution handoff 的 provider source call diagnostics snapshot。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall`，归属 Turn default source call handoff；mapped `RuntimeReplyDefaultCall<Message, aster::agents::SessionConfig>` 只是 Aster bridge 删除前的 compat payload。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplyProviderSourceCall`，归属 Turn provider source call handoff；mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>` 只是 Aster bridge 删除前的 compat payload。
- `refactor-aligned current skeleton`：`agent-runtime::reply_backend::RuntimeReplySourceCall` 与 `RuntimeReplySource::run(call)`，归属 Turn source backend execution handoff；Aster adapter 的 source method topology 已降级为 compat implementation detail。
- `compat blocker`：`request_tool_policy/aster_reply_backend_adapter.rs::CompatReplySourceExecutor`，只允许作为删除前的 Aster source executor；后续 provider/reply loop 迁出 Aster 后必须整块删除，不得升级为 current backend。
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

- provider/reply loop 迁出 Aster `Agent::reply` 后，`RuntimeReplyRequest` 应直接喂给 current provider/reply backend；Aster provider branch、`ConfiguredReplyProvider::stream_reply_with_agent(...)` 和 Aster `Message` lowering 同轮删除。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_backend_adapter.rs`，不得把它升级成 current backend implementation。
- provider/reply loop 迁出 Aster `Agent::reply` 后，补 current backend start guard：backend start 不得再混入 Aster context prep / session config conversion，provider idle timeout 与 retry state 必须只针对 provider stream lifecycle。
- provider/reply loop 迁出 Aster `Agent::reply` 后，current backend 可以直接实现 `RuntimeReplyBackend` 或后续并入最终 Turn executor；不得让 `AsterReplyRuntimeHost` / `AsterReplyBackend` 继续作为 runtime backend owner。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_message_adapter.rs`，不得把它升级成 current provider-neutral message adapter。
- provider/reply loop 迁出 Aster `Agent::reply` 后，删除 `aster_reply_stream_adapter.rs`、`AsterReplyStreamProjector` 和 Aster provider side-channel extraction；current backend 应直接产生 `RuntimeReplyStreamEvent` 或实现同一 Aster-free projector contract。
- provider stream start contract 必须继续归属 `model-provider` / Turn execution handoff；不得在 `credential_bridge`、`aster_reply_adapter.rs` 或 `aster_reply_backend_adapter.rs` 恢复 provider handle 匹配、backend 特判或 debug-only 校验作为事实源。
- provider source call diagnostics 必须继续通过 `RuntimeReplyProviderStreamStart::trace()` 暴露；`credential_bridge/runtime_provider_adapter.rs` 不得恢复 `provider_start.stream_request()` 字段拆解、`stream_request.provider_backend()` / `provider_name()` / `model_name()` 日志选择，避免把 provider request DTO 重新当成 adapter 内部事实源。
- default source call handoff 必须继续通过 `agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall`；`AsterReplySource` 不得恢复 `RuntimeReplyMessage + AgentSessionConfig + CancellationToken` 三散参入口，也不得让 default path 在 compat adapter 内重新拥有 source call shape。
- provider source call handoff 必须继续通过 `agent-runtime::reply_backend::RuntimeReplyProviderSourceCall`；`AsterReplySource` 和 `ConfiguredReplyProvider` 不得恢复 `provider_start + Message + SessionConfig + cancel_token` 四散参入口，也不得让 credential bridge 重新接收 `&RuntimeReplyProviderStreamStart`。`CompatAsterReplyProviderBackend` 作为最后的 Aster provider trait object 执行边界，只允许接收 mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`，不得恢复 `user_message` / `session_config` / `cancel_token` 三散参签名。
- source backend execution topology 必须继续通过 `agent-runtime::reply_backend::RuntimeReplySourceCall` 与 `RuntimeReplySource::run(call)`；不得在 `RuntimeReplySource` trait 或 `AsterReplySource` 中恢复 `run_default` / `run_provider` 双方法，把 source path method topology 重新交回 compat adapter。
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

### 4.5 native tool overlay current owner

当前状态：

- `tool-runtime::native_overlay` 持有 Lime-owned native tool overlay 清单：`view_image`、`apply_patch`、`skill_search`、`Skill`、`sleep`、`update_plan`、`WebFetch`、`WebSearch`。`Write` / `Edit` 与 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 已按 Codex 口径从 production overlay / allowlist、agent prompt、agent tool catalog 和 GUI current capability 检查中移除，只保留为 historical frontend / hook matcher / transcript alias 或待细化删除的 vendor residual。
- `tool-runtime::native_overlay` 进一步持有 `RuntimeNativeToolRegistration` plan，明确每个 overlay tool 的注册名与 owner：除 `Skill` 仍是 skill gate overlay 外，`view_image`、`apply_patch`、`skill_search`、`sleep`、`update_plan`、`WebFetch`、`WebSearch` 均必须由 `tool-runtime::native_dispatch` backing。
- `tool-runtime::native_overlay` 也持有 `RuntimeNativeToolInstallStep` / `runtime_native_tool_install_plan()`，把 overlay tool 的安装顺序、registration contract 和 `RuntimeNativeToolTurnContextSource` 固定到 current owner；`runtime_native_tool_install_definitions()` 进一步把 current model-visible definition 也固定在 `tool-runtime`。`native_tools/runtime_overlay.rs` 只消费该 current install plan 再落到临时 Aster `ToolRegistry`；`AgentRuntimeState` 在初始化和 gateway-backed tool 注册时只维护 `native_tool_definitions` current read model，`contains_native_tool(...)` 也从同一份 definition map 派生。GUI / Evidence inventory 只消费 `native_tool_definitions_snapshot()`，不再维护或读取单独的 current-name set。Aster overlay 仍保留 `create_runtime_native_tool(...)` 工厂适配，但该工厂只负责把 current install step 映射到统一 compat adapter，不再让主安装循环、inventory adapter 或 per-tool wrapper 自己从 Aster registry 反推 registration source / turn context / surface / definition。
- `tool-runtime::native_overlay` 也持有 `RuntimeNativeToolSurface`，承接 stateless overlay tool 的 definition、lookup-only aliases 和 retry override；`RuntimeNativePermissionDecision` / `check_runtime_native_tool_permissions(...)` 承接 stateless overlay tool 的 permission / confirmation 分派。`runtime_tool_bridge::RuntimeNativeToolAdapter` 统一读取该模型可见 surface、执行 current dispatcher，并只把 current permission decision 转换成临时 Aster `PermissionCheckResult`。`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`、`apply_patch`、`skill_search` 的 per-tool wrapper 文件已删除，不再各自保留 permission delegate、adapter 创建、`*_tool_definition()` 调用、legacy alias 常量、surface/options 读取、turn context 接线、本地 `Tool` trait 样板或 test-only `create_*_tool()` helper；临时 `Tool` 创建和 adapter 回归统一由 `runtime_tool_bridge.rs` 承接。
- vendored Aster `task_list_tools.rs`、`task_output_tool.rs`、`task_stop_tool.rs` 已删除；`tools/mod.rs` 不再导出或默认注册 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop`，SubAgent production allowlist 与 ToolSearch production alias 也不得恢复 Task\*。历史 frontend transcript / display 读面仍按 compat 处理，后续单独收缩。
- `tool-runtime::native_dispatch` 持有已迁 native tool 的 current definition / executor dispatch：`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`，并通过 gateway-aware builder 接入 `memory_store` / `image_task` / `tool_search`；gateway-backed memory/image/tool_search adapter 也从同一个 dispatch 取模型可见 definitions，不再直接调用各自 definition helper 或 vendor ToolSearch surface。这对齐 Codex registry/router 的骨架，但还没有替代 Aster reply loop 的 `ToolRegistry`。
- `lime-agent/src/native_tools/runtime_tool_bridge.rs` 集中已迁 tool 仍需的 Aster `PermissionCheckResult` / `ToolContext` / `ToolResult` / `ToolError` 临时转换；其中无 App Server gateway 的 stateless adapter 创建已进一步集中到 `create_runtime_native_tool_adapter(...)` / `RuntimeNativeToolAdapter`，但 bridge 不再持有 per-tool permission helper、`WebFetchInput` 或 preapproved host logic。需要 App Server gateway executor 的 `memory_store` / `image_task` / `tool_search` 已集中到 `native_tools/gateway_bridge.rs` + `RuntimeDefinitionToolAdapter`，旧 `native_tools/{memory_store,image_tasks,tool_search}.rs` 已删除。`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch` 的 per-tool wrapper 也已删除。
- `native_tools/runtime_overlay.rs::NativeRegistration` 现在集中承接 Aster `Box<dyn Tool>` 到 current `RuntimeToolDefinition` 的临时封装；`AgentRuntimeState` 只接收 `NativeRegistration` 并维护 current definition snapshot，不再直接 import `aster::tools::Tool`、不维护第二份 name set，也不从 `Box<dyn Tool>` 反推 current read model。gateway-backed `memory_store` / `image_task` / `tool_search` adapter factory 也只返回 `NativeRegistration`。
- `tool-runtime::native_overlay` 现在同时持有 `runtime_native_tool_registration_allowlist()`，作为 Lime 初始化 Aster registry 的 current policy owner；Lime 只允许注册 Codex-first/current 最小工具面，不再使用 Aster 默认全量工具池。
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
- `refactor-aligned current`：`runtime_native_tool_registration_allowlist()` 作为 Turn tool lifecycle / Item tool inventory 的当前注册面 policy。
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
- `lime-agent/src/tools/skill_tool_gate.rs` 只在 wrapper 内部消费 `tool_runtime::skill_gate`，`LimeSkillTool::name()` / `description()` / `input_schema()` 不再代理 Aster `SkillTool` surface，`args` object/array -> string 的 invocation normalization 也不再由 wrapper 自持；wrapper 已删除 Aster `SkillTool` backend，只保留 Aster `Tool` trait 外壳、当前 turn provider bridge 和 generic Aster `ToolResult` metadata attach。
- `lime-agent/src/tools/mod.rs` 只公开 `LimeSkillTool`，不再把 Skill gate API 作为 `lime-agent::tools` 公共事实源。

判定：

- `refactor-aligned current`：`tool-runtime::skill_gate`，归属 Turn tool lifecycle 的 model-visible surface、invocation input materialization、session gate / source metadata owner。
- `compat blocker`：`lime-agent/src/tools/skill_tool_gate.rs` 内 `LimeSkillTool` Aster `Tool` trait 外壳和 Aster provider bridge，因为 Aster reply loop / provider loop 尚未迁出 native tool registry。
- `dead / guarded`：`lime-agent` wrapper 本地 `SkillToolSessionAccess` store、skill allowlist/source metadata gate、`workspace_skill_source_for_session_skill` 第二份实现、wrapper 代理 Aster `SkillTool::name()` / `input_schema()` 的 surface、wrapper 本地参数规范化规则、`lime-agent::tools` 公共 re-export gate API，以及 App Server 通过 `lime_agent::tools` 读写 gate。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 `LimeSkillTool` wrapper；provider/reply loop 迁出 Aster 后删除 `CurrentSessionSkillProvider` Aster provider bridge。App Server 和 Turn executor 继续直接消费 `tool-runtime::skill_gate` / `skill_execute`。
- Skill source metadata 继续由 current gate owner 投影，不得在 Aster wrapper 或 App Server runtime enable 中恢复第二份 session/source store。

验证记录：

- `tool-runtime skill_gate --lib` 最新通过，`4 passed`；`lime-agent skill_tool --lib` 通过，`7 passed`；`asterMigrationBoundary.test.ts` 通过，`134 passed`。这证明 Skill surface、invocation normalization 与 session gate 已归属 Aster-free current owner；后续补测 `lime-skills::run` 与 `tool-runtime::skill_execute` 证明 prompt/workflow backend 迁出 Aster `SkillTool`。

### 4.7.2 Skill runtime contract current owner

当前状态：

- `tool-runtime::skill_runtime_contract` 持有 Skill runtime contract metadata、modality runtime contract registry 读取、execution profile / executor adapter 合成、policy snapshot skeleton、entry source 提取和 provided runtime contract preflight。
- `tool-runtime::skill_result` 持有 Skill runtime contract result metadata、runtime preflight failure projection 与 workspace skill source metadata projection。
- `lime-agent/src/tools/skill_tool_gate.rs` 只调用 current owner 构造 metadata map，并在 Aster reply loop 迁出前把该 map 写入 Aster `ToolResult`。
- 该模块服务 Lime 多模型 / 多模态 runtime contract，不把 Aster `SkillTool` 或 Aster registry 当事实源。

判定：

- `refactor-aligned current`：`tool-runtime::skill_runtime_contract` 与 `tool-runtime::skill_result`，归属 Turn tool lifecycle / Item tool metadata projection 的 contract / result metadata owner。
- `compat blocker`：`skill_tool_gate.rs` 内 generic Aster `ToolResult` metadata attach、Aster `Tool` trait 外壳与 Aster provider bridge。
- `dead / guarded`：wrapper 本地 governance JSON include、contract spec、default runtime contract 构造、policy snapshot、runtime contract extraction 和 preflight 校验第二份实现。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 wrapper 里的 `ToolResult` 转换；current Turn executor 直接消费 `SkillPreflightFailureProjection` / metadata map。
- runtime contract registry 读取只能留在 `tool-runtime` owner；App Server、Aster wrapper 或前端不得恢复各自解析一份 governance contract JSON。

验证记录：

- `tool-runtime skill_runtime_contract --lib` 通过，`3 passed`；`tool-runtime skill_result --lib` 通过，`3 passed`；`lime-agent skill_tool --lib` 通过，`7 passed`。这证明 runtime contract / result metadata owner 已在 Aster-free current crate 内闭环；后续 Skill prompt/workflow runner 迁移已删除 Aster `SkillTool` backend，`lime-agent` 侧仅剩临时 generic `ToolResult` attach、Aster `Tool` trait 外壳和 Aster provider bridge。

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

判定：

- `refactor-aligned current`：`tool-runtime::view_image` 承接 Turn tool lifecycle 规则，结果 metadata 属于 Item tool projection。
- `compat blocker`：`runtime_overlay.rs` + `runtime_tool_bridge.rs::RuntimeNativeToolAdapter` 仍为 Aster reply loop 创建 `view_image` 临时 `Tool` trait wrapper，因为 Aster reply loop native tool registry 尚未迁出。
- `dead / deleted / guarded`：`lime-agent/src/native_tools/view_image.rs`、Aster `ViewImageTool` vendor 实现、vendor media helper 依赖、vendor 默认注册。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 native tools 后，删除 `runtime_tool_bridge.rs` 里的 view_image permission adapter 和 `runtime_overlay.rs` 的临时 registry 接线。
- GUI / Evidence / provider lowering 继续消费 current model-visible image metadata，不得在 Aster wrapper 或 vendor media helper 中恢复 `read_image_file_enhanced`、`estimate_image_tokens` 或第二份 schema。
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
- `compat blocker`：`register_native_tool_on_agent(...)` 内部仍把 `NativeRegistration` 的 Aster `Tool` payload 注册进 Aster `ToolRegistry`，因为 Aster reply loop 尚未迁出 native tool execution。
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
- `lime-mcp::McpBridgeClient` 不依赖 Aster session context；它只接收调用方传入的 `Extensions`，因此可以继续作为 Aster-free MCP bridge 请求转发 owner。
- `lime-agent/src/mcp_bridge.rs` 只保留 Aster `McpClientTrait` adapter、`current_session_id()` / `SESSION_ID_HEADER` metadata 注入、`ExtensionConfig::Builtin` 降级注册和 Aster extension manager add/remove 接线。
- `mcp_bridge.rs` 不再持有 `ClientRequest::`、`send_cancellable_request`、`PeerRequestOptions`、`CancelledNotification*`、各 rmcp request DTO 或 `ServiceError::{UnexpectedResponse,Timeout,Cancelled}` 请求转发规则。

判定：

- `refactor-aligned current`：`lime-mcp::McpBridgeClient`，归属 Turn MCP tool lifecycle / bridge request forwarding。
- `compat blocker`：`mcp_bridge.rs` 的 Aster `McpClientTrait` / session metadata injection / extension manager registration。
- `dead / guarded`：在 `mcp_bridge.rs` 恢复 rmcp request forwarding、timeout/cancel 或 unexpected-response 规则；在 `lime-mcp::McpBridgeClient` 引入 `aster::`、`current_session_id` 或 `SESSION_ID_HEADER`。

退出条件：

- Aster reply loop 不再通过 Aster extension manager 注册 MCP tools 后，删除 `mcp_bridge.rs` 的 Aster adapter 与 `McpClientTrait` 实现。
- `lime-mcp::McpBridgeClient` 继续作为 Aster-free current bridge client；后续若 App Server / runtime 直接消费 MCP bridge，请求转发仍不得回流到 `lime-agent` adapter。
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
- `agent-runtime::ask` 已承接 `RequestUserInputRunRequest`、`RequestUserInputAction`、`RequestUserInputGateway` 和 `run_request_user_input(...)`，负责 prompt、requested schema、等待 gateway response 和 response normalization。
- `lime-agent/src/ask_bridge.rs` 只保留 Aster `AskCallback` adapter、Aster `AskRequest` -> current `AskRequest` DTO 映射、Aster action scope -> `agent_protocol::ActionRequiredScope` 映射，以及临时 `ActionRequiredManager` gateway。
- `ask_bridge.rs` 不再直接调用 `resolve_request_prompt`、`build_requested_schema` 或 current response extractor。

判定：

- `refactor-aligned current`：`agent-runtime::ask::{run_request_user_input, RequestUserInputGateway, RequestUserInputRunRequest}`。
- Thread / Turn / Item 归属：Turn action_required / elicitation lifecycle；GUI / App Server action response 主链继续消费用户输入。
- `compat blocker`：Aster reply loop 仍通过 `AskCallback` 和 `ActionRequiredManager` 触发 request_user_input；这只是 reply loop 未迁出前的 adapter。
- `dead / guarded`：`ask_bridge.rs` 恢复 prompt/schema/response runner、`extract_current_ask_response` 直连或把 Aster ask callback/request 从 `lime-agent` crate 根公开。

退出条件：

- Aster `Agent::reply` / native tool registry 迁出后，删除 `ask_bridge.rs` 的 Aster callback / `ActionRequiredManager` gateway。
- `asterMigrationBoundary.test.ts` 持续要求 current runner 存在于 `agent-runtime::ask` 且不含 `aster::`。
- 迁出最终阶段必须让 request_user_input 直接由 current Turn executor / App Server action_required 主链触发，不再经 Aster `AskTool`。

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
- `lime-agent/src/tools/skill_tool_gate.rs` 不再直接判断 session enabled / allowlist / workspace skill source lookup；`LimeSkillTool` 只调用 current access gate，并把 current error 转成临时 Aster `ToolError` / `PermissionCheckResult`。
- `tool-runtime::skill_execute` 已承接 Skill execution envelope、session access gate、workspace skill source lookup、runtime contract preflight、调用参数规范化和 result metadata 合并。
- `lime-skills::run` 已承接 prompt / workflow Skill runner；`tool-runtime::skill_execute::RuntimeSkillDefinitionBackend` 通过 `find_skill_by_name(...)` + `SkillRunner::new(...)` 执行 current Skill definition。
- `lime-skills::skill_loader` 已承接 current Skill registered-directory lookup，`register_skill_directory(...)` / `register_project_skill_directory(...)` / `is_registered_skill(...)` 负责 workspace `project:<directory>` Skill 的运行时注册；`find_skill_by_name(...)` 优先解析 current registry，再回落标准 Skills 根目录。
- `lime-agent/src/runtime_state_support.rs` 只作为 App Server / Aster reply loop 删除前的 host adapter 调用 `lime-skills` registry；生产段不再写 Aster `global_registry`，App Server `skill_runtime_enable` 通过 `register_project_skill_from_directory(...)` 真实消费该 current registry。
- `LimeSkillTool` 已删除 Aster `SkillTool` backend adapter，只保留 Aster `Tool` trait 外壳、当前 turn provider bridge 和最终 Aster `ToolResult` 类型转换；runtime contract / workspace source metadata shape 已归属 `tool-runtime::skill_result`，execution envelope 已归属 `tool-runtime::skill_execute`。

判定：

- `refactor-aligned current`：`tool-runtime::skill_gate::{check_skill_tool_access, SkillToolAccessError, workspace_skill_source_for_invocation_params}`。
- `refactor-aligned current`：`lime-skills::run::{SkillRunner, SkillRunResult, requires_turn_runtime, interpolate_variables}`，归属 Turn Skill prompt/workflow execution backend。
- `refactor-aligned current`：`lime-skills::skill_loader::{register_skill_directory, register_project_skill_directory, is_registered_skill, find_skill_by_name}`，归属 Turn Skill invocation definition lookup / runtime enable preparation。
- Thread / Turn / Item 归属：Turn tool lifecycle 的 Skill invocation access gate；workspace skill source metadata 是 Item tool output metadata 的 source fact。
- `compat blocker`：`lime-agent/src/tools/skill_tool_gate.rs` 内 Aster `Tool` trait 外壳、Aster provider bridge 和 Aster `ToolResult` 类型转换。
- `compat adapter`：`lime-agent/src/runtime_state_support.rs` 只允许调用 current Skill registry 与 Aster reply loop 初始化接线；Aster reply loop 删除后，应把 App Server Skill runtime enable 直接接到 current owner，不再经 `lime-agent`。
- `dead / guarded`：wrapper 内恢复 direct session enabled / allowlist / workspace source 判断，重新维护第二份 Skill gate store，或恢复 Aster Skills `global_registry` 作为 Lime Skill lookup truth。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 `LimeSkillTool` wrapper；provider/reply loop 迁出后删除 Aster provider bridge。
- `asterMigrationBoundary.test.ts` 持续要求 Skill access gate / execution owner 不含 Aster，wrapper 只做 Aster `Tool` trait 与 provider bridge 的临时映射。

### 4.22 Reply source dispatch current owner

当前状态：

- `agent-runtime::reply_backend` 已新增 `RuntimeReplySourceExecutor<M, C>` 与 `RuntimeReplySourceCall::run_with(...)`。
- default/provider reply source path 的分派由 `agent-runtime` current owner 执行，`lime-agent/src/request_tool_policy/aster_reply_backend_adapter.rs` 的 `AsterReplySource` 不再 match `RuntimeReplySourceCall::Default` / `Provider`。
- Aster adapter 只保留两层临时边界：`AsterReplySource` 做 current payload -> Aster DTO lowering，`CompatReplySourceExecutor` 做旧 `Agent::reply(...)` / configured provider stream 调用。
- 2026-07-09 approval Gate B 复验期间补齐 `RuntimeReplySourceCall::run_with(...)` 的 `M: Send` / `C: Send` 泛型边界；该方法返回 `BoxFuture`，async block 会持有 call payload 跨 await，边界收紧与既有 Send future contract 一致。

判定：

- `refactor-aligned current`：`agent-runtime::reply_backend::{RuntimeReplySourceExecutor, RuntimeReplySourceCall::run_with}`。
- Thread / Turn / Item 归属：Turn reply source execution path selection；Provider stream 与 reply backend start 仍归 Turn runtime owner，Item 投影仍由后续 stream projector 处理。
- `compat blocker`：`CompatReplySourceExecutor` 内部仍调用 Aster `Agent::reply(...)`、`ConfiguredReplyProvider::stream_reply_with_agent(...)` 和 Aster provider trait stream。
- `dead / guarded`：`AsterReplySource` 或 `start_aster_reply_stream(...)` 恢复 default/provider match、直接 `.reply(...)`、直接 `.stream_reply_with_agent(...)`，或把 provider wire support / session metadata preparation 规则写回 Aster adapter。

退出条件：

- Aster `Agent::reply` / provider trait loop 迁出后，删除 `CompatReplySourceExecutor`、Aster `Message` lowering 和 `project_aster_reply_stream(...)`。
- current Turn executor 直接消费 current provider stream / tool lifecycle 后，root workspace `aster` dependency 才能进入删除检查。
- `asterMigrationBoundary.test.ts` 持续要求 reply source path ownership 留在 `agent-runtime`，Aster adapter 只保留显式 compat executor。

### 4.23 Skill result metadata current owner

当前状态：

- `tool-runtime::skill_result` 已新增 `SkillPreflightFailureProjection`、`skill_preflight_failure_projection(...)`、`skill_runtime_contract_metadata_map(...)` 与 `workspace_skill_source_metadata_map(...)`。
- `lime-agent/src/tools/skill_tool_gate.rs` 不再持有 Skill-specific result JSON shape，不再本地维护 `build_runtime_preflight_error_result(...)`、`workspace_skill_source_metadata_value(...)` 或 runtime/source metadata attach helper；只把 current metadata map 写入临时 Aster `ToolResult`。

判定：

- `refactor-aligned current`：`tool-runtime::skill_result`，归属 Turn tool lifecycle / Item tool output metadata projection。
- Thread / Turn / Item 归属：Turn 执行前 preflight 与 Skill invocation source fact 进入 Item tool output metadata。
- `compat blocker`：`skill_tool_gate.rs` 内 Aster `Tool` trait 外壳、Aster provider bridge 与 generic `ToolResult::with_metadata(...)` 类型转换。
- `dead / guarded`：wrapper 内恢复 Skill result JSON shape、runtime preflight metadata、workspace source metadata 或 Skill-specific attach helper。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 `LimeSkillTool` / Aster `SkillTool` wrapper 和 generic `ToolResult` attach。
- `asterMigrationBoundary.test.ts` 持续要求 Skill result metadata owner 不依赖 Aster，wrapper 只做类型映射。

### 4.24 Skill execution envelope current owner

当前状态：

- `tool-runtime::skill_execute` 已新增 `RuntimeSkillExecutionRequest`、`RuntimeSkillBackendRequest`、`RuntimeSkillExecutionResult`、`RuntimeSkillExecutionError`、`RuntimeSkillExecutionBackend` 与 `run_skill_execution(...)`。
- `run_skill_execution(...)` 统一执行 Skill session access gate、runtime contract preflight、参数规范化、backend 调用、runtime contract metadata 与 workspace skill source metadata 合并；该 owner 不依赖 Aster，也不返回 Aster `ToolResult`。
- `tool-runtime::skill_execute` 已新增 `RuntimeSkillDefinitionBackend`，把 Skill definition lookup、prompt/workflow runner handoff 与 `SkillRunResult` metadata 投影纳入 current owner。
- `lime-agent/src/tools/skill_tool_gate.rs` 不再实现 Aster `SkillTool` backend adapter；它只把 current turn provider 暂时桥接成 `lime-skills::LlmProvider`，调用 `RuntimeSkillDefinitionBackend`，最终 `ToolResult` 转换只停留在 wrapper 边界。

判定：

- `refactor-aligned current`：`tool-runtime::skill_execute`，归属 Turn tool lifecycle / Skill invocation execution envelope。
- `refactor-aligned current`：`lime-skills::run`，归属 Turn prompt/workflow Skill execution backend。
- Thread / Turn / Item 归属：Turn 负责执行 envelope 与 backend handoff；Item metadata projection 仍由 `tool-runtime::skill_result` 负责。
- `compat blocker`：`LimeSkillTool` Aster `Tool` trait 外壳、Aster provider bridge 与 Aster `ToolResult` 类型转换。它们只是删除前 bridge，不是最终 Skill executor owner。
- `dead / guarded`：恢复 Aster `SkillTool` backend、wrapper 内恢复 runtime contract lookup、preflight failure projection、参数规范化、workspace source metadata 合并或 Skill result JSON shape。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 `LimeSkillTool` wrapper，并继续清理 Aster `ToolRegistry` / `Tool` trait 注册壳。`agent` / `allowed_tools` Skill 的执行必须进入 Turn runtime owner，不得恢复 Aster 子 Agent。
- `asterMigrationBoundary.test.ts` 持续要求 Skill execution envelope owner 不依赖 Aster，wrapper 生产段只做 provider bridge / result 类型转换。

验证记录：

- `CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-skills run --lib -j 2` 通过，`5 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_execute --lib -j 2` 通过，`4 passed`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。

### 4.24.1 Vendored SkillTool backend deletion

当前状态：

- Codex 对照：Codex 有 `core-skills` loader / metadata / render / injection 主链，但没有 Aster 式 vendored `SkillTool` execution backend、全局 Skill registry 作为 tool runtime truth，或 default tool registration。
- `lime-rs/vendor/aster-rust/crates/aster/src/skills/tool.rs` 已物理删除，`skills/mod.rs` 不再导出 `tool` module。
- `tools/mod.rs` 不再 re-export `crate::skills::SkillTool`，也不再通过 `config.allows_tool("Skill")` 注册 `SkillTool::new()`。
- `tools/registry.rs` 的 default alias matrix 不再包含 `("Skill", &["SkillTool"])`；vendored Aster 不再提供 `SkillTool` lookup alias。

判定：

- `refactor-aligned current`：`lime-skills::run`、`lime-skills::skill_loader` 与 `tool-runtime::{skill_execute, skill_gate, skill_result, skill_runtime_contract}`。
- Thread / Turn / Item 归属：Turn Skill invocation definition lookup、prompt/workflow execution、access gate 与 result metadata materialization；Item 只消费 current result metadata。
- `compat blocker`：`LimeSkillTool` Aster `Tool` trait 外壳、Aster provider bridge 与最终 Aster `ToolResult` 类型转换。
- `dead / deleted / forbidden-to-restore`：vendored Aster `SkillTool` backend、Aster default registration、Aster SkillTool alias matrix，以及 Aster Skills `global_registry` 作为 Lime Skill lookup truth。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 执行 Skill 后，删除 `LimeSkillTool` wrapper；provider/reply loop 迁出后删除 Aster provider bridge。
- `asterMigrationBoundary.test.ts` 必须持续要求 `skills/tool.rs` 不存在，并禁止 vendor `skills/mod.rs` / `tools/mod.rs` / `tools/registry.rs` 恢复 `SkillTool` backend、默认注册或 alias matrix。

验证记录：

- `CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools --lib -j 2` 通过，`4 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。

### 4.25 Approval HITL session cache scope

当前状态：

- Approval / HITL 的 current owner 固定为 App Server RuntimeCore pending action、`agentSession/action/respond`、session approval cache、Inputbar compact approval prompt、Thread/Item read model 与 Evidence export。
- P2 scope/lifecycle 已在 App Server current owner 完成：session approval key 包含 `riskClass`、`workspaceId`、`workingDirHash`、`projectRootHash`、`networkHost`，path 只保存 sha256 摘要，URL 只保存 scheme/host/port。
- 2026-07-09 Gate B 复验修复只触达受控 Electron fixture：新增 `scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs`，让 approval resume external backend 的 `action.required/action.resolved` 携带与 production `permission_preflight` 同构的 `approvalScope/approval_scope`；没有修改 Aster vendor、Aster native tools 或 Aster pending approval hook。

判定：

- `refactor-aligned current`：`lime-rs/crates/app-server/src/runtime/approval_cache.rs`、`runtime_backend/permission_preflight.rs`、`turn_execution.rs` / `session_lifecycle.rs` 中的 session cache scope、lifecycle 与 read-model/evidence 投影。
- Thread / Turn / Item 归属：Turn permission preflight / action_required lifecycle；Item timeline / evidence 只读投影；Thread/session scope 只在 current App Server session cache 内生效。
- `controlled-fixture`：`scripts/agent-runtime/claw-chat-current-fixture-approval-backend-events.mjs` 只服务 Gate B Electron CDP 证据，负责模拟 production external backend event shape，不是 production fallback。
- `dead / guarded`：approval A2UI 表单、消息流 pending approval submit、Harness inline approval submit、Aster approval hook/cache/pending map。
- `compat blocker`：Aster reply loop 只允许把 current permission decision 转成临时 `PermissionCheckResult`，不得持有 session cache、decision scope 或 pending approval map 语义。

验证：

- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server permission_preflight --lib -- --nocapture`，`7 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server approval_session_cache_auto_resolved --lib -- --nocapture`，`1 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server coding_snapshot --lib -- --nocapture`，`3 passed`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:agent-runtime-current-fixture`，Gate A 通过，`liveProviderUsed=false`。
- `CARGO_TARGET_DIR="/tmp/lime-approval-gateb-target" npm run smoke:claw-chat-current-fixture -- --scenario approval-request-resume --timeout-ms 240000 --cdp-port 9231 --prefix claw-chat-current-fixture-approval-request-resume-cdp --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`，Gate B 通过，summary proofLevel 为 `Gate B CDP controlled fixture`，18 项 approval 场景断言全 true。

退出条件：

- 后续补 P4 Timeline / replay 只读分类时仍必须消费 App Server current approval facts，不得在 Aster 或 A2UI 中新增 approval submit/cache 逻辑。
- 若继续扩展 Gate B decline/cancel 分支，先拆 `scripts/agent-runtime/claw-chat-current-fixture-approval-resume.mjs`，避免继续扩展接近 800 行的 scenario 文件。

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
