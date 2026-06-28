# Claw Trace 代码地图

> 状态：code map active / notification host test split completed
> 更新时间：2026-06-27
> 原则：Trace 体系优先接入 current App Server / renderer bridge 主链，不恢复 legacy 命令，不在组件里散落裸 invoke，不让 Trace 成为业务事实源。

## 1. 当前关键入口

### 1.1 Renderer submit / stream

| 文件                                                                  | 当前职责                                        | Trace 设计中的角色                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/agent/chat/workspace/useWorkspaceSendActions.ts`      | Claw 发送入口，组装 runtime options / metadata  | 创建或携带 `trace_id`、记录 `renderer.submit`。                                                                                                                                                          |
| `src/components/agent/chat/utils/fastResponseRouting.ts`              | fast response 结构化路由                        | trace metadata 记录 fast route decision，不写正文 hard code。                                                                                                                                            |
| `src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.ts`   | stream request state 初始化                     | 增加 trace context、first receive/apply/paint state。                                                                                                                                                    |
| `src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`        | 处理 runtime event                              | 记录 `renderer_event.received`、`renderer_text_delta.applied`。                                                                                                                                          |
| `src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts` | text flush / paint 动作                         | 记录 `renderer_text.flush`、`renderer_text.first_paint`，计算 `clientLocalOutputMs = firstTextPaint - server_event_emitted_at`。                                                                         |
| `src/components/agent/chat/hooks/agentStreamPerformanceMetrics.ts`    | 现有 Agent UI 性能指标                          | S6 透传 `providerWaitMs`，让首字指标继承 provider/API 分段。                                                                                                                                             |
| `src/lib/agentUiPerformanceMetrics.ts`                                | Agent UI performance summary                    | S6 输出 `providerWaitMs / serverToRendererFirstTextDeltaMs / rendererApplyFirstTextDeltaMs / clientLocalOutputMs`，供开发者诊断；S34 发布 summary-only metric recorded 本地事件供全局 monitor debounce。 |
| `src/lib/agentUiPerformanceMetrics.d.ts`                              | Agent UI performance summary 类型声明           | 与 summary 字段保持一致，避免外部类型消费漏掉 provider/client 分段。                                                                                                                                     |
| `src/lib/agentUiPerformanceTraceHistory.ts`                           | Agent UI performance compact history            | 保存、裁剪、导出 compact Trace summary；本地保留最近 20 个快照 / 7 天，不写 raw entries / prompt / provider payload。                                                                                    |
| `src/lib/trace/clawTraceBaseline.ts`                                  | compact Trace baseline projector                | 从当前 compact summary 与 retained history window 的最早快照投影 metric delta、regression verdict 和 baseline window；不读取 raw entries / prompt / provider payload。                                   |
| `src/lib/trace/clawTraceAppServerComparison.ts`                       | App Server Trace compare projector              | 从 retained trace window 选择最新 trace 与最早保留 trace，基于 summary-only timeline projection 投影 provider/API、App Server emit/terminal 和 root duration delta；不读取 raw payload。                 |
| `src/lib/trace/clawTraceRegressionReport.ts`                          | regression evidence 归因 projector              | 合并 compact baseline 与 App Server compare 的 summary-only metric delta，归因到 Provider / API、App Server 或 Lime 本地输出；排除 root duration 避免重复计数。                                          |
| `src/lib/trace/clawTraceRegressionTrend.ts`                           | regression trend retained history               | 手动保存 regression report 到 localStorage retained window，保留 20 条 / 7 天；只保存 summary-only report，不保存 raw entries / raw trace JSONL / prompt / provider payload。                            |
| `src/lib/trace/clawTraceRegressionAlert.ts`                           | regression alert projector                      | 基于当前 regression report 与手动 retained trend records 投影 `none / watch / warning / critical`；不保存新数据、不后台采集、不读取 raw payload。                                                        |
| `src/lib/trace/clawTraceRegressionAlertChannel.ts`                    | regression alert retained channel               | 在 `alert_enabled=true` 且当前 panel 已有 actionable alert 时写入本地 retained inbox；保留 20 条 / 7 天，支持 overview/export/clear；只保存 summary-only alert record。                                  |
| `src/lib/trace/clawTraceRegressionAlertDispatcher.ts`                 | regression alert dispatcher                     | 统一处理 alert 总闸门、channel 写入、重复 fingerprint 去重、可选本地通知尝试和失败兜底；不读取 App Server、不上传；通知能力由 adapter 注入。                                                             |
| `src/lib/trace/clawTraceRegressionAlertNotifier.ts`                   | trace alert notification adapters               | Desktop Host adapter 经 `src/lib/api/desktopNotification.ts` 发送 summary-only 通知；browser Notification adapter 仅保留为非 Electron / 单测边界，不自动请求权限。                                       |
| `src/lib/trace/clawTraceRegressionAlertPresentation.ts`               | trace alert presentation projector              | 统一 summary-only alert 通知 title/body 文案投影，供 Developer card 与 foreground monitor 共用，避免文案拼装散落。                                                                                       |
| `src/lib/trace/clawTraceRegressionAlertMonitor.ts`                    | foreground alert monitor service                | 只消费本地 compact summary/history/trend，投影 regression report + alert 并复用 dispatcher；不调用 App Server trace list/read，显式返回 `app_server_trace_requested=false`。                             |
| `src/lib/trace/clawTraceTimeline.ts`                                  | summary-only Trace timeline projector           | 从 `diagnostics/trace/read` 事件投影 phase spans、timeline rows、slow/gap diagnostics、filter rows、span rows 与 selected detail 输入；不新增 runtime event，不读取 raw payload。                        |
| `src/lib/api/agentProtocol.ts`                                        | 前端 AgentEvent parser / submit contract        | S6/S20 新增 `AgentEventProviderTrace`，保留 provider checkpoint 与 `provider_request_id`，避免 provider 诊断事件进入 unknown event 噪声。                                                                |
| `src/lib/api/agentRuntime/appServerEventStream.ts`                    | App Server notification -> processed AgentEvent | S6/S20 将 `provider.*` 投影为 `provider_trace`，记录 bridge delivery 的 receive timestamp，并透传 provider response header request id。                                                                  |
| `src/lib/api/agentRuntime/eventSequenceGate.ts`                       | event sequence gate / compatibility adapter     | trace summary 标记 sequence gate 排队 / 修复，不改变 gate 语义。                                                                                                                                         |

### 1.1.1 Fixture evidence

| 文件                                                                    | 当前职责                      | Trace 设计中的角色                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/agent-runtime/claw-chat-current-fixture-agent-ui-trace.mjs`    | Electron fixture trace helper | 临时开启本地 Claw Trace debug override，读取 compact Agent UI performance summary，并通过 `diagnostics/trace/list/read/export` 收集 App Server trace evidence；证明不导出 raw entries / raw payload。 |
| `scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs`      | external fixture backend      | 在首个 `message.delta` 前发出 `provider.request.started / first_event / first_text_delta`，走 current App Server 链路。                                                                               |
| `scripts/agent-runtime/claw-chat-current-fixture-common-assertions.mjs` | fixture common assertion      | 强制普通 Claw turn evidence 同时具备 renderer provider/client 分段与 App Server trace list/read/export summary-only evidence，并验证 raw payload 未导出。                                             |

