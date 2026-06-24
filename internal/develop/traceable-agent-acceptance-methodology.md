# Lime 可追踪 Agent 验收方法论

> 目的：为 Lime 的 AI Agent 开发建立一套方法论级工作方式，解决“自动化检查通过但人工验收仍像黑盒”的问题。本文不是一次实现计划，也不要求读完后立即改代码；它定义的是后续设计、开发、验收和复盘时共同使用的判断框架。

## 1. 方法论定位

Lime 当前已经不是单一 GUI 或单一后端项目，而是由以下链路共同组成的 AI Agent 桌面产品：

- React / TypeScript 前端与 Workspace UI
- Electron Desktop Host / preload / DevBridge
- App Server JSON-RPC current 主链
- RuntimeCore / Agent Runtime / tools / provider routing
- SessionDetail / AgentRuntimeThreadReadModel / RequestLog
- App Server `evidence/export` 与 `agentSession/*/export`
- HarnessStatusPanel / AgentThreadReliabilityPanel / GUI smoke / Playwright E2E
- Memory / Knowledge / Skill / MCP / Artifact / Evidence 等 Agent 标准化能力

因此，Lime 的 Agent 验收不能只问：

- 页面上有没有出现结果
- 单测或 e2e 是否通过
- AI 是否自称已经完成

而必须问：

**用户目标是否沿 current 主链真实跑通，每个关键环节是否有可关联证据，失败时能否定位到明确卡点。**

本文把这个方法称为：

**Traceable Agent Acceptance Loop，可追踪 Agent 验收闭环。**

它吸收以下工程实践，但按 Lime 的 current 架构重新收敛：

- Spec-Driven Development：先定义目标、范围、验收标准，再实现。
- Context Engineering：把上下文、记忆、知识、工具、权限、预算当成 Agent 可靠性的核心输入。
- AgentOps / LLM Observability：把 LLM 调用、tool call、memory、retrieval、handoff、guardrail、UI 投影做成可观测事实。
- Eval-Driven Development / EDDOps：把验收结果沉淀成 eval、fixture、guardrail 或后续测试，而不是停在一次性人工判断。
- Human-in-the-loop：人工验收不只是“看界面”，而是对证据链做最终裁决。

## 2. 核心原则

### 2.1 证据优先于叙述

Agent 不能只说“应该写入了数据库”“理论上已经注入上下文”“从 UI 看是成功的”。

可接受的通过证据必须来自真实事实源，例如：

- App Server JSON-RPC 调用记录
- Runtime timeline item
- `SessionDetail`
- `AgentRuntimeThreadReadModel`
- 带 `session_id / thread_id / turn_id` 等关联键的 `RequestLog`
- `evidence/export` 产物
- replay / analysis / review 派生包
- DB row id / artifact path / tool result / card props
- GUI smoke 或 Playwright 的真实用户路径证据

没有证据的环节不必立刻判定功能失败，但必须判定为：

**黑盒断点，不能宣称该环节已通过验收。**

### 2.2 current 主链优先于局部成功

Lime 的 Agent 新能力默认走 current 主链：

`用户输入 -> 前端发送边界 -> Electron Desktop Host / DevBridge -> App Server JSON-RPC -> RuntimeCore / Agent Runtime -> provider / tool / memory / knowledge -> SessionDetail / ThreadReadModel -> evidence/export -> UI 投影`

如果某个验证只跑通了局部路径，例如：

- 只跑了前端 mock
- 只跑了旧 legacy command
- 只证明 DB 写入但没有证明召回注入
- 只证明 read model 有数据但 GUI 没消费
- 只证明 UI 有卡片但不知道是否来自真实模型路径

则只能声明对应局部通过，不能声明用户主目标通过。

### 2.3 验收链不是测试替代品

可追踪验收链解决的是“这次真实路径是否清楚”，不是“所有未来回归都已覆盖”。

两者关系如下：

| 层级 | 主要问题 | Lime 入口 |
| --- | --- | --- |
| 单测 / 组件测试 | 局部逻辑是否正确 | `npm test`、定向 `*.unit.test.ts`、`*.test.tsx` |
| 契约测试 | 前后端、bridge、protocol 是否一致 | `npm run test:contracts` |
| fixture smoke | current runtime fixture 是否跑通 | `npm run smoke:agent-runtime-current-fixture` 等 |
| GUI smoke / E2E | 用户主路径是否可操作 | `npm run verify:gui-smoke`、Playwright |
| 可追踪验收链 | 关键链路是否可解释、可定位、可复盘 | evidence pack、trace、DB、UI、人工裁决 |

