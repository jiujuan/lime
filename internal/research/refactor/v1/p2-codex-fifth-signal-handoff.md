# P2 Codex Fifth Signal Handoff

> 状态：handoff-ready / config-warning-protocol-contract-done / processor-config-load-emitter-done / warning-list-owner-done / rules-owner-gap-documented / frontend-typed-consumer-done / gui-presentation-done / safety-buffering-runtime-event-envelope-done / provider-sse-capture-done / read-model-done / safety-buffering-gui-presentation-done
> 更新时间：2026-07-07
> 来源：Codex `8268cbfb0e5f39cb4efff928264fe8f29ddacafb` range check；详见 [upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md)
> 目标：把第五次 Codex upstream 中的 `configWarning` owner、safety buffering `retry_model` 和 conditional dotenv 信号转成 Lime 可执行施工单，避免它们只停留在 P3 diff。

## 1. 结论

本文件是接管 handoff，不是端到端完成证据。2026-07-07 已先补 App Server protocol typed notification contract，并在 App Server processor current 主链接入只读配置加载失败 warning emitter：`initialize` 与 `agentSession/turn/start` 会返回 typed `configWarning` notification，turn-start notification 随当前请求响应链路回写，天然保持 connection-scoped。2026-07-07 精修后，App Server provider 已从单条 warning 演进为 warning list container，后续多个 config source 可复用同一 response path。Lime 当前没有 Codex 独立 `.rules` owner；exec policy 主要随 `config.yaml` 的配置解析被覆盖，因此 `.rules` / standalone exec-policy reload 只能记为 future design gap，不作为下一刀必做的 current 入口。同日已补齐 frontend typed consumer：`AppServerClient.request(...)` 会从 success / JSON-RPC error response path 发布 typed `configWarning`，GUI 通过全局 toast bridge 做五语言最小展示，不在 renderer 读取 rules/config 或解析自然语言 warning。

Safety buffering 已完成 provider parser、provider stream typed event wrapper、reply stream envelope、`AgentEvent::ProviderStreamEvent`、App Server `provider_safety_buffering` RuntimeEvent mapper、OpenAI Responses / Aster compat 边界的真实 SSE 捕获、App Server read model diagnostics / runtime summary projection，以及 GUI reliability diagnostics presentation。

第五次 Codex 信号的 Lime 处理口径：

| 信号                                  | 分类                        | Lime current owner                                                                                           | 本轮状态                                                                                                                                                                    |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Server `configWarning` owner 收敛 | `adopt-now`                 | App Server initialize / `thread/start` config reload warning flow；frontend / GUI 只消费 typed warning event | `protocol-contract-done / processor-config-load-emitter-done / warning-list-owner-done / rules-owner-gap-documented / frontend-typed-consumer-done / gui-presentation-done` |
| safety buffering `retry_model`        | `adopt-now`                 | provider stream parser -> RuntimeEvent projection -> read model / GUI presentation                           | `parser-owner-done / provider-stream-event-contract-done / runtime-event-envelope-done / provider-sse-capture-done / read-model-done / gui-presentation-done`               |
| conditional `CODEX_HOME` dotenv       | `adapt-for-desktop / watch` | Desktop Host sidecar startup env owner；provider/network bootstrap                                           | `watch`                                                                                                                                                                     |
| interleaved response items revert     | `rollback-signal`           | P2 Media Item projection handoff；Lime `itemId` invariant                                                    | 已在 Media handoff 修正为 rollback-aware                                                                                                                                    |

只读核对显示：

