# Lime DB 瘦身 P0 Inventory

> 状态：draft  
> 更新时间：2026-06-14  
> 关联执行计划：`internal/exec-plans/db-slimming-codex-alignment-plan.md`  
> 关联 PRD：`internal/roadmap/db/prd.md`

## 1. P0 目标

本 inventory 用当前代码证据给 `lime.db` 表、Agent runtime 写入点、durable 文件根目录做第一轮分类。它不是最终迁移完成态；标为 `compat / deprecated` 的对象必须带退出条件，不能继续扩展。

分类口径：

- `keep`：保留在 Product DB。
- `move`：迁出 Product DB，进入独立 DB / durable log / sidecar。
- `projection`：可重建读模型，允许短期留在 `lime.db`，长期进入 Projection DB。
- `deprecated`：只允许迁移、读取、审计或下线，不允许新增写入。
- `dead`：不得恢复或新增引用。

## 2. 表级分类

### 2.1 Product DB keep

| 表 | 分类 | 依据 | 后续动作 |
| --- | --- | --- | --- |
| `api_key_providers` | keep | provider metadata 是产品配置，低频事务数据 | 保留 |
| `api_keys` | keep | 本地加密凭证事实源 | 保留；后续可评估 credential DB，但不是本主线 |
| `provider_ui_state` | keep | provider UI 展示状态 | 保留 |
| `providers` | keep | provider 配置兼容表 | P0 后确认是否仍 current；不承接 runtime event |
| `mcp_servers` | keep | MCP 配置低频数据 | 保留 |
| `prompts` | keep | prompt 配置低频数据 | 保留 |
| `settings` | keep | 本地设置 KV | 保留 |
| `skills` | keep | skill metadata | 保留 |
| `skill_repos` | keep | skill repo metadata | 保留 |
| `installed_plugins` | keep | 插件安装索引 | 保留 |
| `model_metadata` | keep | 模型展示与能力 metadata | 保留 |
| `user_tier_preferences` | keep | 用户模型 tier 偏好 | 保留 |
| `model_usage_stats` | keep / move-candidate | 模型使用统计低频聚合可保留，但与 telemetry split 有交叉 | P4 评估是否并入 Telemetry DB |
| `model_registry` | keep | 模型 registry current 产品对象 | 保留 |
| `user_model_preferences` | keep | 用户模型偏好 | 保留 |
| `model_sync_state` | keep | 模型同步状态 | 保留 |
| `workspaces` | keep | Workspace 是产品主对象 | 保留 |
| `browser_profiles` | keep | Browser profile 是产品配置 | 保留 |
| `browser_environment_presets` | keep | Browser preset 是产品配置 | 保留 |
| `contents` | keep | 创作内容产品资产 | 保留 |
| `characters` | keep | 创作产品资产 | 保留 |
| `world_building` | keep | 创作产品资产 | 保留 |
| `personas` | keep | 创作 / Agent persona 产品资产 | 保留 |
| `materials` | keep | 素材资产 metadata | 保留 |
| `video_generation_tasks` | dead / deleted | 旧 service/DAO 已无生产消费者；current 视频任务由 App Server `mediaTaskArtifact/video/*` 投影 workspace task artifact | forbidden-to-restore；不得恢复 Product DB 任务表或平行 credential 轮转 |
| `publish_configs` | keep | 发布配置低频数据 | 保留 |
| `outline_nodes` | keep | 大纲产品资产 | 保留 |
| `gallery_material_metadata` | keep | 素材扩展 metadata | 保留 |
| `automation_jobs` | keep / split-trace | 自动化 job 配置和调度 metadata 可保留 | 执行 trace 迁到 Event Log / Telemetry DB |

### 2.2 Projection / move

