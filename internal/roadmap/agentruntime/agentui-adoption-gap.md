# AgentUI Adoption Gap for Plugin

> 状态：current-gap-analysis
> 更新时间：2026-05-17
> 对比来源：`/Users/coso/Documents/dev/ai/limecloud/agentui` v0.6.1、Lime AgentRuntime / Plugin current 路线图与 Host Run UI first-cut
> 目标：明确 AgentUI 标准中哪些能力可以进入 Lime Plugin，哪些必须适配后进入，哪些暂缓，避免业务 App 为了使用 AI Agent 重写一套运行 UI。

## 1. 事实源声明

AgentUI 对 Lime 的定位不是“再加一套 UI 组件库”，而是 **AgentRuntime facts 到 Host UI projection 的标准词汇和验收矩阵**。

从现在开始，Plugin 的 AI 运行 UI 只允许向这条主链收敛：

```text
AgentRuntime RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack
  -> Plugin runtime projection adapter
  -> Host AgentRunRenderer / Agent Run UI SDK
  -> 业务 App 的 artifact / workflow 写回
```

分类口径：

| Surface | 分类 | 说明 |
| --- | --- | --- |
| `AgentRunRenderer` / `lime.ui.openAgentRun` | current | Host 侧唯一继续演进的 Agent Run UI 入口。 |
| 内容工厂 App 内 `AI 同事` fallback | compat | 仅在 Host profile 不支持时兜底；不能继续长模型、Skill、Tool、Evidence 事实。 |
| 业务 App 直连模型 API 或自建运行 UI | dead | 与 Lime Agent 工具定位冲突，不进入新 Plugin。 |
| AgentUI standalone demo / 视觉组件实现 | reference | 只参考行为和 contract，不直接作为 Lime 视觉事实源。 |

## 2. AgentUI v0.6.1 能力分层

AgentUI v0.6.1 定义的是 runtime-first projection 标准，核心能力包括：

- Runtime event projection：`run.* / text.* / reasoning.* / tool.* / action.* / queue.* / artifact.* / evidence.* / session.* / team.*` 等 event class。
- 标准表面：Composer、Message Parts、Runtime Status、Tool UI、Human-in-the-loop、Task Capsule、Artifact Workspace、Timeline / Evidence、Session / Tabs。
- Subagents：Subagent Threads、Delegation Calls、Handoff / Review Activity、Worker Notifications、Teammate Transcript、Background / Remote Teammate、Team Policy。
- Client implementation：projection store、progressive rendering、session hydration、queue vs steer、controlled writes、performance metrics。
- Agent Runtime profile tests：验证 `RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack` 能投影到 UI，同时 UI 不变成 runtime truth。

对 Lime 来说，AgentUI 的价值是把“Claw 那种过程可见的 AI 运行现场”抽象成可复用规则，而不是要求内容工厂或每个 Plugin 各自实现一遍。

## 3. 可直接用于 Plugin 的部分

这些能力与 Lime current 主链一致，可以作为 Plugin 的立即验收标准。

| AgentUI 能力 | Lime current 对应 | 采用方式 |
| --- | --- | --- |
| Runtime-first projection | `AgentRuntime ThreadReadModel / TaskSnapshot`、`buildAgentRuntimeProcessView` | 继续把 runtime facts 投影成 Host `runtimeProcess`，不让 App 拥有状态真相。 |
| Runtime Status | `task:progress`、`profile_status`、Host Run timeline | 首文本前必须展示 accepted / routing / running / blocked / completed 等真实状态。 |
| Message Parts 分离 | `thinkingText / executionText / streamText / timeline` | 最终成稿、思考、执行、工具、Artifact、Evidence 分开渲染；不压成一个 Markdown 字符串。 |
| Progressive rendering | Host Run drawer 运行中展开、终态折叠但不丢过程 | running process 默认可见，completed process 折叠归档且可展开复查。 |
| Tool UI | `InlineToolProcessStep`、Claw 工具名 / 工具摘要复用 | Tool / Skill 步骤由 Host 统一渲染，App 不再自绘工具过程卡。 |
| Skill 可见性 | `skillNames / invokedSkillNames`、required skill runtime enforcement | Plugin 必须看到 required / invoked Skills，不能只靠 prompt 暗示。 |
| 模型 / Token / 费用 | `runtimeProcess.model / usage / cost` | Host metric cards 展示模型、Token、费用，App 不自建统计口径。 |
| Artifact reference | `artifact:created`、workspace patch artifact | 交付物作为 artifact fact 和业务写回 patch，不塞进最终回答正文。 |
| Timeline / Evidence reference | `evidence:recorded / evidence:verified`、EvidencePack refs | 运行过程、证据、review/replay 入口在 Host facts rail / timeline 中保留。 |
| Missing facts fallback | `unknown / unavailable / blocked` 语义 | 缺事实时显示不可用或阻塞，不从 assistant prose 猜 artifact kind、approval 或成功态。 |
| Agent Runtime profile tests | completion gates、runtime completion audit | 用 AgentUI 的 AUI-AR 用例约束 UI projection，不只验证页面有没有组件。 |

