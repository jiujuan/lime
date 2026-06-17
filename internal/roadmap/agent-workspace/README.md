# Agent Workspace 评测路线图

> 状态：batch-1-plus-session-restore-evidence
> 更新时间：2026-06-17
> 目标：把 Agent Workspace 对齐 Codex App、Claude CoWork / Claude Code、AgentUI / AG-UI 的评测标准拆成可执行、可回归、可逐项补证的领域评分卡。

## 1. 使用方式

本目录不是 UI 设计稿；它是 **Agent Workspace 能力评测的事实入口和落地计划入口**。具体代码执行仍应按每一刀拆到 `internal/exec-plans/` 或对应实现 PR，但本文件负责定义测什么、怎么测、先补什么、何时更新分数。

阅读顺序：

1. 先读 `research-baseline.md`，确认评测依据来自哪里。
2. 再读本文的总览分数，明确当前静态判断。
3. 按领域进入具体评分卡，每张卡都可以独立转成 static audit / fixture / smoke / Playwright 证据场景；qcloop 仅作为未来发布门禁选项，不是当前默认执行路径。

评分使用 `0-5` 分：

| 分数 | 含义 |
| --- | --- |
| 0 | 无相关能力或未发现证据 |
| 1 | 只有规划、概念或零散草稿 |
| 2 | 有局部实现，但缺主链接入或缺测试 |
| 3 | MVP 可用，仍需要深水位体验或真实场景补证 |
| 4 | 较完整，有事实源、测试或 smoke 证据 |
| 5 | 可作为稳定标准能力或公开基准能力对外宣称 |

当前所有分数以静态审计为基线，并逐步由 GUI / runtime / fixture / smoke / Playwright 证据替换；qcloop 因 token 成本高，当前不作为默认测评手段。已经有正式本地 evidence 的场景在第 10 节单独列出。

## 2. 领域文件

| 文件 | 领域 | 当前静态分 | 重点问题 |
| --- | --- | ---: | --- |
| `research-baseline.md` | 调研依据 | - | Codex、Claude Code、AgentUI、AG-UI、公开 benchmark 的证据来源 |
| `local-eval-manifest.json` | 本地轻量评测 manifest | - | 11 个 P0 场景的默认层级、推荐命令、证据要求、失败分类和分数影响；不调用 qcloop |
| `evidence-template.json` | 本地 evidence 模板 | - | 单场景本地证据记录结构，覆盖 runtime transcript、UI evidence、domain evidence、verdict |
| `evidence/README.md` | 本地 evidence 规范 | - | 证据命名、执行顺序、pass / fail / blocked 判定、Batch 1 最小要求；不调用 qcloop |
| `protocol-runtime.md` | 协议与 Runtime 事实源 | 4.0 | UI 是否只消费 runtime facts，不解析 assistant 文本 |
| `composer-input.md` | Composer / 输入控制 | 2.8 | slash、mention、附件、queue vs steer、模型/权限/预算 |
| `streaming-thinking.md` | 流式与 Thinking UI | 3.4 | 首状态、text/reasoning/tool ordered parts、thinking 折叠与恢复 |
| `tools-skill-ui.md` | Tools UI | 3.3 | 工具生命周期、大输出、安全摘要、失败恢复、动态 MCP / browser 工具 |
| `tools-inventory.md` | Tool Inventory 逐项评测 | - | 60 个固定 catalog 工具逐项映射 surface / lifecycle / permission / UI family / 证据 / 分数；`Skill` 只按 tool call rendering 评分 |
| `skills.md` | Skill System | 3.6 | Skill 包标准、目录投影、安装分发、composer 触发、runtime gate、artifact / evidence、subagent preload |
| `mcp.md` | MCP System | 3.4 | server 配置、lifecycle、tools/resources/prompts、auth/elicitation、runtime projection、Evidence |
| `run-observability.md` | Run Observability / Control Surface | 3.5 | 已落地同一区域只读运行控制区：环境、运行、计划、目标、来源、参与、结果；历史 plan thread item / todo items 可恢复为计划清单，本轮新增 run-control-restore 正式 evidence，仍缺控制闭环、split review 与 turn-level 下钻 |
| `coding-terminal.md` | Coding / Terminal | 2.5 | diff、patch、测试闭环、terminal 命令、SWE-bench / Terminal-Bench 对齐 |
| `search-browser-research.md` | Search / Browser / Research | 2.4 | web 搜索、browser 操作、来源引用、WebArena / OSWorld 对齐 |
| `hitl-safety.md` | HITL / 审批 / 安全 | 3.0 | approval、sandbox、权限升级、受控写回 |
| `artifacts-evidence.md` | Artifact / Evidence / Replay | 3.5 | 交付物、版本、diff、证据包、review、replay |
| `sessions-performance.md` | Session / 性能 / 恢复 | 3.3 | current session history Electron fixture 已证明 persisted timeline archive/readback/unarchive/readback 与 hydrate detail 形状；本地历史导入 session restore evidence 又证明导入消息、工具细节和同会话续聊可恢复；仍缺长历史、draft、运行中恢复和性能指标 |
| `multi-agent-team.md` | Multi-agent / Team | 3.0 | subagent lineage、handoff、team roster、worker notification、review lane |
| `evaluation-harness.md` | 评测 Harness | 3.3 | task/trial/grader/transcript、P0 场景、外部 benchmark 子集 |

