# P2 Runtime Skeleton

> 状态：Tool / Approval / Sandbox combo-evidence-done；Context / Token context-packet-consumer-done / evidence-export-pending；Plugin / Skills / MCP plugin-app-center-projection-and-detail-skills-tools-mcp-consumer-done / skill-mcp-runtime-consumer-pending；Realtime / Media runtime-content-owner-done / llm-media-content-event-done / message-delta-content-owner-done / message-delta-content-parser-done / item-projection-pending；Codex fifth signal config-warning-protocol-contract-done / processor-config-load-emitter-done / rules-reload-emitter-pending
> 更新时间：2026-07-07
> 目标：把 P2 深层能力先收成可执行骨架，后续直接按 owner / first code slice / verification 开代码，不再反复做大段分析。

## 1. 骨架优先原则

本文件不是新的路线图，而是 P2 的执行骨架。

固定规则：

1. P1-7 第三十八刀 request/tool/context consumer 主链已进入 Rust typed owner、runtime consumer、contract gate 和 runtime fixture 证据；P2 后续只能基于这些 current owner 继续推进，不得回到前端 DTO 扩张或旧 runtime 旁路。
2. 当前源码热区仍被并行进程持有时，不夹写 `lime-rs/crates/agent/**`、App Server runtime/backend、RuntimeCore、`src/lib/model/**`、`src/lib/governance/**` 和 contract 脚本。
3. P2 每个模块先落 typed owner，再接 consumer；不在 App Server 顶层 loop 或 GUI 组件里散落策略判断。
4. opencode 只进入 Provider / Model / Capability / ContentPart / media / provider lowering；Tool / Session / UI / Effect 继续拒绝。
5. 每个骨架切片必须能回答 Thread / Turn / Item 归属。

## 2. P2 骨架总表