验收链发现的缺口，应沉淀回测试、eval、guardrail、文档或执行计划。

### 2.4 先限定阶段，再进入实现

当处于 `design / goal / review / acceptance` 等阶段锁定时，必须先说明本轮只做什么。

典型阶段：

- `design`：只建模链路、证据、判据，不改代码。
- `goal`：基于已确认设计实施最小闭环。
- `acceptance`：只跑验收链，判断通过、部分通过或黑盒断点。
- `regression`：把已发现缺口沉淀为测试、eval 或守卫。

阶段锁定的意义是防止 Agent 在“梳理验收链”时顺手改代码、补测试、扩文档，导致主目标漂移。

## 3. 统一模型

一次 Lime Agent 能力验收，至少要同时看五条链。

### 3.1 目标链

回答用户到底要完成什么。

格式：

```text
用户目标 -> 成功行为 -> 可见结果 -> 不做范围 -> 风险边界
```

示例：

```text
用户希望 Memory 能在新任务里召回上轮保存的信息。
成功行为不是“DB 有记录”，而是“新任务真实召回、注入上下文、大模型回答可使用该信息，UI 显示 memory_recall 证据”。
```

### 3.2 上下文链

回答 Agent 本轮拿到了什么上下文，以及这些上下文是否可信、是否应该进入模型。

典型节点：

- 用户输入
- scope / provider / feature flag
- Memory / Knowledge / Skill / MCP / file context
- retrieval / ranking / refinement
- prompt envelope / request metadata
- context budget / redaction / trust boundary

验收重点：

- 上下文来源是否是 current owner
- 是否存在 mock 或 legacy fallback
- 是否有 source id / pack id / memory id / artifact ref
- 是否能证明该上下文实际进入模型请求
- 是否避免保存 chain-of-thought、密钥、完整敏感 prompt

### 3.3 运行链

回答请求如何穿过 Lime current runtime。

典型节点：

```text
UI 输入
-> frontend send action
-> DevBridge / Electron Desktop Host
-> App Server JSON-RPC
-> RuntimeCore / Agent Runtime
-> provider request
-> tool / memory / knowledge / artifact action
-> runtime event
-> SessionDetail / ThreadReadModel
-> UI projection
```

验收重点：

- 是否走 App Server current method
- 是否绕开旧 `agent_runtime_*` 或 legacy facade
- 是否存在生产 mock fallback
- 是否有 session / thread / turn 关联键
- 是否能从后端事实源解释 UI 状态

### 3.4 证据链

回答“凭什么说它发生了”。

证据链不应该由 UI 反推，而应优先从运行时事实导出：

```text
SessionDetail
-> AgentRuntimeThreadReadModel
-> RequestLog correlation
-> evidence/export
-> replay / analysis / review
-> GUI panel
```

验收重点：

- evidence pack 是否只导出真实发生过的信号
- 不适用的信号是否保持缺省，而不是硬写 known gap
- request telemetry 是否能按关联键 join
- replay / analysis / review 是否复用同一 evidence pack
- GUI 面板是否只是消费层，不反向定义事实

### 3.5 回归链

回答这次验收结果如何变成下一次不再靠人工记忆的资产。

可能沉淀为：

- 定向单测
- component / view model 回归
- App Server protocol / client 测试
- `test:contracts`
- fixture smoke
- GUI smoke / Playwright 场景
- eval case
- guardrail / governance check
- 执行计划或技术债条目

如果一次验收发现了黑盒断点，但没有产生任何可追踪后续资产，这次验收只算一次人工观察，不算完整闭环。

## 4. 标准流程

### 4.1 Phase Lock：锁定本轮目标

先用 3-8 行写清：

- 主线目标
- 当前阶段
- 本轮只做什么
- 明确禁止什么
- 退出条件

示例：