1. `model-provider::safety` 已有 safety buffering parser / typed RuntimeEvent payload owner；`provider_stream.rs` 已消费该 owner 并提供 `RuntimeReplyProviderStreamEvent::SafetyBuffering`；reply stream envelope 与 App Server RuntimeEvent mapper 已接住 typed event；OpenAI Responses / Aster compat stream 已捕获真实 SSE `safety_buffering` 并投成 typed provider event；App Server read model 已把 `provider_safety_buffering` 投到 diagnostics / runtime summary；GUI reliability panel 已消费 `thread_read.diagnostics.latest_provider_safety_buffering`。
2. `configWarning` 已有 App Server protocol typed notification contract；App Server processor 已能在 initialize / turn-start 时发出配置加载失败 typed warning，并支持同一 response path 返回多条 warning。Lime 当前没有 `.rules` current owner；frontend current API consumer 已能从 App Server response/error path 读取 typed warning 并推送 GUI toast，Electron Desktop Host 仍只做 JSON-RPC lines passthrough。
3. `lime-rs/crates/model-provider/src/provider_stream.rs` 目前描述 provider request wire shape，已包含 responses lite / reasoning / verbosity / parallel tool calls，并已新增 safety buffering typed event contract。
4. 目标源码区仍存在并行脏热区；`configWarning` 已接 frontend typed consumer 与全局 GUI toast bridge，safety buffering 已接 reliability diagnostics projection；本轮仍不接 AgentChat 内联诊断、raw provider wire consumer 或额外 projection package。

## 2. 只读审计证据

执行过的 scoped 查询：

```bash
rg -n "retry_model|faster_model|SafetyBuffering|safety_buffering|safetyBuffering" "lime-rs/crates" "src" "packages" "electron"
rg -n "configWarning|ConfigWarning|exec-policy|execpolicy|rules.*warning|warning.*rules" "lime-rs/crates/app-server" "electron" "src" "packages"
sed -n '1,260p' "lime-rs/crates/model-provider/src/provider_stream.rs"
git status --short -- "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/app-server" "electron" "src/lib/api" "src/components/agent/chat" "packages/agent-runtime-projection"
```

结果归类：

- `current-present-partial`：App Server protocol 与 processor config-load warning emitter 已提供结构化 `configWarning` owner，且 provider 已支持 warning list container。
- `future-design-gap`：Lime 当前没有 Codex 独立 `.rules` owner；standalone `.rules` / exec-policy reload 不能照搬，只能等规则 owner 明确后再接入 `configWarning`。
- `current-present`：provider stream 已消费 `model-provider::safety` 的 safety buffering `retry_model` owner，reply stream envelope、Aster compat OpenAI Responses SSE 捕获、App Server RuntimeEvent mapper、read model diagnostics projection 与 GUI reliability presentation 已接住 typed event。
- `current-present`：`RuntimeReplyProviderRequestWireShape` 已是 provider request policy 的 current owner，但它不是 safety buffering owner。
- `blocked-by-parallel-write`：相关实现落点当前脏改密集，必须等写集释放或显式移交。

## 3. Thread / Turn / Item 归属

| 能力                                        | Session / Thread                                                                          | Turn                          | Item / Read model                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `configWarning` initialize warning          | 连接级 / workspace 级，不属于某个 turn                                                    | 无 turn                       | 默认不生成 transcript item；GUI 只显示 warning event                                                        |
| `configWarning` thread/start reload warning | 绑定发起 `thread/start` 的 session/thread、cwd 和连接；当前先覆盖 config 文件 parse probe | 发生在 turn 执行前            | 默认不生成 agent message item；若后续要持久化，只能进入 evidence / diagnostic item，不能混入 assistant text |
| safety buffering `retry_model`              | 绑定当前 session/thread                                                                   | 绑定当前 provider stream turn | 可作为 RuntimeEvent / read model diagnostic 或 message metadata；不得让 GUI 从 provider wire 直接猜测       |
| Desktop Host startup env overlay            | 启动 App Server sidecar 前发生                                                            | 无 turn                       | 无 item；只影响 provider/network bootstrap                                                                  |

## 4. App Server `configWarning` Handoff

### 4.1 Codex 事实

Codex 第五次 range 的两个 commit 共同给出方向：

- `8f5bb6171e`：TUI 不再直接调用 core exec-policy 预检查，warning 统一由 App Server config warning flow 输出。
- `dbf67f34a0`：`thread/start` 重新加载 cwd / project-local config 和 `.rules` 后，新出现的 exec-policy parse warning 只发给发起该 thread 的连接；initialize 已发过的 warning 不重复。

Lime 不能机械照搬 `.rules`：当前没有独立 `.rules` 文件 owner，也没有等价的 rules loader。当前可执行的 current owner 是 `config.yaml` / legacy `config.json` parse probe；若后续新增 rules owner，必须先定义规则文件事实源、schema、reload 时机和 connection/thread 归属，再接入同一个 `configWarning` list container。

