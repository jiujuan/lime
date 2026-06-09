# @limecloud/agent-runtime-client

`@limecloud/agent-runtime-client` 是 Lime Agent Runtime 的标准 TypeScript client facade。它不定义新协议，也不重建运行时；当前实现只复用 `app-server-client` 中已经存在的 App Server JSON-RPC current 主链。

## Boundary

这个包负责：

- 暴露 `AgentRuntimeClient` 标准接口。
- 暴露 `createAgentRuntimeClient(...)` 工厂。
- 委托 App Server current methods：`agentSession/turn/start`、`agentSession/turn/cancel`、`agentSession/action/respond`、`agentSession/read`、`evidence/export`。
- 订阅和分发 `agentSession/event` runtime events。

这个包不负责：

- 新增 JSON-RPC method。
- 直接调用 Electron IPC、legacy desktop facade 或 mock。
- 直接渲染 UI。
- 伪造独立 `readTask` 协议。

## Usage

```ts
import {
  AppServerConnection,
  createAgentRuntimeClient,
} from "@limecloud/agent-runtime-client";

const connection = new AppServerConnection(transport);
const runtime = createAgentRuntimeClient(connection, {
  request: { timeoutMs: 120_000 },
});

runtime.subscribeEvents((event) => {
  console.log(event.type, event.payload);
});

await runtime.startTurn({
  sessionId: "session-1",
  input: { text: "整理资料并生成草稿" },
  runtimeOptions: { stream: true },
});

const thread = await runtime.readThread({ sessionId: "session-1" });
```

`readThread` 当前映射到 App Server `agentSession/read`。如果宿主需要 task 视图，应先从 session、turns 和 events 投影，不要在 client 包里伪造第二套 task protocol。

## Development

```bash
npm --prefix packages/app-server-client run build
npm --prefix packages/agent-runtime-client run test
```
