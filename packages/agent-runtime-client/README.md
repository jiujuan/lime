# @limecloud/agent-runtime-client

`@limecloud/agent-runtime-client` 是 Lime Agent Runtime 的标准 TypeScript client facade。它不定义新协议，也不重建运行时；当前实现只复用 `@limecloud/app-server-client` 中已经存在的 App Server JSON-RPC current 主链。

## Boundary

这个包负责：

- 暴露 `AgentRuntimeClient` 标准接口。
- 暴露 `createAgentRuntimeClient(...)` 工厂。
- 暴露 browser-safe 子路径 `@limecloud/agent-runtime-client/sessionGateway`，用于把已有 App Server session gateway 适配为标准 runtime client。
- 委托 App Server current methods：`agentSession/turn/start`、`agentSession/turn/cancel`、`agentSession/action/respond`、canonical `thread/read`、`evidence/export`。
- 订阅并分发 canonical Thread / Turn / Item notifications；`agentSession/event` 只保留为 App Server envelope 和 `media.read.*` 非 Thread 通道。

这个包不负责：

- 新增 JSON-RPC method。
- 直接调用 Electron IPC、legacy desktop facade 或 mock。
- 直接渲染 UI。
- 伪造独立 `readTask` 协议。

## Install

```bash
npm install @limecloud/agent-runtime-client
```

根入口面向 Node / host 侧 App Server transport；renderer 或浏览器 bundle 默认使用 `./sessionGateway` 子路径，避免把 sidecar / stdio 能力打进前端包。

## Package Mapping

AgentUI / AgentRuntime 当前四包链路：

```text
@limecloud/agent-runtime-client
  -> App Server JSON-RPC current facade
  -> canonical Thread / Turn / Item notifications + thread/read
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
```

`@limecloud/agent-runtime-client` 只拥有 transport facade。它不导出 `AgentUiProjectionState`，也不依赖 `@limecloud/agent-runtime-projection` 或 `@limecloud/agent-runtime-ui`。

## Root Usage

根入口适合 App Server connection owner 使用。它直接复用 `@limecloud/app-server-client` 的 `AppServerConnection`，不新增 runtime protocol：

```ts
import {
  AppServerConnection,
  createAgentRuntimeClient,
} from "@limecloud/agent-runtime-client";

const connection = new AppServerConnection(transport);
const runtime = createAgentRuntimeClient(connection, {
  request: { timeoutMs: 120_000 },
});

runtime.subscribeCanonicalEvents((notification) => {
  console.log(notification.entity, notification.sequence);
});

await runtime.startTurn({
  sessionId: "session-1",
  input: { text: "整理资料并生成草稿" },
  runtimeOptions: { stream: true },
});

const thread = await runtime.readThread({
  threadId: "thread-1",
  turnsView: "full",
});
```

`readThread` 当前映射到 App Server canonical `thread/read`。参数必须是
hydrated canonical `threadId`，不能把 legacy `sessionId` 直接当作
`threadId`；返回的 `thread.sessionId` 仅供仍为 session-scoped 的旧方法寻址。

## Client API

| Method                             | App Server owner              | Result                   | Rule                                                    |
| ---------------------------------- | ----------------------------- | ------------------------ | ------------------------------------------------------- |
| `startTurn(params, options?)`      | `agentSession/turn/start`     | turn start response      | 只提交 runtime intent，不生成 UI state。                |
| `cancelTurn(params, options?)`     | `agentSession/turn/cancel`    | cancel response          | 失败直接向上抛出，不本地假设已取消。                    |
| `respondAction(params, options?)`  | `agentSession/action/respond` | action response          | 不乐观改 pending action，等待 runtime facts。           |
| `readThread(params, options?)`     | `thread/read`                | canonical thread         | 供 projection hydration / repair 使用，建议 `turnsView: "full"`。 |
| `exportEvidence(params, options?)` | `evidence/export`             | evidence export response | 缺 surface 时 fail closed，不伪造空 evidence。          |
| `subscribeEvents(listener)`        | `agentSession/event`          | unsubscribe handle       | 只分发 App Server runtime events。                      |
| `dispatchEvent(message)`           | local event router            | boolean                  | 用于现有 gateway 把 JSON-RPC notification 喂给 client。 |
| `nextEvent(timeoutMs?)`            | gateway event source          | notification             | 优先 gateway `nextEvent`，其次 `drainEvents`。          |

`options.timeoutMs` 只影响底层 App Server request / event source。超时不等于 turn 失败；宿主应再用 `readThread` 或 runtime event 修复状态。

## Runtime Lifecycle

标准 turn 生命周期由 App Server / RuntimeCore 拥有：

```text
startTurn
  -> canonical Thread / Turn / Item notifications
  -> readThread for hydration or repair
  -> respondAction / cancelTurn when user intent occurs
  -> canonical Turn / Item terminal entities
  -> exportEvidence when host needs replay / review package
```

client 只传递 lifecycle intent 和 facts，不维护 tool 状态机、subagent lineage、Provider 参数或 UI 完成态。

## Browser-Safe Session Gateway

Renderer 宿主如果已经有自己的 App Server gateway，应从 browser-safe 子路径导入 session gateway 适配器，避免把根入口中的 Node 侧 sidecar / stdio client 打进前端包。该适配器仍返回标准 `AgentRuntimeClient`，覆盖 turn lifecycle、`readThread`、`exportEvidence`、`subscribeCanonicalEvents`、`dispatchEvent` 和 `nextEvent`；宿主缺少 evidence 或 event source 时会 fail closed，不会静默回退 mock。

