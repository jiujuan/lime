# 开发 Lime 之后，我越来越相信：做 AI 软件，最难的不是追模型，而是追工程系统

> Lime 这段时间最重要的变化，不是又补了几个工具，也不是又修了几个 UI 细节，而是我们开始把自己当成一个大型软件来治理：参考 Codex，也参考 Claude Code，但最终要长出 Lime 自己的事实源。

最近开发 Lime，有一个感受越来越强：

**AI 编程工具本身，正在变成大型软件。**

过去我们看 Codex、Claude Code，容易把它们理解成“一个更聪明的 coding agent”。但真正翻代码、对齐实现、跑 GUI、看工具调用链路之后，会发现它们已经不是一个聊天框那么简单。

它们背后有一整套东西：

- 工具运行时
- 消息协议
- 多代理协作
- 任务状态
- 记忆与压缩
- 浏览器和远程控制
- 权限和沙箱
- hooks / skills / plugins
- 输出渲染和截图回归

这些东西不是附属功能。

它们共同构成了一个新的软件工程操作系统。

Lime 这段时间做的事情，本质上就是：一边做自己的 GUI 桌面产品，一边把 Codex 和 Claude Code 这类大型软件里的成熟工程经验，尽可能吸收到 Lime 的 current 主链里。

这里有一个很重要的前提：

**对齐不是复制。**

尤其是 Codex。

我们优先参考 Codex，是因为它仍在持续更新维护，而且它的仓库规则、协议、测试和治理方式更适合长期跟随。但 Lime 不是 CLI，Lime 是桌面 GUI 产品。很多地方不能照搬目录结构，也不能照搬终端输出形态。

真正要对齐的，是背后的工程判断。

## 一开始的问题：我们以为是工具没调，后来发现是渲染链路没守住

这次最典型的触发点，是一个很普通的用户请求：

“帮我使用 Playwright MCP 测试一下，整理今天的国际新闻。”

表面上看，问题像是模型没有调用工具。

但查日志之后发现，事情不是这么简单。

有一段日志非常关键：

```text
provider=openai, model=gpt-5.5, messages=1, tools=0
```

这说明某些请求链路里，工具根本没有进入 provider request。

而另一些场景里，工具其实调用了，搜索也发生了，但 UI 把最终正文和工具过程显示错了顺序：最终新闻简报跑到了“已搜索网页 N 次”前面。

这类问题最麻烦的地方在于，它不是某一个按钮坏了。

它同时牵涉到：

- system prompt 里是否允许模型自己判断是否搜索
- runtime policy 是否把工具暴露给模型
- provider 是否支持对应 tool schema
- 前端 streaming overlay 是否改写了顺序
- 历史 hydration 是否又走了另一条渲染路径
- Markdown 和来源引用是否被 tool output 打断

如果只盯着一个点修，很容易陷入“修一次坏一次”的循环。

这也是后来我们反复强调不要 hard code 的原因。

比如不能写死：

- 某个 `web_search` 特例
- 某个 `gpt-5.5` 特例
- 某个 session id 特例
- 某个“国际新闻”输入特例
- 某个 internal image placeholder 特例

因为这样修出来的不是系统能力，只是一个演示路径。

真正要做的是把工具调用、过程事件、最终正文、来源引用、历史恢复这几层的事实源统一起来。

## Codex 给我们的第一个启发：规则必须写进仓库，而不是写在人脑里

翻 Codex 仓库时，我最受触动的不是某一个功能，而是它的开发方式。

Codex 的工程规则非常具体。

它不是泛泛地说“注意质量”，而是会规定：

- 改配置要更新 schema
- 改 app-server 协议要更新 README 和 schema fixture
- UI / 文本输出变化要补 snapshot
- Rust 测试要走统一入口
- 新 API 不要继续扩旧版本
- 依赖变化要同步锁文件

这背后是一种非常清晰的工程观：

**能被仓库约束的东西，就不要靠人每次记。**

Lime 后来把很多规则也写进了自己的 `AGENTS.md` 和 `internal/aiprompts/`：

- 计划是一等工件
- 长任务必须落到 `internal/exec-plans/`
- Tauri 命令改动必须同步四侧
- GUI 产品不能只用 typecheck 当交付
- 用户可见 UI 要有稳定回归
- 旧逻辑不需要兼容时要优先清理
- current / compat / deprecated / dead 必须分清

这些规则不是装饰。

它们是为了让下一个 Agent 不会继续沿着旧路径生成代码。

AI 编程时代最危险的地方，不是 AI 不会写。

恰恰相反，是它太会写了。

只要旧入口还开着，它就能顺着旧入口继续补一套“看起来合理”的实现。

所以我们后来越来越明确：

**对 AI 来说，旧代码只要还能被调用，就不是历史，而是活上下文。**

治理的第一步，就是把活上下文收敛成唯一事实源。

## 我们把 Lime 拆成几条 current 主链，而不是到处补功能

如果直接说“对齐 Codex 和 Claude Code”，这个目标太大，很容易变成什么都想补。

