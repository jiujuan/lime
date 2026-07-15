# Project / Thread-first 产品架构路线图

> 状态：current planning source
> 更新时间：2026-07-15
> 主目标：完全对标 Codex 的 `Project / Thread / Turn / Item` 判断，把 Lime 的专家、Skills、插件、子代理、浏览器、自动化等能力都收敛为当前项目和当前对话里的执行能力，避免 Yi-One 早期 `Agent-first` 造成的上下文断流、记忆分裂和会话孤岛。

## 1. 本路线图回答什么

本目录只回答一件事：

**Lime 的产品分类应该先按“在做什么”组织，而不是先按“谁来做”组织。**

它不替代：

1. `internal/roadmap/thread/README.md` 的 live timeline / session refresh 治理。
2. `internal/roadmap/memory/README.md` 的文件化 memory store 主线。
3. `internal/roadmap/agent-workspace/README.md` 的 Agent Workspace 评测路线图。
4. `internal/roadmap/zuanjia/` 的专家能力专项。

本路线图负责把这些专项统一到一个产品判断：

```text
Project / Workspace
  -> Thread / Session
    -> Turn / Item
      -> Expert / Agent / Skill / Tool / Plugin / Browser / Workflow
```

## 1.1 文档分工

| 文档                     | 作用                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| [prd.md](./prd.md)       | 产品背景、目标收益、用户故事、用例、架构图、时序图、流程图和验收指标。 |
| [README.md](./README.md) | 路线图入口，固定 current / compat / deprecated / dead 分类和实施阶段。 |

## 2. 背景判断

Yi-One 早期问题不是“多 Agent 错了”，而是把 Agent 放成第一分类：

1. 用户先选 Agent，再创建 Session。
2. 不同 Agent 的 Session 互不认识。
3. 记忆跟 Agent 绑定，越加 Agent 越碎。
4. 用户真实任务按项目推进，但产品按角色切割。

Codex 的关键判断是相反的：

1. Thread 是连续性的主体。
2. Turn / Item 是执行和渲染的事实单元。
3. Agent / tool / profile 只在 Thread 内工作。
4. “谁来做”必须晚于“在做什么”。

Lime 当前主链没有完全踩 Yi-One 的坑：`agentSession` 协议和 memory store 已经更接近 Codex；但专家、Skills、插件、浏览器和自动化入口如果继续各自拥有会话、历史或记忆，就会重新长出同类问题。

## 3. 事实源声明

后续 Lime 产品主线只允许向这条事实源收敛：

> Project / Workspace 是上下文和记忆的第一作用域；Thread / Session 是用户任务连续性的第一实体；Turn / Item 是执行、渲染、证据和恢复的最小事实单元；Expert / Agent / Skill / Tool / Plugin / Browser / Workflow 只能作为当前 Thread 内的能力、角色、工具或执行环境。

固定规则：

1. 新增能力不得要求用户先选 Agent / Expert / Skill / Plugin 才能拥有上下文。
2. 任何能力入口新建会话时，必须表达为“在当前 Project 下新建 Thread”。
3. 切换 Expert / Agent / Skill 不得丢失当前 Thread context。
4. 长期记忆只能按 workspace / global 组织，不得按 Agent / Expert 组织。
5. `businessObjectRef.metadata` 可以记录专家、插件、工作流等业务来源，但不能成为 Thread 之上的主索引。
6. 旁路系统的历史、证据、审计、搜索、恢复必须能回到 session / thread / turn / item。

## 4. 当前分类