直接采用的结论：

```text
Plugin MVP 必须先满足：真实 runtime facts -> Host Run UI -> 业务 artifact 写回。
只要业务 App 需要 AI Agent，就默认使用 Host Agent Run UI SDK，而不是在 iframe / App 内重写“AI 同事”。
```

## 4. 需要适配后采用的部分

这些能力方向正确，但 Lime current 还没有完全支持，不能直接宣称兼容 AgentUI v0.6.1。

| AgentUI 能力 | Lime 当前状态 | 适配要求 | 优先级 |
| --- | --- | --- | --- |
| 标准 event class schema | Claw 主链已有 `src/components/agent/chat/projection/agentUiEventProjection.ts`；Plugin Host 仍主要消费 `task:* / artifact:* / evidence:*` 和 `runtimeProcess` | 复用现有 `buildAgentUiProjectionEvents` / projection store，补 Plugin task event -> AgentUI event class 的接入层；UI 组件只消费 projection，不解析源协议 | P0 |
| Active turn 按 part 顺序穿插渲染 | Host 现在有 timeline、thinking、execution、output 分区，仍不是完整 ordered message parts | 在 projection 中保留 `sequence / partId / stepId`，让 reasoning、tool、text 可以按事件顺序交错显示 | P0 |
| Human-in-the-loop action UI | Rust 侧有 `plugin_runtime_submit_host_response`，Host facts rail 能看到 review / blocked，但完整 approve / reject / edit 控件不足 | 将 `pending_requests` 投影为 `action.required`，Host UI 提供受控 action response，不允许 App 乐观标记 resolved | P0 |
| Queue vs steer | AgentRuntime 有 queued turns 和 `queueIfBusy`，但 Plugin Host UI 缺少明确 queue / steer 模式 | Composer / task capsule 区分“排下一轮”和“注入当前运行”，并支持 remove / promote / interrupt | P1 |
| Task Capsule | Host Run dock 已有折叠入口，但不是标准 task capsule / task center | 用 `taskId / profile_status / queued count / pending action count` 生成紧凑 capsule，供多个 Plugin 和非活跃任务共用 | P1 |
| Artifact Workspace | 已有 artifact refs 和内容工厂 workspace patch，但缺通用 preview / edit / version / diff / export 工作区 | Artifact content、preview、diff、export 必须归 Host artifact service；App 只处理业务写回和业务视图 | P1 |
| Evidence / Review / Replay lane | Evidence refs 已可投影，完整 Evidence panel、review verdict、replay lane 未统一 | 使用 `agent_runtime_export_evidence_pack` 作为单一事实源，Review / Replay 不再各自重算状态 | P1 |
| Session hydration | AgentRuntime 有 ThreadReadModel，Plugin Host Run UI 还没有完整旧 session 渐进恢复体验 | 打开历史任务时先 shell / snapshot / recent process，再懒加载 timeline、tool output、artifact、evidence | P2 |
| Performance metrics | completion gates 记录结果，但 Host UI 尚未系统展示 submit-to-status / first-text / paint latency | 在 projection 或 evidence 中保留 `metric.changed`，普通 UI 低噪声，诊断视图可检查 | P2 |
| Subagents | Lime AgentRuntime / Claw 有 subagent、team prompt、spawn/wait/close 能力，但 Plugin Host UI 未投影 subagent surfaces | 只有当 runtime 暴露 parent/child lineage、worker notification、team phase 后，才进入 threads / delegation / review activity | P2 |

