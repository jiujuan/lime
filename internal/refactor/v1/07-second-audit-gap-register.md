# 第二轮查缺补漏与删除清单

状态：P0 阻塞项登记（2026-07-18）

本文件记录第二轮对比后的可验证缺口。它不是新的架构；所有条目都必须回到
`Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore/agent-runtime ->
Thread/Turn/Item -> GUI`，或回到唯一的 `model-provider` owner。仓库无外部客户和
历史兼容负担，因此 `agentSession/*`、重复 provider owner 和误导性的 transport
声明不进入 compat 长期路径，迁移完成后直接删除。

## P0：必须先收口

### 1. App Server v2 协议

Codex 的 current surface 是 `thread/*`、`turn/*`、`item/*`、`process/*`、
`command/exec/*`、`fs/*`、`model/*`、`skills/*`、`plugins/*`、`apps/*`、
`realtime/*` 等 typed method/notification。Lime 当前生产主写路径仍是
`agentSession/start`、`agentSession/read`、`agentSession/turn/start`、
`agentSession/turn/cancel`，协议实现集中在
`lime-rs/crates/app-server-protocol/src/protocol/v0/**`。

结论：`agentSession/*` 不是 current 兼容入口，而是 `deprecated -> deleted`。
必须迁移到 Codex v2 method registry、request/response、server request 和
notification；renderer、Electron、App Server、fixture、catalog 和负向守卫同时更新。

### 2. ThreadStore 与 history projection

Codex `ThreadStore::append_items` 只追加已经 canonical 的 raw rollout item；
`update_thread_metadata` 是独立的 metadata patch；`LiveThread` 负责 rollout
持久化策略。Lime 现有 `EventLog -> ProjectionStore` 说明没有证明这一分离，且
`conversation_import`、EventLog JSONL、旧 repository 可能继续成为第二 history
事实源。

退出条件：

- raw canonical append 与 metadata patch 是两个明确 API，append 不从 item 内容推断 metadata；
- `ThreadHistoryBuilder` 的 coalesce、rollback、分页和 cold/live/replay 结果一致；
- Codex rollout 的 `Compacted`、rollback marker、fork boundary 和未知行保留策略有 round-trip 测试；
- import 只在 source adapter 读取，不能生成 runtime-only history item。

### 3. Compaction lineage

Codex compaction 使用 `replacement_history`、`window_number`、
`first_window_id`、`previous_window_id`、`window_id`，resume/fork/rollback
都从 durable rollout 重建 replacement history。Lime 当前主要使用 summary 与
`tailStartTurnId`，不足以证明窗口 lineage 和重建确定性。

退出条件：summary 作为 canonical/model-visible compaction item；durable history
不被删除；provider history 可由窗口链确定性重建；resume/fork/rollback、重复压缩、
损坏尾部和旧窗口均 fail-closed 或按明确的完整历史策略处理。

### 4. Model route 必须 fail closed

当前存在三套能力/目录事实：`model-provider::CanonicalModel`、
`core::EnhancedModelMetadata`/`ModelCapabilities` 和 runtime JSON
`CapabilitySnapshot`。同时，model 缓存没有 credential/tenant identity，未知
capability 可能默认放行，builtin provider 可能在没有有效 credential 时被判定 ready。

必须只保留一个 `ModelCatalogEntry`/`ModelCapabilitySnapshot` owner；route 解析必须
同时证明 model match、credential/endpoint readiness 和 capability snapshot。未知 model
或未知 capability 不得 sampling；只有显式 `direct_provider_config` 才能走 runtime-only
路径，并且必须持久化 `RouteFailure`。catalog 刷新失败保留旧 catalog，credential identity
变化触发精确 invalidation。

`EffectiveModelOptions` 还必须固化 auth scheme、query/header/body overlay、variant、context/
output limits、reasoning effort/toggle/budget、idle/connect timeout、request/stream retries、
stream tool calls、auxiliary model route、cost/quota/service tier、account/tenant identity。
API key round-robin 不能继续只记录 usage/error count，必须纳入 credential generation、429/401
cooldown、quota/reset 和 breaker health。

### 5. 重复 provider owner

`lime-rs/crates/model-provider` 是 current owner，但 workspace 仍编译
`lime-rs/crates/providers`（crate 名 `lime-providers`），并被 `server`、`services`、
`skills` 直接调用。`lime-providers` 自带 provider trait、converter、streaming、
session/signature store，属于 `wrong owner`，不是可继续扩展的 compat 层。

