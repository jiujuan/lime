# Agent Workspace Run Observability / Control Surface 评分卡

> 当前静态分：`3.5 / 5`
> 目标：验证 Lime 是否具备 Codex App 截图中那类“运行驾驶舱”：用户能在一个桌面工作区里理解 agent 正在做什么、运行在哪、改了什么、谁参与了、用了哪些来源、还能如何安全地继续控制。

## 1. 截图里的 Codex 界面分别是什么

用户提供的 Codex App 截图不是单一聊天 UI，而是一个完整的 agent run control surface。它至少包含下面这些对象。

| 截图对象 | 产品含义 | 不是简单等价于 |
| --- | --- | --- |
| 左侧全局导航 | 新对话、搜索、插件、自动化、项目 / 会话列表、下载或后台状态入口 | 普通历史列表 |
| 顶栏 root / project chip | 当前工作目录、项目边界、布局 / 审查 / agent / plugin 入口 | 纯页面标题 |
| 主聊天区 | 用户指令、assistant 结果、耗时、复制、消息定位 | Markdown 渲染器 |
| 右侧环境信息卡 | 当前 run 的变更数、运行环境、本地 / cloud / worktree、Git 分支、提交 / 推送动作 | 一个 Git diff 按钮 |
| 右侧进度清单 | 当前 turn / goal 的 plan steps，按 completed / pending / waiting 呈现 | 文本里写“计划” |
| 子智能体区 | 参与 run 的 worker / reviewer / teammate roster，显示身份与状态 | 把子 agent 输出混进主消息 |
| 来源区 | 当前 run 使用的 source / citation / evidence slot | 只在最终回答末尾贴链接 |
| 底部目标状态 | 目标是否 active / paused / blocked / completed，已用时间或预算，继续动作 | 输入框上方的一行提示 |
| 底部后续输入 | 在 run 暂停或完成后继续 steer / follow-up，不破坏当前 context | 新开聊天 |
| 权限模式 chip | 当前权限 / sandbox / approval 档位可见，可切换或审查风险 | 隐藏在设置页 |
| 模型与推理档位 chip | 当前 model、reasoning effort、service tier 等 run-time override 可见 | 全局 provider 设置 |
| 分屏 / 审查 lane | 同一工作区并排另一条对话、审查、文件 / diff / artifact 视图 | 单页跳转 |
| 复制 / 设置 / 下钻控件 | run 的局部对象可以复制、展开、下钻、跳转证据 | 静态卡片 |

一句话概括：Codex 把 **runtime truth、workspace truth、Git truth、permission truth、model truth、subagent truth、source/evidence truth** 投影成同一屏可观察、可控制、可恢复的工作台。

## 2. 外部标准约束

| 来源 | 对本评分卡的约束 |
| --- | --- |
| Codex App 官方手册 | Codex App 是桌面并行工作体验，支持 Local / Worktree / Cloud 模式、内置 Git diff / commit / push / PR、task sidebar、plan / sources / generated artifacts / task summary、permissions / sandbox、MCP、Skills、web search、subagents。 |
| Codex app-server protocol | `TurnPlanUpdatedNotification`、`TurnPlanStep`、`ThreadGoal`、`ActivePermissionProfile`、`TurnStartParams`、`Thread.gitInfo`、`FileChangePatchUpdatedNotification`、`SubAgentActivityKind` 等都是协议对象，不应由前端从 assistant 文本里猜。 |
| AG-UI | 前端要处理 run lifecycle、text、tool call、state snapshot / delta、error；UI 必须能承载实时状态、工具过程和 human-in-the-loop。 |
| MCP | 桌面客户端要暴露 server lifecycle、tools/resources/prompts、capability negotiation、authorization、elicitation、tool annotations 与用户确认。 |
| Agent eval 方法论 | 评分必须有 prompt、runtime events、UI evidence、artifact/evidence refs、grader verdict；不能只看截图“像不像”。 |

## 3. Lime 当前事实源

