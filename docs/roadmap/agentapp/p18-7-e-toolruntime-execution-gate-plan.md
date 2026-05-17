# Agent App P18.7-E ToolRuntime Execution Gate Plan

更新时间：2026-05-17 23:17

## 目标

把 P18.7-E 从 Host Bridge first-cut 推进到真实受控执行 gate：Agent App 仍不能直接执行工具、MCP、终端或连接器，但可以通过 Lime 主 App 的 AgentRuntime / ToolRuntime / policy owner 发起一次可审计、可取消、可追踪 evidence 的执行请求。

## 当前事实

| 事实 | 证据 | 结论 |
| --- | --- | --- |
| Host Bridge 已覆盖 tool intent | `src/features/agent-app/runtime/capabilityDispatcher.ts` / `capabilityDispatcher.test.ts` | `lime.tools/search/browser/documents/media/mcp/terminal/connectors` 只返回 `requires_agent_task` / 只读投影 / `not_available`，不伪造执行成功。 |
| AgentRuntime tool evidence 可读 | `capabilityDispatcher.test.ts` 中 `threadRead.tool_calls / turns[].tool_calls` fixture | App 可读已发生的 `web_search`、`connector__notion__createPage` source/input/output。 |
| Gate contract 已结构化 | `executionGate` / `authorizationGate` 回归 | App 可看到 `mutationExposed=false`、`secretBinding=host_managed`、`tokenExposed=false`。 |
| E1 request envelope 已固定 | `capabilityDispatcher.test.ts` | `lime.search.query`、generic `lime.tools.invoke`、`lime.connectors.invoke` 的 `executionGate.request` 已包含 machine-readable envelope，并裁剪 secret、raw OAuth token、absolute local path、App 自造 evidence id。 |
| E2 AgentRuntime handoff first-cut 已接 | `capabilityDispatcher.test.ts` | `executionGate.request` 可通过 `lime.agent.startTask` 创建 `agent_app.tool_execution` task，并写入 `agent_app_runtime_start_task` input/metadata。 |
| E3 ToolRuntime owner binding first-cut 已接 | `agent_app_runtime_cmd::tests` / `aster_agent_cmd::tests` | `agent_app.tool_execution` metadata 会强制 full runtime / `agent_app_tool_execution` tool surface，并让 ToolRuntime permission manager 按 request 建立 session-scoped 默认拒绝 + 请求工具 allowlist；Browser 走 Browser Assist，Connector 只暴露 exact tool + host-managed secret metadata。 |
| E4 tool output/progress/evidence refs 回写 first-cut 已接 | `aster_agent_cmd::dto::tests` / `agent_app_runtime_cmd::tests` | `threadRead.tool_calls` 会投影 arguments、output preview、时间戳和 metadata evidence refs，App task events 可读 `evidenceRef / outputPreview / occurredAt`。 |
| Connector authorization request handoff first-cut 已接 | `capabilityDispatcher.test.ts` / `agent_app_runtime_cmd::tests` | `lime.connectors.requestAuth` 会创建 `agent_app.connector_authorization` Host-managed task，authorization request 保留 `secretBinding=host_managed / tokenExposed=false`，raw OAuth token 会被裁剪；Agent App task snapshot 会投影 `task:blocked` connector authorization gate。 |
| Connector authorization task projection first-cut 已接 | `capabilityDispatcher.test.ts` | `lime.connectors.list` 会投影 `authorizationRequests`，`lime.connectors.getStatus` 会在只有 Host-managed authorization task、尚无 connector run 时返回 `requires_host_authorization`。 |
| Connector ToolRuntime preview seam first-cut 已接 | `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools.rs` / `aster_agent_cmd::tests` | ToolRuntime 现在只注册 request allowlist 中的 exact `connector__<id>__<action>` preview tool；未接真实 adapter 时返回受控 `not_available`、`secretBinding=host_managed`、`tokenExposed=false`，不伪造外部平台 mutation 成功。 |
| Connector adapter readiness seam first-cut 已接 | `connector_tools.rs` 内部测试 / `agent_app_connector_preview` | Preview tool 会区分 desktop system connector action surface 与 Cloud Overlay authorized runtime fact，返回 `adapterKind / adapterReadiness / next.required`；结果仍是受控 `not_available`，不把 OAuth、refresh token 或 secret 写入 metadata。 |
| Host connector runtime facts envelope first-cut 已接 | `capabilityDispatcher.test.ts` | Host Bridge 会把已观测 connector run / 已完成 Host-managed authorization 归一成 `connectorRuntimeFacts` 写入 `executionGate.request.input`，让 Rust adapter readiness seam 可消费真实 Host facts；sanitizer 只放行枚举型安全 facts，继续裁剪 refresh token、absolute path 和 App 自造 evidence id。 |
| Host-managed fixture connector mutation first-cut 已接 | `src/features/agent-app/runtime/capabilityDispatcher.ts` / `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools.rs` / `capabilityDispatcher.test.ts` / `agent_app_connector` | `lime.connectors.invoke({ connectorId: "lime_fixture", action: "recordMutation" })` 会由 Host Bridge 注入 `host_fixture_connector` runtime facts 并交给 `lime.agent.startTask -> agent_app.tool_execution`；Rust 侧只有同时观测到 `capability=lime.connectors`、Host-managed 授权事实、`secretBinding=host_managed` 与 `tokenExposed=false` 时才会执行受控 workspace-local mutation，并把脱敏 result / evidence refs 写回 ToolResult metadata；它只证明 ToolRuntime mutation/evidence 管线，不等同于外部 OAuth connector。 |
| Cloud Overlay outbox adapter first-cut 已接 | `src-tauri/src/commands/aster_agent_cmd/tool_runtime/connector_tools/cloud_overlay_outbox.rs` / `agent_app_connector` | 对非 fixture cloud connector，只在 Rust seam 同时观测到 `capability=lime.connectors`、Host-managed 授权事实、`secretBinding=host_managed` 与 `tokenExposed=false` 时，把 mutation 排入 workspace-local `.lime/agent-app-connectors/cloud-overlay/outbox.jsonl`，返回 `status=queued_for_cloud_overlay`、脱敏 `inputPreview` 和 structured `evidenceRefs`；这证明 non-fixture ToolRuntime mutation/outbox/evidence 管线，不代表外部平台已送达或 OAuth adapter 已完成。 |
| Cloud Overlay outbox evidence projection first-cut 已接 | `runtime_evidence_projection_service` / `aster_agent_cmd::dto::tests` / `agent_app_runtime_cmd::tests` | 实际 Cloud Overlay ToolResult metadata 的 structured `evidenceRefs`，以及 live ToolRuntime 写在 `[Lime 工具元数据开始]...` bounded output block 内的 metadata，都会进入 runtime evidence projection；`threadRead.tool_calls.evidence_refs` 与 `threadRead.evidence_summary` 可读 `outbox://...`，Agent App task events 会投影 `task:toolCall.evidenceRef` 与 `evidence:recorded`；redacted App 自造 evidence placeholder 不会被误收集。该证据覆盖 Rust 可观测链路，不等同于产品级 GUI smoke 或外部 delivery。 |
| Connector outbox runtime smoke harness 已接 | `scripts/agent-app-connector-outbox-smoke.mjs` / `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-replay-20260518-summary.json` | 新增可复用 focused smoke，支持 `--mode replay` 只读复核既有 live runtime session，也支持 `--mode live` 自动选择本地 enabled provider / fast model 后提交新 AgentRuntime turn；当前 replay 与 live 证据断言 DevBridge、`threadRead`、ToolRuntime output bounded metadata、`threadRead.evidence_summary` 与 Agent App task events 均可观测同一个 `outbox://...` evidence ref；live 证据 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-auto-provider-final-20260518-summary.json` 使用自动选择的 `deepseek/deepseek-v4-flash`，只产生 1 个成功 connector tool call；2026-05-18 00:37 secret delivery 证据 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-secret-delivery-20260518-summary.json` 显示 `adapterReadiness=host_managed_secret_delivery_adapter_ready`、`secretDeliveryStatus=ready`、`secretDeliveryCredentialMaterialExposed=false`、`secretDeliveryTokenExposed=false`。该 harness 证明 runtime outbox/evidence projection 和 Host-managed secret-delivery facts 可重复验证，不替代 GUI 产品 smoke，也不代表外部 OAuth handshake / raw secret material delivery / 外部平台送达。 |
| P18.7-F current GUI flow 继续复绿 | `.lime/qc/gui-evidence/agent-apps/content-factory-run-strategy-local-current-after-cross-project-fix-20260517-summary.json`、`content-factory-run-review-local-current-20260517-summary.json` | 22:13 run-strategy、22:19 run-review 与 22:33 五动作 full-flow action gates 均完成 runtime、Skill、成本、workspace patch 和 no Host fallback gate；full-flow 仍有 1 条 console error 噪声。它们只增强内容工厂产品闭环，不覆盖 P18.7-E 真实 connector mutation。 |
| 真正 Connector OAuth / ToolRuntime mutation smoke 仍未完成 | `p18-7-parallel-validation.md` completion audit | 仍缺真实 Connector OAuth/secret 完整执行，以及产品级 non-fixture mutation 从 Host Bridge / AgentRuntime / ToolRuntime / outbox 或 delivery 回到 GUI task events / artifact / evidence 的 smoke 证据。 |

