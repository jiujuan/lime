# 优先级跟进计划：Codex 原点式快速对齐 v1

> 状态：active tracking plan
> 更新时间：2026-07-07
> 目标：按照 [fast-alignment-roadmap.md](./fast-alignment-roadmap.md) 的优先级推进 Codex 原点式对齐，并把每次推进过程写回 repo。
> 当前阶段：P1-7 Provider / Model capability 已完成 current owner mapping、前端 canonical capability summary、Rust `CanonicalModel` capability summary、provider route protocol projection guard、Prompt Cache 口径收敛、model/provider capability contract guard、multi-modal send gate helper、发送准备边界 gate evidence、最终 submit op fail-closed、prepare / submit final gate evidence 一致性、`model.effective` reasoning `CapabilitySnapshot` owner、picker vs execution 前端 summary 边界守卫、RuntimeCore `CapabilitySnapshot` picker/catalog 负向测试、RuntimeCore route 不投影 picker DTO 守卫、`ResolvedModelRoute` 协议直接删除 picker DTO 字段、send wrapper 基于当前 picker selection 注入 `SendMessageOptions.modelCapabilitySummary`、`RouteDefaults` execution policy boundary guard、GUI send policy owner、Inputbar warning / disabled 接线、GUI smoke 证明、`modelExecutionPolicy` execution policy owner 初版、`modelExecutionPolicyBoundary` 回流守卫、前端 registry metadata `execution_policy` 接线、Codex execution policy origin source guard、execution policy 协议 rollout completeness guard、`modelContextPolicy` context / auto compact owner、Codex context policy origin source guard、`modelPickerPolicy` visibility / service tier owner、Codex picker policy origin source guard、`modelPickerPolicyBoundary` 回流守卫、execution / context / picker / tool-call / reasoning / reasoning-output / input-modality / responses request-mode / truncation / native tool policy 协议 rollout completeness guard、`modelToolCallPolicy` parallel tool calls owner、Codex tool-call policy origin source guard 与 tool-call boundary guard、`modelReasoningPolicy` reasoning effort owner、Codex reasoning policy origin source guard 与 reasoning boundary guard、`modelReasoningOutputPolicy` reasoning summary / verbosity owner、Codex reasoning output origin source guard 与 reasoning output boundary guard、`modelInputModalityPolicy` input modalities owner、Codex input modality origin source guard 与 opencode 多模态 reference guard、`modelResponsesPolicy` Responses Lite request mode owner 与 Codex source guard、`modelTruncationPolicy` tool output truncation owner 与 Codex source guard、`modelNativeToolPolicy` native tool owner、submit request policy metadata owner。
> 最新进度：第三十六刀已完成真实接线：Codex `ModelInfo` execution / context / picker / tool-call / reasoning / reasoning-output / input modality / responses request-mode / truncation / native tool policy 字段已进入 App Server `ModelInfo` Rust DTO、schema bundle、generated TS、`modelRegistry` projection 与 registry-facing types；第三十七刀已把 selected registry model 的 policy projection 写入最终 submit metadata：`request_metadata.harness.model_request_policy`。第三十八刀第一至第八切片已完成 Rust request/tool consumer 主链：`lime-agent` typed owner、live bytes truncation consumer、native shell gate、responses/tool-call transport、provider wire-shape、Aster compat fail-closed、Aster OpenAI Responses payload/header consumer、native tool inventory / apply_patch gate、live execution fail-closed guard 与 token-aware final output formatter 均有定向证据；`npm run test:contracts` 已完整通过。第十二切片已完成 MCP / Aster extension output 收口：App Server `mcpTool/call*` 属于 current control plane，不是模型可见 tool output；模型可见 MCP extension 结果经 `message_content_adapter.rs` 的 Aster `ToolResponse` compat 路径进入 `ToolEnd` 时，会由 stateful `RuntimeEventProjector` 传入当前 `AgentTurnContext` 并复用 `ToolOutputTruncationPolicy`，同时继续标记 `legacy_message_tool_response / compat=true / canonical=false`。第十三切片已完成 input-modality Rust fail-closed consumer：Aster reply 构造当前 user message 前会消费 selected model `input_modality_policy`，显式 text-only 模型遇到 `input.images` 时拒绝发送到 provider。下一步从“让 metadata 进入 runtime/request/tool 执行面”转向 reasoning/context consumer 证据和 Codex-style `unified_exec` current executor。
> 本轮补充：第三十八刀 request/tool/context consumer 主链、contract gate、runtime current fixture、P2 App Server lifecycle owner、`lime-agent` typed event construction owner、active state gate、approval pending transition、process/terminal correlation、approval resolved terminal transition、Evidence export correlation、action/tool identity split、RuntimeCore `action/respond` lifecycle guard、RuntimeState/Aster pending resume 证据、App Server RuntimeBackend bridge 证据与 Tool / Approval / Sandbox final combo evidence 已完成；bridge fixture 已接入 live `ExecutionProcessServer`，并通过正式 `ExecutionBackend::start_turn -> action.required -> RuntimeBackend::respond_action(ToolConfirmation) -> Aster pending future -> tool.result/message.delta/turn.completed` 回归。Context / Token fragment typed owner 已精修，App Server `context_packet` consumer 已消费 `ContextFragmentEnvelope` 并输出 `fragmentEnvelope` telemetry；Plugin / Skills / MCP 已新增 `runtimeCapabilities` snapshot owner并接入 projected plugin manifest，App Center plugin projection 已消费该 snapshot 生成 skill/tool/MCP runtime capability projection，详情页技能展示也已迁到 projection consumer，不再直接读旧 `manifest.skillRefs`；Realtime / Media / Collaboration 已新增 RuntimeCore `RuntimeContentPart` / media reference owner，按 MIME 归类 image/audio/video/file，非文本内容只能带 reference；第二十二刀已让支持 MIME 的 LLM image/audio 输出经 `llm_protocol` 映射为 `message.delta` + `contentPart/contentParts` typed payload；第二十三刀已新增 `RuntimeMessageDeltaContent`，统一 `text`、`contentPart`、`contentParts` 的 `message.delta` 内容 payload owner；第二十四刀已新增 owner-backed payload parser，解析 Item projection 后续要消费的 `message.delta` payload，并校验 `contentPart` / `contentParts` alias 一致；inline data URL、unsupported MIME 或 missing MIME 继续保持 `runtime.event` generic。P3 第五次 upstream range check 已完成：Codex 新增 configWarning owner 收敛与 safety buffering `retry_model` adopt-now 信号，conditional dotenv 记为 desktop-adapt/watch，同时回滚第四次 `interleaved response items`，opencode 无新增；本轮已新增 [p2-codex-fifth-signal-handoff.md](./p2-codex-fifth-signal-handoff.md)，把 App Server warning owner、provider `retry_model` parser 和 Desktop Host env overlay watch 拆成可接管施工单；下一次 upstream 从 Codex `8268cbfb0e5f39cb4efff928264fe8f29ddacafb` 与 opencode `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` 起算。
> Soul 对齐补充：Interaction Soul 不新增 runtime、transcript 或 UI 句库；它只作为 `memory_soul_prompt_context`、tool lifecycle metadata、collaboration facts、risk facts 和 GUI projection data contract 进入 `Thread -> Turn -> Item/read model` 主链。四个 built-in Style Pack seed 已迁到前端 `src/lib/soul/style-profiles/packs/*.json` manifest，并由 `builtInProfiles.ts` registry loader 校验后输出完整 transcript surface contract 与 few-shot anchors，覆盖工具前/中/后、正文细节和结尾建议；deterministic transcript golden 已证明同一工具 facts 下四风格文本不同且 fact tokens 不漂移；`soul-style` Electron current fixture 已通过 `--soul-style-profile` 覆盖四个 built-in profile，证明 current pack id、lifecycle contract 和 profile-specific transcript 进入真实 GUI/read model；`AgentRuntimeStrip` 已接入 collaboration facts / Soul metadata contract；`runtime_status.rs` 旧 profile-specific title rewrite 已删除；旧共享 `com.lime.builtin.default` 按 `dead / forbidden-to-restore` 处理。
> 最新复核：2026-07-06 当前进程重跑 `respond_action_tool_confirmation_resumes_pending_aster_tool_future` 已通过，App Server RuntimeBackend bridge 证据为 green；随后完成第十六刀组合证据：`npm run governance:legacy-report` 通过且边界违规 0，`node scripts/check-app-server-client-contract.mjs` 通过 287 项，`npm run test:contracts` 完整通过，`npm run smoke:agent-runtime-current-fixture` 完整通过且 `liveProviderUsed=false`，`npx vitest run "src/components/agent/chat/projection/toolEventProjection.test.ts" "src/components/agent/chat/projection/actionProjection.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts"` 通过 27 tests。第 52-54 节的失败/阻塞记录保留为历史诊断，当前事实源以第 55 节、第十六刀协作表和顶部复核为准。
> 并行认领：2026-07-05 本进程已完成 P1-4 第三 / 第四 / 第五 / 第六 / 第七刀 `session_execution_runtime.rs` owner 拆分、P1-5 第八至第二十二刀 UI projection owner 收敛、P1-6 第一 / 第二 / 第三刀 `evidence/export` current projection、派生导出 correlation、export boundary 守卫与 requestTelemetry 负向测试，以及 P1-7 第一至第三十五刀前置 Provider / Model capability owner / guard 收敛；通过本计划文件标注协作边界，避让隔壁进程已持有的 App Server projection / read model / tool-runtime / stream runtime / protocol generated / registry DTO 热区。

## 1. 跟进原则

本文件是 v1 的过程台账，不替代 PRD、架构文档或路线图。

固定规则：

1. 先看 [lime-current-state.md](./lime-current-state.md)，确认 Lime current owner 和 `current / compat / deprecated / dead` 分类。
2. 再看 [codex-architecture-map.md](./codex-architecture-map.md)，确认 Codex 核心层。
3. 涉及多模型、多模态时，才看 [opencode-reference-comparison.md](./opencode-reference-comparison.md)。
4. 每一刀都必须绑定验证入口；文档对齐不能替代工程验证。
5. 新增能力只能进入 current 主链；旧 `lime-rs/src/**`、旧 `agent_runtime_*` production surface、生产 mock fallback 不得作为实施入口。

## 2. 当前完成度

| 层级 | 状态 | 证据 |
| --- | --- | --- |
| P0 文档基线 | `done` | `prd.md`、`codex-architecture-map.md`、`lime-current-state.md`、`codex-origin-comparison.md`、`opencode-reference-comparison.md`、`architecture.md`、`diagrams.md`、`module-alignment-plan.md`、`fast-alignment-roadmap.md`、`follow-up-strategy.md` |
| P0 现状对照 | `done` | [lime-current-state.md](./lime-current-state.md) 已覆盖 current 主链、Rust workspace、Agent session / turn / item read model、多模型多模态现状、分类和 Codex 对齐缺口 |
| P1 工程对齐 | `in-progress` | P1-1 Thread / Turn / Item invariant 已完成；P1-2 method catalog / serialization scope 已贯通；P1-3 已验证 `RuntimeEvent -> Item -> read model -> GUI` 的终态和历史恢复关键链路；P1-4 已补 core runtime owner 回流守卫；P1-5 已把 UI projection 聚合器收敛为 owner 委托；P1-6 Persistence / Replay / Trace 已完成 `evidence/export`、派生导出 correlation 与 requestTelemetry 负向测试；P1-7 已把 Provider / Model capability current owner 推进到最终 submit op fail-closed、prepare / submit final gate evidence 一致性、前端 execution summary 边界守卫、RuntimeCore snapshot 负向测试、route DTO 分层守卫、`ResolvedModelRoute` 协议字段删除、send wrapper selected summary 注入、`RouteDefaults` execution policy boundary guard、GUI send policy owner、Inputbar disabled 接线、execution/context/picker/tool-call/reasoning/reasoning-output/input-modality/responses request-mode/truncation policy owner、registry metadata execution 接线、Codex 原点源级守卫、opencode 多模态 reference guard 与协议 rollout completeness guard |
| P2 深层能力 | `in-progress / app-server-tool-lifecycle-owner-done / lime-agent-event-owner-done / active-state-gate-done / approval-pending-transition-done / process-correlation-done / terminal-correlation-done / approval-resolved-terminal-done / evidence-export-correlation-done / action-tool-id-split-done / action-respond-lifecycle-guard-done / runtime-state-aster-resume-evidence-done / runtimebackend-bridge-evidence-done / tool-approval-sandbox-combo-evidence-done / context-fragment-owner-refined / context-packet-consumer-done / plugin-runtime-capability-owner-done / plugin-app-center-projection-consumer-done / plugin-runtime-capability-schema-identity-guard-done / plugin-app-center-detail-consumer-done / runtime-content-owner-done / llm-media-content-event-done / message-delta-content-owner-done / message-delta-content-parser-done / soul-style-pack-manifest-registry-done / soul-runtime-strip-consumer-done / soul-runtime-status-profile-switch-removed / codex-fifth-signal-handoff-ready` | [p2-runtime-skeleton.md](./p2-runtime-skeleton.md) 已固定 Tool / Approval / Sandbox、Context / Token / Compaction、Plugin / Skills / MCP、Realtime / Media / Collaboration 的 owner、first code slice、禁止路径和最小验证；Tool / Approval / Sandbox 已完成 App Server external runtime event lifecycle owner、`lime-agent` typed event construction owner、active state gate、approval pending terminal transition、process lifecycle correlation、terminal metadata correlation、approval resolved terminal transition、Evidence export correlation 第一刀、action id / tool id 解耦前置刀、RuntimeCore `action/respond` lifecycle guard、RuntimeState/Aster pending future resume 证据、App Server `RuntimeBackend::respond_action` bridge evidence，以及 governance / contract / runtime fixture / projection 组合证据；Context / Token / Compaction 已完成 RuntimeCore fragment typed owner 精修，App Server `context_packet` 已从手写 token 截断迁到 `ContextFragmentEnvelope` / sidecar reference consumer；Plugin / Skills / MCP 已完成 App Server plugin package `runtimeCapabilities` owner，并让 App Center plugin projection 优先消费 snapshot 生成 skill/tool/MCP capability projection，schema gate 已拒绝 pluginId/version 与当前 projection app 不匹配的 snapshot，详情页技能展示已消费 projection 而非旧 `manifest.skillRefs`；Realtime / Media / Collaboration 已完成 RuntimeCore content/media reference typed owner、LLM media output typed RuntimeEvent、`RuntimeMessageDeltaContent` payload owner 和 payload parser，Soul style pack seed 已迁到 manifest registry，Soul runtime strip 已消费 collaboration facts，旧 runtime status profile switch 已删除；Codex fifth signal handoff 已固定 App Server `configWarning`、provider safety buffering `retry_model`、Desktop Host startup env overlay 的 owner / 禁止路径 / 最小验证；下一步转入 Context Evidence export / sidecar source、Plugin skill/MCP runtime consumer、Media Item/read model projection 或 Codex fifth signal implementation slice，不再把 bridge 或组合证据当 blocker |
| P3 上游跟进 | `in-progress / fifth-range-check-done / rollback-aware-signals-recorded` | [follow-up-strategy.md](./follow-up-strategy.md) 已定义高价值路径和分类规则；[upstream-checkpoint.md](./upstream-checkpoint.md) 固定初始 checkpoint；[upstream-diff-2026-07-06.md](./upstream-diff-2026-07-06.md) 已完成一次真实 range diff；[upstream-diff-2026-07-07.md](./upstream-diff-2026-07-07.md) 记录第四次 Codex high-value 历史信号；[upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md) 已从第四次 anchor 记录 Codex `5` 个 commit，其中 configWarning owner / safety buffering 属于 adopt-now、conditional dotenv 属于 desktop-adapt/watch、interleaved 属于 rollback signal，opencode `0` 个新增 |

## 2A. 并行协作标注

> 本节用于多进程协作认领。更新本文件时必须同步说明写集、避让写集和退出条件，避免只在聊天里声明。

| 时间 | 进程 / 切片 | 状态 | 认领写集 | 避让写集 | 退出条件 |
| --- | --- | --- | --- | --- | --- |
| 2026-07-07 | P2 Codex fifth signal `configWarning` processor config-load emitter | `processor-config-load-emitter-done / rules-reload-emitter-pending / app-server-test-blocked-by-tool-runtime` | `lime-rs/crates/app-server/src/processor/config_warning.rs`；`lime-rs/crates/app-server/src/processor/mod.rs`；`lime-rs/crates/app-server/src/processor/dispatch.rs`；`lime-rs/crates/app-server/src/processor/tests.rs`；`lime-rs/crates/app-server/src/processor/tests/config_warning.rs`；`internal/research/refactor/v1/p2-codex-fifth-signal-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/tool-runtime/**`、`electron/**`、`src/lib/api/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/governance/**`、`lime-rs/vendor/aster-rust/**`；本刀不接 `.rules` / exec-policy reload，不接 bridge/GUI consumer，不修 `tool-runtime` 并行依赖问题 | App Server processor current 主链新增只读 config warning probe：现有 `config.yaml` / legacy `config.json` 解析失败时生成 typed `configWarning`；`initialize` 与 `agentSession/turn/start` 均把 notification 合并进当前 JSON-RPC response path，turn-start 保持 connection-scoped，不走 broadcast、不进 GUI 旁路。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`、scoped `git diff --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-app-server-config-warning-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server config_warning -- --nocapture` 被无关并行热区 `lime-rs/crates/tool-runtime/src/apply_patch.rs` unresolved import `patch_apply` 阻塞。剩余：`.rules` / exec-policy reload warning、Desktop Host / frontend bridge consumer、GUI presentation 仍 pending。 |
| 2026-07-07 | P2 Codex fifth signal `configWarning` protocol contract | `protocol-contract-done / runtime-emitter-pending` | `lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs`；`lime-rs/crates/app-server-protocol/src/protocol/v0/server_notification.rs`；`lime-rs/crates/app-server-protocol/src/protocol/v0/catalog.rs`；`lime-rs/crates/app-server-protocol/src/protocol/v0/tests/catalog.rs`；`lime-rs/crates/app-server-protocol/src/protocol/v0/schema_types.rs`；`lime-rs/crates/app-server-protocol/src/schema_export/registry.rs`；`lime-rs/crates/app-server-protocol/schema/json/**`；`packages/app-server-client/src/generated/protocol-types.ts`；`internal/research/refactor/v1/p2-codex-fifth-signal-handoff.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/completion-audit.md` | 继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`electron/**`、`src/lib/api/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/governance/**`、`lime-rs/vendor/aster-rust/**`；本刀不接 runtime emitter、不接 bridge/GUI consumer、不碰 Aster 迁移热区 | App Server protocol 已新增 Codex-style `configWarning` notification contract：`METHOD_CONFIG_WARNING`、`ServerNotification::ConfigWarning(ConfigWarningNotification)`、`TextPosition/TextRange`、method catalog、schema registry、schema fixture 与 generated TS 均同步。验证：`notification_round_trips_config_warning_payload`、`schema_registry_matches_declared_type_names`、`schema_fixtures_match_generated_output`、隔离 target catalog 测试、`npm run check:protocol-types` 通过。剩余：App Server initialize / thread-start emitter、connection-scoped delivery、Desktop Host / frontend bridge consumer、GUI presentation 仍 pending。 |
| 2026-07-07 | P2 Codex fifth signal handoff | `handoff-ready / code-pending / blocked-by-parallel-write` | `internal/research/refactor/v1/p2-codex-fifth-signal-handoff.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 只读审计 `lime-rs/crates/model-provider/src/provider_stream.rs`、App Server runtime/backend、Electron、frontend API、projection package 与 AgentChat GUI；继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`electron/**`、`src/lib/api/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/governance/**`、`lime-rs/vendor/aster-rust/**`；本刀不接 App Server `configWarning` 代码、不接 provider safety buffering parser、不接 Desktop Host env overlay | 新增第五次 Codex 信号施工单：App Server `configWarning` owner 必须由 initialize / `thread/start` config reload flow 输出 connection-scoped typed warning；provider safety buffering parser 必须读取 payload `retry_model`，区分 explicit null 与 missing fallback header；conditional dotenv 只作为 Desktop Host sidecar startup env overlay watch，不照搬 CLI `CODEX_HOME` / `arg0`。只读审计确认 Lime 当前没有 safety buffering 命中，也没有 App Server `configWarning` current event 链。验证：scoped 文档 whitespace / conflict marker check。 |
| 2026-07-07 | P2 Codex fifth signal safety buffering parser | `provider-safety-buffering-parser-done / runtime-event-projection-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs` 并行 reasoning-output 改动、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不接 RuntimeEvent/read model/GUI projection，不改 App Server runtime/backend | `model-provider::safety` 新增 `parse_safety_buffering_retry_model(...)` 和 `ProviderSafetyBufferingRetryModelSource`，固定 Codex upstream wire 语义：payload `retry_model` 优先，explicit null 不 fallback，字段缺失才读旧 `x-codex-safety-buffering-faster-model` header，且不读取 payload `faster_model`。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 通过。 |
| 2026-07-07 | P2 Codex fifth signal safety buffering RuntimeEvent payload owner | `provider-safety-buffering-runtime-payload-owner-done / provider-stream-consumer-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不接 provider stream，不写 App Server RuntimeEvent storage/read model/GUI projection | `model-provider::safety` 新增 `ProviderSafetyBufferingUpdate`、`parse_safety_buffering_update(...)`、`safety_buffering_enabled_header(...)` 与 `to_runtime_event_payload(...)`，让后续 RuntimeEvent 直接消费 camelCase typed payload：`retryModel`、`fallbackHeaderModel`、`source`、`showBufferingUi`、`useCases`、`reasons`；payload 不暴露 raw `retry_model` / `faster_model` / `fasterModel`，避免 provider stream 接入后再次解释 wire 字段。验证：`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture` 21 tests 通过、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 33 tests 通过。 |
| 2026-07-07 | P2 Codex fifth signal safety buffering response-event owner | `provider-safety-buffering-response-event-owner-done / provider-stream-consumer-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不夹写 provider stream / App Server runtime / read model / GUI projection | `model-provider::safety` 新增 `SAFETY_BUFFERING_RESPONSE_EVENT_FIELD` 与 `parse_safety_buffering_response_event(...)`，把 Responses event 的 `safety_buffering` 字段提取也封进 current safety owner；provider stream 后续只调用 owner，不自行解释 raw event object / boolean false / `retry_model`。验证：`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture` 23 tests 通过、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 35 tests 通过；Cargo home / target 均在 `/tmp`。 |
| 2026-07-07 | P2 Codex fifth signal safety owner test split | `safety-owner-size-guard-done / provider-stream-consumer-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`lime-rs/crates/model-provider/src/safety/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不改 provider stream 行为 | 将 `safety.rs` 内联测试拆到 `safety/tests.rs`，`safety.rs` 从 778 行降到 351 行，避免继续向接近 800 行的 owner 文件追加新业务逻辑；现有 safety parser / RuntimeEvent payload / response-event owner 行为不变。验证：`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture` 23 tests 通过、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 35 tests 通过；Cargo home / target 均在 `/tmp`。 |
| 2026-07-07 | P2 Codex fifth signal safety buffering typed runtime payload refine | `provider-safety-buffering-typed-runtime-payload-done / provider-stream-consumer-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`lime-rs/crates/model-provider/src/safety/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不接 provider stream / App Server RuntimeEvent / read model / GUI projection | `model-provider::safety` 新增 `ProviderSafetyBufferingRuntimeEventPayload` 与 `SAFETY_BUFFERING_RUNTIME_EVENT_KIND`，`ProviderSafetyBufferingUpdate::runtime_event_payload(...)` 返回 typed payload，`to_runtime_event_payload(...)` 只负责序列化同一 typed payload；测试覆盖 explicit null 在 RuntimeEvent payload 中保持 typed null 且不暴露 raw `retry_model` / `faster_model`。验证：`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-typed-payload-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture` 24 tests 通过、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 36 tests 通过；Cargo home / target 均在 `/tmp`。 |
| 2026-07-07 | P2 Codex fifth signal safety buffering source enum refine | `provider-safety-buffering-source-enum-done / provider-stream-consumer-pending` | `lime-rs/crates/model-provider/src/safety.rs`；`lime-rs/crates/model-provider/src/safety/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**`；本刀不接 provider stream / App Server RuntimeEvent / read model / GUI projection | `ProviderSafetyBufferingRetryModelSource` 派生 `Serialize` 并按 snake_case 序列化，`ProviderSafetyBufferingRuntimeEventPayload.source` 从 `&'static str` 改为该 enum；typed payload consumer 不再持有 source 字符串，JSON 仍输出 `payload_retry_model` / `explicit_null` 等稳定值。验证：`CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-source-enum-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture` 24 tests 通过、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture` 36 tests 通过；Cargo home / target 均在 `/tmp`。 |
| 2026-07-07 | P2 精修：Embedding local ONNX cache path governance | `embedding-onnx-cache-to-tmp-done / runtime-consumer-pending` | `lime-rs/crates/embedding/src/lib.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**`、`electron/**` 并行热区；本刀不接 App Server runtime、skill prompt injection runtime consumer、MCP runtime import 或 Media Item projection | 本地 ONNX embedding 默认模型缓存不再走 `dirs::cache_dir()` / `~/Library/Caches`，统一落到可清理临时根 `/tmp/lime/models/embedding`（非 Unix 回退 `std::env::temp_dir()`）；显式 `LIME_LOCAL_ONNX_CACHE_DIR` override 保留，但落在系统 cache root 下会被重定向回默认临时根。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --check`、`CARGO_HOME="/tmp/lime-codex-cargo-home-embedding" CARGO_TARGET_DIR="/tmp/lime-codex-embedding-cache-target-fresh" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --features local-onnx local_onnx_cache_dir -- --nocapture`、同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --features local-onnx -- --nocapture` 通过。 |
| 2026-07-07 | P2 精修：Plugin installer temp/cache path governance | `plugin-installer-temp-cache-to-system-temp-done / runtime-consumer-pending` | `lime-rs/crates/core/src/plugin/installer/plugin_installer.rs`；`lime-rs/crates/core/src/plugin/installer/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**`、`scripts/**` 并行热区；本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server plugin package backend | `PluginInstaller::{new,from_paths}` 会把落在系统 cache root 下的 temp dir 归一到 `std::env::temp_dir()/plugin-installer/<leaf>`；插件临时 cache cleanup 改为清 `temp_dir/plugin-cache/<plugin-id>`，不再把系统 cache 目录作为 current 写入/清理目标。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-core --check`、`CARGO_TARGET_DIR="/tmp/lime-codex-plugin-temp-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core test_installer_rebases_system_cache_temp_dir_to_system_temp -- --nocapture`、`CARGO_TARGET_DIR="/tmp/lime-codex-plugin-temp-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core plugin::installer -- --nocapture`、scoped `git diff --check` 均通过。 |
| 2026-07-07 | P3 第五次 upstream range check | `fifth-range-check-done / rollback-aware / opencode-unchanged` | `internal/research/refactor/v1/upstream-diff-2026-07-07-p3-fifth.md`；`internal/research/refactor/v1/upstream-checkpoint.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/p2-media-item-projection-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md` | 只读 `/Users/coso/Documents/dev/rust/codex` 与 `/Users/coso/Documents/dev/js/opencode`；继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**` 等并行热区；本刀不实现 Media Item projection、不接 provider stream parser、不接 thread/start warning consumer、不接 Desktop Host env overlay | 已从 Codex `8917244f7dcc1a945f3d5eba3dea53f6dbb16349..8268cbfb0e5f39cb4efff928264fe8f29ddacafb` 记录 5 个信号：configWarning owner 收敛、per-thread config warning、interleaved revert、safety buffering `retry_model`、conditional dotenv watch；opencode `origin/dev` 无新增。已把 Media handoff 的 interleaved 口径改为 `rollback-aware / Lime invariant`，下一次从 Codex `8268cbfb0e5f39cb4efff928264fe8f29ddacafb` 起算。验证：scoped 文档 whitespace / conflict marker check。 |
| 2026-07-07 | P2 第二十八刀：Plugin App Center detail tools / MCP projection consumer | `plugin-app-center-detail-tools-mcp-consumer-done / skill-mcp-runtime-consumer-pending` | `src/features/plugin/ui/PluginDetailRuntimeSections.tsx`；`src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx`；`src/features/plugin/ui/pluginDetailDeclarations.ts`；`src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts`；`src/features/plugin/ui/PluginsPage.tsx`；`src/i18n/resources/zh-CN/agent.json`；`src/i18n/resources/zh-TW/agent.json`；`src/i18n/resources/en-US/agent.json`；`src/i18n/resources/ja-JP/agent.json`；`src/i18n/resources/ko-KR/agent.json`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 继续避让 `lime-rs/crates/runtime-core/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**` 等并行热区；本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend | `buildDetailTools(...)` 优先消费 `installedState.projection.toolRequirements`，旧 `manifest.toolRefs` 仅 fallback；`buildDetailMcpBindings(...)` 优先消费 `installedState.projection.runtimeCapabilities.mcpBindings`，旧 raw manifest MCP binding 仅 fallback；`PluginDetailRuntimeSections` 接管 subagent / skill / tool / MCP detail sections，避免继续向 `PluginsPage.tsx` 追加 runtime UI 分支。验证：Prettier check 通过；`npx vitest run "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx" "src/features/plugin/ui/PluginsPage.test.tsx"` 通过 39 tests；`npm run typecheck` 通过；scoped `git diff --check` 通过。 |
| 2026-07-07 | P2 Media Item projection handoff | `handoff-ready / item-projection-pending / blocked-by-parallel-write / rollback-aware` | `internal/research/refactor/v1/p2-media-item-projection-handoff.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 只读 `lime-rs/crates/runtime-core/src/runtime_content.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model/messages.rs`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`src/lib/api/agentProtocol.ts`；继续避让 App Server runtime/backend、projection package、AgentChat GUI、Aster vendor、governance 等并行热区；本刀不改源码 | 新增文件级 handoff，固定下一刀必须从 App Server `agent_message` Item/read model 消费 `RuntimeMessageDeltaContent::from_payload(...)` 开始，随后同步 protocol/client type、projection package、GUI hydrate/streaming consumer；第五次 P3 已确认 Codex interleaved item 行为回滚，后续按 Lime 自身 `itemId` invariant 验证，不得把有 `itemId` 的 delta 退化成 active item 猜测；明确禁止在 Aster vendor、provider wire 或 GUI 旁路重解释媒体。验证：scoped 文档 whitespace / conflict marker check。 |
| 2026-07-07 | P3 第四次 upstream range check 文档收口 | `scoped-doc-check-done / anchors-current` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/upstream-checkpoint.md` | 继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**` 等并行热区；本刀不实现 Media Item projection、不接 Plugin runtime consumer | 已把旧第 38.4 下一刀建议标记为被 2026-07-07 第四次 range check 取代，并把 `upstream-checkpoint.md` 顶部状态和结论更新到 Codex `8917244f7dcc1a945f3d5eba3dea53f6dbb16349` / opencode `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` anchor。验证：scoped `git diff --check` 通过；scoped trailing whitespace 搜索无命中；旧 anchor 搜索仅保留历史 range 或 superseded 段落。 |
| 2026-07-07 | P2 第二十七刀：Plugin App Center detail projection consumer | `plugin-app-center-detail-consumer-done / skill-mcp-runtime-consumer-pending` | `src/features/plugin/ui/PluginsPage.tsx`；`src/features/plugin/ui/pluginDetailDeclarations.ts`；`src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts`；`src/features/plugin/projection/projectApp.ts`；`src/features/plugin/projection/projectApp.test.ts`；`src/features/plugin/types.ts`；`src/features/plugin/types.d.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/runtime-core/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**` 等并行热区；本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend | `PluginsPage.tsx` 是 2848 行巨型文件，本刀不再向其中追加 runtime 推断，而是抽出 `pluginDetailDeclarations.ts` 纯 helper；详情页技能展示优先消费 `installedState.projection.skillRequirements`，旧 `manifest.skillRefs` 仅在 projection 缺失时 fallback。`npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginsPage.test.tsx"` 通过 42 tests；手写文件 `npx prettier --check ...` 通过；`npm run typecheck` 通过；scoped `git diff --check` 通过。 |
| 2026-07-07 | P3 第四次 upstream range check | `fourth-range-check-done / superseded-by-fifth-interleaved-rollback` | `internal/research/refactor/v1/upstream-diff-2026-07-07.md`；`internal/research/refactor/v1/upstream-checkpoint.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 只读 `/Users/coso/Documents/dev/rust/codex` 与 `/Users/coso/Documents/dev/js/opencode`；继续避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**` 等并行热区；本刀不实现 Media Item projection、不接 Plugin runtime consumer | 从 Codex `be33f80bc65159c094ecd06bf155afa3061ce23d..8917244f7dcc1a945f3d5eba3dea53f6dbb16349` 记录 3 个当时 high-value 信号：interleaved response items、delegate MCP startup private event、plugin guidance readiness；其中 interleaved 信号已被第五次 range check 的 `7b4e70d567` 回滚覆盖。从 opencode `e0ec9be238a1495454e46426665323af25273b63..eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` 记录 13 个非 merge commit 且无多模型 / 多模态 allowlist 采纳项。当前 anchor 以第五次记录为准。 |
| 2026-07-07 | P2 第二十六刀：Media Item projection 接管审计 | `blocked-by-parallel-write / item-projection-pending` | `internal/research/refactor/v1/priority-tracking-plan.md` | 避让当前大规模脏区：`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**`；本刀不接管 App Server Item/read model、projection package 或 Workbench/GUI 源码 | 只读审计确认 `RuntimeMessageDeltaContent::from_payload(...)` 尚未被 App Server runtime/backend 或 `packages/agent-runtime-projection` 消费：`rg -n "RuntimeMessageDeltaContent::from_payload|from_payload\\(&.*message|contentParts|contentPart" "lime-rs/crates/app-server/src/runtime" "lime-rs/crates/app-server/src/runtime_backend"` 无命中；`rg -n "RuntimeMessageDeltaContent|runtime_content|contentParts|contentPart" "packages/agent-runtime-projection/src" "packages/agent-runtime-projection/tests"` 无命中。GUI `src/components/agent/chat/**` 已有大量并行 contentParts 改动，不能夹写。后续接管条件：目标文件干净、隔壁进程在本计划移交，或用户明确授权接管脏热区；下一次代码刀应直接把 `message.delta.contentParts -> Item/read model -> Workbench` 接到 RuntimeCore parser，而不是在 GUI 或 provider wire 旁路重新解释媒体。 |
| 2026-07-07 | P2 第二十五刀：Plugin runtime capability schema identity guard | `plugin-runtime-capability-schema-identity-guard-done / skill-mcp-runtime-consumer-pending` | `src/features/plugin/schema/schemaGate.ts`；`src/features/plugin/schema/schemaGate.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/runtime-core/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`src/components/agent/chat/**`、`src/lib/api/**`、`src/lib/governance/**` 等并行热区；本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend | `schemaGate` 对可选 `runtimeCapabilities` 增加 plugin identity 校验：`pluginId` 必须匹配 projection appId，`version` 存在时必须匹配 projection app version；坏 snapshot 不再能被 App Center 当 current capability truth 消费。`npx vitest run "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/projection/projectApp.test.ts"` 通过 9 tests；Prettier check 与 scoped `git diff --check` 通过。 |
| 2026-07-07 | P2 第二十四刀：Runtime message delta content payload parser | `message-delta-content-parser-done / item-projection-pending` | `lime-rs/crates/runtime-core/src/runtime_content.rs`；`lime-rs/crates/runtime-core/src/lib.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**` 等并行热区；本刀不接 Item/read model/Workbench projection | `RuntimeMessageDeltaContent::from_payload(...)` 已新增 owner-backed payload parser，允许后续 App Server Item projection 解析 `message.delta` payload 时复用 RuntimeCore；parser 会忽略事件层 `backend/source/runtimeEvent` 元数据，支持 `contentPart` 与单元素 `contentParts` alias 归一，并拒绝 alias 不一致。`rustfmt --edition 2021` 已应用格式；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-parser-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，13 tests，45 filtered out；补跑 `CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-parser-target-llm" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests，36 filtered out。 |
| 2026-07-07 | P2 第二十三刀：Runtime message delta content payload owner | `message-delta-content-owner-done / item-projection-pending` | `lime-rs/crates/runtime-core/src/runtime_content.rs`；`lime-rs/crates/runtime-core/src/lib.rs`；`lime-rs/crates/runtime-core/src/llm_protocol/events.rs`；`lime-rs/crates/runtime-core/src/llm_protocol/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`packages/agent-runtime-projection/**`、`src/components/agent/chat/**`、`lime-rs/vendor/aster-rust/**`、`src/lib/governance/**` 等并行热区；本刀不接 Item/read model/Workbench projection | RuntimeCore 已新增 `RuntimeMessageDeltaContent` owner，统一 `text`、`contentPart`、`contentParts` 的 `message.delta` payload 形状；`llm_protocol` 文本与 media 输出均经该 owner 构造。`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/runtime_content.rs" "lime-rs/crates/runtime-core/src/llm_protocol/events.rs" "lime-rs/crates/runtime-core/src/llm_protocol/tests.rs"` 通过；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，10 tests，45 filtered out；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-target-llm" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests，33 filtered out。 |
| 2026-07-06 | P2 第二十二刀：LLM media output typed content event | `llm-media-content-event-done / item-projection-pending` | `lime-rs/crates/runtime-core/src/llm_protocol/events.rs`；`lime-rs/crates/runtime-core/src/llm_protocol/tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/plugin_packages/**`、`lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/vendor/aster-rust/**`、`src/components/agent/chat/**`、`src/lib/governance/**` 等并行热区；本刀不改 App Server read model / Item projection，不接 GUI Workbench | RuntimeCore `runtime_event_from_llm_event(...)` 已对支持 MIME 的 `LlmOutputPart::Image/Audio` 输出 `message.delta` + `contentPart/contentParts` typed payload，并复用 `RuntimeContentPart` owner；inline data URL、unsupported MIME 或 missing MIME 不进入 typed content part，继续保持 `runtime.event` generic。`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/llm_protocol/events.rs" "lime-rs/crates/runtime-core/src/llm_protocol/tests.rs"` 通过；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-llm-media-content-target-3" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests，31 filtered out。 |
| 2026-07-06 | P2 第二十一刀：Plugin App Center runtime capability projection consumer | `plugin-app-center-projection-consumer-done / skill-mcp-runtime-consumer-pending` | `src/features/plugin/types.ts`；`src/features/plugin/types.d.ts`；`src/features/plugin/manifest/normalizeManifest.ts`；`src/features/plugin/projection/projectApp.ts`；`src/features/plugin/projection/projectApp.test.ts`；`src/features/plugin/schema/schemaGate.ts`；`src/features/plugin/schema/schemaGate.test.ts`；`src/features/plugin/ui/PluginsPage.testFixtures.tsx`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/runtime-core/src/runtime_content.rs`、`lime-rs/crates/runtime-core/src/lib.rs`、`lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/thread-store/**`、`scripts/check-app-server-client-contract.mjs`、`src/lib/api/**`、`src/lib/governance/**`、`src/components/agent/chat/**` 等并行热区；本刀不接 runtime prompt injection，不导入 MCP runtime，不改 App Server runtime/backend | 前端 plugin manifest / normalized / projection 类型新增 `runtimeCapabilities`；`projectApp(...)` 在 snapshot 存在时优先用 `runtimeCapabilities.skills/tools` 生成 `skillRequirements` / `toolRequirements`，并保留 `promptInjectionPolicy` / `bindingKind` / `mcpBindings`；旧 `skillRefs/toolRefs` 只作为 snapshot 缺失 fallback；schema gate 对可选 `runtimeCapabilities` 做数组结构校验。`npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts"` 通过 8 tests；`npm run typecheck` 通过；Prettier check 与 scoped `git diff --check` 通过。`PluginsPage.testFixtures.tsx` 已补齐 `listPlatformPluginAuditLogs` mock export，`npx vitest run "src/features/plugin/ui/PluginsPage.test.tsx"` 通过 31 tests；此前 related 中剩余 AgentChat bootstrap preview 失败仍属 `src/components/agent/chat/**` 并行热区。 |
| 2026-07-06 | P2 第二十刀：Runtime content part / media reference owner | `runtime-content-owner-done / item-projection-pending` | `lime-rs/crates/runtime-core/src/runtime_content.rs`；`lime-rs/crates/runtime-core/src/lib.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/memory_prompt.rs`、`lime-rs/crates/app-server/src/runtime/evidence_provider.rs`、`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs`、`lime-rs/crates/app-server/src/runtime/context_auto_compaction.rs`、`lime-rs/crates/app-server/src/plugin_packages/**`、`lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/vendor/aster-rust/**`、`src/components/agent/chat/**`、`src/lib/governance/**` 等并行热区；本刀不接 Evidence export、不改 App Server runtime consumer、不在 Aster vendor 补多模态逻辑 | RuntimeCore 新增 `RuntimeContentPart` / `RuntimeContentReference` / `RuntimeMediaKind` typed owner，按 MIME 而不是文件名判定 image/audio/video/file；非文本内容必须带 reference，拒绝 inline data URL；MIME allowlist 只采纳 opencode 多模态参考并补 Lime PDF；`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/runtime_content.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-content-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，7 tests，45 filtered out。 |
| 2026-07-06 | P2 第十九刀：Context packet fragment consumer | `context-packet-consumer-done / evidence-export-pending` | `lime-rs/crates/app-server/src/runtime/context_packet.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/memory_prompt.rs`、`lime-rs/crates/app-server/src/runtime/evidence_provider.rs`、`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`lime-rs/vendor/aster-rust/**`、`src/components/agent/chat/**`、`src/lib/governance/**` 等并行热区；本刀不接 Evidence export，不改 compaction prompt source，不在 Aster vendor 补 context 逻辑 | App Server `context_packet.rs` 已把 admitted packet 从手写 `truncate_to_token_budget` 迁到 RuntimeCore `ContextFragmentEnvelope::from_input(...)`；telemetry 输出 `fragmentEnvelope`；secret / empty reject 保持 `fragmentEnvelope=null`；metadata `sidecarRef` / `sidecar_reference` 进入 `ContextSidecarReference`；`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/context_packet.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-context-packet-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture` 通过，4 tests，806 filtered out；仅出现避让热区 `lime-agent/src/aster_session_store/legacy_conversation.rs` 既有 unused import warning。 |
| 2026-07-06 | P2 第十八刀：Plugin runtime capability snapshot owner | `plugin-runtime-capability-owner-done / consumer-pending` | `lime-rs/crates/app-server/src/plugin_packages/runtime_capabilities.rs`；`lime-rs/crates/app-server/src/plugin_packages.rs`；`lime-rs/crates/app-server/src/plugin_packages/plugin_manifest.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/thread-store/**`、`scripts/check-app-server-client-contract.mjs`、`src/lib/api/**`、`src/lib/governance/**` 等并行热区；本刀不接 skill prompt injection consumer、不启动 MCP runtime import、不改 App Center UI | 新增 `runtime_capabilities.rs` typed owner，从 projected manifest 生成 `runtimeCapabilities` snapshot，覆盖 plugin identity/version、skill metadata、workflow-scoped prompt injection policy、tool binding、MCP binding 与 workflow binding；`plugin_manifest.rs` 只在 projection 末尾消费 owner。`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/plugin_packages.rs" "lime-rs/crates/app-server/src/plugin_packages/plugin_manifest.rs" "lime-rs/crates/app-server/src/plugin_packages/runtime_capabilities.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-plugin-capabilities" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities -- --nocapture` 通过，4 tests；测试过程中仅出现避让热区 `lime-agent` 既有 unused import warning。 |
| 2026-07-06 | P2 第十七刀：Context / Token fragment typed owner 精修 | `context-fragment-owner-refined / consumer-pending` | `lime-rs/crates/runtime-core/src/context_fragments.rs`；`lime-rs/crates/runtime-core/src/lib.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/**`、`lime-rs/vendor/aster-rust/**`、`src/components/agent/chat/**`、`src/lib/governance/**` 等并行热区；本刀不接 prompt assembly / compact item / Evidence export consumer，不在 Aster vendor 补 context 逻辑 | 对 `ContextFragmentEnvelope` typed owner 做语义精修：`max_model_visible_tokens` 参与 preview char cap；`max_preview_chars=0` 且已有 sidecar 时输出 `reference_only`，缺 sidecar 才是 `hidden_requires_reference`；`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/context_fragments.rs"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core context_fragments -- --nocapture` 通过，6 tests；尾空白扫描无命中；scoped `git diff --check` 通过。 |
| 2026-07-06 | P2 第十六刀：Tool / Approval / Sandbox final combo evidence | `tool-approval-sandbox-combo-evidence-done / docs-contract-and-verification-only` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`scripts/check-app-server-client-contract.mjs` | 避让 `lime-rs/vendor/aster-rust/**`、`lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend.rs`、`lime-rs/crates/app-server/src/runtime_backend/**`、`src/components/agent/chat/**`、`src/lib/api/agentRuntime/**`、`src/lib/governance/**`、`packages/agent-runtime-projection/**` 等当前并行脏热区；只在 contract 脚本补 current owner 文件列表 | `npm run governance:legacy-report` 通过，边界违规 0，仍有既有分类漂移候选 `rust-agent-subagent-metadata-direct-read -> deprecated / 零引用`；首次 `npm run test:contracts` 因 contract guard 未扫描 `runtime_backend/tool_process_runtime_metadata.rs` 中的 `parse_tool_arguments(arguments)` 失败，随后只补 `scripts/check-app-server-client-contract.mjs` 的 current owner 文件列表；`node scripts/check-app-server-client-contract.mjs` 通过 287 checks；`npm run test:contracts` 完整通过；`npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 Electron/App Server current fixture、Coding Workbench、Claw 图片 / 画图 / 停止继续 / Plan history、Skills Runtime、Multi-Agent、MCP structuredContent、Expert Skills、内容工厂 Article Editor，`liveProviderUsed=false`；Tool / Action / Agent UI projection Vitest 通过 27 tests。本刀不修改 Aster vendor、不接管 App Server runtime/backend 或前端 GUI 源码。 |
| 2026-07-06 | P2 第十五刀：RuntimeBackend bridge evidence | `runtimebackend-bridge-evidence-done` | `lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 `lime-rs/crates/agent/src/runtime_state.rs`、`lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs`、App Server runtime/backend 其它热区、frontend / governance 并行脏区 | 补 `coding_event_projection.rs` missing import；`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs" "lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target-bridge" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture` 结果 `1 passed; 0 failed; 800 filtered out`。该证据证明 App Server `RuntimeBackend::respond_action(ToolConfirmation)` 能释放同一个 Aster pending tool future，并产出 `tool.result`、最终 `message.delta`、`turn.completed` 和 provider tool response 请求；早先临时 target archive/object 异常和本轮第一次 `/tmp` 冷编译期间的并行 thread-store metadata stale，均已由同一 `/tmp` target 复跑关闭，不计入 bridge 源码失败。 |
| 2026-07-06 | P2 第十四刀：RuntimeBackend bridge fixture stabilization | `fixture-stabilized / superseded-by-bridge-verification` | `lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md` | 避让 `lime-rs/vendor/aster-rust/**`、`lime-rs/crates/agent/src/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/event_mapper.rs`、`lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs`、`lime-rs/crates/app-server/src/runtime_backend.rs` 及其它并行脏文件 | Bridge fixture 已用 `RuntimeBackend::with_db_and_execution_process_server(db, ExecutionProcessServer::default())` 接入 live process hook；timeout panic 现在输出 `provider_requests`；fixture Bash arguments 收窄为 `printf runtime-confirmed`。`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs"` 通过。早先目标 cargo test 在共享 Rust 编译资源中超过 7 分钟未进入测试运行；该阻塞已由第十五刀复跑关闭。 |
| 2026-07-06 | P2 第十二刀：RuntimeBackend bridge 回归 | `historical-bridge-failed / superseded-by-55` | `lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 避让 `lime-rs/crates/agent/src/lib.rs`、`lime-rs/crates/agent/src/runtime_state.rs`、`lime-rs/crates/agent/src/runtime_support.rs`、`lime-rs/crates/app-server/src/runtime_backend/request_context.rs`、`lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs`、`lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs`、`lime-rs/crates/app-server/src/runtime_backend/tool_events.rs`、`lime-rs/crates/app-server/src/runtime_backend/tool_process_metadata.rs` | 历史记录曾把 `respond_action_tool_confirmation_resumes_pending_aster_tool_future` 标为通过；随后复跑纠正为失败，panic 在 `runtime_backend/initialization_tests.rs:223` 的 `tool confirmation request id`。该历史失败已被第十五刀通过证据覆盖，不再作为当前下一刀依据。 |
| 2026-07-06 | P2 第十一刀：RuntimeState resume 复跑与 bridge 失败记录 | `runtime-state-green / historical-bridge-failed / superseded-by-55 / docs-only` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md` | 避让 `lime-rs/crates/agent/src/runtime_state.rs`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**` | 只读复核发现 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture` 当时通过；bridge fixture 当时失败，说明 App Server `start_turn` 未向测试 sink 送出 `ActionRequired(tool_confirmation)`。该历史 bridge failure 已被第十五刀通过证据覆盖。 |
| 2026-07-06 | P2 第九刀：RuntimeCore action/respond lifecycle guard | `done for action/respond lifecycle guard / real aster resumed execution pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime/tests/external_events/actions.rs` | 避让 `lime-rs/crates/app-server/src/runtime/turn_execution.rs`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、RuntimeCore / frontend / governance 其它热区 | 新增 `respond_action_infers_tool_id_and_unblocks_pending_tool_result`，证明正式 `RuntimeCore::respond_action(...)` 在响应参数不带 tool id 时也会从 pending action 回填 `toolCallId`，并允许后续 `tool.result` 通过 lifecycle guard；`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/tests/external_events/actions.rs"` 通过，`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture` 1 passed；真实 Aster pending tool 端到端 resumed execution 仍 pending |
| 2026-07-06 | P2 第八刀：action/respond action/tool identity split pre-wiring | `done for action/tool identity split / real resumed execution pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs` | 避让 `lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`tool_orchestrator/tests.rs`、`catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs`、`tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、RuntimeCore / frontend / governance 热区 | `ToolApprovalActionSnapshot` 与 `ToolApprovalResolutionSnapshot` 已从 metadata 区分 action id / request id 与 `toolCallId` / `toolId`；`ToolExecutionLifecycleEvents` 用解析出的 tool id 释放 pending lifecycle，terminal `ToolEnd` 也归到同一 tool id；新增 distinct action/tool id owner tests；`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs"`、`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture` 13 tests passed、`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture` 15 tests passed；真实 App Server `action/respond` resumed execution 接线仍 pending |
| 2026-07-06 | P2 第七刀：Evidence export correlation | `done for evidence export correlation / action respond resumed execution pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime/evidence_provider.rs`；`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs` | 避让 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`tool_orchestrator/tests.rs`、`catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs`、`tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime / runtime_backend 其它脏文件、RuntimeCore / frontend / governance 热区 | App Server `coding_evidence_summary(...)` 已输出 `actionRequestIds` / `actionToolCallIds`；`coding_snapshot` 事件顺序固定为 `tool.started -> action.required -> action.resolved -> tool.result`，并断言 `action.resolved` 与 evidence summary 都能关联同一 `toolCallId`；`rustfmt --edition 2021 --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_coding_snapshot_artifacts -- --nocapture` 已通过；下一刀接 `action/respond` resumed tool execution |
| 2026-07-06 | P2 第六刀：approval resolved terminal transition | `done for approval resolved terminal transition / followed by evidence export correlation` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs` | 避让 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`tool_orchestrator/tests.rs`、`catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs`、`tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime / runtime_backend 其它脏文件、RuntimeCore / frontend / governance 热区 | `ToolExecutionLifecycleEvents` 从 terminal outcome metadata 识别 `action.resolved`，批准后才允许后续 terminal/output，拒绝后不允许成功 terminal；`tool_lifecycle.rs` 主体与 `tool_lifecycle/tests.rs` 已拆分，但仍需后续继续压小；本轮不接管 App Server evidence 写集，Evidence export correlation 已由第七刀完成 |
| 2026-07-06 | P2 第五刀：`lime-agent` terminal metadata correlation | `done for terminal correlation / followed by approval and evidence slices` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs` | 避让 `lime-rs/crates/agent/src/agent_tools/catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs`、`tool_orchestrator.rs`、`tool_orchestrator/tests.rs`、`tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区 | terminal `ToolEnd` metadata 由 `ToolExecutionTerminalSnapshot` 稳定补 `toolCallId` / `toolId` / `tool_id`；已有 correlation metadata 不覆盖；`rewrite_tool_terminal_event(...)` 继承同一规则；`rustfmt --edition 2021 --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture` 已通过；approval resolved terminal transition 已由第六刀承接，Evidence export correlation 已由第七刀承接 |
| 2026-07-06 | P2 第三刀：`lime-agent` approval pending terminal transition | `done for approval pending transition / followed by process and terminal correlation slices` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs` | 避让 `lime-rs/crates/agent/src/agent_tools/catalog.rs`、`inventory.rs`、`native_tool_policy_gate.rs`、`tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区 | approval-required outcome 只发 `ActionRequired` 并停在 `AwaitingApproval`，不再发失败 `ToolEnd`；重复 pending outcome 不重复发 action；sandbox / permission block 仍可发失败终态；`rustfmt --edition 2021 --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture` 已通过；process correlation 已由第 44 刀承接，terminal correlation 已由第 45 刀承接 |
| 2026-07-06 | P2 第二刀：`lime-agent` Tool execution lifecycle owner 骨架 | `done for typed event construction owner and active state gate / followed by approval and correlation slices` | `internal/research/refactor/v1/priority-tracking-plan.md`；`lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`；`lime-rs/crates/agent/src/agent_tools/mod.rs`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs` | 避让 `lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime 其它并行热区、frontend / governance 热区；未接管现有 native tool / truncation 并行实现，只在同文件上做生命周期 owner 委托 | `ToolStart`、`ActionRequired`、`ToolEnd` 构造已进入 `agent_tools/tool_lifecycle.rs` typed owner；approval-required / sandbox-blocked tool 不再发出 `ToolOutputDelta`，terminal 后重复 outcome 不再发事件；event shape 不变；approval pending 已由第三刀承接，process correlation 已由第 44 刀承接，terminal correlation 已由第 45 刀承接 |
| 2026-07-06 | P2 并行热区刷新：Tool / Approval / Sandbox handoff-only | `superseded by App Server lifecycle owner and lime-agent event owner slices` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 当时 scoped status 显示 `lime-rs/crates/agent/src/agent_tools/**`、App Server runtime、前端 hooks、`src/lib/governance/**` 有并行脏改；该只读判断已被后续 App Server lifecycle owner 与 `lime-agent` event construction owner 代码刀取代 | 保留为历史协调记录；后续以 `approval-pending-transition-done / process-correlation-done / terminal-correlation-done / approval-resolved-terminal-done / evidence-export-correlation-done` 为 current 事实，下一刀补 `action/respond` resumed tool execution |
| 2026-07-06 | P2 第一刀：Tool / Approval / Sandbox lifecycle typed owner | `done for App Server lifecycle owner / followed by lime-agent event owner` | `internal/research/refactor/v1/priority-tracking-plan.md`；`lime-rs/crates/app-server/src/runtime/tool_lifecycle.rs`；`lime-rs/crates/app-server/src/runtime/tool_lifecycle_tests.rs`；`lime-rs/crates/app-server/src/runtime/tests/external_events/tool_lifecycle.rs` | 继续避让 `lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs`、`lime-rs/vendor/aster-rust/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/app-server/src/runtime/tests/sessions.rs`、`lime-rs/crates/app-server/src/runtime/memory_prompt.rs`、Writing v2 / soul / scripts / frontend 并行热区 | 对标 Codex turn/tool runtime：App Server external runtime event owner 已固定 `ToolLifecycleSnapshot` / approval action / sandbox decision typed gate；`sandbox.blocked` / `permission.denied` 不再只是“active tool exists”检查，而是阻断后续 `tool.output.delta` / `tool.result`，只允许 `tool.failed` 关闭；`tool_lifecycle.rs` 已拆出相邻测试模块，中心文件降到 753 行；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture`、scoped `git diff --check` 已通过；后续 `lime-agent` event construction owner 已由第二刀承接 |
| 2026-07-06 | P1-7 第三十八刀第二十四切片：actual auto compact trigger owner | `done for RuntimeCore pre-turn trigger` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime/context_auto_compaction.rs`；`lime-rs/crates/app-server/src/runtime/session_control.rs`；`lime-rs/crates/app-server/src/runtime/turn_execution.rs`；`lime-rs/crates/app-server/src/runtime/tests.rs`；`lime-rs/crates/app-server/src/runtime/tests/context_auto_compaction.rs`；`src/lib/governance/asterContextPolicyBoundary.test.ts` | 继续避让 `lime-rs/vendor/aster-rust/**`、旧 `agent_runtime_*` production surface、`lime-rs/src/**`、已脏 `lime-rs/crates/app-server/src/runtime/tests/sessions.rs`、`lime-rs/crates/app-server/src/runtime/memory_prompt.rs`、`lime-rs/crates/app-server/src/runtime/soul/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/session_usage_projection.rs`、未跟踪 query / agent_tools / request_tool_policy 热区、Writing v2 / soul / scripts / frontend 其它治理热区 | 对标 Codex pre-sampling compact：`start_turn_inner(...)` 在 backend sampling 前调用 RuntimeCore current owner `maybe_auto_compact_before_turn(...)`；只在无 active turn、最近带 usage 的 `turn.completed` 晚于最近 compaction、且 `input_tokens >= min(model_context_window, auto_compact_token_limit)` 时触发；只计 request `input_tokens`，不把 `output_tokens` 算入 active context；触发复用现有 `context.compaction.started/completed`、sidecar artifact 与 next-turn session compaction prompt 注入；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_auto_compaction -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server compact_agent_session -- --nocapture`、`npx vitest run "src/lib/governance/asterContextPolicyBoundary.test.ts"` 已通过 |
| 2026-07-06 | P1-7 第三十八刀第二十三切片：session DB read model active context handoff consumer | `done for DB read-model handoff consumer / actual-trigger-pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests.rs` | 继续避让未跟踪 `lime-rs/crates/agent/src/session_execution_runtime_query.rs` 的 DB query 主体、`lime-rs/crates/agent/src/session_usage_projection.rs`、App Server runtime / runtime_backend / memory prompt、thread-store、Aster vendor、Writing v2 / soul / scripts / frontend governance 热区；本轮不接 actual compact trigger | `build_session_execution_runtime(...)` 已把 session projection usage 的 `input_tokens` 作为 active context tokens 传给 `project_turn_context_summary_with_active_context_tokens(...)`；对标 Codex auto compact prefill 只使用 request input tokens，不把 output tokens 计入 active context window；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime -- --nocapture` 与 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture` 已通过；下一刀只剩 actual auto compact trigger owner |
| 2026-07-06 | P1-7 第三十八刀第二十二切片：context usage projection helper / DB read model handoff seam | `done for handoff helper / db-readmodel-trigger-pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/protocol_context_projection.rs`；`lime-rs/crates/agent/src/protocol_projection.rs` | 继续避让已脏 `lime-rs/crates/agent/src/session_usage_projection.rs`、`lime-rs/crates/agent/src/session_execution_runtime.rs`、`lime-rs/crates/agent/src/session_execution_runtime/tests.rs`、未跟踪 `lime-rs/crates/agent/src/session_execution_runtime_query.rs`、`lime-rs/crates/thread-store/src/conversation_transcript.rs`、App Server runtime / runtime_backend / memory prompt、Aster vendor、Writing v2 / soul / scripts / frontend governance 热区；本轮不接管 DB read model 或 actual compact trigger | 在 current projection boundary 增加 `active_context_tokens` handoff helper，让后续 DB read model 可直接传入真实 usage，不在 runtime 热区散落 `serde_json::Value` 拼装；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture`（6 tests passed）、scoped `git diff --check` 通过 |
| 2026-07-06 | P1-7 第三十八刀第二十一切片：history token usage / auto compact trigger projection owner | `done for projection owner / db-readmodel-trigger-pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/protocol_context_projection.rs` | 避让已脏 `lime-rs/crates/agent/src/session_usage_projection.rs`、`lime-rs/crates/agent/src/session_execution_runtime.rs`、`lime-rs/crates/agent/src/session_execution_runtime/tests.rs`、未跟踪 `lime-rs/crates/agent/src/session_execution_runtime_query.rs`、`lime-rs/crates/thread-store/src/conversation_transcript.rs`、App Server runtime / runtime_backend / memory prompt、Aster vendor、Writing v2 / soul / scripts / frontend governance 热区；本轮不接管 DB read model 或 Aster compact trigger | 对标 Codex `TokenUsageInfo::new_or_append`、`context_window_token_status` 与 `tokens_until_compaction`：`protocol_context_projection.rs` 已从 `lime_runtime.context_usage` / `history_usage` / `token_usage` 读取真实 history usage，按 `min(model_context_window, auto_compact_token_limit)` 计算剩余，并在 used >= effective limit 时标记 `auto_compact_due`；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture`、scoped `git diff --check` 通过；接线到 session DB read model / compact trigger 等脏热区释放后再做 |
| 2026-07-06 | P1-7 第三十八刀第二十切片纠偏：context policy turn-context budget projection consumer | `done for context budget projection / targeted-test-blocked` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/protocol_context_projection.rs` | 避让 Aster vendor `context_mgmt` / `agents` 误接线残留，不再把 context auto compact 新能力写入 vendor；避让已脏 App Server runtime / memory prompt / runtime_backend 写集、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/thread-store/src/conversation_transcript.rs`、Writing v2 / soul / scripts / frontend governance 热区；不抢修 `lime-rs/crates/agent/src/session_execution_runtime/tests.rs` 并行编译错误 | 对标 Codex `ModelInfo::auto_compact_token_limit`、`TokenUsageInfo.model_context_window`、`context_window_token_status`：`protocol_context_projection.rs` 已在缺少显式 `agentui_context.memory_budget` 时从 `lime_runtime.context_policy` 生成 `AgentTurnContextSummary.memory_budget`，覆盖 auto compact disabled、tighter limit、remaining tokens 与 agentui budget 优先级；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、scoped `git diff --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture` 当时被并行 `session_execution_runtime/tests.rs` 引用已删除函数阻塞；history usage projection 已由第二十一切片承接并通过定向测试 |
| 2026-07-06 | P1-7 第三十八刀第二十切片：context auto compact token-limit consumer | `aborted / wrong owner` | `internal/research/refactor/v1/priority-tracking-plan.md`；错误尝试曾触碰 `lime-rs/vendor/aster-rust/crates/aster/src/context_mgmt/mod.rs` 与 `lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs`，已撤回本进程新增的 auto compact 逻辑；保留隔壁已完成的 Aster history input-modality filtering 改动 | 继续避让 `lime-rs/crates/agent/src/**` 未跟踪/并行热区，尤其 `session_execution_runtime_query.rs`、`request_tool_policy/**`、`agent_tools/**`；继续避让 Writing v2 / astermigration / scripts / frontend governance 热区；不恢复旧 `agent_runtime_*` 或 `lime-rs/src/**` | 迁移目标纠偏：不再把 context auto compact 新能力继续写进 vendor Aster；下一刀应转回 Lime current owner（App Server / `lime-agent` / protocol projection）定义迁移骨架，让 Aster 只作为受控兼容执行器或被替换对象 |
| 2026-07-06 | P1-7 第三十八刀第十九切片：reasoning-output provider output-control | `done for provider output-control` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/model-provider/src/provider_stream.rs`；`lime-rs/crates/agent/src/model_request_policy.rs`；`lime-rs/crates/agent/src/model_request_policy/tests.rs`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs` | 继续避让 `lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs` Responses Lite header 写集、Aster `prompt_input_modalities` owner、`lime-rs/crates/agent/src/session_store_subagent_projection.rs` / `session_store_subagent_query.rs` 并行热区、`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs` current user-message gate、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent-runtime/**`、App Server runtime / memory prompt 写集、Writing v2 / astermigration / scripts / governance 并行热区 | 对标 Codex `ModelClient::build_reasoning` 与 Responses `text.verbosity` gate：selected model `reasoning_output_policy.default_reasoning_summary` 已进入 provider `reasoning.summary`，`support_verbosity=true` 且有 `default_verbosity` 时进入 `text.verbosity`；未混入 reasoning effort fallback；`model-provider provider_stream`、`lime-agent model_request_policy`、Aster `openai_request_policy`、Aster `openai_responses`、scoped `rustfmt --check` 与 `git diff --check` 均通过 |
| 2026-07-06 | P1-7 第三十八刀第十八切片：history-level input modality filtering | `done for Aster prompt history owner` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；源码写集由隔壁持有并完成：`lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs`、`lime-rs/vendor/aster-rust/crates/aster/src/agents/mod.rs`、`lime-rs/vendor/aster-rust/crates/aster/src/agents/prompt_input_modalities.rs`；本进程只复核并避让 `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs` 重复 signal | 继续避让 `lime-rs/crates/agent/src/model_request_policy.rs` / `tests.rs` typed owner、`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs` current user-message gate、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/crates/aster/src/providers/**` provider output-control 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent-runtime/**`、App Server runtime / memory prompt 写集、Writing v2 / astermigration / scripts / governance 并行热区 | 对标 Codex `history.for_prompt(&turn_context.model_info.input_modalities)`：Aster `provider_prompt_messages_for_turn_context(...)` 已在 provider prompt dispatch 前直接读取 selected model `request_metadata.harness.model_request_policy.input_modality_policy`，text-only 模型会替换历史 `MessageContent::Image` 与 tool result image；`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core prompt_input_modalities -- --nocapture` 通过，3 tests passed；本进程补跑 scoped `rustfmt --check` 与 `git diff --check` 通过；`lime-agent build_reply_message_` 复测因并行 `session_store_subagent_projection.rs` borrow-after-partial-move 编译错误未计入本刀，非本刀写集 |
| 2026-07-06 | P1-7 第三十八刀第十七切片：context policy prompt packet budget consumer | `done for prompt packet budget consumer` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime/memory_prompt.rs`；`lime-rs/crates/app-server/src/runtime/tests/sessions.rs` | 继续避让 `lime-rs/crates/agent/src/model_request_policy.rs` / `tests.rs`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**` provider output-control 热区、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent-runtime/**`、Writing v2 / astermigration / scripts / governance 并行热区；本轮不抢修 `lime-agent` 的 `session_store_subagent_projection` 模块接线 | App Server `memory_prompt.rs` 已从 `request_metadata.harness.model_request_policy.context_policy` 读取 `model_context_window` / `auto_compact_token_limit`，并把 memory 与 session-compaction context packet 的 `packetTokenBudget` 限制在 effective window 的 `1/10` 内；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check` 与 scoped `git diff --check` 通过；两条 App Server 定向测试已通过 |
| 2026-07-06 | P1-7 第三十八刀第十五补充切片：context policy App Server `lime_runtime` projection | `done for turn-context projection / budget consumer pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs`；`lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs` | 继续避让第十六切片 `lime-agent/src/model_request_policy.rs` / `tests.rs` reasoning-output typed owner；继续避让 `lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**` provider output-control / prompt budget 热区、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent-runtime/**`、Writing v2 / astermigration / scripts / governance 并行热区 | App Server `turn_context_from_request(...)` 从 `request_metadata.harness.model_request_policy.context_policy` 生成 `lime_runtime.context_policy`、`lime_runtime.model_context_window` 与 `lime_runtime.auto_compact_token_limit`，并与 fast-response `auto_compact=false` / `tool_surface` metadata 合并；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`、两条新增 App Server 定向测试通过；本进程补跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_selection -- --nocapture` 通过，28 tests passed |
| 2026-07-06 | P1-7 第三十八刀第十六切片：reasoning-output policy Rust typed owner | `done for typed owner / provider output-control pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/model_request_policy.rs`；`lime-rs/crates/agent/src/model_request_policy/tests.rs` | 继续避让第十四切片 App Server fallback 写集、App Server/runtime prompt budget 热区、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**` provider output-control 热区、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent-runtime/**`、Writing v2 / astermigration / scripts / governance 并行热区 | `ModelReasoningOutputPolicySnapshot` 已只从 selected model request metadata 读取，按 Codex `ReasoningSummary` / `Verbosity`、`Client::build_reasoning` summary gate 与 Responses text verbosity gate 归一 summary / verbosity；snake/camel metadata、默认 `auto` summary、`support_verbosity=false` 时丢弃 default verbosity、`support_verbosity=true` 时保留 `low/medium/high` 默认值均有 Rust fixture；本切片不把 summary / verbosity 混进 reasoning effort fallback，不接 provider request output-control 热区；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent reasoning_output_policy -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture` 通过 |
| 2026-07-06 | P1-7 第三十八刀第十五切片：context policy Rust typed owner | `done for typed owner / budget consumer pending` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/model_request_policy.rs`；`lime-rs/crates/agent/src/model_request_policy/tests.rs` | 继续避让第十四切片 App Server fallback 写集 `lime-rs/crates/app-server/src/runtime_backend/request_context.rs`、`lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs`；继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | `ModelContextPolicySnapshot` 已只从 `request_metadata.harness.model_request_policy.context_policy` 读取 selected model policy，按 Codex `ModelInfo::resolved_context_window()`、`ModelInfo::auto_compact_token_limit()` 与 `TurnContext::model_context_window()` 语义计算 `resolved_context_window`、`model_context_window`、`auto_compact_token_limit`；snake/camel metadata、95% effective 默认、`context_window ?? max_context_window`、auto compact 90% clamp 与缺 context 时显式 compact limit 均有 Rust fixture；本切片不接 App Server prompt budget 热区，不碰 provider/vendor，下一刀仍需让 App Server/runtime prompt budget owner 消费 snapshot；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent context_policy -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture` 通过 |
| 2026-07-06 | P1-7 第三十八刀第十四切片：reasoning policy request fallback consumer | `done for request_context fallback` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/app-server/src/runtime_backend/request_context.rs`；`lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs` | 继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/model_request_policy.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | App Server `reasoning_effort_from_request` 只在没有显式 host / request reasoning effort 时，消费 `request_metadata.harness.model_request_policy.reasoning_policy.default_reasoning_level`；必须要求 `supports_reasoning_summaries=true`，并继续让显式请求优先；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_selection -- --nocapture` 通过，26 tests passed |
| 2026-07-06 | P1-7 第三十八刀第十三切片：input modality Rust fail-closed consumer | `done for current user-message gate` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/model_request_policy.rs`；`lime-rs/crates/agent/src/model_request_policy/tests.rs`；`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`；`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter/tests.rs` | 继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`lime-rs/crates/agent/src/agent_tools/catalog.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | Aster reply 构造当前 user message 前消费 selected model `input_modality_policy`；显式 text-only 模型遇到 `input.images` 时 fail-closed，不依赖前端 send gate 作为唯一防线；`aster_reply_adapter.rs` 测试已拆到子模块，避免继续推高 900+ 行主文件；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent input_modality_policy -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_reply_message_ -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture` 通过；历史 prompt 中已存在 image item 的过滤仍归后续 prompt/history consumer |
| 2026-07-06 | P1 runtime current fixture evidence | `done for runtime fixture` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 只读运行 `npm run smoke:agent-runtime-current-fixture`；继续避让源码热区和 `.lime/qc/**` 生成 evidence 产物 | `npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 history/cache、stream final_done、Electron fixture guard、Coding Workbench、Claw 图片/画图/停止继续/Plan history、Skills Runtime、Multi-Agent、MCP structuredContent、Expert Skills、内容工厂 Article Editor 等 current GUI/runtime fixture；`liveProviderUsed=false` |
| 2026-07-06 | P1-7 第三十八刀第十二切片：MCP / Aster extension output truncation consumer | `done for Aster ToolResponse compat formatter` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/message_content_adapter.rs`；`lime-rs/crates/agent/src/event_converter.rs`；`lime-rs/crates/agent/src/aster_runtime_projection.rs`；`lime-rs/crates/agent/src/request_tool_policy/aster_event_adapter.rs`；`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs` | 继续避让 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`、`lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`、`lime-rs/crates/agent/src/agent_tools/catalog.rs`、`internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | `mcpTool/call*` App Server control plane 不套 model output truncation；模型可见 MCP extension output 经 Aster `ToolResponse` compat path 投影时，stateful `RuntimeEventProjector` 保存 `TurnStarted` 的 `AgentTurnContext`，`message_content_adapter` 复用 `ToolOutputTruncationPolicy` 格式化输出，并继续标记 compat/non-canonical；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`lime-agent projector_applies_turn_context_truncation_to_later_tool_response`、`lime-agent convert_message_tool_response` 通过 |
| 2026-07-06 | P1-7 第三十八刀第十一切片：tool orchestrator output truncation consumer | `done for registry tool output formatter` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`；`lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs` | 继续避让隔壁新增的 `catalog.rs` 第十切片、`internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | `ToolOutputTruncationPolicy` 已从 live native hook 扩到 current `tool_orchestrator`：registry tool output 与该 orchestrator 的 live shell terminal output 都会在进入 `ToolExecutionOutcome` / `ToolEnd` 前按 selected model truncation policy 格式化；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`lime-agent tool_orchestrator`、`lime-agent tool_output_truncation`、`node scripts/check-app-server-client-contract.mjs`、`npm run test:contracts` 通过 |
| 2026-07-06 | P1-7 第三十八刀第十切片：unified_exec false alias cleanup | `done for unified_exec catalog guard` | `internal/research/refactor/v1/priority-tracking-plan.md`；`lime-rs/crates/agent/src/agent_tools/catalog.rs` | 继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_queue.rs`、`lime-rs/crates/agent/src/runtime_support.rs`、`lime-rs/crates/agent/src/subagent_control.rs`、`lime-rs/crates/agent/src/subagent_runtime_adapter.rs`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | Codex `exec_command` 不再被 catalog alias 归一到 legacy `Bash`；后续 unified_exec current surface 必须显式落 `exec_command/write_stdin`，不能借 Bash compat 面续命；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`lime-agent tool_catalog_entry`、`native_tool_policy`、`native_tool` 定向测试通过 |
| 2026-07-06 | P1-7 第三十八刀第九切片：contract readiness green | `done for contract gate / superseded by P2 combo evidence` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 只读验证 `scripts/check-app-server-client-contract.mjs`、`scripts/check-command-contracts.mjs`、`scripts/check-harness-contracts.mjs`、governance 脚本和 docs boundary；继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/**`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_*.rs`、`lime-rs/crates/agent/src/subagent_*.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | `node scripts/check-app-server-client-contract.mjs` 通过 287 项；`npm run test:contracts` 完整通过。之前记录的 agent/tool contract blocker 已被当前工作树收口，不再作为整体完成硬缺口；后续事实源以第十六刀 combo evidence 和 P2 Context / Token 下一刀为准。 |
| 2026-07-06 | P1-7 第三十八刀第八切片：token-aware truncation formatter | `done for live tool output formatter` | `internal/research/refactor/v1/priority-tracking-plan.md`；`lime-rs/crates/agent/src/tool_output_truncation.rs`；`lime-rs/crates/agent/src/lib.rs`；`lime-rs/crates/agent/src/live_execution_process.rs` | 继续避让 `internal/exec-plans/writing-v2-workflow-completion-plan.md`、`internal/roadmap/Writing/v2/**`、`internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`、`lime-rs/crates/agent-runtime/**`、`lime-rs/crates/agent/src/runtime_queue.rs`、`lime-rs/crates/agent/src/runtime_support.rs`、`lime-rs/crates/agent/src/subagent_control.rs`、`lime-rs/crates/agent/src/subagent_runtime_adapter.rs`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**`、`scripts/**` 内容工厂 / signed release gate 热区、`src/lib/governance/asterMigrationBoundary.test.ts` | `request_metadata.harness.model_request_policy.truncation_policy.mode=tokens` 已从 typed owner 接到 live native tool 最终 `CallToolResult` formatter；bytes policy 继续控制 process drain max bytes，tokens policy 保持 drain 默认安全上限并在最终输出按 token budget 截断；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent`、`lime-agent tool_output_truncation`、`live_execution`、`model_request_policy`、`native_tool_policy`、`native_tool` 定向测试通过 |
| 2026-07-06 | P1-7 第三十八刀第七切片：native tool inventory gate | `code-done / verification-blocked` | `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`；`lime-rs/crates/agent/src/agent_tools/mod.rs`；`lime-rs/crates/agent/src/agent_tools/inventory.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 继续避让并行脏热区：`lime-rs/crates/agent/src/runtime_support.rs`、`lime-rs/crates/agent/src/runtime_queue.rs`、`lime-rs/crates/agent/src/subagent_control.rs`、`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/vendor/aster-rust/**`、App Server runtime / RuntimeCore / frontend model-governance / scripts 热区 | `NativeToolPolicyGate` 从 `request_metadata.harness.model_request_policy.native_tool_policy` 解析 shell / apply_patch gate；inventory 的 catalog / registry / runtime projection 已统一隐藏 `shell_tool_enabled=false` 的 `Bash` / `PowerShell` 与 `apply_patch_tool_enabled=false` 或缺少 `apply_patch_tool_type=freeform` 的 `apply_patch`；`cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 和 scoped `git diff --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool -- --nocapture` 被并行脏文件 `runtime_support.rs` lifetime 错误阻塞，待热区释放后重跑 |
| 2026-07-06 | P1-7 第三十八刀第六切片：Aster OpenAI Responses request policy consumer | `done for provider builder` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/mod.rs`；`lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs` | 避让无关脏改：`internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`、`scripts/lib/content-factory-production-readiness-report.mjs`、`scripts/lib/plugin-content-factory-signed-release-gate-core.mjs`、`scripts/lib/plugin-content-factory-signed-release-gate-core.test.mjs`、`scripts/lib/plugin-content-factory-signed-release-gate-fetch-cloud.mjs`、`scripts/plugin/content-factory-production-gui-evidence.mjs`、`scripts/lib/plugin-content-factory-signed-release-gate-gui.mjs`；不触碰 App Server runtime / RuntimeCore / frontend model-governance 热区 | `ResponsesRequestOptions.request_policy` 已驱动 Aster OpenAI Responses payload/header；`openai_request_policy` 优先消费 `provider_request_wire_shape`，兼容读取 `model_request_policy`；协作记录第 21 节已补跑 `aster-core openai_request_policy`、`aster-core openai_responses`、`test_resolve_responses_request_context_includes_model_request_policy`、`lime-agent model_request_policy` 与 `model-provider provider_stream` 并通过 |
| 2026-07-06 | P1-7 第三十八刀第五切片：Responses Lite compat fail-closed | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`lime-rs/crates/model-provider/src/provider_stream.rs`；`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs` | 继续避让 `lime-rs/Cargo.lock`、`lime-rs/Cargo.toml`、`lime-rs/vendor/aster-rust/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/runtime-core/**`、`src/lib/model/**`、`src/lib/governance/**`、`packages/app-server-client/src/generated/protocol-types.ts`、`scripts/check-app-server-client-contract.mjs`；不回滚隔壁进程在 request_tool_policy / agent-runtime / provider adapter 抽取中的既有改动 | `RuntimeReplyStreamRequest.provider_request_wire_shape()` 已投影 Lite header、all-turns reasoning 和 parallel tool-call request flag；Aster compat adapter 对需要 Responses Lite wire support 的非 current backend fail-closed；`cargo fmt`、scoped `git diff --check`、`lime-agent model_request_policy` 和 `model-provider provider_stream` 定向测试通过 |
| 2026-07-06 | P1-7 第三十八刀第四切片：responses/tool-call transport skeleton | `transport-skeleton-verified` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md`；源码写集由隔壁持有：`lime-rs/crates/agent/src/model_request_policy.rs`、`lime-rs/crates/agent/src/model_request_policy/tests.rs`、`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs` | 继续避让 `lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/app-server/src/runtime/**`、`lime-rs/crates/runtime-core/**`、`src/lib/model/**`、`src/lib/governance/**`、`packages/app-server-client/src/generated/protocol-types.ts`、`scripts/check-app-server-client-contract.mjs`、`lime-rs/Cargo.lock`、`lime-rs/vendor/aster-rust/**`；不回滚隔壁进程在 request_tool_policy / agent_tools / agent-runtime 抽取中的既有改动 | 已从 `AgentTurnContext.metadata.runtime_options.harness.model_request_policy` typed owner 接到 `RuntimeReplyStreamRequest.model_request_policy` transport DTO，Responses Lite gate 会把 `parallel_tool_calls=false` 带到 DTO；`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider stream_request_carries_model_request_policy -- --nocapture` 通过；下一步必须让 provider backend 消费 DTO 生成真实 header / input prefix / `parallel_tool_calls` payload，不能再停留在 transport |
| 2026-07-05 | P1-4 第三刀：`session_execution_runtime` recent context owner | `done` | `lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/recent_context.rs`；`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 隔壁进程已持有或疑似持有：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/**`、Writing v2 / astermigration 并行文档 | recent context projection 已下沉到 owner 模块；`session_execution_runtime.rs` 行数基线降到 `2660`；`cargo fmt`、治理 Vitest、`diff --check` 已通过；`lime-agent session_execution_runtime` Rust 定向测试被避让热区 `agent_tools/tool_orchestrator/tests.rs` 缺失 execution process 类型导入阻塞 |
| 2026-07-05 | P1-4 第四刀：`session_execution_runtime` runtime payload owner | `done` | `lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/runtime_payload.rs`；`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/**`、Writing v2 / astermigration 并行文档 | `lime_runtime` metadata payload projection 已下沉到 owner 模块；`session_execution_runtime.rs` 行数基线降到 `2460`；`cargo fmt`、治理 Vitest、`diff --check` 已通过；`lime-agent --lib session_execution_runtime` Rust 定向测试仍被避让热区 `agent_tools/tool_orchestrator/tests.rs` 缺少 execution process 类型导入阻塞 |
| 2026-07-05 | P1-4 第五刀：`session_execution_runtime` recent settings owner | `done` | `lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/recent_settings.rs`；`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/**`、Writing v2 / astermigration 并行文档 | recent access / preferences / team selection projection 已下沉到 owner 模块；`session_execution_runtime.rs` 行数基线降到 `2190`；`cargo fmt`、治理 Vitest、`diff --check`、`lime-agent --lib cargo check` 已通过；`lime-agent --lib session_execution_runtime` Rust 定向测试仍被避让热区 `agent_tools/tool_orchestrator/tests.rs` 缺少 execution process 类型导入阻塞 |
| 2026-07-05 | P1-4 第六刀：`session_execution_runtime` tests owner | `done` | `lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests/recent_settings.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests/runtime_payload.rs`；`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/read_model/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/**`、Writing v2 / astermigration 并行文档；`agent_tools/execution/tests.rs` 仍有 unrelated unused import warning，未夹写 | `session_execution_runtime` 测试模块已按核心 runtime / recent settings / runtime payload 下沉到 owner 文件；`session_execution_runtime.rs` 行数基线降到 `780`；治理守卫登记 tests owner 并禁止测试职责回流；`cargo fmt`、治理 Vitest、`diff --check`、`lime-agent --lib cargo check`、`lime-agent --lib session_execution_runtime` 定向测试通过 |
| 2026-07-05 | P1-4 第七刀：`session_execution_runtime` runtime payload helper owner | `done` | `lime-rs/crates/agent/src/lib.rs`；`lime-rs/crates/agent/src/session_execution_runtime.rs`；`lime-rs/crates/agent/src/session_execution_runtime/runtime_payload.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests.rs`；`lime-rs/crates/agent/src/session_execution_runtime/tests/runtime_payload.rs`；`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/read_model/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/**`、Writing v2 / astermigration 并行文档；`agent_tools/execution/tests.rs` 仍有 unrelated unused import warning，未夹写 | cost / limit helper 已下沉到 runtime payload owner；相关测试移入 runtime payload tests owner；crate public facade 继续从 `session_execution_runtime` re-export，不暴露私有 owner 模块；`session_execution_runtime.rs` 行数基线降到 `660`；`cargo fmt`、治理 Vitest、`diff --check`、`lime-agent --lib cargo check`、`lime-agent --lib session_execution_runtime` 定向测试通过 |
| 2026-07-05 | P1-5 第八刀：UI execution runtime projection owner | `done` | `src/components/agent/chat/utils/sessionExecutionRuntime.ts`；`src/components/agent/chat/projection/sessionExecutionRuntimeProjection.ts`；`src/components/agent/chat/utils/sessionExecutionRuntime.test.ts`；`src/components/agent/chat/utils/sessionExecutionRuntime.deepseek.test.ts`；`src/lib/governance/appServerRuntimeBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/read_model/**`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、Writing v2 / astermigration 并行文档 | UI execution runtime merge / turn_context / model_change projection 已下沉到 `projection/sessionExecutionRuntimeProjection.ts`；utils facade 只保留偏好、label、Team 转换和 re-export；治理守卫禁止 projection helper 回流；`npx vitest run` 两个 runtime 单测、治理 Vitest、`git diff --check` 通过 |
| 2026-07-05 | P1-5 第九刀：UI execution runtime projection owner 直接测试 | `done` | `src/components/agent/chat/projection/sessionExecutionRuntimeProjection.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/components/agent/chat/utils/sessionExecutionRuntime.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | projection owner 自身已有直接单测覆盖缺 session_id、turn_context 执行策略归一、model_change 保留 schema / turn 状态并更新模型；projection / facade / 治理 Vitest 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十刀：Turn context UI projection owner 直接测试 | `done` | `src/components/agent/chat/projection/contextProjection.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/components/agent/chat/projection/agentUiEventProjection.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `contextProjection.ts` 自身已有直接单测固定 turn_context 到 Agent UI context / policy events 的 projection；定向 Vitest、聚合 turn_context Vitest 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十一刀：Runtime lifecycle UI projection owner 直接测试 | `done` | `src/components/agent/chat/projection/runtimeLifecycleProjection.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/components/agent/chat/projection/agentUiEventProjection.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `runtimeLifecycleProjection.ts` 自身已有直接单测固定 run lifecycle / runtime_status / model / task profile 事件映射；定向 Vitest、聚合 runtime / model / task profile Vitest 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十二刀：Runtime lifecycle UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/runtimeLifecycleProjection.ts`；`src/components/agent/chat/projection/runtimeLifecycleProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `thread_started` / `turn_*` / `runtime_status` / `model_*` / `task_profile_resolved` lifecycle 分发表已收进 `runtimeLifecycleProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest 与聚合 runtime / model / task profile Vitest 通过 |
| 2026-07-05 | P1-5 第十三刀：Conversation UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/conversationEventProjection.ts`；`src/components/agent/chat/projection/conversationEventProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `message` / `text_delta*` / `thinking_delta` / `reasoning_*` conversation 分发表已收进 `conversationEventProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合文本/推理 Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十四刀：Diagnostic UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/diagnosticProjection.ts`；`src/components/agent/chat/projection/diagnosticProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `warning` / `cost_estimated` / `cost_recorded` diagnostic 分发表已收进 `diagnosticProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 warning/cost Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十五刀：Queue UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/queueProjection.ts`；`src/components/agent/chat/projection/queueProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `queue_added` / `queue_removed` / `queue_started` / `queue_cleared` queue 分发表已收进 `queueProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 queue Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十六刀：Routing UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/routingProjection.ts`；`src/components/agent/chat/projection/routingProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | routing decision / limit state / limit event 分发表已收进 `routingProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 routing Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十七刀：Action UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/actionProjection.ts`；`src/components/agent/chat/projection/actionProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `action_required` / `action_resolved` action 分发表已收进 `actionProjection.ts`；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 action Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十八刀：Artifact UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/artifactProjection.ts`；`src/components/agent/chat/projection/artifactProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `artifact_snapshot` / `context_trace` artifact 分发表已收进 `artifactProjection.ts`；artifact metadata requested-fix work item 回写由 Artifact owner 组合 `evidenceProjection` helper；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 artifact / context trace Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第十九刀：Tool UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/toolEventProjection.ts`；`src/components/agent/chat/projection/toolEventProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `tool_start` / `tool_end` / `tool_progress` / `tool_output_delta` / `tool_input_delta` tool 分发表已收进 `toolEventProjection.ts`；tool_end plan approval 追加事件继续复用 runtime projection helper；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 tool / plan approval Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第二十刀：Subagent UI projection owner 分发表收敛 | `done` | `src/components/agent/chat/projection/subagentStatusProjection.ts`；`src/components/agent/chat/projection/subagentStatusProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `subagent_status_changed` subagent 分发表已收进 `subagentStatusProjection.ts`；runtime_status 派生 `team.changed` 仍作为 lifecycle owner 内部 helper 使用；`agentUiEventProjection.ts` 仅委托 owner；定向 owner Vitest、聚合 subagent / worker notification / handoff Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第二十一刀：ThreadItem UI projection residual owner 收敛 | `done` | `src/components/agent/chat/projection/threadItemProjection.ts`；`src/components/agent/chat/projection/threadItemProjection.test.ts`；`src/components/agent/chat/projection/agentUiEventProjection.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts` | `item_started` / `item_updated` / `item_completed` thread item 分发表参数已收进 `threadItemProjection.ts`；`agentUiEventProjection.ts` 不再拆 `event.type` / `event.item` 给 item owner；新增 owner 直接测试覆盖 reasoning item、tool_call plan approval、TaskUpdate owner change 与 subagent activity worker notification；定向 owner Vitest、聚合 item/tool/worker Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-5 第二十二刀：Agent UI projection 聚合器回流守卫 | `done` | `src/lib/governance/agentUiProjectionBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/asterMigrationBoundary.test.ts` | 新增独立治理守卫，要求 `agentUiEventProjection.ts` relative imports 只能是 owner dispatcher，禁止直接 import 单个 adapter builder、禁止直接依赖 `@limecloud/agent-runtime-projection`、禁止非空数组直接组装事件、禁止 `event.item` 参数拆解回流；定向治理 Vitest、ThreadItem / 聚合器相关 Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-6 第一刀：`evidence/export` correlation spine fail-closed | `done` | `src/lib/api/agentRuntime/appServerEvidenceExportProjection.ts`；`src/lib/api/agentRuntime/appServerEvidenceExportProjection.test.ts`；`src/lib/governance/agentRuntimeExportBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/asterMigrationBoundary.test.ts` | `projectAppServerEvidenceExportToRuntimeEvidencePack` 对 `session.sessionId`、`session.threadId`、`evidencePack` 关键路径和 runtime 计数 fail-closed；新增 `agentRuntimeExportBoundary.test.ts` 固定 `exportAgentRuntimeEvidencePack` 只能调用 App Server `exportEvidence({ includeEvents: true, includeArtifacts: true, includeEvidencePack: true })` 并进入严格 projection，且生产源码不得重新调用 `agent_runtime_export_*` legacy command；定向 Vitest、renderer typecheck 和 `diff --check` 通过 |
| 2026-07-05 | P1-6 第二刀：派生导出 session/path correlation fail-closed | `done` | `src/lib/api/agentRuntime/exportClient.ts`；`src/lib/api/agentRuntime/exportClient.test.ts`；`src/lib/governance/agentRuntimeExportBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/lib/api/agentRuntime/threadClient.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/asterMigrationBoundary.test.ts` | `exportClient.ts` 对 handoff / replay / analysis / review template / review save 的返回 `sessionId` 与 `.lime/harness/sessions/<sessionId>` 根路径 fail-closed；`exportClient.test.ts` 覆盖 DTO 字段齐全但串 session 的负向样本；`agentRuntimeExportBoundary.test.ts` 固定五个派生导出方法必须先 DTO 校验再 session correlation；`npx vitest run "src/lib/api/agentRuntime/exportClient.test.ts"` 9 tests passed；`npx vitest run "src/lib/governance/agentRuntimeExportBoundary.test.ts"` 3 tests passed；`git diff --check -- "src/lib/api/agentRuntime/exportClient.ts" "src/lib/api/agentRuntime/exportClient.test.ts" "src/lib/governance/agentRuntimeExportBoundary.test.ts"` 通过 |
| 2026-07-05 | P1-6 第三刀：requestTelemetry 负向测试补强 | `done` | `lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs`；`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/request_telemetry.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model/**`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`、`lime-rs/crates/app-server/src/runtime/tests/queue_resume_audit.rs`、`lime-rs/crates/app-server/src/runtime/tests/read_model/artifacts.rs`、`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/provider_telemetry.rs`、`src/lib/api/agentRuntime/threadClient.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/asterMigrationBoundary.test.ts`、`lime-rs/target` 与正在运行的 cargo build / dev server | `provider_telemetry.rs` 已接近 800 行，本刀新建 `request_telemetry.rs` 作为负向测试 owner，只在 `evidence_exports.rs` 增加模块声明；证明无匹配 request log 时输出 `missing` / 0 计数，且其它 session / turn 的 request log 不混入当前 evidence pack；`rustfmt --edition 2021`、`git diff --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_request_telemetry_ignores_unmatched_session_and_turn_logs -- --nocapture` 通过 |
| 2026-07-05 | P1-7 第一刀只读审计：Provider / Model capability current owner mapping | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md`；只读 `src/lib/api/modelRegistry.ts`、`src/lib/api/apiKeyProvider.ts`、`lime-rs/crates/app-server-protocol/**`、`lime-rs/crates/app-server/src/**model*/**`、`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、`lime-rs/crates/agent/src/provider_configuration.rs`、`src/lib/governance/agentCommandCatalog.json`、`src/lib/dev-bridge/mockPriorityCommands.ts` | 继续避让所有已脏 App Server runtime / projection / read model 文件：`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/app-server/src/runtime/read_model/**`、`lime-rs/crates/app-server/src/runtime/thread_item_projection/**`；继续避让 `lime-rs/crates/agent/src/agent_tools/**`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`src/lib/governance/appServerRuntimeBoundary.testSupport.ts`、`src/lib/governance/asterMigrationBoundary.test.ts` | 已输出 Provider / Model current owner 对照、Codex primitive 对齐差距、opencode 仅限多模型 / 多模态参照点、能力字段缺口与下一刀最小实现边界；本刀不改命令协议、不改 runtime/projection 热区 |
| 2026-07-05 | P1-7 第二刀：前端 canonical capability summary | `done` | `src/lib/model/inferModelCapabilities.ts`；`src/lib/model/inferModelCapabilities.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 App Server runtime / projection / read model 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件和并行治理守卫文件 | `getModelCapabilitySummary` 已把 capabilities、task families、input/output modalities、runtime features、tools、reasoning、prompt cache、media input/output、context/max output limits 收敛成前端 canonical summary；`modelToTaxonomyParams` 统一 get* helper 的参数投影，避免能力字段继续散落；`npx vitest run "src/lib/model/inferModelCapabilities.test.ts"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- src/lib/model/inferModelCapabilities.ts src/lib/model/inferModelCapabilities.test.ts` 通过 |
| 2026-07-05 | P1-7 第三刀：provider route protocol projection guard | `done` | `lime-rs/crates/agent/src/provider_configuration.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让 App Server runtime / projection / read model 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件和并行治理守卫文件 | `provider_configuration.rs` 已固定 current 行为：只有 `OpenaiResponses` / `CodexResponses` / `OpenaiChat` 投影到 runtime adapter protocol；`AnthropicMessages` / `GeminiGenerateContent` / `OllamaChat` / `Fal` / `BedrockConverse` / `VertexGemini` / `OpenaiImages` / `Unknown` 只保留 route metadata，不猜可执行 adapter；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_configuration -- --nocapture` 与 `diff --check` 通过，测试仅剩隔壁热区 `agent_tools/execution/tests.rs` unrelated unused import warning |
| 2026-07-05 | P1-7 第四刀补强：Rust `CanonicalModel` capability summary | `done` | `lime-rs/crates/model-provider/src/canonical/model.rs`；`lime-rs/crates/model-provider/src/canonical/mod.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让 App Server runtime / projection / read model 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件、并行治理守卫文件和 `canonical_models.json` 大数据文件 | `CanonicalModel` 已兼容新增 `task_families`、`runtime_features`、`supports_reasoning`、`supports_prompt_cache` 字段，并提供 `capability_summary()` 输出与前端 summary 对齐的 capabilities、modalities、runtime features、tools、reasoning、prompt cache、media input/output、context/max output；旧 bundled JSON 保持兼容，不做数据文件批量 churn；`rustfmt --edition 2021`、`CARGO_TARGET_DIR="/tmp/lime-model-provider-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture`、`git diff --check` 通过 |
| 2026-07-05 | P1-7 第五刀：Prompt Cache governance reconciliation | `done` | `internal/aiprompts/commands.md`；`src/lib/model/providerPromptCacheSupport.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让 App Server runtime / projection / read model 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件、并行治理守卫文件和 `src/lib/model/inferModelCapabilities.ts` / `lime-rs/crates/model-provider/src/canonical/**` 并行写集 | Prompt Cache 事实源已统一为 Provider 类型 + Provider 持久化声明 + 已知官方 Anthropic-compatible host catalog；未知 `anthropic-compatible` host 即使路径像 Anthropic 也默认 `explicit_only`，只有显式 `prompt_cache_mode=automatic` 或命中官方兼容端点 catalog 才 automatic；`npx vitest run "src/lib/model/providerPromptCacheSupport.test.ts"`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core provider_prompt_cache_support -- --nocapture`、`diff --check` 通过 |
| 2026-07-05 | P1-7 第六刀：model/provider capability contract guard | `done` | `src/lib/governance/modelProviderCapabilityBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让 App Server runtime / projection / read model 热区、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件、并行治理守卫文件和 `src/lib/model/inferModelCapabilities.ts` / `lime-rs/crates/model-provider/src/canonical/**` 并行写集 | 新增独立治理守卫，固定 TS `ModelCapabilitySummary` 与 Rust `CanonicalModelCapabilitySummary` 的字段合同，并禁止生产代码绕过 owner 直接读取 bundled `canonical_models.json`；`npx vitest run "src/lib/governance/modelProviderCapabilityBoundary.test.ts"` 与 `diff --check` 通过 |
| 2026-07-05 | P1-7 第七刀：multi-modal send gate owner helper | `done` | `src/lib/model/modelCapabilitySendGate.ts`；`src/lib/model/modelCapabilitySendGate.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、`lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`、App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件、`src/lib/model/inferModelCapabilities.ts` / `src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/model-provider/src/canonical/**` | 新增非热区纯函数 owner：typed send part -> required input modalities -> selected `ModelCapabilitySummary.input_modalities` gap，输出 `allowed / blocked / unknown`；固定媒体总开关不能替代精确 modality。退出条件：`npx vitest run "src/lib/model/modelCapabilitySendGate.test.ts"` 与 `diff --check` 通过 |
| 2026-07-05 | P1-7 第八刀：reasoning capability owner | `done` | `lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`；`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`；`lime-rs/crates/app-server/src/runtime_backend.rs`；`lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让 App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、GUI 主文件和并行治理守卫文件；不夹写第七刀的 `modelCapabilitySendGate*` owner | `model.effective` 的 reasoning policy 已优先消费 route `CapabilitySnapshot`；`runtime_backend/model_capability.rs` 新增 snapshot -> `ModelCapability` owner，旧 provider/model 字符串推断只作为无 snapshot fallback；新增回归证明 route snapshot 可让普通 custom model 支持 reasoning，也可禁止 reasoning 命名模型伪造 reasoning。`CARGO_TARGET_DIR="/tmp/lime-app-server-reasoning-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_capability -- --nocapture`、`CARGO_TARGET_DIR="/tmp/lime-app-server-reasoning-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_effective_event -- --nocapture` 通过 |
| 2026-07-05 | P1-7 第九刀：multi-modal send gate 发送准备边界 | `done` | `src/components/agent/chat/hooks/agentChatShared.ts`；`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`；`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`lime-rs/crates/app-server/src/runtime_backend.rs`、`lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`、`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、`lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs`、`src/lib/api/agentRuntime/threadClient.test.ts`、`src/lib/model/inferModelCapabilities.ts` / `src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/model-provider/src/canonical/**` | `SendMessageOptions.modelCapabilitySummary` 已允许上游传入 canonical summary；`prepareAgentStreamUserInputSend` 用 `modelCapabilitySendGate` 计算 typed input gap，并在有 summary 或媒体输入时写入 `requestMetadata.harness.model_input_capability_gate`，覆盖 `allowed / blocked / unknown`；本刀不新增用户可见文案、不做 GUI fail-closed。`npx vitest run "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/lib/model/modelCapabilitySendGate.test.ts"` 已通过 |
| 2026-07-05 | P1-7 第十刀：multi-modal send gate 最终 submit op fail-closed | `done` | `src/lib/model/modelCapabilitySendGate.ts`；`src/lib/model/modelCapabilitySendGate.test.ts`；`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`；`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`；`src/components/agent/chat/utils/agentRuntimeErrorPresentation.ts`；`src/components/agent/chat/utils/agentRuntimeErrorPresentation.test.ts`；`src/i18n/resources/zh-CN/agent.json`；`src/i18n/resources/zh-TW/agent.json`；`src/i18n/resources/en-US/agent.json`；`src/i18n/resources/ja-JP/agent.json`；`src/i18n/resources/ko-KR/agent.json`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、并行治理守卫文件 | `executeAgentStreamSubmit` 在媒体输入时从 current `modelRegistryApi.getModelRegistry()` 解析 selected model summary；`buildUserInputSubmitOp` 在最终 runtime submit payload 构造前用 `modelCapabilitySendGate` fail-closed，blocked / unknown media gap 不再调用 `runtime.submitOp`，且不会先写入 managed objective；新增 `model_input_capability_gap` 本地化 presentation。`npx vitest run "src/lib/model/modelCapabilitySendGate.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts" "src/components/agent/chat/utils/agentRuntimeErrorPresentation.test.ts"`、`npx tsc --noEmit --project "tsconfig.renderer.json" --pretty false` 通过 |
| 2026-07-05 | P1-7 第十一刀：picker vs execution projection boundary guard | `done` | `src/lib/governance/modelCapabilityProjectionBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | 新增独立治理守卫，固定 `ModelCapabilitySummary` 与 `getModelCapabilitySummary` 只能输出 capabilities、task families、input/output modalities、runtime features、tools、reasoning、prompt cache、media 和 limits 等 execution 字段；禁止 `display_name/provider_name/tier/status/source/pricing/deployment_source/management_plane/alias_source` 等 picker/catalog 字段进入 execution summary；同时确认 taxonomy input 不依赖模型选择器展示字段。本刀只封前端 summary 边界，不替代后续协议 / Rust route projection 拆分。 |
| 2026-07-05 | P1-7 第十二刀：RuntimeCore capability snapshot projection negative test | `done` | `lime-rs/crates/runtime-core/src/model_task.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`、`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、App Server runtime / projection / read model、`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | 新增 RuntimeCore 负向测试，证明 `capability_snapshot_from_model_capabilities` 只消费 `capabilities/taskFamilies/inputModalities/outputModalities/runtimeFeatures` execution 字段；即使输入混入 `displayName/providerName/tier/status/source/pricing/deploymentSource/managementPlane/aliasSource` 等 picker/catalog 字段，也不会推断 vision/tools/reasoning 或写入 snapshot provenance。本刀不改协议 schema，只封 route capability snapshot 的 projection 语义。 |
| 2026-07-05 | P1-7 第十三刀：RuntimeCore route picker DTO projection guard | `done` | `src/lib/governance/modelCapabilityProjectionBoundary.test.ts`；`lime-rs/crates/runtime-core/src/model_route.rs`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`、`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、App Server runtime / projection / read model、`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | 扩展 projection boundary 守卫，固定 `CapabilityRequirement` / `CapabilitySnapshot` 的协议字段集合，并要求 `ModelTaskRequest` 不引用 `ModelInfo` / `ProviderInfo` 或 picker/catalog 字段；新增 RuntimeCore 单测证明 `resolved_route_from_task` 可以使用 provider endpoint/auth 组装 execution route，但不会把 picker-ready `ProviderInfo` / `ModelInfo` DTO 写入 `ResolvedModelRoute.provider/model` 作为事实源。 |
| 2026-07-05 | P1-7 第十四刀：prepare / submit final gate evidence 一致性 | `done` | `src/lib/model/modelCapabilitySendGate.ts`；`src/lib/model/modelCapabilitySendGate.test.ts`；`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、并行治理守卫文件 | `modelCapabilitySendGate.ts` 成为 capability gate metadata 合并 owner；发送准备与 submit 执行层共用同一 merge helper。媒体输入 submit 阶段按 registry 解析 final `ModelCapabilitySummary` 后会重新计算 gate，并覆盖 prepare 阶段 unknown evidence；视觉模型允许发送时 `runtime.submitOp.metadata.harness.model_input_capability_gate.status=allowed`，blocked / unknown 媒体输入仍由最终 submit op fail-closed。`npx vitest run "src/lib/model/modelCapabilitySendGate.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts" "src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts"`、`npx tsc --noEmit --project "tsconfig.renderer.json" --pretty false` 通过 |
| 2026-07-05 | P1-7 第十五刀：`ResolvedModelRoute` 直接删除 picker DTO 字段 | `done` | `lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`；`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`；`lime-rs/crates/app-server-protocol/schema/json/v0/ResolvedModelRoute.json`；`packages/app-server-client/src/generated/protocol-types.ts`；`lime-rs/crates/runtime-core/src/model_route.rs`；`lime-rs/crates/runtime-core/src/llm_protocol/tests.rs`；`lime-rs/crates/app-server/src/model_route_execution.rs`；`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/lib/model/inferModelCapabilities.ts`、`lime-rs/crates/app-server/src/runtime_backend/model_capability.rs`、`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`、App Server runtime / projection / read model、GUI 主文件、plugin publish 未跟踪文件 | `ResolvedModelRoute` 不再声明 `provider: Option<ProviderInfo>` / `model: Option<ModelInfo>`；RuntimeCore 和 App Server 测试构造点已同步删除空字段；schema fixture 与 generated TS 已刷新；`modelCapabilityProjectionBoundary.test.ts` 固定 route 字段集合，禁止 picker DTO 重新进入 execution route。验证：`app-server-protocol` schema fixture、protocol types check、RuntimeCore `picker`、App Server `model_route_execution`、治理 Vitest 与 `diff --check`。 |
| 2026-07-05 | P1-7 第十六刀：picker selection summary 注入发送选项 | `done` | `src/components/agent/chat/hooks/agentChatSendMessage.ts`；`src/components/agent/chat/hooks/agentChatSendMessage.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、App Server runtime / projection / read model、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | `createAgentChatSendMessage` 在 raw send 前基于当前 picker provider/model selection、positional model override 与 `SendMessageOptions.providerOverride/modelOverride` 解析 current registry summary，并在上游未显式传 `modelCapabilitySummary` 时注入 `SendMessageOptions.modelCapabilitySummary`；显式 null/summary 不被覆盖，registry miss/error 不阻断普通发送，最终 submit media fail-closed 仍由 submit op 边界负责。`npx vitest run "src/components/agent/chat/hooks/agentChatSendMessage.test.ts"` 通过。 |
| 2026-07-05 | P1-7 第十七刀：`RouteDefaults` execution policy boundary guard | `done` | `src/lib/governance/modelCapabilityProjectionBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/modelCapabilitySendGate.ts`、`lime-rs/crates/app-server-protocol/**`、`packages/app-server-client/src/generated/protocol-types.ts`、RuntimeCore / App Server route 热区、GUI 主文件、plugin publish 未跟踪文件 | `modelCapabilityProjectionBoundary.test.ts` 现在固定 `RouteDefaults` 只允许 `reasoning_effort`、`prompt_cache_mode`、`toolshim`、`toolshim_model` 这类 execution policy 字段；`display_name/provider_name/tier/status/release_date/is_latest/pricing/service` 一类 picker/catalog 字段不得回流 route defaults。`npx vitest run "src/lib/governance/modelCapabilityProjectionBoundary.test.ts"` 通过。 |
| 2026-07-05 | P1-7 第十八刀：GUI send policy owner | `done` | `src/lib/model/modelInputSendPolicy.ts`；`src/lib/model/modelInputSendPolicy.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏热区：`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/components/agent/chat/hooks/agentChatSendMessage.ts`、`src/components/agent/chat/hooks/agentChatSendMessage.test.ts`、`src/lib/model/modelCapabilitySendGate.ts`、`src/lib/model/inferModelCapabilities.ts`、GUI 主文件、协议 / RuntimeCore 热区 | 新增 `buildModelInputSendPolicy` 纯 owner，把 send gate result 投影为 `enabled / warning / blocked`、`canSubmit`、`shouldDisableComposer` 与 `failClosedAtSubmit`。媒体输入缺 summary 默认与最终 submit fail-closed 口径一致并禁用；纯文本缺 summary 只 warning 不阻断。`npx vitest run "src/lib/model/modelInputSendPolicy.test.ts" "src/lib/model/modelCapabilitySendGate.test.ts"` 通过。 |
| 2026-07-05 | P1-7 第十九刀：Inputbar warning / disabled 接线 | `done` | `src/components/agent/chat/components/Inputbar/components/InputbarVisionCapabilityNotice.tsx`；`src/components/agent/chat/components/Inputbar/components/InputbarVisionCapabilityNotice.test.tsx`；`src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx`；`src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、submit / preparation 热区、五语言 `agent.json`、RuntimeCore / App Server route 热区、App Server runtime / read model / projection、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | `InputbarVisionCapabilityNotice` 已不再定义自有 capability policy；它只负责 Provider / Model 读取和推荐文案，发送策略由 `evaluateModelInputCapability -> buildModelInputSendPolicy` 产出 `ModelInputSendPolicy`。`InputbarComposerSection` 只消费 `shouldDisableComposer` 禁用 composer 并拦截发送；图片能力缺失时 UI 与最终 submit fail-closed 口径一致。验证：Inputbar / model policy 4 组 Vitest、ESLint、renderer typecheck、`diff --check` 均通过。 |
| 2026-07-05 | P1-7 第二十刀：GUI smoke 范围判定 | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让源码热区；本刀只跑统一 GUI smoke，不修改 GUI / Rust 代码 | `npm run verify:gui-smoke` 通过，覆盖 renderer smoke build、Electron host build、App Server sidecar、renderer loaded、app-server ready、claw workbench shell ready、memory settings ready。P1-7 的 Inputbar policy 接线已达到 GUI 最小可交付证据；后续已进入 execution 字段 owner 拆分。 |
| 2026-07-05 | P1-7 第二十一刀：execution policy owner 初版 | `done` | `src/lib/model/modelExecutionPolicy.ts`；`src/lib/model/modelExecutionPolicy.test.ts`；`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`（lint-only）；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让已脏或热区：`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`packages/app-server-client/src/generated/protocol-types.ts`、Inputbar / submit / preparation 热区、五语言 `agent.json`、RuntimeCore / App Server route 热区、App Server runtime / read model / projection、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**` | 新增非热区纯 TS owner：按 Codex `ToolMode` / `supports_image_detail_original` / `web_search_tool_type + supports_search_tool` 建立 execution policy 字段归一边界；默认 fail-closed，不从 picker/catalog 字段推断 execution policy。本刀不改协议 schema，不把字段塞回 picker/catalog summary；同步修复 projection guard 的 `process` / 正则空格 ESLint 小问题。验证：`npx vitest run "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts"`、`npx eslint "src/lib/model/modelExecutionPolicy.ts" "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" --max-warnings 0`、scoped whitespace scan 通过；renderer typecheck 已执行但被无关 `packages/app-server-client` plugin local package export 协议漂移阻塞。 |
| 2026-07-05 | P1-7 第二十二刀：execution policy boundary guard | `done` | `src/lib/governance/modelExecutionPolicyBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`src/lib/model/inferModelCapabilities.ts`、协议 / generated TS、Inputbar / submit / preparation、RuntimeCore / App Server route、App Server runtime / read model / projection、plugin local package export 并行改动 | 新增非热区 governance guard，固定 `ModelExecutionPolicy` 字段集合，并禁止该 owner 依赖 registry、capability summary、bridge 或 UI，也禁止从 picker/catalog 字段推断 execution policy；本刀不改协议和 registry 热区。验证：`npx vitest run "src/lib/governance/modelExecutionPolicyBoundary.test.ts" "src/lib/model/modelExecutionPolicy.test.ts"`、`npx eslint "src/lib/governance/modelExecutionPolicyBoundary.test.ts" "src/lib/model/modelExecutionPolicy.ts" "src/lib/model/modelExecutionPolicy.test.ts" --max-warnings 0`、scoped whitespace scan 通过。 |
| 2026-07-05 | P1-7 第二十三刀：execution policy registry metadata 接线 | `done` | `src/lib/types/modelRegistry.ts`；`src/lib/types/modelRegistry.d.ts`；`src/lib/api/modelRegistry.ts`；`src/lib/api/modelRegistry.test.ts`；`src/lib/model/modelExecutionPolicy.test.ts`；`src/lib/governance/modelExecutionPolicyBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/oemCloudPluginPublish.ts` 未跟踪并行写集、Inputbar / submit / preparation、RuntimeCore / App Server route、App Server runtime / read model / projection | `EnhancedModelMetadata.execution_policy` 现在作为 registry-facing current projection 字段，由 `src/lib/api/modelRegistry.ts -> toSnakeModelInfo` 通过 `buildModelExecutionPolicy(model)` 归一；App Server DTO 缺字段时 fail-closed，picker/catalog 字段不会被用于推断 execution policy。`modelExecutionPolicyBoundary.test.ts` 已固定 registry metadata 只能通过 owner 暴露归一结果。验证：`npx vitest run "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/governance/modelExecutionPolicyBoundary.test.ts" "src/lib/api/modelRegistry.test.ts"`、`npx vitest run "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" "src/lib/governance/modelProviderCapabilityBoundary.test.ts"`、`npx eslint ... --max-warnings 0`、scoped `git diff --check` 通过；renderer typecheck 被并行未跟踪 `src/lib/api/oemCloudPluginPublish.ts:402` 的 `Uint8Array` fetch body 类型阻塞。 |
| 2026-07-05 | P1-7 第二十四刀：Codex execution policy origin source guard | `done` | `src/lib/governance/codexModelExecutionPolicyOrigin.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/types/modelRegistry.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、Inputbar / submit / preparation、RuntimeCore / App Server route、App Server runtime / read model / projection | 新增非热区 source guard，默认读取 `/Users/coso/Documents/dev/rust/codex/codex-rs/protocol/src/openai_models.rs`，固定 Codex `ToolMode` / `WebSearchToolType` wire values 与 Lime `MODEL_TOOL_MODES` / `MODEL_WEB_SEARCH_TOOL_TYPES` 对齐；同时确认当前 `ModelExecutionPolicyInput` 只接收 `web_search_tool_type`、`supports_image_detail_original`、`supports_search_tool`、`tool_mode` 这组已认领 Codex `ModelInfo` 字段，并把 reasoning levels、visibility、service tiers、parallel tool calls、context、auto compact、input modalities 标成独立 owner 缺口，不允许混入 `modelExecutionPolicy`。验证：`npx vitest run "src/lib/governance/codexModelExecutionPolicyOrigin.test.ts"` 通过。 |
| 2026-07-05 | P1-7 第二十五刀：execution policy protocol rollout completeness guard | `done` | `src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/oemCloudPluginPublish.ts` 未跟踪并行写集、RuntimeCore / App Server route、App Server runtime / read model / projection、GUI 主路径 | 新增非热区 rollout guard，读取 App Server `ModelInfo` Rust DTO、schema bundle、generated TS、registry 类型 / 网关与 `modelExecutionPolicy` owner；一旦 `execution_policy` / `tool_mode` / `supports_search_tool` / `web_search_tool_type` / `supports_image_detail_original` 出现在协议、schema 或 generated TS 任一侧，守卫要求三侧成组完整同步，并固定 registry 仍只能通过 `buildModelExecutionPolicy(model)` 暴露 `execution_policy`。验证：`npx vitest run "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/governance/modelExecutionPolicyBoundary.test.ts" "src/lib/governance/codexModelExecutionPolicyOrigin.test.ts"`、`npx vitest run "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/api/modelRegistry.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts"`、`npx eslint "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" --max-warnings 0`、scoped whitespace scan 通过。 |
| 2026-07-05 | P1-7 第二十六刀：context / auto compact policy owner | `done` | `src/lib/model/modelContextPolicy.ts`；`src/lib/model/modelContextPolicy.test.ts`；`src/lib/governance/codexModelContextPolicyOrigin.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/api/modelRegistry.test.ts`、`src/lib/types/modelRegistry.ts`、`src/lib/types/modelRegistry.d.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、RuntimeCore / App Server route、App Server runtime / read model / projection、GUI 主路径 | 新增非热区 `modelContextPolicy` 纯 owner，承接 Codex `context_window` / `max_context_window` / `auto_compact_token_limit` / `effective_context_window_percent` 语义：`resolved_context_window = context_window ?? max_context_window`，auto compact 上限默认 `resolved_context_window * 0.9` 且显式配置被上限钳制，`model_context_window` 按 effective percent 计算，默认 `95`；缺 context 时 fail-closed，只保留显式 auto compact limit。`codexModelContextPolicyOrigin.test.ts` 直接读取 Codex `openai_models.rs` 与 `turn_context.rs` 固定源级语义；本刀不接 registry / protocol 热区。退出条件：定向 Vitest、ESLint 与 scoped `diff --check` 通过。 |
| 2026-07-05 | P1-7 第二十七刀：picker visibility / service tier policy owner | `done` | `src/lib/model/modelPickerPolicy.ts`；`src/lib/model/modelPickerPolicy.test.ts`；`src/lib/governance/codexModelPickerPolicyOrigin.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/api/modelRegistry.test.ts`、`src/lib/types/modelRegistry.ts`、`src/lib/types/modelRegistry.d.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、RuntimeCore / App Server route、App Server runtime / read model / projection、GUI 主路径 | 新增非热区 `modelPickerPolicy` 纯 owner，承接 Codex `visibility` / `service_tiers` / `default_service_tier`：缺字段默认 `visibility=none` 且不展示到 picker，只有 `visibility=list` 才 `show_in_picker`，request service tier 只透传显式且受支持的 tier，并过滤 Codex `default` 占位；deprecated `additional_speed_tiers` 不进入新 owner。`codexModelPickerPolicyOrigin.test.ts` 直接读取 Codex `ModelVisibility`、`ModelInfo` 字段、`ModelPreset::from` 与 `service_tier_for_request` 固定源级语义。退出条件：定向 Vitest、ESLint 与 scoped `diff --check` 通过。 |
| 2026-07-05 | P1-7 第二十八刀：execution / context / picker policy protocol rollout completeness guard | `done` | `src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/api/modelRegistry.test.ts`、`src/lib/types/modelRegistry.ts`、`src/lib/types/modelRegistry.d.ts`、RuntimeCore / App Server route、App Server runtime / read model / projection、GUI 主路径 | 扩展 protocol rollout guard：App Server `ModelInfo` 中 execution policy、context / auto compact policy 与 picker policy 字段都必须在 Rust DTO、schema bundle、generated TS 三侧成组同步；若 context 或 picker 字段进入协议，registry 必须新增对应 `context_policy` / `picker_policy` 并只通过 `buildModelContextPolicy(model)` / `buildModelPickerPolicy(model)` 暴露归一 projection。验证：`npx vitest run "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/model/modelContextPolicy.test.ts" "src/lib/governance/codexModelContextPolicyOrigin.test.ts"`、`npx eslint "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" --max-warnings 0`、scoped whitespace scan 通过。 |
| 2026-07-05 | P1-7 第二十九刀：parallel tool calls policy owner | `done` | `src/lib/model/modelToolCallPolicy.ts`；`src/lib/model/modelToolCallPolicy.test.ts`；`src/lib/governance/modelToolCallPolicyBoundary.test.ts`；`src/lib/governance/codexModelToolCallPolicyOrigin.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`packages/app-server-client/src/connection-methods.ts`、`packages/app-server-client/src/request-client-methods.ts`、`packages/app-server-client/src/request-client.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/api/modelRegistry.test.ts`、`src/lib/types/modelRegistry.ts`、`src/lib/types/modelRegistry.d.ts`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、RuntimeCore / App Server route、App Server runtime / read model / projection、GUI 主路径 | 新增非热区 `modelToolCallPolicy` 纯 owner，承接 Codex `supports_parallel_tool_calls -> Prompt.parallel_tool_calls`：只有模型显式 `supports_parallel_tool_calls=true` 才打开 request flag；不从 tools、runtime features、capability summary 或 picker/catalog 字段推断。`codexModelToolCallPolicyOrigin.test.ts` 直接读取 Codex `ModelInfo` 字段和 turn/compact prompt 转发语义；`modelToolCallPolicyBoundary.test.ts` 固定字段集合与纯 owner 依赖边界。验证：定向 Vitest、ESLint 与 scoped `diff --check` 通过。 |
| 2026-07-05 | P1-7 第三十刀前置：picker boundary + tool-call protocol rollout guard | `done` | `src/lib/governance/modelPickerPolicyBoundary.test.ts`；`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：App Server protocol / schema / generated client / `modelRegistry` 热区，尤其是当前混有 `pluginLocalPackage/export` 的并行 generated 改动；继续不碰 GUI 主路径、RuntimeCore / App Server route、App Server runtime / read model / projection | 新增非热区 `modelPickerPolicyBoundary.test.ts`，固定 picker policy 字段集合、request service tier 过滤边界，并禁止 `modelPickerPolicy.ts` 从 execution / context / capability / provider catalog 字段推断或依赖 registry、capability summary、execution/context owner、bridge、UI；同时扩展 `modelExecutionPolicyProtocolBoundary.test.ts`，把 `supports_parallel_tool_calls` 纳入 Rust `ModelInfo` / schema / generated TS 成组 rollout guard，后续若协议接入该字段，registry 必须只通过 `buildModelToolCallPolicy(model)` 暴露归一 projection。验证：`npx vitest run "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/model/modelToolCallPolicy.test.ts" "src/lib/governance/modelToolCallPolicyBoundary.test.ts" "src/lib/governance/codexModelToolCallPolicyOrigin.test.ts" "src/lib/governance/modelPickerPolicyBoundary.test.ts"`、`npx eslint "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/governance/modelPickerPolicyBoundary.test.ts" "src/lib/model/modelToolCallPolicy.ts" "src/lib/model/modelToolCallPolicy.test.ts" "src/lib/governance/modelToolCallPolicyBoundary.test.ts" "src/lib/governance/codexModelToolCallPolicyOrigin.test.ts" --max-warnings 0` 通过。 |
| 2026-07-05 | P1-7 第三十刀：reasoning effort policy owner | `done` | `src/lib/model/modelReasoningPolicy.ts`；`src/lib/model/modelReasoningPolicy.test.ts`；`src/lib/governance/modelReasoningPolicyBoundary.test.ts`；`src/lib/governance/codexModelReasoningPolicyOrigin.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区，尤其是当前并行 generated / plugin export 改动；不碰 GUI 主路径、RuntimeCore / App Server route、App Server runtime / read model / projection | 新增非热区 `modelReasoningPolicy` 纯 owner，承接 Codex `default_reasoning_level`、`supported_reasoning_levels` 与 `supports_reasoning_summaries`：request 侧只有模型支持 reasoning summaries 时才返回 effort；切模型时保留受支持 current，否则取 supported list 中位数，再 fallback default；保留 Codex `ReasoningEffort::Custom` 的开放字符串语义，不依赖旧 Lime `ModelReasoningEffortLevel` 窄枚举。`codexModelReasoningPolicyOrigin.test.ts` 直接读取 Codex `openai_models.rs` / `turn_context.rs`；`modelReasoningPolicyBoundary.test.ts` 固定字段集合与纯 owner 依赖边界。验证：定向 Vitest、ESLint 与 scoped `diff --check` 通过。 |
| 2026-07-06 | P1-7 第三十七刀：submit request policy metadata owner | `done` | `src/lib/model/modelCapabilitySendGate.ts`；`src/lib/model/modelCapabilitySendGate.test.ts`；`src/lib/model/modelRequestPolicyMetadata.ts`；`src/lib/model/modelRequestPolicyMetadata.test.ts`；`src/lib/model/modelContextPolicy.ts`；`src/lib/model/modelTruncationPolicy.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`；`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 避让隔壁进程热区：`lime-rs/crates/agent/**`、`lime-rs/crates/app-server-protocol/**`、`packages/app-server-client/src/generated/protocol-types.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/types/modelRegistry.*`、`src/lib/governance/**`、App Server runtime / read model / projection、Plugin package protocol / generated client 改动 | `resolveModelRegistryEntryForSelection` 已修正为返回真实 `EnhancedModelMetadata`，避免把 capability summary 当 metadata；新增 `modelRequestPolicyMetadata.ts` owner，把 selected registry model 的 `execution/context/tool-call/reasoning/reasoning-output/input-modality/responses/truncation/native-tool` policy 收敛成 `request_metadata.harness.model_request_policy`；submit 阶段会同一次 registry 读取合并 request policy metadata 与媒体输入 final gate metadata；`modelContextPolicy` / `modelTruncationPolicy` 补最小 `unknown -> number` 类型窄化以通过 `npm run typecheck`。验证：`npx vitest run "src/lib/model/modelRequestPolicyMetadata.test.ts" "src/lib/model/modelCapabilitySendGate.test.ts" "src/lib/model/modelContextPolicy.test.ts" "src/lib/model/modelTruncationPolicy.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts"` 通过，5 files / 28 tests；相关 ESLint、`npm run typecheck`、scoped `git diff --check` 与 `npm run smoke:agent-runtime-current-fixture` 通过。`npm run test:contracts` 已执行但仍归属 agent/tool 外部缺口。 |
| 2026-07-06 | P1-8 第一刀：Quality fixture matrix | `done` | `internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/**`、App Server runtime / read model / projection、RuntimeCore、`scripts/check-app-server-client-contract.mjs`、源码治理热区 | 新增 P1 证据矩阵，把 Thread / Turn / Item、protocol、event materialization、runtime owner、UI projection、persistence/replay/trace、Provider/Model capability 映射到 protocol / runtime / projection / GUI / governance 五类证据，并明确第三十八刀热区释放条件；README 已挂入口；本刀只改文档，不新增脚本，避免触碰 `scripts/` 冻结边界。 |
| 2026-07-06 | P1-8 第二刀：第三十八刀 Rust consumer / evidence map | `done` | `internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/provider-model-capability-audit.md` | 继续避让：`lime-rs/crates/agent/**`、`lime-rs/crates/app-server/**` runtime / read model / projection、`lime-rs/crates/runtime-core/**`、`scripts/check-app-server-client-contract.mjs`、前端 model helper / governance 源码热区 | 对标 Codex `model_info.rs`、`turn.rs`、`turn_context.rs`、`context_window.rs`、`client_common.rs`、`tool_config.rs`、`tool_call.rs` 与 `responses_lite.rs`，把第三十八刀消费侧拆成 `responses_policy`、`truncation_policy`、`native_tool_policy`、`tool_call_policy`、`reasoning_policy`、`context_policy`、`input_modality_policy` 七个 Rust consumer 证据点；明确不只透传 metadata，必须进入 request shape / tool context / prompt / context budget 的 typed owner，并绑定 Rust fixture、`smoke:agent-runtime-current-fixture` 与 `test:contracts` 口径。 |
| 2026-07-06 | P1-8 第三刀：Codex / opencode upstream checkpoint | `done` | `internal/research/refactor/v1/upstream-checkpoint.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/follow-up-strategy.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/**`、App Server runtime / read model / projection、RuntimeCore、`scripts/check-app-server-client-contract.mjs`、所有源码热区；opencode 非多模型 / 多模态变化不进入 backlog | 记录 Codex `main@db887d03e1f907467e33271572dffb73bceecd6b` 与 opencode `dev@17166b271fb9d7bf7128f0e63732dde0c10dd963` 为后续 diff 起点；分类近期高价值信号：Codex `max` reasoning effort 已由前端 owner 覆盖、skills metadata 转入 P2 skills、custom tool namespace 等待 agent/tool 热区、rollout turn item 回挂 P1-3；opencode 只采纳 Gemini audio/video media lowering 作为多模态 provider lowering 参考，tool strict 按非 allowlist 拒绝。 |
| 2026-07-06 | P1-8 第四刀：第三十八刀 anchor integrity audit | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md` | 继续避让：`lime-rs/crates/agent/**`、`lime-rs/crates/app-server/**` runtime / read model / projection、`lime-rs/crates/runtime-core/**`、`src/lib/model/**`、`src/lib/governance/**`、`scripts/check-app-server-client-contract.mjs`；Codex / opencode 只读 | 只读复核 Codex `db887d03e1f907467e33271572dffb73bceecd6b` 与 opencode `17166b271fb9d7bf7128f0e63732dde0c10dd963` worktree 均 clean；把第三十八刀必须消费的 Codex 符号级 anchor 固定到质量矩阵：`ModelInfo` policy 字段、`responses_lite` request fixture、`turn.rs` input modality / parallel tool calls、`client_common.rs` lite gate、`tool_config.rs` native tool gate、`tool_call.rs` truncation policy；opencode 只保留 `MEDIA_MIMES` / Gemini lowering 作为多模态 allowlist。 |
| 2026-07-06 | P1-8 第五刀：整体完成审计 | `done` | `internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/**`、App Server runtime / read model / projection、RuntimeCore、`scripts/check-app-server-client-contract.mjs`、所有源码热区 | 新增整体完成审计，把 PRD / roadmap 退出条件映射到当前证据：P0 文档基线 done，P1 多数骨架 partial/done，P1-7 仍缺 Rust runtime/request consumer，当时 P2 深层能力仍 queued，P3 只有 checkpoint 未证明 weekly loop；明确整体目标尚未完成，下一刀仍优先 P1-7 第三十八刀。 |
| 2026-07-06 | P1-8 第六刀：第三十八刀 Rust consumer handoff audit | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md` | 继续避让：`lime-rs/crates/agent/**`、`lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/runtime-core/**`、`src/lib/model/**`、`src/lib/governance/**`、`scripts/check-app-server-client-contract.mjs`；Codex 只读 | 只读审计 Lime runtime 入口：`runtime_backend/request_context/turn_context.rs` 已把 host/runtime metadata 放进 `AgentTurnContext.metadata`，`lime-agent/src/turn_context_configuration.rs` 是可承接 typed projection 的边界，`modelRequestPolicyMetadata.ts` 的实际字段形状已固定；第三十八刀最小源码写集应优先落 `lime-agent` 新 `model_request_policy` owner + turn context accessor，App Server 只做 metadata 投影和接线，不在顶层 loop 散落 `serde_json::Value` pointer。四个高风险面接管点固定为 responses/tool-call request shape、tool output truncation、native tool inventory gate、parallel tool calls gate。 |
| 2026-07-06 | P1-8 第七刀：第三十八刀接管窗口与验证门槛 | `done` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md` | 继续避让：当前 scoped status 仍显示 `lime-rs/crates/agent/**`、App Server runtime/backend、RuntimeCore、`src/lib/model/**`、`src/lib/governance/**`、`scripts/check-app-server-client-contract.mjs` 为并行脏热区；Codex 只读 | 复核 Codex `openai_models.rs`、`responses_lite.rs`、`client_common.rs`、`turn.rs`、`tool_config.rs`、`tool_call.rs` 的 request/tool 消费点后，补充第三十八刀接管窗口：热区必须先干净或由用户明确授权当前进程接管；源码第一步只能落 `lime-agent/src/model_request_policy.rs` typed parser/accessor；完成验证必须先证明 typed owner，再证明 responses_lite / parallel tool calls / truncation / native tool 四个 consumer，最后跑 `smoke:agent-runtime-current-fixture` 和 `test:contracts`。 |
| 2026-07-06 | P1-8 第八刀：Codex / opencode upstream range diff | `done` | `internal/research/refactor/v1/upstream-diff-2026-07-06.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/upstream-checkpoint.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/completion-audit.md` | 继续避让所有源码热区；Codex / opencode 只读；opencode 非 Provider / Model / Capability / ContentPart / media / provider lowering / LLM event reducer 变化不进入 backlog | 从 Codex `db887d03e1f907467e33271572dffb73bceecd6b..be33f80bc65159c094ecd06bf155afa3061ce23d` 与 opencode `17166b271fb9d7bf7128f0e63732dde0c10dd963..be73f465df6b20e0c3091f49ab83e89c0ede3b35` 产出真实 diff；Codex 保留 response metadata、plugin version、tool timing、multi-agent lifecycle、model availability 等信号；opencode 只采纳 request precedence、model defaults / compatibility、response reducer、reasoning terminal、media MIME / provider lowering 等 allowlist 信号。P3 已有一次 range 证据，但仍需后续周期性循环。 |
| 2026-07-06 | P1-8 第九刀：contract readiness refresh | `superseded by contract-green record` | `internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/completion-audit.md` | 继续避让：`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`packages/app-server-client/src/generated/protocol-types.ts` 等并行脏热区；本刀只运行共享验证并记录结果 | 本行保留首次 refresh 的历史位置，但结论已被表头第九切片覆盖：`node scripts/check-app-server-client-contract.mjs` 与完整 `npm run test:contracts` 均已通过；不得再按旧失败记录恢复 Aster registry adapter 或等待 `web_search_preflight_uses_turn_context_for_permission_check`。 |
| 2026-07-06 | P1-7 第三十八刀第一切片：model request policy typed owner | `done` | `lime-rs/crates/agent/src/model_request_policy.rs`；`lime-rs/crates/agent/src/model_request_policy/tests.rs`；`lime-rs/crates/agent/src/lib.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/turn_context_configuration.rs`、App Server runtime/backend、RuntimeCore、前端 model/governance/hooks、contract 脚本 | 新增 `model_request_policy` typed owner 和 crate re-export，支持从 `AgentTurnContext.metadata.runtime_options.harness.model_request_policy` 解析 `responses_policy`、`tool_call_policy`、`truncation_policy`、`native_tool_policy`，并支持 camelCase alias；不接 consumer，不改 App Server 投影，不展开 request shape。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture` 通过，6 tests passed；仅有既有 `agent_tools/execution/tests.rs` unused import warning。 |
| 2026-07-06 | P1-7 第三十八刀第二切片：live process truncation consumer | `done` | `lime-rs/crates/agent/src/live_execution_process.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/turn_execution.rs`、App Server runtime/backend、RuntimeCore、前端 model/governance/hooks、contract 脚本；不继续改 `model_request_policy` owner | live shell/native process drain 已读取 `model_request_policy.truncation_policy`，`mode=bytes` 时把 `limit` 映射到 `ExecutionProcessDrainOutputParams.max_bytes`；`tokens` 暂不映射到 bytes，保持 current 默认并等待后续 token-aware formatter。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture` 通过，4 tests passed；仅有既有 `agent_tools/execution/tests.rs` unused import warning。体量风险：`live_execution_process.rs` 已到 `819` 行，后续继续扩 live process 时优先把 tests 或 metadata helper 下沉。 |
| 2026-07-06 | P1-7 第三十八刀第三切片：live process native shell gate | `verification-blocked` | `lime-rs/crates/agent/src/live_execution_process.rs`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/turn_execution.rs`、App Server runtime/backend、RuntimeCore、前端 model/governance/hooks、contract 脚本；不继续改 `model_request_policy` owner | 已接一个 native-tool consumer：`native_tool_policy.shell_tool_enabled=false` 时 live shell/native process hook 不接管 Bash / PowerShell；不改全局 tool inventory，避免夹写 `agent_tools/**`。验证被并行 Cargo 版本 / lockfile 改动阻塞：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture` 在 dependency resolution 阶段失败，`aws-smithy-runtime 1.9.5` 与 `aws-sdk-sso 1.92.0` 需求冲突；当前 `lime-rs/Cargo.lock`、`lime-rs/Cargo.toml`、vendored `aster-rust` 均为外部脏写集，本刀不修锁文件。 |
| 2026-07-06 | P1-7 第三十八刀第四切片：responses/tool-call transport skeleton | `transport-skeleton-verified` | 源码写集由隔壁持有并只读审计：`lime-rs/crates/model-provider/src/provider_stream.rs`、`lime-rs/crates/agent/src/model_request_policy.rs`、`lime-rs/crates/agent/src/model_request_policy/tests.rs`、`lime-rs/crates/agent/src/lib.rs`、`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`；本轮只写 `internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/quality-fixture-matrix.md`、`internal/research/refactor/v1/completion-audit.md` | 继续避让：`lime-rs/crates/agent/src/agent_tools/**`、App Server runtime/backend/read model、RuntimeCore、前端 model/governance、protocol generated、contract 脚本、`lime-rs/Cargo.lock`、`lime-rs/vendor/aster-rust/**`、`lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs` | `RuntimeReplyStreamRequest` 新增 optional `model_request_policy`，`lime-agent` 新增 runtime reply policy 投影并按 Codex Responses Lite 口径强制 `parallel_tool_calls=false` / `reasoning_context=all_turns` / lite header；`start_aster_reply_stream` 构造 provider stream request 时写入 DTO；`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider stream_request_carries_model_request_policy -- --nocapture` 通过。注意：`CompatAsterReplyProviderBackend` 仍未消费 DTO 生成真实 provider payload，下一刀必须补 backend request-shape fixture。 |
| 2026-07-06 | P2 第一刀：runtime skeleton owner matrix | `done` | `internal/research/refactor/v1/p2-runtime-skeleton.md`；`internal/research/refactor/v1/README.md`；`internal/research/refactor/v1/priority-tracking-plan.md`；`internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/quality-fixture-matrix.md` | 继续避让所有源码热区；不把骨架误判为 P2 工程完成 | 新增 P2 深层能力骨架：Tool / Approval / Sandbox、Context / Token / Compaction、Plugin / Skills / MCP、Realtime / Media / Collaboration、Trace / Evidence cross-cutting 都已有 current owner、第一代码切片、禁止路径和最小验证。Tool / Approval / Sandbox 后续已由第十六刀完成 combo evidence，下一步转 Context / Token。 |
| 2026-07-06 | P2 第二刀：skeleton execution gate sync | `done` | `internal/research/refactor/v1/completion-audit.md`；`internal/research/refactor/v1/quality-fixture-matrix.md`；`internal/research/refactor/v1/fast-alignment-roadmap.md`；`internal/research/refactor/v1/priority-tracking-plan.md` | 继续避让：`lime-rs/crates/agent/**`、App Server runtime/backend、RuntimeCore、`src/lib/model/**`、`src/lib/governance/**`、`src/components/agent/chat/hooks/**`、`scripts/check-app-server-client-contract.mjs`；本刀不接管源码 | 响应“下一阶段先开始完成骨架、执行太慢”的反馈，把 P2 从 `queued` 口径统一为 `skeleton-ready`，在质量矩阵新增 P2 骨架验证表，并把路线图 P2 入口指向 `p2-runtime-skeleton.md`。当前 scoped status 仍显示源码热区被并行进程持有，下一次开代码仍需先满足接管窗口。 |

## 3. 优先级队列

| 优先级 | 顺序 | 主题 | 当前状态 | 下一刀 | 最小验证 |
| --- | ---: | --- | --- | --- | --- |
| P1 | 1 | Thread / Turn / Item invariant | `done` | 已建立命名基线、invariant、前置检查和任务模板；所有 Agent 改动先说明 Thread、Turn、Item 归属 | 文档检查已覆盖；后续工程改动补 runtime/projection 测试 |
| P1 | 2 | Method definition registry / serialization scope | `done` | 已补 `APP_SERVER_REQUEST_SERIALIZATION_SCOPES`，并输出到 schema manifest、generated TS、client facade 和 contract guard | `cargo test -p app-server-protocol app_server_request_serialization_scope_covers_high_risk_methods`、`cargo test -p app-server-protocol schema_fixtures_match_generated_output`、`npm run check:protocol-types`、定向 Vitest、`npm run test:contracts` |
| P1 | 3 | Event materialization / Turn terminal | `done` | 已补 `turn.failed` typed event；`message.delta` 不再默认完成带 `itemId` 的 `agent_message`；`agent_message` projection 已拆到子模块；stale terminal 已由 turn guard 收口；Article Editor history hydrate 已验证 thread_read artifact projection | projection 定向测试；`npm run test:contracts`；`npm run smoke:agent-runtime-current-fixture` |
| P1 | 4 | Core session / task runtime owner | `in-progress` | 已补 `runtime.rs` / `runtime_backend.rs` / `processor/dispatch.rs` / `read_model.rs` / `thread_item_projection.rs` / `session_execution_runtime.rs` 回流守卫；已把 `read_model/messages.rs` 拆为 message projection owner，并把 `read_model.rs` 基线降到 `840` 行；已把 `session_execution_runtime/recent_context.rs`、`session_execution_runtime/runtime_payload.rs`、`session_execution_runtime/recent_settings.rs`、`session_execution_runtime/tests*.rs` 拆为 owner，并把 `session_execution_runtime.rs` 基线降到 `660` 行 | `cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_execution_runtime -- --nocapture`；`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"` |
| P1 | 5 | UI projection boundary | `done` | UI execution runtime、Turn context、Runtime lifecycle、Conversation、Diagnostic、Queue、Routing、Action、Artifact、Tool、Subagent、ThreadItem 已收敛到 owner dispatcher；`agentUiEventProjection.ts` 仅做事件族委托和 sequence 编排，并由 `agentUiProjectionBoundary.test.ts` 防回流 | `npx vitest run "src/lib/governance/agentUiProjectionBoundary.test.ts"`；owner projection 定向 Vitest；renderer typecheck；必要时 GUI smoke |
| P1 | 6 | Persistence / Replay / Trace | `done` | 已完成 `evidence/export` correlation spine fail-closed、handoff / replay / analysis / review 派生导出 session/path correlation，以及 requestTelemetry 负向测试；后续只在发现新 trace / replay gap 时回补 | `npx vitest run "src/lib/api/agentRuntime/appServerEvidenceExportProjection.test.ts" "src/lib/api/agentRuntime/exportClient.test.ts"`；`npx vitest run "src/lib/governance/agentRuntimeExportBoundary.test.ts"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_request_telemetry_ignores_unmatched_session_and_turn_logs -- --nocapture`；renderer typecheck |
| P1 | 7 | Provider / Model capability | `consumer-done / keep-regression` | 已完成 current owner mapping、前端 / Rust capability summary、provider route protocol projection guard、Prompt Cache 口径收敛、multi-modal send gate、最终 submit op fail-closed、GUI policy 接线、picker vs execution / route DTO 分层、Codex `ModelInfo` 十层 policy owner、App Server `ModelInfo` / schema / generated TS / registry projection 真字段接线、`model_request_policy` submit metadata owner，以及 request/tool/reasoning/context consumer 到 actual auto compact trigger owner | 已有 Rust consumer 定向测试、`npm run test:contracts`、`npm run smoke:agent-runtime-current-fixture`；后续只在相关源码改动后按矩阵复跑 |
| P1 | 8 | Quality fixture matrix | `done` | 已新增 [quality-fixture-matrix.md](./quality-fixture-matrix.md)，把 P1/P2 模块映射到 protocol / runtime / projection / GUI / governance 五类证据；已固定上游 checkpoint、completion audit、contract 失败归属与 P2 Tool / Approval / Sandbox combo evidence | 文档入口已挂 README；后续若机械化成脚本，必须先遵守 `scripts/` 冻结边界 |
| P2 | 9 | Tool / Approval / Sandbox | `combo-evidence-done` | bridge、Aster pending resume、governance、contract、runtime current fixture 与 frontend projection 组合证据已通过；后续只在热区合并或触碰 GUI 主路径后做 post-merge regression | `npm run governance:legacy-report`；`npm run test:contracts`；`npm run smoke:agent-runtime-current-fixture`；Tool / Action / Agent UI projection Vitest |
| P2 | 10 | Context / Token / Compaction | `context-packet-consumer-done / evidence-export-pending` | `ContextFragmentEnvelope` / budget decision / sidecar-reference owner 已落到 RuntimeCore；preview 同时受 char policy 与 `max_model_visible_tokens` 约束，zero-preview + sidecar 明确为 `reference_only`；App Server `context_packet` admitted packet 已消费 envelope 并输出 `fragmentEnvelope` telemetry；下一刀把 memory / compaction source sidecarRef 贯通到 Evidence export | `cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core context_fragments -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture`；后续补 Evidence export tests |
| P2 | 11 | Plugin / Skills / MCP | `plugin-app-center-projection-consumer-done / skill-mcp-runtime-consumer-pending` | `runtimeCapabilities` snapshot owner 已落到 `plugin_packages/runtime_capabilities.rs` 并由 projected manifest 消费；前端 App Center projection 已优先消费 snapshot；下一刀接 skill prompt injection consumer / MCP runtime import | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities -- --nocapture`；`npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts"`；后续补 skill registry tests、MCP contract、runtime consumer tests |
| P2 | 12 | Realtime / Media / Collaboration | `runtime-content-owner-done / llm-media-content-event-done / message-delta-content-owner-done / message-delta-content-parser-done / item-projection-pending / handoff-ready` | `runtime-core/src/runtime_content.rs` 已固定 `RuntimeContentPart` / `RuntimeContentReference` / `RuntimeMediaKind` owner、`RuntimeMessageDeltaContent` payload owner 和 payload parser；`llm_protocol::runtime_event_from_llm_event(...)` 已把文本、支持 MIME 的 LLM image/audio 输出统一接成 owner-backed `message.delta` payload；下一刀按 [p2-media-item-projection-handoff.md](./p2-media-item-projection-handoff.md) 把 Item/read model / Workbench projection 接住该 payload | `cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture`；后续 Item projection tests、GUI media smoke |

## 4. P1 第一轮拆解

### 4.1 Thread / Turn / Item invariant

目标：

```text
所有 Agent 运行、历史、恢复、UI projection、Evidence、Replay，都先回答：
它属于哪个 session/thread？
它发生在哪个 turn？
它应该落成哪个 item？
```

实施边界：

| 项 | 内容 |
| --- | --- |
| current owner | `agentSession/*`、`runtime/turn_execution.rs`、`agent/src/turn_execution.rs`、`ProjectionStore`、`read_model`、Timeline / MessageList / Workbench |
| 不做 | 不把 Lime 协议改名为 Codex v2；不恢复旧 `agent_runtime_*` production command；不把 `Thread` 降级成前端 chat id |
| 输出 | [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 已建立 invariant、前置检查和后续工程任务模板 |
| 风险 | 工程实现若不引用模板，仍可能绕过；后续 P1 代码改动必须补 runtime/projection 测试 |

退出条件：

1. 后续 Agent 相关计划和 PRD 都引用 primitive invariant。`done`
2. 新增 runtime / projection / evidence 改动必须能说明三层归属。`done for planning gate`
3. 旧 `agent_runtime_*` 只能保持 retired guard / test-only / historical evidence。`done for gate`

### 4.2 Method definition registry / serialization scope

目标：

```text
新增 App Server method 的 method name、params、response、notification、serialization scope 不再分散手写。
```

实施边界：

| 项 | 内容 |
| --- | --- |
| current owner | `lime-rs/crates/app-server-protocol/src/protocol/v0/**`、`schema_export.rs`、`packages/app-server-client`、`src/lib/api/*` |
| 不做 | 不一次性迁完全部旧 method；不为抽象而引入动态路由；不改 `v0` 版本名 |
| 第一批 scope | turn/thread mutation、execution process、project shell、MCP oauth、MCP resource subscription、browser session、file mutation |
| 验证 | Rust protocol 定向测试、schema fixture drift、TS protocol drift、定向 app-server-client Vitest、`npm run test:contracts` |

退出条件：

1. 新 method 有统一 metadata 入口。`done for catalog scope`
2. high-risk method 有 serialization scope。`done for first batch`
3. schema/client/API gateway/contract 同步路径明确。`done`

### 4.3 Event materialization / Turn terminal

目标：

```text
Provider 或 core event 不能直通 UI；
必须先 materialize 成 RuntimeEvent / Item / read model，再投影到 GUI。
```

实施边界：

| 项 | 内容 |
| --- | --- |
| current owner | `runtime-core/src/llm_protocol/**`、`app-server/src/runtime/thread_item_projection.rs`、`tool_item_projection.rs`、`read_model.rs`、前端 timeline selectors |
| 不做 | 不用 UI timeout 或自然语言正文合成终态；不让组件按 provider wire event 临时分类 |
| 覆盖场景 | `turn.completed`、`turn.failed`、cancel-then-continue、stale terminal event、history hydrate |
| 验证 | projection 单测 + `npm run smoke:agent-runtime-current-fixture` |

退出条件：

1. `provider wire -> LLMEvent -> RuntimeEvent -> Item -> read model -> GUI` 有固定 owner。
2. active stream 清理绑定 session/thread、turn、item，不误停新 turn。

## 5. 过程日志

| 日期 | 进展 | 证据 | 下一步 |
| --- | --- | --- | --- |
| 2026-07-05 | 建立 v1 文档基线，补齐 Lime current-state 现状文档和引用 | `lime-current-state.md`、README / PRD / architecture / roadmap 引用 | 新增本跟进计划，进入 P1 第一刀 |
| 2026-07-05 | 新增优先级跟进计划，明确 P1/P2 队列和第一轮拆解 | `priority-tracking-plan.md` | 开始 Thread / Turn / Item invariant |
| 2026-07-05 | 新增 Codex 命名对齐基线，统一短表达：Thread 管历史，Turn 管执行，Item 管投影 | `naming-alignment.md`、README / architecture / module plan 引用 | 继续补 Thread / Turn / Item invariant 文档 |
| 2026-07-05 | 完成 Thread / Turn / Item invariant，补齐前置检查、禁止路径、验证入口和后续任务模板 | `thread-turn-item-invariant.md`、README / PRD / architecture / module plan / roadmap 引用 | 进入 Method definition registry / serialization scope |
| 2026-07-05 | P1-2 第一刀：补 Rust protocol 高风险 request serialization scope registry 和 catalog 单测 | `AppServerRequestSerializationScope`、`APP_SERVER_REQUEST_SERIALIZATION_SCOPES`、`app_server_request_serialization_scope`、`catalog.rs` 单测 | 继续把 scope 输出到 schema / TS client，并等待 agent/runtime dirty changes 收口后重跑 contract |
| 2026-07-05 | P1-2 收口：serialization scope 已输出到 schema manifest、schema fixture、generated TS、`packages/app-server-client/src/protocol.ts` 和 contract guard | `requestSerializationScopes`、`GENERATED_APP_SERVER_REQUEST_SERIALIZATION_SCOPES`、`APP_SERVER_REQUEST_SERIALIZATION_SCOPES`、`getAppServerRequestSerializationScope`；`npm run test:contracts` 通过 | 进入 P1-3 Event materialization / Turn terminal |
| 2026-07-05 | P1-3 首刀：补 `turn.failed` typed event，并让带 `itemId` 的 `agent_message` 由 `item.completed` 决定完成态 | `AgentSessionRuntimeEventNotification::TurnFailed`、`thread_item_projection.rs` agent_message lifecycle、schema/generated TS 已更新；Rust 定向测试与 `npm run test:contracts` 通过 | 继续 active stream / stale terminal / history hydrate；拆出 agent message projection 子模块，避免继续扩大超大文件 |
| 2026-07-05 | P1-3 第二刀：把 `agent_message` Item 投影从超大 `thread_item_projection.rs` 拆到 `thread_item_projection/agent_message.rs` | `agent_message::item_from_delta`、`agent_message::upsert_from_item_event`、`agent_message::merge_item`；`cargo fmt` 与 agent_message 投影定向测试通过 | 继续 active stream 清理、stale terminal event 和 history hydrate 行为收口 |
| 2026-07-05 | P1-3 第三刀：前端 stream 终态入口增加 Turn 归属 guard，旧 turn 的 terminal event 不能清理当前 active stream | `agentStreamTerminalTurnGuard.ts`、`agentStreamTerminalTurnGuard.unit.test.ts`、`agentStreamRuntimeHandler.ts`、`agentStreamRuntimeHandler.unit.test.ts`；定向 Vitest 通过，`test:related` 受本机磁盘 ENOSPC 阻塞 | 继续 history hydrate 与 Electron fixture 证据 |
| 2026-07-05 | P1-3 第四刀：Article Editor history hydrate 只从 `thread_read.artifacts` 读取结构化 workspace patch，顶层 `detail.artifacts` 保持用户可见过滤 | `read_model.rs`、`artifact_projection.rs`、`article_workspace_action_projection.rs`、`artifacts.rs`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_keeps_workspace_patch_in_thread_read_artifacts_only -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server article_workspace_artifact_documents_merge_version_history_across_turns -- --nocapture`、Content Factory Article Editor 单场景 fixture、`npm run smoke:agent-runtime-current-fixture` 通过 | 进入 P1-4 runtime owner 收口 |
| 2026-07-05 | P1-4 第一刀：新增 core runtime owner 回流守卫，封住中心文件继续承接 turn / model / tool / context domain 逻辑 | `appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫覆盖 `runtime.rs`、`runtime_backend.rs`、`processor/dispatch.rs`、`read_model.rs`、`thread_item_projection.rs`、`session_execution_runtime.rs`；`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"` 通过 | 继续 P1-4 第二刀：优先从 `read_model.rs`、`thread_item_projection.rs` 或 `session_execution_runtime.rs` 拆出 owner 模块，降低超大文件基线 |
| 2026-07-05 | P1-4 第二刀：把 `read_model.rs` 的 Turn -> user / assistant message projection 拆到 `read_model/messages.rs`，中心文件从 `1023` 行降到 `829` 行 | `read_model/messages.rs`、`read_model.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_model -- --nocapture`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"` 通过；守卫基线降到 `read_model.rs <= 840` | 继续 P1-4 第三刀：优先拆 `thread_item_projection.rs` 的 reasoning / lifecycle projection 或 `session_execution_runtime.rs` 的 recent context projection |
| 2026-07-05 | P1-4 第三刀：把 `session_execution_runtime.rs` 的 recent harness context projection 拆到 `session_execution_runtime/recent_context.rs`，并通过计划文件标注并行协作边界 | `session_execution_runtime/recent_context.rs`、`session_execution_runtime.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫 owner 列表新增 recent context，中心文件基线降到 `session_execution_runtime.rs <= 2660`；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime -- --nocapture` 编译失败，阻塞在并行避让写集 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs` 缺少 `ExecutionProcessSnapshot` / `ExecutionOutputDelta` / `LocalExecutionProcessControlHandle` 导入 | 继续 P1-4 第四刀：等待隔壁进程释放 App Server projection 热区后拆 `thread_item_projection.rs` reasoning/lifecycle，或继续在 `session_execution_runtime.rs` 中拆 metadata payload owner；Rust 定向测试需等 `agent_tools/**` 热区修复后重跑 |
| 2026-07-05 | P1-4 第四刀：把 `session_execution_runtime.rs` 的 `lime_runtime` metadata payload projection 拆到 `session_execution_runtime/runtime_payload.rs` | `runtime_payload.rs`、`session_execution_runtime.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫 owner 列表新增 runtime payload，中心文件基线降到 `session_execution_runtime.rs <= 2460`；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_execution_runtime -- --nocapture` 编译失败，阻塞在并行避让写集 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs` 缺少 `ExecutionProcessSnapshot` / `ExecutionOutputDelta` / `LocalExecutionProcessControlHandle` 导入 | 继续 P1-4 第五刀：在不夹写 App Server projection / agent_tools / GUI 热区的前提下，优先拆 `session_execution_runtime.rs` 的 recent preferences/team selection，或等待热区释放后回到 `thread_item_projection.rs` reasoning/lifecycle；Rust 定向测试需等 `agent_tools/**` 热区修复后重跑 |
| 2026-07-05 | P1-4 第五刀：把 `session_execution_runtime.rs` 的 recent access / preferences / team selection projection 拆到 `session_execution_runtime/recent_settings.rs` | `recent_settings.rs`、`session_execution_runtime.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫 owner 列表新增 recent settings，中心文件基线降到 `session_execution_runtime.rs <= 2190`；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_execution_runtime -- --nocapture` 仍受并行避让写集 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs` 缺少 `ExecutionProcessSnapshot` / `ExecutionOutputDelta` / `LocalExecutionProcessControlHandle` 导入阻塞 | 继续 P1-4 第六刀：在不夹写 App Server projection / agent_tools / GUI 热区的前提下，优先拆 `session_execution_runtime.rs` 的 cost / limit event helpers 或测试模块；若热区释放，则回到 `thread_item_projection.rs` reasoning/lifecycle |
| 2026-07-05 | P1-4 第六刀：把 `session_execution_runtime.rs` 的内联测试拆到 tests owner，并按 recent settings / runtime payload 继续分组 | `session_execution_runtime/tests.rs`、`session_execution_runtime/tests/recent_settings.rs`、`session_execution_runtime/tests/runtime_payload.rs`、`session_execution_runtime.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫 owner 列表新增 tests owner，中心文件基线降到 `session_execution_runtime.rs <= 780`，并禁止测试职责回流；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_execution_runtime -- --nocapture` 通过；仅剩避让热区 `agent_tools/execution/tests.rs` unrelated unused import warning | 继续 P1-4 第七刀：若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle 拆分；若仍需避让，继续拆 session runtime owner 中的 residual projection / tests 子域 |
| 2026-07-05 | P1-4 第七刀：把 `session_execution_runtime.rs` 的 cost / limit helper 拆到 runtime payload owner，并把 helper 测试移入 runtime payload tests owner | `runtime_payload.rs`、`session_execution_runtime.rs`、`session_execution_runtime/tests.rs`、`session_execution_runtime/tests/runtime_payload.rs`、`lib.rs`、`appServerRuntimeBoundary.testSupport.ts`、`appServerRuntimeBoundary.test.ts`；守卫禁止 `apply_usage_to_cost_state` / `detect_runtime_limit_event` / `calculate_estimated_total_cost` 回流主文件，中心文件基线降到 `session_execution_runtime.rs <= 660`；crate public facade 继续从 `session_execution_runtime` re-export，不暴露私有 owner 模块；`cargo fmt --all --manifest-path "lime-rs/Cargo.toml"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib session_execution_runtime -- --nocapture` 通过；仅剩避让热区 `agent_tools/execution/tests.rs` unrelated unused import warning | 继续 P1-4 第八刀：若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle 拆分；若仍需避让，继续拆 session runtime / runtime payload 子域或转入 P1-5 UI projection boundary |
| 2026-07-05 | P1-5 第八刀：把 UI execution runtime merge / turn_context / model_change projection 拆到 `projection/sessionExecutionRuntimeProjection.ts` | `sessionExecutionRuntimeProjection.ts`、`sessionExecutionRuntime.ts`、`appServerRuntimeBoundary.test.ts`；`sessionExecutionRuntime.ts` 降到 `374` 行，治理守卫要求 projection helper 不得回流 utils facade；`npx vitest run "src/components/agent/chat/utils/sessionExecutionRuntime.test.ts" "src/components/agent/chat/utils/sessionExecutionRuntime.deepseek.test.ts"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净的 UI projection / utils 文件拆 runtime 状态机或 ViewModel owner，不夹写 `AgentChatWorkspace.tsx` |
| 2026-07-05 | P1-5 第九刀：给 UI execution runtime projection owner 补直接单测 | `sessionExecutionRuntimeProjection.test.ts`；直接覆盖缺 session_id、turn_context 执行策略归一、model_change 保留 schema / turn 状态并更新模型；`npx vitest run "src/components/agent/chat/projection/sessionExecutionRuntimeProjection.test.ts"`、`npx vitest run "src/components/agent/chat/utils/sessionExecutionRuntime.test.ts" "src/components/agent/chat/utils/sessionExecutionRuntime.deepseek.test.ts"`、`npx vitest run "src/lib/governance/appServerRuntimeBoundary.test.ts"`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十刀：给 Turn context UI projection owner 补直接单测 | `contextProjection.test.ts`；直接覆盖 `turn_context -> context.changed + permission.changed` 的 session/thread/turn、schema、policy、context refs 映射；未继续膨胀 `agentUiEventProjection.test.ts` 超大文件；`npx vitest run "src/components/agent/chat/projection/contextProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "turn context"`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十一刀：给 Runtime lifecycle UI projection owner 补直接单测 | `runtimeLifecycleProjection.test.ts`；直接覆盖 `turn_started -> run.started`、`runtime_status -> run.status + permission.changed + team.changed`、`model_effective -> run.status`、`task_profile_resolved -> task.changed` 的 adapter 字段映射；未继续膨胀 `agentUiEventProjection.test.ts` 超大文件；`npx vitest run "src/components/agent/chat/projection/runtimeLifecycleProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "runtime|model|task profile"`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十二刀：把 Runtime lifecycle 分发表收进 `runtimeLifecycleProjection.ts` owner | `buildRuntimeLifecycleEvents` 统一持有 `thread_started`、`turn_started`、`turn_completed`、`turn_canceled`、`turn_failed`、`error`、`runtime_status`、`model_change`、`model_effective`、`task_profile_resolved` 分发表；`agentUiEventProjection.ts` 不再逐项 import lifecycle adapter；owner 直接测试覆盖 thread / terminal / model_change 分发；`npx vitest run "src/components/agent/chat/projection/runtimeLifecycleProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "runtime|model|task profile"` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十三刀：把 Conversation 分发表收进 `conversationEventProjection.ts` owner | `buildConversationProjectionEvents` 统一持有 `message`、`text_delta`、`text_delta_batch`、`thinking_delta`、`reasoning_delta`、`reasoning_final`、`reasoning_started`、`reasoning_ended` 分发表；`agentUiEventProjection.ts` 不再逐项 import conversation adapter；owner 直接测试覆盖 message snapshot、text batch、reasoning final 和 reasoning lifecycle 空投影；`npx vitest run "src/components/agent/chat/projection/conversationEventProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "文本|推理|standard Agent UI envelope"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十四刀：把 Diagnostic 分发表收进 `diagnosticProjection.ts` owner | `buildDiagnosticProjectionEvents` 统一持有 `warning`、`cost_estimated`、`cost_recorded` 分发表；`agentUiEventProjection.ts` 不再逐项 import diagnostic adapter；owner 直接测试覆盖 warning 和 cost_recorded 分发；`npx vitest run "src/components/agent/chat/projection/diagnosticProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "warning|cost|diagnostic|metric"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十五刀：把 Queue 分发表收进 `queueProjection.ts` owner | `buildQueueProjectionEvents` 统一持有 `queue_added`、`queue_removed`、`queue_started`、`queue_cleared` 分发表；`agentUiEventProjection.ts` 不再逐项 import queue adapter；owner 直接测试覆盖 queue_added 和 queue_cleared 分发；`npx vitest run "src/components/agent/chat/projection/queueProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "queue|队列"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十六刀：把 Routing 分发表收进 `routingProjection.ts` owner | `buildRoutingProjectionEvents` 统一持有 routing decision、limit state、limit event 分发表；`agentUiEventProjection.ts` 不再逐项 import routing adapter；owner 直接测试覆盖 `routing_decision_made`、`single_candidate_only`、`quota_blocked` 分发；`npx vitest run "src/components/agent/chat/projection/routingProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "routing|limit|quota|候选|额度"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 runtime 状态机或 ViewModel owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十七刀：把 Action 分发表收进 `actionProjection.ts` owner | `buildActionProjectionEvents` 统一持有 `action_required`、`action_resolved` 分发表；`agentUiEventProjection.ts` 不再逐项 import action adapter；owner 直接测试覆盖 action_required 和 action_resolved 分发；`npx vitest run "src/components/agent/chat/projection/actionProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "action|HITL|approval|批准"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection / utils 周边拆 artifact / tool / subagent owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十八刀：把 Artifact 分发表收进 `artifactProjection.ts` owner | `buildArtifactProjectionEvents` 统一持有 `artifact_snapshot`、`context_trace` 分发表；artifact metadata requested-fix execution result 继续复用 `evidenceProjection` helper，但组合入口从 `agentUiEventProjection.ts` 收回 Artifact owner；owner 直接测试覆盖普通 artifact、requested-fix work item 和 context trace 分发；`npx vitest run "src/components/agent/chat/projection/artifactProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "artifact|context trace|requested fix"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection 周边拆 tool / subagent owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第十九刀：把 Tool 分发表收进 `toolEventProjection.ts` owner | `buildToolProjectionEvents` 统一持有 `tool_start`、`tool_end`、`tool_progress`、`tool_output_delta`、`tool_input_delta` 分发表；`agentUiEventProjection.ts` 不再逐项 import tool adapter；owner 直接测试覆盖 tool_start、tool_end plan approval、progress、output delta 和 input delta 分发；`npx vitest run "src/components/agent/chat/projection/toolEventProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "工具|tool|plan approval"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5，从干净 UI projection 周边拆 subagent owner，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第二十刀：把 Subagent 分发表收进 `subagentStatusProjection.ts` owner | `buildSubagentProjectionEvents` 统一持有 `subagent_status_changed` 分发表；`agentUiEventProjection.ts` 不再逐项 import subagent status adapter；owner 直接测试覆盖 running subagent status、completed worker notification 和 handoff；`npx vitest run "src/components/agent/chat/projection/subagentStatusProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "subagent|子任务|worker notification|handoff|team"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` reasoning/lifecycle；若仍未释放，继续 P1-5 做 UI projection residual owner 审计，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第二十一刀：把 ThreadItem residual 分发表收进 `threadItemProjection.ts` owner | `buildThreadItemProjectionEvents` 统一持有 `item_started`、`item_updated`、`item_completed` 分发表；`agentUiEventProjection.ts` 不再直接拆 `event.type` / `event.item`；owner 直接测试覆盖 reasoning item、tool_call plan approval、TaskUpdate owner change 和 subagent activity worker notification；`npx vitest run "src/components/agent/chat/projection/threadItemProjection.test.ts"`、`npx vitest run "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "item|tool|worker"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` / `read_model.rs`；若仍未释放，继续 P1-5 给聚合器补回流守卫，不夹写 GUI 主文件 |
| 2026-07-05 | P1-5 第二十二刀：给 Agent UI projection 聚合器补回流守卫 | `agentUiProjectionBoundary.test.ts` 独立检查 `agentUiEventProjection.ts` 只能导入 owner dispatcher，禁止单个 adapter builder、`@limecloud/agent-runtime-projection`、非空数组直接组装事件和 `event.item` 参数拆解回流；未夹写已有脏的 `appServerRuntimeBoundary.test.ts` / `asterMigrationBoundary.test.ts`；`npx vitest run "src/lib/governance/agentUiProjectionBoundary.test.ts"`、`npx vitest run "src/components/agent/chat/projection/threadItemProjection.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" --testNamePattern "item|tool|worker"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` / `read_model.rs`；若仍未释放，转入 P1-6 Persistence / Replay / Trace 的小切片审计和计划标注 |
| 2026-07-05 | P1-6 第一刀：封住 `evidence/export` current projection 的弱关联入口 | `appServerEvidenceExportProjection.ts` 对 `sessionId`、`threadId`、`evidencePack.packRelativeRoot/exportedAt/threadStatus` 与 `turnCount/itemCount/pendingRequestCount/queuedTurnCount/recentArtifactCount` fail-closed；`agentRuntimeExportBoundary.test.ts` 固定前端导出入口只能走 App Server `exportEvidence` 并进入严格 projection，生产源码不得回流 `agent_runtime_export_*`；`npx vitest run "src/lib/api/agentRuntime/appServerEvidenceExportProjection.test.ts" "src/lib/api/agentRuntime/exportClient.test.ts"`、`npx vitest run "src/lib/governance/agentRuntimeExportBoundary.test.ts"`、`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` / `read_model.rs`；若仍未释放，继续 P1-6 第二刀，审计 replayCase / analysisHandoff / requestTelemetry 的 session/thread/turn/item 真实关联 |
| 2026-07-05 | P1-6 第二刀：封住 handoff / replay / analysis / review 派生导出串 session 入口 | `exportClient.ts` 新增 `assertRuntimeExportSessionCorrelation`，要求返回 `sessionId` 等于请求 session，且 bundle / replay / analysis / review / evidence root 均落在 `.lime/harness/sessions/<sessionId>` 下；`exportClient.test.ts` 补 replay / analysis / review 串 session 负向测试；`agentRuntimeExportBoundary.test.ts` 固定五个派生导出方法必须调用 correlation helper；`npx vitest run "src/lib/api/agentRuntime/exportClient.test.ts"` 9 tests passed；`npx vitest run "src/lib/governance/agentRuntimeExportBoundary.test.ts"` 3 tests passed；`npx tsc --noEmit --project tsconfig.renderer.json --pretty false`、`git diff --check -- <本轮写集>` 通过 | 若 App Server projection 热区释放，回到 `thread_item_projection.rs` / `read_model.rs`；若仍未释放，继续 P1-6 第三刀，补 Rust `requestTelemetry` 负向测试，确认只输出真实 session/thread/turn 关联和空摘要 |
| 2026-07-05 | P1-6 第三刀只读审计：requestTelemetry 现状与缺口 | App Server `request_logs_for_evidence` 已按 `session_id` 与可选 `turn_id` 调用 `TelemetryStore::read_request_logs_for_session_turn`；底层 SQL 使用 `WHERE session_id = ?1 AND turn_id = ?2` 或 `WHERE session_id = ?1`；`evidence_provider.rs` 空日志输出 `status: "missing"` / 0 计数，非空输出 `sessionRequestCount` / `turnRequestCount`，未发现生产 `unlinked` 输出；已有 `provider_telemetry.rs` 覆盖成功关联；本轮只读避让 Rust 热区，未夹写测试 | Rust 热区释放后，补 App Server evidence 负向测试：无匹配 request log 时保持空摘要、其它 session / turn request log 不混入当前 evidence pack |
| 2026-07-05 | P1-6 第三刀：requestTelemetry 负向测试补强 | 新增 `evidence_exports/request_telemetry.rs` 作为负向测试 owner，避免继续推高 793 行的 `provider_telemetry.rs`；测试写入同 session/其它 turn 与其它 session/同 turn 两类干扰日志，再导出当前 session/turn evidence pack，断言 `request_telemetry.status=missing` 且 `requestCount/sessionRequestCount/turnRequestCount=0`，并确认无 `unlinked` 输出；`evidence_exports.rs` 仅增加模块声明 | P1-6 已收口；下一刀重新盘点 App Server projection / read model 热区，若仍被隔壁进程持有，则选择非热区 P1 切片 |
| 2026-07-05 | P1-7 第三十一刀：Codex input modalities / opencode 多模态词表 owner | `modelInputModalityPolicy.ts` 新增纯 owner，缺字段时按 Codex 兼容默认 `text/image`，显式 input 会收窄能力；`modalities.input` 只作为 opencode / models.dev 多模态参考形态，支持 `audio/video/pdf`，其中 `pdf` 在 send gate 侧折叠为 `file`；新增 `modelInputModalityPolicyBoundary.test.ts` 防止从 task family、runtime features、picker/catalog 或 capability summary 推断；`codexModelInputModalityPolicyOrigin.test.ts` 直接锚定 Codex `InputModality`、`default_input_modalities` 与 prompt history 图片过滤；`opencodeModelInputModalityReference.test.ts` 固定 opencode 只参考多模型 / 多模态 schema，不引入 session/runtime 架构；`npx vitest run "src/lib/model/modelInputModalityPolicy.test.ts" "src/lib/governance/modelInputModalityPolicyBoundary.test.ts" "src/lib/governance/codexModelInputModalityPolicyOrigin.test.ts" "src/lib/governance/opencodeModelInputModalityReference.test.ts"` 已通过 | App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区仍脏，本刀只做非热区 owner 与守卫；后续热区释放后接 input-modality 与其它 policy 到协议、generated TS、registry projection |
| 2026-07-05 | P1-7 第三十二刀：Codex reasoning summary / verbosity output policy owner | `modelReasoningOutputPolicy.ts` 新增纯 owner，承接 Codex `default_reasoning_summary`、`support_verbosity`、`default_verbosity`：summary 默认 `auto`，请求值可覆盖，`none` 表示省略；verbosity 只有 `support_verbosity=true` 时才发送，请求值覆盖默认；新增 `modelReasoningOutputPolicyBoundary.test.ts` 防止从 capability summary、runtime features、picker/catalog 或 reasoning effort 字段推断；`codexModelReasoningOutputPolicyOrigin.test.ts` 直接锚定 Codex `ReasoningSummary` / `Verbosity` 枚举、`ModelInfo` 输出控制字段、`TurnContext` summary default 与 `Client` verbosity gate；`modelExecutionPolicyProtocolBoundary.test.ts` 扩展为 execution / context / picker / tool-call / reasoning / reasoning-output 协议 rollout guard；`npx vitest run "src/lib/model/modelReasoningOutputPolicy.test.ts" "src/lib/governance/modelReasoningOutputPolicyBoundary.test.ts" "src/lib/governance/codexModelReasoningOutputPolicyOrigin.test.ts" "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts"` 已通过 | App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区仍脏，本刀只做非热区 owner 与守卫；第三十三刀前置继续补 input-modality 协议 rollout guard |
| 2026-07-05 | P1-7 第三十三刀前置：input modality 协议 rollout guard | `modelExecutionPolicyProtocolBoundary.test.ts` 把 `input_modalities` / `inputModalities` 纳入 Rust `ModelInfo` / schema bundle / generated TS 成组同步守卫；当前仍不触碰 `modelRegistry` 热区，且不把 `ModelCapabilitySummary.input_modalities` 误判成 `input_modality_policy` owner；未来 registry 一旦暴露 `input_modality_policy`，必须通过 `buildModelInputModalityPolicy(model)` 接线；`npx vitest run "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/model/modelInputModalityPolicy.test.ts" "src/lib/governance/modelInputModalityPolicyBoundary.test.ts" "src/lib/governance/codexModelInputModalityPolicyOrigin.test.ts" "src/lib/governance/opencodeModelInputModalityReference.test.ts"` 已通过 | App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区仍脏；第三十四刀在热区释放后接 execution / context / picker / tool-call / reasoning / reasoning-output / input-modality policy 到协议、generated TS、registry projection |
| 2026-07-05 | P1-7 第三十四刀前置：Codex Responses Lite request mode owner | `modelResponsesPolicy.ts` 新增纯 owner，只接收 Codex `use_responses_lite/useResponsesLite`，并显式投影 request mode、instructions/tools payload location、reasoning context、parallel tool calls request gate 与 Responses Lite header requirement；`modelResponsesPolicyBoundary.test.ts` 防止从 protocol、runtime features、tool support、capability summary 或 picker/catalog 字段推断；`codexModelResponsesPolicyOrigin.test.ts` 直接锚定 Codex `ModelInfo.use_responses_lite` 与 `Client` header / websocket metadata / reasoning context / payload shape / parallel tool calls gate 语义；`npx vitest run "src/lib/model/modelResponsesPolicy.test.ts" "src/lib/governance/modelResponsesPolicyBoundary.test.ts" "src/lib/governance/codexModelResponsesPolicyOrigin.test.ts"` 与 ESLint 已通过 | App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区仍脏，本刀只做非热区 owner 与守卫；后续在热区释放后把已认领 policy 字段补到协议、generated TS 与 registry projection |
| 2026-07-05 | P1-7 第三十四刀补充：capability summary policy 回流守卫 | `modelCapabilityProjectionBoundary.test.ts` 显式禁止 `ModelCapabilitySummary` / `getModelCapabilitySummary` 承接 `execution_policy/context_policy/picker_policy/tool_call_policy/reasoning_policy/reasoning_output_policy/input_modality_policy`，也禁止 `tool_mode/context_window/service_tiers/supports_parallel_tool_calls/reasoning/verbosity` 等 Codex 原始 policy 字段进入 summary；同时禁止 `inferModelCapabilities.ts` 依赖各 policy owner，避免 summary 与 runtime policy 重新耦合 | 继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区，以及隔壁已认领的 `modelResponsesPolicy*` / `codexModelResponsesPolicyOrigin.test.ts`；本刀只补非热区治理守卫和 ignored 计划 / 审计标注；第三十六刀仍等热区释放后接真实协议 / registry projection |
| 2026-07-05 | P1-7 第三十四刀二次补充：Responses Lite 协议 rollout guard | `modelExecutionPolicyProtocolBoundary.test.ts` 把 Codex `use_responses_lite/useResponsesLite` 纳入 Rust `ModelInfo` / schema bundle / generated TS 成组同步守卫；`modelCapabilityProjectionBoundary.test.ts` 同步禁止 `responses_policy` 与 `use_responses_lite` 回流到 `ModelCapabilitySummary` / `getModelCapabilitySummary`，并禁止 summary owner 依赖 `modelResponsesPolicy` | 继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区，以及隔壁已认领的 truncation owner 写集；本刀只补非热区协议 rollout / summary 回流守卫和 ignored 计划 / 审计标注；第三十六刀热区释放后接真实协议 / registry projection |
| 2026-07-05 | P1-7 第三十五刀前置：Codex truncation policy owner | `modelTruncationPolicy.ts` 新增纯 owner，只接收 Codex `truncation_policy/truncationPolicy`，保留 `bytes/tokens` 两种模式，缺失或非法值 fail-closed 到 Codex fallback `10000 bytes`；`modelTruncationPolicyBoundary.test.ts` 防止从 context、tool support、runtime features、capability summary 或 picker/catalog 字段推断；`codexModelTruncationPolicyOrigin.test.ts` 直接锚定 Codex `TruncationPolicyConfig`、runtime `TruncationPolicy`、models-manager override 与 `ToolCall.truncation_policy` 语义；`npx vitest run "src/lib/model/modelTruncationPolicy.test.ts" "src/lib/governance/modelTruncationPolicyBoundary.test.ts" "src/lib/governance/codexModelTruncationPolicyOrigin.test.ts"` 与 ESLint 已通过 | App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区仍脏，本刀只做非热区 owner 与守卫；第三十六刀在热区释放后把已认领 policy 字段补到协议、generated TS 与 registry projection |
| 2026-07-05 | P1-7 第三十五刀补充：truncation 协议 rollout guard | `modelExecutionPolicyProtocolBoundary.test.ts` 把 Codex `truncation_policy/truncationPolicy` 纳入 Rust `ModelInfo` / schema bundle / generated TS 成组同步守卫；`modelCapabilityProjectionBoundary.test.ts` 同步禁止 `truncation_policy` 回流到 `ModelCapabilitySummary` / `getModelCapabilitySummary`，并禁止 summary owner 依赖 `modelTruncationPolicy` | 继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区，以及隔壁已认领的 truncation owner 文件本体；本刀只补非热区协议 rollout / summary 回流守卫和 ignored 计划 / 审计标注；第三十六刀热区释放后接真实协议 / registry projection |
| 2026-07-05 | P1-7 第三十五刀三次补充：Codex native tool policy owner | `modelNativeToolPolicy.ts` 新增纯 owner，只接收 Codex `shell_type/shellType`、`apply_patch_tool_type/applyPatchToolType` 与 `experimental_supported_tools/experimentalSupportedTools`；`shell_type` 按 Codex `ConfigShellToolType` 投影模型偏好的 `shell_command / unified_exec` surface，`apply_patch_tool_type` 仅承认当前 Codex `freeform`，`experimental_supported_tools` 保留稳定去重 token；boundary / origin / protocol rollout 守卫固定该 owner 不从 capability summary、runtime features、tool-call policy、execution policy 或 picker/catalog 字段推断，也不把 `auto_review_model_override` / `multi_agent_version` 混入本 owner | 继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区；本刀只新增非热区 owner 与独立守卫，不改已有脏的 `modelExecutionPolicyProtocolBoundary.test.ts` / `modelCapabilityProjectionBoundary.test.ts`；较窄 `modelToolSurfacePolicy*` 草稿已不在当前工作树，若回流则按 native owner duplicate 处理，不得并行采用为第二套事实源；第三十六刀热区释放后把 native tool 与前序 policy 字段一起接入协议 / registry projection |
| 2026-07-05 | P1-7 第三十五刀三次补充协作复核：native owner 验证与重复草稿避让 | 复核 Codex `openai_models.rs`、`tool_config.rs`、`spec_plan.rs`，确认 `shell_type`、`apply_patch_tool_type`、`experimental_supported_tools` 均来自 Codex `ModelInfo`；`npx vitest run "src/lib/model/modelNativeToolPolicy.test.ts" "src/lib/governance/modelNativeToolPolicyBoundary.test.ts" "src/lib/governance/codexModelNativeToolPolicyOrigin.test.ts" "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts"`、对应 ESLint 与 scoped `git diff --check` 已通过 | 只写计划 / 审计文档；继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区；确认当前工作树不存在 `modelToolSurfacePolicy*` duplicate，后续若再出现只能合并进 native owner 或删除 |
| 2026-07-05 | P1-7 第三十六刀协作复核：最小验证口径补强 | scoped status 显示 App Server protocol / schema / generated client / registry DTO / `inferModelCapabilities` / model policy / governance policy tests 仍有并行脏改动，本轮不夹写代码热区；对标 Codex `ModelInfo` 与 `tool_config` 后，确认第三十六刀最小验证必须同时覆盖通用 policy protocol guard 和 native tool protocol guard；`npx vitest run "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/model/modelContextPolicy.test.ts" "src/lib/model/modelPickerPolicy.test.ts" "src/lib/model/modelToolCallPolicy.test.ts" "src/lib/model/modelReasoningPolicy.test.ts" "src/lib/model/modelReasoningOutputPolicy.test.ts" "src/lib/model/modelInputModalityPolicy.test.ts" "src/lib/model/modelResponsesPolicy.test.ts" "src/lib/model/modelTruncationPolicy.test.ts" "src/lib/model/modelNativeToolPolicy.test.ts"` 已通过，13 files / 62 tests | 本轮只写计划 / 审计文档；继续避让协议 / generated / registry / policy 热区；热区释放后由持有者或当前进程接第三十六刀真实 `ModelInfo` / schema / generated TS / registry projection 接线 |

## 6. 每次推进记录模板

后续每次推进时，在本节追加一条记录，并同步更新第 3 节队列状态。

```markdown
### YYYY-MM-DD：<主题>

- 阶段：P1 / P2 / P3
- 状态变化：queued -> in-progress -> done
- current owner：
- Codex 原点：
- opencode 参照：仅在多模型 / 多模态时填写
- 本次改动：
- 验证：
- 剩余缺口：
- 下一刀：
```

## 7. 状态词

| 状态 | 含义 |
| --- | --- |
| `not-started` | 尚未启动 |
| `queued` | 已排序，等待执行 |
| `next` | 下一刀 |
| `in-progress` | 正在执行 |
| `blocked` | 有明确阻塞，且无法继续推进该项 |
| `done` | 当前退出条件已满足，且验证证据存在 |
| `superseded` | 被更高层事实源替代 |

## 8. 当前下一刀

当前下一刀是：

```text
P2 Context / Token / Compaction 下一代码刀：Tool / Approval / Sandbox bridge 与 combo evidence 已完成；RuntimeCore `ContextFragmentEnvelope` owner 与 App Server `context_packet` consumer 已完成；下一步接 Evidence export / compaction sidecar source，让 skill / media / memory 的 reference decision 都能进入统一 token budget 证据。
```

并行前置补充：第三十六刀已完成 App Server `ModelInfo` / schema / generated TS / registry projection 接线；第三十七刀已完成前端 submit metadata owner；P1-8 已固定质量矩阵、上游 checkpoint、completion audit、contract 失败归属与 P2 Tool / Approval / Sandbox combo evidence；第三十八刀第一至第二十四切片已补齐 `model_request_policy` typed owner、request/tool consumer、context usage handoff、session DB read model handoff consumer 与 RuntimeCore pre-turn actual auto compact trigger。当前仍需避让未移交的并行热区，但下一刀主线应从 Tool / Approval / Sandbox 转到 P2 Context / Token / Compaction。

认领状态：

- 本进程已完成写集：`src/components/agent/chat/utils/sessionExecutionRuntime.ts`、`src/components/agent/chat/projection/sessionExecutionRuntimeProjection.ts`、`src/components/agent/chat/projection/contextProjection.test.ts`、`src/components/agent/chat/projection/runtimeLifecycleProjection.ts`、`src/components/agent/chat/projection/runtimeLifecycleProjection.test.ts`、`src/components/agent/chat/projection/conversationEventProjection.ts`、`src/components/agent/chat/projection/conversationEventProjection.test.ts`、`src/components/agent/chat/projection/diagnosticProjection.ts`、`src/components/agent/chat/projection/diagnosticProjection.test.ts`、`src/components/agent/chat/projection/queueProjection.ts`、`src/components/agent/chat/projection/queueProjection.test.ts`、`src/components/agent/chat/projection/routingProjection.ts`、`src/components/agent/chat/projection/routingProjection.test.ts`、`src/components/agent/chat/projection/actionProjection.ts`、`src/components/agent/chat/projection/actionProjection.test.ts`、`src/components/agent/chat/projection/artifactProjection.ts`、`src/components/agent/chat/projection/artifactProjection.test.ts`、`src/components/agent/chat/projection/toolEventProjection.ts`、`src/components/agent/chat/projection/toolEventProjection.test.ts`、`src/components/agent/chat/projection/subagentStatusProjection.ts`、`src/components/agent/chat/projection/subagentStatusProjection.test.ts`、`src/components/agent/chat/projection/threadItemProjection.ts`、`src/components/agent/chat/projection/threadItemProjection.test.ts`、`src/components/agent/chat/projection/agentUiEventProjection.ts`、`src/lib/governance/agentUiProjectionBoundary.test.ts`、`src/lib/api/agentRuntime/appServerEvidenceExportProjection.ts`、`src/lib/api/agentRuntime/appServerEvidenceExportProjection.test.ts`、`src/lib/api/agentRuntime/exportClient.ts`、`src/lib/api/agentRuntime/exportClient.test.ts`、`src/lib/governance/agentRuntimeExportBoundary.test.ts`、`lime-rs/crates/app-server/src/runtime/tests/evidence_exports.rs`、`lime-rs/crates/app-server/src/runtime/tests/evidence_exports/request_telemetry.rs`、`src/lib/model/inferModelCapabilities.ts`、`src/lib/model/inferModelCapabilities.test.ts`、`lime-rs/crates/model-provider/src/canonical/model.rs`、`lime-rs/crates/model-provider/src/canonical/mod.rs`、`src/lib/governance/modelProviderCapabilityBoundary.test.ts`、`src/lib/model/modelCapabilitySendGate.ts`、`src/lib/model/modelCapabilitySendGate.test.ts`、`src/components/agent/chat/hooks/agentChatShared.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`、`src/lib/governance/appServerRuntimeBoundary.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`，以及此前 P1-4 `session_execution_runtime*` owner 拆分写集。
- 本进程避让写集：`lime-rs/crates/app-server/src/runtime/read_model.rs`、`lime-rs/crates/app-server/src/runtime/thread_item_projection.rs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/tool-runtime/**`、`src/components/agent/chat/AgentChatWorkspace.tsx`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`、`src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`、Writing v2 / astermigration 并行改动。
- 第十刀实际新增写集：`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.ts`、`src/components/agent/chat/utils/buildUserInputSubmitOp.test.ts`、`src/components/agent/chat/utils/agentRuntimeErrorPresentation.ts`、`src/components/agent/chat/utils/agentRuntimeErrorPresentation.test.ts`、`src/i18n/resources/zh-CN/agent.json`、`src/i18n/resources/zh-TW/agent.json`、`src/i18n/resources/en-US/agent.json`、`src/i18n/resources/ja-JP/agent.json`、`src/i18n/resources/ko-KR/agent.json`。
- 第十四刀实际新增写集：`src/lib/model/modelCapabilitySendGate.ts`、`src/lib/model/modelCapabilitySendGate.test.ts`、`src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`、`src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`。
- 第十五刀实际新增写集：`lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`、`lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`、`lime-rs/crates/app-server-protocol/schema/json/v0/ResolvedModelRoute.json`、`packages/app-server-client/src/generated/protocol-types.ts`、`lime-rs/crates/runtime-core/src/model_route.rs`、`lime-rs/crates/runtime-core/src/llm_protocol/tests.rs`、`lime-rs/crates/app-server/src/model_route_execution.rs`、`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`。
- 第十六刀实际新增写集：`src/components/agent/chat/hooks/agentChatSendMessage.ts`、`src/components/agent/chat/hooks/agentChatSendMessage.test.ts`。
- 第十七刀实际新增写集：`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/provider-model-capability-audit.md`。
- 第十八刀实际新增写集：`src/lib/model/modelInputSendPolicy.ts`、`src/lib/model/modelInputSendPolicy.test.ts`。
- 第十九刀实际新增写集：`src/components/agent/chat/components/Inputbar/components/InputbarVisionCapabilityNotice.tsx`、`src/components/agent/chat/components/Inputbar/components/InputbarVisionCapabilityNotice.test.tsx`、`src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.tsx`、`src/components/agent/chat/components/Inputbar/components/InputbarComposerSection.planStatus.test.tsx`。
- 第二十刀实际验证：`npm run verify:gui-smoke` 已通过，证明 Inputbar policy 接线后的 GUI 最小闭环仍可运行。
- 第二十一刀实际新增写集：`src/lib/model/modelExecutionPolicy.ts`、`src/lib/model/modelExecutionPolicy.test.ts`；本进程另对 `src/lib/governance/modelCapabilityProjectionBoundary.test.ts` 做 lint-only 小修，未改变守卫语义。
- 第二十二刀实际新增写集：`src/lib/governance/modelExecutionPolicyBoundary.test.ts`。
- 第二十三刀实际新增写集：`src/lib/types/modelRegistry.ts`、`src/lib/types/modelRegistry.d.ts`、`src/lib/api/modelRegistry.ts`、`src/lib/api/modelRegistry.test.ts`、`src/lib/model/modelExecutionPolicy.test.ts`、`src/lib/governance/modelExecutionPolicyBoundary.test.ts`。
- 第二十四刀实际新增写集：`src/lib/governance/codexModelExecutionPolicyOrigin.test.ts`。
- 第二十五刀实际新增写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`。
- 第二十六刀实际新增写集：`src/lib/model/modelContextPolicy.ts`、`src/lib/model/modelContextPolicy.test.ts`、`src/lib/governance/codexModelContextPolicyOrigin.test.ts`。
- 第二十七刀实际新增写集：`src/lib/model/modelPickerPolicy.ts`、`src/lib/model/modelPickerPolicy.test.ts`、`src/lib/governance/codexModelPickerPolicyOrigin.test.ts`。
- 第二十八刀实际新增写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`。
- 第二十九刀实际新增写集：`src/lib/model/modelToolCallPolicy.ts`、`src/lib/model/modelToolCallPolicy.test.ts`、`src/lib/governance/modelToolCallPolicyBoundary.test.ts`、`src/lib/governance/codexModelToolCallPolicyOrigin.test.ts`。
- 第三十刀前置非热区守卫写集：`src/lib/governance/modelPickerPolicyBoundary.test.ts`、`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；在 App Server protocol / schema / generated client / `modelRegistry` 热区仍脏且混有 `pluginLocalPackage/export` 并行改动时，只补 picker policy 回流守卫，并把 `supports_parallel_tool_calls` 纳入协议 rollout completeness guard。
- 第三十刀实际新增写集：`src/lib/model/modelReasoningPolicy.ts`、`src/lib/model/modelReasoningPolicy.test.ts`、`src/lib/governance/modelReasoningPolicyBoundary.test.ts`、`src/lib/governance/codexModelReasoningPolicyOrigin.test.ts`。
- 第三十刀补充非热区守卫写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；在 App Server protocol / schema / generated client / `modelRegistry` 热区仍脏时，把 `default_reasoning_level`、`supported_reasoning_levels`、`supports_reasoning_summaries` 纳入协议 rollout completeness guard，并要求 registry 后续只能通过 `buildModelReasoningPolicy(model)` 暴露 `reasoning_policy`。
- 第三十一刀实际新增写集：`src/lib/model/modelInputModalityPolicy.ts`、`src/lib/model/modelInputModalityPolicy.test.ts`、`src/lib/governance/modelInputModalityPolicyBoundary.test.ts`、`src/lib/governance/codexModelInputModalityPolicyOrigin.test.ts`、`src/lib/governance/opencodeModelInputModalityReference.test.ts`。
- 第三十二刀实际新增写集：`src/lib/model/modelReasoningOutputPolicy.ts`、`src/lib/model/modelReasoningOutputPolicy.test.ts`、`src/lib/governance/modelReasoningOutputPolicyBoundary.test.ts`、`src/lib/governance/codexModelReasoningOutputPolicyOrigin.test.ts`、`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；继续避让 App Server protocol / schema / generated client / `modelRegistry` / `inferModelCapabilities` 热区。
- 第三十三刀前置非热区守卫写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`；在 App Server protocol / schema / generated client / `modelRegistry` 热区仍脏时，把 `input_modalities` 纳入协议 rollout completeness guard，要求 Rust `ModelInfo` / schema bundle / generated TS 三侧成组同步；未来一旦 registry 暴露 `input_modality_policy`，只能通过 `buildModelInputModalityPolicy(model)` owner 构造器接线。
- 第三十四刀前置非热区写集：`src/lib/model/modelResponsesPolicy.ts`、`src/lib/model/modelResponsesPolicy.test.ts`、`src/lib/governance/modelResponsesPolicyBoundary.test.ts`、`src/lib/governance/codexModelResponsesPolicyOrigin.test.ts`；在协议 / generated / registry 热区仍脏时，先把 Codex `use_responses_lite` 请求形态拆成纯 owner，固定 Responses Lite header、payload shape、reasoning context 与 parallel tool calls gate 语义，不从 protocol / runtime feature / tools / picker 字段推断。
- 第三十四刀补充非热区守卫写集：`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/provider-model-capability-audit.md`；在真实协议 / generated client / registry projection 热区仍脏时，先封住 `ModelCapabilitySummary` 承接 `*_policy` projection 或 Codex raw policy 字段的回流路径，并避让隔壁已认领的 Responses Lite owner 写集。
- 第三十四刀二次补充非热区守卫写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`、`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/provider-model-capability-audit.md`；在真实协议 / generated client / registry projection 热区仍脏时，先把 `use_responses_lite/useResponsesLite` 纳入三侧协议 rollout guard，并要求未来 registry 只能通过 `buildModelResponsesPolicy(model)` 暴露 `responses_policy`。
- 第三十五刀前置非热区写集：`src/lib/model/modelTruncationPolicy.ts`、`src/lib/model/modelTruncationPolicy.test.ts`、`src/lib/governance/modelTruncationPolicyBoundary.test.ts`、`src/lib/governance/codexModelTruncationPolicyOrigin.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/provider-model-capability-audit.md`；在协议 / generated / registry 热区仍脏时，先把 Codex `truncation_policy` 拆成 tool output truncation 纯 owner，固定 `bytes/tokens`、默认 `10000 bytes` 与 ToolCall 截断链路语义，不从 context / runtime feature / tools / picker 字段推断。
- 第三十五刀补充非热区守卫写集：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`、`src/lib/governance/modelCapabilityProjectionBoundary.test.ts`、`internal/research/refactor/v1/priority-tracking-plan.md`、`internal/research/refactor/v1/provider-model-capability-audit.md`；在真实协议 / generated client / registry projection 热区仍脏时，先把 `truncation_policy/truncationPolicy` 纳入三侧协议 rollout guard，并要求未来 registry 只能通过 `buildModelTruncationPolicy(model)` 暴露 `truncation_policy`。
- 第三十六刀候选写集：热区释放后把 `tool_mode`、`supports_search_tool`、`web_search_tool_type`、`supports_image_detail_original`、`context_window`、`max_context_window`、`auto_compact_token_limit`、`effective_context_window_percent`、`visibility`、`service_tiers`、`default_service_tier`、`supports_parallel_tool_calls`、`default_reasoning_level`、`supported_reasoning_levels`、`supports_reasoning_summaries`、`default_reasoning_summary`、`support_verbosity`、`default_verbosity`、`input_modalities`、`use_responses_lite`、`truncation_policy`、`shell_type`、`apply_patch_tool_type`、`experimental_supported_tools` 补到 App Server `ModelInfo`、schema fixture、generated TS、registry DTO 类型与 route / defaults / context / picker / tool-call / reasoning / reasoning-output / input-modality / responses / truncation / native-tool policy 边界守卫；继续避让 GUI 与 Rust execution 热区。
- 当前事实源：UI execution runtime 的 turn_context / model_change 合并投影属于 `projection/sessionExecutionRuntimeProjection.ts`；runtime lifecycle 的 `thread_started` / `turn_*` / `runtime_status` / `model_*` / `task_profile_resolved` 分发表属于 `projection/runtimeLifecycleProjection.ts`；conversation 的 `message` / `text_delta*` / `thinking_delta` / `reasoning_*` 分发表属于 `projection/conversationEventProjection.ts`；diagnostic 的 `warning` / `cost_*` 分发表属于 `projection/diagnosticProjection.ts`；queue 的 `queue_*` 分发表属于 `projection/queueProjection.ts`；routing 的 routing decision / limit state / limit event 分发表属于 `projection/routingProjection.ts`；action 的 `action_required` / `action_resolved` 分发表属于 `projection/actionProjection.ts`；artifact 的 `artifact_snapshot` / `context_trace` 分发表属于 `projection/artifactProjection.ts`；tool 的 `tool_*` 分发表属于 `projection/toolEventProjection.ts`；subagent 的 `subagent_status_changed` 分发表属于 `projection/subagentStatusProjection.ts`；thread item 的 `item_started` / `item_updated` / `item_completed` 分发表属于 `projection/threadItemProjection.ts`；`agentUiEventProjection.ts` 只做事件族委托和 sequence 编排，并由 `agentUiProjectionBoundary.test.ts` 防止单个 adapter / 直接组装回流；`evidence/export` 前端投影属于 `src/lib/api/agentRuntime/appServerEvidenceExportProjection.ts`，导出入口属于 `src/lib/api/agentRuntime/exportClient.ts -> appServerClient.exportEvidence`；handoff / replay / analysis / review 派生导出入口属于 `src/lib/api/agentRuntime/exportClient.ts -> assertRuntimeExportSessionCorrelation`，并由 `agentRuntimeExportBoundary.test.ts` 防止 legacy export command 回流和 correlation helper 被绕过；requestTelemetry 负向 evidence 测试 owner 属于 `lime-rs/crates/app-server/src/runtime/tests/evidence_exports/request_telemetry.rs`；Provider / Model capability 审计属于 `internal/research/refactor/v1/provider-model-capability-audit.md`；前端 model capability summary 属于 `src/lib/model/inferModelCapabilities.ts -> getModelCapabilitySummary`；Rust canonical model capability summary 属于 `lime-rs/crates/model-provider/src/canonical/model.rs -> CanonicalModel::capability_summary()`；RuntimeCore capability snapshot projection 属于 `lime-rs/crates/runtime-core/src/model_task.rs -> capability_snapshot_from_model_capabilities`；model/provider capability contract 守卫属于 `src/lib/governance/modelProviderCapabilityBoundary.test.ts`；picker vs execution summary 边界守卫属于 `src/lib/governance/modelCapabilityProjectionBoundary.test.ts`；multi-modal send gate helper 属于 `src/lib/model/modelCapabilitySendGate.ts`；发送准备 gate evidence 属于 `src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.ts -> requestMetadata.harness.model_input_capability_gate`；input modality 声明 owner 属于 `src/lib/model/modelInputModalityPolicy.ts`；前端 execution policy owner 属于 `src/lib/model/modelExecutionPolicy.ts`；前端 context / auto compact policy owner 属于 `src/lib/model/modelContextPolicy.ts`；前端 picker visibility / service tier policy owner 属于 `src/lib/model/modelPickerPolicy.ts`；前端 parallel tool calls policy owner 属于 `src/lib/model/modelToolCallPolicy.ts`；前端 reasoning effort policy owner 属于 `src/lib/model/modelReasoningPolicy.ts`；lime-agent provider route protocol projection guard 属于 `lime-rs/crates/agent/src/provider_configuration.rs`；Prompt Cache 能力事实源属于 `internal/aiprompts/commands.md` + `src/lib/model/providerPromptCacheSupport.ts` + `lime-rs/crates/core/src/provider_prompt_cache_support.rs` 共享 catalog；`utils/sessionExecutionRuntime.ts` 只保留偏好、label、Team 转换和 re-export；Lime Agent `session_execution_runtime` 只保留 DTO、组合和对外 runtime view；旧 `lime-rs/src/**` 与 `agent_runtime_*` production surface 继续按 `dead / retired guard-only` 处理。
- 第十刀新增 current fact：最终 runtime submit payload 的 media input fail-closed 边界属于 `src/components/agent/chat/utils/buildUserInputSubmitOp.ts`，由 `src/components/agent/chat/hooks/agentStreamSubmitExecution.ts` 在媒体输入时从 current `modelRegistryApi.getModelRegistry()` 解析 selected model summary；blocked / unknown media gap 不调用 `runtime.submitOp`，也不先写入 managed objective。
- 第十四刀新增 current fact：capability gate metadata merge owner 属于 `src/lib/model/modelCapabilitySendGate.ts`；submit 阶段会用 final selected model summary 覆盖 prepare 阶段 unknown gate evidence，确保最终 `runtime.submitOp.metadata.harness.model_input_capability_gate` 与真实 submit 判定一致。
- 第十五刀新增 current fact：execution route owner 属于 `ResolvedModelRoute.model_ref/protocol/endpoint/auth/transport/framing/defaults/capability_snapshot/decision/failure`；`provider/model` picker DTO 字段已从协议、schema fixture 和 generated TS 中删除，`ProviderInfo` / `ModelInfo` 只能作为 picker / catalog DTO 留在对应 API 投影，不再挂在 execution route 上。
- 第十六刀新增 current fact：`createAgentChatSendMessage` 是 picker selection -> `SendMessageOptions.modelCapabilitySummary` 的发送 wrapper 注入边界；它基于当前 provider/model selection、positional model override 与 `SendMessageOptions.providerOverride/modelOverride` 解析 current registry summary，只在上游未显式提供 summary 时补入。
- 第十七刀新增 current fact：`RouteDefaults` 只承接 `reasoning_effort`、`prompt_cache_mode`、`toolshim`、`toolshim_model` 这类 execution policy 字段，不承接 picker/catalog 的 service tier、status、pricing、display name 或 provider/model DTO。
- 第十八刀新增 current fact：`modelInputSendPolicy.ts` 是 GUI warning / disabled 接线前的发送策略 owner，唯一消费 `ModelCapabilitySendGateResult`，不读取 picker/catalog/registry；media unknown 默认与最终 submit fail-closed 口径一致。
- 第十九刀新增 current fact：Inputbar 媒体能力 disabled 接线只消费 `ModelInputSendPolicy.shouldDisableComposer`；`InputbarVisionCapabilityNotice` 只负责 Provider / Model 读取和推荐文案，不再输出自定义 capability policy。
- 第二十刀新增 current fact：`npm run verify:gui-smoke` 已证明该 GUI 接线在 Electron Desktop Host + App Server sidecar current 链路下可启动到 Claw workbench shell 和 memory settings ready。
- 第二十一刀新增 current fact：`src/lib/model/modelExecutionPolicy.ts` 是 Codex 式 `tool_mode`、`web_search_tool_type/supports_search_tool` 与 `supports_image_detail_original` 的前端 execution policy 纯 owner；默认 fail-closed，不从 `tier/status/pricing/provider_name` 等 picker/catalog 字段推断执行能力。
- 第二十二刀新增 current fact：`src/lib/governance/modelExecutionPolicyBoundary.test.ts` 是该 owner 的回流守卫，固定字段集合并禁止依赖 registry、capability summary、bridge 或 UI。
- 第二十三刀新增 current fact：`EnhancedModelMetadata.execution_policy` 是前端 registry metadata 面向 runtime 的归一 projection；`src/lib/api/modelRegistry.ts -> toSnakeModelInfo` 只能通过 `buildModelExecutionPolicy(model)` 暴露该字段，缺 App Server 字段时 fail-closed，picker/catalog 字段不得参与推断。
- 第二十四刀新增 current fact：`src/lib/governance/codexModelExecutionPolicyOrigin.test.ts` 是 Codex 原点源级守卫，本地存在 Codex 仓库时直接读取 `codex-rs/protocol/src/openai_models.rs`，锁定 `ToolMode`、`WebSearchToolType` 和当前已认领 `ModelInfo` execution policy 字段；reasoning levels、visibility、service tiers、parallel tool calls、context、auto compact、input modalities 仍是独立 owner 缺口。
- 第二十五刀新增 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 是 execution policy 协议 rollout completeness guard；协议、schema bundle 或 generated TS 任一侧出现 execution policy 字段时，三侧必须成组同步，registry 仍只能通过 `buildModelExecutionPolicy(model)` 暴露归一 projection。
- 第二十六刀新增 current fact：`src/lib/model/modelContextPolicy.ts` 是 Codex 式 context / auto compact 前端纯 owner，固定 `resolved_context_window`、`model_context_window` 与 `auto_compact_token_limit` 的归一语义；`src/lib/governance/codexModelContextPolicyOrigin.test.ts` 是源级守卫，直接锚定 Codex `ModelInfo::resolved_context_window()`、`ModelInfo::auto_compact_token_limit()` 与 `TurnContext::model_context_window()`。
- 第二十七刀新增 current fact：`src/lib/model/modelPickerPolicy.ts` 是 Codex 式 visibility / service tier 前端纯 owner，固定 `show_in_picker` 与 request service tier 过滤语义；`src/lib/governance/codexModelPickerPolicyOrigin.test.ts` 是源级守卫，直接锚定 Codex `ModelVisibility`、`ModelInfo` picker/service tier 字段和 `service_tier_for_request()`。
- 第二十八刀新增 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已扩展为 execution / context / picker policy 协议 rollout completeness guard；第三十刀前置继续把 tool-call policy 的 `supports_parallel_tool_calls` 与 reasoning policy 的 `default_reasoning_level` / `supported_reasoning_levels` / `supports_reasoning_summaries` 纳入同一 guard；真实协议接线必须同时覆盖 Rust `ModelInfo`、schema bundle、generated TS 与 registry owner projection。
- 第二十九刀新增 current fact：`src/lib/model/modelToolCallPolicy.ts` 是 Codex 式 `supports_parallel_tool_calls -> parallel_tool_calls` 前端纯 owner；默认 fail-closed，不从 tools、runtime features、capability summary 或 picker/catalog 字段推断并行工具调用。
- 第三十刀前置新增 current fact：`src/lib/governance/modelPickerPolicyBoundary.test.ts` 是 picker policy owner 回流守卫，补齐第二十七刀的非热区 guard；`modelPickerPolicy.ts` 只能暴露 Codex 式 picker / service tier 字段，不能读取 execution / context / capability / provider catalog 字段，也不能依赖 registry、capability summary、execution/context owner、bridge 或 UI。
- 第三十刀前置新增 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 同步覆盖 `supports_parallel_tool_calls`，要求 tool-call policy 字段在 Rust `ModelInfo`、schema bundle、generated TS 三侧成组 rollout，并要求 registry 只能通过 `buildModelToolCallPolicy(model)` 暴露 `tool_call_policy`。
- 第三十刀新增 current fact：`src/lib/model/modelReasoningPolicy.ts` 是 Codex 式 reasoning effort 前端纯 owner；它只接收 `supports_reasoning_summaries`、`default_reasoning_level`、`supported_reasoning_levels`，保留开放字符串 effort，并固定 request / model switch 两套可执行语义。
- 第三十刀新增 current fact：`src/lib/governance/modelReasoningPolicyBoundary.test.ts` 与 `src/lib/governance/codexModelReasoningPolicyOrigin.test.ts` 分别防止 reasoning owner 回流 capability summary / registry / UI / 旧 Lime 窄枚举，并把实现锚定到 Codex `ReasoningEffort` / `ModelInfo` / `TurnContext`。
- 第三十刀补充 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已同步覆盖 reasoning policy 字段；协议、schema bundle 或 generated TS 任一侧出现 reasoning 字段时必须三侧成组 rollout，registry projection 只能通过 `buildModelReasoningPolicy(model)` 暴露。
- 第三十一刀新增 current fact：`src/lib/model/modelInputModalityPolicy.ts` 是 Codex 式 `input_modalities` 前端纯 owner；缺字段时按 Codex `text/image` 兼容默认，显式字段收窄能力，opencode / models.dev 的 `modalities.input` 只作为多模态词表参考，`pdf` 在 send gate 侧折叠为 `file`。
- 第三十一刀新增 current fact：`src/lib/governance/modelInputModalityPolicyBoundary.test.ts`、`src/lib/governance/codexModelInputModalityPolicyOrigin.test.ts` 与 `src/lib/governance/opencodeModelInputModalityReference.test.ts` 分别防止 input modality owner 从 task family / runtime features / picker catalog / summary 推断，把实现锚定到 Codex `InputModality` / prompt history 图片过滤，并限制 opencode 只贡献多模型多模态 schema。
- 第三十二刀新增 current fact：`src/lib/model/modelReasoningOutputPolicy.ts` 是 Codex 式 `default_reasoning_summary` / `support_verbosity` / `default_verbosity` 前端纯 owner；summary request 值覆盖 model default，`none` 省略；verbosity 只有模型显式支持时才发送。
- 第三十二刀新增 current fact：`src/lib/governance/modelReasoningOutputPolicyBoundary.test.ts` 与 `src/lib/governance/codexModelReasoningOutputPolicyOrigin.test.ts` 防止 reasoning output owner 从 capability summary、runtime features、picker/catalog 或 reasoning effort 字段推断，并把实现锚定到 Codex `ReasoningSummary` / `Verbosity` / `ModelInfo` / `Client`。
- 第三十二刀补充 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已同步覆盖 reasoning-output policy 字段；协议、schema bundle 或 generated TS 任一侧出现 `default_reasoning_summary` / `support_verbosity` / `default_verbosity` 时必须三侧成组 rollout，registry projection 只能通过 `buildModelReasoningOutputPolicy(model)` 暴露。
- 第三十三刀前置 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已同步覆盖 input-modality policy 字段；协议、schema bundle 或 generated TS 任一侧出现 `input_modalities` / `inputModalities` 时必须三侧成组 rollout。当前 `ModelCapabilitySummary.input_modalities` 仍服务发送 gate，不等于 `input_modality_policy` owner；未来 registry projection 一旦暴露 `input_modality_policy`，只能通过 `buildModelInputModalityPolicy(model)` 接线。
- 第三十四刀前置 current fact：`src/lib/model/modelResponsesPolicy.ts` 是 Codex 式 `use_responses_lite` 请求形态纯 owner；它只接收 `use_responses_lite/useResponsesLite`，输出 Responses Lite request mode、instructions/tools payload location、reasoning context、parallel tool calls gate 和 header requirement，并由 `modelResponsesPolicyBoundary.test.ts` / `codexModelResponsesPolicyOrigin.test.ts` 分别防回流与锚定 Codex source。
- 第三十四刀补充 current fact：`src/lib/governance/modelCapabilityProjectionBoundary.test.ts` 显式防止 `ModelCapabilitySummary` 和 `getModelCapabilitySummary` 回流承接 `*_policy` projection 或 Codex raw policy 字段；`inferModelCapabilities.ts` 也不得依赖 execution/context/picker/tool-call/reasoning/reasoning-output/input-modality policy owner。
- 第三十四刀二次补充 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已同步覆盖 responses request-mode policy 字段；协议、schema bundle 或 generated TS 任一侧出现 `use_responses_lite/useResponsesLite` 时必须三侧成组 rollout，registry projection 只能通过 `buildModelResponsesPolicy(model)` 暴露。
- 第三十五刀前置 current fact：`src/lib/model/modelTruncationPolicy.ts` 是 Codex 式 `truncation_policy` 工具输出截断纯 owner；它只接收 `truncation_policy/truncationPolicy`，保留 `bytes/tokens` 模式，缺失或非法值 fail-closed 到 `10000 bytes`，并由 `modelTruncationPolicyBoundary.test.ts` / `codexModelTruncationPolicyOrigin.test.ts` 分别防回流与锚定 Codex source。
- 第三十五刀补充 current fact：`src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 已同步覆盖 truncation policy 字段；协议、schema bundle 或 generated TS 任一侧出现 `truncation_policy/truncationPolicy` 时必须三侧成组 rollout，registry projection 只能通过 `buildModelTruncationPolicy(model)` 暴露。

原因：

1. P1-1 已经把 Thread / Turn / Item 变成前置 invariant。
2. P1-2 已把高风险 request serialization scope 贯通到 Rust schema、TS client 和 contract。
3. P1-3 首刀已让 `turn.failed` 进入 typed notification，并让带 `itemId` 的 `agent_message` 不再由 delta 自行完成。
4. `agent_message` projection 已拆到子模块。
5. P1-3 已补 stale terminal guard，并通过 Article Editor / Agent Runtime current fixture 验证 history hydrate 与 live stream 关键链路。
6. P1-4 第一刀已补机械守卫，防止 runtime / processor / read model / projection / session runtime 中心文件继续回涨。
7. P1-4 第二刀已把 read model message projection 拆成 `read_model/messages.rs`，并把 `read_model.rs` 基线降到 `840` 行。
8. P1-4 第三刀已把 `session_execution_runtime.rs` 的 recent context projection 下沉到 owner 模块。
9. P1-4 第四刀已把 `session_execution_runtime.rs` 的 `lime_runtime` metadata payload projection 下沉到 owner 模块。
10. P1-4 第五刀已把 `session_execution_runtime.rs` 的 recent access / preferences / team selection projection 下沉到 owner 模块。
11. P1-4 第六刀已把 `session_execution_runtime.rs` 的内联测试下沉到 tests owner，并把主文件基线降到 `780` 行。
12. P1-4 第七刀已把 cost / limit helper 下沉到 runtime payload owner，并把主文件基线降到 `660` 行。
13. P1-5 第八刀已把 UI execution runtime merge / turn_context / model_change projection 下沉到 owner，并用守卫禁止回流 utils facade。
14. P1-5 第九刀已给 execution runtime projection owner 补直接单测。
15. P1-5 第十刀已给 Turn context UI projection owner 补直接单测。
16. P1-5 第十一刀已给 Runtime lifecycle UI projection owner 补直接单测。
17. P1-5 第十二刀已把 Runtime lifecycle 分发表收进 owner，`agentUiEventProjection.ts` 只委托 lifecycle owner。
18. P1-5 第十三刀已把 Conversation 分发表收进 owner，`agentUiEventProjection.ts` 只委托 conversation owner。
19. P1-5 第十四刀已把 Diagnostic 分发表收进 owner，`agentUiEventProjection.ts` 只委托 diagnostic owner。
20. P1-5 第十五刀已把 Queue 分发表收进 owner，`agentUiEventProjection.ts` 只委托 queue owner。
21. P1-5 第十六刀已把 Routing 分发表收进 owner，`agentUiEventProjection.ts` 只委托 routing owner。
22. P1-5 第十七刀已把 Action 分发表收进 owner，`agentUiEventProjection.ts` 只委托 action owner。
23. P1-5 第十八刀已把 Artifact 分发表收进 owner，`agentUiEventProjection.ts` 只委托 artifact owner。
24. P1-5 第十九刀已把 Tool 分发表收进 owner，`agentUiEventProjection.ts` 只委托 tool owner。
25. P1-5 第二十刀已把 Subagent 分发表收进 owner，`agentUiEventProjection.ts` 只委托 subagent owner。
26. P1-5 第二十一刀已把 ThreadItem 分发表参数收进 owner，`agentUiEventProjection.ts` 只委托 thread item owner。
27. P1-5 第二十二刀已补 `agentUiProjectionBoundary.test.ts`，防止 `agentUiEventProjection.ts` 回流单个 adapter、直接组装事件或拆 `event.item`。
28. P1-6 第一刀已让前端 `evidence/export` projection 对 session/thread/evidencePack 关键字段 fail-closed，并补 `agentRuntimeExportBoundary.test.ts` 防止生产路径回流 `agent_runtime_export_*`。
29. P1-6 第二刀已让 handoff / replay / analysis / review 派生导出对返回 `sessionId` 与 harness session 根路径 fail-closed，并补治理守卫防止 correlation helper 被绕过；`exportClient.test.ts`、`agentRuntimeExportBoundary.test.ts`、renderer typecheck 与 `diff --check` 已通过。下一刀回到 requestTelemetry 真实关联负向测试；若 Rust 热区仍未释放，则继续只读审计或选择非 Rust 热区切片。
30. P1-6 第三刀只读审计确认 requestTelemetry 生产读取已按 session/turn 过滤，空日志输出 `missing` / 0 计数且未发现 `unlinked`。
31. P1-6 第三刀测试补强已新增 `request_telemetry.rs`，用同 session/其它 turn 与其它 session/同 turn 的干扰日志证明当前 session/turn evidence pack 不混入无关 request log；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_request_telemetry_ignores_unmatched_session_and_turn_logs -- --nocapture` 通过。
32. P1-7 第一刀已把 Provider / Model current owner、Codex `ModelInfo` 原点、opencode 多模型 / 多模态参照和能力字段缺口沉淀到 `provider-model-capability-audit.md`。
33. P1-7 第二刀已把前端 model capability summary 收敛到 `src/lib/model/inferModelCapabilities.ts`，避免 UI 继续散落拼能力字段。
34. P1-7 第三刀已给 `lime-agent` provider configuration 补 route protocol projection guard，固定非 OpenAI family protocol 不会被猜成 current runtime adapter。
35. P1-7 第四刀已由并行进程补 `CanonicalModel::capability_summary()`，让 Rust canonical model 与前端 summary 字段对齐。
36. P1-7 第五刀已统一 Prompt Cache 口径：普通 `anthropic-compatible` 默认 explicit-only，显式 Provider 声明或官方 compatible host catalog 才 automatic。
37. P1-7 第六刀已补 `modelProviderCapabilityBoundary.test.ts`，固定 TS / Rust capability summary 字段合同并禁止生产代码绕过 owner 直接读取 bundled canonical model JSON。
38. P1-7 第七刀已补 `modelCapabilitySendGate.ts`，把 typed send part 到 selected model `input_modalities` gap 判定收敛成非热区纯函数 owner。
39. P1-7 第八刀已让 `model.effective` reasoning policy 消费 route `CapabilitySnapshot`，旧 provider/model 字符串推断只作为无 snapshot fallback；App Server `model_capability` 与 `model_effective_event` 定向测试已通过。
40. P1-7 第九刀已把 multi-modal send gate 接进 `prepareAgentStreamUserInputSend`：有 selected model summary 或媒体输入时写入 `harness.model_input_capability_gate`，但尚未在 GUI 层 fail-closed。
41. P1-7 第十刀已把 multi-modal send gate 接进最终 submit op：媒体输入会通过 current model registry 解析 selected model summary，`buildUserInputSubmitOp` 在 runtime submit payload 构造前 fail-closed；blocked / unknown media gap 不调用 `runtime.submitOp`，也不先写入 managed objective；相关 4 组 Vitest、renderer typecheck 与 `diff --check` 已通过。
42. P1-7 第十一刀已补 `modelCapabilityProjectionBoundary.test.ts`，固定 `ModelCapabilitySummary` / `getModelCapabilitySummary` 只输出 execution 字段，并禁止 picker/catalog 字段进入前端 execution summary；本刀不替代后续协议 / Rust route projection 拆分。
43. P1-7 第十二刀已补 RuntimeCore `capability_snapshot_ignores_picker_and_catalog_metadata` 负向测试，证明 route capability snapshot 只消费 execution 字段，不从 picker/catalog 元数据推断能力或 provenance；本刀未修改 App Server runtime backend 热区。
44. P1-7 第十三刀已扩展 `modelCapabilityProjectionBoundary.test.ts` 并补 RuntimeCore `resolved_route_does_not_project_picker_dtos_as_execution_facts`，固定 `CapabilityRequirement` / `CapabilitySnapshot` 字段集合、`ModelTaskRequest` 不引用 picker DTO，以及 `resolved_route_from_task` 不把 `ProviderInfo` / `ModelInfo` 写进 execution route。
45. P1-7 第十四刀已把 gate metadata merge 收敛到 `modelCapabilitySendGate.ts`，并让 submit 阶段按 registry 解析的 final summary 覆盖 prepare 阶段 unknown evidence；视觉模型图片输入的 submit metadata 会记录 `allowed`，blocked / unknown 媒体输入继续 fail-closed。
46. P1-7 第十五刀已从 `ResolvedModelRoute` 协议删除 `provider/model` picker DTO 字段，同步 schema fixture 与 generated TS，并让治理守卫固定 route 字段集合，防止 picker DTO 回流 execution route。
47. P1-7 第十六刀已让发送 wrapper 基于当前 picker selection 注入 `SendMessageOptions.modelCapabilitySummary`，并补单测覆盖普通发送、显式 summary 不覆盖和 provider/model override 选择。
48. P1-7 第十七刀已把 `RouteDefaults` 字段集合纳入 `modelCapabilityProjectionBoundary.test.ts`，固定 route defaults 只承接 execution policy 字段，不承接 picker/catalog 元数据。
49. P1-7 第十八刀已新增 `modelInputSendPolicy.ts`，把 gate result 统一投影成 GUI 可消费的 `enabled / warning / blocked` 策略。
50. P1-7 第十九刀已把 Inputbar warning / disabled 接线收敛到 `ModelInputSendPolicy`：Notice 通过 `evaluateModelInputCapability -> buildModelInputSendPolicy` 产出策略，Composer 只消费 `shouldDisableComposer` 禁用和拦截发送；定向 Vitest、ESLint、renderer typecheck 与 `diff --check` 已通过。
51. P1-7 第二十刀已跑通 `npm run verify:gui-smoke`，Electron smoke 证明 renderer loaded、app-server ready、claw workbench shell ready、memory settings ready；后续已转入 execution 字段 owner。
52. P1-7 第二十一刀已新增 `modelExecutionPolicy.ts` 纯 owner 和单测，固定 `tool_mode`、search tool 类型、image detail original 的归一和 fail-closed 口径；定向 Vitest、projection guard Vitest、ESLint 与 scoped whitespace scan 通过，renderer typecheck 被无关 app-server-client plugin export 协议漂移阻塞。
53. P1-7 第二十二刀已新增 `modelExecutionPolicyBoundary.test.ts`，防止 execution policy owner 回流 registry、capability summary、bridge、UI 或 picker/catalog 字段；定向 Vitest、ESLint 与 scoped whitespace scan 通过。
54. P1-7 第二十三刀已把 registry metadata 接到 execution policy owner：`EnhancedModelMetadata.execution_policy` 由 `toSnakeModelInfo -> buildModelExecutionPolicy(model)` 归一，缺字段 fail-closed；`modelExecutionPolicyBoundary.test.ts` 固定 registry 只能通过 owner 暴露归一结果。定向 Vitest、治理 Vitest、ESLint 与 scoped `git diff --check` 通过；renderer typecheck 被并行未跟踪 `src/lib/api/oemCloudPluginPublish.ts:402` 的 `Uint8Array` fetch body 类型阻塞。
55. P1-7 第二十四刀已新增 `codexModelExecutionPolicyOrigin.test.ts`，把 `modelExecutionPolicy` 的 tool/search/image-detail 字段直接锚到 Codex `openai_models.rs` 的 `ToolMode`、`WebSearchToolType` 和 `ModelInfo` 字段；同时把 reasoning levels、visibility、service tiers、parallel tool calls、context、auto compact、input modalities 标成独立 owner 缺口，避免后续顺手混入当前 policy owner。定向 Vitest 已通过。
56. P1-7 第二十五刀已新增 `modelExecutionPolicyProtocolBoundary.test.ts`，把 execution policy 的真实协议接线固定成 Rust `ModelInfo` / schema bundle / generated TS 成组同步，防止并行热区只接一侧；registry 仍只能通过 `buildModelExecutionPolicy(model)` 暴露归一 projection。定向治理 Vitest、相关 owner Vitest、ESLint 与 scoped whitespace scan 已通过。
57. P1-7 第二十六刀已新增 `modelContextPolicy.ts` 与 `codexModelContextPolicyOrigin.test.ts`，把 context window、effective context percent 与 auto compact token limit 从 execution policy 中拆成独立 owner；定向 Vitest、ESLint 与 scoped `git diff --check` 已通过。
58. P1-7 第二十七刀已新增 `modelPickerPolicy.ts` 与 `codexModelPickerPolicyOrigin.test.ts`，把 visibility、service tiers、default service tier 从 capability summary / execution policy 中拆成独立 picker policy owner；定向 Vitest、ESLint 与 scoped `git diff --check` 已通过。
59. P1-7 第二十八刀已扩展 `modelExecutionPolicyProtocolBoundary.test.ts`，把 context / auto compact / picker 字段纳入协议 rollout completeness guard；定向治理 Vitest、Codex context/picker owner Vitest、ESLint 与 scoped whitespace scan 已通过。
60. P1-7 第二十九刀已新增 `modelToolCallPolicy.ts`、`modelToolCallPolicyBoundary.test.ts` 与 `codexModelToolCallPolicyOrigin.test.ts`，把 `supports_parallel_tool_calls -> parallel_tool_calls` 从 generic tools/runtime features 中拆成独立 owner。
61. P1-7 第三十刀前置已新增 `modelPickerPolicyBoundary.test.ts`，并把 `supports_parallel_tool_calls` 纳入 `modelExecutionPolicyProtocolBoundary.test.ts` 协议 rollout completeness guard。
62. P1-7 第三十刀已新增 `modelReasoningPolicy.ts`、`modelReasoningPolicyBoundary.test.ts` 与 `codexModelReasoningPolicyOrigin.test.ts`，把 Codex reasoning effort 字段、request gate 和 model switch clamp 从旧 `ModelReasoningEffortLevel` / capability summary 心智中拆成独立 owner；本轮补充把 reasoning 字段纳入协议 rollout completeness guard。
63. P1-7 第三十一刀已新增 `modelInputModalityPolicy.ts`、`modelInputModalityPolicyBoundary.test.ts`、`codexModelInputModalityPolicyOrigin.test.ts` 与 `opencodeModelInputModalityReference.test.ts`，把 Codex `input_modalities` 默认 / prompt history 图片过滤和 opencode 多模态词表拆成独立 owner。
64. P1-7 第三十二刀已新增 `modelReasoningOutputPolicy.ts`、`modelReasoningOutputPolicyBoundary.test.ts` 与 `codexModelReasoningOutputPolicyOrigin.test.ts`，把 Codex `default_reasoning_summary`、`support_verbosity`、`default_verbosity` 的 request 语义拆成独立 owner，并把协议 rollout guard 扩展到 reasoning-output 字段。
65. P1-7 第三十三刀前置已把 `input_modalities` 纳入 `modelExecutionPolicyProtocolBoundary.test.ts` 协议 rollout completeness guard；热区仍未释放，真实协议 / generated / registry 接线顺延。
66. P1-7 第三十四刀前置已新增 `modelResponsesPolicy.ts`、`modelResponsesPolicyBoundary.test.ts` 与 `codexModelResponsesPolicyOrigin.test.ts`，把 Codex `use_responses_lite` 的 Responses Lite request mode、payload shape、reasoning context、parallel tool calls gate 与 header requirement 拆成独立 owner；真实协议 / generated / registry 接线顺延为第三十六刀。
67. P1-7 第三十四刀补充已把 `ModelCapabilitySummary` 的 policy 回流路径封住，避免后续真实字段进入协议后被 summary 层重新吸收。
68. P1-7 第三十四刀二次补充已把 `use_responses_lite/useResponsesLite` 纳入 `modelExecutionPolicyProtocolBoundary.test.ts` 协议 rollout guard，并把 `responses_policy` / `use_responses_lite` 纳入 `modelCapabilityProjectionBoundary.test.ts` summary 回流禁入集合；真实协议 / generated / registry 接线仍顺延为第三十六刀。
69. P1-7 第三十五刀前置已新增 `modelTruncationPolicy.ts`、`modelTruncationPolicyBoundary.test.ts` 与 `codexModelTruncationPolicyOrigin.test.ts`，把 Codex `truncation_policy` 的 `bytes/tokens` 截断策略、默认 `10000 bytes` fallback、models-manager override 与 `ToolCall.truncation_policy` 链路拆成独立 owner；真实协议 / generated / registry 接线顺延为第三十六刀。
70. P1-7 第三十五刀补充已把 `truncation_policy/truncationPolicy` 纳入 `modelExecutionPolicyProtocolBoundary.test.ts` 协议 rollout guard，并把 `truncation_policy` 纳入 `modelCapabilityProjectionBoundary.test.ts` summary 回流禁入集合；真实协议 / generated / registry 接线仍顺延为第三十六刀。

71. P1-7 第三十六刀协作锁已追加：当前协议 / generated / registry / model policy 热区仍由并行进程持有，本进程只写计划与审计文档，不夹写代码热区；第三十六刀执行合约固定为 `ModelInfo -> schema bundle -> generated TS -> registry projection -> policy owner -> runtime/request gate`，且 native tool 字段只归 `modelNativeToolPolicy`，不恢复较窄 `modelToolSurfacePolicy`。
72. P1-7 第三十七刀已完成 submit request policy metadata owner：`resolveModelRegistryEntryForSelection` 返回真实 `EnhancedModelMetadata`，`modelRequestPolicyMetadata.ts` 负责把 selected registry model 的各 policy projection 合并为 `request_metadata.harness.model_request_policy`，`agentStreamSubmitExecution.ts` 在最终 submit 阶段同一次 registry 读取中合并 request policy metadata 与 media final gate metadata；`modelContextPolicy.ts` / `modelTruncationPolicy.ts` 补最小类型窄化以通过 `npm run typecheck`。验证：5 个定向 Vitest 文件 / 28 条用例、相关 ESLint、`npm run typecheck`、scoped `git diff --check` 与 `npm run smoke:agent-runtime-current-fixture` 均通过。
73. P1-8 第三刀已新增 `upstream-checkpoint.md`，记录 Codex `main@db887d03e1f907467e33271572dffb73bceecd6b` 与 opencode `dev@17166b271fb9d7bf7128f0e63732dde0c10dd963` 为后续 diff 起点；Codex `max` reasoning effort 判为 `adopt-now` 且前端 owner 已覆盖，opencode Gemini audio/video media lowering 判为多模态 `adapt-for-desktop`，opencode tool strict 按非 allowlist `reject-for-lime`。
74. P1-8 第四刀已复核 Codex / opencode checkpoint worktree clean，并把第三十八刀 Rust consumer 需要的 Codex source anchor 固定到 `quality-fixture-matrix.md`；本刀仍不接管 `lime-rs/crates/agent/**`、App Server runtime / RuntimeCore 或 contract 脚本热区。
75. P1-8 第五刀已新增 `completion-audit.md`，逐条审计 PRD / roadmap 完成条件：P0 文档基线已完成，P1 工程对齐仍缺 P1-7 第三十八刀 Rust consumer 和 contract 全局绿灯，P2/P3 还没有足够强证据，因此整体目标不能标记完成。
76. P1-8 第六刀已完成第三十八刀只读 handoff audit：Lime 当前 `runtime_backend/request_context/turn_context.rs` 已把 `host_request.metadata` 和 `runtime_options.metadata` 投影到 `AgentTurnContext.metadata`；前端实际发出的 `model_request_policy` 字段包括 `responses_policy`、`tool_call_policy`、`truncation_policy`、`native_tool_policy` 等；第三十八刀源码接管应优先新增 `lime-agent` typed owner / accessor，并让 App Server adapter 只负责传递 metadata，不在 `runtime_backend.rs` 或 request loop 里散落 JSON pointer。
77. P1-8 第七刀已补第三十八刀接管窗口和验证门槛：当前 scoped status 仍显示 agent / App Server runtime / RuntimeCore / frontend model-governance / contract script 为并行脏热区；未获明确接管窗口前不转源码。热区释放后第一切片只允许做 `lime-agent` typed owner / accessor，第二切片接 responses_lite + parallel tool calls request shape，第三切片接 truncation + native tool surface，并在每步绑定定向 Rust 测试。
78. P1-8 第八刀已新增 `upstream-diff-2026-07-06.md`，从 Codex `db887d03e1f907467e33271572dffb73bceecd6b..be33f80bc65159c094ecd06bf155afa3061ce23d` 与 opencode `17166b271fb9d7bf7128f0e63732dde0c10dd963..be73f465df6b20e0c3091f49ab83e89c0ede3b35` 完成一次真实 range diff；Codex 保留 response metadata、plugin version、tool timing、multi-agent lifecycle、model availability 等信号，opencode 只保留多模型 / 多模态 allowlist 信号。P3 仍需证明后续周期性循环。
79. P2 第一刀已新增 `p2-runtime-skeleton.md`，把下一阶段深层能力从 `queued` 空状态推进到 `skeleton-ready`：Tool / Approval / Sandbox、Context / Token / Compaction、Plugin / Skills / MCP、Realtime / Media / Collaboration 都有 current owner、第一代码切片、禁止路径和最小验证。该骨架不等于 P2 工程完成，后续仍需代码和测试证据。
80. P2 第二刀已同步 `completion-audit.md`、`quality-fixture-matrix.md` 与 `fast-alignment-roadmap.md`：当前口径统一为 P2 `skeleton-ready`，质量矩阵新增 P2 骨架验证表；本刀不接管源码热区，下一次开代码仍优先 P1-7 第三十八刀 Rust consumer。
81. P1-7 第三十八刀第一切片已完成代码骨架：新增 `lime-rs/crates/agent/src/model_request_policy.rs` typed owner，`lib.rs` re-export，支持 runtime_options / direct metadata、snake_case / camelCase alias 解析；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture` 通过，6 tests passed。下一刀应接实际 consumer，而不是继续扩 parser。
82. P1-7 第三十八刀第二切片已接入 live process bytes truncation consumer：`live_execution_process.rs` 从 typed owner 读取 `truncation_policy.mode=bytes`，并把 `limit` 传给 `ExecutionProcessDrainOutputParams.max_bytes`；`tokens` 暂保持 current 默认，等待 token-aware formatter。验证：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture` 通过，4 tests passed；`live_execution_process.rs` 到 `819` 行，后续继续扩展时优先下沉 tests 或 metadata helper。
83. P1-7 第三十八刀第三切片已接入 live process native shell gate：`native_tool_policy.shell_tool_enabled=false` 时，`RuntimeLiveExecutionProcessHook` 不再接管 Bash / PowerShell shell native tool。`git diff --check` 对相关 Rust 文件通过；复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture` 失败于并行 Cargo 锁冲突，`live_execution_process.rs` 已到 `864` 行，后续必须优先拆 helper / test owner，不再继续堆主逻辑。
84. P1-7 第三十八刀第四切片只读审计已确认 responses/tool-call transport skeleton：隔壁写集已新增 `model_provider::provider_stream::RuntimeReplyModelRequestPolicy`，`request_tool_policy/aster_reply_adapter.rs` 从 `AgentTurnContext` 读取 typed policy 并放入 `RuntimeReplyStreamRequest`，`credential_bridge/runtime_provider_adapter.rs` 接收该 request；`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider stream_request_carries_model_request_policy -- --nocapture` 通过。注意：当前 `CompatAsterReplyProviderBackend` 仍忽略 `stream_request.model_request_policy`，未生成真实 Responses Lite header / input prefix / tool location / `parallel_tool_calls` provider payload，因此该切片只能标 `transport-skeleton-verified`，不是 request consumer 完成。

## 7. 第三十六刀协作锁：ModelInfo 真字段接线

记录时间：2026-07-05 23:47 CST。

### 7.1 当前状态

第三十六刀暂不落代码，原因是 scoped status 显示以下热区仍有并行脏改动：

- `lime-rs/crates/app-server-protocol/**`
- `packages/app-server-client/**`
- `src/lib/api/modelRegistry.ts`
- `src/lib/api/modelRegistry.test.ts`
- `src/lib/types/modelRegistry.ts`
- `src/lib/types/modelRegistry.d.ts`
- `src/lib/model/inferModelCapabilities.ts`
- `src/lib/model/inferModelCapabilities.test.ts`
- `src/lib/model/*Policy*`
- `src/lib/governance/*Model*Policy*.test.ts`
- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/governance/appServerRuntimeBoundary.test*.ts`
- `src/lib/governance/asterMigrationBoundary.test.ts`

本进程本轮只认领：

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/provider-model-capability-audit.md`

### 7.2 第三十六刀字段分层

| Codex `ModelInfo` 字段 | Lime owner | 接线要求 |
| --- | --- | --- |
| `tool_mode` / `supports_search_tool` / `web_search_tool_type` / `supports_image_detail_original` | `buildModelExecutionPolicy(model)` | 只进 `execution_policy`，不得回流 `ModelCapabilitySummary` |
| `context_window` / `max_context_window` / `auto_compact_token_limit` / `effective_context_window_percent` | `buildModelContextPolicy(model)` | 只进 `context_policy`，context 预算不从 picker/catalog 推断 |
| `visibility` / `service_tiers` / `default_service_tier` | `buildModelPickerPolicy(model)` | 只进 picker policy，服务层不消费 UI picker DTO |
| `supports_parallel_tool_calls` | `buildModelToolCallPolicy(model)` | 只决定 request `parallel_tool_calls` gate，不从 generic tools 推断 |
| `default_reasoning_level` / `supported_reasoning_levels` / `supports_reasoning_summaries` | `buildModelReasoningPolicy(model)` | effort 保留开放字符串，不回到旧窄枚举 |
| `default_reasoning_summary` / `support_verbosity` / `default_verbosity` | `buildModelReasoningOutputPolicy(model)` | summary / verbosity 是输出控制，不混入 effort owner |
| `input_modalities` | `buildModelInputModalityPolicy(model)` | Codex 默认 `text/image`，opencode 只参考多模态词表 |
| `use_responses_lite` | `buildModelResponsesPolicy(model)` | 只决定 Responses Lite request shape/header，不从 provider/protocol 字符串推断 |
| `truncation_policy` | `buildModelTruncationPolicy(model)` | 工具输出截断策略，不从 context window 推断 |
| `shell_type` / `apply_patch_tool_type` / `experimental_supported_tools` | `buildModelNativeToolPolicy(model)` | native tool owner 已由并行进程建立；禁止恢复 `modelToolSurfacePolicy` 双 owner |

暂不纳入第三十六刀：

- `auto_review_model_override`：需要先读 Codex Guardian / auto review 语义，独立建 `modelReviewPolicy` 或更合适 owner，不能混入 generic capability。
- `multi_agent_version`：更接近 session / multi-agent policy，不能混入 model capability；如需推进，应先和 Lime Team runtime 主线隔离建模。

### 7.3 第三十六刀执行顺序

1. 等热区释放后，先改 App Server `ModelInfo` Rust DTO 与 schema export registry。
2. 生成 / 更新 schema bundle 与 `packages/app-server-client/src/generated/protocol-types.ts`。
3. 同步 `src/lib/types/modelRegistry.ts` / `.d.ts` 的 raw DTO 字段。
4. 在 `src/lib/api/modelRegistry.ts` 里只通过上表 owner 函数输出 registry-facing projection。
5. 扩展 `modelRegistry.test.ts`，证明 App Server 真字段进入各 policy projection。
6. 运行 `modelExecutionPolicyProtocolBoundary.test.ts`，确认 Rust DTO、schema bundle、generated TS 成组同步。
7. 如果触碰 command catalog 或 App Server method surface，再补 `npm run test:contracts`；否则以 policy / registry / schema 定向测试为最小门槛。

### 7.4 第三十六刀最小验证

推荐最小集合：

```bash
npx vitest run \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" \
  "src/lib/model/modelExecutionPolicy.test.ts" \
  "src/lib/model/modelContextPolicy.test.ts" \
  "src/lib/model/modelPickerPolicy.test.ts" \
  "src/lib/model/modelToolCallPolicy.test.ts" \
  "src/lib/model/modelReasoningPolicy.test.ts" \
  "src/lib/model/modelReasoningOutputPolicy.test.ts" \
  "src/lib/model/modelInputModalityPolicy.test.ts" \
  "src/lib/model/modelResponsesPolicy.test.ts" \
  "src/lib/model/modelTruncationPolicy.test.ts" \
  "src/lib/model/modelNativeToolPolicy.test.ts"
```

```bash
npx eslint \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model/modelExecutionPolicy.ts" \
  "src/lib/model/modelContextPolicy.ts" \
  "src/lib/model/modelPickerPolicy.ts" \
  "src/lib/model/modelToolCallPolicy.ts" \
  "src/lib/model/modelReasoningPolicy.ts" \
  "src/lib/model/modelReasoningOutputPolicy.ts" \
  "src/lib/model/modelInputModalityPolicy.ts" \
  "src/lib/model/modelResponsesPolicy.ts" \
  "src/lib/model/modelTruncationPolicy.ts" \
  "src/lib/model/modelNativeToolPolicy.ts" \
  --max-warnings 0
```

协议热区改动完成后再补：

```bash
npm run test:contracts
git diff --check -- \
  "lime-rs/crates/app-server-protocol" \
  "packages/app-server-client" \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model" \
  "src/lib/governance"
```

已完成前置条件：[naming-alignment.md](./naming-alignment.md)、[thread-turn-item-invariant.md](./thread-turn-item-invariant.md)。

## 8. 第三十六刀只读验证：当前代码热区仍由并行进程持有

记录时间：2026-07-06 00:14 CST。

### 8.1 协作状态

本轮 scoped status 仍显示第三十六刀代码热区存在大量并行脏改动，因此本进程不夹写代码热区，只做只读审计、定向验证和计划标注。

避让写集：

- `lime-rs/crates/app-server-protocol/**`
- `packages/app-server-client/**`
- `src/lib/api/modelRegistry.ts`
- `src/lib/api/modelRegistry.test.ts`
- `src/lib/types/modelRegistry.ts`
- `src/lib/types/modelRegistry.d.ts`
- `src/lib/model/**`
- `src/lib/governance/**`

本轮认领写集：

- `internal/research/refactor/v1/priority-tracking-plan.md`

### 8.2 只读审计结论

当前并行改动已经开始把第三十六刀真实字段接到代码层：

- App Server `ModelInfo` 已新增 Codex 式字段：execution、context、picker、tool-call、reasoning、reasoning-output、input modality、responses、truncation、native tool。
- `src/lib/api/modelRegistry.ts` 已通过各 policy owner 投影 `execution_policy / context_policy / picker_policy / tool_call_policy / reasoning_policy / reasoning_output_policy / input_modality_policy / responses_policy / truncation_policy / native_tool_policy`。
- `src/lib/types/modelRegistry.ts` 已把 registry-facing policy projection 加到 `EnhancedModelMetadata`。
- `inferModelCapabilities.ts` 已新增 `ModelCapabilitySummary`，但当前 summary 字段仍保持 execution summary，不承接 `*_policy` projection。

### 8.3 定向验证结果

已执行：

```bash
npx vitest run \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" \
  "src/lib/model/modelExecutionPolicy.test.ts" \
  "src/lib/model/modelContextPolicy.test.ts" \
  "src/lib/model/modelPickerPolicy.test.ts" \
  "src/lib/model/modelToolCallPolicy.test.ts" \
  "src/lib/model/modelReasoningPolicy.test.ts" \
  "src/lib/model/modelReasoningOutputPolicy.test.ts" \
  "src/lib/model/modelInputModalityPolicy.test.ts" \
  "src/lib/model/modelResponsesPolicy.test.ts" \
  "src/lib/model/modelTruncationPolicy.test.ts" \
  "src/lib/model/modelNativeToolPolicy.test.ts"
```

结果：`13` 个文件通过，`modelExecutionPolicyProtocolBoundary.test.ts` 里 `registry projection 继续只通过 policy owner 暴露协议字段` 失败 1 个断言。

失败不是 policy 接线缺失，而是 guard 对 `truncation_policy` 的格式要求过窄：

- 当前生产代码语义正确：`truncation_policy` 通过 `buildModelTruncationPolicy(model as ModelTruncationPolicyInput)` 暴露。
- 失败点在 guard 的 `toContain("truncation_policy: buildModelTruncationPolicy(")` 只接受同一行调用；当前代码把参数换行，导致误报。

已追加执行：

```bash
npx eslint \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model/modelExecutionPolicy.ts" \
  "src/lib/model/modelContextPolicy.ts" \
  "src/lib/model/modelPickerPolicy.ts" \
  "src/lib/model/modelToolCallPolicy.ts" \
  "src/lib/model/modelReasoningPolicy.ts" \
  "src/lib/model/modelReasoningOutputPolicy.ts" \
  "src/lib/model/modelInputModalityPolicy.ts" \
  "src/lib/model/modelResponsesPolicy.ts" \
  "src/lib/model/modelTruncationPolicy.ts" \
  "src/lib/model/modelNativeToolPolicy.ts" \
  --max-warnings 0
```

结果：通过。

已追加执行：

```bash
npm run test:contracts
```

结果：未通过。

- `check:protocol-types` 通过，`packages/app-server-client/src/generated/protocol-types.ts` 无漂移。
- 随后的 `scripts/check-app-server-client-contract.mjs` 失败，失败点不在第三十六刀 `ModelInfo` 字段，而是两个外部 contract anchor：
  - `Agent tool orchestrator owns planned tool execution events` 缺少 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`。
  - `Request tool policy delegates WebSearch preflight execution to current tool orchestrator` 缺少 `web_search_preflight_uses_turn_context_for_permission_check`。

该失败属于并行热区外的 agent/tool contract 缺口，本轮不接管；第三十六刀当前仍以 `modelExecutionPolicyProtocolBoundary.test.ts` 的 `truncation_policy` guard 误报为最小阻塞。

已追加执行：

```bash
git diff --check -- \
  "lime-rs/crates/app-server-protocol" \
  "packages/app-server-client" \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model" \
  "src/lib/governance"
```

结果：通过。

### 8.4 建议给持有热区进程的最小补丁

若继续由持有 `src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts` 的进程修复，建议只改 guard，不改 production code：

- 将 `toContain("truncation_policy: buildModelTruncationPolicy(")` 改为跨行正则，例如 `toMatch(/\btruncation_policy\b\s*:\s*buildModelTruncationPolicy\s*\(/u)`。
- 同时保留已有 `not.toMatch(/\btruncation_policy\b\s*:\s*\{/u)`，继续禁止手写 object projection。

修复后优先重跑：

```bash
npx vitest run \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/model/modelTruncationPolicy.test.ts"
```

随后再跑第 `7.4` 节完整最小集合。

### 8.5 auto_review_model_override 只读审计结论

已只读 Codex：

- `codex-rs/protocol/src/openai_models.rs`
- `codex-rs/model-provider/src/provider.rs`
- `codex-rs/protocol/src/config_types.rs`
- `codex-rs/core/src/guardian/review.rs`
- `codex-rs/core/src/guardian/tests.rs`

结论已写入 [provider-model-capability-audit.md](./provider-model-capability-audit.md)：`auto_review_model_override` 虽然位于 Codex `ModelInfo`，但消费点是 Guardian approval review model selector；它覆盖自动审批评审子会话的 review model，不改变普通 turn 的工具、模态、reasoning、Responses Lite、truncation 或 native tool 行为。因此它不进入第三十六刀 capability rollout，后续若要对齐，应单独建 `modelReviewPolicy` / approval review policy owner。

### 8.6 multi_agent_version 只读审计结论

已只读 Codex：

- `codex-rs/protocol/src/openai_models.rs`
- `codex-rs/protocol/src/protocol.rs`
- `codex-rs/core/src/session/mod.rs`
- `codex-rs/core/src/session/turn_context.rs`
- `codex-rs/core/src/session/multi_agents.rs`
- `codex-rs/core/src/tools/spec_plan.rs`

结论已写入 [provider-model-capability-audit.md](./provider-model-capability-audit.md)：`multi_agent_version` 虽然位于 Codex `ModelInfo`，但真正 owner 是 session / turn multi-agent runtime surface。Codex 会在 session 未锁定时用 model default 选择 `Disabled / V1 / V2`，随后由 TurnContext、multi-agent usage hint、effective mode、spawn depth 和 spec-plan/collab tool surface 消费。因此它不进入第三十六刀 generic capability rollout，后续若要对齐，应单独挂到 Lime Team runtime / session runtime policy。

### 8.7 第三十六刀 guard 修复与验证

记录时间：2026-07-06 00:25 CST。

本轮接手的唯一代码写集：

- `src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`

修复内容：

- 将 `truncation_policy` registry projection 的正向守卫从同一行 `toContain("truncation_policy: buildModelTruncationPolicy(")` 改成跨行正则 `toMatch(/\btruncation_policy\b\s*:\s*buildModelTruncationPolicy\s*\(/u)`。
- 保留 `not.toMatch(/\btruncation_policy\b\s*:\s*\{/u)` 与原有负向 guard，继续禁止手写 object projection。

已执行并通过：

```bash
npx vitest run \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/model/modelTruncationPolicy.test.ts"
```

结果：`3` files / `18` tests 通过。

已执行第三十六刀完整最小集合并通过：

```bash
npx vitest run \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" \
  "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" \
  "src/lib/model/modelExecutionPolicy.test.ts" \
  "src/lib/model/modelContextPolicy.test.ts" \
  "src/lib/model/modelPickerPolicy.test.ts" \
  "src/lib/model/modelToolCallPolicy.test.ts" \
  "src/lib/model/modelReasoningPolicy.test.ts" \
  "src/lib/model/modelReasoningOutputPolicy.test.ts" \
  "src/lib/model/modelInputModalityPolicy.test.ts" \
  "src/lib/model/modelResponsesPolicy.test.ts" \
  "src/lib/model/modelTruncationPolicy.test.ts" \
  "src/lib/model/modelNativeToolPolicy.test.ts"
```

结果：`14` files / `74` tests 通过。

已执行并通过：

```bash
npx eslint \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/api/modelRegistry.test.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model/modelExecutionPolicy.ts" \
  "src/lib/model/modelContextPolicy.ts" \
  "src/lib/model/modelPickerPolicy.ts" \
  "src/lib/model/modelToolCallPolicy.ts" \
  "src/lib/model/modelReasoningPolicy.ts" \
  "src/lib/model/modelReasoningOutputPolicy.ts" \
  "src/lib/model/modelInputModalityPolicy.ts" \
  "src/lib/model/modelResponsesPolicy.ts" \
  "src/lib/model/modelTruncationPolicy.ts" \
  "src/lib/model/modelNativeToolPolicy.ts" \
  --max-warnings 0
```

已执行并通过：

```bash
git diff --check -- \
  "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" \
  "lime-rs/crates/app-server-protocol" \
  "packages/app-server-client" \
  "src/lib/api/modelRegistry.ts" \
  "src/lib/types/modelRegistry.ts" \
  "src/lib/model" \
  "src/lib/governance"
```

历史记录，已由后续 contract-green 与第十六刀 combo evidence 覆盖。本节记录时 `npm run test:contracts` 尚未通过，阻塞点不属于第三十六刀 ModelInfo / registry / policy 接线：

- `check:protocol-types` 通过，generated TS 无漂移。
- `scripts/check-app-server-client-contract.mjs` 失败在 agent/tool refactor 热区：
  - `Agent tool orchestrator owns planned tool execution events` 仍期待 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`。
  - `Request tool policy delegates WebSearch preflight execution to current tool orchestrator` 仍期待测试名 `web_search_preflight_uses_turn_context_for_permission_check`。

这些相关文件当前本身已有并行脏改动：`scripts/check-app-server-client-contract.mjs`、`lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`。本轮不接管 agent/tool 热区。

## 9. 第三十六刀完成记录：ModelInfo policy 真字段接线

记录时间：2026-07-06 00:25 CST。

### 9.1 本轮认领写集

- `lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs`
- `lime-rs/crates/app-server-protocol/schema/json/app_server_protocol.schemas.json`
- `lime-rs/crates/app-server-protocol/schema/json/v0/ModelInfo.json`
- `lime-rs/crates/app-server-protocol/schema/json/v0/ModelListResponse.json`
- `lime-rs/crates/app-server-protocol/schema/json/v0/ModelProviderFetchModelsResponse.json`
- `packages/app-server-client/src/generated/protocol-types.ts`
- `src/lib/api/modelRegistry.ts`
- `src/lib/api/modelRegistry.test.ts`
- `src/lib/types/modelRegistry.ts`
- `src/lib/types/modelRegistry.d.ts`
- `src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/provider-model-capability-audit.md`

### 9.2 完成内容

- App Server `ModelInfo` 已新增 Codex policy 原字段：`tool_mode`、`supports_search_tool`、`web_search_tool_type`、`supports_image_detail_original`、`context_window`、`max_context_window`、`auto_compact_token_limit`、`effective_context_window_percent`、`visibility`、`service_tiers`、`default_service_tier`、`supports_parallel_tool_calls`、`default_reasoning_level`、`supported_reasoning_levels`、`supports_reasoning_summaries`、`default_reasoning_summary`、`support_verbosity`、`default_verbosity`、`use_responses_lite`、`truncation_policy`、`shell_type`、`apply_patch_tool_type`、`experimental_supported_tools`。
- Schema fixture 与 generated TS 已刷新，`packages/app-server-client/src/generated/protocol-types.ts::ModelInfo` 已出现对应 camelCase 字段。
- `src/lib/api/modelRegistry.ts::toSnakeModelInfo` 已把 App Server `ModelInfo` 投影到 `execution_policy / context_policy / picker_policy / tool_call_policy / reasoning_policy / reasoning_output_policy / input_modality_policy / responses_policy / truncation_policy / native_tool_policy`，且只通过各 policy owner builder 接线。
- `EnhancedModelMetadata` 与 `.d.ts` 镜像已新增上述 registry-facing policy projection。
- `modelRegistry.test.ts` 已覆盖一次 App Server `model/list` 返回的 Codex policy 字段流入全部 projection。
- `modelExecutionPolicyProtocolBoundary.test.ts` 已修正 `truncation_policy` guard 的 builder projection 误报：继续禁止手写 object projection，但允许 `buildModelTruncationPolicy(model)`。

### 9.3 避让写集

- `lime-rs/crates/app-server-protocol/src/protocol/v0/catalog.rs`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/client_request.rs`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/plugins.rs`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/schema_types.rs`
- `lime-rs/crates/app-server-protocol/src/protocol/v0/tests/catalog.rs`
- `lime-rs/crates/app-server-protocol/src/schema_export/registry.rs`
- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/governance/appServerRuntimeBoundary.test.ts`
- `src/lib/governance/appServerRuntimeBoundary.testSupport.ts`
- `src/lib/governance/asterMigrationBoundary.test.ts`
- `src/lib/model/inferModelCapabilities.ts`
- `src/lib/model/inferModelCapabilities.test.ts`
- `src/lib/model/providerPromptCacheSupport.test.ts`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`

这些文件仍属于并行热区或既有 dirty worktree；本轮只读确认，不接管语义。

### 9.4 验证结果

已通过：

```bash
npm run check:protocol-types
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture
npx vitest run "src/lib/api/modelRegistry.test.ts" "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" "src/lib/governance/modelNativeToolPolicyProtocolBoundary.test.ts" "src/lib/governance/modelCapabilityProjectionBoundary.test.ts" "src/lib/model/modelExecutionPolicy.test.ts" "src/lib/model/modelContextPolicy.test.ts" "src/lib/model/modelPickerPolicy.test.ts" "src/lib/model/modelToolCallPolicy.test.ts" "src/lib/model/modelReasoningPolicy.test.ts" "src/lib/model/modelReasoningOutputPolicy.test.ts" "src/lib/model/modelInputModalityPolicy.test.ts" "src/lib/model/modelResponsesPolicy.test.ts" "src/lib/model/modelTruncationPolicy.test.ts" "src/lib/model/modelNativeToolPolicy.test.ts"
npx eslint "src/lib/api/modelRegistry.ts" "src/lib/api/modelRegistry.test.ts" "src/lib/types/modelRegistry.ts" "src/lib/types/modelRegistry.d.ts" "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts" --max-warnings 0 --no-warn-ignored
git diff --check -- "lime-rs/crates/app-server-protocol/src/protocol/v0/model.rs" "lime-rs/crates/app-server-protocol/schema/json" "packages/app-server-client/src/generated/protocol-types.ts" "src/lib/api/modelRegistry.ts" "src/lib/api/modelRegistry.test.ts" "src/lib/types/modelRegistry.ts" "src/lib/types/modelRegistry.d.ts" "src/lib/governance/modelExecutionPolicyProtocolBoundary.test.ts"
```

`npx vitest` 结果：14 files / 74 tests passed。

已执行但未通过：

```bash
npm run test:contracts
```

结果：`check:protocol-types` 子步骤通过；`scripts/check-app-server-client-contract.mjs` 在隔壁 agent 持有的 Rust agent/tool 热区失败：

- 缺少 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`
- `request_tool_policy` 缺少 `web_search_preflight_uses_turn_context_for_permission_check`

该失败不属于第三十六刀 `ModelInfo` / registry projection 写集；下一刀应由持有 `lime-rs/crates/agent/**` 的进程收口，或在合并窗口单独接管 agent tool orchestrator / WebSearch preflight contract。

## 10. 第三十七刀完成记录：submit metadata 接入 request policy

记录时间：2026-07-06 00:38 CST。

### 10.1 本轮认领写集

- `src/lib/model/modelCapabilitySendGate.ts`
- `src/lib/model/modelCapabilitySendGate.test.ts`
- `src/lib/model/modelRequestPolicyMetadata.ts`
- `src/lib/model/modelRequestPolicyMetadata.test.ts`
- `src/lib/model/modelContextPolicy.ts`
- `src/lib/model/modelTruncationPolicy.ts`
- `src/components/agent/chat/hooks/agentStreamSubmitExecution.ts`
- `src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/provider-model-capability-audit.md`

### 10.2 完成内容

- `modelCapabilitySendGate.ts` 修正 `resolveModelRegistryEntryForSelection(...)`，让 selected registry model 解析返回真实 `EnhancedModelMetadata`，避免 policy 被 `ModelCapabilitySummary` 吞掉。
- 新增 `modelRequestPolicyMetadata.ts`，把 selected `EnhancedModelMetadata` 的 `execution_policy / context_policy / tool_call_policy / reasoning_policy / reasoning_output_policy / input_modality_policy / responses_policy / truncation_policy / native_tool_policy` 投影到 `request_metadata.harness.model_request_policy`；没有 registry-facing policy 时不写空 metadata；不包含 picker policy。
- `executeAgentStreamSubmit(...)` 在最终 submit lifecycle 中只读一次 `modelRegistryApi.getModelRegistry()`，同时解析媒体输入 final gate summary 与 `model_request_policy`；构造 `submitOp` 时已带入 policy metadata，且 `submitOp` 构造仍发生在 managed objective 写入之前，blocked / unknown 媒体输入继续 fail-closed，不会提前写 objective。
- `agentStreamSubmitExecution.test.ts` 覆盖图片模型 submit 时 final gate 覆盖 prepare 阶段 unknown evidence，并断言 `responses_policy / tool_call_policy / truncation_policy / native_tool_policy` 进入最终 `submitOp.metadata.harness.model_request_policy`。
- `modelContextPolicy.ts` / `modelTruncationPolicy.ts` 补最小 `unknown -> number` 类型窄化，保持策略语义不变，只修 `npm run typecheck`。

Codex 对标口径：Codex 把 `use_responses_lite`、`truncation_policy`、`supports_parallel_tool_calls`、`shell_type / apply_patch_tool_type` 作为 `ModelInfo` request / tool runtime policy，由 core client、tool router 和 tool call context 在请求时消费。Lime 本刀只补 frontend -> App Server submit metadata 入口，不在前端复刻执行 loop，也不碰隔壁持有的 `lime-rs/crates/agent/**` runtime consumer。

### 10.3 避让写集

- `lime-rs/crates/agent/**`
- `lime-rs/crates/app-server-protocol/**`
- `packages/app-server-client/src/generated/protocol-types.ts`
- `src/lib/api/modelRegistry.ts`
- `src/lib/types/modelRegistry.ts`
- `src/lib/types/modelRegistry.d.ts`
- `src/lib/governance/**`
- App Server runtime / read model / projection 热区

`npm run test:contracts` 的 `check:protocol-types` 会检查并触碰已脏的 generated protocol 文件；该文件本轮不认领、不回滚，仍归并行协议 / plugin local package / ModelInfo 接线热区。

### 10.4 验证结果

已通过：

```bash
npx vitest run "src/lib/model/modelRequestPolicyMetadata.test.ts" "src/lib/model/modelCapabilitySendGate.test.ts" "src/lib/model/modelContextPolicy.test.ts" "src/lib/model/modelTruncationPolicy.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts"
npx eslint "src/lib/model/modelCapabilitySendGate.ts" "src/lib/model/modelCapabilitySendGate.test.ts" "src/lib/model/modelRequestPolicyMetadata.ts" "src/lib/model/modelRequestPolicyMetadata.test.ts" "src/lib/model/modelContextPolicy.ts" "src/lib/model/modelTruncationPolicy.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts" --max-warnings 0
npm run typecheck
git diff --check -- "src/lib/model/modelCapabilitySendGate.ts" "src/lib/model/modelCapabilitySendGate.test.ts" "src/lib/model/modelRequestPolicyMetadata.ts" "src/lib/model/modelRequestPolicyMetadata.test.ts" "src/lib/model/modelContextPolicy.ts" "src/lib/model/modelTruncationPolicy.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts"
npm run smoke:agent-runtime-current-fixture
```

`npx vitest` 结果：5 files / 28 tests passed；ESLint、`npm run typecheck`、scoped `git diff --check` 与 `smoke:agent-runtime-current-fixture` 均通过；fixture summary 显示 `liveProviderUsed=false`。

已执行但未通过：

```bash
npm run test:contracts
```

结果：`check:protocol-types` 子步骤通过且生成文件无漂移；`scripts/check-app-server-client-contract.mjs` 仍在隔壁 agent/tool 热区失败：

- 缺少 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`
- `request_tool_policy` 缺少 `web_search_preflight_uses_turn_context_for_permission_check`

该失败不属于第三十七刀前端 submit metadata 写集。本轮不接管 `lime-rs/crates/agent/**`，下一刀应在热区释放后把 `model_request_policy` 接入 Rust execution consumer，或由当前持有 agent/tool 热区的进程继续收口。

## 11. P1-8 第六刀只读记录：第三十八刀 Rust consumer handoff audit

记录时间：2026-07-06 01:30 CST。

### 11.1 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`

### 11.2 避让写集

scoped status 仍显示以下区域存在并行脏改或未跟踪文件，本轮只读不夹写：

- `lime-rs/crates/agent/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `scripts/check-app-server-client-contract.mjs`

### 11.3 只读结论

第三十八刀不应继续扩前端 DTO，也不应在 App Server 顶层 runtime loop 里新增一组散落的 `serde_json::Value` pointer。

当前 Lime runtime 入口事实：

- `src/lib/model/modelRequestPolicyMetadata.ts` 已把 selected registry model 的 policy 写成 `request_metadata.harness.model_request_policy`。
- `lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs` 已把 `host_request.metadata` 写入 `AgentTurnContext.metadata["aster_chat_request"]`，并把 `runtime_options.metadata` / request metadata 写入 `AgentTurnContext.metadata["runtime_options"]`。
- `lime-rs/crates/agent/src/turn_context_configuration.rs` 是 App Server 投影进入 `lime-agent` typed turn context façade 的当前边界。
- `agent_protocol::turn_context::TurnContextOverride` 目前只有通用 `metadata: HashMap<String, Value>`；因此第一刀可先在 `lime-agent` 新增 typed accessor，而不是改 App Server 顶层 loop。

Codex 对标结论：

- Codex `ModelInfo` 的 `use_responses_lite`、`supports_parallel_tool_calls`、`truncation_policy`、`shell_type`、`apply_patch_tool_type`、`input_modalities` 是 request / tool runtime consumer 字段，不是展示字段。
- Codex `turn.rs` 在构造 prompt 时按 `model_info.input_modalities` 过滤 history，并把 `supports_parallel_tool_calls` 写入 prompt。
- Codex `responses_lite.rs` 证明 lite 模式会改变 header、instructions/tools payload location、reasoning context 和 compact request 的 `parallel_tool_calls=false`。
- Codex `tool_config.rs` 证明 native shell surface 由 model info + feature/platform gate 共同决定。
- Codex `tool_call.rs` 证明 tool call context 持有 `truncation_policy`。

### 11.4 第三十八刀推荐最小源码切片

热区释放后，优先接管这一组最小切片：

1. `lime-rs/crates/agent/src/model_request_policy.rs`
   - 新增 typed `ModelRequestPolicySnapshot`，只解析 `request_metadata.harness.model_request_policy` 与兼容 camelCase aliases。
   - 覆盖 `responses_policy`、`tool_call_policy`、`truncation_policy`、`native_tool_policy`，其余 `reasoning/context/input_modality` 可以同文件定义但分后续 consumer 接入。
   - 提供 `model_request_policy_from_turn_context(context: Option<&AgentTurnContext>)` 和 `model_request_policy_from_metadata(value: &Value)`，让 consumer 只拿 typed struct。
2. `lime-rs/crates/agent/src/turn_context_configuration.rs`
   - 只负责 re-export / accessor 接线，不在 App Server 层解析策略。
3. `lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs`
   - 若需要，只把 `model_request_policy` 按原样保留在 metadata 投影中；禁止在这里展开 policy 业务语义。
4. `lime-rs/crates/agent/src/request_tool_policy/**` 或 Aster reply adapter 边界
   - 消费 `responses_policy` + `tool_call_policy`，先补 request-shape / prompt gate 测试；如果底层 Aster 尚无完整 Responses Lite hook，本刀应 fail-closed 或输出明确 unsupported，不伪造已生效。
5. `lime-rs/crates/agent/src/agent_tools/**`
   - 消费 `truncation_policy` 和 `native_tool_policy`：tool output formatter / shell output formatter 按 typed truncation policy 选择预算；native tool inventory 根据 `preferred_shell_surface`、`apply_patch_tool_enabled` 和 runtime feature/platform gate 裁剪 surface。

### 11.5 最小验证

热区释放并落代码后，最低验证顺序：

```bash
cargo fmt --all --manifest-path "lime-rs/Cargo.toml"
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools -- --nocapture
npm run smoke:agent-runtime-current-fixture
npm run test:contracts
```

如果 `npm run test:contracts` 仍失败，必须证明失败不在第三十八刀写集；整体完成前仍建议要求 contract 通过。

## 12. P1-8 第八刀记录：Codex / opencode upstream range diff

记录时间：2026-07-06。

### 12.1 本轮认领写集

- `internal/research/refactor/v1/upstream-diff-2026-07-06.md`
- `internal/research/refactor/v1/README.md`
- `internal/research/refactor/v1/upstream-checkpoint.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/completion-audit.md`

### 12.2 避让写集

本刀继续避让所有源码热区：

- `lime-rs/crates/agent/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `src/components/agent/chat/hooks/**`
- `scripts/check-app-server-client-contract.mjs`

Codex / opencode 外部仓库只读，不 checkout、不 merge、不写文件。

### 12.3 Diff 结论

- Codex range：`db887d03e1f907467e33271572dffb73bceecd6b..be33f80bc65159c094ecd06bf155afa3061ce23d`，`15` 个非 merge commit。
- opencode range：`17166b271fb9d7bf7128f0e63732dde0c10dd963..be73f465df6b20e0c3091f49ab83e89c0ede3b35`，`328` 个非 merge commit。
- Codex high-value 信号：response metadata buffering、remote plugin version、multi-agent hint / lifecycle、direct tool-call timing、WebSocket metadata boundary、Bedrock availability metadata、TTFT telemetry。
- opencode allowlist 信号：advertised model endpoint、request precedence、model defaults / compatibility、response reducer、reasoning terminal、Responses stateless id、media MIME / attachment MIME、provider reasoning transforms。
- opencode Session / Tool runtime / UI / Effect 变化继续按 `reject-for-lime` 处理。

### 12.4 后续

1. P1-7 第三十八刀仍优先于继续扩文档：热区释放后接 `lime-agent` typed owner 和四个高风险 request/tool consumer。
2. 下一次 upstream diff 建议从 Codex `be33f80bc65159c094ecd06bf155afa3061ce23d` 与 opencode `be73f465df6b20e0c3091f49ab83e89c0ede3b35` 起算。
3. P3 已证明一次真实 diff，但整体完成前仍需证明周期性循环或脚本化方案；若脚本化，必须先走 `scripts/` 冻结边界评估。

## 13. P1-8 第七刀补充记录：第三十八刀接管窗口与验证门槛

记录时间：2026-07-06。

### 13.1 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`

### 13.2 避让写集

scoped status 仍显示以下区域存在并行脏改或未跟踪文件，本轮继续只读避让：

- `lime-rs/crates/agent/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `scripts/check-app-server-client-contract.mjs`

### 13.3 Codex 复核结论

只读复核 Codex request/tool 消费点后，第三十八刀仍应按 consumer 行为接线，而不是把 policy 当展示 metadata：

- `openai_models.rs` 定义 `use_responses_lite`、`supports_parallel_tool_calls`、`truncation_policy`、`shell_type`、`apply_patch_tool_type`、`experimental_supported_tools` 和 `input_modalities`。
- `responses_lite.rs` / `client_common.rs` 固定 Responses Lite 的 request builder、header、input prefix 和 tools/instructions payload location。
- `turn.rs` 固定 prompt history input modality filter 与 `parallel_tool_calls` request flag。
- `tool_config.rs` 固定 shell surface 需要 model info + feature/platform gate。
- `tool_call.rs` 固定 tool call context 持有 `truncation_policy`。

### 13.4 接管门槛

热区释放后，第三十八刀源码顺序固定为：

1. 新增 `lime-agent` typed owner / accessor，并先跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture`。
2. 接 `responses_policy` + `tool_call_policy` 到 request / prompt shape；底层不支持 Responses Lite 时必须 fail-closed 或显式 unsupported。
3. 接 `truncation_policy` + `native_tool_policy` 到 tool output formatter / native inventory gate。
4. 再跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools -- --nocapture`、`npm run smoke:agent-runtime-current-fixture`、`npm run test:contracts`。

## 14. P1-8 第九刀记录：contract readiness refresh

记录时间：2026-07-06。

### 14.1 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

### 14.2 避让写集

本刀只跑共享验证和文档记录，继续避让：

- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `scripts/check-app-server-client-contract.mjs`
- `packages/app-server-client/src/generated/protocol-types.ts`

### 14.3 验证结果

执行：

```bash
npm run test:contracts
```

结果：

- `npm run check:protocol-types` 通过；生成 `packages/app-server-client/src/generated/protocol-types.ts` 后报告无漂移。
- `scripts/check-app-server-client-contract.mjs` 失败，失败点仍是 agent/tool 热区：
  - `Agent tool orchestrator owns planned tool execution events` 缺 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs`。
  - `Request tool policy delegates WebSearch preflight execution to current tool orchestrator` 缺 `web_search_preflight_uses_turn_context_for_permission_check`。

### 14.4 结论

当时 `current` 主链仍卡在 P1-7 第三十八刀：Rust runtime/request consumer 尚未消费 `request_metadata.harness.model_request_policy`。该 contract 刷新没有发现新的 P1-7 provider/model policy 漂移，但也没有提供整体完成证据。后续第 24-27 节已陆续补齐 typed owner、request/tool consumer、tool output formatter、Aster compat formatter、contract gate 与 runtime current fixture；当前剩余缺口以顶部状态和质量矩阵为准。

## 15. P2 第一刀记录：runtime skeleton owner matrix

记录时间：2026-07-06。

### 15.1 本轮认领写集

- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/README.md`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/completion-audit.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`

### 15.2 避让写集

继续避让所有源码热区：

- `lime-rs/crates/agent/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `src/components/agent/chat/hooks/**`
- `scripts/check-app-server-client-contract.mjs`

### 15.3 骨架结论

P2 不再是空的 `queued` 队列：

- Tool / Approval / Sandbox：先落 `ToolLifecycleSnapshot`、approval action、sandbox decision typed owner。
- Context / Token / Compaction：先落 `ContextFragmentEnvelope`、budget decision、sidecar/reference owner。
- Plugin / Skills / MCP：先拆 manifest、installed state、skill metadata、MCP binding、UI projection 四层。
- Realtime / Media / Collaboration：先走 ContentPart/reference -> RuntimeEvent -> Item/read model -> Workbench projection。
- Trace / Evidence：所有 P2 决策都必须带 session/thread/turn/item 关联，不新增独立 trace store。

### 15.4 后续

P2 skeleton 不是 P2 工程完成。下一次可执行源码刀仍优先：

1. P1-7 第三十八刀 `model_request_policy` Rust consumer。
2. 如果第三十八刀热区被明确移交，先落 `lime-agent` typed owner / accessor。
3. 如果只开放 Tool 热区，则按 `p2-runtime-skeleton.md` 先落 Tool lifecycle typed owner，不先做 UI。

## 16. P1-7 第三十八刀第三切片记录：live process native shell gate

记录时间：2026-07-06。

### 16.1 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`
- `lime-rs/crates/agent/src/live_execution_process.rs`

### 16.2 避让写集

本刀继续避让：

- `lime-rs/Cargo.lock`
- `lime-rs/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `scripts/check-app-server-client-contract.mjs`

### 16.3 骨架结论

`native_tool_policy.shell_tool_enabled=false` 已进入 live shell/native process hook：

```text
AgentTurnContext.metadata.runtime_options.harness.model_request_policy
  -> model_request_policy_from_turn_context(...)
  -> native_tool_policy.shell_tool_enabled
  -> RuntimeLiveExecutionProcessHook does not claim Bash / PowerShell
```

这一步只关闭 live process shell hook，不等于完整 native tool policy 完成。后续仍需：

- `agent_tools` inventory 根据 `preferred_shell_surface`、runtime feature 和平台 gate 暴露 shell / unified exec。
- `apply_patch_tool_enabled=false` 时不暴露 patch tool。
- request/tool policy 消费 `tool_call_policy` 与 `responses_policy`。
- token-aware truncation formatter 消费 `truncation_policy.mode=tokens`。

### 16.4 验证

已通过：

```bash
git diff --check -- "internal/research/refactor/v1/priority-tracking-plan.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md" "lime-rs/crates/agent/src/live_execution_process.rs" "lime-rs/crates/agent/src/lib.rs" "lime-rs/crates/agent/src/model_request_policy.rs" "lime-rs/crates/agent/src/model_request_policy/tests.rs"
```

阻塞：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture
```

失败于 Cargo 依赖解析：`aws-sdk-sso v1.92.0` 需要 `aws-smithy-runtime ^1.9.8`，但当前锁文件选中 `aws-smithy-runtime v1.9.5`。`lime-rs/Cargo.lock`、`lime-rs/Cargo.toml` 和 `lime-rs/vendor/aster-rust/**` 是并行脏热区，本刀不接管。

### 16.5 下一刀

1. Cargo / vendor 热区释放后，立即复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture`，通过后把第三切片改为 `done`。
2. `live_execution_process.rs` 当前已到 `864` 行，后续若继续碰 live process，先拆 `request_policy` helper 或测试 owner，避免继续向单文件追加主逻辑。
3. request/tool 热区仍由隔壁认领时，本进程不抢写 `request_tool_policy/**`；释放后再接 `responses_policy` + `tool_call_policy` request shape。

## 17. P1-7 第三十八刀第四切片记录：responses/tool-call transport audit

记录时间：2026-07-06。

### 17.1 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

### 17.2 避让写集

本刀只读审计并运行定向测试，继续避让：

- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/Cargo.lock`
- `lime-rs/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`

### 17.3 审计结论

responses/tool-call 已有 transport skeleton，但不是完整 request consumer：

```text
AgentTurnContext.metadata.runtime_options.harness.model_request_policy
  -> runtime_reply_model_request_policy_from_turn_context(...)
  -> RuntimeReplyStreamRequest.model_request_policy
  -> ConfiguredReplyProvider::stream_reply_with_agent(...)
```

已确认：

- `model_request_policy.rs` 新增 `runtime_reply_model_request_policy_from_turn_context(...)`，把 responses/tool-call snapshot 投影到 `model_provider::provider_stream::RuntimeReplyModelRequestPolicy`。
- `request_tool_policy/aster_reply_adapter.rs` 构造 `RuntimeReplyStreamRequest` 并挂上 `model_request_policy`。
- `model-provider/src/provider_stream.rs` 定义 current transport contract 和 `stream_request_carries_model_request_policy` 测试。
- `runtime_reply_tool_call_policy(...)` 在 Responses Lite 不允许 parallel tool calls 时会收窄 `parallel_tool_calls=false`。

仍未完成：

- `credential_bridge/runtime_provider_adapter.rs` 当前只 debug log `RuntimeReplyStreamRequest` 的 provider / message 信息，`CompatAsterReplyProviderBackend` 仍忽略 `stream_request.model_request_policy`。
- 还没有 provider backend request-shape fixture 证明 Responses Lite header、tools/instructions input prefix、reasoning context 和 `parallel_tool_calls` 已进入真实 provider payload。

### 17.4 验证

已通过：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider stream_request_carries_model_request_policy -- --nocapture
```

结果：`1 passed`。

未完成验证：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
```

本轮单独执行时等待 artifact directory 文件锁超过 90 秒，已中断，未作为失败证据；前一轮 `lime-agent live_execution` 仍已知受 Cargo lock / AWS 依赖冲突阻塞。

### 17.5 下一刀

热区释放后，下一刀不要再扩 transport DTO；应直接落 provider backend consumer：

1. 在 current provider request builder 或受控 compat backend 中消费 `RuntimeReplyStreamRequest.model_request_policy`。
2. 补 request-shape fixture：Responses Lite 模式 header present、instructions/tools 进入 input prefix、top-level fields 不回流；standard 模式保持不变。
3. 补 parallel tool calls fixture：模型支持且 responses gate 允许时为 true；Responses Lite gate 禁用时为 false。
4. 若仍走 Aster compat backend，需要明确这是 `compat` 内部实现，current fact source 仍是 `RuntimeReplyStreamRequest` + `model_request_policy` typed owner。

## 18. P1-7 第三十八刀第四切片补充：provider backend handoff

记录时间：2026-07-06。

### 18.1 Codex 对标结论

Codex request path 的关键口径：

- `turn.rs` 构造 `Prompt.parallel_tool_calls = turn_context.model_info.supports_parallel_tool_calls`。
- `client.rs` 构造 Responses request 时使用 `prompt.parallel_tool_calls && !model_info.use_responses_lite`。
- Responses Lite 时 reasoning context 写为 `all_turns`，instructions / tools 移入 input prefix，并需要 `x-openai-internal-codex-responses-lite: true` header。

Lime 当前已完成同源 transport 投影，不声称 Aster compat backend 已完整实现 Responses Lite wire protocol。

### 18.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- 源码写集由隔壁持有并只读审计：`lime-rs/crates/model-provider/src/provider_stream.rs`
- 源码写集由隔壁持有并只读审计：`lime-rs/crates/agent/src/model_request_policy.rs`
- 源码写集由隔壁持有并只读审计：`lime-rs/crates/agent/src/model_request_policy/tests.rs`
- 源码写集由隔壁持有并只读审计：`lime-rs/crates/agent/src/lib.rs`
- 源码写集由隔壁持有并只读审计：`lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`

### 18.3 避让写集

- `lime-rs/Cargo.lock`
- `lime-rs/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `packages/app-server-client/src/generated/protocol-types.ts`
- `scripts/check-app-server-client-contract.mjs`

### 18.4 Transport / handoff 结论

`request_metadata.harness.model_request_policy` 现在进入 provider stream transport shape：

```text
AgentTurnContext.metadata.runtime_options.harness.model_request_policy
  -> runtime_reply_model_request_policy_from_turn_context(...)
  -> RuntimeReplyStreamRequest.model_request_policy
  -> ConfiguredReplyProvider::stream_reply_with_agent(...)
```

DTO 当前覆盖 responses/tool-call backend consumer 需要的字段：

- `responses.use_responses_lite`
- `responses.request_mode`
- `responses.instructions_location`
- `responses.tools_location`
- `responses.reasoning_context`
- `responses.parallel_tool_calls_allowed`
- `responses.requires_responses_lite_header`
- `tool_call.supports_parallel_tool_calls`
- `tool_call.parallel_tool_calls`

Responses Lite 会在投影层强制 `tool_call.parallel_tool_calls=false`，降低后续 provider request builder 忘记 Codex `!use_responses_lite` gate 的风险。下一步仍必须由 provider backend 消费该 DTO，生成真实 header / input prefix / wire payload。

### 18.5 验证

已通过：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider stream_request_carries_model_request_policy -- --nocapture
```

结果：`1 passed`。

阻塞：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
```

本轮单独执行时等待 artifact directory 文件锁超过 90 秒，已中断。前一轮 `lime-agent live_execution` 仍已知受 Cargo lock / AWS 依赖冲突阻塞；`Cargo.lock`、workspace Cargo 配置和 vendored `aster-rust` 属于并行脏热区，本刀不接管。

### 18.6 下一刀

1. Cargo / vendor 热区释放后，先复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture`。
2. 若 request/provider backend 热区释放，下一刀把 `RuntimeReplyModelRequestPolicy` 继续下沉到真实 Responses request builder：Lite header、instructions/tools input prefix、reasoning context 和 `parallel_tool_calls` wire 字段。
3. native tool 完整消费仍需等 `agent_tools/**` 热区移交后处理 inventory / apply_patch gate。

## 19. P1-7 第三十八刀第五切片记录：Responses Lite compat fail-closed

记录时间：2026-07-06。

本节覆盖前面第 18 节 handoff 中“等待 artifact lock / provider backend 未消费”的旧状态：本轮已重新跑通 `lime-agent model_request_policy` 和 `model-provider provider_stream` 定向测试，并新增 Aster compat fail-closed。

### 19.1 Codex 对标结论

Codex Responses Lite 的关键 request shape 是强约束，不是展示 metadata：

- Lite 请求需要 `x-openai-internal-codex-responses-lite: true` header。
- Lite 请求 reasoning context 使用 `all_turns`。
- Lite 请求禁用 `parallel_tool_calls`。

Lime 目前仍以 `RuntimeReplyStreamRequest` + `model_request_policy` typed owner 作为 current fact source；Aster provider 是 `compat` backend，不能在未写真实 wire 字段时假装支持 Lite。

### 19.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`

### 19.3 避让写集

- `lime-rs/Cargo.lock`
- `lime-rs/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/runtime-core/**`
- `src/lib/model/**`
- `src/lib/governance/**`
- `packages/app-server-client/src/generated/protocol-types.ts`
- `scripts/check-app-server-client-contract.mjs`

### 19.4 实现结论

新增 current request wire-shape 投影：

```text
RuntimeReplyStreamRequest.model_request_policy
  -> RuntimeReplyStreamRequest::provider_request_wire_shape()
  -> RuntimeReplyProviderRequestWireShape {
       use_responses_lite,
       reasoning_context,
       parallel_tool_calls,
       headers: [x-openai-internal-codex-responses-lite: true]
     }
```

Aster compat adapter 在 provider 调用前执行 fail-closed：

- 当 wire shape 需要 Responses Lite header 或 `reasoning_context=all_turns` 时，非 `RuntimeProviderBackend::Current` 直接返回 `ReplyAttemptError`。
- 这避免 `agent.reply_with_provider(...)` 继续走 Aster provider trait 时吞掉 Lite header / reasoning context。
- standard Responses request 仍会携带 `parallel_tool_calls` shape evidence，不触发 Lite fail-closed。

### 19.5 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent -p model-provider
git diff --check -- "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs"
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream -- --nocapture
```

结果：`lime-agent model_request_policy` 7 tests passed；`model-provider provider_stream` 5 tests passed。测试过程中仅出现隔壁热区既有 unused import / dead code warnings，本轮未夹写这些文件。

### 19.6 下一刀

1. provider / vendor 热区释放后，把 `RuntimeReplyProviderRequestWireShape` 写入 Aster OpenAI Responses request builder 或替换为 current provider builder。
2. 补 request fixture：Lite header present、reasoning context all_turns、`parallel_tool_calls=false`；standard mode 保持无 Lite header。
3. 补完真实 wire 后，再把 Aster compat fail-closed 改成只保护未支持 provider，不允许回退成 silent ignore。

## 20. P1-7 第三十八刀第六切片记录：OpenAI Responses wire consumer

记录时间：2026-07-06。

本节覆盖第 19 节“provider / vendor 热区释放后”的真实 consumer 缺口：Aster OpenAI provider 已优先消费 Lime adapter 注入的 `provider_request_wire_shape`，完整 `model_request_policy` 只作为 fallback。

### 20.1 Codex 对标结论

对标 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/client.rs`：

- Codex `build_responses_request(...)` 在 Responses Lite 模式把 tools 作为 `AdditionalTools` 插入 input prefix，base instructions 作为 developer message 紧随其后。
- Codex Lite 模式把 reasoning context 设为 `all_turns`。
- Codex request 侧使用 `prompt.parallel_tool_calls && !model_info.use_responses_lite`，Lite 模式必须禁用 `parallel_tool_calls`。
- Codex 发送请求时写入 `x-openai-internal-codex-responses-lite: true` header。

Lime 本轮保持 current fact source 为 `RuntimeReplyStreamRequest` + `RuntimeReplyProviderRequestWireShape`；Aster 仍归类为 `compat` provider backend，只做受控 consumer，不重新成为策略事实源。

### 20.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/mod.rs`

### 20.3 避让写集

本轮未触碰以下并行脏区：

- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_queue.rs`
- `lime-rs/crates/agent/src/runtime_support.rs`
- `scripts/lib/content-factory-production-*.mjs`
- `scripts/lib/plugin-content-factory-signed-release-gate-*.mjs`
- `scripts/plugin/content-factory-production-*.mjs`
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 20.4 实现链路

当前 request shape 链路：

```text
RuntimeReplyStreamRequest.model_request_policy
  -> RuntimeReplyStreamRequest::provider_request_wire_shape()
  -> AgentSessionConfig.turn_context.metadata.provider_request_wire_shape
  -> aster::providers::openai_request_policy::resolve_responses_request_policy_from_turn_context()
  -> ResponsesRequestOptions.request_policy
  -> create_responses_request(...)
  -> post_responses(...) / streaming request header
```

实现要点：

- `provider_request_wire_shape` 作为 Aster OpenAI provider 的优先输入，直接映射 `use_responses_lite`、`reasoning_context`、`parallel_tool_calls` 和 Lite header。
- 完整 `runtime_options.harness.model_request_policy` 仍保留为 fallback，避免尚未注入 provider wire shape 的旧路径直接失效。
- OpenAI Responses Lite payload 已对齐 Codex：top-level `tools` 不回流；tools / instructions 进入 input prefix；`reasoning.context=all_turns`；`parallel_tool_calls=false`。
- OpenAI Responses `post_responses(...)` 和 streaming path 均按 `ResponsesRequestOptions.request_policy.requires_responses_lite_header` 写 Lite header。
- 为避免继续向巨型 `openai.rs` 追加解析逻辑，新增 `openai_request_policy.rs` 小模块；`openai.rs` 从 `1057` 行降到 `934` 行，新模块 `324` 行。

### 20.5 分类

- `current`：`RuntimeReplyStreamRequest`、`RuntimeReplyProviderRequestWireShape`、`AgentSessionConfig.turn_context.metadata.provider_request_wire_shape`。
- `compat`：Aster OpenAI provider consumer、`ResponsesRequestOptions.request_policy`、Aster Responses request builder。
- `deprecated / dead`：本轮没有新增或恢复 legacy `agent_runtime_*` / `lime-rs/src/**` 路径。

### 20.6 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent -p model-provider
cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core openai_request_policy -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core openai_responses -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core test_resolve_responses_request_context_includes_model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream -- --nocapture
git diff --check -- "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/mod.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs"
git diff --no-index --check -- /dev/null "lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs"
```

结果：

- `aster-core openai_request_policy`：2 tests passed。
- `aster-core openai_responses`：15 tests passed。
- `aster-core test_resolve_responses_request_context_includes_model_request_policy`：1 test passed。
- `lime-agent model_request_policy`：7 tests passed。
- `model-provider provider_stream`：5 tests passed。

协作备注：

- 首次 `lime-agent model_request_policy` 等待 `lime-rs/target` artifact lock，释放后暴露 `start_aster_reply_stream(...)` 参数 `mut` 位置错误；已修复并复跑通过。
- `lime-agent` 测试仍提示隔壁热区既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写该文件。
- vendor `aster-core` 不在主 `lime-rs` workspace members 中；本轮用 `/tmp/lime-aster-policy-target` 避免写入 vendor 子目录 target，也避免争抢并行进程持有的 `lime-rs/target` 锁。

### 20.7 下一刀

1. 回到 P1-7 Provider / Model capability 主线，继续把 native tool / capability inventory 与 request policy 消费闭环对齐；不要再扩旧 `agent_runtime_*`。
2. 若后续引入非 Aster current provider builder，应直接消费 `RuntimeReplyProviderRequestWireShape`，不能重新解析前端 `model_request_policy`。
3. Aster compat 后续收口目标：只保留 provider wire consumer 和 vendor request builder，逐步删除完整 `model_request_policy` fallback 的必要性。

## 20. P1-7 第三十八刀第六切片记录：Aster Responses request builder 骨架

记录时间：2026-07-06。

本节覆盖第 19.6 的 provider / vendor 下一刀。本轮只认领 Aster OpenAI provider request builder 窄写集，不接管 `lime-agent`、`model-provider`、App Server runtime、RuntimeCore、前端 policy 或 contract 脚本热区。

### 20.1 本轮认领写集

- `lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/mod.rs`
- `lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

### 20.2 实现结论

```text
AgentTurnContext.metadata
  -> provider_request_wire_shape
  -> openai_request_policy::resolve_responses_request_policy_from_turn_context()
  -> ResponsesRequestOptions.request_policy
  -> create_responses_request(...)
  -> Responses API header / input prefix / reasoning context / parallel_tool_calls
```

实现边界：

- `provider_request_wire_shape` 优先于原始 `model_request_policy`，避免 provider builder 重新分散解析前端 metadata。
- 缺失 wire-shape 时兼容读取 `request_metadata.harness.model_request_policy`，只作为过渡 fail-safe。
- Responses Lite 会把 `tools` 从 top-level payload 移入 `input[0].type=additional_tools`，把 system instructions 移入 developer message prefix。
- Responses Lite 写入 `reasoning.context=all_turns`，并把 `parallel_tool_calls` 收窄为 `false`。
- `post_responses` 与 streaming Responses path 根据 request policy 添加 `x-openai-internal-codex-responses-lite: true` header。

### 20.3 已完成验证

```bash
cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -- --check
git diff --check -- "lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/mod.rs" "lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs" "internal/research/refactor/v1/priority-tracking-plan.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md"
```

结果：两项检查通过。

### 20.4 未完成验证

以下 Rust 定向测试仍等待外部 Cargo 释放；当前检测到外部进程仍在运行 `cargo test -p aster-core openai_request_policy -- --nocapture`，因此本进程不再并发启动同类测试，避免抢锁和重复重编译。

```bash
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core openai_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_create_responses_lite_request_uses_input_prefix_for_tools_and_instructions -- --nocapture
```

第六切片当前状态：`provider-builder-code-done / verification-pending`。在上述两个定向测试通过前，不把第三十八刀标记为完成。

### 20.5 下一刀

1. 外部 Cargo 释放后，先补跑第 20.4 两个 Aster 定向测试。
2. 测试通过后，把 `quality-fixture-matrix.md`、`completion-audit.md` 与本计划状态从 `verification-pending` 改为 `done for provider builder`。
3. 再继续第三十八刀剩余主缺口：native tool inventory / apply_patch gate、token-aware truncation formatter；未获 `lime-agent` / tool 热区移交前不强开 P2 Tool lifecycle 代码刀。

## 21. P1-7 第三十八刀第六切片协作合并记录：verification done

记录时间：2026-07-06。

协作说明：本文件出现两个 `## 20`，属于并行 Agent 同时追加记录造成的编号冲突。本节不改写隔壁进程的 pending 记录，只声明当前最新状态；后续整理计划文件时可统一重排编号。

最新状态：

- `provider_request_wire_shape -> Aster OpenAI Responses request_policy -> request payload/header` 链路已完成。
- 隔壁第 20.4 中等待的 Aster 定向测试已在本轮补跑通过。
- 第三十八刀 provider builder consumer 切片当前状态从 `verification-pending` 更新为 `done for provider builder`。

补跑验证：

```bash
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core openai_request_policy -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core openai_responses -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-aster-policy-target" cargo test -p aster-core test_resolve_responses_request_context_includes_model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream -- --nocapture
```

结果：

- `aster-core openai_request_policy`：2 tests passed。
- `aster-core openai_responses`：15 tests passed。
- `aster-core test_resolve_responses_request_context_includes_model_request_policy`：1 test passed。
- `lime-agent model_request_policy`：7 tests passed。
- `model-provider provider_stream`：5 tests passed。

下一刀仍按主线收益排序：

1. 继续 P1-7 Provider / Model capability 中 native tool inventory / apply_patch gate 的 current request 消费闭环。
2. 保持 `RuntimeReplyProviderRequestWireShape` 为后续 provider builder 的唯一 current 输入；Aster 只作为 compat consumer。
3. 后续整理计划文件时，把重复 `## 20` 合并或重排为单一编号，避免执行状态被 pending 旧记录误读。

## 22. P1-7 第三十八刀第七切片记录：native tool inventory gate

记录时间：2026-07-06。

### 22.1 认领写集

- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/mod.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/model_request_policy.rs`
- `lime-rs/crates/agent/src/model_request_policy/tests.rs`
- `lime-rs/crates/agent/src/runtime_support.rs`
- `lime-rs/crates/agent/src/runtime_queue.rs`
- `lime-rs/crates/agent/src/subagent_control.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/vendor/aster-rust/**`
- App Server runtime / RuntimeCore / frontend model-governance / scripts 热区

### 22.2 实现结论

```text
request_metadata.harness.model_request_policy.native_tool_policy
  -> NativeToolPolicyGate
  -> catalog inventory filter
  -> registry inventory filter
  -> runtime inventory filter
```

行为边界：

- `shell_tool_enabled=false` 或 shell surface 不是 `shell_command` 时，inventory 不暴露 `Bash` / `PowerShell`。
- `apply_patch_tool_enabled=false` 或缺少 `apply_patch_tool_type=freeform` 时，inventory 不暴露 `apply_patch`。
- 没有 `native_tool_policy` 时保持当前默认 inventory 行为。
- 本刀只做 inventory projection gate，不接管真实工具注册、tool orchestrator 执行前 fail-closed、App Server runtime 或 Desktop Host 权限桥。

### 22.3 已完成验证

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs" "lime-rs/crates/agent/src/agent_tools/mod.rs" "lime-rs/crates/agent/src/agent_tools/inventory.rs"
git diff --check -- "lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs" "lime-rs/crates/agent/src/agent_tools/mod.rs" "lime-rs/crates/agent/src/agent_tools/inventory.rs" "internal/research/refactor/v1/priority-tracking-plan.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md"
```

结果：两项通过。

### 22.4 未完成验证

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool -- --nocapture
```

结果：未通过，原因不在本刀写集。

- `lime-rs/crates/agent/src/runtime_support.rs` 仍有 4 个 lifetime 错误，阻塞 `lime-agent` lib 编译。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent -- --check` 还会提示并行脏文件 `lime-rs/crates/agent/src/model_request_policy.rs` 的两处 rustfmt 差异。
- 本进程未夹写上述文件，待持有方收口后再复跑 `lime-agent native_tool`。

第七切片当前状态：`code-done / verification-blocked`。

### 22.5 下一刀

1. 等 `runtime_support.rs` 和 `model_request_policy.rs` 热区释放或持有方收口后，复跑 `cargo fmt --check -p lime-agent` 与 `cargo test -p lime-agent native_tool`。
2. 测试通过后，把本切片状态更新为 `done for native inventory gate`。
3. 继续 P1-7 剩余最高收益项：token-aware truncation formatter，或者在 tool orchestrator 热区移交后补执行前 native tool fail-closed。

## 23. P1-7 第三十八刀第七切片协作合并记录：native tool policy consumer done

记录时间：2026-07-06。

协作说明：本节不重排第 22 节编号，也不改写隔壁进程留下的 `verification-blocked` 记录；只追加当前最新状态。第七切片已从单纯 inventory gate 扩到完整 consumer 闭环：model policy helper、inventory projection、Aster provider-visible tool scope、live execution fail-closed 均已验证。

### 23.1 Codex 对标

Codex 对照点：

- `codex-rs/tools/src/tool_config.rs::shell_type_for_model_and_features(...)`：先把 `ModelInfo.shell_type`、feature flag 和平台能力归一成具体 shell surface。
- `codex-rs/core/src/tools/spec_plan.rs::add_shell_tools(...)`：`UnifiedExec` 可见时注册 `exec_command/write_stdin`，旧 `shell_command` 只保留 hidden dispatch；`ShellCommand` 可见时才暴露旧 shell surface。
- `codex-rs/core/src/tools/spec_plan.rs` 的 `apply_patch` 加入条件：只有 `model_info.apply_patch_tool_type.is_some()` 时才对模型可见。

Lime 本轮对齐为：`request_metadata.harness.model_request_policy.native_tool_policy` 先归一成 `ModelNativeToolPolicySnapshot`，再统一由 `native_tool_policy_disallowed_tool_names(...)` 裁剪 `Bash` / `PowerShell` / `apply_patch`。当前 Lime 还没有 Codex unified-exec 等价 provider-visible executor，因此 `preferred_shell_surface=unified_exec` 时先 fail-closed 隐藏旧 shell command surface，而不是让模型继续使用旧 Bash。

### 23.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `lime-rs/crates/agent/src/model_request_policy.rs`
- `lime-rs/crates/agent/src/model_request_policy/tests.rs`
- `lime-rs/crates/agent/src/lib.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/mod.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/crates/agent/src/live_execution_process.rs`

避让写集：

- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_queue.rs`
- `lime-rs/crates/agent/src/runtime_support.rs`
- `lime-rs/crates/agent/src/subagent_control.rs`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/vendor/aster-rust/**`
- `scripts/lib/content-factory-production-*.mjs`
- `scripts/lib/plugin-content-factory-signed-release-gate-*.mjs`
- `scripts/plugin/content-factory-production-*.mjs`
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 23.3 实现链路

```text
request_metadata.harness.model_request_policy.native_tool_policy
  -> ModelNativeToolPolicySnapshot
  -> native_tool_policy_disallowed_tool_names(...)
  -> NativeToolPolicyGate / Agent tool inventory
  -> AgentSessionConfig.turn_context.metadata.tool_scope.disallowed_tools
  -> Aster prepare_tools_and_prompt(...) provider-visible tool filter
  -> RuntimeLiveExecutionProcessHook fail-closed execution guard
```

实现要点：

- `native_tool_policy_disallowed_tool_names(...)` 成为 `Bash` / `PowerShell` / `apply_patch` 裁剪的 current helper。
- `NativeToolPolicyGate` 不再复制 shell/apply_patch 判定，改为消费共享 helper，覆盖 catalog / registry / runtime inventory。
- Aster compat adapter 在转成 Aster session config 前合并 `tool_scope.disallowed_tools`，复用 Aster 既有 `filter_tools_for_turn_scope(...)`，不在 provider 侧再造一套策略解析。
- live execution hook 同样消费共享 helper；即使模型或旧路径绕过可见性，`unified_exec` 模型也不能继续执行旧 `Bash` / `PowerShell` surface。

### 23.4 分类

- `current`：`ModelNativeToolPolicySnapshot`、`native_tool_policy_disallowed_tool_names(...)`、Agent tool inventory gate、live execution fail-closed guard。
- `compat`：Aster `turn_context.metadata.tool_scope.disallowed_tools` consumer；它只承接 provider-visible tool 过滤，不成为模型能力事实源。
- `deprecated / dead`：本轮没有恢复或新增 legacy `agent_runtime_*`、`lime-rs/src/**`、旧 Tauri command wrapper。

### 23.5 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent test_build_tool_inventory_gates_native_shell_and_apply_patch_by_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent hook_rejects_legacy_shell_when_model_prefers_unified_exec -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool -- --nocapture
```

结果：

- `lime-agent native_tool_policy`：6 tests passed。
- `test_build_tool_inventory_gates_native_shell_and_apply_patch_by_request_policy`：1 test passed。
- `hook_rejects_legacy_shell_when_model_prefers_unified_exec`：1 test passed。
- `lime-agent model_request_policy`：8 tests passed。
- `lime-agent native_tool`：11 tests passed。

备注：`lime-agent` 测试仍提示既有 `agent_tools/execution/tests.rs` unused import warning，本轮未夹写该文件。

第七切片当前状态：`done for native tool policy consumer`。

### 23.6 下一刀

1. 回到 P1-7 剩余最高收益缺口：token-aware truncation formatter，把模型侧 token truncation policy 从 metadata 走到真实 tool output formatting。
2. 如果继续做 tool surface，应优先设计 Codex-style `unified_exec` current executor；在它落地前，`unified_exec` 模型继续 fail-closed 隐藏旧 `Bash` / `PowerShell`。
3. Aster compat 只保留 consumer 职责；后续 current provider builder 应直接消费 `RuntimeReplyProviderRequestWireShape` / policy snapshot，不重新解析前端 metadata。

## 24. P1-7 第三十八刀第八切片记录：token-aware truncation formatter

记录时间：2026-07-06。

本节不重排前面并行产生的重复编号，只追加当前进展。第三十八刀第八切片已把 `request_metadata.harness.model_request_policy.truncation_policy.mode=tokens` 从 metadata owner 推到 live native tool 最终输出 formatter；该切片属于 P1-7 Provider / Model capability request/tool consumer 闭环。

### 24.1 Codex 对标

Codex 对照点：

- `codex-rs/tools/src/tool_call.rs::ToolCall.truncation_policy`：tool call context 持有 request-time truncation policy。
- `codex-rs/core/src/tools/mod.rs::format_exec_output_str(...)`：exec output 回传模型前统一调用 `formatted_truncate_text(...)`。
- `codex-rs/utils/output-truncation/src/lib.rs::formatted_truncate_text(...)`：截断输出使用统一 warning header：`Warning: truncated output (original token count: ...)` 与 `Total output lines: ...`。
- `codex-rs/utils/string/src/truncate.rs::truncate_middle_chars(...)` / `truncate_middle_with_token_budget(...)`：bytes / tokens 是 policy 维度，不由 caller 手写散落逻辑。

Lime 对齐口径：

- `ModelTruncationPolicySnapshot` 仍是 request metadata typed owner。
- `ToolOutputTruncationPolicy` 是 live tool output formatter 的 current consumer policy，集中在 `tool_output_truncation.rs`，避免继续向 900 行以上的 `live_execution_process.rs` 堆 formatter 细节。
- bytes policy 继续用于 App Server live process drain 的 `max_bytes`；tokens policy 不压低 drain 安全上限，而是在最终 `CallToolResult` 文本进入模型前 token-aware 截断。

### 24.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `lime-rs/crates/agent/src/tool_output_truncation.rs`
- `lime-rs/crates/agent/src/lib.rs`
- `lime-rs/crates/agent/src/live_execution_process.rs`

避让写集：

- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_queue.rs`
- `lime-rs/crates/agent/src/runtime_support.rs`
- `lime-rs/crates/agent/src/subagent_control.rs`
- `lime-rs/crates/agent/src/subagent_runtime_adapter.rs`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/vendor/aster-rust/**`
- `scripts/**` 内容工厂 / signed release gate 热区
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 24.3 实现链路

```text
request_metadata.harness.model_request_policy.truncation_policy
  -> ModelTruncationPolicySnapshot
  -> ToolOutputTruncationPolicy
  -> RuntimeLiveExecutionProcessHook prepared policy
  -> ExecutionProcessDrainOutputParams.max_bytes for bytes mode
  -> final CallToolResult Content::text formatter for bytes/tokens mode
```

实现要点：

- 新增 `tool_output_truncation.rs`，统一解析 turn context policy、计算 live drain bytes budget、格式化最终工具输出。
- token mode 通过 `tool_runtime::tool_io::estimate_tool_io_tokens(...)` 计算 token budget，超限时保留前后文并输出 Codex-style warning header。
- bytes mode 保持 UTF-8 边界安全，提示语使用 Codex 同款 `chars truncated`，避免把 byte budget 截断成非法字符串。
- `live_execution_process.rs` 只保留 policy 接线和调用点，formatter 细节下沉到独立模块。

### 24.4 分类

- `current`：`ToolOutputTruncationPolicy`、`format_tool_output_for_model(...)`、live execution final `CallToolResult` formatter。
- `current`：bytes mode 的 process drain `max_bytes`，仍作为 live output memory / transport 安全边界。
- `compat`：Aster native tool hook 仍是当前 agent runtime 的兼容承载层；本切片只消费 policy，不把 Aster 作为 policy owner。
- `deprecated / dead`：没有恢复 legacy `agent_runtime_*`、`lime-rs/src/**`、旧 Tauri command wrapper，也没有新增 mock fallback。

### 24.5 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_output_truncation -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool -- --nocapture
```

结果：

- `lime-agent tool_output_truncation`：4 tests passed。
- `lime-agent live_execution`：7 tests passed。
- `lime-agent model_request_policy`：8 tests passed。
- `lime-agent native_tool_policy`：6 tests passed。
- `lime-agent native_tool`：11 tests passed。

备注：上述 Rust 测试仍提示既有 `agent_tools/execution/tests.rs` unused import warning；本轮未夹写该文件。

第八切片当前状态：`done for live tool output formatter`。

### 24.6 下一刀

1. 第三十八刀剩余主缺口已从 request policy consumer 转向 Codex-style `unified_exec` current executor；在它落地前，`unified_exec` 模型继续 fail-closed 隐藏旧 `Bash` / `PowerShell`。
2. 若先继续 formatter，应把非 live native tool 的 tool output / MCP output 也迁到同一 `ToolOutputTruncationPolicy` current helper，避免出现第二套 truncation 语义。
3. Aster compat 继续只作为 consumer；后续 provider builder / current runtime 不应重新解析前端 metadata。

## 25. P1-7 第三十八刀第十切片记录：unified_exec false alias cleanup

记录时间：2026-07-06。

协作说明：隔壁进程已使用“第九切片”记录 contract readiness green；本节不抢编号，按第十切片追加。本刀是 unified_exec current executor 前置清障：移除 `exec_command` 被 catalog 当成 legacy `Bash` alias 的错误归类，防止后续 Codex-style `exec_command/write_stdin` surface 被旧 shell_command 面续命。

### 25.1 Codex 对标

Codex 对照点：

- `codex-rs/tools/src/tool_config.rs::shell_type_for_model_and_features(...)`：`UnifiedExec` 和 `ShellCommand` 是不同 shell surface，不是简单 alias。
- `codex-rs/core/src/tools/spec_plan.rs::add_shell_tools(...)`：`UnifiedExec` 可见时注册 `exec_command/write_stdin`，旧 shell command 只保留 hidden dispatch。
- `codex-rs/core/src/unified_exec/mod.rs`：unified exec 是独立 process manager / write stdin 生命周期，不应被归并到 legacy `Bash` catalog entry。

Lime 本轮对齐为：`exec_command` 不再通过 `tool_catalog_entry(...)` 归一到 `Bash`。在真正落地 current executor 前，`unified_exec` 模型仍 fail-closed 隐藏旧 `Bash/PowerShell`；后续如果要开放 `exec_command/write_stdin`，必须显式新增 current catalog / inventory / executor 接线。

### 25.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `lime-rs/crates/agent/src/agent_tools/catalog.rs`

避让写集：

- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/aster-capability-intake-execution-plan.md`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_queue.rs`
- `lime-rs/crates/agent/src/runtime_support.rs`
- `lime-rs/crates/agent/src/subagent_control.rs`
- `lime-rs/crates/agent/src/subagent_runtime_adapter.rs`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `lime-rs/vendor/aster-rust/**`
- `scripts/**` 内容工厂 / signed release gate 热区
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 25.3 实现结论

- 删除 `normalize_tool_catalog_alias(...)` 中 `execcommand -> Bash` 的 alias。
- `shell_command` / `local_shell_call` 暂时仍归一到 `Bash`，因为它们仍是 legacy shell_command 兼容面，不在本刀扩大清理。
- `test_tool_catalog_entry_normalizes_reference_js_tool_names_to_current_surface` 新增负向断言：`tool_catalog_entry("exec_command").is_none()`，防止后续把 Codex unified_exec surface 重新折回旧 Bash。

`catalog.rs` 已超过 1000 行，本刀只做阻塞主线的旧 alias 删除和回归断言，不继续追加业务逻辑；后续如果要新增 `exec_command/write_stdin` current catalog，应优先拆出 shell surface / alias owner。

### 25.4 分类

- `current`：未来 `exec_command/write_stdin` 必须作为 unified_exec current surface 显式落地。
- `compat`：`shell_command` / `local_shell_call` 仍暂时归一到 `Bash`，只服务旧 shell surface。
- `deprecated / dead`：`exec_command -> Bash` alias 已判为旧路回流风险并移除；不再作为 current 或 compat 事实源。

### 25.5 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_catalog_entry -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool -- --nocapture
```

结果：

- `lime-agent tool_catalog_entry`：4 tests passed。
- `lime-agent native_tool_policy`：6 tests passed。
- `lime-agent native_tool`：11 tests passed。

备注：`lime-agent` 测试仍提示既有 `agent_tools/execution/tests.rs` unused import warning；本轮未夹写该文件。

第十切片当前状态：`done for unified_exec catalog guard`。

### 25.6 下一刀

1. 正式落 `exec_command/write_stdin` current catalog / inventory / executor 接线，复用 App Server `executionProcess/start` / `writeStdin` / `drainOutput` 事实源。
2. 在 current executor 落地前，保持 `unified_exec` 模型对旧 `Bash/PowerShell` fail-closed，不能回退成 Bash alias。
3. 后续触碰 `catalog.rs` 时优先拆 shell surface / alias owner，避免继续在超长 catalog 文件里堆新逻辑。

## 26. P1-7 第三十八刀第十一切片记录：tool orchestrator output truncation consumer

记录时间：2026-07-06。

本节承接第 24 节的 live native hook formatter，并避让第 25 节隔壁进程已完成的 `unified_exec` alias cleanup。第十一切片把 `ToolOutputTruncationPolicy` 从 live hook 扩到 current `tool_orchestrator`，覆盖非 live registry tool output 与该 orchestrator 内部 live shell terminal output。

### 26.1 Codex 对标

Codex 对照点：

- `codex-rs/tools/src/tool_call.rs::ToolCall.truncation_policy`：tool call context 持有 selected model 的 truncation policy。
- `codex-rs/core/src/tools/mod.rs::format_exec_output_str(...)`：工具输出进入模型前统一格式化。
- `codex-rs/utils/output-truncation/src/lib.rs::formatted_truncate_text(...)`：使用统一 warning header 和 token/line 统计。

Lime 对齐口径：

- `tool_output_truncation.rs` 继续是 current formatter owner。
- `tool_orchestrator.rs` 只做接线：从 `AgentTurnContext` 读取 policy，并在 `ToolExecutionOutcome` 输出写入前调用 formatter。
- 不触碰 Aster registry adapter，不恢复 `lime-rs/src/**` 或旧 `agent_runtime_*` production surface。

### 26.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`

避让写集：

- 第 25 节隔壁进程写集：`lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_*.rs`
- `lime-rs/crates/agent/src/subagent_*.rs`
- `lime-rs/vendor/aster-rust/**`
- `scripts/**` 内容工厂 / signed release gate 热区
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 26.3 实现链路

```text
request_metadata.harness.model_request_policy.truncation_policy
  -> AgentTurnContext.metadata.runtime_options.harness.model_request_policy
  -> tool_output_truncation_policy_from_turn_context(...)
  -> format_tool_output_for_model(...)
  -> execute_registry_tool(...)
  -> ToolExecutionOutcome.output
  -> RuntimeAgentEvent::ToolEnd.result.output
```

实现要点：

- `tool_orchestrator.rs` 新增 `model_formatted_tool_output(...)` 小 helper，复用第 24 节 `tool_output_truncation.rs` owner。
- registry tool output 不再直接复制 `RuntimeToolExecutionResult.output`；写入 `ToolExecutionOutcome` 前统一按 model truncation policy 格式化。
- `execute_live_shell_process(...)` 也复用同一 helper，让该 orchestrator 内部 live shell terminal output 和 registry output 使用同一语义。
- 新增独立 `tool_orchestrator/truncation_tests.rs`，不继续向已经超过 1000 行的 `tool_orchestrator/tests.rs` 追加测试逻辑。

### 26.4 分类

- `current`：`ToolOutputTruncationPolicy`、`format_tool_output_for_model(...)`、`tool_orchestrator` registry/live terminal output formatter。
- `compat`：Aster / existing registry executor 仍只是 consumer；不成为 truncation policy owner。
- `deprecated / dead`：未恢复 Aster registry adapter、旧 Tauri wrapper、`lime-rs/src/**` 或 `agent_runtime_*` production surface。

### 26.5 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_output_truncation -- --nocapture
node scripts/check-app-server-client-contract.mjs
npm run test:contracts
```

结果：

- `lime-agent tool_orchestrator`：15 tests passed。
- `lime-agent tool_output_truncation`：4 tests passed。
- `check-app-server-client-contract`：287 checks passed。
- `npm run test:contracts`：完整通过。

备注：Rust 测试仍提示既有 `agent_tools/execution/tests.rs` unused import `WorkspaceToolSurface` warning，本轮未夹写该超长测试文件。

第十一切片当前状态：`done for registry tool output formatter`。

### 26.6 下一刀

1. 继续 P1-7 剩余 consumer 审计：MCP output 是否也应复用 `ToolOutputTruncationPolicy`；后续已在第 27 节完成。
2. 补 reasoning / context / input-modality 的 Rust request consumer 证据；input-modality 当前 user message gate 已在第 28 节完成，history filtering 已在第 32 节完成。
3. 或进入 P2 Tool / Approval / Sandbox 第一代码刀，前提是对应 agent/runtime 热区有明确接管窗口。

## 27. P1-7 第三十八刀第十二切片记录：MCP / Aster extension output truncation consumer

记录时间：2026-07-06。

本节先审计 MCP output 是否已经复用第 24 / 26 节的 `ToolOutputTruncationPolicy`，随后补上 Aster extension / MCP bridge 的 `ToolResponse` compat 投影接线。结论是：current `tool_orchestrator` registry output 已复用；App Server `mcpTool/call*` 是 MCP control plane，不是模型可见 output；Aster extension / MCP bridge 的 `ToolResponse` 会经 `message_content_adapter.rs` 投影为 `ToolEnd`，现在由 stateful `RuntimeEventProjector` 传入当前 `AgentTurnContext` 并复用 selected model truncation policy。

### 27.1 Codex 对标

Codex 对照点：

- `codex-rs/tools/src/tool_call.rs::ToolCall.truncation_policy`：模型可见 tool output 应持有 request-time truncation policy。
- `codex-rs/core/src/tools/mod.rs::format_exec_output_str(...)`：exec / tool output 回传模型前统一格式化。
- `codex-rs/core/src/unified_exec/process_manager.rs`：MCP / process 输出都不应各自手写第二套截断语义。

Lime 本轮审计口径：

- `lime-rs/crates/app-server/src/local_data_source/mcp.rs::call_mcp_tool*` 返回 `McpToolCallResponse`，属于 GUI / API control plane；它不直接把结果喂回模型，因此不应在这里套 `ToolOutputTruncationPolicy`。
- `lime-rs/crates/agent/src/mcp_bridge.rs` 把 MCP server tools 注册为 Aster extension client，模型可见调用结果会回到 Aster message / tool response 流。
- `lime-rs/crates/agent/src/message_content_adapter.rs` 会把 Aster `MessageContent::ToolResponse` 转成 Lime `RuntimeAgentEvent::ToolEnd`；该路径继续保持 compat / non-canonical 标记，但输出文本会在 context 存在时读取 `request_metadata.harness.model_request_policy.truncation_policy`。

### 27.2 本轮认领写集

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`
- `lime-rs/crates/agent/src/message_content_adapter.rs`
- `lime-rs/crates/agent/src/event_converter.rs`
- `lime-rs/crates/agent/src/aster_runtime_projection.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_event_adapter.rs`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `internal/exec-plans/writing-v2-workflow-completion-plan.md`
- `internal/roadmap/Writing/v2/**`
- `internal/roadmap/astermigration/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/runtime_*.rs`
- `lime-rs/crates/agent/src/subagent_*.rs`
- `lime-rs/vendor/aster-rust/**`
- `scripts/**` 内容工厂 / signed release gate 热区
- `src/lib/governance/asterMigrationBoundary.test.ts`

### 27.3 审计结论

```text
MCP GUI/control plane:
  mcpTool/call*
  -> local_data_source/mcp.rs
  -> McpToolCallResponse
  -> current control plane response, not model-visible tool output

MCP model-visible extension:
  mcp_bridge.rs
  -> Aster extension_manager.add_client(...)
  -> Aster MessageContent::ToolResponse
  -> RuntimeEventProjector active_turn_context
  -> message_content_adapter.rs + ToolOutputTruncationPolicy
  -> RuntimeAgentEvent::ToolEnd
  -> compat / non-canonical metadata, current formatter
```

现有守卫 / 证据：

- `event_converter.rs::test_convert_message_tool_response_preserves_mcp_structured_content` 已证明 MCP structured content 会经 `message_content_adapter` 保留。
- `event_converter.rs::test_convert_message_tool_response_marks_legacy_tool_end_as_compat` 与 failed variant 已证明这条 `ToolResponse` path 会强制写 `source=legacy_message_tool_response`、`compat=true`、`canonical=false`，不会被误标为 current canonical formatter。
- `event_converter.rs::test_convert_message_tool_response_uses_turn_context_truncation_policy` 证明带 selected truncation policy 的 `ToolResponse` 输出会生成 Codex-style warning header。
- `aster_event_adapter.rs::projector_applies_turn_context_truncation_to_later_tool_response` 证明生产 stream projector 会保存 `TurnStarted` 的 `AgentTurnContext`，并把该 context 传给后续 `Message(ToolResponse)`。
- 第 26 节 `tool_orchestrator` formatter 只覆盖 `execute_registry_tool(...)` / orchestrator live shell terminal output；它不能自动覆盖 Aster 内部 extension tool response。

因此，MCP output 的准确状态是：

- current orchestrator registry output：已复用。
- App Server MCP control plane：不适用。
- Aster extension / MCP bridge `ToolResponse` compat path：已复用 `ToolOutputTruncationPolicy`，但 metadata 仍保持 compat / non-canonical，直到 Aster message path 退役或整体并入 current tool lifecycle。

### 27.4 分类

- `current`：`ToolOutputTruncationPolicy`、`format_tool_output_for_model(...)`、`tool_orchestrator` registry/live terminal output formatter。
- `current`：App Server `mcpTool/call*` 作为 MCP control plane response，不承担 model output truncation。
- `compat`：`message_content_adapter.rs` 的 Aster `ToolResponse -> ToolEnd` 投影，当前已标记 `legacy_message_tool_response / compat=true / canonical=false`；它现在只作为 current formatter 的 compat consumer，不再自持第二套截断语义。
- `deprecated / dead`：无新增；未恢复旧 `agent_runtime_*` production surface、`lime-rs/src/**` 或旧 MCP desktop facade。

### 27.5 验证

只读命令：

```bash
rg -n "mcp__|mcpTool|ToolExecutionOutcome|format_tool_output_for_model|ToolOutputTruncationPolicy" "lime-rs/crates/agent" "lime-rs/crates/app-server" "lime-rs/crates/mcp" "packages/app-server-client"
sed -n '220,430p' "lime-rs/crates/app-server/src/local_data_source/mcp.rs"
sed -n '1,520p' "lime-rs/crates/agent/src/mcp_bridge.rs"
sed -n '180,410p' "lime-rs/crates/agent/src/message_content_adapter.rs"
sed -n '260,760p' "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs"
```

代码验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent projector_applies_turn_context_truncation_to_later_tool_response -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent message_content_adapter -- --nocapture
```

文档检查：

```bash
rg -n "[ \t]+$" "internal/research/refactor/v1/priority-tracking-plan.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md"
```

结果：

- `projector_applies_turn_context_truncation_to_later_tool_response`：1 test passed。
- `message_content_adapter`：3 tests passed。
- Rust 测试仍提示既有 `agent_tools/execution/tests.rs` unused import `WorkspaceToolSurface` warning；本轮未触碰该文件。

第十二切片当前状态：`done for Aster ToolResponse compat formatter`。

### 27.6 下一刀

1. 补 reasoning / context 的 Rust request consumer 证据。
2. 正式落 Codex-style `exec_command/write_stdin` current executor 前，继续保持 `unified_exec` 模型对旧 `Bash/PowerShell` fail-closed。
3. 后续如果继续减少 compat，应把 Aster `ToolResponse` message path 并入 current tool lifecycle，而不是让它长期作为独立投影链存在。

## 28. P1-7 第三十八刀第十三切片记录：input modality Rust fail-closed consumer

本节承接第 27 节剩余 consumer 审计。本轮只认领 `lime-agent` model request policy typed owner 与 Aster reply user message 构造边界，不触碰 `agent-runtime` contract、App Server runtime、RuntimeCore、vendor Aster provider builder、tool orchestrator、catalog 或脚本热区。

### 28.1 Codex 对标

- `codex-rs/core/src/session/turn.rs` 会在 prompt history 构造时调用 `for_prompt(&turn_context.model_info.input_modalities)`，说明输入模态过滤是 request/runtime 边界职责，不只靠 UI。
- `codex-rs/protocol/src/openai_models.rs` 定义 `default_input_modalities()` 为 `text + image`，显式 model policy 才收窄输入模态。
- Lime 本轮对齐为：前端 selected model 的 `input_modality_policy` 已经进入 `request_metadata.harness.model_request_policy`；Rust 侧新增 typed snapshot，并在 Aster reply 当前 user message 构造前做 fail-closed。显式 text-only 模型如果仍收到 `input.images`，直接拒绝发送 provider，避免前端 send gate 之外的旁路入口漏过。

### 28.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/model_request_policy/tests.rs
lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs
lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter/tests.rs
```

继续避让：

```text
internal/exec-plans/writing-v2-workflow-completion-plan.md
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
lime-rs/crates/agent-runtime/**
lime-rs/crates/agent/src/runtime_*.rs
lime-rs/crates/agent/src/subagent_*.rs
lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs
lime-rs/crates/agent/src/agent_tools/catalog.rs
lime-rs/vendor/aster-rust/**
scripts/**
src/lib/governance/asterMigrationBoundary.test.ts
```

### 28.3 当前链路

```text
selected EnhancedModelMetadata.input_modality_policy
  -> request_metadata.harness.model_request_policy.input_modality_policy
  -> model_request_policy.rs::ModelInputModalityPolicySnapshot
  -> input_modality_policy_from_turn_context(...)
  -> aster_reply_adapter.rs::validate_user_input_modalities(...)
  -> text-only selected model + input.images => fail-closed before provider call
```

实现口径：

- 缺失 `input_modality_policy` 时保持 allow，等价 Codex wire default `text + image`，避免把没有 policy 的旧入口误杀。
- 显式 `supports_image_input=false` 时拒绝图片输入；这是前端 send gate 后的 Rust 二次防线。
- 只处理当前 user message 的 `input.images`；历史 prompt filtering 仍是后续 context/prompt builder consumer 缺口，不在本轮假装完成。

### 28.4 分类

- `current`：`ModelInputModalityPolicySnapshot`、`input_modality_policy_from_turn_context(...)`、`input_modality_policy_allows_image_input(...)`。
- `current`：Aster reply 当前 user message 构造前的 image fail-closed gate；它是 provider 调用前的 current Rust 消费点。
- `compat`：Aster reply adapter 仍是 legacy provider bridge 的 compat 边界，但本轮只让它消费 current policy，不让 Aster 自持第二套模态推断。
- `deprecated / dead`：无新增；未恢复旧 `agent_runtime_*` production surface、旧 model 字符串推断或前端-only send gate 作为唯一事实源。

### 28.5 验证

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent input_modality_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_reply_message_ -- --nocapture
```

结果：

- `input_modality_policy`：1 test passed。
- `model_request_policy`：9 tests passed。
- `build_reply_message_`：2 tests passed。
- Rust 测试仍提示既有 `agent_tools/execution/tests.rs` unused import `WorkspaceToolSurface` warning；本轮未触碰该文件。

第十三切片当前状态：`done for current user-message gate`。

### 28.6 下一刀

1. reasoning-output provider output-control consumer 已在第 33 节完成，`lime-agent model_request_policy` 复测也已通过。
2. 第二十一切片已补 turn-context summary history usage projection；下一刀继续 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。
3. 正式落 Codex-style `exec_command/write_stdin` current executor 前，继续保持 `unified_exec` 模型对旧 `Bash/PowerShell` fail-closed。

## 29. P1-7 第三十八刀第十四切片记录：reasoning policy request fallback consumer

记录时间：2026-07-06。

本节只补 `request_metadata.harness.model_request_policy.reasoning_policy` 到现有 App Server `reasoning_effort_from_request` 的 fallback。它不替换 host `turn_config.reasoning_effort`、不替换显式 `harness.reasoning_effort`，也不新增 provider body lowering 分支。

### 29.1 Codex 对标

- Codex `ModelInfo` 持有 `default_reasoning_level` / `supported_reasoning_levels` / `supports_reasoning_summaries`。
- Codex turn context 会把 selected model 能力转成 request-time reasoning decision，而不是在 provider/model 字符串上临场猜。
- Lime 本轮只接默认 effort fallback：当请求没有显式 reasoning effort，且 selected model policy 声明 `supports_reasoning_summaries=true` 时，使用 `default_reasoning_level` 进入现有 `RuntimeModelSelection.reasoning_effort` 和 `AgentTurnContext.effort`。

### 29.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/crates/app-server/src/runtime_backend/request_context.rs
lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs
```

继续避让：

```text
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/request_tool_policy/**
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/model-provider/src/provider_stream.rs
lime-rs/vendor/aster-rust/**
scripts/**
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
```

### 29.3 当前链路

```text
request_metadata.harness.model_request_policy.reasoning_policy
  -> request_context.rs::metadata_model_request_policy_reasoning_effort(...)
  -> request_context.rs::reasoning_effort_from_request(...)
  -> RuntimeModelSelection.reasoning_effort
  -> turn_context_from_request(...).effort
  -> provider configuration / turn context existing path
```

优先级：

```text
host turn_config.reasoning_effort
  > explicit metadata reasoning_effort / model_reasoning_effort
  > selected model policy default_reasoning_level fallback
```

### 29.4 分类

- `current`：App Server `request_context.rs` 作为 request-time model selection / turn context owner。
- `current`：`harness.model_request_policy.reasoning_policy.default_reasoning_level` fallback，只在无显式 request effort 时生效。
- `compat`：旧 direct metadata aliases 仍保留为迁移期输入，但优先级高于 policy default，避免改写用户显式请求。
- `deprecated / dead`：无新增；未恢复旧 `agent_runtime_*` production surface。

### 29.5 验证

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_selection -- --nocapture
```

结果：

- `cargo fmt --check`：通过。
- `model_selection`：26 tests passed。
- 新增覆盖：
  - `model_request_policy_reasoning_default_flows_to_selection_and_turn_context`
  - `explicit_reasoning_effort_wins_over_model_request_policy_default`

第十四切片当前状态：`done for request_context fallback`。

### 29.6 下一刀

1. reasoning-output provider output-control consumer 已在第 33 节完成；summary / verbosity 已进入 provider request output-control，且未混入 effort fallback。
2. 第二十一切片已补 turn-context summary history usage projection；已完成 `ModelContextPolicySnapshot` typed owner、App Server `lime_runtime` turn-context projection、prompt packet budget consumer 与 projection-side `auto_compact_due`，后续仍需进入 session DB read model 与 actual auto compact trigger owner。

## 30. P1-7 第三十八刀第十五补充切片记录：context policy App Server `lime_runtime` projection

记录时间：2026-07-06。

本节承接第十五切片 typed owner：不接管隔壁 `lime-agent` reasoning-output 写集，不碰 provider/vendor prompt budget 热区，只把 selected model 的 `context_policy` 从 submit metadata 推进到 App Server `AgentTurnContext.metadata.lime_runtime`。

### 30.1 Codex 对标

- Codex `ModelInfo::resolved_context_window()`、`auto_compact_token_limit()` 与 `TurnContext::model_context_window()` 是 request-time context budget 输入，不属于 picker summary。
- Lime 前端已把 selected registry model 的 `context_policy` 写入 `request_metadata.harness.model_request_policy`。
- Lime 本轮对齐为：App Server `turn_context_from_request(...)` 生成 `lime_runtime.context_policy`、`lime_runtime.model_context_window` 与 `lime_runtime.auto_compact_token_limit`，作为后续 prompt/context budget owner 的 current 输入。

### 30.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs
lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs
```

继续避让：

```text
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/model_request_policy/tests.rs
lime-rs/crates/agent/src/request_tool_policy/**
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/model-provider/src/provider_stream.rs
lime-rs/vendor/aster-rust/**
scripts/**
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
```

### 30.3 当前链路

```text
request_metadata.harness.model_request_policy.context_policy
  -> turn_context.rs::lime_runtime_context_policy_from_request(...)
  -> AgentTurnContext.metadata.lime_runtime.context_policy
  -> AgentTurnContext.metadata.lime_runtime.model_context_window
  -> AgentTurnContext.metadata.lime_runtime.auto_compact_token_limit
```

fast-response metadata 合并规则：

```text
context policy projection
  + fast_response_routing auto_compact=false / tool_surface
  -> same lime_runtime object
```

### 30.4 分类

- `current`：App Server `turn_context_from_request(...)` 的 `lime_runtime.context_policy` 投影。
- `current`：`model_context_window` / `auto_compact_token_limit` 作为后续 context budget consumer 的 request-time 输入。
- `compat`：无新增；仍保留 fast-response `lime_runtime.auto_compact=false` 既有语义，并与 context policy 合并。
- `deprecated / dead`：无新增；未恢复旧 `agent_runtime_*`、旧 `lime-rs/src/**` 或 provider/model 字符串推断。

### 30.5 验证

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_request_policy_context -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server fast_response_lime_runtime_keeps_context_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server model_selection -- --nocapture
```

结果：

- `cargo fmt --check`：通过。
- `model_request_policy_context`：1 test passed。
- `fast_response_lime_runtime_keeps_context_policy`：1 test passed。
- `model_selection` 整组：本进程后续补跑通过，28 tests passed；之前的 `reasoning_output_policy` initializer blocker 已由第十六切片收口。

第十五补充切片当前状态：`done for turn-context projection / budget consumer pending`。

### 30.6 下一刀

1. reasoning-output provider output-control consumer 已在第 33 节完成；后续只补 `lime-agent` 复测 blocker。
2. 第二十一切片已补 turn-context summary history usage projection；下一刀继续 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。

## 31. P1-7 第三十八刀第十七切片记录：context policy prompt packet budget consumer

记录时间：2026-07-06。

本节承接第十五补充切片。`lime_runtime.context_policy` 只是 turn-context metadata projection；本切片开始把 selected model context policy 进入 App Server prompt context packet budget。当前只做 App Server memory / session compaction packet 的最小 consumer，不接管 `lime-agent`、provider/vendor 或 agent-runtime 热区。

### 31.1 Codex 对标

- Codex context window 是 request-time prompt assembly 的预算输入，不属于 picker summary。
- Lime 前端已把 selected model 的 `context_policy` 写入 `request_metadata.harness.model_request_policy.context_policy`。
- Lime 本轮对齐为：App Server `memory_prompt.rs` 在注入 memory / session compaction context packet 前读取 `model_context_window` 与 `auto_compact_token_limit`，并按 effective window 限制 packet token budget。

### 31.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/crates/app-server/src/runtime/memory_prompt.rs
lime-rs/crates/app-server/src/runtime/tests/sessions.rs
```

继续避让：

```text
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/model_request_policy/tests.rs
lime-rs/crates/agent/src/request_tool_policy/**
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/agent-runtime/**
lime-rs/crates/model-provider/src/provider_stream.rs
lime-rs/vendor/aster-rust/**
scripts/**
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
```

### 31.3 当前链路

```text
request_metadata.harness.model_request_policy.context_policy
  -> memory_prompt.rs::prompt_context_budget_policy_from_metadata(...)
  -> PromptContextBudgetPolicy { model_context_window, auto_compact_token_limit }
  -> packetTokenBudget = min(default_packet_budget, effective_context_window / 10)
  -> memory_store_prompt_context / session_compaction_prompt_context
  -> context_packet_telemetry.packets[].tokenBudget
  -> append_memory_context_to_system_prompt(...)
```

预算口径：

- `resolved_context_window = resolved_context_window ?? context_window ?? max_context_window`。
- `model_context_window = resolved_context_window * effective_context_window_percent / 100`，缺省 percent 为 `95`。
- `auto_compact_token_limit` 缺省为 `resolved_context_window * 90%`，显式值也按 90% clamp。
- packet budget 取 `min(default, min(model_context_window, auto_compact_token_limit) / 10)`；这只是 prompt packet 最小 consumer，不等于完整 workspace auto compact / history filtering 完成。

### 31.4 分类

- `current`：App Server `runtime/memory_prompt.rs` 的 memory / session-compaction prompt packet budget consumer。
- `current`：`packetTokenBudget` 和 `contextBudgetPolicy` 写回 runtime metadata，后续 system prompt append 和 telemetry 复用同一预算。
- `compat`：无新增；仍保留缺 policy 时的既有固定 packet budget fallback。
- `deprecated / dead`：无新增；未恢复旧 `agent_runtime_*`、旧 `lime-rs/src/**` 或 provider/model 字符串推断。

### 31.5 验证

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check
git diff --check -- "lime-rs/crates/app-server/src/runtime/memory_prompt.rs" "lime-rs/crates/app-server/src/runtime/tests/sessions.rs" "internal/research/refactor/v1/priority-tracking-plan.md"
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server prompt_context_budget_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server compact_agent_session_injects_next_turn_session_context_packet -- --nocapture
```

结果：

- `cargo fmt --check`：通过。
- scoped `git diff --check`：通过。
- `prompt_context_budget_policy`：1 test passed。
- `compact_agent_session_injects_next_turn_session_context_packet`：1 test passed。

第十七切片当前状态：`done for prompt packet budget consumer`。

### 31.6 下一刀

1. reasoning-output provider output-control consumer 已在第 33 节完成；后续只补 `lime-agent` 复测 blocker。
2. 第二十一切片已把 context policy 与 history usage 接到 turn-context summary context budget projection；下一刀继续 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。

## 32. P1-7 第三十八刀第十八切片记录：history-level input modality filtering

记录时间：2026-07-06。

本节承接第十三切片的 current user-message gate。前一刀只拒绝当前回合 `input.images`；本刀补 provider prompt history 边界，避免 text-only selected model 在历史上下文里继续收到 image part。

### 32.1 Codex 对标

- Codex `core/src/session/turn.rs` 在 prompt history 构造时调用 `for_prompt(&input_modalities)`，说明多模态过滤属于 request-time prompt assembly，而不是只靠 UI send gate。
- Lime 前端已把 selected model 的 `input_modality_policy` 写入 `request_metadata.harness.model_request_policy.input_modality_policy`。
- Lime 本轮对齐为：Aster provider prompt 边界读取 turn context metadata，在调用 provider 前对历史消息执行 image filtering。

### 32.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs
lime-rs/vendor/aster-rust/crates/aster/src/agents/mod.rs
lime-rs/vendor/aster-rust/crates/aster/src/agents/prompt_input_modalities.rs
```

继续避让：

```text
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/model_request_policy/tests.rs
lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs
lime-rs/crates/agent/src/session_store_tests.rs
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/agent-runtime/**
lime-rs/crates/model-provider/src/provider_stream.rs
lime-rs/vendor/aster-rust/crates/aster/src/providers/**
scripts/**
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
```

### 32.3 实现结果

- Aster 新增 `agents/prompt_input_modalities.rs` 作为 provider prompt history filtering owner；`agent.rs` 只在 provider dispatch 前调用 `provider_prompt_messages_for_turn_context(...)`，不继续向 9000+ 行巨型文件追加过滤细节。
- 过滤入口从 `TurnContextOverride.metadata` 读取 selected model `request_metadata.harness.model_request_policy.input_modality_policy`，并兼容 snake_case / camelCase、`runtime_options`、`aster_chat_request`、`config` 等现有 metadata 包装形态。
- text-only selected model 会把历史 `MessageContent::Image` 与 tool result `RawContent::Image` 替换为固定文本：`image content omitted because you do not support image input`；image-capable policy 保留原始 image part。
- 缺失 policy 时保持 Aster / Codex 兼容默认：允许 text + image，避免旧入口在未携带 metadata 时被误杀。

### 32.4 验证结果

已通过：

```bash
cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core prompt_input_modalities -- --nocapture
```

定向测试覆盖：

- `text_only_policy_replaces_message_and_tool_result_images`
- `image_capable_policy_preserves_images`
- `missing_policy_keeps_compat_default_images_enabled`

本轮收口后，P1-7 input-modality 已同时覆盖当前 user-message fail-closed gate 与 provider prompt history filtering。第 33 节已继续补齐 reasoning-output provider request consumer；第 34 节已补 turn-context summary context budget projection；第 35 节已补 history usage projection owner；剩余最高优先级缺口转为 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。

巨型文件边界：`agent.rs` 已超过 9000 行，本刀不把过滤逻辑继续追加进该文件；新增 `prompt_input_modalities.rs` 作为 owner，`agent.rs` 只做 provider prompt dispatch 接线。

## 33. P1-7 第三十八刀第十九切片记录：reasoning-output provider output-control

记录时间：2026-07-06。

本节承接第十六切片 typed owner。前一阶段只把 `ModelReasoningOutputPolicySnapshot` 从 selected model metadata 解析出来；本刀把它继续推进到 provider request output-control，避免 summary / verbosity 停在 Rust parser 或被混入 reasoning effort fallback。

### 33.1 Codex 对标

- Codex `ModelClient::build_reasoning(...)` 把 reasoning summary 写入 Responses `reasoning.summary`，并且只在 summary 非 `none` 时发送。
- Codex Responses request 的 verbosity 走 `text.verbosity`，由 `support_verbosity` 和 default verbosity 决定；它不是 reasoning effort。
- Lime 本轮对齐为：`request_metadata.harness.model_request_policy.reasoning_output_policy` 进入 `RuntimeReplyModelRequestPolicy -> RuntimeReplyProviderRequestWireShape -> Aster ResponsesRequestPolicy -> Responses payload`。

### 33.2 本轮认领写集

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
lime-rs/crates/model-provider/src/provider_stream.rs
lime-rs/crates/agent/src/model_request_policy.rs
lime-rs/crates/agent/src/model_request_policy/tests.rs
lime-rs/vendor/aster-rust/crates/aster/src/providers/openai_request_policy.rs
lime-rs/vendor/aster-rust/crates/aster/src/providers/formats/openai_responses.rs
```

继续避让：

```text
lime-rs/vendor/aster-rust/crates/aster/src/providers/openai.rs
lime-rs/vendor/aster-rust/crates/aster/src/agents/**
lime-rs/crates/agent/src/session_store_subagent_projection.rs
lime-rs/crates/agent/src/session_store_subagent_query.rs
lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/agent-runtime/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/**
scripts/**
internal/roadmap/Writing/v2/**
internal/roadmap/astermigration/**
```

### 33.3 实现结果

- `model-provider/src/provider_stream.rs` 已把 `RuntimeReplyReasoningOutputPolicy` 纳入 `RuntimeReplyModelRequestPolicy`，并投影到 `RuntimeReplyProviderRequestWireShape.reasoning_summary / text_verbosity`。
- `lime-agent/src/model_request_policy.rs` 已把 `ModelReasoningOutputPolicySnapshot` 映射到 provider stream DTO；新增测试固定 runtime DTO 可读出 `reasoning_summary()` 与 `text_verbosity()`。
- Aster `openai_request_policy.rs` 同时支持从 `provider_request_wire_shape` 与 fallback `model_request_policy.reasoning_output_policy` 读取 summary / verbosity；wire shape 优先于 fallback policy。
- Aster `openai_responses.rs` 将 summary 写入 `reasoning.summary`，将 verbosity 写入 `text.verbosity`，并与 output schema 的 `text.format` 共存；`none` summary 和不支持 verbosity 的 policy 会省略。

巨型文件边界：`openai_responses.rs` 当前约 `1698` 行，本刀只接阻塞主线的 Responses payload output-control 字段；未在本轮拆分的原因是该文件仍是 Aster Responses payload owner，拆分会扩大到既有 message/tool/schema formatter。风险是后续 provider payload policy 继续堆回同一文件；退出条件是下一次再扩 Responses payload policy 时，优先拆出 `responses_output_control` / `responses_request_policy` helper 和对应测试 owner，再只让 `openai_responses.rs` 做组合接线。

### 33.4 验证结果

已通过：

```bash
rustfmt --edition 2021 --check <第十九切片 Rust 写集>
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent reasoning_output_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent model_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core openai_request_policy -- --nocapture
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core openai_responses -- --nocapture
git diff --check -- <第十九切片写集>
```

第十九切片当前状态：`done for provider output-control`。

### 33.5 下一刀

1. 第二十一切片已补 turn-context summary history usage projection；下一刀继续 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。
2. P1-7 剩余 consumer 清零后，再进入 P2 Tool / Approval / Sandbox 第一代码刀。

## 34. P1-7 第三十八刀第二十切片纠偏记录：context policy turn-context budget projection consumer

记录时间：2026-07-06。

本节纠偏第 2A 表中 `aborted / wrong owner` 的 Aster vendor 尝试：context / auto compact 新能力不写入 vendor Aster，而是回到 Lime current owner。当前最小 consumer 选择 `lime-agent/src/protocol_context_projection.rs`，因为它已经是 `AgentTurnContextSummary.memory_budget` 的投影 owner。

### 34.1 Codex 对标

- Codex `ModelInfo::auto_compact_token_limit()` 和 `TurnContext::model_context_window()` 提供 request-time context budget 输入。
- Codex `context_window_token_status(...)` 会在有 usage 时计算 `tokens_until_compaction`，并区分 full context window 与 auto compact limit。
- Lime 本切片先完成上游 budget projection：`AgentTurnContext.metadata.lime_runtime.context_policy` -> `AgentTurnContextSummary.memory_budget`。真实 history token usage / auto compact trigger 仍是下一刀，不把本切片误判为完整 compaction owner。

### 34.2 实现

- 新增 `build_context_budget_from_lime_runtime(...)`，仅在没有显式 `agentui_context.memory_budget` 时生效。
- `auto_compact=true` 或缺省时，`max_tokens = min(model_context_window, auto_compact_token_limit)`；`auto_compact=false` 时使用 full `model_context_window` 并标记 `status=auto_compact_disabled`。
- 如果 metadata 已带 `used_tokens` / `active_context_tokens`，投影 `used_tokens` 并计算非负 `remaining_tokens`。
- 显式 `agentui_context.memory_budget` 仍优先，避免覆盖 knowledge/context resolver 的 current 预算事实源。

### 34.3 验证

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`：通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`：通过。
- scoped `git diff --check`：通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture`：被并行 `lime-rs/crates/agent/src/session_execution_runtime/tests.rs` 引用已删除函数 `project_aster_session_execution_runtime_session` 阻塞；非本切片写集。

第二十切片当前状态：`done for context budget projection / targeted-test-blocked / aster-context-boundary-guard-done`。

### 34.3.1 Aster 迁移边界守卫

- 新增 `src/lib/governance/asterContextPolicyBoundary.test.ts`，把 context / auto-compact budget 的 current owner 固定在 `lime-agent/src/model_request_policy.rs`、`lime-agent/src/protocol_context_projection.rs`、App Server `runtime_backend/request_context/turn_context.rs` 与 App Server `runtime/memory_prompt.rs`。
- 同一守卫禁止 vendor Aster `context_mgmt/mod.rs` 与 `agents/agent.rs` 重新解析 `context_policy`、`model_context_window`、`auto_compact_token_limit`、`context_usage`、`active_context_tokens` 或承接 `auto_compact_due` / trigger 新规则。
- 分类：Lime current owner 继续承接 selected model context policy；vendor Aster 只保留 `compat` executor / adapter 角色，不再作为 auto compact 事实源。
- 验证入口：`npx vitest run "src/lib/governance/asterContextPolicyBoundary.test.ts"`。

### 34.4 下一刀

1. 第二十一切片继续完成 projection owner：`protocol_context_projection.rs` 读取 `lime_runtime.context_usage` / `history_usage` / `token_usage`，并在 used >= effective limit 时标记 `auto_compact_due`。
2. 后续继续 session DB read model 写入真实 `lime_runtime.context_usage` 与 actual auto compact trigger owner。
3. 不把 context auto compact 新能力写入 Aster vendor；Aster 只能保留 compat executor / event adapter 角色，并由 `asterContextPolicyBoundary.test.ts` 防回流。

## 35. P1-7 第三十八刀第二十一切片记录：history token usage / auto compact trigger projection owner

记录时间：2026-07-06。

本节承接第 34 节纠偏结果，只碰 `protocol_context_projection.rs` current owner。因 `session_usage_projection.rs`、`session_execution_runtime.rs`、未跟踪 `session_execution_runtime_query.rs`、App Server runtime / runtime_backend 与 `thread-store` 均为并行热区，本切片不接管 DB read model 或 actual compact trigger，只先把真实 usage metadata 进入预算 projection 的算法封住。

### 35.1 Codex 对标

- Codex `TokenUsageInfo::new_or_append(...)` 会把 last usage 与 `model_context_window` 合并到会话 token info。
- Codex `context_window_token_status(...)` 使用 active context tokens、auto compact scope limit 与 full context window limit 计算 `tokens_until_compaction` 和 limit reached。
- Lime 本切片对应 projection owner：当 current runtime 把真实 usage 写入 `lime_runtime.context_usage` / `history_usage` / `token_usage` 后，`AgentTurnContextSummary.memory_budget` 必须按 selected model context policy 给出 `used_tokens`、`remaining_tokens` 与 `auto_compact_due`，而不是只展示 prompt packet budget。

### 35.2 实现

- `protocol_context_projection.rs` 新增 nested usage 读取，支持 `context_usage` / `history_usage` / `token_usage` 以及 camelCase 变体。
- usage 字段支持 `active_context_tokens` / `used_tokens` / `total_tokens` 及 camelCase 变体。
- `auto_compact=true/default` 时继续使用 `min(model_context_window, auto_compact_token_limit)` 作为 effective limit；`used_tokens >= max_tokens` 时标记 `status=auto_compact_due`。
- `auto_compact=false` 仍保留 full context budget 与 `status=auto_compact_disabled`，避免把 disabled workspace 误判成自动压缩可触发。
- 显式 `agentui_context.memory_budget` 仍优先，避免覆盖 knowledge/context resolver 的 current 预算事实源。

### 35.3 验证

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`：通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`：通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture`：5 tests passed。
- scoped `git diff --check`：通过。

第二十一切片当前状态：`done for projection owner / db-readmodel-trigger-pending`。

### 35.4 下一刀

1. 等 `session_usage_projection.rs` / `session_execution_runtime_query.rs` / App Server runtime_backend 热区释放后，把 session DB read model 的真实 token usage 写入 `lime_runtime.context_usage`。
2. 把 `auto_compact_due` 从 projection evidence 推进到 actual compact trigger owner，仍然不写 Aster vendor。

## 36. P1-7 第三十八刀第二十二切片记录：context usage projection helper / DB read model handoff seam

记录时间：2026-07-06。

本节继续避让 `session_usage_projection.rs`、`session_execution_runtime.rs`、未跟踪 `session_execution_runtime_query.rs`、App Server runtime_backend 与 thread-store 热区，不接管 DB read model。当前只把后续接线需要的 handoff seam 收进 current projection boundary，避免下一刀在 runtime 层拼装 `serde_json::Value`。

### 36.1 实现

- `protocol_context_projection.rs` 新增 `project_turn_context_summary_with_active_context_tokens(...)`。
- `protocol_projection.rs` 暴露同名 current projection 入口，后续 runtime read model 可传入真实 active context tokens。
- handoff usage 只在没有显式 `agentui_context.memory_budget` 时参与 `lime_runtime.context_policy` fallback，继续保护 knowledge/context resolver 的 current budget owner。
- handoff usage 与第二十一切片同用 `auto_compact_due` 规则：`used_tokens >= min(model_context_window, auto_compact_token_limit)` 时归零 remaining 并标记 due。

### 36.2 验证

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check`：通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib`：通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_context_projection -- --nocapture`：6 tests passed。
- scoped `git diff --check`：通过。

第二十二切片当前状态：`done for handoff helper / db-readmodel-trigger-pending`。

### 36.3 下一刀

1. 等 `session_usage_projection.rs` / `session_execution_runtime_query.rs` / `session_execution_runtime.rs` 热区释放后，在 session DB read model 调用 `project_turn_context_summary_with_active_context_tokens(...)`。
2. 第二十三切片已把 session usage 的 `input_tokens` 接入 handoff helper；下一刀把 `auto_compact_due` 推进到 actual compact trigger owner，仍不写 Aster vendor，不恢复旧 `agent_runtime_*` production surface。

## 37. P2 Tool / Approval / Sandbox 第一刀 handoff 记录

记录时间：2026-07-06。

本节只改 v1 文档，不接管 Rust / 前端 / scripts 源码热区。P1-7 第三十八刀 request/tool/context consumer 主链已推进到 actual auto compact trigger owner、contract gate 与 runtime fixture 证据，下一条高杠杆主线转入 P2 Tool / Approval / Sandbox 第一代码刀。

### 37.1 并行写集

本轮认领写集：

- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/README.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`
- `internal/research/refactor/v1/priority-tracking-plan.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/components/agent/chat/hooks/**`
- `src/lib/governance/**` 中未移交的并行改动
- Writing v2 / soul / scripts / frontend 其它治理热区

### 37.2 Handoff 内容

新增 [p2-tool-approval-sandbox-handoff.md](./p2-tool-approval-sandbox-handoff.md)，把 P2 第一代码刀固定为：

```text
tool call request
  -> ToolExecutionLifecycleSnapshot
  -> ToolApprovalActionSnapshot / ToolSandboxDecisionSnapshot
  -> RuntimeAgentEvent ToolStart / ActionRequired / ToolOutputDelta / ToolEnd
  -> ThreadItem / Evidence
```

关键裁决：

- `agent_tools/catalog.rs` 已有 `ToolLifecycle` 表示 catalog current / compat / deprecated，P2 执行生命周期采用 `ToolExecutionLifecycleSnapshot`，避免复用同名概念。
- `lime-agent` tool domain 是 current typed owner；App Server 只做 JSON-RPC / RuntimeEvent / read model projection；Desktop Host 只做平台权限和进程能力；GUI 只消费 projection。
- Codex `unified_exec` 只作为 approval + sandbox + process orchestration 对标；本刀不新增 `exec_command/write_stdin` current executor。
- 在 current executor 落地前，`unified_exec` 模型继续 fail-closed 隐藏旧 `Bash` / `PowerShell`。

### 37.3 接管条件

满足任一条件后才开源码刀：

1. `git status --short -- <推荐窄写集>` 显示 `agent_tools/tool_lifecycle.rs`、`agent_tools/mod.rs`、`agent_tools/tool_orchestrator.rs`、`agent_tools/tool_orchestrator/tests.rs` 可由当前进程接管。
2. 隔壁进程在本计划文件标注移交 `agent_tools/tool_orchestrator*` 或 `execution/**`。
3. 用户明确授权当前进程接管对应热区。

未满足前，当前进程只继续做只读验证、上游 diff 或文档证据收口。

### 37.4 验证入口

文档本轮最小验证：

```bash
rg -n "[ \t]+$" "internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md" "internal/research/refactor/v1/p2-runtime-skeleton.md" "internal/research/refactor/v1/quality-fixture-matrix.md" "internal/research/refactor/v1/completion-audit.md" "internal/research/refactor/v1/priority-tracking-plan.md"
```

源码第一刀最小验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture
```

若触碰 App Server runtime lifecycle，再补：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture
```

若触碰前端 projection 或协议 shape，再补：

```bash
npx vitest run "src/components/agent/chat/projection/toolEventProjection.test.ts" "src/components/agent/chat/projection/actionProjection.test.ts"
npm run test:contracts
```

### 37.5 分类

- `current`：`lime-agent` tool domain typed lifecycle owner、App Server RuntimeCore sequence validation、frontend projection owner、`evidence/export` correlation。
- `compat`：vendor Aster / existing registry executor 只作为事件和执行兼容面，不承接 Tool / Approval / Sandbox truth。
- `deprecated`：旧 `agent_runtime_*` production surface、旧 shell alias 入口，不允许新增依赖。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 `exec_command` 折回 legacy `Bash` alias 的路径。

### 37.6 下一刀

1. 若 `agent_tools/**` 热区释放，落 `ToolExecutionLifecycleSnapshot` typed owner，并把 `tool_orchestrator.rs` 的 tool event 构造迁到 helper。
2. 若热区仍未释放，继续 P3 upstream loop 或只读验证，不夹写 runtime / tool 源码。

## 38. P3 第二次 upstream range check 记录

记录时间：2026-07-06。

本节只改 v1 文档，不接管 Rust / 前端 / scripts 源码热区。因为 `agent_tools/**`、App Server runtime 与前端 hooks 仍在并行写集内，本轮按第 37 节接管条件转入 P3 upstream loop。

### 38.1 Range 结果

- Codex：`be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main`，`origin/main` 仍为 `be33f80bc65159c094ecd06bf155afa3061ce23d`，0 个非 merge commit。
- opencode：`be73f465df6b20e0c3091f49ab83e89c0ede3b35..origin/dev`，`origin/dev` 前进到 `e0ec9be238a1495454e46426665323af25273b63`，5 个非 merge commit。
- opencode allowlist 路径无命中；5 个 commit 不进入 Lime backlog。

新增记录：[upstream-diff-2026-07-06-p3-loop.md](./upstream-diff-2026-07-06-p3-loop.md)。

### 38.2 分类

- `current`：`upstream-checkpoint.md`、`upstream-diff-2026-07-06.md`、`upstream-diff-2026-07-06-p3-loop.md` 作为 P3 跟进证据 owner。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden。

opencode commit `68f225a11` 的 OpenRouter small model reasoning effort 只记录为 `watch / no backlog`：它不命中当前 allowlist 路径，且 Lime current owner 仍是 `modelReasoningPolicy` + Rust request consumer。若后续要把 `packages/opencode/src/provider/**` 纳入 allowlist，必须先修改 [follow-up-strategy.md](./follow-up-strategy.md)，不能临时放宽。

### 38.3 验证入口

已执行：

```bash
git -C "/Users/coso/Documents/dev/rust/codex" fetch origin
git -C "/Users/coso/Documents/dev/js/opencode" fetch origin
git -C "/Users/coso/Documents/dev/rust/codex" rev-list --count --no-merges "be33f80bc65159c094ecd06bf155afa3061ce23d..origin/main"
git -C "/Users/coso/Documents/dev/js/opencode" rev-list --count --no-merges "be73f465df6b20e0c3091f49ab83e89c0ede3b35..origin/dev"
git -C "/Users/coso/Documents/dev/js/opencode" show --name-only --format="commit %h%n%s" --no-renames <5 commits>
```

收尾还需跑本轮 v1 文档 scoped whitespace 检查。

### 38.4 后续状态

本节的下一刀建议已被 2026-07-07 P3 第四次 range check 取代；当前 anchor 以第 2A 节协作表和 [upstream-checkpoint.md](./upstream-checkpoint.md) 为准。下一次 P3 loop 从 Codex `8917244f7dcc1a945f3d5eba3dea53f6dbb16349` 与 opencode `eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c` 起算。

## 39. P2 Tool lifecycle App Server owner 代码记录

记录时间：2026-07-06。

本节接管 App Server runtime tool lifecycle 的窄写集，不接管 `lime-agent` tool execution 热区。当前 `agent_tools/**`、`request_tool_policy/**`、App Server runtime_backend 与前端 hooks 仍为并行脏热区；本进程只改 `runtime/tool_lifecycle.rs`、`runtime/tool_lifecycle_tests.rs`、`runtime/tests/external_events/tool_lifecycle.rs` 和本计划文件。

### 39.1 代码结论

- `lime-rs/crates/app-server/src/runtime/tool_lifecycle.rs` 已把松散的 `pending_action_id / denied` 状态收成 `ToolLifecycleSnapshot`、`ToolGateState`、`ToolApprovalAction`、`ToolBlockDecision` typed owner。
- `sandbox.blocked` / `permission.denied` 不再只是 active tool 存在性检查；它们会进入 blocked gate，阻断后续 `tool.output.delta` / `tool.result`，但仍允许 `tool.failed` 关闭 active tool。
- `lime-rs/crates/app-server/src/runtime/tool_lifecycle_tests.rs` 是本轮新增的相邻测试模块，`tool_lifecycle.rs` 只保留 owner 逻辑和 `#[path = "tool_lifecycle_tests.rs"] mod tests;`，中心文件降到 753 行，满足仓库体量边界。
- `lime-rs/crates/app-server/src/runtime/tests/external_events/tool_lifecycle.rs` 已覆盖 RuntimeCore external events storage 前 fail-closed 和 sandbox block 后只允许 `tool.failed` 终结。

### 39.2 验证

已执行：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture
```

结果：

- `app-server` lib target：23 tests passed，0 failed。
- 覆盖 `runtime::tool_lifecycle::tests::*` 和 `runtime::tests::external_events::tool_lifecycle::*`，以及 `external_events::actions::append_external_runtime_events_keeps_tool_lifecycle_guards_with_sparse_context`。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check` 通过。
- scoped `git diff --check` 通过。
- 编译过程中只出现 `lime-agent` 既有 unused warning；未出现 app-server tool lifecycle 编译错误。

### 39.3 分类

- `current`：App Server runtime event lifecycle guard / RuntimeCore external event storage guard。
- `historical pending / superseded`：本节记录时 `lime-agent` tool execution typed owner / `agent_tools/tool_orchestrator.rs` consumer 仍等待热区释放或移交；后续 typed owner、consumer、RuntimeState pending resume 与 RuntimeBackend bridge evidence 已补齐。
- `compat`：vendor Aster / existing registry executor 只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 39.4 下一刀

1. 等 `agent_tools/**` 热区移交后，继续落 `lime-agent` tool execution typed owner，避免只在 App Server storage 边界做事后校验。
2. 下一刀仍应把 tool begin/end/error/output 的构造收进 `lime-agent` tool domain，而不是继续在 App Server storage 边界补事后规则。

## 40. P2 并行热区刷新记录

记录时间：2026-07-06。

本节只改 v1 文档，不接管 Rust / 前端 / governance 源码热区。当前路线图主线仍是 P2 Tool / Approval / Sandbox；App Server runtime lifecycle owner 已完成，下一条真正提高整体完成度的代码刀仍是 `lime-agent` tool execution typed owner。

### 40.1 只读盘点

已执行：

```bash
git status --short -- "internal/research/refactor/v1" "lime-rs/crates/agent/src/agent_tools" "lime-rs/crates/app-server/src/runtime" "src/components/agent/chat/hooks" "src/lib/governance"
git diff --name-only -- "internal/research/refactor/v1" "lime-rs/crates/agent/src/agent_tools" "lime-rs/crates/app-server/src/runtime" "src/components/agent/chat/hooks" "src/lib/governance"
```

结论：

- `lime-rs/crates/agent/src/agent_tools/**` 仍有修改和未跟踪相邻源码，本进程不接 `tool_orchestrator.rs` 或新增 native policy / truncation tests 文件。
- `lime-rs/crates/app-server/src/runtime/**` 仍有多处修改和未跟踪相邻源码，包括 context auto compaction 与 tool lifecycle 测试文件；本进程不改名、不删除、不合并。
- `src/components/agent/chat/hooks/**` 与 `src/lib/governance/**` 仍有并行改动，本进程不把 UI hook 或 governance 测试纳入写集。

### 40.2 本轮写集

本轮认领写集：

- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/runtime-core/**`
- `src/components/agent/chat/hooks/**`
- `src/lib/governance/**` 中未移交的并行改动

### 40.3 分类

- `current`：v1 文档作为 P2 handoff / 协调事实源；App Server runtime lifecycle owner 已完成。
- `historical pending / superseded`：本节记录时 `lime-agent` tool execution typed owner / orchestrator consumer 等待热区释放或明确移交；后续 typed owner、consumer、RuntimeState pending resume 与 RuntimeBackend bridge evidence 已补齐。
- `compat`：vendor Aster / existing registry executor 只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden。

### 40.4 下一刀

该历史下一刀已由后续 P2 Tool / Approval / Sandbox owner、bridge evidence 与第十六刀 combo evidence 覆盖。当前下一刀见第 8 节与第 55.5 节：P2 Context / Token / Compaction。

## 41. Governance legacy report 共享验证记录

记录时间：2026-07-06。

本节只跑共享验证，不接管源码热区，也不把当前工作树中的 Rust / frontend 改动归属到本进程。主线收益：整体审计缺口里的 legacy / mock / old runtime 回流证据已补一刀，后续仍可把注意力留给 `lime-agent` Tool / Approval / Sandbox execution owner。

### 41.1 验证

已执行：

```bash
npm run governance:legacy-report
```

结果：

- 命令退出码 0。
- legacy surface report 边界违规 0。
- 摘要显示分类漂移候选 1 个：`rust-agent-subagent-metadata-direct-read -> deprecated / 零引用`。

### 41.2 分类

- `current`：`npm run governance:legacy-report` 作为 legacy / mock / old runtime 回流守卫，本轮通过。
- `deprecated / drift-candidate`：`rust-agent-subagent-metadata-direct-read` 当前报告为 `deprecated / 零引用`，后续可单独判断是否收成 `dead-candidate`；本轮不因该候选偏离 P2 主线。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden，报告未发现回流违规。

### 41.3 下一刀

1. 若 `agent_tools/**` 热区释放或移交，回到 P2 `lime-agent` tool execution typed owner。
2. 若热区继续占用，可继续 P3 upstream loop；不要把 `rust-agent-subagent-metadata-direct-read` 分类漂移候选扩成当前主线，除非用户明确要求治理该残留。

## 42. P2 `lime-agent` typed event construction owner 补强

记录时间：2026-07-06。

本节接管 `lime-rs/crates/agent/src/agent_tools/**` 的窄写集，基于当前工作树已有的 `tool_lifecycle.rs` / `tool_orchestrator.rs` 改动继续补强，不回滚隔壁进程内容。主线收益：P2 Tool / Approval / Sandbox 不再只停在 App Server storage guard，`lime-agent` tool domain 已持有 ToolStart / ActionRequired / ToolEnd 的 typed construction owner，并补了 approval / sandbox 阻断后无 output delta 的行为证据。

### 42.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/mod.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`

继续接收当前工作树已有但非本轮首创的相邻改动：

- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`

避让写集：

- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `src/components/agent/chat/hooks/**`
- `src/lib/governance/**` 中未移交的并行改动

### 42.2 代码结论

- `tool_lifecycle` 从 private module 调整为 `pub(crate) mod tool_lifecycle`，明确它是 crate 内 current owner，而不是 `tool_orchestrator.rs` 的隐式 helper。
- `ToolExecutionLifecycleEvents` 已从只记录状态推进到读取状态：只有 `Active` tool 透传 stream output，terminal 后重复 outcome 返回空事件。
- `tool_orchestrator/lifecycle_gate_tests.rs` 覆盖 approval-required tool 在批准前不得发出 `ToolOutputDelta`。
- `tool_orchestrator/lifecycle_gate_tests.rs` 覆盖 sandbox-blocked tool 不得发出 `ToolOutputDelta`。

### 42.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs" "lime-rs/crates/agent/src/agent_tools/mod.rs"
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
```

结果：

- `tool_lifecycle`：5 tests passed。
- `tool_orchestrator`：15 tests passed。
- `cargo check -p lime-agent --lib` 通过。
- scoped rustfmt check 通过；完整 `cargo fmt -p lime-agent --check` 仍会被非本轮文件 `subagent_runtime_adapter.rs` 的并行格式差异阻断，本轮不夹写。
- 仍有既有 warning：`agent_tools/execution/tests.rs` 中 `WorkspaceToolSurface` unused import；本轮不顺手改非目标测试文件。

### 42.4 分类

- `current`：`lime-agent` `agent_tools/tool_lifecycle.rs` 作为 Tool / Approval / Sandbox typed event construction owner；`tool_orchestrator.rs` 作为 consumer。
- `current`：approval-required / sandbox-blocked 后的 `ToolOutputDelta` 过滤、active-only stream gate 与 terminal 后重复 outcome 去重已进入 `tool_lifecycle` owner。
- `historical pending`：该节记录时 Evidence correlation 与更完整 process / terminal correlation 尚未完全收进 `tool_lifecycle` owner；process correlation 已由第 44 刀承接，terminal correlation 已由第 45 刀承接。
- `compat`：vendor Aster / existing registry executor 只作为事件和执行兼容面，不承接 Tool / Approval / Sandbox truth。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 Codex `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 42.5 下一刀

该历史下一刀已拆成第 44 刀 process correlation、第 45 刀 terminal correlation 与第 46 刀 approval resolved terminal transition；Evidence export correlation 已由第 47 刀承接，action/tool identity split 已由第 48 刀承接。当前下一刀见 49.5 / 50 的真实 Aster pending tool resumed execution。

## 43. P2 `lime-agent` approval pending terminal transition 第一刀

记录时间：2026-07-06。

本节接续 42 节，只接管 `tool_lifecycle.rs` 与 `tool_orchestrator/lifecycle_gate_tests.rs` 的审批 pending 语义，不改 native tool policy、inventory/catalog、truncation、request policy 或 App Server runtime/backend 热区。主线收益：approval-required 不再被误当成失败终态，`ActionRequired` 后必须等待 action resolved，符合 App Server `tool.started -> action.required -> action.resolved -> tool.result/tool.failed` lifecycle guard。

### 43.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- `lime-rs/vendor/aster-rust/**`
- App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区

### 43.2 代码结论

- `ToolExecutionLifecycleEvents` 遇到 approval-required outcome 时只发 `ActionRequired`，并把 tool 状态置为 `AwaitingApproval`。
- pending approval 状态下重复收到同一 outcome 返回空事件，避免重复 action。
- approval-required tool 不再抢先发失败 `ToolEnd`；sandbox / permission block 仍按失败终态关闭。
- `lifecycle_gate_tests.rs` 已把 approval-required 的回归断言从“最后是 ToolEnd”改成“没有 ToolEnd，等待 action resolved”。

### 43.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs"
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
```

结果：

- `cargo check -p lime-agent --lib` 通过。
- `tool_lifecycle`：5 tests passed。
- `tool_orchestrator`：15 tests passed。
- App Server `tool_lifecycle`：23 tests passed。
- 仍有既有 warning：`agent_tools/execution/tests.rs` 中 `WorkspaceToolSurface` unused import；本轮不夹写。

### 43.4 分类

- `current`：`lime-agent` `tool_lifecycle.rs` 的 approval pending gate；`tool_orchestrator/lifecycle_gate_tests.rs` 的 no-ToolEnd-before-approval 回归。
- `historical pending`：该节记录时 Evidence correlation 与 process / terminal correlation 仍需下一刀前移到 `tool_lifecycle` owner；process correlation 已由第 44 刀承接，terminal correlation 已由第 45 刀承接。
- `compat`：vendor Aster / existing registry executor 仍只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 Codex `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 43.5 下一刀

该历史下一刀已拆成第 44 刀 process correlation、第 45 刀 terminal correlation 与第 46 刀 approval resolved terminal transition；Evidence export correlation 已由第 47 刀承接，action/tool identity split 已由第 48 刀承接。当前下一刀见 49.5 / 50 的真实 Aster pending tool resumed execution。

## 44. P2 `lime-agent` process lifecycle correlation 第一刀

记录时间：2026-07-06。

本节接续 43 节，只接管 `tool_lifecycle.rs`、`tool_orchestrator.rs` 与 `tool_orchestrator/tests.rs` 的 live process lifecycle / stdout stderr event 构造，不改 native tool policy、inventory/catalog、truncation、request policy 或 App Server runtime/backend 热区。主线收益：process lifecycle / output delta 不再由 `tool_orchestrator.rs` 手写事件 shape，统一进入 `tool_lifecycle` owner，并稳定携带 App Server / Evidence 可读取的 tool correlation metadata。

### 44.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区

### 44.2 代码结论

- 新增 `ToolProcessLifecycleSnapshot`，负责把 process lifecycle metadata 转成 `ToolOutputDelta { output_kind: "process" }`。
- 新增 `ToolExecutionOutputDeltaSnapshot`，负责把 `ExecutionOutputDelta` 转成 stdout / stderr / combined `ToolOutputDelta`。
- 两类 snapshot 都会补 `toolCallId`、`toolId`、`tool_id` 和 `executionSurface=live_process`，让 App Server projection / evidence provider 可以从 metadata 或 event tool id 双路关联。
- `tool_orchestrator.rs` 不再手写 live process lifecycle / stdout stderr `ToolOutputDelta`，只委托 `tool_lifecycle` helper。
- `tool_orchestrator` live process 回归断言已覆盖 process start / terminal / stdout delta 均携带 tool correlation metadata。

### 44.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs" "lime-rs/crates/agent/src/agent_tools/mod.rs"
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
```

结果：

- `tool_lifecycle`：7 tests passed；第 45 刀新增 terminal correlation 用例后为 9 tests passed；第 46 刀新增 approval resolved terminal gate 后为 11 tests passed；第 48 刀新增 action/tool identity split 后当前为 13 tests passed。
- `tool_orchestrator`：15 tests passed。
- `cargo check -p lime-agent --lib` 通过。
- scoped rustfmt check 通过。
- 仍有既有 warning：`agent_tools/execution/tests.rs` 中 `WorkspaceToolSurface` unused import；本轮不夹写。

### 44.4 分类

- `current`：`lime-agent` `tool_lifecycle.rs` 的 process lifecycle / output delta event owner。
- `current`：`tool_orchestrator.rs` 作为 live process execution consumer，只提供 process metadata / output delta，不再手写 event shape。
- `historical pending`：该节记录时完整 Evidence export correlation 与 approval resolved 后 terminal transition 仍需下一刀继续前移；approval resolved terminal transition 已由第 46 刀承接，Evidence export correlation 已由第 47 刀承接。
- `compat`：vendor Aster / existing registry executor 仍只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 Codex `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 44.5 下一刀

该历史下一刀已由第 45 刀 terminal correlation 与第 46 刀 approval resolved terminal transition 承接；Evidence export correlation 已由第 47 刀承接，action/tool identity split 已由第 48 刀承接。当前下一刀见 49.5 / 50 的真实 Aster pending tool resumed execution。

## 45. P2 `lime-agent` terminal metadata correlation 第一刀

记录时间：2026-07-06。

本节接续 44 节，只接管 `tool_lifecycle.rs` 的 terminal metadata normalization，不改 `tool_orchestrator.rs`、native tool policy、inventory/catalog、truncation、request policy、live execution process 或 App Server runtime/backend 热区。主线收益：terminal `ToolEnd` 不再依赖下游 App Server storage guard 才补 tool correlation，Evidence / Item projection 可以稳定从终态 metadata 读取 `toolCallId` / `toolId` / `tool_id`。

### 45.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- `lime-rs/vendor/aster-rust/**`
- App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区

### 45.2 代码结论

- `ToolExecutionTerminalSnapshot::new(...)` 统一调用 terminal metadata normalization。
- 无 metadata 的 terminal outcome / terminal update 会生成 `Some(metadata)`，并补 `toolCallId`、`toolId`、`tool_id`。
- 已存在的 `toolCallId` / `toolId` / `tool_id` 不被覆盖，保留上游显式 correlation。
- `tool_end_event_from_update(...)` 与 `rewrite_tool_terminal_event(...)` 通过同一 owner 规则继承 terminal correlation。
- event shape 不变；本刀不新增协议字段、不改前端 projection、不改 App Server schema。

### 45.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/lifecycle_gate_tests.rs"
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture
```

结果：

- scoped rustfmt check 通过。
- `cargo check -p lime-agent --lib` 通过。
- `tool_lifecycle`：9 tests passed。
- `tool_orchestrator`：15 tests passed。
- App Server `tool_lifecycle`：23 tests passed。
- 仍有既有 warning：`agent_tools/execution/tests.rs` 中 `WorkspaceToolSurface` unused import；本轮不夹写。

### 45.4 分类

- `current`：`lime-agent` `tool_lifecycle.rs` 的 terminal `ToolEnd` metadata correlation owner。
- `current`：App Server `runtime/tool_lifecycle.rs` 继续作为下游 sequence validation guard，不承接 `lime-agent` terminal metadata truth。
- `historical pending`：该节记录时 approval resolved 后 terminal transition 与 Evidence export correlation 仍需下一刀继续前移；approval resolved terminal transition 已由第 46 刀承接，Evidence export correlation 已由第 47 刀承接。
- `compat`：vendor Aster / existing registry executor 仍只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 Codex `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 45.5 下一刀

该历史下一刀已由第 46 刀 approval resolved terminal transition 承接；Evidence export correlation 已由第 47 刀承接，action/tool identity split 已由第 48 刀承接。当前下一刀见 49.5 / 50 的真实 Aster pending tool resumed execution。

## 46. P2 `lime-agent` approval resolved terminal transition 第一刀

记录时间：2026-07-06。

本节接续 45 节，只接管 `tool_lifecycle.rs` 的 approval resolved terminal gate，不改 App Server `runtime/**` / `runtime_backend/**`、`tool_orchestrator.rs`、native tool policy、inventory/catalog、truncation、request policy、live execution process 或前端热区。主线收益：pending approval 后的 terminal 不再靠 App Server storage guard 事后拒绝；`lime-agent` tool lifecycle owner 先识别 `action.resolved`，再决定是否允许 terminal/output 继续 materialize。

### 46.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- `lime-rs/vendor/aster-rust/**`
- App Server runtime / runtime_backend / RuntimeCore / frontend / governance 热区

### 46.2 代码结论

- 新增 `ToolApprovalResolutionSnapshot::from_outcome(...)`，从 terminal outcome metadata 的 `actionEventClass=action.resolved` 或 `eventClass=action.resolved` 识别 approval resolution。
- `ToolExecutionLifecycleEvents` 在 `AwaitingApproval` 状态下继续拒绝普通 terminal outcome；只有识别到 resolved metadata 后才发 `ActionResolved` 并打开后续 terminal gate。
- `confirmed=true` / approve 决策允许同一 terminal outcome 继续发 output delta 与 `ToolEnd`。
- `confirmed=false` 或 deny 决策进入 `ApprovalDenied`，拒绝成功 terminal，只允许失败 `ToolEnd`，且不透传 output delta。
- `ActionResolved` data 稳定携带 `toolCallId`、`toolId`、`tool_id`、`requestId`、`actionId`、`actionType`、`confirmed`、`decision`，已由第 47 刀 App Server Evidence export correlation 消费。
- event shape 不变；本刀不新增协议字段、不改前端 projection、不改 App Server schema。
- `tool_lifecycle.rs` 触碰后按仓库体量边界拆出 `tool_lifecycle/tests.rs`；当前主文件仍为 522 行，后续接 action/respond 时不得继续把测试或 orchestration 分支堆回 owner 文件。

### 46.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs"
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
```

结果：

- scoped rustfmt check 通过。
- `cargo check -p lime-agent --lib` 通过。
- `tool_lifecycle`：11 tests passed；第 48 刀 action/tool identity split 后当前为 13 tests passed。
- 仍有既有 warning：`agent_tools/execution/tests.rs` 中 `WorkspaceToolSurface` unused import，以及若干 Aster snapshot adapter dead-code warning；本轮不夹写。

### 46.4 分类

- `current`：`lime-agent` `tool_lifecycle.rs` 的 approval resolved terminal gate owner。
- `current`：App Server `runtime/tool_lifecycle.rs` 继续作为下游 sequence validation guard，不承接 `lime-agent` approval resolved terminal truth。
- `current`：本刀为 Evidence export correlation 提供 action/tool 字段；App Server evidence consumer 已由第 47 刀完成。
- `compat`：vendor Aster / existing registry executor 仍只作为事件和执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、把 Codex `exec_command` 折回 legacy `Bash` alias 的路径继续 forbidden。

### 46.5 下一刀

该历史下一刀已由第 47 刀 Evidence export correlation 承接。当前下一刀是 `agentSession/action/respond` 后真实 resumed tool execution，把用户批准后的同一 pending tool 接回 current execution owner。

## 47. P2 Evidence export correlation 第一刀

记录时间：2026-07-06。

本节接续 46 节，只接 App Server `evidence/export` coding summary 与 coding snapshot 回归，不改 `tool_orchestrator.rs`、request policy、live execution process、RuntimeCore 或前端 projection。主线收益：approval/action 已不只是 storage event，Evidence Pack 能审计 `action.required -> action.resolved -> tool.result` 是否指向同一 tool。

### 47.1 写集

本轮实际修改：

- `lime-rs/crates/app-server/src/runtime/evidence_provider.rs`
- `lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`
- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- `lime-rs/vendor/aster-rust/**`
- App Server runtime / runtime_backend 其它脏文件、RuntimeCore / frontend / governance 热区

### 47.2 代码结论

- `coding_evidence_summary(...)` 已新增 `actionRequestIds` 与 `actionToolCallIds`，从 `action.required` / `action.resolved` payload 中收集 action id、request id 与 tool call id。
- `coding_snapshot` 事件顺序改为 `tool.started -> action.required -> action.resolved -> tool.result`，更贴近 Codex-style approval lifecycle。
- `action.resolved` payload 会继承 pending action 的 `toolCallId`，Evidence Pack summary 也会输出同一 tool id，便于后续 replay / review 判断 approval resolution 是否对应真实 terminal tool。
- 本刀不新增 App Server method、不改 protocol event shape、不触碰 legacy `agent_runtime_*` production surface。

### 47.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/app-server/src/runtime/evidence_provider.rs" "lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs"
cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_coding_snapshot_artifacts -- --nocapture
```

结果：

- scoped rustfmt check 通过。
- `cargo check -p lime-agent --lib` 通过。
- `tool_lifecycle`：11 tests passed；第 48 刀 action/tool identity split 后当前为 13 tests passed。
- `export_evidence_pack_includes_coding_snapshot_artifacts`：1 test passed。
- 仍有既有 warning：Aster snapshot adapter dead code、`WorkspaceToolSurface` unused import；本轮不夹写。

### 47.4 分类

- `current`：App Server `evidence/export` coding summary 是 action/tool correlation 的 evidence owner。
- `current`：`lime-agent` `tool_lifecycle.rs` 是 approval resolved terminal gate owner。
- `historical pending / still-current-gap`：本节记录时 `agentSession/action/respond` 后真实 resumed tool execution 尚未完成；第 53 节已纠正历史绿灯，当前 bridge 仍失败，以第 52 节和顶部协作表为准。
- `compat`：vendor Aster / existing registry executor 仍只作为受控执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

### 47.5 下一刀

该历史下一刀已由第 48 刀先收 action id / tool id 解耦前置约束。当前下一刀仍是真实 P2 `action/respond` resumed tool execution：在 App Server runtime / runtime_backend 热区释放或用户授权接管后，把用户批准后的同一 pending tool 接回 current execution owner，而不是只发 `action.resolved` storage event。

## 48. P2 action/respond action/tool identity split pre-wiring

记录时间：2026-07-06。

本节接续 47 节，只接 `lime-agent` `tool_lifecycle` owner 的 action id / tool id 解耦，不改 App Server `respond_action`、runtime_backend、request policy、live execution process、RuntimeCore 或前端 projection。主线收益：后续 `agentSession/action/respond` 接真实 resumed execution 时，approval action id 不会再被误当成 tool call id，pending lifecycle 也能用 `toolCallId` 释放。

### 48.1 写集

本轮实际修改：

- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`
- `internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md`
- `internal/research/refactor/v1/p2-runtime-skeleton.md`
- `internal/research/refactor/v1/quality-fixture-matrix.md`
- `internal/research/refactor/v1/completion-audit.md`

避让写集：

- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/tests.rs`
- `lime-rs/crates/agent/src/agent_tools/catalog.rs`
- `lime-rs/crates/agent/src/agent_tools/inventory.rs`
- `lime-rs/crates/agent/src/agent_tools/native_tool_policy_gate.rs`
- `lime-rs/crates/agent/src/agent_tools/tool_orchestrator/truncation_tests.rs`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- RuntimeCore / frontend / governance 热区

### 48.2 代码结论

- `ToolApprovalActionSnapshot` 现在会从 approval metadata 解析独立 `actionId` / `requestId`，并用 `toolCallId` / `toolId` 作为 lifecycle tool id；缺失时仍向后兼容 fallback 到 outcome tool id。
- `ToolApprovalResolutionSnapshot` 同样优先用 `toolCallId` / `toolId` 识别待释放的 pending tool，用 `actionId` / `requestId` 作为 ActionResolved request id。
- `ToolExecutionLifecycleEvents` 用解析出的 tool id 判断 `AwaitingApproval` / `ApprovalDenied` / `Terminal` 状态，并把同一 terminal `ToolEnd` 归到该 tool id，避免 resumed terminal 被 action id 错绑。
- 新增 distinct action/tool id 单测，固定 `ActionRequired(action-approval, tool-call-approval)` 与 `ActionResolved(action-approval, tool-call-approval) -> ToolEnd(tool-call-approval)` 的链路。
- 本刀不新增 App Server method、不改协议 enum shape、不触碰 legacy `agent_runtime_*` production surface。

### 48.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/agent/src/agent_tools/tool_lifecycle.rs" "lime-rs/crates/agent/src/agent_tools/tool_lifecycle/tests.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator -- --nocapture
```

结果：

- scoped rustfmt check 通过。
- `tool_lifecycle`：13 tests passed。
- `tool_orchestrator`：15 tests passed。
- 仍有既有 warning：Aster snapshot adapter dead code、`WorkspaceToolSurface` unused import；本轮不夹写。

### 48.4 分类

- `current`：`lime-agent` `tool_lifecycle.rs` 是 action id / tool id 解耦和 approval terminal lifecycle owner。
- `historical pending / still-current-gap`：本节记录时 App Server `agentSession/action/respond` 到真实 resumed tool execution 的接线尚未完成；第 53 节已纠正历史绿灯，当前 bridge 仍失败，以第 52 节和顶部协作表为准。
- `compat`：vendor Aster / existing registry executor 仍只作为受控执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

### 48.5 下一刀

该历史下一刀已由第 49 刀先补 RuntimeCore `action/respond` lifecycle guard。当前下一刀仍是真实 Aster pending tool resumed execution：证明用户批准后，同一 pending tool 的 Aster execution future 被释放并产出 terminal/output，而不是只通过 App Server storage guard 解锁后续外部事件。

## 49. P2 RuntimeCore action/respond lifecycle guard 第一刀

记录时间：2026-07-06。

本节接续 48 节，只补 App Server RuntimeCore `action/respond` API 层回归，不改 `runtime_backend/action_response.rs`、`turn_execution.rs`、`request_tool_policy/**`、`live_execution_process.rs`、`tool_orchestrator.rs` 或 Aster vendor。主线收益：正式 `RuntimeCore::respond_action(...)` 路径不再只靠手工 append 测试证明；它能从 pending action 继承同一 `toolCallId`，并释放 App Server lifecycle guard 对后续 `tool.result` 的阻断。

### 49.1 写集

本轮实际修改：

- `lime-rs/crates/app-server/src/runtime/tests/external_events/actions.rs`
- `internal/research/refactor/v1/priority-tracking-plan.md`

避让写集：

- `lime-rs/crates/app-server/src/runtime/turn_execution.rs`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/request_tool_policy/**`
- `lime-rs/crates/agent/src/live_execution_process.rs`
- `lime-rs/vendor/aster-rust/**`
- RuntimeCore / frontend / governance 其它热区

### 49.2 代码结论

- 新增 `respond_action_infers_tool_id_and_unblocks_pending_tool_result`，先写入 `tool.started` 与不带 `toolCallId` 的 `action.required`，再通过正式 `core.respond_action(...)` 发送 `ToolConfirmation` approve。
- 断言返回的 `action.resolved` 自动回填 `toolCallId=tool_after_respond_approval`，证明 `respond_action` 进入同一 App Server lifecycle normalization。
- 随后追加 `tool.result` 并断言通过，证明 `respond_action` 已释放 App Server lifecycle guard 的 pending approval 阻断。
- 本刀不声称真实 Aster pending tool 已端到端恢复；`RuntimeBackend::respond_action` 虽已调用 `AgentRuntimeState::confirm_tool_action(...)`，仍缺 Aster pending execution future 的集成证据。

### 49.3 验证

已执行：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/tests/external_events/actions.rs"
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture
```

结果：

- scoped rustfmt check 通过。
- `respond_action_infers_tool_id_and_unblocks_pending_tool_result`：1 test passed。
- 仍有既有 warning：Aster snapshot adapter dead code；本轮不夹写。

### 49.4 分类

- `current`：RuntimeCore `respond_action` API 的 lifecycle guard 由 App Server runtime tests 固定。
- `current`：App Server `runtime/tool_lifecycle.rs` 继续负责 action/tool correlation normalization 与 sequence validation。
- `historical pending / superseded by 51 and 55`：本节记录时真实 Aster pending tool resumed execution 仍未完成；该底层证据已由第 51 节记录的 RuntimeState 回归关闭，随后 App Server RuntimeBackend bridge fixture 也已由第 55 节关闭。
- `compat`：vendor Aster / existing registry executor 仍只作为受控执行兼容面。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

### 49.5 下一刀

历史下一刀已由第 51 节和第 55 节覆盖：真实 resumed execution 与 RuntimeBackend bridge evidence 均已跑出通过证据。

## 50. P2 真实 Aster pending resume 接管阻塞复核

记录时间：2026-07-06。

本节接续 49 节。当前进程只读复核真实 Aster pending tool resumed execution，不接管源码热区。主线收益：明确下一刀不是继续补 App Server storage guard，而是要证明 `RuntimeBackend::respond_action -> AgentRuntimeState::confirm_tool_action -> Aster Agent::handle_confirmation -> pending tool future` 真实释放并产出 output/terminal。

### 50.1 scoped status

已执行：

```bash
git status --short -- "lime-rs/crates/app-server/src/runtime" "lime-rs/crates/app-server/src/runtime_backend" "lime-rs/crates/agent/src/agent_tools" "lime-rs/crates/agent/src/request_tool_policy" "lime-rs/crates/agent/src/live_execution_process.rs" "lime-rs/vendor/aster-rust"
```

结论：

- `lime-rs/crates/agent/src/agent_tools/**`、`lime-rs/crates/agent/src/request_tool_policy/**`、`lime-rs/crates/agent/src/live_execution_process.rs` 当前均有未归属改动。
- `lime-rs/crates/app-server/src/runtime/**` 与 `runtime_backend/request_context*` 当前有未归属改动。
- `lime-rs/vendor/aster-rust/**` 当前也有未归属改动。
- 因此本轮不能直接补真实 Aster pending execution 源码测试，否则会夹写隔壁进程。

### 50.2 只读链路结论

- `RuntimeBackend::respond_action(...)` 已通过 `action_response::handle_action_response(...)` 处理 action response。
- `ToolConfirmation` 分支已调用 `AgentRuntimeState::confirm_tool_action(...)`。
- `AgentRuntimeState::confirm_tool_action(...)` 已调用 `submit_runtime_tool_action_confirmation(...)`。
- `submit_runtime_tool_action_confirmation(...)` 已取得 Aster `Agent` 并调用 `Agent::handle_confirmation(...)`。
- Aster `Agent::handle_confirmation(...)` 会先 `complete_runtime_request_item(...)`，再向 `confirmation_tx` 发送 `(request_id, confirmation)`。
- 当前缺口不是“App Server 没调用 confirm”，而是缺少端到端测试证明真实 pending tool execution future 收到该 confirmation 后继续执行并产生 output/terminal。

### 50.3 接管条件

下一刀必须满足以下任一条件后才能动源码：

1. 隔壁进程在本计划文件标注移交 `agent_tools/**`、`request_tool_policy/**`、`live_execution_process.rs` 和需要的 Aster vendor 写集。
2. 用户明确授权当前进程接管上述热区。
3. scoped status 显示目标写集已干净，且无需触碰 Aster vendor。

满足条件后，推荐第一代码切片：

```text
真实 Aster pending tool request
  -> RuntimeBackend::respond_action(ToolConfirmation approve)
  -> AgentRuntimeState::confirm_tool_action
  -> Aster Agent::handle_confirmation
  -> pending tool execution future emits output/terminal
```

最小验证仍优先：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server <true_aster_pending_resume_test> -- --nocapture
```

如落点转入 `lime-agent`，则改为：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent <true_aster_pending_resume_test> -- --nocapture
```

### 50.4 分类

- `current`：App Server `respond_action` API、`runtime_backend/action_response.rs`、`AgentRuntimeState::confirm_tool_action(...)` 和 Aster `Agent::handle_confirmation(...)` 是当前确认链。
- `historical pending / superseded by 51 and 55`：本节记录时真实 Aster pending tool execution future 恢复证据仍未落测试；该底层证据已由第 51 节记录的 RuntimeState 回归关闭，随后 App Server RuntimeBackend bridge fixture 也已由第 55 节关闭。
- `compat`：Aster vendor 仍是受控 executor / event adapter，不应在未移交时夹写。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

## 51. P2 RuntimeState/Aster pending resume 证据与 bridge 缺口刷新

记录时间：2026-07-06。

本节接续 50 节。第 50 节的“真实 Aster pending tool execution future 恢复证据仍未落测试”已由 `lime-agent` RuntimeState 回归部分关闭；本节当时把剩余缺口收窄为 App Server `RuntimeBackend::respond_action(ToolConfirmation)` 到同一 RuntimeState resume fixture 的桥接回归，该 bridge 缺口随后由第 55 节关闭。

### 51.1 已完成证据

- `lime-rs/crates/agent/src/runtime_state.rs` 新增 `confirm_tool_action_resumes_pending_aster_tool_execution`。
- 测试 provider 发出 `RuntimeApprovalResume` tool request，测试 `ToolInspector` 强制该 tool 进入 Aster manual approval gate。
- 流式任务收到 `ActionRequired(tool_confirmation)` 后保持 pending；调用 `AgentRuntimeState::confirm_tool_action("req-runtime-confirm", true)` 后，Aster pending tool future 被释放。
- 断言后续产出 `ToolEnd { output: "runtime-confirmed" }` 与最终文本 `provider observed resumed tool`。

验证：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent --check
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture
```

结果：`lime-agent` 定向测试 1 passed。

### 51.2 当前剩余缺口

当前仍不能宣布 P2 Tool / Approval / Sandbox 完整完成，因为还缺 App Server bridge 级测试：

```text
真实 Aster pending tool request
  -> RuntimeBackend::respond_action(ToolConfirmation approve)
  -> AgentRuntimeState::confirm_tool_action
  -> Aster Agent::handle_confirmation
  -> pending tool execution future emits output/terminal
```

本轮复核时 `lime-rs/crates/app-server/src/runtime_backend/**`、`lime-rs/crates/agent/src/lib.rs` 与 `lime-rs/crates/agent/src/runtime_support.rs` 均存在并行脏改；补 App Server bridge fixture 需要测试注入点或 test-support seam，当前不夹写这些热区。

### 51.3 下一刀

优先补 App Server bridge 回归。推荐只在目标写集干净或明确移交后执行：

```text
lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs
lime-rs/crates/agent/src/test_support.rs
lime-rs/crates/agent/src/lib.rs
lime-rs/crates/agent/src/runtime_support.rs
```

若 `lib.rs` / `runtime_support.rs` 仍被隔壁进程持有，不要夹写；只保留当前 RuntimeState 证据并等待接管窗口。

### 51.4 分类

- `current`：`AgentRuntimeState::confirm_tool_action(...)`、App Server `RuntimeBackend::respond_action(...)` 与 `runtime_backend/action_response.rs` 是确认主链。
- `current done`：RuntimeState -> Aster pending future resume 证据已完成。
- `historical pending / superseded by 55`：本节记录时 App Server RuntimeBackend -> RuntimeState bridge fixture 尚未完成；该 bridge evidence 已由第 55 节关闭。
- `compat`：Aster vendor 仍是受控 executor / event adapter，不作为新增 App Server 平行 runtime owner。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

## 52. P2 RuntimeState resume 复跑通过与 bridge 运行失败（历史记录）

记录时间：2026-07-06。

本节接续 51 节，记录当前工作树的验证结果。第 51 节的 RuntimeState/Aster pending resume 历史完成记录已被复跑重新确认，但 App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge 用例运行失败。第 53 节已纠正历史绿灯，当前 bridge 事实仍以本节失败结果和顶部协作表为准。

### 52.1 本轮认领与避让

本轮只认领 v1 文档：

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让源码热区：

```text
lime-rs/crates/agent/src/runtime_state.rs
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/agent/src/agent_tools/**
lime-rs/crates/agent/src/request_tool_policy/**
lime-rs/crates/agent/src/live_execution_process.rs
lime-rs/vendor/aster-rust/**
```

主线收益：保留并行期间的失败证据，方便解释第 53 节为何必须纠正历史绿灯；该 pending / failing 口径已由第 55 节 supersede。

### 52.2 最新验证结果

通过：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture
```

结果：`1 passed`。该结果只证明 App Server RuntimeCore `respond_action` lifecycle guard 仍能从 pending action 回填 `toolCallId` 并允许后续 `tool.result`，不证明真实 Aster pending future 已恢复。

通过：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture
```

结果：`1 passed`。该结果证明 `AgentRuntimeState::confirm_tool_action(...) -> Aster pending tool future -> ToolEnd/final text` 底层路径当前可用。

失败：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture
```

结果：编译通过，测试运行失败。panic 位于：

```text
crates/app-server/src/runtime_backend/initialization_tests.rs:223
tool confirmation request id
```

这说明第十四刀之前的 bridge fixture 已有测试形状，但 `ExecutionBackend::start_turn` 未在测试等待窗口内向 sink 送出 `ActionRequired(tool_confirmation)`。第十四刀已修正 fixture 的 live process hook 构造、timeout provider request 诊断和测试命令内容；第十五刀已复跑通过。本节只保留为历史失败诊断，第 55 节是当前事实源。

### 52.3 后续状态

本节的接管条件已由第十四刀部分满足：`initialization_tests.rs` fixture 已接入 live `ExecutionProcessServer`。第十五刀复跑已经证明 provider requests / events 能 materialize `ActionRequired(tool_confirmation)` 并释放同一 pending future；后续不再按本节旧接管点继续修 sink forwarding。

### 52.4 分类

- `current passing`：App Server RuntimeCore `respond_action` lifecycle guard。
- `current passing`：`AgentRuntimeState::confirm_tool_action(...) -> Aster pending tool future` 最新复跑通过。
- `historical pending-verification / superseded by 55`：App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge fixture 当时已稳定但验证尚未完成。
- `compat`：Aster vendor 仍是受控 executor / adapter；本轮不在 vendor 补新能力。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore。

## 53. P2 RuntimeBackend bridge 历史绿灯纠正

记录时间：2026-07-06。

本节原先把 `respond_action_tool_confirmation_resumes_pending_aster_tool_future` 标记为绿色。后续复跑曾推翻该结论：用例编译通过但运行失败，panic 在 `tool confirmation request id`。再后续第十五刀已通过 bridge fixture。因此第 53 节只保留为历史误标纠正，当前事实以第 55 节和顶部协作表为准。

### 53.1 本轮认领与避让

本轮源码写集只认领：

```text
lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs
```

同步更新 v1 文档：

```text
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让并行热区：

```text
lime-rs/crates/agent/src/lib.rs
lime-rs/crates/agent/src/runtime_state.rs
lime-rs/crates/agent/src/runtime_support.rs
lime-rs/crates/app-server/src/runtime_backend/request_context.rs
lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs
lime-rs/crates/app-server/src/runtime_backend/tests/model_selection.rs
lime-rs/crates/app-server/src/runtime_backend/tool_events.rs
lime-rs/crates/app-server/src/runtime_backend/tool_process_metadata.rs
```

### 53.2 已存在但历史失败的回归入口

回归用例：

```text
respond_action_tool_confirmation_resumes_pending_aster_tool_future
```

目标测试路径：

```text
ExecutionBackend::start_turn
  -> 本地 OpenAI-compatible SSE fixture 发出 Bash tool call req-runtime-confirm
  -> Runtime emits action.required
  -> ExecutionBackend::respond_action(ToolConfirmation confirmed=true)
  -> action.resolved
  -> AgentRuntimeState::confirm_tool_action
  -> Aster pending tool future resumes
  -> tool.result output contains runtime-confirmed
  -> final message.delta contains provider observed resumed tool
  -> turn.completed
```

该测试还计划断言 provider 第二次请求包含 tool response，避免只验证 App Server storage event。历史失败发生在获取 `tool_confirmation request id` 之前，当时说明 `ExecutionBackend::start_turn` 未向测试 sink 送出 `ActionRequired(tool_confirmation)`。

验证：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture
```

最新结果：

```text
app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future: failed
panic: runtime_backend/initialization_tests.rs:223 tool confirmation request id
```

说明：本轮不夹写源码热区，未改 `runtime_backend/initialization_tests.rs` 或相邻 App Server / Agent 文件。

### 53.3 下一刀

已由第 55 节关闭。以下是当时的历史下一刀，不再作为当前执行入口：

1. 修复 `ExecutionBackend::start_turn -> ActionRequired(tool_confirmation)` materialization / sink forwarding。
2. 重跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture`。
3. 只有 bridge fixture 通过后，才进入最终组合证据或 P2 其它深层模块第一代码刀。

### 53.4 分类

- `historical failing / superseded by 55`：App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge fixture。
- `test-only`：本地 OpenAI-compatible fixture 只作为 test-only provider，不调用生产 API。
- `compat`：Aster vendor 仍是受控 executor / adapter；本轮没有在 vendor 新增长期事实源。
- `deprecated`：旧 `agent_runtime_*` production surface 继续 retired guard-only。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper 继续 forbidden-to-restore。

## 54. P2 RuntimeBackend bridge 只读诊断与最小补丁候选

### 54.1 主线目标

继续迁移 Aster，不在 Aster vendor 里继续补业务能力。本节记录的是第十五刀前的 P2 Tool / Approval / Sandbox bridge 诊断；第十五刀已补齐 App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge 证据，因此本节不再是当前 blocker。

### 54.2 本轮只读结论

`RuntimeBackend::handle_turn_start(...)` 的顺序是：

```text
resolve provider route
  -> ensure_agent_initialized(db)
  -> install_live_execution_process_hook_if_available()
  -> register_current_native_tools_if_available()
  -> run_agent_turn_with_policy(...)
```

`install_live_execution_process_hook_if_available()` 只有在 backend 持有 `live_execution_process: Some(ExecutionProcessServer)` 时才会安装 hook。第十三刀诊断时，失败 fixture 的 backend 构造没有携带 `ExecutionProcessServer`，因此没有安装 live execution process gateway。它让本地 OpenAI-compatible provider 发出 `Bash` tool call，但没有 App Server process / approval gateway 承接，测试 sink 自然收不到 `ActionRequired(tool_confirmation)`。该具体 fixture 缺口已由第十四刀修正；`tool_events.rs` 已存在 `action_required -> action.required` 映射，当前证据仍不支持把 blocker 优先归因到 event mapper 丢事件。

### 54.3 最小补丁候选

在明确接管 `lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs` 的并行窗口后，第十四刀已落以下测试构造修正：

```rust
let backend = Arc::new(RuntimeBackend::with_db_and_execution_process_server(
    db,
    ExecutionProcessServer::default(),
));
```

这条补丁不修改 Aster vendor，不扩展 `lime-agent` tool policy，不新增 production command；它只让 bridge fixture 走 App Server current process / approval 链，验证正式 `ExecutionBackend::start_turn -> action.required -> respond_action` 是否能释放同一个 Aster pending tool future。

### 54.4 认领与避让

本轮实际写集：

```text
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md
internal/research/refactor/v1/priority-tracking-plan.md
```

只读源码：

```text
lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs
lime-rs/crates/app-server/src/runtime_backend.rs
lime-rs/crates/app-server/src/runtime_backend/live_execution_process.rs
lime-rs/crates/app-server/src/runtime_backend/tool_events.rs
lime-rs/crates/app-server/src/execution_process.rs
```

继续避让：

```text
lime-rs/crates/agent/src/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/vendor/aster-rust/**
```

说明：`runtime_backend/initialization_tests.rs` 当前已在并行脏写集，本轮不夹写源码。前一轮独立 target 的 `cargo test` 仍在 PID `99357` 编译运行时，本轮也不启动第二个同类 bridge 测试。

### 54.5 下一刀

已由第 55 节关闭。当前不再把 bridge fixture 当 blocker；后续只在回归失败时重新读取本节诊断。

历史推荐命令：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture
```

### 54.6 分类

- `historical failing / superseded by 55`：App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge fixture 在第十四刀前缺 live process hook 构造。
- `current`：App Server `ExecutionProcessServer` live process / approval gateway、`lime-agent` pending tool future resume。
- `test-only`：Local OpenAI-compatible SSE fixture。
- `compat`：Aster vendor 作为受控 executor / adapter，只读参考，不新增业务能力。
- `deprecated`：旧 `agent_runtime_*` production surface 继续 retired guard-only。
- `dead`：旧 `lime-rs/src/**` 与旧 Tauri wrapper 继续 forbidden-to-restore。

## 55. P2 RuntimeBackend bridge evidence done

### 55.1 主线目标

继续迁移 Aster 到 App Server current 主链。本节关闭第 52-54 节的 bridge blocker：不在 `lime-rs/vendor/aster-rust/**` 继续补业务能力，而是证明 App Server `RuntimeBackend` 通过正式 action/respond API 释放同一个 Aster pending tool future。

### 55.2 当前结论

`respond_action_tool_confirmation_resumes_pending_aster_tool_future` 已通过。该用例覆盖：

```text
ExecutionBackend::start_turn
  -> Aster/OpenAI-compatible fixture emits Bash tool_call
  -> App Server live ExecutionProcessServer hook emits action.required
  -> ExecutionBackend::respond_action(ToolConfirmation confirmed=true)
  -> AgentRuntimeState::confirm_tool_action
  -> Aster pending tool future resumes
  -> tool.result + message.delta + turn.completed
  -> provider receives tool response request
```

这说明当前 bridge 缺口已经从历史未验证口径进入 `runtimebackend-bridge-evidence-done`。

### 55.3 验证

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs" "lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target-bridge" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture
```

结果：

```text
respond_action_tool_confirmation_resumes_pending_aster_tool_future ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 800 filtered out
```

### 55.4 认领与避让

本轮写集：

```text
lime-rs/crates/app-server/src/runtime_backend/tests/coding_event_projection.rs
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-tool-approval-sandbox-handoff.md
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让：

```text
lime-rs/vendor/aster-rust/**
lime-rs/crates/agent/src/runtime_state.rs
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/initialization_tests.rs
lime-rs/crates/app-server/src/runtime_backend.rs
lime-rs/crates/app-server/src/runtime_backend/event_mapper.rs
```

### 55.5 下一刀

P2 Tool / Approval / Sandbox 的最小 bridge blocker 与 final combo evidence 已关闭，Context / Token typed owner 已完成。下一刀应按主线增量选择：

1. 转入 P2 Context / Token / Compaction consumer / Evidence export：把 skill / media / memory / workspace fragment 接到 `ContextFragmentEnvelope` / budget decision owner。
2. 或按主线收益选择 Plugin / Skills / MCP 四层分离、Realtime / Media / Collaboration item projection。
3. 只有热区合并或触碰 GUI 主路径后，才回到 Tool / Approval / Sandbox post-merge regression。

### 55.6 分类

- `current`：App Server `RuntimeBackend` bridge fixture、`ExecutionProcessServer` live process / approval gateway、`RuntimeCore` action/respond lifecycle guard、`lime-agent` pending future resume。
- `test-only`：Local OpenAI-compatible SSE fixture。
- `compat`：Aster vendor 作为受控 executor / adapter，只读参考，不新增业务能力。
- `deprecated`：旧 `agent_runtime_*` production surface 继续 retired guard-only。
- `dead`：旧 `lime-rs/src/**` 与旧 Tauri wrapper 继续 forbidden-to-restore。

## 56. P2 Plugin / Skills / MCP runtime capability owner

### 56.1 主线目标

本节推进 P2 Plugin / Skills / MCP 第一代码刀。主线收益：Plugin runtime capability truth 先从 App Server plugin package manifest projection 生成稳定 typed snapshot，后续 skill prompt injection、MCP runtime import 和 App Center projection 都消费同一个 owner，不在 UI 卡片、散落 JSON shape 或 Aster/vendor 路径里重新推断。

### 56.2 本轮实现

新增：

```text
lime-rs/crates/app-server/src/plugin_packages/runtime_capabilities.rs
```

接线：

```text
lime-rs/crates/app-server/src/plugin_packages.rs
lime-rs/crates/app-server/src/plugin_packages/plugin_manifest.rs
```

`runtime_capabilities.rs` 新增 `build_plugin_runtime_capabilities(...)`，从 projected plugin manifest 读取：

```text
name / appId / id
version
skillRefs / skills
toolRefs
agentRuntime.workflows
```

输出 `runtimeCapabilities` snapshot，覆盖：

```text
pluginId / version
skills[] + promptInjectionPolicy
tools[] + bindingKind
mcpBindings[]
workflowBindings[]
```

`plugin_manifest.rs` 只在 manifest projection 末尾插入 snapshot，不改已有 `entries` / `skillRefs` / `toolRefs` shape，不接 App Server runtime/backend，不让 App Center UI 成为 runtime capability truth。

### 56.3 验证

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/plugin_packages.rs" "lime-rs/crates/app-server/src/plugin_packages/plugin_manifest.rs" "lime-rs/crates/app-server/src/plugin_packages/runtime_capabilities.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-plugin-capabilities" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities -- --nocapture
```

定向测试结果：

```text
running 4 tests
snapshot_extracts_mcp_bindings_from_tool_refs ... ok
serialized_snapshot_uses_stable_manifest_field_names ... ok
snapshot_merges_skill_metadata_with_workflow_prompt_policy ... ok
resolved_plugin_manifest_includes_runtime_capability_snapshot ... ok

test result: ok. 4 passed; 0 failed; 806 filtered out
```

说明：测试期间出现的 `lime-agent` unused import warning 来自当前避让热区 `lime-rs/crates/agent/src/**`，本刀不接管。

### 56.4 认领与避让

本轮写集：

```text
lime-rs/crates/app-server/src/plugin_packages/runtime_capabilities.rs
lime-rs/crates/app-server/src/plugin_packages.rs
lime-rs/crates/app-server/src/plugin_packages/plugin_manifest.rs
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让：

```text
lime-rs/crates/agent/src/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/crates/thread-store/**
scripts/check-app-server-client-contract.mjs
src/lib/api/**
src/lib/governance/**
```

### 56.5 下一刀

P2 Plugin / Skills / MCP 下一刀不再新增第二套 manifest parser。第 58 节已补 App Center projection consumer；剩余优先从以下 runtime consumer 中选一个垂直切片：

1. skill prompt injection consumer：让 runtime turn context / prompt assembly 消费 `runtimeCapabilities.skills[].promptInjectionPolicy`。
2. MCP runtime import：把 `runtimeCapabilities.mcpBindings[]` 接到 App Server MCP server import / binding owner。

若 App Server runtime/backend 热区仍未释放，优先继续只读审计或转 Realtime / Media first typed owner。

### 56.6 分类

- `current`：App Server plugin package projection、`runtimeCapabilities` snapshot owner。
- `compat`：无新增；Aster/vendor 不参与 Plugin / Skills / MCP capability truth。
- `deprecated`：旧 `app.md` / 只靠 UI 卡片表达 runtime capability 的路径继续不作为实施入口。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 58. P2 Plugin App Center runtime capability projection consumer

### 58.1 主线目标

本节推进 P2 Plugin / Skills / MCP 的前端 consumer。主线收益：App Server plugin package 已输出 `runtimeCapabilities` snapshot，App Center / plugin projection 必须消费该 snapshot，而不是继续从 legacy `skillRefs` / `toolRefs` 或 UI 卡片 shape 重新推断 runtime capability。

### 58.2 本轮实现

本轮改动落点：

```text
src/features/plugin/types.ts
src/features/plugin/types.d.ts
src/features/plugin/manifest/normalizeManifest.ts
src/features/plugin/projection/projectApp.ts
src/features/plugin/projection/projectApp.test.ts
src/features/plugin/schema/schemaGate.ts
src/features/plugin/schema/schemaGate.test.ts
```

实现事实：

- 新增前端 `PluginRuntimeCapabilities` 类型，覆盖 `skills[] + promptInjectionPolicy`、`tools[] + bindingKind`、`mcpBindings[]` 与 `workflowBindings[]`。
- `normalizeManifest(...)` 保留 projected manifest 中的 `runtimeCapabilities`，不把 snapshot 丢回 legacy shape。
- `projectApp(...)` 在 snapshot 存在时优先用 `runtimeCapabilities.skills/tools` 生成 `skillRequirements` / `toolRequirements`，并保留 `promptInjectionPolicy` 与 `bindingKind`；旧 `skillRefs` / `toolRefs` 只作为 snapshot 缺失 fallback。
- App projection 直接暴露 `runtimeCapabilities`，让 App Center 展示层只消费 current snapshot。
- `schemaGate` 对可选 `runtimeCapabilities` 校验四个数组字段，避免坏 snapshot 静默进入前端 projection。

本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend，也不接管 `src/lib/api/**` 或 `src/lib/governance/**` 热区。

### 58.3 验证

已通过：

```bash
npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts"
npx prettier --check "src/features/plugin/types.ts" "src/features/plugin/types.d.ts" "src/features/plugin/manifest/normalizeManifest.ts" "src/features/plugin/projection/projectApp.ts" "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.ts" "src/features/plugin/schema/schemaGate.test.ts"
npm run typecheck
git diff --check -- "src/features/plugin/types.ts" "src/features/plugin/types.d.ts" "src/features/plugin/manifest/normalizeManifest.ts" "src/features/plugin/projection/projectApp.ts" "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.ts" "src/features/plugin/schema/schemaGate.test.ts"
```

结果口径：

```text
projectApp/schemaGate targeted Vitest: 2 files / 8 tests passed
prettier --check: passed
npm run typecheck: passed
git diff --check on plugin code write set: passed
```

已执行相关测试：

```bash
npm run test:related -- "src/features/plugin/projection/projectApp.ts" "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.ts" "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/types.ts" "src/features/plugin/manifest/normalizeManifest.ts"
```

该命令扩展到 111 个测试文件；本轮 plugin projection/schema tests 通过。随后补齐 `PluginsPage.testFixtures.tsx` 的 `listPlatformPluginAuditLogs` mock export，关闭此前 `PluginsPage.test.tsx` 的 App Center review workbench 夹具漂移：

```bash
npx vitest run "src/features/plugin/ui/PluginsPage.test.tsx"
```

结果：

```text
PluginsPage targeted Vitest: 1 file / 31 tests passed
```

截至本节更新，related run 中剩余失败只归属 `src/components/agent/chat/**` 的 AgentChat bootstrap preview 断言；该目录是并行热区，本刀不接管。

### 58.4 认领与避让

本轮写集：

```text
src/features/plugin/types.ts
src/features/plugin/types.d.ts
src/features/plugin/manifest/normalizeManifest.ts
src/features/plugin/projection/projectApp.ts
src/features/plugin/projection/projectApp.test.ts
src/features/plugin/schema/schemaGate.ts
src/features/plugin/schema/schemaGate.test.ts
src/features/plugin/ui/PluginsPage.testFixtures.tsx
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让：

```text
lime-rs/crates/agent/src/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/crates/thread-store/**
scripts/check-app-server-client-contract.mjs
src/lib/api/**
src/lib/governance/**
src/components/agent/chat/**
```

### 58.5 下一刀

P2 Plugin / Skills / MCP 的 App Center projection consumer 已完成。下一刀不要再在 UI 或 legacy refs 里补推断，优先选择：

1. skill prompt injection consumer：让 runtime turn context / prompt assembly 消费 `runtimeCapabilities.skills[].promptInjectionPolicy`。
2. MCP runtime import：把 `runtimeCapabilities.mcpBindings[]` 接到 App Server MCP server import / binding owner。

如果 App Server runtime/backend 仍是并行脏热区，下一刀应转 Context Evidence export / sidecar source 或 Media Item projection，而不是夹写 runtime 热区。

### 58.6 分类

- `current`：App Server plugin package `runtimeCapabilities` snapshot owner；前端 `src/features/plugin/**` App Center projection consumer。
- `compat`：无新增；Aster/vendor 不参与 Plugin / Skills / MCP capability truth。
- `deprecated`：旧 `app.md` / UI-only capability 推断不作为新入口。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 59. P2 Plugin runtime capability schema identity guard

### 59.1 主线目标

本节继续收紧 P2 Plugin / Skills / MCP 的前端 consumer 边界。主线收益：App Center 已消费 App Server `runtimeCapabilities` snapshot，但 schema gate 不能只检查数组形状，还必须确认 snapshot identity 绑定当前 projection app，避免错包 snapshot 被当成当前插件的 runtime capability truth。

### 59.2 本轮实现

本轮改动落点：

```text
src/features/plugin/schema/schemaGate.ts
src/features/plugin/schema/schemaGate.test.ts
```

实现事实：

- `validateProjectionSchemaCoverage(...)` 校验 `runtimeCapabilities.pluginId` 必须是非空字符串。
- `runtimeCapabilities.pluginId` 必须匹配 `projection.app.appId`。
- `runtimeCapabilities.version` 如果存在，必须匹配 `projection.app.version`。
- 原有 `skills` / `tools` / `mcpBindings` / `workflowBindings` 数组结构校验继续保留。

本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend，不接管 RuntimeCore media/message delta 或 chat GUI 热区。

### 59.3 验证

已通过：

```bash
npx vitest run "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/projection/projectApp.test.ts"
npx prettier --check "src/features/plugin/schema/schemaGate.ts" "src/features/plugin/schema/schemaGate.test.ts"
git diff --check -- "src/features/plugin/schema/schemaGate.ts" "src/features/plugin/schema/schemaGate.test.ts"
```

结果：

```text
schemaGate/projectApp targeted Vitest: 2 files / 9 tests passed
prettier --check: passed
scoped git diff --check: passed
```

### 59.4 认领与避让

本轮写集：

```text
src/features/plugin/schema/schemaGate.ts
src/features/plugin/schema/schemaGate.test.ts
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让：

```text
lime-rs/crates/runtime-core/src/**
lime-rs/crates/app-server/src/runtime/**
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/crates/agent/src/**
src/components/agent/chat/**
src/lib/api/**
src/lib/governance/**
```

### 59.5 下一刀

Plugin / Skills / MCP 在 App Center projection 和 schema identity guard 层已经收口。下一刀若要继续本模块，必须转到真正 runtime consumer：

1. skill prompt injection consumer：让 runtime turn context / prompt assembly 消费 `runtimeCapabilities.skills[].promptInjectionPolicy`。
2. MCP runtime import：把 `runtimeCapabilities.mcpBindings[]` 接到 App Server MCP server import / binding owner。

如果 App Server runtime/backend 仍是并行脏热区，应优先等待移交或转 Context Evidence export / Media Item projection 的已释放写集，不继续在前端 UI 里补 runtime 推断。

### 59.6 分类

- `current`：App Server plugin package `runtimeCapabilities` snapshot owner；前端 App Center projection consumer；`schemaGate` snapshot identity guard。
- `compat`：无新增；旧 `skillRefs` / `toolRefs` 只在 snapshot 缺失时作为 fallback。
- `deprecated`：旧 `app.md` / UI-only capability 推断不作为新入口。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 60. P2 Plugin App Center detail projection consumer

### 60.1 主线目标

本节继续收口 P2 Plugin / Skills / MCP 前端 consumer 的最后一处 UI residual。主线收益：App Center projection 和 schema identity guard 已经消费 `runtimeCapabilities` snapshot，但详情页技能列表仍直接读旧 `installedState.manifest.skillRefs`；这会让旧 refs 在用户可见 App Center 中继续像 runtime truth。必须把详情展示迁到 projection consumer，旧 refs 只保留为缺 projection 的兼容 fallback。

### 60.2 本轮实现

本轮改动落点：

```text
src/features/plugin/ui/PluginsPage.tsx
src/features/plugin/ui/pluginDetailDeclarations.ts
src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts
src/features/plugin/projection/projectApp.ts
src/features/plugin/projection/projectApp.test.ts
src/features/plugin/types.ts
src/features/plugin/types.d.ts
```

实现事实：

- `PluginsPage.tsx` 已是 2848 行巨型文件，本刀没有继续在主文件里追加 runtime 分支，而是把详情声明构建逻辑抽到 `pluginDetailDeclarations.ts` 纯 helper；主文件降至 2585 行但仍超过 1000 行，后续触碰详情页渲染时应继续拆 `detail sections` / action handlers，而不是追加业务逻辑。
- `buildDetailSkills(...)` 优先消费 `installedState.projection.skillRequirements`；旧 `manifest.skillRefs` 只在 projection 缺失时 fallback。
- `projectApp(...)` 把 runtime capability skill 的 `title` / `description` 投影到 `skillRequirements`，让详情展示不需要回读 `manifest.runtimeCapabilities` 或旧 refs。
- runtime tool binding 未扩 `description` schema；本刀只保留 tool `title` 与既有 `bindingKind`，避免为 UI 展示过度扩张 runtime schema。
- `types.d.ts` 由 TypeScript declaration emit 重新生成，保持仓库 compact 声明风格并同步 `types.ts`。

本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend，不接管 Media Item projection 或 chat GUI 热区。

### 60.3 验证

已通过：

```bash
npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginsPage.test.tsx"
npx prettier --check "src/features/plugin/projection/projectApp.ts" "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/types.ts" "src/features/plugin/ui/PluginsPage.tsx" "src/features/plugin/ui/pluginDetailDeclarations.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts"
npm run typecheck
git diff --check -- "src/features/plugin/projection/projectApp.ts" "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/types.ts" "src/features/plugin/types.d.ts" "src/features/plugin/ui/PluginsPage.tsx" "src/features/plugin/ui/pluginDetailDeclarations.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "internal/research/refactor/v1"
```

结果：

```text
plugin projection/schema/helper/page targeted Vitest: 4 files / 42 tests passed
prettier --check on handwritten files: passed
npm run typecheck: passed
scoped git diff --check: passed
```

说明：`types.d.ts` 是 generated declaration 风格，本轮不把它纳入 Prettier 手写文件检查，避免把生成产物格式化成大 diff。

### 60.4 下一刀

Plugin / Skills / MCP 的 App Center projection、schema identity guard 和详情技能展示 consumer 已完成。第 61 节已继续补 detail tools / MCP projection consumer。后续不要继续在 UI 或 legacy refs 上补推断，必须转到 runtime consumer：

1. skill prompt injection consumer：让 runtime turn context / prompt assembly 消费 `runtimeCapabilities.skills[].promptInjectionPolicy`。
2. MCP runtime import：把 `runtimeCapabilities.mcpBindings[]` 接到 App Server MCP server import / binding owner。

若 App Server runtime/backend 仍被并行进程持有，则优先转 Context Evidence export / sidecar source 或 Media Item projection 的已释放写集。

### 60.5 分类

- `current`：App Server plugin package `runtimeCapabilities` snapshot owner；前端 App Center projection consumer；`schemaGate` snapshot identity guard；App Center detail `pluginDetailDeclarations` projection consumer。
- `compat`：旧 `skillRefs` / `toolRefs` 只在 snapshot / projection 缺失时作为 fallback。
- `deprecated`：旧 `app.md` / UI-only capability 推断不作为新入口。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 61. P2 Plugin App Center detail tools / MCP projection consumer

### 61.1 主线目标

本节继续收口 P2 Plugin / Skills / MCP 前端 consumer 的 detail residual。主线收益：第 60 节已把详情技能展示迁到 `projection.skillRequirements`，但工具和 MCP 绑定仍没有用户可见的 projection consumer；这会让 App Center detail 只能证明 skill snapshot 被消费，不能证明 `runtimeCapabilities.tools[]` 与 `runtimeCapabilities.mcpBindings[]` 已经离开 legacy refs / raw manifest 展示路径。

### 61.2 本轮实现

本轮改动落点：

```text
src/features/plugin/ui/PluginDetailRuntimeSections.tsx
src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx
src/features/plugin/ui/pluginDetailDeclarations.ts
src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts
src/features/plugin/ui/PluginsPage.tsx
src/i18n/resources/zh-CN/agent.json
src/i18n/resources/zh-TW/agent.json
src/i18n/resources/en-US/agent.json
src/i18n/resources/ja-JP/agent.json
src/i18n/resources/ko-KR/agent.json
```

实现事实：

- `buildDetailTools(...)` 优先消费 `installedState.projection.toolRequirements`；旧 `manifest.toolRefs` 只在 projection 缺失时 fallback。
- `buildDetailMcpBindings(...)` 优先消费 `installedState.projection.runtimeCapabilities.mcpBindings`；旧 `manifest.runtimeCapabilities.mcpBindings` 只在 projection 缺失时 fallback。
- 新增 `PluginDetailRuntimeSections.tsx`，把 subagent / skill / tool / MCP detail sections 从 `PluginsPage.tsx` 内联 JSX 中抽出；`PluginsPage.tsx` 不再继续追加 runtime detail 分支。
- 新增五语言 `plugin.apps.center.detail.tools` 与 `plugin.apps.center.detail.mcpBindings` 文案，保持 App Center detail 用户可见标题走 current i18n。

本刀不接 skill prompt injection runtime consumer，不导入 MCP runtime，不改 App Server runtime/backend，不接管 `src/lib/api/**`、`src/lib/governance/**`、Media Item projection 或 chat GUI 热区。

### 61.3 验证

已通过：

```bash
npx prettier --check "src/features/plugin/ui/pluginDetailDeclarations.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginDetailRuntimeSections.tsx" "src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx" "src/features/plugin/ui/PluginsPage.tsx" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json"
npx vitest run "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx" "src/features/plugin/ui/PluginsPage.test.tsx"
npm run typecheck
```

结果：

```text
prettier --check on touched handwritten/i18n files: passed
plugin detail helper/component/page targeted Vitest: 3 files / 39 tests passed
npm run typecheck: passed
```

### 61.4 下一刀

Plugin / Skills / MCP 的 App Center projection、schema identity guard、detail skills/tools/MCP consumer 已完成。下一刀必须转到真正 runtime consumer：

1. skill prompt injection consumer：让 runtime turn context / prompt assembly 消费 `runtimeCapabilities.skills[].promptInjectionPolicy`。
2. MCP runtime import：把 `runtimeCapabilities.mcpBindings[]` 接到 App Server MCP server import / binding owner。

若 App Server runtime/backend 仍被并行进程持有，则优先转 Context Evidence export / sidecar source 或 Media Item projection 的已释放写集。

### 61.5 分类

- `current`：App Server plugin package `runtimeCapabilities` snapshot owner；前端 App Center projection consumer；`schemaGate` snapshot identity guard；App Center detail `pluginDetailDeclarations` + `PluginDetailRuntimeSections` projection consumer。
- `compat`：旧 `skillRefs` / `toolRefs` / raw manifest `runtimeCapabilities.mcpBindings` 只在 snapshot / projection 缺失时作为 fallback。
- `deprecated`：旧 `app.md` / UI-only capability 推断不作为新入口。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 62. P2 Plugin installer temp/cache path governance

### 62.1 目标

本节是用户指定的路径治理精修：插件安装器临时产物不得落到系统 cache 目录，必须收敛到系统临时目录，方便本地清理。本刀只修 `lime-core` 插件安装器路径边界，不声称完成 skill prompt injection runtime consumer、MCP runtime import 或 Media Item projection。

### 62.2 本轮实现

改动落点：

```text
lime-rs/crates/core/src/plugin/installer/plugin_installer.rs
lime-rs/crates/core/src/plugin/installer/tests.rs
```

实现事实：

- `PluginInstaller::new(...)` 与 `PluginInstaller::from_paths(...)` 会先归一化 `temp_dir`。
- 如果传入的 `temp_dir` 落在系统 cache root 下，安装器会把它重定向到 `std::env::temp_dir()/plugin-installer/<leaf>`。
- 插件临时 cache cleanup 改为清理 `temp_dir/plugin-cache/<plugin-id>`，系统 cache 目录不再是 current 写入或清理目标。
- `plugin_installer.rs` 当前仍为 1000+ 行巨型文件；本刀只做最小行为修正，并把新增回归放在已有外置 `installer/tests.rs`。后续若继续触碰该实现文件，应优先拆分安装器 tests / path helper。

### 62.3 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-core --check
CARGO_TARGET_DIR="/tmp/lime-codex-plugin-temp-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core test_installer_rebases_system_cache_temp_dir_to_system_temp -- --nocapture
CARGO_TARGET_DIR="/tmp/lime-codex-plugin-temp-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core plugin::installer -- --nocapture
git diff --check -- "lime-rs/crates/core/src/plugin/installer/plugin_installer.rs" "lime-rs/crates/core/src/plugin/installer/tests.rs"
```

结果：

```text
new temp-dir rebasing test: 1 passed
plugin::installer targeted Rust tests: 76 passed; 0 failed
```

所有 Cargo 产物均使用 `/tmp/lime-codex-plugin-temp-target`，未写入用户 cache 目录。

### 62.4 下一刀

回到 P2 主线优先级：

1. App Server runtime 热区释放后，接 Context Evidence export / compaction sidecar source。
2. Plugin / Skills / MCP 热区释放后，接 skill prompt injection consumer 或 MCP runtime import。
3. Media Item/read model / projection 热区释放后，接 `RuntimeMessageDeltaContent::from_payload(...)` 到 Item projection。

### 62.5 分类

- `current`：插件安装器 temp/cache 临时产物统一走 `std::env::temp_dir()/plugin-installer/**`。
- `compat`：调用方仍可传显式非 cache `temp_dir`，用于测试或受控临时目录。
- `deprecated`：系统 cache root 下的插件安装临时目录被构造边界重定向，不再作为可持续写入位置。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 63. P2 Embedding local ONNX cache path governance

### 63.1 目标

本节继续用户指定的路径治理精修：本地 ONNX embedding 模型缓存属于可重建运行时产物，默认不得落到系统 cache 目录，尤其不能在 macOS 写入 `~/Library/Caches`。本刀只修 `lime-embedding` 本地 ONNX cache 边界，不声称完成 Context Evidence export、skill prompt injection runtime consumer、MCP runtime import 或 Media Item projection。

### 63.2 本轮实现

改动落点：

```text
lime-rs/crates/embedding/src/lib.rs
```

实现事实：

- `local_onnx_cache_dir()` 默认不再调用 `dirs::cache_dir()` 作为写入根。
- 默认本地 ONNX cache 目录改为可清理临时根下的 `lime/models/embedding`：Unix 优先 `/tmp/lime/models/embedding`，非 Unix 回退 `std::env::temp_dir()/lime/models/embedding`。
- 显式 `LIME_LOCAL_ONNX_CACHE_DIR` override 仍保留，方便测试或受控运行指定目录。
- 如果 override 落在系统 cache root 下，`normalize_local_onnx_cache_dir(...)` 会重定向回默认临时根，避免把 `~/Library/Caches` 重新变成 current runtime 写入位置。
- `embedding/src/lib.rs` 当前为 805 行，已超过 800 行拆分预警线；本刀只做最小路径边界修复和同文件回归。后续继续触碰该 crate 时，应优先拆出 local ONNX cache/path helper 或测试模块。

### 63.3 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --check
CARGO_HOME="/tmp/lime-codex-cargo-home-embedding" CARGO_TARGET_DIR="/tmp/lime-codex-embedding-cache-target-fresh" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --features local-onnx local_onnx_cache_dir -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-embedding" CARGO_TARGET_DIR="/tmp/lime-codex-embedding-cache-target-fresh" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-embedding --features local-onnx -- --nocapture
```

结果：

```text
local_onnx_cache_dir targeted tests: 3 passed
lime-embedding local-onnx feature tests: 8 passed; 0 failed; 2 ignored
```

第一次使用默认 `/Users/coso/.cargo/registry` 复跑 feature 全量测试时，曾因用户清理后的 Cargo registry 源码缺 `build.rs` 而失败；随后改用 `/tmp/lime-codex-cargo-home-embedding` 重新下载依赖并通过。Cargo home 与 target 均在 `/tmp` 下，未把构建产物写入用户 cache 目录。

### 63.4 下一刀

回到 P2 主线优先级：

1. App Server runtime 热区释放后，接 Context Evidence export / compaction sidecar source。
2. Plugin / Skills / MCP 热区释放后，接 skill prompt injection consumer 或 MCP runtime import。
3. Media Item/read model / projection 热区释放后，接 `RuntimeMessageDeltaContent::from_payload(...)` 到 Item projection。

### 63.5 分类

- `current`：本地 ONNX embedding 默认模型缓存走可清理临时根 `/tmp/lime/models/embedding`（非 Unix 为 `std::env::temp_dir()/lime/models/embedding`）。
- `compat`：显式非系统 cache 的 `LIME_LOCAL_ONNX_CACHE_DIR` override 仍允许，用于测试或受控运行。
- `deprecated`：系统 cache root 下的本地 ONNX cache override 被边界重定向，不再作为可持续写入位置。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 64. P2 Codex fifth signal safety buffering parser

### 64.1 目标

本节接 `p2-codex-fifth-signal-handoff.md` 中的 safety buffering `retry_model` 第一代码切片。目标是先把 provider wire 语义封到 `model-provider` current safety owner，避免后续 RuntimeEvent、read model 或 GUI 在 raw provider payload 上各自猜测字段。

本刀只做 parser owner；不接 App Server RuntimeEvent projection、read model 或 GUI presentation，不碰正在并行修改的 `provider_stream.rs`。

### 64.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
```

实现事实：

- 新增 `SAFETY_BUFFERING_FASTER_MODEL_HEADER`，固定旧 header 名：`x-codex-safety-buffering-faster-model`。
- 新增 `ProviderSafetyBufferingRetryModel` 与 `ProviderSafetyBufferingRetryModelSource`，把 parser 输出显式分成 `PayloadRetryModel`、`ExplicitNull`、`LegacyHeader`、`Missing`。
- 新增 `parse_safety_buffering_retry_model(...)`：
  - payload `retry_model` 字段存在且非空时，作为唯一 retry target。
  - payload `retry_model = null` 或空值时，输出 explicit null，不 fallback 到旧 header。
  - payload 缺失 `retry_model` 时，才读取旧 header fallback。
  - payload `faster_model` 不作为新 wire truth，避免把旧字段名重新接成 current。
- 新增 `safety_buffering_legacy_faster_model_header(...)`，只负责大小写不敏感地读取旧 header，并忽略空值。
- `provider_stream.rs` 当前有并行 reasoning-output 改动，本刀不夹写；后续接入 provider stream / RuntimeEvent 时，应由持有该文件的进程接入本 parser。

### 64.3 验证

已通过：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 17 passed
model-provider full crate tests: 29 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 64.4 下一刀

下一刀按热区释放情况继续：

1. `provider_stream.rs` 释放或由持有进程接管后，把 Responses safety buffering payload / headers 接到 `parse_safety_buffering_retry_model(...)`。
2. App Server runtime 热区释放后，把 parsed safety buffering 写成 turn-scoped RuntimeEvent，不直通 raw provider payload。
3. projection / GUI 热区释放后，让 read model / GUI 消费 typed projection，不从 provider wire 重新解析。

### 64.5 分类

- `current`：`model_provider::safety::parse_safety_buffering_retry_model(...)` 是 provider safety buffering retry target wire parser owner。
- `compat`：旧 `x-codex-safety-buffering-faster-model` header 仅在 payload 缺失 `retry_model` 时作为 fallback。
- `deprecated`：payload `faster_model` 不再作为新 wire 字段读取。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 65. P2 Codex fifth signal safety buffering RuntimeEvent payload owner

### 65.1 目标

本节继续第 64 节的 provider safety buffering 第一代码切片。第 64 节已经封住 `retry_model` / explicit null / missing fallback header 的 wire parser；本刀把 parser 输出前移成后续 RuntimeEvent 可直接消费的 typed payload owner，避免 `provider_stream.rs`、App Server RuntimeEvent、read model 或 GUI 在接入时再次读取 raw provider 字段。

由于 `provider_stream.rs`、App Server runtime/backend、projection package 与 AgentChat GUI 仍是并行热区，本刀只改本进程已持有的 `model-provider::safety`，不夹写 provider stream，不接 RuntimeEvent storage，不接 read model / GUI。

### 65.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
```

实现事实：

- 新增 `SAFETY_BUFFERING_ENABLED_HEADER`，固定旧 visibility header：`x-codex-safety-buffering-enabled`。
- 新增 `ProviderSafetyBufferingUpdate`，把 `use_cases`、`reasons`、`show_buffering_ui` 和第 64 节的 `ProviderSafetyBufferingRetryModel` 聚合成 provider safety buffering typed update。
- 新增 `parse_safety_buffering_update(...)`：
  - 非 object / missing payload 不产出 update。
  - `use_cases` / `reasons` 只接收 string array，并裁剪空字符串。
  - `show_buffering_ui` 只在 header 明确为 true 时为 true。
  - retry target 继续委托 `parse_safety_buffering_retry_model(...)`，不重新解释 `retry_model` / legacy header 语义。
- 新增 `ProviderSafetyBufferingUpdate::to_runtime_event_payload(...)`：
  - 输出 camelCase typed payload：`retryModel`、`fallbackHeaderModel`、`source`、`showBufferingUi`、`useCases`、`reasons`、`provider`、`model`。
  - 不输出 raw `retry_model`、`faster_model` 或 `fasterModel`，避免把 provider wire / legacy DTO 字段扩散到 RuntimeEvent consumer。

### 65.3 验证

已通过：

```bash
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 21 passed
model-provider full crate tests: 33 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 65.4 下一刀

按热区释放情况继续：

1. `provider_stream.rs` 释放或移交后，把 Responses `safety_buffering` payload / response headers 接到 `parse_safety_buffering_update(...)`，并产出 provider stream typed event。
2. App Server runtime 热区释放后，把 `to_runtime_event_payload(...)` 的结果写成 turn-scoped RuntimeEvent，补 session/thread/turn/provider/model 归属测试。
3. read model / GUI 热区释放后，让 GUI 消费 projection，不解析 raw provider payload，也不把 `fasterModel` 当 provider wire truth。

### 65.5 分类

- `current`：`model_provider::safety::ProviderSafetyBufferingUpdate` 和 `to_runtime_event_payload(...)` 是 provider safety buffering RuntimeEvent payload owner。
- `compat`：旧 `x-codex-safety-buffering-enabled` / `x-codex-safety-buffering-faster-model` header 只作为 provider parser 边界输入；后续 RuntimeEvent consumer 不直接读这些 header。
- `deprecated`：raw provider payload 字段 `retry_model` 与 legacy payload/DTO 字段 `faster_model` / `fasterModel` 不进入 RuntimeEvent typed payload。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 66. P2 Codex fifth signal safety buffering response-event owner

### 66.1 目标

本节继续第 65 节的 RuntimeEvent payload owner。第 65 节已经把 safety buffering payload 转成 typed update 和 camelCase RuntimeEvent payload；本刀再把 Responses event 顶层 `safety_buffering` 字段的提取收进 `model-provider::safety`，避免后续 `provider_stream.rs` 接入时自行判断 raw event object、boolean false 或字段缺失。

由于 `provider_stream.rs`、App Server runtime/backend、projection package 与 AgentChat GUI 仍是并行脏热区，本刀继续只改本进程已持有的 safety owner，不夹写 stream consumer。

### 66.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
```

实现事实：

- 新增 `SAFETY_BUFFERING_RESPONSE_EVENT_FIELD = "safety_buffering"`，固定 provider response event 的字段名。
- 新增 `parse_safety_buffering_response_event(...)`：
  - 从完整 response event 中提取 `safety_buffering` 字段。
  - 字段缺失或字段值非 object（例如 `false`）时返回 `None`。
  - 字段为 object 时继续委托 `parse_safety_buffering_update(...)`，不重复解释 `retry_model` / legacy header / show UI header。
- 新增 response-event 级单测，覆盖 object 提取、缺失字段和 boolean false 忽略。

### 66.3 验证

已通过：

```bash
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 23 passed
model-provider full crate tests: 35 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 66.4 下一刀

按热区释放情况继续：

1. `provider_stream.rs` 释放或移交后，把 Responses event + headers 接到 `parse_safety_buffering_response_event(...)`，并产出 provider stream typed event。
2. App Server runtime 热区释放后，把第 65 节的 `to_runtime_event_payload(...)` 结果写成 turn-scoped RuntimeEvent。
3. read model / GUI 热区释放后，让 GUI 消费 projection，不解析 raw provider payload，也不把 `fasterModel` 当 provider wire truth。

### 66.5 分类

- `current`：`model_provider::safety::parse_safety_buffering_response_event(...)` 是 provider response event 的 safety buffering extraction owner。
- `current`：`parse_safety_buffering_update(...)` / `ProviderSafetyBufferingUpdate` 继续作为 RuntimeEvent typed payload owner。
- `compat`：旧 safety buffering headers 只作为 provider parser 边界输入；provider stream、RuntimeEvent、read model 和 GUI 不直接读 header。
- `deprecated`：raw provider event 字段、`retry_model` 和 legacy `faster_model` / `fasterModel` 不进入 RuntimeEvent consumer。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 67. P2 Codex fifth signal safety owner test split

### 67.1 目标

第 64-66 节已经把 provider safety buffering 的 `retry_model` wire parser、RuntimeEvent typed payload 和 response-event extraction 都收进 `model-provider::safety` current owner。`safety.rs` 因连续接入已接近 800 行拆分预警线；本刀先把测试外置，避免后续 `provider_stream.rs` consumer 接入前继续向 owner 文件追加内联测试。

这不是把主线改成单纯拆文件；它服务的是下一步 provider stream 接入窗口：实现文件保持小而稳定，测试继续覆盖同一 owner 行为。

### 67.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
lime-rs/crates/model-provider/src/safety/tests.rs
```

实现事实：

- `safety.rs` 保留 provider safety owner 实现，并把内联测试替换为 `#[cfg(test)] mod tests;`。
- 新增 `safety/tests.rs` 承接原有 23 个 safety tests。
- `safety.rs` 从 `778` 行降到 `351` 行；测试文件为 `422` 行。
- 不修改 provider stream 行为，不接 App Server runtime/read model/GUI projection。

### 67.3 验证

已通过：

```bash
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 23 passed
model-provider full crate tests: 35 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 67.4 下一刀

热区释放或移交后，回到主链：

1. `provider_stream.rs` 接 `parse_safety_buffering_response_event(...)`，产出 provider stream typed event。
2. App Server runtime 写入 turn-scoped RuntimeEvent，带 session/thread/turn/provider/model 归属。
3. read model / GUI 只消费 projection，不解析 raw provider event 或 legacy `fasterModel`。

### 67.5 分类

- `current`：`safety.rs` 是 provider safety buffering owner 实现文件，`safety/tests.rs` 是同 owner 的测试文件。
- `current`：`parse_safety_buffering_response_event(...)`、`parse_safety_buffering_update(...)` 与 `to_runtime_event_payload(...)` 继续作为后续 provider stream / RuntimeEvent 的唯一 parser/payload owner。
- `compat`：旧 safety buffering headers 只作为 provider parser 边界输入。
- `deprecated`：raw provider event 字段、`retry_model` 与 legacy `faster_model` / `fasterModel` 不进入 RuntimeEvent consumer。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 68. P2 Codex fifth signal safety buffering typed runtime payload refine

### 68.1 目标

第 65 节已经提供 `to_runtime_event_payload(...)`，但实现仍直接用 `serde_json::json!` 手拼 RuntimeEvent payload。为了避免后续 `provider_stream.rs`、App Server RuntimeEvent 或 read model 接线时重新猜字段名，本节把 runtime payload 本身收成命名 typed struct，再由 JSON helper 序列化同一事实源。

由于 `provider_stream.rs`、App Server runtime/backend、projection package 与 AgentChat GUI 仍是并行脏热区，本刀继续只改本进程已持有的 `model-provider::safety` owner，不接 provider stream，不写 RuntimeEvent storage / read model / GUI projection。

### 68.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
lime-rs/crates/model-provider/src/safety/tests.rs
```

实现事实：

- 新增 `SAFETY_BUFFERING_RUNTIME_EVENT_KIND = "provider_safety_buffering"`，避免 RuntimeEvent kind 继续散落成字符串字面量。
- 新增 `ProviderSafetyBufferingRuntimeEventPayload`，用 `serde(rename_all = "camelCase")` 固定 RuntimeEvent payload 字段名：
  - `kind`
  - `provider`
  - `model`
  - `useCases`
  - `reasons`
  - `showBufferingUi`
  - `retryModel`
  - `fallbackHeaderModel`
  - `source`
- 新增 `ProviderSafetyBufferingUpdate::runtime_event_payload(...)` 返回 typed payload。
- `ProviderSafetyBufferingUpdate::to_runtime_event_payload(...)` 改为序列化 typed payload，不再手拼 JSON。
- 补 explicit null RuntimeEvent payload 回归：payload `retry_model = null` 时，`retryModel` / `fallbackHeaderModel` 保持 JSON null，`source = explicit_null`，且不暴露 raw `retry_model` / `faster_model`。

### 68.3 验证

已通过：

```bash
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-typed-payload-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-typed-payload-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-typed-payload-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 24 passed
model-provider full crate tests: 36 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 68.4 下一刀

热区释放或移交后，回到主链：

1. `provider_stream.rs` 接 `parse_safety_buffering_response_event(...)`，产出 provider stream typed event。
2. App Server runtime 写入 turn-scoped RuntimeEvent，payload 直接消费 `ProviderSafetyBufferingRuntimeEventPayload` 序列化结果。
3. read model / GUI 只消费 projection，不解析 raw provider event 或 legacy `fasterModel`。

### 68.5 分类

- `current`：`ProviderSafetyBufferingRuntimeEventPayload` 是 provider safety buffering RuntimeEvent payload 的 typed owner。
- `current`：`to_runtime_event_payload(...)` 只是 typed payload 的 JSON 序列化 helper，不是第二套事实源。
- `compat`：旧 safety buffering headers 只作为 provider parser 边界输入。
- `deprecated`：raw provider event 字段、`retry_model` 与 legacy `faster_model` / `fasterModel` 不进入 RuntimeEvent consumer。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 69. P2 Codex fifth signal safety buffering source enum refine

### 69.1 目标

第 68 节已经把 RuntimeEvent payload 收成 `ProviderSafetyBufferingRuntimeEventPayload`，但其中 `source` 仍是 `&'static str`。这会让后续 provider stream / RuntimeEvent 接线在 typed payload 内继续携带一个 stringly typed seam。本节把 `source` 进一步收成可序列化 enum，保留 JSON 输出值不变。

由于 `provider_stream.rs`、App Server runtime/backend、projection package 与 AgentChat GUI 仍是并行脏热区，本刀继续只改本进程已持有的 `model-provider::safety` owner，不接 provider stream，不写 RuntimeEvent storage / read model / GUI projection。

### 69.2 本轮实现

改动落点：

```text
lime-rs/crates/model-provider/src/safety.rs
lime-rs/crates/model-provider/src/safety/tests.rs
```

实现事实：

- `ProviderSafetyBufferingRetryModelSource` 新增 `Serialize`，并用 `serde(rename_all = "snake_case")` 固定 JSON 输出。
- `ProviderSafetyBufferingRetryModelSource` 新增 `Copy`，让 typed payload 可以直接携带 source enum。
- `ProviderSafetyBufferingRuntimeEventPayload.source` 从 `&'static str` 改为 `ProviderSafetyBufferingRetryModelSource`。
- RuntimeEvent JSON 输出仍保持 `payload_retry_model`、`explicit_null`、`legacy_header`、`missing`，不改变下游契约。
- 测试断言 typed payload 的 `source` 是 enum；JSON payload 继续断言稳定字符串。

### 69.3 验证

已通过：

```bash
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-source-enum-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p model-provider --check
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-source-enum-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider safety -- --nocapture
CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-model-provider-safety-source-enum-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider -- --nocapture
```

结果：

```text
model-provider safety tests: 24 passed
model-provider full crate tests: 36 passed
```

Cargo home 与 target 均在 `/tmp` 下；没有使用用户 cache 目录。

### 69.4 下一刀

热区释放或移交后，回到主链：

1. `provider_stream.rs` 接 `parse_safety_buffering_response_event(...)`，产出 provider stream typed event。
2. App Server runtime 写入 turn-scoped RuntimeEvent，payload 直接消费 `ProviderSafetyBufferingRuntimeEventPayload` 序列化结果。
3. read model / GUI 只消费 projection，不解析 raw provider event 或 legacy `fasterModel`。

### 69.5 分类

- `current`：`ProviderSafetyBufferingRetryModelSource` 是 retry target source 的 typed owner，并直接进入 `ProviderSafetyBufferingRuntimeEventPayload`。
- `current`：JSON `source` 字段只是 enum 的序列化结果，不是第二套事实源。
- `compat`：旧 safety buffering headers 只作为 provider parser 边界输入。
- `deprecated`：raw provider event 字段、`retry_model` 与 legacy `faster_model` / `fasterModel` 不进入 RuntimeEvent consumer。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。

## 57. P2 Context packet fragment consumer

### 57.1 主线目标

继续迁移 Aster 到 Codex-first current 主链。本节推进 P2 Context / Token / Compaction 的第一个 App Server consumer：让 memory / soul / session compaction context packet 先进入 RuntimeCore `ContextFragmentEnvelope` / budget decision / sidecar reference owner，再进入 prompt telemetry；不在 Aster vendor 或 prompt builder 里继续拼裸字符串策略。

### 57.2 本轮实现

改动落点：

```text
lime-rs/crates/app-server/src/runtime/context_packet.rs
```

实现事实：

- `admit_packet(...)` 不再使用本地 `truncate_to_token_budget(...)`。
- admitted packet 统一调用 `ContextFragmentEnvelope::from_input(...)`，并把 packet source / kind 写入 fragment source。
- `token_budget` 同时映射为 `max_preview_chars` 与 `max_model_visible_tokens`，由 RuntimeCore owner 决定 preview / reference 状态。
- packet telemetry 新增 `fragmentEnvelope`；secret-like / empty reject 保持 `fragmentEnvelope=null`，避免泄漏敏感内容。
- metadata 中 `sidecarRef` / `sidecar_reference` 被转换成 `ContextSidecarReference`，支持 `ref` / `uri` / `relativePath` / `relative_path` 与 `sha256`。

本刀只接 `context_packet` consumer；`memory_prompt.rs` / `evidence_provider.rs` / coding snapshot tests 当前仍是并行脏热区，Evidence export 与 compaction sidecar source 贯通继续 pending。

### 57.3 验证

已通过：

```bash
rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/context_packet.rs"
CARGO_TARGET_DIR="/tmp/lime-codex-p2-context-packet-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture
```

结果：

```text
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 806 filtered out
```

说明：定向测试期间仅出现避让热区 `lime-agent/src/aster_session_store/legacy_conversation.rs` 的既有 unused import warning，不属于本刀写集。

### 57.4 认领与避让

本轮写集：

```text
lime-rs/crates/app-server/src/runtime/context_packet.rs
internal/research/refactor/v1/priority-tracking-plan.md
internal/research/refactor/v1/p2-runtime-skeleton.md
internal/research/refactor/v1/quality-fixture-matrix.md
internal/research/refactor/v1/completion-audit.md
```

继续避让：

```text
lime-rs/crates/app-server/src/runtime/memory_prompt.rs
lime-rs/crates/app-server/src/runtime/evidence_provider.rs
lime-rs/crates/app-server/src/runtime/tests/evidence_exports/coding_snapshot.rs
lime-rs/crates/app-server/src/runtime_backend/**
lime-rs/crates/agent/src/**
lime-rs/vendor/aster-rust/**
src/components/agent/chat/**
src/lib/governance/**
```

### 57.5 下一刀

下一刀仍在 P2 Context / Token / Compaction 主链内，按写集释放情况二选一：

1. 若 `memory_prompt.rs` / compaction source 热区释放，把真实 `sidecarRef` 从 session compaction prompt context 写入 `ContextPacket` metadata。
2. 若 `evidence_provider.rs` / coding snapshot 热区释放，让 `evidence/export` 读取 `fragmentEnvelope` / `sidecar_reference`，输出 context decision export。

两者都不能落到 Aster vendor；Aster 仍只作为 `compat` executor / adapter。

### 57.6 分类

- `current`：RuntimeCore `context_fragments.rs` typed owner、App Server `runtime/context_packet.rs` consumer。
- `compat`：Aster vendor 继续只作为受控 executor / adapter，不承接 context budget / sidecar / compaction 新逻辑。
- `deprecated`：本刀无新增。
- `dead`：旧 `lime-rs/src/**`、旧 Tauri wrapper、旧 `agent_runtime_*` production surface 继续 forbidden-to-restore / retired guard-only。
