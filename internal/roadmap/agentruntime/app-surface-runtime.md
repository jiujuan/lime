# Agent App Runtime Surface

> 状态：in progress
> 更新时间：2026-05-16
> 作用：定义 Agent App 如何作为 AgentRuntime 的业务 surface 复用 Lime Agent / Claw / Aster 主链，而不是把 App 做成模型 API 壳或 Chat UI 旁路。

## 1. 一句话结论

Agent App 是业务工作台，AgentRuntime 是智能体运行事实主链，Claw 是一组已落地的能力入口和能力治理经验。内容工厂这类 App 不能只拿模型 API，也不能跳回通用 Chat 完成主流程；它必须通过统一 Agent Runtime Surface 调用 Lime 已有 Agent 能力，并把进度、追问、人工确认、产物和证据回投到 App 页面内。

目标架构固定为：

```text
Content Factory / Agent App
  -> @lime/app-sdk
  -> Host Bridge / Capability Bridge
  -> Agent App Runtime Surface
  -> AgentRuntime control plane
  -> Aster / lime_agent / Skills / Tools / MCP / Browser / Evidence
  -> Agent App task events / artifacts / evidence write-back
```

这意味着 Agent App 与 Claw Chat 共享后端 AgentRuntime，而不是共享 Chat UI。

## 2. 为什么 API 不够

内容工厂的“生成文案和配套素材”“只重写文案”不是单次文本补全，而是长生命周期 Agent 任务。它至少需要：

1. 检查资料版本、知识绑定、场景和脚本是否满足生产条件。
2. 缺上下文时在 App 内追问或发起补齐任务。
3. 调用知识检索、搜索、图片、PDF、总结、报告等现有 Claw 能力。
4. 持续回传 progress、tool call、citation、partial artifact、blocked、review request。
5. 支持取消、重试、人工确认、结构化写回。
6. 将最终文案、素材需求、脚本、报告写入 `lime.storage`、`lime.artifacts` 和 `lime.evidence`。

直接注入 `LIME_GATEWAY_*` 或给 App 一个 OpenAI-compatible token 只能提供低阶模型生成；它无法复用 Lime 的工具治理、知识绑定、Evidence Pack、review、runtime queue 和 capability gap。后续它只能作为 degraded fallback 或受控模型 executor，不是完整 Agent 能力边界。

## 3. Surface 边界

| 层                        | current 责任                                                         | 禁止事项                                             |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Agent App UI              | 业务形态、表单、资料版本、场景、文案、素材、交付和复盘               | 直接访问 Tauri / Node / 宿主 DOM，绕过 Host Bridge   |
| Agent App Workflow        | 从 App 状态组装 task input、expected output、review/write-back 目标  | 自己维护第二套 Agent task runtime                    |
| Host Bridge               | iframe sandbox、主题、语言、导航、capability transport、安全校验     | 承载业务 Agent 逻辑                                  |
| Agent App Runtime Surface | 把 App task 映射到 AgentRuntime control plane，附加 app provenance   | 复制 Claw skill launch 或绕过 `agent_runtime_*` 主链 |
| AgentRuntime              | session/thread/turn/task、queue、event、tool、policy、evidence facts | 决定垂直业务 UI 长什么样                             |
| Claw Capability Catalog   | 把 `@配图`、`@搜索`、`@研报` 等能力变成可复用 capability             | 继续把能力绑定死在 Chat/Inputbar 字符串分支          |
| Artifact / Evidence       | 产物、引用、工具调用、知识版本、人工确认和验证记录                   | 让最终结果只停留在聊天文本                           |

### 运行过程封装边界

`thinking / text delta / tool input-output / Skill / routing / cost / usage / artifact / evidence / blocked / completed` 这类 Claw 式运行过程属于 Lime 主 App 的 runtime projection，不属于垂直业务 App。Agent App 只允许消费 Host Bridge 下发的 `runtimeProcess` / `process` 标准视图，并用它做业务展示：

- `runtimeProcess.timeline`：可折叠的运行现场，运行中展开，终态默认折叠但不丢失。
- `runtimeProcess.streamText / thinkingText / executionText`：正文、思考和执行片段。
- `runtimeProcess.model / usage / cost`：模型路由、Token 和费用事实。
- `runtimeProcess.skillNames / invokedSkillNames`：本轮 required Skills 与真实调用情况。
- `runtimeProcess.terminal / collapsedByDefault`：由主 App 判断运行生命周期，App 不再自己推断底层状态。

