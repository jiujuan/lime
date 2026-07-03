# Workflow 图集

> 状态：current planning source
> 更新时间：2026-07-03
> 作用：集中放置 Workflow 标准化相关的架构图、流程图和时序图。

## 1. 总体架构图

```mermaid
flowchart LR
  User[用户输入 / 插件入口 / 图片需求]
  Surface[Surface Adapter]
  Definition[Workflow Definition]
  Runtime[App Server RuntimeCore]
  Events[workflow.* RuntimeEvent]
  Store[Event Log / Durable Store]
  ReadModel[Workflow Read Model]
  Evidence[Evidence / Replay]
  UI[Workspace / Plugin UI / Run Detail]

  User --> Surface
  Surface --> Definition
  Surface --> Runtime
  Definition --> Runtime
  Runtime --> Events
  Events --> Store
  Store --> ReadModel
  Store --> Evidence
  ReadModel --> UI
  Evidence --> UI
```

## 2. Definition 到 Run 流程图

```mermaid
flowchart TD
  A[读取 definition source] --> B{来源类型}
  B -->|Plugin manifest| C[解析 workflows steps]
  B -->|Skill metadata| D[解析 workflow_steps]
  B -->|Builtin image/content| E[读取内置 definition]
  C --> F[转换为 WorkflowDefinition]
  D --> F
  E --> F
  F --> G{schema 合法?}
  G -->|否| H[返回 definition invalid]
  G -->|是| I[创建 WorkflowRun]
  I --> J[发出 workflow.run.started]
  J --> K[调度第一批 runnable steps]
```

## 3. 用户启动内容 workflow 时序图

```mermaid
sequenceDiagram
  participant User as 用户
  participant UI as Workspace UI
  participant Gateway as Frontend Gateway
  participant Server as App Server
  participant Runtime as RuntimeCore
  participant Store as Event Log
  participant Read as Workflow Read Model

  User->>UI: 输入“写一篇带封面的文章”
  UI->>Gateway: 提交 surface request
  Gateway->>Server: workflow/start 或 agent task request
  Server->>Runtime: resolve WorkflowDefinition
  Runtime->>Store: workflow.run.started
  Runtime->>Store: workflow.step.started
  Runtime->>Store: workflow.step.progress
  Runtime->>Store: workflow.step.completed
  Runtime->>Store: workflow.run.completed
  Store->>Read: project workflow facts
  UI->>Read: 读取 run/steps/artifacts/evidence
  Read-->>UI: 运行详情和产物 refs
  UI-->>User: 展示进度、产物、可重试动作
```

## 4. Plugin manifest workflow 映射时序图

```mermaid
sequenceDiagram
  participant Plugin as Plugin Package
  participant Manifest as Manifest Parser
  participant Adapter as Plugin Surface Adapter
  participant Runtime as App Server RuntimeCore
  participant Iframe as Plugin iframe

  Plugin->>Manifest: workflows[].steps
  Manifest->>Adapter: PluginWorkflowDeclaration
  Adapter->>Adapter: map to WorkflowDefinition
  Adapter->>Runtime: start workflow with app provenance
  Runtime-->>Adapter: workflowRunId
  Runtime-->>Iframe: projected task/workflow events
  Iframe->>Iframe: render projection only
```

## 5. Step 执行和工具事件时序图

```mermaid
sequenceDiagram
  participant Runtime as RuntimeCore
  participant Policy as Policy / Capability Gate
  participant Tool as Tool / Skill / Subagent
  participant Events as RuntimeEvent Sink
  participant Evidence as Evidence Provider

  Runtime->>Events: workflow.step.started
  Runtime->>Policy: evaluate capability
  Policy-->>Runtime: allow / ask / deny
  alt allow
    Runtime->>Events: workflow.tool.started
    Runtime->>Tool: invoke
    Tool-->>Runtime: result / artifact refs
    Runtime->>Events: workflow.tool.completed
    Runtime->>Events: workflow.step.completed
    Events->>Evidence: correlate workflowRunId + toolCallId
  else ask
    Runtime->>Events: workflow.step.progress waiting
  else deny
    Runtime->>Events: workflow.step.failed
  end
```

## 6. Cancel / Retry 流程图

```mermaid
flowchart TD
  A[用户点击取消或重试] --> B{动作类型}
  B -->|取消| C[workflow/cancel]
  B -->|重试 step| D[workflow/retry step]
  B -->|重试 run| E[workflow/retry run]
  C --> F[查找 open run 和 open step]
  F --> G[发出 workflow.step.canceled]
  G --> H[发出 workflow.run.canceled]
  D --> I[发出 workflow.step.retrying]
  E --> J[发出 workflow.run.retrying]
  I --> K[重新调度 step]
  J --> K
  K --> L[继续写入 workflow.* events]
```

## 7. 状态流转图

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> running
  running --> waiting
  waiting --> running
  running --> retrying
  retrying --> running
  running --> completed
  running --> failed
  running --> canceled
  queued --> skipped
  failed --> retrying
  completed --> [*]
  failed --> [*]
  canceled --> [*]
  skipped --> [*]
```

## 8. Read Model 投影流程图

```mermaid
flowchart LR
  Events[RuntimeEvent stream]
  Filter[过滤 workflow.*]
  Normalize[标准化状态与字段]
  Join[Join task/tool/artifact/evidence]
  Snapshot[WorkflowReadModel]
  Consumers[GUI / Evidence / Replay / Diagnostics]

  Events --> Filter
  Filter --> Normalize
  Normalize --> Join
  Join --> Snapshot
  Snapshot --> Consumers
```

## 9. 治理退场流程图

```mermaid
flowchart TD
  A[发现 workflow 入口] --> B{是否 App Server Runtime facts?}
  B -->|是| C[current]
  B -->|否| D{是否只做声明/映射/展示?}
  D -->|是| E[compat + 退出条件]
  D -->|否| F{是否旧 UI / 前端 runtime / mock?}
  F -->|是| G[deprecated 或 dead]
  F -->|否| H[登记 blocker]
  E --> I[迁到 Workflow Read Model]
  G --> J[补守卫防回流]
  H --> I
```
