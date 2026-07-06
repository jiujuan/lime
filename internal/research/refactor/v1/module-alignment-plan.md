# 模块化对齐计划

> 状态：current research baseline
> 更新时间：2026-07-05
> 目标：把 Codex 原点和 opencode 多模型/多模态能力参照拆成可推进模块，每个模块都有 Lime 落点、第一刀和验收方式。

## 1. 推进规则

每个模块都按同一格式推进：

1. 先判断该模块落在 Codex 核心体系哪一层；涉及 `Thread / Turn / Item` 时先映射原语，再看协议、runtime 或 UI。
2. 读取 Codex 原点路径。
3. 如果涉及多模型、多模态、Provider/Model、ContentPart、media 或 provider lowering，补读 opencode 参照路径。
4. 读取 [naming-alignment.md](./naming-alignment.md)，确认是否应使用 `Thread / Turn / Item` 短命名。
5. 涉及 Agent 主链时，读取 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md)，先填 Thread、Turn、Item 归属。
6. 读取 [lime-current-state.md](./lime-current-state.md)，确认 Lime current owner、current / compat / dead 分类和现状缺口。
7. 分类为 `adopt-now / adapt-for-desktop / watch / reject-for-lime`。
8. 定义第一刀。
9. 绑定验证命令。
10. 写回 roadmap 或 exec-plan。
11. 同步更新 [priority-tracking-plan.md](./priority-tracking-plan.md) 的队列状态和过程日志。

硬限制：除 `Provider / Model / Multimodal` 模块和明确的多模型 / 多模态能力字段外，opencode 不作为第一参考。Session、Tool、UI、协议治理、Effect / Bun runtime 一律回到 Codex + Lime current 裁决。

Codex 核心体系的模块切分以 [codex-architecture-map.md](./codex-architecture-map.md) 为事实源：

| Codex 核心层 | 本计划模块 | 是否 P0 |
| --- | --- | --- |
| Agent 原语 | A / D | 是 |
| Protocol-first | C | 是 |
| Request serialization scope | C | 是 |
| App Server processor | B | 是 |
| Core session / task runtime | D | 是 |
| Event materialization | J | 是 |
| Tool / approval / sandbox | E | 否 |
| Context / compaction | F | 否 |
| Provider / model / multimodal | G | 是，且只在本层参考 opencode |
| TUI facade / projection | H / J | 是 |
| Persistence / replay / trace | K | 是 |
| Plugin / skills / MCP | L | 否 |
| Realtime / media / collaboration | M | 否 |
| Quality / fixture / schema | I | 是 |

现状优先级补充：如果模块计划与 Lime current-state 冲突，以 [lime-current-state.md](./lime-current-state.md) 的 current 主链和 dead 禁止项为落点。特别是 `lime-rs/src/**`、旧 `agent_runtime_*` production command surface、生产 mock fallback 都不能作为实施入口。

## 2. 模块 A：Codex Agent 原语

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `protocol/v2/thread_data.rs`、`protocol/v2/item.rs`、`protocol/v2/turn.rs`、`protocol/event_mapping.rs`、`protocol/thread_history.rs` |
| Lime owner | `agentSession/*`、`runtime/turn_execution.rs`、`agent/src/turn_execution.rs`、`runtime/projection_*`、Timeline / MessageList / Workbench |
| 分类 | `adopt-now` |
| 第一刀 | 建立 `Thread -> agentSession`、`Turn -> turn execution`、`Item -> RuntimeEvent / ContentPart / TimelineItem` 的映射表，并作为后续协议、runtime、UI 改动的前置检查 |
| 不做 | 不裸改现有 `agentSession/*` 协议名；不把 Thread/Turn/Item 降级成 UI 状态字段 |
| 验收 | 文档映射完成；后续工程改动必须能说明 session/thread、turn、item 三层归属 |

实施细则：

- Thread 是长期会话和 session tree，不是单个消息列表。
- Turn 是一次执行边界，不是一个 loading boolean。
- Item 是可持久化和可投影语义单元，不是 React 组件内部临时 shape。
- 新文档和新设计使用 [naming-alignment.md](./naming-alignment.md) 的短命名：Thread 管历史，Turn 管执行，Item 管投影。
- 进入工程前必须按 [thread-turn-item-invariant.md](./thread-turn-item-invariant.md) 填写前置检查。
- opencode 不参与本模块。