## 3. 总体结论

Lime Agent Workspace 当前更像是 **Agent Runtime / AgentUI projection 底座已经较强，但最终桌面端工作台体验还没完全闭环**。

| 总项 | 当前评分 | 判断 |
| --- | ---: | --- |
| Agent Runtime 事实源与事件投影 | 4.0 | 已有 contracts、projection、runtime event、fixture 和测试资产 |
| Agent Workspace 聊天与流式体验 | 3.5 | text / thinking / tool / status 已分层，但 ordered parts 与 GUI 实测仍需补证 |
| Coding Agent 桌面体验 | 2.5 | 有 coding roadmap、工具链和工作台雏形，diff / patch / test loop 仍不足 |
| Search / Browser / Research | 2.5 | 有 browser runtime、site adapter、smoke 入口，但 research surface 和来源评分不完整 |
| Tool UI | 3.3 | 60 个固定 catalog 已逐项盘点，工具过程、timeline 有基础，缺大输出、重跑、权限、证据一体化深水位体验 |
| Skill System | 3.6 | Skill 标准包、管理页、catalog 投影、composer、runtime gate、smoke 和组件测试都有基础，缺专项 GUI evidence、触发 eval、供应链安全和 replay |
| MCP System | 3.4 | MCP current API、Rust manager、管理页、tools/prompts/resources 浏览器和 smoke 存在，缺 auth/elicitation、server instructions、capability negotiation、list_changed 和专项 Evidence |
| Run Observability / Control Surface | 3.5 | 已把分散 facts 收敛到同一区域只读运行控制区，覆盖 environment / run / plan / goal / sources / participants / outputs；历史 plan thread item / todo items 已能恢复计划清单，并新增 run-control-restore 正式 evidence；仍缺 pause/steer、Git review lane、控制闭环与真实 live run 深水位 |
| HITL / 审批 / 用户输入 | 3.0 | `action_required`、pending request、submit host response 有事实源，控件闭环仍需接入验证 |
| Evidence / Replay / QC | 4.0 | Lime 特色较强，有 Evidence Pack、P0 矩阵和 qcloop 资产；当前落地先走低 token 本地证据，产品 UI 暴露不足 |
| 多 Agent / Team / Subagent | 3.0 | 后端和 projection 有基础，桌面可观察 Team Workbench 还不完整 |
| 产品级桌面 Shell | 2.5 | 有 Agent Workspace rebuild plan，但当前仍是过渡态，不是最终稳定桌面工作区 |

## 4. 加权评判标准

