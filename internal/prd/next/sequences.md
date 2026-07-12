# Lime Next 时序图

> 状态：north-star planning source
> 更新时间：2026-06-07

## 1. 本地 App Server 初始化

```mermaid
sequenceDiagram
    participant Shell as Product Shell
    participant Client as AppServerClient
    participant Server as Local App Server
    participant Policy as Permission Control
    participant Core as RuntimeCore

    Shell->>Client: ensureConnection(clientInfo)
    Client->>Server: initialize(clientInfo, capabilities)
    Server-->>Client: serverInfo, protocolVersion, capabilities
    Client->>Server: initialized notification
    Server->>Policy: resolve default permission profile
    Policy-->>Server: local sandbox policy
    Server->>Core: prepare host context + permission profile
    Core-->>Server: ready
    Client-->>Shell: connection ready
```

## 2. Remote Runtime Gateway 初始化

```mermaid
sequenceDiagram
    participant Thin as Mobile / Mini Program / Web
    participant Gateway as Remote Runtime Gateway
    participant Auth as Auth / Tenant Policy
    participant Policy as Sandbox / Capability Policy
    participant Control as Server Mode Control Plane
    participant Core as RuntimeCore

    Thin->>Gateway: open session(token, appId, deviceInfo)
    Gateway->>Auth: validate identity / tenant / app policy
    Auth-->>Gateway: scoped principal / capability policy
    Gateway->>Policy: resolve sandbox profile
    Policy-->>Gateway: tenant / app scoped profile
    Gateway->>Control: create client context
    Control->>Core: prepare runtime host context + sandbox profile
    Core-->>Control: ready
    Gateway-->>Thin: protocolVersion, capabilities, subscription options
```

## 3. Claw 发起 Turn

```mermaid
sequenceDiagram
    participant UI as Claw UI
    participant Adapter as Claw Shell Adapter
    participant Host as Electron Desktop Host Bridge
    participant Server as Local App Server
    participant Policy as Permission Control
    participant Core as RuntimeCore
    participant Sandbox as Sandbox Manager
    participant Backend as RuntimeBackend
    participant Projection as Headless Projection

    UI->>Adapter: submit(input, workspace, model)
    Adapter->>Host: app_server_handle_json_lines(agentSession/turn/start)
    Host->>Server: JSON-RPC request
    Server->>Policy: resolve PermissionProfile(cwd, workspace, turn options)
    Policy-->>Server: active profile + approval policy
    Server->>Core: start_turn(sessionId, input, runtimeOptions, activeProfile)
    Core-->>Server: accepted turn
    Server-->>Host: result + agentSession/event
    Host-->>Adapter: JSON-RPC response / events
    Adapter->>Projection: apply events
    Projection-->>UI: view model update
    Core->>Sandbox: create local sandbox attempt
    Sandbox->>Backend: execute turn in local sandbox
    Backend-->>Core: message.delta / tool / action / artifact / terminal events
    Core-->>Server: agentSession/event
    Server-->>Host: notification
    Host-->>Adapter: event
    Adapter->>Projection: apply event / refresh read model
    Projection-->>UI: timeline update
```

## 4. Plugin 对话 Turn

```mermaid
sequenceDiagram
    participant App as Plugin UI
    participant Runtime as Plugin Runtime Facade
    participant Client as AppServerClient
    participant Server as App Server
    participant Policy as Permission Control
    participant Core as RuntimeCore
    participant Sandbox as Sandbox Manager
    participant Backend as ExecutionBackend

    App->>Runtime: startTask(taskInput, businessObjectRef)
    Runtime->>Client: agentSession/start(appId, businessObjectRef)
    Client->>Server: agentSession/start
    Server-->>Client: session
    Runtime->>Client: agentSession/turn/start(runtimeRequest)
    Client->>Server: turn/start
    Server->>Policy: resolve permission profile
    Policy-->>Server: active profile
    Server->>Core: start_turn(active profile)
    Core->>Sandbox: create sandbox attempt
    Sandbox->>Backend: execute
    Backend-->>Core: RuntimeEvent
    Core-->>Server: agentSession/event
    Server-->>Client: notification
    Client-->>Runtime: event
    Runtime-->>App: projection update
```

要求：Plugin UI runtime start/status/stop 只负责 UI 子进程生命周期，不承接对话 runtime。对话必须进入 `agentSession/* -> RuntimeCore -> ExecutionBackend`。

## 5. content-studio 业务对象绑定

```mermaid
sequenceDiagram
    participant Renderer as content-studio Renderer
    participant Preload as Preload IPC
    participant Main as Electron Main
    participant Client as AppServerClient
    participant Server as App Server
    participant Policy as Permission Control
    participant Sandbox as Sandbox Manager
    participant Core as RuntimeCore
    participant Backend as ExecutionBackend
    participant Projection as AgentRuntime Projection

    Renderer->>Preload: start agent for draft/material
    Preload->>Main: ipc startAgentSession
    Main->>Client: ensure sidecar
    Client->>Server: initialize if needed
    Main->>Client: agentSession/start(businessObjectRef)
    Client->>Server: agentSession/start
    Server-->>Client: session
    Main-->>Preload: session projection
    Preload-->>Renderer: session ready
    Renderer->>Preload: send input
    Preload->>Main: ipc startTurn
    Main->>Client: agentSession/turn/start
    Client->>Server: turn/start
    Server->>Policy: resolve local permission profile
    Policy-->>Server: active profile
    Server->>Sandbox: create local sandbox attempt
    Sandbox->>Core: start_turn(active profile)
    Core->>Backend: execute in local sandbox
    Backend-->>Core: RuntimeEvent
    Core-->>Server: agentSession/event
    Server-->>Client: events
    Client-->>Main: notification stream
    Main->>Projection: apply events/read model
    Main-->>Preload: renderer-safe projection
    Preload-->>Renderer: update business UI
```

