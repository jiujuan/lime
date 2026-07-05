# Aster Runtime Codex 风格迁移计划

状态：in_progress  
创建时间：2026-07-03  
路线图：`internal/roadmap/astermigration/README.md`

## 主目标

把 Lime Agent Runtime 从“多个 current crate 直接依赖嵌套 Aster workspace”迁到“Codex 风格平铺一等 runtime crate”。完成后，Aster 只能作为历史迁移参考或短期 vendor，不再是 Lime current 主链事实源。

## 成功标准

1. 根 `lime-rs/Cargo.toml` 不再把 `aster` / `aster-models` 暴露给多个 current crate。
2. 除明确标注的迁移 adapter 外，`lime-rs/crates/**` 不再出现 `use aster::`、`aster::` 或 `aster_models::`。
3. `app-server` 只依赖 Lime runtime / protocol / provider / tool / store 接口，不直接构造 Aster provider、tool registry、session config 或 streaming loop。
4. GUI、evidence、replay、analysis 继续只消费 AgentRuntime read model 和 evidence current 主链。
5. 守卫能阻止 Aster 依赖和 import 回流。

## 2026-07-05 现实校准：当前不是 99%

- `checked`：对照 `README.md` 主目标、上方成功标准、`/Users/coso/Documents/dev/rust/codex/codex-rs` workspace 布局和 Cargo Workspaces 语义后，当前整体目标完成度按退出条件约为 `78%`，不能继续按 `99%` 或“无 Aster 依赖完成态”口径汇报。
- `evidence`：`lime-rs/Cargo.toml` 仍有 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`；`lime-rs/crates/agent/Cargo.toml` 仍有 `aster.workspace = true`；`lime-rs/vendor/aster-rust` 仍存在，约 `13M` / `672` 个文件。
- `evidence`：`lime-rs/crates/**` 仍有约 `225` 处 `use aster::` / `aster::` / `aster_models::` 文本命中，集中在 `lime-agent`；排除测试目录后，`lime-agent/src` 生产路径仍约 `213` 处命中。
- `completed`：Codex 风格的一等 crate 骨架、非 agent crate 的 direct Aster dependency 收口、App Server direct Aster 构造回流守卫、多个 public wrapper / 旧 feature / test-support surface 删除，以及 `tool_orchestrator` shell permission preflight 和主编排层 direct Aster registry execution 细节隔离已经完成。
- `blocking`：Phase 6 删除条件未满足；主阻塞仍是 `lime-agent` 内部 Aster reply/provider/tool/session adapters 与 root vendored Aster dependency。
- `next`：继续主执行链退场，优先处理 `request_tool_policy/aster_reply_adapter.rs`、`credential_bridge/runtime_provider_adapter.rs`、`agent_tools` / `native_tools` registry execution adapter 和 `aster_session_store`；目标是让 current provider stream / turn executor / tool runtime / thread store 接管后删除 adapter，而不是继续集中 Aster 壳。

## 2026-07-03 进度记录：Codex 风格 runtime crate 骨架

- `completed`：新增 `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 五个一等 workspace crate，并在根 `lime-rs/Cargo.toml` 声明 workspace dependency。五个 crate 只定义最小 DTO / trait 骨架，不依赖 Aster。
- `completed`：`.gitignore` 显式放行 `internal/roadmap/astermigration/**`，确保本路线图和迁移计划可以作为 versioned artifact 进入仓库。
- `guarded`：新增 `src/lib/governance/asterMigrationBoundary.test.ts`，要求五个 current runtime crate 存在、已纳入 workspace dependency，且不得出现 `use aster::`、`aster::`、`aster.workspace = true`、`aster-models.workspace = true` 或 `package = "aster-core"`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package model-provider --package thread-store --package tool-runtime --package agent-runtime -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，3 tests passed。
- `verified`：`cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps` 已确认五个新 crate 进入 workspace members。
- `verified`：默认 `lime-rs/target` 有既存 artifact lock，占用等待后中止；改用 `CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol -p model-provider -p thread-store -p tool-runtime -p agent-runtime` 通过。
- `deferred`：本刀未改 App Server / RuntimeBackend 生产代码，因为相关文件已有大量并行脏改动；下一刀再把 App Server 编译期接入 `agent-runtime` 接口，避免和现有写集冲突。

## 2026-07-03 进度记录：协议 DTO 与边缘 crate 批量迁移

- `completed`：把 `aster-models` 的 OpenAI / Anthropic wire DTO 批量迁入 `agent-protocol::{openai, anthropic}`；`lime-core::models::{openai, anthropic}` 改为 re-export `agent-protocol`，保留原 public 路径以避免无意义调用方 churn。
- `completed`：`lime-rs/crates/core/Cargo.toml` 从 `aster-models.workspace = true` 迁到 `agent-protocol.workspace = true`；根 `lime-rs/Cargo.toml` 移除 `aster-models = { path = ... }` workspace dependency，`exclude = ["crates/aster-models"]` 仅保留为历史路径防自动纳入 workspace 的 guard。
- `completed`：`agent-protocol` 新增 `model_context`、`session_context`、`turn_context` 模块，承接模型 context window fallback、session correlation header wire constants 和调度 turn context DTO；header 字符串值保持不变，这是 wire contract 迁移 owner，不是改协议。
- `completed`：`lime-server` 从 `aster::context::MODEL_CONTEXT_WINDOWS` / `aster::session_context::*` 切到 `agent-protocol`，并移除 `aster.workspace = true`，改依赖 `agent-protocol.workspace = true`。
- `completed`：`lime-scheduler` 的历史任务上下文测试投影从 `aster::session::{TurnContextOverride, TurnOutputSchemaSource}` 切到 `agent-protocol::turn_context`，并移除 `aster.workspace = true`，改依赖 `agent-protocol.workspace = true`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 `server` / `scheduler` 已迁 crate 回流守卫，禁止重新出现 `use aster::`、`aster::`、`aster.workspace = true`、`aster-models.workspace = true` 或 `package = "aster-core"`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package lime-server --package lime-scheduler -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，4 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol -p lime-server -p lime-scheduler` 通过：`agent-protocol` 6 tests、`lime-scheduler` 24 tests + 1 doctest、`lime-server` 111 tests。`lime-server` 仍有既有 `image_api_provider.rs` 未用 import warning，非本次迁移引入。
- `verified`：Aster 直接 Cargo 依赖面从根 `aster` + `agent/server/services/app-server/scheduler` 收缩到根 `aster` + `agent/services/app-server`；`server` / `scheduler` 源码 Aster import 扫描为 0。

## 2026-07-03 进度记录：services provider registry 批量迁移

- `completed`：把 Aster `providers::canonical` 作为 provider registry 批次迁入 `model-provider::canonical`，包含 `CanonicalModel` / `Pricing` / `CanonicalModelRegistry` / `maybe_get_canonical_model` / canonical name mapping 和 bundled `canonical_models.json`。
- `completed`：`lime-services` 的 `model_registry_service.rs` 从 `aster::providers::canonical` 切到 `model_provider::canonical`；`lime-rs/crates/services/Cargo.toml` 增加 `model-provider.workspace = true`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加已迁文件守卫，禁止 `lime-rs/crates/services/src/model_registry_service.rs` 重新出现 Aster import / dependency 文本。整个 `services` crate 暂不做 crate 级禁用，因为 `aster_session_store*` 仍是下一批 session store 迁移残留。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-services -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -p lime-services` 通过：`model-provider` 1 test，`lime-services` 213 tests passed / 4 ignored，4 doc-tests ignored。
- `verified`：`rg "aster::providers::canonical|maybe_get_canonical_model" lime-rs/crates --glob '*.rs' --glob '!**/aster-rust/**'` 显示 canonical registry current 调用只剩 `model-provider` 和 `services` 对 `model_provider::canonical` 的引用；`lime-services` 直接依赖摘要为 `aster, model-provider`，其中 `aster` 仅剩 `aster_session_store*`。`agent` 中非 canonical provider Aster 引用仍属后续 `agent` 批次。

## 2026-07-04 进度记录：App Server direct Aster 依赖批量收口

- `completed`：`app-server` 的 `runtime_backend/{image_tools,memory_tools,skill_runtime_enable,live_execution_process,tests}.rs` 已批量切到 `lime_agent::runtime_facade`，App Server 不再直接 import `aster::` / `aster_models::`。当前批次只保留 `lime-agent` 作为迁移 facade，避免在 App Server runtime backend 继续堆 Aster 语义。
- `completed`：`lime-rs/crates/app-server/Cargo.toml` 移除 `aster.workspace = true`；`aster-backend` feature 名称暂保留为历史/compat contract，不再表示 App Server 可以直接依赖 Aster runtime。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `app-server` 纳入 已迁出 direct Aster dependency 的 crate，禁止重新出现 `use aster::`、`aster::`、`aster.workspace = true`、`aster-models.workspace = true` 或 `package = "aster-core"`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：`lime-agent` 471 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend` 通过：196 lib tests + main 参数测试通过，integration tests 按 filter 0 tests。
- `blocked`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent -p app-server` 的 `app-server` 全库测试有既有非迁移失败：`plugin_packages::package::tests::inspect_local_package_accepts_plugin_json` 期望 `schemaVersion = "lime.plugin.package.v1"`，实际为 `None`。该失败不在 Aster direct dependency 收口面，未通过恢复 Aster 依赖绕开。
- `next`：Aster 直接 Cargo 依赖面收缩到根 `aster` + `agent/services`；下一批优先处理 `services` 的 `aster_session_store* -> thread-store/agent facade`，再处理 `agent` 内部 facade 的领域拆迁。

## 2026-07-04 进度记录：services Aster SessionStore adapter 批量迁出

- `completed`：把 `lime-services::aster_session_store` 整组迁出 services，移动到 `lime-agent::aster_session_store`，包含主 `LimeSessionStore` adapter 以及 `legacy_conversation` / `runtime_conversation` 子模块。该批次不是逐函数搬运，而是按“只有 `lime-agent` 迁移 facade 可以实现 Aster trait”的 crate 边界批迁。
- `completed`：`lime-agent` 内部引用从 `lime_services::aster_session_store::LimeSessionStore` 改为 `crate::aster_session_store::LimeSessionStore`；`services` 不再导出 `aster_session_store`。
- `completed`：`lime-rs/crates/services/Cargo.toml` 移除 `aster.workspace = true`；当前 Aster 直接 Cargo 依赖面应只剩根 workspace `aster` 和 `lime-agent`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `services` 加入 已迁出 direct Aster dependency 的 crate，禁止 services 重新 import 或声明 Aster dependency。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package lime-services -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-services` 通过：199 passed / 4 ignored，doc-tests 4 ignored。该结果证明 services 已在无 direct Aster dependency 下通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `next`：`lime-agent::aster_session_store` 仍是 `deprecated` 迁移 facade，后续要按领域继续把 session/thread/message projection DTO 下沉到 `thread-store`，再删除 Aster `SessionStore` trait 实现和根 workspace `aster` dependency。

## 2026-07-04 进度记录：output schema runtime DTO 迁到 agent-protocol

- `completed`：`agent-protocol::turn_context` 新增 `TurnOutputSchemaRuntime` / `TurnOutputSchemaStrategy`，字段与 Aster wire shape 保持同构，继续使用 `camelCase` / `snake_case` serde contract。
- `completed`：`lime-agent::protocol::TauriAgentEvent::TurnContext.output_schema_runtime` 与 `SessionExecutionRuntime.output_schema_runtime` 改用 `agent-protocol` DTO，不再直接把 Aster `TurnOutputSchemaRuntime` 作为 read model / event DTO 暴露出去。
- `completed`：`lime-agent::session_execution_runtime::project_output_schema_runtime` 作为 adapter 转换边界，把 Aster snapshot 的 output schema runtime 投影为 Lime DTO；`event_converter` 复用该转换，不再 clone Aster DTO 到 current event。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package lime-agent -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent output_schema_runtime` 通过，覆盖 `event_converter` 与 `session_execution_runtime` 的 output schema runtime 投影。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 重跑通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。第一次全量中 `provider_stream_idle` 用例发生超时抖动，单独重跑和全量重跑均通过。
- `next`：继续把 `lime-agent` 中 Aster session/thread/runtime snapshot DTO 投影到 `thread-store` / `agent-protocol`，减少 `session_execution_runtime`、`event_converter`、`protocol_projection` 的 Aster public type 面。

## 2026-07-04 进度记录：AgentTurnContext / TurnInputEnvelope public DTO 批量迁出 Aster

- `external-check`：复核 Cargo 官方 Workspaces 文档，workspace 成员共享根 `Cargo.lock`、根 `target`、`members/exclude/default-members` 与 `[workspace.dependencies]`；这支持把 Lime runtime owner 放成一等 workspace crate，而不是把 `aster-rust` 嵌在 current crate 区继续扩散。Context7 MCP 工具本轮未暴露可调用入口；已用 WebSearch + 官方 Cargo 文档和本地 Codex 仓库复核。
- `external-check`：复核 `/Users/coso/Documents/dev/rust/codex/codex-rs/Cargo.toml`，Codex 把 `protocol`、`model-provider`、`thread-store`、`tools`、`core`、`app-server` 等能力平铺为 workspace member，并通过 `[workspace.dependencies]` 统一引用；Lime 本轮继续按该方向收敛。
- `completed`：`lime-agent::turn_context_configuration::AgentTurnContext` / `AgentTurnContextOverride` 明确成为 `agent_protocol::turn_context::TurnContextOverride` 的 public type alias；Aster `TurnContextOverride` 只保留在 `to_aster_turn_context` adapter 内。
- `completed`：新增 `to_agent_turn_context` 投影函数，把 Aster task-local context 转成 `agent-protocol` DTO；`runtime_facade::current_agent_turn_context()` 成为 App Server 读取 task-local context 的 current 出口。
- `completed`：新增 `runtime_facade::with_agent_turn_context()`，让 App Server 测试和上层辅助入口只传 `AgentTurnContext`；Aster `with_turn_context` / `TurnContextOverride` 留在 `lime-agent` facade 内部兼容面。
- `completed`：`TurnInputEnvelope` 的 `turn_context_override()`、`TurnDiagnosticsSnapshot.turn_output_schema_source`、builder 和单测从 `aster::session::{TurnContextOverride, TurnOutputSchemaSource}` 批量切到 `agent_protocol::turn_context`；该文件不再 import Aster。
- `completed`：`app-server` 增加 `agent-protocol.workspace = true`，`runtime_backend` 相关测试直接用 `agent_protocol::turn_context::TurnOutputSchemaSource` 断言；App Server production 代码继续不 direct import Aster。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `lime-rs/crates/agent/src/turn_input_envelope.rs` 加入已迁文件守卫，禁止该 public DTO owner 回流到 Aster。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 App Server turn context 守卫，禁止 App Server 重新 import `runtime_facade::TurnContextOverride` / `runtime_facade::with_turn_context` 或直接调用 `aster::session_context`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package lime-agent --package app-server -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，6 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent turn_input_envelope --lib` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent turn_context --lib` 通过，9 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_options_expected_output_schema_flows_to_turn_context --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server hook_runs_bash_through_shared_execution_process_server --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server turn_context_from_request` 编译通过但 filter 未命中具名测试，结果为 0 tests；保留为 App Server 编译边界证据，不当行为覆盖。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `verified`：Aster 直接 Cargo 依赖面仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0。`lime-agent/src` 当前仍有约 271 处 Aster 文本命中，均属于下一批迁移 adapter / runtime 内部待搬空面。
- `next`：下一批优先按文件/领域批量迁移 `runtime_facade` 剩余 `TurnContextOverride` / `TurnOutputSchemaSource` re-export、`agent_tools::tool_orchestrator` 的 Aster tool context 面，以及 `session_execution_runtime` / `protocol_projection` 的 session/thread/runtime snapshot DTO；迁完一批即补文件级守卫并删除对应 Aster import。

## 2026-07-04 进度记录：工具与 SessionConfig turn context DTO 批量迁出 Aster

- `completed`：`ToolExecutionBatchInput.turn_context`、`WorkspacePatchHostInput.turn_context`、`tool_policy_inspector`、`skill_search_tool`、`image_tasks`、`direct_text_generation`、`session_configuration`、`skill_execution` 的 public / 业务输入已批量切到 `AgentTurnContext` / `agent-protocol` DTO。
- `completed`：`SessionConfigBuilder::turn_context(...)` 改为接收 `AgentTurnContext`，只在 `build()` 边界调用 `to_aster_turn_context(...)`；Aster `TurnContextOverride` 不再散落到 direct text、session config 和 skill execution 构建逻辑。
- `completed`：`tool_policy_inspector`、`skill_search_tool`、`image_tasks` 改为通过 `runtime_facade::current_agent_turn_context()` 读取 task-local context；Aster task-local 读取只保留在 `runtime_facade` 与 `tool_orchestrator` 调用 Aster registry 前的 adapter 边界。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 的 `AGENT_TURN_CONTEXT_MIGRATED_FILES` 扩展到工具编排、工具策略、workspace patch、direct text、image task、session config、skill execution 和 skill search 文件，禁止这些已迁文件重新使用 Aster turn context DTO。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，14 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent workspace_patch_host --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_policy_inspector --lib` 通过，4 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent image_tasks --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_execution --lib` 通过，7 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent direct_text_generation --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，8 tests passed。
- `verified`：Aster 直接 Cargo 依赖面仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0。`lime-agent/src` Aster 文本命中从本批开始前约 265 降到约 259。
- `known-gap`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server -- --check` 仍会因为既有无关文件 `lime-rs/crates/app-server/src/runtime/workflow/source_map.rs` rustfmt 漂移失败；本批未格式化无关脏文件。
- `next`：继续迁 `skill_execution` 上游 / `aster_state_support` 以外的 session config consumer，随后转入 `protocol_projection`、`event_converter`、`session_execution_runtime` 的 runtime snapshot / turn context 投影批次，目标是把 Aster DTO 限制到极少数 adapter 文件。

## 2026-07-04 进度记录：protocol_projection turn context current DTO 收口

- `completed`：`protocol_projection::project_turn_context_summary` 的 public 入参从 Aster `TurnContextOverride` 切到 `AgentTurnContext`，current 投影入口不再直接暴露 Aster turn context DTO。
- `completed`：`event_converter::build_turn_context_summary` 改为消费 `AgentTurnContext`；Aster `TurnStarted` event 进入 converter 后先通过 `to_agent_turn_context` 做一次 DTO 投影，再进入 summary / execution strategy / policy 字段读取。
- `completed`：`session_execution_runtime` 在读取 Aster runtime snapshot 的单点边界把 `latest_turn.context_override` 投影成 `AgentTurnContext` 后再调用 `protocol_projection`，避免 current projection API 继续接 Aster DTO。该文件已超过 `1000` 行，本批只改现有调用点，不在巨型文件里新增业务逻辑。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `lime-rs/crates/agent/src/protocol_projection.rs` 纳入已迁 turn context 文件守卫，禁止重新出现 Aster turn context DTO。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib` 通过，24 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，8 tests passed。
- `deferred`：`event_converter.rs` 约 `3242` 行、`session_execution_runtime.rs` 约 `2933` 行，后续深迁必须先按投影 / snapshot / metadata extraction 边界拆分子模块，再继续搬空 Aster snapshot DTO。
- `next`：继续 Phase 3 / Phase 4，优先把 `protocol_projection` 仍暴露的 Aster `TurnRuntime` / `ItemRuntime` 投影边界迁到 `thread-store` DTO，或先从 `event_converter` 拆出 turn context / runtime projection 子模块后再迁 session snapshot。

## 2026-07-04 进度记录：protocol_projection runtime timeline DTO 迁出 Aster

- `completed`：`protocol_projection::project_turn_runtime` / `project_item_runtime` 的 public 入参已从 Aster `TurnRuntime` / `ItemRuntime` 收窄为 Lime current timeline projection type alias（当前落点为 `AgentThreadTurn` / `AgentThreadItem`）。该批次先做骨架迁移，不引入新的大 DTO 层，避免在 `lime-agent` 内再造平行协议。
- `completed`：新增 `lime-agent::aster_runtime_projection` 作为 Aster timeline adapter，`session_store_runtime_projection` 只从该 adapter 读取 runtime turn / item 投影；`protocol_projection` 不再 import `aster::session::{TurnRuntime, ItemRuntime}`，Aster timeline DTO 只能留在 adapter / event converter 内部。
- `completed`：`session_store_runtime_projection` 的 runtime overlay 入参从 Aster `SessionRuntimeSnapshot` 改为 `RuntimeTimelineSnapshotProjection`，token usage fallback 入参从 Aster `Session` 改为 `AgentTokenUsage` 投影；`project_aster_runtime_snapshot` / `project_aster_session_usage` 统一在 adapter 边界完成 Aster -> Lime DTO 转换。
- `guarded`：`protocol_fact_source_guard` 调整为允许 `protocol_projection` 继续暂存 event/message compat converter，但禁止它直接调用 `convert_turn_runtime` / `convert_item_runtime`；`src/lib/governance/asterMigrationBoundary.test.ts` 增加 `protocol_projection` runtime DTO 防回流守卫。
- `guarded`：`session_store_runtime_projection.rs` 纳入已迁文件守卫，禁止 runtime store projection 重新 import Aster 或声明 Aster 依赖；该文件后续只处理 Lime timeline/read-model 合并。
- `risk`：本批触碰 `event_converter.rs`（超过 `1000` 行）仅把 `convert_turn_runtime` / `convert_item_runtime` 降为 `pub(crate)` 并迁出调用边界，没有追加新业务逻辑。后续退出条件：把 timeline payload 转换从 `event_converter` 拆到独立投影模块，并让 Aster event/message compat 也进入 adapter 边界。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test protocol_fact_source_guard` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，9 tests passed。
- `verified`：Aster direct Cargo dependency 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0。`lime-agent/src` Aster 文本命中约 `256`，其中 `protocol_projection` 只剩 event/message compat，`session_store_runtime_projection` 已为 0。
- `next`：继续迁 `session_execution_runtime` 的 `SessionRuntimeSnapshot` / latest turn 投影，或把 `event_converter` 的 Aster event/message compat 入口拆进 adapter；目标是让 Aster 只剩 execution adapter 与 retired guard，而不是 current projection API。

## 2026-07-04 进度记录：session_execution_runtime snapshot/turn current projection 收口

- `completed`：`build_session_execution_runtime` 的 production 入参已从 Aster `SessionRuntimeSnapshot` / `TurnRuntime` 收窄为 `SessionExecutionRuntimeSessionProjection`、`SessionExecutionRuntimeSnapshotProjection` 与 `SessionExecutionRuntimeTurnProjection`。生产 builder 不再直接消费 Aster runtime snapshot / turn DTO。
- `completed`：`aster_runtime_projection` 承接 `project_aster_session_execution_runtime_session`、`project_aster_session_execution_runtime_snapshot` 与 `project_aster_output_schema_runtime`，把 Aster session / snapshot / output schema runtime 统一投影到 Lime current DTO。
- `completed`：`session_store_runtime_detail` 在调用 execution runtime builder 前先做 Aster -> current projection；`event_converter` 的 output schema runtime 也复用同一 adapter 投影，不再在多个 production 文件里各自 clone Aster DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 `session_execution_runtime production 不得重新消费 Aster runtime snapshot / turn DTO` 守卫，只允许测试 fixture 保留 Aster snapshot / turn 构造。
- `risk`：`session_execution_runtime.rs` 仍超过 `1000` 行，本批只改 production builder 边界，没有追加业务逻辑。后续退出条件：继续把 metadata extraction、runtime snapshot projection 与测试 fixture 拆到子模块，避免巨型文件继续承接迁移逻辑。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib` 通过，24 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test protocol_fact_source_guard` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，10 tests passed。
- `next`：继续把 `protocol_projection` 剩余 Aster event/message compat 入口拆入 adapter，让 `protocol_projection` 成为纯 Lime current projection 文件。

## 2026-07-04 进度记录：protocol_projection event/message compat 下沉 adapter

- `completed`：`protocol_projection` 移除 Aster `AgentEvent` / `Message` 入参函数，不再 import `aster::agents::AgentEvent` 或 `aster::conversation::message::Message`。该文件现在只接 Lime current DTO：timeline projection 与 `AgentTurnContext` summary。
- `completed`：新增 `protocol_context_projection` 小模块承接 turn context summary metadata 解析；`event_converter` 不再拥有 current summary 解析逻辑，只在 Aster `TurnStarted` adapter 内调用 `protocol_projection::project_turn_context_summary`。
- `completed`：`aster_runtime_projection` 新增 `project_aster_runtime_event` / `project_aster_message`，统一承接 Aster event/message -> Lime protocol 的 compat adapter；`request_tool_policy`、`request_tool_policy::runtime_status`、`skill_execution`、`session_store_runtime_detail` 已批量切到该 adapter。
- `guarded`：`protocol_fact_source_guard` 不再允许 `protocol_projection` 直接调用 `event_converter`；只有 `aster_runtime_projection` / `event_converter` 可触碰 event converter，只有这两个文件可触碰 runtime converter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `protocol_projection.rs` 与 `protocol_context_projection.rs` 纳入 已迁出 direct Aster dependency 的文件，禁止 Aster import / dependency 文本回流。
- `risk`：`event_converter.rs` 仍超过 `1000` 行，本批按边界迁出约束删除 current summary 解析，未追加业务逻辑。后续退出条件：继续把 message content / provider trace / MCP notification 等 Aster payload adapter 拆到更小子模块，逐步搬空 `event_converter`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test protocol_fact_source_guard` 通过，1 test passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，10 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_execution --lib` 通过，7 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored。
- `verified`：Aster direct Cargo dependency 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0；`protocol_projection.rs` / `protocol_context_projection.rs` Aster 文本扫描为 0。
- `next`：继续处理 `runtime_projection_snapshot`、`subagent_control`、`request_tool_policy` 等仍直接消费 Aster runtime/session DTO 的 production 模块；优先选择能把 Aster snapshot / event adapter 继续收敛到 `aster_runtime_projection` 或更小 adapter 子模块的一批。

## 2026-07-04 进度记录：runtime_projection_snapshot current source 收口

- `completed`：`RuntimeProjectionSnapshot::from_snapshot` 的入参已从 Aster `SessionRuntimeSnapshot` 改为 Lime-owned `RuntimeProjectionSnapshotSource` / `RuntimeProjectionThreadSnapshot` / `RuntimeProjectionTurnSnapshot`。该 current projection owner 不再理解 Aster thread / turn / item 结构。
- `completed`：`runtime_projection_snapshot` 单测改为使用 Lime-owned source fixture，不再用 Aster `ThreadRuntimeSnapshot` / `TurnRuntime` fixture 构造。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `lime-rs/crates/agent/src/runtime_projection_snapshot.rs` 加入 已迁出 direct Aster dependency 的文件，禁止该 current projection owner 回流 Aster import / dependency 文本。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::" "lime-rs/crates/agent/src/runtime_projection_snapshot.rs"` 无命中。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_projection_snapshot --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，10 tests passed。
- `next`：继续处理 `subagent_control` / `session_store_subagent_context` 的 subagent runtime status snapshot DTO；这两个模块仍直接消费 Aster `SessionRuntimeSnapshot`、`TurnRuntime`、`ItemRuntimePayload` 与 `TurnStatus`。

## 2026-07-04 进度记录：subagent runtime status snapshot DTO 下沉 adapter

- `completed`：`subagent_control` production 不再直接解析 Aster `SessionRuntimeSnapshot` / `TurnRuntime` / `ItemRuntimePayload`。该模块改为消费 Lime current `SubagentTurnStatus` 与 `SubagentLatestTurnProjection`。
- `completed`：`aster_runtime_projection::project_aster_subagent_latest_turn` 承接 Aster snapshot -> subagent latest turn projection 的 adapter 逻辑，保留 duration、tool count 与 worker result ref 计算语义。
- `completed`：原 `latest_turn_projection_should_include_duration_tool_count_and_result_ref` 覆盖迁到 adapter 侧，证明 Aster snapshot adapter 仍能产出同样的 current projection。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 `subagent_control production 不得重新消费 Aster runtime snapshot / turn/item DTO` 守卫。`subagent_control` 仍是 Aster session / runtime queue 兼容入口，本批只收 runtime snapshot DTO 面，不误判 `QueuedTurnRuntime`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_control --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_runtime_projection --lib` 通过，1 test passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，11 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored，0 doctests。
- `verified`：`runtime_projection_snapshot.rs` Aster 文本扫描为 0；`subagent_control.rs` production 对 `SessionRuntimeSnapshot` / `ThreadRuntimeSnapshot` / `TurnRuntime` / `ItemRuntime` / `ItemRuntimePayload` / `latest_turn_projection` 扫描为 0；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0；Aster direct Cargo dependency 仍只剩根 workspace 与 `lime-agent`。
- `next`：继续把 `session_store_subagent_context` 的 test-only Aster snapshot helper 迁到 current fixture，随后转入 `request_tool_policy::auto_compaction_projection` 或 `session_store_message_projection` 的 Aster message/event DTO 收口。

## 2026-07-04 进度记录：auto-compaction 与 session store 测试 DTO 批量收口

- `completed`：`request_tool_policy::auto_compaction_projection` 已从直接消费 Aster `AgentEvent` / `Message` / `SystemNotificationType` 改为消费 Lime-owned `AutoCompactionEventProjection` / `AutoCompactionSystemNotificationKind`。Aster event/message 解析下沉到 `aster_runtime_projection::project_aster_auto_compaction_event` adapter，request policy 流式循环只借 adapter 产物做自动压缩特殊投影。
- `completed`：`session_store_message_projection` 删除 test-only `convert_user_visible_agent_messages(..., &[aster::conversation::message::Message], ...)`，保留 current `convert_user_visible_agent_messages_with_flags` 作为 user-visible 过滤事实源；对应测试改为覆盖 flags 长度不一致的 fallback，避免测试继续构造 Aster persisted message。
- `completed`：`session_store_subagent_context` 删除 test-only `SessionRuntimeSnapshot` / `TurnStatus` helper，改为 Lime-owned `ChildSubagentRuntimeTurnProjection` + `SubagentTurnStatus` fixture；该文件 production 仍只保留 Aster `Session` / metadata compat 边界，测试不再引导新增 Aster runtime snapshot 依赖。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `request_tool_policy/auto_compaction_projection.rs` 与 `session_store_message_projection.rs` 加入 无 Aster 直接依赖文件守卫，并新增 `session_store_subagent_context 不得重新引入 Aster runtime snapshot 测试 helper` 守卫。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::|SessionRuntimeSnapshot|ThreadRuntimeSnapshot|TurnRuntime|ItemRuntimePayload| TurnStatus," "lime-rs/crates/agent/src/request_tool_policy/auto_compaction_projection.rs" "lime-rs/crates/agent/src/session_store_message_projection.rs" "lime-rs/crates/agent/src/session_store_subagent_context.rs"` 只剩 `session_store_subagent_context.rs` 的 Aster `Session` metadata compat import，无 Aster runtime snapshot/message DTO 回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，57 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_runtime_projection --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test protocol_fact_source_guard` 通过，1 test passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，12 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过：485 lib tests、27 legacy permission surface tests、1 protocol guard passed，1 live test ignored，0 doctests。
- `verified`：Aster direct Cargo dependency 仍只剩 `lime-rs/Cargo.toml` 根 workspace 与 `lime-rs/crates/agent/Cargo.toml`；`server` / `scheduler` / `app-server` / `services` source scan 仍为 0；本批已迁文件 `auto_compaction_projection` / `session_store_message_projection` / `protocol_projection` / `protocol_context_projection` / `runtime_projection_snapshot` Aster 文本扫描为 0。
- `risk`：`aster_runtime_projection.rs` 继续作为集中 Aster adapter 变厚，后续退出条件是按 event/message、runtime snapshot、provider/tool payload 拆成更小 adapter 子模块，避免从 `event_converter` 搬出后又形成新的巨型壳。
- `next`：继续迁 `request_tool_policy` 剩余 direct Aster execution/session/message API，或先拆 `aster_runtime_projection` / `event_converter` 的 message content、provider trace、MCP notification adapter，目标是让 Aster 只剩 execution adapter 与可删除 vendor 残留。

## 2026-07-04 进度记录：session todo projection current DTO 收口

- `completed`：`session_store_todo_projection` 从 Aster `resolve_task_board_state` / `TaskBoardItem` / `TaskBoardItemStatus` 中拆出，改为只消费 Lime-owned `SessionTaskBoardItemProjection` / `SessionTaskBoardStatusProjection`，成为纯 Session todo 展示投影。
- `completed`：新增 `session_store_todo_aster_adapter`，把 Aster task board extension data 解析、状态映射和 `LimeSessionStore::load_extension_data_from_conn` 读取限制在 compat adapter；`session_store.rs` 只从 adapter 读取 todo items，不再让 projection owner 直接 import Aster。
- `completed`：`session_store_tests` 新增 `project_session_todo_items_should_map_current_task_board_projection`，覆盖 current projection 对空 subject 过滤、状态映射和 `active_form` 保留语义。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `session_store_todo_projection.rs` 加入 已迁出 direct Aster dependency 的文件，禁止该 current projection owner 重新出现 Aster import / dependency 文本。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，58 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，12 tests passed。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::|resolve_task_board_state|TaskBoardItem|TaskBoardItemStatus" "lime-rs/crates/agent/src/session_store_todo_projection.rs"` 无 Aster 命中，仅 `SessionTaskBoardItemProjection` 自有命名包含 `TaskBoardItem` 子串。
- `next`：继续处理 `tool_io_offload` 或其它小型 current/projection 文件；若进入 `tool_io_offload`，优先把纯工具 I/O 策略迁到 `tool-runtime`，避免在 800+ 行 agent 文件里继续追加业务逻辑。

## 2026-07-04 进度记录：tool I/O 策略迁入 tool-runtime

- `completed`：新增 `tool_runtime::tool_io` 作为 Tool I/O token 估算、payload stats、offload decision、preview、payload envelope 与 history eviction planning 的 current 策略 owner；`lime-agent::tool_io_offload` 不再从 Aster `context::tool_io` 读取这些纯策略函数 / DTO。
- `completed`：`agent-protocol::model_context` 增加有序 `resolve_model_context_window` / `resolve_model_context_window_or`，承接 `gpt-4.1`、`gpt-5.2`、`gemini`、`qwen`、`grok` 等模型 context window pattern；`tool-runtime` 复用该协议事实源，避免从 Aster `ModelConfig` 读取模型 context limit。
- `completed`：`lime-agent` 增加 `tool-runtime.workspace = true`，`tool_io_offload.rs` 只保留 Lime offload 文件路径、metadata、session message 适配和 env override；Aster 依赖面继续收缩在 `lime-agent` 其它 runtime adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `tool_io_offload.rs` 加入 已迁出 direct Aster dependency 的文件；`tool-runtime` 仍由 current runtime crate 守卫覆盖，禁止新增 Aster import / dependency 文本。
- `risk`：`tool_io_offload.rs` 仍为 800+ 行文件，本批只替换策略 owner 和 import，没有追加新业务逻辑。后续退出条件：继续把 offload storage / metadata envelope / history message adapter 拆到更小模块或下沉到 `tool-runtime`，让 `lime-agent` 只做 runtime 调用方接线。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol model_context --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_io --lib` 通过，10 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_io_offload --lib` 通过，5 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，12 tests passed。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::|package = \"aster-core\"|aster\\.workspace|aster-models\\.workspace" "lime-rs/crates/tool-runtime" "lime-rs/crates/agent/src/tool_io_offload.rs" "lime-rs/crates/agent-protocol/src/model_context.rs"` 无命中。
- `verified`：Aster direct Cargo dependency 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0。
- `next`：继续把 `tool_io_offload` 的 offload storage / metadata 边界下沉，或转入 `provider_safety` / `credential_bridge` 前先拆巨型文件；主线仍是让 Aster 只剩 execution adapter 与可删除 vendor 残留。

## 2026-07-04 进度记录：provider safety 纯策略迁入 model-provider

- `completed`：新增 `model_provider::safety` 作为 Provider 安全策略 current owner，承接工具消息链归一化、fast model 禁用策略和 provider 文本安全截断；该模块只使用 Lime-owned projection DTO，不依赖 Aster message / provider 类型。
- `completed`：`lime-agent::provider_safety` 改为 Aster adapter + Provider trait wrapper：先把 Aster `Message` / `MessageContent` 投影为 `ProviderToolMessageProjection`，再按 `model-provider` 返回的 content index plan 过滤原消息。Aster provider trait、`ModelConfig` 和 session name generation 仍留在该 compat adapter 内。
- `completed`：`lime-agent` 增加 `model-provider.workspace = true`，`Cargo.lock` 同步记录 `lime-agent -> model-provider` 依赖；此前 tool I/O 批次引入的 `lime-agent -> tool-runtime` 与 `tool-runtime` 运行依赖锁文件变更继续保留。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 provider safety 回流守卫，禁止 `provider_safety.rs` 重新调用 `aster::utils::safe_truncate`；`model-provider` 继续由 current runtime crate 守卫覆盖，禁止新增 Aster import / dependency 文本。
- `risk`：`provider_safety.rs` 仍需要实现 Aster `Provider` trait，因此不能加入 已迁出 direct Aster dependency 的文件。本批只迁出纯策略 owner，不宣称 provider adapter 已完成最终退场。退出条件：后续由 Lime-owned provider trait / request DTO 取代 Aster `Provider` trait 后，再删除该 adapter 与 `lime-agent` 的 direct Aster dependency。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety --lib` 通过，8 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_safety --lib` 通过，11 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，13 tests passed。
- `verified`：`rg -n "aster\\.workspace|aster-models\\.workspace|package = \"aster-core\"" "lime-rs/Cargo.toml" "lime-rs/crates" --glob "Cargo.toml"` 仍只命中根 workspace Aster dependency 与 `lime-agent`；`server` / `scheduler` / `app-server` / `services` 源码 Aster import 扫描为 0。
- `verified`：`rg -n "aster::utils::safe_truncate|safe_truncate" "lime-rs/crates/agent/src/provider_safety.rs" "lime-rs/crates/model-provider/src/safety.rs"` 无命中；`safe_truncate` 命名不再从 Aster 泄露到 provider safety 边界。
- `next`：继续 Phase 4，优先把 `event_converter` / `aster_runtime_projection` 的 provider trace、message content 或 MCP notification adapter 拆成更小 compat 子模块；暂不碰 `credential_bridge.rs`，除非先拆分 1000+ 行文件风险。

## 2026-07-04 进度记录：subagent cascade 树逻辑迁入 thread-store

- `completed`：新增 `thread_store::subagent_tree`，用 Lime-owned `SubagentSessionTreeNode` 承接 subagent cascade session id 的 BFS 遍历和 sibling 输入顺序保留语义；该模块不依赖 Aster session / metadata。
- `completed`：`lime-agent::session_query` 不再委托 Aster `collect_subagent_cascade_session_ids` helper，改为把 Aster `Session` 通过 `query_subagent_parent_session_id` 投影成 `SubagentSessionTreeNode` 后调用 `thread-store` current projection。Aster 查询函数仍留在该文件作为 compat adapter。
- `completed`：`lime-agent` 增加 `thread-store.workspace = true`，`Cargo.lock` 同步记录 `lime-agent -> thread-store` 依赖。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 session query cascade 回流守卫，禁止 `session_query.rs` 重新使用 Aster cascade helper；`thread-store` 继续由 current runtime crate 守卫覆盖，禁止新增 Aster import / dependency 文本。
- `risk`：`session_query.rs` 仍返回 Aster `Session` 并调用 Aster query API，因此不能加入 已迁出 direct Aster dependency 的文件。本批只迁出可复用树投影逻辑，退出条件是后续由 `thread-store` repository / session DTO 接管读取面后，再删除 Aster query adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store subagent_tree --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_query --lib` 编译通过，过滤后 0 tests；行为覆盖迁到 `thread-store::subagent_tree`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，14 tests passed。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::" "lime-rs/crates/thread-store" "lime-rs/crates/agent/src/session_query.rs" --glob "*.rs"` 只剩 `session_query.rs` 顶部 Aster query adapter import；`thread-store` 无 Aster 命中。
- `verified`：Aster direct Cargo dependency 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`。
- `next`：继续 Phase 3 / Phase 4，优先把 `session_query` 读取面下沉到 `thread-store` repository，或继续从 `event_converter` / `aster_runtime_projection` 拆出 message content / provider trace adapter，避免继续扩大巨型文件。

## 2026-07-04 进度记录：Ask schema / response 逻辑迁入 agent-runtime

- `completed`：新增 `agent_runtime::ask`，用 Lime-owned `AskRequest` / `AskQuestion` / `AskOption` 承接 ask-user schema 构造、`x-lime-ask-user-questions` rich metadata 写入、答案字段匹配和 option label -> value 归一化。
- `completed`：`lime-agent::ask_bridge` 不再承接 schema / response 纯逻辑；该文件现在只保留 Aster `AskCallback`、`ActionRequiredScope` / task-local session scope 解析，以及 Aster ask DTO -> `agent-runtime` ask DTO 的 adapter。
- `completed`：`lime-agent` 增加 `agent-runtime.workspace = true`，`Cargo.lock` 同步记录 `lime-agent -> agent-runtime` 依赖。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 ask bridge 回流守卫，禁止 `ask_bridge.rs` 重新定义 `build_question_schema` / `collect_answers` / `normalize_answer_value` 等纯逻辑；`agent-runtime` 继续由 current runtime crate 守卫覆盖，禁止新增 Aster import / dependency 文本。
- `risk`：`ask_bridge.rs` 仍必须接入 Aster `AskCallback` 和 Aster task-local scope，因此不能加入 已迁出 direct Aster dependency 的文件。本批只迁出 ask current DTO / schema / response owner，退出条件是后续由 Lime-owned tool/runtime callback 取代 Aster `AskCallback` 后删除该 adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime ask --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent ask_bridge --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，15 tests passed。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::|fn build_question_schema|fn collect_answers|fn normalize_answer_value" "lime-rs/crates/agent-runtime" "lime-rs/crates/agent/src/ask_bridge.rs" --glob "*.rs"` 显示 Aster 只剩 `ask_bridge.rs` 的 callback/scope adapter 与测试 fixture；schema / response 纯逻辑只在 `agent-runtime`。
- `next`：继续 Phase 4，把 `event_converter` / `aster_runtime_projection` 中的 provider trace、message content 或 MCP notification adapter 拆出为更小 compat 子模块；不要继续向 1000+ 行 `event_converter.rs` 追加业务逻辑。

## 2026-07-04 进度记录：ProviderTraceStage DTO 迁入 agent-protocol

- `completed`：新增 `agent_protocol::provider_trace::ProviderTraceStage`，承接 provider trace stage 的 public wire DTO 和 snake_case serde contract；`lime-agent::protocol::AgentProviderTraceStage` 改为该 DTO 的 type alias。
- `completed`：`event_converter` 的 provider trace stage 映射改为 Aster `ProviderTraceStage` -> `agent-protocol` current DTO；不再在大文件里直接把 Aster enum 变体映射到 `lime-agent` 自有 enum。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 provider trace stage 回流守卫，禁止 `event_converter.rs` 重新出现 `aster::agents::ProviderTraceStage::` 这类直接 Aster enum 路径匹配；`agent-protocol` 仍由 current runtime crate 守卫覆盖，禁止新增 Aster import / dependency 文本。
- `risk`：`event_converter.rs` 仍是 1000+ 行 compat 大文件，并继续包含 Aster `AgentEvent` / `Message` / session runtime adapter。该批只迁出 provider trace stage DTO owner，退出条件是继续把 provider trace event、message content、MCP notification 等 adapter 拆成更小模块，最终由 Lime runtime event builder 替代。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package agent-runtime --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol provider_trace --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，16 tests passed。
- `verified`：`rg -n "aster::agents::ProviderTraceStage::|use aster::|aster::" "lime-rs/crates/agent-protocol/src/provider_trace.rs" "lime-rs/crates/agent/src/event_converter.rs" --glob "*.rs"` 显示 `agent-protocol` 无 Aster 命中，`event_converter` 剩余 Aster 命中集中在事件/message/session adapter 和测试 fixture。
- `next`：继续拆 `event_converter`：优先选择 message content 或 MCP notification 这类可形成独立 adapter 子模块的切片，避免让 3000 行文件继续成为 current DTO owner。

## 2026-07-04 进度记录：MCP notification 投影迁入 tool-runtime

- `completed`：新增 `tool_runtime::mcp_notification`，用 Lime-owned `McpNotificationProjection` / `ToolNotificationProgressProjection` 承接 `rmcp::model::ServerNotification -> tool stream projection` 的纯逻辑，包括 progress、logging、cancelled、resource/tool/prompt list changed、custom notification 以及 process metadata 保留。
- `completed`：`event_converter` 删除 MCP notification 文本截断、metadata merge、custom text extraction 等内联逻辑；现在只把 `tool-runtime` projection 薄映射成 `TauriAgentEvent::ToolProgress` / `ToolOutputDelta`。
- `completed`：`tool-runtime` 增加 `rmcp.workspace = true`，这是 current tool boundary 对 MCP wire DTO 的依赖；`tool-runtime` 仍不依赖 Aster。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `tool-runtime/src/mcp_notification.rs` 纳入 已迁出 direct Aster dependency 的文件，并新增 `event_converter 不得重新承接 MCP notification 纯投影逻辑` 守卫，禁止 `MCP_LOG_PROCESS_METADATA_KEYS`、`truncate_notification_text`、metadata helper 等逻辑回流。
- `risk`：`event_converter.rs` 仍超过 `1000` 行，本批把约 300 行 MCP 纯投影挪出，但 `MessageContent`、tool result extraction、action required 和 runtime item adapter 仍在该 compat 大文件中。退出条件：继续把 tool result / message content / action scope 投影拆到 `tool-runtime` / `agent-runtime` / `agent-protocol`，直到 `event_converter` 只剩 Aster event 分发 adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime mcp_notification --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，34 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，17 tests passed。
- `verified`：`rg -n "const MCP_LOG_PROCESS_METADATA_KEYS|fn truncate_notification_text|fn metadata_with_kind|fn value_to_notification_text|fn maybe_text_from_custom_notification_params|fn merge_mcp_log_process_metadata|ServerNotification::" "lime-rs/crates/agent/src/event_converter.rs"` 只剩测试 fixture 的 `ServerNotification::...` 构造；production MCP projection helper 已迁出。
- `verified`：Aster direct Cargo dependency 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`server` / `scheduler` / `app-server` / `services` source scan 仍为 0；五个 current runtime crate Aster scan 为 0。
- `next`：继续拆 `event_converter` 的 tool result extraction / image / structuredContent 纯逻辑到 `tool-runtime`，再转入 `MessageContent` / `ActionRequiredScope` projection。

## 2026-07-04 进度记录：tool result extraction 迁入 tool-runtime

- `completed`：新增 `tool_runtime::tool_result`，用 Lime-owned `ToolResultImageProjection` / `ExtractedToolResult` / `ToolResultDiagnostics` 承接工具结果文本提取、递归深度限制、输出截断、HTML 噪声过滤、data URL / MCP image content 图片提取、metadata 与 `structuredContent` 提取。
- `completed`：`event_converter` 删除本地 `TextCollectState`、JSON traversal、图片解析、HTML filter、metadata / structured content 提取等纯逻辑；现在只读取 `lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()` 并传给 `tool-runtime`，再把 `ToolResultImageProjection` 映射为 GUI `AgentToolImage`。
- `completed`：工具结果解析测试从 `event_converter` 迁到 `tool-runtime`，保留 `event_converter` 的 message/tool_end structuredContent 与 legacy compat metadata 回归。`event_converter` 定向测试从 34 个降到 23 个，不再重复证明 tool result parser。
- `completed`：`tool-runtime` 增加 `regex.workspace = true`，用于保留原 HTML 噪声过滤语义；没有引入 `lime-core`，避免 current tool crate 反向依赖应用配置。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `tool-runtime/src/tool_result.rs` 纳入 已迁出 direct Aster dependency 的文件，并新增 `event_converter 不得重新承接 tool result extraction 纯逻辑` 守卫，禁止 JSON recursion、图片解析、HTML filter 等 helper 回流。
- `risk`：`event_converter.rs` 仍超过 `1000` 行，但本批将其从 2747 行继续降到 2036 行。剩余 Aster 面主要是 `AgentEvent` / `MessageContent` / `ActionRequiredScope` / runtime item adapter 与测试 fixture；退出条件是继续把 message content 与 action scope 投影拆到 `agent-protocol` / `agent-runtime` 或小 adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_result --lib` 通过，11 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，23 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，18 tests passed。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::|package = \"aster-core\"|aster\\.workspace|aster-models\\.workspace" "lime-rs/crates/tool-runtime" --glob "*.rs" --glob "Cargo.toml"` 无命中；`event_converter` 剩余 Aster 命中集中在 compat adapter 与测试 fixture。
- `next`：继续拆 `event_converter` 的 `ActionRequiredScope` / `ActionRequiredData` projection 到 `agent-runtime` 或 `agent-protocol`，再处理 `MessageContent` 的 Aster adapter 入口。

## 2026-07-04 进度记录：ActionRequired projection 迁入 agent-protocol

- `completed`：新增 `agent_protocol::action_required`，用 Lime-owned `ActionRequiredScope` / `ActionRequiredProjection` 承接 action type、scope 过滤和 public payload JSON 构造；`lime-agent::protocol::AgentActionRequiredScope` 改为 type alias，不再在 `lime-agent` public protocol 中重复定义 scope DTO。
- `completed`：`event_converter` 中 Aster `ActionRequiredData` / `ActionRequiredScope` 只保留在 `project_aster_action_required_*` adapter 边界；event/message 的 `elicitation_response` data 形状已显式拆开：event action 继续输出 `{ "user_data": ... }`，message content 继续直接输出 `user_data`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `agent-protocol/src/action_required.rs` 纳入 已迁出 direct Aster dependency 的文件，并新增 `event_converter 不得重新承接 ActionRequired public payload 纯投影逻辑` 守卫，禁止 scope 过滤、action type 和 payload JSON helper 回流。
- `risk`：`event_converter.rs` 仍超过 `1000` 行，本批只迁出 ActionRequired public projection，没有继续在巨型 compat adapter 中追加业务逻辑。剩余风险集中在 `MessageContent` adapter、runtime item adapter 与测试 fixture。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package lime-agent -- --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol action_required --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，23 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，`dev` profile 完成耗时 15m57s。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，19 tests passed。
- `next`：继续拆 `event_converter` 的 `MessageContent` adapter，或把 `aster_state` / `ask_bridge` 的 ActionRequired scope 双向 adapter 收到更小边界；目标仍是移除 `lime-agent` direct Aster dependency。

## 2026-07-04 进度记录：MessageContent adapter 下沉

- `completed`：新增 `lime-agent::message_content_adapter` 作为 Aster `MessageContent` 的唯一 compat 边界，承接 Aster message -> runtime message DTO、message event、tool response legacy compat metadata、tool result image 映射、ActionRequired message/event 投影和 execution error 文本增强。
- `completed`：`event_converter` 的 `AgentEvent::Message` 分支改为直接委托 `message_content_adapter::convert_aster_message_to_events(...)`；`aster_runtime_projection::project_aster_message(...)` 改为直接调用 `message_content_adapter::convert_aster_message_to_runtime_message(...)`，不再通过 `event_converter::convert_to_tauri_message` 旧 wrapper。
- `completed`：删除 `event_converter` 里的 `convert_message` / `convert_to_tauri_message` / `convert_message_content` wrapper 名称和 MessageContent 分支实现；`event_converter.rs` 从约 `2036` 行降到约 `1634` 行，继续朝“只做 Aster event 分发 adapter”收缩。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `event_converter production 不得重新承接 MessageContent adapter` 守卫，禁止 `MessageContent::*` 分支、旧转换函数名、tool result offload helper 和 diagnostics 类型回流到 `event_converter` production。
- `risk`：`message_content_adapter` 仍是 `compat`，直接依赖 Aster `MessageContent`；这是本阶段允许的集中边界，不是 current owner。`event_converter.rs` 仍超过 `1000` 行，剩余主风险集中在 Aster `ItemRuntime` / `TurnRuntime` timeline adapter、`AgentEvent` 分发和测试 fixture。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/event_converter.rs" "lime-rs/crates/agent/src/message_content_adapter.rs" "lime-rs/crates/agent/src/aster_runtime_projection.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，23 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，20 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`git diff --check` 覆盖本刀相关文件通过。
- `next`：继续 Phase 3 / Phase 4，优先把 `event_converter` 剩余 `TurnRuntime` / `ItemRuntime` timeline adapter 拆到更小 Aster adapter 或 `thread-store` projection 边界，再处理 `aster_state` / `ask_bridge` 的剩余 Aster scope 与 session adapter。

## 2026-07-04 进度记录：runtime timeline adapter 下沉

- `completed`：新增 `lime-agent::runtime_timeline_adapter`，集中承接 Aster `TurnRuntime` / `ItemRuntime` / `ItemRuntimePayload` -> Lime `AgentThreadTurn` / `AgentThreadItem` timeline DTO 的 compat 投影，包括 tool result 文本抽取、runtime status diagnostics metadata、request-user-input questions schema 解析和 transcript item 内部过滤。
- `completed`：`event_converter` 的 `TurnStarted` / `ItemStarted` / `ItemUpdated` / `ItemCompleted` 分支改为只委托 `runtime_timeline_adapter`；`aster_runtime_projection::project_aster_turn_runtime` / `project_aster_item_runtime` 也改为直接调用该 adapter，不再通过 `event_converter::convert_turn_runtime` / `convert_item_runtime` 旧出口。
- `completed`：删除 `event_converter` 里的 turn/item status 映射、`convert_item_payload`、request options/questions schema helper、runtime status text 格式化和 tool result text extraction helper；对应 item payload 回归迁到 `runtime_timeline_adapter` 测试。`event_converter.rs` 从约 `1634` 行降到约 `976` 行，低于仓库 `1000` 行硬边界。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `event_converter production 不得重新承接 runtime timeline adapter` 守卫，禁止 `ItemRuntimePayload::*`、`TurnRuntime` / `ItemRuntime` DTO、timeline payload helper、request schema helper 和旧 `convert_*_runtime` 函数回流到 `event_converter` production。
- `risk`：`runtime_timeline_adapter` 仍是 `compat`，直接依赖 Aster session runtime DTO；这是本阶段允许的集中边界，不是 current owner。剩余主风险转移到 `aster_runtime_projection` 的 snapshot/subagent projection、`aster_state` execution adapter 和 `aster_session_store` trait adapter。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/event_converter.rs" "lime-rs/crates/agent/src/runtime_timeline_adapter.rs" "lime-rs/crates/agent/src/aster_runtime_projection.rs" "lime-rs/crates/agent/src/lib.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，16 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib` 通过，7 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，21 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`git diff --check` 覆盖本刀相关文件通过。
- `next`：继续 Phase 3 / Phase 4，优先拆 `aster_runtime_projection` 中的 snapshot / subagent projection 或推进 `aster_session_store -> thread-store` 下沉，目标是继续缩小 `lime-agent` direct Aster dependency 面。

## 2026-07-04 进度记录：runtime snapshot / subagent adapter 拆分

- `completed`：新增 `lime-agent::runtime_snapshot_adapter`，集中承接 Aster `SessionRuntimeSnapshot` -> Lime `RuntimeTimelineSnapshotProjection` 的 compat 投影；`session_store_runtime_projection` 改为只消费 Lime timeline snapshot DTO。
- `completed`：新增 `lime-agent::session_execution_runtime_adapter`，集中承接 Aster `Session` / `SessionRuntimeSnapshot` / output schema runtime -> `SessionExecutionRuntime*Projection` 与 `AgentTokenUsage` 的 compat 投影；`session_store_runtime_detail`、`event_converter` 和 `session_execution_runtime` 测试 helper 改为直接调用该 adapter。
- `completed`：新增 `lime-agent::subagent_runtime_adapter`，集中承接 Aster subagent latest-turn / tool-count / result-ref 投影；`subagent_control` production 不再经由 `aster_runtime_projection` 读取该逻辑。
- `completed`：`aster_runtime_projection.rs` 从约 `511` 行降到 `65` 行，只保留 Aster event/message facade 与 auto-compaction message adapter，不再承接 runtime snapshot、session execution runtime 或 subagent latest-turn DTO 适配。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `aster_runtime_projection facade 不得重新承接 runtime snapshot / subagent adapter` 守卫，禁止 `SessionRuntimeSnapshot`、`TurnRuntime`、`ItemRuntimePayload`、subagent projection 类型和 snapshot/subagent helper 回流到 facade。
- `risk`：`runtime_snapshot_adapter`、`session_execution_runtime_adapter`、`subagent_runtime_adapter` 仍是 `compat`，直接依赖 Aster session runtime DTO；这是本阶段允许的集中边界，不是 current owner。`lime-agent` direct Aster dependency 仍未移除，剩余主风险集中在 `aster_session_store` trait adapter、`aster_state` execution adapter 和 `ask_bridge` callback adapter。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/aster_runtime_projection.rs" "lime-rs/crates/agent/src/runtime_snapshot_adapter.rs" "lime-rs/crates/agent/src/session_execution_runtime_adapter.rs" "lime-rs/crates/agent/src/subagent_runtime_adapter.rs" "lime-rs/crates/agent/src/lib.rs" "lime-rs/crates/agent/src/event_converter.rs" "lime-rs/crates/agent/src/session_store_runtime_projection.rs" "lime-rs/crates/agent/src/session_store_runtime_detail.rs" "lime-rs/crates/agent/src/subagent_control.rs" "lime-rs/crates/agent/src/session_execution_runtime.rs" "lime-rs/crates/agent/src/session_store_tests.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_runtime_adapter --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_runtime_snapshot_should_not_regress_aborted_turn_to_running --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_runtime_usage_fallback --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent prefers_latest_runtime_snapshot_with_output_schema_runtime --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib` 通过，16 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，22 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`aster_runtime_projection.rs` 已无 runtime snapshot / subagent DTO 命中；`git diff --check` 覆盖本刀相关文件通过。
- `next`：继续 Phase 3 / Phase 4，优先推进 `aster_session_store -> thread-store` 下沉，把 session / conversation projection DTO 与 repository trait 迁到 current store crate；并开始盘点 `aster_state` / `ask_bridge` 中仍阻止移除 `lime-agent` direct Aster dependency 的 adapter 残留。

## 2026-07-04 进度记录：session record projection 迁入 thread-store

- `completed`：新增 `thread_store::session_record` current 投影边界，承接无 Aster 直接依赖的 `SessionRecordRow` / `SessionRecordProjection`、session type name 归一化、timestamp 解析、optional text/json 解析和默认 session title/model 常量；`thread-store` 新增 `chrono` workspace dependency，但仍不依赖 Aster。
- `completed`：`lime-agent::aster_session_store` 的 `SessionListingRow`、`resolve_session_type`、`parse_timestamp_or_now`、`parse_optional_json`、`normalize_optional_text` 纯 helper 下沉到 `thread-store`；`get_session` 的 23 字段 tuple 手工解析改成 `SessionRecordRow -> SessionRecordProjection -> Aster Session` 转接。
- `completed`：`aster_session_store` 仍只作为 `compat` 的 Aster `SessionStore` trait adapter，负责 `ExtensionData` / `Recipe` / `ModelConfig` / `Conversation` 等 Aster DTO 转接，以及 current runtime conversation import；`thread-store::session_record` 是 `current`，不得引入 Aster。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `aster_session_store 不得重新承接 session record 纯投影 helper` 守卫，禁止 `SessionListingRow` 和 session record helper 回流到 `aster_session_store` production。
- `risk`：`aster_session_store.rs` 从约 `2180` 行降到约 `2000` 行，仍超过仓库 `1000` 行硬边界；本刀只完成 store record 语义下沉，后续必须继续拆 tests、search/memory stub、trait helper 或 runtime conversation adapter，退出条件是 production 文件低于 `1000` 行且不再承接 current store 语义。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/thread-store/src/session_record.rs" "lime-rs/crates/agent/src/aster_session_store.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store session_record --lib` 通过，4 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent update_session_metadata_should_roundtrip --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent list_sessions_by_types_should_query_only_requested_types --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_session_should_prefer_current_runtime_conversation_over_agent_messages --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_session_should_import_legacy_agent_messages_into_runtime_store --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent metadata_cache_should_refresh_after_add_message --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，23 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`rg` 确认 `lime-rs/crates/thread-store` 无 Aster import；`git diff --check` 覆盖本刀相关文件通过。
- `next`：继续 Phase 3 / Phase 4，优先从 `aster_session_store` 拆 tests 与 runtime/search/memory helper，或把 runtime conversation repository 边界继续下沉到 `thread-store`；不要再向 `aster_session_store.rs` production 追加新业务逻辑。

## 2026-07-04 进度记录：aster_session_store compat 主文件拆分

- `completed`：`lime-agent::aster_session_store` 继续按 compat 边界拆分，新增 `history_search`、`memory_stub`、`session_projection` 子模块，并把原内联 `#[cfg(test)] mod tests` 外置到 `aster_session_store_tests.rs`。主文件只保留 Aster `SessionStore` trait 接线、缓存、事务和 current runtime conversation import orchestration。
- `completed`：`session_projection` 只负责 `SessionRecordRow -> Aster Session` 的迁移期映射；无 Aster 直接依赖的 row 默认值与 timestamp/json/text 语义仍归属 `thread-store::session_record` current 边界。`history_search` 承接 runtime conversation 搜索与 role 文本映射；`memory_stub` 集中保留当前 disabled memory stub，不再散落在主文件。
- `completed`：`aster_session_store.rs` 从约 `2000` 行降到 `969` 行，低于仓库 `1000` 行硬边界；这是结构迁移，不新增业务能力，也不扩大 Aster dependency 面。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `aster_session_store 主文件不得吞回已拆出的 compat helper`，禁止 `runtime_message_role`、memory stub 构造、session listing projection helper、`SessionRecordProjection` / `SessionRecordRow` 回流到主文件。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `aster_session_store compat 主文件必须保持在 1000 行以内并外置测试`，防止后续继续向该 compat facade 填回内联测试或新业务逻辑。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/aster_session_store.rs" "lime-rs/crates/agent/src/aster_session_store/history_search.rs" "lime-rs/crates/agent/src/aster_session_store/memory_stub.rs" "lime-rs/crates/agent/src/aster_session_store/session_projection.rs" "lime-rs/crates/agent/src/aster_session_store_tests.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_session_store::tests --lib` 通过，14 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，25 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`。
- `verified`：`git diff --check` 覆盖本刀相关 Rust / governance / roadmap 文件通过。
- `next`：继续 Phase 3 / Phase 4，把 `runtime_conversation` repository / current thread store 持久化边界继续下沉，或拆 Aster `SessionStore` trait adapter 的剩余 DTO 转换；目标仍是移除 `lime-agent` direct Aster dependency，而不是把 Aster 类型搬到 current crate。

## 2026-07-04 进度记录：conversation transcript 纯规则迁入 thread-store

- `completed`：新增 `thread_store::conversation_transcript`，承接无 Aster 直接依赖的 conversation transcript 选择、计数、截断和稳定 transcript item id 规则；该模块只使用 Lime-owned record DTO、`serde_json::Value` 和基础枚举，不 import Aster。
- `completed`：`lime-agent::aster_session_store::runtime_conversation` 改为把 Aster `ItemRuntimePayload::{TranscriptMessage, UserMessage, AgentMessage}` 先转换成 `ConversationMessageRecord`，再委托 `thread-store` 选择 transcript vs runtime projection、计算 message count 和生成 stable transcript id。Aster DTO 的读写转换仍留在 `lime-agent` compat adapter 内。
- `completed`：治理命名口径已统一为“无 Aster 直接依赖 / direct Aster dependency migrated”，避免把“无直接依赖”误读为“Aster 已彻底删除”。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `runtime_conversation transcript 纯规则必须归属 thread-store` 守卫，要求 `conversation_transcript.rs` 存在，且禁止 transcript/projection 手工计数、选择变量和 `fn transcript_item_id` 回流到 `runtime_conversation.rs`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store conversation_transcript --lib` 通过，4 tests passed，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store --lib` 通过，15 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_session_store::tests --lib` 通过，14 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime turn_executor --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，26 tests passed。
- `verified`：Aster direct Cargo dependency scan 仍只剩根 workspace `aster = { package = "aster-core", ... }` 与 `lime-agent` 的 `aster.workspace = true`；`thread-store` / `agent-runtime` / `model-provider` 源码 Aster import 扫描为 0。
- `verified`：`rustfmt --edition 2021 --check` 与 `git diff --check` 覆盖本刀相关 Rust / governance / roadmap 文件通过。
- `note`：本轮顺手修正 `agent-runtime::turn_executor` 的 `TurnContextOverride` import 路径，因为它阻塞 `lime-agent` 定向测试编译；该改动只把 import 指向 `agent_protocol::turn_context::TurnContextOverride`，不改变 trait 语义。
- `next`：继续底部 Phase 2 priority 1，把 `aster_session_store` 的外部事实源切到 `thread-store::SessionRepository` trait；`runtime_conversation` 后续只保留 Aster runtime store DTO conversion，不能重新承接 transcript 纯规则。

## 2026-07-04 进度记录：runtime_facade public Aster re-export 守卫

- `parallel-note`：隔壁进程已将 `runtime_facade.rs` 的 `pub use aster::agents::*` / `pub use aster::tools::*` 改为内部 import；本进程不夹写该文件，只补治理守卫和验证。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 `runtime_facade 不得重新公开 Aster 类型` 守卫，禁止 `pub use aster::agents` / `pub use aster::tools` 回流；`runtime_facade` 只能公开 `AgentTurnContext` current DTO 出口，Aster tool / agent / turn context 类型只能留在内部 adapter。
- `verified`：`rg -n "pub use aster::" "lime-rs/crates/agent/src/runtime_facade.rs" "lime-rs/crates/agent/src/lib.rs"` 无命中。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "runtime_facade" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，1 test passed。
- `blocked`：全量 `asterMigrationBoundary.test.ts` 当前被并行中的 `aster_session_store.rs` 修改挡住：主文件重新出现 `SessionRecordRow`，触发既有 `aster_session_store 主文件不得吞回已拆出的 compat helper` 守卫；本进程不接管该热区。
- `blocked`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 当前被同一并行改动挡住：`LimeSessionStore` 暂未实现 Aster `SessionStore`，但 `aster_state` / `session_store` / `aster_runtime_support` 仍要求该 impl。
- `next`：`aster_session_store` owner 需要先恢复编译闭环，或把所有调用方同步切到 `thread-store::SessionRepository`；当前进程适合继续做 runtime_facade / public API 防回流守卫和只读验证，不应夹写 `aster_session_store`。

## Phase 1：盘点与边界冻结

目标：先把实际耦合面量化，冻结新增 Aster 依赖。

执行项：

- 盘点 Cargo 依赖：找出所有 `aster.workspace = true`、`aster-models.workspace = true`、`package = "aster-core"` 调用方。
- 盘点 Rust import：找出 current Lime crate 中所有 `use aster::`、`aster::`、`use aster_models::`。
- 把调用方按 `current / compat / deprecated / dead` 分类。
- 新增治理守卫：除迁移白名单外，禁止新 crate 直接依赖或 import Aster。

完成标准：

- 形成完整调用面清单。
- 守卫能在新增 Aster 依赖时失败。
- 新能力开发规则明确指向 Lime current runtime crate。

验证入口：

```bash
rg -n "aster\\.workspace|aster-models\\.workspace|package = \"aster-core\"" "lime-rs/crates" "lime-rs/Cargo.toml"
rg -n "use aster::|aster::|use aster_models::|aster_models::" "lime-rs/crates" --glob "*.rs" --glob "!aster-rust/**"
npm run test:contracts
```

## Phase 2：建立 Codex 风格一等 crate 骨架

目标：先建立 Lime 自己的 runtime owner，避免继续向 `lime-agent` 或 App Server adapter 里堆逻辑。

新增或整理 crate：

- `agent-protocol`：session / thread / turn / event / tool / action / artifact / evidence DTO。
- `model-provider`：provider route、model capability、request / response stream adapter。
- `thread-store`：会话、消息、turn、checkpoint、artifact persistence。
- `tool-runtime`：工具注册、权限、host tool、MCP bridge、执行结果。
- `agent-runtime`：turn orchestration、queue、subagent、action response、runtime event stream。

完成标准：

- App Server 能通过新 crate interface 编译期引用 runtime 抽象。
- 新 crate 不依赖 Aster。
- 旧 `lime-agent` 只作为迁移 façade 或 adapter，不再承接新职责。

验证入口：

```bash
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps
npm run test:rust:related -- lime-rs/crates/agent-protocol lime-rs/crates/agent-runtime lime-rs/crates/app-server
```

## Phase 3：迁移协议与持久化类型

目标：先把公共类型从 Aster 类型切到 Lime 自有协议，降低后续执行迁移风险。

执行项：

- 把 `core` 对 `aster-models` 的依赖迁到 Lime provider / protocol DTO。
- 把 `services/src/aster_session_store*` 迁入迁移 adapter 或拆到 `thread-store`。
- 把 Aster conversation / message / session projection 转成 Lime DTO，不再向上层暴露 Aster struct。
- 更新 App Server read model 和 evidence 只引用 Lime DTO。

完成标准：

- `core`、`services` 不再依赖 `aster` / `aster-models`。
- session / thread / message persistence 的 public API 不暴露 Aster 类型。
- 现有 read model / evidence 测试保持通过。

验证入口：

```bash
npm run test:rust:related -- lime-rs/crates/core lime-rs/crates/services lime-rs/crates/app-server
npm run test:contracts
```

## Phase 4：迁移 provider / tool / turn execution

目标：把 App Server 和其他 current crate 对 Aster provider、tool、streaming loop 的直接耦合迁到 Lime runtime crate。

执行项：

- `model-provider` 承接 provider route、model capability、请求构造和流式响应归一化。
- `tool-runtime` 承接 tool registry、权限检查、shell / file / browser / MCP / host tool execution。
- `agent-runtime` 承接 turn loop、queue、action response、subagent 与 runtime event 生成。
- App Server runtime backend 降级为 adapter：只做 request projection、JSON-RPC read model、artifact/evidence 投影。

完成标准：

- App Server production 不直接引用 Aster provider、tool、session config、turn context、streaming loop。
- Aster event converter 被 Lime runtime event builder 取代或隔离在迁移 adapter。
- `runtime_backend.rs` 不再是执行语义中心。

验证入口：

```bash
npm run test:rust:related -- lime-rs/crates/app-server lime-rs/crates/agent-runtime lime-rs/crates/tool-runtime lime-rs/crates/model-provider
npm run test:contracts
npm run verify:gui-smoke
```

## Phase 5：降级或移出 Aster vendor

目标：让目录结构表达真实状态，不再把 Aster 放在 Lime 一等 crate 区。

执行项：

- 将 `lime-rs/crates/aster-rust` 移到非 current crate 区，例如 `lime-rs/vendor/aster-rust`，或改成 pinned git dependency。
- 根 workspace 保留必要 vendor / patch 入口时，必须只给迁移 adapter 使用。
- 删除 `crates/aster-rust/Cargo.lock` 这类嵌套 workspace 独立构建状态，避免双 lockfile 语义。
- 更新治理文档和守卫白名单。

完成标准：

- `lime-rs/crates/*` 只包含 Lime current / compat crate，不包含完整外部 agent framework workspace。
- 根 workspace 无通用 Aster dependency 暴露面。
- Aster 只在迁移参考或 vendor allowlist 中出现。

验证入口：

```bash
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps
npm run governance:legacy-report
npm run test:contracts
```

## Phase 6：删除迁移 adapter

目标：完成最终收口，不再运行时依赖 Aster。

执行项：

- 删除 Aster adapter / event converter / session converter / provider converter。
- 删除 Aster Cargo dependency 和 import 白名单。
- 删除 `aster-rust` vendor 或改为纯历史 reference，不进入 build graph。
- 清理文档中把 Aster 当 current runtime 的描述。

完成标准：

- `rg` 在 current Rust 源码中找不到 Aster runtime import。
- Cargo metadata 中不存在 Aster runtime package。
- AgentRuntime GUI smoke、evidence export、replay、tool execution 主路径均通过。

验证入口：

```bash
rg -n "use aster::|aster::|aster-models|aster_models|aster-rust" "lime-rs" --glob "*.rs" --glob "Cargo.toml"
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps
npm run verify:local
npm run verify:gui-smoke
```

## 风险与约束

- 这是架构迁移，不应拆成长期双轨；每个 compat adapter 都必须有退出条件。
- 不为了降低 diff 继续保留 Aster 作为通用 workspace dependency。
- 不把 App Server adapter 扩成新的 runtime owner。
- 不恢复 `lime-rs/src/**` 或旧 Tauri command wrapper。
- 涉及文件系统、shell、权限、窗口和跨平台路径时，必须保留 macOS / Windows 双平台口径。

## 2026-07-04 进度记录：Lime-owned Trait 骨架完成（Phase 1 最终收口）

- `completed`：Phase 1 完整收口，三个核心 Lime-owned trait 已定义并通过编译验证。
- `completed`：`thread-store::SessionRepository` trait 及 Lime-owned DTO（SessionMetadata, SessionDetail, ConversationMessage, SessionListQuery）已定义在 `lime-rs/crates/thread-store/src/session_repository.rs`，包含 get_session, list_sessions, update_metadata, save_conversation, get_conversation, delete_session 核心方法，不依赖 Aster，包含 4 个单测。
- `completed`：`agent-runtime::TurnExecutor` trait 及 Lime-owned DTO（ExecuteTurnRequest, ExecuteTurnResult, QueueSubagentRequest, HandleActionRequest）已定义在 `lime-rs/crates/agent-runtime/src/turn_executor.rs`，包含 execute_turn, queue_subagent, handle_action_response 核心方法，不依赖 Aster，包含 3 个单测。
- `completed`：`model-provider::ProviderRouter` trait 及 Lime-owned DTO（ProviderRequest, ProviderResponse, StreamChunk, Message, ContentBlock）已定义在 `lime-rs/crates/model-provider/src/router.rs`，包含 route_request, stream_response, get_capability, get_context_window 核心方法，不依赖 Aster，包含 5 个单测。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p thread-store -p agent-runtime -p model-provider` 通过，三个 crate 编译无 warning。
- `verified`：`rg -n "use aster::|aster::" "lime-rs/crates/thread-store" "lime-rs/crates/agent-runtime" "lime-rs/crates/model-provider" --glob "*.rs"` 无命中，确认三个 current runtime crate 不依赖 Aster。
- `documented`：新增 `internal/roadmap/astermigration/aster-trait-skeleton-fast-track-plan.md` 快速迁移计划，明确 Phase 2 adapter 重构路径和阻塞点。
- `next`：Phase 2 adapter 重构，优先 `aster_session_store` 改为实现 `SessionRepository` trait，然后 `aster_state` + `runtime_facade` 改为实现 `TurnExecutor` trait，最后 `provider_safety` 改为实现 `ProviderRouter` trait；目标是移除 `lime-agent` 的 `aster.workspace = true` 依赖。

## 当前下一刀

Phase 1（Trait 骨架）已完成，开始 Phase 2（Adapter 重构）：

1. **优先级 1**：`aster_session_store` trait 切换
   - 改为实现 `thread-store::SessionRepository` trait
   - 保留现有 SQL 查询和 `session_projection` adapter
   - 删除 Aster `SessionStore` trait 实现
   - 预期完成后可移除 `aster_session_store` 对 Aster trait 的依赖

2. **优先级 2**：`aster_state` + `runtime_facade` trait 切换
   - 改为实现 `agent-runtime::TurnExecutor` trait
   - 保留现有 Aster execution 调用在 adapter 内部
   - 删除 `runtime_facade` 暴露的 Aster 类型公共接口
   - 预期完成后可移除 `aster_state` / `runtime_facade` 对 Aster trait 的直接暴露

3. **优先级 3**：`provider_safety` trait 切换
   - 改为实现 `model-provider::ProviderRouter` trait
   - 保留现有 Aster `Provider` 调用在 adapter 内部
   - 删除 Aster `Provider` trait 实现
   - 预期完成后可移除 `provider_safety` 对 Aster provider trait 的依赖

4. **Phase 3 门禁**：三个 adapter 完成后，移除 `lime-agent/Cargo.toml` 的 `aster.workspace = true`，验证编译和测试通过。

**避让策略**：App Server runtime backend 因 workflow 并行改动暂不触碰，Phase 2 只改 `lime-agent` 内部 trait 实现，不改 App Server 调用方。

## 2026-07-04 进度记录：Phase 2 公共 API Aster 暴露清理

- `completed`：`runtime_facade.rs` 移除公共 Aster 类型暴露，7 个 `pub use aster::*` 改为内部 `use` (+6 行注释说明)。
- `completed`：验证 App Server 不使用这些 re-export，`rg "lime_agent::(NativeToolExecutionHook|Tool|ToolContext|...)" app-server` 无命中。
- `completed`：验证公共 API 清理成功，`rg "pub use aster::" runtime_facade.rs lib.rs` 无命中。
- `verified`：`cargo check -p lime-agent --lib` 编译验证中（后台运行 b7s5puy30）。
- `strategy`：确认采用方案 A（快速收口 + optional feature gate），不采用方案 B（完整重构 45+ 文件）。
- `superseded-2026-07-05`：optional feature gate 路线已被废弃；当前事实是 `lime-agent` 仍直接依赖 Aster，必须继续清退主 turn executor / provider stream，而不是用 feature gate 假装可关闭。
- `documented`：新增 3 份策略文档：`aster-trait-skeleton-fast-track-plan.md`、`phase2-blocking-analysis.md`、`phase2-execution-summary.md`。
- `next-superseded`：等待编译验证通过后，继续 Phase 2 收口：(1) 标记 internal 模块为 compat (2) 引入 optional feature gate (3) 验证 App Server 不启用该 feature。

## 2026-07-04 进度记录：Phase 2 并行验证与阻塞边界

- `parallel-scope`：当前有隔壁进程同时处理 Phase 2，`aster_session_store.rs`、`thread-store`、`runtime_facade.rs`、`provider_safety.rs` 等均为热区；本轮不接管热区源码，只做只读验证和计划同步。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 当前通过，但 `aster_session_store_adapter.rs` / `lime_session_repository.rs` 仍有未用 import 与 dead code warning，说明骨架已能编译但尚未收口干净。
- `blocked`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 当前 23 passed / 3 failed；失败全部集中在 `aster_session_store.rs` 主文件仍保留 `SessionListingRow`、session record helper、runtime role、memory stub、session listing helper，且主文件 2456 行，未满足“主文件只做 trait adapter 接线，纯投影下沉 current crate / 子模块”的守卫。
- `current`：`thread-store::{session_record, conversation_transcript, session_repository}`、`agent-runtime::turn_executor`、`model-provider::router` 继续作为 Lime-owned current 事实源。
- `compat`：`lime-agent::aster_session_store*` 与 `AsterSessionStoreAdapter` 仍是迁移 adapter，只允许 Aster DTO / trait 转接，不应承接 session row 默认值、conversation transcript、memory stub 或 listing projection 纯逻辑。
- `next`：Phase 2 下一刀必须由持有 `aster_session_store.rs` 热区的进程完成主文件拆分：把 session record helper 下沉到 `thread-store::session_record`，把 listing / memory stub / runtime role 移到已拆子模块或 current crate，直到治理守卫 3 个失败项归零；另一进程可继续只读验证和补守卫，不夹写热区。

## 2026-07-04 进度记录：Phase 2 快速收口完成

- `completed`：`runtime_facade.rs` 公共 Aster 暴露清理完成，7 个 `pub use aster::*` 改为内部 `use`。
- `completed`：`aster_session_store.rs` 已同时实现 `SessionRepository` 和 Aster `SessionStore` trait（双重实现作为 compat）。
- `completed`：`aster_session_store_adapter.rs` 新增 compat 适配层（workflow 自动生成）。
- `verified`：`cargo check -p lime-agent --lib` 编译通过（10.17s），只有 2 个 unused import 警告。
- `verified`：公共 API 不再暴露 Aster 类型，`rg "pub use aster::" runtime_facade.rs lib.rs` 无命中。
- `strategy_confirmed`：采用方案 A（快速收口 + optional feature gate + 双重实现 compat），Phase 2 快速收口目标达成。
- `superseded-2026-07-05`：optional feature gate 与双重实现路线已被后续收口废弃；`compat-aster` 已删除，`aster_session_store_adapter.rs.bak` 已删除。
- `next-superseded`：Phase 2 后续：(1) 清理 unused import 警告 (2) 引入 optional feature gate (3) 标记 compat 文件退出条件 (4) 推进 Phase 5 vendor 降级。

## 2026-07-04 进度记录：Phase 2 快速收口复核更正

- `correction`：Phase 2 不能判定为完成。当前只能说明 `lime-agent` 编译闭环恢复；`aster_session_store.rs` 仍未满足主文件拆分和 current/compat 边界守卫。
- `verified`：本次有效 Rust 验证命令为 `CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`，结果通过但仍有 6 个 warning；后续计划记录不得使用缺少 `--manifest-path "lime-rs/Cargo.toml"` 的根目录 `cargo check -p lime-agent --lib` 作为完成证据。
- `blocked`：`src/lib/governance/asterMigrationBoundary.test.ts` 当前仍 3 项失败，且全部指向 `aster_session_store.rs`：session record helper 回流、已拆 compat helper 回流、主文件 2456 行超过 1000 行边界。
- `exit-condition`：Phase 2 priority 1 的退出条件不是“同时实现双 trait 后能编译”，而是 `LimeSessionStore` 的 current 事实源切到 `thread-store::SessionRepository`，Aster `SessionStore` 只保留在明确 adapter 内，且 `aster_session_store` 主文件通过治理守卫。
- `next-superseded`：先修复上述 3 个治理失败和 warning，再继续 optional feature gate 或 vendor 降级；否则会把未拆干净的 compat 主文件提前带入下一阶段。
- `superseded-2026-07-05`：optional feature gate 不再作为后续动作；后续只允许真实删除 / 迁移 Aster compat adapter。

## 2026-07-04 Workflow 执行完成记录

- `completed`：Workflow wq2pjs63e "Fast-track Aster migration" 完成，耗时 29.7 分钟，6 个 agent，375k tokens。
- `completed`：Trait 骨架验证：3/3 trait 已定义并编译通过（SessionRepository, TurnExecutor, ProviderRouter）。
- `completed`：Adapter 重构完成：`lime_session_repository.rs` 和 `aster_session_store_adapter.rs` 已生成。
- `discovered`：Execution adapter 调查：识别 9 个 Aster execution 调用点（agent.reply(), agent.handle_confirmation(), 等）。
- `discovered`：依赖检查：133 行 Aster import 分布在 54 个文件，当前不可移除依赖（预期结果）。
- `strategy`：Execution 迁移策略已制定：建立 `TurnExecutor` adapter 层，封装 Aster Agent 执行逻辑，不破坏现有工具策略层。
- `documented`：Workflow 生成详细迁移策略文档（Execution → TurnExecutor 映射、分层设计、退出条件）。
- `next`：Workflow 建议：Phase 2 adapter 重构分 4 个阶段（骨架、Execute Turn、Action Response、Subagent Queue），优先从 skill_execution 试点。

## 2026-07-04 进度记录：aster_session_store compat 主文件退成薄 facade

- `completed`：`aster_session_store.rs` 主文件从 `2455` 行压到 `206` 行，只保留 `LimeSessionStore` 结构、metadata cache、DB shared helper、模块接线和外置测试入口。
- `completed`：新增 `aster_session_store/aster_trait.rs`，集中承接 Aster `SessionStore` trait impl；这是 `compat` adapter，不是 current 事实源。主文件不再承接 Aster trait 大块方法，也不再内联测试。
- `completed`：主文件已委托 `session_projection`、`history_search`、`memory_stub`，`SessionRecordRow` / timestamp/json/session type 纯规则继续归属 `thread-store::session_record`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 全量通过，证明此前 3 个 `aster_session_store` 治理失败已归零：session record helper 无回流、compat helper 无回吞、主文件低于 1000 行且测试外置。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib aster_session_store` 通过，14 tests passed。
- `verified`：`rustfmt --edition 2021 --check` 覆盖 `aster_session_store.rs`、`aster_session_store/aster_trait.rs`、`history_search.rs`、`memory_stub.rs`、`session_projection.rs`。
- `current`：`thread-store::{session_record, conversation_transcript, session_repository}` 继续作为 Lime-owned store/projection 事实源。
- `compat`：`lime-agent::aster_session_store::aster_trait` 是 Aster `SessionStore` 兼容层，只允许在所有 Aster runtime 调用方迁到 `SessionRepository` / `TurnExecutor` 前存在。
- `next`：下一刀不要先做 vendor 降级；优先把 `session_store.rs::delete_session`、`session_store_todo_aster_adapter.rs`、`session_update.rs` 中不需要 Aster trait 的调用迁到 `LimeSessionRepository` / `thread-store::SessionRepository`，然后再收 `LimeSessionStore` 的 Aster trait 面。

## 2026-07-04 进度记录：session_store delete_session 迁出 Aster trait

- `completed`：`session_store.rs::delete_session` 不再实例化 `LimeSessionStore` 并调用 `aster::session::SessionStore::delete_session`，改为直接通过 `lime_core::database::dao::agent::AgentDao::delete_session` 删除 `agent_sessions` 记录。
- `completed`：`session_store.rs` 移除对 `crate::aster_session_store::LimeSessionStore` 的依赖；该文件的删除会话路径不再需要 Aster `SessionStore` compat 层。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `session_store delete_session 不得回流到 Aster SessionStore trait` 守卫，禁止重新出现 `aster::session::SessionStore::delete_session` 和 `LimeSessionStore::new(db.clone())`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，27 tests passed。
- `blocked`：Rust 定向验证当前被并行 Phase 5 vendor 移动挡住：`lime-rs/vendor/aster-rust/crates/aster/Cargo.toml` 使用 `description.workspace = true`，但 `lime-rs/Cargo.toml` 的 `[workspace.package]` 当前没有 `description`。该阻塞属于 vendor 移动写集，不归因于 `session_store.rs::delete_session`。
- `current`：删除会话记录的事实源继续向 `lime_core::database::dao::agent::AgentDao` / 后续 `SessionRepository` 收敛。
- `compat`：`aster_session_store::aster_trait` 仍服务 Aster runtime 注入，不再服务 `session_store.rs::delete_session`。
- `next`：等 vendor 写集恢复 Cargo manifest 后，补跑 `CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 和 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_store`；随后继续迁 `session_store_todo_aster_adapter.rs` / `session_update.rs` 中不需要 Aster trait 的持久化调用。

## 2026-07-04 进度记录：Phase 5 vendor manifest 恢复

- `completed`：`lime-rs/crates/aster-rust` 已移动到 `lime-rs/vendor/aster-rust`，Aster 从 Lime current crate 区降级为 vendor dependency。
- `completed`：`lime-rs/Cargo.toml` 已将 `vendor/aster-rust` 加入 root workspace `exclude`，避免 vendored Aster 继承 Lime root workspace metadata；`aster` workspace dependency 指向 `vendor/aster-rust/crates/aster`。
- `completed`：`lime-rs/vendor/aster-rust/crates/aster/Cargo.toml` 的 `document-preview` path 修正为 `../../../../crates/document-preview`，解除移动后错误指向 `lime-rs/vendor/document-preview` 的 manifest 断点。
- `verified`：`cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps` 通过，root workspace 可解析 vendored Aster，但 `vendor/aster-rust` 不进入 workspace members。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，用时 7m47s；此前 Phase 2 Rust 验证阻塞已解除。
- `not-run`：本轮未跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_store`，因为只接管 Phase 5 vendor path 写集，`session_store` / Phase 2 代码热区仍在并行进程范围内。
- `current`：`lime-rs/crates/**` 继续作为 Lime-owned runtime / repository / protocol 事实源。
- `compat`：`lime-rs/vendor/aster-rust` 与 `aster_session_store::aster_trait` 仍是迁移期 Aster 兼容面，只允许现有 adapter 使用；Phase 6 退出条件是删除 compat adapter 后移除 vendor dependency。
- `next`：回到 Phase 2 主链，继续把 `session_store_todo_aster_adapter.rs` / `session_update.rs` 中不需要 Aster trait 的持久化调用迁到 `thread-store::SessionRepository` / `lime_core::database::agent_session_repository`。

## 2026-07-04 进度记录：direct_text_generation usage fallback 迁到 SessionRepository

- `completed`：新增 `run_direct_text_generation_with_db`，App Server 的 image presentation 与 host-managed generation 调用点已传入 runtime DB；usage fallback 优先通过 `LimeSessionRepository` / `thread-store::SessionRepository::get_session` 读取 token stats。
- `completed`：旧 `run_direct_text_generation` 保留为无 DB compat API，只在没有 repository 边界的旧调用方回退 Aster `session_store()` / `query_session`；App Server current 调用点不再使用该 compat fallback。
- `completed`：`HostManagedGenerationRunRequest` 增加 `db` 引用，避免 host-managed generation 在 agent 内部重新找全局数据库或直接依赖 Aster session query。
- `completed`：`runtime_facade` 恢复 App Server native tool bridge 所需的显式 compat allowlist（`Tool` / `ToolContext` / `ToolResult` / `NativeToolExecutionHook` 等逐项 `pub use`），并收紧守卫禁止恢复 Aster module-level / wildcard re-export。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent direct_text_generation --lib` 通过，4 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `direct_text_generation current 调用点不得使用无 DB compat fallback`，禁止 App Server / host-managed generation 回退到无 DB `run_direct_text_generation`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，29 tests passed。
- `current`：direct text generation 的 persisted usage 事实源继续向 `thread-store::SessionRepository` 收敛。
- `compat`：`runtime_facade` 的 Aster tool/native hook 类型 re-export 仍是 App Server native tool bridge 过渡面，只允许显式 allowlist；Phase 6 退出条件是 native tool bridge 拥有 Lime-owned tool trait 后删除这些 re-export。
- `next`：继续 Phase 2，优先迁 `session_query.rs` / `session_update.rs` / `session_store_todo_aster_adapter.rs` 中不需要 Aster trait 的持久化调用。

## 2026-07-04 进度记录：session_update compaction token 写回迁到 current repository

- `completed`：`lime_core::database::agent_session_repository` 新增 `SessionTokenStatsUpdate` 与 `update_session_token_stats(...)`，用 current `agent_sessions` 表作为 compaction token 统计写回事实源；`None` 字段通过 SQL `COALESCE` 保留旧值，`schedule_id` 空白值归一为空。
- `completed`：`lime-agent::session_update::persist_compaction_session_metrics_update` 不再调用 Aster `apply_session_update` builder 链，改为接收 `DbConnection` 并委托 `agent_session_repository::update_session_token_stats`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `session_update compaction token 写回必须走 current repository`，禁止 compaction token 写回回流到 Aster `apply_session_update` / token builder 链。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `Aster vendor dependency 只能停留在 vendor compat 路径`，封住 `lime-rs/crates/aster-rust` 回流到 current crate 区。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core update_session_token_stats --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，31 tests passed。
- `current`：compaction session metrics 写回事实源是 `lime_core::database::agent_session_repository`。
- `compat`：`session_update.rs` 仍保留 extension data、subagent session 创建、conversation 替换等 Aster session compat 操作；这些不能继续扩展新业务逻辑。
- `next`：继续把 `session_update.rs` 剩余 session mutation API 拆到 Lime-owned repository / runtime owner，完成后再把该文件加入 direct Aster dependency migrated file 守卫。

## 2026-07-04 进度记录：provider route protocol 映射接入 ModelProviderProtocol

- `completed`：`model-provider::ModelProviderProtocol` 增加 `uses_responses_api()`，作为 provider protocol current DTO 的最小行为入口。
- `completed`：`lime-agent::provider_configuration` 的 App Server `ProtocolKind` 映射先投影到 `ModelProviderProtocol`，再在本文件的 compat 边界转换成 runtime provider protocol；避免 `ProtocolKind -> runtime provider protocol` 继续作为纯业务映射事实源。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `provider_configuration route protocol mapping 必须经由 model-provider DTO`，禁止 provider route protocol 直接映射回 Aster provider protocol。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib` 通过，13 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，32 tests passed。
- `current`：provider protocol 纯语义继续向 `model-provider` 收敛。
- `compat`：runtime provider protocol 仍服务 `credential_bridge` / `aster_state` / Aster provider 创建，暂时不是 dead；退出条件是 provider factory 与 continuation capability 迁到 `model-provider` / `agent-runtime` 后删除。
- `next`：provider 组下一刀应迁 `provider_continuation_state` 的 capability 判定到 `ModelProviderProtocol`，再逐步收 `credential_bridge` 中 runtime provider config / provider factory。

## 2026-07-04 进度记录：provider continuation capability 判定接入 ModelProviderProtocol

- `completed`：`provider_continuation_state` 新增 `resolve_provider_continuation_capability_for_model_protocol(...)`，remote continuation capability 的业务判定改为基于 `model-provider::ModelProviderProtocol`。
- `completed`：旧 `resolve_provider_continuation_capability(Option<runtime provider protocol>)` 保留为 compat wrapper，只负责把 runtime protocol 投影到 `ModelProviderProtocol` 后委托 current helper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `provider_continuation_state capability 判定必须经由 model-provider DTO`，禁止重新直接基于 runtime provider protocol 做业务判定。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_continuation_state --lib` 通过，6 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib` 通过，13 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，33 tests passed。
- `current`：provider continuation capability 继续向 `model-provider` protocol DTO 收敛。
- `compat`：runtime provider protocol 仍作为 `ProviderConfig` 的迁移期字段存在；下一步要把 `ProviderConfig` 本身拆出 Aster 命名，或把 Aster-specific 字段限制在 provider factory adapter。
- `next`：provider 组下一刀是拆 `credential_bridge`，但该文件超过 1000 行，动手前应先按 provider config DTO / env var projection / Aster factory adapter 拆模块，避免继续膨胀巨型 compat 文件。

## 2026-07-04 进度记录：credential_bridge compat 主文件拆分

- `completed`：`credential_bridge.rs` 从约 1140 行降到 644 行，低于 800 行预警线；主文件只保留 credential selection、usage/health 标记和公开 API 接线。
- `completed`：新增 `credential_bridge/provider_config.rs`，承接 provider protocol / config DTO，并由主文件维持 public re-export，避免破坏 `aster_state` / `provider_configuration` / `subagent_scheduler` 调用方。
- `completed`：新增 `credential_bridge/provider_env.rs`，承接 provider env var、OpenAI tenant header、base URL 拆分和 default fast model 禁用规则。
- `completed`：新增 `credential_bridge/provider_mapping.rs`，承接 API provider type 到 Aster provider name 的 compat mapping。
- `completed`：新增 `credential_bridge/provider_factory.rs`，集中承接 runtime provider factory façade 与 Aster `ModelConfig` 构造；`credential_bridge.rs` 本身不再直接 import `aster::model` / `aster::providers::base`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 的 `credential_bridge compat 主文件必须拆出 provider config 与 env adapter` 扩展到 config/env/mapping/factory 子模块，禁止主文件重新吞回这些 helper，并要求主文件保持 1000 行以下。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，16 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，34 tests passed。
- `current`：provider protocol 语义继续向 `model-provider` 收敛；credential selection 仍走 Lime API Key Provider service。
- `compat`：Aster provider factory 仍保留在 `credential_bridge/provider_factory.rs`，退出条件是 provider factory 迁到 `model-provider` / `agent-runtime` owner 后删除。
- `next`：继续 provider 组时优先把公开 factory 入口改成不带 Aster 的 runtime provider factory，再把 `provider_env` 中 Aster-specific env projection 限制为 factory adapter 私有细节。

## 2026-07-04 进度记录：provider config/protocol DTO 去 Aster 命名

- `completed`：`lime-agent::credential_bridge::provider_config` 将公开 DTO 收口为 `RuntimeProviderConfig` / `RuntimeProviderProtocol`；`credential_bridge.rs`、`aster_state.rs`、`provider_configuration.rs`、`provider_continuation_state.rs`、`subagent_scheduler.rs` 调用方改用 runtime 命名。
- `completed`：`credential_bridge.rs` 注释更新为 runtime provider 配置语义，Aster provider 创建只在 `credential_bridge/provider_factory.rs` 作为 compat adapter 暴露。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `runtime provider DTO 命名不得回流到 Aster provider`，禁止 `AsterProviderConfig` / `AsterProviderProtocol` 等旧 DTO 名称回流到 provider current/compat 边界。
- `guarded`：provider route protocol 与 continuation capability 守卫同步到 `RuntimeProviderProtocol` 命名，继续要求业务判定先经由 `model-provider::ModelProviderProtocol`。
- `current`：provider protocol 纯语义继续向 `model-provider` 收敛；公开 provider DTO 不再使用 Aster 命名。
- `compat`：公开 factory 入口已改为 `create_runtime_provider`；私有 `create_aster_provider` 和 Aster `ModelConfig` 构造仍集中在 `credential_bridge/provider_factory.rs`，只允许作为 vendor runtime factory adapter。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，16 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_continuation_state --lib` 通过，6 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，56 tests passed。
- `verified`：`npm run test:contracts` 通过；`check-app-server-client-contract` 当前 284 checks passed。
- `verified`：`npx vitest run "src/components/agent/chat/utils/submitOpRuntimeCompaction.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，22 tests passed。
- `verified`：`rg -n "apply_session_update" "lime-rs/crates" -g "*.rs" -g "!vendor/**"` 无命中；非 vendor Rust current crate 不再直接调用 Aster `apply_session_update`。
- `risk`：验证 `appServerRuntimeBoundary` 时恢复了 `image_command/presentation.rs` 通过 `set_agent_turn_output_schema` 调用 `lime-agent` façade 的 output schema 接线；该文件当前超过 1000 行，本次只做守卫恢复，不继续追加业务逻辑。退出条件：后续按 presentation parsing / prompt construction / route selection 拆分该 App Server adapter。
- `risk`：`npm run test:related -- "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentProtocol.ts" "src/components/agent/chat/utils/submitOpRuntimeCompaction.ts"` 跑出 1688/1691 通过，3 个失败集中在聊天工作台 / session restore 既有状态机测试，不属于 provider DTO 命名边界；本批不偏航修 UI 状态机。`npm run typecheck` 运行超过 8 分钟无输出后中断，类型层以 contract + targeted Vitest 覆盖。
- `completed`：公开 `create_aster_provider` 已降为 adapter 私有入口；`aster_state`、`subagent_scheduler` 和 crate re-export 改为调用 / 导出 `create_runtime_provider`。
- `completed`：provider default fast model 纯策略迁到 `model-provider::safety::should_disable_provider_default_fast_model`；`credential_bridge/provider_env.rs` 只保留 `RuntimeProviderConfig -> ModelProviderProtocol` 投影和环境变量写入副作用。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `provider_env fast model 纯策略必须归属 model-provider`，禁止 first-party provider/base_url 判定 helper 回流到 `provider_env`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety --lib` 通过，12 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，16 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，13 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，36 tests passed。
- `next`：为 `Provider` trait 本身引入 Lime-owned owner，先定义 request/stream DTO 与 adapter 边界，再把 Aster `Provider` trait 限制为 `provider_factory` 内部实现细节。

## 2026-07-04 进度记录：subagent provider execution 切到 RuntimeProvider

- `completed`：新增 `model-provider::runtime_provider::RuntimeProvider`，作为已选 provider 的 Lime-owned 补全执行 trait；该模块复用 `model-provider::router::{ProviderRequest, ProviderResponse}` DTO，不新增一套平行请求结构。
- `completed`：`model-provider::router::ProviderResponse` 增加 `concat_text()`，把响应文本提取逻辑留在 current DTO owner 内，避免调用方重新拼 Aster message。
- `completed`：`credential_bridge/provider_factory.rs` 新增 `create_model_runtime_provider(...) -> Arc<dyn RuntimeProvider>`，用 `AsterRuntimeProviderAdapter` 把 Aster `Provider` trait、`Message` 和 `ProviderUsage` 映射到 Lime DTO。旧 `create_runtime_provider(...) -> Arc<dyn aster::Provider>` 已删除；`aster_state.update_provider(...)` 暂时改走 `pub(crate) create_aster_runtime_provider(...)` compat 入口。
- `completed`：`subagent_scheduler.rs` 不再构造 Aster `Message` 或直接调用 Aster provider `.complete(...)`；现在只构造 `ProviderRequest` 并通过 `create_model_runtime_provider` 执行。
- `completed`：公开 Aster provider factory 继续收口：旧 `create_runtime_provider(...)` 删除，改为 `credential_bridge/provider_factory.rs` 内的 `pub(crate) create_aster_runtime_provider(...)`，只允许 `aster_state.update_provider(...)` compat 注入使用；crate 根不再 re-export 返回 Aster `Provider` trait 的 factory。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `subagent provider 执行必须走 model-provider RuntimeProvider 边界`，禁止 `subagent_scheduler.rs` 回流到 Aster `Message`、Aster `Provider` trait、`create_runtime_provider` 或旧 `provider.complete(&system_prompt, ...)` 调用面。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 provider factory 守卫，禁止 `create_runtime_provider` 旧名和 `pub async fn create_aster_runtime_provider(...)` public factory 回流；只允许 `pub(crate) async fn create_aster_runtime_provider(...)` 留在 factory compat adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --all` 通过；注意 workspace 当前有大量并行脏改动，本轮只认领 provider execution 相关文件，不接管其它热区。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib` 通过，18 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，14 tests passed。第一次使用共享 `/tmp/lime-astermigration-target` 时被并行 target 写入干扰，换独立 target 后通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，37 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。第一次同命令无低并发时末段被 SIGTERM 终止，无编译错误输出；低并发重跑通过。
- `verified`：`rg -n "use aster::|aster::|aster.workspace|package = \"aster-core\"" "lime-rs/crates/model-provider" -g "*.rs" -g "Cargo.toml"` 无命中。
- `verified`：`rg -n "aster::conversation::message|aster::providers::base|dyn Provider|create_runtime_provider|Message::user\\(\\)\\.with_text|\\.complete\\(&system_prompt" "lime-rs/crates/agent/src/subagent_scheduler.rs"` 无命中。
- `verified`：`rg -n "create_runtime_provider|pub async fn create_aster_runtime_provider|pub use provider_factory::create_aster_runtime_provider|pub use provider_factory::\\{create_aster_runtime_provider" "lime-rs/crates/agent/src" "src/lib/governance/asterMigrationBoundary.test.ts" -g "*.rs" -g "*.ts"` 只剩治理 forbidden snippet 命中。
- `current`：provider request/response DTO 和 runtime provider trait 归属 `model-provider`。
- `compat`：Aster provider 创建、Aster `Message` 转换和 Aster `ProviderUsage` 映射只允许留在 `credential_bridge/provider_factory.rs`；`provider_safety.rs` 仍因 wrapper 实现 Aster `Provider` trait 保留为 compat。
- `compat`：`aster_state.rs` 仍被 Aster Agent `update_provider(...)` API 卡住，暂时通过 `pub(crate) create_aster_runtime_provider(...)` 获取 `Arc<dyn aster::Provider>`；退出条件是 Aster Agent provider 注入边界迁到 Lime-owned turn/runtime executor。
- `next`：继续 provider 组时优先收 `aster_state` / Aster Agent provider 注入边界，或把 `RuntimeProvider` 接入更上层 `agent-runtime::TurnExecutor`，最终让 `create_aster_runtime_provider(...) -> Arc<dyn aster::Provider>` 只剩零调用后删除。

## 2026-07-04 进度记录：aster_state provider 注入面拆入 compat 子模块

- `completed`：新增 `lime-agent/src/aster_state/provider_config.rs`，集中承接 `ProviderConfig`、`ProviderContinuationCapable` 实现、`configure_provider(...)`、`configure_provider_from_pool(...)`、provider health 标记与 provider configured cache 读写。
- `completed`：`aster_state.rs` 主文件从 1090 行降到 854 行，低于 1000 行硬边界；主文件只保留 Aster Agent state、初始化、tool/MCP/interrupt/session 相关编排，并通过 `pub use provider_config::ProviderConfig` 维持现有调用面。
- `completed`：`create_aster_runtime_provider(...)` 不再出现在 `aster_state.rs` 主文件，只允许留在 `aster_state/provider_config.rs` 和 `credential_bridge/provider_factory.rs` compat 边界。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `aster_state provider config / Aster 注入必须留在 compat 子模块`，要求 `aster_state/provider_config.rs` 存在并持有 provider DTO / Aster 注入方法，同时禁止这些定义回流到 `aster_state.rs` 主文件。
- `guarded`：`PROVIDER_RUNTIME_DTO_FILES` 纳入 `aster_state/provider_config.rs`，继续禁止 `AsterProviderConfig` / `AsterProviderProtocol` 等旧公开 DTO 名称回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package model-provider` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_state --lib` 通过，16 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，38 tests passed。
- `current`：provider request/response DTO 和执行 trait 仍归属 `model-provider`；`aster_state.rs` 不再承接 provider execution 业务。
- `compat`：Aster Agent `update_provider(...)` 仍需要 `Arc<dyn aster::Provider>`，因此 Aster provider 注入暂时留在 `aster_state/provider_config.rs`；退出条件是 turn/runtime executor 接管 provider 注入后，删除该 compat 子模块中的 Aster factory 调用。
- `next`：继续 provider 组时优先把 `RuntimeProvider` 接入 `agent-runtime::TurnExecutor` 或上层 Lime-owned executor，让 `AsterAgentState::configure_provider*` 只剩零调用后删除，再清空 `create_aster_runtime_provider(...)`。

## 2026-07-04 进度记录：session provider 配置调用面集中到 provider_configuration

- `completed`：`knowledge_builder_skill.rs` 不再直接调用 `AsterAgentState::configure_provider_from_pool(...)`；首选 provider 和 fallback provider 均改走 `configure_provider_for_session(...)`。
- `completed`：真实联网测试 `real_codex_tool_events.rs` 改走 `configure_provider_for_session(...)`，测试代码不再绕过 provider configuration facade 直接触碰 Aster Agent provider 注入方法。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `session provider 配置必须经由 provider_configuration facade`，扫描 `lime-agent/src` 与 `lime-agent/tests`，只允许 `provider_configuration.rs` 直接调用 `AsterAgentState::configure_provider*`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package model-provider` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent knowledge_builder_skill --lib` 通过，0 tests run / 481 filtered；用于编译验证该模块。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_codex_tool_events --no-run` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，39 tests passed。
- `current`：session provider 配置的业务入口收敛到 `provider_configuration` facade；调用方只表达 provider/model/route 需求。
- `compat`：`provider_configuration.rs` 仍委托 `AsterAgentState::configure_provider*`，因为底层 Aster Agent provider 注入尚未被 Lime-owned executor 替换。退出条件：`agent-runtime::TurnExecutor` 接管 turn provider selection 后，`provider_configuration` 改为构造 Lime-owned runtime provider / route context，不再触碰 `AsterAgentState`。
- `next`：把 `provider_configuration` 的 request DTO 继续向 `model-provider::ModelRoute` / `RuntimeProvider` owner 收敛，减少 `ProviderConfig` 作为 Aster session 注入 DTO 的外部可见面。

## 2026-07-04 进度记录：SessionProviderConfig current DTO 收口

- `completed`：新增 `lime-agent::SessionProviderConfig`，作为 session provider 配置的 current-facing DTO；它只暴露 App Server 需要的 provider/model/route/toolshim 信息，route 字段使用 `app_server_protocol::ProtocolKind`，不再把 Aster runtime protocol DTO 暴露给 App Server。
- `completed`：`provider_configuration.rs` 负责 `SessionProviderConfig -> aster_state::ProviderConfig` 的 crate 内转换；`aster_state::ProviderConfig` 和 `AsterAgentState::configure_provider*` 均降为 `pub(crate)` compat 注入面。
- `completed`：`lime_agent` 根 API 不再 re-export `aster_state::ProviderConfig`，旧 `route_protocol_from_provider_config` 改为 `route_protocol_from_session_provider_config`。
- `completed`：App Server runtime_backend 的 direct provider 配置面批量迁到 `SessionProviderConfig`：`provider_config.rs`、`request_context.rs`、`model_routing.rs`、`model_registry_metadata.rs`、`model_route_contract.rs`、`model_route_resolver.rs` 和相关测试不再消费 `lime_agent::ProviderConfig`。
- `completed`：`lime-rs/crates/agent/tests/real_web_search_policy.rs` 与 `lime-rs/crates/agent/tests/real_web_search_preflight_short_input.rs` 改走 `configure_provider_for_session(...)` 并归属 `lime-agent` package；`lime-rs/crates/agent/tests/real_codex_tool_events.rs` 已维持 façade 调用。
- `completed`：删除零引用的 `provider_configured_cache`、`get_provider_config`、`clear_provider_config`、`is_provider_configured` 和 `mark_current_unhealthy`，缩小 Aster state provider compat surface。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 session provider 配置守卫到 crate-owned `lime-rs/crates/agent/tests/**`，并新增 App Server 禁用 Aster state `ProviderConfig` public API 的守卫。
- `guarded`：`src/lib/governance/appServerRuntimeBoundary.test.ts` 更新为要求 `SessionProviderConfig` / `route_protocol_from_session_provider_config`，并同步 image presentation 当前 turn context helper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server --package model-provider` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-runtime-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_codex_tool_events --no-run` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，61 tests passed。
- `note`：原 `lime-rs/tests/*.rs` root-level WebSearch live tests 已迁到 `lime-rs/crates/agent/tests/`，`lime-rs/tests/` root orphan 目录按 `dead / forbidden-to-restore` 删除，避免 virtual workspace 根目录下的 orphan integration tests 阻断 Rust changed-scope package 映射。
- `current`：App Server 和业务/test 调用方只消费 `SessionProviderConfig` / `configure_provider_for_session` façade。
- `compat`：`provider_configuration.rs` 仍在 crate 内把 session config 转成 Aster state provider config；退出条件仍是 Lime-owned executor 接管 provider selection 和 provider injection。
- `next`：继续把 `provider_configuration` 的 provider selection/route request 投影到 `model-provider::ModelRoute` 或 `agent-runtime::TurnExecutor`，让 `AsterAgentState::configure_provider*` 归零后删除。

## 2026-07-04 进度记录：主 turn provider 注入下沉到 turn_execution

- `completed`：`lime-agent::AgentTurnExecutionRequest` 增加 `provider_configuration` 输入，`run_agent_turn_with_policy(...)` 在 executor 边界内调用 `configure_provider_for_session(...)`，并通过 `AgentTurnExecution` 返回本回合 `SessionProviderConfig` 与 stream execution 结果。
- `completed`：`app-server::RuntimeBackend::handle_turn_start` 不再在主 turn 前置调用 `configure_provider_for_route(...)`；App Server 只负责 route selection、native tool / MCP 准备、事件投影，并把 provider/model/route 请求传给 `lime-agent` executor。
- `completed`：`ProviderConfigurationRequest` 从 App Server 主 turn 调用面移出；App Server 只构造 `AgentTurnProviderConfiguration`，`turn_execution.rs` 内部再转换成 provider façade request，避免 App Server 直接消费 provider configuration DTO。
- `completed`：provider health side effect 下沉到 `lime-agent::turn_execution` completion 边界；`run_agent_turn_with_policy(...)` 在 stream 成功且未取消时调用 `mark_current_healthy(...)`，App Server 主 turn 不再直接标记 provider 健康。
- `completed`：`AgentTurnProviderConfiguration` 的 provider/model 输入收敛到 `model-provider::ModelRoute`；App Server 通过 `model_route_contract::model_route_from_runtime(...)` 把 `ResolvedModelRoute` 投影成 Lime-owned provider route，再交给 executor。`route_protocol: ProtocolKind` 暂留为 Aster façade 精确协议 compat 字段。
- `completed`：`app-server` 新增 `model-provider.workspace = true` 直接依赖，`Cargo.lock` 同步记录 `app-server -> model-provider`；同次 cargo 同步也补齐前序 `agent-runtime -> async-trait / tokio` 锁文件元数据。
- `guarded`：`src/lib/governance/appServerRuntimeBoundary.test.ts` 扩展主 turn 守卫，要求 App Server 主 turn 使用 `AgentTurnProviderConfiguration`，禁止 `runtime_backend.rs` 回流到 `ProviderConfigurationRequest`、`configure_provider_for_route(`、`mark_current_healthy(`，同时要求 `turn_execution.rs` 持有 `configure_provider_for_session(...)` 和 provider health 标记。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server --package agent-runtime` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-turn-execution-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent turn_execution --lib` 通过，0 tests run / 481 filtered；用于编译验证 `turn_execution` 新请求 / 返回结构。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-turn-execution-app-server" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_route_from_runtime_projects_lime_provider_route --lib` 通过，1 test passed。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-turn-execution-app-server" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，61 tests passed。
- `verified`：`git diff --check` 覆盖本轮认领写集与 `Cargo.lock` 通过；`rg -n "ProviderConfigurationRequest|configure_provider_for_route\\(|mark_current_healthy\\(" "lime-rs/crates/app-server/src/runtime_backend.rs"` 无命中。
- `current`：主 turn provider 配置入口继续向 `lime-agent` turn execution 边界收敛；App Server 是 JSON-RPC / route decision / event projection adapter。
- `compat`：`provider_configuration.rs` 仍委托 `AsterAgentState::configure_provider*`，这是 Aster provider 注入未完成替换前的 compat 面；退出条件是 `agent-runtime::TurnExecutor` 接管 Lime-owned provider selection / provider runtime 注入后删除该委托。
- `deferred`：`plugin_worker_generation.rs` 与 `image_command/presentation.rs` 仍可暂时通过 App Server provider adapter 配置 provider；它们属于受控文本生成旁路，不是本轮主 Agent turn 切片。下一刀再评估是否批量迁到 `host_managed_generation` / Lime-owned direct generation executor。
- `next`：批量处理 plugin worker 与 image presentation 旁路，优先把它们迁到 `host_managed_generation` / Lime-owned direct generation executor，目标是让 App Server provider adapter 只剩旁路 compat 或归零。

## 2026-07-04 进度记录：direct generation provider 注入下沉到 lime-agent

- `completed`：新增 `lime-agent::ModelRouteProviderConfiguration` current DTO，App Server 只传 `model-provider::ModelRoute`、reasoning effort、route protocol 与可选 direct provider config，不再直接构造 Aster provider configuration request。
- `completed`：`lime-agent::direct_text_generation` 接管受控文本生成 provider 配置；`DirectTextGenerationRequest` 增加 `provider_configuration`，执行前在 `lime-agent` 边界内调用 `configure_model_route_provider_for_session(...)`，并通过 `DirectTextGenerationResult.provider_config` 返回本次实际 provider/model。
- `completed`：`lime-agent::host_managed_generation` 复用 direct text generation executor；plugin worker 的每个 host-managed generation 子请求都在 executor 内配置 provider，不再由 App Server 预先调用 provider adapter。
- `completed`：App Server `plugin_worker_generation.rs` 与 `image_command/presentation.rs` 批量迁到 `model_route_contract::provider_configuration_from_runtime(...)`；两条旁路不再调用 `configure_provider_for_route(...)`。
- `completed`：`app-server::runtime_backend::provider_config.rs` 删除 `configure_provider_for_route(...)` façade；该文件只保留 runtime config metadata、database initialization 和 model effective event 投影。
- `completed`：主 turn 也改用 `provider_configuration_from_runtime(...)` 生成共享 DTO，避免主 turn 与 direct generation 分别拼 route/provider 字段。
- `guarded`：`src/lib/governance/appServerRuntimeBoundary.test.ts` 明确禁止 App Server provider adapter 出现 `ProviderConfigurationRequest` / `configure_provider_for_session` / `configure_provider_for_route`，并要求 direct generation provider 配置归属 `lime-agent`。
- `guarded`：App Server 受控文本生成守卫新增 `configure_provider_for_route(` forbidden snippet，并要求 plugin worker / image presentation 只通过 `provider_configuration_from_runtime` 传递 Lime-owned route DTO。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server --package agent-runtime` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-direct-generation-app-server" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，61 tests passed。
- `verified`：`git diff --check` 覆盖本轮认领写集通过。
- `verified`：`rg -n "configure_provider_for_route|ProviderConfigurationRequest|configure_provider_for_session" "lime-rs/crates/app-server/src" "lime-rs/crates/agent/src"` 确认 App Server production Rust 不再命中 `configure_provider_for_route` / `ProviderConfigurationRequest`；`ProviderConfigurationRequest` 只剩 `lime-agent` 内部和既有 agent 测试。
- `blocked-verification`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-direct-generation-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent direct_text_generation --lib` 在依赖编译阶段因 `/System/Volumes/Data` 剩余约 1.3GiB 触发 `No space left on device`，未到代码错误。
- `blocked-verification`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-astermigration-direct-generation-app-server" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server prepare_worker_request_injects_host_managed_generation_from_fixture_provider --lib` 同样因磁盘空间不足中断；待清理临时 target 后重跑。
- `risk`：`image_command/presentation.rs` 当前约 798 行，接近 800 行拆分预警；本轮只做最小接线，下一刀若继续触碰应优先按 route selection / prompt construction / parsing 拆分。
- `current`：受控 direct generation provider 配置入口收敛到 `lime-agent` executor；App Server 只做 JSON-RPC / route decision / event metadata adapter。
- `compat`：`provider_configuration.rs` 仍在 executor 内委托 `AsterAgentState::configure_provider*`，退出条件仍是 `agent-runtime::TurnExecutor` / `model-provider::RuntimeProvider` 接管实际 provider runtime 注入。
- `dead`：App Server `configure_provider_for_route(...)` façade 已从 production Rust 删除；后续不得恢复。
- `next`：释放临时 Cargo target 空间后重跑 direct generation 定向单测与 governance Vitest；随后继续把 `knowledge_builder_skill` / provider_configuration 内部 request DTO 收到 `ModelRouteProviderConfiguration`，减少 `ProviderConfigurationRequest` 的外部测试暴露面。

## 2026-07-04 进度记录：ProviderConfigurationRequest 内部化

- `completed`：新增 `provider_configuration_from_model_selection(...)`，用于把简单 provider/model selection 投影为 `ModelRouteProviderConfiguration`；调用方不再直接拼 `ProviderConfigurationRequest`。
- `completed`：`configure_model_route_provider_for_session(...)` 升为公开 current façade；`configure_provider_for_session(...)` 与 `ProviderConfigurationRequest` 降为 `provider_configuration.rs` 内部实现细节。
- `completed`：`knowledge_builder_skill.rs` 和真实联网测试 `real_codex_tool_events.rs` 改走 `provider_configuration_from_model_selection(...)` + `configure_model_route_provider_for_session(...)`；不再消费内部 request DTO。
- `completed`：`lime_agent` 根 API 不再 re-export `ProviderConfigurationRequest` / `configure_provider_for_session`；公开调用面只保留 `ModelRouteProviderConfiguration`、`SessionProviderConfig`、`configure_model_route_provider_for_session(...)` 和 route protocol helper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `ProviderConfigurationRequest 只能留在 provider_configuration 内部`，扫描 `lime-agent/src` 与 `lime-agent/tests`，禁止调用方重新接触内部 compat request。
- `guarded`：`ProviderConfigurationRequest` 与 `configure_provider_for_session` 加入 `lime_agent` 根 API 禁止 re-export 清单，防止 public façade 回流到旧 request 形态。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server --package agent-runtime` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent direct_text_generation --lib` 通过，4 tests passed；上一段因磁盘空间不足的 direct generation 验证已补跑完成。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server prepare_worker_request_injects_host_managed_generation_from_fixture_provider --lib` 通过，1 test passed；上一段因磁盘空间不足的 plugin worker fixture 验证已补跑完成。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，62 tests passed。
- `verified`：`git diff --check` 覆盖本轮认领写集通过。
- `verified`：`rg -n "ProviderConfigurationRequest|configure_provider_for_session" "lime-rs/crates/agent/src" "lime-rs/crates/agent/tests" "lime-rs/crates/app-server/src"` 只剩 `lime-rs/crates/agent/src/provider_configuration.rs` 命中。
- `current`：调用方统一传 `ModelRouteProviderConfiguration`，provider route DTO 继续向 `model-provider::ModelRoute` 收敛。
- `compat`：`provider_configuration.rs` 内部仍用 `ProviderConfigurationRequest` 调用 `AsterAgentState::configure_provider*`；退出条件是 `agent-runtime::TurnExecutor` / `model-provider::RuntimeProvider` 接管 provider runtime 注入。
- `dead`：`ProviderConfigurationRequest` 作为 public API 已删除；后续不得在 `lime_agent` 根 API 或调用方恢复。
- `next`：继续把 `provider_configuration.rs` 内部的 Aster provider 注入委托替换为 Lime-owned runtime provider context；下一刀优先评估 `agent-runtime::TurnExecutor` 接入 `ModelRouteProviderConfiguration`，让 `AsterAgentState::configure_provider*` 调用面继续归零。

## 2026-07-04 进度记录：provider route DTO 上移到 agent-runtime

- `completed`：`agent-runtime::turn_executor` 新增 `TurnProviderConfiguration`，持有 `model-provider::ModelRoute` 与 `reasoning_effort`；该 DTO 成为 provider route / reasoning 的 current owner。
- `completed`：`TurnProviderConfiguration::from_model_selection(...)` 承接简单 provider/model selection 到 current route DTO 的投影；`lime-agent::provider_configuration_from_model_selection(...)` 不再直接构造 `ModelRoute`。
- `completed`：`lime-agent::ModelRouteProviderConfiguration` 改为包装 `TurnProviderConfiguration`，只额外保留 Aster compat 所需的 `route_protocol` 与 `direct_provider_config`。
- `completed`：`app-server::model_route_contract::provider_configuration_from_runtime(...)` 直接构造 `TurnProviderConfiguration`，再交给 `lime-agent` compat provider configuration façade；`app-server` 新增 `agent-runtime.workspace = true` 直接依赖。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `provider route current DTO 必须归属 agent-runtime`，要求 `TurnProviderConfiguration` 存在于 `agent-runtime`，并要求 `lime-agent::provider_configuration` 只引用该 DTO。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime turn_executor --lib` 通过，5 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_route_from_runtime_projects_lime_provider_route --lib` 通过，1 test passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，63 tests passed。
- `verified`：`git diff --check` 覆盖本轮认领写集通过。
- `current`：provider route / reasoning DTO 归属 `agent-runtime`，route 细节继续使用 `model-provider::ModelRoute`。
- `compat`：`lime-agent::provider_configuration` 仍负责把 current DTO + compat 字段转换为 Aster Agent provider 注入；退出条件是 `agent-runtime::TurnExecutor` 或 `model-provider::RuntimeProvider` 接管实际 provider runtime 注入。
- `dead`：provider route / reasoning DTO 不再由 `lime-agent::provider_configuration` 自行定义。
- `next`：继续收 `lime-agent::provider_configuration` 内部 `AsterAgentState::configure_provider*` 委托；优先把 provider runtime creation/result context 接入 `agent-runtime`，让 `aster_state/provider_config.rs` 的 Aster 注入只剩最终 streaming adapter。

## 2026-07-04 进度记录：runtime provider config DTO 上移到 model-provider

- `completed`：`model-provider::runtime_provider` 新增 `RuntimeProviderProtocol` 与 `RuntimeProviderConfig`，和既有 `RuntimeProvider` trait 放在同一个 current owner。
- `completed`：`lime-agent::credential_bridge/provider_config.rs` 降为 re-export 文件，只导出 `model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol}`，不再本地定义 DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `runtime provider config DTO 必须归属 model-provider`，要求 DTO 存在于 `model-provider`，并禁止 `credential_bridge/provider_config.rs` 重新定义本地 DTO。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent --package app-server --package agent-runtime` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider runtime_provider --lib` 通过，0 tests run / 18 filtered；用于编译验证 runtime provider DTO owner。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，64 tests passed。
- `verified`：`git diff --check` 覆盖本轮认领写集通过。
- `current`：runtime provider config/protocol DTO 归属 `model-provider`；provider execution trait 与 provider config DTO 已在同一 current crate。
- `compat`：`lime-agent::credential_bridge` 仍负责 API Key Provider 选择、env var 投影和 Aster provider factory adapter；退出条件是 provider factory/env projection 迁入 current owner 或拆成更窄 vendor adapter。
- `dead`：`credential_bridge/provider_config.rs` 本地 DTO 定义已删除；后续不得恢复。
- `next`：继续收 `create_model_runtime_provider(...)` factory façade，把返回 `model-provider::RuntimeProvider` 的 provider factory owner 上移或下沉为 adapter trait 实现，减少 `lime-agent` 对 provider execution current path 的公开承载。

## 2026-07-04 进度记录：runtime provider factory public 面收窄

- `completed`：`create_model_runtime_provider(...)` 从 `lime-agent::credential_bridge` public re-export 收窄为 `pub(crate)`；crate 外不再能把 Aster-backed provider factory 当作 current API 调用。
- `completed`：`credential_bridge/provider_factory.rs` 中的 `create_model_runtime_provider(...)` 同步降为 `pub(crate)`，只服务 `lime-agent` 内部 SubAgent scheduler 迁移期 provider 执行。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 public factory 守卫改为禁止 `pub use provider_factory::create_model_runtime_provider` 与 `pub async fn create_model_runtime_provider(...)`，并要求 factory 只能作为 crate 内 compat adapter 存在。
- `current`：provider execution trait / DTO 仍以 `model-provider::runtime_provider::{RuntimeProvider, RuntimeProviderConfig, RuntimeProviderProtocol}` 为事实源。
- `compat`：Aster-backed provider 创建仍在 `lime-agent::credential_bridge::provider_factory` 内部保留，退出条件是 SubAgent 和主 turn 都切到 Lime-owned runtime provider resolver / executor 后删除该 adapter。
- `dead`：`create_model_runtime_provider(...)` 作为 `lime_agent` 根 API / crate 外公开 factory 已删除；后续不得恢复。
- `next`：继续把 SubAgent scheduler 的 provider resolver 从 `credential_bridge` 迁到 current runtime owner，目标是让 `lime-agent` 只保留 API key selection adapter，不再承载 provider execution factory。

## 2026-07-04 进度记录：SubAgent provider resolver 切到 current trait

- `completed`：`model-provider::runtime_provider` 新增 `RuntimeProviderResolver` trait；provider 执行 trait、runtime config DTO 和 resolver 抽象归属同一个 current owner，避免 `agent-runtime` 继续膨胀为杂物层。
- `completed`：`lime-agent::credential_bridge/provider_factory.rs` 新增 `CredentialRuntimeProviderResolver`，作为 Aster-backed compat resolver 实现；`create_model_runtime_provider(...)` 进一步降为模块私有 helper。
- `completed`：`LimeSubAgentExecutor` 改为持有 `Arc<dyn RuntimeProviderResolver>`，执行任务时调用 `.resolve_provider(&provider_config)`；调度器不再 import 或直接调用 `create_model_runtime_provider(...)`。
- `completed`：模块私有 helper 从 `create_model_runtime_provider(...)` 改名为 `create_aster_backed_runtime_provider(...)`，避免 Aster-backed adapter 继续占用 current 命名。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `model-provider` 提供 `RuntimeProviderResolver`，要求 SubAgent scheduler 通过 resolver trait 执行 provider，并禁止 scheduler 回流到 `create_model_runtime_provider(...)` / Aster Provider trait / Aster Message。
- `guarded`：`create_model_runtime_provider(...)` 全面进入 dead 命名清单；后续不允许以 public、crate-visible 或 private helper 形式恢复。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider runtime_provider --lib` 通过，0 tests run / 18 filtered；用于编译验证 resolver trait owner。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，14 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：SubAgent provider 执行依赖 `model-provider::RuntimeProviderResolver` + `RuntimeProvider`，调用层只组装 Lime-owned `ProviderRequest`。
- `compat`：`CredentialRuntimeProviderResolver` 内部仍通过 Aster provider adapter 创建执行器；退出条件是 API Key Provider selection / provider env projection 拆成 current resolver 实现，或 runtime provider 原生实现替换 Aster adapter。
- `dead`：SubAgent scheduler 直接调用 `create_model_runtime_provider(...)` 的路径已删除；`create_model_runtime_provider(...)` 名称本身也已从 production Rust 删除，后续不得恢复。
- `next`：继续收 `credential_bridge/provider_env.rs` 和 provider factory 的 Aster env / model config projection，把可纯化策略迁到 `model-provider`，最终让 `credential_bridge` 只剩凭证选择 adapter。

## 2026-07-04 进度记录：runtime protocol 映射归属 model-provider

- `completed`：`model-provider::RuntimeProviderProtocol` 新增 `to_model_provider_protocol()`，把 runtime provider protocol 到 `ModelProviderProtocol` 的纯映射收回 DTO owner。
- `completed`：`credential_bridge/provider_env.rs`、`provider_configuration.rs` 和 `provider_continuation_state.rs` 批量删除本地 `model_provider_protocol_from_runtime_protocol(...)` 重复 helper，统一调用 `RuntimeProviderProtocol::to_model_provider_protocol()`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `model-provider` 提供 `to_model_provider_protocol()`，并禁止 provider env / provider configuration / provider continuation 重新定义 runtime protocol 到 model-provider protocol 的本地映射 helper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider runtime_provider --lib` 通过，0 tests run / 18 filtered；用于编译验证 DTO owner。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_continuation_state --lib` 通过，6 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：runtime protocol 纯映射归属 `model-provider`。
- `compat`：App Server `ProtocolKind` 到 `ModelProviderProtocol` 的映射仍留在 `provider_configuration.rs`，因为它是 App Server protocol 边界到 provider DTO 的 adapter；退出条件是 route resolver 完全输出 `model-provider::ModelRoute` 后删除该 protocol compat 字段。
- `dead`：`lime-agent` 内本地 `model_provider_protocol_from_runtime_protocol(...)` helper 已删除；后续不得恢复。
- `next`：继续收 `credential_bridge` 的 env var side effect 与 Aster `ModelConfig` adapter；可纯化 URL/header projection 才迁入 `model-provider`，实际 env 写入保持 compat adapter 边界直到原生 provider runtime 接管。

## 2026-07-04 进度记录：Aster provider adapter 从 resolver 接线拆出

- `completed`：新增 `lime-agent/src/credential_bridge/aster_provider_adapter.rs`，集中承接 Aster `Provider` trait、Aster message 转换、Aster `ProviderUsage` 映射、`ModelConfig` 构造与 `aster::providers::create(...)`。
- `completed`：`credential_bridge/provider_factory.rs` 只保留 `CredentialRuntimeProviderResolver` 到 `create_aster_backed_runtime_provider(...)` 的接线，不再直接 import `aster::...`、不再持有 `AsterRuntimeProviderAdapter` 或 message/usage 转换逻辑。
- `completed`：`credential_bridge.rs` 的 Aster provider re-export 改为来自 `aster_provider_adapter`，并修正文档说明：Aster provider 创建只允许留在该 compat adapter 内。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `aster_provider_adapter.rs` 存在并在 `credential_bridge.rs` 中注册，同时禁止 `provider_factory.rs` 重新出现 Aster import、`AsterRuntimeProviderAdapter`、`AsterMessage`、`ProviderUsage` 或 `build_aster_completion_input`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，14 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：SubAgent / provider execution 调用面仍只依赖 `model-provider::RuntimeProviderResolver` 与 `RuntimeProvider`。
- `compat`：`aster_provider_adapter.rs` 是当前唯一 Aster provider factory / message adapter 文件；退出条件是原生 runtime provider resolver 接管后删除该文件和 `create_aster_runtime_provider(...)` 调用。
- `dead`：`provider_factory.rs` 内联 Aster adapter 已删除；后续不得恢复。
- `next`：继续清 `aster_state/provider_config.rs` 对 `create_aster_runtime_provider(...)` 的调用，或者先把 env var side effect 与 provider model config projection 拆成可替换 adapter trait，最终让 `aster_provider_adapter.rs` 归零。

## 2026-07-04 进度记录：aster_state provider 注入调用点归一

- `completed`：`aster_state/provider_config.rs` 新增 `ProviderConfig::to_runtime_provider_config(...)` 与 `ProviderConfig::from_runtime_provider_config(...)`，消除 `ProviderConfig <-> RuntimeProviderConfig` 的重复字段拼装。
- `completed`：`configure_provider(...)` 与 `configure_provider_from_pool(...)` 统一调用私有 `inject_aster_provider_for_session(...)`；`create_aster_runtime_provider(...)` 在该 compat 文件内只剩一个真实调用点。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `aster_state/provider_config.rs` 存在 `inject_aster_provider_for_session`，并计数 `create_aster_runtime_provider(...)` 调用点必须等于 1，防止 Aster provider 注入重新散开。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_state --lib` 通过，16 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：调用方仍走 `configure_model_route_provider_for_session(...)` / `ModelRouteProviderConfiguration` current façade。
- `compat`：Aster Agent `update_provider(...)` 注入仍存在，但已集中在 `inject_aster_provider_for_session(...)` 一个函数内；退出条件是 turn/runtime executor 原生 provider context 接管后删除该函数和 `create_aster_runtime_provider(...)`。
- `dead`：`aster_state/provider_config.rs` 内多处直接 Aster provider factory 调用已删除；后续不得恢复。
- `next`：继续把 `inject_aster_provider_for_session(...)` 的职责替换为 Lime-owned runtime provider context，或先把 `aster_provider_adapter.rs` 的 env / model config side effect 包成可替换 adapter，最终清空 Aster provider 注入。

## 2026-07-04 进度记录：credential_bridge runtime DTO re-export 删除

- `completed`：`lime-agent` 根 API 不再 re-export `RuntimeProviderConfig` / `RuntimeProviderProtocol`；调用方改为直接依赖 `model_provider::runtime_provider` current owner。
- `completed`：删除 `lime-agent/src/credential_bridge/provider_config.rs`，`credential_bridge` 不再通过本地 re-export 文件承载 runtime provider DTO。
- `completed`：`provider_configuration.rs`、`provider_continuation_state.rs`、`aster_state.rs`、`aster_state/provider_config.rs`、`subagent_scheduler.rs`、`provider_env.rs`、`provider_factory.rs` 和 `aster_provider_adapter.rs` 批量改为直接 import `model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol}`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `credential_bridge/provider_config.rs` 不存在，并禁止 `credential_bridge` 重新定义或 re-export runtime provider DTO。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package model-provider` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：runtime provider config/protocol DTO 只归属 `model-provider`。
- `compat`：`credential_bridge` 仍负责 API Key Provider selection 到 `RuntimeProviderConfig` 的 adapter 投影，以及 Aster provider env / factory side effect。
- `dead`：`credential_bridge/provider_config.rs` 已删除；后续不得恢复。
- `next`：继续收 `credential_bridge` 对 provider config 的 adapter 投影，优先把 provider selection 输出变成可注入的 current resolver 输入，减少 `credential_bridge` 作为 provider runtime 中心的职责。

## 2026-07-04 进度记录：credential runtime config 投影拆出

- `completed`：新增 `lime-agent/src/credential_bridge/runtime_config_projection.rs`，集中承接 `RuntimeProviderCredential -> model_provider::runtime_provider::RuntimeProviderConfig` 的字段投影。
- `completed`：`credential_bridge.rs` 主文件不再直接 match `RuntimeCredentialData::*` 或拼 `RuntimeProviderConfig` 字段；主文件只负责选择凭证、解析 custom provider hint、记录 usage/health。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `runtime_config_projection.rs` 存在，并禁止 `credential_bridge.rs` 重新内联 `RuntimeCredentialData::*` 分支。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：runtime provider config DTO 仍归属 `model-provider`。
- `compat`：投影结果仍使用 Aster provider name 映射，因为底层 `aster_provider_adapter.rs` 尚未删除；退出条件是原生 provider resolver 不再需要 Aster provider name。
- `dead`：`credential_bridge.rs` 内联 credential DTO 投影已删除；后续不得恢复。
- `next`：继续把 Aster provider name 映射隔离到 `aster_provider_adapter` 或原生 provider resolver，减少 `runtime_config_projection.rs` 对 Aster 命名的依赖。

## 2026-07-04 进度记录：runtime config 投影隐藏 Aster provider 映射命名

- `completed`：`provider_mapping.rs` 增加 `resolve_runtime_provider_name(...)`，作为 runtime config 投影侧的语义入口；底层暂时仍委托 Aster provider name 映射。
- `completed`：`runtime_config_projection.rs` 不再直接调用 `map_provider_type_to_aster_with_api_type(...)`，改为调用 `resolve_runtime_provider_name(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `runtime_config_projection.rs` 直接调用 `map_provider_type_to_aster(...)` / `map_provider_type_to_aster_with_api_type(...)`，并要求使用 `resolve_runtime_provider_name(...)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，19 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，43 tests passed。
- `current`：runtime config projection 对外语义是 runtime provider name。
- `compat`：`resolve_runtime_provider_name(...)` 内部仍使用 Aster provider naming；退出条件是原生 provider resolver 上线后替换该映射或删除该 wrapper。
- `dead`：runtime config projection 直接依赖 Aster provider mapping 名称已删除；后续不得恢复。
- `next`：继续把 `resolve_runtime_provider_name(...)` 内部从 Aster provider naming 迁到 model-provider provider catalog / route metadata，最终让 `provider_mapping.rs` 的 Aster 命名只服务 `aster_provider_adapter.rs`。

## 2026-07-04 进度记录：root orphan tests 与 aster_state provider compat 删除

- `completed`：删除 `aster_state/provider_config.rs`；`AsterAgentState` 不再持有 `ProviderConfig` / provider configured cache / Aster provider 注入方法，只保留状态编排与 crate 内 `credential_bridge()` 只读访问。
- `completed`：`real_web_search_policy.rs` 改走 `run_agent_turn_with_policy(...)` + `AgentTurnProviderConfiguration`；真实主 turn 测试不再手动配置 Aster Agent 全局 provider。
- `completed`：`real_web_search_preflight_short_input.rs` 改走 `configure_model_route_provider_for_session(...)` / `provider_configuration_from_model_selection(...)` public façade，并改用 `AgentTurnContext` current DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `aster_state/provider_config.rs`、`ProviderConfig`、`current_provider_config`、`AsterAgentState::configure_provider*` 旧注入面，以及 `ProviderConfigurationRequest` 调用方。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，60 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_state --lib` 通过，13 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider runtime_provider --lib` 通过，1 test passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_web_search_policy --no-run` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_web_search_preflight_short_input --no-run` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，46 tests passed。
- `current`：provider 配置调用事实源是 `ModelRouteProviderConfiguration` / `AgentTurnProviderConfiguration` public façade；`AsterAgentState` 只保留 Agent 状态、取消、中断、tool/MCP/session 编排。
- `compat`：`create_aster_runtime_provider(...)` 仍由 `provider_configuration.rs` 调用，用于给 `Agent::reply_with_provider(...)` 提供 pinned `Arc<dyn aster::Provider>`；由于 `model-provider::RuntimeProvider` 当前只有非流式 `complete(...)`，尚不能承接主 turn 工具/流式 execution。
- `dead`：`aster_state/provider_config.rs`、`ProviderConfig`、`current_provider_config`、调用方可见 `ProviderConfigurationRequest` 均不得恢复。
- `next`：为 `model-provider::RuntimeProvider` 增加 current 流式/工具执行抽象或在 `agent-runtime::TurnExecutor` 引入 provider stream context，然后把 `request_tool_policy` 的 pinned provider 从 `Arc<dyn aster::Provider>` 改成 Lime-owned provider trait；完成后删除 `create_aster_runtime_provider(...)` 和 `credential_bridge/aster_provider_adapter.rs` 的 Aster provider factory。

## 2026-07-04 进度记录：session provider handle 收窄 Aster factory 暴露

- `completed`：`credential_bridge::create_aster_runtime_provider(...)` crate-visible factory 删除，替换为 `create_session_provider_handle(...) -> SessionProviderHandle`；调用方不再直接 import Aster factory 名称。
- `completed`：`provider_configuration.rs` 的 `ConfiguredSessionProvider` 改为持有 `SessionProviderHandle`，只在 `install_provider_for_session(...)` 和当前 Aster reply loop 调用点通过 `aster_provider()` 暂时桥回 `Arc<dyn aster::Provider>`。
- `completed`：`request_tool_policy::stream_message_reply_with_policy_and_provider(...)` 的参数从裸 `Arc<dyn aster::Provider>` 改为 `SessionProviderHandle`；`turn_execution.rs` 与 `direct_text_generation.rs` 只传 handle，不再自行解包 Aster provider。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `pub(crate) use aster_provider_adapter::create_aster_runtime_provider` / `pub(crate) async fn create_aster_runtime_provider(...)` 回流，并要求 `SessionProviderHandle` / `create_session_provider_handle(...)` 存在。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，60 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_state --lib` 通过，13 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_web_search_policy --no-run` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --test real_web_search_preflight_short_input --no-run` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，46 tests passed。
- `current`：provider 配置与 request_tool_policy 调用面只看到 `SessionProviderHandle`，不再看到 `create_aster_runtime_provider(...)` 或裸 `Arc<dyn aster::Provider>`。
- `compat`：`SessionProviderHandle::aster_provider()` 仍因 Aster Agent reply loop 需要 `Provider::stream_with_model(...)` 暂时存在；退出条件是 current provider stream/tool delta 抽象接管 `request_tool_policy` 内部 reply loop。
- `dead`：`create_aster_runtime_provider(...)` 作为 crate-visible session provider factory 已删除；后续不得恢复。
- `next`：扩展 `model-provider::RuntimeProvider` 的 streaming/tool request 能力，或在 `agent-runtime` 中实现 Lime-owned turn executor，随后把 `stream_message_reply_with_policy_and_provider(...)` 的参数从 `Arc<dyn aster::Provider>` 改为 current provider handle 并删除 `aster_provider()`。

## 2026-07-04 进度记录：SessionProviderHandle 禁止外泄裸 Aster Provider

- `completed`：`SessionProviderHandle::aster_provider()` 删除；handle 改为提供 `reply_stream_with_agent(...)`，裸 `Arc<dyn aster::Provider>` 只留在 `credential_bridge/aster_provider_adapter.rs` 内部。
- `completed`：`request_tool_policy.rs` 不再 import `aster::providers::base::Provider`，`stream_agent_reply_once(...)` 和 `stream_message_reply_with_policy_with_options(...)` 均只接收 `Option<SessionProviderHandle>`。
- `completed`：`provider_configuration.rs` 不再调用 `Agent::update_provider(...)`，只解析 `RuntimeProviderConfig` 并创建 `SessionProviderHandle`；旧 Aster session provider config 持久化写回已删除。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `SessionProviderHandle::aster_provider()`、`request_tool_policy.rs` 直接持有 `Option<Arc<dyn Provider>>` / `use aster::providers::base::Provider`，并禁止 `provider_configuration.rs` 重新调用 `.update_provider(...)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，30 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，60 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，48 tests passed。
- `current`：provider 配置调用面只暴露 Lime-owned `SessionProviderHandle`。
- `compat`：`SessionProviderHandle` 内部仍通过 Aster `Agent::reply_with_provider(...)` 执行主 turn stream；退出条件是 `model-provider` / `agent-runtime` 提供 current stream + tool delta executor 后删除 `aster_provider_adapter.rs`。
- `dead`：裸 Aster Provider 从 `provider_configuration.rs` / `request_tool_policy.rs` 外泄路径已删除；后续不得恢复。
- `next`：把 `CredentialRuntimeProviderResolver` 的命名降级为显式 Aster compat，或直接用 `lime-providers` 实现 current `RuntimeProviderResolver` 后删除 `create_aster_backed_runtime_provider(...)`。

## 2026-07-04 进度记录：Aster live provider tests 删除

- `completed`：删除 `lime-rs/crates/agent/tests/real_codex_tool_events.rs`、`real_web_search_policy.rs`、`real_web_search_preflight_short_input.rs`；这些 ignored live tests 依赖 `LIME_REAL_API_TEST` 并把 Aster provider / Aster reply loop 当正向验证，不再作为无用户阶段的迁移证据保留。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复上述文件，并禁止 `lime-rs/crates/agent/tests/**` 出现 `LIME_REAL_API_TEST`、`PROXYCAST_REAL_API_TEST`、`真实联网测试`、`test_real_codex`、`test_real_web_search`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，60 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --tests --no-run` 通过，integration test 目标只剩 `legacy_permission_surfaces`、`protocol_fact_source_guard`、`windows_shell_runtime`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，49 tests passed。
- `current`：真实 provider / live smoke 后续必须走 App Server / current provider runtime 链。
- `dead`：`lime-agent` 里的 Aster live provider tests 已删除；后续不得恢复。
- `next`：继续拆 `credential_bridge/aster_provider_adapter.rs`，优先处理 misleading 的 `CredentialRuntimeProviderResolver` 命名与 `create_aster_backed_runtime_provider(...)`。

## 2026-07-04 进度记录：Aster-backed runtime provider resolver 显式降级

- `completed`：`CredentialRuntimeProviderResolver` 改名为 `AsterCompatRuntimeProviderResolver`，避免把内部仍调用 `create_aster_backed_runtime_provider(...)` 的 resolver 伪装成 current provider runtime。
- `completed`：`subagent_scheduler.rs` 默认 resolver 改为注入 `AsterCompatRuntimeProviderResolver`；这条路径仍通过 `model-provider::RuntimeProviderResolver` trait 调用，调用方保持 current 抽象。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `credential_bridge.rs` / `provider_factory.rs` 使用 `AsterCompatRuntimeProviderResolver`，并禁止 `CredentialRuntimeProviderResolver` 命名回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，30 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，14 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，49 tests passed。
- `current`：调用侧事实源是 `model-provider::RuntimeProviderResolver` / `RuntimeProvider` trait。
- `compat`：默认 resolver 的具体实现仍是 Aster-backed，且只允许以 `AsterCompat*` 命名出现；退出条件是 `lime-providers` 或 App Server provider runtime 实现 current resolver 后替换并删除该类型。
- `dead`：`CredentialRuntimeProviderResolver` 作为 current-looking 名称已删除；后续不得恢复。
- `next`：评估 `lime-providers::{OpenAICustomProvider, ClaudeCustomProvider, CodexProvider}` 是否可直接实现 `RuntimeProvider` 非流式 `complete(...)`，先替换 subagent scheduler 的 resolver，再继续迁主 turn stream。

## 2026-07-04 进度记录：非流式 RuntimeProvider 切到 lime-providers HTTP resolver

- `completed`：`credential_bridge/provider_factory.rs` 改为 `HttpRuntimeProviderResolver`，默认通过 `lime-providers::{OpenAICustomProvider, ClaudeCustomProvider}` 执行 `model-provider::RuntimeProvider::complete(...)`，不再调用 Aster Provider trait。
- `completed`：`subagent_scheduler.rs` 默认 resolver 从 `AsterCompatRuntimeProviderResolver` 切到 `HttpRuntimeProviderResolver`；SubAgent 非流式 provider execution 主链先脱离 Aster-backed adapter。
- `completed`：删除 `credential_bridge/aster_provider_adapter.rs` 中的 `create_aster_backed_runtime_provider(...)`、`AsterRuntimeProviderAdapter`、`build_aster_completion_input(...)`、Aster `ProviderUsage -> ProviderResponse` 映射和对应测试；该文件只保留主 turn stream 所需 `SessionProviderHandle` 和 Aster provider handle 创建。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `create_aster_backed_runtime_provider`、`AsterCompatRuntimeProviderResolver`、`AsterRuntimeProviderAdapter`、`ProviderUsage`、`build_aster_completion_input`、`.complete(&system_prompt` 回流到 provider factory / credential bridge 主文件。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，30 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_scheduler --lib` 通过，14 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，60 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，49 tests passed。
- `verified`：`git diff --check -- ...` 覆盖本轮 provider / request_tool_policy / governance / roadmap 写集，通过。
- `current`：非流式 provider resolver 事实源是 `model-provider::RuntimeProvider` + `lime-providers` HTTP implementations。
- `compat`：主 turn stream 仍需要 `SessionProviderHandle` 内部调用 Aster `Agent::reply_with_provider(...)`；`credential_bridge/provider_safety.rs` 仍是 Aster Provider wrapper。
- `dead`：Aster-backed 非流式 `RuntimeProvider` adapter 已删除；后续不得恢复。
- `next`：继续迁主 turn stream：要么给 `model-provider` 增加 stream/tool delta trait 并由 `lime-providers` 实现，要么在 `agent-runtime` 实现 Lime-owned turn executor 后删除 `SessionProviderHandle` / `aster_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-04 进度记录：Aster SubAgentScheduler adapter 删除

- `completed`：删除 `lime-rs/crates/agent/src/subagent_scheduler.rs`，该文件仅由 `lime-agent` 自身 re-export 和单元测试引用，未发现 App Server、前端或其他 current crate 消费者；保留它会继续把 Aster `SubAgentScheduler` / `SubAgentExecutor` trait 当作现役扩展面。
- `completed`：`lime-rs/crates/agent/src/lib.rs` 移除 `pub mod subagent_scheduler` 与 `LimeScheduler` / `LimeSubAgentExecutor` / `SchedulerEventEmitter` / `SubAgentProgressEvent` / `SubAgentRole` re-export，crate 根不再公开旧 Aster subagent 调度器适配 API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将原“subagent provider 执行”正向守卫改为删除守卫，禁止恢复 `subagent_scheduler.rs`，并禁止 `lime-agent` 根 API 重新导出上述旧类型。
- `current`：SubAgent / team runtime 后续只能向 App Server / RuntimeCore / `agent-runtime` current turn executor 与 projection 收敛。
- `dead`：Aster `SubAgentScheduler` adapter、对应 executor wrapper 和进度事件 DTO 已删除；后续不得恢复。
- `next`：继续迁主 turn stream，优先清 `SessionProviderHandle` / `aster_provider_adapter.rs` / `provider_safety.rs`，或先把 App Server runtime tool bridge 从 `runtime_facade` 的 Aster tool type re-export 迁到 current tool-runtime facade。

## 2026-07-04 进度记录：无消费者 provider_factory 删除

- `completed`：删除 `lime-rs/crates/agent/src/credential_bridge/provider_factory.rs`；删除 `subagent_scheduler.rs` 后该 resolver 只剩自身测试和治理守卫引用，没有 production 调用方。
- `completed`：`credential_bridge.rs` 移除 `mod provider_factory` 与 `HttpRuntimeProviderResolver` re-export；`lime-agent` 同步移除 `lime-providers.workspace = true` 依赖，避免保留假 current provider execution 依赖。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `provider_factory.rs` 改为删除守卫，禁止恢复 `mod provider_factory`、`provider_factory::` 和 `HttpRuntimeProviderResolver`。
- `current`：`RuntimeProviderConfig` / `RuntimeProviderProtocol` 仍归属 `model-provider`，只作为 provider 配置 DTO 使用。
- `compat`：主 turn stream 仍通过 `credential_bridge/aster_provider_adapter.rs::SessionProviderHandle` 调 Aster `Agent::reply_with_provider(...)`。
- `dead`：无消费者 HTTP `RuntimeProviderResolver`、对应 OpenAI chat 请求转换和响应解析测试已删除；后续不得恢复。
- `next`：继续向主 turn stream 动刀，目标是删除 `SessionProviderHandle` / `aster_provider_adapter.rs` / `provider_safety.rs`，或先拆 App Server 对 `runtime_facade` Aster tool re-export 的依赖。

## 2026-07-04 进度记录：无消费者 RuntimeProvider execution trait 删除

- `completed`：删除 `model-provider::runtime_provider::{RuntimeProvider, RuntimeProviderResolver}`；删除 `provider_factory.rs` 后这两个 trait 没有 production 实现或调用方，只会制造一条假 current provider execution 主线。
- `completed`：`model-provider` 移除 `async-trait` 依赖；`runtime_provider.rs` 只保留当前实际消费的 `RuntimeProviderProtocol`、`RuntimeProviderConfig` 和 `message_is_non_retryable_provider_rejection(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 runtime provider 守卫收窄为 config/protocol/retry 判定，并禁止恢复 `pub trait RuntimeProvider`、`pub trait RuntimeProviderResolver`、`async fn complete(...)` 和 `resolve_provider(...)`。
- `current`：provider 配置 DTO 仍归属 `model-provider`；stream diagnostics 的 provider rejection 判定也继续归属该 crate。
- `dead`：无消费者 runtime provider execution trait 已删除；后续只有在真实 current executor 落地并有生产调用方时，才允许重新定义执行抽象。
- `next`：继续清主 turn stream 的 Aster `SessionProviderHandle`，或先把 App Server native tool bridge 从 `runtime_facade` Aster type re-export 迁出。

## 2026-07-04 进度记录：无消费者 ProviderRouter DTO 删除

- `completed`：删除 `model-provider/src/router.rs` 与 `pub mod router`；该模块只剩自身测试引用，曾服务已删除的 subagent provider execution / RuntimeProvider adapter，不再是 current 主链事实源。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `model-provider/router.rs`，并禁止 `model-provider` 重新导出 `ProviderRequest` / `ProviderResponse` / `ProviderRouter` / `StreamResponse` / `StreamChunk` 这组无消费者抽象。
- `current`：`model-provider` 当前保留 canonical model、provider safety、`RuntimeProviderConfig` / `RuntimeProviderProtocol` 与 `ModelRoute` 这些仍有生产消费者的事实源。
- `dead`：SubAgent provider execution 遗留 DTO 与 router trait 已删除；后续不得为了历史计划恢复。
- `next`：继续评估主 turn stream：优先迁 `runtime_facade` App Server native tool bridge，或清 `credential_bridge/aster_provider_adapter.rs` 的 Aster Provider wrapper。

## 2026-07-04 进度记录：model-provider 无消费者 catalog 抽象删除

- `completed`：删除 `model-provider::ModelTaskRequest`、`ModelProviderCatalog`、`ModelProviderError`、`ModelProviderResult`；这些定义只在 `model-provider/src/lib.rs` 内自引用，没有生产消费者。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复上述无消费者 catalog 抽象；模型任务契约继续归属 `app-server-protocol` / `runtime-core`，`model-provider` 只保留有消费者的 `ModelRoute` / `ModelProviderProtocol`。
- `current`：`ModelRoute` 和 `ModelProviderProtocol` 仍被 `agent-runtime` 与 App Server runtime backend 使用。
- `dead`：`model-provider` 自建 `ModelTaskRequest` / catalog trait 已删除，避免和 App Server protocol 的模型任务 DTO 并存。
- `next`：继续清 Aster 主 turn stream 或迁出 `runtime_facade` 的 App Server native tool bridge Aster type re-export。

## 2026-07-04 进度记录：agent-runtime 无消费者执行骨架删除

- `completed`：删除 `agent-runtime::AgentRuntime`、`AgentRuntimeCapabilities`、`StartTurnRequest`、`StartTurnAccepted`、`AgentRuntimeError`、`AgentRuntimeResult`，以及 `turn_executor.rs` 中未被生产代码消费的 `TurnExecutor` / `ExecuteTurn*` / `QueueSubagent*` / `HandleAction*` 执行骨架。
- `completed`：`agent-runtime` 移除 `async-trait`、`thread-store`、`tool-runtime` 和 `tokio` dev-dependency；该 crate 当前只保留真实消费者使用的 `ask` 纯逻辑和 `TurnProviderConfiguration` provider route DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复无实现/无调用方的 `AgentRuntime` / `TurnExecutor` 执行骨架；后续只有在 App Server / RuntimeCore 真实接入生产 executor 时才允许重建。
- `current`：provider route / reasoning DTO 仍归属 `agent-runtime::turn_executor::TurnProviderConfiguration`。
- `dead`：空 runtime/executor trait、subagent/action execution DTO 已删除，不再伪装为已迁好的 current runtime。
- `next`：继续清 Aster 主 turn stream 或迁出 `runtime_facade` 的 App Server native tool bridge Aster type re-export。

## 2026-07-04 进度记录：tool-runtime 无消费者执行骨架删除

- `completed`：删除 `tool-runtime/src/lib.rs` 顶层 `ToolRuntime`、`ToolDefinition`、`ToolInvocation`、`ToolPermissionDecision`、`ToolOutcome*`、`ToolRuntimeError`、`ToolRuntimeResult`；这些定义只在本文件内自引用，没有 production 消费者。
- `completed`：`tool-runtime` 现在只公开真实被 `lime-agent` 消费的 `mcp_notification`、`tool_io`、`tool_result` 三个 current 工具投影模块。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复无实现/无调用方的 `ToolRuntime` 执行 trait 和配套 DTO，同时要求保留三个真实 current 模块。
- `current`：MCP notification 投影、tool I/O offload、tool result extraction 仍归属 `tool-runtime`。
- `dead`：空 ToolRuntime execution trait 和 invocation/outcome DTO 已删除，避免与 App Server native tool bridge / Aster tool facade 并行制造第三套工具运行时语义。
- `next`：继续迁出 `runtime_facade` 的 App Server native tool bridge Aster type re-export，或继续清 `credential_bridge/aster_provider_adapter.rs` 主 turn stream compat。

## 2026-07-04 进度记录：AsterAgentState interrupt marker 旁路删除

- `completed`：删除 `RuntimeInterruptMarker`、`interrupt_markers` 字段、`record_interrupt_request(...)`、`get_interrupt_marker(...)`、`clear_interrupt_marker(...)` 和对应生命周期测试。
- `completed`：`create_cancel_token(...)` 不再读取 marker 做预取消；真实取消继续由 `cancel_tokens` / `cancel_session(...)` 承接。
- `completed`：`lime-agent` 根 API 移除 `RuntimeInterruptMarker` re-export。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 interrupt marker 结构体、字段和方法，并声明取消事实源只能走 `cancel_tokens` / `cancel_session`。
- `current`：App Server runtime cancel 仍通过 `AsterAgentState::create_cancel_token(...)`、`cancel_session(...)`、`remove_cancel_token(...)` 驱动正在执行的 turn / skill。
- `dead`：旧 runtime 诊断 interrupt marker 旁路没有 production 消费者，已删除；后续不得作为 compat 诊断状态恢复。
- `next`：继续避让当前并行持有的 App Server runtime_backend 热区；可继续收 `aster_state.rs` 内零引用的小面，或等待 runtime_backend 写集释放后迁出 `runtime_facade` 的 Aster tool re-export。

## 2026-07-04 进度记录：AsterAgentState 无消费者 public wrapper 删除

- `completed`：删除 `AsterAgentState::reload_lime_skills(...)`、`with_agent(...)`、`build_project_system_prompt(...)`、`register_mcp_bridge(...)` 和只覆盖 wrapper 的 `test_reload_lime_skills_no_panic`。
- `current`：Skills reload / project prompt helpers 继续由 `aster_state_support` 直接 re-export；只读 Agent 访问调用方继续使用更明确的 `get_agent_arc(...)`；MCP bridge 生产入口只保留批量 `sync_mcp_bridges(...)`。
- `compat`：`AsterAgentState` 整体仍是 App Server runtime_backend 的 Aster Agent 承载层，不能整文件删除。
- `dead`：无消费者 public wrapper 已删除，避免 `AsterAgentState` 继续扩展成杂项 facade。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复上述 wrapper，并要求对应 current owner 保持分离。
- `next`：继续审 `aster_state.rs` 内 remaining public API；真实消费者存在的 `with_agent_mut(...)`、`get_agent_arc(...)`、native tool/action/cancel/MCP 批量同步路径暂不删除。

## 2026-07-04 进度记录：aster_state_support 零引用 public helper 删除

- `completed`：删除 `aster_state_support::build_project_system_prompt(...)` 和 `message_helpers::{user_text, assistant_text}`，并移除 `aster_state.rs` / `lib.rs` 的 re-export。
- `current`：`aster_state_support` 只保留仍有消费者的 Skills 加载、Agent identity/tool config 和 `SessionConfigBuilder`。
- `dead`：项目上下文 prompt wrapper 与消息构造 helper 没有 production 消费者，不应作为 `lime-agent` 根 API 继续暴露。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复这些 helper 和 re-export。
- `next`：继续把 Aster state/support API 面收缩到真实消费者；`runtime_facade` 和 App Server native tool bridge 等热区等待并行写集释放后再迁。

## 2026-07-04 进度记录：workspace-local skill loader 假入口删除

- `completed`：删除 `aster_state_support::load_workspace_lime_skills(...)` 和 `lime-agent` 根 re-export；搜索结果显示该入口没有 production 消费者。
- `current`：Skills 注册仍由 `reload_lime_skills(...)` / `init_agent_with_db(...)` 走统一 skill roots 解析；workspace skill 产品入口不应直接暴露 Aster global_registry helper。
- `dead`：workspace-local skill loader 作为单独 public API 已删除，避免让 App Server 或插件运行时绕过 current runtime enable / skill policy 链。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `load_workspace_lime_skills`。
- `next`：继续清零引用 Aster support API；有真实消费者的 `reload_lime_skills(...)` 暂保留。

## 2026-07-04 进度记录：CredentialBridge no-op provider health API 删除

- `completed`：删除 `CredentialBridge::mark_healthy(...)`、`mark_unhealthy(...)` 和零引用 `CredentialBridgeError::ProviderExecutionFailed`。
- `completed`：删除 `turn_execution.rs` 中成功 turn 后调用 `mark_healthy(...)` 的 no-op 写回块；该路径对 current runtime API key 只返回 `Ok(())`，对旧 credential 只写 debug 日志，不再作为健康事实源保留。
- `current`：API key 使用次数仍由 `CredentialBridge::record_usage(...)` 写回；真正 provider health 后续应归属 App Server / model provider current owner，而不是 Aster compat bridge。
- `dead`：CredentialBridge provider health API 是迁移残留的假 current surface，已删除。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 no-op health 方法、调用点和相关日志/错误枚举。
- `next`：继续推进主 turn stream 退场，目标仍是替换 `SessionProviderHandle` / `credential_bridge/aster_provider_adapter.rs` / `provider_safety.rs`；App Server runtime_backend 热区释放前优先做 lime-agent 内部可验证收缩。

## 2026-07-04 进度记录：Aster 命名 runtime state API 退场

- `completed`：`AsterAgentState` 对外类型改为 `AgentRuntimeState`，并同步 `lime-agent` 与 App Server runtime backend 的真实消费者；不保留 `type AsterAgentState = ...` alias。
- `completed`：`SkillWorkflowExecution` / `SkillPromptExecution` 的 public 字段从 `aster_state` 改为 `runtime_state`，Knowledge Builder skill 调用点同步迁移。
- `completed`：`aster_state.rs` / `aster_state_support.rs` 文件迁名为 `runtime_state.rs` / `runtime_state_support.rs`；`lime-agent` 根模块声明和 re-export 同步迁到 `runtime_state*`，旧 Aster 命名文件退出构建图。
- `completed`：删除零引用 `CredentialBridgeError::UnsupportedCredentialType` 和 `LimeSessionStore::load_extension_data_sync(...)`，避免 API 面收缩后留下新的 dead warning。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `AsterAgentState`、public `aster_state` 字段、`aster_state.rs` / `aster_state_support.rs` 文件、`credential_bridge` public re-export 和无消费者 extension data helper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server --package tool-runtime --package model-provider` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，27 tests passed。
- `verified`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，58 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，51 tests passed。
- `current`：对外 runtime state 入口是 `AgentRuntimeState`；Skills / session config 支撑入口归属 `runtime_state_support`。
- `compat`：`AgentRuntimeState` 内部仍持有 Aster `Agent`，并继续承载 App Server 主 turn、native tool、action response、cancel、MCP bridge；退出条件是 current turn executor / provider stream / tool bridge 接管后删除内部 Aster `Agent`。
- `dead`：`AsterAgentState` public API、`aster_state*` current owner 文件和 public `aster_state` 字段已退场，后续不得恢复。
- `next`：继续迁出 `runtime_facade` 的 App Server native tool bridge Aster type re-export，或继续向主 turn stream 的 `SessionProviderHandle` / `credential_bridge/aster_provider_adapter.rs` 动刀。

## 2026-07-04 进度记录：App Server AsterBackend public facade 改名

- `completed`：`app-server` feature-gated public facade 从 `AsterBackend*` 改为 `RuntimeBackendAdapter` / `RuntimeBackendHost` / `RuntimeBackend*Request|Result` / `RuntimeBackendProcessControlCapabilities`；不保留旧类型 alias。
- `completed`：`app-server/src/aster_backend.rs` 物理迁名为 `runtime_backend_adapter.rs`，`lib.rs` re-export 和 `runtime_factory.rs` 调用点同步改为 current 命名。
- `completed`：host-backed 测试工厂从 `aster_runtime_core(...)` / `aster_app_server(...)` 改为 `runtime_adapter_core(...)` / `runtime_adapter_app_server(...)`，避免和本地 current `runtime_backend_core()` / `runtime_app_server()` 混淆。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `AsterBackend*`、`mod aster_backend`、`aster_backend::`、`aster_runtime_core` / `aster_app_server` 和旧文件 `app-server/src/aster_backend.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib --features aster-backend` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，52 tests passed。
- `current`：App Server public backend adapter 以 `RuntimeBackend*` 命名，仍服务 ExecutionBackend host adapter contract。
- `compat`：Cargo feature 名 `aster-backend` 和 CLI 负向测试 `--backend aster` 暂保留，前者属于既有 feature gate，后者只验证 standalone binary 拒绝旧模式；退出条件是后续统一 feature 名并同步 Cargo / CI / 测试。
- `dead`：`AsterBackend*` public facade 和 `aster_backend.rs` current owner 文件已删除；后续不得恢复。
- `next`：继续处理剩余 `runtime_facade` Aster tool type re-export，或把 `initialize_aster_runtime` / `restore_aster_runtime_queued_turns` 这组根 API 改成 current 命名并保留 Aster 初始化为内部实现细节。

## 2026-07-04 进度记录：Agent runtime 初始化根 API 去 Aster 命名

- `completed`：`lime-agent` 根 API 从 `initialize_aster_runtime(...)` 改为 `initialize_agent_runtime(...)`，App Server `agent_runtime_registry` 和 runtime backend 测试调用点同步迁移。
- `completed`：`restore_aster_runtime_queued_turns(...)` 没有任何生产消费者；先从 crate 根 re-export 删除，随后删除函数本体，避免继续保留 dead warning。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `initialize_aster_runtime` / `restore_aster_runtime_queued_turns` 回流到 `lime-agent` 根 API。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib --features aster-backend` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，52 tests passed。
- `current`：外部初始化入口是 `initialize_agent_runtime(...)`；Aster 目录 / shared store 初始化只是内部 compat 实现细节。
- `dead`：`initialize_aster_runtime(...)` public API 与 unused queued-turn restore helper 已退场，后续不得恢复。
- `next`：继续处理 `runtime_facade` 的 Aster tool type re-export，或继续把 `aster_runtime_support` 内部函数逐步改成 current 命名并压缩到 adapter 边界。

## 2026-07-04 进度记录：runtime_support 内部入口去 Aster 命名

- `completed`：`aster_runtime_support.rs` 物理迁名为 `runtime_support.rs`，`lime-agent` 模块声明和调用方同步改为 `runtime_support`。
- `completed`：内部 helper 从 `ensure_aster_runtime_dirs` / `require_aster_runtime_store` / `load_aster_runtime_snapshot` / `list_aster_runtime_queued_turns` 等改为 `ensure_runtime_dirs` / `require_runtime_store` / `load_runtime_snapshot` / `list_runtime_queued_turns`；底层 store helper 明确命名为 `remove_runtime_queued_turn_from_store(...)`，避免和对外 queue API 冲突。
- `completed`：`runtime_state`、`runtime_queue`、`subagent_control`、`session_store_runtime_detail` 的调用点同步迁移到 current helper 名称。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `aster_runtime_support.rs` 文件和 `pub mod aster_runtime_support`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib --features aster-backend` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，52 tests passed。
- `current`：Agent runtime support 入口现在是 `runtime_support`；Aster shared runtime store 只作为该模块内部 compat 实现。
- `dead`：`aster_runtime_support` 模块名和 `*_aster_runtime_*` helper 名已退场，后续不得恢复。
- `next`：清理剩余 `[AsterAgent]` 日志前缀和面向 App Server 的 `runtime_facade` Aster tool type re-export。

## 2026-07-04 进度记录：运行日志旧 Aster 前缀清理

- `completed`：`lime-agent` 运行日志前缀从 `[AsterAgent]` / `[AsterRuntime]` 清理为 `[AgentRuntime]`，覆盖 ask bridge、direct text generation、provider configuration、runtime state/support、message content adapter、runtime queue 和 request tool policy。
- `verified`：`rg -n "\\[AsterAgent\\]|\\[AsterRuntime\\]" "lime-rs/crates/agent/src" --glob "*.rs" --glob "!aster_session_store_adapter.rs.bak"` 无命中。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `current`：日志面使用 `AgentRuntime` 作为 runtime owner 名称。
- `dead`：`[AsterAgent]` / `[AsterRuntime]` 运行日志前缀已退场。
- `next`：继续处理 `runtime_facade` Aster tool type re-export，这是当前 App Server native tool bridge 的最大 public Aster surface。

## 2026-07-04 进度记录：App Server native tool Aster facade 退场

- `completed`：`runtime_facade` 删除 `PermissionBehavior` / `PermissionCheckResult` / `Tool` / `ToolContext` / `ToolError` / `ToolResult` 的 public re-export；外部 crate 不再通过 `lime_agent::runtime_facade` 获取 Aster tool 类型。
- `completed`：App Server native memory / image tool 注册从 `Vec<Box<dyn Tool>>` 改为 `AgentRuntimeState::register_memory_store_tools(...)` / `register_image_task_tools(...)`，App Server 只传 current gateway，不接触 Aster tool trait。
- `completed`：image command 的 `tool.result` 事件改用 `lime_agent::native_tools::image_task_tool_result_projection(...)` 的 current projection；`ToolResult` 转换函数只留在 `lime-agent` 内部。
- `completed`：`lime_agent::native_tools::{image_tasks,memory_store}` 子模块改为私有，只导出 `ImageTaskGateway` / `MemoryStoreGateway` / `NativeToolResultProjection` 等 current API，防止外部绕过 runtime state 直接构造 Aster tool。
- `completed`：App Server 测试中的 WebSearch fake tool 和 SkillTool 权限断言迁到 `lime_agent::test_support`，测试层也不再直接 import `ToolContext` / `PermissionBehavior` / `ToolResult`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `runtime_facade` 的 Aster tool type re-export，并禁止 `app-server/src/runtime_backend/**`（`live_execution_process.rs` 除外）消费 `runtime_facade::Tool*` / `Permission*` 或 `Box<dyn Tool>`。
- `current`：App Server 与 native tools 的边界是业务 gateway + `AgentRuntimeState` 注册方法；image command 消费 current result projection。
- `compat`：`live_execution_process.rs` 仍直接实现 `NativeToolExecutionHook` / 使用 `NativeToolExecutionRequest` / `ToolCallResult`，因为它和 rmcp streaming/control 绑定较深；退出条件是下一刀在 `lime-agent` 内落 current hook adapter 后移除这三个 re-export。
- `dead`：App Server native tools 生产路径上的 Aster `Tool` / `ToolContext` / `ToolResult` public facade 已退场，后续不得恢复。
- `next`：处理 `live_execution_process` hook adapter，把 `NativeToolExecutionHook` / `NativeToolExecutionRequest` / `ToolCallResult` 从 App Server 迁回 `lime-agent` 内部。

## 2026-07-04 进度记录：live execution hook 收回 lime-agent 内部 adapter

- `completed`：新增 `lime-agent/src/live_execution_process.rs`，定义 current `LiveExecutionProcessGateway` trait，并在 `lime-agent` 内部把 gateway 适配成 Aster `NativeToolExecutionHook`。
- `completed`：`AgentRuntimeState::install_live_execution_process_gateway(...)` 成为安装 live execution process 的唯一 public 入口；`set_native_tool_execution_hook(...)` 不再由 App Server 直接调用。
- `completed`：App Server `runtime_backend/live_execution_process.rs` 降级为 `ExecutionProcessServer` 的 `LiveExecutionProcessGateway` 实现，不再 import `runtime_facade`、`NativeToolExecutionHook`、`NativeToolExecutionRequest`、`ToolCallResult` 或 `rmcp` tool result 类型。
- `completed`：`runtime_facade` 删除最后三个 Aster agents re-export：`NativeToolExecutionHook` / `NativeToolExecutionRequest` / `ToolCallResult`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `runtime_facade` 重新导出 Aster agents/tool 类型，禁止 App Server `runtime_backend/**` 消费 `runtime_facade::` / Aster hook/tool facade，并要求 Aster live hook 细节只能停留在 `lime-agent/src/live_execution_process.rs`。
- `current`：跨 crate 边界是 `LiveExecutionProcessGateway` + app-server-protocol execution process DTO；App Server 只拥有 execution process server。
- `compat`：Aster `NativeToolExecutionHook` 仍存在于 `lime-agent` 内部 adapter，因为当前 turn executor 仍由 Aster Agent 驱动；退出条件是 current turn executor 接管 native tool streaming 后删除该 adapter。
- `dead`：App Server 直接实现 Aster live hook、直接构造 `NativeToolExecutionRequest` 的路径已退场，后续不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `AgentSessionConfig = aster::agents::SessionConfig` public alias 或 `SessionProviderHandle` / `credential_bridge/aster_provider_adapter.rs` 主 provider stream compat。

## 2026-07-04 进度记录：AgentSessionConfig public Aster alias 退场

- `completed`：`AgentSessionConfig` 从 `pub type AgentSessionConfig = aster::agents::SessionConfig` 改为 Lime current struct，字段保持 App Server request context 所需语义：`id`、`thread_id`、`turn_id`、`system_prompt`、`include_context_trace`、`turn_context` 等。
- `completed`：`build_agent_session_config(...)` 现在构建 current DTO；App Server `session_config_from_request(...)` 不再返回 Aster `SessionConfig`。
- `completed`：`AgentTurnExecutionRequest` 接收 current `AgentSessionConfig`，只在 `run_agent_turn_with_policy(...)` 内部调用 `into_aster_session_config()` 转换后交给 Aster stream 主链。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `pub type AgentSessionConfig = aster::agents::SessionConfig`。
- `current`：App Server request context 与 `lime-agent` 对外 session config 边界使用 Lime DTO；Aster `SessionConfig` 只允许留在 `lime-agent` 内部 turn execution / request_tool_policy compat 主链。
- `dead`：`AgentSessionConfig` public Aster alias 已退场。
- `next`：继续压缩 `turn_execution.rs` / `request_tool_policy.rs` 内部 Aster session config 面，或推进 `SessionProviderHandle` / `credential_bridge/aster_provider_adapter.rs` 主 provider stream compat 退场。

## 2026-07-04 进度记录：旧 Aster provider adapter 命名退场

- `completed`：`credential_bridge/aster_provider_adapter.rs` 旧命名 adapter 已退出工作树；主 turn stream 的临时 provider 接线集中在 `credential_bridge/runtime_provider_adapter.rs`。
- `completed`：`credential_bridge.rs` 只注册 `mod runtime_provider_adapter;`，不再注册 `mod aster_provider_adapter;`；调用侧仍只看到 `SessionProviderHandle` / `create_session_provider_handle(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将旧 `aster_provider_adapter.rs` 判为 `dead / forbidden-to-restore`，并要求 `runtime_provider_adapter.rs` 承接 `SessionProviderHandle` / `reply_stream_with_agent(...)`。
- `current`：provider 配置、direct generation、request tool policy 调用面只消费 Lime-owned `SessionProviderHandle`。
- `compat`：`runtime_provider_adapter.rs` 内部仍持有 Aster `Provider`、`ModelConfig` 与 `Agent::reply_with_provider(...)`，这是主 turn stream 尚未替换前的唯一 vendor adapter；退出条件是 current turn executor / provider stream 接管后删除该文件和 `credential_bridge/provider_safety.rs`。
- `dead`：`credential_bridge/aster_provider_adapter.rs` 文件名、`mod aster_provider_adapter;` 和 `create_aster_runtime_provider(...)` crate-visible factory 不得恢复。
- `next`：继续主 turn stream 退场，优先把 `request_tool_policy.rs` / `turn_execution.rs` 的内部 Aster `SessionConfig` 与 `Agent::reply_with_provider(...)` 替换为 Lime-owned executor；完成后删除 `SessionProviderHandle`、`runtime_provider_adapter.rs`、`credential_bridge/provider_safety.rs` 和 vendor Aster provider 创建。

## 2026-07-04 进度记录：ToolSourceKind AsterBuiltin public DTO 退场

- `completed`：`agent_tools::catalog::ToolSourceKind::AsterBuiltin` 改为 `RuntimeBuiltin`，内置工具 catalog / inventory 断言同步迁移。
- `completed`：由于当前无外部用户和旧数据兼容约束，旧序列化值 `aster_builtin` 不保留 serde alias；后续工具来源输出只使用 `runtime_builtin`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 public source DTO 守卫，禁止 `agent_tools/catalog.rs` 与 `agent_tools/inventory.rs` 恢复 `AsterBuiltin` / `aster_builtin`。
- `current`：工具来源 public DTO 使用 runtime 语义：`RuntimeBuiltin` / `LimeInjected` / `BrowserCompatibility`。
- `dead`：`AsterBuiltin` 作为 public enum variant 和 `aster_builtin` 作为输出值已退场，后续不得恢复。
- `next`：继续把主 turn stream 的 Aster execution adapter 压缩到 `runtime_provider_adapter.rs` / `request_tool_policy.rs`，优先处理 `SessionProviderHandle` 与 `Agent::reply_with_provider(...)`。

## 2026-07-04 进度记录：event_converter public Tauri facade 退场

- `completed`：`lime-agent` 根模块从 `pub mod event_converter;` 收窄为 `mod event_converter;`，外部 crate 不再把 Aster event adapter 当 public API 使用。
- `completed`：`event_converter.rs` 删除 `pub use crate::protocol::{... as Tauri*}` re-export，内部类型改用 `RuntimeAgentEvent` / `RuntimeToolProgressPayload` / `RuntimeProviderTraceStage` 命名。
- `completed`：`convert_agent_event(...)` 从 `pub fn` 收窄为 `pub(crate) fn`，唯一 production 调用点仍是 `aster_runtime_projection::project_aster_runtime_event(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `pub mod event_converter`、`pub fn convert_agent_event`、`pub use crate::protocol` 和 `Tauri*` facade 别名。
- `current`：对外 runtime event DTO 仍归属 `protocol` / `agent-protocol`，Aster event 转换只作为 lime-agent 内部 adapter。
- `dead`：`event_converter` public facade 与 Tauri 命名别名已退场，后续不得恢复。
- `next`：继续主 turn stream 退场；`event_converter` 后续只允许继续向更小 adapter 拆分或删除，不再作为 public projection owner。

## 2026-07-05 进度记录：SessionConfig 外露面继续收缩

- `completed`：`request_tool_policy` 外层 stream API 从 `aster::agents::SessionConfig` 改为 `AgentSessionConfig`；`turn_execution.rs` / `direct_text_generation.rs` 调用面只传 Lime-owned session config，Aster 转换下沉到 policy 内部 adapter。
- `completed`：`SessionConfigBuilder::build()` 从返回 Aster `SessionConfig` 改为返回 `AgentSessionConfig`；`skill_execution.rs` 私有 prompt / step session config 也同步改为 current DTO，只在真正调用 Aster `Agent::reply(...)` 前转换。
- `completed`：`request_tool_policy/runtime_status.rs` crate-visible `emit_runtime_status_with_projection(...)` 不再接收 `&aster::agents::SessionConfig`，改为接收 `&AgentSessionConfig`；Aster DTO 只在该模块内部持久化 runtime item 前短暂转换。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止主执行链调用面、`SessionConfigBuilder`、`request_tool_policy` 外层 stream API 和 runtime status 投影重新暴露 Aster `SessionConfig`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，59 tests passed。
- `current`：App Server request context、turn execution、direct generation、skill execution builder 与 runtime status 投影统一消费 `AgentSessionConfig` / `AgentTurnContext`。
- `compat`：Aster `SessionConfig` 仍保留在 `session_configuration::into_aster_session_config(...)`、`request_tool_policy::stream_agent_reply_once(...)`、`credential_bridge/runtime_provider_adapter.rs`、`skill_execution.rs` 和 `runtime_state.rs` 的实际 Aster Agent 调用点。
- `dead`：`SessionConfigBuilder` / policy 外层 API / runtime status crate-visible API 直接暴露 Aster `SessionConfig` 不得恢复。
- `next`：继续压缩剩余直接 `Agent::reply(...)` 调用点，优先把 skill execution / elicitation response 的 Aster reply 细节收回单一内部 adapter；最终再处理 `SessionProviderHandle` / `runtime_provider_adapter.rs`。

## 2026-07-05 进度记录：散落 Aster direct reply 收回统一 policy adapter

- `completed`：`skill_execution.rs` 不再直接调用 Aster `Agent::reply(...)`、不再手动消费 Aster stream，也不再直接调用 `project_aster_runtime_event(...)` / `WriteArtifactEventEmitter`；skill prompt / workflow 统一走 `request_tool_policy::stream_message_reply_with_policy(...)`，并使用 `RequestToolPolicyMode::Disabled` 保持 Skill 调用不触发请求级搜索策略。
- `completed`：`runtime_state::submit_elicitation_response(...)` 不再直接 `into_aster_session_config()` 后调用 Aster `Agent::reply(...)` / `StreamExt` 轮询；action response 入口统一走 `stream_message_reply_with_policy(...)`，只保留构造 Aster `ActionRequired` message 这一层 vendor payload adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `skill_execution.rs` / `runtime_state.rs` 恢复直接 `.reply(`、`into_aster_session_config`、`StreamExt`、Aster event polling 或直接 Aster projection。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，61 tests passed。
- `current`：主 turn、direct generation、skill execution、elicitation response 均通过同一 `request_tool_policy` stream adapter 执行。
- `compat`：`request_tool_policy::stream_agent_reply_once(...)` 仍是唯一直接 Aster `Agent::reply(...)` adapter；`credential_bridge/runtime_provider_adapter.rs` 仍是唯一 pinned provider `reply_with_provider(...)` adapter。
- `dead`：skill / action response 各自维护 Aster reply loop 的并行链路不得恢复。
- `next`：继续处理 `SessionProviderHandle` / `runtime_provider_adapter.rs`，或者先把 `request_tool_policy::stream_agent_reply_once(...)` 的 Aster `SessionConfig` 参数压成更窄的 internal reply request DTO。

## 2026-07-05 进度记录：request_tool_policy Aster stream loop 隔离

- `completed`：新增 `request_tool_policy/agent_reply_stream.rs`，把直接 Aster `Agent::reply(...)` / pinned provider stream、Aster event projection、text batch flush、web retrieval synthesis status 和 inline provider error 过滤集中到单一 adapter 子模块。
- `completed`：`request_tool_policy.rs` 主文件不再 import `AsterAgentEvent`、`project_aster_runtime_event(...)`、`project_aster_auto_compaction_event(...)` 或 `futures::StreamExt`，只保留策略编排、preflight、retry 和最终校验。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `request_tool_policy.rs` 主文件恢复 `.reply(`、Aster event projection、Aster stream polling 或 `aster::agents::SessionConfig` 参数；直接 Aster stream loop 只能暂留在 `agent_reply_stream.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，61 tests passed。
- `current`：主 policy 文件成为 current-facing 策略编排层。
- `compat`：`agent_reply_stream.rs` 是唯一 Aster Agent reply stream adapter；退出条件是 current turn executor / provider stream 接管后删除该模块。
- `dead`：`request_tool_policy.rs` 主文件直接维护 Aster stream loop 的形态不得恢复。
- `next`：继续处理 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs`，或把 `agent_reply_stream.rs` 的输入进一步压成 Lime-owned reply request DTO，为删除 vendor adapter 做准备。

## 2026-07-05 进度记录：Aster SessionConfig 转换下沉 agent_reply_stream adapter

- `completed`：`request_tool_policy.rs` 不再调用 `into_aster_session_config()`，retry / preflight / runtime status 编排全程持有 Lime-owned `AgentSessionConfig`。
- `completed`：`stream_agent_reply_once(...)` 改为接收 `&AgentSessionConfig`，只在 `agent_reply_stream.rs` 内部真正调用 Aster `Agent::reply(...)` / pinned provider stream 前转换为 Aster `SessionConfig`。
- `completed`：删除 `duplicate_session_config(...)` helper，避免策略主文件为了 Aster stream retry 保留 Aster DTO 克隆语义。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `request_tool_policy.rs` 主文件重新出现 `into_aster_session_config` 或直接构造 Aster `SessionConfig`，并要求转换只留在 `agent_reply_stream.rs`。
- `current`：`request_tool_policy.rs` 是 current-facing 策略编排层，输入 / retry 状态 / runtime status 均使用 `AgentSessionConfig`。
- `compat`：`agent_reply_stream.rs` 仍是唯一 Aster reply stream adapter；退出条件是 current turn executor / provider stream 接管后删除该模块。
- `dead`：`request_tool_policy.rs` 直接持有 Aster `SessionConfig`、复制 Aster `SessionConfig` 或承担转换职责的形态不得恢复。
- `next`：继续向 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` 动刀，或先在 `agent_reply_stream.rs` 内定义更窄的 internal reply request DTO，直到 Aster reply adapter 可整体替换。

## 2026-07-05 进度记录：AgentSessionConfig DTO 脱离 Aster 转换

- `completed`：新增 `session_config_adapter.rs`，集中承接 `AgentSessionConfig -> aster::agents::SessionConfig` 的唯一构造逻辑。
- `completed`：`session_configuration.rs` 删除 `into_aster_session_config(...)`，现在只定义 Lime-owned `AgentSessionConfig` / `AgentSessionConfigurationRequest` 与 builder 入口，不再 import 或构造 Aster DTO。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 与 `request_tool_policy/runtime_status.rs` 改为调用 `to_aster_session_config(...)`，Aster session config 构造只发生在真正需要调用 Aster Agent / runtime item persistence 的 adapter 边界。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `session_configuration.rs` 恢复 Aster 依赖，并要求 Aster `SessionConfig` 构造只留在 `session_config_adapter.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，63 tests passed。
- `current`：`AgentSessionConfig` 是纯 Lime DTO，属于 current 调用面。
- `compat`：`session_config_adapter.rs` 是 Aster SessionConfig 唯一转换 adapter；退出条件是 current turn executor / runtime status persistence 接管后删除。
- `dead`：在 `AgentSessionConfig` DTO 文件上挂 `into_aster_session_config(...)` 的形态不得恢复。
- `next`：继续处理 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` 的 provider stream compat，减少主 turn 对 Aster provider trait / `reply_with_provider(...)` 的依赖。

## 2026-07-05 进度记录：compat-aster 假 feature 与备份文件删除

- `completed`：删除 `lime-rs/crates/agent/src/aster_session_store_adapter.rs.bak`，旧 workflow 生成备份按 `dead` 处理，不再保留在工作树中误导后续迁移。
- `completed`：`lime-agent/Cargo.toml` 移除 `compat-aster` feature、`default = ["compat-aster"]` 和 `aster optional = true`；当前主链仍无条件依赖 Aster，因此不再用假 optional feature 掩盖真实退出阻塞。
- `completed`：`lime-agent/src/lib.rs` 删除 `aster_session_store_adapter` 备份注释，旧 adapter 只允许作为历史 evidence 存在于路线图文本中，不允许回到源码模块图。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `.bak` 备份文件、`mod aster_session_store_adapter`、`compat-aster`、`aster optional = true` 和过期 `aster_runtime_support` 退出条件。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过；全量 `--package lime-agent --package app-server` 被并行进程未跟踪的 `app-server/src/runtime_backend/image_command/tests.rs:760` 语法错误挡住，未接管该热区。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，64 tests passed。
- `current`：`lime-agent` manifest 真实表达当前状态：Aster 仍是待清退的直接依赖，退出条件是 current turn executor / provider stream 接管。
- `dead`：`compat-aster` 作为假可关闭 feature 和 `aster_session_store_adapter.rs.bak` 备份文件已退场。
- `next`：继续主 turn stream 退场；最值得继续的一刀仍是 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` / `credential_bridge/provider_safety.rs`。

## 2026-07-05 进度记录：Aster optional feature 旧路线文档清理

- `completed`：删除 `internal/roadmap/astermigration/optional-feature-gate-plan.md`；该文件仍标记 `ready_to_execute`，且与当前“无兼容包袱、不再假 optional feature”的事实冲突。
- `completed`：更新 `lime-rs/vendor/aster-rust/README.md`，把 vendor 状态从 “optional feature 隔离” 改为 “服务剩余 Aster compat adapter”，并移除 `compat-aster` 示例。
- `completed`：更新 `phase5-vendor-downgrade-plan.md` 的当前依赖状态，明确 `lime-agent` 仍通过 `aster.workspace = true` 直接依赖 Aster，这是待清退阻塞而不是可关闭 feature。
- `current`：活动路线图以本文件和 `README.md` 为事实源；旧 session report 中的 `compat-aster` 文本只作为历史 evidence，不再作为可执行计划。
- `dead`：`optional-feature-gate-plan.md` 和 “收缩 compat-aster feature 范围” 的路线已删除。
- `next`：继续主 turn stream 退场，目标不变：删除 `SessionProviderHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs` 前先让 current executor / provider stream 接管。

## 2026-07-05 进度记录：主执行 provider 调用面 Aster Message 下沉

- `completed`：`turn_execution.rs` 不再 import `aster::conversation::message::Message`，provider 分支改为调用 text-oriented `stream_reply_with_policy_and_provider(...)`。
- `completed`：`direct_text_generation.rs` 不再构造 Aster `Message::user().with_text(...)`，direct generation provider 分支改为调用 text-oriented `stream_reply_with_policy_and_provider_for_direct_generation(...)`。
- `completed`：`request_tool_policy.rs` 的公开 / crate-visible provider 调用面只接收 `&str` 文本输入；Aster `Message` 构造后续已继续下沉到 `request_tool_policy/agent_reply_stream.rs` adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 turn/direct generation 调用面恢复 Aster `Message` import、`Message::user().with_text(...)` 或旧 `stream_message_reply_with_policy_and_provider*` API 名称。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，65 tests passed。
- `current`：turn/direct generation 调用面只表达 Lime-owned input text + `AgentSessionConfig` + provider route。
- `compat`：Aster `Message` 构造当时仍保留在 `request_tool_policy.rs` 内部和 action response / skill 特殊消息边界；该状态已被后续 `agent_reply_stream` adapter 下沉记录取代。
- `dead`：主执行 provider 调用面直接构造 Aster `Message` 的形态不得恢复。
- `next`：继续把 `skill_execution` 的 prompt/workflow 普通文本消息改成 text-oriented policy API，只把图片/agent-only 等特殊 payload 留在受控 adapter；或继续处理 `SessionProviderHandle` provider stream。

## 2026-07-05 进度记录：skill reply input Aster Message 下沉

- `completed`：`skill_execution.rs` 删除 `aster::conversation::message::Message` import，`build_user_message(...)` 改为 `build_reply_input(...)`，只构造 Lime-owned `ReplyInput` / `ReplyInputImage`。
- `completed`：`stream_message_reply_with_policy(...)` 从 public API 收窄为 `pub(crate)`，入口接收 `ReplyInput`，在 `request_tool_policy.rs` 内部转换为 Aster `Message`。
- `completed`：`runtime_state::submit_elicitation_response(...)` 改走显式 `stream_aster_message_reply_with_policy(...)`，让 action response 的 Aster payload 边界可审计，不再混用普通 current-facing reply API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `skill_execution.rs` 恢复 Aster `Message` import / `Message::user().with_text(...)`，并要求 skill reply 走 `ReplyInput`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，65 tests passed。
- `current`：turn/direct/skill 普通输入调用面都只表达文本、图片与 Agent-only 标记，不直接构造 Aster conversation DTO。
- `compat`：Aster `Message` 构造当时集中在 `request_tool_policy.rs` 内部；后续已继续下沉到 `request_tool_policy/agent_reply_stream.rs`。action response 仍需要 Aster `ActionRequired` payload，并通过 `stream_aster_message_reply_with_policy(...)` 显式标记。
- `dead`：skill execution 自行构造 Aster `Message` / 维护 Aster reply loop 的形态不得恢复。
- `next`：继续缩小 `request_tool_policy.rs` 内部 Aster Message adapter，或回到 `SessionProviderHandle` / `runtime_provider_adapter.rs` 替换 provider stream。

## 2026-07-05 进度记录：provider stream compat 复核

- `checked`：`SessionProviderHandle` 仍由主 turn 与 direct generation 的 provider route 调用链使用：`provider_configuration.rs -> create_session_provider_handle(...) -> request_tool_policy/agent_reply_stream.rs`。
- `checked`：`credential_bridge/runtime_provider_adapter.rs` 仍是唯一 `Agent::reply_with_provider(...)` / `aster::providers::create(...)` adapter，不能在 current provider stream 接管前直接删除。
- `checked`：`credential_bridge/provider_safety.rs` 仍包裹 Aster `Provider` trait，负责工具消息归一化、fast model 禁用与 session name generation 兼容；当前删除会破坏 pinned provider stream。
- `decision`：本轮不新增“看起来 current”的 provider trait 包装层；在没有 current stream/tool delta provider executor 前，继续把 Aster provider trait 局限在这两个 compat 文件和 `agent_reply_stream.rs`。
- `compat`：`SessionProviderHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs` 仍是主 turn stream 的最后一组 provider 阻塞。
- `dead`：重新暴露裸 `Arc<dyn aster::Provider>`、恢复 `create_aster_runtime_provider(...)` 或把 provider factory 移回 `provider_configuration.rs` 均不得恢复。
- `next`：要删除这组 provider compat，必须先实现 current turn executor / provider stream；短期可继续把 `request_tool_policy.rs` 中 Aster `Message` / retry prompt 构造拆到更窄 adapter，减少最终替换面。

## 2026-07-05 进度记录：request_tool_policy Message 构造下沉 adapter

- `completed`：`request_tool_policy.rs` 不再 import `aster::conversation::message::Message`，也不再直接构造 `Message::user().with_text(...)`；普通首轮输入、provider 输入、retry prompt 均使用 Lime-owned `ReplyInput`。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 新增 `ReplyAttemptInput` / `CompatAsterReplyMessage`，集中承接 `ReplyInput -> Aster Message` 转换、取消上下文 agent-only marker 持久化和特殊 Aster payload 转接。
- `completed`：`runtime_state::submit_elicitation_response(...)` 调用 `compat_aster_reply_message(...)` 后再进入 `stream_aster_message_reply_with_policy(...)`，让 `ActionRequired` 这条 Aster payload 成为显式 compat 入口，而不是污染普通 reply API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 `request_tool_policy 主文件不得重新承接 Aster reply stream loop` 守卫，禁止主文件恢复 Aster `Message` import、`Message::user().with_text` 或 `Message::user()` 构造。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --check` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，65 tests passed。
- `current`：`request_tool_policy.rs` 是策略编排层，只持有 Lime-owned `ReplyInput` / `AgentSessionConfig` 和 retry policy。
- `compat`：`request_tool_policy/agent_reply_stream.rs` 是唯一 Aster reply/message adapter；退出条件是 current turn executor / provider stream 接管后删除该模块。
- `dead`：`request_tool_policy.rs` 主文件直接构造 Aster user message、保存 Aster cancel marker 或维护 Aster stream loop 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先实现 current provider stream / turn executor 以删除 `SessionProviderHandle`、`credential_bridge/runtime_provider_adapter.rs`、`credential_bridge/provider_safety.rs` 和 `agent_reply_stream.rs`。

## 2026-07-05 进度记录：Action response Aster payload 下沉 adapter

- `completed`：`runtime_state::submit_elicitation_response(...)` 不再 import `aster::conversation::message::*`，也不再直接构造 `MessageContent::ActionRequired` / `ActionRequiredData::ElicitationResponse`。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 新增 `compat_aster_elicitation_response_message(...)`，把 Lime-owned `AgentActionRequiredScope` / request id / user data 显式转换成 Aster ActionRequired payload。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 runtime_state action response 守卫，禁止 `runtime_state.rs` 恢复 Aster conversation message import、`ActionRequiredData::ElicitationResponse`、`MessageContent::ActionRequired` 或 `Message::user()`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，61 tests passed。
- `current`：runtime_state action response 入口只表达 current scope / request id / user data。
- `compat`：Aster ActionRequired message 构造集中在 `agent_reply_stream.rs` adapter；退出条件是 current action response executor 接管后删除。
- `dead`：runtime_state 直接构造 Aster conversation message payload 的形态不得恢复。

## 2026-07-05 进度记录：optional feature 旧报告删除

- `completed`：删除 `phase2-execution-summary.md`、`session-2026-07-04-complete-report.md`、`session-2026-07-04-conflict-resolution.md`、`session-2026-07-04-final-summary.md`。这些文件把 `compat-aster` / optional feature gate 写成推荐或已完成策略，已被当前“无兼容包袱、真实删除 Aster compat”路线推翻。
- `completed`：删除 `phase2-blocking-analysis.md` 与 `aster-trait-skeleton-fast-track-plan.md`。两者仍把 optional feature / 移除 `aster.workspace = true` 前置成可执行路线，且与当前代码实际和无兼容要求冲突。
- `completed`：更新迁移 README 和 vendor README，active roadmap 只保留当前主计划、vendor 降级计划与最终删除退出条件。
- `current`：活动迁移事实源只保留 `README.md`、本计划和 `phase5-vendor-downgrade-plan.md`。
- `dead`：optional feature gate 会话报告不得作为后续执行依据；需要历史证据时只看 git history，不在 active roadmap 目录中保留误导性计划。

## 2026-07-05 进度记录：tool confirmation Aster permission payload 下沉

- `completed`：`runtime_state::confirm_tool_action(...)` 不再 import 或构造 Aster `PermissionConfirmation` / `Permission::AllowOnce` / `Permission::DenyOnce` / `PrincipalType::Tool`，只保留 current action response 入口参数校验和 Agent 状态读取。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 承接 `confirm_aster_tool_action(...)`，把 tool confirmation 的 Aster permission payload 与 `Agent::handle_confirmation(...)` 调用限制在现有 Aster reply adapter 内。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 runtime_state action response 守卫，禁止 runtime_state 恢复 Aster permission DTO 构造或直接调用 `.handle_confirmation(...)`。
- `current`：runtime_state action response 入口只表达 request id、confirmed 和 current action scope / user data。
- `compat`：Aster action response payload 仍集中在 `agent_reply_stream.rs` adapter；退出条件是 current action response executor 接管后删除该 adapter。
- `dead`：runtime_state 同时承接状态管理和 Aster action permission DTO 构造的形态不得恢复。

## 2026-07-05 进度记录：direct text generation usage 投影收口

- `completed`：新增 `session_usage_projection.rs`，集中承接 token usage 的纯投影规则，避免 `direct_text_generation` 与 Aster session adapter 重复实现 input/output/cache token 归一化。
- `completed`：`direct_text_generation.rs` 不再 import Aster `Agent` / `Session` / `query_session`，并删除无 DB `run_direct_text_generation(...)` 入口；direct generation 现在必须走 `run_direct_text_generation_with_db(...)`。
- `completed`：`session_execution_runtime_adapter::project_aster_session_usage(...)` 复用 `session_usage_projection::project_token_usage(...)`，只保留 Aster session field 读取，不再重复纯投影规则。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `session_usage_projection.rs` 纳入无 Aster 回流文件守卫，并新增 direct text generation 守卫，禁止该 current-facing 执行入口恢复无 DB public API、Aster session usage 查询或重复 token usage helper。
- `current`：direct text generation 入口只负责 current request、provider route、stream 执行和 repository usage fallback；纯 token usage 投影归属 `session_usage_projection`；调用方必须提供 DB。
- `dead`：`run_direct_text_generation(...)` 无 DB fallback、`direct_text_generation.rs` 直接 import Aster session API、直接 query Aster session 或重复 token usage 投影的形态不得恢复。

## 2026-07-05 进度记录：session_update public Aster wrapper 退场

- `completed`：删除零外部调用的 `session_update::create_subagent_session(...)` 与 `session_update::replace_session_conversation(...)`，不再通过 `lime_agent` 根 API 暴露 Aster `Session` / `Conversation` wrapper。
- `completed`：`persist_session_extension_data(...)` 从 public API 收窄为 `pub(crate)`，只供 `session_execution_runtime` 与 `subagent_control` 内部 compat adapter 使用。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 `session_update` 守卫，禁止恢复 public Aster session / conversation / extension data wrapper 或根 API re-export。
- `current`：对外只保留 `persist_compaction_session_metrics_update(...)` 与 `CompactionSessionMetricsUpdate` 这组 current repository token stats 写回 API。
- `compat`：Aster `ExtensionData` 持久化仍留在 crate-internal `session_update` adapter；退出条件是 recent access/preferences/team selection 改成 current repository schema 后删除。
- `dead`：`session_update` 作为 public Aster session/conversation wrapper 集合的形态不得恢复。

## 2026-07-05 进度记录：session_query public Aster Session API 收窄

- `completed`：`session_query::{read_session,list_child_subagent_sessions,list_subagent_status_scope_session_ids,list_subagent_cascade_session_ids,collect_subagent_cascade_session_ids}` 从 public API 收窄为 `pub(crate)`。
- `completed`：`lime_agent` 根 API 删除 `pub use session_query::{...}`，不再对外暴露返回 Aster `Session` 的查询函数。
- `completed`：删除收窄后零调用的 subagent status / cascade query helpers，以及对应 Aster parent-session 查询和 `thread-store` cascade 投影 glue；`session_query` 只保留仍被内部 runtime detail / subagent context 使用的查询。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 session_query 守卫，禁止恢复 public Aster Session query 或根 API re-export。
- `current`：外部会话读取继续走 App Server / thread-store current read model；`session_query` 只作为 lime-agent 内部 Aster Session adapter。
- `dead`：通过 `lime_agent` public API 直接读取 Aster Session 的形态不得恢复。

## 2026-07-05 进度记录：Ask/LSP callback public Aster 类型收窄

- `completed`：`ask_bridge::create_ask_callback(...)` 与 `lsp_bridge::create_lsp_callback(...)` 从 public API 收窄为 `pub(crate)`，仅供 `runtime_state_support::create_lime_tool_config()` 内部接线。
- `completed`：`ask_bridge::extract_response(...)` 收窄为私有测试覆盖 helper，`lime_agent` 根 API 删除 `extract_ask_response` re-export。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 Ask/LSP bridge 守卫，禁止恢复 crate 根公开 Aster callback/request 类型。
- `compat`：Ask/LSP bridge 仍实现 Aster callback adapter；退出条件是 native tool callback 接口迁到 current tool-runtime 后删除这些 Aster callback 类型。
- `dead`：通过 `lime_agent` public API 暴露 Aster `AskCallback` / `AskRequest` / `LspCallback` 的形态不得恢复。

## 2026-07-05 进度记录：runtime_facade 与 session_update 零调用 public 面删除

- `completed`：`runtime_facade` 从 `pub mod` 收窄为 crate-private module，`current_agent_turn_context(...)` / `with_agent_turn_context(...)` 收窄为 `pub(crate)`；Aster task-local context wrapper 不再作为 `lime_agent` public API 暴露。
- `completed`：删除零调用的 `CompactionSessionMetricsUpdate` 与 `persist_compaction_session_metrics_update(...)`，`session_update` 只保留仍被内部 recent state / subagent control 使用的 Aster `ExtensionData` 持久化 adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 runtime_facade / session_update 守卫，禁止恢复 public runtime facade 和零调用 compaction token wrapper。
- `dead`：通过 crate public API 暴露 Aster task-local context wrapper，或保留无调用 compaction token stats 写回 façade 的形态不得恢复。

## 2026-07-05 进度记录：subagent profile/control public Aster 面删除

- `completed`：`subagent_profiles` 从 `pub mod` 收窄为 crate-private module，根 API 删除整组 `subagent_profiles::{...}` re-export；该模块现在只保留仍被 session read model 消费的 `SubagentCustomizationState` 与 `SubagentSkillSummary`。
- `completed`：删除 `SubagentProfileSummary`、`TeamPresetSummary`、`SubagentSkillPromptBlock`、内置 profile/preset/skill descriptor、summarize helper 与 `build_subagent_customization_prompt(...)` 等零调用历史 API；不再为无用户兼容保留内置 subagent profile 包袱。
- `completed`：新增 crate-private `subagent_profiles_aster_adapter.rs`，把 `SubagentCustomizationState` 的 Aster `ExtensionState` impl 与 extension data 读写限制在内部 adapter；`subagent_profiles.rs` 不再 import / 暴露 `FrontmatterHooks`、`ExtensionData` 或 `Session`。
- `completed`：`subagent_control` 从 `pub mod` 收窄为 crate-private module，根 API 删除 `read_subagent_control_state(...)`、`write_subagent_control_state(...)`、`SubagentControlState`、`SubagentRuntimeStatus*` 等 re-export。
- `completed`：删除无调用的 `read_subagent_control_state(...)`、`write_subagent_control_state(...)`、`SubagentControlState::into_updated_extension_data(...)`、`opened(...)` 和 `session_query::ensure_subagent_session(...)`；`subagent_control` 只保留内部 runtime status projection 所需 DTO / helper。
- `completed`：删除 `SubagentControlState.stashed_queued_turns: Vec<QueuedTurnRuntime>` 和对应 roundtrip fixture；closed-state extension 只保留实际用于状态判断的 `closed` / `closed_at` / `closed_reason`，不再把 Aster queue DTO 写进 subagent control state。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 `subagent_profiles` / `subagent_control` public surface 守卫，禁止恢复 Aster `FrontmatterHooks` / `ExtensionData` / `Session` helper、零调用内置 profile helper、root public module / re-export、返回 Aster `Session` 的 subagent control wrapper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过；`git diff --check -- <Aster 迁移写集>` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_control --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，58 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，68 tests passed。
- `current`：外部可见 subagent 数据只通过 `ChildSubagentSession` / `SubagentParentContext` 等 session read model 暴露；`subagent_profiles` / `subagent_control` 不再是 crate public API。
- `compat`：Aster extension data 读写仍集中在 `subagent_profiles_aster_adapter.rs` 与 `subagent_control` 内部 runtime status adapter；退出条件是 subagent customization/control 状态迁到 current repository schema 后删除。
- `dead`：公开 `lime_agent::subagent_profiles`、公开 Aster `FrontmatterHooks` / `ExtensionData` / `Session` helper、公开 subagent control state wrapper、在 control state 写入 Aster `QueuedTurnRuntime` payload、或保留零调用内置 profile helper的形态不得恢复。
- `next`：继续收缩 Aster session/read model compat：优先处理 `session_execution_runtime` 中 recent access/preferences/team selection 的 Aster `ExtensionData` helper，或继续主 turn stream 的 `SessionProviderHandle` / `agent_reply_stream` 退场。

## 2026-07-05 进度记录：session recent-state Aster 写入口删除

- `completed`：删除零调用 public API `persist_session_recent_access_mode(...)`、`persist_session_recent_preferences(...)`、`persist_session_recent_team_selection(...)`，`lime_agent` 根 API 不再提供 recent access/preferences/team selection 的 Aster `ExtensionData` 写回入口。
- `completed`：删除 `SessionExecutionRuntimeAccessMode` / `SessionExecutionRuntimePreferences` / `SessionExecutionRuntimeRecentTeamSelection` 上的 `into_updated_extension_data(...)`、`write_extension_data(...)` / `to_extension_data(...)` 写回 helper；这些 DTO 继续作为 session execution read model 和 Aster extension 读取投影使用。
- `completed`：删除已零引用的 `session_update.rs` 和 `mod session_update;`。该文件只剩 `persist_session_extension_data(...) -> aster::session::persist_session_extension_data(...)` wrapper，已按 `dead` 处理。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `session_execution_runtime 不得恢复 public recent-state Aster extension 写入口` 守卫，并把 `session_update.rs` 守卫改为删除态，禁止该 wrapper 文件恢复。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib` 通过，24 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，69 tests passed。
- `current`：session execution recent state 只作为 `SessionExecutionRuntime` read model 投影暴露；写入能力后续必须进入 current repository schema / App Server 状态接口，而不是 Aster extension wrapper。
- `compat`：`session_execution_runtime_adapter.rs` 仍通过 Aster `ExtensionState::from_extension_data(...)` 读取历史 extension data；退出条件是 recent state 迁入 current session runtime schema 后删除。
- `dead`：`session_update.rs`、通过 `lime_agent` public API 写 Aster `ExtensionData`、以及 DTO 自带 `into_updated_extension_data(...)` 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` / `agent_reply_stream.rs`；或继续把 session read model 中的 Aster metadata adapter 移入更小 compat module。

## 2026-07-05 进度记录：session/subagent public Aster 残留继续清理

- `completed`：新增 `session_store_subagent_aster_adapter.rs`，把 `resolve_subagent_session_metadata(...)`、Aster `Session` 字段读取和 subagent customization extension 读取集中到 session-store compat adapter；`session_store_subagent_context.rs` 现在只消费 Lime-owned `SubagentSessionProjection` / `SubagentPresentationProjection`。
- `completed`：`session_store_runtime_detail.rs` 在调用 subagent parent context 前显式做 Aster session -> current projection，不再把 `Option<&aster::session::Session>` 传入展示层。
- `completed`：删除零引用 `session_query::list_child_subagent_sessions(...)` wrapper；child subagent 查询只在新的 `session_store_subagent_aster_adapter.rs` 内部使用。
- `completed`：`ask_bridge` / `lsp_bridge` 从 `pub mod` 收窄为 crate-private module；`runtime_state_support::{create_lime_identity, create_lime_tool_config}` 改为 `pub(crate)`，`lime_agent` 根 API 不再公开 Aster `AgentIdentity` / `ToolRegistrationConfig` helper。
- `completed`：删除 `session_store::list_title_preview_messages_sync(...)` 空实现、`SessionTitlePreviewMessage` DTO、`session_store::update_session_provider_config_sync(...)` public 写入口和对应测试；该写入口是零消费者 Aster `ModelConfig` 写回 façade，按 `dead` 删除。
- `completed`：`SubagentControlState`、`SubagentRuntimeStatusInput` 与 `derive_subagent_runtime_status_kind(...)` 收窄为文件私有；`subagent_profiles_aster_adapter::{subagent_customization_from_extension_data, write_subagent_customization_extension_data}` 收窄为私有 helper。
- `completed`：`test_support::native_tool_context(...)` 删除；该 helper 只服务 `lime-agent` 内部 live execution 测试，已迁为测试模块本地 helper，不再通过 `test-support` feature 对 App Server 暴露 Aster `ToolContext` fixture。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展守卫，禁止 session_store dead public API、Ask/LSP public module、Aster identity/tool config public helper、subagent context direct Aster metadata import、subagent profile adapter crate-visible helper、subagent control internal helper、test_support 裸 `ToolContext` fixture 回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib` 通过，56 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_control --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution_process --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server skill_runtime_enable --lib` 通过，10 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，70 tests passed。
- `current`：subagent 展示 read model 只暴露 `ChildSubagentSession` / `SubagentParentContext` 等 Lime DTO；runtime identity/tool config 只在 Agent 初始化内部接线。
- `compat`：Aster subagent metadata / extension 读取仍在 `session_store_subagent_aster_adapter.rs` 与 `subagent_profiles_aster_adapter.rs`；退出条件是 subagent metadata/customization 迁入 current repository schema 后删除。
- `dead`：`lime_agent::ask_bridge` / `lime_agent::lsp_bridge` public module、public `create_lime_identity` / `create_lime_tool_config`、空 title preview API、public provider config write façade、`SessionTitlePreviewMessage`、session_store 展示层直接解析 Aster metadata、通过 `test_support` feature 暴露裸 Aster `ToolContext` fixture 的形态不得恢复。
- `next`：回到主 turn stream，推进 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` / `agent_reply_stream.rs` 的 current executor 替换。

## 2026-07-05 进度记录：test-support Aster fixture surface 删除

- `completed`：删除 `lime-agent` 的 `test-support` feature、`test_support.rs` 模块和 `lib.rs` 中的 `pub mod test_support` 出口；App Server dev-dependency 不再通过 feature 获取 Aster `Tool` / `ToolContext` fixture。
- `completed`：`skill_runtime_enable` 测试改为通过 `lime_agent::tools::is_skill_tool_session_skill_allowed(...)` 断言 current session gate 状态，不再构造 `LimeSkillTool` + Aster `ToolContext` 作为跨 crate 权限探针。
- `completed`：App Server 删除依赖 fake Aster WebSearch 注册的 content factory host tool execution 测试；等价的 host tool evidence / workspace patch 成功与失败回填断言迁入 `lime-agent::agent_tools::workspace_patch_host` 单测，覆盖 current projection 逻辑而不向外暴露注册 Aster native tool 的测试 API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `test_support.rs` / `test-support` feature / App Server `features = ["test-support"]` 归类为 `dead`，禁止恢复该测试 surface。
- `current`：跨 crate 测试只允许消费非 Aster current API（session gate 查询、workspace patch projection）；Aster native tool fixture 只能留在 `lime-agent` 内部测试模块。
- `dead`：`lime_agent::test_support`、`test-support` feature、`register_fixed_web_search_tool(...)`、`register_failing_web_search_tool(...)`、跨 crate `ToolPermissionDecision` / Aster `ToolContext` probe 均不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` / `agent_reply_stream.rs`；或者继续把 tool/runtime adapter 向 `tool-runtime` current DTO 收敛。

## 2026-07-05 进度记录：App Server `aster-backend` feature gate 删除

- `completed`：删除 `lime-rs/crates/app-server/Cargo.toml` 中的 `aster-backend` feature；`runtime_backend_adapter.rs` 已是 current App Server backend adapter，不再通过旧 Aster 命名 feature 暴露。
- `completed`：`runtime_backend_adapter` module、`RuntimeBackendAdapter` / `RuntimeBackendHost` / submit-cancel-action DTO、`AppServerRuntimeFactory::runtime_adapter_*` helper 和对应 JSON-RPC / factory tests 全部改为无条件编译；这不是恢复 Aster backend，而是把 current runtime adapter 从旧 feature gate 中拿出来。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `aster-backend` / `feature = "aster-backend"` 纳入 App Server backend 旧命名守卫，禁止 Cargo feature 或 cfg gate 回流。
- `current`：App Server current backend adapter 命名是 `RuntimeBackendAdapter` / `RuntimeBackendHost`，用于 Desktop Host 或上层 runtime owner 注入，不包含 direct Aster dependency。
- `dead`：`aster-backend` feature 名、`#[cfg(feature = "aster-backend")]`、`AsterBackend*` public facade、`aster_*` factory 均不得恢复；`--backend aster` 只允许作为 standalone CLI 负向测试字符串存在。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `next`：继续主 turn stream 退场，优先处理 `SessionProviderHandle` / `credential_bridge/runtime_provider_adapter.rs` / `agent_reply_stream.rs` 的 current executor 替换。

## 2026-07-05 进度记录：provider 安装 façade 从 public API 收窄

- `completed`：`ConfiguredSessionProvider`、`provider_configuration_from_model_selection(...)` 和 `configure_model_route_provider_for_session(...)` 从 public API 收窄为 `pub(crate)`；Aster-backed provider 安装能力只允许在 `lime-agent` 内部 turn / direct generation / knowledge builder 调用链使用。
- `completed`：`lime_agent` 根 API 删除 provider 安装 helper re-export；跨 crate 只保留 `SessionProviderConfig`、`ModelRouteProviderConfiguration` 与 route protocol helper 这些 current DTO / projection API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `provider 安装 helper 不得作为 lime_agent public API 暴露`，并扩展 App Server provider public API 守卫，禁止 `ConfiguredSessionProvider`、`configure_model_route_provider_for_session(...)`、`provider_configuration_from_model_selection(...)` 回到 crate public surface。
- `current`：App Server 与其他 crate 只能消费 provider route/config DTO，不直接触发 Aster-backed provider install。
- `compat`：provider 安装本身仍由 `lime-agent::provider_configuration` 创建 `SessionProviderHandle` 并供 Aster reply loop 使用；退出条件是 current executor / runtime provider stream 接管主 turn 与 direct generation。
- `dead`：把 Aster-backed provider install façade 作为 `lime_agent` public API 暴露的形态不得恢复。
- `next`：继续主 turn stream 退场，优先把 `SessionProviderHandle` / `request_tool_policy::agent_reply_stream` 的 Aster message wrapper 收到更小的 internal adapter，随后替换为 current provider stream DTO。

## 2026-07-05 进度记录：action response Aster wrapper façade 删除

- `completed`：`runtime_state` 的 elicitation response 提交改走 `action_required_response_input(...)` + `stream_action_required_response_with_policy(...)` current 命名入口；不再通过 `compat_aster_elicitation_response_message(...)` 或 `stream_aster_message_reply_with_policy(...)` 暴露 Aster wrapper 语义。
- `completed`：删除 `CompatAsterReplyMessage` wrapper；`ReplyAttemptInput` 的旧 `CompatAster` 分支改为 `ActionRequiredResponse`，Aster `MessageContent::ActionRequired` 构造只留在 `agent_reply_stream` 内部函数 `build_aster_action_required_response_message(...)`。
- `completed`：`confirm_aster_tool_action(...)` 改名为 `submit_tool_action_confirmation(...)`；Aster permission confirmation 仍是内部实现细节，不再从 request policy façade 暴露旧命名。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 runtime_state action response 守卫，并新增 `request_tool_policy action response façade 不得暴露 Aster wrapper 命名`，禁止旧 `CompatAster*` / `stream_aster_message_reply_with_policy` / `confirm_aster_tool_action` 回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：action response 对外和 façade 命名只表达 current `ActionRequiredResponseInput` / confirmation 语义。
- `compat`：Aster action-required message 和 permission confirmation 仍在 `agent_reply_stream` 内部转换；退出条件是 action response 进入 current executor / action manager，不再走 Aster `Agent::reply` 或 `handle_confirmation`。
- `dead`：`CompatAsterReplyMessage`、`CompatAster` enum 分支、`compat_aster_elicitation_response_message(...)`、`stream_aster_message_reply_with_policy(...)`、`confirm_aster_tool_action(...)` 不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `SessionProviderHandle` / `Agent::reply_with_provider` adapter 与 `agent_reply_stream` 的 Aster event stream 投影。

## 2026-07-05 进度记录：provider reply handle 旧 session 命名删除

- `completed`：`SessionProviderHandle` 改名为 `RuntimeProviderReplyHandle`，`create_session_provider_handle(...)` 改名为 `create_runtime_provider_reply_handle(...)`，`reply_stream_with_agent(...)` 改名为 `stream_reply_with_agent(...)`；名称只描述 pinned provider 的 reply stream adapter，不再误导为 session 事实源。
- `completed`：`provider_configuration.rs`、`request_tool_policy.rs`、`agent_reply_stream.rs`、`credential_bridge.rs` 批量迁到新 handle 名称；旧 `SessionProviderHandle` / `create_session_provider_handle` 在 `lime-agent/src` 已归零。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 改为要求 `RuntimeProviderReplyHandle` / `create_runtime_provider_reply_handle(...)` / `stream_reply_with_agent(...)`，并禁止旧 `SessionProviderHandle` / `create_session_provider_handle(...)` / `reply_stream_with_agent(...)` 回流。
- `guarded`：旧 provider factory forbidden snippet 从宽泛 `create_runtime_provider` 收窄为 `create_runtime_provider(`，避免误伤 current reply handle 命名，同时继续禁止旧 public factory 恢复。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration --lib` 通过，3 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：provider route/config DTO 仍是 current 调用面；调用方只看 `RuntimeProviderReplyHandle`，不接触裸 Aster `Provider`。
- `compat`：`credential_bridge/runtime_provider_adapter.rs` 内部仍通过 `aster::providers::create(...)` 和 `Agent::reply_with_provider(...)` 执行 pinned provider stream；退出条件仍是 current provider stream / turn executor 接管。
- `dead`：旧 `SessionProviderHandle` 命名、`create_session_provider_handle(...)`、`reply_stream_with_agent(...)` 不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `runtime_provider_adapter.rs` 的 Aster provider creation 与 `agent_reply_stream.rs` 的 Aster event stream projection。

## 2026-07-05 进度记录：Aster reply message adapter 从主 stream 文件拆出

- `checked`：`credential_bridge/provider_safety.rs` 仍是 pinned provider stream 所需的 Aster `Provider` trait wrapper；在 current provider stream / turn executor 未接管前不能直接删除，否则主 turn 会断。
- `completed`：新增 `request_tool_policy/aster_reply_adapter.rs`，集中承接 `ReplyAttemptInput -> Aster Message`、action-required response message 构造、tool action confirmation、cancelled turn marker 写入和 inline provider error 提取。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 删除 `Message::user()` / `Message::assistant()` / `MessageContent::ActionRequired` / `PermissionConfirmation` / `SessionManager::add_message` 等 Aster message/action/cancel marker 构造逻辑，只保留 stream loop、idle timeout、runtime event projection 和 pinned provider stream 调用。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `mod aster_reply_adapter;` 存在，并禁止 `agent_reply_stream.rs` 重新承接 Aster message/action/cancel marker helper；Aster reply stream loop 仍受 `agent_reply_stream` adapter 边界保护。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`request_tool_policy.rs` 继续作为策略编排 façade；`agent_reply_stream.rs` 作为流控 adapter；Aster message/action/cancel marker 仅在 `aster_reply_adapter.rs` 内部转换。
- `compat`：`aster_reply_adapter.rs` 仍使用 Aster `Message` / `PermissionConfirmation` / `SessionManager`，退出条件是 current action manager 与 turn executor 接管后删除。
- `dead`：让 `agent_reply_stream.rs` 重新构造 Aster user/action/cancel marker message 或直接处理 permission confirmation 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先把 Aster event projection 从 `agent_reply_stream.rs` 压到更窄 adapter，或实现 current provider stream 以删除 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：runtime status Aster 持久化拆出

- `completed`：新增 `request_tool_policy/runtime_status_adapter.rs`，集中承接 `AgentRuntimeStatus -> Aster runtime item` 写入、`to_aster_session_config(...)` 转换和 `project_aster_runtime_event(...)` 投影。
- `completed`：`request_tool_policy/runtime_status.rs` 删除 Aster `Agent`、`project_aster_runtime_event`、`to_aster_session_config` 和 `RuntimeAgentEvent` import，只保留 current `AgentRuntimeStatus` 构造、diagnostics metadata 和 Soul style 文案变换。
- `completed`：`request_tool_policy.rs` 与 `agent_reply_stream.rs` 改从 `runtime_status_adapter` 调用 `emit_runtime_status_with_projection(...)`，从 `runtime_status` 只 import纯状态构造函数。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 `runtime status 投影不得重新要求 Aster SessionConfig`，禁止 `runtime_status.rs` 重新持有 Aster 持久化 / projection 细节，并要求 `runtime_status_adapter.rs` 作为唯一 Aster runtime status adapter。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_status --lib` 通过，12 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：runtime status 文案和 DTO 构造归属 `runtime_status.rs`。
- `compat`：Aster runtime item 写入与 event projection 只留在 `runtime_status_adapter.rs`；退出条件是 current runtime timeline writer 接管后删除。
- `dead`：让 `runtime_status.rs` 重新 import Aster、构造 Aster SessionConfig 或直接投影 Aster event 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先收缩 `agent_reply_stream.rs` 中 Aster event projection，或推进 current provider stream 以删除 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：Aster event projection adapter 从主 stream 文件拆出

- `completed`：新增 `request_tool_policy/aster_event_adapter.rs`，集中承接 `AsterAgentEvent -> RuntimeAgentEvent` 投影，并在该 adapter 内组合 auto-compaction 投影状态与 `project_aster_runtime_event(...)`。
- `completed`：`agent_reply_stream.rs` 删除对 `AutoCompactionProjectionState`、`project_aster_auto_compaction_event(...)`、`project_aster_runtime_event(...)` 的直接依赖；主 stream 文件现在只持有 `RuntimeEventProjector` 并消费 current `RuntimeAgentEvent`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 reply stream 守卫，禁止 `agent_reply_stream.rs` 重新承接 Aster event projection，并要求 `aster_event_adapter.rs` 持有 `project_aster_runtime_event` / `project_aster_auto_compaction_event` / `AutoCompactionProjectionState`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent auto_compaction --lib` 通过，4 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`agent_reply_stream.rs` 继续只负责流控、timeout、retry/web retrieval 状态消费和 current `RuntimeAgentEvent` 后处理。
- `compat`：Aster event 投影集中在 `aster_event_adapter.rs`；退出条件是 current provider stream / turn executor 直接产出 `RuntimeAgentEvent` 后删除。
- `dead`：让 `agent_reply_stream.rs` 重新 import `aster_runtime_projection`、直接持有 `AutoCompactionProjectionState` 或直接调用 `project_aster_runtime_event(...)` 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先把剩余 `Agent::reply(...)` / `to_aster_session_config(...)` 调用压进单一 reply execution adapter，随后替换 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：Aster reply stream 创建下沉到 reply adapter

- `completed`：`request_tool_policy/aster_reply_adapter.rs` 新增 `start_aster_reply_stream(...)`，集中执行 `AgentSessionConfig -> Aster SessionConfig` 转换、`ReplyAttemptInput -> Aster Message` 转换、pinned provider 分支和 `Agent::reply(...)` stream 创建。
- `completed`：`agent_reply_stream.rs` 删除 `to_aster_session_config(...)` import、`ReplyAttemptInput::into_aster_message()` 调用、`.stream_reply_with_agent(...)` / `.reply(...)` 直接分支；主 stream 文件只调用 `start_aster_reply_stream(...)` 获取 stream 和消息长度。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 reply stream 守卫，禁止 `agent_reply_stream.rs` 重新出现 `to_aster_session_config`、`into_aster_message`、`.stream_reply_with_agent(`、`.reply(`、`BoxStream<`、`AsterAgentEvent`；并要求这些 Aster stream 创建细节留在 `aster_reply_adapter.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`agent_reply_stream.rs` 只处理 current stream policy、timeout、diagnostics、web retrieval 状态和 RuntimeEvent 后处理。
- `compat`：Aster reply stream 创建集中在 `aster_reply_adapter.rs`；退出条件是 current turn executor / provider stream 接管后删除。
- `dead`：让 `agent_reply_stream.rs` 重新直接构造 Aster SessionConfig、Aster Message 或调用 Aster reply stream 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先把 `Agent` 参数本身从 `agent_reply_stream.rs` 收进更小 execution adapter，或实现 current provider stream 以删除 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：agent_reply_stream 不再直接依赖 Aster Agent

- `completed`：`request_tool_policy/aster_reply_adapter.rs` 新增 `AsterReplyRuntimeHost<'a>`，封装 `&aster::Agent` 并提供 `start_reply_stream(...)` adapter 方法。
- `completed`：`request_tool_policy.rs` 在 policy execution 外层创建一次 `AsterReplyRuntimeHost::new(agent)`，first attempt 与四条 retry path 全部传 `&reply_host`，不再把裸 Aster `Agent` 传入 `agent_reply_stream.rs`。
- `completed`：`agent_reply_stream.rs` 的 `stream_agent_reply_once(...)` 参数从 `agent: &Agent` 改为 `host: &AsterReplyRuntimeHost<'_>`；该文件删除 `use aster::agents::Agent`，只通过 host 创建 reply stream 和写 runtime status。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 reply stream 守卫，禁止 `agent_reply_stream.rs` 重新出现 `use aster::agents::Agent` / `agent: &Agent`，并要求 `AsterReplyRuntimeHost` / `.start_reply_stream(...)` 调用面存在。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`agent_reply_stream.rs` 继续作为 stream policy loop，只依赖 current `RuntimeAgentEvent` 和 `AsterReplyRuntimeHost` adapter trait-like wrapper。
- `compat`：裸 `aster::Agent` 只留在 `aster_reply_adapter.rs`、`runtime_status_adapter.rs` 和外层 policy façade；退出条件是 current runtime host / turn executor 接管后删除这些 adapter。
- `dead`：让 `agent_reply_stream.rs` 重新直接依赖裸 Aster `Agent` 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先评估是否能把 `runtime_status_adapter.rs` 内联进 host adapter，或继续替换 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：AsterReplyRuntimeHost 不再暴露裸 Agent

- `completed`：`AsterReplyRuntimeHost` 删除 `agent()` raw escape 方法，新增 `emit_runtime_status(...)`，把 runtime status Aster 写入从 `agent_reply_stream.rs` 调用面收回 host 内部。
- `completed`：`agent_reply_stream.rs` 删除 `emit_runtime_status_with_projection` import 和 `host.agent()` 调用；web retrieval synthesis runtime status 现在只调用 `host.emit_runtime_status(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `agent_reply_stream.rs` 出现 `host.agent()`，并禁止 `AsterReplyRuntimeHost` 重新暴露 `pub(super|crate) fn agent(&self)`；要求 host 提供 `emit_runtime_status`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`agent_reply_stream.rs` 对 host 只调用高层 stream/status 方法，不再取回 Aster `Agent`。
- `compat`：`AsterReplyRuntimeHost` 内部仍持有 Aster `Agent`，退出条件是 current runtime host / turn executor 接管后删除。
- `dead`：重新向 policy loop 暴露裸 Aster `Agent` 的 host escape 不得恢复。
- `next`：继续主 turn stream 退场，优先评估是否能把 `runtime_status_adapter.rs` 内联进 `aster_reply_adapter.rs` 或继续替换 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs`。

## 2026-07-05 进度记录：runtime_status_adapter 并入 AsterReplyRuntimeHost

- `completed`：删除 `request_tool_policy/runtime_status_adapter.rs`；runtime status Aster item upsert、`to_aster_session_config(...)` 转换和 `project_aster_runtime_event(...)` 投影并入 `AsterReplyRuntimeHost::emit_runtime_status(...)`。
- `completed`：`request_tool_policy.rs` 删除 `mod runtime_status_adapter;` 和 `emit_runtime_status_with_projection` import；`maybe_emit_runtime_status_with_projection(...)` 改名为 `maybe_emit_runtime_status(...)`，并通过 `AsterReplyRuntimeHost` 写入 runtime status。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `runtime_status_adapter.rs` 保持删除态，并把 runtime status Aster 持久化的允许边界切到 `aster_reply_adapter.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_status --lib` 通过，12 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：`runtime_status.rs` 继续只承接 current `AgentRuntimeStatus` 文案与 DTO 构造。
- `compat`：Aster runtime status 写入集中在 `AsterReplyRuntimeHost`；退出条件是 current runtime host / timeline writer 接管后删除。
- `dead`：额外恢复 `runtime_status_adapter.rs` 作为第二个 Aster status adapter 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先评估 `request_tool_policy/web_search_preflight.rs` 的 Aster Agent 依赖是否能收进同一 host，或推进 `RuntimeProviderReplyHandle` / `runtime_provider_adapter.rs` / `provider_safety.rs` 替换。

## 2026-07-05 进度记录：WebSearch preflight 不再直接持有裸 Aster Agent

- `completed`：`request_tool_policy/web_search_preflight.rs` 的 `WebSearchPreflightRequest` 从 `agent: &Agent` 改为 `host: &AsterReplyRuntimeHost`，预检索只通过 host 获取 tool registry，不再 import `aster::agents::Agent`。
- `completed`：`request_tool_policy.rs` 在 preflight 前创建 `AsterReplyRuntimeHost`，preflight 与后续 reply stream 共享同一 host adapter；`agent_reply_stream.rs` 仍不接触裸 Agent。
- `completed`：`PreflightToolExecution`、`WebSearchPreflightRequest`、`execute_web_search_preflight_if_needed(...)` 与 `merge_system_prompt_with_web_search_preflight_context(...)` 收窄为 crate 内部调用；`lime_agent` 根 re-export 删除 preflight 迁移期 API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展守卫，禁止 `web_search_preflight.rs` 重新出现 `use aster::agents::Agent`、`agent: &Agent`、`agent.tool_registry()` 或 `WebSearchPreflightRequest { agent ... }`，并禁止根 `lime_agent` public API 恢复 preflight helper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight --lib` 通过，7 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：WebSearch preflight 仍是 request_tool_policy 内部策略能力，只产出 current `RuntimeAgentEvent`、prompt appendix 与 coverage summary。
- `compat`：Aster tool registry 访问集中在 `AsterReplyRuntimeHost::tool_registry()`；退出条件是 current tool runtime registry 接管后删除该 host 方法。
- `dead`：preflight 作为 `lime_agent` public API、直接拿裸 Aster `Agent`、或让调用方自行访问 `agent.tool_registry()` 的形态不得恢复。
- `next`：继续主 turn stream 退场，优先处理 `RuntimeProviderReplyHandle` / `credential_bridge/runtime_provider_adapter.rs` / `credential_bridge/provider_safety.rs` 这条 pinned provider stream compat 链，最终删除 `lime-agent` 对 Aster `Provider` trait 的直接依赖。

## 2026-07-05 进度记录：provider reply handle 从 agent_reply_stream 调用面下沉

- `completed`：`AsterReplyRuntimeHost` 新增 `with_reply_provider(...)` 与 `uses_pinned_provider()`，内部持有 `Option<RuntimeProviderReplyHandle>`；pinned provider 分支只在 `aster_reply_adapter.rs` 内部传给 `start_aster_reply_stream(...)`。
- `completed`：`agent_reply_stream.rs` 删除 `RuntimeProviderReplyHandle` import 和 `provider: Option<RuntimeProviderReplyHandle>` 参数；主 stream loop 只通过 `host.start_reply_stream(...)` 创建 stream，并通过 `host.uses_pinned_provider()` 记录诊断。
- `completed`：`request_tool_policy.rs` 在外层根据 provider 构造 host，retry path 不再反复 clone / 传递 provider handle。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `agent_reply_stream.rs` 重新出现 `RuntimeProviderReplyHandle`，并要求 provider handle 只留在 `aster_reply_adapter.rs` 的 host compat 边界。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：`agent_reply_stream.rs` 继续只处理 current stream loop、diagnostics、tool attempt tracking 和 RuntimeEvent 后处理。
- `compat`：pinned provider stream handle 仍在 `AsterReplyRuntimeHost` / `credential_bridge/runtime_provider_adapter.rs` 内部，退出条件是 current provider stream executor 接管后删除。
- `dead`：让 `agent_reply_stream.rs` 重新接收 provider handle 或 import `RuntimeProviderReplyHandle` 的形态不得恢复。
- `next`：继续 provider compat 链收口，优先判断是否能把 `request_tool_policy.rs` 外层的 provider 参数也收成 host factory，随后替换或删除 `credential_bridge/provider_safety.rs`。

## 2026-07-05 进度记录：request_tool_policy 私有执行器改为只接收 runtime host

- `completed`：`stream_message_reply_with_policy_with_options(...)` 私有执行器从 `agent: &Agent + provider: Option<RuntimeProviderReplyHandle>` 改为只接收 `&AsterReplyRuntimeHost`。
- `completed`：四个外层入口在边界处立即构造 host；普通回复 / action response 使用 `AsterReplyRuntimeHost::new(...)`，pinned provider 回复使用 `AsterReplyRuntimeHost::with_reply_provider(...)`。
- `completed`：取消回合上下文 marker 写入改为 `reply_host.persist_cancelled_turn_context_marker(...)`；私有执行器不再直接调用 Aster cancel marker helper。
- `completed`：`provider_stream_idle` test-only fixture 改为通过 host 调用私有执行器，保留测试里的 Aster provider fixture 只用于模拟 idle stream。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止私有 stream 执行器重新接收 `agent: &Agent` / `provider: Option<RuntimeProviderReplyHandle>`，并禁止主策略文件直接调用 `persist_cancelled_turn_context_marker(agent...)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：`request_tool_policy.rs` 私有执行器只编排 current request policy / retry / diagnostics / runtime event 后处理。
- `compat`：裸 Aster `Agent` 仍存在于外层入口参数和 `AsterReplyRuntimeHost` 内部；退出条件是 current turn executor/runtime host 接管外层入口。
- `dead`：私有 stream 执行器重新同时持有裸 Agent 和 provider handle 的形态不得恢复。
- `next`：继续向 provider compat 链推进，优先处理 `credential_bridge/runtime_provider_adapter.rs` 与 `provider_safety.rs` 的 Aster `Provider` trait wrapper。

## 2026-07-05 进度记录：Aster reply adapter 内部 helper 私有化

- `completed`：`start_aster_reply_stream(...)` 从 `pub(super)` 改为 adapter 私有函数，只能由 `AsterReplyRuntimeHost::start_reply_stream(...)` 调用。
- `completed`：裸函数版 `persist_cancelled_turn_context_marker(agent, ...)` 从 `pub(super)` 改为 adapter 私有函数；主策略执行器只能通过 `reply_host.persist_cancelled_turn_context_marker(...)` 写取消 marker。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `pub(super) async fn start_aster_reply_stream` 与 `pub(super) async fn persist_cancelled_turn_context_marker(agent...)` 回流。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：调用方只通过 `AsterReplyRuntimeHost` 访问 reply stream、tool registry、runtime status 和 cancel marker 这些迁移期能力。
- `compat`：Aster `Agent::reply(...)`、`SessionManager::add_message(...)` 和 provider branch 仍局限在 `aster_reply_adapter.rs` 内部；退出条件是 current turn executor/runtime host 接管。
- `dead`：其它 request_tool_policy 子模块绕过 host 直接调用 Aster reply/cancel helper 的形态不得恢复。
- `next`：`provider_safety.rs` 当前只剩 Aster trait wrapper；无 Aster provider safety 规则已经在 `model-provider::safety`。删除它必须先有 current provider stream executor，否则 pinned provider 主 turn 会断。

## 2026-07-05 进度记录：request_tool_policy 模块路径从 lime-agent public API 下线

- `completed`：`lime-rs/crates/scheduler/src/task_context.rs` 从 `lime_agent::request_tool_policy::{...}` 迁到 `lime_agent::{...}` 根 API；测试中的 `REQUEST_TOOL_POLICY_MARKER` 也改走根 re-export。
- `completed`：`lime-agent` 根 `pub mod request_tool_policy` 改为私有 `mod request_tool_policy`，只保留 current 需要的根 re-export。
- `completed`：`ToolAttemptRecord` 无外部消费者，停止从 `request_tool_policy.rs` re-export，消除模块私有化后的 unused warning。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `pub mod request_tool_policy;` 回流，避免外部 crate 重新挂靠迁移期模块路径。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package lime-scheduler` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-scheduler --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，73 tests passed。
- `current`：跨 crate 只能通过 `lime_agent` 根 re-export 使用 request tool policy 的 current DTO / helper。
- `compat`：request_tool_policy 内部仍有 Aster reply adapter；退出条件是 current turn executor/runtime host 接管后删除。
- `dead`：`lime_agent::request_tool_policy::*` 作为跨 crate public module path 不得恢复。
- `next`：继续压缩剩余 public module surface 与 provider compat 链；真正删除 `provider_safety.rs` 仍需 current provider stream executor。

## 2026-07-05 进度记录：WebSearch attempt record 从 public surface 降级

- `completed`：`ToolAttemptRecord` 从 `pub struct` 改为 `pub(crate) struct`，字段也收窄为 `pub(crate)`；该类型仅服务 `WebSearchExecutionTracker` 内部记录，不再作为跨 crate API。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `ToolAttemptRecord` 重新出现在 `lime-agent` 根 re-export 或恢复 `pub struct ToolAttemptRecord`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package lime-scheduler` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-scheduler --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `current`：跨 crate 仍只消费 `WebSearchExecutionTracker` 与 request policy DTO。
- `dead`：`ToolAttemptRecord` 作为可外部依赖的 public API 不得恢复。
- `next`：继续 provider compat 链或外层裸 Aster Agent 入口替换；`provider_safety.rs` 删除仍受 current provider stream executor 缺口阻塞。

## 2026-07-05 进度记录：provider compat 合并到唯一 runtime adapter

- `completed`：`RuntimeProviderReplyHandle` 改为 `ConfiguredReplyProvider`，`create_runtime_provider_reply_handle(...)` 改为 `create_configured_reply_provider(...)`；调用面表达“当前回合配置好的 reply provider”，不再暴露旧 handle 语义。
- `completed`：删除 `credential_bridge/provider_safety.rs` 独立 Aster wrapper 文件，把工具消息归一化、fast model 禁用、session name generation 兼容逻辑并入 `credential_bridge/runtime_provider_adapter.rs`；Aster `Provider` trait 现在只剩一个 credential bridge adapter 文件持有。
- `completed`：`provider_configuration.rs`、`request_tool_policy.rs` 和 `aster_reply_adapter.rs` 改为只接收 / 持有 `ConfiguredReplyProvider`；裸 `Arc<dyn aster::Provider>` 仍不外泄。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `provider_safety.rs` 顶层或 credential_bridge 子模块恢复，禁止 `mod provider_safety;` 回流，并把旧 `RuntimeProviderReplyHandle` / `create_runtime_provider_reply_handle(...)` 加入 provider adapter forbidden snippet。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_provider_adapter --lib` 通过，12 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `current`：provider route/config DTO 仍由 `model-provider::RuntimeProviderConfig` 与 `SessionProviderConfig` 表达，业务调用面只看 `ConfiguredReplyProvider`。
- `compat`：`runtime_provider_adapter.rs` 内部仍调用 `aster::providers::create(...)`、实现 Aster `Provider` wrapper，并通过 `Agent::reply_with_provider(...)` 启动 pinned provider stream；退出条件是 current provider stream / turn executor 接管。
- `dead`：`credential_bridge/provider_safety.rs`、`RuntimeProviderReplyHandle`、`create_runtime_provider_reply_handle(...)` 和旧 provider handle 命名不得恢复。
- `next`：继续主 turn stream 退场，优先把 `request_tool_policy.rs` 外层 `&aster::Agent` 入口收进 current runtime host / turn executor；完成后才能删除 `runtime_provider_adapter.rs` 与 workspace Aster dependency。

## 2026-07-05 进度记录：request_tool_policy wrapper 迁入 Aster reply adapter

- `completed`：`stream_reply_with_policy(...)`、`stream_message_reply_with_policy(...)`、`stream_action_required_response_with_policy(...)`、`stream_reply_with_policy_and_provider(...)` 与 direct generation provider wrapper 从 `request_tool_policy.rs` 移入 `request_tool_policy/aster_reply_adapter.rs`。
- `completed`：`request_tool_policy.rs` 生产部分删除 `use aster::agents::Agent` 与 `ConfiguredReplyProvider` import，只保留 current policy / retry / diagnostics 编排和对 adapter wrapper 的 re-export。
- `completed`：`stream_message_reply_with_policy_with_options(...)` 和 `StreamReplyPolicyExecutionOptions` 恢复为模块私有；Aster adapter 作为子模块访问父模块私有执行器，不再把 host/input 类型提升到 crate 可见。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `request_tool_policy.rs` 生产部分重新出现 `use aster::agents::Agent`、`agent: &Agent` 或 `ConfiguredReplyProvider`；wrapper 签名检查改到 `aster_reply_adapter.rs`，主文件只要求 re-export。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `current`：`request_tool_policy.rs` 只负责 request policy / retry / diagnostics / runtime event 后处理。
- `compat`：裸 Aster `Agent`、Aster message 构造、Aster session config 转换和 configured provider branch 统一留在 `aster_reply_adapter.rs`；退出条件是 current runtime host / turn executor 接管。
- `risk`：`request_tool_policy.rs` 仍超过 1000 行；本刀只迁出 wrapper、未追加新业务逻辑。下一次触碰该文件应优先继续把测试 fixture / retry 场景或 diagnostics helper 拆出，直到主文件低于治理阈值。
- `dead`：主策略文件重新直接接收裸 Aster `Agent` 或 provider adapter 的 wrapper 形态不得恢复。
- `next`：继续主 turn stream 退场，下一刀优先把 `turn_execution.rs` / `direct_text_generation.rs` 的 provider 分支改为更高层的 current reply execution API，减少调用方对 provider adapter wrapper 名称的感知。

## 2026-07-05 进度记录：主执行链隐藏 provider adapter handle

- `completed`：`ConfiguredSessionProvider` 字段收窄为私有字段，调用面只能通过 `into_config()` 取回 current `SessionProviderConfig`；`ConfiguredReplyProvider` clone 留在内部 adapter。
- `completed`：`request_tool_policy/aster_reply_adapter.rs` 把 provider wrapper 改为 `stream_reply_with_policy_and_configured_provider(...)` 与 direct generation 版本，参数接收 `ConfiguredSessionProvider`，不再把 `ConfiguredReplyProvider` 暴露给 `turn_execution.rs` / `direct_text_generation.rs`。
- `completed`：`turn_execution.rs` 与 `direct_text_generation.rs` 不再 import / 解构 `ConfiguredSessionProvider { provider, .. }`，不再直接调用 `provider.clone()`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止主执行链恢复旧 `stream_reply_with_policy_and_provider(...)` wrapper、`ConfiguredReplyProvider` import、provider 解构和 `provider.clone()`；同时禁止 `ConfiguredSessionProvider` 字段重新变成 `pub(crate)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_provider_adapter --lib` 通过，12 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `verified`：`git diff --check -- <本刀 tracked 写集>` 通过；未跟踪 `aster_reply_adapter.rs` 额外用行尾空白扫描覆盖，只有路线图文件头部既有 Markdown 换行空格。
- `current`：turn/direct generation 调用面只感知 current session provider 配置对象与 `SessionProviderConfig` 输出。
- `compat`：Aster `ConfiguredReplyProvider` 仍存在于 `provider_configuration.rs` 与 `aster_reply_adapter.rs` 内部；退出条件是 current provider stream / turn executor 接管。
- `dead`：主执行链直接拿 provider handle 并手动 clone 的形态不得恢复。
- `next`：继续外层裸 Aster `Agent` 入口退场，优先把 `turn_execution.rs` / `direct_text_generation.rs` 的 reply 执行入口收进 current runtime host；随后才能删除 `runtime_provider_adapter.rs` 与 workspace Aster dependency。

## 2026-07-05 进度记录：turn/direct 裸 Agent 入口收进 runtime wrapper

- `completed`：`request_tool_policy/aster_reply_adapter.rs` 新增 `stream_runtime_reply_with_policy(...)`、`stream_runtime_reply_with_configured_provider(...)` 与 direct generation 版本；`AgentRuntimeState -> Aster Agent` 读取集中在 adapter 边界。
- `completed`：`turn_execution.rs` 与 `direct_text_generation.rs` 删除本地 `agent_state.get_agent_arc()` / `agent_guard` / Aster 初始化错误处理，调用面只传 `AgentRuntimeState`、`AgentSessionConfig`、request policy 和 optional `ConfiguredSessionProvider`。
- `completed`：底层 `stream_reply_with_policy_and_configured_provider(...)` 与 direct generation 版本从 crate re-export 收窄为 `aster_reply_adapter.rs` 私有函数，消除 unused public surface。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 turn/direct 重新出现 `get_agent_arc()`、`agent_guard`、裸 `stream_reply_with_policy(...)`、底层 configured-provider wrapper 调用和 `Aster agent` 文案；同时要求 runtime wrapper 留在 `aster_reply_adapter.rs`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib` 通过，2 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_provider_adapter --lib` 通过，12 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `verified`：`git diff --check -- <本刀 tracked 写集>` 通过；未跟踪 `aster_reply_adapter.rs` 额外用行尾空白扫描覆盖，无残留。
- `current`：turn/direct 只消费 runtime-state wrapper，不再直接感知 Aster Agent 生命周期。
- `compat`：Aster `Agent` borrow、Aster message/session conversion、pinned provider branch 仍在 `aster_reply_adapter.rs` 内；退出条件是 current turn executor/runtime host 替换该 adapter。
- `dead`：turn/direct 直接读取 Aster Agent 或直接调用底层 Aster reply wrapper 的形态不得恢复。
- `next`：继续收 `runtime_state.rs` 的 action-required response 裸 Agent 入口，或推进 current turn executor 接管 `aster_reply_adapter.rs`，为删除 `runtime_provider_adapter.rs` / workspace Aster dependency 做准备。

## 2026-07-05 进度记录：按 Codex response-op 模式收口 action-required 恢复入口

- `codex-reference`：`/Users/coso/Documents/dev/rust/codex/codex-rs/protocol/src/protocol.rs` 把 approval / elicitation / user-input / permissions 恢复表达为 `Op::ExecApproval`、`Op::PatchApproval`、`Op::ResolveElicitation`、`Op::UserInputAnswer`、`Op::RequestPermissionsResponse` 等 current operation；`core/src/session/handlers.rs` 统一在 session handler 内消费这些 op。
- `codex-reference`：`mcp-server/src/exec_approval.rs` 与 `core/src/codex_delegate.rs` 都是把外部响应转换成 `codex.submit(Op::...)`，不让外层直接操作底层 execution / approval object。
- `completed`：`runtime_state.rs` 的 `submit_elicitation_response(...)` 改为调用 `stream_runtime_action_required_response_with_policy(...)`，不再自己读取 Aster Agent 或调用底层 `stream_action_required_response_with_policy(...)`。
- `completed`：`runtime_state.rs` 的 `confirm_tool_action(...)` 改为调用 `submit_runtime_tool_action_confirmation(...)`，不再自己读取 Aster Agent 或直接调用底层 confirmation helper。
- `completed`：`request_tool_policy/aster_reply_adapter.rs` 新增 action response / confirmation runtime wrapper；底层 `stream_action_required_response_with_policy(...)` 与 `submit_tool_action_confirmation(...)` 收窄为 adapter 私有函数。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 对 `submit_elicitation_response(...)` 到 `sync_mcp_bridges(...)` 的 action response 切片增加守卫，禁止恢复 `get_agent_arc()`、`agent_guard`、底层 stream/confirmation helper 和 `Agent not initialized` 这类 Aster runtime 直连形态。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，74 tests passed。
- `blocked-verification`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 被 `app-server-protocol/src/protocol/v0/catalog.rs` 阻断：缺少 `RequestId`、`JsonRpcRequest`、`JsonRpcNotification` 导入。该文件不属于本刀认领写集，暂不接管。
- `current`：runtime_state 只提交 current action response / confirmation wrapper，符合 Codex response-op 边界。
- `compat`：Aster ActionRequired message 构造和 permission confirmation 仍局限在 `aster_reply_adapter.rs` 内；退出条件是 current turn executor/runtime host 接管该 adapter。
- `dead`：runtime_state action response / confirmation 直接读取 Aster Agent 或直接调用 Aster adapter 私有 helper 的形态不得恢复。
- `next`：若并行进程修复 app-server-protocol 编译阻塞，补跑 `cargo check -p lime-agent --lib` 与相关 Rust 定向测试；随后继续把 remaining `runtime_state.rs` 的非 action-response Aster lifecycle 入口分类为 current owner / compat adapter / dead。

## 2026-07-05 进度记录：MCP bridge 注册收进 runtime registry

- `codex-reference`：参考 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/state/service.rs` 的 `SessionServices` 模式，运行时服务持有底层 manager/client 状态，session/runtime state 只做编排，不直接拼底层对象。
- `completed`：新增 `mcp_bridge::McpBridgeRuntimeRegistry`，集中持有已注册 MCP bridge 名称集合，并统一执行 Aster `ExtensionConfig::Builtin` 构造、`McpClientTrait` client 包装、extension manager 注册和 stale extension 清理。
- `completed`：`runtime_state.rs` 的 `registered_mcp_bridges` 字段替换为 `mcp_bridge_registry`；`sync_mcp_bridges(...)` 只读取当前 Agent 并委托 registry 同步 snapshots，不再直接操作 Aster MCP client/config/extension manager。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `runtime_state.rs` 恢复 `registered_mcp_bridges`、`McpClientTrait`、`ExtensionConfig::Builtin`、`.extension_manager`、`.add_client(...)`、`.remove_extension(...)` 或直接 `McpBridgeClient::new(...)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，75 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `current`：`runtime_state.rs` 保持 runtime 状态编排和 current MCP bridge snapshot 同步入口。
- `compat`：Aster extension manager / MCP client trait 接线仍保留在 `mcp_bridge.rs` 内部 runtime registry；退出条件是 current tool runtime / MCP runtime 接管 extension exposure 后删除该 Aster adapter。
- `dead`：`runtime_state.rs` 直接持有 MCP bridge 名称集合并直接构造 Aster extension/client 的形态不得恢复。
- `next`：继续把 `runtime_state.rs` 剩余 Agent lifecycle / native tool hook surface 分类，优先处理可移入小 adapter/service 的 Aster 细节；避免碰并行持有的 App Server protocol 与 session/subagent adapter 热区。

## 2026-07-05 进度记录：native tool overlay 收进 native_tools 边界

- `codex-reference`：延续 Codex service/state 分层思路，状态对象只触发服务安装，底层 tool registry / hook / manager 细节留在对应服务边界。
- `completed`：新增 `native_tools/runtime_overlay.rs`，集中处理 Aster `ToolRegistry` 读取、默认 Write/Edit 覆盖、`WorkspaceToolPolicyInspector`、`ApplyPatchTool`、`SkillSearchTool` 与 `LimeSkillTool` 注入。
- `completed`：`runtime_state.rs` 删除 `configure_lime_native_tool_overlay(...)` 本地实现；Agent 初始化只调用 `crate::native_tools::configure_lime_native_tool_overlay(...)`。
- `completed`：`register_native_tool(...)` 改为先通过 `crate::native_tools::runtime_native_tool_registry(agent)` 捕获 registry handle，再在 native_tools 边界完成注册；生产路径不再直接 `agent.tool_registry().clone()` / `registry.register(tool)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增守卫，禁止 `runtime_state.rs` 生产区恢复 `create_shared_history`、`WriteTool`、`EditTool`、`add_tool_inspector`、`tool_registry()`、`WorkspaceToolPolicyInspector::new`、`ApplyPatchTool`、`SkillSearchTool`、`LimeSkillTool::new` 等 ToolRegistry 细节。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，76 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `current`：`runtime_state.rs` 继续负责 Agent lifecycle 编排和 current native tool gateway 安装入口。
- `compat`：Aster `ToolRegistry` 与 Aster built-in tool overlay 仍在 `native_tools/runtime_overlay.rs` 内部；退出条件是 current tool runtime 接管 native tool registration 后删除该 Aster adapter。
- `dead`：runtime_state 直接覆盖 Aster 默认工具、直接注册 Aster tool registry 的形态不得恢复。
- `next`：继续收 `install_live_execution_process_gateway(...)`，把 `set_native_tool_execution_hook(...)` 从 runtime_state 迁入 `live_execution_process` adapter，并同步收窄守卫允许列表。

## 2026-07-05 进度记录：live execution hook 安装收进 adapter

- `completed`：`live_execution_process.rs` 新增 `install_runtime_live_execution_process_hook(...)`，集中创建 `RuntimeLiveExecutionProcessHook` 并调用 Aster `set_native_tool_execution_hook(...)`。
- `completed`：`runtime_state.rs` 的 `install_live_execution_process_gateway(...)` 只委托 live execution adapter 安装 hook，不再直接构造 Aster hook 或调用 `set_native_tool_execution_hook(...)`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `ASTER_LIVE_EXECUTION_HOOK_ALLOWED_FILES` 收窄为仅允许 `live_execution_process.rs` 持有 `NativeToolExecutionHook` / `NativeToolExecutionRequest` / `ToolCallResult` / `set_native_tool_execution_hook`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，76 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `current`：App Server / runtime backend 只实现 `LiveExecutionProcessGateway`；runtime_state 只负责把 gateway 交给当前 Agent lifecycle。
- `compat`：Aster native hook trait 实现仍局限在 `live_execution_process.rs` adapter；退出条件是 current tool runtime 接管 live execution process plumbing。
- `dead`：runtime_state 或 App Server 直接持有 Aster native hook 类型 / 安装 API 的形态不得恢复。
- `next`：继续评估 `runtime_state.rs` 剩余 `get_agent_arc()` / `with_agent_mut(...)` 公共面；能收窄到 crate-private adapter 的先收窄，暂不碰 session/subagent 并行热区。

## 2026-07-05 进度记录：skill_execution 裸 Agent 读取收进 reply runtime wrapper

- `completed`：`request_tool_policy/aster_reply_adapter.rs` 新增 `stream_runtime_message_reply_with_policy(...)`，支持传入 current `ReplyInput` 并在 adapter 内部读取 Aster Agent。
- `completed`：`skill_execution.rs` 删除 `runtime_state.get_agent_arc()` / `agent_guard` / 裸 Agent 读取，改为调用 runtime-level ReplyInput wrapper；未初始化错误仍映射为 `SkillExecutionError::SessionInitFailed`，避免行为语义漂移。
- `completed`：`stream_message_reply_with_policy` 生产 re-export 收窄为 `#[cfg(test)]`，避免 skill_execution 继续消费底层 Aster wrapper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `skill_execution.rs` 恢复 `get_agent_arc()`、`agent_guard` 或直接调用底层 `stream_message_reply_with_policy(...)`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过，无 warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，76 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy --lib` 通过，7 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_execution --lib` 通过，7 tests passed。
- `current`：skill execution 只消费 current ReplyInput / AgentSessionConfig / request tool policy façade。
- `compat`：Aster Agent borrow、Aster Message 构造和 stream polling 仍集中在 `request_tool_policy/aster_reply_adapter.rs` 与 `agent_reply_stream.rs`；退出条件是 current turn executor/provider stream 接管。
- `dead`：skill_execution 直接读取 Aster Agent 或直接调用底层 stream wrapper 的形态不得恢复。
- `next`：继续处理 `workspace_patch_host.rs` 与 `tool_inventory_runtime_snapshot.rs` 的 `get_agent_arc()`，优先把 tool registry snapshot / batch execution 所需的 Aster registry 读取收进 native_tools 或 agent_tools adapter。

## 2026-07-05 进度记录：清理已迁 runtime public wrapper 与 tool inventory Aster DTO 外泄

- `completed`：`AgentRuntimeState::get_agent_arc(...)` 从跨 crate public API 收窄为 `pub(crate)`；App Server 测试改用 current 查询方法 `contains_native_tool(...)`，不再跨 crate 读取 Aster Agent / ToolRegistry。
- `completed`：删除无外部消费者的 `AgentRuntimeState::with_agent_mut(...)` public wrapper；`install_live_execution_process_gateway(...)` 直接在 runtime_state 内拿锁并委托 `live_execution_process` adapter，不再保留可泛用的 `&mut Agent` escape hatch。
- `completed`：新增 `agent_tools/tool_inventory_runtime_adapter.rs`，集中读取 Aster Agent registry / extension configs / list_tools；`tool_inventory_runtime_snapshot.rs` 只做 current inventory 输入装配和 MCP bridge merge。
- `completed`：`tool_inventory_runtime_snapshot.rs` 不再公开 `AgentToolInventoryRuntimeSnapshot` 或 `read_agent_tool_inventory_runtime_snapshot(...)`；App Server 只调用 `read_agent_tool_inventory(...)` 并传 `AgentToolInventoryReadInput`，不再拿到 Aster `ToolDefinition` / `ExtensionConfig` DTO 后自行 build inventory。
- `completed`：`agent_tools::inventory::AgentToolInventoryBuildInput` 与 `build_tool_inventory(...)` 收窄为 crate-private，防止 App Server 继续绕过 lime-agent 的 Aster adapter 直接消费 Aster DTO。
- `completed`：`agent_tools::tool_inventory_runtime_snapshot` 模块从 public 改为 private，只从 `agent_tools` 顶层 re-export `read_agent_tool_inventory(...)` 与 `AgentToolInventoryReadInput` current API，避免把 `runtime_snapshot` 旧实现名当跨 crate 入口。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 public `get_agent_arc`、`with_agent_mut`、公开 runtime snapshot 和 snapshot 里直接读取 Aster Agent。
- `guarded`：`src/lib/governance/appServerRuntimeBoundary.test.ts` 更新 App Server tool inventory 边界，要求只调用 `read_agent_tool_inventory(...)`，禁止恢复 `build_tool_inventory(...)` / `AgentToolInventoryBuildInput` 作为 App Server 入口；同时把 provider / turn execution 断言更新到 current `create_configured_reply_provider` 与 `stream_runtime_reply_*`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止恢复 `pub mod tool_inventory_runtime_snapshot`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/governance/appServerRuntimeBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，100 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_inventory --lib` 通过，12 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend_registers --lib` 通过，2 tests passed；仅有既有 `runtime/tests/plugin_worker_turn.rs` dead_code warnings。
- `current`：App Server tool inventory 只消费 Lime-owned `AgentToolInventorySnapshot` read model；native tool 注册断言只通过 current runtime 查询方法。
- `compat`：Aster `ToolDefinition` / `ExtensionConfig` / ToolRegistry / list_tools 仍局限在 `agent_tools::inventory` 和 `tool_inventory_runtime_adapter` 内部；退出条件是 current tool runtime 提供 registry + extension read model 后删除这些 Aster DTO。
- `dead`：跨 crate public `get_agent_arc`、泛用 `with_agent_mut`、App Server 直接 build tool inventory / 消费 Aster inventory DTO 的形态不得恢复。
- `next`：继续收 `workspace_patch_host.rs` 的 `get_agent_arc()`；该文件当前测试区已有并行脏改动，本轮未夹写生产路径，下一轮应在合并窗口把 tool batch execution 的 registry 读取收进 native_tools / agent_tools adapter。

## 2026-07-05 进度记录：workspace patch host tool registry 读取收进 adapter

- `completed`：新增 `agent_tools/workspace_patch_runtime_adapter.rs`，集中读取迁移期 Aster Agent 的 `tool_registry()` 并调用 `execute_planned_tool_batch(...)`。
- `completed`：`workspace_patch_host.rs` 删除 `agent_state.get_agent_arc()` / `agent.tool_registry()` / `ToolExecutionBatchInput` 直接接线；该文件现在只负责 workspace patch host tool request 解析、plan 构造、evidence 回填和 current result DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `workspace_patch_host 不得直接读取 Aster Agent tool registry`，禁止 `workspace_patch_host.rs` 恢复 `get_agent_arc()`、`tool_registry()`、`execute_planned_tool_batch` 或 `ToolExecutionBatchInput` 直接调用，并要求 Aster registry 读取留在 `workspace_patch_runtime_adapter.rs`。
- `current`：workspace patch host plan / evidence / article search 回填继续归属 `workspace_patch_host.rs`。
- `compat`：Aster ToolRegistry batch execution 只允许停留在 `workspace_patch_runtime_adapter.rs`；退出条件是 `tool-runtime` 接管 tool registry / batch execution 后删除该 adapter。
- `dead`：workspace patch host 生产路径直接读取 Aster Agent 或直接拼 `ToolExecutionBatchInput` 的形态不得恢复。
- `next`：继续 tool/runtime 面收口，优先把 `tool_orchestrator.rs` 的 Aster `ToolRegistry` / `ToolContext` 执行核心迁向 `tool-runtime` current 接口，或回到主 turn stream 的 `runtime_provider_adapter.rs` / `aster_reply_adapter.rs` 退场。

## 2026-07-05 进度记录：tool execution policy DTO 迁入 tool-runtime

- `completed`：新增 `tool-runtime::execution_policy`，承接 `ToolExecutionWarningPolicy`、`ToolExecutionRestrictionProfile`、`ToolExecutionSandboxProfile`、`ToolExecutionPolicySource`、`ToolExecutionPolicy` 与 `ToolExecutionPolicyResolution` 这组工具执行策略 DTO。
- `completed`：`lime-agent::agent_tools::execution::policy` 删除上述 DTO 本地定义，改为 re-export `tool_runtime::execution_policy::{...}`。当时暂未处理的 workspace permission builder 已在后续“删除 dead workspace permission builder surface”批次确认无生产消费者并删除。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/lib.rs` 暴露 `execution_policy`，要求 DTO 定义只存在于 `tool-runtime/src/execution_policy.rs`，并禁止 `lime-agent` 重新定义这组 DTO。
- `current`：工具执行策略 DTO 归属 `tool-runtime` current crate，可被 App Server / agent / future tool executor 复用。
- `superseded`：当时 `lime-agent::agent_tools::execution::policy` 仍保留 workspace permission builder；最新状态见后续“删除 dead workspace permission builder surface”，该 surface 已按 `dead` 删除，`policy.rs` 只保留 resolver glue。
- `dead`：在 `lime-agent` 重新定义 tool execution policy DTO 的形态不得恢复。
- `next`：继续迁 tool execution policy resolver/service 或 `tool_orchestrator.rs` 执行核心；优先把不依赖 Aster `ToolContext` / `ToolRegistry` 的纯策略继续下沉到 `tool-runtime`。

## 2026-07-05 进度记录：shell/network execution rules 迁入 tool-runtime

- `completed`：新增 `tool-runtime::execution_rules`，承接 `ShellCommandRiskLevel`、`ShellCommandRuleSource`、`ShellCommandRuleMatchType`、`ShellCommandRule`、`ShellCommandRuleMatch`、`NetworkRuleTarget`、`NetworkRule`、`NetworkRuleMatch` 与 `classify_shell_command_with_rules(...)` / `classify_network_access(...)` 纯分类器。
- `completed`：`lime-agent::agent_tools::execution::rules` 删除本地 shell/network DTO 与分类器实现，改为 re-export `tool_runtime::execution_rules::{...}`；该文件现在只保留和 agent 本地 tool catalog 绑定的默认策略表 `default_tool_execution_policy(...)`。
- `completed`：`tool-runtime` 补 `url.workspace = true`，因为 network rule classifier 需要解析 host；该依赖现在归属 current tool runtime owner，不再由 `lime-agent` 独占。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/lib.rs` 暴露 `execution_rules`，要求 DTO / 分类器定义存在于 `tool-runtime/src/execution_rules.rs`，并禁止 `lime-agent/src/agent_tools/execution/rules.rs` 重新定义 shell/network rule DTO 或分类函数。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_rules --lib` 通过，5 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent execution --lib` 通过，86 tests passed；仅看到并行写集 `app-server-protocol/src/protocol/v0/catalog.rs` 的既有 unused import warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `blocked-verification`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 被并行脏写集 `app-server-protocol/src/schema_export/registry.rs` 阻断：`AppServerNotification` 不在 scope。本轮未接管该文件，避免夹写。
- `current`：shell/network execution rule DTO 与分类器归属 `tool-runtime` current crate，可被后续 tool executor / App Server / agent 共享。
- `superseded`：当时 `policy.rs` 仍保留 workspace permission builder；最新状态见后续“删除 dead workspace permission builder surface”，该 surface 已按 `dead` 删除。`rules.rs` 仍只保留 agent catalog 默认策略表。
- `dead`：在 `lime-agent` 重新定义 shell/network execution rule DTO、重新实现 classifier，或让 current classifier 依赖 Aster tool catalog 的形态不得恢复。
- `progress`：本刀后整体目标完成度约 `67%`。根 `lime-rs/Cargo.toml` 的 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`、`lime-agent` 的 `aster.workspace = true` 与 `lime-rs/vendor/aster-rust` 仍未满足删除条件，不能宣称完成。
- `next`：继续 tool/runtime 面收口，优先迁 `ToolExecutionPolicyService` 中不依赖 Aster 的 persisted/runtime policy config 转换和 metadata 解析，或推进 `tool_orchestrator.rs` 的 Aster `ToolContext` / `ToolRegistry` 执行核心向 `tool-runtime` current 接口收敛。

## 2026-07-05 进度记录：tool execution policy service 迁入 tool-runtime

- `completed`：新增 `tool-runtime::execution_policy_service`，承接 `ToolExecutionResolverInput`、`ToolExecutionPolicyService`、`ToolExecutionPolicyServiceOptions`、persisted/runtime policy layer 解析、metadata 生成、shell/network rule config 转换与 `persisted_policy_from_metadata(...)`。
- `completed`：`lime-agent::agent_tools::execution::service` 从完整实现降为薄 wrapper，只注入 `default_tool_execution_policy(...)` 和 `tool_catalog_names_match(...)`。agent 本地不再拥有 persisted/runtime policy 解析实现；当时未处理的 workspace permission builder 已在后续批次删除。
- `completed`：`lime-agent::agent_tools::execution::policy` 的 `ToolExecutionResolverInput` 改为 re-export `tool_runtime::execution_policy_service::ToolExecutionResolverInput`。
- `completed`：`tool-runtime` 增加 `lime-core.workspace = true`，用于消费已有 current config DTO；没有把 Aster 类型引入 `tool-runtime`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/lib.rs` 暴露 `execution_policy_service`，要求 policy service owner 在 `tool-runtime/src/execution_policy_service.rs`，并禁止 `lime-agent/src/agent_tools/execution/service.rs` 重新定义 runtime/persisted policy layer、config conversion、metadata parsing helper。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_policy_service --lib` 通过，3 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent execution --lib` 通过，86 tests passed，无 warning。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过；上一刀记录的 `app-server-protocol` 编译阻塞在当前工作树已不再复现。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：tool execution policy DTO、shell/network rule DTO、classifier、persisted/runtime policy resolver 和 metadata 生成归属 `tool-runtime` current crate。
- `superseded`：当时 `policy.rs` 仍保留 Aster `ToolPermission` / `ParameterRestriction` 和 workspace permission construction；最新状态见后续“删除 dead workspace permission builder surface”，该 surface 已按 `dead` 删除。`rules.rs` 仍保留 agent catalog 默认策略表。
- `dead`：在 `lime-agent` 重新定义 policy service、runtime policy layer、config conversion helper、shell/network classifier 或 tool execution policy DTO 的形态不得恢复。
- `progress`：本刀后整体目标完成度约 `68%`。根 `lime-rs/Cargo.toml` 的 vendored `aster` dependency、`lime-agent` 的 `aster.workspace = true` 与 `lime-rs/vendor/aster-rust` 仍未满足删除条件。
- `next`：继续 tool/runtime 面收口，优先推进 `tool_orchestrator.rs` 的 Aster `ToolContext` / `ToolRegistry` 执行核心向 `tool-runtime` current 接口收敛；workspace permission builder 已在后续批次确认无生产消费者并删除，不再作为迁移目标。

## 2026-07-05 进度记录：tool batch DTO 迁入 tool-runtime

- `completed`：新增 `tool-runtime::tool_batch`，承接 `PlannedToolExecution`、`ToolExecutionOutcome<TEvent>`、`ToolExecutionBatch<TEvent>` 与 `ToolTerminalEventUpdate`。这些类型不依赖 Aster，后续可被 App Server / tool runtime / agent adapter 共享。
- `completed`：`lime-agent::agent_tools::tool_orchestrator` 删除本地 plan/outcome/batch/update struct 定义，改为 re-export `PlannedToolExecution` / `ToolTerminalEventUpdate` 并为 `RuntimeAgentEvent` 绑定 `ToolExecutionOutcome` / `ToolExecutionBatch` type alias。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `tool-runtime/src/tool_batch.rs` 纳入已迁文件守卫，要求 `tool-runtime/src/lib.rs` 暴露 `tool_batch`，并禁止 `tool_orchestrator.rs` 重新定义 tool batch plan/outcome DTO。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_batch --lib` 通过，1 test passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，14 tests passed；仅有既有 `skill_tool_gate.rs` dead_code warning，非本刀写集。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `verified`：`git diff --check -- <本刀写集>` 通过。
- `current`：tool batch plan/outcome/update DTO 归属 `tool-runtime` current crate。
- `compat`：`lime-agent::agent_tools::tool_orchestrator` 仍保留 Aster `ToolRegistry` / `ToolContext` / `ToolError` / sandbox adapter 与 `RuntimeAgentEvent` 映射；退出条件是 current tool runtime executor 接管 registry、permission check、live process event mapping 后删除 Aster execution adapter。
- `dead`：在 `lime-agent` 重新定义 tool batch plan/outcome DTO 的形态不得恢复。
- `progress`：本刀继续减少 `lime-agent` current DTO 面，但 Aster registry execution adapter 未删除；整体目标完成度仍按约 `68%` 口径汇报。
- `next`：继续 tool/runtime 面收口，优先把 `tool_orchestrator.rs` 中与 Aster 无关的 shell command planning / live process event metadata 或 policy error metadata 下沉到 `tool-runtime`，随后再替换 Aster `ToolRegistry` / `ToolContext` 执行边界。

## 2026-07-05 进度记录：shell command planning helper 迁入 tool-runtime

- `completed`：新增 `tool-runtime::shell`，承接 `process_id_for_tool(...)`、`shell_command_text_from_argv(...)`、`shell_command_for_tool(...)`、`default_shell_command(...)`、`powershell_command(...)`、`is_shell_tool_name(...)`、`param_string(...)` 以及 shell/working-directory 参数 key。该模块不依赖 Aster，成为 shell planning / argv 文本投影的 current owner。
- `completed`：`lime-agent::agent_tools::tool_orchestrator` 删除本地 shell command planning / 参数抽取 helper，改为调用 `tool_runtime::shell`；只保留 Aster `ToolRegistry` / `ToolContext` / permission check / sandbox adapter 与 RuntimeAgentEvent 映射。
- `completed`：`app-server::execution_process` 对 `shell_command_text_from_argv(...)` 的消费改为直接依赖 `tool-runtime`，不再经 `lime-agent::agent_tools::tool_orchestrator` 的 Aster adapter re-export 取纯 helper；`app-server/Cargo.toml` 增加 `tool-runtime.workspace = true`。
- `completed`：`tool-runtime::shell` 单测显式覆盖 shell wrapper stripping、按平台生成 shell command、`param_string(...)` 旧行为保持。`param_string(...)` 保持原迁移语义：找到第一个 matching string 后 trim 并过滤空值，不因为迁移偷偷改成“跳过空值继续找下一个 key”。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/lib.rs` 暴露 `shell`，要求 shell helper 定义存在于 `tool-runtime/src/shell.rs`，禁止 `tool_orchestrator.rs` 重新定义或 re-export `shell_command_text_from_argv(...)`，并要求 App Server 直接 import `tool_runtime::shell::shell_command_text_from_argv`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell --lib` 通过，8 tests passed（filter 同时运行 execution policy / rules 邻近测试）。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，14 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-main" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `verified`：`git diff --check -- lime-rs/crates/tool-runtime/src/shell.rs lime-rs/crates/tool-runtime/src/lib.rs lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs lime-rs/crates/app-server/Cargo.toml lime-rs/crates/app-server/src/execution_process.rs src/lib/governance/asterMigrationBoundary.test.ts` 通过。
- `risk`：`tool_orchestrator.rs` 本刀继续减少本地 helper 后仍约 `809` 行，处于 Rust 文件体量预警区。下一刀不应继续向该文件追加业务逻辑，应继续把 live process metadata / policy error metadata / Aster registry adapter 拆到更小 owner。
- `current`：shell command planning / argv 文本投影 / 参数抽取 helper 归属 `tool-runtime` current crate；App Server 直接消费 current owner。
- `compat`：`lime-agent::agent_tools::tool_orchestrator` 仍保留 Aster `ToolRegistry` / `ToolContext` / `ToolError` / sandbox adapter；退出条件是 current tool runtime executor 接管 registry、permission check、live process event mapping 后删除 Aster execution adapter。
- `dead`：在 `lime-agent` 重新定义 shell command planning helper、通过 `lime-agent` re-export 让 App Server 消费纯 shell helper 的形态不得恢复。
- `progress`：本刀收掉了一个非 Aster helper 的假归属和一个 App Server -> agent compat re-export 消费点；整体目标完成度约 `69%`。根 `lime-rs/Cargo.toml` 的 vendored `aster` dependency、`lime-agent` 的 `aster.workspace = true` 与 `lime-rs/vendor/aster-rust` 仍未满足删除条件。
- `next`：继续 tool/runtime 面收口，优先把 live process event metadata / policy error metadata 等不依赖 Aster registry 的逻辑迁入 `tool-runtime`，同时准备 current tool executor 接口替换 Aster `ToolRegistry` / `ToolContext` 执行边界。

## 2026-07-05 进度记录：local execution process supervisor 迁入 tool-runtime

- `completed`：新增 `tool-runtime::execution_process`，承接 `ExecutionProcessStatus`、`ExecutionOutputDelta`、`ExecutionProcessSnapshot`、`LocalExecutionRequest`、`LocalExecutionProcessControlHandle` 与 `start_local_execution_process(...)` 等本地执行进程 supervisor 类型和启动函数。
- `completed`：`lime-agent::agent_tools::execution::process` 收缩为 `pub use tool_runtime::execution_process::*;`，不再本地定义 supervisor；`tool_orchestrator.rs` 直接从 `tool_runtime::execution_process` 导入本地执行进程类型。
- `completed`：`app-server::execution_process` 对本地执行进程 supervisor 的消费改为直接依赖 `tool-runtime`，不再经 `lime-agent::agent_tools::execution::process` 兼容 re-export 获取。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/lib.rs` 暴露 `execution_process`，要求 supervisor 定义存在于 `tool-runtime/src/execution_process.rs`，禁止 `lime-agent` 重新定义 supervisor，并禁止 App Server 经 `lime-agent` re-export 消费 supervisor。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-process" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_process --lib` 通过，6 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-process" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，14 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-process" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server execution_process --lib` 通过，8 tests passed。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `verified`：`git diff --check -- <process supervisor 写集>` 通过。
- `current`：local execution process supervisor 归属 `tool-runtime` current crate；App Server 直接消费 current owner。
- `compat`：`lime-agent::agent_tools::execution::process` 只剩迁移期 re-export；退出条件是内部调用也全部直接走 `tool_runtime::execution_process` 后删除该 re-export 文件。
- `dead`：在 `lime-agent` 重新定义本地执行进程 supervisor，或 App Server 经 `lime-agent` 兼容 re-export 消费 supervisor 的形态不得恢复。
- `risk`：`tool-runtime/src/execution_process.rs` 约 `910` 行，已处于 Rust 文件体量预警区。后续退出条件：按 manager / local process / output buffer / tests 拆分，避免把新业务继续堆到单文件。
- `progress`：该批继续把 App Server 与工具执行进程从 `lime-agent` compat 面剥离，但 Aster registry execution adapter 未删除；整体目标完成度仍按约 `69%` 口径汇报。
- `next`：继续 tool/runtime 面收口，优先处理 Aster `ToolRegistry` / `ToolContext` 执行边界，或删除已确认无生产消费者的 Aster permission builder surface。

## 2026-07-05 进度记录：删除 dead workspace permission builder surface

- `completed`：复核 `build_workspace_execution_permissions(...)`、`WorkspaceExecutionPermissionInput`、`build_workspace_shell_allow_pattern(...)` 与 `should_auto_approve_tool_warnings(...)` 后确认只有 `agent_tools/execution/tests.rs` 引用，production 代码无消费者。
- `completed`：直接删除 `lime-agent::agent_tools::execution::policy` 中旧 workspace permission builder、Aster `ToolPermission` / `ParameterRestriction` / `PermissionScope` import、路径 pattern builder 和对应测试；没有把这条 dead surface 迁成 `tool-runtime` 新壳。
- `completed`：`lime-agent::agent_tools::execution::policy` 收缩为 42 行，只保留 current policy DTO re-export、resolver metadata helper 与 persisted policy metadata helper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 workspace permission builder 回流守卫，禁止 `policy.rs` 恢复 `WorkspaceExecutionPermissionInput`、`build_workspace_execution_permissions`、`build_workspace_shell_allow_pattern`、`should_auto_approve_tool_warnings`、`ToolPermissionManager`、`ParameterRestriction`、`RestrictionType`、`PermissionScope` 或 `ToolPermission`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent` 通过。
- `verified`：`rg -n "build_workspace_execution_permissions|WorkspaceExecutionPermissionInput|build_workspace_shell_allow_pattern|should_auto_approve_tool_warnings|ToolPermissionManager|execution_permission" "lime-rs/crates/agent/src/agent_tools/execution" "lime-rs/crates/tool-runtime/src"` 无命中。
- `verified`：`rg -n "use aster::|aster::|use aster_models::|aster_models::" "lime-rs/crates/agent/src/agent_tools/execution/policy.rs" "lime-rs/crates/agent/src/agent_tools/execution/tests.rs" "lime-rs/crates/tool-runtime/src"` 无命中。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，78 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-permission-cleanup-tool" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_policy --lib` 通过，5 tests passed。
- `blocked-verification`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-permission-cleanup-agent" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent execution --lib` 在编译 vendored `aster-core` 时因磁盘只剩约 `463MiB` 失败：`No space left on device`，未到测试执行阶段。复用 `/tmp/lime-astermigration-target-process` 重跑同样因写 rmeta 空间不足失败。该结果不是代码编译错误，但再次证明 `lime-agent` 仍会编译 `vendor/aster-rust`，Phase 6 未完成。
- `current`：tool execution policy DTO / resolver / metadata 仍归属 `tool-runtime` + thin `lime-agent` glue；没有新增未消费的 permission DTO。
- `dead`：旧 workspace permission builder、Aster permission manager 正向测试证据和无生产消费者的 permission adapter surface 已删除，不得恢复。
- `progress`：该批删除一块已确认无生产消费者的 Aster permission surface，并把最新整体目标完成度更新为约 `70%`。删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true` 和 `vendor/aster-rust` 仍未满足条件。
- `next`：继续处理真实 blocker：`tool_orchestrator.rs` 的 Aster `ToolRegistry` / `ToolContext`、`request_tool_policy/aster_reply_adapter.rs`、`credential_bridge/runtime_provider_adapter.rs` 与 session store adapters。

## 2026-07-05 进度记录：vendored Aster shell/path 安全重复实现清理

- `completed`：新增 `tool-runtime::shell_analysis`，并按体量边界拆成 `shell_analysis/{bash,powershell,common}.rs`，承接 Bash/PowerShell shell parser、read-target preflight、WSL mount detector、PowerShell sleep detector、concurrency-safe 判定、mutation/write target candidate 收集与 high-risk / mutating warning helper。
- `completed`：`tool-runtime::shell_permission` 删除本地 shell parser / mutation candidate / mutating warning 重复实现，改为调用 `tool_runtime::shell_analysis` + `tool_runtime::path_guard`。`shell_permission.rs` 从 900+ 行收缩到约 322 行，避免继续膨胀中心文件。
- `completed`：vendored Aster `tools/bash.rs` / `tools/powershell_tool.rs` 删除旧 `SafetyCheckResult`、`check_command_safety`、dangerous/warning pattern 配置 API、写路径 validator、shell parser、read-target candidate collector、concurrency-safe 判定和 PowerShell sleep detector 本地实现。
- `completed`：继续清理已迁代码残留：删除 vendored Aster `tools/path_guard.rs` 空壳，移除 `tools/mod.rs` 中 shell analysis / read-target preflight public re-export，Bash/PowerShell 的 read-target preflight 降为文件内部函数，vendor 内重复的 concurrency-safe 测试删除；Aster Agent 内部并发分组直接调用 `tool_runtime::shell_analysis`。
- `completed`：vendored Aster Bash/PowerShell 现在只保留 Aster `Tool` 执行入口、`ToolResult` metadata 映射、后台任务/沙箱执行包装，以及对 `tool_runtime::shell_permission` / `tool_runtime::shell_analysis` 的内部调用。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `tool-runtime/src/shell_analysis.rs` 纳入已迁文件守卫，要求 `tool-runtime` 暴露 `shell_analysis`，禁止 vendored Aster 恢复 shell/path public wrapper、`tools/path_guard.rs` 空壳、旧 parser、path candidate collector、`SafetyCheckResult` 与写路径 validator。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime -- --check` 通过。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/bash.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/powershell_tool.rs" "lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-current-tool" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过，66 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-current-app" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core --test bash_tool_property_tests --no-run` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-clean" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib` 通过，0 warning。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`rg -n "SHELL_ENV_ASSIGN_RE|BASH_WRITE_REDIRECTION_RE|BASH_SED_IN_PLACE_RE|POWERSHELL_WRITE_REDIRECTION_RE|split_shell_segments|extract_bash_command_words|extract_bash_read_targets|collect_bash_read_path_candidates|is_known_read_only_bash_command|tokenize_shell_words|normalize_command_words|split_powershell_segments|extract_powershell_command_words|extract_powershell_read_targets|collect_powershell_read_path_candidates|is_known_read_only_powershell_command|tokenize_powershell_words|normalize_powershell_words|is_forced_git_clean_words" "lime-rs/vendor/aster-rust/crates/aster/src/tools/bash.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/powershell_tool.rs"` 无命中。
- `verified`：`rg -n "pub use tool_runtime|pub mod path_guard|pub fn preflight_bash_read_targets|pub fn preflight_powershell_read_targets|is_bash_command_concurrency_safe|is_powershell_command_concurrency_safe|tools::path_guard|aster::tools::path_guard" "lime-rs/vendor/aster-rust/crates/aster/src"` 只剩 `agents/agent.rs` 内部直接使用 `tool_runtime::shell_analysis` 做并发分组。
- `current`：path guard、shell permission、shell analysis 归属 `tool-runtime` current crate。
- `compat`：vendored Aster Bash/PowerShell tool 本体仍作为 Aster `ToolRegistry` 执行 adapter 存在；退出条件是 current tool runtime executor 接管 Aster `ToolRegistry` / `ToolContext` 后删除这些 vendored tool entry 或整个 vendored dependency。
- `dead`：vendored Aster 中恢复第二份 shell/path safety parser、旧 safety API、写路径 validator、read-target collector、concurrency-safe 判定、`tools/path_guard.rs` 空壳或 shell analysis public re-export 的形态不得恢复。
- `progress`：该批把“已经迁出的代码”从 vendored Aster 中清理掉，而不是只把 current owner 加到旁边；后续补刀又删除了已迁 API 的 vendor public wrapper。整体目标完成度更新为约 `74%`；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、`tool_orchestrator` Aster registry adapter 与 provider/session adapters 仍是 Phase 6 blocker。
- `next`：继续删除 `lime-agent` direct Aster dependency 的主阻塞链，优先处理 `tool_orchestrator.rs` 的 Aster `ToolRegistry` / `ToolContext` 执行边界，或转向 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 provider/reply loop 退场。

## 2026-07-05 进度记录：tool inventory registry definition DTO 迁入 tool-runtime

- `completed`：新增 `tool-runtime::tool_definition::RuntimeToolDefinition`，承接 tool inventory 需要的 `name` / `description` / `input_schema` registry definition DTO。该 DTO 不依赖 Aster，也不恢复此前已删除的 `ToolRuntime` 执行骨架。
- `completed`：`lime-agent::agent_tools::inventory` 与 `tool_inventory_runtime_snapshot` 的 `registry_definitions` 从 Aster `ToolDefinition` 改为 `RuntimeToolDefinition`；inventory projection 只消费 current DTO 做 catalog mapping、caller visibility、resource helper gating 和 runtime inventory 合并。
- `completed`：`tool_inventory_runtime_adapter` 作为唯一 Aster registry 读取边界，从 `agent.tool_registry().read().await.get_definitions()` 读取后立即转换成 `RuntimeToolDefinition`。Aster `ToolDefinition` 不再进入 inventory build input 或 snapshot DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `tool-runtime/src/tool_definition.rs` 纳入已迁文件守卫，要求 `tool-runtime/src/lib.rs` 暴露 `tool_definition`，并新增 inventory DTO 边界守卫，禁止 `inventory.rs` / `tool_inventory_runtime_snapshot.rs` 恢复 `aster::tools::ToolDefinition`、`Vec<ToolDefinition>` 或 `ToolDefinition::new(...)` 测试 helper。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/tool_definition.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent/src/agent_tools/inventory.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-current-tool" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过，66 tests passed。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`rg -n "use aster::tools::ToolDefinition|Vec<ToolDefinition>|&\\[ToolDefinition\\]|\\) -> ToolDefinition| ToolDefinition::new\\(" "lime-rs/crates/agent/src/agent_tools/inventory.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs"` 无命中。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-agent-inventory" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::inventory --lib` 通过，13 tests passed；仅有既有 `agent_tools/execution/tests.rs` 未用 import warning，非本刀写集。
- `current`：tool inventory registry definition DTO 归属 `tool-runtime` current crate。
- `compat`：Aster `ToolRegistry` / `ToolContext` / `ToolError` 执行 adapter、`ExtensionConfig` extension projection 和 `list_tools(None)` 仍保留在 `lime-agent` 的受控 adapter 内。退出条件是 current tool runtime 提供 registry + extension read model 和 executor 后删除这些 Aster DTO / registry 读取。
- `dead`：让 `inventory.rs` / `tool_inventory_runtime_snapshot.rs` 重新持有 Aster `ToolDefinition` DTO，或把 Aster DTO 从 adapter 继续向 App Server / inventory projection 外泄的形态不得恢复。
- `progress`：本批减少 Aster public DTO 扩散，但尚未删除 `lime-agent` 的 Aster dependency；整体目标完成度更新为约 `72%`。root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、`tool_orchestrator` Aster registry execution adapter 与 provider/session adapters 仍是 Phase 6 blocker。
- `next`：继续 tool/runtime 面收口，优先迁 `ExtensionConfig` projection DTO 或直接攻 `tool_orchestrator.rs` 的 Aster `ToolRegistry` / `ToolContext` 执行边界；如果回到主 turn stream，则处理 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 provider/reply loop 退场。

## 2026-07-05 进度记录：tool inventory extension config DTO 迁入 tool-runtime

- `completed`：新增 `tool-runtime::tool_extension::RuntimeExtensionConfig`，承接 inventory 需要的 extension name、description、available tools、deferred loading、always expose tools 与 allowed caller projection。该 DTO 不依赖 Aster，也不包含 extension transport / command / execution 行为。
- `completed`：`lime-agent::agent_tools::inventory` 与 `tool_inventory_runtime_snapshot` 的 `extension_configs` 从 Aster `ExtensionConfig` 改为 `RuntimeExtensionConfig`；inventory projection 不再匹配 Aster extension enum 变体，也不再调用 `config.name()` / `deferred_loading()` / `allowed_caller()` 等 Aster helper。
- `completed`：`tool_inventory_runtime_adapter` 作为唯一 Aster extension 读取边界，把 `agent.get_extension_configs().await` 产物通过 `project_aster_extension_config(...)` 转换为 `RuntimeExtensionConfig`。Aster `ExtensionConfig` 只以 `AsterExtensionConfig` 别名留在该 adapter 内。
- `completed`：MCP bridge synthetic extension projection 从构造 Aster `ExtensionConfig::Builtin` 改为直接构造 `RuntimeExtensionConfig`，避免为了 inventory 展示继续制造 Aster DTO。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `tool-runtime/src/tool_extension.rs` 纳入已迁文件守卫，要求 `tool-runtime/src/lib.rs` 暴露 `tool_extension`，并扩展 inventory DTO 守卫，禁止 `inventory.rs` / `tool_inventory_runtime_snapshot.rs` 恢复 Aster `ExtensionConfig`、Aster helper 调用或 enum 变体匹配。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/tool_extension.rs" "lime-rs/crates/tool-runtime/src/tool_definition.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent/src/agent_tools/inventory.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-current-tool" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime --lib` 通过，66 tests passed。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`rg -n "use aster::agents::extension::ExtensionConfig|Vec<ExtensionConfig>|&\\[ExtensionConfig\\]|\\) -> ExtensionConfig| ExtensionConfig::|\\.name\\(\\)|deferred_loading\\(\\)|always_expose_tools\\(\\)|allowed_caller\\(\\)" "lime-rs/crates/agent/src/agent_tools/inventory.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs" "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs"` 仅剩 adapter 的 `use aster::agents::extension::ExtensionConfig as AsterExtensionConfig;`，符合唯一兼容转换点。
- `blocked-verification`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-agent-inventory" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::inventory --lib` 被并行脏写集 `session_execution_runtime` 拆分阻断：`runtime_payload.rs` 中 `apply_usage_to_cost_state` / `detect_runtime_limit_event` 为 `pub(super)` 导致 `lib.rs` re-export 私有函数，`tests/runtime_payload.rs` 通过 `super` 导入 `SessionExecutionRuntimeCostState` / `SessionExecutionRuntimeLimitEvent` 失败。该错误不在本刀 tool inventory DTO 写集内，未接管该热区避免夹写。
- `current`：tool inventory registry definition DTO 与 extension config DTO 归属 `tool-runtime` current crate。
- `compat`：Aster `ToolRegistry` / `ToolContext` / `ToolError` 执行 adapter、Aster extension manager 读取、`list_tools(None)` 仍保留在 `lime-agent` adapter 内。退出条件是 current tool runtime 提供 registry + extension read model 和 executor 后删除这些 Aster DTO / registry / extension 读取。
- `dead`：让 `inventory.rs` / `tool_inventory_runtime_snapshot.rs` 重新持有 Aster `ExtensionConfig` DTO，或为了 MCP bridge synthetic extension 构造 Aster `ExtensionConfig::Builtin` 的形态不得恢复。
- `progress`：本批继续减少 Aster DTO 扩散，但尚未删除 `lime-agent` 的 Aster dependency；整体目标完成度更新为约 `73%`。root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、`tool_orchestrator` Aster registry execution adapter 与 provider/session adapters 仍是 Phase 6 blocker。
- `next`：继续 tool/runtime 面收口时应直接处理 `tool_orchestrator.rs` 的 Aster `ToolRegistry` / `ToolContext` 执行边界，而不是继续只做 DTO 收口；或者回到主 turn stream 的 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 退场。

## 2026-07-05 进度记录：tool_orchestrator shell permission preflight 迁出 Aster registry

- `completed`：`lime-agent::agent_tools::tool_orchestrator::check_shell_tool_permissions(...)` 不再为 shell 权限检查临时创建 Aster `ToolRegistry`，也不再注册 Aster `BashTool` / `PowerShellTool`；该入口改为解析 canonical shell tool name 后直接调用 `tool_runtime::shell_permission::check_shell_command_permission(...)`。
- `completed`：`execute_planned_tool(...)` 在构造 `ToolContext` 后、进入 live process 或 Aster registry adapter 前统一执行 shell permission preflight。这样 live-process 路径和 registry fallback 路径都由 `tool-runtime::shell_permission` 决策，不再依赖 Aster `check_tool_permissions` 才能拒绝危险命令。
- `completed`：`execute_live_shell_process(...)` 删除 Aster `registry.check_tool_permissions(&planned.tool_name, ...)` 前置步骤，直接使用 `planned.params` 中的 command。缺失 command 仍保持原 registry fallback 行为，危险 command 则在进入 fallback 前被 current shell permission owner 拦截。
- `completed`：删除测试专用 `DeniedShellTool` 和 Aster `PermissionCheckResult` 依赖，改用真实危险命令 `rm -rf /` 验证 permission preflight；新增 `check_shell_tool_permissions_uses_tool_runtime_permission_owner`，证明 `BashTool` alias 也走 current owner。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 tool runtime 守卫，禁止 `tool_orchestrator.rs` 恢复 Aster `BashTool` / `PowerShellTool` import、临时注册或 Aster `.check_tool_permissions(...)` shell preflight；同时要求该文件直接 import `tool_runtime::shell_permission::{check_shell_command_permission, ShellPermissionDecision}`。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs"` 通过。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-tool-orchestrator" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_orchestrator --lib` 通过，15 tests passed；仅有并行写集 `agent_tools/execution/tests.rs` 的 `WorkspaceToolSurface` 未用 import warning，非本刀写集。
- `current`：shell permission preflight 归属 `tool-runtime::shell_permission` current crate。
- `compat`：`tool_orchestrator.rs` 仍保留 Aster `ToolRegistry` / `ToolContext` / `ToolError` / sandbox adapter 与 `RuntimeAgentEvent` 映射。退出条件是 current tool runtime executor 接管 registry、tool context、tool error classification 和 batch execution 后删除 Aster execution adapter。
- `dead`：为了 shell permission preflight 临时注册 Aster `BashTool` / `PowerShellTool`，或调用 Aster `check_tool_permissions` 的形态不得恢复。
- `progress`：本批收掉了 `tool_orchestrator` 中一个真实 Aster 执行前置依赖，但没有删除 Aster registry execution adapter；整体目标完成度保守更新为约 `75%`。root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、provider/reply loop 与 session store adapters 仍是 Phase 6 blocker。
- `next`：继续同一主线时应优先把 Aster `ToolError` policy classification 和 registry execution adapter 拆成更窄的 adapter，或让 `tool-runtime` 接管 current tool executor；若切回主 turn stream，则处理 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 退场。不要再只做 DTO 小项。

## 2026-07-05 进度记录：vendored BashTool permission property tests 清理

- `completed`：删除 `lime-rs/vendor/aster-rust/crates/aster/tests/bash_tool_property_tests.rs` 中三组 shell permission property tests：危险命令拒绝、安全命令允许、warning 命令确认。这些规则已由 `tool-runtime::shell_permission` current owner 覆盖，继续留在 vendored Aster 测试里会把已迁能力包装成 Aster 行为。
- `completed`：保留 BashTool 自身的 output truncation property tests；该行为仍属于现存 Aster BashTool adapter，不与 `tool-runtime::shell_permission` 重复。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加 vendor BashTool property test 守卫，要求文件声明 permission rules 归属 `tool-runtime::shell_permission`，并禁止恢复 `prop_permission_check_*`、permission command generators 或 `tool.check_permissions(...)` 属性测试。
- `verified`：`rustfmt --edition 2021 "lime-rs/vendor/aster-rust/crates/aster/tests/bash_tool_property_tests.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-clean" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core --test bash_tool_property_tests` 通过，3 tests passed。
- `current`：shell permission 行为测试归属 `tool-runtime::shell_permission` current crate。
- `compat`：Aster BashTool output truncation 和工具执行 adapter 仍留在 vendored Aster；退出条件是 current tool executor 接管 BashTool 或整个 vendored dependency 删除。
- `dead`：在 vendored Aster 测试中恢复 shell permission property tests 的形态不得恢复。
- `progress`：本批继续把“已经迁出的代码/测试证据”从 vendor 中清理掉，整体目标完成度仍按约 `75%` 口径；该清理不是 Phase 6 完成证据，因为 root `aster` dependency 和 `lime-agent` direct dependency 仍存在。
- `next`：继续主阻塞链，不再围绕已迁 shell permission 做更多 vendor 测试；下一刀应处理 `ToolError` / `ToolRegistry` 执行 adapter 或 provider/reply loop。

## 2026-07-05 进度记录：tool_orchestrator policy error classification 收窄 Aster ToolError

- `completed`：新增本地 `ToolPolicyErrorKind`，让 `policy_error_metadata(...)` 和 `classify_policy_error(...)` 不再直接接收或匹配 Aster `ToolError`。Aster `ToolError` 只在 Aster registry adapter 失败边界通过 `ToolPolicyErrorKind::from_aster_tool_error(...)` 转换一次。
- `completed`：`shell_permission_error_outcome(...)` 不再为了生成 policy metadata 构造 Aster `ToolError::permission_denied(...)`，改为直接传入 `ToolPolicyErrorKind::PermissionDenied(reason.as_str())`。shell permission 的 current owner 保持为 `tool-runtime::shell_permission`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加守卫，要求 `tool_orchestrator.rs` 存在 `ToolPolicyErrorKind` 转换边界，并禁止恢复 `ToolError::permission_denied(reason)`、`let error = ToolError::permission_denied` 或 `fn classify_policy_error(error: &ToolError)`。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-tool-orchestrator" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_orchestrator --lib` 通过，15 tests passed；仍有并行写集 `agent_tools/execution/tests.rs` 的 `WorkspaceToolSurface` 未用 import warning，非本刀写集。
- `current`：policy error metadata 分类输入归属 `tool_orchestrator` 本地 current projection，shell permission reason 直接来自 `tool-runtime::shell_permission`。
- `compat`：Aster `ToolError` 仍保留在 `ToolRegistry` execution adapter 边界和测试 fake tool trait 实现中；退出条件是 current tool executor / error type 接管 registry execution 后删除。
- `dead`：shell permission preflight 为了 policy metadata 构造 Aster `ToolError`，或让 classification 函数重新直接匹配 `&ToolError` 的形态不得恢复。
- `progress`：本批继续缩小 `tool_orchestrator` 对 Aster `ToolError` 的依赖面，但未删除 `ToolRegistry` / `ToolContext` 执行 adapter；整体目标完成度仍保守按约 `75%`。
- `next`：下一刀应把 Aster registry execution adapter 拆成更窄模块，或者进入 provider/reply loop 退场；不要再把新行为挂回 `ToolError`。

## 2026-07-05 进度记录：vendored Aster command semantics 副本清理

- `completed`：新增 `tool-runtime::command_semantics`，承接 shell command exit semantics：`rg` / `grep` no-match、`diff` difference、`test` false、PowerShell `robocopy` 成功区间等非零退出码解释。该 owner 不依赖 Aster，和 Codex 风格 current tool/runtime crate 分层一致。
- `completed`：vendored Aster `BashTool` / `PowerShellTool` 改为内部调用 `tool_runtime::command_semantics::{interpret_bash_command_result, interpret_powershell_command_result}`，只保留 Aster `ToolResult` 映射和工具执行 adapter。
- `completed`：删除 `lime-rs/vendor/aster-rust/crates/aster/src/tools/command_semantics.rs`，并移除 `tools/mod.rs` 对 `command_semantics` 的 public module / re-export。Aster 不再对外伪装为 shell command exit semantics 的事实源。
- `completed`：同步 vendor Bash 单测口径：`rm -rf ../../` 现在验证 current `tool-runtime::shell_permission` 的 dangerous-pattern 分类，不再假设一定落到 path guard 的 protected-path 文案。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 vendor shell 守卫，禁止恢复 `tools/command_semantics.rs`、`pub mod command_semantics`、`pub use command_semantics`、`CommandInterpretation` 和 command semantics public wrapper。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/tool-runtime/src/command_semantics.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/bash.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/powershell_tool.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-command-semantics" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime command_semantics --lib` 通过，8 tests passed / 66 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-command-semantics" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::powershell_tool --lib` 通过，15 tests passed / 4486 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-command-semantics" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::bash --lib` 初次失败于过时文案断言；同步测试口径后重跑通过，35 tests passed / 4466 filtered out。
- `current`：shell command exit semantics 归属 `tool-runtime::command_semantics` current crate。
- `compat`：vendored Aster Bash/PowerShell tool 本体仍作为 Aster `ToolRegistry` execution adapter 存在；退出条件是 current tool executor 接管 registry / context / result mapping 后删除这些 vendor tool entry 或整个 vendored dependency。
- `dead`：vendored Aster 恢复 `tools/command_semantics.rs` 或公开 re-export command semantics 的形态不得恢复。
- `progress`：本批继续把已迁能力从 vendor Aster 中物理删掉，避免“迁了但旧实现继续当垃圾堆”。整体目标完成度保守更新为约 `76%`；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、`tool_orchestrator` Aster registry execution adapter、provider/reply loop 与 session store adapters 仍是 Phase 6 blocker。
- `next`：继续主阻塞链，优先拆 `tool_orchestrator` 的 Aster registry execution adapter 到唯一 compat 模块，随后以 current tool executor / result type 接管；或切到 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 provider/reply loop 退场。不要继续围绕已迁 shell helper 做小修小补。

## 2026-07-05 进度记录：tool_orchestrator Aster registry execution 细节隔离

- `completed`：新增 `lime-agent::agent_tools::tool_orchestrator::aster_registry_adapter`，把 Aster `ToolRegistry`、`ToolContext`、`ToolError`、`SandboxConfig` / `SandboxType`、workspace sandbox config 映射和 `aster::session_context::with_turn_context` 集中到唯一 compat adapter。
- `completed`：`tool_orchestrator.rs` 主编排层不再直接 import `aster::sandbox`、`aster::tools::{ToolContext, ToolError, ToolRegistry}`、`to_aster_turn_context` 或 `aster::session_context::with_turn_context`；主文件只消费 `AsterToolRegistryAdapter` / `AsterToolExecutionContext` / `AsterToolPolicyErrorKind` 等窄 adapter 类型。
- `completed`：`workspace_patch_runtime_adapter.rs` 与 `request_tool_policy/web_search_preflight.rs` 的 batch input 构造改为把原 Aster registry 转成 `AsterToolRegistryAdapter`，避免向 `ToolExecutionBatchInput` 继续扩散原始 Aster registry 类型。
- `completed`：registry execution error 路径改为从 adapter error 暴露的 `AsterToolPolicyErrorKind` 生成 policy metadata；同时避免在 error 分支用 `std::mem::take(metadata)` 产生隐式副作用。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 增加主 `tool_orchestrator.rs` direct Aster registry/sandbox/session 细节禁用守卫，并要求 `tool_orchestrator/aster_registry_adapter.rs` 成为唯一允许触碰 Aster registry execution 细节的 compat adapter。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs" "lime-rs/crates/agent/src/agent_tools/workspace_patch_runtime_adapter.rs" "lime-rs/crates/agent/src/request_tool_policy/web_search_preflight.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-tool-orchestrator" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_orchestrator --lib` 通过，15 tests passed；仅有并行写集 `agent_tools/execution/tests.rs` 的 `WorkspaceToolSurface` 未用 import warning，非本刀写集。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `current`：tool execution batch DTO、shell permission / shell planning / local process supervisor 继续归属 `tool-runtime` current crate；`tool_orchestrator.rs` 主文件只保留调度、live process 接线和 RuntimeAgentEvent 映射。
- `compat`：Aster registry execution adapter 仍存在于 `tool_orchestrator/aster_registry_adapter.rs`，服务现有 Aster `ToolRegistry` 执行入口。退出条件是 current `tool-runtime` executor 接管 registry、tool context、tool result 和 tool error type 后删除该 adapter。
- `dead`：主 `tool_orchestrator.rs` 重新直接 import 或构造 Aster `ToolRegistry` / `ToolContext` / `ToolError` / `SandboxConfig` / `SandboxType` / `with_turn_context` 的形态不得恢复。
- `progress`：本批没有删除 root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`，但把真实执行链的 Aster 细节从主编排层收进唯一退场点；整体目标完成度保守更新为约 `77%`。
- `next`：继续主阻塞链，下一刀应让 `tool-runtime` 提供 current tool executor / result / error 类型以替换 `AsterToolRegistryAdapter`，或转入 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 provider/reply loop 退场。

## 2026-07-05 进度记录：vendored Aster subprocess / shell_runtime 副本清理

- `completed`：新增 `tool-runtime::subprocess`，承接 process output decode、Windows no-window flag、PowerShell / CMD UTF-8 wrapper 与 decode summary。该 owner 不依赖 Aster，符合 Codex 风格 current tool/runtime crate 分层。
- `completed`：新增 `tool-runtime::shell_runtime`，承接 platform shell command 构造、PowerShell runtime 探测、Windows known-path fallback 与 nested PowerShell `-Command` wrapper stripping。
- `completed`：vendored Aster `BashTool`、`PowerShellTool`、`TaskManager`、CLI provider 和 extension manager 改为内部调用 `tool_runtime::subprocess` / `tool_runtime::shell_runtime`，只保留现存 Aster `ToolResult` 映射、任务管理和 provider compat 行为。
- `completed`：删除 `lime-rs/vendor/aster-rust/crates/aster/src/subprocess.rs` 与 `lime-rs/vendor/aster-rust/crates/aster/src/tools/shell_runtime.rs`；移除 vendor `lib.rs` 的 `pub mod subprocess;`、`tools/mod.rs` 的 `mod shell_runtime;` 和 vendor `Cargo.toml` 中仅服务 subprocess helper 的 `encoding_rs = "0.8"` direct dependency。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 暴露 `subprocess` / `shell_runtime` current owner，并禁止 vendored Aster 恢复 `src/subprocess.rs`、`tools/shell_runtime.rs`、`pub mod subprocess;`、`mod shell_runtime;`、`crate::subprocess`、`super::shell_runtime`、`encoding_rs =` 或把 `tool_runtime::{subprocess,shell_runtime}` 重新 `pub use` 成 Aster public surface。
- `verified`：`rg -n "crate::subprocess|super::shell_runtime|mod shell_runtime|pub mod subprocess|encoding_rs" "lime-rs/vendor/aster-rust/crates/aster/src" "lime-rs/vendor/aster-rust/crates/aster/Cargo.toml"` 无命中。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/tool-runtime/src/subprocess.rs" "lime-rs/crates/tool-runtime/src/shell_runtime.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/bash.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/powershell_tool.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/task.rs" "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/cursor_agent.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/gemini_cli.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/claude_code.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/codex.rs" "lime-rs/vendor/aster-rust/crates/aster/src/agents/extension_manager.rs" "lime-rs/vendor/aster-rust/crates/aster/src/lib.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，80 tests passed。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-shell-runtime" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_runtime --lib` 通过，6 tests passed / 79 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-shell-runtime" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime subprocess --lib` 通过，5 tests passed / 80 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-shell-runtime" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::bash --lib` 通过，35 tests passed / 4455 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-shell-runtime" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::powershell_tool --lib` 通过，15 tests passed / 4475 filtered out。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-astermigration-target-vendor-shell-runtime" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::task --lib` 通过，55 tests passed / 4435 filtered out。
- `current`：process output decode、Windows no-window / UTF-8 wrapper、platform shell command construction 与 PowerShell runtime detection 归属 `tool-runtime::{subprocess,shell_runtime}` current crate。
- `compat`：vendored Aster Bash/PowerShell/Task/provider/extension manager 仍作为 Aster registry / provider compat 执行入口存在；退出条件是 current tool executor / provider runner 接管后删除这些 vendor entry 或整个 vendored dependency。
- `dead`：vendored Aster 恢复 `src/subprocess.rs`、`tools/shell_runtime.rs`、`encoding_rs` direct dependency 或公开 re-export process runtime helper 的形态不得恢复。
- `progress`：本批继续把已迁 process / shell runtime helper 从 vendor Aster 中物理删掉，避免“迁了但旧实现继续当垃圾”。整体目标完成度保守更新为约 `78%`；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、`tool_orchestrator` Aster registry execution adapter、provider/reply loop 与 session store adapters 仍是 Phase 6 blocker。
- `next`：下一刀不应继续围绕已迁 shell helper 做小修小补；应回到主阻塞链，让 `tool-runtime` 提供 current tool executor / result / error 类型以替换 `AsterToolRegistryAdapter`，或转入 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 provider/reply loop 退场。
