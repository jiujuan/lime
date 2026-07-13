# Lime 全局架构图

状态：current

## 1. 目的与裁决顺序

本文件是 Lime 的唯一全局架构地图。它回答目录归属、跨层数据流、依赖方向、协议边界和验证证据应该落在哪里。新增能力、重大重构、目录调整和架构评审都先以本文件判断 owner；领域文档只能补充具体契约，不能建立第二套运行时或改写这里的边界。

裁决顺序：

1. 当前构建图、协议 schema、运行代码和稳定测试。
2. 本架构图与根 `AGENTS.md`。
3. `internal/aiprompts/` 的领域边界与质量规则。
4. `internal/exec-plans/` 的已确认执行计划。
5. 路线图、研究、历史 evidence 和 Git history。

Agent loop、Thread/Turn/Item、App Server、状态机、工具生命周期、MCP、Skills、Multi-Agent、历史恢复、projection 和交付门禁以 `/Users/coso/Documents/dev/rust/codex` 的 current 结构为准。多模型、provider capability、多模态 message part 和 provider-specific lowering 以 `/Users/coso/Documents/dev/js/opencode` 的结构为准。两者不一致时，runtime ownership 服从 Codex，provider wire 服从 OpenCode。

## 2. 仓库目录地图

| 目录 | 类型 | Owner / 职责 | 禁止放入 |
| --- | --- | --- | --- |
| `src/` | Renderer | React 产品 UI、view model、renderer gateway、i18n、局部显示状态 | Rust 业务实现、Electron main 逻辑、provider wire、生产 mock fallback |
| `electron/` | Desktop Host | main、preload、IPC 白名单、窗口/托盘/系统能力、sidecar 生命周期、updater | Agent 状态机、Thread/Turn/Item、模型调用、业务 read model |
| `lime-rs/crates/` | Rust workspace | App Server、runtime、协议、provider、工具、持久化、领域服务 | 已删除的旧 Rust root 或 Tauri wrapper 的替代品 |
| `packages/` | 可复用 TypeScript package | 跨 Renderer/Host 的 typed client、schema、projection、UI contract | 仅单个页面使用的产品状态机、Electron main 实现 |
| `scripts/` | 校验与自动化 | 可复用质量入口、fixture smoke、发布/治理脚本 | 产品业务逻辑、未登记的根级临时脚本 |
| `resources/`、`lime-rs/resources/` | 受版本控制资源 | 内置 skill、模板、静态运行时资源 | 运行时生成物、用户数据、机密 |
| `internal/aiprompts/` | current 工程事实源 | 架构、命令、质量、治理、GUI、目录准入 | 历史迁移日记和实现副本 |
| `internal/exec-plans/` | 执行记录 | 多轮计划、确认记录、进度、证据索引、blocker | 未经确认的长期架构规则 |
| `internal/roadmap/` | 未来规划 | 阶段目标、优先级、产品路线 | current API 或 runtime owner 的唯一说明 |
| `internal/research/` | 研究证据 | 对照、审计、外部实现分析 | 生产代码或 current 架构定义 |
| `internal/test/`、`internal/testing/` | 测试设计 | 场景、质量矩阵、测试规范 | 产品实现 |
| `docs/` | 对外文档站 | 站点内容、配置、静态资源 | 内部工程规则、执行计划、私有 evidence |
| `.codex/` | Codex 项目配置 | 可复用 skill、项目级 agent 配置 | 产品业务实现或第二套架构事实源 |
| `extensions/` | 独立扩展 | Chrome extension 等独立宿主实现 | Renderer/Agent runtime 的共享业务 owner |

根目录的 `package.json`、`forge.config.mjs`、`vite.config.*`、`tsconfig*.json`、`eslint.config.*` 和 `lime-rs/Cargo.toml` 是构建与发布边界。变更它们必须同步锁文件、相关验证和架构图中受影响的边界。

## 3. 前端目录规范

### 3.1 Renderer 启动与页面

```text
src/main.tsx
  -> RootRouter.tsx
  -> App.tsx
  -> components / features / pages
```

