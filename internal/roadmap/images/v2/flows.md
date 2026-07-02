# 图片能力 v2 流程与时序

更新时间：2026-07-02
状态：设计中

## 总流程

```mermaid
flowchart TD
  A[用户触发图片入口] --> B[Renderer 构造 ImageCommandIntent]
  B --> C[agentSession/turn/start]
  C --> D{App Server 是否识别 image command?}
  D -->|否| E[普通 Agent Chat]
  D -->|是| F[ImageCommandWorkflow]
  F --> R[创建 ImageCommandRunSnapshot]
  R --> G{参数是否完整?}
  G -->|否| H[返回补参状态]
  G -->|是| I[Provider / Model 路由]
  I --> J{可执行?}
  J -->|否| K[返回 create failed]
  J -->|是| L[创建 image task artifact / branches]
  L --> M[写入 JSONL 审计 + 投影图片轻卡]
  M --> N[Media Runtime worker 执行]
  N --> O[写回 task result]
  O --> P[UI 更新结果 / 文稿回填]
```

## 明确 @配图 时序

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer
  participant A as App Server
  participant W as Image Workflow
  participant T as Task Artifact
  participant M as Media Worker
  participant UI as UI Projection

  U->>R: @配图 画一张广州夏天的图
  R->>R: parseImageCommand -> ImageCommandIntent
  R->>A: agentSession/turn/start(intent)
  A->>W: run ImageCommandWorkflow
  W->>W: gate prompt / session / project
  W->>W: resolve provider/model
  W->>T: mediaTaskArtifact/image/create
  T-->>W: task_id + artifact_path + status=pending
  W-->>A: image_task.created
  A-->>UI: tool.started + tool.result + task projection
  A-->>R: turn.completed
  M->>T: claim pending task
  M->>M: call provider adapter
  M->>T: write running/succeeded/failed
  T-->>UI: read model / task polling projection
```

关键要求：

- `turn.completed` 不能早于 task 创建成功或明确失败。
- 如果模型没有参与，也必须能创建 task。
- UI 看到的是轻量 task/read model projection，不是 assistant 文本猜测；workflow/run/step/branch 写入 JSONL 审计。

## 多结果图片 workflow

参考图应抽象为这个流程：一次用户请求产生一个父级运行，父级运行下面挂多个结果分支。

```mermaid
flowchart TD
  A[用户: 基于商品图做 2 张淘宝主图] --> B[ImageCommandIntent requestedCount=2]
  B --> C[ImageCommandRunSnapshot]
  C --> D[Step 1 解析需求]
  D --> E[Step 2 路由图片模型]
  E --> F[Step 3 创建任务]
  F --> G1[Branch 1 标准白底 / 浅灰底主图]
  F --> G2[Branch 2 轻氛围感电商主图]
  G1 --> H1{状态}
  G2 --> H2{状态}
  H1 -->|成功| I1[结果卡 1]
  H1 -->|失败| J1[分支 1 可重试]
  H2 -->|成功| I2[结果卡 2]
  H2 -->|失败| J2[分支 2 可重试]
  I1 --> K[查看图片 / 回填 / 继续同风格]
  I2 --> K
```

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer
  participant A as App Server
  participant WF as Image Workflow
  participant RM as Read Model
  participant W as Media Worker
  participant UI as UI

  U->>R: 基于这张图，做 2 张淘宝主图
  R->>A: turn/start ImageCommandIntent(count=2, referenceImages=1)
  A->>WF: create ImageCommandRunSnapshot
  WF->>RM: run step intent=succeeded
  WF->>WF: build branches
  WF->>RM: branch 1/2 queued
  WF->>A: image_command_run.created
  A-->>UI: lightweight image card projection
  WF->>W: enqueue branch tasks
  W->>RM: branch 1 running
  W->>RM: branch 1 succeeded + output preview
  W->>RM: branch 2 running
  W->>RM: branch 2 succeeded + output preview
  RM-->>UI: update lightweight image card
```

Lime 桌面端展示建议：

- 聊天区：自然 assistant 铺垫 + 轻量图片卡 + 最终图片和 caption。
- 右侧区：不展示 workflow 步骤、分支状态、task id、artifact path 或原始 JSON。
- JSONL：记录 run、step、branch、route、worker attempt、错误码，供未来审计。
- 不使用参考图里的移动端顶部 tab、紫色气泡和大段建议文案作为主 UI。

## 普通自然语言图片意图

```mermaid
flowchart TD
  A[输入: 画一张广州夏天的图] --> B[plain image intent detector]
  B --> C{高置信图片意图?}
  C -->|否| D[普通 Agent Chat]
  C -->|是| E[发送边界归一到 @配图 / entry_source=at_image_command]
  E --> F[ImageCommandWorkflow]
  F --> G[创建 task 或失败]
```

高置信规则示例：

- 包含“画一张 / 生成一张图 / 做一张封面 / 配图 / 修图 / 重绘”。
- 不包含明显非图片目标，例如“画一下流程图代码”除非命令入口明确为图片。
- 如果存在歧义，优先普通 Agent Chat 或补参确认，不创建假任务。

