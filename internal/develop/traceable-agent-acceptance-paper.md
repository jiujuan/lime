# 从黑盒验收到可追踪闭环：面向 Lime 的 AI Agent 开发验收方法研究

## 摘要

AI Agent 开发正在从“单次 prompt 生成代码”转向“长期目标、工具调用、记忆、知识、文件、浏览器、GUI 与人类协作共同组成的复合系统”。在这类系统中，传统的单元测试、端到端测试和人工界面验收仍然必要，但已经不足以解释一个真实用户目标是否沿内部链路完整发生。Lime 当前的 Agent 产品形态正处于这一复杂区间：用户看到的是聊天、卡片、工作台和状态面板；内部却跨越 Electron Desktop Host、App Server JSON-RPC、RuntimeCore、Provider、Memory、Knowledge、Artifact、Evidence 与 Harness 等多条事实链。本文提出“可追踪 Agent 验收闭环”作为 Lime 的方法论补充：以用户目标为入口，以 current 主链为约束，以上下文、运行时、证据和回归资产为核心，将一次人工验收转化为可解释、可定位、可复盘、可沉淀的工程闭环。

## 1. 引言

AI 辅助开发早期最常见的风险，是模型生成的代码存在局部错误。对应的工程解法相对直接：lint、typecheck、unit test、review、CI。随着 AI Agent 进入真实产品，风险形态发生了变化。错误不再只发生在某个函数内部，而是发生在一条长链路上：

```text
用户目标
-> prompt / request metadata
-> context selection
-> model routing
-> tool call
-> memory / knowledge / artifact side effect
-> runtime event
-> session read model
-> evidence export
-> GUI projection
-> human acceptance
```

链路越长，越容易出现一种新的验收困境：

**外部结果看似存在，内部路径却不可解释；自动化测试看似通过，人工验收仍然发现关键语义没有跑通。**

例如 Memory 能力中，保存链路可能已经通过：用户输入被提炼成候选记忆，清洗后写入 canonical store，界面显示 `memory_save` 卡片。但这并不等于用户目标已经完成。用户真正需要的是：新任务中系统能召回该记忆，将它注入模型上下文，让最终回答受其影响，并在 UI 中展示 `memory_recall` 证据。如果后半段没有真实运行或没有证据，则“保存成功”不能被包装成“记忆能力验收通过”。

这类问题不是 Lime 独有，而是新一代 Agent 产品的普遍问题。本文讨论的不是如何增加更多测试，而是如何在测试、可观测性、人工验收和后续回归之间建立一条方法论级连接。

## 2. 问题定义

### 2.1 黑盒验收

本文所说的“黑盒验收”不是传统测试理论中的 black-box testing，而是 AI Agent 开发中的一种工程状态：

```text
用户或开发者只能看到最终 UI 或最终文本，
却无法判断关键内部环节是否真实发生，
也无法在失败时定位断点。
```

在 Lime 中，黑盒验收常见于以下场景：

- UI 出现结果卡片，但不清楚卡片来自真实 current path 还是 mock / fallback。
- DB 出现记录，但不清楚后续 recall、rank、prompt injection 是否发生。
- Agent 输出符合预期，但不清楚它是否使用了 Knowledge / Memory / Tool 证据。
- 单测覆盖了 parser 或 reducer，但真实 Electron -> App Server -> RuntimeCore 链路没有跑。
- evidence pack 存在，但 request telemetry 无法通过 session / thread / turn 关联。
- GUI 面板显示健康状态，但状态不是从后端事实源派生，而是前端局部推断。

### 2.2 自动化不足

自动化测试不是问题本身。问题在于，长链路 Agent 功能通常跨越多种事实层：

- 代码逻辑层
- 协议契约层
- 运行时事件层
- 状态投影层
- 证据导出层
- GUI 展示层
- 人工语义判断层

单一测试形态很难同时覆盖这些层。单元测试适合证明局部算法，契约测试适合证明边界一致，GUI smoke 适合证明操作可达，eval 适合证明输出质量。但它们都不能自动回答一个更高阶的问题：

**这些证据是否共同证明了用户目标沿 current 主链完整发生？**

### 2.3 AI 结对开发中的沟通损耗

AI 结对编程让实现速度提升，但也放大了沟通中的语义丢失。人类经常以场景方式表达需求，模型则倾向于拆成局部实现动作。对于 UI 问题，方位和关键词通常足够；对于功能性问题，仅描述页面现象则远远不够。

