# Lime 应该如何开发 Lime：把 90% 的验证变成系统能力

> 状态：research synthesis
> 更新时间：2026-07-02
> 来源：`ai-agent-verification-original.md`、`internal/aiprompts/overview.md`、`internal/aiprompts/commands.md`、`internal/aiprompts/quality-workflow.md`、`internal/aiprompts/harness-engine-governance.md`、`internal/tests/agent-ops-qc.md`
> 目标：把“AI Agent 开发中 90% 时间耗在验证上”的问题，翻译成 Lime 自身研发应该遵守的工程方法。

Lime 现在最容易掉进去的坑，不是不会写功能。

恰恰相反，是功能越来越容易被写出来。

一个 Agent App、一条 App Server method、一个前端入口、一个 runtime metadata 字段、一个 Harness 面板，看起来都可以让 AI 很快生成。但真正消耗时间的地方不在这里。

真正消耗时间的是：我们怎么知道这次改动没有把 Lime 悄悄改坏？

尤其 Lime 不是一个普通网页。它是本地优先的 AI Agent 桌面工作台，里面有 Electron Desktop Host、App Server JSON-RPC、RuntimeCore、Workspace、Skills、MCP、Evidence Pack、Agent App、GUI smoke、Playwright、qcloop、release evidence。

任何一个功能只在页面上“看起来能点”，都不等于它真的进入了 Lime 的 current 主链。

所以，原文里讲的“把 90% 的手动验证变成可重复体系”，对 Lime 不是一个写作选题，而应该变成我们开发 Lime 的默认方式。

## 先承认：Lime 的用户不只有人

Lime 的第一类用户当然是创作者、内容团队和轻知识工作者。

但从研发视角看，Lime 还有另一类越来越重要的用户：Agent。

这个 Agent 可能是 Codex，也可能是 Lime 自己未来的自动化研发 / 测试 / 复盘能力。它不是来“看页面”的，它要完成的是另一类动作：

- 读懂一次会话真实发生了什么
- 判断一个工具是否真的触发
- 比较 feature flag 开关前后的行为差异
- 导出 Evidence Pack，交给 replay、analysis、review 复用
- 在失败时定位是 runtime、bridge、GUI、mock fallback 还是 Provider 问题

如果 Lime 的信息只存在 UI 里，Agent 就只能像人一样盯着屏幕猜。

这就是手动验证的根。

所以 Lime 的架构第一条不是“多写测试”，而是：

**Lime 必须先成为一个对 Agent 友好的系统。**

## 对 Agent 友好，不等于让 Agent 多点页面

最直观的办法是让 Agent 通过浏览器或 MCP 去模拟人的点击。

这有价值，但它不能成为 Lime 的主验证结构。

原因很简单：点击页面只能证明“某个表面现象出现了”，不能稳定证明后端事实已经正确沉淀。

Lime 当前已经有更清晰的主链：

```text
组件 / Hook
  -> src/lib/api/* 网关
  -> safeInvoke / AppServerClient
  -> Electron Desktop Host bridge
  -> App Server JSON-RPC
  -> RuntimeCore / backend
  -> Evidence Pack / read model / replay / analysis / review
```

这条链路的价值，就是让 Agent 不必只靠眼睛看。

