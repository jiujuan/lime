# Lime AgentRuntime Profile 完成审计

> 状态：implementation-audited
> 更新时间：2026-05-12
> 审计范围：`internal/roadmap/agentruntime` 的 PRD、架构、图纸、实施计划、测试用例，以及 Lime current runtime / evidence / replay / analysis / review / AgentUI projection 的落地情况。

## 1. 审计结论

本轮审计结论：AgentRuntime Profile 的 **current 工程主链已形成可执行闭环**。

```text
agent_runtime_submit_turn
  -> AgentRuntimeProfileStream / AgentRuntimeProfileEvent
  -> AgentRuntimeThreadReadModel / TaskSnapshot projection
  -> agent_runtime_export_evidence_pack
  -> Replay / Analysis / Review
  -> AgentUI / Harness / Reliability / Artifact timeline presentation
```

可宣称完成的范围：P0-P5 与 PX 的 **Lime Profile current MVP** 已落地，并有文档、结构测试、Rust 定向测试、前端 projection/i18n 回归和 GUI smoke 证据。

不能过度宣称的范围：公开 AgentRuntime 全量 optional event families、所有 legacy GUI 状态清退、Replay / Analysis / Review Markdown 细粒度正文 copy 完整化、以及跨仓库公开标准认证仍属于后续增强，不应混入本次完成口径。

## 2. 单一事实源声明

| 分类 | 当前结论 |
| --- | --- |
| current | `agent_runtime_submit_turn -> runtime_turn -> AgentRuntimeProfileStream -> AgentRuntimeThreadReadModel -> agent_runtime_export_evidence_pack -> Replay/Analysis/Review/UI projection` |
| compat | 旧 GUI 卡片、旧 evidence/replay 入口可短期读取 current read model 或委托 `agent_runtime_export_*`，不得重建状态 |
| deprecated | GUI 自拼 task/routing/permission/known gaps；analysis/review 各自重建 observability summary；子代理/job/remote 各自维护完成真相 |
| dead | `agentruntime_ui_state`、`objective_runtime`、`evidence_summary_builder_v2`、无 session/thread/turn 关联键的 request telemetry 作为会话证据 |

## 3. 用户显式要求对照

