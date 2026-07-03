# Lime 应该如何开发 Lime：把 Agent 验证变成系统能力

> 状态：current research synthesis
> 更新时间：2026-07-02
> 来源：`ai-agent-verification-original.md`、外部主来源调研、Lime current 架构 / Harness / Agent QC / Agent UI / Managed Objective 文档
> 目标：把“AI Agent 开发中 90% 时间耗在验证上”的问题，落成 Lime 已有资产地图、当前缺口和后续可执行方案。

## 0. 先给结论

上一篇草稿的问题是，它把 Lime 写得像“准备开始做验证体系”。

这不准确。

Lime 现在已经做了非常多工作。更准确的判断应该是：

**Lime 已经有了 Agent 验证体系的大部分骨架，当前问题不是缺概念，而是还没有把这些骨架收敛成日常开发默认闭环。**

现在已经存在的资产包括：

- App Server JSON-RPC / RuntimeCore current 主链
- Electron Desktop Host bridge 与前端 `src/lib/api/*` 网关边界
- `thread_read`、runtime events、tool timeline、artifact、review、subagent、automation 等结构化事实
- Harness Engine：Evidence Pack、replay case、analysis handoff、review template
- Agent QC：scenario manifest、Evidence schema、qcloop payload、export evidence、release summary、completion audit
- 8 条 Agent QC P0 场景
- GUI smoke / runtime fixture / Claw smoke / approval sandbox / Skill Forge / Plugin / Browser Runtime / Knowledge / Design Canvas 等 smoke 入口
- Agent UI projection：process、tool、HITL、artifact、evidence、review、Subagents、remote teammate、work board 等标准投影
- Managed Objective：objective state、evidence-based audit、manual continuation、automation owner binding、受控 auto idle continuation

所以后续的重点不是“再讲一遍要做测试”。

重点是把这些资产变成一个更硬的研发协议：

```text
每个 Agent 主链改动
  -> 先定义 Happy Path 和证据层
  -> 再实现 current 主链
  -> 用确定性断言证明结构事实
  -> 用 Supervisor 只判断模糊语义
  -> 导出 Evidence Pack
  -> qcloop / release summary / audit 形成运营门禁
  -> 失败回写成 regression / scenario / replay / verifier rule
```

这篇文章要回答两个问题：

1. Lime 已经做到哪一步？
2. 除了这些，下一步应该怎么做？

## 1. 外部证据只是背景，不是主角

外部调研仍然有价值，但它应该服务 Lime 的本地事实。

### 1.1 Verifier's Law 解释了为什么验证是杠杆

Jason Wei 在《Asymmetry of verification and verifier's law》中讨论了“生成”和“验证”的不对称：有些任务做出来很难，但验证结果相对容易。他提出的 Verifier's Law 可以概括为：

```text
可快速、低成本验证的任务，更容易被 AI 解决。
```

这对 Lime 的启发很直接：

AI 写代码、写 prompt、写 UI 的速度会越来越快。真正限制 Lime 研发效率的，不是“能不能生成”，而是“能不能可靠判断这次生成有没有让系统退化”。

### 1.2 ACI 解释了为什么 Lime 需要 Agent 友好的接口

SWE-agent 的 ACI（Agent-Computer Interface）研究证明，Agent 不是普通用户。接口的形状会直接影响 Agent 完成软件工程任务的能力。

这和 Lime 的 current 架构完全一致：

Electron 只做 Desktop Host bridge，业务事实进入 App Server JSON-RPC / RuntimeCore。前端业务代码经 `src/lib/api/*` 网关进入 current 主链，而不是到处散落 `invoke` 或把 Electron main 做成第二套后端。

这不是架构洁癖。

这是为了让 Agent 能通过稳定接口拿到事实，而不是靠屏幕像素和历史兼容入口猜状态。

### 1.3 Agent eval 解释了为什么不能只看最终回答

OpenAI Evals、Anthropic Agent eval、Google Agent evaluation 的共同点是：评测不只看最后一句答案，而是要看数据集、轨迹、工具调用、grader、人工 review 和自动运行记录。

Lime 已经在做这个方向：

- `Evidence Pack` 记录事实
- `replay case` 复用事实
- `analysis handoff` 复用 evidence / replay
- `review template` 复用 analysis
- `Agent QC` 用 manifest 定义场景、证据层和 failure modes
- `qcloop` 负责任务执行和独立 verifier

