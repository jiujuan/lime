# Lime AgentRuntime Profile 图纸集

> 状态：proposal
> 更新时间：2026-05-11
> 作用：用图固定 AgentRuntime Profile 在 Lime 中的架构、主流程、时序和证据链路。

## 1. 总体架构图

```mermaid
flowchart TB
    User[用户 / 自动化 / 子代理] --> FE[Product Input / Workspace]
    FE --> CP[Runtime Control Plane]

    CP --> Queue[Queue / Resume / Interrupt]
    CP --> Loop[Execution Loop]

    Loop --> Model[Model Provider Adapter]
    Loop --> Tool[Tool / Process Adapter]
    Loop --> Policy[Policy / Permission / Sandbox]
    Loop --> Context[Context / Memory Resolver]
    Loop --> Subagent[Subagent / Job Coordinator]

    Model --> Events[RuntimeEvent Stream]
    Tool --> Events
    Policy --> Events
    Context --> Events
    Subagent --> Events
    Loop --> Events

    Events --> Store[Durable Event Log]
    Store --> Read[ThreadReadModel / TaskSnapshot]
    Store --> Evidence[EvidencePack / Replay / Review]
    Read --> UI[Workspace / Harness / Dashboard]
    Evidence --> UI
```

## 2. 相邻标准协同图

```mermaid
flowchart LR
    Context[AgentContext\ncontext envelope / refs] -->|context.* refs| Runtime[AgentRuntime\nexecution facts]
    Policy[AgentPolicy\npolicy decision / grants] -->|permission.* / action.* refs| Runtime
    Runtime -->|runtime timeline / snapshots| Evidence[AgentEvidence\nevidence pack / replay / review]
    Runtime -->|ThreadReadModel / TaskSnapshot| UI[AgentUI\nprojection only]
    Evidence -->|EvidenceSummary / refs| UI
    Artifact[AgentArtifact\nbytes / versions] -->|artifact.changed refs| Runtime
    Tool[AgentTool\nschema / result contract] -->|tool.* facts| Runtime

    UI -.controlled actions.-> Runtime
    UI -.export/review actions.-> Evidence
    UI -.approval response.-> Policy
```

约束：Context、Policy、Evidence、Artifact、Tool 都是 owner 系统；AgentRuntime 只记录 execution facts 与 owner refs；AgentUI 不拥有执行真相。

## 3. 主链流程图

```mermaid
flowchart TD
    A[用户提交输入] --> B[agent_runtime_submit_turn]
    B --> C[生成 session/thread/turn ids]
    C --> D[构建 input snapshot]
    D --> E[解析 TaskProfile / CandidateModelSet / RoutingDecision]
    E --> F[发出 turn.submitted / routing.* events]
    F --> G[进入 Execution Loop]
    G --> H{模型是否请求工具或审批?}

    H -- 普通输出 --> I[model.delta / model.completed]
    H -- 工具调用 --> J[tool.started / permission.evaluated]
    H -- 需要审批 --> K[action.required]

    K --> L[respond_action]
    L --> J
    J --> M[tool.result 或 tool.failed]
    M --> G

    I --> N[turn.completed 或 turn.failed]
    N --> O[snapshot.updated]
    O --> P[ThreadReadModel]
    P --> Q[agent_runtime_export_evidence_pack]
    Q --> R[Replay / Review / UI projection]
```

## 4. Submit Turn 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant FE as Workspace
    participant API as agent_runtime_submit_turn
    participant RT as Runtime Control Plane
    participant Loop as Execution Loop
    participant Read as ThreadReadModel
    participant UI as GUI Projection

    U->>FE: 输入任务
    FE->>API: submit_turn(input, metadata)
    API->>RT: 创建 session/thread/turn ids
    RT-->>FE: accepted / queued
    RT->>Loop: start turn
    Loop-->>Read: turn.submitted / turn.started
    Read-->>UI: preparing / running
    Loop-->>Read: turn.completed / turn.failed
    Read-->>UI: last outcome / incidents
