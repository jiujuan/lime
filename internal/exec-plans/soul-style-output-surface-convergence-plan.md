# Soul Style 输出面收敛执行计划

> 状态：active
> 创建时间：2026-07-06
> 绑定路线图：`internal/roadmap/soul/README.md`、`internal/roadmap/soul/personal-style-profiles.md`、`internal/roadmap/soul/personal-style-output-surfaces.md`
> 主目标：让 Soul Style Profile 不只影响欢迎语，而是按 L0-L4 分层覆盖用户可感知的完整输出面，尤其是工具调用前、中、后、协作执行、图片生成、错误恢复和历史回放。
> 用户验收锚点：Soul 风格必须铺满所有对话细节；用户在一轮真实任务里看到的工具前说明、工具完成承接、正文段落、转折句、失败恢复和结尾建议都不能退回默认助手口吻。

## 1. 路线图主线

Soul 是 Memory 个性化路线的子能力，唯一事实源仍是：

```text
memory.soul
  -> Soul Style Profile / Style Resolver / Boundary Guard
  -> memory_soul_prompt_context
  -> Agent Runtime facts / read model
  -> 前端 i18n / locale copy / UI projection
```

本计划不新增 `personalstyle`、不新增独立 Soul Runtime、不让 UI 组件自己发明人格化文案。后续新增或修改输出面必须先判断 L0-L4：

- `L0`：产品 i18n，只翻译 UI label / placeholder / button / aria / toast。
- `L1`：Soul 薄适配，只允许短状态低强度受 profile 影响。
- `L2`：Soul 正文，assistant narrative / 工具前后承接 / 缺参数追问由 prompt context 控制。
- `L3`：Generation Brief，正式 artifact / 报告 / 导出正文默认不受 Product Soul 污染。
- `L4`：专业强制，高风险、权限、删除、支付、法律、医疗、财务等降级为冷静专业口吻。

## 1.1 外部参考与本轮决策

本轮对照了三类参考：

1. OpenAI 官方 prompt / tool calling / Agents SDK 文档：
   - prompt 要把指令放在前面，并具体描述上下文、结果、格式和风格；需要输出形状时用示例表达，而不是只写模糊口吻词。
   - tool calling 是“模型决定调用工具 -> 应用执行工具 -> 工具输出回传模型 -> 模型生成最终回复”的多步流，工具输出应以结构化结果回到模型，再由模型承接。
   - Agents SDK 把 agent 定义为 `instructions + tools + guardrails + handoffs + structured outputs`，tool guardrails 能在工具前后校验 / 阻断 / 替换输出。
2. `/Users/coso/Documents/dev/python/hermes-agent`：
   - `SOUL.md` 是身份 / 口吻 prompt 输入，不是 UI i18n 句库。
   - 工具生命周期有 `pre_tool_call` / `post_tool_call` / `transform_tool_result` hook；`post_tool_call` 保持观察，真正改工具结果需要单独 transform seam。
   - 这对 Lime 的启发是：工具事实、观察、可改写结果、模型承接必须分层，不能由 UI 状态文本替模型“说人格”。
3. `/Users/coso/Documents/dev/js/openclaw`：
   - `SOUL.md`、`IDENTITY.md`、`USER.md` 等作为 bootstrap / developer instructions 注入；人格是版本化指令和上下文，不是组件级固定句子。
   - 文档明确系统 prompt 每轮组装，bootstrap 文件有 token 上限；这说明风格包也必须是可裁剪、可审计、可版本化的 prompt contract。

由此修正方案：

- 不再把四种风格扩成 `agentChat.soulInteraction.cheeky_sassy.*` 这类固定 i18n 句库。
- i18n 只负责 L0 和极少量 L1 产品 / 状态框架文案；真正的 Soul 表达来自 Style Pack directives、runtime facts、tool lifecycle contract 和模型 narrative。
- UI descriptor 只携带 `surface / phase / riskLevel / styleLevel / profileId / packId / toneVariant / facts`，本地渲染默认使用 neutral copy。
- 四种内置风格只是 built-in seed pack，不能成为组件里的 hard-coded switch；已收敛为 `src/lib/soul/style-profiles/packs/*.json` manifest + `builtInProfiles.ts` registry loader，运行时只认 resolver 输出。

## 1.2 与 Codex-first refactor/v1 对齐

Soul 不再被视为独立 runtime、第二套 transcript 或 UI 文案系统。后续所有 Soul 输出面必须挂到 `/internal/research/refactor/v1` 的 current 主链：

```text
Thread -> Turn -> RuntimeEvent -> Item/read model -> GUI projection
```

- `current`：Interaction Soul prompt context、Style Pack resolver、tool lifecycle metadata、collaboration facts、risk facts、content part / media reference projection。
- `dead / forbidden-to-restore`：共享旧 pack id `com.lime.builtin.default`、`personalstyle` 平行系统、profile-specific i18n 句库、组件内 profile id 文案 switch、从中文标题 / 状态反推 Soul。
- `forbidden`：为了兼容旧 profile id 或旧 pack id 新增 mapping / fallback；无客户、无存量迁移约束时直接替换并补回流守卫。
- 每个后续 Agent / Soul 改动都必须能说明 session/thread、turn、item 归属；GUI 不直接消费 provider wire event，也不从正文文案推断工具 / 协作生命周期。

## 2. 当前排查结论

用户反馈“除了欢迎语外感受不到 Soul”成立。当前实现已经具备 Style Profile 配置、resolver、prompt context、工具 lifecycle facts 和协作 facts；旧 runtime status profile title 薄适配已删除。大量用户可见输出面仍需要继续从固定中文、前端反推阶段和缺少工具事实分层的状态收敛到 current facts 主链。

截图验收锚点：

- `before_tool` 不能只是“收到！我现在开始给你抓取...”这类默认执行说明；必须能体现当前 profile 的节奏、边界和工具目的。
- `tool_group_completed` 之后的承接不能只是“好了，数据抓回来了”；必须按 profile 形成自然过渡，同时只基于工具 facts 给结论入口。
- 正文中的小标题、段落过渡、风险提示、下一步建议也属于对话细节；不能只让第一句有风格，后文退回通用报告腔。
- emoji、口头禅、固定前缀不能当作 Soul；风格要来自表达节奏、取舍、推进方式和失败处理方式。
- 按 profile 写固定 i18n 句库会直接制造“千篇一律”的模板感，属于错误方向；风格包应提供规则、反例、few-shot、强度、边界和验收约束，而不是每个 surface 的固定句子。

### 2.1 已覆盖或基本覆盖

