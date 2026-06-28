# Claw Trace 路线图

> 状态：system design active / Trace Tab non-send UX completed
> 更新时间：2026-06-27
> 范围：Claw / Agent Chat 的端到端 Trace 体系，包括开发者开关、run/span 模型、事件采集、存储、投影、导出、诊断 UI 与实施顺序。

## 目标

Claw Trace 不是一次首字 token 优化，也不是在几个函数里多打几行日志。它是 Claw 运行链路的系统级可观测能力，用于回答：

1. 一次 Claw turn 到底卡在 provider/API、App Server、bridge，还是 renderer。
2. fast response / no-tools / full tool surface 的耗时差异来自哪个阶段。
3. 用户看到的首字延迟如何拆成可行动的工程段。
4. 开发者如何临时打开高粒度 trace，复现后导出，再关闭。
5. Trace 如何和 runtime event、read model、diagnostic bundle 共存，而不是成为第二套事实源。

## 阅读顺序

| 文档                                             | 作用                                                          |
| ------------------------------------------------ | ------------------------------------------------------------- |
| [prd.md](prd.md)                                 | 背景、目标、收益、用户分层、非目标、核心需求。                |
| [architecture.md](architecture.md)               | Trace 总体架构、run/span/event 模型、开关、存储、脱敏和导出。 |
| [diagrams.md](diagrams.md)                       | 架构图、Claw turn 时序图、首字可见延迟拆分图、采集流程图。    |
| [code-map.md](code-map.md)                       | 当前代码入口、拟新增模块、边界和测试目录。                    |
| [implementation-plan.md](implementation-plan.md) | 分阶段落地、验收标准、验证命令和风险。                        |

## Codex 参考点

本路线图主要参考 `/Users/coso/Documents/dev/rust/codex` 的这些结构模式：

| Codex 位置                                                                          | Lime 借鉴点                                                                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `codex-rs/core/src/turn_timing.rs`                                                  | turn timing state 用明确 phase 拆耗时，而不是只记录一个 TTFT。                                             |
| `codex-rs/rollout-trace/src/raw_event.rs`                                           | append-only raw trace event envelope：schema version、seq、wall time、thread/turn context、typed payload。 |
| `codex-rs/rollout-trace/src/protocol_event.rs`                                      | 从现有 protocol events 映射成 trace vocabulary，避免在 runtime 到处新增重复 hook。                         |
| `codex-rs/protocol/src/protocol.rs`                                                 | submission 携带可选 W3C trace context，让跨 async handoff 仍能关联。                                       |
| `codex-rs/otel/src/trace_context.rs` 与 `codex-rs/exec-server/src/trace_context.rs` | W3C `traceparent` / `tracestate` 传播，和内部 trace id 不冲突。                                            |

原则：学习 Codex 的分层与数据模型，不照搬它的产品 UI，也不把其他项目不适合 Lime 的模式强行写入。

## 核心结论

Claw Trace 的事实源应收敛为：

```text
existing Claw runtime events + timing checkpoints
  -> TraceCollector / TraceRecorder
  -> append-only raw trace log
  -> TraceProjector
  -> developer diagnostics UI / support bundle / local export
```

Trace 只服务开发者诊断和工程回归。普通用户默认不感知，默认关闭高粒度采集。当前 Developer & Labs 已接入独立 `developer.claw_trace` 开关、level、sample_rate、`alert_enabled`、`alert_notification_enabled`、复制 summary、清空内存 summary、保存 compact Trace 快照、复制 compact Trace history、清空 history、复制/导出 App Server Trace、显式加载 summary-only timeline、compact retained-window baseline compare、App Server retained-window trace compare、regression evidence 归因报告、手动保存的 regression trend history、summary-only regression alert 投影、本地 summary-only alert channel inbox、本地通知 dispatcher、Electron Desktop Host 原生通知桥，以及主窗口 foreground global alert monitor。工作台 Trace Tab 已作为与 Harness 并列的一等 Tab，并区分 `claw_turn` 与 history restore / unknown 非发送链路：只有发送链路展示首字分段、baseline 和 regression，非发送链路只展示可用恢复耗时与 recorded phases。alert channel 默认关闭，只在开发者显式开启且有 watch / warning / critical 投影时写入本地 retained inbox；桌面通知默认关闭，只在新写入 summary-only alert 时通过 `show_desktop_notification` 壳命令尝试。离开 Developer 设置页后，主窗口 monitor 只监听本地 Agent UI performance summary-only 事件并 debounce 评估 compact summary/history，不自动查询 App Server trace list/read、不上传、不保存 raw entries / raw trace JSONL / prompt / provider payload / assistant delta text。Host 通知 payload 只接受 title/body/tag/silent，拒绝 raw trace 旁路；Host 细节回归已拆到 `desktopNotificationHost.test.ts`，`hostCommands.test.ts` 只保留 dispatcher smoke。support bundle 已默认包含裁剪后的 Agent UI performance summary 和 trace-store summary；客户端 history、regression trend 与 alert channel 都只消费 compact/summary-only 结构化数值。App Server 已有 summary-only raw trace JSONL store，并通过 `diagnostics/trace/list`、`diagnostics/trace/read`、`diagnostics/trace/export` 提供开发者显式读面。

## 当前优先级

第一阶段先解决用户指出的首字归因问题：

```text
user submit
  -> provider/API first text delta
  -> App Server message.delta emitted
  -> renderer event received
  -> first text delta applied
  -> render flush
  -> first paint
```

其中 provider/API 等待和 Lime 客户端本地输出必须分开记录。`≈59.7s provider TTFT` 这类耗时不应再被图或日志误归因成 renderer 慢。

## 当前实现状态

- 已完成：Renderer/App Server/provider trace checkpoint、前端 provider projector、`providerWaitMs / clientLocalOutputMs` summary、Developer Claw Trace 开关与 level / sample_rate / alert channel / notification dispatcher、Electron Desktop Host 原生通知桥、主窗口 foreground global alert monitor、通知 Host 模块级测试拆分、诊断包 summary、复制/清空内存 summary、compact trace history / export / retention、fixture compact evidence、App Server summary-only raw trace JSONL store、trace read/list/export diagnostics API、support bundle trace opt-in、W3C trace context / OTEL、provider request id correlation、Developer UI timeline / span drilldown / compact retained-window baseline compare / App Server retained-window trace compare / regression evidence 归因报告 / 手动 regression trend history / regression alert 投影 / 本地 summary-only alert channel inbox、工作台 Trace Tab 独立展示与非发送链路专属视图。
- 未完成：系统级后台 daemon / 应用完全关闭后的告警、以及 `agentProtocol.ts` / `agent.rs` / `electron/hostCommands.ts` 等超大文件的后续拆分。
