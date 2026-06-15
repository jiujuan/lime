# Lime DB 瘦身与 Codex-aligned 存储执行计划

> 状态：进行中  
> 更新时间：2026-06-15  
> 关联路线图：`internal/roadmap/db/README.md`  
> 关联 PRD：`internal/roadmap/db/prd.md`  
> 当前阶段：骨架优先顺序已重排；P5/S1 Sidecar contract 已完成；App Server data-dir 产品迁移、设置页 Provider 迁移 smoke、迁移源 Product DB 清理策略已补齐；历史会话 Electron smoke 已跑通；用户反馈基本对话不可用时，先按产品阻塞处理；已补 Electron sidecar stale stdin 重启重试和临时 workspace 污染自动回收，恢复真实对话闭环后再回到 S2/S3 守卫收口

## 1. 主目标

让 `lime.db` 只保留合理的产品数据；Agent runtime 历史、遥测、大输出和可重建读模型迁出主库，靠近 Codex 的 `append-only log + SQLite metadata/projection` 架构。

本计划不是“替换 SQLite”，而是治理事实源：

- Product DB 保留低频、事务一致的产品对象。
- Agent durable log 承接 runtime transcript。
- Projection DB 承接 session list、timeline、thread read model、reliability read model。
- Telemetry DB 承接 request / token / latency / log metric。
- Sidecar 承接大输出、artifact、file checkpoint 和 workspace 随行文件。

## 2. 当前事实源声明

后续新增 Agent runtime 存储能力只允许向：

`App Server JSON-RPC -> RuntimeCore -> Agent durable log -> Projection writer -> Projection DB`

收敛。`agent_messages` 只作为 migration/backfill/export 输入，不保留长期兼容读取；`agent_thread_turns`、`agent_thread_items` 只能作为迁移期 projection，不得继续承接新 runtime transcript truth。

平台路径事实源固定为：

`Electron userData / App Server --data-dir / APP_SERVER_DATA_DIR / app_paths`

领域 store 只接受显式 `data_root` 或 `workspace_root`，不得自行拼 macOS / Windows 目录、`~/.lime`、repo 根或 temp 路径保存 durable fact。

## 3. 分类

### current

- `lime.db` / Product DB：provider、API key、model registry、workspace、settings、user assets、插件、低频产品对象。
- App Server `--data-dir` / `APP_SERVER_DATA_DIR`：CLI 和测试模式 data root 注入边界。
- `app_paths::preferred_data_dir()`：Rust fallback / legacy migration 边界。
- workspace `.lime/`：项目随行 artifact、checkpoint、harness evidence、task artifact。

### compat

- `agent_sessions`：迁移期 session metadata；目标只保留产品级 metadata 或 projection ref。
- `agent_thread_turns`、`agent_thread_items`：迁移期 timeline projection；目标迁到 Projection DB。
- `current_timeline` LocalAppDataSource：App Server 读取旧 timeline 的 bridge；目标切到 projection reader。
- `request_logs/` 文件目录：Telemetry DB 前的迁移来源。
- `sessions/`、`aster/` runtime 目录：P0 待判定，当前不能继续扩大职责。

### deprecated

- `agent_messages` 作为新 Agent runtime transcript truth。
- `agent_thread_items.payload_json` 作为唯一 runtime event truth 或大输出载体。
- `RequestLogger` 将 request telemetry 作为文件主事实源，而不是 Telemetry DB。
- `provider_pool_credentials` 继续作为运行时凭证读取源。
- 无退出条件的 Aster session store 新写入。

### dead

- 恢复 `lime-rs/src/**` 或 `lime-rs/src/commands/**` 承接 DB / runtime 存储。
- 新增 legacy Tauri command 作为数据迁移入口。
- 新增与 App Server JSON-RPC 平级的生产 runtime DB API。

## 4. 阶段计划

| 阶段    | 状态                            | 目标                                      | 退出条件                                                                                                                                                                                                                                                                                |
| ------- | ------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0      | 已完成                          | inventory 和边界冻结                      | 表级分类、写入点地图、路径 owner、文档 current 锚点完成                                                                                                                                                                                                                                 |
| P1      | 已完成                          | Data root 边界收敛与 Event log dual-write | Desktop 托管显式传 `--data-dir`；新会话 turn 写 JSONL durable log                                                                                                                                                                                                                       |
| P2      | 已完成                          | Projection writer / repair 底座           | 独立 `projection_1.sqlite` 中的最小 session/turn/item projection 可从 event log 重建                                                                                                                                                                                                    |
| P3      | 已完成骨架，兼容收尾            | Read/export 共享 load context             | 新会话用户输入可从 `message.created` JSONL event 恢复；read/export 不依赖 `agent_messages`                                                                                                                                                                                              |
| P4      | 已完成最小骨架，P4-b 后续证据项 | Telemetry DB 最小 owner                   | `TelemetryStore` 独立接管 `telemetry_1.sqlite`，App Server 初始化并注入 Telemetry DB，`evidence/export` 优先读取 Telemetry DB；生产 HTTP/shared logger 写入接线只在确认真实 request source 后补齐，不作为 P5 前置阻塞                                                                   |
| P5      | 已完成骨架，后续只做守卫验证    | Sidecar contract 补齐                     | `SidecarStore`、`StorageRoots.sidecar_root`、tool large output、file checkpoint previous content、`artifact.snapshot` 和含正文 artifact payload 已通过 ref + sha256 写入 sidecar；剩余 generated artifact / current checkpoint 只在 S2 扫描发现真实 inline 大正文写入点时按守卫缺口处理 |
| P6 / S2 | 当前唯一主刀                    | 骨架守卫                                  | 在继续细节治理前，先封住 `agent_messages`、`agent_thread_items.payload_json` 大正文、裸 `outputSnapshotFile` / `checkpointSnapshotFile`、无 `sidecarRef.sha256` runtime event 和硬编码平台路径回流；`payload_json` 新写入已改为 bounded projection                                                                                             |
| P7 / S3 | 进行中                          | 旧消息路径退场                            | `agent_messages` 旧表读写路径删除；用户历史已迁入 event log 或导出为用户文件；迁移成功后默认清 legacy rows / message-only session shells，支持配置保留或仅空表时 drop；旧生产 reader/writer 退场仍留到 S4                                                                               |

## 5. 骨架优先顺序

本计划从 2026-06-14 起重排为“先把不可逆骨架立住，再做细粒度治理”。骨架的判定标准只有三条：

1. 它是否改变 durable truth 的 owner。
2. 它是否减少 `lime.db` 对 runtime transcript、telemetry 或大正文的承载。
3. 它是否封住旧 owner 回流，让后续细节不会继续长在旧路上。

按这个口径，后续执行顺序固定为：