## Prompt-to-artifact completion audit（2026-05-17 22:19）

| 明确要求 / gate | 真实证据 | 覆盖结论 |
| --- | --- | --- |
| Agent App 只能声明工具 / connector intent，不能直跑底层工具 | `capabilityDispatcher.test.ts` 18 tests passed；`executionGate.request` 与 `authorizationGate` 均断言 `mutationExposed=false / tokenExposed=false`，并通过 `lime.agent.startTask` handoff | 已覆盖 Host Bridge 不直跑工具 |
| Rust ToolRuntime 必须通过 workspace manifest 校验，不能直接 `rustc src-tauri/src/*.rs` | 2026-05-17 21:39 `cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short` 通过；`AGENTS.md` 与 `docs/aiprompts/quality-workflow.md` 已写入标准入口规则 | `can't find crate for lime_*` 判定为错误入口误报，不是源码依赖缺失 |
| `agent_app.tool_execution` 必须进入 AgentRuntime / ToolRuntime owner binding | 2026-05-17 21:41 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_runtime --lib` 28 tests passed；`src-tauri/src/commands/agent_app_runtime_cmd.rs` 已拆成门面 + 子模块 | 已覆盖 task metadata、full-runtime hint、tool surface 与 task event projection |
| Connector preview / readiness seam 必须只信 Host-managed facts | 2026-05-17 21:41 `cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 8 tests passed；测试覆盖伪造授权、generic `lime.tools.invoke` 伪造 facts、Host-managed fixture mutation | 已覆盖受控 preview、readiness、fixture mutation/evidence proof |
| TS Host Bridge / SDK 类型与命令契约不能漂移 | 2026-05-17 21:39 `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests passed；2026-05-17 21:43 `npm run typecheck` 通过；2026-05-17 21:44 `npm run test:contracts` 通过 | 已覆盖 Host Bridge 合同、类型与 Tauri 命令契约 |
| GUI / 产品 evidence 不能用代码检查替代 | 2026-05-17 22:13 `run-strategy`、22:19 `run-review` 与 22:33 full-flow 隔壁 flow 已自然结束；full-flow 五动作 action gates 通过，但仍有 `consoleErrorCount=1` 和 aborted request 噪声。本进程未抢跑 GUI / 未改会触发 Tauri watch 的源码 | P18.7-F 通过证据增强；P18.7-E 仍必须靠真实 connector / non-fixture mutation smoke 单独证明 |
| 非 fixture 外部 Connector OAuth / secret adapter | 当前已有 Cloud Overlay outbox adapter，可对 Host-managed 授权的非 fixture connector 写入 workspace-local outbox，返回 evidence refs，并通过 Rust 定向测试投影到 `threadRead.tool_calls` 与 Agent App task events；仍没有真实 OAuth handshake / secret store adapter / 外部平台 delivery result | 未完成，不能标记 P18.7-E 深水位完成 |

## Connector execution blocker

2026-05-17 14:03 只读摸底确认：`connector__<id>__<action>` 目前只是 Agent App tool execution owner binding 生成的 exact ToolRuntime allowlist 名称，仓库内尚未发现对应 current ToolRuntime connector adapter / tool registration。`src-tauri/src/services/browser_connector_service.rs` 只服务浏览器 / 系统连接器设置与授权状态，不是 Agent App 外部平台 connector mutation 执行器；`src-tauri/src/commands/aster_agent_cmd/tool_runtime/agent_app_tool_execution.rs` 只负责按 request 生成 session-scoped deny/allow permission，不负责创建 connector tool。下一刀不能把 allowlist 当作真实执行证据，必须先补 current Connector ToolRuntime adapter / Cloud Overlay seam，或明确登记为暂不可执行的 `not_available` projection，再跑产品级 mutation smoke。

2026-05-17 14:08 已补 Host Bridge 授权前置 guard：`lime.connectors.invoke` 在没有 connector runtime facts、且对应 Host-managed authorization task 未完成时，不再创建 `agent_app.tool_execution` handoff，而是返回 `requires_host_authorization` 并指向 `lime.connectors.requestAuth` / 等待授权 task。该 guard 只阻止未授权 connector mutation 假入口，不代表真实 Connector ToolRuntime adapter 已完成。

2026-05-17 14:32 已补 ToolRuntime preview seam：`agent_app.tool_execution` metadata 中出现 exact `connector__<id>__<action>` allowlist 时，Runtime 会注册同名 preview tool；执行结果固定为 `not_available / connector_toolruntime_adapter_not_configured`，并保留 `secretBinding=host_managed / tokenExposed=false`。该 seam 的价值是让产品 smoke 进入 ToolRuntime 受控失败与 evidence 路径，避免 unknown tool 或假成功；它仍不是 Connector OAuth / Cloud Overlay 的真实执行 adapter。

2026-05-17 17:03 已补 Connector adapter readiness seam：preview tool 不再只有单一泛化 `not_available`，会在不执行外部 mutation 的前提下给出 machine-readable `adapterKind / adapterReadiness / next.required`。已知 macOS desktop system connector actions（`reminders / calendar / notes / mail / contacts`）返回 `desktop_system_connector / desktop_action_surface_known / desktop_connector_action_adapter`；带 Host runtime 授权事实的云 connector 返回 `cloud_overlay / authorized_runtime_fact_observed / cloud_overlay_connector_toolruntime_adapter`。这仍只是 policy/readiness seam，不能宣称 OAuth、secret binding 或真实 Connector mutation 已完成。

2026-05-17 17:50 已补 Host connector runtime facts envelope：`lime.connectors.invoke` 在通过 authorization guard 后，会把当前 connector run projection / Host-managed authorization task 归一为 `connectorRuntimeFacts`，写入 `executionGate.request.input` 和后续 `agent_app.tool_execution` metadata。该 facts 只包含 connector id、状态枚举、source、run/task ids、`secretBinding=host_managed`、`tokenExposed=false`，sanitizer 只放行这些枚举型安全字段；raw OAuth token、refresh token、absolute local path 和 App 自造 evidence id 仍被裁剪。

2026-05-17 18:40 已加固 Rust Connector readiness seam：Cloud Overlay 只有同时观测到 `capability=lime.connectors`、`authorizationStatus/status=authorized|connected|ready|observed`、`secretBinding=host_managed` 和 `tokenExposed=false` 时，才返回 `authorized_runtime_fact_observed`；单独伪造 `authorizationStatus=authorized`，或通过 generic `lime.tools.invoke` 伪造 `connectorRuntimeFacts`，都会继续落到 `adapter_not_configured`。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector_preview --lib` 5 tests passed，`cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib` 通过，`npm run test:contracts` 通过。

