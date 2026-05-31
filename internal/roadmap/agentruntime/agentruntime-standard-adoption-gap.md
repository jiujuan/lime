# AgentRuntime Standard Adoption Gap for Agent App

> 状态：current-gap-analysis
> 更新时间：2026-05-17
> 对比来源：`/Users/coso/Documents/dev/ai/limecloud/agentruntime` (`agentruntime-standard` v0.4.0)、Lime AgentRuntime Profile、Agent App Runtime Surface、Claw capability sharing、AgentUI adoption gap
> 目标：判断给 Claw 设计的 AgentRuntime 标准对 Lime Agent App 是否有用，并固定可采用子集、适配边界和禁止方向。

## 1. 结论

有用，而且比 AgentUI 更关键。

AgentUI 解决的是 **运行事实如何投影成可复用 UI**；AgentRuntime 解决的是 **这些运行事实、控制命令、恢复状态、证据和成本到底由谁拥有**。如果只采用 AgentUI，内容工厂能长得像 Claw，但仍可能在 App 内自建第二套任务状态、模型选择、Skill 调用、Token 统计和证据链。采用 AgentRuntime 后，Agent App 只能通过 Lime Host / AgentRuntime 主链使用 AI 能力。

因此本轮判断固定为：

```text
外部 agentruntime 标准 = Lime / Claw / Agent App 的 runtime truth 参考标准
Lime 当前 AgentRuntime = implementation/current 主路径
AgentUI = runtime facts 的 projection / UI 标准
业务 Agent App = 业务流程、业务对象和产物写回 surface
```

不能把 `/Users/coso/Documents/dev/ai/limecloud/agentruntime` 当成一个要拷进 Lime 的新运行时实现；它是标准与 profile 参考，用来约束 Lime current runtime、Agent App facade 和 Claw capability catalog。

## 2. 为什么它对 Agent App 有用

内容工厂暴露的问题不是“页面里缺一个模型 API”，而是缺完整 Agent runtime 能力：任务生命周期、Skills、Tools、模型路由、Token/费用、HITL、Artifact、Evidence、恢复和审计必须在 App 内可见、可控、可回放。

AgentRuntime 标准正好把这些能力定义成 execution facts：

| Agent App 需求 | AgentRuntime 对应能力 | 对内容工厂的意义 |
| --- | --- | --- |
| 不跳回通用 Chat，也不直连模型 API | `submit_turn / create_task / start_task` control plane | App 提交业务 task，后端进入同一 Aster / Claw / Skills 主链。 |
| 展示 Claw 式思考、执行、工具、流式输出 | `model.* / reasoning.* / tool.* / run.status / process.*` events | Host Run UI 可按事件流渲染过程，App 不解析聊天正文。 |
| 使用 Skills 而不是 prompt 暗示 | `tool.catalog.resolved / tool.started / tool.result` 与 capability refs | required Skills 必须成为 runtime facts，完成态可验证 invoked skills。 |
| 模型选择、Token、费用 | `task.profile.resolved / routing.* / cost.* / limit.changed / quota.*` | 模型下拉只是 preference；真正选择和消耗由 runtime 解释。 |
| 人工确认、补充上下文、审批 | `action.required / action.resolved` 和 `respond_action` | App 内追问/确认不再是 UI 状态，必须回写 pending action。 |
| 产物和业务写回 | `artifact.changed`、Task output refs、delivery state | workspace patch / content batch 是 artifact fact，不是最终回答文本。 |
| 证据、复盘、回放 | `evidence.changed`、`export_evidence / export_replay / export_review` | Evidence Pack、review、replay 消费同一组 runtime facts。 |
| 连续任务和失败恢复 | `TaskSnapshot`、attempts、queue、history、snapshot repair | 单会话全流程失败时能知道卡在任务、状态还是页面递进。 |

## 3. 与 AgentUI 的边界

| 层 | 负责 | 不负责 | Lime 采用方式 |
| --- | --- | --- | --- |
| AgentRuntime | 执行事实、控制面、事件流、read model、task/attempt、routing/cost、permission/sandbox、evidence/replay refs | UI 组件、视觉布局、业务页面流程、artifact bytes、evidence verdict | 作为 current runtime truth 与 Agent App facade 的 profile contract。 |
| AgentUI | Runtime facts 的消息 part、运行状态、工具卡、HITL、Artifact/Evidence lane、Team/Task surface 投影 | 决定事实是否完成、决定模型/工具、写证据或产物 | 作为 Host Agent Run UI SDK 的 projection 标准。 |
| Claw capability catalog | 已实现 `@` 能力的 capability id、metadata contract、Skill/Tool 启动经验 | 为每个 App 复制 skill launch 或工具权限系统 | Chat、Agent App、Automation 共用 catalog，入口不同但后端主链相同。 |
| Agent App | 业务路径、业务对象、表单、工作区、产物确认和写回 | AI 执行事实、模型路由、Token 统计、Skill runtime、Evidence owner | 通过 `lime.agent / lime.workflow / lime.*` SDK 调 Host runtime。 |

一句话：**AgentRuntime 决定“发生了什么”，AgentUI 决定“怎么展示发生过程”，Agent App 决定“业务上下一步做什么”。**

