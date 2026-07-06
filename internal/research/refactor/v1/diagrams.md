# 图纸：Codex 主原点 + opencode 多模型/多模态参照到 Lime current 主链

> 状态：current research baseline
> 更新时间：2026-07-05
> Lime current-state 基线：[lime-current-state.md](./lime-current-state.md)

## 1. 总体架构图

本文件画的是参考源到目标主链的图纸。Lime 当前真实架构、现有主链和缺口图见 [lime-current-state.md](./lime-current-state.md)，不要用本文件替代现状判断。

```mermaid
flowchart TB
    subgraph Codex[Codex 原点 /Users/coso/Documents/dev/rust/codex]
        CPrimitive[Thread / Turn / ThreadItem 原语]
        CThreadData[protocol/v2/thread_data.rs]
        CItem[protocol/v2/item.rs]
        CTurn[protocol/v2/turn.rs]
        CProto[protocol-first / method registry]
        CScope[ClientRequestSerializationScope]
        CServer[app-server]
        CClient[app-server-client]
        CCore[core session / tasks runtime]
        CEvent[event_mapping / thread_history]
        CTool[tools / approval / sandbox]
        CContext[context / compaction]
        CPlugin[plugin / skills / MCP]
        CTui[tui app_server_session / chatwidget]
        CState[state / rollout / thread-store / trace]
        CQuality[app-server-test-client / schema fixtures]
    end

    subgraph OpenCode[opencode 限定参照 /Users/coso/Documents/dev/js/opencode]
        OLLM[packages/llm schema/events/options]
        OProvider[specs/v2 provider-model]
        OLowering[packages/llm protocols]
        OReject[不参考 Session / Tool / UI / Protocol / Effect]
    end

    subgraph Lime[Lime current 主链]
        LGui[React GUI]
        LApi[src/lib/api/*]
        LHost[Electron Desktop Host bridge]
        LProto[app-server-protocol v0]
        LScope[method registry / serialization scope]
        LServer[App Server JSON-RPC]
        LPrimitive[agentSession / turn / item projection]
        LRuntime[RuntimeCore / agent / services]
        LEvent[event materialization / projection selectors]
        LModel[Provider / Model capability / LLM lowering]
        LRead[Projection Store / Evidence / Read Model / Trace]
        LUI[Agent UI projection]
        LQuality[contracts / runtime fixture / GUI smoke]
    end

    Reject[reject-for-lime / no backlog]

    CThreadData --> CPrimitive
    CItem --> CPrimitive
    CTurn --> CPrimitive
    CPrimitive -->|Agent 原语第一映射| LPrimitive
    CProto -->|协议生成和 method catalog| LProto
    CScope -->|请求串行范围| LScope
    CServer -->|processor/domain 分层| LServer
    CClient -->|typed request client| LApi
    CCore -->|session/task/runtime 生命周期| LRuntime
    CEvent -->|event materialization| LEvent
    CTool -->|tool/approval/sandbox 控制面| LRuntime
    CContext -->|bounded context / compaction| LRuntime
    CPlugin -->|manifest / skill / MCP 能力分层| LRuntime
    CTui -->|UI facade 和渲染分层参考| LGui
    CState -->|replay/state/trace 思路| LRead
    CQuality -->|fixture/schema 防漂移| LQuality
    OLLM -->|provider-neutral ContentPart / LLMEvent| LModel
    OProvider -->|capability / variant / cost / limit| LModel
    OLowering -->|provider-specific lowering 参考| LModel
    OReject -.->|默认拒绝| Reject

    LGui --> LApi --> LHost --> LServer --> LScope --> LPrimitive --> LRuntime --> LEvent --> LModel --> LRead --> LUI
    LProto --> LScope
    LQuality --> LProto
    LQuality --> LRuntime
    LQuality --> LUI
    LProto --> LApi
```

固定规则：

1. Codex 的第一参考不是 UI，也不是 crate 目录，而是 `Thread -> Turn -> Item`；Codex Rust 类型名是 `ThreadItem`。
2. App Server、protocol、typed client、TUI facade、state/rollout 都围绕这组三元原语服务。
3. Lime 现有 `agentSession` 是协议现状名；新设计使用 `Thread`，语义必须同构到 `Thread -> Turn -> Item`。
4. Agent 改动进入工程前，先按 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 填 Thread、Turn、Item 归属。

## 2. Codex 核心体系分层图