后来我们把它拆成几条主链：

- `Query Loop`
- `Tool Runtime`
- `Memory / Compaction`
- `Remote / SDK / Server Mode`
- `Task / Agent / Coordinator`
- `State / History / Telemetry`

这一步很关键。

因为它让对齐从“感觉像不像”变成了“主链是否收口”。

比如 Query Loop，不只是模型回答。

它包括：

```text
用户输入
  -> runtime turn
  -> tool orchestration
  -> streaming events
  -> completion reconcile
  -> memory / compaction
  -> evidence / telemetry
  -> history read model
```

只要其中一段有旁路，最终 GUI 就会出问题。

这次工具过程和最终正文错序，就是典型例子。

如果流式路径是一套逻辑，历史恢复又是一套逻辑，前端为了“好看”再额外 overlay 一层正文，那最终顺序一定会漂。

所以我们后面修的不是“把搜索块挪到正文前面”，而是修：

- `messageListItemProjection`
- `messageListInlineProcess`
- `agentStreamCompletionController`
- `StreamingRenderer`

让实时流式、完成态 reconcile、历史冷加载都承认同一条 timeline。

这才是对齐 Codex 的方式。

不是把 UI 复制成 CLI。

而是把事件顺序当成系统事实。

## Claude Code 给我们的启发：Agent 不是工具集合，而是长期运行时

Claude Code 对 Lime 的影响，更多是在产品形态和长期运行时上。

从 Claude Code 的源码线索里能看到很多方向：

- assistant sessions 更像长期存在的工作实体
- coordinator 可以调度多个 worker
- remote / bridge / UDS 让本地和远端工作流连接起来
- memory 不只是一次 prompt，而是会跨会话沉淀
- skills / hooks / plugins 不是装饰，而是扩展运行时的一部分

这些东西让我们重新理解 Lime 的 Agent。

它不应该只是：

“用户发一句话，模型回一句话。”

它更应该是：

“一个可以跨工具、跨会话、跨任务、跨历史继续推进工作的运行时。”

这也是为什么 Lime 后来补了很多看起来很底层的东西：

- task / agent taxonomy
- execution tracker
- state / history / telemetry
- runtime evidence pack
- replay / review / analysis
- skill 执行链
- synthetic local peer messaging
- tool surface governance

这些东西单独看都不性感。

但没有它们，GUI 上的漂亮界面最后都会变成假入口。

用户看到的是按钮、卡片、来源引用、任务状态。

系统真正需要的是：这些 UI 后面有一条可解释、可恢复、可测试的 runtime 主链。

## 这段时间最重要的一次转变：不再让用户选择“是否搜索”

有一个小细节，其实很能代表 Lime 的路线变化。

一开始，界面和设置里会有“是否搜索”“是否思考”这类选择。

用户后来明确指出：这些应该去掉。

原因很简单：

**是否搜索，应该让模型根据任务自己判断。**

这听上去只是一个 UI 设置问题，但背后其实是产品哲学问题。

如果我们把“是否搜索”做成用户每次要选的按钮，Agent 就退化成一个带开关的工具箱。

但真正的 Agent 应该能判断：

- 这个问题是否时效敏感
- 是否需要联网验证
- 是否需要引用来源
- 是否需要调用浏览器
- 是否需要先读本地代码

这也是我们后来清理旧策略的原因。

像 `time_sensitive_web_search_should_upgrade_missing_mode_to_required` 这种逻辑，如果写成硬规则，很容易变成另一个 hard code。

更合理的方式，是把工具暴露、权限、引用、渲染都做好，让模型自己做判断，同时用 GUI 和 harness 验证它是否真的做对。

这和 Codex 的方向是一致的：

不是让用户管理每个底层开关，而是让系统把执行过程透明地展示出来。

## 输出渲染这件事，比想象中难得多

这次我们反复修 Markdown、来源引用、工具块、文件修改卡、hover 按钮、字体和排版。

表面看是 UI 细节。

其实不是。

Agent 软件的输出不是普通 Markdown。

它里面会混合：

- 模型正文
- 工具调用过程
- 工具结果
- 文件变更
- 来源引用
- token usage
- prompt cache
- 子任务状态
- 用户确认卡
- 错误和重试

如果渲染层没有清晰协议，就会出现各种问题：

- 工具输出把最终回答切开
- 最终回答跑到搜索过程前面
- 文件修改卡重复出现
- 来源引用位置漂移
- hover 前按钮常驻
- 历史对话和实时流式长得不一样
- Markdown 被 raw JSON 或 stdout 污染

这也是为什么我们后来专门写了 `internal/exec-plans/agent-tools-test-batches/`。

它把几十个 tools 分批测试：

- 文件与搜索工具
- shell 与后台任务
- web / browser / MCP 浏览器工具
- agent / team / 用户交互工具
- skill / MCP resource / deferred tools
- gated runtime / governance tools
- task board tools

