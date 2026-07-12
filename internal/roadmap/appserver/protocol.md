# App Server 协议草案

> 状态：current planning source
> 更新时间：2026-06-08
> 作用：定义 App Server 的 JSON-RPC 协议形态、命名、对象模型、事件和错误。

## 1. 协议原则

1. 使用 JSON-RPC-like / JSON-RPC 2.0 语义，wire 上采用 newline-delimited JSON；和 codex-rs app-server 一样，wire 不要求也不发送 `"jsonrpc":"2.0"` header。
2. 方法名使用 `<resource>/<method>`；新增 resource 默认用 singular 命名。`agentSession/*` 是 Lime v0 为兼容既有 session 语义保留的 resource 名，后续新面不得再发明平级命名。
3. wire 字段使用 `camelCase`；config mirror 类 payload 如确需 snake_case，必须在协议说明中单独列为例外。
4. 协议版本显式放入 `initialize` 响应。
5. 业务进度首期通过 server notification 发出；需要 client 响应的审批 / 人工输入首期用 `action.required` + `agentSession/action/respond`，不伪装成已完成事件。若后续引入 server-initiated request，必须单独补 request / response fixture 和 client handling contract。
6. 初始化前拒绝业务方法，重复 `initialize` 也必须拒绝。
7. request / response / notification 都必须可 fixture 化，且 stable / experimental schema 必须分别可校验。
8. 新协议方法不得以 `lime-rs/src/commands/**` 为实现落点，也不得通过新增旧 Tauri wrapper、stub 或 compat facade 暴露；Rust 实现进入 App Server protocol / processor / RuntimeCore / services，桌面壳能力进入 Electron Desktop Host。

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

transport 规则：

1. `stdio` 是首期默认 transport，一行一个 JSON object。
2. `unix://` 或 Windows named pipe 只作为本地 control-plane transport，不作为业务 UI 直连绕过 Electron Desktop Host bridge 的理由。
3. `ws://127.0.0.1:<port>` 仅允许实验 / 调试；生产不可把 websocket 当稳定外部 API。若启用本地 HTTP health probe，带 `Origin` header 的请求必须拒绝，避免被浏览器页面跨源探测。
4. tracing / log 输出走 `stderr`；需要机器消费时使用 JSON log format，不能混进 stdout JSONL。
5. transport ingress、request processing 和 outbound 写出都必须有 bounded queue；队列饱和时返回 `-32001 Server overloaded`，客户端按 retryable 错误处理并使用 exponential backoff + jitter。

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
      "experimentalApi": false,
      "optOutNotificationMethods": ["agentSession/event"]
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

初始化规则：

1. 每个 transport connection 只能成功 `initialize` 一次，随后客户端必须发送 `initialized` notification。
2. `capabilities.experimentalApi` 只在初始化时协商一次；未声明时视为 `false`。
3. `capabilities.optOutNotificationMethods` 使用精确 method name 匹配，不支持 wildcard / prefix；未知 method name 可接受并忽略。
4. 初始化前发业务 method 返回 `Not initialized`；重复初始化返回 `Already initialized`。
5. `clientInfo.name` 必须由接入方显式提供，用于审计和日志，不得由 Electron Host bridge 猜测业务 App 身份。

## 4. 核心对象

Codex-rs app-server 的核心对象是 `Thread / Turn / Item`。Lime v0 保留 `AgentSession / AgentTurn / AgentEvent` 命名，是为了兼容现有 Lime session、thread read model 和 GUI 事件投影；语义映射必须固定：

| Lime v0 | Codex-rs 参考语义 | 说明 |
| --- | --- | --- |
| `AgentSession` | `Thread` + app binding projection | 一段可恢复的 Agent 会话，同时携带 `appId / workspaceId / businessObjectRef`。 |
| `AgentTurn` | `Turn` | 一次用户输入到终态的执行回合。 |
| `AgentEvent` | `Item` lifecycle / turn notification projection | `message.delta`、tool、artifact、action、terminal status 都必须从 RuntimeCore facts 派生，不由 UI 猜测。 |

后续如果引入分页历史，应优先映射到 `thread/turns/list` 风格的 read model，而不是让 App UI 直接读取 runtime DB。

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
2. 外部 App 已有持久化业务 session，或 Lime legacy desktop facade 需要绑定现有 Agent session 时，可以传入稳定 `sessionId` / `threadId`。
3. 同一个 `sessionId` 重复 start 必须返回 `Session already exists`，不能覆盖已有 read model。
4. `sessionId` / `threadId` 仍是公共协议字段，不允许携带 Agent、legacy desktop command 或数据库私有类型。

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
2. Query Loop、legacy host listener 或未来 backend worker 产生的外部异步 runtime events，先追加到 `RuntimeCore` read model，再经 App Server outbound channel 写出同样的 notification。
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
4. 实验方法或字段必须在 `capabilities.experimentalApi` 下显式启用；stable schema 默认不包含 experimental surface。
5. TypeScript schema 和 Rust DTO 必须同源生成或由合同测试校验一致。
6. schema fixture 至少分 stable 与 experimental 两组；协议 DTO、TS client method catalog 和 schema fixture 不得漂移。
7. fixture 必须证明 wire 不要求 `"jsonrpc":"2.0"` header。

## 10. 协议验收

1. 每个方法都有 request / response fixture。
2. 每个 notification 都有 fixture。
3. fixture 字段使用 camelCase。
4. 初始化门禁有测试。
5. 错误码稳定，不能把 provider 原始错误直接暴露成协议 code。
6. contract guard 必须阻止 App Server current method 回流到 `lime-rs/src/commands/**` wrapper；涉及旧命令迁移时，旧 wrapper 只能撤注册并删除，删不动时登记 blocker。