## 5. 暂缓或不应直接采用的部分

这些能力不能直接进入 Plugin，原因不是它们不重要，而是直接采用会破坏 Lime 的事实源边界。

| AgentUI 标准内容 | 处理方式 | 原因 |
| --- | --- | --- |
| AgentUI standalone demo layout | 暂缓 | Demo 是 reference，不是 Lime 设计系统；不能让 Plugin 复制另一套视觉语言。 |
| AgentUI event schema 直接替代 AgentRuntime | 禁止 | AgentUI 是 projection schema，不拥有 execution、policy、artifact、evidence truth。 |
| App 内实现完整 AgentUI runtime | 禁止 | 会让业务 App 变成第二套 Agent Runtime，回到“每个 App 自建 AI 同事”的问题。 |
| 业务 App 直连模型 / provider API | 禁止 | 绕过 Lime model routing、Skills、ToolRuntime、usage、cost、policy、Evidence。 |
| Subagents 全量表面一次性落地 | 暂缓 | 需要 runtime 先稳定暴露 `agent.spawned / worker.notification / team.changed / handoff / review` facts。 |
| Remote teammate / background teammate UI | 暂缓 | 需要 remote task / background scheduler 的 durable facts；不能用普通 running 文案伪造。 |
| Work Board 作为所有 Plugin 默认壳 | 暂缓 | 不是所有业务 App 都是看板心智；只能在 runtime 有 work item truth 时投影。 |

## 6. Lime 当前支持与缺口矩阵

| AgentUI Surface | Lime current 支持 | 缺口 | Plugin 结论 |
| --- | --- | --- | --- |
| Composer | App 可通过 `lime.agent.startTask` 发起任务；modelPreference 已进入 task request | Host 通用 Composer / queue / steer / context chips 未统一 | 业务 App 可以保留业务表单，但提交必须走 Host Runtime。 |
| Message Parts | 已有 thinking / execution / output / timeline 分离，Markdown 和 ThinkingBlock 复用 Claw | 未形成标准 ordered parts；stream final reconciliation 仍应按 AgentUI 用例补齐断言 | 可用，但要继续从“分区”升级到“有序 parts”。 |
| Runtime Status | `profile_status`、task events、Host timeline 已投影 | 首状态、waiting_provider、retrying、stale 等细粒度状态不足 | 可用作 MVP，后续补细粒度状态。 |
| Tool UI | Claw `InlineToolProcessStep` 已复用，Tool / Skill 可见 | 大输出 offload、retry/replay、secret redaction 的 UI 断言还不完整 | 可直接用于 Plugin；禁止 App 自绘工具过程。 |
| Human-in-the-loop | pending request / blocked / review event 有后端事实，submit host response 有命令 | Host 控件不足；resolved audit summary 不完整 | 不能只展示“等待确认”，必须补受控响应 UI。 |
| Task Capsule | Host dock / drawer 是 first-cut | 多任务、非活跃任务、队列、needs-input 优先级未标准化 | 适合作为下一步 Host task center 基础。 |
| Artifact Workspace | 内容工厂 workspace patch、artifact refs 已接入 | 通用 preview / edit / version / diff / export 还未抽象 | 内容工厂可先写回业务对象，通用 artifact workspace 需要补。 |
| Timeline / Evidence | facts rail、timeline、Evidence refs 已可见 | Evidence detail / replay / review lane 仍分散 | 可作为 MVP，但完整 evidence 审计仍要回到 EvidencePack。 |
| Session / Tabs | AgentRuntime 有 thread read snapshot | Plugin Host UI 未实现旧任务渐进恢复和 tab resource policy | 暂不作为内容工厂阻塞项，列入 Host 层后续。 |
| Subagents | Claw / AgentRuntime 有 subagent 和 team runtime 基础 | Plugin 无 threads / delegation / worker notification / handoff activity | 暂缓全量；先保证 solo_run 与 required Skills。 |
| Diagnostics / Metrics | Smoke evidence、completion audit、cost/usage facts 已有 | 用户可见 latency metrics、safe diagnostics surface 不完整 | 先用于测试和 evidence，后续进入 Host 诊断视图。 |

