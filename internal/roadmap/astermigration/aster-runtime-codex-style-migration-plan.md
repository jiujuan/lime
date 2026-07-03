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
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `app-server` 纳入 Aster-free migrated crate，禁止重新出现 `use aster::`、`aster::`、`aster.workspace = true`、`aster-models.workspace = true` 或 `package = "aster-core"`。
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
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `services` 加入 Aster-free migrated crate，禁止 services 重新 import 或声明 Aster dependency。
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
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `protocol_projection.rs` 与 `protocol_context_projection.rs` 纳入 Aster-free migrated files，禁止 Aster import / dependency 文本回流。
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
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `lime-rs/crates/agent/src/runtime_projection_snapshot.rs` 加入 Aster-free migrated files，禁止该 current projection owner 回流 Aster import / dependency 文本。
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
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 把 `request_tool_policy/auto_compaction_projection.rs` 与 `session_store_message_projection.rs` 加入 Aster-free 文件守卫，并新增 `session_store_subagent_context 不得重新引入 Aster runtime snapshot 测试 helper` 守卫。
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

## 当前下一刀

继续 Phase 3 / Phase 4 的批量迁移，不做逐行搬运：

1. `thread-store` 批次：`services` 已移除 direct Aster dependency；下一步把 `lime-agent::aster_session_store` 中的 session / conversation projection DTO 和 repository trait 继续下沉到 `thread-store`，让 adapter 只做 Aster trait 转接。
2. `agent` 批次：`app-server` 已完成 direct Aster dependency 收口，继续处理 `lime-agent` 内部 Aster import，把 event conversion、tool orchestration、session runtime projection 按领域搬到 `agent-runtime` / `tool-runtime` / `thread-store`。
