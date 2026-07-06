# PRD：Codex 原点式快速对齐

> 状态：current research baseline
> 更新时间：2026-07-05
> Owner：app-server-runtime / agent-ui / refactor
> Codex 原点：`/Users/coso/Documents/dev/rust/codex`
> opencode 限定参照：`/Users/coso/Documents/dev/js/opencode`
> Lime current-state 基线：[lime-current-state.md](./lime-current-state.md)

## 1. 背景

Lime 已经开发半年多，形态是桌面 GUI 产品，包含 React、Electron Desktop Host、App Server JSON-RPC、Rust workspace、Agent Runtime、插件、技能、Evidence、Replay 和多模型能力。当前不能推倒重来，也不应该把 Codex 的 CLI/TUI 产品形态直接搬进 Lime。

但 OpenAI Codex 是当前最值得持续参考的开源 Agent 工程基线。它每天更新，已经系统化解决或正在解决以下问题：

- Thread / Turn / Item 三元原语如何承载 Agent 会话、执行边界、可投影语义单元。
- Protocol-first：method、params、response、notification、schema、typed client 和 serialization scope 的成组演进。
- app-server 作为统一后端入口，processor 薄分发，runtime/domain 承接业务。
- Core session / task runtime 如何承接 turn queue、task lifecycle、model stream、tool execution。
- Event materialization 如何把 core event 变成 server notification、ThreadItem、history change 和 UI projection。
- thread / turn / item / tool / approval / sandbox 的结构化控制面。
- context fragments、compaction 和 token 预算的边界控制。
- rollout/state/thread history/trace 如何支撑恢复、replay、Evidence 和调试。
- plugin/skills/MCP 如何作为 runtime capability，而不是 UI 安装形态。
- TUI 通过 typed app-server session facade 消费协议。
- 上游测试、fixture、schema、rollout、state 和协议迁移的工程纪律。

同时，Lime 是多模型、多模态桌面应用，不能只用 Codex 的 OpenAI-heavy Agent 客户端视角裁决所有产品问题。本地 opencode 仓库 `/Users/coso/Documents/dev/js/opencode` 提供了另一类关键参照：

- `packages/llm` 的 provider-neutral message、event、options 和 protocol lowering。
- `specs/v2/provider-model.md` 的 Provider / Model / Capabilities / Cost / Limit / Variant 模型。

Lime 过去为了减少技术方向折腾已经大量参考 Codex，但参考方式还不够系统：有些结论落在聊天里，有些落在局部路线图里，有些只变成一次性实现，没有形成“Codex 原点 -> Lime current owner -> 第一刀 -> 验证入口”的长期工作系统。

## 2. 一句话目标

以 Codex 的 `Thread / Turn / Item` 为 Agent 第一原语，以 Codex 核心体系为主参照，以 opencode 为多模型、多模态能力参照，快速建立 Lime 的系统性对齐基线，让后续框架重构、协议演进、运行时稳定性、事件物化、Provider/Model 能力矩阵、前端 UI 投影、Evidence/Replay 和验证体系都能按同一套模块地图推进。

这里的“前端 UI 投影”不是参考 opencode UI，而是让 Lime GUI 消费经过 Lime current 收口后的 `ModelCapability / ContentPart / LLMEvent`。

Lime 当前真实主链、Rust workspace、Agent session / turn / item read model、多模型多模态现状和 current / compat / dead 分类，以 [lime-current-state.md](./lime-current-state.md) 为基线。后续目标架构和模块计划必须先对照该文件，不能只按 Codex 目标图谱推导 Lime 落点。

Codex 命名和第一原语实施口径固定为：

- 命名基线：[naming-alignment.md](./naming-alignment.md)
- 前置 invariant：[thread-turn-item-invariant.md](./thread-turn-item-invariant.md)

```text
Codex 是 Agent 工程原点
Thread / Turn / Item 是 Codex 第一原语
Protocol-first / event materialization / runtime / fixture 是核心体系
opencode 只参照多模型/多模态
Lime current 主链是落点
快速对齐骨架先于长期精修
```

## 3. 目的