## 6. 移动 App 审批 Action

```mermaid
sequenceDiagram
    participant Worker as Runtime Worker
    participant Core as RuntimeCore
    participant Policy as Approval / Permission Policy
    participant Gateway as Remote Runtime Gateway
    participant Push as Push Service
    participant Mobile as Mobile App
    participant Projection as Mobile Projection

    Worker->>Core: action.required(actionId, scope)
    Core-->>Gateway: agentSession/event action.required
    Gateway->>Push: send notification(actionId)
    Push-->>Mobile: push action pending
    Mobile->>Gateway: read session projection
    Gateway-->>Mobile: pending action view model
    Mobile->>Projection: render approval screen
    Mobile->>Gateway: agentSession/action/respond(actionId, approve)
    Gateway->>Policy: verify principal / approval scope
    Policy->>Core: respond_action(scoped principal)
    Core-->>Gateway: action.resolved
    Gateway-->>Mobile: updated projection
```

## 7. 微信小程序触发预定义 Capability

```mermaid
sequenceDiagram
    participant Mini as WeChat Mini Program
    participant Gateway as Remote Runtime Gateway
    participant Auth as WeChat / Lime Account Binding
    participant Policy as Capability Policy
    participant Sandbox as Sandbox Policy
    participant Queue as Server Mode Queue
    participant Core as RuntimeCore

    Mini->>Gateway: login(openId / code)
    Gateway->>Auth: bind OpenID / tenant / user
    Auth-->>Gateway: scoped principal
    Mini->>Gateway: capability/list(appId, scene)
    Gateway->>Policy: filter mini-program capabilities
    Policy-->>Gateway: allowed capability descriptors
    Gateway->>Sandbox: resolve tenant sandbox profile
    Sandbox-->>Gateway: sandbox profile id
    Gateway-->>Mini: capabilities
    Mini->>Gateway: start predefined task(capabilityId, input)
    Gateway->>Queue: enqueue turn
    Queue->>Core: agentSession/start + turn/start semantics
    Core-->>Gateway: accepted + event stream handle
    Gateway-->>Mini: task accepted / polling token
```

要求：微信小程序只通过 HTTPS Remote Runtime Gateway 调用，不直连本地 sidecar，不持有 provider secret，不自建 runtime。

## 8. 服务端长任务与多端订阅

```mermaid
sequenceDiagram
    participant Entry as Remote Entry / Webhook / Channel
    participant Gateway as Remote Runtime Gateway
    participant Auth as Auth / Tenant / Policy
    participant Secret as Secret Manager / KMS
    participant Redis as Redis / Cache
    participant DB as Postgres / Event Store
    participant Queue as Server Mode Queue
    participant Carrier as Worker Carrier
    participant Sandbox as Sandbox Manager
    participant Worker as Runtime Worker
    participant Core as RuntimeCore
    participant S3 as S3 / OSS
    participant OTel as OpenTelemetry / Audit
    participant Clients as Claw / Mobile / Mini Program / Web

    Entry->>Gateway: submit long task
    Gateway->>Auth: validate token / tenant / capability
    Auth-->>Gateway: scoped principal
    Gateway->>Secret: resolve secret refs
    Secret-->>Gateway: scoped credential handles
    Gateway->>DB: create session / turn record
    Gateway->>Queue: enqueue(sessionId, capabilityId, input)
    Queue->>Redis: update queue state / backpressure
    Queue->>Carrier: schedule worker job
    Carrier->>Worker: start worker carrier
    Worker->>Sandbox: create tenant-scoped sandbox attempt
    Sandbox->>Core: start_turn
    Core-->>DB: turn.accepted / turn.started
    Core-->>OTel: trace / audit event
    DB-->>Clients: event delivery / push / polling
    Worker->>Sandbox: tool / artifact / evidence attempt
    Sandbox->>Core: sandboxed runtime events
    Core->>S3: write artifact / evidence objects
    Core-->>DB: append event refs / summaries
    Core-->>OTel: metrics / logs / traces
    DB-->>Clients: projection updates
    Worker->>Core: terminal event
    Core-->>DB: final runtime facts
    DB-->>Clients: completed / failed / canceled
```

## 9. UI Projection 更新

```mermaid
sequenceDiagram
    participant Events as agentSession/event
    participant Read as agentSession/read
    participant Projection as Headless Projection
    participant Primitive as UI / Native / Mini Program Primitive
    participant Shell as Product Shell

    Events->>Projection: apply runtime event
    alt event requires full read model
        Projection->>Read: request refresh
        Read-->>Projection: AgentSessionReadResponse
    end
    Projection-->>Primitive: AgentRuntimeViewModel
    Primitive-->>Shell: render callbacks / pending actions
    Shell->>Events: action/respond or cancel through adapter
```

## 10. Artifact / Evidence

```mermaid
sequenceDiagram
    participant Backend as ExecutionBackend
    participant Artifact as ArtifactService
    participant Evidence as EvidenceService
    participant Server as App Server / Gateway
    participant Shell as Product Shell
    participant Projection as Headless Projection

    Backend->>Artifact: write artifact refs / summaries
    Artifact-->>Server: agentSession/event artifact.changed
    Server-->>Shell: notification / push / polling update
    Shell->>Projection: apply artifact event
    Projection-->>Shell: artifact preview view model
    Shell->>Server: artifact/read(includeContent)
    Server-->>Shell: content / contentStatus
    Shell->>Server: evidence/export(sessionId)
    Server->>Evidence: export from runtime facts
    Evidence-->>Server: evidence summary/ref
    Server-->>Shell: result + evidence.changed
```