### 4.2 Lime current owner

事实源应落在：

```text
App Server config loader / rules loader
  -> structured configWarning notification
  -> connection-scoped event delivery
  -> Desktop Host bridge passthrough
  -> frontend event consumer / presentation
```

GUI、Desktop Host、frontend API gateway 只能消费 warning event，不能直接读 rules、不能直接调用 core exec-policy 检查，也不能从文件系统或自然语言文案反推 warning。

当前 Lime 第一阶段 owner 先落在 App Server config loader：`config.yaml` 优先、legacy `config.json` 作为兼容读取；`.rules` / standalone exec policy reload 是 future design gap，不是 current reader。

### 4.3 最小结构

完整 `configWarning` 长期至少需要表达：

| 字段                     | 要求                                                                     |
| ------------------------ | ------------------------------------------------------------------------ |
| `id`                     | 稳定去重 key，至少覆盖 warning kind + cwd / config path + rule path      |
| `kind`                   | `exec_policy_parse` / `rules_parse` 等结构化分类                         |
| `scope`                  | `initialize` 或 `thread_start`                                           |
| `connectionId`           | thread/start warning 只发给当前连接；initialize warning 按连接初始化发送 |
| `sessionId` / `threadId` | thread/start warning 必须能绑定当前 thread；initialize 可以为空          |
| `cwd`                    | 表示本次 config reload 的项目目录                                        |
| `severity`               | warning / error；不让 GUI 解析 message 文案                              |
| `message`                | presentation 文案或 i18n key 的后备信息                                  |

### 4.4 禁止路径

- 禁止在 GUI / React hook 直接读取 `.rules` 或 exec policy core。
- 禁止 Electron Desktop Host 做 App Server 机器上的 config 语义判断。
- 禁止把 warning 扩散成全局 toast 后丢失 connection/thread 归属。
- 禁止把 warning 写进 Aster vendor 或旧 `agent_runtime_*` production surface。
- 禁止只在 initialize 阶段发一次 warning，忽略 per-thread cwd reload。

### 4.5 第一代码切片

第一刀拆成两个层级，先立 contract，再接发射和消费。

已完成的协议 contract：

```text
App Server protocol
  -> METHOD_CONFIG_WARNING = "configWarning"
  -> ServerNotification::ConfigWarning(ConfigWarningNotification)
  -> schema fixture / generated TS
```

已完成的 processor emitter：

```text
App Server processor
  -> read-only config parse probe for existing config.yaml / config.json
  -> warning list container
  -> initialize configWarning notification
  -> agentSession/turn/start configWarning notification on same request response path
```

已完成的 frontend / GUI 切片：

```text
Desktop Host / frontend bridge consumer
  -> receive typed configWarning event from App Server response path
  -> GUI presentation / i18n
  -> no direct rules/config parsing in renderer
```

后续可选切片只限更细的 Chat 工作台内联诊断或 evidence / diagnostic 持久化；不得为了展示 warning 在 GUI / Electron 里新增 rules/config parser。

如果未来新增 Lime rules owner，先补 rules file owner / schema / reload owner，再复用同一个 `configWarning` list container；不要先在 GUI 或 Electron 里读 `.rules`。

### 4.6 最小验证

| 验证                                 | 证明                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| App Server warning tests             | initialize 和 thread/start warning 均可发出；重复 warning 可去重 |
| connection-scoped notification tests | thread/start warning 只发给当前请求连接，不广播到其它连接        |
| bridge event tests                   | Desktop Host / frontend bridge 只透传 typed event，不解析 rules  |
| GUI warning presentation tests       | GUI 消费 warning event，不直接读 core/rules                      |
| governance guard                     | 禁止 GUI / Electron 引入 exec-policy core direct check           |

2026-07-07 protocol contract 验证：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol notification_round_trips_config_warning_payload -- --nocapture`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_registry_matches_declared_type_names -- --nocapture`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture`
- `CARGO_TARGET_DIR="/tmp/lime-app-server-protocol-config-warning-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together -- --nocapture`
- `npm run check:protocol-types`