## 4. 可直接采用的子集

这些能力与 Lime current 路线图一致，应进入 Agent App / Host Run UI 的 P0-P1 验收口径。

| 标准能力 | 采用口径 | Lime 当前落点 |
| --- | --- | --- |
| Required identities | 所有可审计事件必须尽量携带 `runtimeId / sessionId / threadId / turnId / taskId / runId / stepId / toolCallId / actionId / artifactId / evidenceId` | `AgentRuntimeProfileEvent`、`AgentRuntimeThreadReadModel`、`agent_app_runtime_*` facade。 |
| Event envelope | 标准化 `type / eventId / timestamp / schemaVersion / sequence / payload / refs` | `runtime_agent_profile_projection_service` 与 Agent App projection bridge。 |
| Control plane semantic | Lime 命令可保留产品名，但必须映射到 `submit_turn / start_task / get_task / respond_action / cancel_task / export_evidence` | `agent_app_runtime_start_task / get_task / submit_host_response / cancel_task`；evidence 走 `agent_runtime_export_*`。 |
| Task lifecycle | `task.*` 与 `task.attempt.*` 表达 objective、status、attempt、retry、artifact/evidence refs | 内容工厂 key action 已有 task snapshot，但单会话全流程还需补强。 |
| Model routing / cost / limit | `task.profile.resolved / routing.* / cost.* / quota.* / limit.changed` 必须成为 runtime facts | Host `runtimeProcess.model / usage / cost` first-cut 已显示，需补用户手动切换和限额分支。 |
| Tool / Skill lifecycle | `tool.catalog.resolved / tool.started / tool.args / tool.result / tool.failed` 表达 required/invoked Skills 和工具结果 refs | Claw Skill pre-execution 与 ToolEnd metadata 已可投影。 |
| HITL action | `action.required / action.resolved` 只能通过 `respond_action` 解决 | `agent_app_runtime_submit_host_response` 已有命令，Host UI 受控卡片仍需补闭环。 |
| Artifact / Evidence refs | `artifact.changed / evidence.changed` 只放 refs、patch、verification summary，不把大 payload 复制到每个事件 | 内容工厂 workspace patch / evidence projection 已有 first-cut。 |
| Durable read models | `ThreadReadModel / TaskSnapshot / SessionSnapshot` 是 GUI、恢复、证据导出的共同读模型 | Host task subscription + direct snapshot 已可用，单会话恢复与稳定 gate 仍需补。 |

## 5. 需要适配后采用的部分

| 标准能力 | 当前差距 | 适配要求 | 优先级 |
| --- | --- | --- | --- |
| Lime Profile schema 强校验 | 外部 schema 要求 `schemaVersion=lime-profile-0.4.0`、`runtimeId`、`sequence`、scope ids；Lime current 还有部分投影事件来自历史字段 | 增加 fixture / contract 测试，缺失 correlation 时标记 degraded，不从正文猜 ids | P0 |
| Agent App command mapping | `agent_app_runtime_*` 已是 facade，但语义还散在 start/get/host response/event translator | 在文档和 contract 中固定到 `submit_turn / start_task / get_task / respond_action / cancel_task`，防止 facade 变成第二运行时 | P0 |
| Ordered event replay | AgentUI bridge 已能排序 parts，但 Host drawer 接入仍在并行写集 | Host Run UI 消费 projection state；运行中展开，终态折叠但不删除过程 | P0 |
| Task attempts / retry | 标准要求 retry 创建新 `run/attempt`，不覆盖旧失败 | Agent App retry/cancel 需要保留 attempt history，并在 TaskSnapshot / Evidence 中可见 | P1 |
| Permission / sandbox / hook / process | Claw/ToolRuntime 有相关事实，但 Agent App Host 可见度不足 | 将 permission、sandbox、hook、process 事件进入 projection diagnostics / evidence，不让 App 自建权限判断 | P1 |
| Tool inventory snapshot | 标准要求当前 scope 下可用 tools / policy / capabilities 可解释 | `lime.skills / lime.tools / lime.models` 能力目录需要从 Host 投影给 App，App 只显示可用/不可用 | P1 |
| History / recovery / snapshot repair | 单会话全流程仍红，说明状态递进和 task snapshot 稳定性还不够 | 打开历史 App task 时先用 snapshot 恢复，再按 sequence 补事件 | P2 |
| Subagents / jobs / remote channels | 标准覆盖完整委派和远程工作，但内容工厂当前 P0 不是多 agent workbench | 先保持 solo task + required Skills；等 runtime 暴露 parent-child graph 后再进入 Team Workbench | P2 |

## 6. 暂缓或禁止

| 方向 | 分类 | 原因 |
| --- | --- | --- |
| 直接把外部 `agentruntime` 项目当实现依赖搬进 Lime | dead | 它是标准/文档/profile，不是 Lime current runtime 实现。 |
| Agent App 自建 `agent_app_agent_runtime` facts | dead | 会和 AgentRuntime Profile 形成双事实源。 |
| 内容工厂直连 OpenAI-compatible API 或 `LIME_GATEWAY_*` 完成主流程 | dead | 只能得到模型补全，拿不到 Skills、Tools、routing、cost、evidence、HITL。 |
| 每个 App 复制 Claw `*_skill_launch.rs` | dead | 破坏 Claw capability catalog 复用，制造权限和证据旁路。 |
| App 内完整实现 AgentUI runtime store | dead | UI projection 只能在 Host 层统一，App 只能消费标准视图。 |
| Team Workbench / remote teammate 全量默认进入每个 App | deferred | 需要 subagent/job/channel runtime facts 先稳定。 |
| 用最终正文反推 artifact、Skill 成功或 evidence pass | deprecated | 标准明确要求 missing facts 标为 `unknown/unavailable/stale/blocked`，不能猜。 |