## 3. 模块 B：框架骨架

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `codex-rs/app-server/src/message_processor.rs`、`request_processors/*` |
| Lime owner | `lime-rs/crates/app-server/src/processor/*`、`runtime/*` |
| 分类 | `adopt-now` |
| 第一刀 | 后续新增 App Server method 必须选 domain processor 和 runtime 子模块，不向中心文件堆实现 |
| 不做 | 不引入 trait registry 或动态路由，只为抽象而抽象 |
| 验收 | Rust 定向测试 + `npm run test:contracts` |

实施细则：

- `processor` 只负责 JSON-RPC 参数解析、调用 domain runtime、返回 response。
- `runtime` 子模块承接业务操作。
- 如果新逻辑无法归入现有 domain，优先建 domain 子模块，而不是塞进 `runtime.rs`。
- 文件超过 800 行前先拆。

## 4. 模块 C：协议骨架

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `app-server-protocol/src/protocol/common.rs`、`v2/*`、`export.rs` |
| Lime owner | `app-server-protocol/src/protocol/v0/*`、`schema_export.rs`、`packages/app-server-client` |
| 分类 | `adopt-now` |
| 第一刀 | 建立 method definition registry，把 method name、kind、params、response、notification、serialization scope 收敛到一处 |
| 不做 | 不为对齐 Codex 把 Lime `v0` 改名为 `v2` |
| 验收 | `npm run check:protocol-types`、`npm run test:contracts` |

实施细则：

- 新 method 的定义只允许从 registry 派生到 schema、client 和 catalog。
- serialization scope 是 method metadata，不靠 UI 节流或隐式锁表达。
- 先覆盖 turn/thread/process/MCP oauth/fs watch 类高风险 method，再扩大到普通查询。
- TS 生成先沿用现有脚本；ts-rs 直接导出作为二期评估。
- 生产组件不得绕过 `src/lib/api/*`。

## 5. 模块 D：Thread / Turn / Item runtime

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `protocol/v2/thread_data.rs`、`protocol/v2/thread.rs`、`protocol/v2/turn.rs`、`protocol/v2/item.rs`、`core/src/session/*`、`core/src/tasks/*`、`thread-store`、`request_processors/thread*` |
| Lime owner | `agentSession/*`、`runtime/session_*`、`runtime/turn_execution.rs`、`agent/src/turn_execution.rs` |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 统一 Thread/Turn/Item 三层 ID、turn queue、task lifecycle 和终态口径，所有 UI 状态收口到结构化 item projection |
| 不做 | 不用固定 timeout 或 UI 文案合成终态 |
| 验收 | `npm run smoke:agent-runtime-current-fixture` + 相关状态机单测 |

实施细则：

- Codex `Thread` 对应 Lime `agentSession` 现状名；新设计使用 `Thread`，旧协议名不裸改。
- turn 的 completed / failed / interrupted 必须可投影到 GUI。
- turn queue、model stream、tool execution、context assembly 进入 RuntimeCore / agent domain，不进 processor 或 UI。
- item 必须成为 MessageList / Timeline / Workbench 的共同输入，而不是各组件自造 shape。
- resume、interrupt、cancel-then-continue 必须作为同一 session 的真实链路验证。

## 6. 模块 E：Tool / Approval

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `tools`、`core/src/tools/*`、`exec`、`codex-mcp`、`execpolicy`、`sandboxing`、`approval_events.rs` |
| Lime owner | `tool-runtime`、`agent/src/*tool*`、`runtime_backend/*`、front-end tool projection |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 把 tool 展示分为 shell、MCP、web、patch、browser、artifact、approval domain |
| 不做 | 不在 UI 里按工具输出文本猜 tool 状态 |
| 验收 | tool projection 单测 + Agent runtime fixture |

实施细则：

- tool started / delta / result / failed 分离。
- approval 只表示 action required / resolved，不等同于桌面权限。
- sandbox / exec policy 留在 runtime 控制面，Electron Desktop Host 只提供桌面能力边界。
- browser 和 artifact 是 Lime 增强，沿用结构化 lifecycle，不照搬 Codex UI。

