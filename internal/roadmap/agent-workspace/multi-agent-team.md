# Agent Workspace Multi-agent / Team 评分卡

> 当前静态分：`3.0 / 5`  
> 目标：验证 Agent Workspace 是否能把 Codex 式 Multi-Agent 做成可观察、可控、可恢复、可审计的 GUI 协作系统。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| SubAgent lineage | canonical parent/child Thread、source Turn、spawn reason 可追踪 |
| Agent roster | AgentGraph 与 durable identity 提供 child path、task name、状态和 parent lineage |
| Delegation controls | `spawn_agent`、`list_agents`、`send_message`、`followup_task`、`interrupt_agent`、`wait_agent` 六个 current 工具有受控动作 |
| Mailbox / terminal result | QueueOnly / TriggerTurn mailbox 与 child terminal Result 可恢复，不把 activity completed 伪装成 child terminal |
| GUI projection | canonical Thread/Turn/Item/SubAgent activity 在 parent Thread 可见，cold/live 使用同一 Item identity |
| Review lane | reviewer verdict、requested changes、evidence refs 可见 |
| Agent policy | per-child permission、budget、sandbox、termination 控制 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| Codex `AgentControl`、AgentGraph、mailbox 与 canonical SubAgent Item | 六工具、parent-child edge、durable delivery、terminal Result 和 SubAgent activity 是 current 对齐基线 |
| Claude Code `pillLabel.ts` | 后台 task pill 应压缩展示，仅 needs_input / plan_ready 抢注意力 |
| `.lime/qc/s4ae-agent-control-tools-gate-b-final.json` | `status=pass`，六工具全部 completed，durable child、tree、mailbox、followup、interrupt、wait 和 Evidence Pack 断言 15/15 为真 |
| `.lime/qc/s2o3-s4ae-agent-control-tools-gate-b-rerun.json` | fresh rerun 同样 pass，证明跨 Turn provider Item identity 修复后六工具结果稳定 |
| S4al canonical cold-restart GUI evidence | 真实 Electron/App Server 关闭重启后，六 Tool、SubAgent activity 与 child Thread identity 前后稳定；Gate B 证明 `agentSession/read` / `thread/list`、visible DOM 和零错误 |
| 旧 external `multi-agent-team` scenario | `dead / deleted / forbidden-to-restore`；其伪造 `team.changed`、`task.changed`、`agent.completed`、`worker.notification` 不能作为 current Electron 证据 |

边界：`worker.notification` 这个事件类不是全局删除对象。remote task 等领域若由真实 durable structured source 产生 terminal notification，仍归各自 current owner；本评分卡只清退旧 Team external backend 的 synthetic 语义。

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Canonical SubAgent Thread model | 4.0 | parent/child Thread、source Turn、stable Item identity 已有 current owner，继续补完整 restart GUI 下钻 |
| AgentGraph / identity roster | 3.5 | durable tree 已通过 Gate B，继续补可见 DOM 与身份详情 |
| Delegation controls | 4.0 | 六个 AgentControl 工具已通过真实 managed Gate B；继续补用户可见按钮和状态反馈 |
| Mailbox / terminal result | 3.5 | QueueOnly / TriggerTurn、wait terminal Result 已有真实证据，继续补 GUI terminal detail |
| Canonical SubAgent GUI | 3.5 | 六工具 batch 已有完整 visible-DOM + cold restart Gate B；仍缺 reviewer lane、policy controls 和 terminal detail 深水位 |
| Review lane | 2.5 | review verdict 绑定 evidence |
| Agent policy | 2.5 | permission、budget、sandbox、termination 在 GUI 中可解释 |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `agent-control-tools` | 用户用自然语言要求主 Agent 委派并控制 child | 六工具均从 provider request 进入 current runtime；durable child/tree/mailbox/followup/interrupt/wait Result 与 Evidence Pack 全部成立 |
| `subagent-canonical-restore` | 创建 child、切换或重开 parent Thread | canonical child Thread family、activity Item、identity 与 mailbox/result 可恢复，不读 synthetic sidecar |
| `subagent-visible-control` | 在 GUI 查看和操作 child | roster、activity、target、running/interrupted 与 terminal Result 可见，操作反馈绑定真实 AgentControl call |
| `review-lane-basic` | 触发 reviewer | verdict、evidence refs、requested changes |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| subagent 输出混成 assistant final answer | 协作过程不可追踪 |
| parent/child Thread 或 source Turn identity 丢失 | 无法恢复和审计 |
| needs_input 不抢注意力 | 多 Agent 会静默卡住 |
| review verdict 无 evidence | 审查不可复核 |
| synthetic Team events 被计为 current Electron pass | 绕开 AgentControl、AgentGraph、mailbox 与 canonical GUI，形成第二套事实源 |

## 6. 下一刀

六工具 current runtime Gate B 已闭环，且 `s4al` 已证明真实 Electron/App Server 重启后 roster、activity、interrupt、wait terminal Result 与 child Thread identity 从 canonical Thread/Turn/Item/SubAgent projection 恢复。下一刀是按窄写集删除 `team_memory_shadow` 本地 shadow 链和无执行消费者的 `TeamDefinition/recent_team_selection` compat 岛；不恢复旧 `multi-agent-team` external scenario，也不扩独立 Team board。

跨域要求：`run-observability.md` 的 run rail 必须显示 canonical child roster 与 activity；仅有后端 AgentGraph 或消息内 summary 不等于 Codex 式 GUI 协作可观察。