| 路径 | 准入规则 |
| --- | --- |
| `src/components/<domain>/` | 用户可见组件、组件专属 view model 和渲染/交互测试；不直接执行 App Server 业务逻辑。 |
| `src/features/<domain>/` | 可独立演进的产品域；包含该域 UI、状态投影、domain test 和入口适配。 |
| `src/pages/` | 独立窗口或路由页面；只做页面组装和路由级边界，不堆领域状态机。 |
| `src/hooks/` | 跨产品域的 React composition；领域私有 hook 先留在 `components/<domain>/` 或 `features/<domain>/`。 |
| `src/lib/api/` | typed App Server / Desktop Host gateway、请求构造和响应 normalization；不得创建平行业务 runtime。 |
| `src/lib/desktop-host/` | renderer 对 Desktop Host 的能力探测与受控 test fixture；生产必须走真实 bridge。 |
| `src/lib/dev-bridge/` | `safeInvoke`、HTTP transport、`app_server_handle_json_lines`、可用性和事件监听；旧命令 policy / mock 只能作为治理或测试辅助。 |
| `src/lib/<domain>/` | 无 React 生命周期的领域 helper、纯 projection、formatter、schema adapter；不得变成无 owner 的杂物层。 |
| `src/contexts/` | 跨组件树的 UI context；不持有后端事实状态。 |
| `src/stores/` | renderer 局部交互状态；不能替代 App Server read model。 |
| `src/i18n/` | resource key、locale 配置与语言边界；所有用户可见文案从这里消费。 |
| `src/types/` | renderer 专用稳定类型；跨边界类型优先放 protocol 或 `packages/`。 |
| `src/test/` | 测试共用 harness、fixture 和 matcher；不放产品实现。 |

组件测试只覆盖渲染、DOM 交互、hook 生命周期和关键接线。可纯化的筛选、分组、request builder、状态转移、formatter 和 projection 应拆为 `*.unit.test.ts` 覆盖。

### 3.2 Renderer 数据流

```text
UI event
  -> feature/component view model
  -> src/lib/api typed gateway
  -> Desktop Host bridge or app-server client
  -> App Server JSON-RPC
  -> notification / agentSession/read
  -> pure projection
  -> UI state
```

Renderer 可以临时保存输入框、选择态、展开态和 optimistic UI；不能生成、修补或持久化 Thread/Turn/Item 真相。流完成、取消和失败必须消费 App Server terminal event/read model，禁止通过固定 timeout 或本地合成事件断言完成。

## 4. Electron Desktop Host 规范

| 路径/模块 | 职责 |
| --- | --- |
| `electron/main.ts` | Electron 生命周期与 host 组装入口。 |
| `electron/preload.ts` | `contextBridge`、最小暴露面和 IPC 调用入口。 |
| `electron/ipcChannels.ts` | IPC channel 常量与协议白名单。 |
| `electron/*Host.ts` | 一个桌面能力一个 owner，例如 App Server sidecar、文件/项目壳、窗口、通知、更新、浏览器、语音。 |
| `electron/appServerHost.ts` | sidecar 生命周期与 `app_server_handle_json_lines` 的宿主边界。 |
| `electron/forge/`、`forge.config.mjs` | Forge 打包、maker、签名和 release 事实源。 |

Electron 负责窗口、托盘、Dock、系统文件选择、权限、外部链接、自动更新和 sidecar 生命周期。它不得保存业务 session、解释 provider response、执行模型工具、拼 Thread/Turn/Item 或提供业务 mock fallback。

新增 Electron 命令前先判断是否只是已有 `app_server_handle_json_lines` 的转发。只有系统宿主能力才新增 IPC；业务能力一律优先新增 App Server JSON-RPC。

## 5. TypeScript Package 规范

