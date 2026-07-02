# 图片能力 v2 产品需求

更新时间：2026-07-02
状态：current 重构中

## 背景

Lime 的核心用户场景是创作生产。图片能力不是附属工具，而是内容创作工作流中的一级能力：

- 公众号文章需要段落配图、封面图和插图。
- 视频 / PPT / 长图内容需要素材草图、分镜和视觉风格统一。
- 工作台里的图片需要继续修图、重绘、变体和回填。
- 用户在设置页已经配置了图片模型，期望所有图片入口使用同一套默认值。

当前系统已经有较完整的图片 worker 和 Provider adapter，但触发层仍混合了 Agent 自由决策、Skill allowlist、prompt 注入和 task artifact 创建。结果是用户输入明确的图片命令后，系统可能只输出一段文字，没有任何图片任务框。

## 目标

v2 的目标是把图片能力从“模型可能会调用工具”升级为“产品命令先识别、再补齐上下文、最后进入可恢复状态机”。

核心目标：

1. `@配图` 等图片入口必须先进入 `IntentDetected`，再确定性创建图片任务或进入明确补参 / 失败态。
2. Agent 保留为意图理解和补参层，但不再决定是否创建 task artifact。
3. 图片任务事实源统一为 `.lime/tasks/image_generate/*.json` 和 App Server read model。
4. Provider / model 选择统一由 Image Capability Catalog 和 media defaults 决定。
5. UI 只消费后端状态投影，不伪造任务框、不靠文本猜测任务状态。
6. 图片 Provider / 图片模型只作为 media defaults 或 image task route，不污染普通 Agent Chat 文本 turn。

## 非目标

v2 不解决以下问题：

- 不新增一个独立图片 App。
- 不重建图片工作台。
- 不把所有图片 Provider 一次性补齐到完美。
- 不支持未在 catalog 声明的任意 `@模型名` 自动变成图片命令。
- 不保留旧 prompt-driven `Skill(image_generate)` 作为 current 首发链路。

## 背景目的收益

| 维度 | 当前问题 | v2 收益 |
| --- | --- | --- |
| 用户体验 | 明确让系统画图却只看到文字回复 | 必定看到任务卡、补参卡或真实错误 |
| 产品语义 | 图片命令像普通聊天一样不可预测 | 图片命令成为可恢复、可验证的产品 workflow |
| 工程质量 | provider/model/skill/tool 多点补丁 | 单一 ImageTaskRequest 合同和状态机 |
| 调试效率 | 失败可能发生在 prompt、Skill、tool、worker 任意层 | 每个阶段有结构化事件和明确失败码 |
| 扩展性 | 新图片模型要改多处启发式 | 新模型优先进 catalog 和 adapter |

## 用户画像

### 内容创作者

需要稳定地产出文章配图、封面图、插图和短视频视觉素材。关心的是“我写一句话，系统开始生成，并能回填到内容里”。

### 运营 / 自媒体团队

需要批量生成风格一致的配图和封面。关心默认模型、风格偏好、任务恢复和失败重试。

### 高级模型用户

会配置多个 Provider 和模型，期望通过 `@模型标签` 指定某一次生成使用的图片模型，而不影响聊天模型。

### 开发 / 测试人员

需要通过 fixture 和 evidence 精确判断一次图片命令有没有创建任务、有没有进入 worker、有没有使用正确 Provider。

## 用户故事

### US-01：输入 @配图 后看到任务框

作为创作者，我输入 `@配图 画一张广州夏天的图` 后，希望聊天区立即出现图片任务框，而不是只看到“我来帮你生成”。

验收：

- 发送后 App Server 产生 `image_task.created` 或等价 current 事件。
- UI 出现图片任务轻卡，状态至少为 `pending` / `running` / `failed` 之一。
- 如果 Provider 未配置，UI 展示明确错误，不进入纯文本成功态。

### US-02：普通自然语言画图也能生成任务

作为普通用户，我输入 `画一张广州夏天的图`，系统应识别为图片意图，并进入同一图片任务 workflow。

验收：

- 前端可做轻量 intent detection，但最终请求必须进入 App Server image command workflow。
- 自然语言入口会在发送边界归一到同一图片命令主链，task payload 当前标记 `entry_source=at_image_command`。
- 普通非图片文本不能误触发图片任务。

### US-03：使用默认图片模型

作为用户，我在设置里已经选了默认图片模型，希望图片任务使用该模型，而不是当前聊天模型。

验收：

- task payload 写入真实 `provider_id/model/executor_mode` 或由 App Server 在创建前补齐。
- 不能出现 `provider_id=null`、`model=default`、`executor_mode=direct` 的可执行任务。
- 当前没有项目时，系统先自动补齐默认项目位置，再进入图片任务；不能要求用户手填 `project_root_path`。
- 聊天 follow-up 不继承图片 provider/model。

### US-04：使用图片模型标签

作为高级用户，我选择 `@Nano Banana 2` 后，希望这次图片任务使用对应 catalog 中声明的图片模型。

验收：