2026-05-17 21:15 已补 Host-managed fixture connector mutation first-cut：`connector__lime_fixture__recordMutation` 在满足 Rust seam 的 Host-managed 授权事实后，会执行一次受控 workspace-local mutation，写入 `.lime/agent-app-connectors/fixture/mutations.jsonl`，并在 ToolResult metadata 中返回 `status=completed`、`adapterKind=host_fixture_connector`、`evidenceRefs[]`、`secretBinding=host_managed`、`tokenExposed=false`。该 adapter 会递归裁剪 token / secret / credential / password / absolute path / App 自造 evidence id。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 8 tests passed。该证据证明 ToolRuntime mutation/evidence 管线可执行，但仍不是外部 OAuth / Cloud Overlay connector adapter，也不能作为真实外部平台 mutation 完成证据。

2026-05-17 21:31 已补 Host Bridge fixture connector facts handoff：`lime.connectors.invoke` 对 `connectorId=lime_fixture / action=recordMutation` 不再停在 `requires_host_authorization`，而是注入 `connectorRuntimeFacts{status=authorized, authorizationStatus=authorized, source=host_fixture_connector, secretBinding=host_managed, tokenExposed=false}` 并通过 `lime.agent.startTask` 创建 `agent_app.tool_execution` handoff task；startTask payload 继续裁剪 fixture refresh token、absolute path 和 App evidence id。验证：`npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests passed，`npm run typecheck` 通过，`npm run test:contracts` 通过。该证据证明 Host Bridge 能把 fixture mutation intent 送达 ToolRuntime owner binding；非 fixture 外部 OAuth / Cloud Overlay mutation adapter 仍未完成。

2026-05-17 22:54 已补 Cloud Overlay outbox adapter first-cut：`connector__notion__createPage` 这类非 fixture cloud connector 在满足 Host-managed 授权 facts 后，不再只返回 `not_available`，而是由 ToolRuntime 写入 workspace-local `.lime/agent-app-connectors/cloud-overlay/outbox.jsonl`，返回 `status=queued_for_cloud_overlay`、`externalStatus=not_delivered`、`adapterReadiness=host_managed_outbox_adapter_ready` 和脱敏 `evidenceRefs`。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 8 tests passed。该证据证明 non-fixture ToolRuntime outbox/evidence 管线，但仍不是外部 OAuth handshake、secret store adapter 或外部平台 delivery 完成证据。

2026-05-17 21:55 已补 structured connector evidence ref projection：`runtime_evidence_projection_service` 现在能从 ToolResult metadata 中的 `evidenceRefs: [{ ref, kind, storage }]` 提取 `ref`，避免 Host-managed connector mutation proof 只停在 raw metadata，而无法进入 `threadRead.tool_calls.evidence_refs` / Agent App task events 的 evidence projection。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime collects_structured_connector_evidence_refs --lib` 1 test passed、`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime thread_read_should_project_tool_calls_for_profile_consumers --lib` 1 test passed、`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 8 tests passed、`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_runtime --lib` 28 tests passed、`cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short` 通过。该修复提高 fixture / 后续真实 connector mutation 的 evidence 可观测性，但仍不是外部 OAuth adapter 完成证据。

2026-05-18 00:00 已补 bounded tool output metadata evidence projection（read-only replay summary：`.lime/qc/gui-evidence/agent-apps/p18-7-e-runtime-outbox-output-metadata-projection-20260518-summary.json`）：live AgentRuntime 直跑 `connector__notion__createPage` 时，ToolRuntime 会把 Cloud Overlay outbox 的 structured metadata 写入工具输出中的 `[Lime 工具元数据开始]...` block，而不是 timeline `metadata` 字段；`runtime_evidence_projection_service` 现在只解析该 bounded Lime metadata block，不解析任意模型正文，并把其中 `evidenceRefs` 合并到 `threadRead.tool_calls.evidence_refs` / `threadRead.evidence_summary`。验证：`collects_evidence_refs_from_bounded_tool_output_metadata`、`thread_read_should_project_cloud_overlay_outbox_evidence_for_connector_tool_calls`、`collects_structured_connector_evidence_refs`、`test_agent_app_runtime_task_events_project_connector_outbox_evidence`、`agent_app_runtime` 29 tests 通过；因本地 `tauri dev` 持有默认 cargo artifact lock，本轮使用 `CARGO_TARGET_DIR=/tmp/lime-codex-target-p18e` 跑定向 Rust 验证和 `cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short`。该修复解除 live ToolRuntime outbox evidence 卡在 raw output 的缺口，但仍不是 OAuth/secret delivery 或外部平台送达证据。

2026-05-18 00:08 已新增 Connector outbox runtime smoke harness：`scripts/agent-app-connector-outbox-smoke.mjs`。本轮未启动新的 GUI flow，也未重新调用模型，只用 `--mode replay` 读取既有 live session `f08e135b-58a7-44eb-8f16-fc6809a5d045` / task `agent-app-connector-outbox-runtime-mp9xw68t`，生成 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-replay-20260518-summary.json`；断言 `threadReadCompleted / connectorToolCallProjected / outputHadBoundedMetadata / toolCallEvidenceProjected / threadEvidenceProjected / taskEventEvidenceProjected` 全为 true。该脚本后续可在无并行 GUI smoke 时用 `--mode live --provider-preference ... --model-preference ...` 生成新 runtime outbox 证据，但仍不会完成真实 OAuth handshake、secret delivery 或外部 Cloud delivery。

