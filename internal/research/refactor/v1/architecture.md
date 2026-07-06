# 北极星架构：Codex 核心体系为 Agent 工程原点，opencode 仅参照多模型 / 多模态

> 状态：current research baseline
> 更新时间：2026-07-05
> 适用范围：Codex 原点式快速对齐 v1
> Codex 原点：`/Users/coso/Documents/dev/rust/codex`
> opencode 限定参照：`/Users/coso/Documents/dev/js/opencode` 的多模型 / 多模态能力表达
> Lime current-state 基线：[lime-current-state.md](./lime-current-state.md)

## 1. 架构结论

Lime 的北极星不是“把 Codex 搬进桌面端”，也不是“把 opencode 的 JS/Effect 架构搬进 Lime”。Codex 最核心的参考不是某个 UI、某个 crate 或某个 App Server 入口，而是一套围绕 Agent 原语建立的工程系统。

`Thread / Turn / ThreadItem` 是第一层原语：

```text
Thread 是长期会话和 session tree；
Turn 是一次可开始、可 steer、可 interrupt、可完成或失败的执行边界；
Item 是 turn 内可持久化、可增量更新、可投影到 UI 的最小语义单元。
```

Lime 后续文档和新设计默认采用 Codex 式短命名：

```text
Thread 管历史，Turn 管执行，Item 管投影。
```

具体命名基线见 [naming-alignment.md](./naming-alignment.md)。现有 `agentSession/*` 属于 current protocol namespace，不因命名不优雅而裸改；新增设计不再扩散 `agentSession` 风格的新域名。

第一原语的实施前置检查见 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md)。后续 Agent 改动必须先说明 Thread、Turn、Item 归属，再进入协议、runtime、projection 或 GUI 设计。

但 Codex 的完整价值不止这三项。App Server、protocol-first、request serialization scope、typed client、core session runtime、event materialization、tool / approval / sandbox、context fragments、rollout/state、plugin/skills/MCP、TUI facade、fixture/schema validation 都是围绕这组原语服务的工程体系。详细 Codex-only 图谱见 [codex-architecture-map.md](./codex-architecture-map.md)。

正确裁决是三层：

| 参考源 | 在 Lime 架构中的角色 | 参与范围 | 不参与范围 |
| --- | --- | --- | --- |
| Codex | Agent 原语和工程主原点 | Thread / Turn / Item、Protocol-first、serialization scope、App Server、typed client、core session/task runtime、event materialization、tool lifecycle、approval/sandbox、context/compaction、state/rollout/trace、plugin/skills/MCP、TUI facade、fixture/schema validation | 多 Provider 产品策略、多模态能力矩阵、Lime 桌面工作台形态 |
| opencode | 多模型 / 多模态能力参照 | Provider/Model catalog、模型 capability、provider-neutral LLM message/event、media part、provider lowering、cache/options 能力表达 | App Server 架构、Session V2、Tool V2、UI 组件、协议治理、Effect/Bun 技术栈 |
| Lime current | 最终事实源 | Electron Desktop Host、React 桌面 GUI、App Server JSON-RPC、RuntimeCore、Agent UI projection、Evidence、Replay、多模态工作台 | 任何新旧双轨、生产 mock fallback、legacy Tauri wrapper |

一句话：

```text
Codex 的核心体系决定 Lime Agent 怎么建模、怎么走协议、怎么运行、怎么投影和怎么验证；
Thread / Turn / Item 是第一原语；
opencode 只帮助 Lime 定义“模型和媒体能力怎么表达”；
Lime 自己决定桌面产品、工作台、Evidence 和 current 主链怎么落地。
```

硬边界：

```text
opencode 是只读参照源，不是第二架构源。
opencode 只有命中 Provider / Model / Capability / ContentPart / LLMEvent / provider lowering 时才进入评估。
其他 opencode 变化默认不参与 Lime 架构裁决。
```

现状落点：

```text
所有北极星裁决必须先回到 lime-current-state.md：
  当前主链是否已经有 owner？
  这个 owner 属于 current / compat / deprecated / dead 哪一类？
  对齐 Codex 时是在补 current 主链，还是在给旧路径续命？
```

## 2. 三方架构深度对比

