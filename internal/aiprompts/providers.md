# Provider 系统

## 概述

Provider 系统负责与各 LLM 服务商的 API 交互。当前认证事实源是 API Key Provider / configured providers；旧 OAuth 与本地 CLI 凭证池运行时已退役。

唯一 provider 网络 owner 是 `lime-rs/crates/model-provider`：catalog、route、credential
readiness、canonical content、provider lowering、stream reducer、retry/breaker 都必须在
该 crate 或其明确的 provider registry/current client 内演进。`lime-rs/crates/providers`
（crate `lime-providers`）已完成消费者迁移并从 workspace、Cargo 依赖和磁盘删除，
当前分类为 `dead / deleted / forbidden-to-restore`。缺失能力只能在 `model-provider`
current owner 内按 grok-build/OpenCode 参考重建，不得恢复旧 crate 或兼容包装。

多模型控制平面的 primary 参考实现为 `/Users/coso/Documents/dev/rust/grok-build`：模型目录与默认值参考 `xai-grok-models`，模型选择/刷新参考 `xai-grok-shell/src/agent/models.rs`，session model switch 参考 `agent/handlers/model_switch.rs`，能力过滤参考 `xai-grok-workspace/src/capability.rs`，retry/circuit breaker 参考 `xai-circuit-breaker`。provider wire 平面的 endpoint、canonical content、媒体与多协议 lowering 可选择性参考 `/Users/coso/Documents/dev/js/opencode` 的 `packages/llm/src/schema/messages.ts`、`packages/llm/src/protocols/*` 和 `packages/core/src/catalog.ts`。这些只约束 `model-provider` 的 route/capability/lowering，不改变 Codex-first 的 runtime、ThreadStore、App Server 和 GUI owner。

如果需求同时涉及“候选模型解析、OEM 与本地 provider 协同、自动与设置平衡、成本/限额事件”，继续补读：

- `internal/roadmap/task/model-routing.md`
- `internal/roadmap/task/oem-and-local-policy.md`

## 目录结构

```
lime-rs/crates/model-provider/
├── src/canonical/       # ModelCatalogEntry、capability、content
├── src/runtime_provider.rs # provider route/readiness/credential ref
├── src/lowering/        # provider-neutral -> provider wire
├── src/current_client/  # HTTP/SSE/Responses WebSocket client
├── src/provider_stream.rs # normalized stream reducer
└── tests/               # route/lowering/stream/retry contract
```

旧 `lime-rs/crates/providers/` 只允许出现在历史 evidence 与负向回流守卫；它不是
provider trait、converter、streaming、session 或 signature store 的 current owner，
也不得重新创建目录或 manifest。

## Provider 枚举

```rust
pub enum ProviderType {
    ClaudeCustom,   // Claude API Key
    OpenAICustom,   // OpenAI API Key
    GeminiApiKey,   // Gemini API Key
    Codex,          // OpenAI Responses / Codex 兼容 API Key
    Vertex,         // Vertex AI
}
```

## Provider Trait

```rust
pub trait Provider: Send + Sync {
    /// 获取 Provider 类型
    fn provider_type(&self) -> ProviderType;

    /// 返回运行时能力声明；凭证由 API Key Provider 服务解析后注入。
    fn capabilities(&self) -> ProviderCapabilities;

    /// 发送 API 请求
    async fn send_request(
        &self,
        credential: &RuntimeProviderCredential,
        request: &ProviderRequest,
    ) -> Result<ProviderResponse>;
}
```

## 已退役 Provider

Kiro / Qwen / Antigravity OAuth / Codex OAuth / Claude OAuth / Gemini OAuth 都属于旧凭证池功能，分类为 `dead`。不得重新接回设置页、legacy adapter 命令、Token 刷新任务或运行时 fallback。

Antigravity 的协议转换能力不是凭证池功能，`openai_to_antigravity` converter 仍可用于 coding plan。

## API Key Provider 实现

### OpenAI Custom

```rust
// 凭证结构
struct OpenAICredential {
    api_key: String,
    base_url: Option<String>,  // 自定义端点
}

// 请求头
Authorization: Bearer {api_key}
```

### Claude Custom

```rust
// 凭证结构
struct ClaudeCredential {
    api_key: String,
    base_url: Option<String>,
}

// 请求头
x-api-key: {api_key}
anthropic-version: 2023-06-01
```

## Prompt Cache 能力边界

Lime 当前把 Prompt Cache 能力视为 **Provider 显式声明优先、类型默认兜底**，而不是“请求长得像哪家协议”：

- `anthropic` / `claude` / `claude-oauth`：默认 `automatic`
- `anthropic-compatible`：默认 `explicit_only`，但自定义 Provider 可显式声明为 `automatic`
- 其它 Provider：默认 `not_applicable`

前台提示层额外保留一个**已知官方 Host 例外**：

- 对 `https://open.bigmodel.cn/api/anthropic` 这类智谱官方 Anthropic 兼容 Host，Lime 前台不再把它误报成“仅显式缓存”
- 这只影响 UI 提示与 badge 收口，不代表 Lime 会把该 Host 直接等同于 Anthropic `cache_control` 自动注入语义

这条事实源当前收敛在：

- 前端：`src/lib/model/providerPromptCacheSupport.ts`
- 后端：Provider 类型与运行时能力判断链
- 模型注册表映射：只负责 provider/model 目录归一，不参与 Prompt Cache 能力推断

需要特别注意：

1. `anthropic-compatible` 只表示接入方兼容 Anthropic wire format，不等于上游已经实现 Anthropic Automatic Prompt Caching
2. Lime 不会因为某个自定义渠道“长得像 Anthropic”就默认把它当成官方 Anthropic 自动缓存能力
3. 对自定义 `anthropic-compatible` 渠道，只有在上游明确声明支持 Automatic Prompt Cache 时才应配置为 `automatic`
4. 若未声明自动缓存，Lime 只保留显式 `cache_control` 语义；如果上游没有实现 Automatic Prompt Cache，`cached_input_tokens` 为空不能直接归因到 Lime 没发字段

排查这类问题时，优先确认三件事：

1. 当前 Provider 类型是不是 `anthropic-compatible`
2. 上游服务是否真的声明支持 Anthropic Automatic Prompt Caching
3. 响应 usage 中是否存在 `cache_creation_input_tokens` / `cache_read_input_tokens` / `cached_input_tokens`

## 添加新 Provider

1. 在 `model-provider` 的 canonical/lowering/current_client 边界增加能力
2. 通过唯一 provider registry 注册 route、capability 和 credential readiness
3. 同步 API Key Provider schema、ModelCatalogEntry、协议 schema 与连接测试
4. 更新 App Server typed model projection；Renderer 只消费 projection
5. 不得重新引入 `lime-providers` 或第二 Provider trait

## 相关文档

- [credential-pool.md](credential-pool.md) - 凭证池退役说明
- [converter.md](converter.md) - 协议转换
- [server.md](server.md) - HTTP 服务器