| 分类                     | 路径                                                                                                                                             | 证据                                                                                                                                                                                                                                                             | 状态                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `current`                | `src/lib/soul/style-profiles/**`                                                                                                                 | 四种内置 profile 已从 TS 大对象迁到独立 Style Pack manifest JSON；`builtInProfiles.ts` 只做 registry loader 与 manifest 校验，resolver / boundary / directive 继续由纯函数和测试覆盖。                                                                                                                                        | 可继续作为前端 Style Resolver / Style Pack Registry 事实源。 |
| `current`                | `src/lib/soul/interactionCopy.ts`                                                                                                                | 已改为 neutral i18n rendered copy + `SoulCopyDescriptor` metadata；profile 差异只进入 `toneVariant/profileId/packId`。                                                                                                                                           | 本地 L1 copy descriptor 事实源。                           |
| `current`                | `src/components/settings-v2/general/memory/soul/StyleProfileSelector.tsx`                                                                        | 设置页可选择四种风格，展示文案走 `settings` i18n key。                                                                                                                                                                                                           | UI 入口已存在。                                            |
| `current`                | `lime-rs/crates/app-server/src/runtime/soul/**`                                                                                                  | `memory_soul_prompt_context.v2` 已进入 Interaction Soul packet，包含 style profile、boundary、allowed / forbidden moves。                                                                                                                                        | 模型正文和 welcome / 首轮 narrative 的主链已具备。         |
| `current`                | `src/components/agent/chat/projection/soulToolLifecycleDescriptor.ts`                                                                            | 为前端工具事件提供 `tool_lifecycle` descriptor：`phase/status/styleLevel/riskLevel/toneVariant/profileId/packId`。                                                                                                                                               | P3 前端 read model 第一刀已落地。                          |
| `current`                | `src/components/agent/chat/utils/toolBatchGrouping.ts` + `toolBatchGroupingCopy.ts`                                                              | 多工具折叠条标题、count、raw detail label 已迁到五语言 neutral i18n；batch descriptor 透出 `soulLifecycle/soulSurface/soulPhase/styleLevel/riskLevel/toneVariant/profileId/packId`。                                                                             | P4 工具 UI 第一刀已落地。                                  |
| `current`                | `src/components/agent/chat/utils/toolProcessSummary.ts` + `toolProcessSummaryMetadata.ts` + `toolProcessSummaryFacts.test.ts` + `toolSoulLifecycleMetadata.ts` | 单工具过程 narrative 已读取顶层 tool metadata 与 result metadata 合并结果，优先消费 key-based `tool_process_summary` / `process_summary` descriptor；没有 summary descriptor 时会先用 `tool_process_facts.subject` 作为主体，再回退 arguments / toolName 推断；并透出同一套 Soul lifecycle metadata。 | P4 工具 UI 第二刀已落地，metadata facts 消费 seam 已具备。 |
| `current`                | `src/components/agent/chat/components/ToolCallDisplay.tsx` + `InlineToolProcessStep.tsx`                                                         | 工具卡片和内联工具过程节点已显式消费 `ToolProcessNarrative` lifecycle metadata，并以稳定 `data-soul-*` contract 暴露给样式 / GUI evidence。                                                                                                                      | P4 工具 UI 第三刀已落地。                                  |
| `current`                | `src/components/agent/chat/components/timeline-utils/timelineCopy.ts`                                                                            | timeline / block 的状态、压缩、计划、审批、提醒和 process mix 基础 copy 已迁到 `agentChat.threadTimeline.*` 五语言 neutral i18n。                                                                                                                                | P4 / P7 timeline 第一刀已落地。                            |
| `current`                | `src/components/agent/chat/components/timeline-utils/collaborationCopy.ts`                                                                       | 聊天 timeline 中 subagent / 协作执行标题、状态、预览 fallback、打开详情按钮已迁到 `agentChat.collaboration.*` 五语言 neutral i18n，并清理旧 `agentChat.threadTimeline.subagent.*` owner。                                                                        | P6 / P7 collaboration 第一刀已落地。                       |
| `current`                | `packages/agent-runtime-projection/src/collaborationFacts.ts` + `subagentStatusEvents.ts` + `appServerFacts.ts` + `src/lib/api/agentProtocol.ts` + `src/components/agent/chat/projection/subagentStatusProjection.ts` | subagent / handoff / worker notification / App Server replay 协作事件已补 `collaborationFacts`、`collaborationSurface`、`collaborationPhase`、`styleLevel`、`riskLevel`、`profileId/packId/toneVariant`，前端协议解析保留 event metadata，GUI projection 不再丢 style identity。 | P6 package / App Server collaboration facts 第一刀已落地。 |
| `current`                | `packages/agent-ui-contracts/src/projection.ts` + `packages/agent-runtime-projection/src/subagents.ts` + `packages/agent-runtime-ui/src/subagents.tsx` + `src/components/agent/chat/components/importedRuntimeEventDetailViewModel.ts` | 标准 Subagents model 的 thread / delegation / activity 已携带 `collaboration` view，`SubagentsView` / `AgentWorkbenchSurface` DOM 暴露 `data-collaboration-*` 与 `data-soul-*` contract；workbench task rail 的 imported runtime detail 已按 `collaborationFacts` facts-first 分类并展示结构化 style / risk / profile / pack / tone facts。 | P6 / P7 非 timeline 协作展示第一刀已落地。 |
| `current`                | `lime-rs/crates/app-server/src/runtime_backend/tool_events.rs` + `tool_process_metadata.rs` + `tool_process_external_metadata.rs` + `tool_process_risk_metadata.rs` + `tool_process_kind_metadata.rs` + `packages/agent-runtime-projection/src/toolLifecycleMetadata.ts` + `toolSurface.ts` + `src/lib/api/agentRuntime/appServerEventStream.ts` + `runtime/event_store.rs` | runtime-generated `tool.started` / `tool.result` / `tool.failed` 已产出 key-based `tool_process_summary` descriptor、`tool_process_facts`、基础 `tool_lifecycle` metadata，并从 active Soul config metadata 注入 `profileId/packId/toneVariant`；external append 的 `tool.started` / `tool.progress` / `tool.output.delta` / `tool.result` / `tool.failed` 入库前也会补同一套 facts，且可从 active tool 或 current config 继承 style identity；危险命令、权限 / sandbox、生产 / infra / 数据库影响由 `tool_process_risk_metadata.rs` 统一打到 `riskLevel=high` + `styleLevel=L4`；工具 `toolFamily/tool_family` 与 `operationKind/operation_kind` 由 `tool_process_kind_metadata.rs` 写入 facts；package projection 和前端 event stream 保留工具 lifecycle metadata，并把 `tool.failed` 映射为 `tool_end`。 | P3 后端 / package facts 第三刀继续推进。                 |
| `current`                | `lime-rs/crates/agent/src/request_tool_policy/runtime_status.rs`                                                                                 | 只保留 retry / synthesis / continuation 的 neutral diagnostics status：`phase/title/detail/checkpoints/metadata`。已删除按 `memory.soul.styleProfile` switch profile id 并改中文标题的旧旁路。                                                                  | Runtime status 不再是 Soul profile 文案入口。              |
| `current`                | `scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario soul-style --soul-style-profile <id>`                                     | fixture 已支持四个 built-in profile 参数化运行；可证明 `memory.soul` 配置、pack id、强度、完整 lifecycle surface contract 和 profile-specific deterministic transcript 经真实 Electron / GUI / App Server runtime prompt / provider / read model 到达用户可见输出。 | 作为 transcript regression 证据；不替代真实业务工具链自然度验收。 |

### 2.2 主要缺口

| 输出面                       | 路径                                                                                                                                                                                                                | 缺口                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 治理分类                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 本地 Soul copy               | `src/lib/soul/interactionCopy.ts`                                                                                                                                                                                   | 已迁到 neutral UI copy + descriptor metadata；还需继续把更多 L1/L2 调用面接入 descriptor，而不是只覆盖等待态 / 失败态。                                                                                                                                                                                                                                                                                                                               | `current but incomplete`，禁止 profile 句库。                                                                                       |
| 工具过程摘要                 | `src/components/agent/chat/utils/toolProcessSummary.ts`、`toolProcessSummaryMetadata.ts`、`toolProcessSummaryBuilders.ts`、`toolSoulLifecycleMetadata.ts`                                                           | 已走 i18n / content-workbench copy，narrative 透出 Soul lifecycle metadata，工具卡片 / 内联过程节点已消费该 metadata；前端已可优先消费 runtime 提供的 key-based `tool_process_summary / process_summary` descriptor，并拒绝 raw string 终稿；无 summary descriptor 时已优先读取 `tool_process_facts.subject`，并优先使用 `toolFamily/tool_family` 决定泛化读 / 写 / 搜 / 抓取 / 浏览器 / 命令摘要，再回退 arguments / toolName 推断；runtime-generated、external append 与 package projection 工具生命周期已产出 / 保留 descriptor facts、kind facts 与 risk facts 第一刀。 | `current but incomplete`，P3 后端 facts 与 P4 消费 seam 已落地；仍保留特殊工具名专属分支和 fallback。                                   |
| 多工具折叠条                 | `src/components/agent/chat/utils/toolBatchGrouping.ts`、`toolBatchGroupingCopy.ts`、`toolSoulLifecycleMetadata.ts`                                                                                                  | 固定中文已迁到五语言 i18n，descriptor 已透传 Soul lifecycle metadata；现在优先消费 `tool_process_facts.operationKind / operation_kind` 聚合网页搜索、网页读取、探索和浏览器轨迹，并用 `tool_process_facts.subject` 做 hint；未知工具才回退本地工具名 / 参数分类。                                                                                                                                                                                        | `current but incomplete`，P4 facts 消费第一刀完成；后续继续收特殊工具和协作 facts。                                                  |
| 工具前后 assistant narrative | Prompt / model response / result summarizer                                                                                                                                                                         | 工具前“收到、开始抓取”、工具后“好了，数据抓回来了”等承接句没有稳定按 profile 生成；后续正文也容易退回默认报告腔。                                                                                                                                                                                                                                                                                                                                     | `current but incomplete`，这是用户最直接感知缺口。                                                                                  |
| Timeline / block 文案        | `src/components/agent/chat/components/timeline-utils/blockResolvers.ts`、`statusMapping.ts`、`statusHintResolvers.ts`、`timelineCopy.ts`、`collaborationCopy.ts`、`AgentThreadTimelineItemRenderers.tsx`            | 基础状态、上下文压缩、计划、审批、提醒、process mix 已迁到 `agentChat.threadTimeline.*` 五语言 neutral i18n；聊天 timeline 的协作执行文案已迁到 `agentChat.collaboration.*`。标准 Subagents runtime/workbench surface、workbench task rail 与 `AgentRuntimeStrip` 已消费 `collaborationFacts` 第一刀；后续继续补更完整 `riskLevel/styleLevel` descriptor 展示消费和业务协作入口。                                                                                                                                             | `current but incomplete`，P4 / P7 timeline 第一刀、P6 facts owner 与非 timeline 第一刀完成，继续收业务入口。                               |
| 工具事件 projection          | `src/components/agent/chat/projection/toolEventProjection.ts`、`agentStreamTimelineItemProjector.ts`、`src/lib/api/agentRuntime/appServerEventStream.ts`、`packages/agent-runtime-projection/src/appServerFacts.ts` | 前端 projection 已给 tool owner event / timeline item 补 `soulLifecycle/soul_lifecycle` metadata；event stream 已透传 tool start / args / input delta / progress / output delta metadata 并接住 `tool.failed`；external append 入库前已补 facts；package 级 projection 已把 snake/camel lifecycle metadata 归一成 stable payload facts。                                                                                                                                       | `current but incomplete`，runtime-generated / external append / package event facts 第一刀已落地，risk/profile 继续补。                |
| Runtime tool lifecycle       | `lime-rs/crates/app-server/src/runtime/tool_lifecycle.rs`、`lime-rs/crates/app-server/src/runtime_backend/tool_events.rs`、`tool_process_metadata.rs`、`tool_process_external_metadata.rs`、`tool_process_risk_metadata.rs` | `tool_events.rs` + `tool_process_metadata.rs` 已产出 runtime-generated descriptor / facts；external `action.required` / `permission.denied` / `sandbox.blocked` 已补 `riskLevel=high` + `styleLevel=L4` facts 第一刀；`tool_process_risk_metadata.rs` 已覆盖危险命令、policy denied、sandbox blocked、删除 / VCS / 数据库 / infra / sudo 类风险；`tool_lifecycle.rs` 仍只校验顺序、owner、action pending，后续需要把更细 risk taxonomy 和 UI / prompt fixture 补齐。                                                                                                           | `current but incomplete`。                                                                                                          |
| LLM protocol tool events     | `lime-rs/crates/runtime-core/src/llm_protocol/events.rs`                                                                                                                                                            | `tool.started` payload 只有 `toolCallId/toolName/arguments/source/backend/runtimeEvent`，没有 `phase/facts/riskLevel`。                                                                                                                                                                                                                                                                                                                               | `current but incomplete`。                                                                                                          |
| 图片生成块                   | `lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs`、相关 UI block                                                                                                                        | 后端已有 intro / caption 的 Soul 说明，但图片块标题、参数摘要、生成中状态、完成 caption 的 L0-L2 分层缺少统一验收。                                                                                                                                                                                                                                                                                                                                   | `current but incomplete`。                                                                                                          |
| 协作执行 / subagents         | `packages/agent-runtime-projection/src/collaborationFacts.ts`、`subagentStatusEvents.ts`、`subagents.ts`、`appServerFacts.ts`、`src/lib/api/agentProtocol.ts`、`packages/agent-runtime-ui/src/subagents.tsx`、`src/components/agent/chat/components/importedRuntimeEventDetailViewModel.ts`、`src/components/agent/chat/components/AgentRuntimeStrip.tsx`、Agent Chat timeline | 聊天 timeline 的 subagent 标题、状态、预览和详情按钮已统一到 `agentChat.collaboration.*`；package projection 与 App Server replay 已补 `collaborationFacts` / style metadata；标准 Subagents runtime/workbench surface 已暴露 `data-collaboration-*` / `data-soul-*`，workbench task rail 已按 facts-first 展示协作 style metadata；`AgentRuntimeStrip` 已用同一 helper 暴露 runtime strip collaboration / Soul metadata contract。仍需继续盘点业务协作入口是否未接同一 facts。 | `current but incomplete`，P6 facts owner 与非 timeline surface 第一刀完成，继续收剩余业务入口和 GUI evidence。                       |
| 测试标准                     | `src/lib/soul/**/*.unit.test.ts`、Claw fixture                                                                                                                                                                      | 多数测试证明配置和 prompt，缺少同一工具生命周期下四风格 golden / snapshot / GUI evidence。                                                                                                                                                                                                                                                                                                                                                            | `deprecated`：不能继续把“欢迎语或 prompt 包含 profile id”当完成标准。                                                               |
| 风格包事实源                 | `src/lib/soul/style-profiles/packs/*.json`、`src/lib/soul/style-profiles/builtInProfiles.ts`、`lime-rs/crates/app-server/src/runtime/soul/style_profile.rs`                                                             | 四个 profile 已从共享 `com.lime.builtin.default` 改为四个独立 built-in Style Pack manifest；前端 registry loader 校验 `source/schema/profile/packId` 并输出 resolver 可消费的 profile，`voicePrimitives / surfaceContracts / antiRepetitionRules / fewShotAnchors / riskFallback` 不再写成 TS profile switch。                                                                                                                                        | `current but incomplete`，前端 manifest registry 已落地；仍需继续消除 App Server 静态重复对象，并补 installed pack / locale resource 校验。 |