| 一级维度 | 权重 | 对应领域 |
| --- | ---: | --- |
| 任务完成率 Outcome | 17% | `evaluation-harness.md`、所有领域 |
| 工具使用正确性 | 11% | `tools-skill-ui.md`、`hitl-safety.md` |
| Skill 可复用能力 | 9% | `skills.md` |
| MCP 外部集成能力 | 9% | `mcp.md` |
| Coding 闭环 | 13% | `coding-terminal.md` |
| Search / Browser / Research | 8% | `search-browser-research.md` |
| UI 可观察性 | 12% | `run-observability.md`、`streaming-thinking.md`、`tools-skill-ui.md`、`skills.md`、`mcp.md`、`artifacts-evidence.md` |
| HITL / 权限 / 安全 | 10% | `hitl-safety.md` |
| Evidence / Replay / Debug | 6% | `artifacts-evidence.md`、`evaluation-harness.md`、`skills.md`、`mcp.md` |
| 性能与恢复 | 5% | `sessions-performance.md` |

```text
final_score =
  outcome * 0.17 +
  tool_use * 0.11 +
  skill_system * 0.09 +
  mcp_system * 0.09 +
  coding_loop * 0.13 +
  search_browser * 0.08 +
  ui_observability * 0.12 +
  hitl_safety * 0.10 +
  evidence_replay * 0.06 +
  performance_recovery * 0.05
```

## 5. P0 实测场景

正式评估 Agent Workspace 时，先用下面 11 个 P0 场景替换静态分数。

| P0 场景 | 对应领域 | 必须证明 |
| --- | --- | --- |
| `agent-workspace-basic-streaming` | streaming / protocol | 首状态、thinking、流式 text、completed 状态、runtime transcript |
| `agent-workspace-tool-call` | tools | tool started、args、progress、result / failed、toolCallId |
| `agent-workspace-skill-system` | skills | skill source、standard compliance、explicit / implicit trigger、runtime gate、loaded resources、artifact / evidence |
| `agent-workspace-mcp-system` | mcp | server status、tool/resource/prompt discovery、auth/approval、runtime call、source/evidence |
| `agent-workspace-run-control-surface` | run-observability | 环境、Git、progress、subagents、sources、objective、permission、model、split lane 在同一 run 中可见且可恢复 |
| `agent-workspace-coding-small-fix` | coding | diff、测试命令、退出码、最终说明、文件变更证据 |
| `agent-workspace-search-grounded-answer` | search | 搜索步骤、来源、引用、最终答案分离 |
| `agent-workspace-browser-task` | browser | browser status、操作轨迹、截图或页面状态、cleanup |
| `agent-workspace-hitl-approval` | hitl | action_required 卡、approve/reject 控件、runtime resolved |
| `agent-workspace-artifact-delivery` | artifacts | Artifact 卡、预览、导出入口、artifact refs |
| `agent-workspace-session-restore` | sessions | 关闭 / 切换后恢复消息、工具、状态、证据 |

每个场景都必须记录 prompt、配置、session/thread/turn/run id、UI 证据、runtime transcript、local evidence artifact、pass/fail/blocked 结论和失败分类。

## 6. 测评落地计划

目标是把当前静态审计分数替换成可重复执行的正式分数。执行顺序必须从事实源和确定性断言开始，再进入 GUI smoke / Playwright；当前不使用 qcloop，避免 token 成本过高。

### 6.1 四层测评链路