1. 把 Codex 的 `Thread / Turn / Item` 原语和 Protocol-first、serialization scope、runtime、event materialization、tool/approval/sandbox、context、persistence、plugin/skills、fixture 等工程能力拆成可对照的模块，而不是泛泛说“学习 Codex”。
2. 把 opencode 的多 Provider、多模态、模型 capability、provider-neutral message/event 和 provider lowering 能力拆成可对照模块。
3. 让 Lime 每个模块都有明确的参考路径、当前 Lime owner、差距和第一刀。
4. 先完成 P0/P1 快速骨架对齐，减少 token 浪费和技术路线摇摆。
5. 建立后续跟进 Codex 上游变化和 opencode 多模型/多模态 allowlist 变化的固定流程。
6. 防止参考外部项目时引入新旧双轨、mock 生产路径或第二套 runtime。

## 4. 收益

| 收益 | 说明 |
| --- | --- |
| 建立 Agent 第一原语 | 所有会话、执行、历史、投影、Evidence 先映射 Thread / Turn / Item，避免 UI 补丁化 |
| 降低方向成本 | 遇到框架、协议、turn 生命周期、tool lifecycle 问题时先看 Codex 原点，不重复发明 |
| 降低 token 成本 | Agent 不再反复探索同一类架构问题，直接按对照表定位 |
| 降低兼容债 | 所有能力先映射 current owner，避免旧 `agent_runtime_*` 和 mock fallback 回流 |
| 提升协议一致性 | 新 JSON-RPC method 必须成组更新 Rust protocol、client、前端 API 和 contract |
| 提升并发正确性 | request serialization scope 明确到 method 级，不靠 UI 节流或隐式锁兜底 |
| 提升事件一致性 | core/provider event 统一 materialize 成 item/history/projection，减少组件内临时分类 |
| 提升恢复和追踪能力 | Persistence / Replay / Trace 都能回到 session/thread、turn、item |
| 强化多模型多模态 | Provider/Model capability、ContentPart、media input/output 和 provider lowering 有系统参照 |
| 提升 UI 稳定性 | 前端按结构化事件投影，不靠自然语言文本猜状态 |
| 提升迭代速度 | P0/P1 先对齐骨架，后续每周跟进 Codex 上游只处理高价值路径 |

## 5. 用户画像

| 用户 | 诉求 | 本方案提供的价值 |
| --- | --- | --- |
| Lime 开发者 | 快速知道 Codex 某个设计在 Lime 应落到哪里 | `codex-origin-comparison.md` 给出模块级映射 |
| 架构维护者 | 判断 Codex 设计与 Lime 现状之间的真实差距 | `lime-current-state.md` 给出 current 主链、现状图和分类 |
| Agent Runtime 维护者 | 修 streaming、interrupt、resume、tool lifecycle 时不偏航 | `module-alignment-plan.md` 定义 Session/Turn/Tool 第一刀 |
| 协议 / App Server 维护者 | 新 method、notification、serialization scope 不再散落同步 | `architecture.md` 和 `codex-origin-comparison.md` 定义 protocol-first 主链 |
| 前端 UI 维护者 | 拆 Workspace、MessageList、Timeline 时有统一投影目标 | `architecture.md` 和 `diagrams.md` 定义 projection 主链 |
| 多模型/多模态维护者 | Provider、模型能力、附件、媒体输入输出和缓存策略不再散落 | `opencode-reference-comparison.md` 定义参照 |
| 产品负责人 | 判断哪些 Codex 能力应快速跟进，哪些不适合 Lime | `fast-alignment-roadmap.md` 给出 P0/P1/P2 队列 |
| 质量验证负责人 | 知道每类对齐后该跑什么验证 | 每个模块绑定最小验证命令 |

## 6. 用户故事

### 6.1 对齐 Codex Agent 原语

作为 Agent Runtime / UI 维护者，当新增或修复任何 Agent 能力时，我希望先判断它属于哪个 Thread、发生在哪个 Turn、落成哪个 Item，而不是直接从 App Server method、React state 或 provider event 开始设计。

验收：

1. 每个 Agent 事件能定位到 `sessionId/threadId`、`turnId`、`itemId` 中的合适层级。
2. Thread 对应 Lime `agentSession` 现状名；新设计使用 `Thread`，并保留 session tree / fork / resume 语义。
3. Turn 是一次执行边界，终态只认结构化 completed / failed / interrupted。
4. Item 是 MessageList / Timeline / Workbench / Evidence 的共同输入，不在组件内自造语义。
5. 新 Agent 改动必须按 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 的前置检查说明 Thread、Turn、Item 归属。