| 架构维度 | Codex | opencode | Lime 当前 | Lime 北极星裁决 |
| --- | --- | --- | --- | --- |
| 产品形态 | CLI/TUI + app-server，多客户端壳 | CLI/TUI/Web/Desktop，JS monorepo | Electron 桌面 GUI + Rust App Server + React workspace | 产品形态以 Lime 为准；Codex 只提供状态机参考，opencode 不参与产品形态裁决 |
| 后端入口 | `codex-rs/app-server` 是统一后端 | `packages/server` + protocol groups | `lime-rs/crates/app-server` 是 JSON-RPC 后端事实源 | 采用 Codex 的单后端入口；不采用 opencode server 架构 |
| 桌面壳 | 非核心 | 有 desktop package，但不是 Lime owner | Electron Desktop Host 负责 IPC、窗口、updater、sidecar | 以 Lime Electron Desktop Host 为唯一桌面壳事实源 |
| 协议 | `app-server-protocol` + typed client + schema/TS 导出 | HTTP protocol groups + generated client | `app-server-protocol v0` + `packages/app-server-client` | 采用 Codex 的 protocol-first 纪律；opencode 协议不参与 |
| Thread / Turn / Item 原语 | `Thread` 承载 session tree 和历史；`Turn` 承载执行边界；`ThreadItem` 承载可投影语义单元 | V2 Session 不参与 | `agentSession/*`、turn execution、runtime projection、Timeline | 采用 Codex 原语，不把它降级成普通“状态机参考”；opencode Session V2 不参与 |
| Tool / Approval | tool、approval、sandbox 是 Agent runtime 核心 | Tool V2 有 codec/output bounding 设计 | `tool-runtime`、`agent/src/*tool*`、`action_required` | Tool runtime 以 Codex 为主；opencode Tool V2 不作为本轮参照 |
| Context / Token | `core/context` 强调 bounded model-visible context | LLM options/cache 有 provider-neutral 表达 | `turn_input_envelope`、memory prompt、context compaction | Agent context 以 Codex 为主；模型 cache/options 能力表达可参考 opencode |
| 多模型 | 支持 model/provider，但 OpenAI 官方语义权重高 | Provider/Model/Capabilities/Options 更系统 | `modelProvider/*`、`model-provider`、model route | 多模型能力矩阵参考 opencode，运行接线进入 Lime current |
| 多模态 | 有图片等能力，但不是产品中心 | `ContentPart` 含 text/media/tool/reasoning | Lime 有图片、音频、视频、文档、artifact 工作台 | 多模态 part algebra 参考 opencode，投影和工作台由 Lime 定义 |
| UI 投影 | TUI facade 和 streaming 状态机值得参考 | app UI 不参与本轮架构 | `AgentChatWorkspace`、MessageList、Timeline、Workbench | UI 架构以 Lime + Codex 状态机为准；不参考 opencode UI |
| 存储 / Evidence | rollout/state/thread-store 可 replay | EventV2 不参与本轮 | ProjectionStore、EventLog、Sidecar、Evidence/export | Codex import 只作 source；Lime read model 是事实源 |
| 质量 | app-server test client、TUI tests、core suite | 本轮不纳入质量架构 | contract、Rust related、GUI smoke、fixture | 采用 Lime 现有质量入口，借鉴 Codex fixture 思路 |

### 2.1 Codex 核心体系到 Lime 的分层映射

| Codex 核心层 | Codex 事实源 | Lime current owner | 北极星裁决 |
| --- | --- | --- | --- |
| Agent 原语 | `protocol/v2/thread_data.rs`、`protocol/v2/item.rs`、`protocol/v2/turn.rs` | `agentSession/*`、turn execution、projection、Evidence/export | `Thread -> Turn -> Item` 是所有 Agent 设计的第一问题 |
| Protocol-first | `app-server-protocol/src/protocol/common.rs`、`export.rs` | `app-server-protocol v0`、`packages/app-server-client`、`src/lib/api/*` | method、params、response、notification、schema、typed client 成组演进 |
| Serialization scope | `ClientRequestSerializationScope` | App Server processor、前端 request gateway | 同一 thread / process / fs-watch / mcp oauth 等范围按语义串行，不靠 UI 节流兜底 |
| App Server processor | `app-server/src/message_processor.rs`、`request_processors/*` | `lime-rs/crates/app-server/src/processor/*` | processor 薄分发，业务进 runtime/domain |
| Core session / task runtime | `core/src/session/*`、`core/src/tasks/*` | `RuntimeCore`、`agent` crate、runtime domain modules | turn queue、task lifecycle、model stream、tool execution 在 runtime 闭环 |
| Event materialization | `event_mapping.rs`、`thread_history.rs`、`item_builders.rs` | `runtime/projection_*`、ProjectionStore、Timeline / MessageList | provider/core event 先 materialize 成结构化 item，再进入 UI |
| Tool / approval / sandbox | `tools`、`core/src/tools/*`、`execpolicy`、`sandboxing` | `tool-runtime`、`mcp`、`action_required.rs`、Desktop Host permission bridge | 工具、审批、沙箱是控制面，不是文案或组件状态 |
| Context / compaction | `core/src/context/*`、`context_manager/*`、`compact*` | `turn_input_envelope.rs`、memory prompt、sidecar/evidence | 模型可见上下文是 bounded fragment，不直接塞高容量原文 |
| Persistence / replay / trace | `rollout`、`thread-store`、`state`、`message-history`、`rollout-trace` | ProjectionStore、EventLogWriter、SidecarStore、Evidence/export、replay | Codex history 可作 import source，Lime read model 是 runtime truth |
| Plugin / skills / MCP | `plugin`、`core-skills`、`skills`、`codex-mcp` | `plugin_packages`、`skills`、`skill_registry.rs`、`mcp` crate | manifest / skill metadata / MCP tool binding 分层，不混入 UI 安装形态 |
| TUI facade / projection | `tui/src/app_server_session.rs`、`chatwidget/protocol.rs` | `src/lib/api/*`、front-end runtime hooks、projection selectors | 学 typed facade 和 projection，不复制 TUI 组件形态 |
| Realtime / media / collaboration | `realtime-*`、`v2/realtime.rs`、image generation extension | 多模态 runtime、Workbench、ModelCapability | 媒体和实时能力仍落回 ThreadItem / ContentPart / projection |
| Quality / fixture | `app-server-test-client`、`schema_fixtures.rs`、`core/tests/suite`、`tui/tests` | contract、Rust related、agent runtime fixture、GUI smoke | 对齐必须有协议、runtime、GUI 三类证据 |

