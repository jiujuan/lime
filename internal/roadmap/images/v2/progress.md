# 图片能力 v2 进度记录

## 2026-07-04

### Checkpoint：live 生成中重复 pending 用户消息收口

背景：

- 用户截图显示同一个 `@配图` prompt 在生成过程中重复出现多份，并伴随多条 `正在准备回复 / 正在生成回复` 状态。
- 复核 `.lime/qc/gui-evidence/live-image-command/live-real-current-devrenderer-1783179568-summary.json` 后确认：该轮只存在 1 次 `agentSession/turn/start`，且 bridge health 为 `status=ok`；问题不是 mock worker，也不是后端重复发起图片生成，而是首页首发 materialize / pending preview / stream draft 的前端过渡态没有挡住重复触发。
- 最终完成态截图 `.lime/qc/gui-evidence/live-image-command/live-real-current-devrenderer-1783179568-final.png` 已能显示单条用户消息、思考、自然引导、图片轻卡、真实图片、后置描述和 Token；本 checkpoint 专门收口生成中瞬态重复。

本轮修复：

- `useTaskCenterEmptyStateSendRuntime` 新增首页首发 in-flight guard：已有 `taskCenterDraftSendRequest` 或 React 状态提交前本地 in-flight 尚未释放时，直接返回 `false`，不再重复创建 draft tab、pending preview 或调用发送链路。
- `AgentChatWorkspace` 把当前 `taskCenterDraftSendRequest` 传入首页发送 runtime，让发送入口以当前 pending request 为事实源。
- 保留真实 App Server / Agent stream / 图片 workflow 主链；未改后端 JSONL 审计结构，未引入 mock fallback。

验证：

- `npx vitest run "src/components/agent/chat/workspace/useTaskCenterDraftSendRuntime.unit.test.ts" "src/components/agent/chat/workspace/taskCenterSurfaceState.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" --silent=passed-only` 通过，45 个测试。
- `npx tsc --noEmit --project tsconfig.renderer.json --pretty false` 通过。
- `git diff --check -- "src/components/agent/chat/workspace/useTaskCenterDraftSendRuntime.ts" "src/components/agent/chat/workspace/useTaskCenterDraftSendRuntime.unit.test.ts" "src/components/agent/chat/AgentChatWorkspace.tsx"` 通过。
- 复验发现第一次 live `live-real-current-dedup-1783181459` 仍会在单次点击下触发多次 `agentSession/turn/start`，生成中 prompt 计数为 `3`；据此继续把 `useTaskCenterDraftSendDispatchRuntime` 改为同一 request id 只派发一次，并让非 materialized 临时 `draft-send-*` 在没有真实 session 前 fail closed 等待。
- `npm run smoke:claw-image-live -- --allow-live-provider --setup-agnes-from-env --app-url "http://127.0.0.1:1420/" --timeout-ms 300000 --prefix "live-real-current-dedup-fixed-1783182012"` 通过；summary 写入 `.lime/qc/gui-evidence/live-image-command/live-real-current-dedup-fixed-1783182012-summary.json`，final screenshot 为 `live-real-current-dedup-fixed-1783182012-final.png`。
- fixed live summary 关键断言：`turnStartTraceCount=1`、生成中 `promptOccurrenceCount=1 / imagePromptOccurrenceCount=1`、终态 `promptOccurrenceCount=1 / imagePromptOccurrenceCount=1`、`guiReasoningVisible=true`、`guiAssistantTextVisible=true`、`guiImagePreviewLoaded=true`、`guiRightSurfaceNotAutoOpen=true`、`workflowReadRedacted=true`、`taskAuditJsonlNoSensitiveTokens=true`。
- live smoke 门禁同步新增 `singleTurnStartTrace`，后续不只检查 UI 重复，也会拦截同一点击多次提交到 App Server 的回归。

当前判断：

- 重复 pending 展示属于 `产品阻塞 / 体验误导`，不是 mock 测试本身。
- 当前已用真实 Electron + App Server runtime + live Agnes Provider 复跑通过；同一点击只产生 1 次 `agentSession/turn/start`，生成中与终态同一 prompt 均只出现 1 次。

### Checkpoint：live @配图入口产品化、半成功 presentation 事件删除

背景：

- 用户明确要求无兼容包袱，不接受 mock worker、hard-code 图片寒暄 / 完成文案、右侧 viewer 自动展开、普通 UI 泄露 task / workflow / provider 内部字段。
- 当前主问题不是单个右侧详情，而是 `@配图` 在图片生成前后必须走普通 Agent 对话流：先有模型生成的思考 / 引导，再有 `Image Generation` 任务卡和图片预览，最后有模型生成的后置描述与 Token。
- 旧 `image_task_presentation_unavailable` 事件会让 presentation 失败后仍继续创建图片任务，造成聊天里只剩轻卡 / 占位的半成功状态；这不再保留为兼容路径。

本轮修复：

- 新增 `npm run smoke:claw-image-live` 真实 Provider live-gated 验收入口，默认 fail-closed，必须 `--allow-live-provider` 或 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1 / LIME_REAL_API_TEST=1`。
- live smoke 启动真实 Electron Desktop Host 与 `APP_SERVER_BACKEND_MODE=runtime`，通过 GUI 输入框发送 `@配图`，不走 renderer mock、App Server mock backend、fixture image provider 或 legacy `agent_runtime_*`。
- live smoke 断言同一产品闭环：
  - 用户 `@配图` 原文可见。
  - 思考 / 引导文字可见。
  - `Image Generation` 图片任务卡可见。
  - 真实图片 `<img>` 加载完成。
  - Token 可见。
  - 输入框恢复、停止按钮消失。
  - 右侧 viewer 不自动展开。
  - 普通 UI 不出现 `.lime/tasks`、`.lime/task-logs`、workflow 字段、provider 内部字段、`request_metadata`、`raw_transport_payload`、模板 task id 或 `Ribbi`。
- live smoke 额外通过 `mediaTaskArtifact/list|get`、`workflow/read`、task audit JSONL 校验后端事实源；workflow summary 必须 redacted，不包含 prompt 或 task path；JSONL 不含 API key / Authorization / Bearer。
- `claw-image-live-smoke.mjs` 拆成 options / provider / GUI / audit / common helper，主入口降到 334 行，避免继续在超 1000 行脚本里堆业务逻辑。
- 删除生产协议里的 `image_task_presentation_unavailable` / `image_task.presentation.unavailable` 半成功事件：
  - 后端 presentation 为空、失败、超时或 runtime 不可用时，改走 `image_task.create_failed -> tool.failed -> turn.completed(create_failed)`。
  - 不再创建图片任务，不再让前端用轻卡占位伪装完成。
  - 前端 protocol、App Server event stream、Agent stream handler 均不再解析 / 处理该旧事件。
  - 新增守卫确认生产源码不再包含旧 unavailable 事件。
- 收口当前 provider 重构的两个编译断点：
  - `AgentState::credential_bridge()` 去重，保留单一 current accessor。
  - `direct_text_generation` 从 `request_tool_policy` 模块引用 provider-aware stream helper，不再要求 crate root 暴露旧 façade。

验证：

- `node --check` 覆盖 live smoke 主入口与拆分 helper，通过。
- `npx prettier --write ...` 覆盖 live smoke、protocol、event stream、handler、README，通过。
- `rustfmt --edition 2021` 覆盖本轮 Rust 文件，通过。
- `npx vitest run "scripts/agent-runtime/claw-image-live-smoke.test.mjs" "src/lib/api/agentProtocol.test.ts" --silent=passed-only` 通过，32 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::image_command --lib` 通过，19 个图片命令 / presentation 测试。
- `npm run governance:scripts` 通过；只提示已忽略的本地 `__pycache__` / `.pyc` 缓存，不是本轮新增脚本。
- `git diff --check -- ...本轮文件` 通过。
- `rg` 确认 key 原文未落入仓库；旧 `image_task_presentation_unavailable` 只剩负向测试 / guard 字符串，不在生产源码。

未完成 / 阻塞：

- 本轮未实际发起新的 live Provider 图片生成，因为当前 shell 没有 `AGNES_API_KEY` 环境变量；为避免泄漏，不把聊天里出现过的 key 原文写入命令、仓库、日志或 evidence。
- 下一次 live 验证应在外部安全注入 `AGNES_API_KEY` 后运行：
  - `npm run smoke:claw-image-live -- --allow-live-provider --setup-agnes-from-env --timeout-ms 300000`
  - 如当前 UI 默认文本 Provider 未配置，还需同时传 `--text-provider-preference <id> --text-model-preference <model>`，否则会按 fail-closed 暴露文本模型配置缺口。

当前分类：

- `current`：`Agent turn -> ImageCommandWorkflow presentation -> mediaTaskArtifact/list|get -> task JSONL -> workflow/read -> imageWorkbenchPreview`。
- `audit-only`：workflow run / step、task path、provider routing、raw transport payload、request metadata。
- `test-only`：deterministic fixture、local image provider fixture、external backend fixture。
- `dead`：`image_task_presentation_unavailable` 半成功事件、前端 hard-code 图片寒暄 / 完成模板、右侧 workflow 自动展开、普通 UI 展示 raw task JSON。

### Checkpoint：历史图片结果点击后 viewer 不再泄露内部审计字段

背景：

- 用户继续要求真实 Playwright 测试，且右侧普通 UI 不应显示 workflow / task / provider routing / policy 等内部事实；这些事实只应留在 JSONL、task artifact、read model evidence 或专用审计入口。
- `sess_98203a39383e4f17a4fdbe9962b115bd` 历史恢复已能显示思考、自然引导、图片轻卡、远程图片和 Token，但重新点击 `打开图片结果` 时，右侧 viewer 仍显示 `运行合同`、`LimeCore 策略输入待命中`、provider id、model slug 等内部字段。

已完成：

- `ImageTaskViewer` 普通结果详情不再渲染 runtime contract、model registry、LimeCore policy、provider id 或 model slug。
- 打开独立资源管理器时也不再把 providerName / modelName 从 runtime contract 透传到普通图片 metadata。
- 保留用户需要的结果状态、图片预览、输出数量、尺寸、分镜标签、继续重绘 / 保存 / 应用等动作。
- 审计事实仍保留在 JSONL / task artifact / App Server read model，不进入普通 viewer。