2026-07-07 processor emitter 验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`
- `git diff --check -- "lime-rs/crates/app-server/src/processor/config_warning.rs" "lime-rs/crates/app-server/src/processor/mod.rs" "lime-rs/crates/app-server/src/processor/dispatch.rs" "lime-rs/crates/app-server/src/processor/tests.rs" "lime-rs/crates/app-server/src/processor/tests/config_warning.rs"`
- `CARGO_TARGET_DIR="/tmp/lime-app-server-config-warning-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server config_warning -- --nocapture`：6 tests passed，确认 initialize / turn-start response path 与多 warning 保序回归成立。

2026-07-07 warning list owner 精修：

- `ConfigWarningProvider` 从单条 `Option<JsonRpcNotification>` 改为 `Vec<JsonRpcNotification>`，`RpcDispatch` 新增批量 notification append。
- 新增 initialize 多 warning 回归，证明同一 response path 可保序返回多条 `configWarning`。
- `.rules` 口径改为 Lime future design gap；当前不再把不存在的 `.rules` owner 写成现役 pending reload 入口。

2026-07-07 frontend typed consumer / GUI presentation：

- `src/lib/api/appServerResponse.ts` 从 JSON-RPC notification 中提取 typed `configWarnings`，成功 response 与 `AppServerRpcError` 都携带同一结构。
- `src/lib/api/appServerConfigWarnings.ts` 提供 warning sink，`AppServerClient.request(...)` 在 success / error 两条 response path 发布 typed warnings，并保留 method / phase / requestId context。
- `AppServerConfigWarningToastBridge` 在 `src/App.tsx` 全局挂载，用户可见文案覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- 已通过定向 Vitest、`npm run typecheck`、相关 ESLint / Prettier、`npm run i18n:check`、`npm run test:contracts` 与 `npm run verify:gui-smoke`；GUI smoke 证明 renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready。

## 5. Safety Buffering `retry_model` Handoff

### 5.1 Codex 事实

Codex commit `7094fa467e` 修正 Responses safety buffering wire 字段：

```text
payload.retry_model 优先
payload.retry_model = null 表示 unset
payload 缺失 retry_model 时才 fallback 到旧 header x-codex-safety-buffering-faster-model
```

这意味着 Lime 不能用 `faster_model` 当新 wire 字段，也不能把 explicit null 和 omitted 混成同一种状态。

### 5.2 Lime current owner

事实源应落在：

```text
provider stream parser
  -> safety buffering typed payload
  -> RuntimeEvent
  -> Thread / Turn scoped projection
  -> read model diagnostics / runtime summary
  -> GUI presentation
```

如果内部已有 `fasterModel` 展示命名，可以作为兼容 DTO 字段保留；但 provider wire parser 必须以 `retry_model` 为事实源，并明确 `null` 与缺失字段的语义差异。

### 5.3 最小结构

| 字段                                | 要求                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `retryModel`                        | 从 payload `retry_model` 读取；显式 `null` 表示无 retry target        |
| `fallbackHeaderModel`               | 仅在 payload 缺失 `retry_model` 时读取旧 header                       |
| `source`                            | `payload_retry_model` / `explicit_null` / `legacy_header` / `missing` |
| `sessionId` / `threadId` / `turnId` | 必须绑定当前 provider stream 所属 turn                                |
| `provider` / `model`                | 可用于 GUI 展示和 evidence，不作为 routing truth                      |

### 5.4 禁止路径

- 禁止只改 GUI 文案或只加 i18n key。
- 禁止在 frontend 直接解析 provider wire event。
- 禁止 provider stream parser 继续查找 `faster_model` 作为新 payload 字段。
- 禁止 explicit null fallback 到旧 header；只有字段缺失才 fallback。
- 禁止把 safety buffering 接到 opencode Session / Tool / UI 架构；opencode 在此没有新增 allowlist 信号。

### 5.5 第一代码切片

第一刀只做 parser + event shape：

```text
provider safety buffering wire payload
  -> typed parser with retry_model/null/omitted semantics
  -> RuntimeEvent payload
```

已完成的 runtime envelope 切片：

```text
RuntimeReplyProviderStreamEvent::SafetyBuffering
  -> agent_runtime::RuntimeReplyStreamEvent::ProviderStreamEvent
  -> lime_agent::AgentEvent::ProviderStreamEvent
  -> App Server RuntimeEvent(provider_safety_buffering)
```