这一表是 [codex-architecture-map.md](./codex-architecture-map.md) 到 Lime 的压缩版。Lime 当前真实落点、体量风险和 current / compat / dead 分类见 [lime-current-state.md](./lime-current-state.md)。后续任何模块推进，先在这里找层级，再进入具体文件。

### 2.2 Codex 原语到 Lime 的第一映射

| Codex 原语 | Codex 事实源 | 语义 | Lime current 映射 | 不允许的误用 |
| --- | --- | --- | --- | --- |
| Thread | `app-server-protocol/src/protocol/v2/thread_data.rs`、`thread.rs`、`thread_history.rs` | 一个可恢复、可 fork、可归档、可读取历史的长期 Agent 会话；也是 session tree 和 sub-agent 关系载体 | `agentSession/*`、SessionDetail、ProjectionStore、EventLog、Evidence/export、replay | 不把 Thread 退化成前端 chat id；不把 Codex rollout 当 Lime runtime truth |
| Turn | `app-server-protocol/src/protocol/v2/turn.rs`、`thread_data.rs`、App Server thread processor | 一次用户输入驱动的执行边界；支持 start / steer / interrupt / completed / failed / inProgress | `turn_execution.rs`、`agent/src/turn_execution.rs`、active stream controller、runtime terminal events | 不用 UI timeout 或自然语言正文合成终态；不让 stale terminal event 影响新 turn |
| Item | `app-server-protocol/src/protocol/v2/item.rs`、`event_mapping.rs`、`thread_history.rs` | turn 内的最小可持久化和可投影单元，覆盖 user/agent message、reasoning、tool、file change、web、image、context compaction 等 | RuntimeEvent、ContentPart、TimelineItem、MessageList、Workbench、tool/action projection | 不在组件里临时猜 item 类型；不把 provider wire event 直接塞进 UI |

第一性原则：

```text
所有 Agent 运行、历史、恢复、UI projection、Evidence、Replay，都先问：
它属于哪个 Thread？
它发生在哪个 Turn？
它应该落成哪个 Item？
```

如果一个设计无法回答这三个问题，它就不是 Lime Agent 主链设计。

### 2.3 opencode 参照硬边界

| 决策问题 | 是否参考 opencode | Lime 裁决 |
| --- | --- | --- |
| Provider / Model catalog 怎么表达 | 是 | 只参考 capability、cost、limit、variant、endpoint protocol 的结构表达 |
| 模型 input/output/tools/reasoning/cache 能力怎么表达 | 是 | 落到 Lime `ModelCapability`，驱动 UI gate、runtime assembly、lowering |
| 图片/音频/视频/文档等多模态 part 怎么表达 | 是 | 落到 provider-neutral `ContentPart` / attachment / reference |
| provider stream 差异怎么归一 | 是 | provider wire event 先转 `LLMEvent`，再转 Agent runtime event |
| provider-specific body/header/media encoding/cache marker 怎么生成 | 是 | 只在 lowering 层集中处理，不泄漏到 GUI / API gateway |
| Session / Thread / Turn 怎么运行 | 否 | 以 Codex thread/turn 和 Lime `agentSession` 为准 |
| Tool runtime / approval / sandbox 怎么运行 | 否 | 以 Codex tool lifecycle 和 Lime Desktop Host 权限边界为准 |
| App Server / JSON-RPC / typed client 怎么组织 | 否 | 以 Codex protocol-first 和 Lime current protocol/client 为准 |
| React GUI、Workspace、组件和交互怎么设计 | 否 | 以 Lime 设计语言和 Codex 状态机为准 |
| 测试、fixture、质量门禁怎么组织 | 否 | 以 Lime 现有质量入口和 Codex fixture 思路为准 |
| Effect / Bun / JS monorepo 工程栈怎么组织 | 否 | 不参与；Lime 继续 Rust App Server + Electron Desktop Host + React |

判断公式：

```text
如果 opencode 变化不能回答“模型能力、媒体 part、LLM event 或 provider lowering 怎么表达”，
它就不进入本轮架构讨论。
```

### 2.4 多模型 / 多模态进入 Lime 的唯一主链

opencode 只允许以“能力表达”形式进入 Lime：

```text
opencode allowlist 参照
  -> Lime ModelCapability / ContentPart / LLMEvent
  -> Runtime request assembly
  -> Provider-specific lowering
  -> Agent runtime event
  -> Projection / Evidence / Workbench
```