真实 Playwright 验证：

- 会话：`sess_98203a39383e4f17a4fdbe9962b115bd`。
- Playwright 使用系统 Chrome channel 打开 `http://127.0.0.1:1420/`，通过 `sessionStorage` 恢复目标历史会话；`bridgeHealth.status=ok` 且 `transport=electron-host`，不触发新图片生成、不使用 mock。
- 点击前断言：
  - `viewerOpen=false`，右侧 viewer 不自动展开。
  - `hasGuidance=true`、`hasReasoning=true`、`hasImageGenerationCard=true`、`hasTokenUsage=true`、`hasRemoteImage=true`。
  - 普通聊天区未命中 `workflow.*`、task path、raw JSON、`Ribbi`、mock worker 等泄露词。
- 点击 `打开图片结果` 后断言：
  - `afterViewerOpen=true`、`afterViewerHasImage=true`。
  - viewer 未命中 `运行合同`、`Runtime contract`、`LimeCore`、`model_registry`、`image_generation 路由`、`custom-*`、`agnes-image-2.1-flash`、workflow、`.lime/tasks`、`.lime/task-logs`。
  - console error 为 0。
- 通过证据：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-click-open-after-viewer-fix-1783140911351.json`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-click-open-after-viewer-fix-1783140911351-before-click.png`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-click-open-after-viewer-fix-1783140911351-after-click.png`
- 收口只读复测证据：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-recheck-1783142978197.json`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-recheck-1783142978197-before-click.png`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-recheck-1783142978197-after-click.png`
  - 该复测使用 Playwright CLI Chrome channel，通过 `sessionStorage` 恢复既有 live session；只读取历史与点击 `打开图片结果`，不发送新消息、不触发新图片生成。
- 本轮追加稳定只读复测证据：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-stable-recheck-1783144937521.json`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-stable-recheck-1783144937521-before-click.png`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-readonly-stable-recheck-1783144937521-after-click.png`
  - 该复测使用 Playwright CLI + 系统 Chrome channel，先从最近对话只读打开目标历史，再等待历史 hydrate 稳定；`bridgeHealth.body={"status":"ok","transport":"electron-host"}`。
  - 断言 `beforeStableWithin30s=true`、`beforeHasNoRunningPlaceholder=true`、`beforeHasTokenUsage=true`，证明历史详情会从短暂 hydrate 态恢复到完成态，而不是需要点击右侧 viewer 才补齐 Token / 完成文案。
- 修复前问题证据：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-click-open-1783140582042.json`

验证：

- `npx vitest run "src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts" "src/components/agent/chat/hooks/agentChatHistoryReadModel.test.ts" "src/components/agent/chat/hooks/agentChatHistoryLocalMerge.imageTasks.test.ts" "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/components/agent/chat/components/ImageTaskViewer.test.tsx" --silent=passed-only` 通过，41 个测试。
- `npx eslint "src/components/agent/chat/hooks/agentChatHistoryUsage.ts" "src/components/agent/chat/hooks/agentChatHistoryHydrate.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistoryReadModel.ts" "src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts" "src/components/agent/chat/components/ImageTaskViewer.tsx" "src/components/agent/chat/components/ImageTaskViewer.test.tsx" --max-warnings 0` 通过。
- `git diff --check -- ...` 针对本轮文件通过。
- `npm run bridge:health -- --timeout-ms 120000` 通过，`transport=electron-host`。
- `npm run verify:gui-smoke` 通过；renderer smoke build、Electron host build、App Server sidecar、renderer loaded、app-server initialized、claw workbench shell ready、memory settings ready。
- `npx tsc --noEmit --project tsconfig.node.json --pretty false` 通过。
- `npx tsc --noEmit --project tsconfig.renderer.json --pretty false` 通过。本轮补齐 i18next 类型层 `keySeparator=false` 与 `react-syntax-highlighter/dist/esm/*` 子路径声明后，renderer typecheck 不再出现 `t(...)` 返回 `unknown` 或高亮模块声明缺失。
- `npx eslint "src/vite-env.d.ts" "src/i18n/types.d.ts" --max-warnings 0 --no-warn-ignored` 通过。
- `npm run test:related -- ...本轮文件` 曾进入过宽相关测试集，被用户中断前暴露 `src/components/agent/chat/index.workbench01.test.tsx` 的 hook timeout / pending preview 断言失败，以及 `src/components/agent/chat/index.test.tsx` 的隐藏草稿首页导航断言失败；这些失败不在图片 viewer / 历史 usage 本轮写集内，且定向图片历史 / viewer 回归已通过，暂按宽范围 related 噪音与既有脏工作树风险登记，不作为本 checkpoint 阻塞。

收口复核：

- 当前工作树非常脏，存在多组并行 Rust / Plugin / workflow 改动和删除；本 checkpoint 只归因本轮触碰的图片历史 usage 与 `ImageTaskViewer` 文件。
- 扫描本轮产品路径未发现 `Ribbi`；`好啊 / 搞定 / 马上生成` 仅出现在路线图证据、测试 fixture 或后端 presentation 解析测试中，不是前端产品模板拼接。
- `lime-rs/crates/app-server/src/runtime_backend/image_command/**` 中已无 `ImageCommandIntent::from_scope_only`，对应 dead_code warning 未复现。
- 只读 Playwright 复测断言 `realBridge=true`、`beforeViewerClosed=true`、`beforeHasGuidance=true`、`beforeHasReasoning=true`、`beforeHasImageGenerationCard=true`、`beforeHasTokenUsage=true`、`beforeHasRemoteImage=true`、`afterViewerOpen=true`、`afterViewerHasImage=true`、`noBeforeLeaks=true`、`noAfterLeaks=true`、`noConsoleErrors=true`。
- 稳定只读 Playwright 复测额外确认历史详情在 30 秒内从 hydrate 态稳定到完成态，且点击前右侧 viewer 仍关闭、图片轻卡已显示自然后置描述与 `1.3K Tokens`；点击后 viewer 打开并显示远程图片，普通 UI 仍无内部字段泄露。

### Checkpoint：current 工作树收尾验证与 warning 复核

背景：

- 用户继续追问 live 结果是否真实、是否仍有 hard code / mock / warning 残留。
- 本轮不扩大功能面，只复核当前工作树的图片命令、workflow 专用 read model、App Server binary、bridge 和协议契约。

验证：

- `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 通过，未复现 `ImageCommandIntent::from_scope_only` dead_code warning；当前源码已无 `from_scope_only` 符号。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server workflow -- --nocapture` 通过，42 个 workflow 相关测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command -- --nocapture` 通过，20 个图片命令测试，`media_task_jsonrpc` 中 image command 集成用例同步通过。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all -- --check` 通过。
- `npm run bridge:health -- --timeout-ms 120000` 通过，Electron bridge health 为 `status=ok`。
- `npm run test:contracts` 通过，覆盖 protocol types、App Server client contract、command contracts、harness contracts、modality contracts、scripts governance、Electron release workflow、harness cleanup 和 docs boundary。
- `git diff --check` 通过。

证据复核：

- 最新 live UI 截图 `.lime/evidence/live-new-image-current-ui.png` 可见：用户 `@配图` 原文、`已完成思考`、模型生成的自然前置文案、`Image Generation | Agnes Image 2.1 Flash` 轻卡、真实图片预览、后置描述和 token footer。
- 普通 UI 未显示右侧 viewer、raw JSON、任务 ID、task path 或 workflow step；审计信息仍只进入 JSONL / task artifact / evidence / `workflow/read` 专用接口。

### Checkpoint：live Agnes 链路完成态与 workflow audit 终态顺序修复

背景：

- 用户明确要求不要用 mock / fixture 证明图片能力，也不要再通过前端 hard code 拼“寒暄 / 搞定”模板。
- 本轮真实 Electron + App Server + Agnes Image 2.1 Flash 已经跑通新会话，但暴露出一个后端审计顺序问题：`emit_task_created(...)` 过早发 `turn.completed`，导致后续 `workflow.step.completed` / `workflow.run.completed` 被 runtime 终态保护吞掉，`workflow-events.jsonl` 只停在 `workflow.step.started`。
- UI 仍必须只展示普通用户需要看的对话结构；workflow、task id、task path、raw JSON 只进入 JSONL / task artifact / evidence，右侧 viewer 不自动展开。

live 结果：

- session：`sess_f2bae36d182648a69b2b108b39c91272`。
- turn：`201519bb-2610-404b-a8d4-ce3183a4c608`。
- task：`10d0e8d2-e33b-4123-acb0-2952764e6f7a`。
- 真实 task artifact：`$HOME/Library/Application Support/lime/projects/Skill Think Keep Audit 20260513/.lime/tasks/image_generate/20260703-225844-2aa1f88a44704870900d9ae2348cf5d7.json`。
- 真实 worker JSONL：`.lime/task-logs/10d0e8d2-e33b-4123-acb0-2952764e6f7a/attempt_1.jsonl`，事件序列为 `worker_loaded -> task_queued -> task_running -> request_slot_started -> request_slot_succeeded -> task_succeeded`。
- 真实输出 URL：`https://platform-outputs.agnes-ai.space/images/t2i/ceee908a2a3f43c29b0c16f84e8dca1d.png`。
- UI 截图证据：`.lime/evidence/live-new-image-current-ui.png`。

UI 验证：

- 对话列表中保留用户 `@配图` 原文、`已完成思考`、模型生成的自然引导、`Image Generation | Agnes Image 2.1 Flash` 轻卡、真实远程图片预览、完成 caption 和 token footer。
- 普通 UI 未出现 raw JSON、任务 ID、task path、workflow step 或右侧 viewer 自动展开。
- 前置引导 / 后置 caption 来自 App Server presentation / task payload，不在前端按 prompt 拼模板。

本轮修复：

- `ImageCommandWorkflow` 拆分图片任务创建事件：`emit_task_created(...)` 现在只发 `image_task.created` + `tool.result`。
- workflow audit 先写 `workflow.step.completed` 和 `workflow.run.completed`，最后再调用 `emit_task_created_turn_completed(...)` 发 `turn.completed`。
- `media_task_jsonrpc` 测试 harness 接入 `EventLogWriter`，新增断言：
  - user-visible session stream 不包含 `workflow.*`。
  - `workflow-events.jsonl` 包含 `workflow.step.completed`。
  - `workflow-events.jsonl` 包含 `workflow.run.completed`。