| P2 模块 | current owner | 第一代码切片 | 禁止路径 | 最小验证 |
| --- | --- | --- | --- | --- |
| Tool / Approval / Sandbox | `lime-agent` tool domain、tool runtime、App Server action events、Desktop Host permission bridge | App Server `ToolLifecycleSnapshot` / approval action / sandbox decision typed gate 已完成；`lime-agent` `ToolExecutionLifecycleSnapshot` / approval action snapshot / approval resolution snapshot / sandbox decision snapshot / terminal snapshot / lifecycle events 已接入 `ToolStart`、`ActionRequired`、`ToolEnd` 构造，并过滤 approval / blocked 后的 `ToolOutputDelta`；approval-required 已改为 `AwaitingApproval`，不再抢先发失败 `ToolEnd`；process lifecycle / stdout stderr delta 与 terminal `ToolEnd` metadata 已补 `toolCallId` / `toolId` / `tool_id` correlation；approval resolved terminal helper 已接入，批准后才允许 terminal/output，拒绝后不允许成功 terminal；App Server `evidence/export` coding summary 已输出 `actionRequestIds` / `actionToolCallIds`；`lime-agent` lifecycle owner 已补 action id / tool id 解耦，避免 `action/respond` resume 接线错绑 tool；RuntimeCore `respond_action(...)` lifecycle guard 已证明正式 API 会从 pending action 回填 `toolCallId` 并允许后续 `tool.result` 通过；RuntimeState/Aster pending resume 最新复跑通过；App Server `RuntimeBackend::respond_action(ToolConfirmation)` bridge 回归已通过，覆盖 `ExecutionBackend::start_turn -> action.required -> respond_action -> pending Aster tool future -> tool.result/final text/turn.completed`；final combo evidence 已完成，证明 governance / contract / runtime current fixture / frontend projection 边界均未回流 legacy 或 mock；执行 handoff 见 [p2-tool-approval-sandbox-handoff.md](./p2-tool-approval-sandbox-handoff.md) | 不让 UI toast、legacy command、mock fallback 成为 tool lifecycle truth；不从 opencode Tool runtime 迁移架构 | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_lifecycle -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_lifecycle -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server export_evidence_pack_includes_coding_snapshot_artifacts -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_infers_tool_id_and_unblocks_pending_tool_result -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent confirm_tool_action_resumes_pending_aster_tool_execution -- --nocapture`；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-tool-target-bridge" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server respond_action_tool_confirmation_resumes_pending_aster_tool_future -- --nocapture`；tool projection Vitest；`npm run governance:legacy-report`；`npm run test:contracts`；`npm run smoke:agent-runtime-current-fixture` |
| Context / Token / Compaction | RuntimeCore / App Server `context_packet`、sidecar/reference、Evidence export | `runtime-core` 已新增并精修 `ContextFragmentEnvelope` / `ContextFragmentBudgetDecision` / `ContextSidecarReference` typed owner；高容量内容只保留 bounded preview，preview 同时受 char policy 与 `max_model_visible_tokens` 约束；zero-preview + sidecar 输出 `reference_only`，缺 sidecar 才输出 `hidden_requires_reference`；App Server `context_packet` admitted packet 已消费 envelope 并输出 `fragmentEnvelope` telemetry；下一刀接 compaction sidecar source / evidence export consumer | 不在 prompt builder 里拼裸字符串；不让 skill / media / memory 绕过 budget；不在 Aster vendor 补 context 逻辑 | `rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/context_fragments.rs" "lime-rs/crates/app-server/src/runtime/context_packet.rs"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core context_fragments -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture`；后续补 Evidence export tests |
| Plugin / Skills / MCP | plugin packages、skill registry、MCP binding、App Center install UI | `plugin_packages/runtime_capabilities.rs` 已新增 `runtimeCapabilities` snapshot owner，并由 `plugin_manifest.rs` projected manifest 消费；前端 `src/features/plugin/**` App Center projection 已优先消费 snapshot 生成 skill/tool/MCP capability projection；`schemaGate` 已校验 snapshot pluginId/version 绑定当前 projection app；App Center detail skills/tools/MCP sections 已消费 `projection.skillRequirements`、`projection.toolRequirements` 与 `projection.runtimeCapabilities.mcpBindings`，旧 `skillRefs` / `toolRefs` / raw manifest MCP binding 只作 fallback；下一刀接 skill prompt injection consumer / MCP runtime import | 不把 App Center UI 当 runtime capability truth；不照搬 Codex CLI plugin 分发形态 | `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities -- --nocapture`；`npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts" "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginsPage.test.tsx"`；`npx vitest run "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx" "src/features/plugin/ui/PluginsPage.test.tsx"`；`npm run typecheck`；后续补 skill registry tests、MCP contract、runtime consumer tests |
| Realtime / Media / Collaboration | RuntimeCore `RuntimeContentPart` / `RuntimeContentReference`、ModelCapability、media workbench、Item projection、team/subagent events、Interaction Soul lifecycle metadata | `runtime-core/src/runtime_content.rs` 已完成 media/content reference typed owner：text 可 inline，media/pdf 只能带 reference，按 MIME 归类 image/audio/video/file，不靠文件名推断；`RuntimeMessageDeltaContent` 已统一 `message.delta` 的 `text`、`contentPart`、`contentParts` payload 形状，并提供 owner-backed parser 供 Item/read model projection 复用；`llm_protocol::runtime_event_from_llm_event(...)` 已把文本与支持 MIME 的 LLM image/audio output 接成 owner-backed typed RuntimeEvent；Soul 只允许作为 Interaction Soul prompt context、tool lifecycle metadata、collaboration facts 和 risk facts 进入同一 `Thread -> Turn -> Item/read model -> GUI projection` 主链；四个 built-in Style Pack seed 已迁到前端 `packs/*.json` manifest + registry loader，并覆盖完整 transcript surface contract 与 few-shot anchors，deterministic transcript golden 已证明同 facts 四风格文本不同且 fact tokens 不漂移，真实 Electron GUI/read model 多 profile transcript golden 已通过 `--soul-style-profile` 覆盖四个 built-in profile；`AgentRuntimeStrip` 已接入 collaboration facts / Soul metadata contract；`runtime_status.rs` 已删除 profile-specific title rewrite；下一刀 materialize 到 Item/read model / Workbench，文件级接管计划见 [p2-media-item-projection-handoff.md](./p2-media-item-projection-handoff.md)，且按 Lime `itemId` invariant 验证，不再引用已回滚的 Codex interleaved 行为 | provider media wire event 不直通 GUI；opencode UI / Session / Tool 不参与；Aster vendor 不承接多模态新逻辑；不新增 Soul runtime、第二套 transcript、profile-specific i18n 句库、旧 `com.lime.builtin.default` fallback、runtime status profile switch 或组件内 profile id 文案 switch | `cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture`；`npm exec vitest run "src/lib/soul/style-profiles/styleProfiles.unit.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "src/components/agent/chat/components/AgentRuntimeStrip.test.tsx"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_status -- --nocapture`；`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario soul-style --soul-style-profile <id> --timeout-ms 180000 --prefix <profile-prefix>` 四 profile；后续 Item projection tests、GUI media smoke |
| Trace / Evidence Cross-cutting | `evidence/export`、request telemetry、runtime trace | tool/subagent/media/context 决策全部带 session/thread/turn/item 关联 | 不输出 `unlinked` 伪关联；不新增独立 trace store | Evidence export tests、request telemetry negative tests |