禁止路径：

```text
opencode Session / Tool / UI / Protocol / Effect runtime
  -> Lime App Server / RuntimeCore / React GUI
```

这意味着：即使 opencode 在 Session V2、Tool V2 或 UI 上有好设计，也不能作为 Lime 本轮架构原点。只有当其中某个字段能被还原成“模型能力或媒体能力表达”时，才摘取到多模型 / 多模态层，且必须重新落到 Lime current 类型和主链。

## 3. Lime 北极星主链

Lime 的主链保持不变，新增模型或媒体能力也必须穿过这条主链：

```text
React GUI
  -> src/lib/api/*
  -> AppServerClient / safeInvoke
  -> Electron Desktop Host bridge
  -> App Server JSON-RPC
  -> Protocol registry / serialization scope
  -> Thread / Turn / Item primitive model
  -> RuntimeCore / agent / services / domain crates
  -> Event materialization / item projection
  -> Model Capability Registry
  -> Provider-neutral LLM Request / Event
  -> Provider-specific Lowering
  -> Runtime Event / Projection Store / Evidence
  -> Agent UI / Artifact Workbench
```

关键边界：

| 层 | 责任 | 不负责 |
| --- | --- | --- |
| React GUI | 展示、交互、能力禁用态、投影消费 | 拼 provider body、读取本地 source、写后端事实 |
| `src/lib/api/*` | 前端 domain 网关、typed request、错误归一 | 业务实现、mock fallback、协议散落 |
| Electron Desktop Host | IPC、preload、窗口、托盘、Dock、updater、sidecar 生命周期、本地桌面能力 | Agent runtime、provider adapter、模型能力判断 |
| App Server JSON-RPC | 后端唯一协议入口、request/notification 分发 | GUI 展示细节 |
| Protocol registry / serialization scope | method 定义、schema、typed client、请求串行范围 | 业务实现、UI 状态 |
| Thread / Turn / Item primitive model | Agent 会话、执行边界和投影单元的唯一语义骨架 | provider wire body、GUI 布局细节 |
| RuntimeCore / agent | turn、tool、context、memory、projection、evidence、runtime policy | Electron 壳行为 |
| Event materialization | core/provider event 到 item / notification / history 的统一转换 | React 组件内临时分类 |
| Model Capability Registry | provider/model/media/tool/reasoning/cache 能力事实 | provider-specific wire body |
| Provider-specific Lowering | 把中立 LLM request 降成 OpenAI/Anthropic/Gemini/Bedrock 等请求 | UI 状态、业务流程 |
| Projection / Read Model | GUI 可读状态、历史恢复、evidence/export/replay | 外部 source 原始 store |

## 4. Codex 对 Lime 的硬对齐层

### 4.1 Thread / Turn / Item 原语

Codex 事实：

- `protocol/v2/thread_data.rs` 中 `Thread` 包含 `id / session_id / forked_from_id / parent_thread_id / status / cwd / source / turns`。
- `protocol/v2/thread_data.rs` 中 `Turn` 包含 `id / items / items_view / status / error / started_at / completed_at`。
- `protocol/v2/item.rs` 中 `ThreadItem` 覆盖 user message、agent message、reasoning、command execution、file change、MCP tool、dynamic tool、web search、image、context compaction 等。
- `protocol/v2/turn.rs` 定义 `turn/start`、`turn/steer`、`turn/interrupt` 和 turn notification。
- `event_mapping.rs` 和 `thread_history.rs` 把 core event materialize 成 `ThreadItem` 和 turn history。

Lime 当前：

- `agentSession/*`
- `runtime/turn_execution.rs`
- `agent/src/turn_execution.rs`
- `runtime/projection_*`
- `MessageList` / `StreamingRenderer` / `AgentThreadTimeline` / Workbench
- `ProjectionStore` / `EventLogWriter` / `Evidence/export`

北极星：

1. `Thread -> Turn -> Item` 是 Codex 对 Lime 的第一原点。
2. Lime 新文档和新设计优先使用 Codex 短命名；现有 `agentSession -> turn -> item/projection` 作为 current 现状映射保留。
3. 所有 runtime event 必须能定位到 `sessionId/threadId`、`turnId`、`itemId` 中的合适层级。
4. GUI 不直接消费 provider wire event；GUI 消费 `Item` 投影。
5. Evidence / Replay 不消费 Codex 原始 rollout；它们消费 Lime current read model 中的 Thread/Turn/Item 同构数据。
6. opencode Session V2 不参与这一层。
7. 具体前置检查以 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 为准。

### 4.2 App Server 框架

Codex 事实：

- `codex-rs/app-server/src/message_processor.rs` 是中心分发。
- `codex-rs/app-server/src/request_processors/*` 按 domain 承接实现。
- UI / TUI 不直接承接后端业务。

Lime 当前：

- `lime-rs/crates/app-server/src/processor/*`
- `lime-rs/crates/app-server/src/runtime/*`
- `lime-rs/crates/agent/src/*`

北极星：

