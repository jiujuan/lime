# Claw Trace 实施计划

> 状态：implementation plan active / Workspace Trace Tab non-send UX completed
> 更新时间：2026-06-28

## 1. 阶段总览

```text
P0 体系冻结与首字分段
-> P1 App Server / renderer 最小 trace
-> P2 Aster provider phase trace
-> P3 Developer UI / support bundle
-> P4 W3C trace context / OTEL 可选出口
-> P5 GUI smoke / regression evidence
```

## 2. P0：体系冻结与文档事实源

目标：

1. 建立 `internal/roadmap/trace` 文档。
2. 冻结 trace taxonomy、配置模型、首字分段指标。
3. 明确 provider/API 与 Lime 本地输出分界。
4. 明确不使用正文 hard code，不新增第二套 runtime event。

验收：

1. PRD / architecture / diagrams / code-map / implementation-plan 存在。
2. 文档明确 Codex 参考点。
3. 文档明确 Developer & Labs 开关和默认关闭策略。

## 3. P1：App Server / Renderer 最小 Trace

目标：

1. Renderer submit 创建 `trace_id` 并写入 request metadata。
2. App Server 接收 turn 时建立 `claw.turn` root span。
3. App Server `message.delta` emit 前记录 `message_delta.emitted`。
4. Renderer 记录：
   - `renderer_event.received`
   - `renderer_text_delta.applied`
   - `renderer_text.flush`
   - `renderer_text.first_paint`
5. Projector 输出首字分段 summary。

最低测试：

```bash
npm test -- "src/components/agent/chat/hooks/agentStreamTextDeltaController.test.ts" "src/components/agent/chat/hooks/agentStreamTextRenderFlushController.test.ts" "src/components/agent/chat/hooks/agentStreamPerformanceMetrics.test.ts"
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server trace
```

若新增 App Server protocol method，额外运行：

```bash
npm run test:contracts
```

验收：

1. fixture turn 可输出 `provider_wait_ms = null`、renderer 本地链路指标非空。
2. App Server emit timestamp 和 renderer receive timestamp 可计算 bridge delivery。
3. Trace disabled 时不写 raw trace 文件。

当前进度：

1. Renderer 已在 Trace 开启时生成 `agentUiPerformanceTrace` metadata，并随 submit op 传入 App Server。
2. App Server 已通过 `runtime/trace.rs` 与 `runtime/event_store.rs` 从 existing runtime events 映射 `app_server.turn.received`、`app_server.message_delta.emitted`、`app_server.turn.terminal`。
3. Renderer 已保留 `server_event_emitted_at / renderer_event_received_at / trace_id / run_id / request_id`，可计算 bridge delivery。
4. `fastResponseRouting.ts` 已收敛默认 slot/resolver/status/reasoning 到结构化 routing profile，metadata 携带 `profile_id` 便于 trace/diagnostic 关联。

## 4. P2：Aster Provider Phase Trace

目标：

1. Aster reply loop 将 provider request / first event / first text delta 转为结构化 `ProviderTrace`。
2. direct answer no-tools 路径继续保留 MOIM skip 日志，并在 provider call 前记录 request start。
3. provider failed / canceled 时输出 `provider.failed` / `provider.canceled` 诊断事件。
4. App Server 从现有 event 映射 trace vocabulary，计算 `provider_wait_ms` 不再依赖正文或 renderer 反推。

最低测试：

```bash
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core direct_answer
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core provider_trace
```

当前进度：