| 要求 | 状态 | 证据 | 说明 |
| --- | --- | --- | --- |
| 分析公开方案 / Claude Code / 运行时实现参考并形成 Lime 标准化方向 | done | `internal/roadmap/agentruntime/prd.md:21` | PRD 固定“公开标准 + Lime 严格 profile + current runtime 实现映射”。 |
| 在 Lime `internal/roadmap/agentruntime` 写 PRD、背景、目的、收益、用户故事 | done | `internal/roadmap/agentruntime/prd.md:8`、`internal/roadmap/agentruntime/prd.md:43`、`internal/roadmap/agentruntime/prd.md:96`、`internal/roadmap/agentruntime/prd.md:221` | PRD 覆盖背景、目标、收益、用户故事、范围和验收。 |
| 增加架构图、流程图、时序图 | done | `internal/roadmap/agentruntime/diagrams.md:7`、`internal/roadmap/agentruntime/diagrams.md:56`、`internal/roadmap/agentruntime/diagrams.md:84` | 图纸集覆盖总体架构、相邻协议协同、主流程、submit turn、tool approval、evidence export、task retry、remote/subagent、UI 只读投影。 |
| 增加测试用例文档 | done | `internal/roadmap/agentruntime/test-cases.md:1` | 测试矩阵覆盖 schema、identity、read model、routing、tool/action、evidence/replay/review、相邻协议、GUI smoke 和治理守卫。 |
| 更新 AgentUI 匹配方案 | done | `src/components/agent/chat/projection/agentUiProjectionSummary.ts`、`src/components/agent/chat/projection/agentUiSubagentsViewModel.ts`、`packages/agent-runtime-ui/src/subagents.tsx` | AgentUI current projection 已接 key-based presentation mapper；Subagents / Harness / Reliability / Artifact timeline 已消费 mapper。 |
| 对齐 AgentContext / AgentEvidence / AgentPolicy | done | `internal/roadmap/agentruntime/adjacent-protocols.md:1`、`lime-rs/src/services/runtime_agent_profile_projection_service.rs:16`、`lime-rs/src/services/runtime_evidence_pack_service.rs` | 相邻协议被固定为 owner refs；Runtime 只串联执行事实，不吞并上下文、策略和证据 schema。 |
| 修复 `agentruntime_profile` private module 编译错误 | done | `lime-rs/src/commands/aster_agent_cmd/mod.rs:340`、`lime-rs/src/commands/aster_agent_cmd/mod.rs:400` | 模块保持私有实现，向 crate 内 re-export `AgentRuntimeProfileEvent/Stream`，避免 service 直接依赖私有 module path。 |
| 拆分 `runtime_evidence_pack_service.rs` | done | `lime-rs/src/services/runtime_evidence_request_telemetry_service.rs:1`、`lime-rs/src/services/runtime_agent_profile_projection_service.rs:1`、`lime-rs/src/services/runtime_evidence_completion_audit_service.rs:1`、`lime-rs/src/services/runtime_evidence_modality_contract_service.rs:1`、`lime-rs/src/services/runtime_evidence_auxiliary_runtime_service.rs:1`、`lime-rs/src/services/runtime_evidence_verification_service.rs:1`、`lime-rs/src/services/runtime_evidence_observability_service.rs:1`、`lime-rs/src/services/runtime_evidence_gap_service.rs:1`、`lime-rs/src/services/runtime_evidence_pack_output_service.rs:1`、`lime-rs/src/services/runtime_evidence_markdown_locale_service.rs:1`、`lime-rs/src/services/runtime_evidence_pack_service_tests.rs:1` | 已拆出 request telemetry、profile projection、completion audit / controlled GET evidence、modality contract、auxiliary runtime、verification / artifact validator、observability / signal coverage、known gaps、pack output renderer、Markdown locale copy、artifact index、JSON/path/tool helper 与大体量单测 fixture；主编排已降到约 377 行。 |
| 全球本地化 | done/current, weak/legacy | `internal/roadmap/agentruntime/prd.md:76`、`src/i18n/resources/zh-CN/agent.json:1188`、`src/i18n/resources/en-US/agent.json:1188`、`lime-rs/src/services/runtime_evidence_markdown_locale_service.rs:1`、`lime-rs/src/commands/aster_agent_cmd/command_api/runtime_api.rs:850` | Profile facts 不本地化、AgentUI projection key-based i18n 已落地；Evidence `summary.md` 支持 zh-CN / zh-TW / en-US / ja-JP / ko-KR，Replay / Analysis / Review Markdown 已接 locale-aware 结构标题与核心标签；legacy diagnostics 与正文级 copy 完整化仍是后续增强。 |
| 按最终选择方案实现，而不是保留平行方案 | done | `internal/roadmap/agentruntime/README.md:60`、`lime-rs/src/services/runtime_replay_case_service.rs:128`、`lime-rs/src/services/runtime_analysis_handoff_service.rs:209` | 最终方案选择 current profile spine + evidence pack 同源导出；Replay/Analysis/Review 复用 evidence pack，不另建事实源。 |

## 4. 阶段矩阵审计