## 3. 事实源与废弃口径

### 3.1 current

- `memory.soul` 保存用户显式 Soul / Style Profile 配置。
- `src/lib/soul/style-profiles/**` 作为前端 Style Resolver、Boundary Guard 和风格包 manifest 事实源。
- `lime-rs/crates/app-server/src/runtime/soul/**` 作为 App Server prompt context 事实源。
- Agent Runtime facts / App Server event / read model 作为工具事实、结果、风险和生命周期状态事实源。
- 前端 i18n resources 和未来 Rust locale copy service 作为本地 UI 文案事实源。

### 3.2 current but incomplete

- `src/lib/soul/interactionCopy.ts`：保留 helper 位置，但返回值必须从中文终稿改为 `{ key, values, toneVariant?, level, riskLevel? }` 一类 descriptor。
- 工具 summary / grouping / timeline：保留投影和展示职责；`toolBatchGrouping` 已迁到 neutral i18n + lifecycle metadata，`toolProcessSummary` 已透出 lifecycle metadata，并可优先消费 runtime 提供的 key-based 过程摘要 descriptor；工具卡片 / 内联过程节点已消费 lifecycle data contract；timeline 基础 copy 已迁到 `agentChat.threadTimeline.*`，聊天协作执行 copy 已迁到 `agentChat.collaboration.*` 五语言 neutral i18n；package / App Server 协作事件已补 `collaborationFacts` 与 style metadata，标准 Subagents runtime/workbench surface、workbench task rail 和 `AgentRuntimeStrip` 已消费 facts 第一刀；业务协作入口和更完整 `riskLevel/styleLevel` 展示消费仍需继续收口，不得继续自造人格化事实。
- Runtime-generated tool events：`tool.started` / `tool.result` / `tool.failed` 已有 key-based `tool_process_summary`、`tool_process_facts` 与基础 lifecycle metadata；external append 的 `tool.progress` / `tool.output.delta` / 终态已补同一套 lifecycle / facts 第一刀；external `action.required` / `permission.denied` / `sandbox.blocked` 已补 L4 risk facts 第一刀；package projection 已保留同一套 metadata；仍缺更广危险操作分类和 profile / pack metadata 统一。
- Runtime status Soul 适配：保留低强度 L1 能力，但需要迁到稳定 key / facts，不直接拼中文。
- Style Profile built-ins：保留四个内置 profile 作为首发 seed，但必须由 Style Pack Registry / manifest 读取；组件、i18n、工具 renderer 不得按 profile id 分支写文案。

### 3.3 deprecated

- 前端组件按工具名、参数、状态反推“阶段 + 用户文案”的策略；`toolBatchGrouping`、timeline 第一批基础 copy 和聊天协作执行 copy 已收掉中文终稿，`toolProcessSummary` 已增加结构化 descriptor、subject facts 与 kind facts 优先入口，但特殊工具专属摘要、更广协作状态与 GUI golden 仍需继续收口。
- 本地 copy helper 返回固定中文终稿的策略；新增 UI copy 必须走五语言 i18n 或 locale copy service。
- 只用 prompt contains `Style profile` 或欢迎语变化证明 Soul 完成的验收标准。
- `agentChat.soulInteraction.<tone>.*` 这种按 tone 展开的一整套本地句库。

### 3.4 dead / forbidden-to-restore

- 新增 `personalstyle` 平行系统、独立 Runtime、独立数据库表。
- 把 `SOUL.md` 作为每轮运行时扫描事实源。
- 让 Product Soul 默认改写正式 artifact 正文。
- 为每个 profile 在每个组件里硬编码一整套中文句子。
- 通过 emoji、固定口头禅、固定开场白来伪装 Soul 已覆盖。

## 4. 实施计划

### P0. Inventory 与计划落盘

- [x] 对齐 `internal/roadmap/soul/personal-style-output-surfaces.md` 的 L0-L4 和工具生命周期合同。
- [x] 盘点已覆盖路径、缺口路径和治理分类。
- [x] 创建本计划文件并登记进度日志。
- [ ] 后续每完成一刀，同步更新本文件的 checklist 与进度日志。

退出条件：计划文件可作为 Soul 输出面实施跟踪入口。

### P1. 定义统一 Soul copy descriptor

- [ ] 在前端定义稳定的 `SoulInteractionSurface` / `SoulCopyDescriptor` / `SoulStyleLevel` 类型，表达 `surface`、`phase`、`status`、`i18nKey`、`values`、`facts`、`styleLevel`、`riskLevel`。
- [x] `src/lib/soul/interactionCopy.ts` 改为 descriptor helper：rendered local copy 只用 neutral key，style 只进入 metadata。
- [x] 清理 `agentChat.soulInteraction.<tone>.*` style-specific i18n 句库，只保留 `agentChat.soulInteraction.neutral.*` 五语言 key。
- [x] 补五语言 i18n key completeness 测试，禁止 helper 返回 style-specific key 或中文终稿。
- [ ] 保持高风险 / 正式 artifact 走 L4 / L3 boundary。

退出条件：本地 copy helper 不再直接返回展示句子，现有调用点能通过 adapter 迁移。

### P1.5 Style Pack Registry 去硬编码

- [x] 把四个内置风格从“代码里共享一个 default pack id”改为 registry seed：
  - `com.lime.soul.cheeky-sassy-executor`
  - `com.lime.soul.warm-supportive-companion`
  - `com.lime.soul.cool-confident-operator`
  - `com.lime.soul.calm-professional-partner`
- [x] 前端 `builtInProfiles.ts` 只导出 registry seed / resolver 消费数据，不允许 UI 组件直接 switch 四个 profile id。
- [x] Rust `style_profile.rs` 与前端 registry 字段保持同构，至少同步 `packId / profileId / responseContract / allowedMoves / forbiddenMoves / surfaceContracts`。
- [x] Style Pack manifest 增加 `voicePrimitives`、`surfaceContracts`、`antiRepetitionRules`、`fewShotAnchors`、`riskFallback`；其中 few-shot 是风格示例，不是固定可渲染句子。
- [x] 增加守卫：新增 `soulInteraction.<tone>` i18n key、旧共享 `com.lime.builtin.default` pack id、或工具 renderer 直接拼人格化句子时失败。
- [ ] 增加更精细的组件允许列表守卫：组件内 profile id 只能作为 metadata / test fixture 出现，不能 switch 出 profile-specific 展示文案。

退出条件：新增或替换风格只需要注册 manifest，不需要修改工具卡片、timeline、i18n 句库或每个 UI 组件。

### P2. 迁移等待态、Home preview、runtime status、协作 preview