## 7. current / compat / deprecated / dead 分类

### current

1. Lime current AgentRuntime：`RuntimeEvent + ThreadReadModel + TaskSnapshot + EvidencePack`。
2. `agent_runtime_submit_turn -> runtime_turn -> runtime_queue -> stream_reply_once`。
3. `agent_app_runtime_*` 作为 Agent App Runtime Surface facade，委托 current AgentRuntime 主链。
4. `AgentRuntimeProfileEvent`、Lime Profile fixtures、Evidence Pack、Replay / Review / Analysis exports。
5. Claw capability catalog：Chat `@`、Agent App task、Automation 共用的 capability contract。
6. Host Agent Run UI / AgentUI projection：从 runtime facts 渲染过程，不拥有事实。

### compat

1. `agent_app_cmd.rs` 继续负责 package、installed state、UI runtime、scoped env，但不能扩展为 AgentRuntime owner。
2. App 前端 `CapabilityHost` / storage / artifact / evidence adapter 可用于离线测试和非 AI 业务写回，不能冒充生产 AI task runtime。
3. 历史 `task:*` App event 可继续作为投影输入，但要桥接到 AgentRuntime / AgentUI event class。
4. `LIME_GATEWAY_*` 仅作为低阶模型 executor 或开发期 fallback，不能被 UI/文档称为完整 Agent 能力。

退出条件：Host Run UI 与 App SDK 全部消费 profile events / read model / projection view 后，compat event 只保留 adapter，不再新增语义。

### deprecated

1. GUI、Agent App 或 smoke 脚本从文本和本地状态重建 task completion。
2. App 侧私有“AI 同事”面板自己统计模型、Token、Skill、Evidence。
3. App 通过嵌入通用 Chat 让用户复制结果。
4. 为内容工厂等垂直场景新增专用 Agent command。

### dead

1. 第二套 Agent App runtime facts。
2. 第二套 Skill runtime / tool permission / evidence exporter。
3. 没有 `session/thread/turn/task/run` correlation 的 telemetry 被当成会话级证据。
4. 只给 App API key，让业务 App 直接调 provider 生成内容。

## 8. 对后续实现的直接启示

下一刀不应该继续在内容工厂 App 内补 UI 细节，而应该补 Host / Runtime 的标准 seam：

1. **Host Run renderer 接入 AgentUI projection state**：把 `task:* / runtimeFacts` 先标准化为 AgentUI ordered parts，再渲染 thinking、tool、text、artifact、evidence、metrics。
2. **Action response 闭环**：`action.required` 在 Host UI 展示 approve / reject / answer，提交后走 `agent_app_runtime_submit_host_response`，并产生 `action.resolved` fact。
3. **模型与成本不是 App 下拉框私有状态**：App 只传 `modelPreference / taskProfile`，runtime 产出 `routing.* / cost.*`，Host 显示真实 selected model、usage、cost。
4. **Skill 必须 runtime 可验证**：required Skills 进入 task contract，invoked Skills 来自 ToolEnd / runtime facts，smoke 不接受只写 prompt。
5. **单会话全流程看 TaskSnapshot**：内容工厂串联失败要用 task/read model 定位状态递进、attempt、artifact delivery，而不是只看页面按钮。
6. **Evidence 和 Replay 共用事实**：任何内容包、复盘、交付报告的审计入口都必须从 `agent_runtime_export_evidence_pack` 或同源 facts 导出。

## 9. 验收矩阵

| 验收项 | 必须证明 | 当前状态 |
| --- | --- | --- |
| Runtime profile event | 核心事件包含 `schemaVersion / runtimeId / eventId / sequence / payload` 与适用 scope ids | first-cut，需继续 schema fixture gate。 |
| Agent App facade 不自建 runtime | `startTask/getTask/respond/cancel` 都能映射 profile semantic，并进入 `agent_runtime_submit_turn` 主链 | first-cut 已落地。 |
| Host UI 过程不消失 | 运行中展开，终态折叠但可展开，thinking/tool/text/artifact/evidence/metrics 均来自 projection | projection seam 已有，drawer 接入仍在并行写集。 |
| Skills 真实调用 | required/invoked Skills 都来自 runtime facts，非 prompt 字符串 | key actions 已通过，单会话全流程仍需补。 |
| 模型/Token/费用 | selected model、usage、cost 来自 runtime routing/cost facts | first-cut 已有，需覆盖手动模型选择和限额分支。 |
| Artifact/workspace patch | 业务写回来自 artifact refs / workspace patch，不来自最终 prose 解析 | key actions 已通过，direct snapshot stabilization 仍需补。 |
| Evidence/replay | Evidence Pack、review、replay 与 UI diagnostics 使用同一 facts | first-cut 已有，完整 lane 和失败分支仍需补。 |
| Single-session content factory journey | 知识库 -> 场景 -> 文案 -> 脚本 -> 交付 -> 复盘连续绿色 | 当前仍红，是下一条业务闭环主缺口。 |