而且我们又补了一个 cross-agent 截图对齐提示词，让 Codex 和 Claude Code 都能跑同一场景、同一 viewport、同一截图节点、同一 DOM / computed style 采样。

这一步非常重要。

因为只靠一句“复刻截图”，最后一定会变成主观争论。

但如果我们固定：

- DOM index
- computed style
- hover 前后状态
- 实时流式截图
- 历史冷加载截图
- 控制台 warning / error

那差异就能变成可修的工程问题。

## Lime 对齐得比较好的地方

回头看，Lime 现在已经有一些地方不是“像”，而是真的开始对齐大型软件的工程方式。

第一，计划和进度开始成为一等工件。

复杂任务不再只停留在聊天记录里，而是落到：

- `internal/roadmap/`
- `internal/exec-plans/`
- `internal/aiprompts/`

这让后续 Agent 可以直接接着做，而不是每次重新问背景。

第二，current 主链开始清楚。

我们不再把所有旧实现都当成同等入口，而是用 `current / compat / deprecated / dead` 分类。

这对 AI 协作尤其重要。

因为 AI 不会天然知道哪个入口是历史，除非仓库告诉它。

第三，GUI 交付意识明显增强。

Lime 是桌面产品，所以不能只说测试过。

现在涉及 GUI 主路径时，必须考虑：

- `verify:gui-smoke`
- Playwright
- 截图
- DOM 顺序
- 控制台状态
- 历史恢复

这比单纯 typecheck 更接近真实产品。

第四，工具 runtime 开始泛化。

用户反复指出“我们有几十个 tools，不止几个”，这句话很关键。

后来的计划里明确要求动态 MCP 工具不能靠 hard code exact name，而要按 `mcp__<server>__<verb>`、操作族和 runtime metadata 泛化分类。

这是大型工具运行时必须有的能力。

第五，参考优先级更清楚。

不确定时，优先看 Codex。

再看 Claude Code。

但最终要落回 Lime current 架构。

这避免了两个极端：

- 完全闭门造车
- 盲目复制上游

## 但没有对齐的地方也很多

这篇文章不能只写“我们做得很好”。

真实情况是，Lime 还有很多没有对齐的地方。

有些是 current gap。

有些是产品选择。

有些是旧逻辑还没完全清理。

比如：

- hooks / skills 还没有完全达到 Claude Code 那种 frontmatter hooks、project hooks、plugin hooks、hot reload 的完整执行链
- `SkillExecutionMode::Agent` 仍然没有真正成为 current
- `bridge:` remote peer messaging 还没有进入 current
- remote-control / mobile push 这组宿主配置还没有真实宿主面
- Web/Search 的来源引用、字体、hover、历史恢复还需要继续做截图级对齐
- 工具渲染需要覆盖全部工具族，而不是只覆盖 web_search
- App 侧文件修改卡、撤销、展开状态还要继续复刻 Codex app 的细节
- 多模型 provider 下的 tool policy 还要继续避免 OpenAI 专属 hard code

这些都不应该藏起来。

所以我把它们单独整理成了一个执行清单：

`internal/exec-plans/devlime-codex-claude-alignment-gap-list.md`

文章可以讲经验。

清单必须能推进执行。

这是我们现在做 Lime 时越来越明确的原则：

**观点写成文章，差距写成计划，规则写进仓库，验证交给工具。**

## 真正学到的东西：大型 AI 软件不是靠灵感堆出来的

开发 Lime 越久，我越觉得，大型 AI 软件的难点不在“模型会不会回答”。

真正的难点在这些地方：

- 工具调用是否进入模型请求
- 工具结果是否按真实时间线展示
- 历史恢复是否和实时流式一致
- 权限、搜索、思考是否由模型合理决策
- 用户看到的 GUI 是否能解释 runtime 正在做什么
- 旧入口是否被及时下线
- 差距是否被写成可执行计划
- 每一轮修复是否有截图和测试证明

这也是 Lime 对齐 Codex 和 Claude Code 最大的收获。

不是“它们有什么功能，我们也做一个”。

而是：

**它们如何把一个 Agent 产品做成可持续演进的大型软件。**

Codex 给我们的启发，是把工程规则、协议、schema、snapshot、测试和删除旧路径都写进仓库。

Claude Code 给我们的启发，是把 Agent 看成长期运行时，而不是一次性问答工具。

Lime 要做的，是在这两者之间找到自己的位置：

- 保留 GUI 桌面产品的体验优势
- 学 Codex 的工程纪律
- 学 Claude Code 的长期运行时和扩展系统
- 但不盲目复制任何一个项目的目录、命名和产品壳

这件事还没做完。

但方向已经比以前清楚很多。

以后再遇到类似问题，我希望团队默认不是先问：

“这里要不要再补一个判断？”

而是先问：

“这条能力的 current 事实源在哪里？实时流式和历史恢复是否共用同一条链路？有没有测试和截图能证明它真的对齐？”

这个问题问对了，Lime 才会越来越像一个能长期维护的大型软件。

而不是一个被 AI 快速堆出来、又不断被 AI 自己绕乱的项目。