```text
主线目标：证明 Memory 保存到召回注入的真实链路是否可验收。
当前阶段：acceptance。
本轮目标：建立可追踪验收链并判定已通过、部分通过或黑盒断点。
禁止范围：不改代码、不新增测试、不落执行计划。
退出条件：给出每个关键节点的证据、判据和下一刀。
```

### 4.2 Spec：写清验收对象

验收对象必须以用户目标表达，而不是以内部分层表达。

推荐格式：

```text
作为用户，我希望：
当我完成 A 后，在 B 场景下系统能自动使用 A 的有效信息，
并在 C 处给出可见反馈，
这样我能确认系统不是只保存了数据，而是真的参与了新任务。
```

### 4.3 Chain Map：画出主链路

把链路写成节点序列，不要先写大段解释。

示例：

```text
用户输入
-> memory 开关 / scope / provider 判断
-> LLM intent / extract
-> 候选记忆
-> 清洗过滤
-> 去重合并
-> canonical.db 写入
-> memory_save 卡片
-> 新任务输入
-> recall query
-> 检索排序
-> recall refine
-> 注入上下文
-> 大模型回答
-> memory_recall 卡片
-> MemoryTab 可见状态
```

### 4.4 Evidence Contract：为每个节点声明证据

每个节点至少要有五列：

| 节点 | current owner | 可观测证据 | 通过判据 | 失败分类 |
| --- | --- | --- | --- | --- |
| memory extract | Runtime / provider path | LLM request/response 摘要、parsed candidate id | 候选记忆包含目标事实且无敏感泄露 | context / extraction |
| canonical write | memory store | row id、hash、timestamp | 写入一次且 dedupe 正确 | persistence |
| recall query | Runtime prompt contributor | query、selected memory ids | 新任务触发真实 recall | recall |
| context injection | prompt envelope | request metadata / redacted prompt snapshot | 召回内容进入模型上下文 | context injection |
| UI card | frontend projection | card props、visible text、source id | `memory_recall` 与后端 source id 一致 | UI projection |

没有证据列的节点，不允许出现在“已通过”结论里。

### 4.5 Acceptance Run：跑真实路径

验收优先级：

1. current App Server / RuntimeCore 真实路径
2. fixture backend 路径
3. GUI smoke / Playwright 真实点击路径
4. 单元或组件层补充证明

禁止把下面这些当作主验收通过：

- 生产路径 mock
- AI 自报完成
- 只看截图不看事实源
- 只看 DB 不看召回
- 只看 read model 不看 GUI
- 只看旧 legacy command

### 4.6 Verdict：给出分级结论

验收结论分四级：

| 级别 | 含义 | 可接受表述 |
| --- | --- | --- |
| Pass | 用户目标主链路全部有证据 | “保存、召回、注入、回答、UI 卡片均在真实路径证实。” |
| Partial | 局部通过，主链仍有断点 | “保存链路通过，召回注入链路未证实。” |
| Evidence Gap | 功能可能存在，但缺可观测证据 | “无法证明该节点真实发生，不能宣称通过。” |
| Fail | 已有证据证明行为错误 | “DB 写入成功，但新任务 recall query 没有命中该 memory id。” |

结论必须写具体节点，避免只说“基本通过”“看起来没问题”。

### 4.7 Regression Hook：沉淀后续资产

每个 `Partial / Evidence Gap / Fail` 都要转成一种后续资产：

| 缺口 | 后续资产 |
| --- | --- |
| spec 不清 | PRD / roadmap / exec plan 更新 |
| current owner 不清 | governance 文档或边界守卫 |
| 协议不一致 | `test:contracts` / protocol test |
| GUI 投影缺证据 | component test / GUI smoke / Playwright |
| Runtime 事件缺失 | App Server / RuntimeCore 定向测试 |
| LLM 行为不稳定 | eval case / fixture / human review rubric |
| evidence 不可 join | RequestLog correlation / evidence export 修正任务 |

## 5. 触发条件

不是所有改动都要完整跑可追踪验收链。

必须触发：

- 新增或修改 Agent Runtime / Query Loop / tool / provider routing
- 新增或修改 Memory / Knowledge / Skill / MCP / Artifact / Evidence 主链
- 涉及 App Server JSON-RPC、Electron bridge、preload、DevBridge 的链路改动
- 用户可见 GUI 结果依赖后端状态投影
- 出现“自动化通过但人工验收差异大”
- 出现“看 UI 成功，但不知道内部是否真实发生”
- 涉及生产路径不能 mock 的能力
- 涉及 human approval、权限、密钥、文件写入、外部网络或长期状态