| Package | 职责 |
| --- | --- |
| `packages/app-server-client` | App Server JSON-RPC typed client 与生成协议工件。 |
| `packages/agent-runtime-client` | 可复用的 Agent runtime client facade，不拥有 Renderer 状态。 |
| `packages/agent-runtime-projection` | 纯事件/read model projection、tool/display schema 等可测试逻辑。 |
| `packages/agent-runtime-ui` | 可复用的 runtime UI primitives，不拥有 App Server transport。 |
| `packages/agent-ui-contracts` | 跨 UI 的 schema、contract 和 generated/validated 类型。 |
| `packages/agent-workbench-adapter` | 工作台与 runtime 的明确 adapter 边界。 |
| `packages/agent-capability-catalog` | capability catalog 的稳定消费面。 |
| `packages/lime-cli-npm` | 发布的 Node CLI package。 |

package 只在至少两个独立 consumer 需要稳定边界时创建。单一 Renderer feature、单个 Electron host 或单个 Rust domain 不得先抽 package。`dist/`、`node_modules/` 不是事实源。

## 6. Rust Workspace 规范

### 6.1 App Server 与协议组

| Crate | 职责 |
| --- | --- |
| `app-server-protocol` | JSON-RPC method、params、result、notification、schema export。 |
| `app-server-transport` | JSONL/transport framing、连接与传输错误。 |
| `app-server-client` | Rust client。 |
| `app-server-test-client` | 测试专用 protocol client。 |
| `app-server-daemon` | sidecar/daemon 生命周期。 |
| `app-server` | request dispatch、RuntimeCore、host context、ProjectionStore、evidence/export、领域 data source。 |

App Server 是 Renderer、Electron、CLI、Plugin 与 runtime 的唯一跨应用业务协议入口。它可以做 transport、鉴权/初始化、请求编排、host context、projection 和 repository 接线；不能持有 provider-specific wire payload 或把工具实现复制进 handler。

### 6.2 Agent Runtime 组

| Crate | 职责 |
| --- | --- |
| `agent-protocol` | Thread/Turn/Item、RuntimeEvent、稳定 runtime DTO。 |
| `agent-runtime` | 回合生命周期、action-required、队列、取消、stream 和 runtime scope。 |
| `agent` | current provider turn、session/store adapter、runtime facade、业务级 agent 编排。 |
| `runtime-core` | 模型路由、上下文 fragment、message/media part、跨 provider 的运行时模型。 |
| `thread-store` | Thread/Turn/Item 的存储、检索、分页、历史和 session repository。 |

状态模型与 Codex 对齐：Thread 是会话上下文，Turn 是一次执行，Item 是可恢复的输入、输出、工具或审批活动。`ProjectionStore` 和 repository/read model 是 GUI 读取的唯一持久化真相；queue payload、stream buffer 与 renderer cache 不得反向成为事实源。

canonical 持久化的 current owner 是 App Server `ProjectionStore` 对 `thread_store::ThreadStore` 的直接 SQLite 实现。typed `ThreadHistoryChangeSet`、Thread/Turn/Item 表、sequence collision、rollback/remove、opaque cursor、archive 和 metadata patch 必须在同一事务边界完成；不得增加 `RuntimeStore` 适配层、第二个 transcript 数据库或 renderer 持久化副本。旧 `thread-store::runtime_store`、`session_repository` 与 AgentSession read path 属于待 S2e 迁出的 `deprecated` surface。

session start 返回成功前必须先在 ProjectionStore 建立 empty canonical Thread，再把 session 暴露到 RuntimeCore 内存状态；SQLite 失败不得留下 memory-only session。canonical `session_id` 与 `thread_id` 均为唯一 identity，跨 RuntimeCore 重启也不得一对多。显式 session delete 与 import replace 必须先在同一 SQLite 事务删除 canonical/projected 数据，再移除内存状态；GUI、AgentSession adapter 和首事件 lazy create 都不能充当 empty Thread fallback。首事件 ensure 只保留为防御式幂等边界，不再拥有 Thread 创建时点。