## 10. 与路线图主目标的关系

AgentRuntime 标准不是额外范围，而是把“Agent App 内完整使用 Lime AI 能力”这件事从 UI 诉求变成可验证工程合同：

```text
业务 App 负责业务递进
Host SDK 负责运行 UI projection
Lime AgentRuntime 负责 execution facts
Claw capability catalog 负责已实现能力复用
Evidence / Artifact owner 负责可信交付
```

这也解释了为什么它虽然最初给 Claw 设计，反而适合 Agent App：Claw 已经有真实 Agent 能力和运行压力；Agent App 需要的不是另起炉灶，而是把这些压力抽象成 Host / Runtime 层的标准合同。

## 11. Prompt-to-artifact 检查表

本表只审计“是否应采用外部 AgentRuntime 标准”这一刀，不替代 `agent-app-runtime-completion-audit.md` 的整体产品完成审计。

| 显式要求 / 命名资料 | 实际检查证据 | 覆盖判断 | 仍缺什么 |
| --- | --- | --- | --- |
| 检查 `/Users/coso/Documents/dev/ai/limecloud/agentruntime` 是否有用 | 已读取 `package.json`，确认是 `agentruntime-standard` v0.4.0；已读取 `README.md`、`docs/zh/specification.md`、`docs/zh/profiles/lime.md`、核心 contracts、schemas 和 fixtures | covered | 无；结论已沉淀到本文。 |
| 不能把 AgentRuntime 当成 AgentUI | 本文第 1 / 3 节固定 AgentRuntime 是 runtime truth，AgentUI 是 projection；`internal/roadmap/agentruntime/agentui-adoption-gap.md` 已记录 AgentUI 侧差距 | covered | 后续实现需要 Host drawer 真正消费 projection state。 |
| 要判断“给 Claw 设计”是否能用于 Agent App | 本文第 2 / 10 节说明 Claw 的真实运行压力正是 Agent App 需要的能力集合：Skills、Tools、routing、cost、HITL、artifact、evidence、recovery | covered | 单会话内容工厂全流程仍需跑绿来证明业务递进。 |
| 要避免新增第二套 runtime | 本文第 6 / 7 节将 `agent_app_agent_runtime`、App 直连模型 API、复制 `*_skill_launch.rs` 判为 `dead` | covered | 应补 lint / contract gate，防止后续 App 文档或 manifest 回流到 API 壳。 |
| 要明确 Lime Agent / App 边界 | 本文第 3 / 7 节与 `app-surface-runtime.md` 对齐：AgentRuntime 管 execution facts，App 管业务流程和产物写回 | covered | Host SDK UI seam 还需继续抽包。 |
| 要让模型、Token、费用成为底层事实 | 外部 `model-routing-limits.md` 与本文第 4 / 8 节映射到 `routing.* / cost.* / quota.* / limit.changed` | first-cut covered | 用户手动模型选择、低余额、限额、provider 错误分支仍缺业务验收。 |
| 要让 HITL 和确认链不只是 UI 状态 | 外部 `control-plane.md` / `runtime-event-stream.md` 要求 `action.required -> respond_action -> action.resolved`；本文第 4 / 8 节映射到 `agent_app_runtime_submit_host_response` | first-cut covered | Host Run UI 的 approve / reject / answer 受控卡片闭环仍未完成。 |
| 要让 Evidence / Replay / Review 共用事实 | 外部 `evidence-replay.md` 与本文第 4 / 8 节映射到 `evidence.changed`、`agent_runtime_export_evidence_pack` | first-cut covered | 完整 Evidence lane、失败分支和 replay visual audit 仍待补。 |
| 要保留任务、attempt、恢复事实 | 外部 `agent-task.md`、snapshot schema 与本文第 5 / 9 节映射到 `TaskSnapshot`、attempt history、snapshot repair | partial | 单会话全流程 runner 仍红，说明 task/read model 与业务状态递进还未完全闭环。 |

审计结论：AgentRuntime 标准采用判断已经完成，但整体目标还不能标记完成。真正剩余主线不在“是否采用标准”，而在 Host Run renderer 接入、HITL 受控响应、模型/限额分支、direct snapshot stabilization 和内容工厂单会话全流程。

## 12. 当前真实证据复核摘要

2026-05-17 本轮继续只读核查 `.lime/qc/gui-evidence/agent-apps`，不把路线图文字本身当完成证据。

已存在且显示 key action ready 的 evidence：

