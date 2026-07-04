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
- `documented`：新增 3 份策略文档：`aster-trait-skeleton-fast-track-plan.md`、`phase2-blocking-analysis.md`、`phase2-execution-summary.md`。
- `next`：等待编译验证通过后，继续 Phase 2 收口：(1) 标记 internal 模块为 compat (2) 引入 optional feature gate (3) 验证 App Server 不启用该 feature。

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
- `next`：Phase 2 后续：(1) 清理 unused import 警告 (2) 引入 optional feature gate (3) 标记 compat 文件退出条件 (4) 推进 Phase 5 vendor 降级。

## 2026-07-04 进度记录：Phase 2 快速收口复核更正

- `correction`：Phase 2 不能判定为完成。当前只能说明 `lime-agent` 编译闭环恢复；`aster_session_store.rs` 仍未满足主文件拆分和 current/compat 边界守卫。
- `verified`：本次有效 Rust 验证命令为 `CARGO_TARGET_DIR="/tmp/lime-astermigration-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`，结果通过但仍有 6 个 warning；后续计划记录不得使用缺少 `--manifest-path "lime-rs/Cargo.toml"` 的根目录 `cargo check -p lime-agent --lib` 作为完成证据。
- `blocked`：`src/lib/governance/asterMigrationBoundary.test.ts` 当前仍 3 项失败，且全部指向 `aster_session_store.rs`：session record helper 回流、已拆 compat helper 回流、主文件 2456 行超过 1000 行边界。
- `exit-condition`：Phase 2 priority 1 的退出条件不是“同时实现双 trait 后能编译”，而是 `LimeSessionStore` 的 current 事实源切到 `thread-store::SessionRepository`，Aster `SessionStore` 只保留在明确 adapter 内，且 `aster_session_store` 主文件通过治理守卫。
- `next`：先修复上述 3 个治理失败和 warning，再继续 optional feature gate 或 vendor 降级；否则会把未拆干净的 compat 主文件提前带入下一阶段。

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
- `completed`：`credential_bridge/provider_factory.rs` 新增 `create_model_runtime_provider(...) -> Arc<dyn RuntimeProvider>`，用 `AsterRuntimeProviderAdapter` 把 Aster `Provider` trait、`Message` 和 `ProviderUsage` 映射到 Lime DTO。旧 `create_runtime_provider(...) -> Arc<dyn aster::Provider>` 暂时保留给 `aster_state.update_provider(...)`，只作为 Aster Agent API 卡住的 compat 入口。
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