所以 Lime 的下一步不是引入一个新的 eval 概念，而是让这些已经存在的链路成为开发默认门槛。

### 1.4 Playwright 解释了 GUI 证据的角色

Playwright 的 locator、auto-waiting、trace viewer，本质是在把“人眼看页面”变成可复跑证据。

但对 Lime 来说，GUI 证据只能证明产品表面，不能替代运行时事实。

正确关系是：

- GUI smoke 证明用户路径真的可用
- Runtime transcript 证明 turn / stream / tool / approval 真的发生
- Evidence Pack 证明事实能被复盘、回放、审计
- Release summary 证明这些证据覆盖了发布风险

只跑其中任何一个，都不完整。

## 2. Lime 现在已经有的资产

这一节是上一篇最缺的部分。

Lime 现在不是白纸。它已经做了很多关键工作。

### 2.1 Current 主链已经明确

Lime 的 Agent / runtime / host integration / 跨 App 能力默认走：

```text
组件 / Hook
  -> src/lib/api/* 网关
  -> safeInvoke / AppServerClient
  -> Electron Desktop Host bridge
  -> App Server JSON-RPC
  -> RuntimeCore / backend
  -> read model / events / evidence
```

这条链的意义是：

- 前端不直接散落业务 `invoke`
- Electron 不变成第二套后端
- App Server / RuntimeCore 是 Agent 事实入口
- mock 只服务测试，不能成为生产降级
- command catalog / contract / bridge / mock / GUI smoke 能一起守边界

这已经是 ACI 思想在 Lime 内部的工程化形态。

Agent 需要的不是“看起来能点的 UI”，而是稳定可读的运行时接口。

### 2.2 Harness Engine 已经形成事实源链路

Harness Engine 已经把方向收敛成：

```text
runtime thread/session
  -> evidence pack
  -> replay / analysis / review / summary
  -> trend / cleanup / dashboard
  -> UI
```

这条链最关键的判断是：

**UI 不能反向定义事实。**

也就是说，`HarnessStatusPanel`、外部 AI copy prompt、review summary、analysis brief，都只能消费 Evidence Pack，不能自己再拼第二套 runtime truth。

这正好解决 Agent 开发里最麻烦的问题：

当系统出错时，我们不再问“页面看起来像什么”，而是问“运行时事实导出了什么，哪些证据适用，哪些证据缺失”。

### 2.3 Agent QC 已经从文档走到机器入口

Lime 现在已经有一套 Agent 运营级测试体系。

核心入口包括：

```bash
npm run agent-qc:report
npm run agent-qc:gui-flow:report
npm run agent-qc:check
npm run agent-qc:qcloop-job
npm run agent-qc:export-evidence
npm run agent-qc:release-summary
npm run agent-qc:audit
```

当前 manifest 里有 13 个场景，其中 8 个是 P0：

```text
command-bridge-contract
claw-chat-ready-streaming
tool-approval-sandbox-boundary
skill-forge-register-bind-enable
browser-runtime-site-adapter
workspace-ready-session-restore
harness-replay-regression
release-package-startup-smoke
```

这 8 个 P0 很关键，因为它们已经覆盖了 Lime Agent 产品的四层事实：

| 事实层 | P0 场景示例 | 证明什么 |
| --- | --- | --- |
| 壳层 | `workspace-ready-session-restore`、`release-package-startup-smoke` | App / DevBridge / workspace ready / 启动范围 |
| 运行时层 | `claw-chat-ready-streaming` | turn、stream、中断、恢复、GUI 可见状态 |
| 能力层 | `tool-approval-sandbox-boundary`、`skill-forge-register-bind-enable`、`browser-runtime-site-adapter` | tool、approval、sandbox、SkillTool、browser adapter 真实可用 |
| 运营层 | `harness-replay-regression`、`command-bridge-contract` | evidence、replay、contracts、release gate 可审计 |

这不是“未来应该做”。

这是 Lime 已经落地的测试骨架。

### 2.4 Evidence Contract 已经解决“命令跑过但 verifier 看不懂”的问题

`internal/tests/lime-agent-qc-evidence-contract.md` 定义了 qcloop worker 必须输出的结构化 marker：

