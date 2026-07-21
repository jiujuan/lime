# 多模型/provider 方案：grok 主、OpenCode 辅

本文件仍以 grok-build 为主线，但 provider wire 的 endpoint、content、media 和多协议 lowering 需要选择性吸收 OpenCode；完整比较见 [06-grok-vs-opencode.md](06-grok-vs-opencode.md)。

## 1. 裁决

多模型不是 Agent loop 的 owner。最终边界如下：

| 能力 | Lime current owner | grok-build 借鉴 |
| --- | --- | --- |
| Thread/Turn/Item、queue、cancel、steer、resume | `agent-runtime` + App Server | 不复制 |
| Provider/model catalog、default、visible/selectable | `model-provider` + provider registry | `xai-grok-models`、`ModelsManager` |
| Route、credential readiness、provider endpoint | `model-provider` + Lime API Key Provider | `ModelFetchAuth` 的优先级和配置分层 |
| Capability matrix、task family、modality、runtime feature | `model-provider::canonical` | `CanonicalModel` / `CapabilityMode` 的显式能力表 |
| Session model switch | App Server method -> `agent-runtime` command -> `model-provider` | `set_session_model` 的兼容性检查、zero-turn rebuild、watch generation |
| Provider wire/lowering/stream reducer | `model-provider` | grok 的 unknown/partial stream 语义 + OpenCode 的 endpoint/protocol/content reducer |
| Retry/circuit breaker | `model-provider` transport policy | `xai-circuit-breaker` 的 retry classification、open/half-open/close |
| Tool definitions/approval/execution | `tool-runtime` | `xai-tool-runtime` 的 typed extensions 和 capability filtering |

禁止把 grok-build 的 `MvpAgent`、ACP session、UI、xAI 专属 endpoint 或独立 tool server 当成 Lime 运行时 owner。

## 2. grok-build 的可复制机制

### 2.1 模型目录是数据，不是散落常量

`crates/codegen/xai-grok-models/src/lib.rs` 将 `default_models.json` 嵌入构建产物，并通过 `default_model`、`default_web_search_model`、`default_image_description_model`、`default_session_summary_model` 暴露稳定默认值。`xai-grok-shell/src/agent/models.rs` 再把 bundled default、remote catalog、disk cache、ETag 和 auth visibility 合并成一个 `ModelsManager`。

Lime 目标：

```text
ProviderCatalogSource
  = bundled registry
  | configured provider models
  | remote model list/cache

ModelCatalogEntry
  = catalog_key
  + provider_model_id
  + canonical_model_id
  + visibility/selectability
  + capability snapshot
  + pricing/context limits
  + provider route metadata
```

`model-provider::canonical::CanonicalModel` 已有 capability、task family、input/output modality、runtime feature、context length 和 pricing 字段，应直接作为 current 基础；不要再在 `app-server` 或 Renderer 定义第二个模型能力类型。

### 2.2 默认模型解析有明确优先级

grok-build 的实际顺序是：

```text
CLI > environment > config.toml > remote settings > bundled default
```

Lime 桌面产品没有 Codex CLI 的 ChatGPT 语义，因此目标顺序改为：

```text
turn runtimeRequest override
  > session provider/model default
  > workspace/profile model slot
  > configured provider default
  > bundled model registry default
```

规则：

1. turn override 只影响当前 Turn，并必须写入 `StoredSession.turn_runtime_options[turn_id]` 与 `ResolvedModelRoute`。
2. session default 影响后续 Turn，不改写历史 Item，不回放旧 Turn。
3. workspace/profile slot 只提供候选，不绕过 provider readiness/capability 校验。
4. 没有可用模型时 fail closed；不能用 provider 名称猜 capability，也不能回退到生产 mock。

### 2.3 catalog refresh 不破坏用户锁定

`ModelsManager` 用 `RwLock` 持有 catalog/current model/reasoning effort，并通过 `watch` generation 广播真实模型变化。首次真实 catalog 到达时重新解析默认模型；后续刷新只有在当前模型消失或不可选时才重选。

Lime 目标语义：

- catalog refresh 失败保留旧 catalog，并把 failure 作为诊断事实；不清空当前 route。
- auth/provider identity 变化时可以清缓存，但只有新 catalog 成功后才替换。
- 当前模型被 `disabled/allowed/hidden` 过滤时，先发 `model.selection.changed` canonical event，再允许下一 Turn。
- Renderer 的 model selector 只消费 `thread/read` / `model/list` typed projection，不能直接读取 DB 或 provider raw response。

### 2.4 选择过滤必须 fail closed

grok-build `ModelGlobSet` 对 `allowed_models`、`disabled_models`、`hidden_models` 使用同一 glob 编译器，非法 pattern 直接拒绝或将可选集合置空；`task_model_error_for_catalog` 给出可选 slug 列表。

Lime 要求：

