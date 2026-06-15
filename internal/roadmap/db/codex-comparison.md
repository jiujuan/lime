# Lime / Codex 本地存储对比

> 状态：current comparison source  
> 更新时间：2026-06-14  
> 关联 PRD：`internal/roadmap/db/prd.md`  
> 关联执行计划：`internal/exec-plans/db-slimming-codex-alignment-plan.md`

## 1. 结论

Lime 当前 DB 路线需要治理重构。问题不是 SQLite 本身，而是 `lime.db` 同时承接产品主库、Agent transcript、timeline projection、runtime reliability、request telemetry 和部分大输出索引，导致事实源膨胀、锁竞争半径变大、repair 边界不清。

Codex 更接近可持续结构：JSONL rollout 是线程历史的 durable replay，SQLite 只做可查询 metadata / state / logs / goals / memories 等分域索引。Lime 应采用同一原则，但不照搬 Codex 文件名：新 Agent transcript 固定进入 JSONL event log；Projection DB 独立为 `<data-root>/runtime/projection_1.sqlite`；`lime.db` 只保留合理产品数据。

用户已明确“旧 `agent_messages` 不保留”。因此 `agent_messages` 的最终分类是 `deprecated / migration-source`：只允许一次性 migration/backfill/export 输入；产品读路径不允许把它当长期 fallback；迁移完成后删除旧表读写路径。

新会话用户输入也必须进入 JSONL durable log。Lime 当前做法是把用户输入写成 `message.created` event，再由 Projection repair / shared load context 从 event log 恢复 `turn_inputs` 和 read/export 消息；内存 `turn_inputs` 不是事实源。

## 2. Codex 侧事实

本地源码证据：

| 证据 | 位置 | 结论 |
| --- | --- | --- |
| `codex-thread-store` README | `/Users/coso/Documents/dev/rust/codex/codex-rs/thread-store/README.md` | `ThreadStore::append_items` 是 canonical history append；`LocalThreadStore` 用 JSONL rollout 保存 history，用 SQLite state DB 保存可查询 metadata。 |
| `LocalThreadStore` | `/Users/coso/Documents/dev/rust/codex/codex-rs/thread-store/src/local/mod.rs` | local storage 明确把 rollout JSONL 视为 durable replay format；SQLite state DB 是 list/read 快速 lookup 的 metadata index。 |
| `read_thread.rs` | `/Users/coso/Documents/dev/rust/codex/codex-rs/thread-store/src/local/read_thread.rs` | 读取 history 时会校验 SQLite 指向的 rollout path 是否仍能加载目标 thread；SQLite metadata 不能单独成为唯一 truth。 |
| `state/src/lib.rs` | `/Users/coso/Documents/dev/rust/codex/codex-rs/state/src/lib.rs` | state crate 小而聚焦，只负责从 JSONL rollout 抽 metadata 到 SQLite；DB 文件名分为 `state_5.sqlite`、`logs_2.sqlite`、`goals_1.sqlite`、`memories_1.sqlite`。 |
| `state/src/runtime.rs` | `/Users/coso/Documents/dev/rust/codex/codex-rs/state/src/runtime.rs` | `StateRuntime::init(codex_home, ...)` 在一个明确 root 下打开多份 SQLite，logs 独立文件以降低与 state store 的锁竞争。 |

WebSearch / 公开资料补充：