因此内容工厂、未来销售助手或交付助手都不应该复制一份 `agent-runtime-process` 解析器；它们只处理业务表单、业务产物、人工确认和工作流递进。若某个 App 发现 process 信息缺失，应该回报 Host / Runtime projection 缺口，而不是在 App 内补第二套底层归一化。

事实源声明：

```text
Agent App 的完整 AI 能力只允许向 AgentRuntime Surface + AgentRuntime facts 收敛。
Agent App 的运行过程 UI 事实只允许向 AgentRuntimeCapabilityHost + HostBridge runtimeProcess 收敛。
```

## 3.1 全量 `lime.*` 能力与 AgentRuntime 的关系

Agent App 侧全量能力路线图见 [`../agentapp/p18-7-full-lime-capability-surface.md`](../agentapp/p18-7-full-lime-capability-surface.md)。本文只固定 AgentRuntime owner 边界：凡涉及 AI 执行、模型、Skill、工具、记忆、用量、证据的能力，生产事实必须继续向 AgentRuntime / ToolRuntime / Desktop Host 收敛。

Agent App 不再只抽象 `lime.agent / lime.workflow` 两个入口。完整 Lime AI 能力必须拆成三类，并统一登记在 `src/features/agent-app/sdk/capabilityCatalog.ts`：

| 类型       | Capability                                                                                                                     | AgentRuntime 关系                                                                             | App 边界                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 执行主链   | `lime.agent`、`lime.workflow`、`lime.automation`、`lime.tasks`                                                                 | 进入 AgentRuntime session/thread/turn/task/queue。                                            | App 只定义业务输入、状态递进和结果写回。                                |
| 智能体资源 | `lime.models`、`lime.skills`、`lime.memory`、`lime.context`、`lime.usage`                                                      | 从 AgentRuntime request metadata、runtime facts、read model、telemetry 投影。                 | App 不保存 provider key，不复制 Skill runtime，不自建 token/cost 统计。 |
| 工具与集成 | `lime.tools`、`lime.mcp`、`lime.browser`、`lime.search`、`lime.documents`、`lime.media`、`lime.terminal`、`lime.connectors`    | 经 ToolRuntime / MCP bridge / Browser / Media / Document runtime 接入 AgentRuntime evidence。 | App 声明需求和消费结构化结果，不直连底层服务。                          |
| 数据与证据 | `lime.storage`、`lime.files`、`lime.knowledge`、`lime.artifacts`、`lime.evidence`                                              | 与 AgentRuntime task provenance、artifact refs、knowledge refs 关联。                         | App 定义业务对象和产物类型，Lime 负责命名空间、引用和审计。             |
| 治理与宿主 | `lime.ui`、`lime.events`、`lime.workspace`、`lime.policy`、`lime.secrets`、`lime.settings`、`lime.review`、`lime.capabilities` | 作为 Host / policy / readiness projection 约束 runtime 调用。                                 | App 做展示和降级，不绕过 Host Bridge。                                  |

事实源声明补强：

```text
所有可给 Agent App 使用的 Lime 功能，名称和边界先进入 lime.* capability catalog。
所有涉及 AI 执行、模型、Skill、工具、记忆、用量、证据的能力，生产事实必须继续向 AgentRuntime / ToolRuntime / Desktop Host 收敛。
业务 App 只消费 SDK facade 与 runtimeProcess projection，不拥有底层执行事实源。
```

这解决内容工厂当前暴露出来的问题：如果 App 需要完整 Lime AI 能力，不是把 Claw UI 嵌进去，也不是让 App 调模型 API，而是把 Claw 已有的图片、搜索、研报、PDF、总结、PPT、浏览器、发布等能力拆成 `lime.skills / lime.tools / lime.search / lime.media / lime.documents / lime.browser / lime.artifacts / lime.evidence` 等能力，再由 `lime.agent.startTask` 或 `lime.workflow.start` 编排。缺失的能力只允许在 catalog/profile 中显示为 unavailable，不允许由业务 App 临时 mock 成成功。

## 4. current / compat / deprecated / dead

### current