action-required/approval 的 live continuation 归 `agent-runtime` session/turn scoped pending state；可持久化恢复事实归 RuntimeCore `StoredSession.events`。`agentSession/action/respond` 必须先从 current `action.required` 事件恢复 canonical action type 与 session/thread/turn scope，再校验 caller 参数；不得信任 caller type、从 presentation/read-model JSON 二次解析、或让 RuntimeBackend 回读 AppDataSource。重启后只能恢复 typed descriptor，不能伪造原 oneshot；无 continuation 时返回结构化 `action_not_resumable` 且不得写 `action.resolved`。ask-user/elicitation 的否定响应必须消费 waiter 并投影 `action.canceled`。

### 6.3 Provider 与工具组

| Crate | 职责 |
| --- | --- |
| `model-provider` | provider route、canonical message/content、capability、protocol lowering、HTTP stream 与 normalized provider event。 |
| `tool-runtime` | tool definition、参数解析、approval/sandbox、执行 dispatch、MCP connection、tool result normalization。 |
| `mcp` | MCP server/client 的领域集成。 |
| `skills` | skill discovery、读取与运行时集成。 |
| `patch-apply` | 受控 patch 应用领域能力。 |
| `browser-runtime`、`media-runtime`、`voice-core` | 浏览器、媒体、语音等独立 runtime domain。 |

canonical Tool display contract 是 `ThreadItemPayload::{Tool,McpToolCall,CollabAgentToolCall}` 加 `ToolOutput`；call identity、arguments、structured content、duration、truncation、output reference 与 error 必须是 typed 字段，不能藏在 metadata 或由 Renderer 解析文本。Approval Item 的 ordered `available_decisions` 与 resolution 使用 Codex 同义的 `Approved`、`ApprovedForSession`、`Denied`、`Abort`、`TimedOut`；pending 只由 Item status 表达，此时 `decision = null`。GUI 只允许显式 lower 为 `allow_once`、`allow_for_session`、`decline`、`cancel`，不得从 scope 反推丢失的 decision。`requestId` 是审批 identity，`actionId` 只能作为缺少 request identity 时的退场 fallback；ask-user/MCP elicitation 可以 terminal 且 `decision = null`，Turn 使用 `Resolved` 表达已回答。

Provider request 只能按以下方向流动：

```text
typed runtime request
  -> model-provider canonical content / capability / route
  -> provider-specific lowering
  -> normalized provider stream event
  -> RuntimeEvent
```

业务层不得拼 OpenAI、Anthropic 或自定义 provider payload。工具执行只按以下方向流动：

```text
model-visible definition
  -> RuntimeTool（definition + exposure + executor）
  -> ToolCall（turn/call/environment identity）
  -> tool-runtime permission and dispatch
  -> ToolLifecycleEmitter（started/completed）
  -> NormalizedToolOutput
  -> model transcript + host event projection
  -> RuntimeEvent and Thread/Turn/Item projection
```

current provider 不得绕过 `RuntimeTool::execute_call` 直接调用 executor，也不得在 provider loop、lime-agent adapter 或 App Server 重复计时、归一化或合成 start/end。host emitter 负责把同一 lifecycle 直接投影为 canonical `item.started/item.completed`，并保证 `ItemStarted -> ActionRequired -> ItemCompleted` 的确定性顺序。执行上下文必须显式绑定 typed call/turn identity，current turn executor 必须持有已校验的 canonical thread identity；approval 和 request-user-input 不得从松散 metadata 反推 scope。`AgentEvent::ToolStart/ToolEnd`、App Server raw start/result mapper、image-command raw lifecycle、live `tool.args` 与 imported raw Tool product wire 均为 `dead / deleted / forbidden-to-restore`。conversation import 只允许在 Codex source parser 输入边界读取 rollout JSON，并立即归一化为 source-local `ImportedToolDraft`；selector、lifecycle normalizer、budget 与 commit lowering 均只消费 typed phase/call/arguments/output/source metadata。terminal-only、incomplete 和重复 lifecycle 必须在 draft 层确定性补齐或幂等忽略，随后在真实 session/thread/turn identity 边界 lowering 为 canonical Item。raw Tool intermediate 绝不得进入 normalizer 之后的链路、`StoredSession`、event log、ProjectionStore、read model、notification 或 GUI。