更有效的沟通方式是：

```text
UI 靠方位 + 关键词；
功能性靠关键点 + 链路环节；
验收靠证据 + 判据。
```

因此，方法论需要给人和 AI 一个共同语言：不是“帮我验收一下”，而是“请按链路节点给出证据、判据和黑盒断点”。

## 3. 相关方法

本文方法不是从零发明，而是对多种 AI Agent 工程实践的组合与本地化。

### 3.1 Spec-Driven Development

Spec-Driven Development 强调在编码前先明确目标、范围、设计和验收标准。它对 AI 编程尤其重要，因为 Agent 很容易根据模糊 prompt 扩大范围或跳过隐含约束。Lime 的 Phase Lock、OpenSpec、exec plan 和 roadmap 机制都与此方向一致。

在本文中，spec 的作用不是写长文档，而是先定义：

- 用户目标
- 非目标
- 成功行为
- 证据要求
- 退出条件

### 3.2 Context Engineering

Agent 的可靠性很大程度取决于上下文：用户输入、系统指令、工具列表、记忆、知识、文件、运行环境、权限、历史摘要和 token 预算。Context Engineering 把这些输入视为可设计、可验证、可治理的系统组件，而不是 prompt 附属物。

Lime 的 Memory、Knowledge、Skills、MCP、Agent Knowledge、context resolution、prompt contributor 都属于这一层。

### 3.3 AgentOps 与 LLM Observability

AgentOps 强调对 Agent 生命周期进行观测：模型请求、工具调用、检索结果、状态变化、错误、成本、延迟、人工介入、输出质量。与传统服务 observability 不同，LLM observability 还要记录 prompt version、context source、tool call input/output、eval score 和 human feedback。

Lime 已经具备相关基础：

- `SessionDetail`
- `AgentRuntimeThreadReadModel`
- `RequestLog`
- App Server `evidence/export`
- `agentSession/*/export`
- HarnessStatusPanel
- AgentThreadReliabilityPanel

本文方法要求这些事实源成为验收语言的一部分。

### 3.4 Eval-Driven Development / EDDOps

LLM 系统的输出存在非确定性，人工验收不能每次从零开始。Eval-Driven Development 的核心，是把观察到的行为转化为可重复评价的样本、规则或评分机制。

在 Lime 中，这意味着一次人工发现不应停留在聊天记录中，而应沉淀为：

- eval case
- fixture smoke
- GUI smoke 场景
- protocol / contract test
- evidence export guard
- review rubric
- 执行计划中的可跟踪缺口

### 3.5 Human-in-the-loop

Agent 系统不能完全消除人工判断，尤其在创作、上下文选择、权限、文件写入、发布交付和长期记忆场景中。关键变化是：人工不再只看最终结果，而是审核证据链。

人工验收的角色从“试用者”升级为“证据裁决者”。

## 4. 方法模型：可追踪 Agent 验收闭环

本文提出的模型包含六个连续动作：

```text
Spec
-> Context Contract
-> Chain Map
-> Evidence Contract
-> Acceptance Verdict
-> Regression Hook
```

### 4.1 Spec

Spec 定义验收对象。它必须以用户目标表达，而不是以内部分层表达。

错误表达：

```text
验证 canonical.db 是否写入。
```

更好的表达：

```text
验证用户在上一轮表达的稳定偏好，能否在新任务中被召回、注入上下文、影响回答，并在 UI 中给出可见证据。
```

### 4.2 Context Contract

Context Contract 定义本轮 Agent 应该看到什么、不应该看到什么，以及这些上下文来自哪里。

在 Lime 中，至少包括：

- Memory scope
- KnowledgePack / context resolution
- Skill binding / tool surface
- MCP resource / tool
- project / workspace / file context
- model / provider / routing
- permission / approval
- redaction / retention

如果上下文来源不可追踪，后续模型回答即使正确，也不能证明系统能力正确。

### 4.3 Chain Map

Chain Map 是长链路节点图。它不追求覆盖所有内部细节，而是覆盖用户目标成立所需的关键节点。

Memory 示例：

```text
用户输入
-> extract
-> clean / dedupe
-> canonical store
-> save card
-> new task
-> recall query
-> retrieval / rank
-> prompt injection
-> model answer
-> recall card
-> MemoryTab
```

Artifact 示例：