验证：

- `npm run bridge:health -- --timeout-ms 120000` 通过。
- Playwright CLI 通过 CDP 连接真实 Electron `http://127.0.0.1:9223`，完成 live `@配图` 新会话验证，证据见 `.lime/evidence/live-new-image-current-ui.png`。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server image_command -- --nocapture` 通过，20 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --test media_task_jsonrpc image_command -- --nocapture` 通过，1 个测试。
- `npx vitest run "src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.test.tsx" --silent=passed-only` 通过，49 个测试。
- `npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" --silent=passed-only` 通过，53 个测试。
- `npm run test:contracts` 通过。
- `git diff --check` 通过。

当前分类：

- `current`：`Agent turn -> App Server ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact -> lime-image-api-worker -> imageWorkbenchPreview`。
- `audit-only`：workflow run / step / provider / model / task path / raw JSON 只进入 workflow JSONL、session JSONL、task artifact 和 evidence。
- `test-only`：fixture / MockBackend 只作为回归守卫，不能作为图片能力交付证据。
- `dead`：前端 hard-code 图片寒暄 / 完成文案、renderer mock 图片成功、右侧 workflow 自动展开、普通聊天展示 raw task JSON。

剩余缺口：

- 本轮 current live 链路已达到可交付门槛；后续可继续补更重的 `verify:gui-smoke` / 历史会话 Playwright 续测，但不应再把 mock 路径当作交付证据。

## 2026-07-03

### Checkpoint：真实 Electron + runtime + Agnes live 验证通过

背景：

- 用户明确指出此前验证不能再用 mock / fixture，当轮必须跑真实 Electron、真实 App Server runtime sidecar、真实 Agnes 图片生成链路。
- 需要验证的不是“图片能出来”而已，而是同一条 assistant 消息中保留自然前置引导、图片轻卡、真实图片预览和完成描述；raw JSON / task id / 内部路径只进入 JSONL / task log / read model 审计，不进入普通 UI。

真实环境：

- Electron Desktop Host：`.lime/electron-dev-host/Lime.app/Contents/MacOS/Lime --remote-debugging-port=9223 .`。
- App Server sidecar：`lime-rs/target/debug/app-server --stdio --backend runtime --data-dir "$HOME/Library/Application Support/lime/app-server"`。
- Bridge health：`http://127.0.0.1:3030/health` 返回 `{"status":"ok","transport":"electron-host"}`。
- CDP：`http://127.0.0.1:9223/json/version` 返回 Electron `Lime/1.87.0`。

本轮修复：

- `ImageCommandWorkflow` 的 presentation 预算从过短的快路径提升到 `45s`，避免真实文本模型冷启动 / 排队时过早发 `image_task.presentation.unavailable`。
- `turn.completed` 携带 presentation 文本模型 usage，历史和 token footer 能从真实 turn 终态读取用量。
- `services` 中已迁出的 `agent_session_store` 不再作为 current module 暴露，`lime-agent` 作为 current owner 暴露会话存储，保证 Rust workspace 能构建当前 App Server。

live 输入：

- `@配图 用 Agnes Image 2.1 Flash 画一张深圳夏天傍晚的真实摄影照片，街边绿树、高楼、海风和暖色夕阳，画面自然，不要文字 live-1783096716883`

live 结果：

- session：`sess_8541091911564f4cb2f975262b87ac50`。
- turn：`61042753-1838-426a-8ffa-10e6dbe5693e`。
- task：`61276cc0-2254-4756-9df7-55d5a4bfd29d`。
- 真实 task artifact：`$HOME/Library/Application Support/lime/projects/Skill Think Keep Audit 20260513/.lime/tasks/image_generate/20260703-163852-1d245fb6556449e39e27b8a35b80b910.json`。
- 真实图片输出：`https://platform-outputs.agnes-ai.space/images/t2i/60ae4d5909e04e8f9917ddc2c9bd86c9.png`。
- UI 历史恢复后可见结构：
  - 用户消息：`@配图 ... live-1783096716883`。
  - assistant 前置引导：`好的，这就为您呈现深圳夏日傍晚的迷人街景。`
  - 图片轻卡：`Image Generation | Agnes Image 2.1 Flash`。
  - 图片预览：远端 `platform-outputs.agnes-ai.space` 真实图片，`1024x1024`。
  - 完成描述：`照片已生成。暖色调的夕阳洒在绿树与高楼之间，海风似乎正拂过画面，氛围自然惬意。如果需要调整光影或构图细节，随时告诉我。`
- 普通 UI 扫描未出现 `任务 ID`、`task_id`、`artifact_path`、`workflow_run_id`、`.lime/tasks`、`JSONL` 或 raw JSON。
- 右侧 viewer 未自动打开。

JSONL / 审计证据：

- presentation 模型请求：`$HOME/Library/Application Support/lime/agent/state/logs/llm_request.1.jsonl`，runtime context 为 `sess_8541091911564f4cb2f975262b87ac50:image-presentation:61042753-1838-426a-8ffa-10e6dbe5693e`，模型 `agnes-2.0-flash`，`tool_surface=direct_answer`。
- session event log：`$HOME/Library/Application Support/lime/app-server/runtime/events/sessions/session_sess_8541091911564f4cb2f975262b87ac50.jsonl`，包含 `message.created`、`image_task.presentation.generated`、`tool.started`、`tool.ended`、`turn.completed`，其中 `turn.completed.usage.input_tokens=1097`、`output_tokens=70`。
- image worker task log：`.lime/task-logs/61276cc0-2254-4756-9df7-55d5a4bfd29d/attempt_1.jsonl`，事件序列为 `worker_loaded -> task_queued -> task_running -> request_slot_started -> request_slot_succeeded -> task_succeeded`。

验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all -- --check` 通过。
- `git diff --check -- "lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs" "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs" "lime-rs/crates/agent/src/lib.rs" "lime-rs/crates/services/src/lib.rs"` 通过。
- `npm run test:rust:unit -- -p app-server image_command` 通过，19 个测试。
- `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 通过。
- Playwright CLI 通过 CDP 连接真实 Electron 页签，截图证据：`.lime/evidence/image-command-live-1783096716883-history.png`。

当前分类：

- `current`：真实 `Agent turn -> App Server ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact -> lime-image-api-worker -> imageWorkbenchPreview`。
- `audit-only`：presentation request summary、workflow/task 参数、task path、worker attempt log、raw JSON 和内部路径只进 JSONL / task artifact / read model / evidence。
- `test-only`：此前 Electron fixture 仍只用于稳定回归，不作为本 checkpoint 的交付证据。
- `dead`：前端 hard-code 图片寒暄 / 完成文案、App Server mock backend 伪造图片成功、右侧 viewer 自动展开 workflow、普通 UI 展示 raw task JSON。

待继续确认：

- 本次 live 发送后主区曾短暂回到空态，但从最近对话打开后历史完整恢复。后端 event log、task artifact、JSONL 和 read model 均完整；下一刀需要确认 active session 前端状态为何被清空，避免用户误以为“打开历史对话数据没了”。

### Checkpoint：presentation 文本路由与流事件乱序收口

背景：

- live 日志仍出现 `image_task_presentation_unavailable`，且截图里只剩图片轻卡 / 占位，不像参考结构中的“前置寒暄 -> 图片生成轻卡 -> 图片预览 -> 后置描述”。
- 根因不是再补前端模板，而是两条 current 主链缺口：
  - App Server presentation 仍可能复用当前 turn 的图片模型 / Agnes direct provider config，导致“写对话文案”的请求打到图片接口。
  - 前端默认 `image_task_presentation_generated` 一定晚于 `image_task_created`；乱序时 completion caption 没有合入新建的 assistant 图片轻卡。

已完成：

- `ImageCommandWorkflow` 的 presentation 路由新增文本模型选择器：优先消费 `fast / base / coding / local` 文本槽位，其次才看 session default / host config / explicit preference，并显式跳过 Agnes、Fal、`gpt-image`、`dall-e`、Flux、SD 等图片模型选择。
- presentation 只在 host direct provider config 与选中的文本 provider/model 完全一致时复用 direct config；如果 host direct config 指向图片模型，会记录 `presentation_direct_config_skipped_for_non_text_selection`，然后走文本 Provider 路由。
- `image_task.presentation.unavailable` 的 reason code 细化为 `presentation_text_model_unavailable` / `presentation_text_route_unavailable` / `presentation_generation_failed`，便于继续排查 live Provider。
- 前端 `StreamRequestState` 增加 pending image presentation 缓存：presentation 先到时缓存 `assistant_intro / completion_caption`，created 后到时合入同一 assistant 消息和 `imageWorkbenchPreview.caption`。
- 前端仍不生成“好啊 / 搞定 / 马上生成”模板；已有自然寒暄 / thinking 不被 presentation 覆盖，右侧 viewer 不自动打开，workflow/task id/raw JSON 继续只进 JSONL / evidence。

验证：

- `npm run test:rust:unit -- -p app-server image_command::presentation` 通过，9 个测试。
- `npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/lib/api/agentProtocol.test.ts" --silent=passed-only` 通过，3 个文件 / 92 个测试。
- `rustfmt --edition 2021 --check "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs" "lime-rs/crates/app-server/src/runtime_backend/image_command/mod.rs"` 通过。
- `git diff --check -- ...本轮触碰文件` 通过。
- `npm run smoke:agent-runtime-current-fixture` 通过，覆盖图片命令 GUI Electron fixture、普通自然语言画图意图 GUI Electron fixture及其它 Agent Runtime current fixture。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --prefix images-v2-presentation-route-cache-fixed --timeout-ms 180000` 通过；summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-presentation-route-cache-fixed-summary.json`。

GUI 证据：