1. `agent_runtime_submit_turn -> runtime_turn -> runtime_queue -> stream_reply_once` 仍是现有执行主链。
2. Agent App Runtime Surface 是新的调用面，不是新的 runtime owner。
3. `lime.agent` / `lime.workflow` 是 App 面向 SDK 的 capability facade，内部必须委托 AgentRuntime Surface。
4. App 任务进度、工具、引用、产物和证据必须投影自 runtime events / read model。

### compat

1. `agent_app_cmd.rs` 当前负责 package、installed state、UI runtime 和 scoped model env 注入，可继续作为 App 生命周期兼容层。
2. `CapabilityHost` / `WorkflowRuntimeHost` 可暂时作为前端 adapter / mock，但真实能力必须迁向后端 AgentRuntime Surface。
3. `LIME_GATEWAY_*` 可作为低阶模型 executor 或开发期 fallback，但不能被文档或 UI 宣称为完整 Agent 能力。

当前进展：`agent_app_runtime_start_task` 等后端 facade 已可用，`AgentAppRuntimePage` 的 Host Bridge 已通过 `AgentRuntimeCapabilityHost` 将 `lime.agent` 的 start / stream / get / cancel / retry / submitHostResponse 接到该 facade；本地 in-memory adapter 只继续承接 storage / artifact / evidence / knowledge 的前端样板与离线测试，不再冒充完整 Agent 任务执行事实源。

### deprecated

1. App 自己调模型 API 完成主流程。
2. App 通过嵌入通用 Chat 让用户手动复制结果。
3. 为每个垂直 App 增加专用 Tauri command，例如 `content_factory_generate_copy`。
4. 前端 `capability + method` 字符串分支继续膨胀成事实源。

### dead

1. 新建第二套 `agent_app_agent_runtime` 执行事实源。
2. 复制 `*_skill_launch.rs` 给 Agent App 使用。
3. 让 App 自建模型、工具、凭证、权限、证据系统。

## 5. 内容工厂主链

内容工厂的“写文案”页面应投影为一个 App-scoped Agent task / workflow：

```text
App form state
  -> lime.agent.startTask / lime.workflow.start
  -> Agent App Runtime Surface
  -> Aster runtime turn
  -> Claw capability / Skill / Tool execution
  -> AgentAppTaskStreamEvent
  -> App review
  -> storage / artifact / evidence write-back
```

最小 task input：

```text
appId = content-factory-app
entryKey = content_factory
taskKind = content_factory.copy.generate
input = {
  task,
  category,
  platform,
  audience,
  coreWords,
  materialVersion,
  selectedScenarios,
  scriptRefs
}
expectedOutput = {
  artifacts: ["copy", "assetBrief", "deliveryPackage"]
}
humanReview = true
```

最小事件：

| 事件                                     | App 内展示                                 |
| ---------------------------------------- | ------------------------------------------ |
| `task:started`                           | 本轮任务已启动                             |
| `task:contextChecked`                    | 资料、场景、脚本和知识绑定检查结果         |
| `task:missingContextRequested`           | 在当前表单或侧栏追问缺口                   |
| `task:toolCall`                          | 搜索、知识检索、图片、报告、PDF 等工具进度 |
| `task:citation`                          | 资料、场景、网页、文件引用                 |
| `task:partialArtifact`                   | 草稿文案、素材 brief、脚本片段             |
| `task:reviewRequested`                   | 用户确认、编辑、拒绝或重试                 |
| `task:completed`                         | 写回完成，可导出交付物                     |
| `artifact:created` / `evidence:recorded` | 交付物和证据已落库                         |