```text
QCLOOP_WORKER_RESULT=PASS|FAIL|BLOCKED
QCLOOP_EVIDENCE_SUMMARY_JSON=<json>
```

这件事非常重要。

因为 Agent 测试最常见的假阳性就是：

```text
命令 exit 0
worker 写“通过”
verifier 看不到 runtime transcript / GUI trace / failure mode 解释
最后被误判成 pass
```

Lime 已经把这个问题提升成契约：

- stdout 缺 JSON，不能 pass
- 只覆盖 deterministic smoke，不能声称覆盖 runtime transcript
- GUI 场景必须说明 owner / isolation
- release 场景必须说明 source-tree 还是 installer artifact
- pass 场景不能只有 qcloop 引用，必须有可审查 artifact

这已经非常接近成熟 Agent eval 系统的形状。

### 2.5 GUI / Runtime / Plugin / Skill Forge 的 smoke 入口很丰富

`package.json` 里已经有很多入口，不是只有一个 `verify:local`。

代表性入口包括：

```bash
npm run verify:local
npm run test:contracts
npm run verify:gui-smoke
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-current-fixture
npm run smoke:claw-chat-ready-streaming
npm run smoke:agent-runtime-tool-surface
npm run smoke:agent-runtime-approval-sandbox
npm run smoke:agent-service-skill-entry
npm run smoke:plugins
npm run smoke:browser-runtime
npm run smoke:site-adapters
npm run smoke:knowledge-gui
npm run smoke:design-canvas
npm run smoke:managed-objective-continuation
npm run smoke:managed-objective-automation
```

这说明 Lime 已经从“单元测试 + 手工点页面”走到了多层 smoke。

真正的问题是：这些入口还没有被每个 Agent 主链改动自动映射成“该跑哪几条、每条证明什么、缺什么证据不能放行”。

这就是下一步要补的。

### 2.6 Agent UI projection 已经在把运行时事实标准化

Agent UI v0.6.0 的对齐文档里，Lime 已经把大量运行时事实投影成标准 envelope。

已对齐的主链包括：

- ordered `contentParts`：thinking / tool / text / action 可按顺序渲染
- running process 展开、完成后折叠
- inline process 与 timeline 去重
- final answer 与 reasoning / tool 分离
- tool lifecycle 全状态
- HITL / action required / plan approval / tool confirmation
- queue / steer / task capsule
- artifact workspace
- evidence / review / replay baseline
- session hydration
- diagnostics / metrics

Subagents 方向也已经有大量 current 事实：

- `runtimeEntity=agent_turn / subagent_turn / automation_job / external_task / work_item`
- team queue / parallelism facts
- 10 个标准 surface
- `agent.spawned / agent.completed`
- `team.changed`
- worker notification
- handoff lane
- review lane
- background teammate
- remote teammate
- work board / assignment
- team controls
- delegated approval identity
- teammate transcript

这意味着 Lime 不是“缺 UI 验证”。

Lime 已经开始把 Agent 系统变成一个可投影、可解释、可审计的工作台。

下一步要做的是让这些 projection 进入更稳定的测试和 evidence contract，而不是只停留在 UI 对齐文档里。

### 2.7 Managed Objective 已经把“持续推进目标”接进 current 主链

Managed Objective 也是上一篇完全没写够的部分。

它已经明确不是新 runtime，而是目标推进控制层：

```text
agent turn / subagent turn / automation job
  -> objective state
  -> continuation policy
  -> agent_runtime_submit_turn / runtime_queue
  -> timeline / artifact / thread_read / evidence pack
  -> completion audit
```

实施计划里已经落地了多项能力：

- session-scoped objective 保存、暂停、恢复、清除和手动继续
- `agent_runtime_audit_objective` 复用 evidence pack 回写审计摘要
- completed 决策必须有 artifact / timeline / tool call / controlled evidence
- automation owner binding
- due job scheduler 回归
- automation objective projection
- GUI 审计动作
- objective panel projection-only 回归
- 受控 idle auto continuation
- auto continuation guard audit
- continuation smoke core fixture
- objective guardrails：禁止 `goal_runtime / objective_scheduler / objective_queue / objective_evidence_pack`
- 禁止 objective 命令进入模型可见 tool surface
- unverified skill 不能被 managed objective 自动执行