| 层级 | 目标 | 产物 | 通过条件 |
| --- | --- | --- | --- |
| L0 Static audit | 确认源码、协议、组件、文档事实源 | 本目录评分卡、事实源表、缺口表 | 每个评分项都有 repo 内证据或明确 `not-found` |
| L1 Contract / projection | 证明 runtime facts 能投影成 UI view model | unit / contract tests、fixture replay | 不解析 assistant Markdown；session/thread/turn/tool/artifact/evidence id 不丢 |
| L2 GUI smoke | 证明桌面界面真实可见、可交互、可恢复 | `npm run verify:gui-smoke` 或专项 smoke、Playwright screenshot / snapshot | GUI 可见内容、data-testid、console/network、runtime status 同时成立 |
| L3 Local Evidence Pack | 证明场景可重复、可审计 | `internal/roadmap/agent-workspace/evidence/` 或 `.lime/qc/agent-workspace-*` 本地证据、人工可读 summary | 每个场景有 runtime transcript、UI snapshot、artifact refs、verdict |
| L4 Trend / release gate | 证明质量没有回退 | release summary、趋势分、失败分类归档；qcloop 只在需要发布级自动复核时启用 | P0 场景覆盖完整，无 weak evidence pass |

正式评分只接受 L2 及以上证据；L0/L1 只能支撑静态分或开发中分数。qcloop 输出可以作为 L4 证据，但本阶段不要求。

### 6.2 P0 场景落地顺序

| 批次 | 场景 | 先补的能力 | 退出条件 |
| --- | --- | --- | --- |
| Batch 1 | `agent-workspace-basic-streaming`、`agent-workspace-run-control-surface`、`agent-workspace-run-control-restore` | 建立 Agent Workspace GUI evidence 基线；先做只读 run rail / runtime facts 快照与恢复证据 | 三个场景均已有正式 pass evidence；后续继续补 plan checklist 深水位、split review 和控制闭环 |
| Batch 2 | `agent-workspace-tool-call`、`agent-workspace-hitl-approval` | 工具生命周期和审批闭环 | tool started / args / progress / result / failed、approve/reject 回写 runtime |
| Batch 3 | `agent-workspace-skill-system`、`agent-workspace-mcp-system` | Skill 与 MCP 独立 evidence，不再混在 Tools UI 分数里 | skill source/version/resources/tool gate；MCP server status/tools/resources/prompts/auth evidence |
| Batch 4 | `agent-workspace-coding-small-fix`、`agent-workspace-artifact-delivery` | coding diff、测试、artifact/evidence 交付链 | diffstat、测试退出码、artifact refs、Evidence Pack 可下钻 |
| Batch 5 | `agent-workspace-search-grounded-answer`、`agent-workspace-browser-task` | search/browser 来源和操作轨迹 | source refs、引用一致性、browser action trace、页面状态证据 |
| Batch 6 | `agent-workspace-session-restore` | 长任务恢复和右栏 / 底栏状态恢复 | 关闭 / 切换 / resume 后 messages、tools、plan、goal、sources、subagents、evidence 不丢 |

执行原则：P0 Batch 1 未通过前，不扩大到 P1/P2；Batch 1 的目标是建立评测基线和证据格式，不追求一次补完所有产品能力。

### 6.3 每个场景的固定证据包

| 证据字段 | 最低要求 |
| --- | --- |
| `scenarioId` | 使用本文 P0 场景 id，不能临时改名 |
| `prompt` | 用户输入、模型、reasoning、权限、workspace root |
| `runtimeIds` | sessionId、threadId、turnId、runId；没有就记录缺口 |
| `runtimeTranscript` | run/text/reasoning/tool/action/artifact/evidence/session events |
| `uiEvidence` | screenshot 或 accessibility snapshot；关键 UI 元素要有可断言 selector |
| `artifacts` | diff、文件、报告、source refs、artifact refs、evidence refs |
| `verdict` | pass / fail / blocked |
| `failureClass` | product / environment / evidence / concurrency / release |
| `scoreImpact` | 本次证据影响哪些领域评分、是否允许替换静态分 |

## 7. 完善实施路线

实施要按“先让测评可信，再补产品缺口”的顺序推进。否则容易出现 UI 看起来很完整，但没有 runtime 事实源、无法恢复、无法回放。

### 7.1 第一阶段：建立可执行评测骨架