| Surface                                                     | 分类         | 判断                                                                                                                                                   |
| ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App Server `agentSession/start/read/turn/start`             | `current`    | 会话协议以 `sessionId / threadId / workspaceId / businessObjectRef` 为核心，继续作为主链。                                                             |
| workspace scoped memory store                               | `current`    | 默认读取 workspace memory，缺 workspace 才退到 global，符合 Project-first。                                                                            |
| Thread timeline / runtime event / read model                | `current`    | active timeline 写入权已向 runtime event / thread store 收敛。                                                                                         |
| 顶层“新建任务”入口                                          | `current`    | 用户先进入任务 / 对话，符合 Thread-first。                                                                                                             |
| `businessObjectRef.metadata.expert` / `harness.expert`      | `current`    | 可以作为当前 session 的业务元数据、提示上下文和 UI 展示来源。                                                                                          |
| `harness.expert_role_switch`                                | `current`    | 当前 Thread 内专家 profile 切换的 metadata fact，已投影为 App Server runtime event、thread item 与 evidence。                                          |
| 专家广场                                                    | `compat`     | 可以保留为能力发现和模板库，但不得成为默认工作流第一分类。                                                                                             |
| 专家实例 skill override 配置                                | `current`    | 只作为 project scoped profile 配置，不保存最近会话。                                                                                                   |
| Skills 工作台                                               | `compat`     | 作为能力管理是合理的；运行时必须注入当前 Thread，不得创建 Skill 私有会话体系。                                                                         |
| `workspace_skill_runtime_enable`                            | `current`    | Skills 工作台试运行 workspace skill 时，只允许使用 current project 解析 workspace root，并通过 Agent current turn metadata 注入，不自动创建默认项目。  |
| 插件 / App Center                                           | `compat`     | 插件可以有独立 UI，但 Agent 任务必须绑定 current session / thread / evidence。                                                                         |
| 插件 `lime.agent.startTask` App Server runtime host         | `current`    | 只允许显式 `workspaceId/projectId/sessionId` 驱动；缺 Project/Thread workspace 时 fail closed，不再自动创建默认项目。                                  |
| 插件 `agent-runtime/tasks/` 本地 task 投影缓存              | `compat`     | 只用于刷新后恢复 task projection；长期事实源仍必须回到 App Server session/thread/turn/evidence。                                                       |
| canonical SubAgent Thread family / AgentGraph projection    | `current`    | `Thread.parentThreadId / agentState`、durable identity 与 `CanonicalChildThreadSummary[]` 回到 parent Thread 的 timeline、SubAgent GUI 和 projection。  |
| AgentControl graph / identity / mailbox                     | `current`    | `spawn_agent`、`list_agents`、`send_message`、`followup_task`、`interrupt_agent`、`wait_agent` 是唯一 Multi-Agent 工具面。                              |
| Evidence Pack canonical Multi-Agent facts                   | `current`    | `evidence/export` 只汇总 AgentControl、AgentGraph、mailbox、child lifecycle 与 canonical Thread/Turn/Item 的结构化事实。                                |
| child session roster / parent-session 产品 identity         | `dead`       | Multi-Agent 产品 identity 只认 canonical Thread / AgentGraph；session 只可作为内部 transport identity，不得恢复旧 roster owner。                       |
| external `multi-agent-team` synthetic events                | `dead`       | 伪造 `team.changed`、`task.changed`、`agent.completed`、`worker.notification` 的 backend scenario 已退役，不得作为 current Electron evidence；remote task 的真实结构化通知不受此分类影响。 |
| Browser profile / runtime session                           | `compat`     | 只能是工具运行环境或 right surface，不得成为用户任务第一分类。                                                                                         |
| Automation / workflow job                                   | `compat`     | 可以后台运行，但输出、证据和继续动作必须回到 Project / Thread。                                                                                        |
| Thread 内 service skill automation draft                    | `current`    | 从 Agent Workspace 当前 Thread 里创建 workflow job；创建前必须物化 session/thread，并把 `session_id / thread_id` 写入 `agent_turn` payload。           |
| Automation 顶层页无 Thread lineage 的创建入口               | `dead`       | 顶层 Automation 页只能管理/查看；没有 current session/thread 时不得创建可运行 job。                                                                    |
| 专家入口硬编码默认项目                                      | `deprecated` | 会弱化真实项目上下文，应迁到当前 project 或显式选择。                                                                                                  |
| `expertAgentInstances.latestSessionId` / `resume_or_create` | `dead`       | 会把专家恢复成 Thread 之上的稳定会话，已禁止恢复。                                                                                                     |
| Skills 工作台自动 `getOrCreateDefaultProject`               | `dead`       | 会把 Skill 管理页变成默认项目孤岛；已改为无 current project 时不读取 workspace binding、不发起运行。                                                   |
| 插件 Agent task 自动 `getOrCreateDefaultProject`            | `dead`       | 会把插件运行页变成默认项目孤岛；已改为调用方必须显式传入 current project/workspace。                                                                   |
| 每 Agent / Expert 独立长期记忆                              | `dead`       | 不允许新增、恢复或包装成兼容层。                                                                                                                       |
| “先选 Agent，再创建项目 / Session”的默认流程                | `dead`       | 与 Codex 对齐目标冲突。                                                                                                                                |