这说明 Lime 已经在做比“普通回归测试”更高一层的东西：

**让 Agent 围绕目标自动续跑，但每一次继续和停止都要能被 evidence 解释。**

这非常接近原文里讲的“让 AI 自己闭环，但人定义什么算对”。

## 3. 当前真实缺口：不是没有体系，而是体系还没有完全闭环

现在最重要的是不要误判问题。

Lime 当前不是“没有验证体系”。

Lime 当前的问题更像是：

```text
体系已经搭起来
但 official evidence 还不能稳定 8/8 P0 pass
部分 deep evidence 仍被环境、worker、GUI owner、runtime cancel 语义阻断
```

### 3.1 官方 Evidence Pack 仍不能放行

`internal/tests/lime-agent-qc-current-blockers.md` 已经记录得很清楚：

```text
.lime/qc/agent-qc-evidence.json status=fail scenarios=8/8
```

这不是坏事。

这说明门禁在起作用。

它没有因为“某些命令跑过了”就假装绿色，而是正确把问题分成：

- 产品深证据 blocker
- qcloop worker / provider / DevBridge 环境阻断
- verifier 拒绝缺 runtime transcript / GUI trace / console-network 的浅层输出
- stale GUI owner / 并发干扰

这比“测试都绿了但其实没人知道发生了什么”健康得多。

### 3.2 P0 阻断已经很具体

当前 blockers 里能看到几类真实问题：

- official Evidence Pack fail，不能发布
- qcloop worker 曾因 localhost / DevBridge / sandbox / MCP 启动无输出卡住
- GUI owner / stale process 会阻断新的 full GUI P0
- `claw-chat-ready-streaming` 曾暴露 runtime cancel 语义问题：UI stop 可点，但被停止的长 turn 仍可能以 completed 落盘
- `verify:local` 曾被 Claw streaming deep flow 阻断
- `smoke:design-canvas` 的保存完成状态曾缺少可观察证据
- isolated sidecar 可以通过部分场景，但不能覆盖 official evidence

这些都是高质量缺口。

因为它们不是“我们感觉哪里不稳”，而是已经被 evidence 和 sidecar 记录下来的可复核问题。

### 3.3 最大缺口是“证据产品化”，不是“测试数量”

现在继续盲目增加 smoke 没有太大意义。

真正要补的是：

1. 每个 P0 场景的 evidence summary 稳定输出
2. GUI owner / qcloop worker / DevBridge preflight 成为默认前置 gate
3. runtime transcript、GUI trace、release artifact scope 明确分层
4. official `.lime/qc/agent-qc-evidence.json` 能由同一批次 8/8 P0 pass 产生
5. `agent-qc:release-summary --check` 和 `agent-qc:audit` 能成为发布前硬门禁

换句话说：

**Lime 下一步要做的是把“很多验证入口”升级为“稳定的验证操作系统”。**

## 4. 我们还应该如何做

下面不是泛泛建议，而是基于 Lime 当前状态的下一步。

### 4.1 第一优先级：把官方 P0 Evidence Pack 跑到可信 green

这是最高杠杆的一刀。

目标不是“再跑一次 P0”。

目标是让官方证据链真的成立：

```text
agent-qc:check pass
qcloop payload covers 8/8 P0
GUI owner gate pass
worker preflight pass
8/8 P0 item success
8/8 item has QCLOOP_EVIDENCE_SUMMARY_JSON
agent-qc:export-evidence outputs status=pass
agent-qc:release-summary --check pass
agent-qc:audit complete
```

这一步做完，Lime 才能说：

**我们不只是有测试文档，而是有一条 Agent 可以执行、verifier 可以复核、发布可以引用的质量证据链。**

具体动作：

1. 先处理 stale GUI owner 和 qcloop worker 环境，不并发启动 full GUI P0。
2. 固定 qcloop server 启动环境：sandbox、MCP、DevBridge、cwd、tmp、Codex bin 都要可审计。
3. 每个 worker stdout 必须输出 `QCLOOP_WORKER_RESULT` 和 `QCLOOP_EVIDENCE_SUMMARY_JSON`。
4. 对每个 P0 场景补齐 required evidence，而不是降低 verifier。
5. official evidence 只能来自同一批次 8/8 P0，不拼接 partial sidecar。

