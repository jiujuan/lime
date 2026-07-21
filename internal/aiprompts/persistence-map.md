# Runtime Persistence Map

本文件定义 Lime 当前与 Claude Code 持久化对齐相关的单一事实源，重点回答：

- 线程里的文件快照到底从哪里来
- `SessionDetail / thread_read / export / replay` 各自应该消费哪层事实
- 哪些路径属于 current，哪些只是 sidecar 或兼容辅助层

## Current 主链

当前文件持久化主链固定为：

`agentSession/turn/start ArtifactSnapshot -> AgentTimeline FileArtifact -> artifact_document_service sidecar versions -> SessionDetail / AgentRuntimeThreadReadModel / App Server file checkpoint methods -> evidence / replay`

路径边界：旧 `agent_runtime_*file_checkpoint*` 文件快照命令名只允许作为迁移期读取 surface、retired guard 或历史 evidence；`lime-rs/src/**` 与 `lime-rs/src/commands/**` 已删除，不是新增持久化实现目录。新增 file checkpoint、artifact sidecar、export / replay 持久化逻辑应进入 `lime-rs/crates/**` 下的 App Server / RuntimeCore / services / core / agent 或协议 client，不得恢复旧 command wrapper。DB 瘦身与平台落盘主线见 `internal/exec-plans/codex-lime-storage-alignment-plan.md`，逐路径账本见 `internal/refactor/data/03-one-to-one-storage-alignment-plan.md`；旧 `db-slimming-codex-alignment-plan.md` 仅保留历史 evidence。

含义如下：

1. `RuntimeAgentEvent::ArtifactSnapshot` 是运行时写入文件快照的唯一事件入口
2. 时间线里的 `AgentThreadItemPayload::FileArtifact` 是线程侧唯一事实源
3. `artifact_document_service` 负责把当前文档与 `versions/vNNNN.artifact.json` 历史快照落到工作区 sidecar
4. `AgentRuntimeThreadReadModel.file_checkpoint_summary` 只做轻量摘要，不复制第二套 transcript
5. 深一点的读取统一走：
   - App Server `agentSession/fileCheckpoint/list`
   - App Server `agentSession/fileCheckpoint/get`
   - App Server `agentSession/fileCheckpoint/diff`
6. `runtime_evidence_pack_service` 与 `runtime_replay_case_service` 统一消费同一份 file checkpoint 读模型，不再各自重新解析 artifact 状态

## 事实源分层

### 0. Thread durable history 目标与 file checkpoint 的边界

- P1 目标合同：Thread/Turn/Item 的 durable truth 只允许由 App Server `AgentRoot/sessions/YYYY/MM/DD/rollout-*.jsonl` 承载；state/read-model SQLite 只保存定位、语义状态或经验证可重建的 projection。
- 当前生产实现仍同时写 flat EventLog、`ProjectionStore.projected_*` 与 `canonical_*` SQLite；它们是 `deprecated / frozen-for-migration` 的过渡实现，不得新增 payload、第二 writer 或长期兼容读取。完成 canonical cutover、rebuild 和 Gate B 前，本目标只能保持 `in_progress`。
- `file_checkpoint` 是 workspace/artifact sidecar，保存用户文件快照和版本，不是 Thread transcript，也不能反向成为 session history owner。
- Event、trace、telemetry、tool IO、renderer `localStorage` 和 host profile 都不能复制完整 transcript 或 durable session/domain truth。

### 1. Timeline facts

文件：

- `lime-rs/crates/core/src/database/dao/agent_timeline.rs`
- 迁移目标：`lime-rs/crates/app-server/src/runtime/projection_store.rs` / `projection_repair.rs` 或后续独立 projection store crate

职责：

- 记录线程里“有哪份文件快照”
- 保留 `path / source / content / metadata`
- 为 `SessionDetail.items` 与 `thread_read` 提供稳定事实

约束：

- 不再为“文件持久化”新增第二套并列事件模型
- 不从 UI 状态反写 timeline 真相
- `agent_thread_turns / agent_thread_items` 当前只作为 `compat / projection`；长期目标是 Projection DB，而不是继续向 `lime.db` 扩写 runtime transcript

### 2. Sidecar snapshot store

文件：

