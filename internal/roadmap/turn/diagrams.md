# Turn / Tool 生命周期图纸集

> 状态：design-drafted
> 更新时间：2026-06-18
> 作用：用 Mermaid 图固定 turn、item、tool、event log、read model 和 UI projection 的目标结构。

## 1. 总体架构图

```mermaid
flowchart TB
    User[用户 / Agent App / Automation] --> Surface[Product Surface]
    Surface --> Gateway[Frontend Runtime Gateway]
    Gateway --> AppServer[App Server Runtime API]

    AppServer --> Control[Runtime Control Plane]
    Control --> Loop[Execution Loop]
    Loop --> Provider[Model Provider Adapter]
    Loop --> Tool[Tool Runtime Adapter]
    Loop --> Projector[TurnItem Projector]

    Provider --> Projector
    Tool --> Projector
    Projector --> ItemEvents[item.started / item.updated / item.completed]
    Projector -.compat.-> LegacyTool[tool.started / tool.result / tool.delta]

    ItemEvents --> EventLog[Event Log]
    LegacyTool --> EventLog
    EventLog --> ReadModel[ThreadReadModel]
    ReadModel --> AgentUI[AgentUI Projection]
    AgentUI --> Timeline[Workspace Message Timeline]
```

约束：`ItemEvents` 是 current，`LegacyTool` 是 compat，不允许反向覆盖 item state。

## 2. Submit Turn 流程图

```mermaid
flowchart TD
    A[用户提交输入] --> B[Frontend Gateway 构造 submit request]
    B --> C[App Server 接收 agentSession/turn/start]
    C --> D[创建或恢复 session/thread]
    D --> E[创建 turn]
    E --> F[emit turn_started]
    F --> G[emit item_started user_message]
    G --> H[进入 Execution Loop]
    H --> I{Provider 输出类型}
    I -- text delta --> J[active agent_message buffer]
    I -- reasoning / plan --> K[item_started/updated reasoning or plan]
    I -- tool call --> L[item_started tool_call]
    I -- final --> M[item_completed agent_message]
    L --> N[工具执行并更新同一 item]
    N --> H
    M --> O[emit turn_completed]
    O --> P[ThreadReadModel 更新]
    P --> Q[AgentUI 渲染]
```

## 3. ToolCall 生命周期状态图

```mermaid
stateDiagram-v2
    [*] --> Missing
    Missing --> Running: item_started(tool_call)
    Running --> Running: item_updated / tool_input_delta / tool_output_delta / tool_progress
    Running --> Completed: item_completed(success=true)
    Running --> Failed: item_completed(success=false)
    Running --> Interrupted: turn_canceled / turn_failed

    Missing --> SyntheticRunning: legacy tool_start without item
    SyntheticRunning --> SyntheticCompleted: legacy tool_end
    SyntheticRunning --> SyntheticFailed: legacy tool_failed

    Completed --> Completed: compatible duplicate ignored
    Failed --> Failed: compatible duplicate ignored
    Interrupted --> Interrupted: compatible duplicate ignored
```

## 4. item-first 与 legacy tool 归并图

```mermaid
flowchart LR
    E1[item_started tool_call id=tool-1] --> Index[Projection Index]
    E2[tool.started tool_id=tool-1] --> Index
    E3[tool.output.delta tool_id=tool-1] --> Index
    E4[item_completed tool_call id=tool-1] --> Index
    E5[tool.result tool_id=tool-1] --> Index

    Index --> Rule{已有 canonical item?}
    Rule -- 是 --> Merge[合并 delta/progress 到 item]
    Rule -- 否 --> Synthetic[创建 synthetic legacy item]
    Merge --> Card[唯一工具卡]
    Synthetic --> Card
```

## 5. Event Log 到 UI 数据流

```mermaid
flowchart TB
    Live[Live Runtime Events] --> Normalize[Event Normalizer]
    History[History Event Log] --> Normalize

    Normalize --> Dedupe[turn_id + item_id 去重]
    Dedupe --> Read[ThreadReadModel Builder]
    Read --> Snapshot[Session Snapshot]
    Snapshot --> Projection[AgentUI Projection]
    Projection --> Store[ConversationProjectionStore]
    Store --> ViewModel[Message Timeline ViewModel]
    ViewModel --> UI[Workspace UI]
```

核心约束：live 和 history 都进入同一 `Normalize -> Dedupe -> Read -> Projection` 路径。

## 6. 连续两轮对话状态图

```mermaid
stateDiagram-v2
    [*] --> Turn1Running
    Turn1Running --> Turn1Completed: turn_completed(turn-1)
    Turn1Completed --> Turn2Running: user submits next message
    Turn2Running --> Turn2Completed: turn_completed(turn-2)

    Turn1Completed --> Turn1Completed: hydrate history
    Turn2Running --> Turn2Running: live text/tool delta

    note right of Turn1Completed
      turn-1 items immutable
      不允许被 turn-2 live stream 截断
    end note
```

## 7. WebSearch / WebFetch 多工具流程

```mermaid
flowchart TD
    A[turn_started] --> B[item_started WebSearch]
    B --> C[tool_input_delta query]
    C --> D[item_completed WebSearch]
    D --> E{是否需要打开页面}
    E -- 是 --> F[item_started WebFetch]
    F --> G[tool_output_delta page content]
    G --> H[item_completed WebFetch]
    H --> I{证据是否足够}
    E -- 否 --> I
    I -- 不足 --> B2[item_started WebSearch/WebFetch next]
    B2 --> I
    I -- 足够 --> J[item_started agent_message]
    J --> K[text_delta_batch]
    K --> L[item_completed agent_message]
    L --> M[turn_completed]
```

WebSearch 策略可以影响“是否足够”，但不能影响工具卡归属。

## 8. 首字慢可见性流程

```mermaid
flowchart TD
    A[submit accepted] --> B[turn_started 可见]
    B --> C[runtime_status preparing 可见]
    C --> D{provider 是否已输出正文}
    D -- 否 --> E{是否有工具或 reasoning}
    E -- 有 --> F[item_started tool/reasoning 可见]
    E -- 无 --> G[保持真实 preparing/running，不假造文本]
    D -- 是 --> H[text_delta_batch 可见]
    F --> H
    G --> H
```

目标：用户看到真实状态，不看到假进度。

## 9. 迁移图

```mermaid
flowchart LR
    Old[legacy tool stream drives UI] --> P1[item lifecycle emitted everywhere]
    P1 --> P2[read model item-first]
    P2 --> P3[frontend projection item-first]
    P3 --> P4[legacy tool stream downgraded]
    P4 --> P5[guards block duplicate tool truth]
```

退出条件：P5 完成后，新增工具能力只允许接入 item lifecycle。