| 顺序 | 骨架                                                              | 状态            | 说明                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0   | data root / JSONL event log / Projection DB / shared load context | 已完成          | 新会话用户输入和 read/export 已能绕开 `agent_messages` 主链                                                                                                                                                                                  |
| S1   | Sidecar contract completion                                       | 已完成骨架      | `artifact.snapshot` 和含正文 artifact payload 已统一写入 `<data-root>/runtime/sidecar`，event payload 只保留 `sidecarRef + contentStatus + contentBytes + contentSha256`；generated artifact / current checkpoint 后续只作为 S2 扫描缺口处理 |
| S2   | Guard before fine detail                                          | 当前唯一主刀    | 先扫描并封住 `agent_messages` 新写入、`payload_json` 大正文、裸 snapshot file 字段、无 checksum sidecar ref、硬编码平台路径；`payload_json` 新写入已不再保存完整大 artifact / tool output                                                                                                                  |
| S3   | Legacy message exit                                               | 进行中          | 一次性 backfill/export 旧历史，默认清 legacy rows / message-only session shells；启动配置可选 `retain` / `clear-rows` / `drop-empty-tables`，产品读路径不保留 fallback                                                                       |
| S4   | Fine-grained cleanup                                              | S3 后按收益排序 | P4-b 真实 request telemetry 接线、`current_timeline` bridge 收尾、旧 DAO/store/schema 引用清零、历史表 drop migration（包含 legacy message 表结构）；usage/model 已退出 `agent_messages` fallback                                            |

明确后置的非骨架项：

1. P4-b 生产 provider/request 级 telemetry 写入接线只作为证据项保留；必须基于真实 request source，不允许为了补表而伪造 provider/model/duration。
2. `current_timeline` 旧桥、旧 `agent_thread_*` GUI projection 和历史 `agent_messages` 兼容只做迁移/导出/白名单收口，不提升为长期 fallback。
3. evidence/export 的 sidecar summary polish 只在验证 S2 守卫必需时一起做；如果只是展示字段补全，归入 S4。
4. 每一刀必须减少 `lime.db` 对 runtime transcript、telemetry、大输出的承担范围；做不到这一点就不列为当前主刀。

## 6. P0 工作项

- [x] 新建 DB 路线图入口：`internal/roadmap/db/README.md`
- [x] 新建完整 PRD：`internal/roadmap/db/prd.md`
- [x] PRD 补平台路径与文件落盘规范。
- [x] 新建本执行计划文件。
- [x] 新建 `internal/roadmap/db/inventory.md`。
- [x] 完成第一版 `lime.db` 表级分类：`keep / move / projection / deprecated / dead`。
- [x] 盘点第一版 `agent_sessions / agent_messages / agent_thread_turns / agent_thread_items` 写入点。
- [x] 盘点第一版 durable 写入根目录和路径 owner。
- [x] 补 `.gitignore` 白名单，让本计划和 `internal/roadmap/db/*.md` 成为可版本化 artifact。
- [x] 机械校验 inventory 覆盖 `schema.rs` current 表清单。
- [x] 更新 `internal/aiprompts/persistence-map.md`，移除已删除 `lime-rs/src/**` current 锚点。

## 7. 当前证据

### Codex 参考

- `codex-rs/state/src/lib.rs`：state crate 小而聚焦；从 JSONL rollout 抽 metadata 到 SQLite。
- `codex-rs/state/src/runtime.rs`：`StateRuntime::init(codex_home, ...)` 在同一 root 下分拆 `state_5.sqlite`、`logs_2.sqlite`、`goals_1.sqlite`、`memories_1.sqlite`。
- `codex-rs/thread-store/src/local/mod.rs`：JSONL rollout 是 durable replay；SQLite 是 queryable metadata index。
- `codex-rs/thread-store/src/local/read_thread.rs`：读 history 前验证 SQLite 指向的 rollout path 仍能加载目标 thread。
- `internal/roadmap/db/codex-comparison.md`：沉淀 Codex / Lime 对比，固定 Lime 采用 JSONL durable log + 独立 Projection DB，不保留 `agent_messages` 产品 fallback。

### Lime 现状

- `lime-rs/crates/core/src/database/mod.rs`：`DbConnection = Arc<Mutex<Connection>>`，`init_database_with_data_dir(data_dir)` 只创建 `<data_dir>/lime.db`。
- `lime-rs/crates/core/src/database/schema.rs`：`agent_sessions`、`agent_messages`、`agent_thread_turns`、`agent_thread_items`、`agent_turn_outcomes`、`agent_thread_incidents` 都仍在 Product DB schema 中。
- `lime-rs/crates/services/src/aster_session_store.rs`：已收口为 current runtime conversation 优先读取；旧 `agent_messages` 只作为 migration 导入源，不再作为产品 fallback。
- `lime-rs/crates/core/src/database/dao/agent_timeline.rs`：仍向 `agent_thread_turns` / `agent_thread_items.payload_json` 写迁移期 timeline projection；新写入已通过 `agent_timeline_payload` 限制为 bounded payload，不再把完整大 artifact / tool output 写回 Product DB。
- `lime-rs/crates/app-server/src/local_data_source/current_timeline.rs`：App Server 仍从旧 timeline 表读 current timeline。
- `lime-rs/crates/infra/src/telemetry/logger.rs`：request log 仍写 `app_paths::resolve_request_logs_dir()` 文件目录。
- `lime-rs/crates/app-server/src/main.rs`：App Server 支持 `--data-dir` 和 `APP_SERVER_DATA_DIR`，Electron 托管时由 Host 显式传入 `app.getPath("userData")/app-server`。
- `lime-rs/crates/core/src/app_paths.rs`：显式 `app-server` data-dir 初始化时，优先从同一 Electron `userData/lime.db` 迁移 Product DB；旧库选择信号已覆盖 settings、Provider UI 状态、非系统 Provider、providers、api_keys 等产品设置数据。
- `lime-rs/crates/core/src/product_db_migration_cleanup.rs`：Product DB migration cleanup 独立模块，支持 `retain / clear-rows / drop-tables / delete-file`；默认 `drop-tables` 只清迁移源旧 `userData/lime.db` 的用户 schema/table/data，保留空 DB 文件。
- `packages/app-server-client/src/index.ts`：`SidecarLaunchConfig.dataDir` 会组装为 `--data-dir <path>`，统一 env/dev/packaged sidecar 启动参数。

## 8. 当前 blocker / 风险

- 本计划和 `internal/roadmap/db/*.md` 已加入 `.gitignore` 白名单；其余 `internal/exec-plans/*` 与 `internal/roadmap/**` 仍按仓库规则默认 ignored。
- Electron Desktop Host 已把 `app.getPath("userData")/app-server` 显式传给 App Server `--data-dir`；后续 runtime store 必须继续复用该 root，不能在领域模块重新发现平台目录。
- 如果用户已启动过一次空 `app-server/lime.db`，迁移判定必须允许“当前库有 schema 但没有用户信号、父级 `userData/lime.db` 有 settings / Provider / api_keys 信号”时自动恢复；不得只凭迁移 marker 或 schema 存在判定完成。
- `lime-rs/crates/core/src/database/schema.rs` 已超过 1000 行；后续实现不应继续往中心 schema 文件追加 runtime 表，应拆 product/projection schema 边界。
- `lime-rs/crates/core/src/app_paths.rs` 已超过 1000 行；本轮只允许保留路径解析 / 迁移来源发现的薄入口，迁移后清理逻辑必须继续放在 `product_db_migration_cleanup.rs` 等独立模块。
- `current_timeline` 仍是 compat bridge；它只允许保障旧 GUI projection 过渡，不应继续决定骨架优先级。
- `agent_thread_items.payload_json` 已完成写入侧 bounded projection 收口；剩余风险是旧行兼容读取、`current_timeline` bridge 和 S4 历史表结构退场。
- `request_logs/` 文件目录已经降为 `compat / migration-source`；P4-b 只补真实 request telemetry 的生产写入证据，不允许把 runtime event summary 伪造成 provider request log。