它可以读 protocol、读 read model、读 runtime event、读 evidence/export、读 agentSession/*/export。

GUI 仍然重要。Lime 是桌面产品，不能只用 lint、typecheck、单测宣称交付。

但 GUI 应该是产品表面的验证，不应该是唯一事实源。

真正的事实源应该在 App Server、RuntimeCore、read model 和 Evidence Pack 里。

这也是为什么 Electron 只能做 Desktop Host bridge，不能变成第二套后端。否则 Agent 面对的不是一个系统，而是一堆互相遮挡的入口。

## 每个功能都要先有 Happy Path

我们以后开发 Lime，不能只写“我要加一个功能”。

更准确的表达应该是：

**我要固化一条新的 Happy Path。**

比如新加一个 Agent App 安装能力，Happy Path 不是“页面上多一个按钮”。它至少应该说清楚：

- 用户从哪里触发
- 前端调用哪个 `src/lib/api/*` 网关
- App Server method 是什么
- RuntimeCore 或服务层写入什么状态
- read model 能读回什么
- Evidence Pack 里应该留下什么
- GUI 上用户最终能看到什么
- 失败时错误应该停在哪一层

这就是新功能的验收标准。

如果 Happy Path 说不清楚，代码越多越危险。

因为 AI 很擅长填空。你没有定义“什么算对”，它就会用最容易写出来的方式把空填上。

对 Lime 来说，这通常意味着：

- 页面直接 `safeInvoke`
- Electron main 里顺手补业务逻辑
- App Server 没有 protocol 事实源
- mock fallback 看起来能跑
- 旧 compat 命令又被接回生产路径
- GUI 绿了，但 evidence 里没有真实事实

这类问题不是代码风格问题，而是验证体系没有先行。

## 确定性的交给断言，模糊的交给 Supervisor

Agent 系统的难点在于输出经常不是一个简单数字。

一轮 Lime Agent 运行可能包含自然语言、工具调用、streaming event、artifact、workspace 状态、GUI 投影、Provider 路由、错误恢复。

所以 Lime 的裁判也应该分两层。

第一层是确定性断言。

这些东西不应该交给 LLM 判断：

- App Server method 是否存在
- protocol schema 是否同步
- Electron bridge 是否白名单放行
- 生产路径是否绕过 mock fallback
- tool 是否真的触发
- read model 是否能读回 session / thread / turn
- Evidence Pack 是否包含适用的 runtime fact
- feature flag 开关前后是否都能跑同一套回归

它们应该由单元测试、contract test、Rust 定向测试、GUI smoke、agent runtime fixture、governance guard 来判断。

第二层才是 Supervisor。

Supervisor 处理的是确定性断言卡不住的部分，比如：

- 这次 Agent 输出是否满足任务意图
- artifact 内容是否明显退化
- 工具顺序虽然不同，但是否仍达成目标
- 长程任务是否出现语义绕路
- 用户体验是否比旧版本更可靠

Supervisor 不能替代第一层。

它应该在干净上下文里，只拿“预期、证据、输出”，做评分和解释。它不应该参与开发，也不应该知道我们刚刚为了让测试过改了什么代码。

否则它很容易变成另一个会帮我们找理由的模型。

## Evidence Pack 是 Lime 的 Scoreboard

芯片验证里有 Scoreboard，用来比较预期行为和实际行为。

Lime 的对应物应该是 Evidence Pack。

这不是一个“导出报告”的附属功能，而是 Agent 研发闭环的核心事实源。

Harness Engine 文档里已经把方向定死：

```text
runtime thread/session
  -> evidence pack
  -> replay / analysis / review / summary
  -> trend / cleanup / dashboard
  -> UI
```

这个方向不能反过来。

UI 看到什么，不能反向成为事实源。analysis 也不能自己拼一套 observability summary。review template 不能绕过 evidence 自己总结。

以后 Lime 的每次 Agent 相关改动，都应该问一句：

**这次行为能不能被 Evidence Pack 复盘？**

如果不能，那它就不是一个对 Agent 友好的能力。

它可能能用，但很难持续开发。

## Feature Flag 不是发布技巧，是验证工具

原文里提到，每加一个新功能都配一个 flag。

这对 Lime 特别关键。

因为 Lime 的很多 Agent 行为并不是简单的“开了就成功，关了就失败”。它可能是：

- 工具选择更积极了，但误触发也增加了
- streaming 更快了，但完成态偶发卡住
- Supervisor 分数提高了，但确定性断言少了一项
- UI 看起来更顺，但 read model 少了一个字段

没有 flag，就很难比较。

有了 flag，Lime 就可以跑同一套回归：

```text
flag off -> baseline evidence
flag on  -> candidate evidence
diff     -> deterministic assertion + Supervisor score
```

这比“我手工点了几遍感觉还行”可靠得多。

更重要的是，flag 会倒逼我们把功能边界设计清楚。

一个功能如果不能被 flag 包住，通常说明它散落在太多地方，或者把 current 主链和临时行为混在了一起。

## Lime 自己的开发闭环应该长这样

以后做 Lime 的 Agent / runtime / GUI 主路径能力，默认闭环应该是：

1. 先写 Happy Path
2. 再写确定性断言
3. 需要时定义 Supervisor rubric
4. 给新行为加 flag
5. 实现只落 current 主链
6. 分别跑 flag off / on 的回归
7. 导出 Evidence Pack
8. 让 Codex 或 Lime Agent 根据证据返修
9. 人只审核高风险 waiver、语义争议和产品判断

这套流程的目标不是让流程变重。

恰恰相反，它是为了减少手动验证。

如果每次都靠人点页面、读日志、猜状态，那 Lime 越复杂，AI 写代码越快，人就越累。

如果每次都能把“什么算对”写成断言、证据和 rubric，AI 写代码越快，闭环也会越快。

## Lime 要避免的三个反模式

第一个反模式：把 UI 当事实源。

页面显示成功，不代表 App Server 状态正确，不代表 Evidence Pack 可复盘，也不代表下次 session hydrate 能恢复。

第二个反模式：用 mock 证明生产路径。

mock 可以服务测试夹具，但生产路径不能 mock。尤其 Agent runtime、Bridge、GUI smoke、App Server sidecar 这类主链，一旦 mock fallback 混进去，验证就会变成假绿。

第三个反模式：为了快，把新能力塞进 compat / deprecated 路径。

这会让短期实现很舒服，但会让后续验证失效。Agent 看不懂到底哪个入口是事实源，人也看不懂哪个失败算真实失败。

Lime 当前文档反复强调 current / compat / deprecated / dead，不是洁癖。

这是为了让验证体系有稳定对象。

## 最后，Lime 的价值会从“写功能”转向“制造可验证环境”

AI 让写代码便宜了。

这对 Lime 是机会，也是压力。

机会是，很多以前写不起的产品面和自动化能力，现在可以更快试出来。

压力是，如果我们没有同等速度的验证体系，Lime 会变成一个越来越难判断对错的系统。

所以 Lime 开发 Lime 的核心能力，不能只是“让 Agent 帮我们写代码”。

更应该是：

**把 Lime 做成一个 Agent 能理解、能操作、能验证、能复盘、能持续收敛的系统。**

这件事做好之后，我们才真正拿回那 90%。

那时人的工作不再是反复点页面，也不是在日志里猜问题。

人的工作会更接近芯片验证里的验证架构师：

定义什么算对，设计可观测点，固化回归样本，审核高风险判断，然后让 Agent 在这个环境里自己收敛。

这应该成为 Lime 后续研发的默认方向。