| 工作项 | 对应文件 / 模块 | 交付物 |
| --- | --- | --- |
| 把 11 个 P0 场景写入轻量 manifest | `local-eval-manifest.json` | 本地脚本 / 人工执行可按 `agent-workspace-*` 过滤，不启动 qcloop |
| 定义 Agent Workspace local evidence 模板 | `evidence-template.json` | 支持 run rail、sources、subagents、model、permission、diffstat 字段 |
| 建立 GUI owner / preflight 说明 | `internal/tests/agent-qc-p0-scenarios.md` | 防止 GUI 并发污染和 partial evidence 被误当 pass |
| 跑通第一个只读场景 | `agent-workspace-basic-streaming` | 已生成正式 evidence：`evidence/agent-workspace-basic-streaming.20260616-0807.json`，可作为 streaming / protocol / harness 的本地正式证据 |

### 7.2 第二阶段：补 Run Control Surface 主缺口

| 工作项 | 对应评分卡 | 交付物 |
| --- | --- | --- |
| 定义运行控制区投影 | `run-observability.md` | 已落地 `buildGeneralWorkbenchRunControlSurfaceProjection`，从任务轨道 facts 汇总 environment、run、plan、participants、sources、controls、outputs |
| 接入只读任务区域摘要 | `run-observability.md`、`sessions-performance.md` | 已接入同一区域只读 surface，环境、Git 摘要、progress、subagents、sources、goal、permission、model 可见 |
| 补 session restore | `sessions-performance.md` | thread/read 或 resume 后右栏 / 底栏状态恢复 |
| 补 GUI smoke | `evaluation-harness.md` | `agent-workspace-run-control-surface` 可重复执行 |

### 7.3 第三阶段：补 Tools / Skill / MCP 深水位证据

| 工作项 | 对应评分卡 | 交付物 |
| --- | --- | --- |
| 从 `tools-inventory.md` 挑低分 current 工具 | `tools-skill-ui.md`、`tools-inventory.md` | 每批 5-10 个工具补 GUI evidence |
| Skill P0 evalset | `skills.md` | explicit / implicit trigger、resources hash、runtime gate、artifact/evidence |
| MCP P0 evalset | `mcp.md` | server lifecycle、tools/resources/prompts、auth/elicitation、approval、source/evidence |
| 工具失败恢复 | `tools-skill-ui.md`、`hitl-safety.md` | failed tool、retry、copy、open detail、permission resolved |

### 7.4 第四阶段：补 Coding / Search / Browser / Artifact outcome

| 工作项 | 对应评分卡 | 交付物 |
| --- | --- | --- |
| small coding fix | `coding-terminal.md` | diff、测试命令、退出码、file change evidence |
| grounded search answer | `search-browser-research.md` | source refs、引用一致性、最终答案与来源分离 |
| browser task | `search-browser-research.md` | browser trace、screenshot、console/network、cleanup |
| artifact delivery | `artifacts-evidence.md` | artifact preview、export、version、evidence refs |

### 7.5 第五阶段：正式评分与发布门禁

| 工作项 | 交付物 | 通过条件 |
| --- | --- | --- |
| P0 本地证据批次 | `.lime/qc/agent-workspace-p0-evidence.json` 或本目录 evidence summary | 11/11 场景 pass 或明确 waiver |
| 分数更新 PR | 本目录评分卡 | 每个分数变化都有 evidence ref |
| release summary | Agent Workspace evidence summary；需要发布级自动复核时再接 qcloop / Agent QC release summary | 无 weak evidence pass；blocked 场景不伪装通过 |
| 趋势归档 | failure ledger / tech-debt tracker | 回归能定位到场景和失败分类 |

## 8. 评分更新机制

### 8.1 分数替换规则