| 阶段 | 状态 | 实现证据 | 测试 / 验证证据 | 剩余口径 |
| --- | --- | --- | --- | --- |
| P0 文档与 profile 冻结 | done | `internal/roadmap/agentruntime/README.md`、`prd.md`、`architecture.md`、`diagrams.md`、`implementation-plan.md`、`test-cases.md`、`adjacent-protocols.md` | 文档入口完整，current/compat/deprecated/dead 与全球本地化边界均写入 roadmap | 无 blocker。 |
| P1 Identity 与事件最小闭环 | done | `lime-rs/src/commands/aster_agent_cmd/agentruntime_profile.rs:878`、`lime-rs/src/commands/aster_agent_cmd/runtime_turn.rs:85` | `submit_turn_event_matches_lime_profile_fixture_shape`、`minimal_submit_turn_events_keep_monotonic_sequence`、`profile_stream_rejects_missing_core_ids` | 独立 JSON fixture 未落盘，当前以结构测试等价覆盖。 |
| P2 ThreadReadModel / Context 收口 | done/weak | `lime-rs/src/services/runtime_agent_profile_projection_service.rs:16`、`lime-rs/src/services/runtime_agent_profile_projection_service.rs:83` | AgentUI / Harness / Reliability 定向测试和 GUI smoke 覆盖 read model projection 展示 | current 投影完成；所有旧 GUI 自拼状态彻底删除仍是治理后续项。 |
| P3 Evidence 同源导出 | done | `lime-rs/src/services/runtime_evidence_pack_service.rs`、`lime-rs/src/services/runtime_evidence_request_telemetry_service.rs`、`lime-rs/src/services/runtime_replay_case_service.rs:128`、`lime-rs/src/services/runtime_analysis_handoff_service.rs:209` | `evidence_runtime_should_export_agent_runtime_profile_spine`、request telemetry 空摘要测试、replay/analysis/review 定向测试 | Evidence facts JSON 同源完成；Markdown presentation locale 属于 PX，已完成 current 结构标题与核心标签。 |
| P4 Task / routing / permission / tool | done | `lime-rs/src/commands/aster_agent_cmd/agentruntime_profile.rs:294`、`lime-rs/src/commands/aster_agent_cmd/runtime_task_profile.rs:52`、`lime-rs/src/commands/aster_agent_cmd/runtime_turn.rs:6001` | `routing_events_match_single_candidate_fact_shape`、`runtime_tool_profile_should_follow_real_tool_start_and_end_once`、`runtime_tool_profile_should_fallback_to_item_tool_call_failure`、`collect_runtime_request_resolution_side_events_should_emit_routing_not_possible` | Policy allow/deny/ask facts 已进入 profile；更细的 obligation UI 展示可后续增强。 |
| P5 Subagent / Job / Remote Channel | done | `lime-rs/src/services/runtime_agent_profile_projection_service.rs:385`、`lime-rs/src/services/runtime_agent_profile_projection_service.rs:467`、`lime-rs/src/services/runtime_agent_profile_projection_service.rs:648` | `evidence_runtime_should_export_subagent_parent_child_profile_events`、`evidence_runtime_should_export_job_profile_events_from_owner_runs`、`evidence_runtime_should_export_job_item_profile_events_from_owner_run_metadata`、`evidence_runtime_should_export_remote_channel_resume_repair_profile_events` | 已覆盖 owner run / parent-child / resume-repair facts；真实远端端到端恢复可作为产品级 E2E 后续。 |
| PX 全球本地化守卫 | done/current, weak/legacy | `src/components/agent/chat/projection/agentUiProjectionSummary.ts`、`src/i18n/resources/*/agent.json`、`lime-rs/src/services/runtime_evidence_markdown_locale_service.rs` | `agentUiSubagentsViewModel` locale 单测、5 locale key count 一致、i18n namespace tests、Evidence/Replay/Analysis/Review Markdown locale Rust 定向测试 | AgentRuntime projection 与 current Markdown 导出结构标题已本地化；legacy diagnostics 和正文级 copy 完整化不是本轮完成口径。 |

## 5. 关键测试用例覆盖

| 用例组 | 状态 | 等价实现测试 |
| --- | --- | --- |
| AR-P0-DOC-* | done | roadmap 文件完整，README 链接本审计文档后形成闭环。 |
| AR-SCHEMA / AR-ID / AR-EVENT | done | `agentruntime_profile.rs` 的 schema / sequence / missing id / policy / tool / routing / task / subagent / job / channel shape 测试。 |
| AR-READ / AR-CTX | done/weak | `runtime_agent_profile_projection_service.rs` 把 contextSummary / telemetrySummary / evidenceSummary / refs 投入 `agentRuntimeProfile`；旧 GUI 清退不作为本次完成 blocker。 |
| AR-ROUTE | done | routing single candidate / not possible / multi candidate decided 已有 stream 方法、projection 和 evidence tests。 |
| AR-ACTION / AR-POL | done | policy/action profile shape、tool hook real event 优先、ToolCall fallback 去重、permission signal coverage tests。 |
| AR-EVID / AR-EVID-LINK | done | `agent_runtime_export_evidence_pack` 输出 `runtime.json` / `artifacts.json` / observability correlation；request telemetry 无匹配时输出空摘要。 |
| AR-UI-LINK | done | `AgentUI projection presentation 使用 i18n key` 已在 projection mapper、Subagents、Harness、Reliability、Artifact timeline 单测覆盖。 |
| AR-CONTRACT | done | 本轮未新增命令边界；已有 `agent_runtime_*` current command contract 在既有 contract 测试口径内。 |
| AR-GUI | done/weak | `npm run verify:gui-smoke` 已覆盖 GUI 壳、DevBridge、workspace、runtime tool surface 等最小主路径；真实 tool approval 人机交互可继续补 Playwright 场景。 |
| AR-GOV | done/weak | current/deprecated/dead 分类已写入路线图；更强自动扫描守卫可在后续治理轮次继续收。 |

## 6. 已记录验证