- 只有 catalog 中 `kind=command` 且声明 image capability 的条目可触发。
- task payload 记录 `entry_source=model_command_tag`、`provider_id`、`model`、`routing_slot=image_generation_model`。
- 未声明模型标签按普通 mention / 文本处理，不猜测成图片模型。

### US-05：文稿 inline 配图

作为公众号作者，我在文稿段落旁点击“生成配图”，希望系统把段落上下文、标题、文章风格和 slot 信息写入任务，并在完成后回填。

验收：

- task payload 包含 `usage=document-inline`、`slot_id`、`anchor_section_title`、`anchor_text`。
- 结果从 task artifact / read model 回填。
- 重新打开会话或工作区后仍能恢复任务状态。

### US-06：修图 / 重绘需要参考图

作为图片工作台用户，我执行修图或重绘时，希望系统检查参考图是否存在，而不是创建一个必然失败的任务。

验收：

- 缺少参考图时进入参数缺失状态。
- 有参考图时 task payload 写入 `reference_images` 和目标 output metadata。
- Provider 不支持 image-to-image 时 fail closed，并给出可操作提示。

### US-07：失败可解释

作为用户，我希望图片失败时知道是没有配置模型、Key 错误、模型不支持、Provider 限流，还是上游响应格式错误。

验收：

- 错误码分层：`missing_image_default`、`provider_auth_failed`、`model_not_image_capable`、`provider_rate_limited`、`provider_unavailable`、`provider_response_invalid`。
- UI 不展示“已提交成功”假状态。
- evidence 能追踪到 route decision、task id 和 worker attempt。

### US-08：一次请求生成多个方向

作为电商内容创作者，我上传一张商品图后说“基于这张图，帮我做 2 张淘宝主图”，希望系统能把这次请求组织成一个可审计的生成 workflow，而不是两条互相独立、难以追踪的聊天回复。

验收：

- 同一 turn 产生一个父级 `ImageCommandRunSnapshot`。
- 父级运行下有多个结果分支，例如“标准白底 / 浅灰底主图”“轻氛围感电商主图”，这些分支写入 JSONL / read model / evidence。
- 每个分支都有独立状态：`queued/running/succeeded/failed/retryable`，但状态不渲染成聊天区或右侧 workflow 组件。
- 任一分支失败不影响其他成功结果的轻量展示。
- UI 只展示图片轻卡、成功结果、caption 和必要的重试 / 回填动作；分支诊断只进 JSONL。

## 用户用例

| 用例 | 输入 / 触发 | 系统行为 | 成功结果 | 失败结果 |
| --- | --- | --- | --- | --- |
| 明确 @配图 | `@配图 青柠插画` | 构造 ImageTaskRequest | 图片任务卡进入 pending/running | 显示缺配置或参数错误 |
| 普通画图 | `画一张广州夏天的图` | intent detection -> `@配图` 归一化 -> ImageTaskRequest | task `entry_source=at_image_command` | 回退普通聊天前必须证明不是图片意图 |
| 指定模型 | `@GPT Images 2 做封面` | catalog 解析 provider/model | 使用指定图片模型 | 未配置该 provider 时提示设置 |
| 文稿配图 | 文稿段落按钮 | 带段落上下文创建 task | 完成后回填 slot | slot 丢失时 fail closed |
| 修图 | `@修图 让背景更干净` + 参考图 | 创建 edit task | 输出新图并保留原图引用 | 缺参考图则补参 |
| 重绘 | 选中图片输出后点击变体 | 创建 variation task | 工作台新增 output | provider 不支持时提示切换模型 |
| 多方向主图 | 商品图 + “做 2 张淘宝主图” | 一个 workflow run + 多个结果分支 | 分支分别完成并展示 | 失败分支可单独重试 |
| 恢复 | 重启应用 | scheduler 扫描 pending/running | 恢复或标记 stale retry | 不伪造完成 |

## 功能需求

### FR-01 Image Command Intent

App Server 必须能识别来自前端的图片命令意图。current 写入字段是 `harness.image_command_intent`；`harness.image_skill_launch` 只能作为短期 compat 输入桥，不能继续作为正向事实源。

最小字段：

```ts
type ImageCommandIntent = {
  kind: "image_command";
  command: "generate" | "edit" | "variation";
  entrySource:
    | "at_image_command"
    | "model_command_tag"
    | "document_inline"
    | "image_workbench";
  rawText: string;
  imageTask: ImageTaskRequestDraft;
};
```

### FR-02 Intent Gate And Deterministic Task Creation

当 `ImageCommandIntent` 满足最小参数合同，App Server 必须调用同一套 `mediaTaskArtifact/image/create` 逻辑创建标准 task artifact。若缺少 prompt、参考图或模型配置，系统必须进入 `NeedsContext/action_required`；若缺少项目上下文，前端必须先自动补齐当前项目或默认项目，只有默认项目不可用时才进入项目选择 gate，不能把 `project_root_path` 暴露成用户补参字段。

禁止：

- 只把 intent 写入 prompt 后等待模型调用工具。
- 模型输出普通文本后把 turn 标记为成功。
- 在 renderer 里绕过 App Server 创建 task。

### FR-03 Parameter Gate

