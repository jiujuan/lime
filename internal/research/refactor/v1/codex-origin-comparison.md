# Codex 原点系统性对照表

> 状态：current research baseline
> 更新时间：2026-07-05
> Codex 原点：`/Users/coso/Documents/dev/rust/codex`
> opencode 多模型参照见：[opencode-reference-comparison.md](./opencode-reference-comparison.md)

## 1. 阅读方式

本表以 Codex 模块为原点，而不是以 Lime 当前文件为原点。

注意：Codex 是 Agent 工程主原点，其中第一原语是 `Thread / Turn / Item`，但完整参考对象是一套核心体系：Protocol-first、request serialization scope、App Server processor、core session/task runtime、event materialization、tool/approval/sandbox、context/compaction、rollout/state/trace、plugin/skills/MCP、TUI facade、quality fixture 都要一起看。详细 Codex-only 图谱见 [codex-architecture-map.md](./codex-architecture-map.md)。

涉及多模型、多 Provider、多模态 message part、media input/output 和模型能力矩阵时，才同时查看 opencode 参照表，不能只按 Codex 的 OpenAI-heavy 客户端假设裁决。

opencode 只补 Codex 在多模型 / 多模态能力表达上的盲区，不参与本表其他工程维度的裁决。

Lime 当前真实落点、current / compat / dead 分类和多模型多模态现状见 [lime-current-state.md](./lime-current-state.md)。本表中的 `Lime 当前路径` 必须以该现状文档和当前代码为落点，不允许只按 Codex 目标图谱推导。

每一行回答：

```text
Codex 已经形成的模式是什么
  -> Lime 当前在哪些路径承接
  -> 差距是什么
  -> 第一刀怎么推进
```

分类：

- `adopt-now`：直接进入 Lime current 主链。
- `adapt-for-desktop`：保留 Codex 思路，但按桌面 GUI / Electron / i18n / artifact workbench 改造。
- `watch`：持续跟踪。
- `reject-for-lime`：不采纳，防止误抄。

## 2. 总表