- `guiImageCommandTerminal.bodyText` 包含用户输入、前置文案“好啊，这张图我来处理，先把画面氛围定准。”、轻卡“图片生成 | GPT Image 1”和完成 caption“完成了，画面已经生成。想更清爽、更写实或换构图，都可以继续调。”
- `guiImageCommandTerminal`：`cardCount=1`、`mediaCount=1`、`hasPreviewImage=true`、`hasLoadedVisiblePreviewImage=true`、`taskIdVisible=false`、`visiblePendingStatus=false`。
- `guiImageCommandRestoredAfterReload` 同样保持 `cardCount=1`、`mediaCount=1`、`hasPreviewImage=true`，说明历史恢复没有丢前后文案和图片预览。
- `imageCommandTaskAuditLog`：JSONL 存在，事件序列为 `worker_loaded -> task_queued -> task_running -> request_slot_started -> request_slot_succeeded -> task_succeeded`，敏感 token 扫描通过。

当前分类：

- `current`：图片 task 仍走 `ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate/*.json -> worker -> imageWorkbenchPreview`；presentation 是独立文本模型首刀，不复用图片模型。
- `audit-only`：workflow run / step / branch / provider / model / task path / JSONL 继续只进入 read model、JSONL 和 evidence。
- `test-only`：Electron fixture 的本地文本 / 图片 Provider endpoint，只用于证明 current 主链，不作为生产 fallback。
- `dead`：前端模板硬编码图片寒暄、图片模型承担 presentation 文案生成、右侧 workflow 自动展示、raw task JSON 进入普通聊天 UI。

### Checkpoint：presentation direct generation 去除 StructuredOutput 重试环

背景：

- `@配图` 和普通画图意图的图片任务、图片预览、JSONL 审计均已跑通，但聊天区仍缺少图片生成前的自然引导和完成后的自然 caption。
- 诊断发现 App Server presentation 请求已经正确命中文本 Provider，Provider 也返回了 `assistant_intro / completion_caption` JSON。
- 根因是 `ImageCommandWorkflow` 给 direct text generation 注入了 structured-output schema，同时 direct generation 禁用工具；Agent 因此反复要求模型调用 `StructuredOutput`，直到 presentation timeout，导致 GUI 收到 `image_task.presentation.unavailable`。

已完成：

- `image_command/presentation.rs` 改为复用 `lime-agent` direct text generation，但不再注入 structured-output schema；JSON 合同由 prompt + 后端解析 / 语言 / 禁词校验负责。
- presentation 生成链补充安全 tracing：记录 provider/model、输出长度、解析失败分类和脱敏输出预览，便于后续排查，不记录内部 prompt、API key 或 raw task 文件内容。
- 前端 App Server event projection / Agent protocol 保留 `reasonCode / reason_code`，后续 presentation unavailable 不再在 debug 中丢失原因。
- Electron fixture 的文本 Provider evidence 增加脱敏请求摘要，可看到请求是否携带 presentation contract、message roles 和 content preview，避免再次盲猜请求形状。

验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all -- --check` 通过。
- `npm run test:rust:unit -- -p app-server image_command::presentation` 通过，6 个测试。
- `npx vitest run "src/lib/api/agentProtocol.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only` 通过，2 个文件 / 50 个测试。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --prefix images-v2-reference-followup-fixed --timeout-ms 180000` 通过；summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-reference-followup-fixed-summary.json`。
- `npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --prefix images-v2-plain-image-intent-fixed --timeout-ms 180000` 通过；summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-plain-image-intent-fixed-summary.json`。
- `npm run smoke:agent-runtime-current-fixture` 通过；聚合覆盖图片命令 GUI Electron fixture、普通画图意图 GUI Electron fixture、停止后继续、Plan、Skills、MCP、Expert 和 Content Factory 场景。

当前分类：

- `current`：图片对话自然引导与完成 caption 由 App Server presentation model output 驱动，并合入同一 assistant 消息。
- `audit-only`：workflow/task id、raw task JSON、task path 和工具参数继续只进 JSONL / evidence / read model，不进入普通聊天 UI。
- `test-only`：文本 Provider fixture 只用于验证 OpenAI-compatible current runtime 调用链，不作为生产 fallback。
- `dead`：前端模板拼“好啊 / 搞定”、structured-output 工具重试环、右侧自动展开 workflow。

### Checkpoint：历史恢复保留 Agent 铺垫与后端图片 caption

背景：

- 用户再次确认参考图重点是同一条 assistant 消息的自然结构：前置寒暄 / 思考、轻量 `Image Generation | <model>` 卡、图片预览、后置结果描述。
- 不能通过前端模板硬编码“好啊 / 马上生成 / 搞定”来伪造体验；这些文案必须来自 App Server presentation / SOUL 或模型真实输出。
- 图片任务仍可能处于 `pending_submit`，不能因为已有 completion caption 就在 UI 中提前显示“完成”。

已完成：

- 历史 `thread_read.tool_calls` 中的图片任务会合入同一 turn 的 assistant 消息，保留已有 `thinking` 和真实寒暄文本，不再生成一条空白图片 assistant 消息。
- `buildImageTaskPreviewFromToolResult` 会从后端 `record.payload.presentation.result_captions.complete` 读取并保留 completion caption，供任务进入完成态后展示；`running` 状态下聊天轻卡继续不显示完成 caption。
- 图片任务 snapshot 测试改为显式提供后端 `presentation.assistant_intro`，不再依赖前端根据 prompt 拼装寒暄模板。

验证：

- `npm test -- --run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/components/imageWorkbenchMessageDisplay.test.ts" "src/components/agent/chat/components/messageListItemProjection.contentParts.unit.test.ts" "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/components/agent/chat/hooks/agentChatHistory.test.ts" "src/components/agent/chat/utils/taskPreviewFromToolResult.test.ts"` 通过，6 个文件 / 117 个测试。
- `npm test -- --run "src/components/agent/chat/components/ImageWorkbenchMessagePreview.test.tsx" "src/components/agent/chat/utils/imageWorkbenchPresentation.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimePayload.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeMessages.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeSnapshot.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeGuards.unit.test.ts" "src/components/agent/chat/workspace/useWorkspaceImageTaskPreviewRuntime.test.tsx"` 通过，7 个文件 / 90 个测试。

当前分类：

- `current`：后端 presentation / read model / task artifact 驱动聊天轻卡、历史恢复和完成 caption。
- `audit-only`：workflow run / step / branch / task path / raw JSON 继续只进 JSONL、read model 和 evidence。
- `dead`：前端按图片 prompt 拼寒暄、running 阶段展示完成文案、右侧自动打开 workflow。

### Checkpoint：Playwright E2E fixture 配置同步，图片 v2 核心场景跑通

背景：

- `image-command` Playwright Electron fixture 一度失败在 `ImageCommandWorkflow 未创建匹配的 image task artifact`。
- GUI 发送的 `harness.image_command_intent` 已存在，但前端不再把图片 Provider / Model 直接写进 turn metadata；这是 v2 避免图片模型污染普通 Agent Chat 的正确方向。
- E2E fixture 中 Electron `save_config` 写入 `electron-user-data/config.yaml`，而 App Server `ConfigManager::default_config_path()` 在 macOS fixture 环境读取 `$HOME/Library/Application Support/lime/config.yaml`，导致 App Server 侧缺默认图片模型。

已完成：

- `claw-chat-current-fixture` 在创建 fixture 图片 Provider 后，同步把 `preferredProviderId / preferredModelId` 写入 App Server 侧 fixture config。
- summary 增加 `appServerConfigBinding`，可直接看到同步写入的 `$HOME/.config/lime/config.yaml` 与 macOS config path。
- 未恢复前端把图片模型写进普通 turn metadata 的旧做法，仍保持 `providerPreference/modelPreference = null`。

验证：

- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only` 通过，23 个测试。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --prefix images-v2-image-command-playwright --timeout-ms 180000` 通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-image-command-playwright-summary.json`。
- `npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --prefix images-v2-plain-image-intent-playwright --timeout-ms 180000` 通过，summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-plain-image-intent-playwright-summary.json`。
- `git diff --check -- scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs` 通过。

当前分类：

- `current`：`Agent turn -> ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact + lime-image-api-worker -> GUI imageWorkbenchPreview`。
- `test-only`：Playwright fixture 写双份 config，只用于让 Electron E2E 自定义 userData 与 App Server `$HOME` config 在测试环境中对齐。
- `dead`：通过重新把图片 Provider / Model 塞回普通 turn provider preference 来修 E2E。

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

### Checkpoint：JSONL 审计与真实 GUI 图片主链验证通过

背景：

- 用户要求继续验证，不只证明右侧 viewer 不显示，还要证明聊天列表图片占位不会一闪而过、普通“画一张图”意图不会假完成、图片 worker 不是 mock 成功。
- 用户明确要求 workflow / run / step / task id 不进入聊天区或右侧，审计信息只写 JSONL。

本轮验证结论：

- `@配图` 和普通画图意图都已走 `ImageCommandWorkflow -> mediaTaskArtifact/image/create -> .lime/tasks/image_generate task artifact -> lime-image-api-worker`。
- 两条 Electron fixture 均使用 `APP_SERVER_BACKEND_MODE=runtime`，图片 Provider 是本地 fixture endpoint；这证明 App Server / task worker / GUI current 链路，不调用正式 Provider，也不是 App Server mock backend。
- GUI 截图中聊天区包含自然引导文本、图片任务轻卡、真实图片预览和完成 caption；右侧 viewer 未自动打开。
- task artifact 的 `attempts[].logs_ref` 指向 `.lime/task-logs/<task_id>/attempt_1.jsonl`，JSONL 实际落盘。
- JSONL 事件序列为 `worker_loaded -> task_queued -> task_running -> request_slot_started -> request_slot_succeeded -> task_succeeded`。
- JSONL 扫描未出现 `Authorization` / `Bearer` / `api_key` / fixture API key 等敏感标记。
- GUI 可见文本扫描未出现禁用品牌词、`任务 ID`、`任务文件`、`Image Workbench`、`图片工作台`。

验证：

- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --keep-temp --evidence-dir ".lime/qc/image-command-jsonl-verify" --prefix "image-command-jsonl" --timeout-ms 180000` 通过；summary：`.lime/qc/image-command-jsonl-verify/image-command-jsonl-summary.json`。
- `npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --keep-temp --evidence-dir ".lime/qc/plain-image-intent-jsonl-verify" --prefix "plain-image-intent-jsonl" --timeout-ms 180000` 通过；summary：`.lime/qc/plain-image-intent-jsonl-verify/plain-image-intent-jsonl-summary.json`。
- `npm run test:contracts` 通过。
- `cargo fmt --manifest-path "lime-rs/crates/media-runtime/Cargo.toml" --check` 通过。
- `cargo fmt --manifest-path "lime-rs/crates/app-server/Cargo.toml" --check` 通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-media-runtime image_worker --lib` 通过，17 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_task_worker --lib` 通过，13 个测试。
- `npx vitest run "src/components/agent/chat/components/ImageWorkbenchMessagePreview.test.tsx" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeMessages.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeSnapshot.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeState.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeEvents.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeGuards.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimeRecovery.unit.test.ts" "src/components/agent/chat/workspace/imageTaskPreviewRuntimePayload.unit.test.ts" "src/components/agent/chat/workspace/imageCommandIntent.test.ts" "src/components/agent/chat/utils/imageWorkbenchCommand.unit.test.ts" "src/components/agent/chat/utils/imageWorkbenchCommand.test.ts" "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx"` 通过，13 个文件 / 279 个测试。
- `npm run verify:gui-smoke` 通过。
- `npm run smoke:agent-runtime-current-fixture` 通过，覆盖图片命令 GUI Electron fixture、普通自然语言画图意图 GUI Electron fixture及其它 Agent Runtime current fixture。
- `git diff --check` 通过。

当前分类：

- `current`：图片任务状态、图片结果和恢复以 `.lime/tasks/image_generate/*.json` + `imageWorkbenchPreview` 为事实源。
- `audit-only`：worker attempt、route、run/step/branch、failure category 和 task 文件细节只进入 JSONL / evidence / read model。
- `test-only`：Electron 图片 fixture 的本地 image provider endpoint，只用于离线证明 current 链路，不作为生产 fallback。
- `dead`：右侧 workflow 自动展示、聊天区 raw JSON / task id / task path、前端伪造图片完成态、App Server mock backend 伪造图片成功。

补充固化：

- `claw-chat-current-fixture` 的图片场景 summary 新增 `imageCommandTaskAuditLog`，自动摘要 `logs_ref`、行数、事件名、事件序列、task id 一致性和敏感 token 扫描结果。
- 图片场景断言新增 `imageCommandTaskAuditLogWritten`、`imageCommandTaskAuditLogEventSequence`、`imageCommandTaskAuditLogNoSensitiveTokens`，后续 `image-command` 和 `plain-image-intent` fixture 会自动失败，而不是依赖人工读取临时目录。
- `logsRefLooksLikeTaskLog=true` 使用未脱敏原始值计算；summary 中的 `task-logs` 路径展示仍会经过通用 evidence 脱敏。

补充验证：

- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only` 通过，1 个文件 / 23 个测试。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --keep-temp --evidence-dir ".lime/qc/image-command-audit-summary-verify" --prefix "image-command-audit-summary" --timeout-ms 180000` 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --keep-temp --evidence-dir ".lime/qc/plain-image-intent-audit-summary-verify" --prefix "plain-image-intent-audit-summary" --timeout-ms 180000` 通过。

### Checkpoint：Agnes Image 2.1 Flash 渠道一致性

背景：

- 用户要求支持 Agnes `agnes-image-2.1-flash` 渠道，并允许为跑通图片业务调整前后端产品实现。
- 官方文档事实源：`https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash`；关键接入点是 `POST https://apihub.agnes-ai.com/v1/images/generations`、模型名 `agnes-image-2.1-flash`、`response_format` 放在 `extra_body.response_format`，图生图输入放在 `extra_body.image`。

已完成：

- 前端图片能力目录新增 Agnes 一等 Provider entry，不再只靠 custom model heuristic 识别。
- 内置图片模型目录新增 `agnes-image-2.1-flash`，设置页和工作区图片命令共享同一事实源。
- App Server route 测试把 Agnes 官方 host 固化为 `https://apihub.agnes-ai.com/v1/images/generations`。
- 添加模型面板新增 Agnes 推荐模板：对用户仍显示为 OpenAI 兼容格式，不新增第三种 API 格式；模板自动填入 `https://apihub.agnes-ai.com/v1` 和 `agnes-image-2.1-flash`。
- provider host 归一化新增 Agnes 文档页识别，误填 `agnes-ai.com/zh-Hans/docs/agnes-image-21-flash` 或 `wiki.agnes-ai.com/zh-Hans/docs/agnes-image-21-flash` 时会修正到官方 API Base URL。
- 保留旧 `https://api.agnes-ai.com/v1` 兼容断言，避免已有用户配置突然失效。
- media-runtime 既有测试已覆盖 Agnes 请求体：顶层不写 `response_format`，`extra_body.response_format=url`，参考图写入 `extra_body.image`，响应支持 `data[0].url`。

验证：

- `npx vitest run "src/components/api-key-provider/ApiKeyProviderSection.ui.test.tsx" "src/components/api-key-provider/providerConfigUtils.test.ts" --silent=passed-only` 通过，48 个测试；覆盖 Agnes 模板不显示 Anthropic 格式、激活时写入 OpenAI 类型、官方 host 和官方模型。
- `npx vitest run "src/lib/imageGen/catalog.test.ts" "src/components/settings-v2/agent/image-gen/index.test.tsx" --silent=passed-only` 通过，20 个测试。
- `npx vitest run "src/lib/imageGen/catalog.test.ts" --silent=passed-only` 通过，13 个测试；覆盖 `custom-openai + apihub.agnes-ai.com` 仍会归入 Agnes，而不是被通用 OpenAI 条目抢走。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_task_worker --lib` 通过，13 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-media-runtime image_worker --lib` 通过，17 个测试。
- `npm run test:contracts` 通过。
- `git diff --check` 通过。
- 禁用品牌词与死代码告警扫描在本轮触碰范围无命中。
- live Provider 调用不进入默认验证；只有用户显式提供 Agnes API key 并接受额度消耗时，才通过 live-gated smoke 单独跑。

### Checkpoint：Agnes 添加模型真实 UI 复核

背景：

- 用户追问是否需要新增其他 API 格式；产品口径已确定 Agnes 不新增第三种格式，而是作为 OpenAI 兼容渠道。
- 需要用真实页面点击链确认用户看到的是 `OpenAI compatible / OpenAI 兼容`，而不是 `Agnes 格式` 或 `Anthropic 格式`。

验证结论：

- 通过 Playwright CLI 从主应用进入左下设置入口，再进入 `AI Providers / AI 服务商`。
- 点击 `Add model / 添加模型` 后选择 Agnes 推荐模板，进入配置页。
- 配置页显示 `Configure Agnes`、`API Base URL=https://apihub.agnes-ai.com/v1`、`API format=OpenAI compatible`、默认模型 `agnes-image-2.1-flash`。
- 页面未出现 `Anthropic Format / Anthropic 格式`，也没有新增 `Agnes Format / Agnes 格式`。
- API key 输入框保持空值；本轮没有写入真实 key，也没有触发 live Provider 调用。

验证：

- `npm run bridge:health -- --timeout-ms 120000` 通过，App Server bridge 就绪。
- `npx playwright test --config ".lime/tmp/playwright-agnes-provider.config.cjs" --workers 1 --timeout 60000 --reporter line` 通过，1 个测试。
- Playwright CLI 使用本机 Chrome channel；仓库默认 Playwright browser cache 未安装，不执行浏览器下载。
- UI 截图证据：`.lime/qc/agnes-provider-template-ui.png`。

### Checkpoint：历史图片会话刷新恢复与真实 Electron 复测

背景：

- 用户反馈从对话列表打开图片生成历史后，刷新或重新进入会丢回首页，思考、寒暄、图片轻卡和历史内容看起来消失。
- 用户明确要求不要 mock，必须证明普通 Agent 对话流里的图片生成历史可恢复，JSONL 继续作为审计事实源。

已完成：

- 首页空态普通首发不再创建 `draft-send-*` 非物化 pending preview，避免聊天列表出现临时占位一闪而过。
- `createFreshSession` 成功后立即持久化 session restore candidate；消息快照等较重持久化仍保留 idle 写入。
- `useAgentSession` 的 auto-restore 只有拿到真实 target 后才标记 workspace 已恢复；`skipWithoutTarget` 不再阻止后续 topics 更新重试。
- 当刷新后 topics 列表暂未包含恢复候选时，不再直接清空会话；先走 App Server `missingSessionVerify` 确认，存在则补回 topics 并水合详情。
- `useAppNavigation` 新增 `agent + initialSessionId` 最小 reload 恢复白名单：从侧栏打开历史会话后刷新仍回到 `claw` 会话页；普通 `new-task` 首页不写入恢复状态。

真实 Electron 验证：

- 通过 CDP 连接现有 Electron：`chromium.connectOverCDP("http://127.0.0.1:9223")`，transport 仍为真实 Electron Host / App Server bridge。
- 从侧栏点击真实 live 图片会话 `sess_46abe9d4d444440a8fd752eb8f3985c7` 后，聊天区显示：
  - 用户消息 `@配图 ... 深圳夏天傍晚 ...`
  - `已完成思考`
  - 模型生成的引导文字
  - `Image Generation | Agnes Image 2.1 Flash`
  - 完成 caption
- 点击历史会话后刷新页面，仍保留同一会话；未回到 `青柠一下，灵感即来` 首页；console error 为 0。
- 右侧 viewer 未自动展开；当前可见内容停留在聊天主列表。
- 截图证据：
  - `.lime/evidence/electron-click-recent-image-session.png`
  - `.lime/evidence/electron-history-reload-after-navigation-persist.png`

JSONL 审计：

- 后端事件文件存在：`$HOME/Library/Application Support/lime/app-server/runtime/events/sessions/session_sess_46abe9d4d444440a8fd752eb8f3985c7.jsonl`。
- 事件链包含 `message.created`、`runtime.status`、`reasoning.started`、`reasoning.delta`、`reasoning.final`、`message.delta`、`image_task.presentation.generated`、`tool.started`、`turn.completed`。
- JSONL 中保留 session / thread / turn / task 审计字段；聊天 UI 不展示 raw JSON、task path 或 workflow step 细节。

验证：