## 5. 产品原则

### 5.1 Project-first

用户打开 Lime 时，首要问题是：

```text
我正在做哪个项目 / 任务？
```

不是：

```text
我要找哪个 Agent？
```

项目承载：

1. workspace root。
2. 文件和 artifact。
3. 项目资料。
4. workspace memory。
5. session 列表和 evidence。
6. automation / workflow 输出归属。

### 5.2 Thread-first

Thread / Session 承载连续上下文：

1. 历史消息。
2. runtime events。
3. tool calls。
4. role switch / handoff。
5. artifact refs。
6. evidence / replay / review。

Expert / Agent 只能影响下一轮 turn 的执行方式，不能切断这条连续性。

### 5.3 Agent-as-capability

Agent / Expert / Skill / Plugin 的正确位置是：

```text
当前 Thread 的能力选择器 / 执行 profile / 工具箱
```

而不是：

```text
一组彼此隔离的入口应用
```

多 Agent 的价值在于：

1. 分工。
2. durable message / followup。
3. interrupt / wait。
4. terminal Result 与 review lane。
5. 工具和策略选择。

不是在首页堆角色卡。

## 6. 设计约束

### 6.1 导航约束

1. 顶层导航可以保留“专家 / Skills / 插件”，但这些页面只能作为管理、发现和模板配置入口。
2. 顶层主工作入口必须继续是新建任务 / 当前项目 / 当前对话。
3. 从专家、Skill、插件进入运行时，必须落回 `agent` page 的 current session / thread 主链。
4. 入口文案避免暗示“专家拥有自己的世界”；应表达为“用此专家处理当前项目 / 当前对话”。

### 6.2 数据约束

1. 不新增 `agent_id / expert_id` 作为 session 或 memory 的一等索引。
2. 专家、Skill、插件来源只进 `businessObjectRef.metadata`、runtime metadata、thread item metadata 或 evidence metadata。
3. 不保存或同步专家 `latestSessionId`，旧缓存 / 云端响应中的该字段读取时丢弃。
4. workspace memory root 只能由 workspace root / global 决定。

### 6.3 运行时约束

1. 切换专家或 Skill 只能生成 role switch / profile change / tool enable 等 thread facts。
2. 子代理必须有 parent session / parent turn lineage。
3. 插件 Agent 任务必须复用 `agentSession/start`、`agentSession/turn/start`、`agentSession/read` 和 evidence/export 主链。
4. 自动化任务输出必须显式绑定 session / thread / evidence ref，不能只留在 job 私有历史，也不能用 job id 自动拼出私有 session / thread；没有 current Thread lineage 的顶层页面不得创建 job。

### 6.4 记忆约束

1. 默认注入只读 `memory_summary.md`。
2. 按需读取只走 memory tools。
3. 专家 persona / Soul / artifact voice 是 prompt context，不是长期记忆副本。
4. 任何“专家记忆模板”只能作为当前 turn 的 profile context 或待整理建议，不得直接写入长期记忆。

## 7. 实施阶段

### P0：封 Agent-first 回流

目标：先用守卫和文案锁住架构方向。

工作项：

