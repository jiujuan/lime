# 执行计划

> 2026-07-19 快速骨架 checkpoint：先落地 v2 `turn/steer`、canonical history normalize、provider incremental stream 和 Renderer canonical thread projection；后续 current home-hotpath Gate B 已 68/68 通过，但本 checkpoint 仍不关闭 D1/D2，也不替代 workspace/Cargo、V1-15 全场景和完整 Codex 能力验收。

## 总目标

将 Lime 收敛为 Codex-first 的单一 Agent runtime：

```text
Electron Desktop Host
  -> App Server JSON-RPC v2
  -> RuntimeCore / agent-runtime
  -> Thread/Turn/Item + ThreadStore
  -> model-provider / tool-runtime
  -> typed projection / GUI / evidence
```

多模型只在 `model-provider` 内实现：grok-build 负责 catalog/selection/switch/
capability/retry/breaker，OpenCode 只提供 provider-neutral content、endpoint、media
lowering 和多协议 stream 参考。不存在第二 runtime、第二 history、第二 provider owner
或长期兼容层。

## 执行纪律

1. 先迁移真实生产消费者，再删除旧入口；每刀都保持 workspace 可编译。
2. 禁止为“过渡”新增平级 adapter。短期编译映射只能在同一 owner 内，并在该刀退出时删除。
3. 每个条目同时更新 Rust protocol/client、Electron Host/preload、Renderer gateway、catalog、fixture、文档和测试。
4. 未通过 Gate A 的协议/数据契约，不进入 Gate B；没有真实 Electron/read model/ThreadStore 证据，不得标记完成。
5. Codex 已有的非 ChatGPT-only 能力优先直接迁移对应模块、类型和测试语义；只有 Lime credential、桌面宿主或产品范围差异才做薄适配，并在回报中注明 Codex 源路径。

## 本轮进度（2026-07-19）

- `app-server-protocol/protocol/v2` 已建立 Codex-first Thread/Turn/Item wire、核心方法 registry、typed client/server envelope、分页参数和 schema owner；六类 direct v2 lifecycle/delta notification 已接入唯一 `V2NotificationProjector`，v0 lifecycle DTO/schema/fixture 已删除。单一 codegen 当前为 748 个 schema definitions、740 个 TypeScript protocol types、0 生成失败、0 漂移。`thread/start` 缺 model/provider 已 fail closed，并从 durable canonical read model 返回；`thread/resume` 已具备 current cold rejoin/history hydrate 与 actor-ordered active turn snapshot/stale status 归一化骨架，`thread/archive`、`thread/unarchive` 及其 schema 已实现。App Server 现在有 per-thread listener generation：RuntimeEventHub 按 canonical `threadId` demux，start/resume 的 response 与 thread-scoped pending request replay 通过同一 bounded connection writer 排在后续 live event 前；缺失 threadId fail closed，断连移除 subscription。token usage/ThreadGoal、MCP migrated-owner terminal、raw JSONL evidence，以及 fork/delete、其余产品方法和 typed Item/server request 仍是 OPEN，因此不能标记 V1-00/V1-01 整体完成。
- `ThreadStore::append_items` 已提供 canonical Item append 边界，canonical store 拒绝 `item.sequence > outer sequence` 且保持失败原子性；`thread-store` 28/28、App Server canonical 31/31 通过。`ThreadHistoryBuilder` 目前只是 canonical store normalize 骨架，raw Codex RolloutItem、完整 compaction/rollback/fork round-trip 与唯一 reducer 收敛仍是 V1-02 OPEN_REF。
- `runtime-core` 的未知 provider type/name 和 Chat 任务未实现 wire 协议均 fail closed 为 `UnsupportedProtocol`；model route 定向测试 12/12 通过。图片任务继续走专用 lowering。
- AgentControl restart recovery 已把显式 runtime request 与 durable session provider/model defaults 合并，缺 route 时 deferred；restart 定向测试 11/11 通过，App Server startup 对明确缺 selection 的错误只告警。
- image API、server/services/skills 等 provider 消费者已迁入 `model-provider` current owner；`lime-providers` crate、workspace/Cargo.lock 和正向引用已删除，分类为 `dead / deleted / forbidden-to-restore`。真实 route/capability/credential preflight 与 durable route 仍是 provider 主线 OPEN_REF。
- transport 已补齐 WebSocket/Unix socket acceptor、bounded outbound、slow-client disconnect、initialized/ping-pong/close/reconnect；transport tests 17/17，App Server slow-client 单测通过。`optOutNotificationMethods` 仍待 v2 initialize/session state，不能用 transport 层伪造。
- v2 `turn/steer` 已接 processor/runtime 原子入口，steer user message 使用独立 canonical Item identity；App Server steer 7/7。provider_calls 已直接消费 `model-provider::CurrentProviderClient::stream`，provider streaming 7/7；history normalize 9/9。
- 当前单一 codegen 为 748 个 schema definitions、740 个 TypeScript protocol types、0 生成失败、0 漂移；`packages/app-server-client` build 与最新 740 类型状态的完整 `npm run test:contracts` 已通过。此前 Renderer/Electron typecheck、package/Rust 定向测试已通过。Electron Host/Plugin task host 已消费 v2 Thread/Turn identity，不再存在旧字段 typecheck blocker。Agent fixture 的历史/流式/fixture guard 通过；public JSON-RPC 已锁住 `thread/start` v2 envelope，并对旧 `agentSession/start` fail closed。临时 `./--help/json` schema 目录已不存在。