Provider history、context compaction 与 evidence/export 也属于 canonical Tool 的生产 consumer：它们只允许从 nested `ThreadItemPayload::{Tool,McpToolCall,CollabAgentToolCall}` 读取 call identity、ItemStatus、arguments、metadata、structured output、output reference 与 MCP server identity。非 lifecycle 的领域 side-channel 可以按显式 allowlist 保留，但 raw `tool.started/result/failed/completed` 不得影响 transcript、摘要、统计、browser evidence 或 artifact 提取，只能存在于入口拒绝守卫、负向测试和历史 evidence。

大型工具输出的唯一正文来源同样是 nested `ToolOutput`。App Server 可以在 append 边界把过长 `text` 截为 preview，并把完整内容写入 `tool_output` sidecar；nested output 必须回写稳定 `outputRef + truncated`，outer event 只保留 `outputBytes/outputSnapshotFile/sidecarRef` 等持久投影，不能从 outer `output/result/runtimeEvent` 反向恢复正文。Tool、MCP 与 Collab 使用同一 sidecar owner；raw `tool_end` 与 raw Tool lifecycle 一并在 EventStore normalization 前 fail-closed。

图片任务的 GUI media projection 只消费 `item.completed` 中 completed `ThreadItemPayload::Tool`：tool identity 来自 typed call/name，任务 owner facts 来自 `item.metadata`，结构化响应来自 `ToolOutput.structured_content`。只有 `normalized_status=succeeded` 且图片拥有可校验 sidecar reference 时才生成 final media content part；pending、非 terminal、失败、无 sidecar 或 raw Tool event 必须 fail closed。异步 worker 的最终结果继续由 media task store read owner enrich，不得把“任务创建完成”误报为“图片生成完成”。

### 6.4 领域与基础设施组

| Crate | 准入 |
| --- | --- |
| `config`、`infra`、`core` | 配置、平台无关基础设施和稳定公共模型；不接受默认塞入的新 runtime 逻辑。 |
| `services`、`processor` | 有明确领域 owner 的服务与处理器；中心 facade 只做 dispatch。 |
| `knowledge`、`embedding`、`document-preview` | 独立领域能力。 |
| `gateway`、`websocket`、`server`、`server-utils` | 网络/服务边界。 |
| `providers` | provider 配置与注册支撑；实际 wire lowering 仍归 `model-provider`。 |
| `scheduler`、`automation_execution` 对应 owner | 调度与自动化领域，不承接 turn loop。 |
| `lime-cli` | Rust CLI 入口，不替代 App Server 产品协议。 |

新增 Rust crate 必须说明：现有 domain 为什么不适合、公开 contract 是什么、依赖方向是什么、如何避免落入 `core`/`services` 平铺层。

## 7. Agent 产品主链

```text
Renderer
  -> Electron preload / Desktop Host
  -> app_server_handle_json_lines
  -> App Server JSON-RPC initialize + current Thread/Turn commands
  -> RuntimeCore / agent-runtime
  -> model-provider and tool-runtime
  -> RuntimeEvent
  -> ProjectionStore / thread-store
  -> canonical Thread/Turn/Item read model + notifications + evidence/export
  -> Renderer projection / GUI
```

Codex app-server 的核心约束在 Lime 中保持不变：先初始化连接；以 Thread 开始或恢复会话；以 Turn 驱动一次执行；以 Item 和 notification 报告过程；以明确 terminal turn 状态结束；从持久化 read model 恢复历史。任何 UI、Plugin 或桌面入口都必须进入这条主链。