## 6.1 继续审计：Lime 已有 AgentUI 投影资产

2026-05-17 继续只读核对当前工作树时，发现 Lime 并不是完全没有 AgentUI 基础，而是 **Claw / Chat 主链已有较完整的 AgentUI projection 资产，Plugin Host 尚未接入这条事实源**。

> 2026-07-14 supersession：本节是历史只读快照。Renderer Team runtime sidecar 已归类为 `dead / deleted / forbidden-to-restore`；Plugin 后续只能复用 canonical ThreadItem / AgentUI projection，不得依赖已删 subscription，也不得另写 roster 或 worker notification owner。

| 已有资产 | 当前证据 | 对 Plugin 的含义 |
| --- | --- | --- |
| 标准 event / owner / scope / surface 类型 | `src/components/agent/chat/projection/agentUiEventProjection.ts` 定义 `AgentUiProjectionEvent`、`AgentUiEventClass`、`AgentUiSurface`、`AgentUiRuntimeEntity`、`AgentUiTopology` | 不应在 Plugin 里再定义一套 AgentUI 类型。 |
| Claw runtime event -> AgentUI projection adapter | `buildAgentUiProjectionEvents(event, context)` 已覆盖 `run.* / text.delta / reasoning.delta / tool.* / action.* / queue.changed / artifact.* / evidence.changed / team.*` | Plugin 下一刀应接入或复用该 adapter，而不是从 `task:*` 直接渲染到底。 |
| Projection store | `conversationProjectionStore.ts` 提供 record / select by type / surface / scope / tool / action / artifact / evidence | Host Run UI 可使用同一个 projection store 或同构 reducer，避免第二套 UI state owner。 |
| Subagents 投影与视图模型 | `agentUiSubagentsViewModel.ts`、`AgentUiProjectionState.subagents`、`SubagentsView` 已存在 | Subagents 不是零实现；缺口是 Plugin runtime facts 尚未投影和挂到 Host Run UI。 |
| Claw stream 运行时接入 | `agentStreamRuntimeHandler.ts` 调用 `buildAgentUiProjectionEvents` 并记录 projection events | Claw 已经证明 stream -> AgentUI projection 的路径可行；Plugin 应复用这条路径。 |
| Canonical SubAgent 接入 | canonical Thread/Turn/Item reader 与 shared AgentUI projection 已承接 activity/lineage | Plugin 的 team / subagent 后续应复用 canonical projection，不得恢复 Team sidecar 或另写 roster / worker notification。 |
| 后端 Plugin task projection first-cut | 当前脏工作树中 `runtime_turn.rs` 已把 profile/runtime events 投影为 `task:runtimeEvent` payload，含 `taskEvents`、`runtimeEvent`、`streamKind`、artifact/evidence/action/tool 映射 | 后端已有 first-cut，但仍是 Plugin task event 形态；前端还需要桥接到 AgentUI event class。 |
| Plugin frontend bridge first-cut | `src/features/plugin/runtime/agentUiProjectionBridge.ts` 可把 Plugin task events / `task:runtimeEvent.taskEvents` 映射为 `AgentUiProjectionEvent[]`，测试覆盖 text、tool args、HITL、artifact、evidence、queue、terminal status | P0 seam 已有纯函数入口；仍需接入 `AgentRunRenderer` view model。 |
| Plugin Host Run view model first-cut | `src/features/plugin/runtime/agentUiProjectionViewModel.ts` 可把 `AgentUiProjectionEvent[]` 转成 Host Run 可消费的 ordered parts、actions、artifacts、evidence、task summary，并只输出语义 `label`，不夹带硬编码 UI 文案 | Renderer 接入前的数据模型已就绪；仍未改动 `AgentRunHostDrawer.tsx`。 |
| Plugin projection panel first-cut | `src/features/plugin/ui/AgentRunProjectionPanel.tsx` 只消费 projection view model，并通过外部 `labels` 注入文案，测试覆盖 ordered parts、summary、HITL | Host Run projection renderer 已可独立验证；仍未挂入现有抽屉。 |
| Host Run state adapter first-cut | `src/features/plugin/runtime/agentRunProjectionState.ts` 从现有 Host Run state 聚合 root `events/taskEvents`、`runtimeFacts`、`task`、`snapshot` 中的事件并直接生成 projection view model | 接入现有抽屉时无需继续复制 `collectRunEvents` 逻辑；仍待替换旧抽屉内部读取。 |