已完成的 provider SSE capture 切片：

```text
OpenAI Responses SSE safety_buffering event
  -> Aster invisible provider stream sentinel
  -> RuntimeReplyProviderStreamEvent::SafetyBuffering
  -> RuntimeEvent(provider_safety_buffering)
```

已完成的 read model 切片：

```text
RuntimeEvent(provider_safety_buffering)
  -> thread_read.diagnostics.latest_provider_safety_buffering
  -> thread_read.runtime_summary.latestProviderSafetyBuffering
```

已完成的 presentation 切片：

```text
thread_read.diagnostics.latest_provider_safety_buffering
  -> AgentThreadProviderSafetyBufferingCard
  -> reliability diagnostic copy payload
```

这样封住了 wire semantics、RuntimeEvent contract、read-model projection 与 GUI presentation，不让 GUI 解析 raw provider wire 或 Aster sentinel。

### 5.6 最小验证

| 验证                          | 证明                                                               |
| ----------------------------- | ------------------------------------------------------------------ |
| provider stream parser tests  | `retry_model` 优先、explicit null unset、missing fallback header   |
| RuntimeEvent projection tests | event 绑定 session/thread/turn，不直通 provider raw payload        |
| read model tests              | safety buffering 进入 diagnostic / metadata，不污染 assistant text |
| GUI presentation tests        | GUI 消费 projection，不解析 raw wire                               |

当前已补 `model-provider::safety` owner、provider stream typed event contract、reply stream envelope、`AgentEvent` DTO 与 App Server RuntimeEvent mapper。已通过：

- `CARGO_HOME="/tmp/lime-codex-cargo-home-model-provider" CARGO_TARGET_DIR="/tmp/lime-codex-provider-stream-runtime-event-target" CARGO_BUILD_JOBS=4 cargo fmt --manifest-path "lime-rs/Cargo.toml" -p agent-runtime -p lime-agent -p app-server --check`
- 同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream -- --nocapture`：3 tests passed
- 同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_reply_event_projects_agent_event -- --nocapture`：1 test passed
- 同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_event_provider_stream_event_serializes_current_payload -- --nocapture`：1 test passed
- 同环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_stream_event -- --nocapture`：2 tests passed
- `TMPDIR="/tmp" CARGO_HOME="/tmp/lime-codex-cargo-home-provider-stream-capture" CARGO_TARGET_DIR="/tmp/lime-codex-provider-stream-capture-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_BUILD_JOBS=4 cargo check --manifest-path "lime-rs/vendor/aster-rust/crates/aster/Cargo.toml" -p aster-core`：passed，1 个既有 `unused_mut` warning
- 同 `/tmp` 环境 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`：passed
- 同 `/tmp` 环境 `cargo test --manifest-path "lime-rs/vendor/aster-rust/crates/aster/Cargo.toml" -p aster-core --lib test_responses_streaming_safety_buffering_emits_provider_stream_notification -- --nocapture`：1 test passed
- 同 `/tmp` 环境 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib provider_stream_notification_projects_safety_buffering_event -- --nocapture`：1 test passed

OpenAI Responses / Aster compat provider SSE 捕获、App Server read model projection 与 GUI reliability presentation 已完成。

2026-07-07 read model projection 验证：