canonical read edge 使用 `thread/read`、`thread/list`、`thread/turns/list` 与 `thread/items/list`，由 App Server handler 直接查询 `ThreadStore` 并返回 Thread/Turn/ThreadItem DTO 和 store-owned opaque cursor，不经过 AgentSession fallback。`thread/list.includeArchived=false` 只返回 active thread，`true` 返回 active 与 archived thread；过滤和 cursor 顺序必须由 store 在同一查询边界完成。携带单一 `threadId` 的 read method 由 protocol catalog 声明 Thread scope + shared-read access；App Server request serialization 必须消费该 metadata，不能在 handler、client 或 GUI 另建并发策略。`agentSession/read` 只允许作为迁移期 presentation adapter，store 错误必须显式失败；退出条件是 S5 GUI consumer 全量切到 canonical read edge。

### 7.1 事件与完成态

- canonical live event 的 current contract 是 `CanonicalThreadEventNotification::{Thread, Turn, Item}`，只携带完整、可校验的 canonical entity。Rust/TypeScript client 必须优先解码该事件，GUI 与后续 package 只能向 typed event + read model 收敛。
- 现阶段 canonical event 仍通过既有 App Server JSON-RPC notification envelope 传输；envelope 中的 raw `event`、`typedEvent` 和 legacy lifecycle DTO 属于 `deprecated` 迁移面，不是第二事实源，不得新增 consumer、字段推断或业务逻辑。
- 非 Thread 领域通知只能通过集中 allowlist 绕过 canonical sequence gate。当前允许 provider diagnostic、`runtime.status` 与 `image_task.presentation.generated/created/parameters.required`；它们只承载诊断或媒体任务展示，不得表达或修补 Thread/Turn/Item lifecycle。未知 raw event 与 raw Thread lifecycle 必须继续 fail-closed。
- 只有 production producer 全量发出 canonical entity、package/Renderer consumer 全量迁移、负向守卫覆盖旧 surface 后，S6 才能删除 raw lifecycle envelope；在此之前每个 slice 必须记录剩余 producer/consumer，不能把 optional canonical field 当作完成证据。
- `turn.completed`、失败、取消和中断是产品一等终态。
- 工具、审批、消息和产物是 Item/RuntimeEvent 的可投影活动，不是 renderer 私有日志。
- `request_user_input`/approval 由 session/turn scoped pending state 承接，不能建立进程全局单例。
- deprecated raw `action.required` 边界只能透传 runtime `data.availableDecisions`，不得在 App Server 或 Renderer 固定补一套按钮列表；退出条件仍是 GUI 全量消费 canonical Item/server request。
- canonical event log 的 gap、regression、equal-sequence divergence、malformed/unterminated tail 必须在 App Server repair 边界 fail-closed；只有可审计的尾部损坏允许按 `last_valid_offset` 截断并重建 ProjectionStore。
- Evidence、replay、analysis、review 与 GUI 从 App Server `evidence/export`、`agentSession/*/export`、read model 和 notification 消费同一事实源。

### 7.2 Plugin、Skills 与 MCP

Plugin UI/worker 只通过 typed client 和 App Server method 进入 runtime；不得复制 turn start、cancel、tool dispatch 或 evidence 链。Skill 是产品与领域工作流单元，MCP 是标准化 tool/resource/prompt 接入；二者均由 App Server 和各自 runtime owner 注入当前 turn，而不是由 Renderer 直接执行。

## 8. 命令、配置与数据边界

### 8.1 Turn 请求字段归属

`agentSession/turn/start` 只有一组 current 请求结构。Renderer 必须由
`AgentUserInputOp -> createAgentSessionTurnStartParamsFromUserInputOp` 或等价 typed
gateway 构造它；`threadClient` 只负责转发、通知路由与 read-model 投影，不再接受或
转换第二套 snake_case runtime request。

| 边界 | 唯一 owner | 字段 |
| --- | --- | --- |
| `AgentSessionTurnStartParams` | Turn 协议 | `sessionId`、`turnId`、`input`、`queueIfBusy`、`skipPreSubmitResume`。附件属于 `input`。 |
| `RuntimeOptions` | Turn 传输和展示控制 | `stream`、`eventName`、`capabilityId`、`queuedTurnId`、`expectedOutput`、`structuredOutput`、`outputSchema`。 |
| `RuntimeRequest` | 运行时执行与 provider lowering 输入 | provider/model/config、reasoning、thinking、approval/sandbox、workspace、search、execution strategy、system prompt 与运行时 metadata。 |
| `hostOptions` | dead / deleted | 不在 current turn 协议中；不得作为宿主扩展、provider route、tool policy、workspace、session context 或任意 runtime JSON escape hatch 恢复。 |