## 7. 模块 F：Context / Token

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `core/context`、`context-fragments`、`core/src/context_manager/*`、`core/src/compact*`、AGENTS 中 model visible context 规则 |
| Lime owner | `turn_input_envelope.rs`、`protocol_context_projection.rs`、memory prompt、workspace metadata |
| 分类 | `adopt-now` |
| 第一刀 | 为 request metadata / workspace skill bindings / memory / evidence 摘要建立 bounded fragment 规则 |
| 不做 | 不把高容量 sidecar、完整工具输出或完整导入记录直接塞进模型上下文 |
| 验收 | Rust prompt 投影定向测试 + 前端 metadata builder 单测 |

实施细则：

- 每类注入上下文必须有大小上限。
- 超预算内容进入 sidecar/evidence，只给模型摘要和引用。
- compaction policy 是 runtime 能力，不能散落在 prompt 拼接处。
- 新增 >1k token 单项需额外审查。

## 8. 模块 G：Provider / Model / Multimodal

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `model-provider`、`models-manager` |
| opencode 参照 | `specs/v2/provider-model.md`、`packages/llm/src/schema/*`、`packages/llm/src/protocols/*` |
| Lime owner | `modelProvider/*` App Server methods、`model-provider` crate、`agent-protocol`、多模态任务链、模型设置 UI |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 建立 provider/model capability map，覆盖 input/output/tools/reasoning/cache/media |
| 不做 | 不让 UI 直接拼 provider body；不参考 opencode Session、Tool runtime 或 UI 组件 |
| 验收 | model/provider 定向测试、前端设置 UI 回归、`npm run test:contracts` |

实施细则：

- Model capability 驱动 UI 附件禁用态和 runtime request assembly。
- 多模态 ContentPart 至少能表达 text、media、tool-call、tool-result、reasoning、artifact、approval、reference。

## 9. 模块 H：Frontend UI

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `tui/src/app_server_session.rs`、`chatwidget.rs`、`markdown_stream.rs`、`diff_render.rs` |
| Lime owner | `AgentChatWorkspace.tsx`、`MessageList.tsx`、`StreamingRenderer.tsx`、`AgentThreadTimeline.tsx`、artifact workbench |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 新增 UI runtime 逻辑先进入 hook / ViewModel / projection，不进入巨型组件 |
| 不做 | 不复制 Codex TUI 组件结构，不把 GUI 文案硬编码 |
| 验收 | 定向 Vitest、ESLint、i18n 检查，GUI 主路径补 smoke |

实施细则：

- `AgentChatWorkspace.tsx` 保持 orchestration，不新增业务状态机。
- `StreamingRenderer.tsx` 只消费 projection，不判断协议语义。
- `MessageList` 和 Timeline 共享结构化 ContentPart。
- Artifact Workbench 是 Lime GUI 增强，不能被 Codex TUI 形态限制。

## 10. 模块 I：Quality / Evidence

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `app-server-test-client`、`schema_fixtures.rs`、`tui/tests`、`core/suite`、`rollout-trace` |
| Lime owner | `smoke:agent-runtime-current-fixture`、`verify:gui-smoke`、`evidence/export`、replay |
| 分类 | `adopt-now` |
| 第一刀 | 每个对齐模块绑定最小验证命令，不以 lint/typecheck 作为 GUI 交付证据 |
| 不做 | 不用 mock backend 或 renderer mock fallback 证明生产路径 |
| 验收 | 按模块验证矩阵执行 |

实施细则：

- Rust 行为用定向测试。
- 协议用 contract。
- schema / generated type 用 fixture 防漂移。
- Agent runtime 用 current fixture。
- GUI 可见性用 Electron smoke / Playwright。
- Evidence/replay 消费 Lime current export，不消费 Codex 原始文件。

## 11. 模块 J：Event Materialization / Projection

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `protocol/event_mapping.rs`、`protocol/item_builders.rs`、`protocol/thread_history.rs` |
| Lime owner | `runtime/projection_*`、ProjectionStore、MessageList / Timeline selectors、Evidence/export |
| 分类 | `adopt-now` |
| 第一刀 | 固定 provider event -> provider-neutral LLMEvent -> Agent runtime event -> item projection 的转换链 |
| 不做 | 不让 React 组件直接消费 provider wire event 或用文案猜 item 类型 |
| 验收 | projection 单测 + `npm run smoke:agent-runtime-current-fixture` |

实施细则：

