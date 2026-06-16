# Agent Workspace Composer / 输入控制评分卡

> 当前静态分：`2.8 / 5`  
> 目标：验证用户在发起任务前是否能明确控制上下文、模型、权限、预算和后续输入意图。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Slash command | `/` 命令映射 skill / command / task contract，带预检和失败提示 |
| Mention / context chips | 文件、目录、网页、artifact、session、workspace 都是结构化 context |
| 附件 | 图片、文件、粘贴内容有类型、大小、来源和可移除状态 |
| 模型与推理 | model、reasoning effort、provider / service tier 可见且写入 turn config |
| 权限与模式 | plan / act / sandbox / write / browser 等权限显式可见 |
| Queue vs steer | 运行中能选择排队下一轮或注入当前 turn，并可撤销 |
| Draft / history | 切线程、刷新、中断不丢 draft，支持历史检索 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| CodexMonitor README | 支持附件、queue vs steer、skills/prompts/review/file autocomplete、model、reasoning、access、context usage ring |
| Codex app-server `turn/start` / `turn/steer` | queue 和 steer 在协议层应区别对待 |
| AgentUI `queue-and-steer` 与 `composer` surface | Composer 是 task intent 和控制面，不只是 textarea |
| Lime 当前 `agentStreamSlashSkillPreflight`、builtin commands、input-kit adapter | Slash / Skill 基础存在 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Slash command | 3.5 | `/` 到 skill/task 的 runtime transcript |
| File / workspace mention | 2.5 | context chip 被注入 request，而不只是 UI 文本 |
| Model / provider selector | 2.5 | turn config 中可见模型和 reasoning |
| Permission chips | 2.5 | sandbox / approval policy 写入 runtime |
| Queue vs steer | 2.0 | 运行中 follow-up 可选 queue / steer，且 UI 可编辑/取消 |
| Draft recovery | 2.5 | 切换 session 后 draft 不丢 |
| Attachment handling | 2.5 | 图片/文件进入 structured input，超限可见 |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `composer-slash-skill` | 用 slash 触发一个 skill | preflight、turn request、invoked skill 三方一致 |
| `composer-file-mention` | `@` 引用文件后提问 | runtime context 中包含结构化文件引用 |
| `composer-queue-steer` | turn 运行中发送 follow-up | queue 和 steer 行为、UI 状态、runtime event 可区分 |
| `composer-permission-mode` | 切换 sandbox / approval | turn config 与 UI chip 一致 |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| Chip 只是文案，没有进入 runtime request | 用户以为给了上下文，模型实际没有 |
| Queue / steer 混用 | 运行中补充输入可能污染当前 turn 或丢失下一轮 |
| 权限 selector 不写入 runtime | 安全 UI 是假的 |
| Draft 切换丢失 | 高频桌面工作台不可用 |

## 6. 下一刀

先补 `composer-queue-steer` 的 UI / runtime 双证据，因为它直接决定 Agent Workspace 是否像真实 Agent 工作台，而不是普通聊天框。