缺少必要参数时进入结构化补参，而不是让模型随意闲聊，也不能落成 `tool.failed`。

最小 gate：

- 生成：需要 prompt。
- 修图 / 重绘：需要 prompt 和参考图或目标 output。
- 文稿 inline：需要 project root、session、slot context；project root 先由系统自动补齐当前项目或默认项目，只有默认项目不可用时才进入项目选择 gate。
- 指定模型：需要 catalog entry 可解析，或默认值可补齐。

补参状态要求：

- 后端事件语义为 `runtime_status`（携带 `image_command_workflow` metadata）和历史 `image_task.parameters.required` 兼容输入。
- 前端投影为可恢复状态，不能显示补参表单或“模型未输出最终答复”。
- `turn.completed(requires_parameters)` 是本轮有效结果，不是失败。

### FR-04 Provider / Model Resolution

Provider / model 解析必须在创建 task 前完成，或明确标记为待补配置。

规则：

- 显式模型标签优先。
- 图片工作台当前选择次之。
- workspace media defaults 再次。
- 全局 media defaults 最后。
- 不允许回退到聊天模型，除非 catalog 明确声明该模型也具备图片能力。
- 普通 Agent Chat follow-up 不得继承图片 Provider / 图片模型；图片 route 只能写入 `image_task.provider_id/model/executor_mode`。

### FR-05 Structured Events

App Server 需要输出当前 GUI 可消费的结构化事件：

- `image_task.intent.accepted`
- `image_task.parameters.required`
- `image_task.created`
- `image_task.create_failed`
- `image_task.worker.started`
- `image_task.worker.completed`
- `image_task.worker.failed`

事件命名实现时可贴合现有 runtime event taxonomy，但语义必须存在。

### FR-06 UI Projection

聊天区只根据后端 task / event 投影自然铺垫和轻卡。

要求：

- 任务创建成功后立即显示稳定图片轻卡。
- 图片生成前保留 running 占位，不因为 `turn.completed` 显示完成。
- assistant 可以先输出自然寒暄 / 工具参数确认 / 即将生成等铺垫文案。
- 缺参数时显示补参 / 绑定项目 / 选择模型状态，而不是失败卡。
- 任务失败显示可操作错误。
- 文本 assistant 消息不能替代图片任务卡。
- task artifact 作为内部恢复事实源，不渲染成普通文件卡。
- 聊天区和右侧都不展示 raw JSON、`task_id`、`.lime/tasks`、`artifact_path`、workflow 步骤数或分支数。

### FR-07 Workflow Audit Projection

图片命令必须投影为可审计的 workflow run，而不是散落的工具日志或可见 UI 步骤卡。

最小结构：

```ts
type ImageCommandRunSnapshot = {
  runId: string;
  sessionId: string;
  turnId: string;
  title: string;
  summary: string;
  status: "requires_parameters" | "queued" | "running" | "succeeded" | "failed" | "partial";
  steps: ImageCommandRunStep[];
  branches: ImageGenerationBranch[];
};

type ImageCommandRunStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "succeeded" | "failed";
  detail?: string;
};

type ImageGenerationBranch = {
  branchId: string;
  title: string;
  prompt: string;
  taskId?: string;
  artifactPath?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "retryable";
  previewUrl?: string;
  failureReason?: string;
};
```

参考图中的“提交生图任务 / 生成图片 1 / 生成图片 2”应在 Lime 中落为 `steps + branches` 审计数据，并写入 JSONL / read model / evidence；它们不是聊天区组件，也不是右侧工作台组件。

JSONL 审计要求：

- 每个 `image_command.*` / `image_task.*` 事件追加一行 JSONL。
- 每行至少包含 `timestamp/session_id/thread_id/turn_id/run_id/event/task_id/status/redaction`。
- provider、model、artifact path、worker attempt、failure category 只允许进入 JSONL / evidence / 诊断导出，不进入普通 UI。

## 非功能需求

| 类型 | 要求 |
| --- | --- |
| 可恢复性 | App 重启后 pending/running/stale task 可恢复 |
| 可观测性 | JSONL / evidence 能记录 intent、route、task id、worker attempt |
| 可测试性 | fixture 禁止 live provider，仍能验证完整链路 |
| 跨平台 | task artifact 路径使用 workspace root / App Server API，不硬编码 macOS 路径 |
| 失败安全 | 缺 provider/model 时 fail closed，不创建假任务 |
| 去兼容 | 不保留旧 prompt-driven 首发链路为 current |

## 验收指标

1. 用户输入 `@配图 画一张广州夏天的图`，100% 出现图片轻卡或明确错误。
2. 图片 Provider 缺失时，0 个假 pending task。
3. 普通 Expert Panel 文本 follow-up 中，0 次图片 Provider 污染。
4. 聊天区和右侧 UI 中 0 次出现 raw JSON、`task_id`、`.lime/tasks`、`artifact_path`、workflow 步骤数或分支数。
5. `image-command` fixture 后端 JSONL ledger 必须包含 task 创建和 worker attempt。
6. `plain-image-intent` fixture 和 `image-command` fixture 都通过。
7. `npm run smoke:agent-runtime-current-fixture` 通过。