`createAgentRuntimeClientFromSessionGateway(...)` 只适配现有 session gateway，
不会创建第二套 transport、lifecycle state 或兼容协议。

推荐传入函数式 gateway。如果你的 `AppServerClient` 是 class instance，方法内部依赖 `this.request`，不要直接裸传类方法，应在产品网关里包成闭包：

```ts
import { createAgentRuntimeClientFromSessionGateway } from "@limecloud/agent-runtime-client/sessionGateway";

const runtime = createAgentRuntimeClientFromSessionGateway({
  startTurn: (params, options) => appServerClient.startTurn(params, options),
  readThread: (params, options) =>
    appServerClient.readThread(params, options),
  cancelTurn: (params, options) => appServerClient.cancelTurn(params, options),
  respondAction: (params, options) =>
    appServerClient.respondAction(params, options),
  exportEvidence: (params, options) =>
    appServerClient.exportEvidence(params, options),
  nextEvent: (timeoutMs) => appServerClient.nextEvent(timeoutMs),
});
```

最小 lifecycle-only 宿主可以只实现 turn、read 和 action response：

```ts
import type { AgentRuntimeLifecycleClient } from "@limecloud/agent-runtime-client/sessionGateway";

const runtime: AgentRuntimeLifecycleClient =
  createAgentRuntimeClientFromSessionGateway({
    startTurn: (params) => appServerClient.startTurn(params),
    readThread: (params) => appServerClient.readThread(params),
    cancelTurn: (params) => appServerClient.cancelTurn(params),
    respondAction: (params) => appServerClient.respondAction(params),
  });
```

## Transport Contract

| Transport surface       | Current rule                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root entry              | 适合 Node / host owner，复用 `@limecloud/app-server-client` 的 `AppServerConnection`。                                                                |
| `./sessionGateway`      | browser-safe，适合 renderer 复用已有 App Server gateway。                                                                                             |
| Electron / Desktop Host | 只能由宿主 gateway 封装，不能在本包直接 import bridge helper。                                                                                        |
| Event source            | `nextEvent(timeoutMs?)` 或 `drainEvents(limit?)`，只接受 canonical Thread / Turn / Item notification 或明确的 `media.read.*` 非 Thread notification。 |
| Mock / fixture          | 只允许测试显式传入，不允许 production transport fallback。                                                                                            |

如果 gateway 方法来自 class instance，必须在宿主里包成闭包，避免丢失 `this`。本包不会替宿主绑定私有 client 实例。

## Product App Flow

产品应用接入时保持这条链路：

```text
Product App business context
  -> AgentRuntimeClient.startTurn / readThread / respondAction
  -> App Server agentSession/* + canonical thread/read
  -> RuntimeCore / ExecutionBackend
  -> canonical Thread / Turn / Item notifications + thread/read
  -> @limecloud/agent-runtime-projection
  -> @limecloud/agent-runtime-ui
```

产品应用只负责 session 归属、workspace、业务对象 id、action callback 和页面路由；不要在产品应用里重建 turn 状态机、tool 状态机、Provider 参数拼装或 mock fallback。

## Error Handling

这个包不吞掉 transport error。调用方应按真实边界处理：

- bridge / network error：fail closed，提示运行时不可用。
- App Server error：保留原始 request result 或抛错，不转换成 UI 成功态。
- `exportEvidence` 未实现：按宿主能力缺失处理，不伪造空 evidence。
- event source 未实现：`nextEvent` 抛错，宿主可改用 read model hydration。
- action response 失败：保留 pending action，由宿主提示重试。

错误分类建议：

| Failure                 | UI expectation                                        |
| ----------------------- | ----------------------------------------------------- |
| bridge unavailable      | runtime blocked / unavailable。                       |
| provider not ready      | settings / setup action，由 App Server facts 表达。   |
| stream interrupted      | hydration `stale` / `repairing`，由 read model 修复。 |
| action response failed  | action 仍 pending，可重试。                           |
| evidence export missing | evidence panel 显示能力缺失，不伪造导出包。           |

## Conformance

最小 runtime client conformance：

- lifecycle：`startTurn -> readThread -> cancelTurn / respondAction` 均委托 gateway。
- events：`subscribeCanonicalEvents`、`dispatchEvent`、`nextEvent` 只把 canonical Thread / Turn / Item 送入 lifecycle pipeline；raw channel 仅允许 `media.read.*`。
- evidence：`exportEvidence` 有实现时委托，没有实现时 fail closed。
- errors：transport error 原样传播，不切 mock。
- bundle：`@limecloud/agent-runtime-client/sessionGateway` dist 不包含 Node builtin 或 `@limecloud/app-server-client` 依赖。

## Development

```bash
npm --prefix packages/agent-runtime-client run build
npm --prefix packages/agent-runtime-client run test
npm run test:contracts
```

## Package Metadata

| Item                | Value                                              |
| ------------------- | -------------------------------------------------- |
| Runtime             | Node `>=20`，ESM。                                 |
| Root dependency     | `@limecloud/app-server-client`。                   |
| Browser-safe export | `@limecloud/agent-runtime-client/sessionGateway`。 |
| Side effects        | `false`。                                          |
| Public files        | `dist`、`README.md`。                              |
| License             | `MIT`。                                            |

## Do Not

- 不要在这里新增 JSON-RPC method name。
- 不要在这里生成 `AgentUiProjectionState`。
- 不要在这里导入 React、Electron bridge、renderer bridge helper 或测试 mock registry。
- 不要把 Provider API key、Provider SDK client 或 direct HTTP 放进 runtime client。
- 不要把旧 Plugin desktop facade 当成新 runtime owner。