- `TMPDIR="/tmp" CARGO_HOME="/tmp/lime-codex-cargo-home-app-server-read-model" CARGO_TARGET_DIR="/tmp/lime-codex-app-server-safety-read-model-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_projects_provider_safety_buffering_into_diagnostics -- --nocapture`：1 test passed。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server -- --check`：passed。
- `git diff --check -- "lime-rs/crates/app-server/src/runtime/read_model.rs" "lime-rs/crates/app-server/src/runtime/tests/read_model/messages_diagnostics.rs" "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts"`：passed。
- `npm run test:related -- "src/lib/api/agentRuntime/types.ts" "src/lib/api/agentRuntime/types.d.ts"` 当时工作树失败于 AgentChat GUI 预览 / StreamingRenderer 既有热区：`src/components/agent/chat/index.autoGuide01.test.tsx` 1 个、`index.workbench01.test.tsx` 2 个、`components/StreamingRenderer.test.tsx` 2 个；这些不属于 read-model / 类型写集。该记录仅作为当时热区证据保留，GUI presentation 缺口已由 2026-07-07 reliability diagnostics projection 切片关闭。

2026-07-07 GUI presentation 验证：

- `AgentThreadProviderSafetyBufferingCard` 只消费 `thread_read.diagnostics.latest_provider_safety_buffering`，展示 provider/model、retry model、fallback header model、use cases、reasons、source 和 buffering UI 状态。
- `threadReliabilityDiagnosticText` 的复制诊断包同样只消费 read model sample，不解析 raw `runtimeEvent`、provider wire、Aster sentinel 或 legacy `fasterModel`。
- 用户可见 presentation 文案已覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- `XDG_CACHE_HOME="/tmp/lime-codex-node-cache-provider-safety-projection" npm test -- "src/components/agent/chat/components/AgentThreadReliabilityPanel.test.tsx" "src/components/agent/chat/components/AgentThreadReliabilityPanel.memory.test.tsx"`：18 tests passed。
- `CARGO_HOME="/tmp/lime-codex-cargo-home-provider-safety-projection" CARGO_TARGET_DIR="/tmp/lime-codex-provider-safety-projection-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_safety_buffering -- --nocapture`：1 matching app-server read model test passed。
- `TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-node-cache-inputbar-restore" npm_config_cache="/tmp/lime-codex-npm-cache-inputbar-restore" CARGO_HOME="/tmp/lime-codex-cargo-home-inputbar-restore" CARGO_TARGET_DIR="/tmp/lime-codex-inputbar-restore-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=2 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-rich-restore --prefix claw-chat-current-fixture-inputbar-rich-restore-codex --timeout-ms 180000`：passed，summary `claw-chat-current-fixture-inputbar-rich-restore-codex-summary.json`，证明 output-free cancel 后 text / image / path / skill 均恢复，backend `turnCancel`、read model `latestTurnStatus=canceled` 与 GUI `(已停止)` 闭环一致。
- `TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-node-cache-agent-runtime-fixture" npm_config_cache="/tmp/lime-codex-npm-cache-agent-runtime-fixture" CARGO_HOME="/tmp/lime-codex-cargo-home-agent-runtime-fixture" CARGO_TARGET_DIR="/tmp/lime-codex-agent-runtime-fixture-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=2 npm run smoke:agent-runtime-current-fixture`：passed，`liveProviderUsed=false`；覆盖 history/cache hydration、stream terminal UI、code artifact workbench、Claw 图片命令、普通画图意图、cancel-then-continue、`inputbar-rich-restore`、Plan hydrate、Skills Runtime、Multi-Agent、MCP structuredContent、Expert Skills Runtime 与 Content Factory article workspace。
- 2026-07-07 08:14-08:18 聚合 summary 复核：code workbench 与 Claw 12 个 Electron regression summary 均为本轮新产物，`ok=true`、common assertions 全 true、scenario assertions 全 true、`liveProviderUsed=false`。其中 `claw-chat-current-fixture-inputbar-rich-restore-regression-summary.json` 为 08:15:38 产物，证明 rich restore 已在聚合门禁内转绿。
- `TMPDIR="/tmp" XDG_CACHE_HOME="/tmp/lime-codex-node-cache-gui-smoke" npm_config_cache="/tmp/lime-codex-npm-cache-gui-smoke" CARGO_HOME="/tmp/lime-codex-cargo-home-agent-runtime-fixture" CARGO_TARGET_DIR="/tmp/lime-codex-agent-runtime-fixture-target" CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_BUILD_JOBS=2 npm run verify:gui-smoke`：passed，renderer loaded、App Server initialized、Claw workbench shell ready、memory settings ready。

## 6. Desktop Host Conditional Dotenv Watch

### 6.1 Codex 事实

Codex commit `8268cbfb0e` 在 CLI startup 期根据 `CODEX_HOME` 和 TCP 条件加载 `.env.*` overlay，并保护 `CODEX_*` 内部变量。它的核心价值是：

```text
环境 overlay 必须在 runtime / worker / session / network client 创建前完成
```

### 6.2 Lime 桌面化口径