| Evidence file | 复核到的关键事实 |
| --- | --- |
| `.lime/qc/gui-evidence/agent-apps/agent-app-required-skills-runtime-enforced-run-production-summary.json` | `completionE2e.ready=true`，且 `modelReady / usageReady / costReady / skillInvocationReady / artifactReady / evidenceReady / workspacePatchReady / terminalReady` 全为 `true`。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-required-skills-runtime-enforced-only-copy-summary.json` | `only-copy` 同样全 readiness 为 `true`，required Skills 不再只是 prompt 提示。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-output-contract-materialized-run-strategy-summary.json` | `run-strategy` 交付包物化完成，全 readiness 为 `true`。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-output-contract-materialized-run-review-summary.json` | `run-review` 复盘物化完成，全 readiness 为 `true`。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-run-production-direct-audit-summary.json` | `run-production` direct audit 全 readiness 为 `true`。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-only-copy-direct-audit-summary.json` | `only-copy` direct audit 全 readiness 为 `true`。 |
| `.lime/qc/gui-evidence/agent-apps/agent-app-direct-runtime-postcheck.json` | 两个 direct get 复核均显示 `threadArtifactCount=1` 且 `hasWorkspacePatchByDirectSnapshot=true`。 |

Host projection seam 当前定向验证：

| Command | 复核到的关键事实 |
| --- | --- |
| `npm test -- "src/features/agent-app/runtime/agentUiProjectionBridge.test.ts" "src/features/agent-app/runtime/agentUiProjectionViewModel.test.ts" "src/features/agent-app/runtime/agentRunProjectionState.test.ts" "src/features/agent-app/ui/AgentRunProjectionPanel.test.tsx"` | 4 个 test files / 24 tests 全部通过，证明 Agent App task events -> AgentUI projection -> Host Run projection panel 的 first-cut seam 当前仍可用。 |
| `npm run typecheck` | 通过，证明当前并行工作树的 TypeScript 类型层没有阻断 Host projection seam 后续接入。 |
| `npm run test:contracts` | 通过；命令契约检查显示 frontend commands `403`、Rust registered commands `563`、mock priority commands `49`、default mock commands `387` 均同步，Harness / modality / cleanup contract 也通过。 |
| `npm run governance:legacy-report` | 通过；扫描文件数 `1344`、测试文件数 `785`、零引用候选 `0`、分类漂移候选 `23`、边界违规 `0`，说明本轮 AgentRuntime / Agent App 收口没有新增 legacy surface 违规。 |
| `node --test tests/ui.test.mjs` in `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` | 通过；当前并行工作树中内容工厂 UI 单测为 `30` 个全部通过，新增覆盖项目流程导航、统一抽屉、Host 运行明细、Host profile 缺 AI 能力时阻止本地模型兜底等页面行为。 |
| `npm test -- "scripts/lib/agent-app-package-handoff-core.test.ts"` | 通过；`7` 个测试覆盖 Agent App package handoff 守卫，包括私有 Host Bridge marker、src/dist 漂移、高风险脚本，以及新增的 provider/Gateway 直连 runtime bypass marker。 |
| `node scripts/agent-app-package-handoff-check.mjs --package-dir "/Users/coso/Documents/dev/ai/limecloud/content-factory-app" --format summary` | 修复后返回 `status=needs_handoff`；`agentRuntimeBypass=none`、`blockers=none`、`distArtifacts total=0`。仍有 dirty / high-risk build script warning，所以外部 package 需要持有者 handoff，但“直连 provider/Gateway”这一 blocker 已清零。 |

仍然阻止整体目标完成的 evidence：

| Evidence file | 复核到的失败事实 | 结论 |
| --- | --- | --- |
| `rg "AgentRunProjectionPanel|agentRunProjectionState" src/features/agent-app/ui/AgentRunHostDrawer.tsx` | 当前无命中；`AgentRunHostDrawer.tsx` 仍直接读取 `runtimeProcess / timeline / thinking / execution / streamText`。 | Host drawer 尚未消费已验证的 projection seam，Host Run renderer 完整共享 seam 仍未完成。 |
| `.lime/qc/gui-evidence/agent-apps/content-factory-run-scenarios-audit-20260517-failure.json` + `.lime/qc/gui-evidence/agent-apps/content-factory-run-scenarios-post-timeout-completion-20260517.json` | `run-scenarios` 已能启动真实 AgentRuntime task，调用 `knowledge-builder / content-reviewer`，并在 direct snapshot 中完成 `status=completed`、`artifactCount=1`、`sceneCount=120`、`workspacePatchReady=true`；但 flow runner 在 `completionTimeoutMs=240000` 内先判失败，且 `usageReady=false`。 | `run-scenarios` 的前置 gate / 运行时主链已推进到可证明完成；剩余是 runner completion window、usage fact 或 completion 判定口径需要收敛。 |
| `.lime/qc/gui-evidence/agent-apps/content-factory-run-production-audit-20260517-failure.json` | 等待 `button[data-action="run-production"]` 60 秒超时；截图/iframe 文本显示 sample workspace 已是 `场景 120/120`、`内容 20/20`、`交付已整理`、`复盘已生成`，页面主 CTA 变为“继续下一轮”。 | 当前 full-flow runner 与内容工厂新业务路径/seed sample 不再对齐；这不是新的 runtime task 失败，而是验收脚本仍按旧“空内容 -> run-production”路径找按钮。 |
| `node scripts/agent-app-package-handoff-check.mjs --package-dir "/Users/coso/Documents/dev/ai/limecloud/content-factory-app" --format summary` | `agentRuntimeBypass=none`，外部 package 当前 direct provider/Gateway marker 已清零；但 package worktree 仍有 `tracked=45`、`untracked=3`，且 build/verify/e2e 脚本仍会重建 dist。 | “App 不直连 provider API”已从 blocker 降为 handoff warning；整体仍不能完成，因为 full-flow runner、Host drawer projection-first 和 HITL/usage 分支仍未闭环。 |

因此当前应继续推进 **单会话全流程绿色** 和 **Host Run renderer 完整共享 seam**，不能因为 key action 或单步 `run-scenarios` direct snapshot 已绿就把整体目标标记完成。下一步应先把内容工厂 full-flow runner 改为新业务路径：要么 seed 一个仅有资料/场景、未生成内容的 workspace，再点击 `run-production`；要么在 sample 已完成时走“继续下一轮”动作并验证新的 AgentRuntime task / attempt。

## 13. 内容工厂单会话失败 handoff

本节是只读诊断；`/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 当前存在大量已脏文件，本轮不接管、不覆盖，只给持有该写集的进程提供最小修复线索。