1. 为 session schema / repository / memory store 补治理断言，防止新增 Agent-first 主索引。
2. 为专家入口补测试，证明专家信息只写 metadata，不创建专家专属 memory root。
3. 梳理顶层导航文案，避免“专家 Agent 是独立工作空间”的表达。

退出条件：

1. `npm run test:contracts` 不出现 Agent-first 新命令或 mock fallback。
2. 定向测试能证明专家、Skill、插件运行时都回到 current session 主链。

### P1：专家入口 Thread 化

目标：专家从“稳定 Agent 会话”改为“当前项目 / 当前 Thread 的 profile 模板”。

工作项：

1. 专家启动不再硬编码默认项目，优先使用当前 project / workspace。
2. 删除 `resume_or_create` / `latestSessionId` 稳定专家会话恢复链。
3. 当前 Thread 内提供专家切换入口，切换只影响下一 turn metadata。

退出条件：

1. 从专家广场进入不会丢项目上下文。
2. 同一 Thread 内可切换专家并保留上下文。
3. Thread read model 能展示 role switch / expert profile facts。

### P2：Skills / 插件 / Browser / Automation 入口 Thread 化

目标：所有能力入口都回到当前 Thread。

工作项：

1. Skills 从“运行入口”收敛为 tool / context / workflow 能力注入；无 current project 时不自动创建默认项目。
2. 插件 Agent task 默认绑定已有 session；没有 session 但有当前 project 时创建 project-scoped Thread，缺 project 时 fail closed。
3. Browser profile 只作为 execution environment，不再暗示独立任务容器。
4. Automation / workflow job 只能从 current Thread lineage 创建或绑定；顶层管理页缺 lineage 时不得创建可运行 job。
5. Right Surface 操作都能回写 current thread item / artifact / evidence。

退出条件：

1. 插件和 Skills 任务可从 Evidence Pack 追溯到 session/thread/turn。
2. Browser runtime 操作轨迹能回到当前 Thread。

### P3：多 Agent 团队执行层收口

目标：多 Agent 成为 Codex 式执行层，而不是产品第一层。

工作项：

1. canonical child Thread family 与 AgentGraph roster 统一挂在 parent Thread。
2. 六个 AgentControl 工具只读写 durable graph / identity / mailbox 与 canonical Thread/Turn/Item。
3. GUI 中 SubAgent activity、terminal Result 和 review lane 进入运行控制区与 evidence 层，不抢占导航首层。

退出条件：

1. `agent-control-tools` current Gate B 证明六工具、durable child/tree/mailbox/terminal Result 与 Evidence Pack 闭环。
2. 没有独立的“子 Agent 会话历史列表”绕开 parent thread。
3. 已完成 canonical Thread family 恢复：`thread/list|read` join AgentGraph/identity 后生成 `CanonicalChildThreadSummary[]`，同构 Agent UI SubAgent projection 绑定 parent thread、child thread/session 与来源 turn item。
4. 完整 visible-DOM + cold restart GUI 证据证明 roster、activity、interrupt 与 wait terminal Result 可见且可恢复。

## 8. P0 回归场景

| 场景 id                                      | 输入 / 触发                       | 必须证明                                                                        |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `projectthread-expert-start-current-project` | 从专家入口启动任务                | session 绑定当前 project/workspace，不落默认项目孤岛。                          |
| `projectthread-expert-switch-same-thread`    | 同一对话内切换专家                | 不新建 session、不丢消息、不新建记忆 root。                                     |
| `projectthread-skill-run-current-thread`     | 从 Skill 触发运行                 | 运行事实进入当前 thread items / evidence；无 current project 时不创建默认项目。 |
| `projectthread-plugin-agent-current-session` | 插件发起 Agent 任务               | 必须携带或创建 current project scoped session。                                 |
| `projectthread-subagent-lineage`             | 触发子代理分工                    | child session 有 parent session / turn lineage。                                |
| `projectthread-workspace-memory-only`        | 专家 / Skill / 插件运行后读写记忆 | 只访问 workspace/global memory，不访问 agent scoped memory。                    |