这比新增任何新功能都更重要。

因为它会让后面的所有 Agent 改动都有可复用验收底座。

### 4.2 第二优先级：把 Agent Verification Contract 变成执行计划模板

上一篇提到 Contract，但太轻。

现在应该把它升级成每个 Agent 主线改动的执行计划模板。

建议新增模板字段：

```text
## Agent Verification Contract

### Current 主链
- 前端入口：
- App Server method：
- RuntimeCore owner：
- read model：
- Evidence Pack 字段：
- GUI surface：

### Happy Path
- 输入：
- 预期 runtime events：
- 预期 tool / approval / sandbox：
- 预期 artifact / evidence：
- 预期 GUI 状态：

### Evidence Layers
- deterministic-smoke：
- gui-trace：
- runtime-transcript：
- release-artifact：

### 必跑命令
- L0：
- L1：
- L2：
- L3：
- L4：

### Supervisor Rubric
- 只判断：
- 不判断：
- 阈值：
- 人审触发条件：

### 回写规则
- 失败沉淀到哪个 test / replay / scenario：
- 哪个 release gate 会阻断同类问题：
```

这个模板应该优先放进 `internal/exec-plans/` 体系，而不是只做研究稿。

因为它要服务开发，不是服务阅读。

### 4.3 第三优先级：把 P0 场景从“质量门禁”变成“开发选择器”

现在 P0 场景更多被用在 release / qcloop。

下一步应该让它前移到开发阶段。

也就是每次改动前先回答：

```text
这次改动影响哪几个 P0？
有没有对应 P1/P2？
哪些场景可以只跑 deterministic smoke？
哪些必须补 runtime transcript？
哪些必须补 GUI trace？
哪些需要 live Provider 明确授权？
```

可以先不用做复杂工具，先在执行计划里强制写。

后续再让 `quality-task-selector` 或 `agent-qc:benchmark:plan` 根据 diff 自动推荐场景。

建议把这一层收敛成固定三步：

```text
1. 根据 diff 类型选最小场景集
2. 只跑受影响场景的 baseline / candidate
3. 将差异摘要写回 Verification Contract
```

最小选场规则先复用现有入口，不新增平台：

| diff 类型 | 默认优先场景 |
| --- | --- |
| command / bridge / contract | `command-bridge-contract` |
| runtime turn / streaming / cancel | `claw-chat-ready-streaming` |
| tool / approval / sandbox | `tool-approval-sandbox-boundary` |
| SkillTool / registration / enable | `skill-forge-register-bind-enable` |
| browser runtime / adapter | `browser-runtime-site-adapter` |
| workspace / session / GUI shell | `workspace-ready-session-restore` |
| replay / grader / trend | `harness-replay-regression` |
| release / packaging / version | `release-package-startup-smoke` |
| objective / continuation / audit | `managed-objective-evidence-continuation` |

原则很简单：

- 先选最小场景集，再考虑扩大。
- baseline 优先复用最近 green。
- candidate 只跑受影响分支。
- 没有 deterministic diff 时，不进入 Supervisor。

### 4.4 第四优先级：把 Agent UI projection 纳入 evidence，而不是只做 UI 展示

Agent UI projection 现在已经非常丰富，但还可以更进一步。

建议把这些 projection 作为 P0 / P1 场景 evidence 的一部分：

- tool lifecycle 投影是否完整
- HITL / action required 是否进入 projection
- review lane 是否由真实 evidence fact 触发
- work board assignment 是否来自 `TaskUpdateTool owner_change`
- remote teammate 是否来自 `source_metadata.remote_task`
- managed objective 状态是否只认后端 status，不由前端推断 completed

这样做的收益是：

Lime 的 UI 不只是“显示好看”，而是变成 Agent 可审计事实的一层 read model。

### 4.5 第五优先级：把 Managed Objective 接到 Agent QC，而不是单独存在

Managed Objective 已经很强，但它还应该进入 Agent QC 场景体系。

建议新增或提升一个 P1 场景：

```text
managed-objective-evidence-continuation
```

它要证明：

- objective state 可恢复
- manual continuation 走标准 `agent_runtime_submit_turn`
- auto idle continuation 只在 guard 允许时触发
- completed / needs_input / budget_limited 都能由 evidence pack 解释
- unverified skill 不能被自动执行
- automation owner 的 objective 能进入 evidence pack