- [x] 迁移 Home pending preview / Workspace initial dispatch 的本地文案到 neutral i18n key + Soul metadata。
- [x] 迁移前端 initial / waiting / failed runtime status：本地展示仍是 neutral copy，metadata 带 `soul_copy / soul_surface / soul_phase / style_level / risk_level / tone_variant / profile_id / pack_id`。
- [x] 删除 `runtime_status.rs` 的 L1 Soul title profile-id switch；runtime status 只保留 neutral diagnostics copy，不再从 `memory.soul.styleProfile` 反推用户可见标题。
- [ ] 迁移 subagents ready / preparing / failure prefix 到 `agent.runtime.collaboration.*`。
- [ ] 补 React / Rust 定向测试，确保四 profile 只影响允许的 L1 输出。

退出条件：用户发送后到首个模型事件前的所有本地状态文案都可 locale 化，并能解释哪些受 Soul、哪些不受。

### P3. 工具 lifecycle read model

- [x] 前端新增 `soulToolLifecycleDescriptor`，把 `started/input_delta/progress/output_delta/completed/failed` 映射到 `before_tool/tool_progress/after_tool_success/after_tool_failure`。
- [x] `toolEventProjection.ts` 给 tool owner payload 补 `soulLifecycle / soulSurface / soulPhase / styleLevel / riskLevel / toneVariant / profileId / packId`。
- [x] `agentStreamTimelineItemProjector.ts` 给 thread item metadata 补 snake_case `soul_lifecycle / soul_surface / soul_phase / style_level / risk_level / tone_variant / profile_id / pack_id`。
- [x] `agentStreamRuntimeHandler.test.ts` 更新为 current stream 口径：process boundary 之后的最终正文必须用结构化 `phase=final_answer` + `itemId` 表达，避免继续把 legacy 无 phase 文本当 final answer。
- [x] 在 App Server runtime-generated `tool.started` / `tool.result` / `tool.failed` 边界补第一批工具事件 descriptor：`phase`、`status`、`toolName`、`tool_process_facts`、`riskLevel`、`styleLevel`。
- [x] 前端 App Server event stream 保留 `tool.started` metadata，并把 `tool.failed` 归一为 `tool_end`，确保失败恢复也能进入工具 narrative。
- [x] `tool.output.delta`、`tool.progress`、external append 工具事件进入 UI 前补齐同一套稳定 facts 字段第一刀。
- [x] package projection 进入 UI 前补齐同一套稳定 facts 字段。
- [x] external `action.required` / `permission.denied` / `sandbox.blocked` 与 `riskLevel=high`、`styleLevel=L4` 关联第一刀。
- [x] `profileId / packId / toneVariant` 从 active `memory.soul.styleProfile` config metadata 进入 runtime-generated tool lifecycle facts；external append 优先保留 payload / active tool 已有 style identity，并可从 current config metadata 补齐。
- [x] 将危险命令、policy denied、sandbox blocked、删除 / VCS / 数据库 / infra / sudo 类风险与 `riskLevel=high` 关联，命中 L4 时强制专业。
- [x] 将工具 `toolFamily/tool_family` 与 `operationKind/operation_kind` 写入 `tool_process_facts`，让 UI 可从 App Server facts 读取读 / 写 / 搜 / 抓取 / 浏览器 / 命令等低层分类。
- [ ] 继续扩展细粒度 risk taxonomy，并补四风格同一工具生命周期的 GUI / golden fixture。
- [ ] 前端 `toolEventProjection.ts` / `packages/agent-runtime-projection` 不再靠 UI 组件反推工具阶段。

退出条件：工具 UI 只消费 lifecycle descriptor，不再从工具名和状态拼生命周期含义。

### P4. 工具 UI 套用 L0 / L1 / L2

- [x] `toolProcessSummary.ts` narrative 输出透出 `soulLifecycle / soulSurface / soulPhase / styleLevel / riskLevel / toneVariant / profileId / packId`；streaming tool call 合并 `result.metadata` 与顶层 `toolCall.metadata`，thread process item 读取 item metadata。
- [x] `toolProcessSummaryMetadata.ts` 支持 `tool_process_summary / toolProcessSummary / process_summary / processSummary` 结构化 descriptor；只接受 `toolCall.processSummary.*` 与 `toolCall.siteResult.*` key-based i18n descriptor，不渲染 raw string 终稿。
- [x] `agentStreamTimelineItemProjector` 回归覆盖 `tool_end.result.metadata.tool_process_summary` 保留到 thread item，并能被 `resolveAgentThreadToolProcessNarrative` 渲染成 locale copy。
- [x] `toolProcessSummaryBuilders.ts` 已先读取 `tool_process_facts.subject` 作为摘要主体，减少从 arguments / toolName 反推主体。
- [x] `toolProcessSummaryBuilders.ts` 从 App Server `tool_process_facts.toolFamily / tool_family` 读取泛化工具 family，减少按工具名本地推断。
- [x] `toolBatchGrouping.ts` 从 App Server `tool_process_facts.operationKind / operation_kind` 读取批次 operation kind，减少按工具名本地推断。
- [x] `toolBatchGrouping.ts` 的折叠条、count、raw detail label 迁到五语言 neutral i18n；新增 `toolBatchGroupingCopy.ts`、`toolBatchGroupingTypes.ts`、`toolSoulLifecycleMetadata.ts` 拆分 copy / 类型 / Soul metadata 提取，主文件降到 789 行。
- [x] `ToolBatchSummaryDescriptor` 透出 `soulLifecycle / soulSurface / soulPhase / styleLevel / riskLevel / toneVariant / profileId / packId`，streaming tool call 和 thread process batch 都可从 metadata 读取。
- [x] `ToolCallDisplay.tsx` / `InlineToolProcessStep.tsx` 消费 `ToolProcessNarrative` lifecycle metadata，并输出稳定 `data-soul-lifecycle / data-soul-surface / data-soul-phase / data-soul-style-level / data-soul-risk-level / data-soul-tone-variant / data-soul-profile-id / data-soul-pack-id`。
- [x] `timeline-utils/blockResolvers.ts`、`statusMapping.ts`、`statusHintResolvers.ts` 与 `AgentThreadTimelineItemRenderers.tsx` 的基础 timeline copy 接入 `timelineCopy.ts`，并补齐 `agentChat.threadTimeline.*` 五语言 key。
- [ ] 工具成功、部分失败、失败恢复的 assistant 承接由模型 narrative 或 result summarizer 输出，避免 UI label 私自总结事实。

退出条件：同一工具生命周期在四种 profile 下有可见差异，但数字、工具名、来源、错误原因保持事实一致。

### P5. Assistant narrative 与 prompt 验收

- [x] deterministic transcript fixture 覆盖 `before_tool`、`tool_running`、`after_tool_success`、`after_tool_partial_failure`、`after_tool_failure`、`body_detail`、`closing_suggestion` 的同 facts 四风格自然语言差异。
- [x] Electron / Claw transcript fixture 覆盖同一工具 facts 下四风格真实运行时自然语言差异。
- [x] prompt / Style Pack few-shot anchor 守卫覆盖 `before_tool`、`tool_running`、`after_tool_success`、`after_tool_partial_failure`、`after_tool_failure`、`body_detail`、`closing_suggestion`。
- [ ] golden transcript 覆盖贱兮兮防复读、拽酷不过度装腔、温柔不鸡汤、专业高风险降级。
- [ ] fast-response / direct answer 分支确认不跳过 Interaction Soul。
- [ ] 工具结果承接句只引用 read model / tool result 中存在的事实。
- [ ] 覆盖整轮对话细节：工具前说明、工具完成承接、正文小标题、段落转折、风险提示、下一步建议都必须跟随 profile，不允许只让欢迎语或首句有变化。
- [ ] 以截图类真实任务为 golden：同一任务切换 `cheeky_sassy_executor` / `cool_confident_operator` 后，before tool、after tool 和最终正文应明显不同，但事实和引用保持一致。
- [x] prompt context 增加明确 surface contract：
  - `before_tool`：说明为什么需要工具、预期拿什么证据，不承诺结果。
  - `tool_running`：只说明当前 checkpoint，不描述未返回事实。
  - `after_tool_success`：用工具 facts 形成自然承接和结论入口。
  - `after_tool_partial_failure`：分清成功 / 失败 / 影响 / 补救。
  - `after_tool_failure`：说明失败原因和恢复动作，高风险降 L4。
  - `body_detail`：小标题、段落转折、风险提示、下一步建议都受 profile 指令约束。
  - `closing_suggestion`：结尾建议跟随 profile，但不进入固定 follow-up chip 句库。
- [x] prompt 测试禁止“只含 profile id 即通过”；必须断言 surface contract、anti-repetition、risk fallback、facts-only 约束进入 `memory_soul_prompt_context`。

退出条件：不只欢迎语，普通正文、轻量问答和工具前后自然语言都能体现 profile。

### P6. 图片、artifact、协作、插件 surface

- [ ] 图片生成块标题 / 参数摘要固定 L0；生成中状态 L1；caption / 迭代建议 L2；正式产物不受 Product Soul。
- [ ] artifact title / export / copy prompt 区分 L0 和 L3。
- [x] 聊天 timeline 的协作执行统一到 `agentChat.collaboration.*` copy owner，不在 timeline copy 中散写“子任务”。
- [x] package projection / App Server replay 协作事件补 `collaborationFacts`、`collaborationSurface`、`collaborationPhase`、`styleLevel`、`riskLevel` 和 `profileId/packId/toneVariant` 第一刀。
- [x] 标准 Subagents runtime/workbench surface 与 workbench task rail 统一消费 `collaborationFacts` 第一刀，暴露 `data-collaboration-*` / `data-soul-*` contract，并展示结构化 style / risk / profile / pack / tone facts。
- [x] `AgentRuntimeStrip` 接入 `buildAgentUiCollaborationPayloadMetadata(...)`，暴露 `data-collaboration-*` / `data-soul-*` contract，避免 runtime strip 从标题、中文状态或局部 UI state 反推协作含义。
- [ ] 继续盘点并接入业务协作展示入口，避免从标题、中文状态或局部 UI state 反推协作含义。
- [ ] 插件 host-managed generation 的过程说明按 L1-L2，插件产物正文仍走 Generation Brief。

