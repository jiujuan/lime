# opencode 多模型 / 多模态限定参照表

> 状态：current research baseline
> 更新时间：2026-07-05
> opencode 参照：`/Users/coso/Documents/dev/js/opencode`

## 1. 定位

Codex 是 Lime Agent 工程主原点；opencode 只作为 Lime 多模型、多模态能力表达参照。它接入的位置是 `ModelCapability / ContentPart / LLMEvent / provider lowering`，再由 Lime runtime materialize 成 `ThreadItem / RuntimeEvent / TimelineItem`，不能反向裁决 Session、Tool、UI 或 App Server 架构。

opencode 的价值不在于替换 Lime 的 Rust App Server，也不在于把 Lime 改成 Effect/Bun 栈，而在于它已经把多 Provider、多 provider wire protocol、多模态 message part、模型 capability 和 provider-specific lowering 做成了清晰表达。

本文件是 allowlist，不是 opencode 架构评审。只有下列范围能被引用到 Lime 路线图；其他 opencode 模块默认不参与。

Lime 参考 opencode 时只看这些范围：

1. Provider / Model catalog。
2. Model capability。
3. Provider-neutral LLM message / event。
4. Media part 和多模态输入输出表达。
5. Generation / HTTP / provider options。
6. Provider-specific lowering。

明确不参考：

1. `specs/v2/session.md`。
2. `specs/v2/tools.md`。
3. `packages/app/src/**` UI 组件。
4. `packages/protocol/src/**` 协议组织。
5. `packages/client/src/**` generated client。
6. Effect / Bun runtime 组织方式。

使用规则：

1. 只摘取能力表达，不迁移 opencode 的运行时组织。
2. 只落到 Lime current 的 `ModelCapability / ContentPart / LLMEvent / provider lowering`。
3. 不允许从本文件推出任何 Session、Tool、UI、协议治理或工程栈迁移任务。

## 2. 限定对照表

| opencode 参照模块 | opencode 路径 | opencode 模式 | Lime 当前路径 | Lime 状态 | 差距 | 动作 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Provider / Model catalog | `specs/v2/provider-model.md`、`packages/core/src/provider.ts`、`packages/core/src/model.ts` | Provider、endpoint、options、model capabilities、cost、limit、variant 分层 | `modelProvider/*` App Server methods、`model-provider` crate、`modelRegistry.ts` | `current` | Lime 多 Provider 已有，但 capability、variant、cost、limit 表达还不够系统 | 以 opencode catalog 为参照完善 provider/model capability map | P0 `adapt-for-desktop` |
| LLM protocol-neutral messages | `packages/llm/src/schema/messages.ts` | `text / media / tool-call / tool-result / reasoning` ContentPart | `agent-protocol`、`message_content_adapter.rs`、前端 ContentPart / Timeline | `current` | Lime 多模态已有，但前后端统一 part algebra 仍需收口 | 把 opencode ContentPart 作为 Lime 多模态投影校准表 | P0 `adopt-now` |
| LLM event stream | `packages/llm/src/schema/events.ts` | text/reasoning/tool input/tool result/finish/provider-error 事件族 | `runtime_backend/event_mapper.rs`、`projection_item_events.rs`、`StreamingRenderer` | `current` | Codex 事件强 Agent，opencode 事件更 provider-neutral | 建 Lime provider-neutral LLM event layer，再投影 Agent UI | P0 `adapt-for-desktop` |
| Model capabilities | `Model.Capabilities`、`input/output/tools` | 模型能力显式表达 input/output/tool 支持 | `modelProvider/catalog/list`、`model/list`、runtime model resolver | `current` | Lime 需要覆盖 image/audio/video/document/tool/reasoning/cache | 扩展 capability map，服务 UI 禁用态和 runtime request assembly | P0 `adopt-now` |
| Generation / HTTP / provider options | `packages/llm/src/schema/options.ts` | generation、HTTP、providerOptions 分层 merge | provider config、model route assembly、runtime request metadata | `current` | Lime 多 Provider 参数来源多，合并优先级需更显式 | 定义 request option precedence，不让 UI 直接拼 provider body | P1 `adapt-for-desktop` |
| Cache capability | `packages/llm/src/schema/options.ts`、`cache-policy.ts` | protocol-neutral cache policy，再下沉到 provider wire marker | Prompt Cache 规则、provider cache 判断 | `current` | Lime 已区分 anthropic / anthropic-compatible，但可抽象为 capability + lowering | prompt cache 从 provider type 判断升级为 capability + provider lowering | P1 `adapt-for-desktop` |
| Provider-specific lowering | `packages/llm/src/protocols/*` | OpenAI、Anthropic、Gemini、Bedrock 等 provider wire 差异集中处理 | `runtime_backend/model_route_*`、provider adapter | `current` | Lime provider wire shape 不应泄漏到 UI/API | 建 provider-neutral request -> provider lowering 边界 | P1 `adapt-for-desktop` |

## 3. opencode 对 Lime 的关键补充

### 3.1 多模型不是“多个 provider 列表”

Lime 需要的是能力矩阵：

```text
provider
  -> endpoint protocol
  -> model
  -> variant
  -> capabilities
       input: text / image / audio / video / document / file
       output: text / image / audio / video / structured
       tools: local / provider-native / MCP
       reasoning: visible / hidden / encrypted / unsupported
       cache: automatic / explicit / unsupported
  -> cost / limit / status
```

Codex 更适合指导 Agent loop；opencode 只负责帮助 Lime 校准这个能力矩阵。

### 3.2 多模态必须进协议 part algebra

opencode 的 `ContentPart` 给出一个清晰边界：

```text
text
media
tool-call
tool-result
reasoning
```

Lime 应扩展为桌面产品需要的 part algebra：

```text
text
media(image/audio/video/document)
tool-call
tool-result
reasoning
artifact
approval
reference
```

关键不是字段完全一致，而是所有前后端投影都基于结构化 part，不靠文案猜状态。

### 3.3 Provider lowering 不应泄漏到 UI

opencode 的 provider protocol 文件证明一件事：OpenAI、Anthropic、Gemini、Bedrock 等 wire shape 差异必须集中在 lowering 层。

Lime 应保持：

- GUI 只提交 provider-neutral intent 和 attachment/reference。
- API 网关不拼 provider body。
- Runtime 根据 ModelCapability 和 provider adapter 生成具体请求。

## 4. 与 Codex 的裁决关系

| 问题 | 优先参考 |
| --- | --- |
| App Server JSON-RPC、Agent turn、tool lifecycle、approval/sandbox | Codex |
| Provider/model catalog、能力矩阵、multi-provider options | opencode |
| 多模态 message part、media input/output、provider lowering | opencode |
| GUI Workspace、artifact workbench、桌面体验 | Lime 设计语言 + Codex 状态机，opencode 不参与 |
| Context/token 边界 | Codex |
| Event materialization、history、Evidence、Replay | Codex + Lime current，opencode 只提供 provider-neutral event 输入 |
| 测试和 fixture | Lime 现有质量入口 + Codex fixture 思路 |