| Codex 原点模块 | Codex 路径 | Codex 模式 | Lime 当前路径 | Lime 状态 | 差距 | 动作 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent primitive model | `protocol/v2/thread_data.rs`、`protocol/v2/item.rs`、`protocol/v2/turn.rs`、`protocol/event_mapping.rs`、`protocol/thread_history.rs` | `Thread -> Turn -> Item` 是 Agent 运行、历史、恢复、UI 投影和 replay 的语义骨架；Codex Rust 类型名是 `ThreadItem` | `agentSession/*`、turn execution、runtime projection、Timeline、Evidence/export | `current` | Lime 已有 session/turn/event，已通过 P1-1 前置 invariant 固化 | 按 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 要求，所有 Agent 改动先映射这三层 | P1-1 `done` |
| App Server 框架 | `codex-rs/app-server` | app-server 是统一后端入口，client 都走 JSON-RPC | `lime-rs/crates/app-server`、`electron/`、`src/lib/api/*` | `current` | Lime 已有主链，但历史命令和 dev-bridge residual 仍需守卫 | 保持 App Server current，新增能力不进 Electron 后端化逻辑 | P0 `adopt-now` |
| Request processor | `app-server/src/message_processor.rs`、`request_processors/*` | 中心薄 match，domain processor 承接实现 | `app-server/src/processor/*`、`runtime/*` | `current` | Rust 侧已拆分较多，后续要防止中心文件回涨 | 新 method 先选 domain processor，不向中心堆实现 | P0 `adopt-now` |
| 协议定义 | `app-server-protocol/src/protocol/common.rs` | 单一宏定义 method、params、response、serialization scope | `app-server-protocol/src/protocol/v0/*`、`method_names.rs`、`schema_export` | `current` | Lime 缺 Codex 式单一 method definition registry | 建立 `AppServerMethodDefinition` 统一 method catalog | P0 `adopt-now` |
| Request serialization scope | `app-server-protocol/src/protocol/common.rs` | `ClientRequestSerializationScope` 按 global / thread / process / fs watch / mcp oauth 等范围控制并发 | App Server processor、client gateway、runtime request queue | `partial` | Lime 有 request/turn 状态，但缺统一声明式 scope，容易靠 UI 节流兜底 | 将 serialization scope 纳入 method registry，先覆盖 turn、thread、process、MCP oauth 类 method | P0 `adopt-now` |
| 协议 TS/JSON 导出 | `app-server-protocol/src/export.rs` | schemars + ts-rs 生成 JSON Schema / TS | `schema_export.rs`、`scripts/generate-protocol-types.mjs`、`packages/app-server-client` | `current` | Lime 已有生成链，但 TS 直接 derive 可作为二期 | 先固化漂移守卫，再评估 ts-rs 一跳导出 | P1 `adapt-for-desktop` |
| Typed client | `codex-rs/app-server-client` | client 封装 typed JSON-RPC request | `packages/app-server-client`、`lime-rs/crates/app-server-client` | `current` | 前端仍可能绕过 API 网关或直接 safeInvoke | 业务组件只经 `src/lib/api/*` 和 client 进入 | P0 `adopt-now` |
| TUI app-server facade | `tui/src/app_server_session.rs` | UI 通过 facade 消费 typed request，主 UI 不拼协议 | `src/lib/api/agentRuntime/*`、`src/lib/api/*` | `current` | Lime API 网关多，部分历史路径仍残留 | 以 domain API gateway 收敛组件调用 | P0 `adapt-for-desktop` |
| Thread / session | `protocol/v2/thread_data.rs`、`protocol/v2/thread.rs`、`thread-store`、`request_processors/thread*` | thread 是会话事实源，read/resume/fork/archive/delete 成组，承载 session tree / fork / sub-agent 关系 | `agentSession/*` protocol、`runtime/session_*`、`ProjectionStore` | `current` | Lime session 能力更宽，但 naming 和 projection 仍受旧 agent 影响 | 新设计使用 `Thread`；现有 `agentSession/*` 作为 current 协议名保留，不继续扩散 | P0 `adapt-for-desktop` |
| Turn lifecycle | `protocol/v2/turn.rs`、`protocol/v2/thread_data.rs`、`core` event loop | turn start / steer / interrupt / completed / failed / inProgress 明确 | `runtime/turn_execution.rs`、`agent/src/turn_execution.rs`、前端 stream controller | `current` | GUI 卡住类问题容易在 UI 合成终态 | 终态只认结构化 runtime event，不用 timeout 合成 | P0 `adopt-now` |
| Item / event projection | `protocol/v2/item.rs`、`event_mapping.rs`、`thread_history.rs` | core event 映射为 server notification、ThreadItem 和持久化 turn history | `runtime/projection_*`、`MessageList`、`StreamingRenderer`、`AgentThreadTimeline`、Workbench | `current` | 前端存在多套投影入口 | 统一 Item -> ContentPart / RuntimeEvent / TimelineItem 投影边界 | P0 `adopt-now` |
| Event materialization | `protocol/event_mapping.rs`、`protocol/item_builders.rs`、`protocol/thread_history.rs` | core event 不直通 UI，而是 materialize 成 notification、ThreadItem、history change | runtime event mapper、ProjectionStore、timeline selectors、Evidence/export | `partial` | Lime 有投影链，但缺 Codex 式“materialization 层”命名和边界，组件容易临时分类 | 建立 provider event -> LLMEvent -> runtime event -> item projection 的固定转换层 | P0 `adopt-now` |
| Core session / task runtime | `core/src/session/*`、`core/src/tasks/*` | session lifecycle、turn context、input queue、task lifecycle、model/tool stream 在 core 内闭环 | `lime-rs/crates/app-server/src/runtime/*`、`lime-rs/crates/agent/src/*`、RuntimeCore | `current` | Lime runtime domain 已成型，但中心文件仍有回涨风险 | 后续 turn/model/tool/context 能力先落 domain 子模块，processor 只接线 | P1 `adopt-now` |
| Tool runtime | `codex-rs/tools`、`exec`、`codex-mcp` | tool call 生命周期结构化，输出和审批分离 | `tool-runtime`、`agent/src/*tool*`、`runtime_backend/*` | `current` | Lime tool 种类更多，展示逻辑易膨胀 | 按 shell/MCP/web/patch/browser/artifact 分 domain | P1 `adapt-for-desktop` |
| Approval / permission | `execpolicy`、`sandboxing`、`approval_events.rs` | approval 是结构化控制面，不是 UI 文案 | `tool_permissions.rs`、`action_required.rs`、front-end action panels | `current` | Lime 桌面权限和生产 mock 边界要更严 | approval event 与 Desktop Host 权限分层处理 | P1 `adapt-for-desktop` |
| Sandbox / process hardening | `sandboxing`、`process-hardening`、`exec-server` | 执行策略与平台隔离独立于 UI | `project_shell.rs`、`runtime_backend/live_execution_process.rs`、Electron shell owner | `current` | Lime 同时有 Electron 壳能力，不能混成后端 adapter | shell 执行策略留 Rust runtime，桌面壳只做平台能力 | P1 `adapt-for-desktop` |
| Context / token | `core/context`、`context-fragments` | 上下文 fragment 有边界，避免无界注入 | `agent/src/turn_input_envelope.rs`、`protocol_context_projection.rs`、memory prompt | `current` | Lime 多模态和 workspace metadata 更容易超预算 | 建 bounded fragment 规则，超限进入 sidecar/evidence | P1 `adopt-now` |
| Compaction / context manager | `core/src/context_manager/*`、`core/src/compact*`、`context_window`、`token_budget` | compaction 与 token budget 是 runtime 能力，不是 prompt 拼接小技巧 | memory prompt、context projection、SidecarStore、Evidence summary | `partial` | Lime 有 memory/context，但缺统一的 budget owner 和 compaction policy | 先定义 bounded fragment + sidecar reference，再评估自动压缩入口 | P1 `adapt-for-desktop` |
| Model provider | `model-provider`、`models-manager` | provider/model 事实源与 UI 解耦 | `model-provider`、`modelProvider/*` App Server methods | `current` | Lime 已有多 provider，比 Codex 更复杂 | 只采纳 provider registry 纪律，不复制产品策略 | P1 `adapt-for-desktop` |
| Multi-model / multimodal gap | Codex provider/model surface | Codex 更偏 Agent 和 OpenAI 官方语义 | `modelProvider/*`、`agent-protocol`、多模态任务链 | `current` | Codex 对多 Provider、多模态能力矩阵不是最佳原点 | 该类问题转看 opencode `packages/llm` 和 `specs/v2/provider-model.md` | P0 `adapt-for-desktop` |
| MCP | `codex-mcp`、`rmcp-client`、`mcp-server` | MCP connection manager 管工具变更和调用 | `mcp` crate、`tool-runtime`、`runtime_backend/mcp_bridges.rs` | `current` | Lime 命名必须保持 `mcp__server__tool` current surface | 持续用 contract guard 防 mock 退回裸工具名 | P1 `adopt-now` |
| Plugin / skills | `plugin/src/manifest.rs`、`core-skills/src/model.rs`、`skills` | plugin manifest、skill metadata、policy、dependency 和 runtime injection 分层 | `plugin_packages`、`skills`、`skill_registry.rs`、应用中心 | `current` | Lime 是桌面应用中心，不能照搬 Codex CLI 分发；skill 注入也要受 context budget 约束 | 保留 manifest/skill 纪律，UI 和安装走 Lime Plugin 主链，runtime 注入走 bounded fragment | P1 `adapt-for-desktop` |
| Rollout / state / trace | `rollout`、`thread-store`、`state`、`message-history`、`rollout-trace` | 会话历史可 replay，状态有 schema/migration，trace reducer 可还原 runtime 过程 | `ProjectionStore`、`EventLogWriter`、`SidecarStore`、Codex import、Evidence/export、replay | `current` | Lime 不能把 Codex rollout 当事实源，也不能丢 trace / telemetry 与 turn 的关联 | import source -> canonical bundle -> Lime read model；trace/telemetry 绑定 session/thread/turn | P0 `adopt-now` |
| Realtime / media / collaboration | `realtime-*`、`core/src/realtime_*`、`protocol/v2/realtime.rs`、image generation extension | 实时和媒体能力仍落入 protocol notification / ThreadItem | 多模态附件、artifact workbench、media output projection、ModelCapability | `partial` | Lime 多模态更强，但需要避免 provider media event 直通 UI | media 进入 ContentPart/reference，Agent lifecycle 仍按 Thread/Turn/Item | P2 `adapt-for-desktop` |
| TUI chat rendering | `tui/src/chatwidget.rs`、`markdown_stream.rs` | UI 消费 structured session facade，但 chatwidget 自身过大 | `AgentChatWorkspace.tsx`、`MessageList.tsx`、`StreamingRenderer.tsx` | `current` | Lime Workspace 仍是最大前端膨胀点 | 吸收 facade/streaming 模式，避免复制 chatwidget 大文件债 | P0 `adapt-for-desktop` |
| Markdown / diff | `tui/src/markdown.rs`、`diff_render.rs` | 渲染和 diff 是独立模块 | `MarkdownRenderer.tsx`、artifact workbench、file change cards | `current` | Lime 还要处理 GUI artifact / media / canvas | 渲染模块只消费 projection，不参与 runtime 语义判断 | P1 `adapt-for-desktop` |
| Testing fixtures / schema | `app-server-test-client`、`schema_fixtures.rs`、`tui/tests`、`core/suite` | integration fixture、schema export、snapshot、core suite 共同防漂移 | `smoke:agent-runtime-current-fixture`、`test:contracts`、`verify:gui-smoke`、Rust related tests | `current` | Lime 必须额外证明 GUI 真实可见，同时防协议 schema 漂移 | Codex fixture 思路 + Lime contract + Electron GUI smoke 三证据 | P0 `adopt-now` |
| File size discipline | `AGENTS.md` | 500/800 行规则，但缺机械守卫 | `governance:file-size`、`internal/refactor/*` | `current` | Lime 已有更强守卫，但 Workspace 仍超大 | 每个对齐实施都不得扩大巨型文件 | P0 `adopt-now` |

