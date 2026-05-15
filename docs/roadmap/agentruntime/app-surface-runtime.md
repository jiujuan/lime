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

| 层 | current 责任 | 禁止事项 |
| --- | --- | --- |
| Agent App UI | 业务形态、表单、资料版本、场景、文案、素材、交付和复盘 | 直接访问 Tauri / Node / 宿主 DOM，绕过 Host Bridge |
| Agent App Workflow | 从 App 状态组装 task input、expected output、review/write-back 目标 | 自己维护第二套 Agent task runtime |
| Host Bridge | iframe sandbox、主题、语言、导航、capability transport、安全校验 | 承载业务 Agent 逻辑 |
| Agent App Runtime Surface | 把 App task 映射到 AgentRuntime control plane，附加 app provenance | 复制 Claw skill launch 或绕过 `agent_runtime_*` 主链 |
| AgentRuntime | session/thread/turn/task、queue、event、tool、policy、evidence facts | 决定垂直业务 UI 长什么样 |
| Claw Capability Catalog | 把 `@配图`、`@搜索`、`@研报` 等能力变成可复用 capability | 继续把能力绑定死在 Chat/Inputbar 字符串分支 |
| Artifact / Evidence | 产物、引用、工具调用、知识版本、人工确认和验证记录 | 让最终结果只停留在聊天文本 |

事实源声明：

```text
Agent App 的完整 AI 能力只允许向 AgentRuntime Surface + AgentRuntime facts 收敛。
```

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

| 事件 | App 内展示 |
| --- | --- |
| `task:started` | 本轮任务已启动 |
| `task:contextChecked` | 资料、场景、脚本和知识绑定检查结果 |
| `task:missingContextRequested` | 在当前表单或侧栏追问缺口 |
| `task:toolCall` | 搜索、知识检索、图片、报告、PDF 等工具进度 |
| `task:citation` | 资料、场景、网页、文件引用 |
| `task:partialArtifact` | 草稿文案、素材 brief、脚本片段 |
| `task:reviewRequested` | 用户确认、编辑、拒绝或重试 |
| `task:completed` | 写回完成，可导出交付物 |
| `artifact:created` / `evidence:recorded` | 交付物和证据已落库 |

当前已落地第一刀：`agent_app_runtime_get_task` 会从 `AgentRuntimeThreadReadModel` 投影 `taskStatus` 与 `taskEvents`，先覆盖 queued / progress / missing context / review request / tool call / evidence recorded / evidence verified / completed / cancelled / error / incident。`AgentAppRuntimePage` 已消费这组 snapshot 事件并转成 App 可见的 `AgentAppTaskStreamEvent`；App 也可以通过 `lime.agent.submitHostResponse` 把 ask_user / elicitation / tool_confirmation 响应回 `agent_app_runtime_submit_host_response`。它仍不是最终实时 stream，后续还要补 subscribe / artifact-created / evidence write-back 与跨刷新 task 恢复。

## 6. 与 Agent App 文档的关系

Agent App 文档负责 App 安装、Host Bridge、Capability SDK、UI runtime、manifest 和业务 App 形态。本文负责说明 `lime.agent` / `lime.workflow` 背后的后端事实源必须是 AgentRuntime Surface。

后续任何 Agent App 文档若提到“AI 能力”“Agent task”“workflow task”，必须回链到本文或 [./backend-surface-facade-plan.md](./backend-surface-facade-plan.md)，避免把 App SDK 误解成模型 API SDK。