Lime 不能照搬 CLI `arg0` / `CODEX_HOME` 形态。若后续需要 provider proxy、network env 或模型服务连通性 overlay，应落在：

```text
Electron Desktop Host sidecar startup
  -> env overlay resolver
  -> protected internal var filter
  -> spawn App Server sidecar
```

这条能力暂记为 `watch`，除非出现 provider proxy / network env 的真实需求或启动失败证据，否则不抢先实现。

### 6.3 禁止路径

- 禁止运行时多线程 mutate process env。
- 禁止 App Server turn 执行中加载或覆盖 env。
- 禁止覆盖内部保留变量。
- 禁止只支持 macOS 路径；Desktop Host env overlay 必须考虑 Windows。
- 禁止把 Codex `CODEX_HOME` 语义改名成 Lime 新品牌前缀。

### 6.4 最小验证

| 验证                           | 证明                                                |
| ------------------------------ | --------------------------------------------------- |
| Desktop Host sidecar env tests | overlay 在 spawn 前完成，内部变量受保护             |
| provider connectivity fixture  | proxy/env overlay 能影响 provider network bootstrap |
| Windows/macOS startup smoke    | 桌面端双平台启动不回归                              |

## 7. 接管条件

实现任何一条 handoff 前必须满足至少一个条件：

1. `git status --short -- <目标写集>` 显示目标源码文件干净。
2. 隔壁进程在 [priority-tracking-plan.md](./priority-tracking-plan.md) 明确移交相关写集。
3. 用户明确授权当前进程接管对应脏热区。

目标源码热区继续避让：

- `lime-rs/crates/app-server/src/runtime/**`
- `lime-rs/crates/app-server/src/runtime_backend/**`
- `lime-rs/crates/model-provider/src/provider_stream.rs`
- `electron/**`
- `src/lib/api/**`
- `packages/agent-runtime-projection/**`
- `src/components/agent/chat/**`
- `src/lib/governance/**`
- `lime-rs/vendor/aster-rust/**`

## 8. 下一刀排序

| 顺序 | 切片                                                    | 原因                                                                                                                                                                                   |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `configWarning` contextual diagnostic / evidence polish | provider safety buffering GUI projection 与 Inputbar rich restore current fixture 已转绿；下一刀回到第五信号里仍有主线收益的 typed diagnostic / evidence polish，只有需要 thread/session 级持久化或 Chat 工作台内联诊断时才继续，不得补不存在的 `.rules` reader |
| 2    | Desktop Host env overlay watch-to-implementation        | 只有 provider proxy / network env 需求出现时再做，避免无需求扩张启动逻辑                                                                                                                                       |
| 3    | Context sidecar source / compact item                   | 若继续 P2 深层能力，比继续打磨已绿的 safety buffering GUI 更能提升整体目标完成度；Evidence export consumer 已完成，下一刀应贯通真实 sidecarRef source 并 materialize compact item，不新增 provider 或 UI 旁路 |

## 9. 本轮分类

- `current`：本 handoff 是第五次 Codex adopt-now 信号进入 Lime P2/P3 跟进的施工事实源。
- `current`：App Server warning event、provider stream parser、read model diagnostics、reliability panel projection、Desktop Host sidecar startup 分别是当前 owner。
- `compat`：旧 provider header `x-codex-safety-buffering-faster-model` 只允许作为 missing-field fallback，不是新 wire truth；Aster OpenAI Responses sentinel 只是当前 provider compat bridge，后续替换 provider backend 时必须下沉到新的 current provider stream parser。
- `deprecated`：无新增。
- `dead`：旧 `agent_runtime_*` production surface、旧 `lime-rs/src/**`、Aster vendor 新业务承接仍 forbidden。

## 10. 本轮验证

本轮代码与文档改动的最小收口验证：

```bash
rg -n "[ \t]+$" internal/research/refactor/v1
rg -n '(<{7}|={7}|>{7})' internal/research/refactor/v1
```

第五信号核心代码切片已按对应 owner 跑过 App Server warning tests、provider stream parser tests、bridge event tests、projection tests、GUI presentation tests、`npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`。后续若继续本 handoff，只允许做 thread/session contextual diagnostic、evidence polish 或 Desktop Host env overlay 的真实需求实现。