## 2.1 Codex 核心体系压缩矩阵

| 核心层 | 第一问题 | Lime 落点 | 优先动作 |
| --- | --- | --- | --- |
| Agent 原语 | 它属于哪个 Thread、哪个 Turn、哪个 Item？ | `agentSession`、turn execution、projection | P0 先建映射口径 |
| Protocol-first | method、type、notification、schema、client 是否一处定义成组演进？ | `app-server-protocol`、`packages/app-server-client`、`src/lib/api/*` | P0 method registry + contract |
| Serialization scope | 这个请求应该与哪个范围串行？ | App Server processor、runtime queue、client gateway | P0 纳入 method metadata |
| Core runtime | 业务是在 runtime 闭环，还是散落到 processor/UI？ | RuntimeCore、agent crate、domain modules | P1 拆 domain 子模块 |
| Event materialization | core/provider event 如何变成 item/history/projection？ | event mapper、ProjectionStore、Timeline | P0 固化转换链 |
| Tool/approval/sandbox | 工具和权限是控制面还是 UI 文案？ | tool-runtime、Desktop Host permission、action panels | P1 分层 |
| Context/compaction | 模型看的是 bounded fragment 还是无界原文？ | context projection、memory、sidecar/evidence | P1 bounded fragment |
| Persistence/replay/trace | 历史、Evidence、Telemetry 是否可回到 turn/item？ | EventLogWriter、Evidence/export、replay | P0 current read model |
| Plugin/skills/MCP | manifest、skill、MCP binding 是否分层？ | plugin_packages、skills、mcp | P1 防 UI 安装形态污染 runtime |
| TUI facade/projection | UI 是否只消费 typed facade 和 projection？ | `src/lib/api/*`、hooks、selectors | P0 收敛组件调用 |
| Realtime/media | 媒体和实时事件是否仍进 item 体系？ | ContentPart、Workbench、ModelCapability | P2 多模态投影 |
| Quality/fixture | 有没有协议、runtime、GUI 三类证据？ | contracts、fixture、GUI smoke | P0 建验证矩阵 |