```mermaid
flowchart TB
    Primitive[Thread / Turn / ThreadItem]
    Protocol[Protocol-first method registry / schema / typed client]
    Scope[Request serialization scope]
    Server[App Server processor]
    Runtime[Core session / tasks runtime]
    Materialize[Event materialization]
    Tool[Tool / Approval / Sandbox]
    Context[Context fragments / Compaction]
    State[Rollout / State / Thread history / Trace]
    Plugin[Plugin / Skills / MCP]
    Facade[TUI typed facade / Projection]
    Fixture[Schema / Fixture / Integration validation]

    Primitive --> Protocol
    Protocol --> Scope
    Scope --> Server
    Server --> Runtime
    Runtime --> Materialize
    Runtime --> Tool
    Runtime --> Context
    Materialize --> State
    Plugin --> Context
    Plugin --> Tool
    Materialize --> Facade
    State --> Facade
    Fixture --> Protocol
    Fixture --> Runtime
    Fixture --> Facade
```

固定规则：

1. `Thread / Turn / ThreadItem` 是第一原语，但不是唯一核心。
2. Protocol-first、serialization scope、runtime、event materialization、tool/context/state/plugin/fixture 必须成组看。
3. Lime 对齐时先找核心层，再找 Lime current owner。

## 3. Codex 原语映射图

```mermaid
flowchart LR
    CThread[Codex Thread] -->|长期会话 / session tree / fork / sub-agent| LSession[Lime agentSession]
    CTurn[Codex Turn] -->|一次执行边界 / start / steer / interrupt / terminal| LTurn[Lime turn execution]
    CItem[Codex ThreadItem] -->|可持久化 / 可更新 / 可投影语义单元| LItem[Lime RuntimeEvent / ContentPart / TimelineItem]

    LSession --> LRead[SessionDetail / ProjectionStore]
    LTurn --> LStream[Active stream controller]
    LItem --> LUI[MessageList / Timeline / Workbench]
    LRead --> LEvidence[Evidence / Replay]
```

固定规则：

1. 每个 Agent 事件先定位到 session/thread，再定位 turn，再定位 item。
2. UI 不根据正文文本猜 lifecycle；UI 只消费 item projection。
3. Evidence / Replay 消费 Lime current read model，不消费 Codex 原始 rollout。

## 4. 新增 JSON-RPC method 时序图

```mermaid
sequenceDiagram
    participant Dev as 开发者
    participant CP as Codex protocol 原点
    participant LP as Lime app-server-protocol
    participant AS as Lime App Server
    participant Client as packages/app-server-client
    participant API as src/lib/api/*
    participant UI as React GUI
    participant Guard as test:contracts

    Dev->>CP: 查找 Codex method / domain 类型
    Dev->>LP: 在 v0 domain 类型和 method registry 定义 params/response/scope
    LP->>AS: processor domain 接线
    AS->>AS: RuntimeCore / service 实现
    LP->>Client: 生成 TS / client 类型
    Client->>API: domain gateway 暴露 typed function
    API->>UI: 组件 / hook 只调用 API gateway
    Dev->>Guard: npm run test:contracts
    Guard-->>Dev: 协议、client、command catalog、mock boundary 一致
```

## 5. Agent turn streaming 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as React GUI
    participant API as Agent Runtime API
    participant AS as App Server JSON-RPC
    participant RT as RuntimeCore / agent
    participant Map as Event Materialization
    participant Tool as Tool Runtime
    participant Store as Projection Store

    U->>UI: 输入消息
    UI->>API: startTurn(request)
    API->>AS: agentSession/turn/start
    AS->>RT: 创建 turn
    RT-->>Map: message.delta / reasoning.started
    RT->>Tool: tool.started / command.started
    Tool-->>RT: tool.result / command.exited
    RT-->>Map: reasoning.completed / tool.completed
    RT-->>Map: turn.completed 或 turn.failed
    Map-->>Store: ThreadItem / RuntimeEvent / TimelineItem
    Store-->>UI: read model / streaming event
    UI->>UI: 按 turnId / itemId / sequence 投影