| 能力区域 | Lime 事实源 | 当前判断 |
| --- | --- | --- |
| Workspace shell / 分屏 | `WorkspaceMainArea.tsx`、`WorkspaceShellScene.tsx`、`taskCenterChromeTokens` | 有 chat / canvas / task-center chrome 基础，但不是 Codex 式 run rail。 |
| 右侧工作台 sidebar | `WorkspaceGeneralWorkbenchSidebar.tsx`、`GeneralWorkbenchSidebar.tsx`、`generalWorkbenchSidebarContract.ts` | 有 context / workflow / exec log 三类 panel，能承载流程和上下文，但还偏内容生产工作台，不是通用 agent run 控制面。 |
| Plan / progress | `AgentRuntimeStrip.tsx`、`HarnessSessionState.plan`、`workflowSteps`、`AgentThreadPlanItem`、`AgentTodoItem` | 有 plan item 计数、workflow steps、历史 plan / todo 恢复投影和 run-control-restore evidence；缺 turn-level source event id、等待原因和状态下钻。 |
| Objective / goal | `ThreadGoalPanel.tsx`、`useAgentSessionThreadGoal.ts`、`threadGoalClient.ts`、App Server v2 `thread/goal/*` | thread-owned canonical `ThreadGoal` 已覆盖 active / paused / blocked / usage/budget limited / complete、预算与用量；状态必须绑定 canonical Thread / Turn / Item，缺底栏统一控制与 run evidence 绑定。 |
| Subagents | `agentUiSubagentsViewModel.ts`、`subagentStatusProjection.ts`、`packages/agent-runtime-projection/src/subagents.ts`、`packages/agent-runtime-ui/src/subagents.tsx` | 投影模型较完整，缺工作台右栏 roster 与主线程控制关系实测。 |
| Sources / evidence | `harnessEvidenceViewModel.ts`、`packages/agent-runtime-projection/src/readModel.ts`、`packages/agent-runtime-ui/src/runtimeFacts.tsx` | 有 `sourceCount`、artifact refs、evidence refs，缺 Codex 式 Sources slot 和 per-run provenance UI。 |
| Git status / diff | `src/lib/api/projectGit.ts`、`CanvasWorkbenchChangesPanelViewModel.ts`、`CodingWorkbenchActionPanel.tsx` | 有 status / diff / branch / worktree API 和变化面板基础，缺常驻 run environment card。 |
| Permission / sandbox | `permissionProjection.ts`、`permissionEvents.ts`、`hitl-safety.md` | 有 permission.changed 投影，缺当前权限 chip、审批 reviewer、sandbox/network 状态的一屏表达。 |
| Model / reasoning | `InputbarModelExtra.tsx`、`ChatModelSelector.tsx`、`InputbarRuntimeStatusLine.tsx` | 有 model selector 和 reasoning effort 输入，缺和当前 run / turn override / agent profile 的状态闭环。 |
| Tool / runtime status | `AgentRuntimeStrip.tsx`、`ToolCallDisplayViewModel.ts`、`packages/agent-runtime-projection/src/toolEvents.ts` | 有工具过程和 runtime strip，缺右栏摘要、失败恢复、重试 / 下钻统一动作。 |
| Session restore | `sessions-performance.md`、`appServerReadModelClient.ts`、`appServerReadModelProjection.ts` | 已有 run-control-restore 正式 evidence 和真实 Electron session history fixture；缺运行中恢复、live run 深水位和控制闭环恢复。 |

## 4. 当前评分

| 评测项 | 当前分 | 判断 | 到 5 分还缺什么 |
| --- | ---: | --- | --- |
| 环境信息卡 | 2.5 | Git / worktree / runtime API 有基础，未形成 run-scoped card | 常驻展示 mode、cwd、branch、diffstat、dirty count、commit/push 状态、worktree id。 |
| Git diffstat / branch | 3.0 | `projectGit` 和 changes panel 已有 | 每次 turn 绑定 base ref、changed files、add/delete、review action 和 evidence。 |
| Plan checklist | 3.6 | plan / workflow steps 已在同一区域展示；`workflowSteps=[]` 时可从结构化 plan thread item 与 `todoItems` 恢复 completed / running / pending / failed 清单，并已有 restore evidence | 等待原因、source event id、plan 更新历史和运行中恢复证据。 |
| Subagent roster | 3.0 | projection 完整度较高 | 右栏 roster、agent role、status、result ref、切换 / resume / stop 控制。 |
| Sources slot | 2.8 | read model 有 sourceCount / evidence refs，restore evidence 已证明 `context_summary` / `evidence_summary` / search item 能恢复到同一区域 | source list、citation detail、used-by step/tool、可信度和缺来源状态。 |
| Objective / goal 控制 | 3.0 | objective 状态模型较清楚 | 底栏状态、pause/resume/complete、budget/time/token、goal-turn 绑定。 |
| Permission / sandbox chip | 2.7 | permission event 有投影，restore evidence 已证明 pending / resolved approval 摘要可恢复 | 统一显示权限 profile、sandbox、network、approval reviewer、真实 approve/reject 写回。 |
| Model / reasoning chip | 3.0 | selector 存在 | 当前 turn override、reasoning summary、service tier、agent profile、subagent profile 可追踪。 |
| Queue / steer follow-up | 2.5 | 输入框能继续对话 | 区分 queued input、steer running turn、new turn、目标续跑。 |
| Tool status 摘要 | 3.3 | 工具 UI 较强 | 右栏聚合当前 run tool counts、failed tools、rerun / inspect / copy。 |
| Split workspace / review lane | 2.5 | chat-canvas 架构有基础 | 同屏 diff / artifact / review / second thread lane 可切换并与 run 对齐。 |
| Copy / share / detail affordance | 2.8 | 消息和卡片有局部动作 | 每个 run object 的复制、打开证据、跳转 runtime event、导出。 |
| Restore / replay | 3.4 | session/evidence 基础存在，运行控制区计划清单已能从 thread plan item / todo items 恢复；`agent-workspace-run-control-restore.20260616-1255.json` 已证明 environment、目标、sources、subagents、diffstat、approval 和 output 恢复 | 运行中恢复、live run 深水位、event 下钻和 replay 跳转。 |