1. App Server JSON-RPC 是后端唯一 current 入口。
2. `processor` 是薄分发，不承接业务。
3. `runtime/*`、`agent/*`、domain crate 承接实现。
4. Electron 只做 Desktop Host，不做第二后端。

### 4.3 协议与 typed client

Codex 事实：

- `app-server-protocol/src/protocol/common.rs` 用单一宏定义 method / params / response / serialization。
- `app-server-protocol/src/export.rs` 生成 JSON Schema / TypeScript。
- `app-server-client` 消费 typed protocol。

Lime 当前：

- `lime-rs/crates/app-server-protocol/src/protocol/v0/*`
- `lime-rs/crates/app-server-protocol/src/schema_export.rs`
- `packages/app-server-client`
- `src/lib/api/*`

北极星：

```text
protocol/v0 domain type
  -> method definition registry
  -> schema fixtures / generated TS
  -> packages/app-server-client
  -> src/lib/api/* gateway
  -> React component
```

协议改动必须同步 Rust protocol、App Server processor、client、前端 API 和 contract guard。opencode 的 protocol group / generated client 不参与这个架构裁决。

### 4.4 Core Session / Task Runtime

Codex 事实：

- `core/src/session/*` 承接 session lifecycle、turn context、input queue。
- `core/src/tasks/*` 承接 task lifecycle。
- model stream、tool execution、context 和 compaction 不散落在 UI 或 App Server processor。

Lime 当前：

- `lime-rs/crates/app-server/src/runtime/*`
- `lime-rs/crates/agent/src/*`
- `RuntimeCore`
- runtime backend / model route / turn execution domain modules

北极星：

1. App Server processor 不承接 Agent loop。
2. turn queue、model stream、tool execution、context assembly 进入 RuntimeCore / agent domain。
3. 新 runtime 逻辑优先按 domain 子模块拆分，不塞回中心 `runtime.rs` / `processor.rs`。
4. opencode runtime 组织方式不参与。

### 4.5 Event Materialization / Session / Turn

Codex 事实：

- thread / turn / item 是 Agent loop 的核心。
- event_mapping 把 core event 投影成 server notification / ThreadItem。
- item_builders 和 thread_history 把 runtime 变化 materialize 成可读历史。
- turn completed / failed / interrupt 是结构化状态，不是 UI 文案。

Lime 当前：

- `agentSession/*`
- `runtime/turn_execution.rs`
- `agent/src/turn_execution.rs`
- `runtime/projection_*`
- `MessageList` / `StreamingRenderer` / `AgentThreadTimeline`

北极星：

1. Codex `Thread` 映射为 Lime `agentSession` 现状名；新设计使用 `Thread`，旧协议名不裸改。
2. turn 终态只认结构化 runtime event。
3. 前端 active stream 清理必须绑定 `sessionId / turnId / itemId`。
4. 不用 timeout 或自然语言文本合成终态。
5. opencode Session V2 不参与本层架构。

### 4.6 Tool / Approval / Sandbox

Codex 事实：

- tool call、command、patch、approval、sandbox 是 Agent runtime 控制面。
- approval 是结构化 action，不是 UI 文案。

Lime 当前：

- `tool-runtime`
- `agent/src/*tool*`
- `runtime_backend/*`
- `action_required.rs`
- 前端 tool projection / action panels

北极星：

1. Tool runtime 以 Codex 为主原点。
2. shell / MCP / web / patch / browser / artifact 分 domain 投影。
3. approval event 与 Desktop Host 权限分层。
4. opencode Tool V2 不参与本轮架构；工具 lifecycle、approval、sandbox 一律按 Codex + Lime current 裁决。
5. 工具结果如果需要作为图片、音频、视频、文档或结构化模型输入出现，只在 `ContentPart / reference / ModelCapability` 层参考 opencode 的能力表达，不参考 opencode Tool runtime。

### 4.7 Context / Token / Evidence

Codex 事实：

- model-visible context 必须 bounded。
- 高容量内容不能无界注入模型。
- rollout/state 是 replay 和历史事实。

Lime 当前：

- `turn_input_envelope.rs`
- `protocol_context_projection.rs`
- memory prompt
- `SidecarStore`
- `Evidence/export`
- Codex import adapter

北极星：

1. Agent context 边界以 Codex 为主。
2. 高容量工具输出、导入完整记录、多媒体内容进入 sidecar/evidence。
3. 模型只看 bounded summary + reference。
4. Codex rollout 只作为 import source，不是 Lime runtime truth。

### 4.8 Persistence / Replay / Trace

Codex 事实：

- `rollout`、`thread-store`、`state`、`message-history`、`rollout-trace` 共同服务历史、恢复、replay 和 trace。
- thread history 是由结构化 item materialize 出来的，不是 UI transcript 拼接物。

Lime 当前：

- `ProjectionStore`
- `EventLogWriter`
- `SidecarStore`
- `Evidence/export`
- replay / analysis / review current export chain
- Codex import adapter

北极星：