```text
tool result
-> artifact snapshot
-> timeline item
-> sidecar checkpoint
-> workspace projection
-> viewer
-> evidence / replay
```

### 4.4 Evidence Contract

Evidence Contract 为每个节点绑定证据。

一个节点只有同时具备以下要素，才算可验收：

- current owner
- evidence source
- pass criterion
- failure category
- downstream asset

例如：

| 节点 | current owner | evidence source | pass criterion |
| --- | --- | --- | --- |
| recall query | Runtime prompt contributor | request metadata、timeline、trace | 新任务触发真实 recall，query 与用户任务相关 |
| prompt injection | RuntimeCore / provider request | redacted prompt snapshot、context refs | memory id 出现在模型上下文引用中 |
| recall card | frontend projection | card props、source id、GUI evidence | UI 卡片与后端 memory source 一致 |

### 4.5 Acceptance Verdict

验收结论必须分级：

- `Pass`：目标链路全部有证据。
- `Partial`：局部通过，但主链路仍有断点。
- `Evidence Gap`：功能可能发生，但没有足够证据。
- `Fail`：已有证据证明行为错误。

这种分级能避免两个常见极端：

- 把局部成功夸大成整体通过。
- 因为一个证据缺口就否定所有已完成工作。

### 4.6 Regression Hook

每个缺口都要转成后续资产，否则验收只是一场临时观察。

转换规则：

```text
spec_gap -> PRD / exec plan / acceptance criteria
context_gap -> context contract / prompt metadata / resolver guard
protocol_gap -> test:contracts / schema / client test
mock_leakage -> current path guard / GUI smoke
evidence_gap -> evidence/export / RequestLog correlation
eval_gap -> eval case / fixture / review rubric
projection_gap -> component test / Playwright / GUI smoke
```

## 5. Lime 案例分析

### 5.1 Memory 保存成功不等于记忆能力通过

假设一次验收得到以下结论：

```text
prompt -> LLM extract -> canonical.db 写入 -> memory_save card 通过
MemoryTab 可见 -> 新任务 recall -> 注入 -> 大模型回答 -> memory_recall card 未在真实模型路径跑通
```

按照传统界面验收，开发者可能看到“有保存卡片”和“MemoryTab 有记录”，便认为功能已经可用。

按照本文方法，只能判定为：

```text
Partial。
保存链路通过；
召回、注入、回答、recall UI 证据链未通过；
用户目标尚未完成。
```

这一区分很重要。因为 Memory 的用户价值不是“系统保存了什么”，而是“系统在未来任务中正确使用了什么”。

### 5.2 Evidence pack 不是报表，而是事实源

Lime 的 Harness Engine 已经规定：

```text
runtime thread/session
-> evidence pack
-> replay / analysis / review / summary
-> trend / cleanup / dashboard
-> UI
```

这意味着验收时不能让 analysis、review、UI 面板各自重建事实。否则，同一个线程会出现多套互相冲突的“真相”：

- 后端 evidence 说没有 request telemetry
- analysis handoff 说存在 telemetry gap
- UI panel 又显示已健康

本文方法要求所有验收判断先回到 evidence pack 与 current read model。

### 5.3 GUI 可见不等于产品可交付

Lime 是 GUI 桌面产品，因此不能只以 lint、typecheck、unit test 作为交付依据。但反过来，GUI 可见也不等于功能通过。

更合理的判断是：

```text
后端事实源证明发生
-> read model 稳定投影
-> evidence 可导出
-> GUI 正确消费
-> 用户路径可操作
```

任何一层缺失，都应写清楚是 `persistence_gap`、`projection_gap`、`evidence_gap` 还是 `gui_gap`。

## 6. 讨论

### 6.1 方法的收益

第一，降低黑盒概率。  
开发者不再只问“结果有没有”，而是问“链路哪些节点有证据”。

第二，提高 AI 结对效率。  
当人类用链路节点和证据判据表达需求时，Agent 更容易做出可验证的工作，而不是生成大段自信总结。

第三，改善持续迭代。  
每次验收发现的缺口都能转为下一次测试、eval、guardrail 或计划项，避免同类问题反复靠人工记忆。

第四，保护 current 主链。  
Lime 当前有大量 legacy / compat / deprecated / dead 边界。可追踪验收要求每个节点说明 current owner，能防止旧路径回流。

### 6.2 方法的成本