2026-05-18 00:13 已增强 Connector outbox runtime smoke harness live 模式：`scripts/agent-app-connector-outbox-smoke.mjs` 的 `--mode live` 不再要求手工传 provider/model；若省略 `--provider-preference / --model-preference`，会只读 `get_api_key_providers` / `get_api_key_provider`，优先选择 enabled provider 中的 `deepseek/openai/anthropic/gemini/azure-openai`，并偏向 `flash/mini/lite` 模型。因隔壁正在跑内容工厂 GUI flow，本轮只执行 `node --check` 与 `--mode replay`，新 replay 证据为 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-replay-auto-provider-20260518-summary.json`；未启动 GUI，也未重新调用模型。

2026-05-18 00:22 已跑通 focused live runtime connector outbox smoke：`scripts/agent-app-connector-outbox-smoke.mjs --mode live` 自动选择 `deepseek/deepseek-v4-flash`，生成 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-auto-provider-final-20260518-summary.json`，断言 `threadReadCompleted / connectorToolCallProjected / outputHadBoundedMetadata / toolCallEvidenceProjected / threadEvidenceProjected / taskEventEvidenceProjected` 全为 true；`threadRead.toolCallCount=1`，同一个 `outbox://connector/notion/createPage/...` evidence ref 同时出现在 tool call、thread evidence summary 和 Agent App task events。中途发现 harness 会过早在 evidence 出现时返回、且会选中早期失败 tool call，已修正为优先选带 expected evidence ref 的成功 tool call，并等待 `threadRead.status=completed`；修正后 replay 复核 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-auto-provider-fixed2-recheck-20260518-summary.json` 也全绿。该 live smoke 仍只证明 non-fixture Cloud Overlay outbox/evidence runtime 链路，不证明真实 OAuth handshake、secret delivery 或外部 Cloud delivery。

2026-05-18 00:37 已补 Cloud Overlay Host-managed secret delivery fact seam：ToolRuntime readiness 现在区分仅授权 outbox queued 和 `host_managed_secret_delivery_adapter_ready`；只有同时观测到 Host-managed authorization、`tokenExposed=false`、secret delivery `status=ready` 与 `credentialMaterialExposed=false` 时，才把 `secretDelivery.status=ready` 写入 ToolResult / outbox evidence，并继续保持 `externalStatus=not_delivered`。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 10 tests passed，`cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short` 通过，live smoke `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-live-secret-delivery-20260518-summary.json` 通过且显示 raw credential material 未暴露。该 seam 仍不执行真实 OAuth handshake，不传递 raw token，也不宣称 Cloud worker 已送达外部 Notion。

2026-05-18 00:42 已把 Connector outbox smoke 的 secret-delivery facts 提升为可断言 gate：`scripts/agent-app-connector-outbox-smoke.mjs` 新增 `--expect-adapter-readiness`、`--expect-external-status`、`--expect-next-required`、`--expect-secret-delivery-status`、`--expect-secret-delivery-credential-material-exposed`、`--expect-secret-delivery-token-exposed`，live 模式默认要求 `host_managed_secret_delivery_adapter_ready / not_delivered / cloud_overlay_worker_delivery / ready / false / false`，replay 模式可按证据显式开启。验证：`node --check "scripts/agent-app-connector-outbox-smoke.mjs"` 通过，replay 证据 `.lime/qc/gui-evidence/agent-apps/p18-7-e-connector-outbox-runtime-smoke-secret-delivery-assertions-replay-20260518-summary.json` 所有基础 evidence assertions 与新增 secret-delivery assertions 均为 true。该 gate 只加固 Host-managed facts / outbox evidence 可重复验证，不改变真实 OAuth、raw secret material delivery 或 Cloud worker delivery 未完成的口径。

2026-05-18 00:58 已把 secret delivery readiness 从单个 `ready` 枚举推进到 Host-managed secret lease fact seam：Rust ToolRuntime 只有同时看到 `secretDelivery.binding=host_managed`、`source=host_managed_secret_delivery_fact`、`target=cloud_overlay_worker`、`leaseRef=secret-lease://connector/...`、`credentialMaterialExposed=false`、`tokenExposed=false` 时，才返回 `host_managed_secret_delivery_adapter_ready`；否则只写 Cloud Overlay outbox 且保持 `secretDelivery.status=pending`。`cloud_overlay_outbox` 会把 lease ref / target / source 作为 worker 后续交付句柄写入 outbox metadata，但不写 raw token 或 credential material。验证：`cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 11 tests passed，`cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short` 通过，`node --check "scripts/agent-app-connector-outbox-smoke.mjs"` 通过；因隔壁仍在跑 GUI smoke / content-factory flow，本轮未启动新的 live 模型流或产品级 GUI smoke。该 seam 仍不是外部 OAuth handshake、raw secret material delivery adapter 或外部 Notion delivery，只是把后续 Cloud worker 可消费的 Host-managed lease contract 固定下来。