1. Codex 原始 rollout / state 只作为导入 source。
2. Lime runtime truth 是 current read model。
3. Evidence / replay / trace 必须能回到 session/thread、turn、item 三层。
4. requestTelemetry 不保留伪 `unlinked`，必须按真实 session/thread/turn 关联。

### 4.9 Plugin / Skills / MCP

Codex 事实：

- `plugin/src/manifest.rs` 定义 plugin manifest。
- `core-skills/src/model.rs` 定义 skill metadata、policy、dependency。
- `codex-mcp` / `rmcp-client` 把 MCP 工具纳入 runtime capability。

Lime 当前：

- `plugin_packages`
- `skills`
- `skill_registry.rs`
- `mcp` crate
- 应用中心 / Agent Apps / installed apps UI

北极星：

1. manifest、skill metadata、MCP tool binding 三层分开。
2. Lime 应用中心是桌面产品形态，不照搬 Codex CLI 分发。
3. MCP tool naming 和 contract surface 保持 Lime current，不回退 legacy mock。
4. skills 进入 context 时受 bounded fragment 规则约束。

### 4.10 Realtime / Media / Collaboration

Codex 事实：

- Codex 有 realtime、image generation、media item 和 collaboration 相关类型。
- 这些能力仍然回到 protocol / item / notification 体系。

Lime 当前：

- 多模态附件和 media workbench
- provider/model capability
- artifact workbench
- GUI projection

北极星：

1. 媒体能力不是 provider wire event 直通 UI。
2. media input/output 先进入 ModelCapability / ContentPart / reference。
3. 实时或协作能力必须能 materialize 成 ThreadItem / RuntimeEvent / projection。
4. 多模态能力表达参考 opencode，Agent lifecycle 仍按 Codex。

### 4.11 Quality / Fixture / Schema

Codex 事实：

- `app-server-test-client` 可作为 app-server 行为 fixture。
- `schema_fixtures.rs`、schema export、core suite、TUI snapshot 防止协议和投影漂移。

Lime 当前：

- `npm run test:contracts`
- `npm run smoke:agent-runtime-current-fixture`
- `npm run test:rust:related -- <paths>`
- `npm run verify:gui-smoke`
- Playwright / Electron GUI smoke

北极星：

1. 协议对齐必须有 contract 证据。
2. runtime 对齐必须有 Rust / fixture 证据。
3. GUI 可见主路径必须有 smoke / Playwright 证据。
4. 文档对齐不等于工程完成，后续实施每一刀都要绑定验证。

## 5. opencode 只参与的层：多模型 / 多模态能力代数

opencode 参照只限这些路径：

- `specs/v2/provider-model.md`
- `packages/llm/src/schema/messages.ts`
- `packages/llm/src/schema/events.ts`
- `packages/llm/src/schema/options.ts`
- `packages/llm/src/protocols/*`
- `packages/core/src/provider.ts`
- `packages/core/src/model.ts`

不纳入本轮架构参照：

- `specs/v2/session.md`
- `specs/v2/tools.md`
- `packages/app/src/**`
- `packages/protocol/src/**`
- `packages/client/src/**`
- opencode 的 Effect / Bun runtime 组织方式

### 5.1 Provider / Model 能力矩阵

Lime 需要从“provider 列表”升级为能力矩阵：

```text
Provider
  -> endpointProtocol: openai/responses | openai/chat | anthropic/messages | gemini | bedrock | custom
  -> authMode
  -> requestOptions
  -> Model
      -> apiId
      -> displayName
      -> variant
      -> family
      -> status
      -> cost
      -> limits
      -> capabilities
          input: text | image | audio | video | document | file
          output: text | image | audio | video | structured
          tools: none | local | provider-native | mcp
          reasoning: unsupported | visible | hidden | encrypted
          cache: unsupported | explicit | automatic
          streaming: text | reasoning | tool-input | tool-result | usage
```

这个矩阵用于三件事：

1. GUI 决定哪些附件、工具、输出模式可用。
2. Runtime 决定如何组装 provider-neutral request。
3. Lowering 决定如何降到具体 provider wire protocol。

#### 5.1.1 Codex `ModelInfo` 策略叠层

Codex `ModelInfo` 不是 Lime Provider catalog 的替代品。它在 Lime 北极星里承担“单个模型行为策略”的叠层：Provider 继续只管 endpoint、auth、transport 与 request option；Model policy 决定这个模型在 turn request 中可以怎么用工具、上下文、reasoning、modalities、Responses Lite、截断和 native tool surface。

```text
Provider record
  -> endpoint / auth / protocol / request option

Codex ModelInfo fields
  -> App Server ModelInfo DTO
  -> schema bundle / generated TS
  -> modelRegistry raw DTO
  -> policy owners
      execution_policy
      context_policy
      picker_policy
      tool_call_policy
      reasoning_policy
      reasoning_output_policy
      input_modality_policy
      responses_policy
      truncation_policy
      native_tool_policy
  -> runtime request gate / UI capability gate
```

字段 owner 固定如下：

