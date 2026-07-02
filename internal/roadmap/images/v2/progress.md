# 图片能力 v2 进度记录

## 2026-07-02

### Checkpoint：presentation contract 接入 SOUL，撤掉前端模板文案

背景：

- 用户确认问题不只是右侧 workflow，而是聊天列表里图片占位一闪而过、turn 很快完成但图片其实未完成，以及图片前后缺少自然 Agent 文案。
- 旧修法在前端硬编码“好啊 / 先获取工具参数 / 马上生成 / 搞定”等模板，既机械，也绕过了全局 SOUL。
- 右侧 workflow 明确不需要显示；workflow、task id、raw JSON 只写 JSONL/read model/evidence 以便未来审计。

已完成：

- App Server `ImageCommandWorkflow` 在创建 image task 前接入 presentation generator：复用当前 chat provider/model route，系统提示继承全局 `memory.soul`，输出 `image_task_presentation.v1` 结构化 JSON。
- 生成成功时把 `assistant_intro` 作为当前 turn 的 `message.delta` 写入 read model，把 `completion_caption` / `result_captions.complete` 合并进 image task payload。
- 生成失败或结构不合格时 fail closed：写 `image_task.presentation.unavailable` 审计事件，但不由前端伪造文案。
- 前端撤掉图片任务寒暄和成功 caption 的模板 fallback；只消费后端/任务 payload 的 presentation 字段，失败/取消仍保留本地化安全文案。
- `ImageTaskViewer` 继续不渲染 workflow，run/step/branch/provider/model/task path 只保留在 JSONL/read model/evidence。

当前分类：

- `current`：`Agent turn -> App Server ImageCommandWorkflow -> chat provider presentation JSON + mediaTaskArtifact/image/create -> task artifact + worker -> imageWorkbenchPreview`。
- `audit-only`：`image_task.presentation.generated`、`image_task.presentation.unavailable`、workflow run/step/branch/task path/provider/model。
- `dead`：前端 hard-code 图片寒暄/成功收尾模板、右侧 workflow 默认展示、把 raw task JSON 当聊天内容。

下一刀：

1. 跑 image-command fixture，确认真实 GUI 中模型 intro、轻卡、worker 完成 caption 和刷新恢复同构。
2. 收缩旧图片 Skill 首发残留，避免 `Skill(image_generate)` 重新抢 current 路由。

### Checkpoint：v2 设计文档落盘

背景：

- 用户明确要求开发期无历史包袱，可以清理和重构。
- `@配图` 当前失败不是 UI 隐藏任务框，而是后端没有稳定创建 image task artifact。
- 继续在 `image_skill_launch -> Skill(image_generate) -> lime_create_image_generation_task` 上补 prompt / allowlist / stop rule，会形成打地鼠式修复。

本次决策：

- v2 采用确定性 command workflow。
- `Skill(image_generate)` 从 current 首发链路退场。
- App Server 在识别图片命令后直接运行 `ImageCommandWorkflow`，创建 task 或返回补参 / 失败。
- Agent 只保留为可选 prompt refinement / 补参解释，不再决定是否创建任务。

已完成：

- 新增 `internal/roadmap/images/v2/README.md`。
- 新增 `internal/roadmap/images/v2/product-requirements.md`。
- 新增 `internal/roadmap/images/v2/architecture.md`。
- 新增 `internal/roadmap/images/v2/flows.md`。
- 新增 `internal/roadmap/images/v2/implementation-plan.md`。

下一刀：

1. 更新 `internal/aiprompts/command-runtime.md` 中图片命令规则，把旧 Skill 首发条款替换为 v2 workflow 口径。
2. 新增前端 `ImageCommandIntent` builder，先保留读取旧 metadata 的兼容输入，但写入新字段。
3. 新增 App Server `image_command` workflow 骨架和定向测试。

### 补充：参考图使用口径纠偏

用户补充说明：参考截图要参考的是 WorkFlow 流程，不是复刻视觉样式。

已更新：

- `README.md` 增加“参考图的正确用法”，明确只吸收父级运行、步骤、分支、结果卡的信息结构。
- `product-requirements.md` 增加 US-08：一次请求生成多个方向。
- `architecture.md` 增加 `ImageCommandRunSnapshot` / `ImageGenerationBranch` 数据模型和参考图映射表。
- `flows.md` 增加多结果图片 workflow 流程图和时序图。
- `implementation-plan.md` 增加阶段 2.5：Workflow Projection。
- `workflow-reference.md` 当时增加 Lime 转译规则；最新口径已从“桌面端复杂工作台展示”收窄为“JSONL 审计转译规则”。