| 表 | 分类 | 当前证据 | 目标 |
| --- | --- | --- | --- |
| `agent_sessions` | projection / metadata | schema 中包含 session metadata、token 累计、recipe、provider、archive 等；`agent_session_store`、`AgentDao`、`current_timeline` 都读写 | 长期压成 Product DB session metadata 或 projection ref；runtime 状态进入 Projection DB |
| `agent_thread_turns` | projection | `AgentTimelineDao::create_turn / upsert_turn / update_turn_status` 写入 | 迁到 Projection DB，可由 Event Log replay |
| `agent_thread_items` | projection / move | `AgentTimelineDao::upsert_item` 写 `payload_json` | projection 只保留摘要和 refs；完整 event 和大输出进入 Event Log / Sidecar |
| `agent_turn_outcomes` | projection | reliability outcome read model | 迁到 Projection DB |
| `agent_thread_incidents` | projection | reliability incident read model | 迁到 Projection DB |
| `managed_objectives` | dead / deleted | Codex 无对应对象；canonical goal 已由 ThreadStore `thread_goals` 按 thread identity 持久化 | forbidden-to-restore，不保留 Product DB metadata 或兼容清理表 |
| `agent_runs` | move / telemetry | 统一执行追踪摘要，前端证据引用 `agent_runs.metadata` | 执行 trace 和 provenance 迁到 Telemetry DB / Projection DB；Product DB 不承接 runtime trace |
| `a2ui_forms` | projection / move-candidate | 依赖 `message_id` / `session_id`，靠近 runtime message UI 状态 | 随 `agent_messages` 兼容退场一起迁出或改为 projection；message-only 旧壳可在 backfill cleanup 时清 rows，但表结构 drop 仍需等 current timeline 退出 |

### 2.3 Deprecated / dead candidate

| 表 / 路径 | 分类 | 当前证据 | 退出条件 |
| --- | --- | --- | --- |
| `agent_messages` | deprecated / migration-source | `agent_session_store` 已收口为 current runtime store 读写，旧表只在 `legacy_conversation` migration helper 中读取；`agent_session_repository` / `session_store` 产品读面已切到 metadata / timeline-only；`AgentDao`、`ChatDao` 仍保留 deprecated migration/export 读写实现；`websocket` 旧 sessions RPC 和 `SessionContextService` 已不再作为产品 fallback；usage/model 统计已退出旧表 fallback | Event Log 接管 transcript；旧数据 backfill/export 后默认清 legacy rows / message-only session shells，支持配置保留或空表 drop；旧表读写路径删除留到 S4，不保留长期兼容读取或产品 fallback |
| `provider_pool_credentials` | deprecated | `startup_migrations` 清空；`api_key_provider_service.rs` 注释说明旧凭证池退役 | 确认迁移和守卫后删除 schema / migration 写回 |
| `general_chat_sessions` | deprecated / migration-only | 只在 `general_chat_migration.rs` 和 `app_paths` user signal 中出现 | 迁移完成并确认无运行时读取后归档 |
| `general_chat_messages` | deprecated / migration-only | 只在 general chat migration 测试 / 迁移中出现 | 同上 |
| `lime-rs/src/**` | dead | 仓库治理规则声明已物理删除 | 禁止恢复 |
| `lime-rs/src/commands/**` | dead | 仓库治理规则声明已物理删除 | 禁止恢复 |

## 3. Agent/runtime 写入点地图