2026-05-18 01:00 已把 Host Bridge 侧也接上同一 lease fact：`lime.connectors.invoke` 在观测到已完成的 `agent_app.connector_authorization` task 后，会生成 Rust seam 可消费的 Host-managed lease contract；App-visible `executionGate.request` 只保留 `secretDelivery.status/binding/source/target/leaseObserved/leaseRefExposed=false/leaseHandleStatus/credentialMaterialExposed=false/tokenExposed=false`，concrete `secret-lease://connector/...` 只进入 handoff 的 internal request metadata，继续裁剪 raw token / credential / local path / App evidence id。验证：`npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests passed，`npm run typecheck` 通过。该补丁让真实业务 Host Bridge handoff 可以生成 Rust seam 可消费的 Host-managed lease contract，而不是只有 smoke 脚本注入；仍不宣称 OAuth 或外部 delivery 已完成。

2026-05-18 01:11 已把同一 Host-managed lease readiness 投影到 connector status/list：`buildConnectorAuthorizationProjection` 会在授权 task `succeeded` 时带出 App-safe `authorizationRequest.secretDelivery`，`lime.connectors.getStatus` 对已完成授权返回 `status=authorized` 与 App-safe `connectorRuntimeFacts.secretDelivery`，未完成授权仍保持 `requires_host_authorization`。验证：`npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests passed，`npm run typecheck` 通过。该补丁让业务 App 在发起 `invoke` 前即可只读看到 Host-owned lease readiness，但不暴露 raw secret、token 或 concrete lease handle，也不代表 Cloud worker 已外部送达。