新的产品口径：

- 一次图片请求对应一个父级 workflow run。
- 多张图 / 多个方向对应 run 下的 branches。
- Lime 主 UI 展示为自然 assistant 铺垫 + 图片轻卡 + 最终图片和 caption，不复刻移动端 tab、紫色气泡和窄屏卡片。
- workflow run / step / branch / provider / model / attempt / error code 只写入 JSONL 审计流和 evidence，不在聊天区或右侧展示。

### Checkpoint：运行时事实源切到 ImageCommandWorkflow

背景：

- `internal/aiprompts/command-runtime.md`、`modalityRuntimeContracts.json` 和 `modalityExecutionProfiles.json` 仍把 `Skill(image_generate)` 写成图片命令 current 首发路径。
- 这会让后续实现继续围绕 prompt-driven Skill 修补，而不是进入确定性 workflow。

已完成：

- `internal/aiprompts/command-runtime.md` 改为 `Agent turn -> App Server ImageCommandWorkflow -> 标准 image task artifact + worker`。
- `src/lib/governance/modalityRuntimeContracts.json` 将 `image_generation.executor_binding` 改为 `workflow:image_command`，入口 metadata path 改为 `harness.image_command_intent.image_task`。
- `src/lib/governance/modalityExecutionProfiles.json` 新增 current `workflow:image_command` executor adapter，并把 `skill:image_generate` 降为 compat/manual guard。
- `scripts/check-modality-runtime-contracts.mjs` 允许 `workflow` executor kind。
- 同步相关单测期望，runtime contract 不再声明 `skill:image_generate` 为 current executor。

当前分类：

- `current`：`ImageCommandWorkflow`、`workflow:image_command`、`harness.image_command_intent`。
- `compat`：`harness.image_skill_launch` 旧 metadata 读取桥、`skill:image_generate` 手工 / 测试 guard。
- `dead` 候选：prompt 强制模型首刀调用 `Skill(image_generate)`、图片命令走 `ToolSearch/WebSearch/Read/Grep` 偏航链路。

当时下一刀：

1. 前端写入侧从 `image_skill_launch` 迁到 `image_command_intent`。（已完成，见下一 checkpoint）
2. App Server `image_command` workflow 继续补 provider/model route、run snapshot 和 branch projection。
3. 删除或收缩图片 Skill 首发特殊逻辑。

### Checkpoint：前端写入侧改为 ImageCommandIntent

背景：

- 治理事实源已经切到 `workflow:image_command`，但前端仍通过 `modelSkillLaunchDescriptors` 写 `harness.image_skill_launch` 并打开 `allow_model_skills`。
- 这会继续把图片命令伪装成模型 Skill 首发，增加 provider/model 污染和“模型只说不做”的风险。

已完成：

- `MODEL_SKILL_LAUNCH.image.launchKey` 改为 `image_command_intent`。
- `buildModelSkillLaunchRequestMetadata` 对图片命令写入 `harness.image_command_intent.image_task`，并删除旧 `allow_model_skills` / `image_skill_launch` 残留。
- `imageSkillLaunch.ts` 更名为 `imageCommandIntent.ts`，导出 `resolveImageWorkbenchCommandRequest` / `ImageWorkbenchCommandRequest`。
- `AgentChatWorkspace`、`useWorkspaceSendActions`、`useWorkspaceImageWorkbenchActionRuntime` 的图片路径改为 command intent 命名。
- 发送压缩、assistant draft、session 绑定读取侧同时识别新旧字段；旧 `image_skill_launch` 只作为 compat 输入桥。

验证：