更新后的事实源判断：

```text
不是“先新建 AgentUI adapter”，而是“把 Plugin Host 接到 Lime 已有 AgentUI projection adapter / store 上”。
```

当前真正缺口：

1. 现有 `AgentRunHostDrawer.tsx` 没有消费 `AgentRunProjectionState` / `PluginRunProjectionViewModel`；仍直接读 `runtimeProcess.timeline / thinkingText / executionText / streamText`。
2. 后端 task projection first-cut 仍输出 `task:*` 事件；前端 bridge 已可标准化为 `run.* / tool.* / action.* / artifact.* / evidence.*`，但尚未挂入 Host UI。
3. Ordered parts 的 state adapter、view model 和独立 panel 已可按 projection `sequence / partId / toolCallId / actionId` 排序，但现有 Host Run 抽屉尚未用它替换 `timeline + thinking + execution + output` 分区。
4. HITL 只有 request facts 和 submit host response 命令，Host Run UI 还缺 `action.required -> action.resolved` 的受控卡片闭环。
5. 现有 Claw AgentUI projection 的 Subagents / Remote / Background 能力不能直接宣称 Plugin 已支持；需要 Plugin runtime facts 接入后才算。

## 6.2 Schema parity 与 Plugin 可用子集

2026-05-17 继续把 AgentUI v0.6.1 公共 schema 与 Lime current TypeScript 类型做机器比对，结论是：

| 对比项 | AgentUI v0.6.1 | Lime current | 差异 | 结论 |
| --- | ---: | ---: | --- | --- |
| event class | 52 | 53 | Lime 多一个 `tool.args.delta`，用于流式工具输入增量 | Schema 词汇基本对齐；`tool.args.delta` 需要在 adapter 层标成 Lime extension，或折叠到标准 `tool.args`。 |
| surface | 23 | 23 | 无 | Lime 已具备完整 surface 词汇。 |
| runtime entity | 6 | 6 | 无 | `agent_turn / subagent_turn / automation_job / external_task / work_item / unknown` 可直接复用。 |
| runtime status | 16 | 16 | 无 | Plugin Host 可直接使用同一状态枚举。 |
| phase | 19 | 19 | 无 | 运行阶段词汇可直接复用。 |
| control | 21 | 22 | Lime 多一个 `remove` | `remove` 只用于 Lime 队列移除控制，AgentUI schema 不应被它反向污染。 |
| persistence | 9 | 9 | 无 | transcript / snapshot / archive / evidence_pack 等持久性语义可直接复用。 |

这说明 Lime 并不是“缺 AgentUI 标准类型”，真正缺的是 **Plugin Host Run UI 的 surface 接入深度**。因此可用子集要按两层判断：

| 层级 | 当前可用于 Plugin | 当前不能直接宣称支持 |
| --- | --- | --- |
| 标准词汇 / 类型层 | `run.*`、`text.*`、`reasoning.*`、`tool.*`、`action.*`、`queue.changed`、`artifact.*`、`evidence.changed`、`state.*`、`messages.snapshot`、`diagnostic.changed`、`metric.changed`、team / review event class 词汇 | 无明显类型缺口；只有 Lime extension 需要 adapter 归一化。 |
| Claw / Chat projection 层 | `buildAgentUiProjectionEvents` 已覆盖 runtime status、stream text、thinking、tool lifecycle、HITL、queue、context、artifact、evidence、model / routing / cost metric、subagent / team / worker notification | 这证明 Lime 主 App 可以承载 AgentUI projection，但不等于 Plugin Host 已全部渲染。 |
| Plugin bridge 层 | 当前 first-cut 已能从 `task:* / task:runtimeEvent.taskEvents / artifact:* / evidence:*` 投影到 run status、queue、text、reasoning、tool args/output、action、artifact、evidence、terminal status 和 `metric.changed` diagnostics；也能保留已标准化的 AgentUI event class，避免 direct projection event 被降级成 `run.status` | 尚未覆盖 team / review lane、session hydration、artifact preview/version/diff/export 的完整 Host 表达；metric/cost 仍待 Host Drawer 视觉验收。 |
| Host Run renderer 层 | 独立 `AgentRunProjectionPanel` first-cut 可渲染 ordered parts、summary、HITL 卡片、Artifact / Evidence refs 和 diagnostics / metrics 卡片，并保持文案外部注入；HITL action controls 已保留到 panel data attribute，支持 approve / reject 等多按钮和可选 `onAction` 回调 | 还没接入 `AgentRunHostDrawer.tsx`；现有抽屉仍主要读取 `runtimeProcess.timeline / thinkingText / executionText / streamText`。 |

