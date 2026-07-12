# Provider、Model 与多模态能力

> status: target provider contract
> owner: model-provider + runtime-core
> last_verified: 2026-07-12
> opencode_reference: `specs/v2/provider-model.md`, `packages/llm/src/schema/**`, `packages/llm/src/protocols/**`

## 事实分层

```text
Provider
  -> endpoint / auth availability / headers / provider options
Model
  -> provider reference / variant / capability / cost / limit / status
Runtime request
  -> canonical messages / tools / generation / context / policy
Provider lowering
  -> validated native body + transport
Normalized stream
  -> LLMEvent
```

Provider 和 Model 是同一份事实的不同投影：GUI picker、发送 gate、runtime request assembly 和 provider lowering 不得各自推断能力。

## Capability 最小集合

| 类别 | 字段示例 | 消费者 |
| --- | --- | --- |
| input | text/image/audio/video/file | 附件 gate、context assembly、lowering |
| output | text/image/audio/file | workbench、Item materializer |
| tools | function/dynamic/hosted/parallel | tool policy、request builder |
| reasoning | levels、summary、encrypted/replay | turn policy、GUI display |
| context | context/output limit、truncation、compaction | bounded fragments |
| cache/usage | cache read/write、reasoning tokens、cost | billing/evidence |
| route | protocol、base URL、transport、auth | model-provider |
| variant | service tier、verbosity、provider options | picker/request merge |

未知能力必须显式为 `unknown/unsupported`，不能通过 provider/model 字符串猜测，也不能默默降级为另一个协议。

## ContentPart 与 LLMEvent

OpenCode 的 provider-neutral 代数可直接作为 Lime 输入契约参考：

```text
ContentPart = text | media | reasoning | tool-call | tool-result
LLMEvent = block start/delta/end
         | tool input/call/result/error
         | usage
         | finish/failure
```

Lime 在 Agent 层扩展 `artifact/reference/approval`，但这些不是 provider wire part：

```text
provider-neutral part/event
  -> agent RuntimeEvent
  -> Item (artifact/reference/approval)
  -> GUI projection
```

`providerExecuted` 必须保留，用于区分 provider-hosted tool 和 Lime 本地 tool；本地 tool 权限仍由 `tool-runtime` 决定。

## Lowering 单一 owner

当前 `runtime-core/src/llm_protocol/mapper/*` 仍包含多 provider wire mapper，v2 迁移目标是：

1. `runtime-core` 只保留 canonical request/content/event/context 类型。
2. `model-provider` 负责 OpenAI Responses/Chat、Anthropic、Gemini、兼容协议和 future route 的 lowering/parse。
3. 每个 protocol 一个 lowering module、一个 parser、一个 fixture；不复制为 provider-specific GUI adapter。
4. 不支持的 route 显式失败，禁止“尝试另一个 provider”或使用生产 mock。

## 参数合并顺序

```text
provider defaults
  -> model defaults
  -> selected variant
  -> typed turn request
  -> capability gate
  -> provider options
  -> lowering
```

GUI 只能发送 typed intent（模型、variant、附件、工具策略、reasoning 选择），不能拼 headers/body。最终 runtime 必须再次 fail-closed 校验，避免仅靠 GUI disabled state。

## 媒体策略

- Runtime Item 只保存 reference、mime、尺寸、摘要和权限。
- lowering 阶段按 provider/model capability 校验 MIME、大小和传输方式。
- base64/二进制只在短生命周期的 provider request 内出现，不进入 Thread history 或 GUI store。
- provider 不支持某媒体时返回结构化 capability error，不把附件静默丢弃。

## 复制与删除清单

| OpenCode 原点 | Lime 动作 |
| --- | --- |
| `packages/llm/src/schema/messages.ts`、`events.ts`、`options.ts` | 复制语义和 invariant 到 Rust canonical types；保留 Lime reference/artifact 扩展 |
| `packages/llm/src/route/{protocol,client}.ts` | 复制 route/lowering/transport 分层到 `model-provider` |
| `packages/llm/src/protocols/*.ts` | 按 provider 一个模块迁移，删除 `runtime-core` 中重复 wire mapper |
| `packages/opencode/src/session/llm/**` | 不复制 Session runner；只抽取 request preparation 的字段归属原则 |
| 旧 provider string inference、GUI body builder | 迁移后删除并加 source guard |

## 验证

- capability matrix 与 generated schema 一致。
- 每个 provider fixture 覆盖 text、tool、reasoning、media、usage、finish/error。
- unsupported route/media 显式失败。
- GUI disabled 与 runtime fail-closed 结果一致。
- `npm run test:contracts` + provider 定向 Rust/TS 测试 + GUI media smoke。