## 3. 第一批骨架切片

### 3.1 Tool / Approval / Sandbox

最小切片：

```text
tool call request
  -> ToolExecutionLifecycleSnapshot
  -> approval action / sandbox decision
  -> execution event
  -> ThreadItem / Evidence
```

落点约束：

- `lime-agent` 只暴露 typed tool lifecycle / approval / sandbox owner。
- App Server 只做 JSON-RPC / RuntimeEvent / read model projection，不承接 tool policy 业务。
- Desktop Host 只做平台权限和窗口级能力，不承接 Agent tool truth。
- GUI 只消费 projection，不推断 tool 是否完成。

第一刀不做完整 tool runtime 重写。App Server external runtime event lifecycle owner 已完成；`lime-agent` typed event construction owner、active output gate、approval pending terminal transition、process lifecycle correlation、terminal metadata correlation、approval resolved terminal transition、Evidence export correlation 第一刀与 action id / tool id 解耦前置刀已完成，当前把 `ToolStart` / `ActionRequired` / `ToolEnd` 构造、approval / blocked 后的 `ToolOutputDelta` 过滤、approval-required 不抢发失败 `ToolEnd`、process delta correlation、terminal correlation、approval resolved terminal helper、evidence action/tool correlation summary 和 action/respond resume 前置 identity split 收进 current owner，不改变协议 enum shape。第九刀已补 RuntimeCore `action/respond` lifecycle guard：正式 `core.respond_action(...)` 在响应参数不带 tool id 时也能从 pending action 回填 `toolCallId`，并允许后续 `tool.result` 通过 App Server lifecycle guard。最新复跑显示 RuntimeState/Aster pending resume 用例已通过；App Server RuntimeBackend bridge 目标测试也已通过，证明 `RuntimeBackend::respond_action(ToolConfirmation)` 能释放同一个 Aster pending tool future。具体窄写集、Thread / Turn / Item 归属和验证门槛以 [p2-tool-approval-sandbox-handoff.md](./p2-tool-approval-sandbox-handoff.md) 为准。

### 3.2 Context / Token / Compaction

最小切片：

```text
context source
  -> ContextFragmentEnvelope
  -> token/budget decision
  -> model-visible bounded preview
  -> sidecar/reference evidence
  -> ContextCompaction item
```

落点约束：

- skill instructions、media preview、memory、AGENTS.md、workspace state 都必须有 fragment source。
- 高容量内容默认进 sidecar/reference，不直接进入 prompt。
- compaction 结果必须能回到 Thread / Turn / Item。

第一 typed owner 已落到 `runtime-core/src/context_fragments.rs`：`ContextFragmentEnvelope::from_input(...)` 只输出 `model_visible_preview`、`ContextFragmentBudgetDecision` 和可选 `ContextSidecarReference`，不携带完整高容量内容；有效 preview 同时受 `max_preview_chars` 和 `max_model_visible_tokens * 4` 约束，超预算 / 超 preview 的 fragment 会进入 `preview_with_reference` 或 `preview_requires_reference`；`max_preview_chars=0` 且已有 sidecar 时进入 `reference_only`，缺 sidecar 时进入 `hidden_requires_reference`。第一 consumer 已落到 App Server `runtime/context_packet.rs`：admitted packet 统一调用 RuntimeCore envelope，telemetry 输出 `fragmentEnvelope`，secret / empty reject 保持 `fragmentEnvelope=null`，metadata `sidecarRef` / `sidecar_reference` 转成 `ContextSidecarReference`。验证：`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/context_fragments.rs"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core context_fragments -- --nocapture` 通过，6 tests；`rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime/context_packet.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-context-packet-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture` 通过，4 tests。

