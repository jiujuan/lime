# Agent Workspace 评测 Harness 评分卡

> 当前静态分：`3.3 / 5`
> 目标：把 Agent Workspace 评测从主观打分变成可重复执行的 task / trial / grader / transcript / evidence 流水线。

## 1. 5 分标准

| 能力 | 5 分要求 |
| --- | --- |
| Task manifest | 每个场景有输入、环境、期望 outcome、失败模式 |
| Trial | 支持多次运行并统计 pass@k / pass^k |
| Grader | 代码评分器、模型评分器、人工评分器分层 |
| Transcript | 保存 runtime events、tool calls、UI facts、console/network |
| Evidence Pack | 输出 schema 化本地 evidence，可被人工复核；发布级自动复核再接 qcloop |
| Benchmark bridge | 可接入 SWE-bench、Terminal-Bench、WebArena / OSWorld mini 子集 |

## 2. 当前证据

| 证据 | 判断 |
| --- | --- |
| `internal/test/agent-evaluation.md` | 已有 task/trial/grader/transcript/outcome 概念 |
| `internal/tests/lime-agent-autonomous-test-execution-matrix.md` | P0 场景、owner gate、Evidence Pack、release 判定完整 |
| agent-qc / qcloop scripts | 自动化执行资产较强，但当前 Agent Workspace 落地先不用 qcloop，避免 token 成本过高 |
| `local-eval-manifest.json` | Agent Workspace 11 个 P0 场景的本地轻量 manifest |
| `evidence-template.json` | 单场景本地 evidence 模板，先用于人工 / 脚本化低 token 证据 |
| `evidence/README.md` | 本地 evidence 执行规范，明确命名、执行顺序、pass / fail / blocked 判定 |
| `evidence/agent-workspace-basic-streaming.20260616-0807.json` | Batch 1 streaming 场景正式 evidence；`pass`，可计入正式分 |
| `evidence/agent-workspace-run-control-surface.20260616-0807.json` | Batch 1 run control surface 正式 evidence；`pass`，可计入 run-observability 的本地正式证据 |
| `evidence/agent-workspace-run-control-restore.20260616-1255.json` | Batch 1 run control restore 正式 evidence；`pass`，证明恢复态同一区域可恢复 environment / plan / goal / sources / subagents / diffstat / approval / output，并有真实 Electron session history fixture |
| `evidence/agent-workspace-session-restore.20260617-1559.json` | Session restore 场景导入恢复专项正式 evidence；`pass`，证明本地历史导入会话可恢复消息 / 工具细节并同会话续聊，且不会把导入支持能力展示成 Workspace 主线状态卡 |
| AgentUI conformance fixtures | 可作为 UI projection 标准样本 |
| 公开 benchmark | SWE-bench、Terminal-Bench、WebArena、OSWorld 可作为外部能力映射 |

## 3. 评分维度

| 评测项 | 当前分 | 必须补证 |
| --- | ---: | --- |
| Task manifest | 3.5 | 把本文 P0 转成机器 manifest |
| Grader 分层 | 3.5 | outcome 用代码评分器优先 |
| GUI evidence | 3.0 | 截图、snapshot、console、network |
| Runtime transcript | 3.5 | thread/turn/tool/action/artifact/evidence events |
| Evidence Pack schema | 4.0 | 本地 evidence 模板先跑通；发布级自动复核再接 qcloop 官方 evidence |
| External benchmark mini | 1.5 | 接入至少一个 coding/browser/terminal mini |
| Trend / regression | 2.5 | pass rate 趋势和失败归档 |

## 4. P0 Manifest 建议

| 场景 | 领域 | Grader |
| --- | --- | --- |
| `agent-workspace-basic-streaming` | streaming | 代码评分器 + GUI 断言 |
| `agent-workspace-tool-call` | tools | 代码评分器 |
| `agent-workspace-skill-system` | skills | 触发 / gate / artifact evidence 断言 |
| `agent-workspace-mcp-system` | mcp | server / tool / resource / auth 断言 |
| `agent-workspace-run-control-surface` | run-observability | 环境、progress、goal、permission、model、sources、subagents GUI 断言 |
| `agent-workspace-run-control-restore` | run-observability / session | thread/read 或 resume 后 environment、plan、goal、sources、subagents、diffstat、approval、output 恢复断言 |
| `agent-workspace-coding-small-fix` | coding | 代码评分器 + 人工复核 |
| `agent-workspace-search-grounded-answer` | search | 引用校验 + 模型评分器 |
| `agent-workspace-browser-task` | browser | GUI 断言 + transcript |
| `agent-workspace-hitl-approval` | hitl | 代码评分器 |
| `agent-workspace-artifact-delivery` | artifact | GUI 断言 |
| `agent-workspace-session-restore` | session | 代码评分器 + GUI 断言 |

## 5. Evidence 最小字段

| 字段 | 要求 |
| --- | --- |
| `scenarioId` | 稳定场景 id |
| `prompt` | 用户输入和运行配置 |
| `sessionId/threadId/turnId/runId` | 至少能定位一次运行 |
| `uiEvidence` | screenshot / snapshot / visible text / data-testid |
| `runtimeTranscript` | run/text/reasoning/tool/action/artifact/evidence events |
| `artifacts` | 文件、diff、report、export refs |
| `verdict` | pass / fail / blocked |
| `failureClass` | product / environment / evidence / concurrency / release |

## 6. 失败模式

| 失败 | 阻断原因 |
| --- | --- |
| 只有截图没有 runtime transcript | UI 可见但事实源不可证 |
| 只有命令 exit code 没有 GUI evidence | 不能证明桌面产品可交付 |
| 只用 LLM judge | 确定性 outcome 不稳定 |
| partial sidecar pass 覆盖 official evidence | release gate 失真 |
| 默认启用 qcloop | token 成本过高，早期会拖慢产品缺口定位 |

## 7. 下一刀

先不用 qcloop。`local-eval-manifest.json`、`evidence-template.json` 和 `evidence/README.md` 已作为本地轻量入口；Batch 1 现在已有三份正式 pass evidence：`agent-workspace-basic-streaming`、`agent-workspace-run-control-surface` 与 `agent-workspace-run-control-restore`，并补了一份 `agent-workspace-session-restore` 导入恢复专项 evidence。下一刀不再继续补只读 run rail 或导入展示样例，而是转向 `agent-workspace-tool-call`、`agent-workspace-hitl-approval`、`run-control-split-review` 或 `run-control-permission-chip`，证明工具生命周期、approval writeback、pause / steer 和 split review 这类动作能回写 runtime 并恢复。