## 9. 本轮进度日志

### 2026-06-14

- 建立 `internal/roadmap/db/README.md` 和 `internal/roadmap/db/prd.md`，固定 DB 瘦身主目标。
- PRD 增补 macOS / Windows 平台路径规范：Desktop 托管由 Electron `userData` 派生 App Server `--data-dir`，Rust store 只接受显式 root。
- 读取 Lime governance 事实源，按 `current / compat / deprecated / dead` 归类 DB surface。
- 开始 P0 inventory 证据盘点：schema 表、Agent message/timeline 写入点、request log 目录、App Server data-dir 入口。
- 建立本执行计划，后续每一刀必须同步更新本文件。
- 补 `.gitignore` 白名单：`internal/exec-plans/db-slimming-codex-alignment-plan.md`、`internal/roadmap/db/*.md`。
- 完成 inventory 覆盖校验：从 `lime-rs/crates/core/src/database/schema.rs` 抽取 `CREATE TABLE IF NOT EXISTS ...` 表名，全部能在 `internal/roadmap/db/inventory.md` 找到分类。
- 更新 `internal/aiprompts/persistence-map.md`：不再把 `lime-rs/src/services/*`、`lime-rs/src/commands/*` 当 current 文件持久化锚点，补 DB 瘦身和平台路径口径。
- 补 P1 data root 边界：`packages/app-server-client` 支持 `SidecarLaunchConfig.dataDir -> --data-dir`；Electron App Server Host 在 env/dev/packaged sidecar 启动时统一传入 `app.getPath("userData")/app-server`。
- P1 存储底座落地：`StorageRoots` 从 `data_root` 派生 Product DB、`runtime/events`、独立 `projection_1.sqlite`、独立 `telemetry_1.sqlite`；`RuntimeCore` 在配置 writer 后将 runtime events 追加到 per-session JSONL。
- 按用户决策收紧范围：Event Log 固定 JSONL；Projection DB 第一版就是独立 SQLite 文件；旧 `agent_messages` 不保留长期 fallback，只作为 migration/backfill/export 输入，目标删除。
- P2 最小 projection store 落地：`ProjectionStore` 在独立 `projection_1.sqlite` 建立 `projected_sessions / projected_turns / projected_items / projection_watermarks`，RuntimeCore 在 JSONL 成功后写 projection；projection 写失败只 warning，后续 repair 补齐。
- P2 repair 底座落地：`ProjectionRepair` 从 per-session JSONL 读取 event 并重建独立 `projection_1.sqlite` 中对应 session projection；空 event log 会清理陈旧 projection，避免 projection 独立成为第三事实源。
- P6 第一条防回流守卫落地：`legacySurfaceCatalog` 增加 `rust-agent-messages-production-write-leak`，禁止新增生产代码把 transcript truth 写入 `agent_messages`；现有白名单只限 migration/backfill/export/test fixture 和已标记 deprecated 的旧 DAO/store。
- P3 文档收口：新增 `internal/roadmap/db/codex-comparison.md`，明确 Codex 的 JSONL rollout + SQLite metadata/index 参考；PRD / inventory / README 同步当前落地路径 `<data-root>/runtime/events/sessions/session_<id>.jsonl`、独立 Projection DB schema 与 `agent_messages` 删除旧表读写路径的退出条件。
- P3 读取收口：新增 `runtime/load_context.rs`，让 `agentSession/read`、`agentSession/*/export` 和 `evidence/export` 共享同一 `load_session_current`；加载顺序固定为 RuntimeCore memory -> Projection repair -> compat current timeline bridge，新增定向测试证明 `evidence/export` 可从 JSONL 修复 Projection DB 且不回读旧 `agent_messages`。
- 计划顺序重排：P3 已达到骨架退出条件，后续不再把 `current_timeline` 兼容桥细节排在最前；当前主线固定为 P4 Telemetry DB 最小 owner，P5 sidecar ref + checksum 作为下一刀，P6/P7 只在前两项可用后推进。
- 进一步收紧本轮执行边界：当前只推进 P4 的 Telemetry DB 最小 owner 和 evidence/export 读取边界，P5 只保留为下一刀，不再同时展开旧 timeline 兼容细节或 P6/P7 守卫收口。
- P4 第一段骨架落地：新增 `TelemetryStore` 独立 `telemetry_1.sqlite` schema / upsert / `session_id` + `turn_id` 查询；`RequestLogger` 支持可选 Telemetry DB dual-write，文件 `request_logs/` 保留为 migration source；`RuntimeCore` 持有 TelemetryStore，App Server 启动时从 `StorageRoots.telemetry_db_path` 初始化并注入；`evidence/export` 读取 Telemetry DB request logs 并写入 evidence pack `observability_summary.request_telemetry`。验证：`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-infra telemetry`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports` 通过。
- 计划重新调整：P4 最小骨架已满足“独立 Telemetry DB owner + evidence/export 读取”的骨架退出条件；生产 HTTP/shared telemetry 的 `RequestLogger` 创建/注入链路改列为 P4-b 证据项，只有定位到真实 provider request source 后才接入同一个 `TelemetryStore`。主线下一刀切到 P5 Sidecar ref + checksum，先把大输出和 checkpoint content 从 `lime.db` / timeline payload 中拆出去。
- P5 contract 完成：新增 `runtime/sidecar_store.rs`，定义 `SidecarRef { ref, kind, relativePath, bytes, sha256, contentStatus, createdAt }`、相对路径校验、sha256 写后校验和读取；`StorageRoots` 增加 `<data-root>/runtime/sidecar`；App Server 启动时把 output snapshot / file checkpoint snapshot store 显式接到该 sidecar root，不再默认写 legacy `sessions/` 目录；tool large output 在 append JSONL 前先写 sidecar 并把 `sidecarRef` 写回 event payload；file checkpoint previous content 同步写入 sidecar 并保留 `checkpointSnapshotFile` compat 字段；`evidence/export` 识别 `sidecarRef.relativePath` / `bytes`。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server sidecar_store`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server coding_events`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports` 通过。
- S1 收口：新增 `runtime/artifact_sidecar.rs`，把 `artifact.snapshot` 和已确认的含正文 artifact payload 统一写入 `<data-root>/runtime/sidecar`，只保留 `sidecarRef + contentStatus + contentBytes + contentSha256`，并在 `artifact_reader`、`evidence_exports`、`runtime/tests/artifacts.rs` 中验证 content 可从 sidecar 读回、inline content 不再作为事实源。同步将 `RuntimeCore` / `RuntimeCoreEventAppender` / `main.rs` 注入同一个 `SidecarStore`，避免领域模块自己发现平台目录。定向验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server artifact_sidecar`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server artifacts`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server evidence_exports`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server coding_events` 通过。
- 计划重排：P5 / S1 不再继续扩功能面；下一刀进入 S2 骨架守卫，先用扫描和契约测试确认 `agent_messages` 新写入、`payload_json` 大正文、裸 snapshot file 字段和硬编码平台路径是否仍在回流。若发现真实生产入口，再按缺口补迁并同时加 guard。