| 来源 | 结论 |
| --- | --- |
| [OpenAI Codex `thread-store` README](https://github.com/openai/codex/blob/main/codex-rs/thread-store/README.md) | 线程历史与元数据分离，JSONL 用作 durable replay，SQLite 用作可查询 metadata / state index。 |
| [OpenAI Codex `state/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/state/src/lib.rs) | `state_5.sqlite`、`logs_2.sqlite`、`goals_1.sqlite`、`memories_1.sqlite` 说明 Codex 也采用分域 store，而不是单一大库。 |
| [Electron `app.getPath`](https://www.electronjs.org/docs/latest/api/app) | `userData` 是应用配置和用户数据目录，建议应用文件放入 `userData` 子目录；`sessionData` 承接 Chromium session / cache，避免污染 durable data root。 |
| [Apple 文件放置指南](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPFileSystem/Articles/WhereToPutFiles.html) | macOS durable support files 应进入应用专属 `Application Support` 子目录；cache 进 `Caches`；temp 使用系统 API，不硬编码 `/tmp`。 |
| [Microsoft Known Folder](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid) | Windows 应通过 Known Folder 语义获取 `LocalAppData` / `RoamingAppData` 等目录，不硬编码用户路径。 |

## 2.1 Codex 已落地、Lime 需补齐的可靠性底座

架构形状之外，Codex 还为同一架构配了一套可靠性底座。Lime 当前抄到了形状，没抄到底座；下表是差距，详见 PRD §13.8–13.10、§4 非目标、§17.8。

| 能力 | Codex 证据 | Lime 现状（2026-06-15 代码） | 缺口分类 |
| --- | --- | --- | --- |
| SQLite 并发 pragma | `state/src/runtime.rs`：`journal_mode=WAL` + `synchronous=NORMAL` + `busy_timeout(5s)` + `SqlitePoolOptions::max_connections` | `projection_store.rs` / `infra/telemetry/store.rs` per-call `Connection::open`，无任何 pragma | 必补，低成本高收益 |
| DB 损坏自愈 | `state/src/runtime/recovery.rs`：`is_sqlite_corruption_error` 检测 → `backup_runtime_db_for_fresh_start` 备份 → fresh start 重建 | 无 corruption 检测 / 备份 / 重建；projection 可重建却没用上这一优势 | 必补，是 projection 架构核心收益 |
| Event log 压缩 / 保留 | `rollout/src/compression.rs`：`spawn_rollout_compression_worker` 后台压 `.zst`，run marker 防重复，不阻塞启动 | 无压缩 / 无保留期 / 无磁盘上限 | 至少显式声明债务 |
| 迁移并发 claim | `state/src/runtime/backfill.rs`：`try_claim_backfill(lease_seconds)` 多 runtime 抢占 lease | 无；S3 迁移设计了中断幂等恢复但未声明 writer 假设 | 单 writer 假设需显式声明（PRD §4） |
| 独立 Memory / Goals DB | `memories_1.sqlite` / `goals_1.sqlite` 有完整 schema 与 store | 架构图 / 目录列了 `MemoryDb` 但零设计；实际 memory 仍读 `lime.db`（`unified_memory.rs`） | 标为本轮非目标，避免假入口 |

## 3. Lime 侧现状

| Surface | 当前状态 | 分类 | 风险 |
| --- | --- | --- | --- |
| `lime.db` | 同时包含产品配置、用户资产、Agent session、message、timeline、reliability、运行追踪 | current Product DB + compat/deprecated runtime tables 混合 | 主库持续膨胀，DB repair 半径过大。 |
| `agent_messages` | `aster_session_store`、`AgentDao`、`ChatDao` 仍有旧读写；usage/model 统计已退出旧表 fallback | deprecated / migration-source | 如果继续保留产品 fallback，会阻断 DB 瘦身。 |
| `agent_thread_turns / agent_thread_items` | GUI timeline projection 仍在 Product DB | compat projection | 可短期保障 GUI，但不能继续承接完整 transcript truth。 |
| `agent_thread_items.payload_json` | 仍可能承载较大 runtime payload | deprecated payload carrier | 大输出和完整 event 混进 DB。 |
| `request_logs/` 文件目录 | request telemetry 文件主链仍存在 | compat / migration-source | 需要迁到 Telemetry DB，避免 evidence 旁路各读各的。 |
| `runtime/events/sessions/session_<id>.jsonl` | 已落地 JSONL event log | current durable log | 应成为新 Agent transcript truth。 |
| `runtime/projection_1.sqlite` | 已落地独立 Projection DB | current projection | 必须可由 JSONL session-scoped repair 重建，不能成为第三事实源。 |
| `message.created` event | 新会话用户输入 durable event | current transcript event | 防止旧 `agent_messages` 删除后，重启读回丢失 user message。 |

## 4. 目标对齐

| 维度 | Codex | Lime 目标 |
| --- | --- | --- |
| durable transcript | rollout JSONL | `<data-root>/runtime/events/sessions/session_<id>.jsonl` |
| metadata / read index | `state_5.sqlite` | `<data-root>/runtime/projection_1.sqlite` |
| logs / telemetry | `logs_2.sqlite` | `<data-root>/runtime/telemetry_1.sqlite` |
| goals / memories | 独立 DB | 后续按 Objective / Memory 域拆独立 store |
| 产品配置 | Codex config / home 文件 | `lime.db` Product DB，只保留低频产品对象 |
| repair 策略 | 从 rollout 校验 / reconcile SQLite metadata | 从 JSONL event log session-scoped repair Projection DB |
| 旧 history fallback | rollout 仍是 canonical history | `agent_messages` 不保留为产品 fallback，只做一次性迁移输入 |

## 5. 路径规范

Lime 不在业务模块里判断 macOS / Windows 绝对目录。Desktop 托管时由 Electron `app.getPath("userData")` 派生 `app-server` data root 并通过 `--data-dir` 传给 App Server；CLI / 测试使用 `--data-dir` 或 `APP_SERVER_DATA_DIR`；Rust store 只接受显式 root。

平台依据：

| 平台 / API | 约束 |
| --- | --- |
| Electron `app.getPath("userData")` | 应作为应用级用户数据根；`sessionData` 可用于 Chromium session/cache，避免大 cache 污染 durable data root。 |
| Apple Application Support / Caches / tmp | durable app support 文件进入应用专属 Application Support 子目录；可重建缓存放 Caches；临时文件放 tmp。 |
| Windows Known Folders | 通过 Known Folder / Electron / `dirs` 获取 LocalAppData / RoamingAppData 等语义目录，禁止硬编码 `%APPDATA%` 或用户目录。 |

## 6. 治理判定

`agent_messages` 不保留的含义：

1. 不作为 `agentSession/read`、`evidence/export`、`agentSession/*/export` 的长期 fallback。
2. 不承接新 Agent runtime transcript 写入。
3. 不作为 usage / telemetry 的长期聚合来源。
4. 只允许 migration / backfill / export 工具一次性读取旧数据。
5. 迁移完成后删除旧表读写路径；如果需要用户审计历史，审计对象必须来自 event log 或导出的用户文件，不是继续保留 `agent_messages` 产品表。
6. 用户输入不能退回 `agent_messages` 或内存 `turn_inputs`，必须来自 JSONL `message.created` 或迁移生成的等价 event。

P4 Telemetry DB 最小骨架已经把 request telemetry 的目标 owner 迁入独立 `telemetry_1.sqlite`，`request_logs/` 文件目录降为 `compat / migration-source`。P4-b 只在找到真实 provider request source 后补生产写入接线，不伪造 provider/model/duration。

P5 contract 已把 tool large output、file checkpoint snapshot、artifact snapshot 和含正文 artifact payload 接入 `sidecarRef + sha256`，并由 `<data-root>/runtime/sidecar` 作为 App Server 显式 root。下一刀不再扩展 sidecar 功能面，而是转入 S2 骨架守卫；旧 `agent_messages` 只保留迁移输入身份。
