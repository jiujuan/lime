# Agent Workspace Session / 性能 / 恢复评分卡

> 当前静态分：`3.2 / 5`  
> 目标：验证 Agent Workspace 是否能长期承载多 workspace、多 thread、长历史、运行中恢复和后台任务。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Thread restore | thread/read 或 thread/resume 后恢复消息、状态、工具和 evidence |
| Progressive hydration | shell / summary 先出现，timeline/tool/artifact 按需加载 |
| Workspace / tabs | workspace tabs、conversation tabs、运行中/未读/待输入状态清晰 |
| Long history | 长历史窗口化，不因 timeline/tool output 卡顿 |
| Performance metrics | submit-to-status、TTFT、paint latency、delta backlog 可采集 |
| Recovery | 断流、刷新、中断、进程重启后状态可解释 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| Codex app-server thread APIs | start/resume/fork/read/list/status 是成熟参考 |
| CodexMonitor README | workspace/thread 管理、running/unread、draft、interrupt、remote backend |
| Lime Agent Workspace rebuild plan | workspace tabs / conversation tabs 有产品方向 |
| Lime MessageList 长历史窗口 / session hydrate 相关测试 | 前端性能有基础 |
| AgentUI session hydration | shell first、recent messages、timeline/tool/artifact 按需加载是标准 |
| `evidence/agent-workspace-run-control-restore.20260616-1255.json` | 已证明恢复态同一区域可恢复 environment、plan、goal、sources、subagents、diffstat、approval、output；真实 Electron session history fixture 证明 current `agentSession/list/read/update` archive/readback/unarchive/readback |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Session restore | 3.4 | 运行中恢复、live run 深水位和恢复后控制动作 |
| Progressive hydration | 3.0 | 首屏不等全量 timeline |
| Workspace / conversation tabs | 2.5 | Agent Workspace 专属 shell 实现实测 |
| Draft persistence | 2.5 | per-thread draft 恢复 |
| TTFT / paint metrics | 3.5 | metrics 写入 evidence |
| Long history performance | 3.0 | 100+ items 下不卡顿 |
| Recovery classification | 2.7 | failed/interrupted/cancelled/retrying 区分 |

## 4. P0 实测场景

| 场景 | 输入 | 必须通过 |
| --- | --- | --- |
| `session-restore-completed` | 完成任务后重开 | 消息、artifact、evidence 恢复 |
| `session-restore-running` | 运行中切换回来 | running / interrupted / completed 状态正确 |
| `long-history-window` | 注入长历史 | 首屏可用，timeline 懒加载 |
| `draft-recovery` | 输入未发送草稿后切换 | draft 不丢 |

## 5. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| 旧 session 必须全量 hydrate 才能打开 | 长期使用不可接受 |
| running 状态丢失 | 多任务桌面产品不可用 |
| draft 丢失 | 高频输入体验差 |
| failed / cancelled / interrupted 混淆 | 用户无法判断下一步 |

## 6. 下一刀

把 `session-restore-running` 做成专项 smoke，覆盖运行中切换回来后的 running / interrupted / completed 分类、右侧运行控制区和继续输入状态。

跨域要求：`run-observability.md` 的右栏 / 底栏状态也必须纳入 session restore；只恢复消息列表不算桌面工作台恢复完成。`session-restore-completed` 的基础链路已由 `agent-workspace-run-control-restore.20260616-1255.json` 覆盖，后续重点转向运行中恢复和长历史性能。