### 2026-06-15

- S2 骨架守卫补第一批目录册：新增 `rust-agent-thread-items-payload-json-truth-leak`、`rust-runtime-snapshot-sidecar-ref-boundary-leak`、`rust-runtime-store-hardcoded-platform-path-leak`，覆盖 `agent_thread_items.payload_json` 事实源回流、runtime snapshot / sidecar 裸字段散落、runtime store 硬编码平台路径三类回流面。
- S3 前置收口：`legacy_message_backfill` 现已幂等化，若 event log 已有部分/全部 JSONL，会补齐缺失事件、修复 Projection DB，再按 `LegacyMessageCleanupPolicy` 处理旧源；默认 `drop-empty-tables` 清旧 `agent_messages` 行、message-only `agent_sessions` 旧壳，并在空表时 drop `agent_messages` / `a2ui_forms`，`retain` 和 `clear-rows` 仍可作为显式覆盖。`aster_session_store` 已不再把旧表作为产品 fallback；新增测试覆盖中断恢复、current timeline 不误删 current session、retain 不清旧源，以及 backfill 后 old rows 确实清空。
- S3 删除配置接线：App Server CLI 增加 `--legacy-message-cleanup retain|clear-rows|drop-empty-tables`；Electron sidecar 启动默认显式传 `drop-empty-tables`，并支持 `APP_SERVER_LEGACY_MESSAGE_CLEANUP=retain|clear-rows|drop-empty-tables` 启动期覆盖，非法值 fail fast；`packages/app-server-client` 的 `SidecarLaunchConfig` / `stdioSidecar` / `sidecarArgs` 支持同一参数。旧表 drop 仍保留 `drop-empty-tables` 显式覆盖和 `retain` / `clear-rows` 的保守入口。
- 历史会话 fixture 继续收口：`scripts/electron/session-history-fixture-smoke.mjs` 已移除旧 sidebar GUI archive helper，静态 guard 仅保留 current Electron Desktop Host + App Server JSON-RPC 历史恢复链路；`npm run smoke:agent-session-history-electron-fixture` 已通过，证据见 `.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-summary.json`，`ok=true`、`sidecarRestartReadback=true`、`consoleErrors=[]`。
- 补齐 `agent_messages` 两条机械测试覆盖：`rust-agent-messages-production-write-leak` 锁生产 transcript 写入，`rust-agent-messages-product-read-fallback-leak` 锁产品读回长期 fallback；两者仍为 `deprecated`，只允许 migration/backfill/export/test fixture、旧 DAO/store 和受控迁移边界。
- 修正 `src/lib/governance/legacySurfaceCatalog.test.ts` 的阶段断言，使其与 `legacySurfaceCatalog.json` 当前分类一致；保留 `root-task-center-patch-scripts`、`scripts-hardcoded-bridge-debug-and-newapi-image-smoke`、`scripts-startup-layout-diagnostics-legacy`、`rust-runtime-store-hardcoded-platform-path-leak` 为 `dead-candidate`，保留 `rust-agent-subagent-metadata-direct-read`、`rust-agent-thread-items-payload-json-truth-leak`、`rust-runtime-snapshot-sidecar-ref-boundary-leak` 为 `deprecated`。
- 定向验证通过：`npm test -- --run src/lib/governance/legacySurfaceCatalog.test.ts`，`176` 个测试通过；`npm run governance:legacy-report` 通过，边界违规为 `0`，当前仅剩分类漂移候选 `rust-memory-profile-prompt-helper-leak` 与 `rust-memory-sources-prompt-helper-leak`。
- 下一刀仍是 S2，不进入 S3：继续收缩 `agent_messages` 写入白名单，并补齐剩余平台路径和旧大正文回流扫描；`websocket` 旧 `sessions.*` 和 `SessionContextService` 旧消息 fallback 已收口，当前先转向 `AgentDao` / `ChatDao` 迁移面与历史表 drop 入口，尽快让旧消息源只剩迁移输入。
- S2 继续补正文回流守卫：新增 `rust-runtime-artifact-generated-content-inline-leak` 和 `rust-runtime-file-checkpoint-inline-content-leak`，分别封住 generated artifact 正文和 file checkpoint previous content 重新内联到 runtime event。`file_checkpoint.rs` 明确作为 `deprecated` 读取/恢复兼容 resolver 白名单保留，退出条件是 S3/S4 删除 inline fallback，仅从 sidecar snapshot 或工作区文件恢复。
- 定向验证再次通过：`npm test -- --run src/lib/governance/legacySurfaceCatalog.test.ts`，`178` 个测试通过；`npm run governance:legacy-report` 通过，边界违规为 `0`，仍仅剩既有分类漂移候选 `rust-memory-profile-prompt-helper-leak` 与 `rust-memory-sources-prompt-helper-leak`。
- S2/S4 交界旁路收口：`usage_statistics_service` 不再从 `agent_messages` 估算 message/token 或模型排行；会话数仍从 `agent_sessions` metadata 读取，token/model 只认 `model_usage_stats` 等 current 统计源，缺失时返回空排行 / 0 token，而不是旧消息正文 fallback。同步从 `rust-agent-messages-product-read-fallback-leak` 白名单移除 `usage_statistics_service.rs`，把 usage 统计从旧表 drop 阻塞项中剔除。定向验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-services usage_statistics_service`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-services --lib model_usage`、`npm test -- --run src/lib/governance/legacySurfaceCatalog.test.ts`、`npm run governance:legacy-report` 通过。
- S2 继续收口 ChatDao 产品读回面：`websocket` 旧 `sessions.list/get` 入口改为 fail-closed，指向 App Server `agentSession/list` / `agentSession/read`，不再通过 `ChatDao::list_sessions/get_message_count/get_session_detail` 读取 `agent_messages`；`SessionContextService` 不再从 `ChatDao::get_messages` 拉 general chat 上下文，旧表 fixture 只用于测试证明“不返回旧消息”；新增 `rust-chat-dao-agent-messages-product-api-leak` 守卫，禁止 app-server/server/services/websocket 重新调用 ChatDao 旧消息读取 API。定向验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-services session_context_service`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-websocket rpc_handler`、`npm test -- --run src/lib/governance/legacySurfaceCatalog.test.ts`、`npm run governance:legacy-report` 通过。
- 用户反馈设置页 `AI 服务商` 只剩 `Lime Hub`、历史对话无法加载，说明 P1 data-root 拆分后产品迁移入口不完整。根因：Electron Host 显式传 `--data-dir <userData>/app-server` 后，App Server `initialize_database` 直接打开 `StorageRoots.product_db_path`，绕过 `app_paths::resolve_database_path_for_data_dir`，导致旧 `userData/lime.db` / preferred Product DB 中的 settings、Provider、历史会话没有迁入新 `<data-root>/lime.db`。
- 修复 App Server Product DB 初始化入口：`initialize_database` 的显式和 fallback data-root 分支统一走 `database::init_database_with_data_dir`；`app_paths::resolve_database_path_for_data_dir` 在 `data_dir` 末尾为 `app-server` 时优先尝试同一 Electron `userData/lime.db`，再落回 preferred / legacy roots。旧库用户信号扩展到 `provider_ui_state`、`providers`、非系统 `api_key_providers`、排除内部迁移标记后的 `settings`，避免“有设置但没有 api_keys”的用户库被误判为空。
- 补迁移回归：`resolve_database_path_for_explicit_data_dir_prefers_parent_product_db` 覆盖父级 Product DB 优先级；`initialize_database_migrates_previous_product_settings_from_user_data_root` 覆盖 `userData/lime.db -> userData/app-server/lime.db` 的 settings + custom Provider 迁移。
- 补编译阻塞：`TrackedTool` 测试构造体补 `command_facts: None`，恢复 App Server 定向测试编译。
- 验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core app_paths` 通过（28 tests）；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server initialize_database` 通过（2 tests）；`npm run smoke:claw-chat-current-fixture` 通过，summary 见 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`，关键断言包括 `electronPreloadBridge=true`、`appServerJsonRpcUsed=true`、`usedCurrentSessionStart/read/list=true`、`guiUserMessageVisible=true`、`guiAssistantOutputVisible=true`、`guiInputRemainsReady=true`、`noConsoleErrors=true`。
- S3 产品迁移闭环补齐：新增 Product DB migration cleanup 策略，独立于 `LegacyMessageCleanupPolicy`。App Server 新增 `--product-db-migration-cleanup retain|clear-rows|drop-tables|delete-file` 和 `APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP`；Electron sidecar 默认显式传 `drop-tables`，可用 env 覆盖为 `retain` 或 `delete-file`，非法值 fail fast；`packages/app-server-client` 同步 `SidecarLaunchConfig.productDbMigrationCleanup` 和 sidecar args。清理只在 current `<userData>/app-server/lime.db` 初始化成功后执行，避免迁移失败时清掉唯一旧源。
- Product DB cleanup 策略边界：`drop-tables` 是默认策略，迁移成功后删除旧 `userData/lime.db` 内用户 schema objects，保留空 DB 文件；`clear-rows` 仅清行；`delete-file` 删除旧 `lime.db` 以及 `-wal/-shm`；`retain` 只迁移不清理。此策略只用于迁移源 Product DB，不用于 `agent_messages` backfill 后的 legacy message cleanup。
- 设置页迁移 Electron fixture 落地：新增 `scripts/electron/settings-provider-migration-fixture-smoke.mjs` 和静态 guard，临时旧 `electron-user-data/lime.db` 预置 custom Provider / API Key / Provider UI state，经真实 Electron preload bridge 和 App Server JSON-RPC 迁移到 `electron-user-data/app-server/lime.db`，并断言设置页 `AI 服务商` 可见自定义 Provider、旧 Provider facade 未被调用、旧 Product DB 用户 schema 已清空。summary 见 `.lime/qc/gui-evidence/settings-provider-migration-fixture/settings-provider-migration-fixture-summary.json`。
- 定向验证通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core app_paths`（28 tests）；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core product_db_migration_cleanup`（4 tests）；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server initialize_database`（3 tests）；`npx vitest run "electron/appServerHost.test.ts" "packages/app-server-client/tests/client.test.mjs" "scripts/electron/settings-provider-migration-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept`（58 tests）；`npm run smoke:settings-provider-migration-electron-fixture` 通过，关键证据包括 `productDbMigrationCleanupPolicy=drop-tables`、`providerVisibleInGui=true`、`oldProductDbUserSchemaObjectCount=0`、`legacyProviderCommandsSeen=[]`、`consoleErrors=[]`。
- 历史会话 smoke 通过：`npx vitest run "scripts/electron/session-history-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept`（4 tests）通过；`npm run smoke:agent-session-history-electron-fixture` 通过，关键证据包括 `ok=true`、`sidecarRestartReadback=true`、`archiveReopen.requestMethods=["initialize","agentSession/list","agentSession/read"]`、`unarchiveReopen.requestMethods=["initialize","agentSession/list","agentSession/read"]`、`consoleErrors=[]`。
- S3 默认清理策略推进：`LegacyMessageCleanupPolicy::default()` 和 Electron Host 默认值从 `clear-rows` 调整为 `drop-empty-tables`；App Server CLI 现在也读取 `APP_SERVER_LEGACY_MESSAGE_CLEANUP`，因此直跑 App Server、Electron sidecar 和 client args 的删除策略一致。`retain` / `clear-rows` 仍可显式覆盖，`drop-empty-tables` 在旧表仍有残留行时 fail closed，不会误 drop 未迁完数据。
- 定向验证通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server parse_args`（15 tests）；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server legacy_agent_message`（4 tests）；`npx vitest run "electron/appServerHost.test.ts" "packages/app-server-client/tests/client.test.mjs" "scripts/electron/session-history-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept`（61 tests）；`npm run smoke:agent-session-history-electron-fixture` 在新默认策略下通过，证据继续写入 `.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-summary.json`，关键字段 `ok=true`、`sidecarRestartReadback=true`、`consoleErrors=[]`。
- 治理验证通过：`npm run governance:scripts` 通过（`rootFiles=95`、`untrackedNew=0`）；`npm run governance:legacy-report` 通过（`边界违规=0`，剩余 `rust-memory-profile-prompt-helper-leak` / `rust-memory-sources-prompt-helper-leak` / `rust-agent-session-direct-record-access` 为既有分类漂移候选，不阻塞 DB 主线）。
- 用户反馈截图显示基本对话不可用，重新判定为 `产品阻塞`，优先级高于 DB 瘦身细粒度治理。已重跑 `npm run smoke:agent-runtime-current-fixture` 通过，覆盖 history/cache hydration、stream terminal、MessageList 终态、Electron fixture guard、Coding Workbench fixture、Claw GUI current fixture guard、停止后同会话继续输出；随后单独重跑 `npm run smoke:claw-chat-current-fixture` 通过，证据见 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`，关键断言包括 `electronPreloadBridge=true`、`appServerJsonRpcUsed=true`、`usedCurrentSessionStart/read/list=true`、`guiUserMessageVisible=true`、`guiAssistantOutputVisible=true`、`guiInputRemainsReady=true`、`noConsoleErrors=true`。结论：干净 fixture current 主链可用；若真实用户仍无法对话，下一刀先只读诊断真实 `userData/app-server/lime.db`、Provider / model 迁移状态和 live turn 错误，不对真实库执行手工清理。
- 继续处理真实用户截图里的产品阻塞：`app-server sidecar stdin is closed` 与“工作区目录不存在”。Electron Host 已在 stale sidecar request 失败时清理连接、重启 sidecar 并重试当前 App Server JSON-RPC 请求一次，覆盖 `onExit` / `onRestarted` / `onRestartFailed` 连接状态同步；验证：`npx vitest run "electron/appServerHost.test.ts" "packages/app-server-client/tests/client.test.mjs" --silent=passed-only --disableConsoleIntercept`、`npx prettier --check "electron/appServerHost.ts" "electron/appServerHost.test.ts"`、`npm run typecheck:electron`、`npm run smoke:claw-chat-current-fixture`、`npm run smoke:agent-runtime-current-fixture` 均通过。
- 继续处理失效 workspace 污染：发现真实 `userData/app-server/lime.db` 中存在大量 `workspace_type=temporary` 的 E2E 临时 workspace，左侧 UUID 项目与截图一致。前端现在只把已成功加载并匹配当前 project 的 workspaceId 传入 `useAgentChatUnified`，避免 localStorage stale id 先进入 Agent runtime；当临时 workspace 触发 `workspacePathMissing` 时，页面通过 App Server `workspace/default/ensure` + `workspace/ensureReady` 切回默认持久 workspace，清除路径错误并自动重发原消息一次。持久 / general 项目仍保留原来的“重新选择目录”手动修复能力，避免误切用户真实项目。定向验证：`npx vitest run "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/index.projectRestore.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，覆盖 stale remembered workspace 不进 runtime、topic switch 仍先切项目、临时 workspace 自动切默认并重发。
- 本轮收口验证：`npx prettier --check "src/components/settings-v2/system/execution-policy/ExecutionPolicyNetworkFocusPanel.tsx" "src/components/agent/chat/AgentChatWorkspace.tsx" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" "src/components/agent/chat/index.projectRestore.test.tsx"` 通过；`npm run typecheck` 通过；`npm run smoke:claw-chat-current-fixture` 通过；`npm run smoke:agent-runtime-current-fixture` 通过；`npm run smoke:electron` 通过。`smoke:electron` 日志中可见 stale sidecar request 被 Host 识别并重启重试，退出码为 `0`。
- 用户最新截图显示发送已进入 `agentSession/turn/start`，但随后 `agentSession/list` 在 `8000ms` 超时、`sessionFile/*` 在 `50000ms` 超时，页面卡在“等待首个输出”。重新判定根因从上一轮的 `stdin is closed / workspacePathMissing` 转为 App Server JSON-RPC 连接读公平性和 read-model 超时窗口问题：长 `turn/start` 后台等待可能长时间占住同一 transport read lock，导致 sidebar/session files 这类普通 JSON-RPC 响应无法及时被对应请求读取。
- 本轮修复：`packages/app-server-client` 的 `AppServerConnection.#nextMessageForRequest` 改为 `250ms` 分片读取 transport，分片超时只释放读锁并继续等待，只有总请求超时到达才 fail；新增单测证明一个长 `turn/start` pending 时，后续 `agentSession/list` 仍能拿到自己的 response。前端 / DevBridge 的 `agentSession/list` 超时从独立 `8000ms` 收敛到 App Server current read 的 `30000ms`，避免冷启动、迁移和长回合期间被 renderer 提前误判失败。Electron Host 保留 `turn/start` 的 `accepted` fast path，不回退 legacy/mock。
- 本轮同步 guard：`scripts/check-app-server-client-contract.mjs` 对 `resolveAppServerRequestTimeoutMs(proxiedMessage.message.method)` 改用 whitespace-insensitive snippet，避免 Prettier 多行格式导致 contract 误报。
- 本轮验证：`npm run test -- electron/appServerHost.test.ts src/lib/dev-bridge/http-client.test.ts src/lib/dev-bridge/safeInvoke.test.ts packages/app-server-client/tests/client.test.mjs` 通过（107 tests）；`npx prettier --check "electron/appServerHost.ts" "electron/appServerHost.test.ts" "packages/app-server-client/src/index.ts" "packages/app-server-client/tests/client.test.mjs" "scripts/check-app-server-client-contract.mjs" "src/lib/dev-bridge/http-client.ts" "src/lib/dev-bridge/http-client.test.ts" "src/lib/dev-bridge/safeInvoke.test.ts"` 通过；`npm run typecheck` 通过；`npm run smoke:claw-chat-current-fixture` 通过；`npm run smoke:agent-runtime-current-fixture` 通过；`npm run smoke:electron` 通过。
- `npm run test:contracts` / `node scripts/check-app-server-client-contract.mjs` 仍失败，但剩余失败项是既有大范围 contract 缺口：`Rust runtime exports evidence snapshot from current session events` 和 `scripts/electron/session-history-fixture-smoke.mjs` 的 sidebar GUI archive guard 片段缺失；本轮相关的 `Electron App Server host preserves external backend env for resources manifest` 缺口已消除。下一刀若用户继续要求整体质量收口，再单独处理这些 contract guard 与对应 fixture，不混入基本对话主链修复。
- 用户再次反馈真实 GUI 仍出现 `app_server_handle_json_lines` 30s 超时，重新定位为 `turn/start` fast accepted 仍保留后台 request 等待最终 response，导致 `AppServerConnection` transport reader 被长请求长期占用；Codex 对比口径是 request 等待与 event draining 分离。最小修复：新增 `requestUntilFirstNotificationOrResponse`，Electron `agentSession/turn/start` 只等首个 response / notification / 250ms timeout，随后返回 synthetic accepted；迟到的 final response 按 detached request id 丢弃，不再阻塞后续 `agentSession/list/read/sessionFile/*`。同步保留 sidecar stdin `EPIPE` 原因，避免异常逃逸为 Uncaught Exception。
- 同轮只补必要 warning 缺口：App Server `thread.started`、`turn.started`、`item.started`、`item.updated`、`message.created` 映射到既有前端 `thread_started` / `turn_started` / `item_started` / `item_updated` 通路，不新增 UI 状态机或 mock fallback；`message.created` 投影为用户消息 item 生命周期事件。定向验证：`npx vitest run "packages/app-server-client/tests/client.test.mjs" "electron/appServerHost.test.ts" --silent=passed-only --disableConsoleIntercept`、`npx tsc --noEmit --project "packages/app-server-client/tsconfig.json"`、`npx vitest run "src/lib/api/agentRuntime/threadClient.test.ts" --silent=passed-only --disableConsoleIntercept` 已通过；全仓 `npm run typecheck -- --pretty false` 仍在执行中，后续结果单独记录。
- 复核真实截图仍报超时后，发现源码修复已存在，但 `dist-electron/main/main.js` 仍停留在旧 `requestPromise` 等最终 response 的 bundle；这会让已打开的 Electron 进程继续跑旧逻辑。执行 `npm run electron:build:host:dev` 后，`dist-electron/main/main.js` 已包含 `requestUntilFirstNotificationOrResponse` 和 `APP_SERVER_STREAMING_TURN_ACK_GRACE_MS=250`，不再包含旧的 streaming `requestPromise` 分支。随后 `npm run smoke:claw-chat-current-fixture` 通过，证明新启动 Electron 可从 GUI 发送消息、走 `app_server_handle_json_lines -> agentSession/turn/start -> read/list` current 主链并完成 read model；summary 见 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。全仓 `npm run typecheck -- --pretty false` 退出码 `0`；`npm run smoke:electron` 退出码 `0`，Desktop Host / App Server 基线可启动。`smoke:electron` 中的 stale sidecar SIGTERM 日志来自 smoke 收尾阶段，未导致失败；剩余 Rust `unused import` / `dead_code` warning 归类为后续清理项，不再和基本对话阻塞混在一起。结论：若真实 GUI 仍报同类 30s 超时，第一处必须先重启当前 Lime / Electron dev 进程以加载新 main bundle；重启后仍失败时，再只读诊断真实 `userData/app-server/lime.db`、Provider / model 配置和 live turn 错误，不继续堆并行兜底。
- 用户继续反馈真实 GUI 仍卡在“等待首个输出”，并要求用测试手段解决。新增 Rust JSONL 回归 `json_lines_loop_lists_sessions_while_external_turn_is_waiting_for_first_output`：external backend 延迟首包时，`agentSession/turn/start` 后必须先流出 `message.created`，且并发 `agentSession/list` 必须在 turn 等待时返回。该测试复现了真实阻塞：修复前 1 秒内没有首事件，GUI 只能等待 provider 首包。
- 根因确认：`RuntimeCore::start_turn_inner` 只把 turn 放入内存 state，`message.created` 依赖后续 `append_runtime_events_to_state(...)` 的自动补写；如果 provider 首包慢，JSONL / Projection DB / event stream 都没有用户输入事件，前端 read/list 也容易被长 turn 流拖到超时。修复：turn accepted 后立即调用 `append_runtime_events(..., Vec::new())`，复用既有 `runtime_events_with_turn_input` 只写 `message.created`，不合成新的 `turn.accepted/turn.started`，避免与 backend 生命周期事件重复；普通失败在已有首事件后追加 `turn.failed`，空输入且 backend 未 emit 仍保留回滚语义。
- 本轮验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server json_lines_loop_lists_sessions_while_external_turn_is_waiting_for_first_output -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server json_lines_loop_streams_external_backend_events_before_turn_response -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server json_lines_loop_streams_turn_failed_after_partial_external_backend_events -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server mock_backend_emits_public_runtime_event -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_events_are_appended_to_jsonl_event_log -- --nocapture`、`npx vitest run "packages/app-server-client/tests/client.test.mjs" --silent=passed-only --disableConsoleIntercept`、`npx vitest run "electron/appServerHost.test.ts" --silent=passed-only --disableConsoleIntercept`、`npx tsc --noEmit --project "packages/app-server-client/tsconfig.json"`、`npm run electron:build:host:dev`、`npm run smoke:claw-chat-current-fixture`、`npm run smoke:electron`、`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`。`smoke:claw-chat-current-fixture` 证明 GUI textarea 发送、用户消息可见、assistant 输出可见、read model completed；`smoke:electron` 退出码 `0`，其 stale sidecar SIGTERM 日志仍为收尾阶段非阻塞噪音。
- 用户贴出的最新日志显示 App Server 已不再卡在首包，而是在 `runtime/projection_store.rs` 生成 `projected_items.payload_summary_json` 时用 byte slice 截断中文长文本，触发 `byte index 512 is not a char boundary` panic，sidecar 以 `code=101` 退出，随后 `runtimeListSessions` / `projectMemoryGet` 等读链连锁失败。修复：`bounded_payload_summary` 改为通过 `truncate_text_summary` 回退到合法 UTF-8 char boundary 后再截断，只影响 Projection DB 的 bounded summary，不改变 JSONL event truth、不清真实用户库。
- 本轮为恢复验证链路同步清掉两个构建阻塞：`execution_process` 从 `lime_agent::agent_tools::execution` 公开 re-export 导入，并移除 Rust 2024-only let-chain；`packages/app-server-client` 显式导出 execution process generated 类型，并让 generated runtime options 引用现有 `StructuredOutputContract` 类型。两者只是解除当前工作树编译 / Electron smoke 阻塞，不扩展 DB 主线或新增 fallback。
- 本轮验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server projection_store -- --nocapture`（6 tests，覆盖中文多字节截断和真实 projection 写入不 panic）、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server execution_process -- --nocapture`、`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`、`npm --prefix "packages/app-server-client" run build`、`npx prettier --check "packages/app-server-client/src/protocol.ts" "packages/app-server-client/src/generated/protocol-types.ts"`、`npm run electron:build:app-server-assets`、`npm run smoke:claw-chat-current-fixture`、`npm run smoke:electron`。`smoke:claw-chat-current-fixture` 已通过 `Frontend -> Electron preload bridge -> app_server_handle_json_lines -> App Server JSON-RPC -> RuntimeCore/backend -> JSONL + Projection DB` current 主链；`smoke:electron` 退出码 `0`，日志里的 repeated `SIGTERM` stale sidecar 仍是 smoke 收尾阶段关闭 sidecar 的既有噪音，未再出现 `projection_store.rs byte index 512` 或 `code=101` panic。
- 对照 Codex 当前实现重新校准：`codex-thread-store` 将 `append_items` 定义为 canonical history append API，`LocalThreadStore` 以 `codex-rollout` JSONL 文件持久化 history，以 SQLite State DB 只保存可查询 metadata / index；`core/session/rollout_reconstruction.rs` 从 rollout item replay 重建 history。对应到 Lime：JSONL Event Log 是 runtime truth，Projection DB 只做 read model / metadata/index，Product DB 旧 `agent_messages` 不应继续承接生产 transcript truth。当前工作树已把 `session_store_message_projection` 收成 `cfg(test)`，旧 `agent_messages -> runtime message` 转换只作为 test-only 回归，不进入生产 crate；`legacy_conversation` 清掉无效 `anyhow` import，只保留 migration 输入读取。分类：JSONL Event Log / Projection DB = `current`；`agent_messages` legacy backfill / export = `compat`；旧消息转换模块 = `test-only`；长期产品 fallback = `dead`。
- S2 清理继续做减法：删除 `session_store_history_visibility::load_chat_user_visible_message_flags_from_conn` 零引用函数，避免旧 `agent_messages` role 过滤读取 helper 继续停在生产编译图里。保留 `load_user_visible_message_flags_from_conn` 仅服务现有测试和受控迁移可见性回归，退出条件是 `agent_messages` migration/export/test fixture 完全退场后删除整个 `session_store_history_visibility` test-only 边界。
- S3 历史迁移 fixture 补齐主证据：`scripts/electron/session-history-fixture-smoke.mjs` 现在会在临时 Electron `userData/app-server/lime.db` 中 seed 旧 `agent_sessions + agent_messages + a2ui_forms`，通过真实 Electron preload `app_server_handle_json_lines` 调 App Server `agentSession/list/read` 触发 backfill，并断言旧消息进入 `<data-root>/runtime/events/sessions/session_<id>.jsonl`、独立 `<data-root>/runtime/projection_1.sqlite`，同时默认 `drop-empty-tables` 后 `agent_messages` / `a2ui_forms` 表和 message-only `agent_sessions` 旧壳清零。静态 guard 已覆盖 `seedLegacyAgentMessagesSession`、`runLegacyAgentMessagesBackfillPhase`、`assertLegacyBackfillPhase`、`projection_1.sqlite`、`message.created` 和默认 drop-empty-tables 语义。
- 本轮验证：`npx vitest run "scripts/electron/session-history-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept` 通过（4 tests）；`npx prettier --check "scripts/electron/session-history-fixture-smoke.mjs" "scripts/electron/session-history-fixture-smoke.test.mjs"` 通过。`npm run smoke:agent-session-history-electron-fixture` 的新增 legacy backfill 阶段已通过，summary 证据包含 `legacyBackfillSummary.requestMethods=["initialize","agentSession/list","agentSession/read"]`、`eventTypes=["turn.accepted","message.created","message.delta","turn.completed"]`、`projectionSessionRows=1`、`projectionItemRows=4`、`legacyAgentMessagesTableExists=false`、`legacyA2uiFormsTableExists=false`、`legacyAgentMessagesRows=0`、`legacyA2uiFormsRows=0`、`legacySessionRows=0`。同一次完整 smoke 后续卡在既有 sidebar GUI archive 阶段 `page.evaluate: Target page, context or browser has been closed`，该失败发生在 DB backfill 证据之后，暂不作为 DB 瘦身主线 blocker；如果后续要收 GUI 侧栏 archive fixture，应单独治理 AppSidebar opened-project/recent-list 刷新，而不是回退 DB 迁移链路。
- S2 direct AgentDao 回读面收口：治理报告已确认 `AgentDao::get_session_with_messages/get_message_count/get_messages/get_messages_tail/get_messages_tail_page/get_messages_before` 在 `agent / services / app-server / websocket` 生产上层零引用；`rust-agent-session-direct-record-access` 从 `deprecated` 收紧为 `dead-candidate` 且 `allowedPaths=[]`，作为旧 `agent_messages` 产品读回 API 的零容忍回流守卫。同步增加静态断言，确认 `session_store_history_visibility.rs` 只在 `#[cfg(test)]` 编译图保留，旧 `agent_messages` 可见性读取 helper 不进入生产 crate。
- 本轮 DB 守卫验证：`npx vitest run "src/lib/governance/legacySurfaceCatalog.test.ts" -t "agent_messages|AgentDao|测试编译图" --silent=passed-only --disableConsoleIntercept` 通过（5 tests）；`npm run governance:legacy-report` 通过，`边界违规=0`，分类漂移候选从 3 个降为 2 个，仅剩 `rust-memory-profile-prompt-helper-leak` / `rust-memory-sources-prompt-helper-leak`，均非 DB 主线。全量 `legacySurfaceCatalog.test.ts` 当前仍被既有 Coding roadmap 断言阻塞，失败项为 `Coding roadmap 不应把已完成的 P5/P7/P8 baseline 重新写成主线 blocker`，不作为本轮 DB 瘦身 blocker。
- S2 ChatDao 旧写 API 收口：`session_context_service` 的旧消息忽略回归不再通过 `ChatDao::add_message` 写 `agent_messages`，改为测试内显式 `insert_legacy_agent_messages` seed，语义从“调用旧产品 DAO”降级为“构造 legacy fixture”。同步将 `rust-chat-dao-agent-messages-product-api-leak` 扩展到 `ChatDao::add_message/delete_messages`，服务层 / app-server / websocket 不得重新通过 ChatDao 读写 `agent_messages`。
- 本轮 ChatDao 收口验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-services session_context_service -- --nocapture` 通过（7 tests）；`npx vitest run "src/lib/governance/legacySurfaceCatalog.test.ts" -t "ChatDao|agent_messages|AgentDao|测试编译图" --silent=passed-only --disableConsoleIntercept` 通过（5 tests）；`npm run governance:legacy-report` 通过，`边界违规=0`，分类漂移候选仍为 2 个非 DB 项；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-services --check` 与 `npx prettier --check "src/lib/governance/legacySurfaceCatalog.json" "src/lib/governance/legacySurfaceCatalog.test.ts" "internal/exec-plans/db-slimming-codex-alignment-plan.md"` 通过。
- S2 `agent_thread_items.payload_json` 大正文收口：新增 `core/src/database/dao/agent_timeline_payload.rs` 承接 legacy timeline payload 裁剪规则，`AgentTimelineDao::upsert_item` 写入前即把大 file artifact 正文移除、把大 tool / command / web search output 截成 bounded summary；旧 DAO 仍只作为迁移期 GUI projection，JSONL Event Log + Sidecar 才是 runtime truth。同步把 `agent_timeline.rs` 从 1000 行降到 979 行，避免继续向中心 DAO 堆逻辑。