| 情况 | 是否更新正式分 | 说明 |
| --- | --- | --- |
| 只有静态代码证据 | 否 | 只能更新静态判断和缺口说明 |
| unit / contract test 通过 | 部分 | 可支撑 L1，但不能宣称桌面产品可用 |
| GUI smoke 通过且有 runtime transcript | 是 | 可把相关项提升到 `3.x` 或 `4.x` |
| 本地 Evidence Pack 通过 | 是 | 可替换领域正式分 |
| qcloop Evidence Pack 通过 | 是 | 可作为发布级自动复核证据，但当前不强制 |
| 单次手工截图 | 否 | 只能作为辅助观察，不作为正式分 |
| partial sidecar / 环境阻断 | 否 | 必须标 blocked，不能当 pass |

### 8.2 每次更新必须改哪里

| 变更类型 | 必改位置 |
| --- | --- |
| 新增评测依据 | `research-baseline.md` |
| 新增 / 修改领域评分 | 对应领域评分卡 + 本 README 总览表 |
| 新增 P0 场景 | 本 README + `evaluation-harness.md` + Agent QC manifest |
| 修复产品缺口 | 对应评分卡的“当前证据 / 下一刀 / P0 场景” |
| 发现阻断缺口 | 对应评分卡失败模式 + `internal/exec-plans/tech-debt-tracker.md` 或专项执行计划 |

### 8.3 完成定义

Agent Workspace 评测体系达到 `4.0+` 的最低条件：

1. 11 个 P0 场景都有可重复本地 Evidence Pack。
2. Run Control Surface 能恢复 environment、plan、goal、sources、subagents、permission、model、diffstat。
3. Tools / Skill / MCP 三个评分域分开计分，不能互相借分。
4. Coding / Search / Browser 至少各有一个 outcome 型 P0 场景通过。
5. GUI smoke、runtime transcript、artifact/evidence refs 三层证据同时存在。
6. README 总览分数与各领域文件分数一致。

## 9. 当前完成判定

本文档集完成的是 Agent Workspace 能力评测的静态基线、领域拆分、Batch 1 本地证据和一份 `agent-workspace-session-restore` 导入恢复专项 evidence。当前可以把 `basic-streaming`、`run-control-surface`、`run-control-restore` 与 `session-restore` 的已列文件计入正式本地 evidence；其余 P0 场景仍需要逐项补证后，才可以把 Agent Workspace 当前分数升级为完整产品评分。

本轮评测路线图文档完成度：`100%`。

整体 Agent Workspace 目标完成度估算：`84%`。口径是：底层 runtime / projection / evidence 约完成较高，任务区域已具备 plan / tool-run / model / permission / reasoning / workspace / objective / diffstat / sources / subagents / outputs / approval 摘要，并新增同一区域只读运行控制区，能把 environment / run / plan / goal / sources / participants / outputs / split lane 汇总展示；计划、执行和产物明细已统一在同一运行控制区内呈现，输出仍可点击打开并保留溢出计数；任务轨道接线与历史恢复投影延迟已拆出独立 hook，并已补齐 `workflowSteps=[]` 时从结构化 plan thread item 与 `todoItems` 恢复计划清单的主路径；`agent-workspace-run-control-restore` 正式 evidence 证明 deterministic UI 恢复态可在同一区域恢复 environment、plan、goal、sources、subagents、diffstat、approval 和 output，真实 Electron session history fixture 也已证明 current `agentSession/list/read/update` 的归档、恢复和重启 readback 链路；本轮新增 `agent-workspace-session-restore` 正式 evidence，证明本地历史导入会话能恢复消息、reasoning、command、patch、web search、approval 细节，并在同一个 current `AgentSession` 继续对话，同时不会把导入支持能力显示成消息主线 banner、环境信息或 run control 独立状态卡；这些状态继续从 `threadRead.context_summary`、`threadRead.evidence_summary`、`threadRead.artifacts`、`threadRead.change_summary`、`todoItems`、`child_subagent_sessions` 以及 timeline / provenance facts 派生，不解析 assistant Markdown；最终桌面工作台体验、完整 citation consistency、Split review、pause/steer 控制闭环、Skill / MCP 专项 GUI evidence、coding 闭环、browser/search 实测和完整 P0 Evidence Pack 仍需要继续补证。