### 3.3 Plugin / Skills / MCP

最小切片：

```text
plugin manifest
  -> installed package state
  -> skill metadata / prompt injection policy
  -> MCP binding
  -> App Center projection
```

落点约束：

- runtime capability truth 在 manifest / skill registry / MCP binding，不在 UI 卡片。
- Codex remote plugin `version` 信号进入 manifest / installed state owner，不只放展示层。
- opencode plugin/session/tool 变化不进入本模块。

第一 typed owner 已落到 `app-server/src/plugin_packages/runtime_capabilities.rs`：`build_plugin_runtime_capabilities(...)` 从 projected plugin manifest 读取 plugin identity/version、`skillRefs` / `skills`、`toolRefs` 与 `agentRuntime.workflows`，输出稳定 `runtimeCapabilities` snapshot。该 snapshot 覆盖 skill metadata、workflow-scoped prompt injection policy、tool binding、MCP binding 和 workflow binding；`plugin_manifest.rs` 只在 manifest projection 末尾插入 snapshot，不把 App Center UI 或 runtime/backend 逻辑变成能力事实源。验证：`CARGO_TARGET_DIR="/tmp/lime-codex-p2-plugin-capabilities" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities -- --nocapture` 通过，4 tests。

第一前端 consumer 已落到 `src/features/plugin/**`：`normalizeManifest(...)` 保留 projected manifest 的 `runtimeCapabilities`；`projectApp(...)` 在 snapshot 存在时优先用 `runtimeCapabilities.skills/tools` 生成 `skillRequirements` / `toolRequirements`，并保留 `promptInjectionPolicy` / `bindingKind` / `mcpBindings` / `workflowBindings`；旧 `skillRefs` / `toolRefs` 只作为 snapshot 缺失 fallback。`schemaGate` 对可选 `runtimeCapabilities` 的四个数组字段做结构校验，并校验 `pluginId` / `version` 绑定当前 projection app，避免 App Center 重新从 legacy refs 推断 runtime truth 或消费错包 snapshot。App Center detail consumer 已落到 `pluginDetailDeclarations` + `PluginDetailRuntimeSections`：skills / tools / MCP sections 优先消费 projection，旧 manifest refs / raw manifest MCP binding 只在 projection 缺失时 fallback。验证：`npx vitest run "src/features/plugin/projection/projectApp.test.ts" "src/features/plugin/schema/schemaGate.test.ts"` 通过 9 tests；`npx vitest run "src/features/plugin/ui/pluginDetailDeclarations.unit.test.ts" "src/features/plugin/ui/PluginDetailRuntimeSections.unit.test.tsx" "src/features/plugin/ui/PluginsPage.test.tsx"` 通过 39 tests；`npm run typecheck` 通过。

### 3.4 Realtime / Media / Collaboration

最小切片：

```text
provider media event / realtime event
  -> ContentPart or Reference
  -> RuntimeEvent
  -> Item / read model
  -> Workbench / GUI projection
```

落点约束：

- image/audio/video/pdf 都先过 capability gate。
- MIME resolution 是 provider lowering / ContentPart owner，不靠 UI 文件名猜测。
- team/subagent lifecycle 进入 typed event / Item projection，不只写日志。
- Soul 风格只能以 Interaction Soul prompt context、tool lifecycle metadata、collaboration facts、risk facts 和 GUI projection data contract 存在；不得新增 `personalstyle`、独立 Soul runtime、第二套 transcript、profile-specific i18n 句库、旧共享 pack id fallback 或 runtime status profile switch。