| 策略层 | Codex 字段 | Lime owner |
| --- | --- | --- |
| Execution | `tool_mode`、`supports_search_tool`、`web_search_tool_type`、`supports_image_detail_original` | `modelExecutionPolicy` |
| Context | `context_window`、`max_context_window`、`auto_compact_token_limit`、`effective_context_window_percent` | `modelContextPolicy` |
| Picker | `visibility`、`service_tiers`、`default_service_tier` | `modelPickerPolicy` |
| Tool call | `supports_parallel_tool_calls` | `modelToolCallPolicy` |
| Reasoning effort | `default_reasoning_level`、`supported_reasoning_levels`、`supports_reasoning_summaries` | `modelReasoningPolicy` |
| Reasoning output | `default_reasoning_summary`、`support_verbosity`、`default_verbosity` | `modelReasoningOutputPolicy` |
| Input modality | `input_modalities` | `modelInputModalityPolicy`；opencode 只补多模态词表 |
| Responses request mode | `use_responses_lite` | `modelResponsesPolicy` |
| Tool output truncation | `truncation_policy` | `modelTruncationPolicy` |
| Native tools | `shell_type`、`apply_patch_tool_type`、`experimental_supported_tools` | `modelNativeToolPolicy` |

硬约束：

1. `ModelCapabilitySummary` 只承接 execution summary，不承接上述 `*_policy` projection。
2. registry projection 只能通过对应 owner 函数暴露，不在 `modelRegistry.ts` 里重新归一。
3. `auto_review_model_override` 和 `multi_agent_version` 暂不混入 capability；分别等待 review policy / session multi-agent policy 单独建模。
4. opencode 不参与这些 request policy 的 owner 设计，只为 `input_modalities` 等多模态词表提供参照。

### 5.2 Provider-neutral ContentPart

opencode 的 `ContentPart` 对 Lime 有参考价值，但 Lime 需要扩展到桌面工作台：

| Part | opencode 参照 | Lime 北极星 |
| --- | --- | --- |
| text | `TextPart` | 普通文本、markdown、系统/用户/assistant 文本 |
| media | `MediaPart` | image / audio / video / document / file reference |
| tool-call | `ToolCallPart` | 模型或 runtime 发起的工具调用 |
| tool-result | `ToolResultPart` | 结构化结果 + bounded model-facing preview |
| reasoning | `ReasoningPart` | visible / hidden / encrypted reasoning 投影 |
| artifact | Lime 增强 | Canvas、代码、文档、图片、视频、PPT 等工作台对象 |
| approval | Lime/Codex 增强 | action required / resolved |
| reference | Lime 增强 | project file、external source、sidecar、evidence ref |

关键裁决：

```text
ContentPart 是模型和投影之间的结构化代数；
不是 UI 组件树；
不是 provider wire payload；
不是 Evidence 存储格式。
```

### 5.3 Provider-neutral LLM Event

opencode 的 LLM event stream 对多模型有参考价值：

```text
text-start / text-delta / text-end
reasoning-start / reasoning-delta / reasoning-end
tool-input-start / tool-input-delta / tool-input-end
tool-call / tool-result / tool-error
finish / provider-error / usage
```

Lime 北极星：

1. provider-specific stream 先转成 provider-neutral LLM event。
2. LLM event 再转成 Agent runtime event。
3. Agent runtime event 再转成 GUI projection。
4. 前端不直接消费 provider wire event。

这样 Codex 的 Agent lifecycle 和 opencode 的多 Provider event algebra 可以同时成立：

```text
Provider wire event
  -> provider-neutral LLM event
  -> Agent runtime event
  -> Timeline / MessageList / Workbench projection
```

### 5.4 Provider-specific Lowering

opencode 的 `packages/llm/src/protocols/*` 说明了一个重要边界：不同 provider 的 body、headers、cache marker、media encoding、tool schema、reasoning 字段差异，必须集中在 lowering 层。

Lime 裁决：

1. GUI 不拼 provider body。
2. API gateway 不拼 provider body。
3. App Server protocol 不暴露 provider wire shape 作为业务 API。
4. `runtime_backend/model_route_*` 或对应 domain owner 才做 provider-specific lowering。
5. Lowering 输入是 provider-neutral request + ModelCapability。

## 6. Lime 的最终分层目标

```text
┌──────────────────────────────────────────────────────────────┐
│ React Desktop GUI                                             │
│ Workspace / MessageList / Timeline / Composer / Workbench     │
└──────────────────────────────┬───────────────────────────────┘
                               │ src/lib/api/*
┌──────────────────────────────▼───────────────────────────────┐
│ Frontend API Gateway + AppServerClient                        │
│ typed request / response / event subscription                  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Electron Desktop Host bridge
┌──────────────────────────────▼───────────────────────────────┐
│ App Server JSON-RPC                                           │
│ protocol registry / processor domain dispatch                 │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Thread / Turn / Item Primitive Model                          │
│ agentSession / turn execution / item projection                │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ RuntimeCore / agent                                           │
│ session / turn / tool / approval / context / evidence          │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Model Capability + Provider-neutral LLM                       │
│ capability matrix / ContentPart / LLMEvent / lowering input    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Provider Lowering                                             │
│ OpenAI / Anthropic / Gemini / Bedrock / compatible providers   │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Projection / Evidence / Sidecar                               │
│ read model / high-capacity output / replay / export            │
└──────────────────────────────────────────────────────────────┘
```