| 命令 | 状态 | 覆盖范围 |
| --- | --- | --- |
| `cargo fmt --manifest-path "lime-rs/Cargo.toml" --check` | passed | Rust 格式。 |
| `CARGO_TARGET_DIR="/tmp/lime-agentruntime-tool-profile-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_tool_profile` | passed | 真实 ToolStart/ToolEnd profile hook 与 ToolCall fallback 去重。 |
| `CARGO_TARGET_DIR="/tmp/lime-agentruntime-tool-profile-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime agentruntime_profile` | passed | AgentRuntime profile schema、routing、task、subagent、job、remote channel 结构测试。 |
| `npm test -- ...AgentUI projection/i18n tests...` | passed | 9 个前端/i18n 测试文件、103 tests，通过 AgentUI presentation mapper 与 locale resources。 |
| `npm run typecheck` | passed | 前端类型边界。 |
| `npm run verify:gui-smoke` | passed | GUI 壳、DevBridge、workspace、browser runtime、runtime tool surface、knowledge GUI、design canvas 最小冒烟。 |
| `rustfmt --edition 2021 --check lime-rs/src/services/runtime_evidence_* lime-rs/src/services/mod.rs` | passed | 本轮 Evidence service 拆分后的 Rust 格式。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime --lib` | passed | 本轮 Evidence service 拆分后的 Lime lib 编译。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime completion_audit --lib` | passed | Completion audit / controlled GET evidence 拆分后的定向单测。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_evidence_pack_service --lib` | passed | 本轮 Evidence pack 拆分与 summary Markdown locale 的 41 个定向单测。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_replay_case_service --lib` | passed | Replay case 导出与 `grader.md` locale-aware presentation。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_analysis_handoff_service --lib` | passed | Analysis handoff 导出、`analysis-brief.md` 与 copy prompt locale-aware presentation。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime runtime_review_decision_service --lib` | passed | Review decision 导出与 `review-decision.md` locale-aware presentation。 |
| `CARGO_TARGET_DIR="/tmp/lime-request-model-resolution-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime modality_runtime_contract --lib` | passed | 本轮 modality contract 拆分后的 18 个相关单测。 |
| `npm run test:contracts` | passed | AgentRuntime client 生成检查、Tauri command 四侧契约、Harness metadata contract、modality runtime contracts 与 cleanup report contract。 |
| `npm run governance:legacy-report` | passed | legacy surface 扫描边界违规为 0；本轮未让 deprecated/dead runtime truth 回流。 |

## 7. 未完成但不阻塞本次主链的弱项

| 弱项 | 影响 | 建议下一刀 |
| --- | --- | --- |
| Replay / Analysis / Review Markdown 正文级 copy 仍未完全细分 | Evidence `summary.md` 已支持 5 locale，Replay / Analysis / Review Markdown 已接同一套 locale copy 的结构标题与核心标签；facts JSON 仍稳定 | 后续只继续把长段落说明、验证摘要、review checklist 和 fallback 文案细分为 copy 字段，不改变 runtime facts 或命令协议。 |
| `runtime_evidence_pack_service_tests.rs` 测试 fixture 仍偏大 | 生产 service 已全部低于 800 行，但单测 fixture 文件仍集中承载大量 artifact / telemetry / approval 场景 | 后续只拆测试 fixture builder，不改变 `agent_runtime_export_evidence_pack` current 事实源。 |
| 独立 fixture JSON 未全部落盘 | 文档里的 fixture 名与测试文件不是一一对应 | 若需要跨仓库标准验收，新增 `lime-rs/tests/fixtures/agentruntime-profile/*.json` 或 docs fixture，并让 Rust 测试读 fixture。 |
| legacy GUI diagnostics 仍有非 key-based 文案 | 不影响 AgentRuntime facts，但影响全球本地化完整度 | 另开 i18n cleanup，不把 legacy diagnostics 的全量迁移混入 AgentRuntime current 主链。 |
| 真实远端恢复 / tool approval Playwright E2E 可继续加强 | GUI smoke 已证明壳和主路径可运行，但人机审批完整交互仍可更强 | 后续用 `lime-playwright-e2e` 补一个最小 approve/deny 和 remote resume 产品场景。 |

## 8. 完成判定

本次路线图按 **current MVP 工程闭环** 判定为完成：AgentRuntime 不再只是文档或平行协议，而是已经绑定到 Lime runtime、evidence、replay、analysis、review 与 AgentUI projection 的单一事实源。

若按“完整产品化标准”判定，仍需继续做弱项清理，尤其是 Replay / Analysis / Review Markdown 正文级 copy 完整化、测试 fixture 外置和更强 GUI E2E。