这会把 Managed Objective 从“路线图能力”变成“Agent 自主闭环的可验收能力”。

### 4.6 第六优先级：做 flag differential harness，但先绑定已有 benchmark 能力

上一篇提到 flag differential，但没有说怎么落。

Lime 现在已经有：

```bash
npm run agent-qc:benchmark:plan
npm run agent-qc:benchmark:compare
```

这可以作为切入口。

后续每个高风险 Agent 行为，都应该能跑：

```text
baseline config / flag off
candidate config / flag on
same scenario set
same evidence contract
deterministic diff
Supervisor semantic diff
regression decision
```

适合先做的场景：

- tool selection 策略
- streaming completion / cancel 语义
- SkillTool gate
- Supervisor rubric
- Managed Objective auto continuation guard
- Plugin UI runtime lifecycle

这一步不是为了 A/B 实验好看。

它是为了回答一个真实问题：

**新功能到底让什么变好了，又悄悄弄坏了什么？**

建议把 `agent-qc:benchmark:plan` 与 `agent-qc:benchmark:compare` 视为两段式：

```text
benchmark:plan
  -> 生成 baseline / candidate / requiredEvidence / failureModes
benchmark:compare
  -> 读取两侧结果，产出 deterministic diff + promotion decision
```

比较结果不直接决定发布，只负责把问题归类：

- pass
- regression
- needs-human-review

只有当 deterministic diff 已经明确后，才把摘要交给 Supervisor 看语义差异。

### 4.7 第七优先级：把 Supervisor 限定成“第二层裁判”

Supervisor 必须有，但不能滥用。

它应该只判断：

- 最终回答是否满足用户意图
- artifact 是否比 baseline 更清晰
- Agent 路径虽然不同，但是否仍合理
- 错误恢复说明是否可接受
- 多轮 objective 是否真的接近成功标准

它不应该判断：

- command 是否注册
- bridge 是否同步
- mock 是否误入生产
- read model 字段是否存在
- Evidence Pack 是否导出
- GUI owner 是否独占
- release scope 是否明确

这些必须由确定性断言解决。

Supervisor 的输入应该固定为：

```text
任务预期
baseline evidence summary
candidate evidence summary
runtime transcript 摘要
GUI / artifact 摘要
rubric
```

不要把开发聊天和实现解释塞进去。

否则 Supervisor 会替我们找理由。

建议把 Supervisor 输出压缩成一行决策和一行原因，避免长篇解释：

```json
{
  "score": 0.82,
  "verdict": "pass",
  "regressions": [],
  "needsHumanReview": false,
  "reason": "候选路径满足目标，未见关键退化"
}
```

一个场景最多一次 judge。  
如果 judge 仍然不稳定，先回写 deterministic signal，不要继续重试烧 token。

### 4.8 第八优先级：每个真实事故必须回写成资产

Lime 当前已经在 blockers 文档里记录了大量真实问题。

下一步要进一步收口：

| 失败类型 | 应回写成什么 |
| --- | --- |
| Claw cancel 语义不对 | runtime 状态机单测 + Claw P0 transcript |
| GUI 保存状态不可观察 | GUI smoke 断言 + 可见状态 contract |
| qcloop worker stdout 为空 | worker prompt / timeout / preflight guard |
| DevBridge 中途不可达 | owner gate + bridge health sidecar + failure mode |
| partial evidence 被误用 | release summary hard gate |
| Skill 注册被误认为可执行 | SkillTool gate + runtime transcript |

关闭标准只有一个：

**下次同类问题能由机器先发现，并能阻断发布。**

## 5. 30 / 60 / 90 天建议

### 30 天：把 official P0 green 做实

目标：

```text
官方 .lime/qc/agent-qc-evidence.json 8/8 P0 pass
agent-qc:release-summary --check pass
agent-qc:audit complete
```

交付物：

- qcloop worker 环境 runbook
- GUI owner gate 稳定化
- 8 个 P0 的 structured evidence summary
- Claw cancel / streaming deep flow 的稳定 runtime transcript
- release artifact scope 明确化

### 60 天：把 Verification Contract 接入主线开发

目标：

每个 Agent / runtime / Plugin / Skill / Managed Objective 改动，都在执行计划里有 Verification Contract。