删除顺序：先把这些消费者迁移到 `model-provider` 的 current client/lowering/stream
和统一 credential owner，再从 workspace、Cargo 依赖、catalog、文档和测试 fixture
删除 `lime-providers`；新增代码禁止引用该 crate。

## P1：主链闭环前必须补齐

| 域 | Codex 语义 | Lime 当前缺口 | 处理 |
| --- | --- | --- | --- |
| Item inventory | UserMessage、HookPrompt、AgentMessage、Plan、Reasoning、CommandExecution、FileChange、McpToolCall、DynamicToolCall、CollabAgentToolCall、SubAgentActivity、WebSearch、ImageView、Sleep、ImageGeneration、Entered/ExitedReview、ContextCompaction、MemoryCitation | payload/projection 未完成字段级盘点 | 建立 v2 item inventory 和每个字段的 cold/live/replay/GUI 证据 |
| Tool hooks/exposure | hook lifecycle、context injection、block/abort/rewrite、Direct/Deferred/Hidden、ToolSearch/LoadableToolSpec、output truncation | 只有 executor/side-effect 维度 | 统一 tool snapshot、hook snapshot、deferred discovery 和 output pairing |
| MCP | immutable `McpRuntimeSnapshot`、configured/runtime/effective overlay、OAuth/scopes、required/optional、elicitation pause/timeout | `McpStepSnapshot` 只含 tools/routes/caller | 增加 generation/auth/environment provenance 和 refresh-inflight contract |
| Skills/Plugins/Apps | watcher、scope/precedence、implicit invocation、dependency install/OAuth、trust、async readiness/cache/update | 只有 CRUD/catalog 投影 | 以 Codex service/notification 语义重建 current consumer |
| Approval/sandbox | permission profile、execpolicy/network amendment、guardian source、session approval cache、Windows/macOS/Linux | preflight 有但字段/恢复不全 | 单向 resolver + reverse request/recovery evidence |

## P2/P3：不能静默跳过

- **Multi-Agent**：补 role/config precedence、max depth/width、residency、rollout budget、fork mode、queue-only/trigger-turn 和 wait priority；已有 graph/identity/mailbox 不能直接等同 Codex V2。
- **Transport**：Lime `app-server-transport` 只实现 stdio。`WebSocket`、`UnixSocket`、逐连接 initialized/experimental/notification opt-out、slow-client disconnect 尚未实现；enum/URL 解析属于误导性声明，完成实现前应删除未实现 variant 或补齐 acceptor。
- **无 UI 也要有协议边界**：Codex 的 `backgroundTerminals`、`process/*`、`command/exec/*`、`fs/*`、`realtime/*`、review、file checkpoint、dynamic tools、attestation、environment、config lock、current time、memory mode 必须逐项标为“实现”或“明确产品范围排除”，不能停留在“代码存在”。
- **Instructions/environment/startup**：AGENTS.md discovery/cache/precedence、child environment inheritance、config lock、session startup prewarm、sticky environment 和 turn timing/usage provenance 需要纳入恢复契约。

## 删除与回流守卫

完成迁移后必须删除：

1. `lime-rs/crates/app-server-protocol/src/protocol/v0/**` 中的 Agent 旧 surface 及所有 `agentSession/*` production catalog/client/fixture 引用；其余 Lime 产品方法必须先迁入 v2/current registry，再删除整个 v0 module；
2. `lime-rs/crates/providers/**`、workspace 成员和直接依赖（仅在消费者迁完后删除）；
3. `AppServerTransport` 中没有真实 acceptor 的 ws/unix/off 声明，或在同一变更中补齐 Codex transport 实现；
4. 旧 session repository、第二 transcript/event store、provider raw tool mapper、renderer/provider fallback；
5. `CanonicalModel`/`EnhancedModelMetadata`/runtime JSON capability 的重复推导，保留一个 typed conversion owner。

回流守卫至少包括：

```bash
rg -n "agentSession|lime-providers|crate = \"providers\"" electron src scripts lime-rs internal
npm run governance:legacy-report
npm run test:contracts
```

扫描命中只能出现在历史 research/evidence 或明确的删除守卫中，不能出现在 current
production path。