- `npx vitest run "src/hooks/useAppNavigation.test.tsx"` 通过，13 个测试。
- `npx vitest run "src/components/AppPageContent.test.tsx" --testNamePattern "agent 页面|pending navigation|newChatAt"` 通过，15 个测试。
- `npx vitest run "src/components/AppSidebar.conversations.test.tsx" --testNamePattern "点击已有会话|工作区|standalone|workspace-only|initialSessionId|历史会话"` 通过，3 个测试。
- `npx vitest run "src/components/agent/chat/hooks/useAgentChat.test.tsx" --testNamePattern "刷新后话题列表暂未包含恢复候选|首页新会话|页面刷新恢复"` 通过，19 个测试。
- `npx vitest run "src/components/agent/chat/hooks/agentSessionState.test.ts"` 通过，22 个测试。
- `npx vitest run "src/components/agent/chat/workspace/useTaskCenterDraftSendRuntime.unit.test.ts"` 通过，10 个测试。
- `npx vitest run "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx"` 通过，157 个测试。
- `npx vitest run "src/components/agent/chat/hooks/agentChatHistoryReadModel.test.ts" "src/components/agent/chat/hooks/agentChatHistoryLocalMerge.imageTasks.test.ts"` 通过，2 个测试。
- `npx vitest run "src/components/agent/chat/AgentChatWorkspace.homePendingPreview.test.ts"` 通过，1 个测试。
- `npx vitest run "src/components/agent/chat/index.test.tsx" --testNamePattern "隐藏草稿首页输入|草稿首页"` 通过，1 个测试。
- `npm run bridge:health -- --timeout-ms 120000` 通过。
- `npm run typecheck` 本轮执行超过 7 分钟无输出后中断，退出码 130；未记录为通过。

### Checkpoint：workflow 审计 facts 不再进入普通会话 read model

背景：

- 图片命令已把 `workflow.*` 事件写入 workflow audit JSONL，但聚合 `smoke:agent-runtime-current-fixture` 暴露普通 Content Factory Article Editor read model 仍带 `thread_read.workflowRuns / workflowSteps`。
- 普通聊天、历史会话和内容工作区不应显示 workflow run / step 等审计 facts；这些信息只应通过 JSONL / evidence / `workflow/read` 专用接口用于审计和排障。

已完成：

- `runtime_session_read_detail_with_options` 与 projection summary 不再把 workflow read model 注入普通 `thread_read`。
- `workflow_read_model_from_stored_session` 保持不变；`read_workflow_current` 仍可从 session events + workflow audit events 返回 workflow run / step。
- Rust 回归改为同时断言：
  - `read_workflow_current` 能读取 workflow run / step。
  - `read_session` 与 `read_session_current` 的 `thread_read` 不包含 `workflow`、`workflowRuns`、`workflowSteps`、`workflow_runs`、`workflow_steps`。

验证：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_model::workflow -- --nocapture` 通过，3 个测试。
- `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 通过，确保 Electron fixture 使用最新 App Server binary。
- `npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --prefix claw-chat-current-fixture-content-factory-article-workspace-regression --timeout-ms 240000` 通过；summary 显示 `workflowRunCount=0`、`workflowStepCount=0`、`workflowUiFactsHidden=true`。
- `npm run smoke:agent-runtime-current-fixture` 通过；覆盖 Coding Workbench、`@配图` GUI fixture、普通画图意图、cancel-then-continue、Plan history hydrate、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza、Expert Panel 和 Content Factory Article Editor。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --all -- --check` 通过。
- `git diff --check` 通过。

### Checkpoint：workerEvidence 普通投影剥离编排审计字段

背景：

- 上一刀已隐藏普通 `thread_read.workflowRuns / workflowSteps`，但 Content Factory 的 `article_workspace.workerEvidence` 仍可能携带 `workflowKey / subagents / skillRefs / cliRefs / connectorRefs / hookPolicy / orchestration` 等内部编排字段。
- 这些字段同样属于审计 / 排障 facts，不应作为普通 Article Editor / 聊天 read model 的 UI 数据源。

已完成：

- `article_workspace_projection` 对事件 metadata 与 workspace patch 里的 `workerEvidence` 统一清洗 audit-only key。
- 普通 `workerEvidence` 只保留产品状态摘要：任务 ID / 类型、状态、产物引用、产物类型、输出对象数量、失败原因、重试建议等。
- Content Factory fixture 的 dogfood worker evidence 识别逻辑不再依赖 `workflowKey / orchestration / skillRefs`，改为使用 taskId、status、artifact kind 和 output object count。
- 新增 fixture 断言 `contentFactoryArticleWorkspaceWorkerAuditFactsHidden`，防止内部编排字段回流普通 read model。

验证：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server article_workspace_worker_evidence -- --nocapture` 通过，1 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_materializes_content_factory_workspace_patch_into_article_workspace -- --nocapture` 通过，1 个测试。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server article_workspace_turn_runs_installed_worker_and_materializes_workspace_patch -- --nocapture` 通过，1 个测试。
- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only` 通过，23 个测试。
- `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server --bin app-server` 通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario content-factory-article-workspace --prefix claw-chat-current-fixture-content-factory-article-workspace-regression --timeout-ms 240000` 通过；summary 显示 workerDogfoodEvidence 的 `workflowKey=""`、`subagents=[]`、`skillRefs=[]`、`cliRefs=[]`、`connectorRefs=[]`、`hookRefs=[]`、`orchestrationStepCount=0`。
- `npm run smoke:agent-runtime-current-fixture` 通过；同时覆盖 `@配图` GUI fixture 和普通画图意图 GUI fixture。

### Checkpoint：live `@配图` 历史恢复补齐 Token usage

背景：

- 真实 live 会话 `sess_98203a39383e4f17a4fdbe9962b115bd` 已能从 task file 恢复图片 URL、思考、自然引导、轻卡和结果描述，但页面没有显示 Token。
- `agentSession/read` 里 usage 已存在于 `turns / thread_read.turns / diagnostics.latest_turn_usage / runtime_summary.latestTurnUsage`，而 `messages[assistant]` 本身没有 `usage`。
- 前端历史水合优先使用 `thread_items` 恢复 reasoning + image task tool + preview，此路径没有把同 turn usage 写回 assistant message，导致 `TokenUsageDisplay` 不渲染。

已完成：

- 新增 `resolveSessionDetailTurnUsage`，统一从 `thread_read.turns`、`turns`、`thread_read.diagnostics`、`thread_read.runtime_summary` 解析同 turn usage。
- `hydrateSessionDetailMessages` 在 assistant message 自身缺 usage 时，按 `runtimeTurnId` 从 read model 恢复 usage。
- `hydrateSessionDetailMessagesFromThreadItems` 创建 assistant draft 时同步写入同 turn usage。
- `hydrateSessionDetailMessagesFromThreadReadToolCalls` 复用同一个 helper，减少 usage 解析重复逻辑。
- 未改图片文案模板；用户可见引导、completion caption 仍来自后端 presentation / model output。
- 普通聊天 UI 仍不显示 task path、raw JSON、workflow run/step、`Image Workbench`、`Ribbi` 等内部字段；右侧 viewer 不自动展开。

真实 live 验证：

- 会话：`sess_98203a39383e4f17a4fdbe9962b115bd`
- Turn：`ee49454a-f3a1-4ebf-aa7e-b5429d7ced67`
- 图片 URL：`https://platform-outputs.agnes-ai.space/images/t2i/b5129fcf3ce649539c4a51c91d2237c6.png`
- Playwright CLI 使用系统 Chrome channel 打开 `http://127.0.0.1:1420/`，通过 `sessionStorage` 恢复目标会话，走真实 DevBridge / App Server read model，不触发新图片生成、不使用 mock。
- 修复前 evidence：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-playwright-before-fix-dom.json`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-playwright-before-fix.png`
  - 结果：思考 / 引导 / 图片轻卡 / 图片预览存在，Token 不显示。