退出条件：图片、artifact、协作、插件输出面完成 L0-L4 分类，并有最小回归。

### P7. i18n 与硬编码清理

- [ ] 扫描并清理新增或改动 surface 的硬编码中文：按钮、标题、空态、toast、confirm、prompt、placeholder、aria/title、错误提示。
- [x] Timeline / block 第一批基础 copy 五语言补齐 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`，并增加 key completeness 测试。
- [x] Chat timeline collaboration copy 五语言补齐 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`，并清理旧 `agentChat.threadTimeline.openSubagent` / `preview.subagent.*` / `subagent.*` owner。
- [ ] 继续扫描并清理新增或改动 surface 的硬编码中文：按钮、标题、空态、toast、confirm、prompt、placeholder、aria/title、错误提示。
- [ ] 继续五语言补齐后续新增 surface 的 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- [ ] 增加或复用 key completeness / no-hardcoded-copy 守卫，避免中文终稿回流到 helper。
- [ ] 保留工具名、provider、模型名、URL、文件名、trace id 原样不翻译。
- [x] 专门增加 no-style-phrase-bank 守卫：`agentChat.soulInteraction.(cheeky_sassy|warm_supportive|cool_confident|calm_professional).*` 这类 key 不能进入 `agent.json`。

退出条件：非模型生成的 UI 框架文案都可 locale 化，英文/日文/韩文界面不会混入中文 Soul 句子。

### P8. GUI / Claw 真实验收