因此 Plugin 可以先吃下这组 P0 可用子集：

1. **Runtime Status**：accepted / routing / running / needs_input / completed / failed 等真实运行状态。
2. **Ordered Message Parts**：text、reasoning、tool、action、artifact、evidence 按 sequence 穿插，而不是 App 自己拼 Markdown。
3. **Tool / Skill Process**：工具输入、输出、结果、失败、required / invoked Skills 统一由 Host projection 渲染。
4. **HITL First-cut**：`action.required` 可显示为 Host 受控确认卡；resolved 必须等 runtime 回写。
5. **Artifact / Evidence Refs**：交付物和证据作为 Host facts 链接到业务写回，App 不从 prose 猜保存态。
6. **Model / Usage / Cost First-cut**：继续沿 `runtimeProcess.model / usage / cost` 和 `metric.changed` 投影，不在 App 内另算；Plugin projection bridge 已可把模型、Token、费用类 task event 投影为 `metric.changed` diagnostics。

P1/P2 才进入的子集：

1. **Queue / Steer 完整交互**：需要 Host Composer / task capsule 明确区分排队下一轮和注入当前 run。
2. **Artifact Workspace**：preview、edit、version、diff、export 必须先由 Host artifact service 持有。
3. **Evidence Review / Replay Lane**：必须消费 EvidencePack / review / replay 事实，不能 UI 推断。
4. **Session Hydration**：历史任务先恢复 snapshot，再懒加载 full timeline / tool output / evidence。
5. **Subagents**：等 Plugin runtime 暴露 parent/child lineage、worker notification、handoff、review facts 后再启用。

## 7. 对内容工厂和后续 Plugin 的落地规则

1. **业务流程属于 App**：内容工厂的项目资料、场景包、内容批次、脚本、图片 prompt、审核报告、复盘视图仍由 App 设计。
2. **AI 运行事实属于 Lime Host**：思考、执行、Tool、Skill、模型、Token、费用、Evidence、确认链统一由 Host Run UI 展示。
3. **Artifact 写回是边界，不是二次运行时**：App 可以把 Host artifact / workspace patch 写回业务对象，但不能从 assistant 文本猜测完成态。
4. **Skills 是 runtime contract**：App 声明 required Skills，AgentRuntime 必须真实执行并回写 invoked Skill facts；不能只在 prompt 里要求“使用某技能”。
5. **Fallback 只降级展示，不降级事实源**：Host profile 不支持时，App 内 fallback 只能展示有限状态；不能恢复直连 API 或私有运行 UI。
6. **验收以 AgentUI 行为用例为准**：必须覆盖 first status、text/reasoning 分离、tool call、HITL、artifact、evidence、missing facts、Agent Runtime profile projection。

## 8. 推荐下一刀

优先级最高的下一刀不是继续美化内容工厂页面，也不是重新造一个 AgentUI adapter，而是把 Plugin Host 接到 Lime 已有 AgentUI projection seam：

```text
P0: Plugin Host -> existing AgentUI projection bridge
  输入：AgentRuntime RuntimeEvent / ThreadReadModel / TaskSnapshot / EvidencePack / Plugin task events
  复用：src/components/agent/chat/projection/agentUiEventProjection.ts
  输出：AgentUiProjectionEvent[] / ordered parts / task capsule model
  UI：AgentRunRenderer 消费 projection view model，不再直接理解 task:* 细节
```

最小验收：