### 13.1 `build-store -> run-scenarios` 最新状态

2026-05-17 继续只读复测后，`run-scenarios` 不再停在旧的“按钮不可见”失败形态：

- `node scripts/agent-apps-content-factory-flow.mjs --actions run-scenarios --prefix content-factory-run-scenarios-audit-20260517 --timeout-ms 120000 --completion-timeout-ms 240000`
- runner 在 `wait-runtime` 阶段因 `terminalReady / usageReady / artifactReady / workspacePatchReady` 未及时就绪而输出 failure summary。
- 失败后继续 direct get 同一 `taskId=sessionId`，`agent_app_runtime_get_task` 已返回 `status=completed`、`artifactCount=1`、`sceneCount=120`、`workspacePatchReady=true`、`evidenceReady=true`、`costReady=true`，且 invoked skills 为 `knowledge-builder / content-reviewer`。

这说明 gate 和真实 AgentRuntime 执行链已明显推进；当前不应再把 `run-scenarios` 归因成“按钮隐藏 / readiness 回退”主问题。剩余问题是 completion 判定窗口、usage fact 可用性，以及 runner 是否应该在 direct snapshot 后继续短轮询到 artifact ready。

历史失败 `content-factory-full-flow-20260517-failure.png` 曾显示页面已经在“场景地图”，右侧 `场景概览` 有 `120` 个场景、`12` 条图片需求，但上方 gate 仍显示：`资料还不能生产 / 补齐资料`，因此 `button[data-action="run-scenarios"]` 不可见。这个形态仍可作为回归测试来源，但不是当前最新失败形态。

只读代码定位：

- `src/ui/app.js#getGenerationGate()` 先检查 `!getReadiness().canProduce`，然后才允许场景/内容动作。
- `src/ui/app.js#getReadiness()` 直接返回 `state.workspace?.readiness`，不会用已存在的 `sceneTable / contentBatch / scripts` 推导“可继续生产”。
- `src/ui/app.js#buildWorkspaceFromRuntimePatch()` 会用 `normalizedPatch.readiness || current.readiness` 覆盖 readiness；当 knowledge task runtime patch 带回保守 readiness 时，即使已有 120 个场景，也会把后续 gate 卡回资料阶段。
- `node --test tests/ui.test.mjs` 当前 `30` 个测试通过，已覆盖 Host 运行明细与 profile 缺 AI 能力时阻止本地模型兜底，但仍未覆盖“已有生产资产时 readiness 回退不能隐藏后续动作”。

最小修复方向：

```text
如果 workspace 已经有可用 sceneTable/contentBatch/scripts 或 knowledge_version 已确认，
不应让 runtime knowledge patch 的保守 readiness 把后续 production gate 回退成 blocked；
可以将其标记为 degraded/warning，并保留“可继续”的业务递进。
```

实现候选点：

1. 在 `getReadiness()` 增加 derived readiness：当 `sceneTable.actualCount >= 120`、`contentBatch.count > 0` 或 `scripts.length > 0` 时，即使底层 readiness false，也返回 `canProduce=true`、保留原 warning/message 作为风险提示。
2. 或在 `buildWorkspaceFromRuntimePatch()` 合并 readiness 时，如果 current 已有 production assets，不允许 knowledge patch 将 `canProduce: true` 降级为 `false`。
3. 测试应覆盖：已有 `sceneTable.actualCount=120` 且 readiness false 时，`run-scenarios` / `run-production` 不应消失，而是显示可继续 + 风险提示。

### 13.2 `run-production` runner 与新业务路径不匹配

`content-factory-run-production-audit-20260517-failure.json` 显示当前 runner 进入内容页后等待 `button[data-action="run-production"]` 超时。页面实际状态已经不是“待生成本轮内容”：

- `场景 120/120`
- `内容 20/20 条`
- `交付 已整理`
- `复盘 已生成`
- 主 CTA 是“继续下一轮”

只读 DOM / 代码复核进一步确认：`getPrimaryWorkflowAction()` 在完整项目状态下返回 `{ label: '继续下一轮', page: 'content' }`，`renderWorkflowActionButton()` 因此只渲染 `data-go-page="content"`，不会触发新的 AgentRuntime task。也就是说，“继续下一轮”当前只是导航/提示，不是新的业务 run。