## 3. P0 差距清单

| 差距 | Codex 原点 | Lime 当前风险 | 第一刀 |
| --- | --- | --- | --- |
| Thread/Turn/Item 没有被放在最高优先级 | `Thread -> Turn -> Item` 原语 | 已通过 P1-1 文档入口降低该风险；后续风险在于工程实现绕过前置检查 | 使用 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 作为 Agent 改动模板，再推进协议、runtime、projection |
| Codex 核心体系没有被成组看待 | `codex-architecture-map.md` 全图谱 | 只学原语或 App Server，遗漏 event materialization、serialization scope、fixture 等关键层 | 每个模块必须先落到核心体系矩阵 |
| method 定义分散 | `common.rs` 单一宏 | 新 JSON-RPC 仍可能多处手动同步 | 建 method definition registry，先覆盖新增 method |
| request serialization scope 不明确 | `ClientRequestSerializationScope` | 可能靠 UI 节流或隐式锁处理请求并发 | scope 成为 method definition metadata |
| turn 终态容易被 UI 补丁化 | turn lifecycle structured event | 卡住问题可能靠 timeout / UI 文案处理 | 以 `turn.completed/failed/interrupted` 类事件收口 active stream |
| event materialization 边界不够显式 | `event_mapping.rs` / `thread_history.rs` | provider/core event 可能被组件直接消费 | 固化 provider event -> LLMEvent -> runtime event -> item projection |
| 前端投影入口多 | ThreadItem / event_mapping | `MessageList`、`StreamingRenderer`、Timeline 投影重复 | 定义统一 projection 输入模型 |
| Workspace 巨型入口 | Codex `chatwidget` 的反面教材 | `AgentChatWorkspace.tsx` 仍 6000+ 行 | 新需求先抽 domain hook / ViewModel |
| Codex 跟进无固定入口 | 上游每天变化 | 参考结论散落 | 每周 upstream diff 写入 repo |