- 修复后 evidence：
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-playwright-after-usage-fix-dom.json`
  - `.lime/qc/gui-evidence/live-image-command/live-real-1783134923350-playwright-after-usage-fix.png`
  - 结果：`hasGuidance=true`、`hasReasoning=true`、`hasImageGenerationCard=true`、`hasTokenUsage=true`、可见图片数 `2`、控制台 error `0`、内部字段泄露 `[]`、右侧 viewer 词命中 `[]`。

验证：

- `npx vitest run "src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts" "src/components/agent/chat/hooks/agentChatHistoryReadModel.test.ts" "src/components/agent/chat/hooks/agentChatHistoryLocalMerge.imageTasks.test.ts"` 通过，15 个测试。
- `npx vitest run "src/components/agent/chat/components/MessageList.imageTasks.test.tsx"` 通过，14 个测试。
- `npx eslint "src/components/agent/chat/hooks/agentChatHistoryUsage.ts" "src/components/agent/chat/hooks/agentChatHistoryHydrate.ts" "src/components/agent/chat/hooks/agentChatHistoryThreadItems.ts" "src/components/agent/chat/hooks/agentChatHistoryReadModel.ts" "src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts" --max-warnings 0` 通过。
- `npm run smoke:agent-session-history-electron-fixture` 通过；summary 写入 `.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-summary.json`，覆盖 `initialize, agentSession/start, agentSession/read, agentSession/update, agentSession/list`。
- `npm run bridge:health -- --timeout-ms 120000` 通过。
- `npm run typecheck -- --pretty false` 运行超过数分钟无输出后中断，退出码 130；本 checkpoint 不记录为通过。

### Checkpoint：presentation schema 循环与 content-factory workspace patch kind 兼容边界

背景：

- live `@配图` 曾出现 `image_task_presentation_unavailable`，原因是图片 presentation 的受控文本生成同时禁用工具面又注入 `output_schema`，Agent 反复按 StructuredOutput 纠偏，最终超时，聊天里只剩轻卡 / 占位，前置思考和引导文字丢失。
- 内容工厂 Article Workspace action 曾报错：`Plugin worker output artifact kind is unsupported by runtime contract: requested=creator.workspace_patch, declared=content_factory.workspace_patch`。
- `content_factory.workspace_patch` 是 current canonical kind；`creator.workspace_patch` 只能作为内容工厂历史别名在边界归一，不允许全局放宽 runtime contract。
- WebSearch 复核采用官方资料方向：JSON-RPC 请求 / 响应继续按 `jsonrpc/method/params/id/result/error` 严格关联；Electron renderer 仍通过 preload 暴露的受控 API 进入 `ipcRenderer.invoke + ipcMain.handle`；GUI 证据优先验证用户可见行为；schema 演进使用显式兼容边界，避免把旧值重新定义成新的全局 truth。
- Context7 本轮没有可调用工具入口；只复核到仓库已有 `smoke:mcp-context7-live-electron-fixture` 能验证 Context7 MCP 通道，但本问题不依赖 Context7 文档查询。

已完成：

- 图片 presentation 删除 `set_agent_turn_output_schema(...)`，保留 direct text generation + JSON 解析 / sanitize。可见文案仍来自模型生成与 Soul 上下文，不在前端 hard code。
- `presentation.rs` 测试拆到 `runtime_backend/image_command/presentation/tests.rs`，避免继续膨胀主文件。
- 前端 `workspaceArticleWorkspaceModel.ts` 只在 `content-factory-app + creator.workspace_patch` 时归一为 `content_factory.workspace_patch`，并把 `article_workspace_action`、`pane_action`、`runtime_authorization` 全部写成 canonical kind。
- 后端 `plugin_worker_turn.rs` 同样只在 `content-factory-app + creator.workspace_patch` 时归一；其他 app 的 `creator.workspace_patch` 保持原样，未知 kind 仍 fail closed。
- unauthorized output kind 回归改用 `other.workspace_patch`，避免把受控兼容别名当作非法输入。

真实 live 验证：

- 图片命令 live run：`live-no-output-schema-1783148306356`。
  - Evidence：`.lime/qc/gui-evidence/live-image-command/live-no-output-schema-1783148306356/`。
  - UI 可见：`已完成思考`、自然前置引导、`Image Generation | Agnes Image 2.1 Flash`、真实图片、完成 caption、`1.3K Tokens`。
  - 未出现：`Ribbi`、task path、raw JSON、`image_task_presentation_unavailable`、右侧 viewer 自动展开。
  - 审计：session JSONL、task artifact、attempt JSONL 均落到本地 App Server / workspace `.lime` 目录。
- Content Factory contract alias live run：`live-content-factory-contract-alias-1783149749010`。
  - Evidence：`.lime/qc/gui-evidence/live-content-factory-contract-alias/live-content-factory-contract-alias-1783149749010/`。
  - 真实链路：Playwright CDP 连接当前 Electron 页面，通过 `window.electronAPI.invoke("app_server_handle_json_lines", { request })` 发送 `agentSession/start -> agentSession/turn/start -> agentSession/read`。
  - 输入 metadata 故意使用旧 `creator.workspace_patch`。
  - 结果：session `completed`、turn `completed`、Article Workspace action `regenerate` `completed`、artifact 数 `7`。
  - 断言：`containsLegacyMismatch=false`、`containsContractMismatch=false`、响应中包含 canonical `content_factory.workspace_patch`。

验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -- --check` 通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::image_command::presentation -- --nocapture` 通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_worker_turn -- --nocapture` 通过。
- `cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过。
- `npx vitest run "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.unit.test.ts" --silent=passed-only` 通过。
- `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario image-command --prefix images-v2-presentation-no-output-schema --timeout-ms 180000` 通过。
- `node scripts/check-app-server-client-contract.mjs` 通过，284 个 checks；守卫已更新为 current `SessionProviderConfig -> StateProviderConfig` façade、`.configure_provider(config.clone().into(), ...)` 与 `route_protocol_from_session_provider_config`。
- `npm run test:contracts` 通过；同时覆盖 protocol types、app-server-client contract、command contract、harness contract、modality contracts、scripts governance、Electron release workflow、harness cleanup report 和 docs boundary。

后续拆分风险：

- `plugin_worker_turn.rs` 与 `workspaceArticleWorkspaceModel.ts` 都已超过 `1000` 行。本轮只做 contract 边界修复，没有继续扩大职责；下一刀应把 plugin worker kind / runtime contract normalization 和 Article Workspace action metadata builder 拆出独立子模块后再继续加业务逻辑。

### Checkpoint：plugin worker 输出契约与 Article Workspace action kind 拆分

背景：

- 上一 checkpoint 已修通 live `@配图` presentation 与 Content Factory `creator.workspace_patch` 历史别名归一。
- 但 `plugin_worker_turn.rs` 与 `workspaceArticleWorkspaceModel.ts` 仍超过 `1000` 行，继续在主文件里追加契约归一会扩大职责边界。

已完成：

- 新增 `runtime/plugin_worker_output_contract.rs`，集中承接 plugin worker output artifact kind 解析、`content-factory-app + creator.workspace_patch` 到 canonical `content_factory.workspace_patch` 的受控归一，以及 Article Workspace expected output contract。
- `plugin_worker_turn.rs` 只保留 worker turn 编排，复用新 helper，不再内联 Content Factory output contract 细节。
- 新增 `workspaceArticleWorkspaceActionOutputKind.ts`，把 Article Workspace action output kind 解析与历史别名归一从 `workspaceArticleWorkspaceModel.ts` 拆出。
- `workspaceArticleEditorActionDispatch.ts` 改为直接依赖 action output kind helper，避免通过 workspace model 反向承担 action dispatch 细节。
- 更新 `scripts/check-app-server-client-contract.mjs` 的 provider route contract 断言，从旧 `route_protocol: Some(route_protocol.clone())` 改为 current `config.route_protocol = request.route_protocol.or(config.route_protocol)`，匹配 `SessionProviderConfig` façade 事实源。

验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -- --check` 通过。
- `npx prettier --check "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceActionOutputKind.ts"` 通过。
- `git diff --check -- <touched files>` 通过。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_worker_turn -- --nocapture` 通过，24 个测试。
- `npx vitest run "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.unit.test.ts" --silent=passed-only` 通过，18 个测试。
- `node scripts/check-app-server-client-contract.mjs` 通过，284 个 checks。
- `npm run test:contracts` 通过；脚本治理提示本地 ignored `scripts/__pycache__` / `.pyc` 存在，未纳入提交范围。
- `npm run verify:gui-smoke` 通过；覆盖 renderer build、Electron host build、App Server sidecar 初始化、Claw workbench shell ready 与 memory settings ready。

剩余风险：

- 这刀是无行为变更拆分，没有重新消耗真实图片 Provider 跑 live。上一 checkpoint 的真实 Electron / App Server live evidence 仍是当前产品行为证据。
- `workspaceArticleWorkspaceModel.ts` 仍超过 `1000` 行，下一刀应继续把 Article Workspace request metadata builder / view model selector 按职责拆出，避免后续 action、viewer、history 逻辑继续堆在单文件内。

### Checkpoint：Article Workspace action metadata builder 拆分

背景：

- 上一 checkpoint 已把 Article Workspace action output kind 归一拆出，但 `workspaceArticleWorkspaceModel.ts` 仍承担 action request metadata builder 与 object artifact id 解析职责。
- 这两块属于发送协议 / action dispatch 边界，不应继续和 view model / projection 逻辑堆在同一个超大文件里。

已完成：

- 新增 `workspaceArticleWorkspaceActionRequestMetadata.ts`，集中构造 Article Workspace action 的 `plugin.article_workspace_action`、复用 `pane_action` metadata，并继续写入 canonical `content_factory.workspace_patch`。
- 新增 `workspaceArticleWorkspaceObjectArtifacts.ts`，集中解析对象 artifact ids，覆盖 ref artifact ids、preview artifact id 与 source artifact ids 去重。
- `workspaceArticleWorkspaceModel.ts` 移除 action request metadata builder 与 artifact id 解析实现，只保留 re-export 兼容现有调用；文件从 `1522` 行降到 `1424` 行。
- `workspaceArticleEditorActionDispatch.ts` 改为直接依赖 action request metadata helper 与 output kind helper，减少通过 model barrel 反向耦合发送协议。
- `verify:gui-smoke` 首次重跑时被 `lime-agent` 编译错误阻断：`knowledge_builder_skill.rs` 将 `&&str` 传入需要 `Into<String>` 的 provider/model 参数。该文件本轮前已是脏文件，本轮只做最小解引用修复，避免 Electron smoke / App Server sidecar 构建被阻断。

验证：

- `npx prettier --check "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceActionRequestMetadata.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceObjectArtifacts.ts"` 通过。
- `git diff --check -- <article workspace touched files>` 通过。
- `npx vitest run "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.unit.test.ts" --silent=passed-only` 通过，18 个测试。
- `npm run typecheck -- --pretty false` 通过。
- `npm run test:contracts` 通过；脚本治理仍提示本地 ignored `scripts/__pycache__` / `.pyc` 存在，未纳入提交范围。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p lime-agent -- --check` 通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过。
- `npm run verify:gui-smoke` 通过；覆盖 renderer build、Electron host build、App Server sidecar 初始化、Claw workbench shell ready 与 memory settings ready。

剩余风险：

- 这刀仍是无行为拆分，没有重新消耗真实图片 Provider 跑 live。上一 checkpoint 的真实 Electron / App Server live evidence 仍是当前产品行为证据。
- `workspaceArticleWorkspaceModel.ts` 仍超过 `1000` 行，下一刀应继续拆 view model selector、structured preview readers 或 action list resolver，直到 model 文件回到可维护边界。

### Checkpoint：Article Workspace structured preview reader 拆分

背景：

- 上一 checkpoint 后 `workspaceArticleWorkspaceModel.ts` 仍有 `1424` 行，继续触碰 Article Workspace projection 会违反文件体量边界。
- structured preview 的 reader 只负责把 worker / artifact source 投影成 UI 预览数据，不应和 workspace 聚合、对象选择、action 列表、历史恢复继续堆在同一文件。

已完成：

- 新增 `workspaceArticleWorkspaceStructuredPreview.ts`，集中承接 `buildWorkspaceArticleObjectStructuredPreview`、draft markdown reader、图片 / storyboard / checklist / brief / research / outline / citation / writing plan 等结构化预览读取逻辑。
- `workspaceArticleWorkspaceModel.ts` 改为复用 structured preview helper，并保留 `buildWorkspaceArticleObjectStructuredPreview` re-export，避免破坏既有调用点。
- `workspaceArticleWorkspaceModel.ts` 从 `1424` 行降到 `963` 行，回到 `1000` 行以下；新 helper 为 `515` 行，职责单一且不碰 runtime / bridge / image Provider 行为。