## 10. 下一刀

下一刀优先级按产品阻塞动态调整：如果基本对话、输入框发送、assistant 输出、历史恢复或 Provider / 模型设置不可用，先恢复真实用户对话闭环；确认主链可用后再回到 S2/S3 骨架守卫。不要继续无扫描地扩大 Sidecar 实现面：

1. 产品阻塞优先：真实用户环境无法对话时，先诊断 `userData/app-server/lime.db`、Provider / model 当前配置、`agentSession/start/read/list`、`agentSession/turn/start` 和 renderer console；只读检查真实库，不手工 drop/delete。
2. 回到 S2：继续压缩 `agent_messages` 旧 DAO / migration 白名单；`AgentDao` 上层 direct 回读和 `ChatDao` 服务层读写回流已封成 `dead-candidate`，下一步只处理旧 DAO 物理退场和历史表 drop migration，不再恢复产品 fallback。
3. `agent_thread_items.payload_json` 新写入已 bounded；后续只保留旧行兼容读取和 S4 表退场，不再把它列为新增大正文 owner。
4. 扫描裸 `outputSnapshotFile` / `checkpointSnapshotFile`、缺少 `sidecarRef.sha256` 的 runtime event，以及 generated artifact / file checkpoint current snapshot 是否还有 inline content。
5. 扫描业务层硬编码平台路径、`~/.lime`、repo root、temp/cache durable fact 写入；允许白名单仅限 `app_paths`、启动配置、迁移和测试 fixture。
6. P4-b 只在 S2 后作为真实 request telemetry 证据项处理；找不到真实 source 时只更新 blocker，不伪造数据。
7. 真实用户库清理仍需显式确认：本轮只在临时 fixture 验证清理旧 `lime.db`；不得对用户机器上的真实 `userData/lime.db` 执行手工 drop/delete。