边界：Expert Plaza 点击入口不是标准输入框首字流式链路，backend 可产出 provider events，但当前页面不一定有同一个 stream listener 的 firstEvent / first paint；该场景只验证 raw payload 脱敏，不强制 provider/client 分段。

### 1.2 App Server

| 文件                                                                            | 当前职责                                                         | Trace 设计中的角色                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lime-rs/crates/app-server/src/runtime.rs`                                      | `RuntimeEvent` / sink / backend trait                            | 注册 `runtime::trace` 最小模块，不让中心文件继续承载 trace 细节。                                                                                                                                                             |
| `lime-rs/crates/app-server/src/runtime/event_store.rs`                          | RuntimeEvent -> AgentEvent append、schema 校验、projection store | S3 统一出口：从 turn metadata 取 trace context，并装饰已有 AgentEvent payload。                                                                                                                                               |
| `lime-rs/crates/app-server/src/runtime/trace.rs`                                | S3 最小 trace context / checkpoint 映射                          | 采用 Codex 模式：从 existing events 映射 trace vocabulary，不新增第二套业务事件。                                                                                                                                             |
| `lime-rs/crates/app-server/src/trace_context.rs`                                | W3C trace context parser / normalizer                            | S16/S17 共用 `traceparent / tracestate` 合法性规则；拒绝全零 trace id / parent span id，不把 W3C trace id 替代 Lime 内部 trace id。                                                                                           |
| `lime-rs/crates/app-server/src/otel_trace.rs`                                   | OpenTelemetry context / exporter helper                          | S18 参考 Codex `set_parent_from_w3c_trace_context`，把合法 W3C carrier 设置为 OTEL remote parent；OTLP exporter 默认关闭，只能由显式开发者环境配置开启。                                                                      |
| `lime-rs/crates/app-server/src/processor/request_trace.rs`                      | JSON-RPC request span boundary                                   | S17/S18 为 `agentSession/turn/start` 创建 `app_server.request` server span，记录安全 scalar trace/session 字段，并通过测试 exporter 证明 trace id / parent span id 继承。                                                     |
| `lime-rs/crates/app-server/src/runtime/trace_store.rs`                          | App Server raw trace JSONL writer / reader                       | S8-S20 append-only store：从已装饰 `AgentEvent` 投影 summary-only `RawTraceEvent`；writer 缓存 `next_seq`；read/list 投影 diagnostics DTO；provider request id 只作为 safe metrics；support bundle 复用其 JSONL 摘要 parser。 |
| `lime-rs/crates/app-server/src/runtime/trace_store/export.rs`                   | Trace export zip helper                                          | S11/S12 负责显式单条 trace zip manifest / summary / events.jsonl / README 写入；只重序列化 summary-only event，不复制原始 JSONL 字节；fixture 可用 `LIME_TRACE_EXPORT_OUTPUT_DIR` 指向临时输出目录。                          |
| `lime-rs/crates/app-server/src/runtime/trace_store/summary.rs`                  | Trace store summary projector                                    | S10 负责 support bundle 的只读文件摘要、parse error 计数和相对路径投影；不承担 zip export 或 runtime writer。                                                                                                                 |
| `lime-rs/crates/app-server/src/runtime/storage_roots.rs`                        | App Server 数据目录派生                                          | S8 增加 `runtime/traces` 根目录；S10 拆出 `StorageRoots::from_data_root` 供只读诊断复用，避免 hard-code 用户路径。                                                                                                            |
| `lime-rs/crates/app-server/src/runtime/turn_execution.rs`                       | turn start、queue、callback sink                                 | 只作为 trace context 来源链路，不把 checkpoint 分散写到 backend emit 点。                                                                                                                                                     |
| `lime-rs/crates/app-server/src/runtime_backend/tool_events.rs`                  | Aster AgentEvent -> RuntimeEvent 映射                            | S5/S20 已将 `provider_trace` 映射为 `provider.request.started`、`provider.first_event.received`、`provider.first_text_delta.received`、`provider.failed`、`provider.canceled`，并透传 provider request id 安全字段。          |
| `lime-rs/crates/app-server/src/main.rs`                                         | App Server runtime wiring                                        | S8 初始化 `TraceEventWriter` 并注入 `RuntimeCore`；S18 在 stdio transport 前安装 opt-in OTLP guard，默认不安装 subscriber、不向 stdout 写 tracing 日志。                                                                      |
| `lime-rs/crates/app-server/src/runtime_backend/request_context.rs`              | request -> Aster session config                                  | P2/P4 注入 provider trace context / W3C carrier；S19 将合法 `agentUiPerformanceTrace.w3cTraceContext` 投影为 `TurnContextOverride.metadata.w3c_trace_context`，不拼正文。                                                     |
| `lime-rs/crates/app-server/src/runtime/diagnostics.rs`                          | App Server diagnostics runtime                                   | S9-S11 暴露 `list_diagnostics_traces` / `read_diagnostics_trace` / `export_diagnostics_trace`，无 writer 时返回 `available=false`。                                                                                           |
| `lime-rs/crates/app-server/src/processor/diagnostics.rs`                        | diagnostics methods                                              | S9-S11 dispatch `diagnostics/trace/list`、`diagnostics/trace/read`、`diagnostics/trace/export`。                                                                                                                              |
| `lime-rs/crates/app-server/src/local_data_source/diagnostics.rs`                | 本地诊断包 / log storage                                         | diagnostics 数据源入口；support bundle 不承担 trace schema owner。                                                                                                                                                            |
| `lime-rs/crates/app-server/src/local_data_source/diagnostics/support_bundle.rs` | support bundle zip 导出                                          | S10 默认写入 `meta/trace-store-summary.json`，只包含 summary-only 文件清单/计数/首末时间；raw trace JSONL 正文默认不导出。                                                                                                    |
| `lime-rs/crates/app-server/src/runtime/tests/trace_store.rs`                    | Trace store Rust 回归                                            | S10 承接 writer/read/list 与 retention 测试，避免 `runtime/trace_store.rs` 重新越过 800 行预警线。                                                                                                                            |
| `lime-rs/crates/app-server-protocol/src/protocol/v0/observability.rs`           | App Server diagnostics DTO                                       | S9-S11 定义 `DiagnosticsTrace*` list/read/export params / response / redaction policy。                                                                                                                                       |
| `lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs`            | App Server method name                                           | S9-S11 固定 `diagnostics/trace/list`、`diagnostics/trace/read`、`diagnostics/trace/export`。                                                                                                                                  |

### 1.3 Aster / provider

| 文件                                                                  | 当前职责                                       | Trace 设计中的角色                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lime-rs/crates/aster-rust/crates/aster/src/agents/agent.rs`          | reply loop、direct answer、tool 分类、标题生成 | S5 观察 provider stream 消费点，发出 `ProviderTrace` 诊断事件；不修改消息渲染语义。中心文件只保留发射接线，不继续承载 trace schema。             |
| `lime-rs/crates/aster-rust/crates/aster/src/agents/provider_trace.rs` | provider trace event model                     | S20 承接 provider trace stage/event、elapsed_ms 与 provider request id context attach，避免把诊断模型继续堆到超大 `agent.rs`。                   |
| `lime-rs/crates/aster-rust/crates/aster/src/agents/reply_parts.rs`    | provider request / stream decode               | 保留现有 TTFT 日志与 stream decode；不把 `MessageStream` 扩成第二套事件流。                                                                      |
| `lime-rs/crates/aster-rust/crates/aster/src/session_context.rs`       | turn context task-local / request correlation  | S19 从 `w3c_trace_context` 读取并校验 `traceparent / tracestate`；S20 维护 provider response context task-local，只保存 header-safe request id。 |
| `lime-rs/crates/aster-rust/crates/aster/src/providers/api_client.rs`  | provider HTTP request builder                  | S19 在统一 `send_request` 路径注入标准 W3C HTTP headers；S20 在 response 返回后记录 provider request id headers，避免每个 provider 手写。        |
| `lime-rs/crates/aster-rust/crates/aster/src/context_mgmt/mod.rs`      | auto compact / context 预算                    | 记录 context management span，尤其 auto_compact skip。                                                                                           |
| `lime-rs/crates/aster-rust/crates/aster/src/agents/prompt_manager.rs` | prompt layers                                  | 记录 capabilities layer on/off，不记录完整 prompt。                                                                                              |