第一 typed owner 已落到 `runtime-core/src/runtime_content.rs`：`RuntimeContentPart` 表达 runtime 统一 content part，`RuntimeContentReference` 只保留 `uri` / `mime_type` / title / sha256 / byte size 等 reference 元数据，`RuntimeMediaKind` 只由 MIME 判定。当前 allowlist 只采纳 opencode 多模态 MIME 参考，并为 Lime 桌面多模态补 `application/pdf`；inline `data:` 媒体 payload 被拒绝，避免高容量内容绕过 sidecar/reference 直接进入 Item。验证：`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/runtime_content.rs"` 通过；`CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-content-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，7 tests。

第二 typed event slice 已落到 `runtime-core/src/llm_protocol/events.rs`：`runtime_event_from_llm_event(...)` 对支持 MIME 的 `LlmOutputPart::Image/Audio` 输出 `message.delta`，payload 带 `contentPart` / `contentParts`，并复用 `RuntimeContentPart` owner；inline data URL、unsupported MIME 或 missing MIME 继续走 `runtime.event` generic，避免 provider wire 或 UI 自行解释媒体。验证：`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/llm_protocol/events.rs" "lime-rs/crates/runtime-core/src/llm_protocol/tests.rs"` 通过；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-llm-media-content-target-3" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests。

第三 payload owner slice 已落到 `runtime-core/src/runtime_content.rs`：`RuntimeMessageDeltaContent` 统一 `message.delta` 内容字段，文本输出只序列化 `text`，媒体输出同时序列化同步的 `contentPart` 和 `contentParts`。`llm_protocol` 文本与 media 输出均经该 owner 构造，事件层只补 `source` / `backend` / `runtimeEvent`。验证：`rustfmt --edition 2021 --check "lime-rs/crates/runtime-core/src/lib.rs" "lime-rs/crates/runtime-core/src/runtime_content.rs" "lime-rs/crates/runtime-core/src/llm_protocol/events.rs" "lime-rs/crates/runtime-core/src/llm_protocol/tests.rs"` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，10 tests；`cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests。

第四 payload parser slice 已落到 `runtime-core/src/runtime_content.rs`：`RuntimeMessageDeltaContent::from_payload(...)` 解析 App Server Item/read model 后续要消费的 `message.delta` payload，事件层 `backend/source/runtimeEvent` 元数据由 serde 忽略；仅有 `contentPart` 时补齐 `contentParts`，仅有单元素 `contentParts` 时补齐 `contentPart`，两者同时存在但首项不一致时 fail closed。验证：`rustfmt --edition 2021` 已应用格式；`CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-parser-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core runtime_content -- --nocapture` 通过，13 tests，45 filtered out；补跑 `CARGO_HOME="/tmp/lime-cargo-home-llm-media-1" CARGO_NET_RETRY=3 CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-codex-p2-runtime-message-delta-parser-target-llm" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p runtime-core llm_ -- --nocapture` 通过，22 tests，36 filtered out。

## 4. 快速执行模式

后续每一刀最多只做一个垂直骨架切片：

1. 先确认目标文件干净，或用户明确授权接管。
2. 先新增 typed owner + tests。
3. 再接一个 consumer。
4. 最后接 projection / Evidence。
5. 不在同一刀里同时铺四个 P2 模块。

推荐顺序：

| 顺序 | 切片 | 为什么先做 |
| --- | --- | --- |
| 1 | Context Evidence export / sidecar source | `context_packet` consumer 已接 RuntimeCore envelope；下一步应把 compaction / memory / media 的 sidecarRef source 贯通到 packet metadata，并让 Evidence export 输出 context decision，而不是在 prompt builder 或 evidence provider 里重新拼策略 |
| 2 | Plugin / Skills / MCP skill/MCP runtime consumer | `runtimeCapabilities` typed owner、App Center projection consumer、schema identity guard 与 detail skills/tools/MCP projection consumer 已完成；下一步应把 snapshot 接到 skill prompt injection policy 或 MCP runtime import，而不是在 UI 卡片、legacy refs 或 runtime/backend 临时分支里重新推断 |
| 3 | Media / Realtime item projection | `RuntimeContentPart` owner、LLM media typed RuntimeEvent、`RuntimeMessageDeltaContent` payload owner 与 parser 已完成，下一步应按 [p2-media-item-projection-handoff.md](./p2-media-item-projection-handoff.md) 把 `message.delta.contentParts` 接回 Item / read model / Workbench，而不是继续让 UI 或 provider wire event 自行解释媒体；`itemId` 归属按 Lime invariant 验证，不引用已回滚的 Codex interleaved 行为 |
| 4 | Codex fifth signal implementation slice | [p2-codex-fifth-signal-handoff.md](./p2-codex-fifth-signal-handoff.md) 已把 App Server `configWarning`、provider safety buffering `retry_model`、Desktop Host startup env overlay 拆成 owner / 禁止路径 / 验证入口；`configWarning` 已完成 App Server protocol contract 与 processor config-load emitter，下一刀应接 `.rules` / exec-policy reload warning、bridge/GUI consumer，或继续接 provider parser，不要只留在 P3 diff |
| 5 | Tool / Approval / Sandbox post-merge regression | 只有热区合并后或触碰 GUI 主路径时再复跑组合证据 / GUI smoke，不再作为当前 blocker |

