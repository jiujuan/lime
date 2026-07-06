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

因此，已迁出 Aster 的能力需要重新分成三类：

| 分类                           | 处理                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `refactor-aligned current`     | 与 refactor v1 owner 一致，继续作为 current owner 演进                                                  |
| `transitional current adapter` | 当前为了搬空 Aster 暂存于 Lime current crate，但不是最终 refactor owner；退出条件明确后删除或并入 owner |
| `compat blocker`               | 仍依赖 Aster trait / DTO / store / provider loop，下一步继续迁出，不允许新增业务逻辑                    |

## 2. 已迁能力复核

| 已迁能力                                                                                       | 当前落点                                                                                    | Thread / Turn / Item 归属                       | refactor v1 判定                              | 后续动作                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| session record create / exists / working_dir / extension_data / default working_dir            | `lime_core::database::agent_session_repository`                                             | Thread metadata                                 | `refactor-aligned current`                    | 保持为数据库 repository 边界；不得把 runtime item / provider event 塞入该 repository                                                                                                                                                                                                                                                                                       |
| session metadata/delete writes                                                                 | `lime_core::database::agent_session_repository` + `lime_session_repository.rs` thin adapter | Thread metadata mutation                        | `refactor-aligned current`                    | `lime_session_repository.rs` 只保留 trait adapter；写入 SQL 不得回流                                                                                                                                                                                                                                                                                                       |
| session row pure projection defaults                                                           | `thread-store::session_record`                                                              | Thread read model projection                    | `refactor-aligned current`                    | 保持 DB 无关；继续承接 title/session_type/timestamp/json 默认值规则                                                                                                                                                                                                                                                                                                        |
| session row SQLite loading                                                                     | `lime-agent/src/session_record_sql.rs`                                                      | Thread read adapter                             | `transitional current adapter`                | 仅作为搬空 Aster `SessionStore` 的过渡 adapter；不得长期扩张；Aster `SessionStore` 删除后优先删除该文件，若仍需 SQLite read model，再并入 App Server / read model owner                                                                                                                                                                                                    |
| Aster `SessionStore` get/list/search adapter                                                   | `aster_session_store/aster_trait.rs` + `session_projection.rs`                              | Thread compat DTO adapter                       | `compat blocker`                              | 只能调用 current read helpers 和 DTO 转换；不得恢复 `SESSION_RECORD_SELECT_COLUMNS` / `agent_sessions` SELECT / row mapper                                                                                                                                                                                                                                                 |
| Aster `SessionStore` export/import/copy/truncate                                               | Lime impl、vendor public wrapper、vendor trait 方法和 test fake 均已删除                    | 历史 bulk session 操作                          | `dead / deleted`                              | 当前无生产客户；不再迁成服务；Lime / vendor 不得重新实现这些 bulk 方法                                                                                                                                                                                                                                                                                                     |
| conversation transcript / legacy conversation / history search / todo / memory stub / insights | `thread-store::*` pure modules + Aster compat adapters                                      | Thread history / read model                     | `refactor-aligned current`                    | 保持 pure rule owner；Aster adapter 只做 DTO 回填，迁完后删除 adapter                                                                                                                                                                                                                                                                                                      |
| runtime queue contract                                                                         | `agent-runtime::runtime_queue` + `runtime_queue_aster_adapter.rs`                           | Turn queue                                      | `refactor-aligned current` + `compat blocker` | current queue service 继续在 `agent-runtime`；Aster store adapter 迁完 persistence 后删除                                                                                                                                                                                                                                                                                  |
| runtime timeline / conversation / snapshot projection                                          | `agent-runtime::*` + `runtime_*_aster_adapter.rs`                                           | Turn / Item projection                          | `refactor-aligned current` + `compat blocker` | source / projector 归 `agent-runtime`；Aster item payload adapter 仍是 blocker                                                                                                                                                                                                                                                                                             |
| tool execution shell/path/web/apply_patch helpers                                              | `tool-runtime::*` + reply-loop Aster `Tool` adapter                                         | Turn tool lifecycle / Item tool projection      | `refactor-aligned current` + `compat blocker` | 已迁 helper 不再回 vendor；`tool-runtime::native_overlay` 已承接 Lime native overlay 清单，GUI inventory 只把该清单标为 `current_surface`；`tool-runtime::apply_patch` 已承接 patch 执行、路径权限和 metadata/diff 构造；下一步处理 Aster reply loop native tool registry 壳                                                                                               |
| provider/reply stream request/event/host DTO                                                   | `agent-runtime::*` / `model-provider::*` + `aster_reply_adapter.rs`                         | Turn execution / provider event materialization | `partial current` + `compat blocker`          | 必须继续迁出 `Agent::reply`、Aster `Message`、Aster `AgentEvent`、provider trait object                                                                                                                                                                                                                                                                                    |
| vendor unused public modules                                                                   | 已从 `aster-core` `lib.rs` 和物理目录删除                                                   | 不进入 Thread / Turn / Item current 主链        | `dead / deleted`                              | `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome*`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map`、`core`、`logging`、`lsp`、`memory`、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`telemetry`、`teleport`、`tracing`、`updater` 不得恢复为 valuable reference |

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

判定：

- `dead / deleted / forbidden-to-restore`。
- 不属于 Thread / Turn / Item current owner，也不应作为 valuable reference 编译留存。

退出条件：

- `asterMigrationBoundary.test.ts` 持续要求上述目录不存在，且 `vendor/aster-rust/crates/aster/src/lib.rs` 不得恢复对应 `pub mod`。
- 如果后续确有产品需求，只能按 refactor v1 归属进入 Lime current owner；不得恢复 vendor public module 当作实现入口。

### 4.5 native tool overlay current owner

当前状态：

- `tool-runtime::native_overlay` 持有 Lime-owned native tool overlay 清单：`Write`、`Edit`、`apply_patch`、`skill_search`、`Skill`。
- current owner API 使用 `runtime_native_tool_overlay_*` 领域命名；不为刚迁出的 `lime_native_tool_overlay_*` 保留别名。
- `native_tools/runtime_overlay.rs` 只把 current 清单落到临时 Aster `ToolRegistry`。
- `agent_tools/tool_inventory_runtime_adapter.rs` 只把该清单命中的 registry tool 标成 `current_surface`；其他 Aster registry tool 显示为 `registry_native`。

判定：

- `refactor-aligned current`：`tool-runtime::native_overlay`。
- `compat blocker`：Aster `ToolRegistry` / `Tool` trait 的实际执行壳仍在 `native_tools/runtime_overlay.rs` 与 reply loop。

退出条件：

- Aster reply loop 不再通过 Aster `Tool` trait 调用 WebFetch/WebSearch/native tools 后，删除 `native_tools/runtime_overlay.rs` 中的 Aster registry 注册壳。
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

## 5. 下一刀排序修正

按 refactor v1 重新排序后，Aster 迁移下一刀不应继续只做 SQL 小修，应优先选择能减少 `compat blocker` 的主链切片：

| 优先级 | 下一刀                                                                                       | 原因                                                                                      |
| ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1      | provider/reply loop：`Agent::reply` / Aster `Message` / `AgentEvent` / provider trait object | Phase 6 最大 blocker，属于 Turn execution 主链                                            |
| 2      | Aster reply loop native tool registry 壳                                                     | WebFetch/WebSearch 等已迁能力仍通过 Aster `Tool` trait 壳消费，影响 Tool / Item lifecycle |
| 3      | runtime store persistence：Aster `ThreadRuntimeStore` / item payload source                  | 影响 Turn / Item read model 与 Evidence，阻塞 root `aster` dependency 删除                |
| 4      | Aster `SessionStore` remaining get/list/message DTO adapter                                  | export/import/copy/truncate 已退役；剩余 blocker 是 provider/reply 仍要 Aster DTO         |
| 5      | `session_record_sql.rs` 二次归位或删除                                                       | 只在 Aster `SessionStore` trait 删除后执行，避免现在过早搬到错误 owner                    |

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