这意味着内容工厂 App 的 sample workspace / 页面递进已经被并行工作更新为完整项目状态，旧 flow runner 仍假设 seed 后应该点击 `run-production`。当前失败更像 **验收脚本和业务路径漂移 + App 缺少明确 next-round action contract**，不是 AgentRuntime 没启动。

历史 `content-factory-operational-flow-fast-skill-20260517-failure.json` 显示从已确认知识库出发，`run-production` 的 task payload 完整，readiness score 为 `100`、scene count 为 `120`、已有 content count 为 `20`、script count 为 `6`，但 runner 报告“did not create a new AgentRuntime task”。这个风险仍存在，但现在首先要让 runner 与新路径对齐，避免用旧按钮作为完成判据。

只读代码定位：

- `src/ui/app.js#runAiCoworkerTask()` 使用固定 `idempotencyKey`，例如 `sample_content_factory_spring:copy:douyin:20`。
- 单会话连续 runner 在同一项目反复跑 key action 时，若 Host / facade 按 idempotency 返回已有 task 或没有新增 callLog，`waitForNewTask()` 会把它判为“未创建新任务”。
- 这不一定是 AgentRuntime 没执行，也可能是 runner 与 idempotency 语义冲突：连续业务验收需要“新 attempt 或可观测 resume/progress”，而不是必须创建全新 task id。

最小修复方向：

1. full-flow runner 先选择明确的 workspace 初始状态：`materials-only`、`scenes-ready`、`content-ready` 或 `fully-complete`，不要用同一个 sample 同时覆盖所有动作。
2. 如果目标是测 `run-production`，seed 必须保证 `sceneTable.actualCount >= 120` 且 `contentBatch.count < 20`，页面才应该出现 `button[data-action="run-production"]`。
3. 如果目标是测完整项目的下一轮，runner 应识别“继续下一轮”动作，并验证它会创建新 task、新 attempt，或同 task 出现新的 `started/progress/runtimeProcess` sequence。
4. App 侧需要补一个明确的 next-round action contract，例如重置当前轮 `contentBatch / scripts / delivery / review` 的业务状态，或创建新的 `campaignRunId` 后再允许 `run-production`。
5. 业务 App 侧可把 key action 的 `idempotencyKey` 加入 action run sequence / timestamp / workflow run id，仅在用户重复点击同一任务时复用。
6. AgentRuntime facade 侧应明确返回 idempotency 命中状态，避免 smoke 只能靠 callLog 长度判断。

建议验收：

- 先补 unit test：已有生产资产 + readiness false 时仍保留业务递进，不隐藏后续合理动作。
- 再补 runner 用例：`scenes-ready -> run-production` 与 `fully-complete -> continue-next-round` 分开验收。
- 最后跑 `scripts/agent-apps-content-factory-flow.mjs` 的 operational flow，证明从目标初始状态出发能连续创建或恢复可观测 AgentRuntime 工作。

## 14. Host drawer projection seam handoff

本节是只读诊断；`src/features/agent-app/ui/AgentRunHostDrawer.tsx` 当前已脏，本轮不接管，只记录最小接入点。

当前状态：

- `AgentRunHostDrawer.tsx` 已经抽出 `AgentRunRenderer` / `AgentRunProcessPanel`，并带有 `data-agent-run-renderer="host-shared"`。
- 现有 renderer 已复用 Claw 侧 `InlineToolProcessStep`、`ThinkingBlock`、`MarkdownRenderer`，能展示 metric cards、facts rail、timeline、thinking、execution 和 output。
- 但它仍直接消费 `runtimeProcess.timeline / thinkingText / executionText / streamText`，没有导入 `AgentRunProjectionPanel` 或 `buildAgentRunProjectionViewModelFromState`。
- 当前可用 projection seam 已由 24 个定向测试证明；缺口是把 seam 挂进 drawer，而不是继续在 drawer 内复制 `collectRunEvents` / timeline grouping 逻辑。

最小接入建议：

1. 在 `AgentRunRenderer` 内先调用 `buildAgentRunProjectionViewModelFromState(run)` 得到 projection view model。
2. 当 projection view model 有 `orderedParts / actions / artifacts / evidence / diagnostics` 时，优先渲染 `AgentRunProjectionPanel`。
3. 旧 `AgentRunMetricCards / AgentRunFactRail / AgentRunTimeline / ThinkingBlock / AgentRunTextBlock` 保留为 compat fallback，退出条件是 Host Run projection panel 覆盖所有 content factory key actions。
4. `onAction(action, control)` 应映射到 Host response 通道；未接命令前至少把 action button 保持 disabled 或只发 no-op callback，不能让 UI 乐观标记 resolved。
5. 文案继续外部注入 labels，不在 projection panel 内硬编码展示文案。

测试建议：

- 优先改 `src/features/agent-app/ui/AgentAppRuntimePage.test.tsx`，断言打开 Host drawer 后出现 `data-agent-run-projection-panel`。
- 断言 `taskEvents` top-level / `runtimeFacts.taskEvents` 都能进入 ordered parts。
- 断言 `action.required` 卡片保留 `data-agent-run-projection-action-id` 和 control button。
- 断言终态仍折叠但不删除过程，展开后可见 thinking / tool / final output。