建议触发：

- 复杂功能第一次进入验收
- 长链路功能做阶段收口
- 修复曾经发生过的线上或人工验收黑盒问题
- 需要把一次人工验收沉淀为后续 eval / smoke / guardrail

不必完整触发：

- 纯文案修正
- 无状态 UI 微调
- docs-only 更新
- 已有定向测试能完全覆盖的纯函数调整

## 6. Lime 常见链路模板

### 6.1 Memory 链路

```text
用户输入
-> memory 开关 / scope / provider
-> extract / intent
-> candidate memory
-> clean / filter
-> dedupe / merge
-> canonical store
-> save event / save card
-> 新任务输入
-> recall query
-> retrieval / ranking
-> refine
-> prompt injection
-> model answer
-> recall event / recall card
-> MemoryTab 状态
```

最低结论边界：

- 只证明 `canonical store`，只能说保存成功。
- 只证明 `memory_save card`，不能说召回成功。
- 只有新任务真实 recall、注入和回答都证实，才能说 Memory 用户目标通过。

### 6.2 Knowledge 链路

```text
资料导入
-> KnowledgePack source
-> compile / status
-> context resolution
-> selected files / anchors
-> fenced knowledge context
-> Agent turn request metadata
-> model answer
-> source grounded output
-> runs/context-*.json / validate
```

最低结论边界：

- `knowledgeContext/resolve` 是 runtime context resolver 事实源。
- File Manager、资料图标、首页入口只是入口或维护面，不是上下文注入事实源。
- 只有 fenced context 与 selected source anchors 能被追踪，才算上下文链可解释。

### 6.3 Tool / Skill 链路

```text
用户意图
-> catalog / binding
-> request metadata
-> tool surface
-> permission / approval
-> execution
-> tool result
-> timeline item
-> artifact / card / viewer
-> evidence export
```

最低结论边界：

- catalog 命中不等于工具已执行。
- 工具执行不等于用户可见结果已正确投影。
- viewer 不能反向定义底层 task 或 artifact truth。

### 6.4 Artifact 链路

```text
Agent 产生 artifact snapshot
-> runtime event
-> timeline FileArtifact
-> sidecar version / checkpoint
-> workspace projection
-> viewer / workbench
-> evidence / replay
```

最低结论边界：

- 只证明文件存在，不等于 Artifact 主链通过。
- 只证明 GUI 有文件卡，不等于 sidecar / checkpoint 可回放。
- 需要同时证明 runtime event、持久化、GUI 投影和 evidence 可导出。

### 6.5 Harness / Evidence 链路

```text
SessionDetail
-> ThreadReadModel
-> RequestLog correlation
-> evidence/export
-> replayCase/export
-> analysisHandoff/export
-> reviewDecisionTemplate/export
-> HarnessStatusPanel
```

最低结论边界：

- evidence pack 是事实源。
- replay / analysis / review 是派生物。
- GUI panel 是消费层。
- 不允许 analysis、review 或 UI 自己再拼第二套 observability truth。

## 7. 失败分类

验收结论中的失败原因默认使用以下分类，避免泛泛写“没跑通”。

| 分类 | 含义 |
| --- | --- |
| `spec_gap` | 目标、范围、验收标准不清 |
| `context_gap` | 上下文来源、预算、注入或裁剪不清 |
| `routing_gap` | provider、model、tool、skill 或 App Server method 路由错误 |
| `protocol_gap` | 前端、Electron、App Server、client、catalog 不一致 |
| `mock_leakage` | 生产验收路径误用了 mock / fallback / legacy |
| `persistence_gap` | DB、sidecar、artifact、checkpoint 或状态持久化缺失 |
| `recall_gap` | memory / knowledge / retrieval 未真实命中或未进入模型 |
| `projection_gap` | 后端事实存在，但 UI / card / viewer 没正确展示 |
| `evidence_gap` | 功能可能发生，但缺少可关联证据 |
| `eval_gap` | 没有把行为沉淀为可重复 eval / fixture / smoke |
| `policy_gap` | approval、权限、redaction、retention 或敏感信息边界不清 |