2026-05-18 02:06 已收紧 lease handle 可见性：TS Host Bridge 用 public/internal request 分层，Rust ToolRuntime readiness 优先消费 `agent_app_tool_execution.internalRequest`，Cloud Overlay outbox 文件保留 `secretDeliveryInternal.leaseRef` 供后续 worker 消费，但 ToolResult metadata/output、threadRead、Agent App task events 与 focused smoke summary 只暴露 `leaseObserved=true / leaseRefExposed=false / leaseHandleStatus=host_managed`。验证：`node --check "scripts/agent-app-connector-outbox-smoke.mjs"`、`rustfmt --edition 2021 --check ...connector_tools...`、`npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"` 18 tests passed、`CARGO_TARGET_DIR=/tmp/lime-codex-target-p18e cargo test --manifest-path "src-tauri/Cargo.toml" -p lime agent_app_connector --lib` 11 tests passed、`npm run typecheck` 与同 target `cargo check --manifest-path "src-tauri/Cargo.toml" -p lime --lib --message-format short` 通过；因隔壁仍在跑 content-factory GUI flow，本轮未启动新的 live model smoke 或产品级 GUI smoke。该 seam 只收紧 Host-managed lease handle 边界，不代表 OAuth handshake、raw secret material delivery adapter 或外部 Cloud delivery 已完成。