- `lime-rs/crates/app-server/src/file_checkpoint.rs`
- `lime-rs/crates/app-server/src/file_checkpoint_snapshot.rs`
- 迁移目标：workspace sidecar store，通过 event ref / checksum 被 App Server read/export 解析

职责：

- 把当前 artifact 文档落到工作区
- 维护 `artifactVersion*` metadata 与历史 `versions/` 快照
- 提供 `artifactVersionDiff / artifactVersions / artifactDocument / previewText`

约束：

- sidecar 负责详情补充，不单独定义 thread 真相
- 当前 / 历史版本路径都必须继续走工作区相对路径
- 跨 workspace 的产品主库、全局 telemetry、全局 runtime index 不写入 workspace `.lime/`

### 3. Runtime read models

文件：

- `lime-rs/crates/app-server/src/runtime/exports/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `src/lib/api/agentRuntime/threadClient.ts`

职责：

- 把 `FileArtifact + metadata + sidecar snapshot` 收敛成统一读模型
- 在线程面板暴露“最近文件快照”摘要
- 给前端、导出与后续治理提供稳定命令边界

约束：

- `thread_read` 只保留轻摘要
- list / detail / diff 复用同一 service，不在各个导出服务重复解析

## Export / Replay 消费口径

文件：

- `lime-rs/crates/app-server/src/runtime/exports/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/local_data_source/current_timeline.rs`（compat，迁移到 projection reader 前）

当前约束：

1. `runtime.json` 与 `artifacts.json` 必须带 `fileCheckpoints / fileCheckpointCount`
2. replay `input.json` 必须带 `fileCheckpoints / fileCheckpointCount`
3. `recentArtifacts` 继续保留，用于路径级快速摘要；`fileCheckpoints` 才是正式快照读模型

## 非 current 路径

以下不再视为文件持久化 current 主链：

- 组件本地推导的 artifact 状态
- 额外维护一套 Claude Code 式 transcript 文件真相
- analysis / replay / review 各自单独扫描工作区再猜“最新版本”

如果需要补持久化能力，优先继续扩展：

- App Server `agentSession/fileCheckpoint/*` current 命令边界
- App Server shared load context / export context
- `AgentRuntimeThreadReadModel.file_checkpoint_summary`
- Event Log / Projection DB / Sidecar ref；旧 `agent_runtime_*file_checkpoint*` 只作 retired guard

而不是再开平级旁路。

## DB 瘦身补充口径

`lime.db` 不再被定义为 runtime transcript DB。当前分类：

- `current`：Product DB，保留 provider、API key、model registry、workspace、settings、user assets、插件与低频产品对象。
- `compat / projection`：`agent_sessions`、`agent_thread_turns`、`agent_thread_items`、`agent_turn_outcomes`、`agent_thread_incidents`。
- `deprecated / migration-source`：`agent_messages`，只允许 migration/backfill/export 输入，不承接新 Agent runtime transcript truth，也不保留长期产品 fallback。
- `move`：request telemetry、runtime trace、大输出、file checkpoint content，分别进入 bounded Observability owner、diagnostic Event input、Sidecar 或 Artifact owner；都不能成为 canonical Thread transcript。

平台路径要求：

- Desktop 托管时 `userData` 只负责 Electron profile/config；App Server `--data-dir` 必须由统一安装路径契约解析：macOS 使用 `~/Library/Application Support/lime/app-server`，Windows 使用 `%LOCALAPPDATA%\\LimeCloud\\lime\\app-server`，不能使用 Squirrel 安装包根 `%LOCALAPPDATA%\\lime`。
- Windows roaming host profile 固定为 `%APPDATA%\\lime`；Chromium `sessionData`、模型和 connector 等机器资产不得落在 roaming root。
- CLI / 测试通过 `--data-dir` 或 `APP_SERVER_DATA_DIR` 注入。
- `LIME_AGENT_RUNTIME_ROOT` 仅作为显式测试/便携/运维 override；Electron 启动子进程时将最终 `AgentRoot` 回写到同名环境变量，禁止默认 root 与 override 双写。
- Rust store 只接受显式 `data_root` / `workspace_root`，业务层不硬编码 macOS / Windows 目录、`~/.lime`、repo 根或 temp。