当前已落地第一刀：`agent_app_runtime_get_task` 会从 `AgentRuntimeThreadReadModel` 投影 `taskStatus` 与 `taskEvents`，先覆盖 queued / progress / missing context / review request / tool call / artifact created / evidence recorded / evidence verified / completed / cancelled / error / incident。AgentRuntime profile event 生成处也会主动 emit `agent_app_runtime:profileProjection`，把 `turn.* / tool.* / action.* / routing.* / model.*` 投影成 App canonical `taskEvents`；高价值 `RuntimeAgentEvent` 会主动 emit `agent_app_runtime:runtimeEventProjection`，其中 `ArtifactSnapshot / FileArtifact` 可直接携带 `workspacePatch / contentFactoryWorkspacePatch`，显式写入 runtime event / timeline metadata 的 `evidenceRefs / verificationOutcomes` 也会通过 `runtime_evidence_projection_service` 投影为 `evidence:recorded / evidence:verified`。`AgentAppRuntimePage` 已消费这组 snapshot / profile / runtime projection 事件并转成 App 可见的 `AgentAppTaskStreamEvent`；App 也可以通过 `lime.agent.submitHostResponse` 把 ask_user / elicitation / tool_confirmation 响应回 `agent_app_runtime_submit_host_response`。`AgentRuntimeCapabilityHost` 已把 `taskId / sessionId / turnId / request / provenance` 持久化到 Agent App storage，刷新或重建 Host 后可以继续 `getTask / listTasks / submitHostResponse`，并能从 `threadRead.artifacts` 补投 `artifact:created` payload。Host Bridge 已支持 `capability:subscribe / capability:unsubscribe / capability:event`：订阅时会通过 `safeListen` 监听 `agent_app_runtime:{appId}:{taskId}` Tauri / DevBridge runtime event，并把后端 runtime event 和 projection 推给 iframe；同时保留 Host 侧 `getTask` 轮询作为 snapshot / artifact replay fallback。成功终态如果暂未带 workspace patch，会继续短轮询最多 4 次等待最终 artifact replay，已经能让 App 留在当前页面持续收到 task update、runtime event 和最终 artifact patch。Harness export projection 也已接入同一 event bus：Evidence Pack / analysis / review / save review 导出成功后，会把导出 root、制品列表和 completion audit completed 事实投影为 App task events。

内容工厂实际 App 已把主生产结果和确认链结果写回 `lime.storage / lime.artifacts / lime.evidence`，并用 manifest 已声明的 `scene_table / content_batch / script_batch` 与 `fact_grounding / publish_readiness` 类型避免真实 Host 拒绝；Lime seeded 内容工厂 fixture 也已补齐这些写回类型，Host dispatcher 会在调用 `lime.agent` 等 Host capability 前校验 manifest 声明。Claw capability hint 还会校验 manifest `toolRefs[].capabilities` allowlist：内容工厂当前显式声明 `image / cover / research / report / pdf / summary`，未列入 allowlist 的 hint 会被 `CAPABILITY_NOT_DECLARED` 拒绝。主生产 UI 已通过 Host task subscription 更新“AI 同事任务”面板，也能优先消费 runtime 返回的 `workspacePatch` / `contentFactoryWorkspacePatch` 更新项目。后端 projection 已把 runtime artifact metadata、artifactDocument blocks 和 artifact runtime event 中的 patch 稳定透传为 `artifact:created` payload；`agent_app_runtime_start_task` 也已把内容工厂 `artifactKind` 输出要求写入 runtime message 和 `harness.agent_app_runtime_output_contract`，让上游 Agent 有机器可读的 producer contract。Rust facade 还会把多个 capability hint 去重后写入 `agent_app_runtime.capability_workflow` 与 `harness.agent_app_runtime_capability_workflow`；内容工厂带 output contract 的复合任务使用 `metadata_only`，因此不会被 `research.search + image_generation` 强制降格为单一 Claw Skill。Playwright 真实宿主已验证隐藏 `agent-app-runtime-*` session 完成后，Host Bridge artifact replay 可把最终 patch 物化到内容工厂 iframe，页面指标达到 `文案=20 / 脚本=6 / 图片需求=5`。当前剩余缺口不再是“能否回写内容工厂”或“能否主动推送任务进度 / artifact patch / 显式 evidence refs / Harness 导出结果”，而是真正多 capability 执行编排、后端/cross-surface capability policy owner，以及重启宿主后的 Playwright 真实业务流覆盖。

## 6. 与 Agent App 文档的关系

Agent App 文档负责 App 安装、Host Bridge、Capability SDK、UI runtime、manifest 和业务 App 形态。本文负责说明 `lime.agent` / `lime.workflow` 背后的后端事实源必须是 AgentRuntime Surface。

后续任何 Agent App 文档若提到“AI 能力”“Agent task”“workflow task”，必须回链到本文或 [./backend-surface-facade-plan.md](./backend-surface-facade-plan.md)，避免把 App SDK 误解成模型 API SDK。