## 非目标

1. 不在 Agent App Host Bridge 里直接调用 shell、MCP server、浏览器或 connector。
2. 不把 connector token、provider key、workspace secret 明文下发给 App。
3. 不新增 `content_factory_*` 垂直后端命令。
4. 不复活旧 SceneApp / plugin center / compat command surface。
5. 不把 `requires_agent_task`、`requestAuth` 或只读 projection 伪装成执行成功。

## 交付标准

| Gate | 完成标准 | 最小证据 |
| --- | --- | --- |
| Tool execution request | App 调 `lime.tools.invoke` 或分项能力时，Host 创建受控 AgentRuntime task / action，而不是直接执行。 | `capabilityDispatcher.test.ts` 或新增 runtime test 覆盖 request -> AgentRuntime task/action envelope。 |
| Policy / sandbox | 终端、浏览器、MCP、connector 均带 policy reason、scope、approval requirement。 | Rust/TS contract test 断言 dangerous fields 不透传，sandbox/approval metadata 写入 request。 |
| Connector auth | `requestAuth` 只能创建 host-managed authorization request；token 不出 Host。 | test 断言 `secretRef` / token preview 不出现在 App response 或 evidence。 |
| Execution evidence | 执行结果进入 `threadRead.tool_calls`、artifact/evidence 或 task events。 | AgentRuntime snapshot / evidence pack 单测或 focused smoke 断言 tool call、artifact/evidence 可读。 |
| Cancellation / progress | App 只能通过 task/action id 查询或取消，不能绕过 AgentRuntime。 | `getProgress/getRun/cancel` 回归覆盖 running/completed/not_available 分支。 |
| GUI product proof | 内容工厂真实按钮至少一条链路能从 intent -> AgentRuntime -> tool evidence 闭环。 | focused `smoke:agent-apps` 或等价 product E2E summary。 |

## 分期

### P18.7-E1：Execution request envelope

状态：2026-05-17 07:07 已完成 first-cut；Host Bridge 仍不执行工具，只把受控 execution request 固定到 `executionGate.request`。

- 在 Host Bridge 层把 `lime.tools.invoke` / `lime.search.query` / `lime.connectors.invoke` 的 intent 规范化成统一 request envelope。
- Envelope 只包含：`capability`、`method`、`toolName/action`、`input`、`reason`、`appId`、`entryKey`、`taskId/sessionId`、`policy`、`idempotencyKey`。
- 禁止包含：secret 明文、provider key、absolute local path、raw OAuth token、App 自造 evidence id。

### P18.7-E2：AgentRuntime action / task handoff

状态：2026-05-17 07:22 已完成 TS Host first-cut；handoff 进入 `agent_app.tool_execution` task。2026-05-17 07:45 已补 Rust owner binding first-cut，metadata 会被 AgentRuntime / ToolRuntime 消费为 full runtime tool surface 与 session allowlist。

- 首选复用 `lime.agent.startTask` / `agent_app_runtime_start_task` 主链，把 execution request 写入 task metadata。
- 若需要 action approval，复用 `agent_runtime_respond_action` / pending request 机制，不新增平行 connector 命令。
- 输出必须能被 `agent_app_runtime_get_task` 和 `threadRead` 读取。

### P18.7-E3：ToolRuntime owner binding

状态：2026-05-17 07:45 已完成 first-cut；`agent_app.tool_execution` task 不再只是普通 AgentRuntime message，而是带 Tool Execution Owner Contract、full-runtime hint、`agent_app_tool_execution` tool surface 和 ToolRuntime session-scoped permission binding。2026-05-17 14:32 已补 Connector preview seam：exact `connector__<id>__<action>` 可进入 ToolRuntime 并返回受控 `not_available`；2026-05-17 17:03 已补 adapter readiness projection，可区分 desktop system action surface 与 Cloud Overlay 授权事实；2026-05-17 17:50 已补 Host connector runtime facts envelope，把真实 Host projection 传给 Rust seam，但真实 Connector OAuth / Cloud Overlay adapter 仍未打开。

- MCP：继续使用 `mcp__<server>__<tool>` 命名事实源。
- Browser：继续走 Browser Runtime / `mcp__lime-browser__*` 主链。
- Terminal：必须经过 sandbox / approval，不允许 App 直接传 shell 字符串执行。
- Connector：只接受 host-managed connector id + action + input；OAuth / secret binding 留在 Host / Cloud Overlay。
- 当前 first-cut 已覆盖 search canonical `WebSearch`、Browser Assist / `mcp__lime-browser__*`、terminal `Bash/PowerShell` allowlist、MCP exact tool、media creation task alias 和 connector exact `connector__<id>__<action>`；未知工具不开放 wildcard。