- `npm run test:related -- src/components/agent/chat/workspace/modelSkillLaunchDescriptors.ts src/components/agent/chat/workspace/workspaceModelSkillLaunchRequestContext.ts src/components/agent/chat/utils/submitOpRuntimeCompaction.ts src/components/agent/chat/utils/buildUserInputSubmitOp.ts src/lib/governance/modalityExecutionProfiles.ts src/components/agent/chat/workspace/imageCommandIntent.ts src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 通过，41 个文件 / 593 个测试。

下一刀：

1. 运行 Rust 定向测试，确认 `ImageCommandWorkflow` 新旧 metadata 双读仍通过。
2. 删除或收缩 `skill_runtime_enable.rs`、`agent_skills_context.rs` 中图片 Skill 首发特殊逻辑。
3. 补 workflow run snapshot / branch projection。

### Checkpoint：隐藏内部 task JSON，只保留图片轻卡投影

背景：

- GUI 已经收到 `image_task_created`，并创建 `.lime/tasks/image_generate/*.json` 标准任务文件。
- 随后的 `tool.result` 仍把完整图片 task JSON 当普通工具输出渲染，并把 `.lime/tasks/**/*.json` 当普通 artifact 写入，导致聊天区出现内部 JSON、图片生成轻卡被通用文件展示干扰。

已完成：

- 前端工具结果 envelope 增加图片 task 识别，`mediaTaskArtifact/image/create` / `lime_create_image_generation_task` 的内部 task JSON 不再直接作为用户可见正文。
- 工具过程摘要改为复用图片任务状态文案，例如 `pending_submit` 显示“正在生成图片。”，不再摘取 raw JSON。
- `tool_result` / `artifact_snapshot` 来源的 `.lime/tasks/**/*.json` 统一按内部任务快照过滤，不进入聊天区通用文件写入和 artifact 卡片。
- `ImageCommandWorkflow` 的 `image_task_created` 与后续 `tool_end` 共同驱动 `imageWorkbenchPreview`，通用 `taskPreview` 继续让位给图片轻卡。

验证：

- `npx vitest run "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"` 通过，4 个文件 / 98 个测试。

当前分类：

- `current`：`image_task_created` / 图片 task `tool.result` 只投影为 `imageWorkbenchPreview`、工具过程摘要和 worker 恢复信号。
- `dead`：把 `.lime/tasks/**/*.json` 当聊天区普通 artifact / 文件卡展示。
- `compat`：旧 `lime_create_image_generation_task` 名称仍只作为图片 task 结果识别输入，不再决定首发链路。

### Checkpoint：收口 v2 image_generation task family 轻卡识别

背景：

- GUI 仍可能出现“已发起 / 已完成”过程项，但没有图片轻卡。
- v2 文档和模型路由以 `image_generation` 作为能力 / task family 语义，前端轻卡识别仍主要依赖 `task_type` 或旧 `task_family=image`。
- App Server 真实通知结构是 `event.payload.response`，测试需要覆盖真实 payload，避免只验证事件顶层伪结构。

已完成：

- `buildImageTaskPreviewFromToolResult` 同时识别 `task_type` 和 `task_family`，`image_generation` family 可恢复为 `imageWorkbenchPreview`。
- `imageTaskToolResult` 的内部 task JSON 识别同步支持 `task_family=image_generation`，避免 v2 task artifact 暴露成普通工具输出。
- App Server `image_task.created` 投影测试改为真实 `payload.response` 结构，并补 `image_generation` family 覆盖。

验证：

- `npx vitest run "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/lib/api/agentRuntime/appServerEventStream.test.ts"` 通过，4 个文件 / 61 个测试。

下一刀：

1. 跑 `image-command` GUI / fixture 验证，确认真实 `@配图 画一张广州夏天的图` 不再停留在纯过程项。
2. 旧口径曾计划让聊天摘要和右侧按 run/step/branch 消费同一事实源；最新口径已改为 run/step/branch 只进入 JSONL / evidence，UI 只消费轻量图片卡字段。

### Checkpoint：image-command GUI fixture 轻卡闭环通过

背景：

- 上一轮已让前端识别 v2 `task_family=image_generation`，但真实 GUI fixture 仍被旧 `dist` 产物中的 `projectRootPath is not defined` 启动崩溃挡住，没跑到图片命令业务断言。
- 重建 renderer 后，fixture 能进入 `run-image-command-scenario`，并暴露出通用 trace 断言仍把图片命令当文本流场景要求 `providerFirstTextDelta / appServerMessageDelta` 的口径问题。

已完成：

- 重新构建 Electron renderer，确保 `dist` 使用当前 `useWorkspaceSendActions` 中的 `projectRootPath` 解构修复。
- `claw-chat-current-fixture` 通用断言改为只在文本流场景强制 provider/server delta separation；图片命令仍保留 trace 可用、W3C carrier、summary-only 导出、支持包 trace opt-in 等断言。
- `image-command` Electron fixture 已证明 GUI 真实提交 `@配图` 后走 `ImageCommandWorkflow`，创建 `.lime/tasks/image_generate/*.json`，worker 成功写回图片结果，聊天区显示单张图片轻卡，刷新后仍能恢复。

验证：

- `npm run build:renderer:electron` 通过。
- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"` 通过，1 个文件 / 23 个测试。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000` 通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。

当前分类：

- `current`：`Agent turn -> ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact + worker -> GUI imageWorkbenchPreview`。
- `test-only`：image-command fixture 使用本地 image provider stub，不调用 live Provider。
- `compat`：旧图片 Skill / `image_skill_launch` 只作为迁移读取或 guard，不再作为首发链路。

下一刀：

1. 继续补 `ImageCommandRunSnapshot` / branch projection，但只写入 JSONL / evidence / read model，不再接入聊天区或右侧 workflow 展示。
2. 收缩图片 Skill 首发残留，确保 `Skill(image_generate)` 不再误导 `@配图` current 路由。

### Checkpoint：event / recovery 链路识别 image_generation family

背景：

- 上一刀已让 `tool.result` / App Server event stream 侧识别 `task_family=image_generation`，但 Workspace 图片 task runtime 仍在事件、恢复和 polling 路径里硬判断 `taskFamily === "image"`。
- 这会导致 `image_task.created` 已到达、后端任务已创建时，前端 pending 轻卡或刷新恢复仍可能被 v2 family 语义过滤掉。

已完成：

- 新增 `imageTaskFamily.ts`，把 `task_family=image_generation` 统一归一为图片 task family `image`。
- `imageTaskPreviewRuntimeEvents` 的 pending snapshot 构造改为复用同一归一规则，v2 `image_generation` event 不再被丢弃。
- `imageTaskPreviewRuntimeRecovery` 通过同一 helper 过滤恢复记录，workspace catalog 恢复、文件扫描恢复和 runtime event tracking 共享同一判定。
- 补充单测覆盖 `image_generation` family 的 pending preview 构造与历史记录恢复。

验证：

- `npx vitest run "src/components/agent/chat/workspace/imageTaskPreviewRuntimeEvents.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeRecovery.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.test.tsx"` 通过，3 个文件 / 58 个测试。
- `npm run build:renderer:electron` 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000` 通过，summary 证明 `imageCommandWorkflowUsed=true`、单张图片轻卡可见、`hasPreviewImage=true`、刷新后仍恢复。

下一刀：

1. 补 `ImageCommandRunSnapshot` / branch projection，让 UI 从单 task 预览升级到 run / step / branch 事实源。
2. 收缩图片 Skill 首发残留，避免旧 `Skill(image_generate)` 继续干扰 current `ImageCommandWorkflow` 路由。

### Checkpoint：ImageCommandRunSnapshot 首期 projection 落地（已被后续 UI 口径收窄）

背景：

- v2 参考图转译要求一轮图片请求对应一个父级 run，多图 / 多方向对应 run 下的 branches。
- 之前 UI 已有单 task 轻卡和恢复能力，但缺少 `ImageCommandRunSnapshot`，多结果请求仍只像“一个 task 的 expectedCount”，无法表达步骤、分支和后续动作。

已完成：

- App Server `create_image_payload` 写入 `image_command_run` / `imageCommandRun`，包含 `run_id`、`workflow_key`、`requested_count`、五个 workflow steps、branches 和 next action；其中 workflow 展示口径后续已改为只进 JSONL / evidence。
- branch 按 `count` 与 `storyboard_slots` 生成稳定引用；有 slot 时使用 slot id / label / prompt，没有 slot 时按 `branch:1..N` 兜底。
- `ImageCommandWorkflow` 的 `image_task.created.response.record.payload` 已带同一个 run snapshot，证明事件链消费的是 task artifact payload 事实源。
- 前端新增 `workflowRun` 可选 projection，`buildParsedImageTaskSnapshot` 从 task payload 恢复 run、steps、branches、nextActions。
- 当时聊天图片轻卡渲染了紧凑 workflow 摘要：run 标题、步骤数、分支数、步骤状态点和最多三个分支标题；该展示口径后续已废弃，只保留内部 projection / JSONL 审计价值。
- 五语言补齐 `agentChat.imageWorkbenchPreview.workflow.stepCount` / `branchCount`。
- 缺参数测试口径同步 v2：`image_task.parameters.required` 不再被当作 `tool.failed`。
- Runtime short-circuit 测试改用 current `image_command_intent`，旧 `image_skill_launch` 继续只作为被忽略的 legacy guard。

验证：

- `npx vitest run "src/components/agent/chat/components/ImageWorkbenchMessagePreview.test.tsx" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeSnapshot.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeEvents.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeRecovery.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.test.tsx"` 通过，5 个文件 / 70 个测试。
- `npm run test:rust:unit -- -p app-server media_task_payload -- --nocapture` 通过，5 个测试。
- `npm run test:rust:unit -- -p app-server image_command -- --nocapture` 通过，6 个测试。
- `npm run build:renderer:electron` 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --timeout-ms 180000` 当时通过；summary 证明 `imageCommandWorkflowUsed=true`、单张图片轻卡可见、`hasPreviewImage=true`、刷新后仍恢复，但页面文本含 `5 步` / `1 个方向` workflow 摘要。该 UI evidence 已被后续口径判定为不合格，需要重做。

当前分类：

- `current`：task artifact payload 中的 `image_command_run` / `imageCommandRun` 是图片 workflow run projection 的首期事实源。
- `current`：`workflowRun` 只作为 read model / JSONL / evidence 的审计事实源，不再作为聊天区或右侧 UI 组件输入。
- `dead`：聊天区或右侧展示 `5 步`、`1 个方向`、workflow step dots、branch titles、task id、artifact path 或 raw JSON。

下一刀：

1. 移除聊天区和右侧的 workflow chrome，只保留自然 assistant 铺垫、图片轻卡、图片结果和 caption。
2. 将 run / step / branch / route / worker attempt 写入 JSONL ledger，并用 fixture 断言 UI 不含 raw JSON / task path / workflow 摘要。
3. 收缩图片 Skill 首发残留，确认 `Skill(image_generate)` 不可用时 `@配图` current workflow 仍可创建 task。

### Checkpoint：用户口径纠偏，workflow 只进入 JSONL 审计

背景：

- 用户明确指出问题不只是右侧，而是聊天列表里图片占位框一闪而过、快速显示完成但图片 worker 未完成、raw JSON 和 workflow 卡抢占主内容。
- 用户目标图要求同一条 assistant 消息先有自然寒暄 / 工具参数铺垫，再显示轻量 `Image Generation | <model>` 图片卡，最终显示图片和 caption。
- 用户进一步明确：右侧也不需要显示 workflow；run / step / branch 只需要写到 JSONL 中，便于未来审计。

最新决策：

- 聊天区：只允许自然 assistant 铺垫、图片轻卡、running 占位、最终图片和 caption。
- 右侧：不展示 workflow 步骤、分支导轨、task id、artifact path、provider/model、attempt 或 raw JSON。
- JSONL：记录 `image_command.*` / `image_task.*` 审计事件，保留 run / step / branch / route / worker attempt / failure category。
- `turn.completed` 只能表示 Agent turn 结束，不能把 running 图片任务显示成已完成。

文档同步：

- `workflow-reference.md` 从“UI 转译规则”改为“JSONL 审计转译规则”。
- `README.md`、`product-requirements.md`、`flows.md`、`implementation-plan.md` 均收口为 JSONL 审计事实源，不再要求右侧 workflow 展示。

### Checkpoint：图片工具过程泄漏与 mock worker 质疑复核

背景：

- 用户反馈聊天列表中图片生成占位一闪而过，随后快速显示“已完成”，但真实图片 worker 尚未完成。
- 用户进一步质疑当前是否变成 `Mock worker`。需要区分测试 fixture backend 与生产图片 worker 主链，不能用 mock 成功替代真实任务状态。

结论：

- current 后端图片执行链仍是 `ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact -> lime-image-api-worker`。
- `lime-image-api-worker` 通过 App Server Provider DB / API Key 解析真实 Provider endpoint；没有可执行 Provider route 时 fail closed 写入失败，不允许 mock 成功。
- `APP_SERVER_BACKEND_MODE=runtime` 的 `image-command` fixture 用于验证 App Server ImageCommandWorkflow，不是 `APP_SERVER_BACKEND_MODE=mock`。

已完成：

- 前端 `imageWorkbenchMessageDisplay` 把 `lime_create_image_generation_task` 这类图片任务创建工具视为图片轻卡内部过程：未形成轻卡前不再把普通工具过程、`已发起 ... 的图片生成` 或 raw result 作为聊天主内容展示。
- `agentStreamEventProcessor` 在 `tool_end` 只识别到图片 task-like 结果但暂时构不出 `imageWorkbenchPreview` 时，也移除对应 `tool_use` / 通用 `taskPreview`，避免退回普通工具卡。
- `resolveTaskPreviewStatus` 补齐 `complete -> complete` 状态归一；`pending_submit` 继续投影为 running，防止 Agent turn 完成被误读成图片完成。
- 新增回归覆盖：图片任务创建工具未形成轻卡前不外显普通工具过程；宽松 task-like `tool_end` 不回退普通工具 / 通用任务卡。

验证：

- `npx vitest run "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts" "src/components/agent/chat/utils/taskPreviewImage.topLevel.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，4 个文件 / 86 个测试。
