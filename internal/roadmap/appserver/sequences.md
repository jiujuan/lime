# App Server 时序图

> 状态：current planning source
> 更新时间：2026-06-04
> 作用：固定 App Server 初始化、会话执行、工具审批、Tauri 替换和独立 App 复用的关键时序。

## 1. 独立 App 启动 App Server

```mermaid
sequenceDiagram
    participant App as 独立 App / Electron Main
    participant Proc as app-server 进程
    participant Rpc as JSON-RPC Router
    participant Runtime as RuntimeCore

    App->>Proc: spawn --stdio
    App->>Rpc: initialize(clientInfo, capabilities)
    Rpc-->>App: serverInfo, protocolVersion, capabilities
    App->>Rpc: initialized notification
    Rpc->>Runtime: prepare host context
    Runtime-->>Rpc: ready
```

## 2. 创建 Agent Session

```mermaid
sequenceDiagram
    participant UI as App Renderer
    participant Main as App Main Client
    participant Rpc as App Server
    participant Session as SessionService
    participant Store as Runtime Store

    UI->>Main: startAgentSession(businessObjectRef)
    Main->>Rpc: agentSession/start
    Rpc->>Session: start_session(appId, workspaceId, businessObjectRef)
    Session->>Store: create session/thread
    Store-->>Session: session facts
    Session-->>Rpc: AgentSession
    Rpc-->>Main: result.session
    Main-->>UI: session projection
```

## 3. 发起 Turn 并接收事件流

```mermaid
sequenceDiagram
    participant UI as App Renderer
    participant Main as App Main Client
    participant Rpc as App Server
    participant Turn as TurnExecutionService
    participant Core as RuntimeCore
    participant Backend as ExecutionBackend
    participant Outbound as OutboundChannel

    UI->>Main: send(input)
    Main->>Rpc: agentSession/turn/start
    Rpc->>Core: start_turn(sessionId, input, runtimeOptions)
    Core->>Turn: create turn/run facts
    Turn-->>Rpc: accepted turn
    Rpc-->>Main: turn accepted
    Turn-->>Rpc: turn.accepted event
    Rpc-->>Main: agentSession/event
    Turn->>Backend: execute turn
    Backend->>Core: external runtime event
    Core->>Outbound: append_external_runtime_events
    Outbound-->>Main: agentSession/event
    Backend->>Core: message.delta
    Core->>Outbound: append_external_runtime_events
    Outbound-->>Main: agentSession/event
    Backend->>Core: turn.completed / turn.failed
    Core->>Outbound: append_external_runtime_events
    Outbound-->>Main: agentSession/event
    Main-->>UI: update projection
```

## 4. 工具审批 / 人工确认

```mermaid
sequenceDiagram
    participant Core as RuntimeCore
    participant Backend as ExecutionBackend
    participant Policy as Policy / Permission
    participant Sink as EventSink
    participant Main as App Server Client
    participant UI as App UI
    participant Action as ActionService
    participant Tool as ToolRuntimeService

    Backend->>Policy: evaluate(toolRequest)
    Policy-->>Core: ask(actionId)
    Core->>Sink: action.required(actionId)
    Sink-->>Main: agentSession/event action.required
    Main-->>UI: show approval
    UI->>Main: approve / deny
    Main->>Action: agentSession/action/respond
    Action->>Sink: action.resolved
    alt approved
        Action->>Backend: continue approved action
        Backend->>Tool: execute
        Tool->>Sink: tool.started
        Tool->>Sink: tool.result
    else denied
        Action->>Sink: tool.failed denied
    end
```

## 5. 取消 Turn

```mermaid
sequenceDiagram
    participant UI as App UI
    participant Main as App Main Client
    participant Rpc as App Server
    participant Turn as TurnExecutionService
    participant Core as RuntimeCore
    participant Backend as ExecutionBackend
    participant Sink as EventSink

    UI->>Main: cancel(turnId)
    Main->>Rpc: agentSession/turn/cancel
    Rpc->>Core: cancel_turn(sessionId, turnId)
    Core->>Backend: cancel token
    Backend->>Sink: turn.canceled
    Sink-->>Main: agentSession/event
    Rpc-->>Main: result {}
    Main-->>UI: stopped projection
```

## 6. Lime Desktop 迁移期时序

```mermaid
sequenceDiagram
    participant FE as Lime Frontend
    participant Cmd as Tauri Command Adapter
    participant Service as RuntimeCore
    participant Backend as AsterBackend
    participant Sink as TauriEventSink

    FE->>Cmd: safeInvoke(agent_runtime_submit_turn)
    Cmd->>Service: start_turn(mapped params, TauriEventSink)
    Service-->>Cmd: accepted turn
    Cmd-->>FE: existing response shape
    Service->>Backend: execute turn
    Backend->>Sink: runtime events
    Sink-->>FE: existing GUI events
```

目标：前端合同不先大改，command 内部逐步退回 adapter。

## 7. content-studio 复用时序

```mermaid
sequenceDiagram
    participant Renderer as content-studio Renderer
    participant Preload as Preload IPC
    participant Main as Electron Main
    participant Client as AppServerClient
    participant Server as App Server
    participant Core as RuntimeCore
    participant Backend as ExecutionBackend

    Renderer->>Preload: request agent run
    Preload->>Main: ipc start/run
    Main->>Client: ensure server
    Client->>Server: initialize if needed
    Main->>Client: start session with businessObjectRef
    Client->>Server: agentSession/start
    Renderer->>Preload: send user input
    Preload->>Main: ipc send
    Main->>Client: turn/start
    Client->>Server: agentSession/turn/start
    Server->>Core: execute
    Core->>Backend: dispatch
    Backend-->>Server: standard events
    Server-->>Client: agentSession/event
    Client-->>Main: event emitter
    Main-->>Preload: ipc event
    Preload-->>Renderer: projection update
```

## 8. 多 App 共享 Server

```mermaid
sequenceDiagram
    participant A as App A
    participant B as App B
    participant Server as App Server
    participant Runtime as Runtime Services

    A->>Server: initialize(clientInfo A)
    B->>Server: initialize(clientInfo B)
    A->>Server: agentSession/start(appId A)
    B->>Server: agentSession/start(appId B)
    Server->>Runtime: create isolated sessions
    Runtime-->>Server: event session A
    Server-->>A: agentSession/event A
    Runtime-->>Server: event session B
    Server-->>B: agentSession/event B
```

要求：事件订阅、session 可见性、capability 权限必须按 client / app 隔离。

## 9. Evidence 导出

```mermaid
sequenceDiagram
    participant App as App Client
    participant Rpc as App Server
    participant Evidence as EvidenceService
    participant Runtime as Runtime Facts
    participant Artifact as ArtifactService

    App->>Rpc: evidence/export(sessionId, scope)
    Rpc->>Evidence: export_evidence
    Evidence->>Runtime: read timeline / snapshots
    Evidence->>Artifact: resolve artifact refs
    Evidence-->>Rpc: evidence pack ref / summary
    Rpc-->>App: result
    Rpc-->>App: agentSession/event evidence.changed
```