## 图片模型标签

```mermaid
sequenceDiagram
  participant U as User
  participant R as Renderer
  participant C as SkillCatalog
  participant A as App Server
  participant W as Image Workflow

  U->>R: @Nano Banana 2 做一张封面
  R->>C: resolve command entry
  C-->>R: image command entry + provider/model
  R->>A: turn/start ImageCommandIntent
  A->>W: validate catalog binding
  W->>W: provider/model executable check
  W-->>A: task created or settings required
```

约束：

- 未在 catalog 声明的 `@xxx` 不会自动变成图片模型。
- model tag 只影响图片任务，不影响当前聊天模型。
- App Server 必须再次校验 provider/model，不信任 renderer。

## 文稿 inline 配图

```mermaid
sequenceDiagram
  participant Doc as Article Editor
  participant R as Renderer
  participant A as App Server
  participant W as Image Workflow
  participant T as Task Artifact
  participant UI as Document Projection

  Doc->>R: 点击段落配图
  R->>R: collect anchor section/title/text/slot
  R->>A: turn/start ImageCommandIntent(document_inline)
  A->>W: gate projectRoot + slot + prompt
  W->>T: create image task usage=document-inline
  T-->>UI: pending task linked to slot_id
  UI-->>Doc: 段落占位显示生成中
  T-->>UI: succeeded outputs
  UI-->>Doc: 回填图片
```

必须写入 task payload：

- `usage=document-inline`
- `slot_id`
- `anchor_section_title`
- `anchor_text`
- `content_id`
- `project_id`

## 修图 / 重绘

```mermaid
flowchart TD
  A[用户触发 @修图/@重绘] --> B{有参考图或目标 output?}
  B -->|否| C[requires_parameters: attach_reference_image]
  B -->|是| D{Provider 支持 image-to-image?}
  D -->|否| E[not_executable: model_not_image_edit_capable]
  D -->|是| F[创建 edit/variation task]
  F --> G[worker 调用支持参考图的 adapter]
```

## Provider 缺失 / 不可执行

```mermaid
sequenceDiagram
  participant R as Renderer
  participant A as App Server
  participant W as Image Workflow
  participant UI as UI

  R->>A: turn/start ImageCommandIntent
  A->>W: resolve provider/model
  W-->>A: not_executable missing_image_default
  A-->>UI: image_task.create_failed
  UI-->>R: 显示设置入口 / 模型选择提示
```

失败时禁止：

- 创建 provider/model 为空的 pending task。
- 回退聊天模型。
- 输出“我来帮你生成”后结束。

## task 创建成功但 worker 失败

```mermaid
stateDiagram-v2
  [*] --> TaskCreated
  TaskCreated --> Pending
  Pending --> Running
  Running --> Failed: auth / rate limit / provider error
  Failed --> Retryable: 可重试错误
  Retryable --> Pending: 自动恢复 / 用户重试
  Failed --> Terminal: 不可重试错误
  Running --> Succeeded
  Succeeded --> [*]
  Terminal --> [*]
```

UI 规则：

- task 创建成功后，即使 worker 失败，也保留任务卡。
- 错误展示来自 task artifact 的 `last_error` / `result.failures`。
- 用户可执行动作包括打开设置、切换模型、重试、复制错误信息。

## 会话恢复

```mermaid
flowchart TD
  A[App 启动 / workspace ensure] --> B[扫描 .lime/tasks/image_generate]
  B --> C{任务状态}
  C -->|pending| D[enqueue worker]
  C -->|running fresh| E[保持观察]
  C -->|running stale| F[标记 stale recovered]
  F --> D
  C -->|failed retryable| D
  C -->|succeeded/terminal failed| G[只投影结果]
```

## GUI 状态矩阵

| 后端状态 | 聊天区 | 右侧区 | 文稿 |
| --- | --- | --- | --- |
| `requires_parameters` | 补参卡 | 不打开 | 保留原位 |
| `create_failed` | 错误卡 + 操作按钮 | 不打开 | 保留原位 |
| `task_created/pending` | 图片轻卡 running 占位 | 不展示 workflow | slot 显示等待 |
| `running` | 保持图片轻卡 running | 不展示 attempt | slot 显示生成中 |
| `succeeded` | 显示图片和 caption | 仅可做图片查看 / 回填，不展示 workflow | 回填 |
| `failed retryable` | 失败 + 重试 | 不展示错误详情字段 | slot 显示失败 |
| `failed terminal` | 失败 + 设置入口 | 不展示错误详情字段 | slot 显示失败 |

## Evidence 必须记录

每次图片命令 fixture 至少记录：

- input text
- parsed `ImageCommandIntent`
- provider/model route decision
- task id
- artifact path
- worker attempt id
- provider adapter mode
- final task status
- UI task card visible
- UI raw JSON absent
- UI workflow chrome absent
- live provider used = false