## 9. 最小验证门禁

文档变更本身不需要运行产品测试。代码实施后的最小验证顺序：

```bash
npm run test:related -- src/components/experts/ExpertPlazaPage.tsx src/features/experts/expertAgentInstances.ts src/components/agent/chat/workspace/useWorkspaceExpertAgentLaunchSyncRuntime.ts
npm run test:contracts
```

若改动触及 GUI 主路径或真实运行流：

```bash
npm run verify:gui-smoke
```

若改动触及 Rust App Server / memory / session schema：

```bash
npm run test:rust:related -- lime-rs/crates/app-server lime-rs/crates/core
```

## 10. 完成判定

| 层级     | 完成标准                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 文档完成 | 本路线图存在，且明确 Project / Thread-first 事实源、current / compat / deprecated / dead 分类和 P0 场景。 |
| P0 完成  | 守卫阻止 Agent-first schema、memory root、命令或 mock fallback 回流。                                     |
| P1 完成  | 专家入口不再制造项目孤岛，同一 Thread 内可切换专家 metadata，role switch 已进入 thread item / evidence。  |
| P2 完成  | Skills / 插件 / Browser / Automation 能力运行事实都回到 current Thread。Automation 已有 fixture Gate B 证据，Managed Objective completion audit 已闭环。 |
| P3 完成  | 多 Agent 团队能力只作为执行层事实出现，可见、可恢复、可导出。                                             |

## 11. 下一刀

P3-B 的六个 AgentControl 工具已通过真实 Electron managed Gate B；旧 external `multi-agent-team` fixture 只产生 synthetic Team events，已从 current evidence 退役。P2 的 Skills、插件、Browser right surface 和 Automation 真实入口也已各有 Gate B fixture 证据。Managed Objective completion audit 已由真实 workspace SkillTool invocation + artifact 产出打到 pass，下一刀不再围绕 Automation 补洞，应优先给 canonical SubAgent GUI 补完整 visible-DOM + cold restart 证据，或处理 `agent-runtime/tasks/` compat task projection cache 的长期事实源归属。

1. Automation：`npm run smoke:managed-objective-automation -- --timeout-ms 180000` 已通过 ProjectThread Gate B 和 Managed Objective completion audit；证据 `.lime/qc/managed-objective-automation-smoke.json` 显示 `status: "pass"`、`projectThreadStatus: "pass"`、`completionAuditStatus: "pass"`、latest run `status: "success"`、Evidence Pack `latestTurnStatus: "completed"`、`workspaceSkillToolCallCount: 1`、`artifactCount: 1`、`decision: "completed"`。
2. Browser：`right-surface-visual-matrix` 已通过 `npm run smoke:claw-chat-current-fixture -- --scenario right-surface-visual-matrix --timeout-ms 180000`；证据在 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`，五类 right surface 均通过 App Server pending -> toolbar -> right surface 打开，`pendingAfterClicks.count = 0`。
3. P3-B：`.lime/qc/s4ae-agent-control-tools-gate-b-final.json` 与 S2o3 rerun 均为 `pass`、15/15 assertions，六工具全部 completed；该 managed batch 未包含完整 visible-DOM 断言，因此运行主链已闭环，GUI 深水位证据仍待补。

这一步直接服务主线：P1 已封住专家 Agent-first 回流；P2 已完成 Skills、插件、Browser、Automation 的第一批入口收口、后端 evidence/export 证据、真实 fixture Gate B 和 Managed Objective audit 闭环；P3-A 已封住 canonical parent Thread lineage，P3-B 已由六工具、AgentGraph/identity/mailbox、canonical Thread/Turn/Item/SubAgent projection 证明运行事实能回到 parent Thread。剩余高杠杆问题集中在 canonical SubAgent visible-DOM/cold restart 与 compat task projection cache，不再是 synthetic Team scenario 或 Automation completion audit。