## 8. 面向 AI 结对的提示模板

### 8.1 进入设计阶段

```text
进入 Lime 可追踪 Agent 验收链设计阶段。

只做方法建模，不改代码、不新增测试、不落执行计划。

请输出：
1. 用户目标
2. current 主链路节点
3. 每个节点的 current owner
4. 每个节点需要的可观测证据
5. 通过 / 失败判据
6. 黑盒断点
7. 下一步最小验收动作

禁止用“应该、理论上、看起来、可能”作为通过证据。
```

### 8.2 进入验收阶段

```text
进入 Lime 可追踪 Agent 验收阶段。

请基于真实 current 路径判断，不要用 mock、legacy、AI 自报或单纯截图替代证据。

输出格式：
- Pass / Partial / Evidence Gap / Fail
- 已证实节点
- 未证实节点
- 失败分类
- 证据位置
- 下一刀应该沉淀成测试、eval、guardrail、文档还是执行计划
```

### 8.3 进入复盘阶段

```text
进入 Lime Agent 验收复盘。

请把本次验收中的黑盒断点转成可维护资产：
1. 哪些应进入自动化测试
2. 哪些应进入 eval / fixture
3. 哪些应进入 evidence/export 或 RequestLog correlation
4. 哪些应进入治理规则
5. 哪些只是人工验收备注，不应扩大成主线任务
```

## 9. 反模式

以下行为视为方法论失效：

- 只看最终 UI，不看 runtime / evidence / read model。
- 只看 DB 写入，就宣称用户目标通过。
- 只跑 AI 自动生成测试，就跳过人工证据链复核。
- 用 mock / fallback / legacy 路径证明 current 产品能力。
- 让分析、review、UI 面板各自拼一套运行时事实。
- 没有 request correlation，却声称已有会话级 telemetry。
- 把所有未接信号都硬写成 known gaps，而不判断适用性。
- 把一次人工验收结论留在聊天里，没有转成任何后续资产。
- 在 design 阶段顺手改代码，或在 acceptance 阶段顺手扩大治理清理。
- 为了让链路看起来完整，输出不存在的 trace、span、DB row 或测试结果。

## 10. 与现有文档的关系

本文只定义方法论，不替代以下 current 文档：

- `AGENTS.md`：仓库级开发规则和硬约束。
- `internal/aiprompts/quality-workflow.md`：提交前质量入口和不同改动的验证选择。
- `internal/aiprompts/command-runtime.md`：`@` / `/` / ServiceSkill / viewer 主链。
- `internal/aiprompts/state-history-telemetry.md`：State / History / Telemetry current 主链。
- `internal/aiprompts/harness-engine-governance.md`：evidence / replay / analysis / review 的事实源治理。
- `internal/aiprompts/memory-compaction.md`：记忆、压缩和上下文主链。
- `internal/aiprompts/persistence-map.md`：文件持久化与 artifact checkpoint 主链。
- `internal/aiprompts/agent-protocol-standards-map.md`：Agent Runtime / Context / Evidence / Policy / Tool 等标准地图。

使用顺序建议：

```text
先用本文判断“这次是否需要可追踪验收链”
-> 再按对应 aiprompts 文档确认 current owner
-> 再选择最小验证入口
-> 最后把缺口沉淀到测试、eval、guardrail 或执行计划
```

## 11. 外部方法论参考

这些外部实践只作为方法论来源，不直接覆盖 Lime 的 current 边界：

- Spec-Driven Development：先规格、后实现，适合 AI 编程 agent 的目标锁定。
- Context Engineering：把上下文、工具、记忆、检索、预算、信任边界作为 Agent 可靠性的核心。
- AgentOps / LLM Observability：用 trace、span、tool call、prompt/request metadata、eval outcome 解释 Agent 行为。
- Eval-Driven Development / EDDOps：把人工发现的问题沉淀为持续 eval、fixture 和回归信号。
- 12-Factor Agents / Effective Agents：优先小而可组合的 workflow，避免过早堆复杂自治 agent。

Lime 的落地口径只有一句：

**外部方法论提供方向；Lime 的事实源必须回到 App Server current 主链、RuntimeCore、SessionDetail / ThreadReadModel、RequestLog、evidence/export 和 GUI current 消费层。**