```

固定规则：

1. UI 不用自然语言正文判断终态。
2. `turn.completed` 是结构化终态，不用 timeout 合成。
3. stale terminal event 不能误停新的 active stream。

## 6. 前端 timeline projection 流程图

```mermaid
flowchart TD
    Event[Runtime event / read model item] --> Normalize[normalize by sessionId / turnId / itemId / sequence]
    Normalize --> Classify{event kind}

    Classify -->|message| MessagePart[ContentPart.message]
    Classify -->|media| MediaPart[ContentPart.media]
    Classify -->|reasoning| ReasoningPart[ContentPart.reasoning]
    Classify -->|tool / command| ToolPart[ContentPart.process]
    Classify -->|artifact| ArtifactPart[ContentPart.artifact]
    Classify -->|approval| ApprovalPart[ContentPart.action]
    Classify -->|failure| FailurePart[ContentPart.failure]

    MessagePart --> Timeline[TimelineItem[]]
    MediaPart --> Timeline
    ReasoningPart --> Timeline
    ToolPart --> Timeline
    ArtifactPart --> Timeline
    ApprovalPart --> Timeline
    FailurePart --> Timeline

    Timeline --> MessageList[MessageList]
    Timeline --> AgentThreadTimeline[AgentThreadTimeline]
    Timeline --> Workspace[AgentChatWorkspace]
    Timeline --> Workbench[Canvas / Artifact Workbench]
```

## 7. 多模型 / 多模态能力矩阵流程图

```mermaid
flowchart TD
    Provider[Provider config] --> Model[Model catalog]
    Model --> Capability[Capability matrix]

    Capability --> InputGate[UI input gate]
    Capability --> RequestAssembly[Runtime request assembly]
    Capability --> OutputProjection[Output projection]

    InputGate --> Attachments[text / image / audio / video / document]
    RequestAssembly --> Lowering[Provider-specific lowering]
    Lowering --> LLM[LLM stream]
    LLM --> Events[Provider-neutral LLM events]
    Events --> OutputProjection
    OutputProjection --> AgentUI[Agent UI / Workbench]
```

固定规则：

1. UI 根据 capability 决定附件、工具和输出模式。
2. provider-specific body 只在 lowering 层生成。

## 8. Codex import 主链流程图

```mermaid
flowchart LR
    CodexState[Codex state_*.sqlite] --> Scan[conversationImport/source/scan]
    Rollout[Codex rollout JSONL] --> Preview[conversationImport/thread/preview]
    Scan --> Preview
    Preview --> Commit[conversationImport/thread/commit]
    Commit --> Canonical[Canonical import bundle]
    Canonical --> RuntimeEvents[Lime AgentRuntimeEvents]
    RuntimeEvents --> ReadModel[SessionDetail / ProjectionStore]
    ReadModel --> UI[Agent UI projection]
    ReadModel --> Evidence[evidence/export]
    ReadModel --> Replay[replay]
    ReadModel --> Trace[requestTelemetry / trace summary]
```

固定规则：

1. Codex 原始文件只读。
2. 不写回 Codex。
3. 不把 rollout JSONL 当 Lime runtime truth。
4. 导入结果进入 Lime current read model。

## 9. 上游 diff 进入 Lime backlog 流程图

```mermaid
flowchart TD
    Pull[更新本地 Codex / opencode allowlist 路径] --> Diff[比较上次记录 commit]
    Diff --> Filter{Codex 高价值路径或 opencode 多模型/多模态 allowlist?}
    Filter -->|否| Ignore[记录为无行动]
    Filter -->|是| Classify{分类}

    Classify --> Adopt[adopt-now]
    Classify --> Adapt[adapt-for-desktop]
    Classify --> Watch[watch]
    Classify --> Reject[reject-for-lime]

    Adopt --> Owner[绑定 Lime current owner]
    Adapt --> DesktopBoundary[定义桌面化边界]
    Watch --> Trigger[记录触发条件]
    Reject --> Guard[记录拒绝原因]

    Owner --> Plan[进入 roadmap / exec-plan]
    DesktopBoundary --> Plan
    Plan --> Verify[绑定验证命令]
```

固定规则：

1. Codex diff 按 app-server / protocol / turn / tool / context / state / TUI facade 等高价值路径过滤。
2. opencode diff 只看 `specs/v2/provider-model.md`、`packages/llm/src/schema/*`、`packages/llm/src/protocols/*`、`packages/core/src/provider.ts`、`packages/core/src/model.ts`。
3. opencode Session、Tool、UI、protocol generated client、Effect / Bun runtime 变化不进入 Lime backlog，最多记录为 `reject-for-lime`。

## 10. 模块推进流程图

```mermaid
flowchart TD
    Module[选择一个模块] --> CodexPath[读取 Codex 原点路径]
    CodexPath --> LimeOwner[确认 Lime current owner]
    LimeOwner --> Gap[列差距]
    Gap --> FirstCut[定义第一刀]
    FirstCut --> Guard[确认守卫和验证]
    Guard --> Implement[后续实施]
    Implement --> Evidence[写回执行计划和证据]
```
