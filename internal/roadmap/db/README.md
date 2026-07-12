# Lime DB 瘦身与 Codex-aligned 存储路线图

> 状态：current planning source  
> 更新时间：2026-06-15
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
7. Legacy message migration marker：`<data-root>/runtime/legacy-message-migration/session_<id>.json` 记录旧 `agent_messages` 迁移状态，当前由 App Server `RuntimeCore` 写入。

### compat

1. `agent_sessions`：迁移期 session metadata 和 projection 表。
2. `agent_thread_turns / agent_thread_items`：迁移期 GUI timeline projection。
3. `current_timeline` App Server data source：projection 切换前的 current bridge。

### deprecated

1. `agent_messages` 作为 migration/backfill/export/test fixture 输入；不保留长期兼容读取，目标删除。当前产品读取面已收口到 metadata / timeline-only，旧消息只剩迁移、导出和受控测试路径。
2. 把 `agent_thread_items.payload_json` 当唯一 runtime event truth。
3. 把 request telemetry、高频 runtime event、大输出继续塞入 `lime.db`。
4. 无退出条件的 Agent session store 存储语义。

### dead

1. 恢复 `lime-rs/src/**` 或 `lime-rs/src/commands/**` 承接 DB / runtime 存储。
2. 新增 legacy Tauri command 作为数据迁移入口。
3. 新增与 App Server JSON-RPC 平级的生产 runtime DB API。

## 4. 当前恢复点

P0 inventory、P1 data root / JSONL event log 底座、P2 最小 Projection DB / session-scoped repair、P3 shared load context、新会话用户输入 durable event、P4 Telemetry DB 最小骨架、P5/S1 Sidecar contract、S2 主要守卫和 S3 legacy migration marker 已完成。

下次从这里继续：

1. 首选 S4 旧 DAO/schema 退场：`AgentDao` / `ChatDao` 旧消息 API 已封成 `dead-candidate`，下一刀处理旧 DAO 物理退场、`agent_messages` / `a2ui_forms` schema drop migration、`current_timeline` bridge 收口，不恢复产品 fallback。
2. 可并行 S5-A：统一 Projection / Telemetry DB `open_connection` helper，补 `journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout=5000`、Projection DB `foreign_keys=ON`，不改 Product DB。
3. 后置 P4-b：真实 request telemetry 接线只基于真实 provider/request source；找不到 source 时只登记 blocker，不伪造 provider/model/duration。
4. 真实用户库清理仍需显式确认：自动策略只在迁移成功后按配置处理迁移源；不得手工 drop/delete 用户机器真实 `userData/app-server/lime.db`。

恢复前建议先看 [执行计划 §10](../../exec-plans/db-slimming-codex-alignment-plan.md#10-下一刀)，再按本 README 选择 S4 或 S5-A。

当前注意：本目录已在 `.gitignore` 中补白名单，`internal/roadmap/db/*.md` 和 `internal/exec-plans/db-slimming-codex-alignment-plan.md` 应作为可版本化 artifact 跟踪；其他 `internal/roadmap/**` 与 `internal/exec-plans/*` 仍按仓库规则默认忽略。