## 4. P1 差距清单

| 差距 | Codex 原点 | Lime 当前风险 | 第一刀 |
| --- | --- | --- | --- |
| context fragment 边界不够统一 | `core/context` | 多模态 / workspace metadata 易超预算 | 建 request metadata bounded 规则 |
| core session/task runtime 分层口径不够硬 | `core/src/session/*`、`core/src/tasks/*` | runtime 逻辑可能回流 processor 或中心文件 | 新增能力先进 runtime domain 子模块 |
| tool lifecycle 展示过宽 | tool/event lifecycle | UI 工具展示持续膨胀 | 按 domain 拆 tool projection |
| approval 和 Desktop 权限耦合风险 | `execpolicy` / approval events | 桌面权限可能混入 runtime 业务 | approval event 与 Desktop Host 能力分层 |
| plugin/skills 双重产品语义 | Codex plugin/skills | Lime 应用中心和 runtime skill 容易混淆 | manifest / skill / UI runtime 三层定义 |
| rollout trace / telemetry 关联不足 | `rollout-trace` | Evidence、Replay、requestTelemetry 可能无法回溯 turn | trace/telemetry 必须关联 session/thread/turn |

## 5. 与 opencode 的互补边界

| 决策问题 | Codex 负责 | opencode 负责 |
| --- | --- | --- |
| Agent turn 如何运行 | thread / turn / item / tool lifecycle | 不参与；opencode Session V2 不作为本轮架构参考 |
| 协议如何生成 | app-server-protocol、typed client、schema | 不参与；opencode protocol / generated client 不作为本轮架构参考 |
| 模型能力如何表达 | provider registry 纪律 | capabilities、variant、cost、limit、input/output/tool/reasoning/cache |
| 多模态消息如何表示 | ThreadItem / runtime event | text/media/tool-call/tool-result/reasoning ContentPart |
| UI 如何消费事件 | TUI facade 和 streaming 状态机 | 不参与；opencode 只提供模型能力和媒体 part 参考 |

## 6. 明确拒绝项

| Codex 模式 | 拒绝原因 | Lime 处理 |
| --- | --- | --- |
| 复制 TUI UI 结构 | Lime 是桌面 GUI，不能把 TUI 组件形态作为目标 | 只吸收状态机、facade、projection |
| 把 rollout JSONL 当运行时 store | Lime 已有 read model / evidence / sidecar | rollout 只作为 import source |
| 按 Codex crate 前缀重命名 | Lime 不发布同构 crates，重命名成本高 | 保留 Lime 现有 crate 语义 |
| 只靠文档限制大文件 | Codex 自身有大文件债 | Lime 必须保留机械体量守卫 |
| 在 Electron 里做后端业务 adapter | Codex 没有 Lime 的 Desktop Host 边界 | Electron 只做桌面壳能力 |