### 6.2 对齐 Codex 核心体系

作为架构维护者，当评估 Codex 上游变化时，我希望不仅看 Thread / Turn / Item，还要同时判断它落在 protocol-first、serialization scope、core runtime、event materialization、tool/approval/sandbox、context、persistence、plugin/skills、fixture 哪一层，避免只学一块而漏掉系统边界。

验收：

1. 每个 Codex 参考点能映射到 [codex-architecture-map.md](./codex-architecture-map.md) 的核心层。
2. 每个 adopt/adapt 项都有 Lime current owner。
3. 涉及协议的变化能说明 method、schema、client、API gateway 和 contract 的同步路径。
4. 涉及 runtime/projection 的变化能说明事件如何 materialize 成 item/history/UI。

### 6.3 新增 JSON-RPC 能力

作为 App Server 开发者，当 Codex 新增或调整 app-server method 时，我希望能快速判断 Lime 是否需要跟进，以及要同步哪些事实源，这样不会只改 Rust 或只改前端导致契约漂移。

验收：

1. 能从 Codex `app-server-protocol` 定位对应 domain。
2. 能在 Lime 找到 `app-server-protocol/src/protocol/v0/*` 对应 owner。
3. 能明确是否需要更新 `packages/app-server-client` 和 `src/lib/api/*`。
4. 能明确 serialization scope。
5. 能明确必须运行 `npm run test:contracts`。

### 6.4 修 Agent turn streaming 卡住

作为 Agent Runtime 维护者，当 Lime 出现停止后不能继续、final_done 后仍显示输出中、reasoning/tool/final answer 顺序错乱时，我希望参考 Codex 的 turn/item lifecycle，而不是在 UI 上加 timeout 或文案正则。

验收：

1. 终态判断绑定结构化事件。
2. 前端 active stream 清理与 turn id / item id 关联。
3. 定向测试覆盖 stale terminal event 不误停新 stream。
4. `npm run smoke:agent-runtime-current-fixture` 可作为主路径证据。

### 6.5 拆 `AgentChatWorkspace.tsx`

作为前端维护者，当需要继续拆 6000+ 行的 Workspace 时，我希望知道 Codex `chatwidget` 的债要避免，Codex `app_server_session` 的 facade 思路要吸收。

验收：

1. 新逻辑不得继续塞进 `AgentChatWorkspace.tsx`。
2. 先抽纯 ViewModel / projection / runtime hook。
3. 用户可见文案走五语言 i18n。
4. 组件测试只覆盖渲染和接线，复杂状态机进入单测。

### 6.6 导入 Codex 会话

作为 Lime 用户，我希望 Codex 历史会话能导入 Lime 并继续用多模型分析，但不希望 Lime 把 Codex rollout JSONL 变成第二套运行时事实源。

验收：

1. Codex 原始数据只作为 import source。
2. 导入结果进入 Lime `SessionDetail / AgentRuntimeEvents / Agent UI projection`。
3. evidence/export 和 replay 消费 Lime current read model。
4. trace / telemetry 能关联 session/thread/turn。
5. 不写回 Codex 原始目录。

### 6.7 跟进 Codex 上游变化

作为项目负责人，我希望每周知道 Codex 哪些变化应该进入 Lime 快速对齐，哪些只观察，避免每天被上游变化打散节奏。

验收：

1. 每次 diff 只看固定高价值路径。
2. 每条结论必须归类为 `adopt-now / adapt-for-desktop / watch / reject-for-lime`。
3. `adopt-now` 必须绑定 Lime current owner 和验证入口。
4. 结论写入 repo，不只留在聊天。

### 6.8 设计多模型 / 多模态能力

作为 Lime 多模型维护者，当新增 provider、模型、图片/音频/视频/文档输入输出或 prompt cache 能力时，我希望同时参考 opencode 的 Provider/Model/ContentPart 设计，而不是只套 Codex 的 OpenAI 客户端形态。

验收：

1. model capability 明确 input/output/tools/reasoning/cache。
2. 多模态请求进入结构化 ContentPart / attachment 投影。
3. UI 根据 capability 禁用不支持的附件、工具或输出模式。
4. provider-specific body 只在 runtime lowering 层生成，组件不拼 provider body。