- `task:* / artifact:* / evidence:*` 可以映射到 `run.* / tool.* / action.* / artifact.* / evidence.*` projection。
- 每个 projection item 保留 `sessionId / threadId / turnId / taskId / toolCallId / actionId / artifactId / evidenceId / sequence`。
- running reasoning、tool progress、answer text 可以按顺序穿插渲染；完成后折叠到 timeline。
- `pending_requests` 形成 Host 受控 `action.required` 卡，并通过 `plugin_runtime_submit_host_response` 写回。
- 内容工厂不需要改业务流程即可获得新的 Host Run UI 能力。

## 8.1 Prompt-to-artifact 检查表

| 用户要求 / 明确目标 | 当前证据 | 判定 | 下一步 |
| --- | --- | --- | --- |
| AgentUI 标准要和 Lime 对比，找出哪些可用于 Plugin | 本文档第 3-6.2 节已经按能力、surface 与 schema parity 分类 | done | 保持文档随实现更新。 |
| Lime 不是所有 AgentUI 都支持 | 第 4、5、6、6.1、6.2 节列出缺口和暂缓项 | done | 缺口进入 P0/P1/P2。 |
| Plugin 不应每个 App 自己实现 AI 同事 | 第 1、7 节明确 Host Run UI 是 current，App 内 fallback 是 compat | done | 后续用守卫/测试封住 App 私有运行 UI 回流。 |
| 需要复用 Lime / Claw 已有 UI 封装 | 第 6.1 节确认 Claw 已有 AgentUI projection adapter/store/Subagents view model；新增 `agentUiProjectionBridge.ts` 复用同一 `AgentUiProjectionEvent` 类型；新增 `agentUiProjectionViewModel.ts` 生成 Host Run ordered parts；新增 `AgentRunProjectionPanel.tsx` 独立渲染 projection view；新增 `agentRunProjectionState.ts` 适配现有 Host Run state | partial | 现有 `AgentRunHostDrawer.tsx` 还没接入 projection panel。 |
| 内容工厂需要真实 AI Agent 能力，不是直调 API | 现有 roadmap / completion audit 记录 required Skills、model、usage、cost、artifact、evidence gates；本轮未重跑全流程 | partial | 继续由 runtime/GUI 持有写集进程跑 completion E2E。 |
| 运行过程要有思考、执行、工具、Skill、流式输出且不消失 | Host first-cut 已有 `ThinkingBlock`、`InlineToolProcessStep`、Markdown renderer；`agentRunProjectionState.ts -> agentUiProjectionBridge.ts -> agentUiProjectionViewModel.ts -> AgentRunProjectionPanel.tsx` 已形成独立 projection renderer 链路；projection view model 已保证 running tool/process 默认展开、终态工具/status 折叠、最终成稿保持展开；projection panel 已把 Artifact / Evidence refs 渲染为独立卡片 | partial | 让现有 Host drawer 使用 projection panel，并补 Claw renderer 深复用。 |
| 模型、Token、费用等要支持 | `runtimeProcess.model / usage / cost` 和 Host metric cards 已有；Plugin projection bridge 已支持 `metric.changed` diagnostics，view model / panel 可把模型、Token、费用指标渲染为 diagnostics 卡片 | done/first-cut | Host Drawer 接入后继续补 cost/limit diagnostics 视觉验收。 |
| HITL 要受控写回而不是普通文本 | `action.required / action.resolved` 已进入 projection；view model / panel 已保留 action `controls` 和 session/thread/run/turn/task/action identity，可区分 approve / reject / answer 等受控响应意图并具备写回定位信息；panel 已支持多按钮、可选 `onAction` 回调和外部注入按钮文案 | partial | Host Drawer 接入后把 `onAction` 接到 `plugin_runtime_submit_host_response`，并补 edit 深水位控件。 |
| 后端也要共享 Lime 能力 | 当前脏工作树已有 `runtime_turn.rs` Plugin task projection first-cut 和 `plugin_runtime_cmd/*` 分模块化 | partial | 不夹写；由后端写集持有人完成 ToolRuntime / Connector 深水位 smoke。 |
| 不要与隔壁进程打架 | 本轮只写 `agentui-adoption-gap.md`；实现文件只读 | done | 如要实现 P0，需要先拿 `src/features/plugin/runtime` 和 Host UI 写集窗口。 |

## 9. 验证建议