```

## 5. Tool Approval 时序图

```mermaid
sequenceDiagram
    participant Loop as Execution Loop
    participant Policy as Permission / Policy
    participant UI as Workspace Approval UI
    participant Tool as Tool Runtime
    participant Read as ThreadReadModel

    Loop->>Policy: evaluate tool call
    Policy-->>Loop: ask required
    Loop-->>Read: permission.evaluated
    Loop-->>Read: action.required(actionId)
    Read-->>UI: pending action
    UI->>Loop: respond_action(actionId, approve/deny)
    Loop-->>Read: action.resolved
    alt approved
        Loop->>Tool: execute tool
        Tool-->>Read: tool.result
    else denied
        Loop-->>Read: tool.failed / denied
    end
```

## 6. Evidence Export 时序图

```mermaid
sequenceDiagram
    participant Runtime as Runtime Facts
    participant Read as ThreadReadModel
    participant Export as agent_runtime_export_evidence_pack
    participant Replay as Replay Export
    participant Review as Review Template
    participant UI as Harness UI

    Runtime-->>Read: runtime events + snapshots
    Read->>Export: export_evidence(scope)
    Export-->>Export: build timeline / artifacts / outcomes
    Export-->>Replay: replay refs
    Export-->>Review: review refs
    Export-->>UI: evidence summary
    UI-->>UI: display same facts, no reassembly
```

## 7. Task Retry 流程图

```mermaid
flowchart TD
    A[task.created] --> B[task.attempt.started run_1]
    B --> C{attempt 结果}
    C -- failed --> D[task.attempt.failed]
    D --> E{是否可重试}
    E -- 是 --> F[task.retrying]
    F --> G[task.attempt.started run_2]
    G --> H[task.completed]
    E -- 否 --> I[task.failed]

    D --> J[TaskSnapshot 保留 run_1]
    G --> K[TaskSnapshot currentRunId = run_2]
    H --> L[EvidencePack 记录两次 attempt]
```

## 8. 模型路由单候选流程图

```mermaid
flowchart TD
    A[TaskProfile] --> B[Candidate Resolution]
    B --> C{candidate_count}
    C -- 0 --> D[routing.not_possible]
    C -- 1 --> E[routing.single_candidate]
    C -- N --> F[routing.decided]

    E --> G[记录 selectedModel / decisionSource]
    G --> H[记录 cost.estimated / limit.changed]
    H --> I[ThreadReadModel.routingLimitSummary]
    I --> J[GUI 展示单候选解释]
```

## 9. Remote / Subagent 恢复图

```mermaid
flowchart TD
    A[parent turn] --> B[subagent.spawned]
    B --> C[channel.connected]
    C --> D[subagent.status running]
    D --> E{通道是否断开}
    E -- 否 --> F[subagent.completed]
    E -- 是 --> G[channel.disconnected]
    G --> H[reconnect_channel]
    H --> I{是否可 replay}
    I -- 是 --> J[channel.resumed]
    I -- 否 --> K[snapshot.repaired + stale]
    J --> F
    K --> L[ThreadReadModel 标记 degraded]
```

## 10. UI 只读投影图

```mermaid
flowchart LR
    Events[RuntimeEvent Stream] --> Read[ThreadReadModel]
    Events --> Task[TaskSnapshot]
    Events --> Evidence[EvidencePack]

    Read --> Workspace[Workspace 状态卡]
    Task --> TaskCenter[Task Center]
    Evidence --> Harness[Harness / Review / Replay]

    Workspace -.禁止写事实.-> Events
    TaskCenter -.禁止写事实.-> Events
    Harness -.禁止重建事实.-> Events
```

## 11. 图纸使用规则

1. 所有图都表达 current 主链，不表达理想化全量标准。
2. 图中每个事实节点都必须能映射到 Lime runtime、read model、evidence 或 GUI 消费层。
3. 后续实现改变主链时，先更新本图，再更新散文说明。