这套方法不是免费的。它会增加建模和证据整理成本。如果所有微小改动都完整执行，会拖慢迭代。

因此，本文主张按风险触发：

- 长链路触发
- Agent runtime 触发
- Memory / Knowledge / Tool / Artifact / Evidence 触发
- GUI 与后端状态强耦合触发
- 自动化通过但人工差异大时触发

纯文案、低风险 UI 微调、已被单测完全覆盖的纯函数改动，不需要完整验收链。

### 6.3 方法的边界

可追踪验收链不能保证：

- 所有输入都正确
- 所有模型输出都稳定
- 所有未来回归都不会发生
- 人工判断完全客观

它能保证的是：

```text
本次关键用户路径有哪些节点已被证据证明；
哪些节点仍是黑盒；
下一步应该补哪里。
```

换言之，它不是形式化证明，而是工程可解释性。

## 7. 对 Lime 开发流程的建议

### 7.1 将验收语言标准化

后续 Agent 相关讨论中，应减少以下表达：

- “看起来可以了”
- “应该已经写入了”
- “理论上会召回”
- “测试通过所以没问题”

改为：

- “保存链路通过，召回链路未证实”
- “UI 投影通过，但 evidence export 缺失”
- “真实 current path 未跑，只能算 fixture 通过”
- “这是 evidence_gap，不是功能 pass”

### 7.2 将验收资产化

每次重要人工验收结束后，至少留下一个资产：

- 一条 eval
- 一个 fixture
- 一个 smoke 场景
- 一个 contract guard
- 一个 evidence export 改进项
- 一个 exec plan 缺口

没有资产化的验收，很难成为团队能力。

### 7.3 将 EAC 收敛为方法中的一个环节

“Explainable Acceptance Chain / 可解释验收链”这个名字可以作为沟通入口，但不宜作为完整方法论。更准确的关系是：

```text
EAC 是 Acceptance Verdict 前的链路解释动作；
Traceable Agent Acceptance Loop 才是完整闭环。
```

前者回答“链路是否可解释”，后者还回答“如何进入 spec、context、evidence、eval 和后续回归”。

## 8. 结论

AI Agent 产品的工程难点，正在从“代码能不能生成”转向“复杂链路是否可解释、可验证、可持续演进”。Lime 当前的架构已经具备构建这套方法的基础：App Server current 主链、RuntimeCore、SessionDetail、ThreadReadModel、RequestLog、evidence/export、Harness 面板和多层质量入口。真正需要补齐的，是把这些能力组织成一种稳定的验收语言。

本文提出的可追踪 Agent 验收闭环，将用户目标、上下文契约、运行链路、证据契约、验收裁决和回归资产连接起来。它不替代单测、e2e 或人工验收，而是让三者之间形成可解释连接。

对 Lime 而言，最终目标不是让 AI 在开发完成后写一段漂亮总结，而是让每一次关键 Agent 能力都能回答：

```text
它走的是哪条 current 主链？
每个关键节点的证据在哪里？
哪些节点已经通过？
哪些节点仍是黑盒？
这个结论会如何沉淀为下一次不用重复人工判断的资产？
```

只有当这些问题能被稳定回答，Lime 的 AI Agent 开发才真正从“功能交付”进入“可追踪、可复盘、可演进的 Agent 工程系统”。

## 参考资料

- Martin Fowler：Spec-Driven Development 相关实践，`https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html`
- Thoughtworks：Spec-driven development and new engineering practices，`https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices`
- Kiro：Spec-driven AI IDE，`https://kiro.dev/`
- OpenSpec：Spec-driven change workflow，`https://openspec.dev/`
- Anthropic：Effective context engineering for AI agents，`https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents`
- LangChain：Context engineering for agents，`https://www.langchain.com/blog/context-engineering-for-agents`
- OpenAI：Evaluation best practices，`https://developers.openai.com/api/docs/guides/evaluation-best-practices`
- Anthropic：Demystifying evals for AI agents，`https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents`
- LangSmith Observability，`https://docs.langchain.com/langsmith/observability`
- Langfuse Observability，`https://langfuse.com/docs/observability/overview`
- OpenAI Agents SDK Tracing，`https://openai.github.io/openai-agents-python/tracing/`
- HumanLayer：12-Factor Agents，`https://github.com/humanlayer/12-factor-agents`
- Anthropic：Building effective agents，`https://www.anthropic.com/research/building-effective-agents`