快速骨架曾分为三个互斥车道：v2 lifecycle notification/schema、Electron canonical identity/time、真实 `thread/start` route/ThreadStore owner。三个车道已汇合；后续仍禁止新增 namespace compat、第二套 flat codegen 或 Renderer fallback。

三车道已完成骨架交接并关闭 lifecycle 双轨：v2 direct notification 覆盖 `thread/started`、`turn/started|completed`、`item/started|completed`、`item/agentMessage/delta`；Electron Host/Plugin task host 已消费 v2 Thread/Turn identity；`thread/start` 已删除 `unknown` fallback 并从 durable canonical read model 返回。App Server 只有一个 `V2NotificationProjector`，Rust/TS clients 与 Renderer direct pipeline 已接通；v0 `typedEvent`、`canonicalEvent`、六类 lifecycle DTO/schema/fixture/正向测试已删除。单一 codegen 当前为 748 个 schema definitions、740 个 TypeScript protocol types、0 生成失败、0 漂移，完整 `npm run test:contracts` 已通过。`eventSequenceGate` 只允许 direct lifecycle 与明确 raw side-channel，wrapper lifecycle/action fail closed。

Gate B definitive 记录：共享 Rust 热区的 projector 可见性与 async sink `Send` 编译问题已修复，最终 evidence 使用 source-built App Server sidecar。`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-home-hotpath-v2-definitive-summary.json` 为 `ok=true`、`Gate B CDP controlled fixture`、68/68 assertions；console/page error、legacy command hit、mock fallback hit 均为 0。canonical identity 为 `sessionId=sess_7361160a434846a9841ec0e7bb5bf2fa`、`threadId=thread_f2065f4a31a6470aafad7ff4d3ebc072`、`turnId=turn_8c35081960cd448bbb2a9c024020f6a0`。性能为 pending paint 47ms、submit accepted 247ms、first text paint 344ms、first delta to paint 31ms、client-local output 71ms。client-local 指标已存在；只有 provider/server latency 继续归 App Server diagnostics trace，Renderer 不以 `Date.now()` 等本地时间戳伪造。