验证：

- `npx prettier --check "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceStructuredPreview.ts" "internal/roadmap/images/v2/progress.md"` 通过。
- `git diff --check -- "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.ts" "src/components/agent/chat/workspace/workspaceArticleWorkspaceStructuredPreview.ts"` 通过。
- `npx vitest run "src/components/agent/chat/workspace/workspaceArticleWorkspaceModel.unit.test.ts" "src/components/agent/chat/workspace/workspaceArticleEditorActionDispatch.unit.test.ts" --silent=passed-only` 通过，18 个测试。
- `npm run typecheck -- --pretty false` 通过。
- `npm run test:contracts` 通过；脚本治理仍提示本地 ignored `scripts/__pycache__` / `.pyc` 存在，未纳入提交范围。
- `npm run verify:gui-smoke` 通过；覆盖 renderer build、Electron host build、App Server sidecar 初始化、Claw workbench shell ready 与 memory settings ready。

剩余风险：

- 这刀仍是无行为变更拆分，不重新消费 live 图片 Provider；上一 checkpoint 的真实 Electron / App Server / Agnes live evidence 仍作为当前图片产品链路证据。
- 下一刀如继续触碰用户可见工作台，应优先补 `test:contracts`、`verify:gui-smoke`，必要时再跑显式 live Provider 验收。

### Checkpoint：图片命令 workflow/read 审计投影回归补齐

背景：

- 用户要求图片生成链路的 workflow / task / provider / path 等内部事实只写入 JSONL / task artifact / evidence，普通聊天和右侧 viewer 不展示。
- 之前 `@配图` fixture 已证明 task artifact 与 worker attempt JSONL 存在，但没有把 App Server `workflow/read` 的 session workflow audit read model 纳入 image-command 场景门禁。
- `claw-chat-current-fixture-image-command.mjs` 已超过 `1000` 行，本轮不继续向大文件追加 read-model 摘要逻辑。

已完成：

- 新增 `claw-chat-current-fixture-image-command-workflow-read.mjs`，专门读取 `workflow/read` 并投影脱敏摘要。
- `runImageCommandScenario` 在 task artifact 进入终态后调用 `workflow/read`，summary 新增 `imageCommandWorkflowRead`。
- 新增 image-command 场景断言：
  - `imageCommandWorkflowAuditReadModelProjected`：证明 `workflow/read` 返回 `image_command_workflow` completed run、`stepCounts.total=5`、`activeWorkflowRunId=""`。
  - `imageCommandWorkflowAuditStepsProjected`：证明 `intent / route / create_tasks / generate / persist_outputs` 五个审计步骤被投影，且 `intent / create_tasks` 已完成。
  - `imageCommandWorkflowAuditSummaryRedacted`：证明 `workflow/read` 摘要不含用户 prompt 或 `.lime/tasks/image_generate` path。
- `IMAGE_COMMAND_ASSERTION_KEYS` 补入 task audit JSONL 与 workflow audit read model 断言，非 image 场景继续通过 not-applicable 机制隔离。
- fixture smoke guard 纳入新增 helper 文件，防止未来移除 `workflow/read` 审计验证。

验证：

- `npx prettier --check "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs" "scripts/agent-runtime/claw-chat-current-fixture-image-command-workflow-read.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs"` 通过。
- `git diff --check -- "scripts/agent-runtime/claw-chat-current-fixture-image-command.mjs" "scripts/agent-runtime/claw-chat-current-fixture-image-command-workflow-read.mjs" "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/claw-chat-current-fixture-constants.mjs"` 通过。
- `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only` 通过，23 个测试。
- `npm run smoke:claw-chat-current-fixture -- --scenario image-command --prefix images-v2-workflow-audit-read --timeout-ms 180000` 通过；summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-workflow-audit-read-summary.json`。
- `npm run smoke:claw-chat-current-fixture -- --scenario plain-image-intent --prefix images-v2-workflow-audit-read-plain --timeout-ms 180000` 通过；summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/images-v2-workflow-audit-read-plain-summary.json`。
- `npm run smoke:agent-runtime-current-fixture` 通过；覆盖 image-command、plain-image-intent、cancel-then-continue、Plan history、Skills Runtime、MCP structuredContent、Expert Skills Runtime、Expert Plaza、Expert Panel 与 Content Factory Article Editor，`liveProviderUsed=false`。

剩余风险：

- 本轮是 deterministic current Electron fixture 回归，不重新消费 live Agnes Provider；live 产品证据仍沿用前面真实 Electron / App Server / Agnes checkpoint。
- 当前 workflow read model 中只投影 workflow run 与阶段性步骤；真正 worker attempt 事件序列仍以 task artifact 的 `.lime/task-logs/*.jsonl` 为事实源。

### Checkpoint：`@配图` 重复提交与 presentation fail-closed 收口

时间：2026-07-05 00:39:11 CST

背景：

- 用户反馈 `@配图` 在对话列表中图片占位一闪而过、快速完成但实际未完成，且生成前后的普通 Agent 思考 / 引导文字缺失。
- live 复现确认问题不是 mock：一次 GUI 点击会触发多次 `agentSession/turn/start`，导致同一 prompt 在生成中重复出现。
- 四文件定向 guard 随后发现生产路径仍保留旧半成功事件 `image_task.presentation.unavailable`；该事件会让 presentation 不可用时继续创建图片任务，形成“没有 Agent 引导却伪装任务成功创建”的旁路。

已完成：

- `useTaskCenterDraftSendRuntime` 增加 materialized draft request in-flight / dispatched request 去重，同一 `requestId` 只允许派发一次。
- 首页无 session 时先 materialize 真实 draft tab，再进入统一发送链；没有真实 session 的临时 `draft-send-*` fail closed，不直接走普通发送流。
- 移除 effect cleanup 触发的 `scheduleAfterNextPaint` 重入派发路径，避免 re-render / cleanup 导致重复提交。
- `claw-image-live-smoke` summary 增加 `turnStartTraceCount`，并补 `singleTurnStartTrace` guard。
- App Server `ImageCommandWorkflow` 删除旧 `emit_presentation_unavailable` 半成功事件；presentation 返回空、生成错误、超时或 runtime backend 不可用时统一 `image_task.create_failed + workflow.run.completed(create_failed) + turn.completed(create_failed)`，不创建图片 task artifact。
- Rust image command 单测反转为 fail-closed：runtime backend 缺失时 `create_image_media_task_artifact` 调用数为 `0`，reason code 为 `image_task_presentation_runtime_unavailable`。

验证：

- 失败复现 evidence：`.lime/qc/gui-evidence/live-image-command/live-real-current-dedup-1783181459-summary.json`。
- 重复提交修复后 live evidence：`.lime/qc/gui-evidence/live-image-command/live-real-current-dedup-fixed-1783182012-summary.json`。
- 本 checkpoint 重新跑真实 live：`npm run smoke:claw-image-live -- --allow-live-provider --setup-agnes-from-env --app-url "http://127.0.0.1:1420/" --timeout-ms 300000 --prefix "live-real-current-failclosed-1783183079"` 通过；summary：`.lime/qc/gui-evidence/live-image-command/live-real-current-failclosed-1783183079-summary.json`，截图：`.lime/qc/gui-evidence/live-image-command/live-real-current-failclosed-1783183079-final.png`。
- live summary 关键断言：`usedRealElectron=true`、`usedCurrentAppServerBridge=true`、`turnStartTraceCount=1`、`singleTurnStartTrace=true`、`guiPromptNotDuplicated=true`、`guiReasoningVisible=true`、`guiAssistantTextVisible=true`、`guiImagePreviewLoaded=true`、`guiTokenVisible=true`、`guiRightSurfaceNotAutoOpen=true`、`workflowReadRedacted=true`、`taskAuditJsonlWritten=true`、`taskAuditJsonlNoSensitiveTokens=true`。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -- --check` 通过。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过；此前 `NormalizedImageCreateParams` 编译阻塞在当前工作树未复现。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::image_command --lib` 通过，20 个测试。
- `npx vitest run "scripts/agent-runtime/claw-image-live-smoke.test.mjs" "src/components/agent/chat/workspace/useTaskCenterDraftSendRuntime.unit.test.ts" "src/components/agent/chat/workspace/taskCenterSurfaceState.unit.test.ts" "src/components/agent/chat/workspace/agentChatWorkspaceHelpers.unit.test.ts" --silent=passed-only` 通过，51 个测试。
- `npx tsc --noEmit --project tsconfig.renderer.json --pretty false` 通过。
- `npm run verify:gui-smoke` 通过；renderer smoke build、Electron host build、App Server sidecar、renderer loaded、app-server initialized、Claw workbench shell ready、memory settings ready。
- `git diff --check -- <touched current files>` 通过。
- `npm run test:contracts` 仍失败在当前脏工作树的大范围 App Server / Agent Runtime / MCP contract 缺口，包括 `processor/mod.rs` 缺 capability / artifact / fileSystem / evidence dispatch、`runtime_backend.rs` 已删除、tool inventory current method 缺失、Agent flow smoke 契约缺失和 MCP runtime methods 缺失；这些不是本 checkpoint 的 `@配图` fail-closed / 去重写集直接引入。

剩余风险：

- 旧事件字符串仅保留在 `claw-image-live-smoke.test.mjs` 的负向 guard 中，用于防止生产源码重新出现；生产路径扫描已确认 `mod.rs / agentProtocol.ts / appServerEventStream.ts / agentStreamRuntimeHandler.ts` 不包含旧 `presentation.unavailable` 半成功事件。
- 本轮没有继续扩大到全量 `npm run verify:local`；当前主风险已由 Rust 定向测试、前端 guard、renderer typecheck、真实 Electron + live Provider smoke，以及 GUI smoke 覆盖。
- 合并前仍必须单独收口 `test:contracts` 的 App Server / Agent / MCP contract 主线，不能把本 checkpoint 的图片 live / GUI smoke 通过误读为全仓库契约已绿。