### P18.7-E4：Evidence and cancellation

状态：2026-05-17 07:53 已完成 cancellation first-cut；工具类 cancel 只接受 Agent task id 并回到 `lime.agent.cancelTask`，runId-only 场景返回 canonical next action，不绕 Host Bridge 直接取消底层工具进程。2026-05-17 08:12 已完成 tool output/progress/evidence refs 回写 first-cut；`threadRead.tool_calls` 现在投影 arguments、output preview、started/finished/updated 时间和 metadata evidence refs，Agent App task events 会带 `evidenceRef / outputPreview / occurredAt`。2026-05-17 08:31 已完成 connector authorization request handoff first-cut：`requestAuth` 创建 `agent_app.connector_authorization` Host-managed task，authorization envelope 裁剪 raw OAuth token 并保持 token 不出 Host。2026-05-17 08:46 已补 Agent App Runtime snapshot 投影：connector authorization request 会进入 `lime_runtime.runtime_summary`，并在 `agent_app_runtime_get_task` 中形成 `task:blocked` 事件。2026-05-17 09:35 已补 evidence pack 二次脱敏：`runtimeSummary.agent_app_connector_authorization` 导出时会再次裁剪 raw OAuth / refresh token / authorization 子树，同时保留 `connectorId`、`secretBinding=host_managed`、`tokenExposed=false` 等安全事实。2026-05-17 13:55 已补 Host Bridge connector authorization task projection：`lime.connectors.list/getStatus` 可读待授权 connector task。2026-05-17 23:17 已补 Cloud Overlay outbox evidence projection 到 `threadRead.tool_calls` / Agent App task events 的 Rust 定向证据；2026-05-18 00:00 追加支持从 live ToolRuntime output 内 bounded Lime metadata block 提取 outbox evidence refs。真实 Connector OAuth/secret 完整执行和产品级 non-fixture ToolRuntime mutation smoke 仍未完成。

- 执行开始、完成、失败、取消都要回写 task events 或 `threadRead.tool_calls`。
- `getProgress/getRun` 只能读取 runtime facts。
- `cancel` 优先映射到 AgentRuntime task/action cancellation；未支持时继续返回 `not_available`。

## 建议写集

| 层 | 可能文件 | 说明 |
| --- | --- | --- |
| TS Host Bridge | `src/features/agent-app/runtime/capabilityDispatcher.ts` | 只做 request envelope / gate response，不直接执行工具。 |
| AgentRuntime Host | `src/features/agent-app/runtime/agentRuntimeCapabilityHost.ts` | 若需要把 envelope 交给 AgentRuntime task store，在这里接主链。 |
| Rust AgentRuntime | `src-tauri/src/commands/agent_app_runtime_cmd/**`、`src-tauri/src/commands/aster_agent_cmd/**` | 真实 action/task handoff owner；并行写集存在时不要抢 `runtime_turn.rs`。 |
| Evidence | `src-tauri/src/services/runtime_evidence_*` | 只读 evidence pack / completion audit 可消费 tool call facts。 |
| Smoke | `scripts/agent-apps-smoke.mjs` | 最终产品证据，不应作为早期单测替代。 |

## 验证矩阵

1. `npm test -- "src/features/agent-app/runtime/capabilityDispatcher.test.ts"`
2. `npm test -- "src/features/agent-app/runtime/agentRuntimeCapabilityHost.test.ts"`
3. `npm test -- "src/features/agent-app"`
4. `npm run typecheck`
5. Rust touched 时先跑受影响定向测试，再跑 `npm run test:contracts`
6. GUI / product 行为变化后跑 focused `npm run smoke:agent-apps -- --include-content-factory-completion-e2e ...`

## 当前下一刀

继续 P18.7-E4：在 E3 owner binding、cancellation first-cut、tool output/progress/evidence refs 回写 first-cut、connector authorization request handoff first-cut、task snapshot 授权阻塞投影、adapter readiness seam、Host-managed fixture mutation proof、Cloud Overlay outbox adapter first-cut，以及 metadata/output 双路径 outbox evidence projection first-cut、focused live runtime smoke harness 基础上，补真实 Connector OAuth / raw secret material delivery 的 Host/Cloud adapter，并用产品级 smoke 证明 non-fixture mutation 从 Host Bridge / AgentRuntime / ToolRuntime / outbox 或 delivery 稳定回到 GUI task events / artifact / evidence；Connector OAuth / secret binding 仍必须停留在 Host / Cloud Overlay，不允许 Host Bridge 或 Agent App 直拿 token。