1. `aster::agents::ProviderTraceEvent` 已覆盖 `request_started / first_event_received / first_text_delta_received / failed / canceled`。
2. `lime_agent::AgentEvent::ProviderTrace` 透传安全 metadata：provider、model、attempt、elapsed_ms、text_chars、status、failure_category，不写 prompt / provider payload。
3. `ProviderTraceEvent` 已透传 provider response header request id：`provider_request_id / provider_request_id_header`，只作为安全 scalar 进入 RuntimeEvent 和 trace store metrics，不写 provider body。
4. `runtime_backend/tool_events.rs` 已映射到 `provider.request.started`、`provider.first_event.received`、`provider.first_text_delta.received`、`provider.failed`、`provider.canceled`。
5. `runtime/trace.rs` 已为 `provider.*` event 附加 `trace_id / run_id / request_id / server_event_emitted_at / trace.checkpoint`。
6. Renderer event projector 已将 `provider.*` 投影为 `provider_trace`，并在 diagnostics summary 中输出 `providerWaitMs / serverToRendererFirstTextDeltaMs / rendererApplyFirstTextDeltaMs / clientLocalOutputMs`。
7. 定向验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_trace`。
8. 前端定向验证通过：`npx vitest run "src/lib/api/agentProtocol.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeMetricsController.test.ts" "src/components/agent/chat/hooks/agentStreamPerformanceMetrics.test.ts" "src/components/agent/chat/hooks/agentStreamTextRenderFlushController.test.ts"`。

剩余：

1. live provider 不作为常规回归门槛；S7 用 fixture / simulated stream 产出 evidence。
2. support bundle 还需默认只导出 summary，不导出 prompt / raw provider payload。

## 5. P3：Developer UI / Support Bundle

目标：

1. Developer & Labs 增加 Claw Trace panel。
2. 支持开关、level、采样率、清理历史、导出当前 trace。
3. support bundle 包含 trace summary。
4. Trace detail 展示：
   - turn overview
   - phase duration table
   - span tree
   - missing checkpoints
   - redaction policy

最低测试：

```bash
npm test -- "src/components/settings-v2/system/developer/index.test.tsx"
npm test -- "src/lib/crashDiagnostic.test.ts"
```

如触达 GUI 主路径：

```bash
npm run smoke:agent-runtime-current-fixture
```

验收：

1. 默认 off。
2. 开启后复现一次 Claw fixture 能导出 trace summary。
3. 清理历史不会删除普通日志和 session history。

当前进度：

1. Developer & Labs 的 Developer Tools 已接入独立 `developer.claw_trace.enabled` 开关，不复用 `workspace_harness_enabled`。
2. `ClawTraceSettingsPanel` 已拆出独立组件，支持 `level`、`sample_rate`、复制当前 Trace summary JSON、清空内存 summary。
3. 设置页保存会保留 `claw_trace.level = summary` 与 `sample_rate = 1` 的默认配置，默认仍关闭。
4. `buildCrashDiagnosticPayload` 已默认附加 `agent_ui_performance_summary`，只导出 session 级数值指标、phase 列表与计数，不导出 raw entries / prompt / provider payload。
5. `src/lib/crashDiagnosticAgentUiPerformance.ts` 承担 summary 裁剪，避免继续向超大 `crashDiagnostic.ts` 追加复杂逻辑。
6. `src/lib/agentUiPerformanceTraceHistory.ts` 已接入 compact Trace history：保存当前 summary 快照、复制 history JSON、清空 history，保留最近 20 个快照 / 7 天。
7. Developer UI 已展示 history 状态与 retention policy；history export 显式标记 `compact_summary_only`，不导出 raw entries / prompt / provider payload。
8. App Server 已接入内部 summary-only raw trace store：
   - `runtime/trace_store.rs` 从 current `AgentEvent.payload.trace` 投影统一 `RawTraceEvent` envelope。
   - JSONL 落到 `runtime/traces/sessions/session_<session>/trace_<trace>.jsonl`，每个 session 保留最近 100 个 trace 文件。
   - redaction policy 固定为 `summary_only`，不保存 raw event payload / prompt / provider payload / assistant text。
   - writer 缓存同一 trace 文件的 `next_seq`，retention 只在新 trace 文件创建后触发，避免每个 streaming delta 都扫描完整 trace 文件或 session 目录。
9. App Server 已开放 summary-only raw trace read/list current API：
   - JSON-RPC method：`diagnostics/trace/list`、`diagnostics/trace/read`。
   - Rust protocol / schema / processor / runtime diagnostics / trace store 已同步。
   - `packages/app-server-client`、`src/lib/api/appServer*`、`src/lib/api/serverRuntime.ts` 已同步 frontend gateway。
10. Developer UI 已可复制 App Server Trace 列表和最近一条 Trace JSON，仍只导出 redaction policy 为 `summary_only` 的 envelope，不导出 prompt / provider payload / assistant text。
11. Trace summary 已收紧为逻辑相对路径，不向 Developer UI 暴露本机 trace root 或绝对 JSONL 路径。
12. Developer UI 已接入 summary-only timeline / phase span：
    - `src/lib/trace/clawTraceTimeline.ts` 从现有 `diagnostics/trace/read` events 投影 timeline rows 与 phase spans。
    - 面板点击加载最新 Trace timeline 时才请求 App Server，不在设置页打开时自动查询。
    - UI 只展示 checkpoint、phase、offset/delta 与安全 scalar metrics，不展示 raw payload。
13. Developer UI 已接入 summary-only filter / selected event detail：
    - `clawTraceTimeline.ts` 提供 all / phase / slow segment 过滤函数，React 面板不重复实现 phase 判断。
    - 面板可筛选 Provider / API、App Server、Renderer、Terminal、Slow events，并查看选中事件的 checkpoint、phase、seq、event type、offset/delta 和 safe metrics。
    - 该 drilldown 不新增 App Server method，只消费 `diagnostics/trace/read` 的 summary-only events。
14. Developer UI 已接入 summary-only span drilldown：
    - `clawTraceTimeline.ts` 提供稳定 span key、span 查找和 span 内 row 过滤 helper，React 面板不重复实现 offset range 判断。
    - Phase span 卡片可点击，点击后直接定位该 span 内事件，并在详情区展示 selected span summary。
    - 该 drilldown 不新增 App Server method，不读取 raw JSONL 原始字节，不展示 prompt / provider payload / assistant delta text 或 `tracestate`。
15. Developer UI 已接入 compact baseline compare：
    - `clawTraceBaseline.ts` 从当前 compact summary 与最近 Trace history record 投影 metric delta 和 verdict。
    - 当前先比较 `providerWaitMs / serverToRendererFirstTextDeltaMs / rendererApplyFirstTextDeltaMs / clientLocalOutputMs`，不读取 raw entries / prompt / provider payload。
    - `ClawTraceBaselineComparisonCard` 展示 baseline label、verdict 和 metric delta；`ClawTraceSettingsPanel` 只负责数据装配。
16. Developer UI 已接入 compact long-term baseline：
    - `clawTraceBaseline.ts` 从 retained compact history window 中选择最早快照作为 `oldest_retained_snapshot` baseline，避免最近慢样本成为新 baseline。
    - comparison 输出 `baseline_strategy / history_record_count / latest_saved_at`，UI 展示 baseline window；仍只消费 compact summary 聚合数值，不读取 raw entries / prompt / provider payload。
17. Developer UI 已接入 App Server summary-only trace compare：
    - `clawTraceAppServerComparison.ts` 从 retained trace window 选择最新 trace 与最早保留 trace，再基于 timeline projection 投影 metric delta、verdict 和 trace window 信息。
    - 当前比较 `provider.request.started -> provider.first_event / first_text_delta`、`provider.first_text_delta -> app_server.message_delta.emitted`、`app_server.message_delta.emitted -> app_server.turn.terminal` 与 root duration。
    - 面板只有点击加载最新 Trace timeline 时才读取 retained summary list，并只读取最新 / 最早两条 App Server trace 详情；不在设置页打开时自动查询；compare 不新增 App Server method，不读取 raw JSONL / prompt / provider payload / assistant delta text。
18. Developer UI 已接入 regression evidence 归因报告：
    - `clawTraceRegressionReport.ts` 合并 compact baseline 和 App Server compare 的 summary-only metric delta，归因到 Provider / API、App Server 或 Lime 本地输出。
    - root duration 只作为 App Server compare 展示，不进入归因 totals，避免总时长与分段指标重复计数。
    - `ClawTraceRegressionReportCard` 展示归因焦点、compact/App Server window、owner totals 与 top segments；不新增 App Server method，不读取 raw JSONL / prompt / provider payload / assistant delta text。
19. Developer UI 已接入手动 regression trend history：
    - `clawTraceRegressionTrend.ts` 将 regression report 保存到 localStorage retained window，保留最近 20 条 / 7 天。
    - trend history 只保存 summary-only report、verdict、owner totals、segment delta 和 window 计数，不保存 raw entries / raw trace JSONL / prompt / provider payload / assistant delta text。
    - `ClawTraceRegressionReportCard` 提供 Save / Copy / Clear 显式动作；打开设置页本身不查询 App Server，也不会自动保存 trend。
20. Developer UI 已接入 summary-only regression alert 投影：
    - `clawTraceRegressionAlert.ts` 只消费当前 regression report 和手动 retained trend records，输出 `none / watch / warning / critical`。
    - repeated owner 和 delta threshold 判断集中在纯 projector；React 只展示状态，不保存新数据、不后台采集、不新增 App Server method。
    - alert 继续沿用 summary-only report，不读取 raw entries / raw trace JSONL / prompt / provider payload / assistant delta text。
21. Developer UI 已接入 regression alert channel 显式开关：
    - `developer.claw_trace.alert_enabled` 默认关闭，只控制本面板是否评估 alert，不影响 Trace 采集开关。
    - `ClawTraceConfigControls.tsx` 承接 trace enabled / level / sample_rate / alert channel 配置 UI，避免 `ClawTraceSettingsPanel.tsx` 继续膨胀。
    - alert channel 关闭时，card 只展示关闭态，不计算 watch / warning / critical；开启后才消费当前 report 与手动 retained trend。
22. Developer UI 已接入本地 summary-only regression alert channel inbox：
    - `clawTraceRegressionAlertChannel.ts` 只在 `alert_enabled=true` 且当前 panel 已有 watch / warning / critical 投影时写入 localStorage retained inbox。
    - retained window 固定为最近 20 条 / 7 天，相同 alert/report fingerprint 去重，`none` alert 不写入。
    - channel export 显式标记 `mode=summary_only_alert`，不保存 raw entries / raw trace JSONL / prompt / provider payload / assistant delta text。
    - `ClawTraceRegressionReportCard` 展示 channel count、latest severity、retention policy，并提供 Copy alert channel / Clear alert channel 显式动作；不自动查询 App Server、不上传。
    - S32 在本地 channel 之上增加 local notification dispatcher：`alert_notification_enabled` 默认关闭，只对新写入的 summary-only alert record 尝试本地通知，相同 fingerprint 不重复通知；不自动请求系统通知权限。
    - S33 将通知尝试接入 Electron Desktop Host 原生 Notification：`show_desktop_notification` 属于系统壳命令，不新增 App Server method；Host 只接受 summary-only title/body/tag/silent，拒绝 raw trace 旁路。
    - S34 在主窗口接入 foreground global alert monitor：监听本地 Agent UI performance summary-only metric 事件并 debounce 评估 compact summary/history；离开 Developer 设置页后仍可写入 summary-only alert channel 并触发通知；不调用 App Server trace list/read，不做 OS daemon。
23. Developer UI 已完成组件拆分：
    - `ClawTraceSettingsPanel.tsx` 保留配置、动作和数据装配，从 1300+ 行降到 734 行。
    - `ClawTraceTimelineView.tsx` 承接 timeline filter、span drilldown 和 selected event detail。
    - `ClawTraceBaselineComparisonCard.tsx` 承接 baseline compare 展示。
    - `ClawTraceAppServerComparisonCard.tsx` 承接 App Server trace compare 展示。
    - `ClawTraceRegressionReportCard.tsx` 承接 regression evidence 与 trend history 展示 / 动作。
    - `ClawTraceConfigControls.tsx` 承接 Claw Trace 顶部配置控件。
    - `clawTraceRegressionAlert.ts` 承接 regression alert severity / reason / repeated owner projector。

补充进度：

- 工作台 Trace Tab 已区分发送链路与非发送链路：
  - `claw_turn` 会话继续展示首字分段、baseline compare、regression attribution、client health 和 phase coverage。
  - history restore / unknown 非发送链路不再渲染首字、baseline、regression 空面板，只展示可用恢复耗时、session 摘要和 recorded phases。
  - 该视图不新增协议、不查询 App Server、不读取 raw entries / prompt / provider payload / assistant delta text。

24. 定向验证通过：`npx vitest run "src/components/settings-v2/system/developer/index.test.tsx" "src/lib/crashDiagnostic.test.ts" "src/components/agent/chat/hooks/agentStreamPerformanceMetrics.test.ts"`，3 个文件、43 个用例通过。
25. Rust writer 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server trace_writer -- --nocapture`，2 个 writer 用例通过。
26. Trace read/list 网关验证通过：`npx vitest run "src/lib/api/serverRuntime.test.ts" "src/lib/api/appServer.test.ts" "src/lib/api/logs.current-boundary.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，4 个文件、57 个用例通过。
27. Trace read/list redaction hardening 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server trace`、`npm run test:contracts`、`git diff --check`。
28. Timeline projector / UI 验证通过：`npx vitest run "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，2 个文件、21 个用例通过。
29. Timeline filter / selected event detail 验证通过：`npx vitest run "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，2 个文件、24 个用例通过。
30. Timeline span drilldown 验证通过：`npx vitest run "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，2 个文件、24 个用例通过；`npx eslint` 覆盖 timeline 与 Developer UI 写集通过。
31. Baseline compare 验证通过：`npx vitest run "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，3 个文件、27 个用例通过；`npx eslint` 覆盖 baseline projector 与拆分组件通过。
32. Compact long-term baseline 验证通过：`npx vitest run "src/lib/trace/clawTraceBaseline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，2 个文件、26 个用例通过；`npx eslint` 覆盖 baseline projector 与 Developer UI card 通过。
33. App Server Trace compare 验证通过：`npx vitest run "src/lib/trace/clawTraceAppServerComparison.test.ts" "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，4 个文件、30 个用例通过。
34. Timeline / contract 收口验证通过：`npx eslint` 覆盖 timeline 与 Developer UI 写集、`npx vitest run` 覆盖 5 个相关测试文件、`npm run test:contracts`、`git diff --check`。`npm run typecheck` 运行约 3 分钟无输出后中断，退出码 `130`，后续全量收口前仍需重跑。
35. App Server retained-window baseline 验证通过：`npx vitest run "src/lib/trace/clawTraceAppServerComparison.test.ts" "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，4 个文件、32 个用例通过；`npx eslint` 覆盖 App Server compare projector 与 Developer UI 写集通过。
36. Regression evidence 验证通过：`npx vitest run "src/lib/trace/clawTraceRegressionReport.test.ts" "src/lib/trace/clawTraceAppServerComparison.test.ts" "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，5 个文件、34 个用例通过；`npx eslint` 覆盖 regression projector、App Server compare projector 与 Developer UI 写集通过。
37. Regression trend history 验证通过：`npx vitest run "src/lib/trace/clawTraceRegressionTrend.test.ts" "src/lib/trace/clawTraceRegressionReport.test.ts" "src/lib/trace/clawTraceAppServerComparison.test.ts" "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，6 个文件、37 个用例通过；`npx eslint` 覆盖 trend history、regression card 与 Developer UI 写集通过。
38. Regression alert projection 验证通过：`npx vitest run "src/lib/trace/clawTraceRegressionAlert.test.ts" "src/lib/trace/clawTraceRegressionTrend.test.ts" "src/lib/trace/clawTraceRegressionReport.test.ts" "src/lib/trace/clawTraceAppServerComparison.test.ts" "src/lib/trace/clawTraceBaseline.test.ts" "src/lib/trace/clawTraceTimeline.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，7 个文件、42 个用例通过；`npx eslint` 覆盖 alert projector、regression card 与 Developer UI 写集通过；`npm run test:contracts` 通过。
39. Regression alert channel control 验证通过：`npx vitest run "src/lib/developerFeatures.test.ts" "src/components/settings-v2/system/developer/index.test.tsx" "src/lib/trace/clawTraceRegressionAlert.test.ts"`，3 个文件、36 个用例通过；`npx eslint` 覆盖配置、拆分组件、regression card 与 Developer UI 测试通过；`npm run test:contracts` 通过；`ClawTraceSettingsPanel.tsx` 当前 734 行，低于 800 行预警线。
40. Local alert channel inbox 验证通过：`npx vitest run "src/lib/trace/clawTraceRegressionAlertChannel.test.ts" "src/lib/trace/clawTraceRegressionAlert.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，3 个文件、33 个用例通过；`npx eslint` 覆盖 alert channel、alert projector、regression card 与 Developer UI 测试通过；`npx prettier --check` 覆盖 S31 TS/TSX 与五语言 settings 写集通过。
41. Local notification dispatcher 验证通过：`npx vitest run "src/lib/developerFeatures.test.ts" "src/lib/trace/clawTraceRegressionAlertNotifier.test.ts" "src/lib/trace/clawTraceRegressionAlertDispatcher.test.ts" "src/lib/trace/clawTraceRegressionAlertChannel.test.ts" "src/lib/trace/clawTraceRegressionAlert.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，6 个文件、51 个用例通过。
42. Electron desktop notification bridge 验证通过：`npx tsc --noEmit --project "tsconfig.electron.json" --pretty false`；`npx vitest run "electron/ipcChannels.test.ts" "electron/hostCommands.test.ts" "src/lib/api/desktopNotification.test.ts" "src/lib/trace/clawTraceRegressionAlertNotifier.test.ts" "src/lib/trace/clawTraceRegressionAlertDispatcher.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，6 个文件、134 个用例通过；`npx eslint` 覆盖 Electron Host、API 网关、trace notifier 与 Developer regression card 写集通过。
43. Foreground global alert monitor 验证通过：`npx vitest run "src/lib/agentUiPerformanceMetrics.test.ts" "src/lib/trace/clawTraceRegressionAlertPresentation.test.ts" "src/lib/trace/clawTraceRegressionAlertMonitor.test.ts" "src/hooks/useClawTraceRegressionAlertMonitor.test.tsx" "src/components/settings-v2/system/developer/index.test.tsx"`，5 个文件、36 个用例通过；`npx eslint` 覆盖 App 主窗口 hook、monitor service、presentation helper、metrics event 与 regression card 写集通过；monitor 静态断言防止导入 `listDiagnosticsTraces` / `readDiagnosticsTrace`。
44. Support bundle 已默认包含 summary-only trace store 摘要：
    - `meta/trace-store-summary.json` 进入支持包、manifest、README 和 `included_sections`。
    - raw trace event JSONL 正文默认进入 `omitted_sections`，不随支持包导出。
    - `runtime/trace_store.rs` 是 JSONL schema / parser owner，support bundle 只消费 `summarize_trace_event_store` 投影，避免维护第二套 raw event parser。
    - `StorageRoots::from_data_root` 提供只读路径派生，support bundle 不再 hard code `runtime/traces`，也不会导出时创建 runtime 目录。
    - `runtime/trace_store.rs` 内联测试迁到 `runtime/tests/trace_store.rs`，生产文件降到 800 行预警线以下。
45. Support bundle 定向验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server support_bundle -- --nocapture`，2 个用例通过；Trace 主链验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server trace -- --nocapture`，11 个用例通过。
46. App Server 已接入显式 summary-only trace export current API：
    - JSON-RPC method：`diagnostics/trace/export`。
    - Rust protocol / schema / processor / runtime diagnostics / trace store 已同步。
    - `packages/app-server-client`、`src/lib/api/appServer*`、`src/lib/api/serverRuntime.ts` 已同步 frontend gateway。
    - 导出 zip 包含 `meta/manifest.json`、`meta/trace-summary.json`、`trace/events.jsonl`、`README.txt`。
    - `trace/events.jsonl` 由 `RawTraceEvent` 重新序列化生成，不复制原始 JSONL 字节；manifest 显式声明 `summaryOnlyTraceEventsIncluded=true`。
    - export helper 已拆到 `runtime/trace_store/export.rs`，support bundle summary projector 已拆到 `runtime/trace_store/summary.rs`；`runtime/trace_store.rs` 保持在 698 行。
47. Developer UI 已增加“Export latest Trace”显式动作：点击时才读取最新 trace 并调用 `diagnostics/trace/export`；打开设置页本身不自动查询 App Server。
48. Trace export 验证通过：`npx vitest run "src/lib/api/serverRuntime.test.ts" "src/lib/api/appServer.test.ts" "src/lib/api/logs.current-boundary.test.ts" "src/components/settings-v2/system/developer/index.test.tsx"`，4 个文件、60 个用例通过。
49. Protocol / Rust / contract 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol catalog -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures -- --nocapture`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server trace -- --nocapture`、`npm run test:contracts`。
50. 全量 `npm run typecheck` 曾运行超过 3 分钟无输出后中断，退出码 `130`；S34 本轮再次运行 `npx tsc --noEmit --pretty false` 时触发 TypeScript 编译器内部错误 `Debug Failure. No error for last overload signature`，无源码位置；本阶段以定向 Vitest、ESLint、Electron/Node typecheck、Rust test 与 contract 覆盖新增写集。
51. Notification host test split 验证通过：`npx vitest run "electron/desktopNotificationHost.test.ts" "electron/hostCommands.test.ts" "src/lib/api/desktopNotification.test.ts"`，3 个文件、94 个用例通过；`npx eslint` 覆盖 Electron notification Host、dispatcher smoke 与前端 API 网关通过；`npx prettier --check` 与 `git diff --check` 覆盖 S35 文档 / 测试写集通过；`npm run test:contracts` 通过。S35 未新增 App Server method 或生产 mock，`hostCommands.test.ts` 只保留 dispatcher smoke，Host 细节回归落在 `desktopNotificationHost.test.ts`。

剩余：

1. 离开 Developer 设置页后的主窗口 foreground 持续告警评估已落地；系统级后台 daemon / 应用完全关闭后的告警尚未落地。当前已完成 Developer UI 的 compact retained-window baseline、App Server retained-window summary-only trace compare、regression evidence 归因报告、手动 retained trend history、summary-only regression alert 投影、alert channel 显式开关、本地 summary-only alert channel inbox、本地通知 dispatcher、Electron Desktop Host 原生通知桥、foreground global alert monitor、通知 Host 模块级测试拆分、summary-only timeline、phase span、slow/gap diagnostics、filter、selected event detail 和 span drilldown。
2. support bundle 已默认包含 compact Agent UI performance summary 与 trace-store summary；默认仍不包含 history 或 raw trace JSONL 正文，避免无界扩大诊断包。

## 6. P4：W3C Trace Context / OTEL

目标：

1. 兼容 `traceparent / tracestate`。
2. renderer -> App Server -> Aster -> provider HTTP headers 可传递 trace context。
3. OpenTelemetry exporter 可选，默认 off。
4. 上游 provider request id 与本地 trace 关联。

验收：

1. 没有有效 traceparent 时自动创建内部 trace id。
2. 有 traceparent 时可延续父 trace。
3. invalid traceparent 被忽略并记录 warning，不阻断 turn。
4. provider request id 只从 response headers 提取，作为 summary-only 安全 scalar 进入 trace evidence。

当前进度：

1. Renderer -> App Server carrier 已完成：`agentUiPerformanceTrace.w3cTraceContext` 携带合法 `traceparent`，App Server 共用 `trace_context.rs` 校验和归一化。
2. App Server request span 已完成：`app_server.request` server span 记录安全 scalar trace/session 字段，不记录 prompt、assistant delta、provider payload、raw JSONL 或 `tracestate`。
3. OpenTelemetry remote parent 已完成：`otel_trace.rs` 将合法 W3C carrier 设置为 OTEL remote parent，request trace 测试 exporter 已证明导出 span 继承 renderer trace id / parent span id。
4. OTLP exporter 入口已完成：默认关闭；仅在 `APP_SERVER_OTEL_EXPORTER=otlp`、`OTEL_TRACES_EXPORTER=otlp`、`OTEL_EXPORTER_OTLP_ENDPOINT` 或 `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` 显式配置时安装。
5. App Server -> Aster -> provider HTTP headers 已完成：`request_context.rs` 将合法 carrier 投影为 `w3c_trace_context`，Aster `session_context.rs` 从 turn context 读取并归一化，`api_client.rs` 在统一 provider HTTP request builder 上注入 `traceparent / tracestate`。
6. 上游 provider request id 关联已完成：Aster `api_client.rs` 从 provider response headers 捕获 request id，`ProviderTraceEvent` 透传到 App Server RuntimeEvent，trace store 仅在 summary-only metrics 中保存 `provider_request_id / provider_request_id_header`。
7. Codex 参考点：对齐 `rollout-trace` 的 `upstream_request_id` 思路和 `response-debug-context` 的 header-only 提取边界；Lime 不记录 provider response body、prompt、assistant delta 或 `tracestate`。

## 7. P5：回归证据

目标：

1. `smoke:agent-runtime-current-fixture` 产出 trace summary evidence。
2. `smoke:claw-chat-current-fixture` 覆盖首字分段字段。
3. AgentUI latency SVG 更新为 provider/API 与 Lime 本地输出分段。
4. 执行计划回挂 trace 体系落地进度。

验收：

1. fixture evidence 能展示首字分段。
2. 图中不再把 provider TTFT 误归因到客户端。
3. 每次 latency 优化必须说明优化的是哪个 span。

当前进度：

1. `claw-chat-current-fixture` 已接入本地 Claw Trace debug override，只影响临时 E2E userDataDir，不写用户配置。
2. external fixture backend 已在首个 `message.delta` 前发出 `provider.request.started / provider.first_event.received / provider.first_text_delta.received`，走 current App Server event_store 与 renderer event stream。
3. fixture evidence 已导出 compact `agentUiPerformanceTrace`，只包含 session、phase 名称和数值分段，不导出 raw entries / raw provider payload。
4. 验证通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario complete --prefix claw-trace-s7-evidence --timeout-ms 180000`。
5. 本次 evidence 样例：`providerWaitMs=90`、`serverToRendererFirstTextDeltaMs=290`、`rendererApplyFirstTextDeltaMs=1`、`clientLocalOutputMs=337`。
6. plan history hydrate 会刷新 Agent UI perf 内存窗口，因此 plan 场景保留主回合完成后的 `agentUiPerformanceTrace`，把后续 hydrate 采集结果另存为 `agentUiPerformanceTraceLatest`。
7. Expert Plaza 点击入口不是标准输入框首字流式链路，保留 raw payload 脱敏断言，但不强制 provider/client 分段。
8. 验证通过：`npm run smoke:agent-runtime-current-fixture`，多场景回归通过，`liveProviderUsed=false`。
9. `claw-chat-current-fixture` 已接入 App Server trace evidence：
   - 通过 current `diagnostics/trace/list`、`diagnostics/trace/read`、`diagnostics/trace/export` 收集后端 trace 证据。
   - summary 只保存 compact checkpoint、redaction、zip 文件名和 included/omitted sections，不保存 export 绝对路径。
   - common assertions 已新增 `appServerTraceEvidenceAvailable / UsesCurrentMethods / SeparatesProviderAndServer / ExportedSummaryOnly / NoRawPayload`。
