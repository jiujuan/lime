# OpenCode package 参照与边界

> status: current reference map
> owner: runtime-architecture
> last_verified: 2026-07-18
> source: `/Users/coso/Documents/dev/js/opencode`
> source_commit: `08fb47373509ba64b13441061314eeacf4264f51`

## 参照结论

OpenCode 的价值不只是 provider schema。它把 `schema -> llm -> core/domain -> server/client -> app/session-ui` 分成可独立演进的 package，并通过 workspace dependencies 保持方向性。v2 只复制这种模块纪律；Agent loop、Thread/Turn 生命周期、工具执行和桌面宿主仍以 Codex + Lime current 为准。

## Package owner 对照

| OpenCode package      | 负责什么                                                         | Lime 对应 owner                                      | 动作                                                  |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| `packages/schema`     | 低层 schema、brand ID、基础数据类型                              | `app-server-protocol` schema + generated TS          | `adapt`，Rust schema 是事实源                         |
| `packages/llm`        | provider-neutral request/content/event、route、protocol lowering | `runtime-core` + `model-provider`                    | `adapt`，复制代数和 lowering 分层，不复制 JS/Effect   |
| `packages/core`       | DB、provider catalog、session/domain 服务                        | `thread-store`、`model-provider`、App Server runtime | `reject` Session 实现，按领域拆责任                   |
| `packages/protocol`   | HTTP/API protocol 类型                                           | `app-server-protocol` JSON-RPC                       | `reject` transport 形态，保留 typed boundary 原则     |
| `packages/client`     | generated client 和 server contract                              | `packages/app-server-client` + `src/lib/api/*`       | `adapt`，继续 JSON-RPC，不引入 HTTP/OpenAPI           |
| `packages/server`     | server handler/DB 接线                                           | `lime-rs/crates/app-server`                          | `reject` 实现，吸收薄 handler 原则                    |
| `packages/plugin`     | plugin contract、tool/provider hook                              | `plugin`/`skills`/App Server plugin host             | `adapt`，不把插件执行塞进 Renderer                    |
| `packages/app`        | Solid Web UI、server sync、页面状态                              | `src/` GUI + projection                              | `reject` 组件和状态库；只吸收 reducer/read model 纪律 |
| `packages/session-ui` | 可复用消息、markdown、diff UI                                    | Lime GUI primitives/workbench                        | `adapt`，保留 GUI design language 和 i18n             |
| `packages/tui`        | 终端 UI                                                          | 无对应目标                                           | `reject`                                              |

## 允许复制的模块规律

### 1. Schema 和 domain 分离

`packages/schema` 只提供可复用的基础 schema，`packages/llm` 在其上定义 provider-neutral content/event。Lime 要让 `agent-protocol`、`runtime-core`、`model-provider` 各自有清晰输入输出，禁止把 UI DTO 或 provider wire body塞进低层 schema。

### 2. LLM lowering 只有一个方向

```text
canonical request/content
  -> route/provider profile
  -> validated provider body
  -> transport
  -> canonical LLM event
```

OpenCode 证据：`packages/llm/src/route/protocol.ts`、`route/client.ts`、`protocols/*.ts`、`protocols/shared.ts`。Lime 的 wire lowering 必须迁到 `model-provider`，不能继续散落在 `runtime-core` mapper 和 GUI request builder。

### 3. Client 不持有 domain truth

OpenCode 的 generated client 只消费 server contract；Lime 的 `packages/app-server-client` 和 `src/lib/api/*` 也只能做 typed transport、normalization 和 projection adapter，不持有 Thread/Turn/Item 状态机。

### 4. UI 消费 reducer/read model

OpenCode `packages/app/src/context/global-sync/event-reducer.ts` 展示了 server event 先归并到 store，再由组件投影的方式。Lime 必须经过 App Server notification/read model 和纯 projection，不能让 Renderer 直连 provider 或本地执行器。

## Provider/Model 代数

来自 `specs/v2/provider-model.md` 和 `packages/llm/src/schema/messages.ts`、`events.ts`：

- Provider：endpoint、auth/availability、headers/options。
- Model：capabilities、variants、cost、limit、status、provider reference。
- ContentPart：text、media、tool-call、tool-result、reasoning。
- LLMEvent：block start/delta/end、tool input、tool call/result/error、usage、finish。
- `providerExecuted` 显式区分 provider-hosted tool 和本地 tool。

Lime 可在 provider-neutral 层扩展 `artifact`、`approval`、`reference`，但这些必须在 Agent 层 materialize 成 Item；不能把 GUI 专属类型下压到 provider wire。

## 明确拒绝

| OpenCode surface                                   | 拒绝原因                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/opencode/src/session/**`                 | Session runner 与 Lime/Codex Thread/Turn 语义不同                       |
| `packages/opencode/src/tool/**`、`permission/**`   | 运行时、权限和执行 owner 应归 Lime `tool-runtime` + Codex control plane |
| `packages/app`、`session-ui` 的 Solid 组件         | Lime 是 React/Electron GUI，复制会建立第二套设计和状态体系              |
| `packages/protocol`、generated HTTP/OpenAPI client | Lime 固定 App Server JSON-RPC                                           |
| Bun/Effect runtime 与 native/AI SDK 双 fallback    | 会新增平行 provider runtime，违反唯一事实源                             |

## 依赖方向目标

```text
schema/protocol
  -> canonical llm / agent protocol
  -> domain runtime
  -> server/client gateway
  -> GUI projection
```

反向依赖一律禁止：provider 不依赖 GUI，GUI 不依赖 provider wire，client 不依赖数据库，Electron 不依赖 runtime domain。
