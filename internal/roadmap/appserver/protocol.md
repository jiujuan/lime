# App Server 协议草案

> 状态：current planning source
> 更新时间：2026-06-04
> 作用：定义 App Server 的 JSON-RPC 协议形态、命名、对象模型、事件和错误。

## 1. 协议原则

1. 使用 JSON-RPC 2.0 语义，wire 上采用 newline-delimited JSON。
2. 方法名使用 `<resource>/<method>`。
3. wire 字段使用 `camelCase`。
4. 协议版本显式放入 `initialize` 响应。
5. 所有业务事件通过 server notification 发出。
6. 初始化前拒绝业务方法。
7. request / response / notification 都必须可 fixture 化。

## 2. Transport

首期只做：

```text
app-server --stdio
```

wire 示例：

```json
{"id":1,"method":"initialize","params":{"clientInfo":{"name":"content_studio","version":"0.1.0"}}}
{"method":"initialized","params":{}}
{"id":2,"method":"agentSession/start","params":{"appId":"content-studio","workspaceId":"default"}}
{"id":3,"method":"agentSession/start","params":{"sessionId":"sess_external_01","threadId":"thread_external_01","appId":"content-studio","workspaceId":"default"}}
```

后续 transport：

1. `unix://` 或 Windows named pipe。
2. `ws://127.0.0.1:<port>` 仅作为调试或受控本地连接。

## 3. 初始化

### 3.1 `initialize`

Request:

```json
{
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "content_studio",
      "title": "Content Studio",
      "version": "0.1.0"
    },
    "capabilities": {
      "eventMethods": ["agentSession/event"],
      "experimental": false
    }
  }
}
```

Response:

```json
{
  "id": 1,
  "result": {
    "serverInfo": {
      "name": "app-server",
      "version": "0.1.0",
      "protocolVersion": "appserver.v0"
    },
    "platform": {
      "family": "desktop",
      "os": "macos"
    },
    "capabilities": {
      "agentSession": true,
      "capabilityDiscovery": true,
      "artifact": true,
      "evidence": true,
      "workspace": true
    }
  }
}
```

### 3.2 `initialized`

Notification:

```json
{"method":"initialized","params":{}}
```

## 4. 核心对象

### 4.1 `AgentSession`

```ts
type AgentSession = {
  sessionId: string;
  threadId: string;
  appId: string;
  workspaceId?: string;
  businessObjectRef?: BusinessObjectRef;
  status: "idle" | "running" | "waitingAction" | "completed" | "failed" | "canceled";
  createdAt: string;
  updatedAt: string;
};
```

### 4.2 `BusinessObjectRef`

```ts
type BusinessObjectRef = {
  kind: string;
  id: string;
  title?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
};
```

### 4.3 `AgentTurn`

```ts
type AgentTurn = {
  turnId: string;
  sessionId: string;
  threadId: string;
  status: "accepted" | "queued" | "running" | "waitingAction" | "completed" | "failed" | "canceled";
  startedAt?: string;
  completedAt?: string;
};
```

### 4.4 `AgentEvent`

