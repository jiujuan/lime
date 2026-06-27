# Claw Trace PRD

> 状态：system PRD draft
> 更新时间：2026-06-27
> 产品口径：Trace 是开发者诊断能力，默认关闭高粒度采集；开启后用于定位 Claw turn 的端到端耗时、事件错序、卡住、重复渲染和 provider/API 等待问题。

## 1. 背景

Claw 首字可见延迟现在已经不能继续用一个粗粒度 TTFT 指标解释。真实链路至少包含：

```text
renderer submit
-> Electron/App Server JSON-RPC
-> App Server turn preparation
-> Aster context/tool/provider setup
-> provider/API streaming
-> App Server event projection and emit
-> renderer event bridge
-> text_delta apply
-> render flush
-> first paint
```

用户截图中的高首字时间暴露了一个归因问题：如果 `≈59.7s` 是 provider/API 首 delta 前等待，那它应由服务端/provider 侧继续优化；Lime 客户端应重点优化 “Lime 收到 delta 后到 GUI 输出” 这段。没有系统级 Trace 时，开发者只能靠散落日志猜测，容易把 provider 等待、App Server 转发、bridge 排队、renderer 批量渲染混为一谈。

## 2. 目的

Claw Trace 需要提供一套稳定的诊断体系：

1. **拆分责任边界**：provider/API、App Server、bridge、renderer 各自有独立 span 和指标。
2. **保留 run/tree 关系**：一次用户提交、一次 turn、一次 provider call、一次 tool call、一次 UI paint 都能归到同一个 trace。
3. **可控开启**：开发者可以在设置页或调试 override 开关控制 trace level、采样率、保留天数和是否包含内容摘要。
4. **可导出复盘**：支持导出单次 session / turn 的 trace 包，和现有诊断包合并。
5. **不污染产品路径**：Trace 不能成为普通用户 UI 的事实源，也不能影响 streaming 吞吐。
6. **可回归验证**：关键首字分段要能在 fixture / smoke 中断言，防止后续改动重新混淆归因。

## 3. 用户与场景

### 3.1 普通用户

普通用户默认不看到 Trace 面板，也不需要理解 span、TTFT、bridge latency。

必须保证：

1. 默认不开启高粒度 Trace。
2. 开启 Trace 不改变回答内容、不改变权限、不增加模型请求。
3. 如果导出诊断包，需要明确提示可能包含本地路径、模型名、provider 名、工具名和截断后的事件摘要。

### 3.2 开发者

开发者需要在复现问题前打开 Trace，并在复现后导出证据。

必须支持：

1. 打开 / 关闭 Claw Trace。
2. 选择 level：`off`、`summary`、`diagnostic`、`verbose`。
3. 配置采样率和保留窗口。
4. 查看最近 Claw turns 的 trace list。
5. 查看单次 turn 的阶段耗时表。
6. 导出 trace JSON / support bundle。
7. 清理历史 trace。
8. 在日志中搜索 `trace_id / run_id / turn_id`。

### 3.3 Runtime / 后端开发者

Runtime 开发者需要定位 Aster / provider / tool surface 的耗时。

必须支持：

1. 区分 context preparation、tool surface build、memory / skills / plugin context、provider request、provider stream decode。
2. 记录 provider headers received、first event decoded、first text delta decoded。
3. 记录 no-tools direct answer 与 full tool surface 的差异。
4. 记录 `auto_compact`、tool surface、model slot、reasoning effort 等影响耗时的配置。
5. 记录错误和取消时最后一个已完成 span。

### 3.4 Frontend / GUI 开发者

GUI 开发者需要定位 delta 到 paint 的本地耗时。

必须支持：

1. renderer event received。
2. first text delta applied。
3. first text render flush。
4. first text paint。
5. render backlog、buffer count、flush count、max backlog chars。
6. React render / overlay 更新是否造成首字可见延迟。

## 4. P0 目标

1. 定义 Claw Trace 配置模型和默认值。
2. 定义 `trace_id / run_id / span_id / parent_span_id / turn_id / session_id` 关联规则。
3. 定义 append-only raw trace event envelope。
4. 定义首字可见延迟分段指标：
   - `provider_wait_ms`
   - `server_emit_after_provider_delta_ms`
   - `bridge_delivery_ms`
   - `renderer_apply_ms`
   - `renderer_flush_ms`
   - `renderer_paint_ms`
   - `user_submit_to_first_paint_ms`
   - 前端 diagnostics summary 暂以 camelCase 暴露：`providerWaitMs / serverToRendererFirstTextDeltaMs / rendererApplyFirstTextDeltaMs / clientLocalOutputMs`
5. App Server `message.delta` 发出前记录 server emit checkpoint。
6. Renderer 记录 event received / apply / flush / paint checkpoint。
7. 开发者设置页增加 Trace 开关设计。
8. Trace 进入现有 diagnostic / support bundle 设计，不另造用户侧反馈入口。

## 5. P1 目标

1. Aster provider stream 增加结构化 span：
   - provider request started
   - response headers received
   - first stream event decoded
   - first text delta decoded
   - provider completed / failed / canceled
2. App Server turn preparation 增加 phase profile：
   - routing
   - model route resolution
   - runtime init
   - tool surface
   - skills / plugin / memory context
   - session config
3. Trace projector 输出 developer-friendly summary。
4. Trace list / detail 在 Developer & Labs 页面可查看。
5. 支持按 `session_id / turn_id / trace_id` 导出。

## 6. P2 目标

1. W3C `traceparent / tracestate` 贯穿 renderer -> App Server -> Aster -> provider HTTP headers。
2. 支持 OpenTelemetry exporter，但默认关闭。
3. 支持 trace replay / flame chart / timeline UI。
4. 支持 GUI smoke 自动采集 trace evidence。
5. 支持比较两个 turns 的 trace diff。

## 7. 非目标

本 PRD 不做：

1. 不把 Trace 作为普通用户功能入口。
2. 不在高粒度 Trace 关闭时保留完整 payload。
3. 不保存完整 prompt、完整 provider request、完整回答正文，除非开发者显式开启 `verbose` 且经过脱敏策略。
4. 不用 assistant 正文正则推断阶段。
5. 不为了 Trace 新增第二套 runtime event 协议。
6. 不让 Trace 影响 fast response 的 no-tools 快路径。
7. 不把 provider/API 等待误标为 renderer 或客户端问题。
8. 不把本地绝对路径、密钥、环境变量完整值默认写入 Trace。

## 8. 成功标准

P0 完成后，开发者应能拿到如下结论：

```text
本 turn 首字可见 61.2s：
- provider/API 等待 59.7s
- provider delta 到 App Server emit 18ms
- App Server emit 到 renderer received 34ms
- renderer received 到 text apply 4ms
- text apply 到 render flush 41ms
- render flush 到 first paint 16ms

结论：本轮主要瓶颈在 provider/API，不在 Lime 客户端输出链路。
```

这才算解决当前首字延迟排查的核心问题。
