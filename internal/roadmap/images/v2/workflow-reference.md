# 图片 Workflow 审计转译规则

更新时间：2026-07-02
状态：设计中

## 结论

图片 workflow 只作为内部状态机和审计事实源，不作为聊天区或右侧工作台的可见 UI。

符合 Lime 的做法：

```text
聊天区：模型生成的自然铺垫 + 轻量图片卡 + 最终图片和模型生成的 caption
右侧：不展示 workflow 步骤、分支导轨、task_id、artifact path 或原始事件
审计：run / step / branch / route / worker attempt 只写入 JSONL 和 read model
```

参考图里的移动端 tab、紫色气泡、窄屏大卡、长段解释文案、步骤卡和分支导轨都不应进入 Lime 主 UI。

## 如何参考才符合 Lime

参考对象只允许是“可审计流程骨架”，不是“界面皮肤”：

1. 抽象父级运行：一轮生图请求在内部必须有一个 `ImageCommandRunSnapshot` 或等价 run record。
2. 抽象阶段状态：`intent -> route -> create_task -> worker -> persist_outputs` 只进入审计 JSONL，不渲染成五步 UI。
3. 抽象结果分支：多张图或多方向结果可以在 JSONL 中保留 branch 关系，但聊天区只显示轻量图片结果卡。
4. 抽象后续动作：重试、继续同风格、回填文稿等只作为可执行动作状态，不通过大段 assistant 文案或步骤卡解释。
5. 抽象诊断边界：provider、model、attempt、error code、task_id、artifact_path 只进入 JSONL / evidence / 诊断导出，不出现在普通 UI。

因此，落到 Lime 的第一屏只回答：

```text
用户刚才让系统生成什么？
Agent 是否正在处理？
图片生成卡是否还在运行？
生成完成后图片和 caption 是什么？
```

run、step、branch、route、attempt 仍然必须存在，但它们是审计和恢复事实源，不是主 UI。

## 为什么不能复刻视觉

Lime 的图片生成入口首先是一条自然对话体验。用户要看到的是“助手正在帮我生成”和最终图片，而不是内部 workflow。

如果照搬参考图视觉，会产生几个问题：

- 主线混乱：用户看到 JSON、步骤卡、分支摘要，会以为图片已经完成或卡住。
- 终态误导：Agent turn 完成不等于图片 worker 完成，UI 不能用 workflow 步骤替代真实图片状态。
- 诊断过载：provider、model、task_id、artifact_path 对普通用户没有即时价值。
- 与 Lime 气质冲突：高饱和气泡和移动端 tab 会让页面不像现有桌面产品。
- 容易回到旧问题：assistant 文本看起来像成功，但没有真实 task artifact。

## 可吸收的结构

| 参考图元素 | Lime 中的抽象 | 落点 |
| --- | --- | --- |
| 用户提出一次生成请求 | `ImageCommandIntent` | turn metadata + JSONL |
| assistant 简述生成方向 | `presentation.assistant_intro` | 聊天区普通 assistant 文本 |
| 提交生图任务 | `ImageCommandRunStep.create_task` | JSONL / read model |
| 生成图片 1 / 2 | `ImageGenerationBranch[]` 或 task output list | JSONL / task artifact |
| 图片预览卡 | task output preview + `presentation.completion_caption` | 聊天区轻量图片卡 |
| 继续补版本 | `ImageCommandNextAction[]` | 可执行动作状态 / JSONL |
| 错误和重试 | branch retry state | 轻量错误卡 + JSONL 诊断 |

## Lime 版信息架构

### 1. 聊天区：自然对话 + 轻量图片卡

聊天区只展示用户需要立即理解的内容：

- assistant 自然铺垫来自 App Server presentation generator 产出的 `assistant_intro`，例如“好啊，我来按花城汇视角做一张广州塔春天照片。”
- 图片生成轻卡，例如 `Image Generation | Nanobanana Pro`。
- 生成前保持 running 占位，不因 `turn.completed` 显示完成。
- 生成完成后显示图片和 `completion_caption` / `result_captions.complete`。
- 失败时显示一句业务错误和可操作入口。

聊天区禁止：

- raw JSON / `task_id` / `artifact_path`。
- `.lime/tasks/**/*.json` 路径或绝对路径。
- “图片生成 · 5 步 · 1 个方向”一类 workflow 摘要。
- tool result / workflow step / branch board 作为聊天主内容。
- 用“已发起 / 已完成”替代真实 worker 状态。
- 前端用固定模板自行拼寒暄或成功收尾。

### 1.1. SOUL 与 presentation contract

图片任务不拥有单独的“图片 SOUL”。SOUL 是全局交互气质，继续走 App Server 已有 `memory.soul -> ## Interaction Soul` system prompt 链。图片 workflow 只新增结构化 presentation contract：