```ts
type AgentEvent = {
  eventId: string;
  sequence: number;
  sessionId: string;
  threadId?: string;
  turnId?: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

## 5. 方法清单

| 方法 | 阶段 | 说明 |
| --- | --- | --- |
| `initialize` | P1 | 初始化连接。 |
| `initialized` | P1 | 客户端确认初始化完成。 |
| `agentSession/start` | P1 | 创建 session/thread。 |
| `agentSession/read` | P1 | 读取 session read model。 |
| `agentSession/turn/start` | P1 | 发起一轮 Agent 执行。 |
| `agentSession/turn/cancel` | P1 | 取消 active turn。 |
| `agentSession/action/respond` | P2 | 响应工具、权限或人工输入 action。 |
| `capability/list` | P2 | 读取 App 可用 capability。 |
| `skill/list` | P2 | 读取可用 skill。 |
| `tool/list` | P2 | 读取可用 tool 摘要。 |
| `workspace/read` | P2 | 读取 workspace 状态。 |
| `artifact/read` | P3 | 读取 artifact ref / preview。 |
| `evidence/export` | P3 | 导出 evidence pack。 |

## 6. Session API

### 6.1 `agentSession/start`

Request:

```json
{
  "id": 2,
  "method": "agentSession/start",
  "params": {
    "sessionId": "sess_01",
    "threadId": "thread_01",
    "appId": "content-studio",
    "workspaceId": "default",
    "businessObjectRef": {
      "kind": "contentDraft",
      "id": "draft_123",
      "title": "小红书图文草稿"
    },
    "locale": "zh-CN"
  }
}
```

字段规则：

1. `sessionId` / `threadId` 可选；缺省时由 App Server 生成。
2. 外部 App 已有持久化业务 session，或 Lime Tauri adapter 需要绑定现有 Aster session 时，可以传入稳定 `sessionId` / `threadId`。
3. 同一个 `sessionId` 重复 start 必须返回 `Session already exists`，不能覆盖已有 read model。
4. `sessionId` / `threadId` 仍是公共协议字段，不允许携带 Aster、Tauri command 或数据库私有类型。

Response:

```json
{
  "id": 2,
  "result": {
    "session": {
      "sessionId": "sess_01",
      "threadId": "thread_01",
      "appId": "content-studio",
      "workspaceId": "default",
      "status": "idle",
      "createdAt": "2026-06-04T10:00:00Z",
      "updatedAt": "2026-06-04T10:00:00Z"
    }
  }
}
```

### 6.2 `agentSession/turn/start`

Request:

```json
{
  "id": 3,
  "method": "agentSession/turn/start",
  "params": {
    "sessionId": "sess_01",
    "input": {
      "text": "基于这些资料生成一版内容草稿",
      "attachments": []
    },
    "runtimeOptions": {
      "capabilityId": "content.draft.generate",
      "stream": true
    }
  }
}
```

Response:

```json
{
  "id": 3,
  "result": {
    "turn": {
      "turnId": "turn_01",
      "sessionId": "sess_01",
      "threadId": "thread_01",
      "status": "accepted"
    }
  }
}
```

## 7. Notification

统一使用：

```text
agentSession/event
```

投递规则：

1. 同步 `turn/start` 或 `turn/cancel` 产生的 backend events，随同一次 JSON-RPC request 的 response 后追加 notification。
2. Query Loop、Tauri host listener 或未来 backend worker 产生的外部异步 runtime events，先追加到 `RuntimeCore` read model，再经 App Server outbound channel 写出同样的 notification。
3. 客户端只按 `agentSession/event` 消费事件；不得区分事件来自同步 request 还是异步外部出口。

示例：

```json
{
  "method": "agentSession/event",
  "params": {
    "event": {
      "eventId": "evt_01",
      "sequence": 1,
      "sessionId": "sess_01",
      "threadId": "thread_01",
      "turnId": "turn_01",
      "type": "turn.started",
      "timestamp": "2026-06-04T10:00:01Z",
      "payload": {
        "status": "running"
      }
    }
  }
}
```

首期事件类型：

1. `session.started`
2. `turn.accepted`
3. `turn.started`
4. `message.delta`
5. `message.completed`
6. `tool.started`
7. `tool.result`
8. `tool.failed`
9. `action.required`
10. `action.resolved`
11. `artifact.changed`
12. `evidence.changed`
13. `turn.completed`
14. `turn.failed`
15. `turn.canceled`

## 8. 错误码

| code | message | 说明 |
| --- | --- | --- |
| `-32600` | Invalid request | JSON-RPC request 无效。 |
| `-32601` | Method not found | 方法不存在。 |
| `-32602` | Invalid params | 参数不符合 schema。 |
| `-32000` | Runtime error | runtime 内部错误。 |
| `-32001` | Server overloaded | server backpressure。 |
| `-32002` | Not initialized | 初始化前调用业务方法。 |
| `-32003` | Already initialized | 重复初始化。 |
| `-32010` | Session not found | session 不存在或不可见。 |
| `-32011` | Turn not active | turn 不可取消或不可响应。 |
| `-32012` | Action not found | action 不存在或已解决。 |
| `-32013` | Session already exists | session 已存在，不能重复 start 覆盖。 |
| `-32020` | Capability denied | App 无权使用该 capability。 |

错误 response 示例：

```json
{
  "id": 3,
  "error": {
    "code": -32010,
    "message": "Session not found",
    "data": {
      "sessionId": "sess_missing"
    }
  }
}
```

## 9. 版本策略

1. `protocolVersion` 使用 `appserver.v0`、`appserver.v1`。
2. 破坏性字段变化必须提升 major。
3. 新增 optional 字段不提升 major。
4. 实验方法必须在 `capabilities.experimental` 下显式启用。
5. TypeScript schema 和 Rust DTO 必须同源生成或由合同测试校验一致。

## 10. 协议验收

1. 每个方法都有 request / response fixture。
2. 每个 notification 都有 fixture。
3. fixture 字段使用 camelCase。
4. 初始化门禁有测试。
5. 错误码稳定，不能把 provider 原始错误直接暴露成协议 code。