| 写入点 | 当前写入 | 分类 | 证据 |
| --- | --- | --- | --- |
| `services/src/agent_session_store.rs` + `services/src/agent_session_store/*` | `agent_sessions` metadata 更新；`runtime_conversation` 写 current runtime store；`legacy_conversation` 只读旧 `agent_messages` 迁移输入 | current metadata writer + migration-only loader | 继续收缩旧表白名单；新 runtime transcript 不再以 `agent_messages` 为 truth |
| `core/src/database/dao/agent.rs` | `INSERT INTO agent_sessions`、`INSERT INTO agent_messages`、history query / truncation / archive | deprecated writer / migration loader | 仅用于 backfill/export；产品层不得再 direct 调用旧消息 API；P1 后不得承接新 runtime truth，迁移完成后退场 |
| `core/src/database/dao/chat.rs` | 复用 `agent_sessions / agent_messages` 存 chat | deprecated / migration-only | General chat legacy path，需随旧消息迁移处理，不保留长期 fallback |
| `services/src/session_context_service.rs` | 只保留 current session 存在性和模式检查；不再从旧 `agent_messages` 拉消息上下文 | current-compatible / no-product-fallback | 证明 general chat 旧上下文不会再从旧消息表读回 |
| `websocket/src/handlers/rpc_handler.rs` | 旧 `sessions.list/get` 直接 fail-closed，不再读 `ChatDao` | dead / fail-closed legacy RPC | 生产侧应走 App Server `agentSession/list`、`agentSession/read` |
| `core/src/database/dao/agent_timeline.rs` | `INSERT/UPDATE agent_thread_turns`、`INSERT/UPDATE agent_thread_items.payload_json` | projection writer | 目标由 Event Log -> Projection writer 取代 |
| `core/src/database/dao/agent_turn_outcome.rs` | `INSERT INTO agent_turn_outcomes` | projection writer | 目标 Projection DB |
| `core/src/database/dao/agent_thread_incident.rs` | `INSERT/UPDATE agent_thread_incidents` | projection writer | 目标 Projection DB |
| `core/src/database/dao/automation_job.rs` | `INSERT/UPDATE automation_jobs` | keep writer | 保留 job metadata；执行 trace 不进主库 |
| `core/src/database/dao/agent_run.rs` | `INSERT/UPDATE agent_runs` | telemetry/projection writer | 迁出 runtime trace |
| `core/src/database/dao/video_generation_task_dao.rs` | 已删除 | dead / forbidden-to-restore | 视频任务持久化只归 workspace task artifact；执行只归 `media-runtime` |
| `core/src/database/managed_objective_repository.rs` | 已删除 | dead / forbidden-to-restore | Goal persistence 只归 canonical ThreadStore |
| `infra/src/telemetry/logger.rs` | request log 文件 | move writer | 目标 Telemetry DB |

## 4. App Server read / bridge 依赖

| 入口 | 当前依赖 | 分类 | 目标 |
| --- | --- | --- | --- |
| `app-server/src/local_data_source/current_timeline.rs` | `agent_sessions` + `agent_thread_turns` + `agent_thread_items` | compat read bridge | P3 切到 Projection DB reader |
| `app-server/src/runtime/session_lifecycle.rs` | `list/read/update/archive current_timeline` | compat consumer | P3 后消费 projection reader |
| `app-server/src/runtime/turn_execution.rs` | 启动 turn 前 hydrate current timeline session | compat consumer | Event Log + Projection DB 成为 hydrate source |
| `services/src/usage_statistics_service.rs` | 会话数仍读 `agent_sessions` metadata；token/model 不再从 `agent_messages` 估算 | current-compatible stats reader | 后续将 `model_usage_stats` / request 聚合归属迁到 Telemetry DB |

## 5. Durable 写入根目录 owner