- `allowed/disabled/hidden` 只在 catalog owner 处理；App Server 不复制过滤逻辑。
- provider/model ID 既支持 `catalog_key`，也支持 `provider_model_id`，解析后只能使用 canonical route。
- 空 allowlist 表示允许全部；非法 allowlist 不得静默放行。
- 所有 internal model（compaction、title、web search、image describe）也必须经过 capability/readiness 检查。

### 2.5 capability 是显式矩阵，不是 provider 名称推断

grok-build 的 `CanonicalModel::capability_summary()` 将 task family、modality 和 runtime feature 归一为 tools、streaming、reasoning、json schema、media input/output 等摘要；`xai-grok-workspace/src/capability.rs` 又用穷举的 `CapabilityMode` 过滤 ToolKind，并以 `is_subset_of` 防止 child session 能力扩大。

Lime 目标类型（示意）：

```rust
struct ModelCapabilitySnapshot {
    task_families: Vec<TaskFamily>,
    input_modalities: Vec<Modality>,
    output_modalities: Vec<Modality>,
    runtime_features: Vec<RuntimeFeature>,
    context_length: u64,
    max_output_tokens: Option<u64>,
    reasoning_efforts: Vec<ReasoningEffort>,
}

struct ResolvedModelRoute {
    provider_id: ProviderId,
    model_id: ModelId,
    protocol: ProviderProtocol,
    credential_ref: CredentialRef,
    capabilities: ModelCapabilitySnapshot,
    source: RouteSource,
}
```

每次 provider sampling 先生成 `RuntimeToolStepSnapshot`：定义集、capability、executor 必须来自同一个 snapshot。模型返回未广告的 tool name 时只生成 canonical failed lifecycle，不得调用 native/MCP executor。

### 2.5.1 effective request options 是 route 的一部分

grok-build `SamplerConfig`、`ModelEntryConfig` 与 OpenCode `Model.Info`/`projectModel`
显示，模型选择不只是一对 provider/model 字符串。Lime 必须在 `model-provider` 定义
`EffectiveModelOptions`，至少覆盖：

- auth scheme、静态/环境 headers、query 参数、API base URL、deployment/origin/client/user；
- variant 的 request headers/body overlay、temperature/top-p/max completion、verbosity、tool mode、parallel tools；
- context/input/output limits、reasoning effort/toggle/budget、interleaved reasoning、stream tool calls；
- idle timeout、connect timeout、request/stream max retries、force HTTP/1、compaction threshold；
- media/search/tool overrides、cost/quota/service tier、account/tenant identity 和 model fingerprint。

`ResolvedModelRoute` 只允许引用已解析的 immutable options；Renderer、App Server handler
和 provider adapter 不得各自合并一遍。Lime 不需要复制 Codex ChatGPT-only auth、personality
或 UI 文案，但每项排除必须写入产品范围表，不能默认为“已对齐”。

### 2.5.2 capability 只能显式声明，heuristic 只能作提示

`CanonicalModel` 中根据 id/name 包含 `reasoning|thinking` 推断能力的逻辑只能作为
catalog hint，不能进入 route authorization。`runtime-core` 对未知 capability 默认 `true`
的路径必须删除；direct provider config 也必须携带完整 capability snapshot，否则返回
`RouteFailure(model_capabilities_missing|unknown_capability)`。

### 2.6 session model switch 的边界

grok-build `set_session_model` 的关键语义：

1. 解析 model ID，并获取该模型的 sampling config。
2. 检查当前 active agent/harness 与目标 model 的 `agent_type` 是否兼容。
3. 已有 Turn 时，类型不兼容直接拒绝并建议新 session。
4. 零 Turn 时允许 rebuild agent definition，失败则整个 switch 失败。
5. reasoning effort override 只有在目标模型声明支持时才应用。
6. 更新 session handle、全局 model manager watch、静态 API key route，并广播非持久化 model changed。

Lime 目标：

- App Server `model/select` 只发 command，不直接修改 provider client。
- `agent-runtime` 在无 in-flight sampling 时提交 session default；有 in-flight Turn 时要么排队到下一 Turn，要么按 Codex steer/cancel 语义明确拒绝。
- switch 不复制旧 provider wire，不重写历史，不生成第二个 Thread/Turn/Item。
- 切换成功后下一 Turn 的 `provider.history` 从 canonical history 重建；旧 connection 只在 session close 或 route identity 变化时释放。
- model switch generation 必须参与 laziness/compaction/stream cancellation，避免旧模型的异步结果覆盖新模型。

### 2.7 turn override 与 child runtime options

为解决 app-server restart 报错，child agent 不得只复制 renderer 显式参数。正确顺序是：

```text
RuntimeRequest
  -> resolve provider/model/reasoning/policy
  -> persist effective turn_runtime_options[turn_id]
  -> AgentControl child copies effective options
  -> child creates its own ResolvedModelRoute
```

child 必须清除 parent-only 的 `event_name`、`queued_turn_id`、`expected_output`、`structured_output`、`output_schema`；禁止凭空猜 provider/model，也禁止引入第二 route map。

### 2.8 sampling message/content 与 stream reducer

