# Agent Workspace Multi-agent / Team 评分卡

> 当前静态分：`3.0 / 5`  
> 目标：验证 Agent Workspace 是否能把 subagent / teammate / team workbench 做成可观察、可控、可审计的协作系统。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Subagent lineage | parent/child session、thread、task、spawn reason 可追踪 |
| Team roster | teammate 身份、角色、状态、颜色/标签、权限可见 |
| Delegation controls | spawn、send、wait、resume、close、stop 有受控动作 |
| Worker notification | worker result 是内部通知，不伪装成用户消息 |
| Handoff lane | handoff reason、active owner、resume target 可见 |
| Review lane | reviewer verdict、requested changes、evidence refs 可见 |
| Team policy | per-teammate permission、budget、sandbox、termination 控制 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| AgentUI source-index 对 Codex / Claude team 研究 | team roster、worker notifications、handoff、review 是标准面 |
| Claude Code `pillLabel.ts` | 后台 task pill 应压缩展示，仅 needs_input / plan_ready 抢注意力 |
| Codex collaborative tools 线索 | spawn/send/resume/wait/close 是协作动作参考 |
| Lime subagent projection / team runtime docs | Lime 不是零基础，但 Agent App / Agent Workspace Host 表面仍需补 |
| `packages/agent-ui-contracts` subagents model | projection state 要包含完整 subagents 字段 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Subagent thread model | 3.5 | parent/child id 和 transcript ref 可查 |
| Team roster UI | 2.5 | teammate 身份和状态可见 |
| Delegation controls | 2.5 | spawn/send/wait/close runtime actions |
| Worker notifications | 3.0 | worker result 不污染 final prose |
| Handoff lane | 2.5 | handoff reason 和 resume target |
| Review lane | 2.5 | review verdict 绑定 evidence |
| Task capsule | 3.0 | running / needs_input / plan_ready 优先级 |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `subagent-spawn-basic` | 主 agent 委派一个子任务 | parent/child id、worker status、result ref |
| `team-needs-input` | 子 agent 需要用户输入 | capsule / roster 提示 needs_input |
| `worker-notification-summary` | worker 完成任务 | 通知归档，不伪装成人类消息 |
| `review-lane-basic` | 触发 reviewer | verdict、evidence refs、requested changes |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| subagent 输出混成 assistant final answer | 协作过程不可追踪 |
| parent/child id 丢失 | 无法恢复和审计 |
| needs_input 不抢注意力 | 多 Agent 会静默卡住 |
| review verdict 无 evidence | 审查不可复核 |

## 6. 下一刀

先做 `subagent-spawn-basic`，只要求 parent/child lineage、worker notification、result ref 三件事，不先扩完整 team board。

跨域要求：`run-observability.md` 的 run rail 必须能显示 subagent roster；仅有 subagent projection 或消息内 summary 不等于 Codex 式协作可观察。