10. 为避免真实 Electron fixture 污染用户 Downloads/Desktop，App Server trace export 支持 `LIME_TRACE_EXPORT_OUTPUT_DIR` 覆盖输出目录；fixture 将其指向一次性 temp root，生产默认仍走 Downloads/Desktop/temp。
11. 真实 Electron evidence 通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario complete --prefix claw-trace-p5-export-evidence --timeout-ms 180000`。
12. 本次 evidence 样例：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-trace-p5-export-evidence-summary.json`，其中 trace events 包含 `provider.first_text_delta.received`、`app_server.message_delta.emitted`，export redaction 为 `summary_only`，`includedSections` 包含 `trace/events.jsonl`，`omittedSections` 包含 `assistant delta text`。

## 8. 风险与退出条件

| 风险                          | 处理                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Trace 增加 fast response 开销 | disabled 使用 Noop recorder；enabled summary 只写轻量 event。                        |
| payload 泄露敏感信息          | 默认不采集正文；verbose 必须显式开启并过 redaction。                                 |
| 事件量过大                    | sampling + retention + max payload bytes + summary projection。                      |
| 时钟不一致                    | 同时记录 wall time 和 monotonic delta；跨进程只用 wall time 估算并标记 uncertainty。 |
| 变成第二套 runtime event      | TraceEvent 只可诊断，不可驱动产品 UI。                                               |
| 只做日志无 UI                 | P3 必须进入 Developer & Labs 与 support bundle。                                     |

## 9. 下一刀

下一刀进入 raw trace export / timeline / projector 前，不继续做无体系的单点优化：

1. 已新增的 `diagnostics/trace/list`、`diagnostics/trace/read` 必须继续保持 summary-only redaction 和 current App Server JSON-RPC 主链。
2. 如果继续做 support bundle 选择性附带 raw trace export，必须复用 `diagnostics/trace/export` 的 summary-only zip 语义，默认支持包仍只保留 `trace-store-summary.json`。
3. 如果先做 timeline projector，则只消费当前 summary-only raw JSONL，不新增第二套 runtime event。
4. Developer compact history 继续作为客户端排查入口；任何自动落盘都必须避开流式热路径。
5. 下一刀只剩系统级后台 daemon / 应用完全关闭后的告警设计，或大文件拆分；不要再把 provider request id、timeline filter、App Server retained-window baseline、regression evidence 归因报告、手动 trend history、summary-only alert 投影、本地 alert channel inbox、local notification dispatcher、Electron desktop notification bridge、foreground global alert monitor 或 notification host test split 当未完成项重复实现。