交付物：

- `internal/exec-plans` 模板
- diff -> scenario 选择规则
- P0/P1 场景推荐入口
- Evidence layer 选择口径
- Supervisor rubric 最小模板

### 90 天：做出差异验证闭环

目标：

高风险 Agent 行为可以自动比较 baseline 和 candidate。

交付物：

- flag differential harness
- benchmark plan / compare 接入 Agent QC evidence
- Supervisor semantic diff
- trend / cleanup / release summary 三侧消费同一份 evidence
- Managed Objective continuation 纳入 Agent QC 场景

## 6. 不应该做什么

不要再新建一套平行 eval 平台。

Lime 已经有 Harness、Agent QC、qcloop、Evidence Pack、Agent UI projection 和 Managed Objective。下一步要收敛，不是再分叉。

不要把 GUI smoke 当成全部。

GUI smoke 必须有，但它不能替代 runtime transcript、tool timeline、approval / sandbox、Evidence Pack 和 release artifact。

不要用 LLM judge 替代 deterministic assertion。

LLM judge 是第二层裁判，不是 schema、contract、bridge、mock、owner gate 的替代品。

不要用 isolated sidecar 覆盖 official evidence。

sidecar 可以排障，不能发布。

不要为了通过测试降低 verifier。

缺证据就补证据，不能改门槛制造绿色。

不要让 Managed Objective 变成第四套 runtime。

它只能消费 `agent turn / subagent turn / automation job`，不能新增 `objective_scheduler / objective_queue / objective_evidence_pack`。

## 7. 最后：Lime 的目标不是“多做测试”，而是“让系统能自证”

原文讲的是一个很真实的痛点：

AI Agent 开发里，真正耗时的不是写代码，而是验证。

但放到 Lime 上，我们已经不是刚刚意识到这个问题。

Lime 已经搭了很多关键部件：

- current 主链
- Harness Engine
- Agent QC
- qcloop Evidence Pack
- GUI / runtime smoke
- Agent UI projection
- Managed Objective
- release gate

现在最重要的是把这些部件咬合起来。

最终 Lime 应该达到的状态是：

```text
Agent 改代码
  -> 系统知道该跑哪些场景
  -> 场景知道需要哪些证据
  -> worker 输出结构化 evidence
  -> verifier 独立判断
  -> Evidence Pack 汇总事实
  -> Supervisor 只审模糊语义
  -> release gate 只接受完整证据
  -> 失败自动沉淀成下一次回归
```

到那一步，人的角色就不再是反复点页面、看日志、猜模型有没有变坏。

人的角色会变成：

定义什么算对，设计证据层，审核高风险判断，处理真正的产品取舍。

这才是 Lime 应该如何开发 Lime。

## 资料来源

外部主来源：

- Jason Wei, [Asymmetry of verification and verifier's law](https://www.jasonwei.net/blog/asymmetry-of-verification-and-verifiers-law)
- Yang et al., [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793)
- SWE-agent 官方项目：[https://swe-agent.com/](https://swe-agent.com/)
- OpenAI Docs, [Evals](https://platform.openai.com/docs/guides/evals)
- OpenAI Docs, [Graders for Reinforcement Fine-Tuning](https://platform.openai.com/docs/guides/graders)
- Anthropic Engineering, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Google Cloud, [Evaluate Gen AI agents](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-agents)
- Playwright Docs, [Auto-waiting](https://playwright.dev/docs/actionability)
- Playwright Docs, [Trace viewer](https://playwright.dev/docs/trace-viewer)

Lime 本地事实源：

- `internal/aiprompts/commands.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/aiprompts/harness-engine-governance.md`
- `internal/tests/agent-ops-qc.md`
- `internal/tests/agent-qc-p0-scenarios.md`
- `internal/tests/lime-agent-autonomous-test-execution-matrix.md`
- `internal/tests/lime-agent-qc-evidence-contract.md`
- `internal/tests/lime-agent-qc-current-blockers.md`
- `internal/roadmap/agentui/lime-agentui-standard-alignment.md`
- `internal/roadmap/managed-objective/README.md`
- `internal/roadmap/managed-objective/implementation-plan.md`
- `internal/test/agent-qc-scenarios.manifest.json`
- `package.json`