### 1.4 Developer settings / diagnostics

| 文件                                                                               | 当前职责                                 | Trace 设计中的角色                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/settings-v2/system/developer/index.tsx`                            | Developer & Labs                         | S6 接入 Claw Trace 设置区、状态 pill 与诊断包 summary。                                                                                                                                                                                                                 |
| `src/components/settings-v2/system/developer/ClawTraceSettingsPanel.tsx`           | Claw Trace Developer 设置区              | S6/S30-S33 支持配置保存、复制当前 summary、compact history、复制/导出 App Server Trace、显式加载 timeline、App Server retained-window compare、compact long-term baseline、regression evidence、trend history、alert channel 与本地通知开关接线；中心文件只做数据装配。 |
| `src/components/settings-v2/system/developer/ClawTraceConfigControls.tsx`          | Claw Trace 配置控件                      | S30-S33 承接 trace enabled / level / sample_rate / alert channel / desktop notification UI；不读取 App Server、不计算 alert、不保存 trend。                                                                                                                             |
| `src/components/settings-v2/system/developer/ClawTraceTimelineView.tsx`            | summary-only Trace timeline 视图         | 承接 timeline overview、phase span drilldown、phase/slow filter 和 selected event detail；不读取 raw payload。                                                                                                                                                          |
| `src/components/settings-v2/system/developer/ClawTraceBaselineComparisonCard.tsx`  | compact baseline compare 视图            | 展示 retained-window baseline、verdict、metric delta 和 history window；只消费 `clawTraceBaseline.ts` projector 输出。                                                                                                                                                  |
| `src/components/settings-v2/system/developer/ClawTraceAppServerComparisonCard.tsx` | App Server trace compare 视图            | 展示 retained-window baseline、最新 trace、verdict 和 metric delta；只消费 `clawTraceAppServerComparison.ts` projector 输出。                                                                                                                                           |
| `src/components/settings-v2/system/developer/ClawTraceRegressionReportCard.tsx`    | regression evidence / trend / alert 视图 | 展示归因焦点、窗口范围、owner totals、segment delta、手动 trend history 动作、summary-only alert、local alert channel overview，并通过 dispatcher 对新 alert record 尝试本地通知。                                                                                      |
| `src/i18n/resources/{zh-CN,zh-TW,en-US,ja-JP,ko-KR}/settings.json`                 | Developer 设置页文案                     | Claw Trace 开关、alert channel、desktop notification、retention、状态、动作与保存反馈的五语言事实源。                                                                                                                                                                   |
| `src/lib/developerFeatures.ts`                                                     | developer config normalization           | 增加 `claw_trace` 默认值、`alert_enabled=false`、`alert_notification_enabled=false` 和 override 解析。                                                                                                                                                                  |
| `src/lib/crashDiagnostic.ts`                                                       | 诊断包收集 / 导出                        | support bundle 附加 trace summary 字段；只做参数/字段接线，避免继续膨胀。                                                                                                                                                                                               |
| `src/lib/crashDiagnosticAgentUiPerformance.ts`                                     | Agent UI performance diagnostic summary  | 裁剪 `window.__LIME_AGENTUI_PERF__.summary()`，只导出 session 级数值指标与 phase，不导出 raw entries。                                                                                                                                                                  |
| `src/lib/agentUiPerformanceTraceHistory.ts`                                        | compact Trace history                    | 复用 diagnostic summary 裁剪结果，负责 localStorage retention / export；不进入流式热路径自动落盘。                                                                                                                                                                      |
| `src/lib/api/serverRuntime.ts`                                                     | diagnostics API 网关                     | S9-S11 暴露 `listDiagnosticsTraces` / `readDiagnosticsTrace` / `exportDiagnosticsTrace`，负责 camelCase protocol -> snake_case legacy diagnostic shape 投影。                                                                                                           |
| `src/lib/api/desktopNotification.ts`                                               | Desktop notification API 网关            | S33 唯一 renderer 入口，调用 `show_desktop_notification` 并校验 `sent / unsupported / failed` 返回；组件和 trace 模块不直接裸调 IPC。                                                                                                                                   |
| `src/hooks/useClawTraceRegressionAlertMonitor.ts`                                  | 主窗口 foreground alert monitor hook     | S34 在主应用窗口加载 developer config、监听 app-config 变更和 summary-only metric recorded 事件，debounce 触发 monitor；不挂载在 RootRouter 独立子窗口。                                                                                                                |
| `src/App.tsx`                                                                      | 主应用窗口全局 hooks                     | S34 挂载 `useClawTraceRegressionAlertMonitor()`；这是 foreground monitor，不是 OS daemon。                                                                                                                                                                              |
| `packages/app-server-client/src/protocol.ts`                                       | App Server TS protocol constants/types   | S9-S11 暴露 diagnostics trace method constants 和 generated `DiagnosticsTrace*` types。                                                                                                                                                                                 |

### 1.5 Electron Desktop Host shell

| 文件                                       | 当前职责                               | Trace 设计中的角色                                                                                                     |
| ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `electron/desktopNotificationHost.ts`      | desktop notification host capability   | S33 发送 Electron 原生 Notification；只接受 summary-only title/body/tag/silent，限长并拒绝 raw trace / provider 字段。 |
| `electron/desktopNotificationHost.test.ts` | desktop notification host module tests | S35 承接 summary-only payload 校验、unsupported 和 failure path 回归，避免超大 `hostCommands.test.ts` 继续承接细节。   |
| `electron/ipcChannels.ts`                  | Electron Host command 白名单           | S33 将 `show_desktop_notification` 登记为 Desktop Host 壳命令；不进入 App Server JSON-RPC。                            |
| `electron/hostCommands.ts`                 | Electron Host dispatcher               | S33 只增加通知命令 dispatch 接线；具体 payload 校验与发送逻辑在小模块内，避免继续膨胀巨型 dispatcher。                 |
| `electron/hostCommands.test.ts`            | Electron Host dispatcher smoke         | S35 只保留 `show_desktop_notification` dispatcher smoke，不再承接通知 payload 细节回归。                               |

## 2. 拟新增模块

### 2.1 Rust App Server

S3 已新增最小 checkpoint 模块：

```text
lime-rs/crates/app-server/src/runtime/trace.rs
```

S8 已新增内部 raw trace store：

```text
lime-rs/crates/app-server/src/runtime/trace_store.rs
```

当前原则：

1. Store 只消费 current AgentEvent 上的 trace metadata，不创建第二套 runtime event。
2. Raw JSONL 只保存 summary-only envelope 与安全 metrics，不保存 prompt / provider payload / assistant text。
3. Writer 热路径按 Codex `TraceWriter` 思路持有 `next_seq` 状态，同一 trace 多次 append 不做全文件计数。
4. Trace store 同时提供只读 JSONL summary projector，support bundle 不维护第二套 parser。
5. Provider request id 只走 metrics 白名单，方便关联上游日志；不导出 provider response body、prompt、assistant delta text、raw AgentEvent payload 或 `tracestate`。
6. 当前已有 `diagnostics/trace/list`、`diagnostics/trace/read`、`diagnostics/trace/export` JSON-RPC API；export 只支持显式单条 trace，默认 support bundle 仍只带 summary。

后续如果 raw trace export / projector 变复杂，再按职责拆出：

```text
lime-rs/crates/app-server/src/runtime_trace/
  mod.rs
  config.rs
  context.rs
  event.rs
  recorder.rs
  store.rs
  projector.rs
  redaction.rs
  export.rs
  tests.rs