- materialization 是 runtime / protocol 边界，不是 UI helper。
- 每个 item 必须有稳定 id、turn 归属、sequence 和 kind。
- Thread history、GUI projection、Evidence export 消费同一结构化结果。

## 12. 模块 K：Persistence / Replay / Trace

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `rollout`、`thread-store`、`state`、`message-history`、`rollout-trace` |
| Lime owner | ProjectionStore、EventLogWriter、SidecarStore、Codex import adapter、Evidence/export、replay |
| 分类 | `adopt-now` |
| 第一刀 | 明确 Codex import source -> canonical bundle -> Lime read model，trace / telemetry 绑定 session/thread/turn |
| 不做 | 不把 Codex rollout JSONL 或 state sqlite 接成 Lime runtime store |
| 验收 | import fidelity matrix + evidence/export / replay 定向验证 |

实施细则：

- Codex 原始文件只读。
- Lime current read model 是唯一 runtime truth。
- requestTelemetry 无匹配请求时输出空摘要，不保留伪 `unlinked`。

## 13. 模块 L：Plugin / Skills / MCP

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `plugin/src/manifest.rs`、`core-skills/src/model.rs`、`skills`、`codex-mcp` |
| Lime owner | `plugin_packages`、`skills`、`skill_registry.rs`、`mcp` crate、应用中心 |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 把 manifest、skill metadata/policy/dependency、MCP binding、UI 安装形态拆成四层 |
| 不做 | 不把 Codex CLI plugin 分发形态照搬到 Lime 应用中心 |
| 验收 | skill registry 定向测试 + MCP contract guard |

实施细则：

- skill 注入 context 时受 bounded fragment 规则约束。
- MCP tool name surface 保持 `mcp__server__tool`，不回退裸工具名或 mock 命名。
- 应用中心 UI 只是安装和管理形态，不是 runtime capability 的事实源。

## 14. 模块 M：Realtime / Media / Collaboration

| 项 | 内容 |
| --- | --- |
| Codex 原点 | `realtime-*`、`core/src/realtime_*`、`protocol/v2/realtime.rs`、image generation extension |
| opencode 参照 | 仅限 media ContentPart、provider event、provider lowering |
| Lime owner | 多模态 runtime、ModelCapability、ContentPart、media workbench、artifact projection |
| 分类 | `adapt-for-desktop` |
| 第一刀 | 媒体输入输出先进入 ModelCapability / ContentPart / reference，再 materialize 到 item projection |
| 不做 | 不让 provider media wire event 直通 UI；不参考 opencode UI |
| 验收 | 多模态 provider 定向测试 + GUI media projection smoke |

实施细则：

- Codex 负责 Agent lifecycle；opencode 只负责媒体能力表达。
- image/audio/video/document 都要有 capability gate。
- 高容量 media body 进入 sidecar/reference，模型只看 bounded preview。

## 15. 模块优先级

| 优先级 | 模块 | 原因 |
| --- | --- | --- |
| P0 | Codex Agent 原语 | `Thread / Turn / Item` 是所有 Agent runtime、history、projection、replay 的第一骨架 |
| P0 | 协议骨架 | 防止新增能力继续多点手改 |
| P0 | Thread / Turn / Item runtime | 直接影响 Agent 可用性、GUI 卡住问题和历史恢复 |
| P0 | Event Materialization / Projection | 决定 core/provider event 是否能稳定变成 UI item、history 和 Evidence |
| P0 | Persistence / Replay / Trace | 防止 Codex import、Evidence、Replay 和 telemetry 分叉 |
| P0 | Provider / Model / Multimodal | Lime 产品本质是多模型、多模态，不能只按 Codex 裁决 |
| P0 | Frontend UI | `AgentChatWorkspace.tsx` 是最大增长风险 |
| P0 | Quality / Evidence | 没有验证入口，对齐会退化成文档 |
| P1 | Tool / Approval | 影响复杂任务可靠性 |
| P1 | Context / Token | 影响 token 成本和模型缓存 |
| P1 | 框架骨架 | Rust 侧已有基础，重点是防回涨 |
| P1 | Plugin / Skills / MCP | 支撑长期能力生态，但需要先守住 runtime / UI 分层 |
| P2 | Realtime / Media / Collaboration | 与多模态产品价值强相关，但依赖 capability、projection、sidecar 先稳定 |