综合静态分：`3.5 / 5`。Lime 不是没有底层能力，问题已经从“缺统一控制面”收敛为“已有同一区域只读 run control surface，且恢复主链已经有正式证据，但控制闭环仍不完整”。这些事实源仍分散在 runtime strip、general workbench、coding panels、evidence panels 和输入栏里，不过现在已能在任务轨道里以单一只读 surface 方式收敛展示 environment / run / plan / goal / sources / participants / outputs；其中 plan 清单不再只依赖当前 `workflowSteps`，历史 plan thread item 和 `todoItems` 也能恢复到同一区域。本轮新增 `agent-workspace-run-control-restore.20260616-1255.json`，证明 deterministic UI 恢复态可恢复 environment、objective、plan、sources、subagents、diffstat、approval 和 output，真实 Electron session history fixture 也证明 current `agentSession/list/read/update` 的归档、恢复和重启 readback 链路。

本地历史导入只是一类 session restore / provenance 支持能力，不是 run rail 主线状态。`ConversationImportSourceProvenance` 仍进入 preview message/event、导入 runtime event payload、turn metadata 和 assistant delta；`ConversationImportFidelitySummary` 仍进入 session business object 与 turn metadata，用于导入预览、消息 timeline、只读工具 / 审批记录、`agentSession/read` 和 `evidence/export` 下钻。但 `imported-source` 不应再作为消息主线 banner、环境信息卡或运行控制面板独立状态卡出现，也不得把来源 thread id、rollout path、原始审批命令等内部细节投到普通 task rail 来源摘要。后续 Sources slot / Tool status / Plan detail 如果需要定位导入历史，只能从 current read model / evidence 读取结构化 provenance，不能重新读取 Codex rollout 或从 assistant 文本猜测来源。

## 5. 支持与完善路径

### 5.1 先定义单一投影对象

新增或收敛到一个前端 view model，而不是让多个组件各自推断：

```text
AgentRunControlSurfaceViewModel
  environment
    mode: local | worktree | cloud | remote
    cwd
    workspaceRoot
    branch
    worktreeId
    dirtyFileCount
    additions / deletions
    commitPushState
  run
    sessionId / threadId / turnId / runId
    status
    elapsed
    tokenBudget / tokensUsed
    objective
    objectiveStatus
  plan
    steps[]
    explanation
    sourceEventId
  participants
    subagents[]
    reviewer
    activeOwner
  provenance
    sources[]
    artifactRefs[]
    evidenceRefs[]
    sourceProvenance[]  # 仅用于下钻 / evidence，不作为导入主线状态卡
    fidelitySummary     # 仅用于下钻 / evidence，不作为导入主线状态卡
  controls
    permissionProfile
    sandboxProfile
    approvalReviewer
    model
    reasoningEffort
    serviceTier
    canPause / canResume / canSteer / canCommit / canPush
  diagnostics
    toolCounts
    failedTools
    knownGaps[]
```

原则：UI 只消费 runtime / API facts，不解析 assistant 文本，不把 “assistant 说完成了” 当完成态。

### 5.2 再分层落 UI

| UI 层 | 要补的能力 | 复用点 |
| --- | --- | --- |
| Top project bar | root、thread mode、layout、review / plugin / agent chips | `WorkspaceMainArea`、现有 task center toolbar |
| Right run rail | environment、progress、subagents、sources、tools、artifacts/evidence | `GeneralWorkbenchSidebar` 可抽新 tab 或新 sibling rail |
| Bottom run composer | goal 状态、follow-up / steer、permission、model、reasoning、send | canonical `ThreadGoalPanel` / `threadGoalClient`、`InputbarModelExtra`、permission projection |
| Split review lane | diff、artifact、evidence、second thread / review | chat-canvas、changes panel、artifact/evidence view |
| Restore layer | thread/read 后还原右栏状态 | `appServerReadModelProjection`、`agent-runtime-projection` |

### 5.3 最小可交付切法

| 阶段 | 目标 | 不做什么 |
| --- | --- | --- |
| P0 | 一个只读 run rail：环境、plan、subagents、sources、目标、权限、模型 | 不先做 commit/push 和复杂重排 |
| P1 | 底栏控制闭环：pause/resume/continue/steer、permission/model override | 不先做完整 team board |
| P2 | Git / review lane：diffstat、file changes、commit/push/PR、review comments | 不把 Git 操作绕到 legacy host |
| P3 | Evidence / replay：每个 run object 能跳 runtime event / evidence pack | 不做不可复现的手工截图评分 |