## 10. 当前本地 Evidence 状态

| 场景 | 文件 | 状态 | 结论 |
| --- | --- | --- | --- |
| `agent-workspace-basic-streaming` | `evidence/agent-workspace-basic-streaming.20260616-0807.json` | `pass` | 真实 Electron fixture 已证明 prompt / output / completed、read model 对齐、consoleErrors=0，可替换 streaming / protocol / harness 的本地正式证据 |
| `agent-workspace-run-control-surface` | `evidence/agent-workspace-run-control-surface.20260616-0807.json` | `pass` | 已生成正式 pass evidence；同一区域只读运行控制区可见，覆盖 environment / run / plan / goal / sources / participants / outputs / split lane 的基础断言 |
| `agent-workspace-run-control-restore` | `evidence/agent-workspace-run-control-restore.20260616-1255.json` | `pass` | 已生成正式 pass evidence；恢复态同一区域可见 environment / plan / goal / sources / subagents / diffstat / approval / output，真实 Electron session history fixture 证明 current `agentSession/list/read/update` 归档、恢复和重启 readback 链路 |
| `agent-workspace-session-restore` | `evidence/agent-workspace-session-restore.20260617-1559.json` | `pass` | 已生成正式 pass evidence；本地历史导入会话经真实 Electron current 链路恢复 messages、reasoning、command、patch、web search、approval，并在同一 current session 续聊；同时断言导入支持能力不进入消息主线 banner、环境信息或 run control 独立状态卡 |
| `agent-workspace-run-control-surface` | 任务轨道运行控制区 implementation | `implemented-local-verified` | 已接入 workflow steps、message artifacts、activity logs、creation task events，并从 `projectedThreadItems` 恢复 `tool_call`、`command_execution`、`web_search`、`file_artifact` 与结构化 `plan`；当 `workflowSteps=[]` 时可从历史 plan thread item 恢复计划清单，缺 plan item 时再从 `todoItems` 恢复 completed / in_progress / pending 状态；同一区域展示计划步骤、工具 / 执行活动、运行摘要短标签，覆盖 plan / tool-run / model / permission / reasoning / workspace / objective / diffstat / sources / subagents facts；已收回旧 plan / activity / output 重复段落，计划、执行、结果和产物明细统一在运行控制区内展示；来源摘要来自 `threadRead.context_summary.sources/retrieval_refs/team_memory_refs`、`threadRead.evidence_summary.evidence_refs`、`threadRead.artifacts` 与搜索 / 文件 timeline，不解析 assistant Markdown；已移除环境浮层静态来源图标占位，来源详情在任务轨道真实来源标签下直接可见，并能显示 `已关联` / `待补证据` / `待补来源` 三类基础来源一致性状态；输出文件行可点击打开，保留去重后的轻量列表和溢出计数；任务轨道 props / 输出路径解析已收敛到 `useWorkspaceTaskRailRuntime`，恢复期运行投影延迟已收敛到 `useSessionRuntimeProjectionDeferral`；已通过 unit / integration / runtime path 解析回归、i18n、current fixture、GUI smoke 和正式 evidence |
| `agent-workspace-hitl-approval` | 顶部环境浮层审批摘要 implementation | `implemented-local-verified` | 已从 current `pendingActions` / `submittedActionsInFlight` 派生最多 2 条轻量确认摘要；工具确认可在同一区域触发既有 `onRespondToAction` approve / reject，问答类只展示等待状态；已从 `projectedThreadItems` 的 `approval_request` / `request_user_input` completed read model 派生最近已允许 / 已拒绝 / 已回答回显，点击处理后不会只消失；不新增协议、不展示敏感参数；已通过 view model / toolbar integration / runtime passthrough 回归，仍需正式 runtime resolved evidence 文件 |

真实 evidence 文件必须使用 `evidence/<scenario-id>.<YYYYMMDD-HHMM>.json` 命名；`.example.json` 永远不计入正式通过率，当前仅保留为旧格式样例。