## 7. 用户用例

| 用例 | 输入 | 输出 |
| --- | --- | --- |
| Codex 协议 diff 评估 | Codex commit range | method / type / event 变化清单，Lime 对应 owner，优先级 |
| Codex 核心体系 diff 评估 | Codex commit range | protocol/runtime/event/context/tool/state/plugin/fixture 分层清单 |
| Lime 协议新增 | 新 App Server 能力 | Rust protocol、schema、TS client、前端 API、contract 测试同步清单 |
| Turn 生命周期修复 | GUI 卡住或流式顺序错误 | 结构化事件修复方案、状态机测试、fixture smoke |
| Event materialization 对齐 | 新 runtime/provider event | LLMEvent、RuntimeEvent、ThreadItem、TimelineItem 映射 |
| Workspace 拆分 | 巨型组件新增需求 | domain hook / projection / ViewModel 落点，禁止回写中心组件 |
| Tool lifecycle 对齐 | shell/MCP/web/patch/approval 行为差异 | Codex event 原点、Lime runtime event 映射、UI 展示策略 |
| Context/token 对齐 | 上下文过大或模型缓存失效 | bounded fragment 规则、sidecar/evidence 分流策略 |
| Persistence / Trace 对齐 | 导入、replay 或 telemetry 缺链 | session/thread/turn/item 关联和 current read model 验证 |
| Plugin / Skills 对齐 | 新 skill 或插件 manifest 变化 | manifest、skill metadata、MCP binding、UI 安装形态分层 |
| 多模型能力对齐 | 新 provider / 新模型 / 新 variant | opencode Provider/Model capability map、Lime catalog owner、UI 能力禁用态 |
| 多模态输入对齐 | 图片、音频、视频、文档附件 | opencode ContentPart、Lime attachment/workbench projection、model capability gate |

## 8. 成功指标

P0 快速基线完成时：

1. `internal/research/refactor/v1` 文档齐全。
2. Lime current-state 文档覆盖当前主链、Rust workspace、Agent session / turn / item read model、多模型多模态现状、current / compat / dead 分类和 Codex 对齐缺口。
3. Codex 原点对照表把 `Thread / Turn / Item` 放在第一层，并覆盖 protocol-first、serialization scope、framework、core runtime、event materialization、tool、context、approval/sandbox、persistence/replay/trace、plugin/skills、UI、storage、testing。
4. opencode 参照表覆盖 provider/model、LLM message/event、media part、model capability、provider options 和 provider lowering。
5. 每个 P0/P1 模块都有 Lime current owner 和第一刀。
6. 图表能表达 Codex 核心体系到 Lime current 主链的转换。
7. 没有空洞段落或无法执行的泛泛描述。

P1 工程推进完成时：

1. 新增协议 method 的事实源数量收敛，contract 守卫稳定。
2. method serialization scope 能进入 registry。
3. Agent turn 终态、streaming、resume/interrupt 按结构化事件处理。
4. Event materialization 链路稳定，UI 不直吃 provider wire event。
5. `AgentChatWorkspace.tsx` 新逻辑不再增长，复杂逻辑进入子模块。
6. Codex import、Agent Runtime fixture、GUI smoke 形成可复用证据链。

P2 长期跟进稳定时：

1. 每周 Codex upstream diff 和 opencode allowlist diff 有 repo 内记录。
2. `adopt-now` 项目能进入 Lime backlog 并绑定验证。
3. 不再出现“Codex 有新东西，所以 Lime 新开一套实现”的反复偏航。

## 9. 非目标

1. 不全量复制 Codex crate 结构。
2. 不把 Codex TUI 变成 Lime UI 目标。
3. 不把 Codex rollout JSONL 当 Lime runtime truth。
4. 不恢复旧 `lime-rs/src/**`。
5. 不新增生产 mock fallback。
6. 不为了对齐 Codex 把 Lime 协议版本从 `v0` 改名。
7. 不把所有 Codex 上游变化都自动进入 Lime。
8. 不参考 opencode 的 Session、Tool、UI、协议治理、generated client、Effect / Bun runtime。
9. 不把 opencode 非 allowlist 变化写入 P0/P1 backlog。