前端不会持有或修补 Thread/Turn/Item 真相。输入发送后，用户消息、流式增量、终态、
工具活动和历史恢复均从 App Server notification 与 canonical Thread read model 投影到 UI；
`agentSession/read` 仅是迁移期 presentation adapter，固定 timeout、renderer cache 或 host payload
不能合成完成态。

一次跨层命令改动必须同时更新：

1. Renderer gateway 或 `packages/app-server-client`。
2. Electron preload/IPC 白名单（仅宿主转发需要时）。
3. `app-server-protocol` schema、App Server handler 与 Rust client。
4. catalog、受控 fixture、mock policy 和 `npm run test:contracts`。

生产路径不得回退 `defaultMocks`、`mockPriorityCommands`、`invokeMockOnly`、renderer mock 或 mock backend。受控 fixture 可以使用 external backend，但必须经过真实 App Server、read model 与产品 event 链。

配置变更必须成组更新 schema、validation、consumer、默认值、文档和 lockfile；用户数据、缓存、日志和凭证必须走统一路径/平台 API，不写入仓库或硬编码平台目录。

## 9. 脚本、文档与测试目录

### 9.1 Scripts

`scripts/` 是质量与自动化入口：

- `scripts/agent-runtime/`：Agent runtime fixture/smoke。
- `scripts/app-server/`：sidecar 与协议 smoke。
- `scripts/electron/`：真实 Electron fixture。
- `scripts/governance/`：结构与旧路回流检查。
- `scripts/harness/`：evidence/harness 验证。
- `scripts/i18n/`：locale 边界检查。
- `scripts/mcp/`：MCP smoke。
- `scripts/plugin/`：plugin fixture。
- `scripts/playwright/`：浏览器/Electron 交互辅助。
- `scripts/smoke/`：跨域最小 smoke。
- `scripts/lib/`：脚本共用实现。

根 `scripts/` 与一级目录是冻结边界。新脚本必须归入既有领域或 package；例外同时更新 `scripts/README.md`、基线和执行计划。

### 9.2 文档

| 文档位置 | 写入规则 |
| --- | --- |
| `internal/aiprompts/` | current owner、边界、验证、目录规范。 |
| `internal/exec-plans/` | 计划、责任人确认、进度、验证结果、blocker。 |
| `internal/roadmap/` | 后续目标与优先级，不覆盖 current owner。 |
| `internal/research/` | 外部对照与审计证据。 |
| `docs/` | 对外站点内容。 |

历史路径只能留在历史 evidence；不得出现在 current 导航、架构规则、active checklist 或新代码说明中。

### 9.3 测试与交付证据

| 风险 | 最低验证 |
| --- | --- |
| 纯逻辑/投影 | 定向 unit test。 |
| Rust domain | 受影响 crate 的 test/check，再按风险扩大。 |
| JSON-RPC / bridge | `npm run test:contracts` + 定向 Rust/TS 测试。 |
| Agent runtime | `npm run smoke:agent-runtime-current-fixture` + 相关 current fixture。 |
| GUI 主路径 | `npm run verify:gui-smoke`。 |
| 真实桌面闭环 | Gate B：Electron、preload、IPC、App Server、runtime/read model、可见 UI。 |
| 发布/配置 | `npm run verify:app-version` 和对应 release/Forge 检查。 |

Gate A 只证明 browser/renderer projection；Gate B 才证明真实 Electron 产品链。两者不得混用。

## 10. 依赖方向与禁止边界

```text
Renderer -> typed client / Desktop Host bridge -> App Server -> runtime owners
App Server -> agent-runtime, model-provider, tool-runtime, thread-store, domain services
agent-runtime -> agent-protocol, model-provider, tool-runtime
thread-store -> agent-protocol and storage primitives
model-provider / tool-runtime -> protocol and low-level utilities only
```