完成口径：

```text
AgentRunHostDrawer
  -> buildAgentRunProjectionViewModelFromState(run)
  -> AgentRunProjectionPanel
  -> compat fallback only when projection is empty
```

只有完成这条接入，Host Run renderer 才能从“Claw 组件复用 first-cut”推进到“AgentUI projection-first SDK seam”。

## 15. Active goal completion audit

本节用于判断“让 Agent App / 内容工厂在 App 内完整复用 Lime AgentRuntime / Claw / Skills / ToolRuntime / Evidence，而不是跳回 Chat、直连模型 API、或每个 App 自建 AI 同事”这一整体目标是否可以标记完成。

当前结论：**不能标记完成**。

| 成功标准 | 当前证据 | 判定 | 还缺什么 |
| --- | --- | --- | --- |
| Agent App AI 任务不直连模型 API，不跳回通用 Chat | key action evidence 已显示 `run-production / only-copy / run-strategy / run-review` readiness 绿；`run-scenarios` post-timeout direct snapshot 显示真实 `agent_app_runtime_get_task` completed；package handoff checker 已能阻断 direct provider/Gateway marker，且内容工厂 package 当前 marker 已清零 | partial | 还要让单会话 full-flow runner 绿，证明业务路径不是只靠单点 key action。 |
| Skills 真实执行，而不是 prompt-only | `run-scenarios` direct snapshot 的 `invokedSkillNames=["knowledge-builder","content-reviewer"]`；历史 key action evidence 中 skill invocation ready 为 true | partial | `run-production / run-scripts / run-strategy / run-review` 在新版 full-flow runner 中仍需同一路径复核。 |
| Host UI 展示思考、执行、工具、流式输出且过程不消失 | projection bridge / view model / panel 24 tests 通过；`AgentRunProjectionPanel` first-cut 已存在 | partial | `AgentRunHostDrawer.tsx` 仍未接入 projection panel；真实抽屉还在读旧 `runtimeProcess.timeline / thinkingText / executionText / streamText`。 |
| 模型、Token、费用来自 runtime facts | key action evidence 显示 model / usage / cost ready；`run-scenarios` direct snapshot 有 selected model 和 cost | partial | `run-scenarios` 当前 `usageReady=false`；用户手动模型选择、quota / rate limit / provider error 分支未跑 full-flow。 |
| Artifact / workspace patch 真实写回业务 App | `run-scenarios` post-timeout evidence 显示 `artifactCount=1`、`sceneCount=120`、`workspacePatchReady=true`；历史 direct audits 显示 workspace patch ready | partial | 内容工厂新版 runner 需证明 `scenes-ready -> run-production` 与后续 content / scripts / delivery / review 都能连续写回。 |
| Evidence / Replay / Review 共用 AgentRuntime facts | key action evidence 与 `run-scenarios` direct snapshot 显示 evidence ready；路线图已固定 `agent_runtime_export_evidence_pack` 为事实源 | partial | Evidence lane / failure branch / replay visual audit 仍未覆盖新版单会话 full-flow。 |
| HITL action 不是 UI 本地状态 | Rust / facade 已有 `agent_app_runtime_submit_host_response`，projection model 可表达 `action.required` | partial | Host drawer action 卡片未接命令；approve / reject / answer / edit 控件和 `action.resolved` 回写未做真实验收。 |
| 内容工厂业务流程有正常层次递进 | content factory UI tests 30 passed；页面已从平铺改成资料 / 场景 / 内容 / 交付 / 复盘导轨 | partial | full-flow runner 与新版 seed/action contract 漂移；`continue-next-round` 当前只是 `data-go-page`，不是新业务 run。 |
| 不复制 Claw skill launch / 不新增第二套 runtime | 文档已将第二套 runtime、复制 `*_skill_launch.rs`、App 直连 provider API 判为 dead；manifest capability gate / allowlist first-cut 已有；`agent-app-package-handoff-check` 已新增 direct provider/Gateway runtime bypass gate，内容工厂 package 已通过该 blocker | partial | 还要继续补复制 Claw skill launch、App 自建 usage/evidence 统计的 contract / lint gate。 |

剩余主线按交付杠杆排序：

1. **内容工厂 full-flow runner 对齐新版业务路径**：拆成 `materials-only -> build-store`、`scenes-ready -> run-production`、`fully-complete -> continue-next-round`，并验证每一步创建新 task / attempt 或可观测 runtime progress。
2. **Host drawer projection-first 接入**：`AgentRunHostDrawer -> buildAgentRunProjectionViewModelFromState(run) -> AgentRunProjectionPanel`，旧 renderer 只保留 fallback。
3. **HITL / 模型限额 / usage 分支**：补 Host action response 控件、`action.resolved` 回写、manual model preference、quota/rate limit/provider error 的业务验收。
4. **守卫**：App 直连模型 API 的 package handoff gate 已补，内容工厂 package direct provider/Gateway marker 已清零；下一步继续为复制 Claw skill launch、App 自建 usage/evidence 统计补 contract / governance gate。

完成前禁止把目标标记为 complete；通过单测、key action 绿或文档齐全都只能作为局部证据，不能替代上述主线闭环。
