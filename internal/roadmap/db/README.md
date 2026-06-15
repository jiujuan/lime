# Lime DB 瘦身与 Codex-aligned 存储路线图

> 状态：current planning source  
> 更新时间：2026-06-14  
> 主目标：让 `lime.db` 只保留合理的产品数据；Agent runtime 历史、遥测、大输出和可重建读模型迁出主库，靠近 Codex 的 `append-only log + SQLite metadata/projection` 架构。

## 1. 固定结论

Lime 当前的风险不是“用了 SQLite”，而是 `lime.db` 同时承担了产品主库、Agent transcript、timeline projection、runtime reliability、telemetry 旁路和部分大输出索引。这个方向不可持续。

后续目标固定为：

`Product DB keeps reasonable product data`

`Agent durable log owns runtime transcript`

`Projection DB indexes and rebuilds read models`

`Sidecar owns large artifacts and file snapshots`

`Telemetry DB owns request/log metrics`

所有落盘路径必须走平台规范：Desktop 托管时由 Electron `userData` 派生 App Server `--data-dir`，Rust store 只接受显式 `data_root`；CLI / 测试通过 `--data-dir` 或 `APP_SERVER_DATA_DIR` 注入；workspace 随行内容只写 `<workspace-root>/.lime/`；cache / temp 不保存 durable fact。禁止在业务层硬编码 macOS / Windows 绝对路径、`~/.lime` 或 repo 根目录。

## 2. 目录文档

1. [prd.md](./prd.md)
   - 完整 PRD，包含目标、范围、架构图、时序图、流程图、代码目录结构、数据结构设计、迁移阶段、验收与验证。
2. [codex-comparison.md](./codex-comparison.md)
   - Codex 与 Lime 本地存储对比，固定 `JSONL durable log + SQLite metadata/projection` 的架构取舍。
3. [inventory.md](./inventory.md)
   - P0 inventory，包含表级分类、Agent/runtime 写入点地图、durable 写入根目录 owner 和 P1 前 guard 候选。
4. [执行计划](../../exec-plans/db-slimming-codex-alignment-plan.md)
   - 多阶段推进计划和进度日志；后续每一刀必须同步更新。

## 3. current / compat / deprecated / dead 摘要

### current

1. `lime.db` / Product DB：provider、API key、model registry、workspace、settings、user assets、插件与低频产品对象。
2. Agent durable log：新 Agent runtime transcript 的 append-only 事实源；用户输入以 `message.created` JSONL event 持久化，不再依赖 `agent_messages` 或内存 `turn_inputs`。
3. Projection DB：可重建的 session list、timeline、thread read model、reliability projection。
4. Sidecar：artifact、file checkpoint、大输出、restore backup。
5. Telemetry DB：request log、token/latency、日志保留与 prune。
6. 迁移后清理：App Server 迁移成功后按 `retain / clear-rows / drop-tables / delete-file` 处理旧 `userData/lime.db`，默认 `drop-tables`，只作为迁移源清理，不影响当前 `userData/app-server/lime.db`。

### compat

1. `agent_sessions`：迁移期 session metadata 和 projection 表。
2. `agent_thread_turns / agent_thread_items`：迁移期 GUI timeline projection。
3. `current_timeline` App Server data source：projection 切换前的 current bridge。

### deprecated

1. `agent_messages` 作为 migration/backfill/export 输入；不保留长期兼容读取，目标删除。当前产品读取面已收口到 metadata / timeline-only，旧消息只剩迁移和导出路径。
2. 把 `agent_thread_items.payload_json` 当唯一 runtime event truth。
3. 把 request telemetry、高频 runtime event、大输出继续塞入 `lime.db`。
4. 无退出条件的 Aster session store 存储语义。

### dead

1. 恢复 `lime-rs/src/**` 或 `lime-rs/src/commands/**` 承接 DB / runtime 存储。
2. 新增 legacy Tauri command 作为数据迁移入口。
3. 新增与 App Server JSON-RPC 平级的生产 runtime DB API。

## 4. 骨架优先顺序

P0 inventory、P1 data root / JSONL event log 底座、P2 最小 Projection DB / session-scoped repair、P3 shared load context、新会话用户输入 durable event、P4 Telemetry DB 最小骨架和 P5 Sidecar contract 已完成。当前主线只剩 S2 骨架守卫：先封住旧写入面，再进入 S3 `agent_messages` 退场；P4-b telemetry shared logger、`current_timeline` 旧桥和 evidence 展示 polish 继续后置到 S4。

1. S1 已完成：`artifact.snapshot` 和已确认的含正文 payload 已收进 sidecar，事件只保留 `sidecarRef + contentStatus + contentBytes + contentSha256`；generated artifact content / file checkpoint current snapshot 继续留给 S2 扫描，不再作为新功能面扩张。
2. S2 当前唯一主刀：补骨架守卫，扫描 `agent_messages` 新写入、`agent_thread_items.payload_json` 大正文、裸 `outputSnapshotFile` / `checkpointSnapshotFile`、缺少 `sidecarRef.sha256` 的 runtime event 和业务层硬编码平台路径；`aster_session_store` 的产品 fallback、`websocket` 旧 `sessions.*` 入口和 `SessionContextService` 旧消息上下文已收口，当前再把 `AgentDao` / `ChatDao` 旧消息产品读回面一并关掉。
3. S3 守卫稳定后：迁移或导出旧历史，默认清 legacy rows 并在空表时 drop legacy tables；删除策略支持启动期配置为 `retain`、`clear-rows`、`drop-empty-tables`，Electron sidecar 可通过 `APP_SERVER_LEGACY_MESSAGE_CLEANUP` 覆盖默认值，非法值 fail fast；产品读路径不保留 `agent_messages` fallback。
4. S4 细节收尾：P4-b 真实 request telemetry 接线、`current_timeline` compat bridge 收尾、历史 DAO/store/schema 引用清零和历史表 drop migration（包含 legacy message 表结构，以及迁移源 Product DB 的旧 schema / file 清理）。usage/model 统计、`websocket` 旧会话 RPC 和 `SessionContextService` 已不再从 `agent_messages` 做产品 fallback。

当前注意：本目录已在 `.gitignore` 中补白名单，`internal/roadmap/db/*.md` 和 `internal/exec-plans/db-slimming-codex-alignment-plan.md` 应作为可版本化 artifact 跟踪；其他 `internal/roadmap/**` 与 `internal/exec-plans/*` 仍按仓库规则默认忽略。