- [x] 跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario soul-style --timeout-ms 180000 --prefix soul-style-smoke`。
- [ ] 用真实 Claw / Electron 路径发送一个会触发工具的任务，截图和 trace 覆盖工具前、中、后。
- [ ] 切换 `cheeky_sassy_executor` 与 `cool_confident_operator` 对比工具生命周期和最终回复。
- [ ] 切换 `calm_professional_partner` 覆盖失败恢复或权限 / 高风险降级。
- [ ] 确认 GUI evidence 不保存完整 system prompt、Provider request / response、API key 或用户私密 prompt。

退出条件：用户可在真实 GUI 中感受到 Soul 不只出现在欢迎语，而是贯穿允许受影响的输出面。

## 5. 最小验证入口

按每刀实际触碰面缩小验证，不默认无差别全量跑：

```bash
npm exec vitest run src/lib/soul
npm exec vitest run src/components/agent/chat/utils src/components/agent/chat/components
cargo test --manifest-path "lime-rs/Cargo.toml" soul_prompt_context runtime_status tool_lifecycle
npm run test:related -- <changed-files>
npm run test:contracts
npm run verify:gui-smoke
```

涉及 Rust workspace 边界时遵守仓库规则：在根目录运行必须带 `--manifest-path "lime-rs/Cargo.toml"`。

## 6. 进度日志

### 2026-07-06

- 完成 P0 inventory：确认 Style Profile 设置页、前端 resolver、App Server prompt context 已存在，但输出面覆盖严重不足。
- 确认最阻塞主线的缺口不是“再补几个欢迎语”，而是工具生命周期和本地 UI copy 没有统一 descriptor / i18n / facts 边界。
- 新建本计划作为后续实施追踪入口。
- 计划文件已加入 `internal/exec-plans/README.md` 和 `.gitignore` 白名单，确保后续可作为 versioned artifact 跟踪。
- 根据截图反馈补充硬验收：Soul 风格要铺满整轮对话细节，尤其是工具前说明、工具完成承接和正文段落，不能只覆盖欢迎语、状态条或第一句。
- 下一刀：优先做 P1 + P2，先把 `interactionCopy.ts` 从中文终稿改成 descriptor + i18n adapter，再迁移等待态 / runtime status 的最小调用面。
- 根据最新反馈修正方案：四种风格不能通过 hard-coded i18n 句库实现；Style Pack 必须承载规则、反例、few-shot、边界和验收合同，UI 只渲染 neutral copy 与 descriptor metadata。
- 对照 OpenAI 官方 prompt / tool calling / Agents SDK 文档，以及 Hermes / OpenClaw 的 `SOUL.md` / tool hook / bootstrap prompt 做法，明确 Soul 需要落在 prompt contract + tool lifecycle facts + read model 上，而不是组件文案分支。
- 清理上一轮错误方向：移除 `agentChat.soulInteraction.<tone>.*` style-specific i18n 句库，补齐 `ko-KR` neutral key，并把 `interactionCopy` 单测改为验证 neutral rendered copy + style metadata + no-style-phrase-bank guard。
- 新增 P1.5：Style Pack Registry 去硬编码。四个内置风格后续按独立 pack manifest seed 注册，组件、工具 renderer、i18n 不直接 switch profile id。
- 同步更新 `internal/roadmap/soul/**`：把 README、架构、PRD、验收、rollout、profiles、output surfaces、pack installation、diagrams 都改成 Style Pack Registry / Resolver / tool lifecycle facts 的方案口径，不再只更新执行计划。
- 前端四个内置 profile 已从共享 `com.lime.builtin.default` 改成独立 built-in seed pack，并补齐 `voicePrimitives / surfaceContracts / antiRepetitionRules / fewShotAnchors / riskFallback`；Rust `runtime/soul/style_profile.rs` 已同步同构字段。
- App Server `memory_soul_prompt_context` 已把 surface contract、anti-repetition、few-shot anchors、risk fallback、persona context boundary 注入 Interaction Soul packet；同时将边界 / persona 信息排在 profile 长规则前，并把 Soul packet budget 调整到 1400，避免完整风格合同互相截断。
- 验证通过：`npm exec vitest run src/lib/soul`，3 files / 23 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server soul_prompt_context`，3 passed；`git diff --check -- <Soul相关文件>` 无输出。
- 扫描结果：旧共享 `com.lime.builtin.default` 和 `agentChat.soulInteraction.<tone>.*` 只剩路线图 / 计划中的禁止或历史说明，以及新的 `BUILT_IN_SOUL_STYLE_PACK_IDS` registry seed 常量引用；未发现 tone-specific i18n 句库回流。
- 下一刀：P3 工具 lifecycle read model，把 `phase/status/toolName/facts/riskLevel/styleLevel/profileId/packId` 从 App Server / runtime projection 稳定送到 UI；随后 P4 让工具卡片、批量折叠条和过程摘要只消费 descriptor。
- 验证通过：`npm exec vitest run src/lib/soul`。
- 同步 `internal/roadmap/soul/**` 路线图事实源：README、architecture、personal-style-profiles、personal-style-output-surfaces、personal-style-pack-installation、acceptance 全部改为四个 built-in Style Pack seed + registry、全对话细节覆盖、i18n neutral copy 和禁止 profile 句库口径。
- 实施 P1.5 最小代码闭环：前端四个 profile 改为独立 pack id，Rust prompt context 同步 pack id、surface contract、anti-repetition、few-shot anchor、risk fallback；更新前端和 Rust 单测断言。
- 实施 P2 第一刀：`homePendingPreview`、workspace send waiting preview、initial / waiting / failed runtime status 都保留 neutral copy，同时把 Soul descriptor metadata 写入 message/runtime status。
- 实施 P3 前端 read model 第一刀：新增 `soulToolLifecycleDescriptor`，并把 `toolEventProjection` payload 与 `agentStreamTimelineItemProjector` thread item metadata 接到同一套 `tool_lifecycle` descriptor。
- 修正 runtime handler 回归 fixture：工具 / reasoning process boundary 之后的最终正文用 current `phase=final_answer` + `itemId` delta 表达；旧无 phase 文本继续按 legacy fallback 处理，不作为新验收口径。
- 验证通过：`npm exec vitest run src/lib/soul "src/components/agent/chat/utils/agentRuntimeStatus.unit.test.ts" "src/components/agent/chat/hooks/agentStreamErrorController.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitFailure.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitDraft.component.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitContext.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeStatusController.test.ts" "src/components/agent/chat/AgentChatWorkspace.homePendingPreview.test.ts" "src/components/agent/chat/workspace/workspaceSendHelpers.test.ts" "src/components/agent/chat/projection/toolEventProjection.test.ts" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.test.ts" "src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.unit.test.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts"`，16 files / 144 tests passed。
- Related residual 已登记：`npm run test:related -- <Soul相关文件>` 仍有非 Soul 主链失败，包括 `TaskCenterUtilityToolbar` locale 泄漏和 `index.workbench01.test.tsx` 轻量预览 race；本轮已解决 `agentStreamRuntimeHandler.test.ts` 两条工具 / reasoning 顺序失败。
- 巨型文件风险：`agentStreamRuntimeHandler.ts` 1492 行、`agentStreamRuntimeHandler.test.ts` 1252 行。本轮只改测试 fixture，不继续追加 handler 逻辑；下一次触碰 runtime handler 行为时优先拆到 lifecycle / completion / projection helper。
- 实施 P4 第一刀：`toolBatchGrouping.ts` 的固定中文折叠文案迁到 `agentChat.toolBatch.*` 五语言 i18n，新增 locale 化 clause separator，避免英文 / 日文 / 韩文界面继承中文标点；batch descriptor 透出 Soul lifecycle metadata。
- 拆分巨型工具批次聚合文件：新增 `toolBatchGroupingCopy.ts`、`toolBatchGroupingTypes.ts`、`toolSoulLifecycleMetadata.ts`，`toolBatchGrouping.ts` 从 933 行降到 789 行，回到 800 行预警线以内。
- 验证通过：五语言 `agent.json` JSON 解析；`rg` 扫描确认 `toolBatchGrouping*.ts` 无目标硬编码中文；`npm exec vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts"`，21 tests passed；`npm exec vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/agentTaskRuntime.test.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/components/MessageListRuntimeStatus.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx"`，7 files / 82 tests passed。
- 实施 P4 第二刀：把 batch 专属 metadata 提取逻辑重构为通用 `toolSoulLifecycleMetadata.ts`，供 batch descriptor 与 process narrative 共用；`toolProcessSummary.ts` 合并 `result.metadata` 和顶层 `toolCall.metadata`，并把 Soul lifecycle metadata 透传给 `ToolCallDisplay` / `InlineToolProcessStep` 可消费的 `ToolProcessNarrative`。
- 验证通过：`npm exec vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"`，2 files / 47 tests passed；`npm exec vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/agentTaskRuntime.test.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/components/MessageListRuntimeStatus.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx"`，9 files / 120 tests passed。
- 实施 P4 第三刀：`ToolCallDisplay.tsx` 与 `InlineToolProcessStep.tsx` 明确消费 `ToolProcessNarrative` lifecycle metadata，并把 `surface/phase/styleLevel/riskLevel/toneVariant/profileId/packId` 暴露为稳定 `data-soul-*` DOM contract；这让工具卡片和内联过程不再只能靠旁路读取原始 metadata。
- 验证通过：`npm exec vitest run "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"`，4 files / 82 tests passed；`npm exec vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/agentTaskRuntime.test.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/components/MessageListRuntimeStatus.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx"`，11 files / 155 tests passed。
- 实施 P4 / P7 timeline 第一刀：新增 `timelineCopy.ts`，将 `blockResolvers.ts`、`statusMapping.ts`、`statusHintResolvers.ts` 与 `AgentThreadTimelineItemRenderers.tsx` 中的基础状态、上下文压缩、计划、审批、提醒、子任务和 process mix 文案先迁到五语言 neutral i18n；renderer 删除重复的 subagent status 文案分支。后续本轮已把子任务专属 owner 从 `agentChat.threadTimeline.*` 继续拆到 `agentChat.collaboration.*`。
- 补 `timelineCopy.test.ts`：验证五语言 key completeness，并切到 `en-US` 断言 timeline resolver 不再回落到中文硬编码。
- 验证通过：五语言 `agent.json` JSON 解析；`rg -n "[\\u4e00-\\u9fff]" "src/components/agent/chat/components/timeline-utils" "src/components/agent/chat/components/AgentThreadTimelineItemRenderers.tsx"` 只剩测试源文本 / 测试名；`npm exec vitest run "src/components/agent/chat/components/timeline-utils/timelineCopy.test.ts" "src/components/agent/chat/components/timeline-utils/displayTextResolvers.test.ts" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx"`，3 files / 17 tests passed。
- Typecheck follow-up：`npm run typecheck` 首轮暴露前序 Soul 改动遗留问题，已把 `StyleProfileSelector.tsx` 从旧 `BUILT_IN_SOUL_STYLE_PACK` 切到 `BUILT_IN_SOUL_STYLE_PACKS` registry 展开，并修正 `interactionCopy.ts` descriptor 重复 `toneVariant`；`npm exec vitest run "src/lib/soul"` 3 files / 23 tests passed，`npm run typecheck` 通过。
- 实施 P6 / P7 collaboration 第一刀：新增 `collaborationCopy.ts`，把 chat timeline 里的 subagent 标题、状态、预览 fallback 和打开详情按钮迁到 `agentChat.collaboration.*` 五语言 neutral i18n；`timelineCopy.ts` 只保留兼容代理，旧 `agentChat.threadTimeline.openSubagent` / `preview.subagent.*` / `status.queued|processing` / `subagent.*` owner 已清理。
- 补 `collaborationCopy.test.ts`，并在 `AgentThreadTimeline.process.test.tsx` 加英文 locale 组件断言，证明子任务协作卡片不回落中文。
- 验证通过：五语言 `agent.json` JSON 解析；旧 timeline subagent key 扫描无命中；profile-specific i18n 句库扫描无命中；`npm exec vitest run "src/components/agent/chat/components/timeline-utils/collaborationCopy.test.ts" "src/components/agent/chat/components/timeline-utils/timelineCopy.test.ts" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx"`，3 files / 18 tests passed。
- 实施 P4 / P3 交界补刀：新增 `toolProcessSummaryMetadata.ts`，`toolProcessSummary.ts` 在工具名 fallback 前优先消费 runtime 提供的 key-based `tool_process_summary / process_summary` descriptor；raw string `process_summary` 不作为 UI 文案渲染，避免后端中文终稿回流。
- 补 `toolProcessSummary.test.ts`：覆盖结构化 descriptor 优先、raw string 拒绝；补 `agentStreamThreadItemController.test.ts`：覆盖 `tool_end.result.metadata.tool_process_summary` 从 legacy tool event 投影保留到 thread item，并可被工具 narrative 渲染。
- 验证通过：`npm exec vitest run "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx"`，3 files / 63 tests passed；`npm exec vitest run "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts"`，1 file / 11 tests passed；`npm run typecheck` 通过。
- 追加 current 主链 smoke：`npm run smoke:agent-runtime-current-fixture` 通过，覆盖 history/cache hydrate、final_done 工具收尾、Claw 终态 UI、真实 GUI coding 输入到 Coding Workbench、图片命令 / 普通画图意图、停止后继续、Plan history hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills Runtime 和内容工厂 Article Editor；`liveProviderUsed=false`。
- 实施 P3 后端 facts 第一刀：`runtime_backend/tool_events.rs` 为 runtime-generated `tool.started` / `tool.result` / `tool.failed` 注入 key-based `tool_process_summary` descriptor、`tool_process_facts` 与基础 `tool_lifecycle` metadata；已有对象型 descriptor 不覆盖，raw `process_summary` 字符串不再阻止新 descriptor 注入。
- 为遵守 Rust 文件体量边界，新增 `runtime_backend/tool_process_metadata.rs` 承接 descriptor / facts 构造与 metadata 合并，`tool_events.rs` 回落到 708 行，新模块 523 行。
- 前端事件流补齐：`appServerEventStream.ts` 透传 `tool.started` / `tool.args` / `tool.input.delta` metadata，并把 `tool.failed` 映射为 `tool_end`；`agentStreamTimelineItemProjector.ts` 保留 tool start / input delta metadata，工具调用前也能显示 runtime pre descriptor。
- 五语言补 `agentChat.toolCall.processSummary.generic.completed` neutral key，作为 runtime 通用完成 descriptor fallback，不引入 profile-specific 句库。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_events`，16 tests passed；`npm exec vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"`，3 files / 49 tests passed。
- 验证通过：`npm run typecheck`。`npm run smoke:agent-runtime-current-fixture` 聚合跑到 Expert Panel Skills Runtime override 时遇到一次 Electron `page.reload: net::ERR_FILE_NOT_FOUND`；此前分段均已通过。随后单独复跑 `node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario expert-panel-skills-runtime --prefix claw-chat-current-fixture-expert-panel-skills-runtime-regression-rerun --timeout-ms 180000` 通过，并补跑聚合失败后未执行的 `--scenario content-factory-article-workspace --prefix claw-chat-current-fixture-content-factory-article-workspace-regression-rerun --timeout-ms 240000` 通过。
- 实施 P3 后端 facts 第二刀第一部分：`runtime/event_store.rs` 在 external append 入库前调用 `tool_process_external_metadata` enrichment，复用 `tool_process_metadata` 的 descriptor / facts builder；`tool.started` / `tool.args` / `tool.input.delta` / `tool.progress` / `tool.output.delta` / `tool.result` / `tool.failed` 都会补 `tool_process_facts`、`soul_lifecycle`、`soul_surface`、`soul_phase`、`style_level`、`risk_level`；终态若包含 `result` 对象，也同步写入 `result.metadata`，保证 live stream 与 history hydrate 同构。
- 拆分 external append helper：新增 `runtime_backend/tool_process_external_metadata.rs` 承接 external payload context scan、tool args/result normalization 与顶层 alias 注入；`tool_process_metadata.rs` 保持共享 descriptor / facts builder，当前约 541 行，新 helper 约 305 行，避免共享 builder 继续膨胀。
- 收紧 lifecycle guard：`tool.progress` 与 `tool.input.delta` 纳入工具生命周期校验；孤立进度事件会 fail closed，不再让 UI 显示没有 active tool 来源的进度。
- 前端 projector 补继承顺序：`agentStreamTimelineItemProjector.ts` 先读取 App Server event metadata 的 `risk_level/profile_id/pack_id`，再补本地 fallback descriptor；`tool.progress` 和 `tool.output.delta` 的 metadata 不再被本地 `normal` lifecycle 覆盖。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_events::tool_lifecycle -- --nocapture`，9 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_events -- --nocapture`，16 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tool_lifecycle -- --nocapture`，15 tests passed。
- 验证通过：`npm exec vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"`，3 files / 53 tests passed；`npm run typecheck` 通过。
- 验证通过：`npm run smoke:agent-runtime-current-fixture` 聚合入口一次完整通过，覆盖 history/cache hydration、final_done 工具收尾、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、停止后继续、Plan history hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills/Plaza/Panel 和内容工厂 Article Editor；`liveProviderUsed=false`。
- 验证通过：`git diff --check -- <P3工具生命周期相关文件>` 无输出。
- 实施 P3 package projection 补刀：新增 `packages/agent-runtime-projection/src/toolLifecycleMetadata.ts`，从 snake/camel、顶层 metadata 与 `result.metadata` 归一 `soulLifecycle/toolProcessFacts/toolProcessSummary/soulSurface/soulPhase/styleLevel/riskLevel/toneVariant/profileId/packId`；`toolEvents.ts`、`threadItems.ts` 与 `appServerFacts.ts` 均接入该 helper，package 消费者不再只能看到 `metadataKeys`。
- 验证通过：`npm --prefix "packages/agent-runtime-projection" run test`，86 tests passed；`git diff --check -- <package projection相关文件>` 无输出。
- 实施 P3 L4 risk 第一刀：`runtime/event_store.rs` 对 external policy events 追加 enrichment，`action.required` 进入 `tool_policy_review`，`permission.denied` / `sandbox.blocked` 进入 `after_tool_failure`，统一写入 `tool_process_facts`、`soul_lifecycle`、`risk_level=high`、`style_level=L4` 与顶层 `toolProcessFacts` alias；不新增 profile-specific i18n 句库。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_events::actions -- --nocapture`，7 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_events::tool_lifecycle -- --nocapture`，9 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tool_lifecycle -- --nocapture`，15 tests passed；`git diff --check -- <L4 policy相关文件>` 无输出。
- 验证通过：`npm run typecheck`；`npm run smoke:agent-runtime-current-fixture` 聚合入口一次完整通过，覆盖 history/cache hydration、final_done 工具收尾、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、停止后继续、Plan history hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills/Plaza/Panel 和内容工厂 Article Editor；`liveProviderUsed=false`。
- 实施 P3 active style metadata 补刀：新增 `SoulStyleMetadata`，从 `memory.soul.styleProfile` config metadata 提取 `profileId / packId / toneVariant`，并写入 runtime-generated 与 external append 工具 lifecycle 的 `soul_lifecycle`、`tool_process_facts` 和顶层 snake metadata；external append 会从 payload / active tool 继承 style identity，避免只在 `tool.started` 标一次后续 progress/result 丢失风格包身份。
- 补 runtime-generated 工具阶段覆盖：新增 `runtime_backend/tool_process_runtime_metadata.rs`，把 runtime `tool.started` / `tool.args` / `tool.progress` / `tool.input.delta` / `tool.output.delta` / `tool.result` / `tool.failed` 的 metadata 构造从 `tool_events.rs` 拆出，避免 `tool_events.rs` 继续膨胀，并确保 `tool.args` 也携带 active `profileId / packId / toneVariant`。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_process_metadata -- --nocapture`，2 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_events -- --nocapture`，17 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_events::tool_lifecycle -- --nocapture`，9 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server external_events::actions -- --nocapture`，7 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tool_lifecycle -- --nocapture`，15 tests passed。
- 验证通过：`npm --prefix "packages/agent-runtime-projection" run test`，86 tests passed；`npm run typecheck` 通过；`npm run smoke:agent-runtime-current-fixture` 聚合入口一次完整通过，覆盖 history/cache hydration、final_done 工具收尾、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、停止后继续、Plan history hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills/Plaza/Panel 和内容工厂 Article Editor；`liveProviderUsed=false`。
- 验证备注：一次尝试使用 `/tmp/lime-codex-soul-style-target` 独立 Cargo target 规避默认 target lock，因临时目录在编译中丢失导致 `failed to write ... No such file or directory` / aws-lc 输出缺文件，已改回默认 workspace target 并通过定向 Rust 测试。
- 实施 P3 risk classifier 补刀：新增 `runtime_backend/tool_process_risk_metadata.rs`，从 result metadata / result text / tool name / command-like arguments 统一识别 sandbox blocked、permission denied、危险删除、破坏性 VCS、数据库破坏、生产 / infra mutation、sudo / chmod / chown 等风险，并写入 `soul_lifecycle.riskLevel/styleLevel`、`tool_process_facts.riskCategory/riskReason` 与顶层 `risk_level/style_level/risk_category/risk_reason`。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tool_process_risk_metadata -- --nocapture`，3 tests passed；顺序复跑 `runtime_backend::tool_process_metadata`、`runtime_backend::tool_events`、`external_events::tool_lifecycle`、`external_events::actions`、`runtime::tool_lifecycle` 均通过。
- 补跑验证通过：`npm --prefix "packages/agent-runtime-projection" run test`，86 tests passed；`npm run typecheck` 通过；`npm run smoke:agent-runtime-current-fixture` 聚合入口一次完整通过，覆盖 history/cache hydration、工具终态、Claw 终态 UI、真实 GUI coding / 图片 / stop-continue / Plan / Skills / Team / MCP / Expert Skills / 内容工厂 Article Editor current fixture，`liveProviderUsed=false`；相关 `git diff --check` 无空白错误输出。
- 行数检查：`tool_process_metadata.rs` 781 行，`tool_process_risk_metadata.rs` 378 行，`tool_events.rs` 688 行；`tool_process_metadata.rs` 已接近 800 行预警线，后续继续拆 helper，不再往里追加新业务逻辑。
- 实施 P4 facts subject 补刀：`toolProcessSummary.ts` / `toolProcessSummaryBuilders.ts` 在没有 key-based summary descriptor 时，先从 `tool_process_facts.subject` / `toolProcessFacts.subject` 读取摘要主体，再回退 arguments / toolName 推断；新增 `toolProcessSummaryFacts.test.ts` 承接 facts / metadata 专项回归，避免继续扩大 900+ 行的 `toolProcessSummary.test.ts`。
- 验证通过：`npm exec vitest run "src/components/agent/chat/utils/toolProcessSummaryFacts.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"`，2 files / 29 tests passed；`npm run typecheck` 通过；上一轮同一生产改动后 `npm run smoke:agent-runtime-current-fixture` 已完整通过，迁移新增回归到小测试文件后没有生产代码变化。
- 实施 P3 / P4 kind facts 补刀：新增 `runtime_backend/tool_process_kind_metadata.rs`，把 `toolFamily/tool_family` 与 `operationKind/operation_kind` 写入 App Server `tool_process_facts`；`toolProcessSummaryMetadata.ts` 增加统一 facts family / operation 读取 helper；`toolProcessSummaryBuilders.ts` / `toolProcessSummary.ts` 的泛化读 / 写 / 搜 / 抓取 / 浏览器 / 命令摘要优先吃 facts family；`toolBatchGrouping.ts` 的网页搜索、网页读取、探索和浏览器批次优先吃 facts operation kind 与 facts subject。
- 共享 projection 同步：`packages/agent-runtime-projection/src/toolSurface.ts` 从 payload / metadata / `toolProcessFacts` 读取 `toolFamily` 与 `operationKind`，`web_search` / `web_fetch` 归一到标准 `webSearch` / `webFetch` tool surface family，避免 evidence replay 丢失 App Server 分类事实。
- 验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" --target-dir "/tmp/lime-soul-tool-kind-target" -p app-server runtime_backend::tool_process_kind_metadata -- --nocapture`，4 tests passed；`npm exec vitest run "src/components/agent/chat/utils/toolProcessSummaryFacts.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"`，2 files / 27 tests passed；`npm --prefix "packages/agent-runtime-projection" run test`，91 tests passed；`npm run typecheck` 通过。Rust 复跑使用独立 target 是为了避开默认 workspace target 里已有长时间 cargo 锁；过程中暴露并修正了 `mcp__docs__get_page` 被普通 `page` browser marker 抢占的问题。
- 补跑 GUI 主路径：`npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 history/cache hydration、final_done 工具收尾、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、停止后继续、Plan history hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills/Plaza/Panel 和内容工厂 Article Editor；`liveProviderUsed=false`。
- 实施 P6 collaboration facts 第一刀：新增 `packages/agent-runtime-projection/src/collaborationFacts.ts`，`subagentStatusEvents.ts` 的 team roster / task capsule / teammate transcript / delegation graph / worker notification / handoff lane 统一写入 `collaborationFacts`，并从 `soul_lifecycle` metadata 继承 `profileId/packId/toneVariant`；`appServerFacts.ts` 对 App Server `subagent.*` / `handoff.*` / `review.*` / `task.*` replay 事件补同一套 facts；`src/lib/api/agentProtocol.ts` 保留 `subagent_status_changed.metadata`，`subagentStatusProjection.ts` 把 metadata 传到 package helper，避免 GUI 路径丢 style identity。
- package 文档同步：`packages/agent-runtime-projection/README.md` 和 `src/index.{ts,js,d.ts}` 公开 `collaborationFacts` owner，禁止宿主 adapter 重新实现协作事实解释。
- 验证通过：`npm --prefix "packages/agent-runtime-projection" run test`，92 tests passed；`npm exec vitest run "src/lib/api/agentProtocol.test.ts" "src/components/agent/chat/projection/subagentStatusProjection.test.ts"`，2 files / 29 tests passed；`npm run test:contracts` 通过；相关 `git diff --check` 无空白错误输出。
- 实施 P6 / P7 非 timeline 协作展示第一刀：`AgentUiCollaborationFactsView` 进入 `AgentUiSubagentThreadView` / `AgentUiSubagentDelegationView` / `AgentUiSubagentActivityView`；`buildAgentUiSubagentsModel` 将 `collaborationFacts`、`collaborationSurface`、`collaborationPhase`、`styleLevel`、`riskLevel`、`profileId/packId/toneVariant` 写入标准 Subagents model；`SubagentsView` / `AgentWorkbenchSurface` DOM 暴露稳定 `data-collaboration-*` 与 `data-soul-*` contract。
- workbench task rail 补 facts-first detail：`importedRuntimeEventDetailViewModel` 识别 `collaborationFacts` / `collaborationSurface` / `collaborationPhase`，并输出 `collaborationKind`、`styleLevel`、`riskLevel`、`profileId`、`packId`、`toneVariant` 等结构化 facts；五语言 `agent.json` 只新增中性 fact label，不新增 profile-specific 句库。
- 验证通过：`npm --prefix "packages/agent-ui-contracts" run test`，30 tests passed；`npm --prefix "packages/agent-runtime-projection" run test`，95 tests passed；`npm --prefix "packages/agent-runtime-ui" run test`，18 tests passed；`npm exec vitest run "src/components/agent/chat/components/importedRuntimeEventDetailViewModel.test.ts"`，6 tests passed；`npm exec vitest run "src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.unit.test.ts"`，25 tests passed；`npm run typecheck` 通过。
- 实施 P5 / P8 prompt + fixture 第一刀：前端四个 built-in Style Pack 与 Rust App Server 同构 profile 均补齐同一组 `before_tool / tool_running / after_tool_success / after_tool_partial_failure / after_tool_failure / body_detail` surface contract；prompt directive / `memory_soul_prompt_context` 测试不再允许“只含 profile id”过关，必须断言完整 lifecycle contract、anti-repetition 与 risk fallback。
- Electron current fixture `soul-style` 已补 `hasToolLifecycleSurfaceContracts` marker，并验证 `memory.soul` 配置、当前 built-in pack id、强度和 tool lifecycle surface contract 经真实 Electron Desktop Host / GUI 输入框 / `app_server_handle_json_lines` / App Server runtime prompt 到达 fixture provider；summary 产物：`.lime/qc/gui-evidence/claw-chat-current-fixture/soul-style-smoke-summary.json`。
- 清理旧共享 pack id 回流：`scripts/agent-runtime` fixture 已改用 `SOUL_STYLE_PACK_ID = "com.lime.soul.cheeky-sassy-executor"`；`lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs` 不再把 `com.lime.builtin.default` 作为 host managed generation Soul fixture；`style_profile.rs` 增加负向断言，built-in Style Profile context 不得含旧共享 pack id。
- 验证通过：`npm exec vitest run "src/lib/soul/style-profiles/styleProfiles.unit.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，2 files / 34 tests passed；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server soul -- --nocapture`，13 relevant tests passed；`node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario soul-style --timeout-ms 180000 --prefix soul-style-smoke` 通过；`npm run typecheck` 通过；`git diff --check -- <本轮 Soul / fixture / docs 写集>` 无空白错误。

### 2026-07-07

- 实施 P5 / P8 transcript anchor 补刀：前端四个 built-in Style Pack 与 Rust App Server 同构 profile 均补齐 `before_tool / tool_running / after_tool_success / after_tool_partial_failure / after_tool_failure / body_detail / closing_suggestion` few-shot anchors；`closing_suggestion` 同步进入 surface contract，但仍只作为模型 narrative 指令，不进入 UI 固定句库。
- 补守卫：前端 `styleProfiles.unit.test.ts` 断言四种 profile 的 anchors 覆盖同一组 transcript surface，并且同一 surface 下四种示例不相同；Rust `style_profile.rs` 单测断言 App Server `memory_soul_prompt_context` 序列化包含完整 transcript surface contract 与 anchors。
- 新增 `claw-chat-current-fixture-soul-style-transcript-golden.mjs` deterministic golden：同一组 `search_query` / `3 sources` / `internal/roadmap/soul/acceptance.md` / failure facts 下，四种 profile 的 `before_tool / tool_running / after_tool_success / after_tool_partial_failure / after_tool_failure / body_detail / closing_suggestion` 文本必须全部不同，且 required fact tokens 不漂移。
- `soul-style` fixture provider prompt marker 扩展到 `closing_suggestion:`，现有 Electron fixture 不再只证明工具前后 surface contract，结尾建议合同也必须进入 runtime prompt。
- 完成真实 Electron 多 profile transcript golden：`soul-style` fixture 新增 `--soul-style-profile` / `--soul-style-intensity`，provider 根据 prompt 中的 Style Profile 返回对应 deterministic transcript；GUI/read model 等待条件和 scenario assertion 改为当前 profile 的 expected transcript，四风格 assistant 文本必须唯一。
- 上一轮验证曾以单 profile `soul-style-transcript-golden-smoke` 证明 prompt context 覆盖；本轮已升级为四 profile GUI/read model transcript fixture，当前证据以下方四份 summary 为准。
- 验证通过：`npm exec vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`，27 tests passed；`npm exec vitest run "src/lib/soul/style-profiles/styleProfiles.unit.test.ts"`，10 tests passed；四条真实 Electron fixture 均通过：
  - `.lime/qc/gui-evidence/claw-chat-current-fixture/soul-style-cheeky-sassy-transcript-fixture-smoke-summary.json`
  - `.lime/qc/gui-evidence/claw-chat-current-fixture/soul-style-warm-supportive-transcript-fixture-smoke-summary.json`
  - `.lime/qc/gui-evidence/claw-chat-current-fixture/soul-style-cool-confident-transcript-fixture-smoke-summary.json`
  - `.lime/qc/gui-evidence/claw-chat-current-fixture/soul-style-calm-professional-transcript-fixture-smoke-summary.json`
- 四份 summary 均显示 `soulStylePromptContextCoveredByRuntime=true`、`soulStyleTranscriptMatchesExpectedProfile=true`，且 assistant text 去重数为 `4/4`。
- 本轮继续收非 fixture 业务面：`AgentRuntimeStrip` 已消费 projection package 的 collaboration metadata helper，并在 runtime strip 根节点与 team summary 暴露 `data-collaboration-*` / `data-soul-*`；`lime-agent/request_tool_policy/runtime_status.rs` 已删除按四个 profile id 改中文标题的旧旁路，runtime status 回到 neutral diagnostics copy，Style 表达只允许从 prompt / lifecycle / collaboration facts 主链进入。

## 7. 当前剩余缺口

1. `current`：Style Pack Registry seed、Soul prompt context、前端 neutral copy descriptor、neutral runtime diagnostics status、前端工具 lifecycle descriptor、runtime-generated / external append / package projection 工具生命周期 `tool_process_summary` / `tool_process_facts` 第一刀、active `profileId / packId / toneVariant` metadata 注入、危险 / 权限 / sandbox / 生产影响 `riskLevel=high` + `styleLevel=L4` classifier 第一刀、`toolProcessSummary` key-based metadata summary descriptor 优先入口、`tool_process_facts.subject` 摘要主体优先入口、`tool_process_facts.toolFamily / operationKind` kind facts 第一刀、`toolBatchGrouping` facts-first neutral i18n batch descriptor、工具卡片 / 内联过程 `data-soul-*` consumption contract、`agentChat.threadTimeline.*` neutral i18n timeline copy、`agentChat.collaboration.*` chat timeline collaboration copy、package / App Server 协作事件 `collaborationFacts` 第一刀、标准 Subagents runtime/workbench surface、workbench task rail 与 `AgentRuntimeStrip` 的 collaboration facts 消费第一刀、四个 built-in Style Pack 的完整 transcript surface contract 与 few-shot anchor guard、同 facts 四风格 deterministic transcript golden、`soul-style` Electron current fixture prompt marker 和四 profile GUI/read model transcript golden。
2. `current but incomplete`：App Server / Runtime / package projection 已覆盖工具事件 facts 第一刀，external policy events 和 runtime tool process risk classifier 已覆盖 L4 risk facts 第一刀，`profileId/packId/toneVariant` 已进入 runtime-generated 与 external append tool lifecycle metadata，工具 family / operation kind 已进入 facts并被 summary / batch / shared projection 优先消费，协作事件已进入 package / App Server `collaborationFacts`，标准 Subagents runtime/workbench surface、workbench task rail 与 `AgentRuntimeStrip` 已消费 collaboration facts；四 profile deterministic + Electron transcript golden 已证明同一工具 facts 下 `before_tool / tool_running / after_tool_* / body_detail / closing_suggestion` 文本差异和 fact token 不漂移；业务协作入口仍需盘点；timeline / workbench 仍缺更完整 L1 / L4 descriptor 消费；工具 summary 仍保留特殊工具名专属分支与 fallback；risk taxonomy 仍需覆盖更多业务域；media / contentParts 的 Item/read model / Workbench projection 仍需按 refactor/v1 收口。
3. `deprecated`：前端组件按工具名 / 参数 / 状态本地反推工具类别和协作含义；runtime status 按 profile id switch 中文标题；timeline 基础中文终稿、chat timeline collaboration 旧 owner、raw `process_summary` UI 文案路径、泛化工具 category 猜测、协作事件 style identity 旁路丢失、标准 Subagents/workbench/runtime strip 从局部 UI state 反推协作含义已收掉第一批，但后续不能继续新增本地中文、profile-specific 句库或旧 pack id fallback。
4. `dead / forbidden-to-restore`：`com.lime.builtin.default` 共享 pack id、`agentChat.soulInteraction.<tone>.*` profile 句库、组件内 profile id 文案 switch、`personalstyle` 平行系统、用欢迎语或 profile id 进入 prompt 当验收。

下一刀优先级：回到非 fixture 业务主链。优先盘点业务协作入口是否还未消费 `collaborationFacts`，再扩展业务域 risk taxonomy，并清理工具 summary 特殊工具名 fallback；图片 / artifact / media contentParts 的 Item/read model / Workbench projection 继续按 `/internal/research/refactor/v1` 收口。