## 6. P0 评测场景

| 场景 | 输入 | 必须通过 | 失败分类 |
| --- | --- | --- | --- |
| `run-control-basic-local` | 本地项目问一个需要读文件的小任务 | 右栏显示 local、cwd/root、thread/turn、running/completed、耗时 | environment-missing |
| `run-control-plan-checklist` | 要求分 4 步执行并更新计划 | checklist 有 4 个 step，状态随 runtime 更新，恢复后不丢 | plan-text-only |
| `run-control-git-diffstat` | 修改 1 个小文件 | 右栏显示 branch、changed file count、add/delete，diff lane 可打开 | git-not-bound |
| `run-control-paused-goal` | 设定目标后暂停 | 底栏显示 paused objective，可 resume/continue，run id 不变 | goal-detached |
| `run-control-permission-chip` | 触发需要审批的命令或 MCP 工具 | chip 显示权限档位，审批卡可 approve/reject，结果回写 runtime | approval-hidden |
| `run-control-model-reasoning` | 切换模型和 reasoning effort 后发起 turn | chip 与 runtime metadata 一致，恢复后仍可见 | model-ui-only |
| `run-control-subagent-roster` | spawn 一个子任务 | 右栏显示子智能体名称 / role / status / result ref | subagent-mixed-message |
| `run-control-sources-slot` | 用 web search 或文档来源回答 | Sources slot 列出来源，最终回答引用与 runtime source 对齐 | source-final-only |
| `run-control-tool-summary` | 连续使用 3 个工具，其中 1 个失败 | 右栏聚合工具数、失败工具、可下钻 toolCallId | tool-log-only |
| `run-control-restore` | 完成后关闭 / 切换 / resume | 环境、plan、目标、sources、subagents、diffstat、approval、output 均恢复 | pass-local-evidence |
| `run-control-split-review` | 修改代码后打开审查 lane | 同屏看到主对话与 diff/review，评论或 follow-up 能回到同一 thread | split-detached |

每个场景必须保存：

| 证据 | 要求 |
| --- | --- |
| Prompt | 用户输入、模型、reasoning、权限档位、workspace root |
| Runtime transcript | session/thread/turn/run id、events、toolCallId、status |
| UI evidence | Playwright screenshot 或 GUI smoke snapshot，标明右栏 / 底栏 / split lane |
| Artifact / evidence | diff、artifact refs、evidence pack refs、source refs |
| Verdict | pass / fail / blocked，失败分类和下一刀 |

## 7. 评分规则

| 分数 | 判定 |
| --- | --- |
| 0 | 无 run control surface，只有聊天 |
| 1 | 有静态 UI 草图或文本文案，但无 runtime facts |
| 2 | 有局部事实源或局部 chip，无法覆盖完整 run |
| 3 | P0 只读 run rail 可用，plan / goal / env / source / subagent 可恢复 |
| 4 | 控制闭环可用，permission/model/goal/steer/diff 下钻稳定，有 GUI evidence |
| 5 | 可作为桌面 Plugin 标准能力：跨 local/worktree/cloud、subagent、MCP、Skills、artifact/evidence 全部可观察、可控制、可回放 |

## 8. 失败模式

| 失败 | 为什么阻断 |
| --- | --- |
| 右栏数据来自解析 assistant Markdown | 状态不可审计，恢复后必然漂移 |
| plan 只显示最终计划 | 用户无法判断 run 卡在哪一步 |
| Git diff 与 turn 没有 base ref 绑定 | 用户无法确认这次 agent 改了什么 |
| 权限模式藏在设置页 | 用户无法在关键动作前理解风险 |
| subagent 只作为聊天文本出现 | 多 agent 协作不可追踪，无法停止 / resume |
| source 只在最终答案里出现 | 搜索 / browser / MCP 过程不可复核 |
| bottom composer 不能区分 steer 和 new turn | 长任务续跑会污染上下文或开错线程 |
| session restore 后右栏为空 | 桌面 App 的长期任务体验不成立 |

## 9. 下一刀

下一刀转向 `run-control-split-review` 或 `run-control-permission-chip` 的真实控制闭环。`run-control-basic-local`、`run-control-plan-checklist` 与 `run-control-restore` 已经有本地 pass evidence：同一区域可见 environment / run / plan / goal / sources / participants / outputs，恢复态能从 `threadRead`、`threadItems`、`todoItems`、canonical child Thread family / `CanonicalChildThreadSummary[]` 和 approval facts 重建。后续不要继续只补只读展示，应证明 pause / steer / approval writeback / split review 这些动作能回写 runtime 并恢复。