禁止：

- Renderer 导入 Rust implementation 语义或直接调用 provider/tool runtime。
- Electron 保存 RuntimeCore 状态、复制业务 API 或解释模型 stream。
- `model-provider`、`tool-runtime` 反向依赖 App Server、Electron 或 React。
- App Server handler 内拼 provider wire payload、实现工具权限或复制 tool dispatch。
- `core`、`services` 成为无明确边界的 runtime 垃圾桶。
- 已删除目录、旧 wrapper、临时 adapter 或 mock fallback 重新成为 current owner。

## 11. 重大架构变更与开发者确认

### 11.1 何时属于重大变更

满足任一项即为重大架构变更：

1. 新增、删除、移动或合并顶层目录、Rust crate、TypeScript package、运行时 host 或持久化 owner。
2. 改变 Renderer、Electron、App Server、RuntimeCore、provider、tool 或 Thread/Turn/Item 的职责/依赖方向。
3. 新增或替换 JSON-RPC transport、初始化握手、跨层 method、schema、event 或 read model。
4. 改变 provider protocol/lowering、工具权限/执行、MCP/Skill 注入或媒体 part 的唯一 owner。
5. 改变 session/thread/turn/item 持久化、ProjectionStore、evidence/export、replay 或历史恢复事实源。
6. 改变主窗口/独立窗口路由、Electron Host 模式、Forge 打包/更新链或跨宿主产品入口。
7. 改变 Gate A/Gate B 证据等级、GUI 交付门槛或生产 mock 边界。

纯局部 bug 修复、保持 owner 不变的内部重构、只改文案或只补测试不属于重大架构变更，但只要不确定，就按重大处理。

### 11.2 必须更新与确认

重大架构变更在实现同一变更集中必须：

1. 更新本文件中受影响的目录地图、owner、数据流、依赖方向或验证门禁。
2. 更新相关 `internal/aiprompts/` 领域文档和 `internal/exec-plans/` 执行计划。
3. 在执行计划和 PR 描述中填写以下确认，由负责开发者明确勾选并署名。每个 PR 都必须声明重大或非重大；触及架构敏感路径时，`npm run governance:architecture-confirmation` 只接受重大声明：

```text
架构影响：<重大变更项，或“无”>
架构图已更新：<章节/路径，或“不适用：原因”>
责任开发者确认：<姓名或账号>，<YYYY-MM-DD>
确认内容：已核对目录归属、数据流、依赖方向、协议边界和验证门禁。
```

未更新架构图、未写不适用原因或没有责任开发者确认的重大变更，不得标记为完成、不得进入 release evidence、不得合并为 current 架构结论。

### 11.3 评审问题

重大变更评审至少回答：

1. 新 owner 是否是唯一事实源，旧 owner 是否已删除或明确退场？
2. 跨层调用是否仍沿 Renderer -> Host -> App Server -> runtime 方向？
3. 状态是否仍通过 Thread/Turn/Item、RuntimeEvent、ProjectionStore/read model 收敛？
4. provider lowering 与 tool execution 是否仍在各自 owner？
5. 验证是否覆盖对应的 contract、fixture、Gate A 或 Gate B？

## 12. 实施前检查

新增或重构前依次回答：

1. 它属于哪一个目录与 owner？为什么不是相邻现有 owner？
2. 是否需要新 JSON-RPC 契约，还是已有 method 足够？
3. 产生/消费哪些 Thread、Turn、Item、RuntimeEvent 和 read model？
4. provider、工具、持久化、Renderer 各自是否仍只做自己的职责？
5. 是否触发重大架构变更？若触发，架构图和开发者确认落在哪里？
6. 最小验证是 unit、contract、fixture、Gate A 还是 Gate B？

任何问题无法回答时，先补执行计划或架构图，不在临时 facade、无 owner helper、旧目录或 UI 层堆实现。