文档完成后，后续实现应补这些定向验证，而不是一次性宣称全量 AgentUI 兼容：

| 验证 | 覆盖 |
| --- | --- |
| `AgentRuntime -> AgentUI projection adapter` 单测 | event class mapping、identity preservation、missing facts fallback。 |
| `AgentRunRenderer` ordered parts 测试 | reasoning / tool / text interleaving、完成后折叠不消失。 |
| HITL Host response 测试 | `action.required` -> approve / reject / edit -> runtime confirmation。 |
| 内容工厂 completion E2E | required Skills、model、usage、cost、artifact、evidence、workspace patch、terminal 全为真实 runtime facts。 |
| GUI smoke | Plugins Host Run UI 在真实桌面壳中可展开、可折叠、可查看过程。 |

2026-05-17 本轮新增验证：

- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts"`：通过，4 tests，覆盖 Plugin task event 到 AgentUI projection 的 text / tool / action / artifact / evidence / queue / terminal status 映射。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts"`：通过，8 tests，新增覆盖 ordered parts、HITL 最新状态、artifact/evidence 索引、task summary。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，11 tests，新增覆盖 projection panel 的 ordered parts / summary / HITL 渲染。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，14 tests，新增覆盖 root/task/snapshot/runtimeFacts event 聚合，以及 top-level `taskEvents` 不再遗漏。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionBridge.ts" "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过，证明新增 bridge / view model 类型能与现有 `AgentUiProjectionEvent` 契约兼容。
- 本轮随后移除 `agentUiProjectionViewModel.ts` 中的硬编码 presentation 标题，改为 `label` 语义值，避免接入 Host UI 时绕过 Lime current 五语言 i18n。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，16 tests，补充覆盖 running tool/process 默认展开、终态工具/status 折叠、最终成稿默认展开。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，17 tests，补充覆盖 Artifact / Evidence refs 的独立卡片渲染。
- `npx eslint "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，20 tests，补充覆盖模型、Token、费用类 `metric.changed` diagnostics projection、view model 索引和面板卡片渲染。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionBridge.ts" "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，21 tests，补充覆盖 HITL action control 从 projection event 贯穿到 view model / panel。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，21 tests，补充覆盖 HITL action identity 与 task id 从 projection event 贯穿到 view model / panel。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，22 tests，补充覆盖 projection panel 的可选 HITL `onAction` 回调与 action button 文案注入。
- `npx eslint "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，22 tests，补充覆盖 HITL `controls` 列表、approve / reject 多按钮与 `onAction` 回调。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionBridge.ts" "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.tsx" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx" --max-warnings 0`：通过。
- `npm run typecheck`：通过。
- `npm test -- "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" "src/features/plugin/runtime/agentUiProjectionViewModel.test.ts" "src/features/plugin/runtime/agentRunProjectionState.test.ts" "src/features/plugin/ui/AgentRunProjectionPanel.test.tsx"`：通过，23 tests，补充覆盖已标准化 AgentUI `action.required / tool.result / metric.changed` event 的 passthrough。
- `npx eslint "src/features/plugin/runtime/agentUiProjectionBridge.ts" "src/features/plugin/runtime/agentUiProjectionBridge.test.ts" --max-warnings 0`：通过。
- `npm run typecheck`：通过。

## 10. 当前结论

AgentUI 中 **核心 runtime projection、message parts、Tool UI、HITL、Artifact、Evidence、Task Capsule、Runtime Profile tests** 都适合进入 Plugin；但进入方式必须是 Lime Host 统一封装，而不是每个 App 直接引入一套 AgentUI 实现。

Lime 现在已经具备 `solo_run + required Skills + Host Run UI first-cut` 的基础，足够支撑内容工厂继续验证真实业务流程；但还不能宣称完整支持 AgentUI v0.6.1，因为 ordered parts、HITL 控件、Artifact Workspace、Evidence Review/Replay、Session Hydration、Subagents 仍未完整落地。

最终产品边界保持不变：

```text
App 做业务工作流和交付物使用路径。
Lime Host 做 AI Agent 运行现场、Skills / Tools / Models / Usage / Evidence / HITL 的通用能力。
AgentUI 做标准投影语言和验收用例，不做新的运行事实源。
```