## 7. 架构裁决矩阵

| 问题 | 第一参考 | 第二参考 | Lime 裁决 |
| --- | --- | --- | --- |
| Agent 会话、执行和投影怎么建模 | Codex Thread / Turn / Item | [naming-alignment.md](./naming-alignment.md) | 新设计用 `Thread -> Turn -> Item`；`agentSession -> turn -> item/projection` 是现状映射 |
| 新增 App Server method | Codex | 无 | 进 App Server JSON-RPC + protocol/client/API gateway |
| 新增 provider | opencode | Codex provider registry 纪律 | 先补 capability，再接 model route lowering |
| 新增图片/音频/视频/文档输入 | opencode | Codex context bounded 规则 | 先进 ContentPart/reference，再按 capability lower |
| 修 turn 卡住 | Codex | 无 | 结构化终态修 Runtime/Projection，不在 UI 合成 |
| 修 tool lifecycle | Codex | 无 | tool event / approval / sandbox 按 Codex 分层 |
| 修 provider stream 差异 | opencode | Codex runtime event | provider wire -> LLM event -> Agent event |
| 拆 Workspace | Codex 反面教材 + Lime GUI | 无 | 新逻辑进 hook/ViewModel/projection，不参考 opencode UI |
| 导入 Codex 会话 | Codex | 无 | import source -> Lime read model，不写回 Codex |
| 高容量输出入模 | Codex context bounded | opencode ContentPart/output shape | sidecar/evidence + bounded preview/reference |

## 8. P0 北极星落地顺序

1. **Codex 核心体系图谱**
   - 参考 [codex-architecture-map.md](./codex-architecture-map.md)。
   - 目标是让后续对齐不只学原语或 App Server，而是成组看 protocol、scope、runtime、event、tool、context、state、plugin、fixture。

2. **Thread / Turn / Item 原语映射**
   - 参考 Codex `thread_data.rs`、`item.rs`、`turn.rs`。
   - 目标是让 Agent 会话、执行边界、UI projection、Evidence、Replay 都先有同一套语义骨架。

3. **协议 registry / serialization scope**
   - 参考 Codex `common.rs` 的单一 method definition 和 `ClientRequestSerializationScope`。
   - 目标是让新增 JSON-RPC 不再多处手动同步，请求并发不靠 UI 节流兜底。

4. **Event materialization / Turn lifecycle**
   - 参考 Codex `event_mapping.rs`、`thread_history.rs`、thread/turn/item。
   - 目标是所有流式终态、resume、interrupt、cancel-then-continue 都结构化，并能 materialize 成 item/history/projection。

5. **Core session / task runtime**
   - 参考 Codex `core/src/session/*`、`core/src/tasks/*`。
   - 目标是 turn queue、task lifecycle、model stream、tool execution、context assembly 进入 RuntimeCore / agent domain。

6. **Persistence / Replay / Trace**
   - 参考 Codex `rollout`、`thread-store`、`state`、`message-history`、`rollout-trace`。
   - 目标是 Codex import、Evidence、Replay、requestTelemetry 都绑定 session/thread/turn/item。

7. **Model Capability Matrix**
   - 只参考 opencode provider/model 与 LLM schema。
   - 目标是 UI、runtime、provider lowering 共用同一能力事实源。

8. **Provider-neutral ContentPart / LLMEvent**
   - 只参考 opencode 多模型多模态 event algebra。
   - 目标是 provider wire event 不直接进入 UI。

9. **Frontend Projection 收口**
   - 参考 Codex TUI facade 和 Lime 现有 GUI 分层。
   - 目标是 MessageList / StreamingRenderer / Timeline / Workbench 共享结构化 projection。

10. **Evidence / Sidecar 边界**
   - 参考 Codex bounded context。
   - 目标是多模态和高容量 tool output 不撑爆模型上下文。

11. **Quality / Fixture / Schema**
   - 参考 Codex `app-server-test-client`、`schema_fixtures.rs`、core suite、TUI tests。
   - 目标是每一刀都能绑定 contract、runtime fixture、GUI smoke 中的最小证据。

## 9. 质量门槛

| 改动类型 | 必跑验证 |
| --- | --- |
| 协议 / JSON-RPC | `npm run test:contracts` |
| Rust runtime domain | `npm run test:rust:related -- <paths>` 或定向 `cargo test --manifest-path "lime-rs/Cargo.toml"` |
| Agent streaming / turn | `npm run smoke:agent-runtime-current-fixture` |
| 多模型 / 多模态 capability | model/provider 定向测试 + `npm run test:contracts` |
| GUI 主路径 | `npm run verify:gui-smoke` |
| 前端 projection | 定向 `vitest` + `eslint` |
| 用户可见文案 | `npm run i18n:check:json` |
| legacy / mock 回流 | `npm run governance:legacy-report` + `npm run test:contracts` |