| 根目录 / 文件 | 当前 owner | 分类 | 证据 | 目标 |
| --- | --- | --- | --- | --- |
| `<data-root>/lime.db` | `core::database::init_database_with_data_dir` / `app_paths::resolve_database_path` | current Product DB | `database/mod.rs` | 保留合理产品数据 |
| App Server `--data-dir` | `app-server/src/main.rs` | current CLI root | 支持 CLI arg / env | Electron 托管时必须显式传入 |
| Electron `userData` | `electron/main.ts` | current Desktop root | E2E 可 `app.setPath("userData")` | 派生 `<userData>/app-server` 和 host 子目录 |
| App Server sidecar launch args | `packages/app-server-client/src/index.ts` | current | `SidecarLaunchConfig.dataDir` 组装 `--data-dir`；Electron Host 传入 `userData/app-server` | 后续 runtime store 只消费该 root，不重新发现平台目录 |
| `<data-root>/runtime/events/sessions/session_<id>.jsonl` | `app-server/src/runtime/event_log.rs` | current durable log | `RuntimeCore` 配置 `EventLogWriter` 后先写 JSONL durable event；文件名做 ASCII safe stem；`message.created` 负责 durable user input | 后续补 shared read/export load context |
| `<data-root>/runtime/projection_1.sqlite` | `app-server/src/runtime/projection_store.rs` | current Projection DB | 独立 SQLite 文件，已建 `projected_sessions / projected_turns / projected_items / projection_watermarks` | 后续补 repair 和 read path 切换 |
| `request_logs/` | `app_paths::resolve_request_logs_dir` | compat / move | `RequestLogger::new` | 迁 Telemetry DB |
| `sessions/` | `core/src/session_files/storage.rs` | compat / P0待判 | `resolve_sessions_dir()` | 判定是否 runtime transcript 残留 |
| `agent/` | `agent/src/agent_runtime_support.rs` | compat / P0待判 | `resolve_agent_dir()` | 不承接新 runtime truth |
| `logs/` | `core/src/logger.rs`、`app-server/local_data_source/diagnostics.rs` | current log root | `resolve_logs_dir()` | log 可保留，不能当 transcript truth |
| `<workspace-root>/.lime/` | workspace runtime / harness / task artifact | current sidecar | `resolve_workspace_runtime_agents_path`、前端 / app-server tests | 只保存 workspace-owned artifact/checkpoint |
| temp/cache | OS API | not durable | PRD 约束 | 不保存 durable fact |

## 6. P1 前 guard 候选

候选扫描规则：

```text
INSERT INTO agent_messages
DELETE FROM agent_messages
agent_thread_items.*payload_json
resolve_request_logs_dir
resolve_sessions_dir
resolve_agent_dir
read_to_string(.*runtime/events
lime-rs/src/commands
lime-rs/src/services
```

允许白名单：

- migration / backfill。
- test fixture / retired guard。
- migration/export-only loader；不允许长期产品 fallback。
- `app_paths` 自身。

## 7. P0 未决问题

1. Electron App Server sidecar 是否已经通过 release manifest 间接配置 data dir？
   - 已收口：release manifest、env binary、dev binary 三条 sidecar 路径都通过 `SidecarLaunchConfig.dataDir` 接收 Electron `userData/app-server` 并组装 `--data-dir`。
2. `agent_runs` 是 Telemetry DB 还是 Projection DB？
   - 如果服务 GUI runtime evidence，则可进入 Projection DB；如果用于全局统计，则更适合 Telemetry DB。P0 先标 move。
3. `model_usage_stats` 与 `usage_statistics_service` 的最终 owner 是 Product DB 还是 Telemetry DB？
   - P4 最小骨架先覆盖 request log owner；usage/model 已退出 `agent_messages` fallback，模型使用聚合是否整体迁入 Telemetry DB 是后续细化项。

## 8. 下一刀

P3 shared load context、`message.created` durable user input、P4 Telemetry DB 最小骨架和 P5 sidecar 第一刀已落地，P5 contract 也已完成。下一步不再扩展 sidecar 功能面，而是转入 S2 骨架守卫：

1. S1 已完成：`artifact.snapshot`、generated artifact content、file checkpoint current snapshot 已统一收进 sidecar。
2. S2 当前唯一主刀：收缩旧 `agent_messages` 写入白名单，扫描裸 `outputSnapshotFile` / `checkpointSnapshotFile`、不带 `sidecarRef.sha256` 的 current runtime event、`payload_json` 大正文和业务层硬编码平台路径；产品层 direct `AgentDao` / `ChatDao` 旧消息 API 回读已被守卫封住。
3. S3 守卫稳定后：旧历史只允许 migration/backfill/export 或用户导出文件，先清 legacy rows / message-only session shells，再删除 `agent_messages` 产品读写路径，不走产品 DB fallback。
4. S4 细节收尾：P4-b 真实 telemetry 写入证据、`current_timeline` read bridge 收口、旧 DAO/store/schema 引用清零和历史表 drop migration；usage/model 聚合、`websocket` 旧 sessions RPC 和 `SessionContextService` 的旧消息 fallback 已退出。