diagnostics trace timing 复验已闭环：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-home-hotpath-v2-trace-timing-final-summary.json` 为 `ok=true`、72/72 assertions，source-built sidecar 的 diagnostics trace `traceCount=1/eventCount=8`；provider first-text `providerWaitMs=90`，App Server message delta `serverEventEmittedAt=1784448387417`，均来自 summary-only trace metrics。`appServerIpcHitCount=62`、legacy/mock/page error 均为 0；新增 trace compactor 正/负向测试 2/2 与 fixture guard 63/63 通过。该项关闭 instrumentation blocker；其余 V1-15 能力按下方 OPEN_REF 继续。

Recovery / history Gate B 最新闭环：`.lime/cdp-evidence/agent-session-recovery-cdp-gate-summary.json` 证明真实 Electron、preload/IPC、`app_server_handle_json_lines` 与 `thread/start/read/list/resume` 使用同一 canonical identity；resume 为 metadata-only，不含 legacy fields，也不重发 `thread/started`。`.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-canonical-v2-summary.json` 证明 canonical ThreadStore 的 3 Turns / 9 Items、分页 cursor、DOM 顺序与 archive/unarchive 重启读回。旧 `agentSession/update` 前置、`projected_*` history seed、visual replay helper、queue event projection 与 queued composer restore 均为 `dead / deleted / forbidden-to-restore`。loaded resume 已增加 actor-ordered `activeTurnId` snapshot；本轮 listener 汇合骨架已关闭跨 thread 广播、stale connection subscription 和 response/replay/live producer 分裂。raw JSONL 顺序测试、token usage/ThreadGoal replay 与跨 connection reconnect 仍 OPEN；MCP terminal owner migration 已落 current 终态 owner 骨架，但等待共享 App Server 输入类型迁移汇合后的编译/定向测试证据。

Renderer 旧投影清退已完成：1126 行 `appServerEventPayloadProjection.ts`、零消费者 `canonicalApprovalItemProjection.ts` 及其正向测试已物理删除；`appServerEventStreamProjection.ts` 是唯一 projector，只接受 direct v2 lifecycle 与 provider/runtime/image/media raw side-channel，wrapper lifecycle/action/canonicalEvent/typedEvent fail closed。下一刀只补 v2 typed ingress：先让 `queueIfBusy`、`skipPreSubmitResume` 和 provider/search route 离开 `additionalContext`，由 durable thread defaults 与 App Server internal route 合并。`agentSession/runtimeEvents/append`、`agentSession/action/respond` 仍有 artifact/Plugin/approval 生产消费者，当前分类为 `deprecated`；必须先补 typed Item/artifact owner 与 Codex typed server request，再迁生产者并同刀删除，禁止 compat。provider/server latency 继续由 App Server diagnostics trace 提供，不在 Renderer 建第二套计时事实源。

删除后复验通过历史 31/31、流式 32/32、fixture guard 76/76，以及 `home-hotpath-regression`、`home-hotpath-greeting-regression` 两条真实 Electron Claw 热路径。聚合 fixture 随后在 Coding Workbench 暴露独立 blocker：旧 fixture 使用调用方 session id 调 `agentSession/update`，没有消费 v2 `thread/start` 的 canonical session identity，后续还向 v2 `turn/start` 传旧 `runtimeOptions`。该路径必须随 typed session/route 迁移直接改写，不增加 alias 或 wrapper；它不撤销本轮 projector/Claw 验证，但阻止把完整 `smoke:agent-runtime-current-fixture` 报为全绿。

上述 Coding Workbench source/contract blocker 已收口：fixture 现在消费 `thread/start` 返回的 canonical session/thread identity，并在一次 start 中提交 `model/modelProvider`；后续走 `turn/start` 的 v2 application `additionalContext.metadata`，不再调用 `agentSession/update` 或读取旧 `runtimeOptions.*.metadata`。client contract 反向禁止旧 update，相关静态测试 6/6、完整 `test:contracts` 通过；本轮未重跑 Coding Workbench 独立 Electron Gate B，因此只关闭 source/contract 漂移，不把该产品场景标为 Gate B completed。

`verify:gui-smoke` 的 Renderer、Electron Host 与 source-built App Server 产物均构建成功。首次 shell 运行因 smoke HOME 未隔离而检测到真实用户数据库的活动 `lime.db-wal`，迁移边界正确 fail closed，未执行数据库操作；改用隔离临时 HOME 直接复跑同一 built Electron smoke 后，App Server initialize、Claw shell reload、Memory settings 与结构化 evidence 全部通过。

上述切片均不等于整体 Codex parity。下一刀沿 current `thread/resume` 先完成 raw JSONL `response -> replay -> live` Gate 与 MCP owner 定向验证，再补 canonical token usage owner；ThreadGoal 仍需单独确定 Lime canonical owner，不能伪装成 `ManagedObjective`。随后推进 typed Item/server request、raw rollout、唯一 history reducer 和 compaction lineage；V1-15 再分别补 restart/resume/model switch/approval/MCP/child agent/cold read、live provider 与 Windows 证据。

## 阶段总览

| 阶段 | 目标                                                              | 主要 owner                                                          | 退出条件                                                                   |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P0   | v2 protocol、ThreadStore/raw rollout、history/compaction/recovery | `app-server-protocol`、`app-server`、`thread-store`、`runtime-core` | 不再有 production `agentSession/*`；cold/live/replay/restart identity 一致 |
| P1   | Item、tool/hooks、sandbox/approval、MCP、Skills/Plugins/Apps      | `tool-runtime`、`agent-runtime`、App Server                         | 每个 item/tool/reverse request 有 typed lifecycle 和恢复证据               |
| P2   | 单一 model catalog/route/capability + grok/OpenCode provider wire | `model-provider`、`runtime-core`                                    | 未知 model/capability/credential fail closed；route/attempt/usage 可追溯   |
| P3   | AgentControl V2、transport、environment/startup、Gate B           | `thread-store`、`agent-runtime`、`app-server-transport`、Electron   | graph/mailbox/transport/restart/真实 Electron 闭环                         |
| P4   | Codex 额外 App Server surface 与 typed client                     | `app-server-protocol`、App Server、`app-server-client`              | 每项实现或明确产品范围排除，current catalog 无静默缺口                     |

## P0：协议与可恢复状态

### V1-00 v2 method registry 迁移

**写集**：
`lime-rs/crates/app-server-protocol/src/protocol/{v0,v2}`、schema/manifest、
App Server dispatch/processor、Electron Host/preload、`src/lib/api` gateway、
command catalog、contract fixture、smoke scripts。

**动作**：

1. 以 Codex v2 `common.rs`、`protocol/v2/**` 和 method registry 为唯一 wire contract。
2. 将 `agentSession/start/read/list/thread/resume/turn/start/turn/cancel` 迁移为
   `thread/start/read/list/resume/fork/...`、`turn/start/interrupt/steer`，同时迁移
   server request、notification、experimental filtering 和 cancellation。
3. 所有生产调用、Host 白名单、Renderer gateway、catalog、fixture 一起切换；不得新增
   `agentSession` wrapper。
4. 删除 Agent 旧 v0 schema/manifest 和 production `agentSession/*` 文案/断言；其余 Lime 产品方法先迁入 v2/current registry，全部迁完后再删除整个 `protocol/v0/**`。

**退出**：`rg` 在 production path 无 `agentSession`；schema round-trip、unknown method、
server request、cancel、pagination、late notification、`npm run test:contracts` 全部通过。

### V1-01 Thread/Turn/Item schema

**写集**：`agent-protocol`、`app-server-protocol/protocol/v2`、read model、projection、
TypeScript generated types。

**动作**：

1. 逐字段对齐 Thread/Turn（ID、fork/source、秒级时间、status、error、path/cwd、name、
   environment、model provider）。
2. 对齐 ordinal、cursor、terminal timestamp、item ID prefix 和 unknown field policy。
3. 只允许 canonical Item 写入；presentation 不得创建 synthetic item。

**退出**：字段 diff、serde/TS round-trip、cold/live/read/replay 同一 identity；rollback 与
active turn snapshot 测试通过。

### V1-02 ThreadStore/raw rollout/history

**写集**：`thread-store`、App Server `ProjectionStore`/EventLog/repair、rollout import、
SQLite/JSONL repository。

**动作**：

1. `ThreadStore::append_items` 只接收已 canonical 的 raw rollout item；metadata 只能走
   `update_thread_metadata` patch，append 不推导 metadata。
2. 让 `ThreadHistoryBuilder` 负责 coalesce、rollback、分页和 active snapshot；EventLog
   保留事件顺序/repair provenance，不再成为第二 transcript owner。
3. Codex RolloutItem/Compacted/rollback marker/fork cut/unknown malformed line 有明确
   retention 和 round-trip；import 只在 source adapter 存在。
4. 删除旧 `session_repository`、第二 transcript DB 和 renderer persistence。

**退出**：crash tail、duplicate sequence、projection failure、repair、cold/live/replay、
Codex rollout import round-trip 全部通过；append 与 metadata patch 事务边界可证明。

### V1-03 Context compaction lineage

**写集**：`runtime-core` context、`agent-runtime` conversation、App Server compaction、
provider history、ThreadStore Item schema。

**动作**：

1. 将 `replacement_history`、`window_number`、`first/previous/window_id` 作为 durable
   compaction lineage；summary 进入 canonical `ContextCompaction`/model-visible item。
2. durable history 永不被 compaction 删除；provider history 只按最新有效窗口重建。
3. resume/fork/rollback、重复 compaction、损坏窗口、无有效 tail 明确 fail-closed 或
   完整历史策略；禁止 summary + 全量旧 history 双发。

**退出**：`compact.rs`/`rollout_reconstruction.rs` 对应测试语义在 Lime replay、restart、
provider history 和 GUI evidence 中一致。

## P1：Item、工具与控制面

### V1-04 Item inventory 与 projection

**写集**：`agent-protocol`、`app-server-protocol` v2 item、ThreadStore、Renderer projection、
schema fixtures。

**动作**：逐项实现 UserMessage、HookPrompt、AgentMessage、Plan、Reasoning、CommandExecution、
FileChange、McpToolCall、DynamicToolCall、CollabAgentToolCall、SubAgentActivity、WebSearch、
ImageView、Sleep、ImageGeneration、Review、ContextCompaction、MemoryCitation 的字段、状态、
started/delta/completed、分页、replay 和 GUI 读取。

**退出**：每个 Item 有字段级 cold/live/replay fixture，terminal 后 late delta 被拒绝。

### V1-05 Tool hooks/exposure/lifecycle

**写集**：`tool-runtime`、native tools、hook runtime、tool inventory、provider stream reducer。

**动作**：

1. 固定 `ToolSnapshot + HookSnapshot -> typed ToolCall -> execute_call -> NormalizedToolOutput`。
2. 加入 Direct/Deferred/Hidden、ToolSearch/LoadableToolSpec、parallel、CodeMode/Direct source、
   argument diff、统一 truncation/outputRef。
3. 实现 SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PreCompact/
   PostCompact/Stop/SubagentStop 的 injection/block/abort/rewrite/permission lifecycle。

**退出**：provider 不再产生 raw tool lifecycle；hook/tool output 在 canonical Item、history、
evidence、GUI 中保持 call identity。

### V1-06 Sandbox/approval/guardian

**写集**：permission/execpolicy/network/guardian、Electron server request、process runtime。

**退出**：`PermissionProfile -> SandboxPolicy -> ApprovalRequest` 单向解析；deny/timeout/cancel、
session approval、network amendment、Windows/macOS/Linux、重启恢复均有 evidence。

### V1-07 MCP/Skills/Plugins/Apps

**写集**：MCP manager/snapshot/elicitation、SkillsService/ watcher、PluginsManager、Apps cache。

**退出**：required/optional + OAuth/dependency + generation replace + elicitation pause/recover；
skill/plugin/app changed/readiness/update notification 可重放；管理面与 sampling 面无交叉事实源。

## P2：单一多模型/provider owner

### V1-08 Catalog/availability/cache

**写集**：`model-provider::canonical`、provider registry、API Key Provider、services registry、
model cache。

**动作**：

1. 删除 `EnhancedModelMetadata`、runtime JSON capability 与 App Server/Renderer 二次推导，保留
   一个 `ModelCatalogEntry`/`ModelCapabilitySnapshot` 和一次 typed conversion。
2. 合并 bundled/configured/remote/cache/ETag，cache key 必须含 provider endpoint、credential
   fingerprint、tenant/account entitlement；credential identity 变化精确 invalidation。
3. provider availability 必须同时检查 enabled、credential/integration、endpoint readiness；
   builtin provider 名称不得直接判 ready。
4. 刷新失败保留旧 catalog；explicit default、small/auxiliary route、release/cost/quota/status
   由 current catalog owner 处理。

**退出**：未知 model、unknown capability、无 credential、非法 allowlist、disabled provider
均 fail closed；catalog refresh/re-auth/tenant 变化不会串身份。

### V1-09 Effective request options/route

**写集**：`model-provider::runtime_provider`、`model_route_resolver`、`runtime-core`、agent runtime。

**动作**：为每次 sampling 固化 `EffectiveTurnOptions`/`ResolvedModelRoute`，覆盖 auth scheme、
headers/body/variant、context window、max output、temperature/top-p、idle timeout、max retries、
stream tool calls、reasoning、backend search、origin/client/deployment/user、compaction/title/
web-search/image-description/prompt-suggestion/subagent auxiliary route。

**退出**：route/attempt/usage/cost/quota/account identity 在 Thread/Turn/read model/evidence 可追溯；
child/restart/replay 保持同一 effective options。

### V1-10 Switch/stream/retry/breaker

**写集**：session switch、provider lowering/current client/stream、transport policy、breaker。

**退出**：active agent compatibility、zero-turn rebuild、watch generation、unknown/partial stream、
429/5xx/timeout retry、breaker open/half-open/close、首个可见 event 后禁止 fallback 重放均通过。

### V1-11 删除 lime-providers

**动作顺序**：

1. 将 `server`、`services`、`skills`、`image_api` 等消费者改用 `model-provider` current client、
   lowering、stream 和统一 credential owner；删除独立 converter/session/signature store 调用。
2. 从 workspace/Cargo 依赖、catalog、文档、测试 fixture 删除 `lime-providers`。
3. 加 crate/import 扫描，禁止新引用。

**退出**：workspace 无 `crates/providers` 成员/依赖；`cargo check --workspace` 与 provider 定向测试通过。

## P3：Multi-Agent、transport、environment、Gate B

### V1-12 AgentControl V2

补 role/config precedence、max depth/width、residency、rollout budget、fork all/last-N/none、
trigger_turn/queue-only、wait priority、child tool subset 和 recovery fuzz；graph/identity/mailbox
只能由 `thread-store` 持久化。

### V1-13 App Server transport

实现或删除 `AppServerTransport` ws/unix/off：stdio、WebSocket、Unix control socket、bounded
ingress/outbound、slow-client disconnect、per-connection initialized/experimental/opt-out
notification、request cancellation 与 reconnect 均按 Codex transport tests 验收。不能以 enum/URL
解析代替 acceptor。

### V1-14 Environment/instructions/startup

补 AGENTS.md discovery/cache/precedence、child environment inheritance、config lock、session
startup prewarm、sticky environment/root、turn timing/usage/OTEL identity；restart/replay 不改变
instruction source 或 effective route。

### V1-15 真实 Electron Gate B

证明 `Renderer -> preload/IPC -> app_server_handle_json_lines -> App Server v2 -> RuntimeCore ->
provider/tool -> ThreadStore -> GUI`，覆盖 restart/resume/compaction/model switch/approval/MCP/child
agent/cold read。mock/localhost provider 只能做 fixture，不得冒充 production proof。

current home-hotpath fixture 已由上述 definitive evidence 68/68 通过；该结果关闭本轮 Electron
主链与 instrumentation blocker，不等于 V1-15 全部完成。restart/resume/compaction/model switch、
approval/MCP/child agent/cold read、live provider 与 Windows cross-platform UDS 仍需分别补证据。

## P4：额外 Codex App Server surface

逐项实现或明确产品范围排除并从 current catalog/完成定义删除：`backgroundTerminals`、
`process/*`、`command/exec/*`、`fs/watch`、fuzzy search、realtime audio/text/SDP、review、file
checkpoint、dynamic tools、attestation、environment/current time/memory mode。实现项必须进入
App Server v2 current owner，不能通过旧 WebSocket/HTTP agent protocol 旁路。

## loaded-thread listener owner 收敛（2026-07-20）

目标：让 resume barrier 和 per-thread live event 顺序有唯一 current actor owner，避免继续把 listener 业务堆进 App Server 根文件。

已完成：

- 新增 `lime-rs/crates/app-server/src/thread_listener.rs`，承接 external runtime event、listener generation、resume barrier、subscribe/replay/deferred-live 顺序和唯一 v2 projector。
- `lib.rs` 仅保留 transport writer、connection 生命周期和 request 编排；`thread_state.rs` 继续承接状态与双向 connection index。
- 重复 resume barrier 在准备阶段 fail closed，并补回归；不新增 compat、fallback 或旧 runtime 入口。
- raw JSONL 复跑修正了 fixture 缺 canonical store 和 live connection 重复订阅误判：start/resume 现在允许同一 connection 幂等订阅，双向索引仍由 HashSet 去重。

验证与未完成：

- 当前源码 `cargo check -p app-server --lib` 通过；listener 3/3、thread_state 5/5、server_request 16/16、MCP elicitation 10/10 通过。
- scoped rustfmt、窄写集 `git diff --check` 与 `governance:legacy-report` 通过；全 package rustfmt 仅被并行 `runtime/objectives.rs` import 排序漂移阻塞。
- 当前 MCP reverse request 的 exact owner + reconnect claim 与 Codex thread-scoped fan-out + first terminal 不同，分类为 `current / alignment-open`，不能作为 parity 证据；connection writer 刀必须同时收敛该语义。
- 下一刀：runtime instance/generation owner、connection writer sequencer、unsubscribe/idle unload；随后才接 canonical token usage/ThreadGoal replay。Codex resume 的 path/history/override 进入 typed `ResumeThreadOptions`，不在 transport 层继续堆字段。

## 完成定义

只有同时满足以下条件才能称为“完全对齐 Codex”：

1. Agent `protocol/v0`/production `agentSession/*`、其余 v0 方法迁入 v2 后的旧 module、`lime-providers`、旧 repository 和第二 history 已物理删除；
2. Thread/Turn/Item、raw rollout、ThreadStore metadata patch、compaction lineage、rollback/fork/recovery 通过；
3. Tool/hooks/sandbox/approval/MCP/Skills/Plugins/Apps/AgentControl/transport 只有一个 current owner；
4. 每个 Turn 的 effective route、capability、attempt、usage、cost/quota、provider identity 可追溯；
5. Gate A/B 证明真实 Electron 与 cold/live/replay/restart 同一 canonical identity；
6. `governance:legacy-report`、`test:contracts`、Rust workspace/受影响 crate 测试通过，且扫描守卫阻止双轨回流。