## 5. 当前接管条件

当前不应直接开 P2 其它深层模块源码刀，除非满足以下条件之一：

1. `git status --short -- <目标写集>` 显示 `agent_tools/**` / P2 目标文件干净。
2. 用户明确授权当前进程接管对应热区。
3. 隔壁进程在计划文件标注移交写集。

未满足前，本文件、[p2-tool-approval-sandbox-handoff.md](./p2-tool-approval-sandbox-handoff.md)、[p2-media-item-projection-handoff.md](./p2-media-item-projection-handoff.md) 和 [p2-codex-fifth-signal-handoff.md](./p2-codex-fifth-signal-handoff.md) 是 P2 骨架事实源；下一次可执行代码刀优先转入 Context / Token、Plugin / Skills / MCP、Realtime / Media / Collaboration 或 Codex fifth signal 中对整体目标提升最大的第一代码切片。

## 6. 完成定义

P2 skeleton 完成不等于 P2 工程完成。它只证明：

- P2 模块不再是 `queued` 的空话。
- 每个模块都有唯一 current owner、禁止路径、第一代码切片和最小验证。
- Tool / Approval / Sandbox 已有 App Server lifecycle owner、`lime-agent` typed event construction owner、active output gate、approval pending transition、process correlation、terminal correlation、approval resolved terminal transition、Evidence export correlation、action/tool identity split、RuntimeCore `action/respond` lifecycle guard、RuntimeState/Aster pending resume 证据、RuntimeBackend bridge evidence，以及 governance / contract / runtime current fixture / projection 组合证据。
- Context / Token / Compaction 已有 `runtime-core` `ContextFragmentEnvelope` / budget decision / sidecar reference typed owner，并已区分 `reference_only` 与 `hidden_requires_reference`；App Server `context_packet` consumer 已完成；compaction sidecar source、compact item 和 Evidence export 仍 pending。
- Plugin / Skills / MCP 已有 App Server plugin package `runtimeCapabilities` snapshot typed owner，并已由 projected manifest、App Center projection 与 App Center detail skills/tools/MCP sections 消费；schema gate 已补 snapshot identity guard；skill prompt injection consumer 和 MCP runtime binding 仍 pending。
- Realtime / Media / Collaboration 已有 RuntimeCore `RuntimeContentPart` / media reference typed owner，且 LLM image/audio output 已进入 `RuntimeMessageDeltaContent` 支撑的 `message.delta.contentPart/contentParts` typed RuntimeEvent；`RuntimeMessageDeltaContent::from_payload(...)` 已作为后续 Item/read model projection 的 parser owner；Interaction Soul 已明确只能以 prompt context / lifecycle metadata / facts / GUI projection contract 进入同一主链；四 profile Electron transcript golden 已完成，Item/read model -> Workbench media projection 仍 pending。
- Codex fifth signal 已有 handoff：App Server `configWarning` owner、provider safety buffering `retry_model` parser 和 Desktop Host startup env overlay watch 已明确 owner、禁止路径与最小验证；其中 `configWarning` App Server protocol contract 与 processor config-load emitter 已完成，`.rules` / exec-policy reload warning、bridge / GUI 仍 pending。
- 后续不会继续靠临场判断决定 Tool / Context / Plugin / Media 的落点。

整体目标完成仍必须满足 [completion-audit.md](./completion-audit.md) 的强证据清单。