```json
{
  "schema": "image_task_presentation.v1",
  "assistant_intro": "好啊，我来按花城汇视角做一张广州塔春天照片。",
  "completion_caption": "完成了，从花城汇望向广州塔的春日画面已经生成，前景花和广场层次都保留住了。"
}
```

固定约束：

- App Server 在 `ImageCommandWorkflow` 创建 task 前调用当前 chat provider 生成 presentation JSON。
- presentation generator 必须带全局 SOUL，但只返回结构化 JSON，不调用工具、不创建 task。
- 前端只渲染 `assistant_intro` / `completion_caption` / `result_captions.*`，没有字段时 fail closed，不生成模板文案。
- 禁止输出内部词：workflow、task id、`.lime/tasks`、artifact path、JSON / JSONL、tool 名称、运行时细节和品牌化助手名。
- `image_task.presentation.generated` 只作为 JSONL/read model 审计事件，不进入右侧 viewer；presentation 不可用必须 fail closed 为 `image_task.create_failed`，不得继续创建图片任务。

### 2. 右侧区域：不展示 workflow

右侧可以用于图片查看、放大、下载、回填等结果操作，但不展示 workflow 步骤、分支导轨、任务明细或诊断字段。

右侧禁止：

- Step rail / branch board / workflow run header。
- `task_id`、`artifact_path`、provider、model、attempt。
- 原始 task JSON 或 runtime event JSON。
- 把 JSONL 审计内容以调试面板形式默认展开。

### 3. JSONL 审计流：承载技术状态

内部审计只写 JSONL。推荐记录到 App Server 当前 session event log、trace export 或 fixture backend ledger，逻辑事件名统一以 `image_command.*` / `image_task.*` 表达。

每行 JSONL 应至少包含：

- `timestamp`
- `session_id`
- `thread_id`
- `turn_id`
- `run_id`
- `event`
- `task_id`
- `artifact_path`
- `provider_id`
- `model`
- `worker_attempt_id`
- `status`
- `failure_category`
- `redaction`

JSONL 中可以保留 `steps` / `branches` / `next_actions`，但这些字段只用于恢复、审计和 fixture 断言，不驱动聊天区或右侧 UI 直接展示。

## 视觉与交互规则

图片生成主体验属于聊天消息流，不是复杂 workflow 工作台。

布局应遵守：

- assistant 文本和图片轻卡同属一条 assistant 消息。
- 图片生成前占位卡保持稳定，不闪烁、不被工具输出覆盖。
- 运行中状态只表达为轻量占位，不出现多套进度组件。
- 完成态必须来自 task artifact / worker result，不来自 `turn.completed`。
- 状态色沿用 Lime 语义：成功 `emerald`，提醒 `amber`，信息 `sky/slate`，错误 `rose/red`。

```text
好啊，我来按花城汇视角做一张广州塔春天照片。

[Image Generation | Nanobanana Pro]
[图片占位 / 图片结果]
完成了，从花城汇望向广州塔的春日画面已经生成，前景花和广场层次都保留住了。
```

### 禁止项

- 不做移动端顶部 tab。
- 不做紫色或高饱和气泡体系。
- 不把 Workflow 渲染成一串 assistant 消息。
- 不把每个图片结果拆成互不关联的消息。
- 不在主 UI 暴露 Agent、Runtime、Skill、Artifact 等实现词。
- 不用“AI 正在思考”解释业务状态。
- 不靠 toast 或 `turn.completed` 宣告图片成功，必须等 worker result。

## 与 v2 架构的关系

这份规则只定义 UI 和产品转译，不改变 v2 后端主链。

后端仍按以下事实源运行：

```text
ImageCommandIntent
  -> ImageCommandWorkflow
  -> ImageCommandRunSnapshot
  -> image task artifact
  -> Media Runtime worker
  -> JSONL audit + task/read model projection
  -> UI lightweight image card
```

UI 只消费 task/read model projection 中适合展示的轻量字段。`ImageCommandRunSnapshot`、steps、branches、provider/model、task path 默认只进入 JSONL 审计和 evidence，不直接渲染到聊天区或右侧。

## 验收标准

实现时至少满足：

1. 用户能在 5 秒内看到自然 assistant 铺垫和稳定图片轻卡。
2. 图片生成前占位卡不闪烁，不被 raw JSON、tool output 或 workflow 摘要覆盖。
3. `turn.completed` 不能把 running 图片任务显示成完成；完成必须来自 worker result。
4. 聊天区和右侧都不展示 `task_id`、`.lime/tasks`、`artifact_path`、workflow step count、branch count。
5. JSONL 审计流包含 run / step / branch / route / worker attempt，足以未来排查。
6. UI 风格收敛到 Lime 桌面对话体验：轻盈、清晰、专业，信息优先，装饰克制。