`xai-grok-sampling-types/src/messages.rs` 以 typed `MessageContent`、`ContentBlock::{Text,Image,ToolUse,ToolResult,Thinking}` 表达 Anthropic Messages wire；`xai-grok-sampler/src/stream/messages.rs` 将 `message_start`、content block start/delta、usage、stop、error 归一化，未知 stop reason 保留原字符串，流中途错误不会静默丢弃已发送内容。OpenCode `packages/llm/src/schema/messages.ts` 和 `packages/llm/src/protocols/*` 补充了 provider-neutral `Text/Media/ToolCall/ToolResult/Reasoning`、endpoint union 与多协议 lowering；这些只进入 Lime `model-provider`，不得进入 `agent-runtime`。

Lime 的边界：

- canonical content 继续由 `model-provider::canonical` 持有，不将 Anthropic/OpenAI/Grok wire 类型带入 `agent-runtime`。
- 每个 provider adapter 只实现 `canonical -> provider wire` 和 `provider stream -> NormalizedProviderEvent`；OpenCode 的 endpoint/protocol 分层可作为 lowering 结构参考。
- 文本、reasoning、tool call、usage、finish reason 必须经过同一个 reducer；不同协议不得各自写一套 item projection。
- 已经发出用户可见 text/tool event 后禁止自动重放整次 request；首个可见 event 前的安全失败才允许 fallback provider。
- unknown provider event/stop reason 进入诊断并保持可序列化，不能导致整条 rollout 丢失。

### 2.9 retry 与 circuit breaker

grok-build 的 `xai-circuit-breaker` 将 retryable HTTP 状态、指数退避、open/half-open/close、并发 probe 和 observer 分离。Lime 只吸收这个机制，不把 breaker 状态放进 Thread/Turn/Item。

规则：

- retry 分类在 `model-provider` transport 层完成；4xx 永久错误、capability gap、approval deny 不重试。
- 429/5xx/连接超时可按 provider policy 重试；每次 retry 必须有新的 sampling attempt identity。
- 已有副作用工具调用或可见正文后禁止自动切换 provider 重放。
- breaker key 至少包含 provider identity + endpoint + protocol；不同 session 共享健康状态可以，但 transport fallback 不得跨 route 混用连接。
- breaker 状态进入 trace/diagnostic，不进入模型可见 history，也不伪造 Turn completed。

### 2.10 credential/provider route

grok-build `ModelFetchAuth::resolve` 的优先级是 custom endpoint > session > deployment > API key，并用 cache auth method 区分 catalog cache。Lime 不复制其认证类型，但采用同一原则：

- direct `runtimeRequest.providerConfig` 优先于持久化 provider；它只作用于当前 Turn。
- configured API Key Provider 是持久化凭证事实源；provider readiness 必须先于 model catalog match。
- provider/model route 的 diagnostic payload 只包含 provider/model/capability/reason，不包含 API key。
- provider disabled、missing key、model missing、capability gap 必须产生 typed `RouteFailure`，不能退回默认模型静默执行。
- provider cache key 必须绑定 credential fingerprint/tenant/account entitlement；身份变化时只使相关 catalog 失效，刷新失败保留上一次成功 catalog。
- `RuntimeSelectionOnly`、缺失 alias 默认支持、builtin provider 名称直接 ready 和“无 capability 即跳过检查”均属于 dead/fail-open 路径，迁移后删除。

## 3. 迁移写集

第一阶段只允许在以下 current owner 修改：

```text
lime-rs/crates/model-provider/src/canonical/**
lime-rs/crates/model-provider/src/runtime_provider.rs
lime-rs/crates/app-server/src/runtime_backend/model_*.rs
lime-rs/crates/app-server/src/runtime_backend/provider_config.rs
lime-rs/crates/agent-runtime/src/session_config.rs
lime-rs/crates/agent-runtime/src/session_loop.rs
lime-rs/crates/app-server/src/runtime/read_model/model_routing.rs
lime-rs/crates/app-server/src/runtime/trace_store/**
```

禁止在 `processor.rs`、Renderer component、Electron host 或 `lime-agent` adapter 新增模型选择逻辑。需要变更协议时必须同步 schema、client、gateway、fixture 和 `npm run test:contracts`。

## 4. 多模型验收用例

1. bundled-only、remote catalog、cache hit、ETag unchanged、ETag changed、auth identity changed。
2. default precedence：turn override、session default、profile slot、provider default、bundled default。
3. allowed/disabled/hidden 模型过滤，非法 glob，当前模型被移除。
4. reasoning effort 支持/不支持、context limit、vision/text-only、tool calling gap。
5. 同 Turn model switch、in-flight switch、zero-turn harness rebuild、已执行 Turn 的不兼容拒绝。
6. provider 429/5xx/timeout 重试，首个可见 event 前 fallback，首个 tool event 后禁止重放。
7. child AgentControl 从 effective runtime options 恢复 provider/model，不再出现“requires provider/model selection”。
8. model route、capability snapshot、attempt、usage、finish reason 在 thread/read、trace、evidence 中保持同一 identity。