```

职责：

1. `config.rs`：读取 developer trace config，提供默认关闭策略。
2. `context.rs`：`TraceContext` / span id / W3C trace carrier。
3. `event.rs`：raw trace envelope 与 payload enum。
4. `recorder.rs`：Noop / Sampling / File writer recorder。
5. `store.rs`：append-only JSONL 与 retention。
6. `projector.rs`：raw -> summary / phase durations / gap detection。
7. `redaction.rs`：payload 截断、路径摘要、secret-like scan。
8. `export.rs`：support bundle integration。

### 2.2 Frontend

建议新增：

```text
src/lib/agentTrace/
  traceConfig.ts
  traceContext.ts
  traceClient.ts
  traceProjection.ts
  traceExport.ts
```

```text
src/components/settings-v2/system/developer/ClawTraceSettingsPanel.tsx
```

职责：

1. 只通过 API 网关读写 trace config / export，不在业务组件散落命令。
2. 将 renderer checkpoint 写到现有 performance metric 通道或 trace client。
3. Developer UI 展示 summary，不展示完整 payload。

## 3. 协议与命令边界

P0 可先不新增 App Server method：

```text
turn request metadata 携带 trace context
existing diagnostics/supportBundle/export 包含 trace summary
```

当前已开放开发者诊断读面：

```text
diagnostics/trace/list
diagnostics/trace/read
diagnostics/trace/export
```

后续若新增 trace config / clear method，或调整 export 行为，必须同步：

1. `app-server-protocol` method names / schema。
2. `app-server` processor。
3. `packages/app-server-client` generated client。
4. `src/lib/api/*` frontend gateway。
5. `src/lib/governance/agentCommandCatalog.json`。
6. `src/lib/dev-bridge` contract guard / mock only for tests。
7. `npm run test:contracts`。

## 4. 测试地图

| 层                  | 测试                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust trace envelope | raw event seq、schema version、payload truncation、redaction。                                                                                                                                                                                                                                                                                      |
| App Server emit     | message.delta emit 前生成 checkpoint，turn_id / trace_id 关联正确。                                                                                                                                                                                                                                                                                 |
| Aster provider      | `provider_trace` -> `provider.*` 映射；first event / first text delta 只记录一次，失败/取消有诊断事件；provider request id 只来自安全 response headers。                                                                                                                                                                                            |
| Frontend metrics    | event received -> apply -> flush -> paint 指标计算正确；summary-only trace events 可投影 timeline / phase span，并能通过 span key 定位 span 内事件；compact history 与 App Server retained-window summary-only trace 可做 compare，并能输出 regression evidence 归因报告、retained trend history、summary-only alert 与 local alert channel inbox。 |
| Developer config    | 默认 off，开关保存/恢复，override 来源可见。                                                                                                                                                                                                                                                                                                        |
| Electron Host       | `show_desktop_notification` 命令只做 Desktop Host 壳能力；`desktopNotificationHost.test.ts` 覆盖 summary-only payload / unsupported / failure path，`hostCommands.test.ts` 只保留 dispatcher smoke。                                                                                                                                                |
| Support bundle      | `meta/trace-store-summary.json` 可导出；raw trace JSONL、prompt、provider payload、assistant text 默认不包含。                                                                                                                                                                                                                                      |
| GUI smoke           | fixture turn 生成可解析 trace summary，不调用 live provider；complete 场景 evidence 已覆盖 provider/client 分段。                                                                                                                                                                                                                                   |

## 5. 禁止项

1. 禁止用正文正则识别 trace stage。
2. 禁止把完整 prompt / API key / env 写入 trace。
3. 禁止 Trace 关闭时仍产生大量 raw event。
4. 禁止让 Trace 事件驱动消息渲染。
5. 禁止为 Trace 恢复旧 `agent_runtime_*` 生产路径。
6. 禁止把 provider/API 等待归到 renderer 指标。
