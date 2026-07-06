# P2 Codex Fifth Signal Handoff

> 状态：handoff-ready / config-warning-protocol-contract-done / processor-config-load-emitter-done / rules-reload-emitter-pending
> 更新时间：2026-07-07
> 来源：Codex `8268cbfb0e5f39cb4efff928264fe8f29ddacafb` range check；详见 [upstream-diff-2026-07-07-p3-fifth.md](./upstream-diff-2026-07-07-p3-fifth.md)
> 目标：把第五次 Codex upstream 中的 `configWarning` owner、safety buffering `retry_model` 和 conditional dotenv 信号转成 Lime 可执行施工单，避免它们只停留在 P3 diff。

## 1. 结论

本文件是接管 handoff，不是端到端完成证据。2026-07-07 已先补 App Server protocol typed notification contract，并在 App Server processor current 主链接入只读配置加载失败 warning emitter：`initialize` 与 `agentSession/turn/start` 会返回 typed `configWarning` notification，turn-start notification 随当前请求响应链路回写，天然保持 connection-scoped。`.rules` / exec-policy reload warning、Desktop Host bridge consumer 和 GUI presentation 仍 pending。

第五次 Codex 信号的 Lime 处理口径：

| 信号 | 分类 | Lime current owner | 本轮状态 |
| --- | --- | --- | --- |
| App Server `configWarning` owner 收敛 | `adopt-now` | App Server initialize / `thread/start` config reload warning flow；GUI / Desktop Host 只消费 warning event | `protocol-contract-done / processor-config-load-emitter-done / rules-reload-emitter-pending` |
| safety buffering `retry_model` | `adopt-now` | provider stream parser -> RuntimeEvent projection -> read model / GUI presentation | `code-pending` |
| conditional `CODEX_HOME` dotenv | `adapt-for-desktop / watch` | Desktop Host sidecar startup env owner；provider/network bootstrap | `watch` |
| interleaved response items revert | `rollback-signal` | P2 Media Item projection handoff；Lime `itemId` invariant | 已在 Media handoff 修正为 rollback-aware |

只读核对显示：

1. `retry_model` / `faster_model` / safety buffering 在 Lime 当前源码无命中；Lime 还没有 provider safety buffering 消费链。
2. `configWarning` 已有 App Server protocol typed notification contract；App Server processor 已能在 initialize / turn-start 时发出配置加载失败 typed warning。`.rules` / exec-policy reload warning、Electron / frontend current bridge 中仍没有消费链。
3. `lime-rs/crates/model-provider/src/provider_stream.rs` 目前描述 provider request wire shape，已包含 responses lite / reasoning / verbosity / parallel tool calls，但没有 safety buffering parser。
4. 目标源码区仍是并行脏热区，本轮只更新 v1 文档，不夹写 App Server runtime/backend、provider stream、Electron host、projection package 或 AgentChat GUI。

## 2. 只读审计证据

执行过的 scoped 查询：

```bash
rg -n "retry_model|faster_model|SafetyBuffering|safety_buffering|safetyBuffering" "lime-rs/crates" "src" "packages" "electron"
rg -n "configWarning|ConfigWarning|exec-policy|execpolicy|rules.*warning|warning.*rules" "lime-rs/crates/app-server" "electron" "src" "packages"
sed -n '1,260p' "lime-rs/crates/model-provider/src/provider_stream.rs"
git status --short -- "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/app-server" "electron" "src/lib/api" "src/components/agent/chat" "packages/agent-runtime-projection"
```

结果归类：

- `current-present-partial`：App Server protocol 与 processor config-load warning emitter 已提供结构化 `configWarning` owner。
- `current-missing`：`.rules` / exec-policy reload warning 仍未接入 `configWarning`。
- `current-missing`：provider stream 尚未解析 safety buffering `retry_model`。
- `current-present`：`RuntimeReplyProviderRequestWireShape` 已是 provider request policy 的 current owner，但它不是 safety buffering owner。
- `blocked-by-parallel-write`：相关实现落点当前脏改密集，必须等写集释放或显式移交。

## 3. Thread / Turn / Item 归属

| 能力 | Session / Thread | Turn | Item / Read model |
| --- | --- | --- | --- |
| `configWarning` initialize warning | 连接级 / workspace 级，不属于某个 turn | 无 turn | 默认不生成 transcript item；GUI 只显示 warning event |
| `configWarning` thread/start reload warning | 绑定发起 `thread/start` 的 session/thread、cwd 和连接 | 发生在 turn 执行前 | 默认不生成 agent message item；若后续要持久化，只能进入 evidence / diagnostic item，不能混入 assistant text |
| safety buffering `retry_model` | 绑定当前 session/thread | 绑定当前 provider stream turn | 可作为 RuntimeEvent / read model diagnostic 或 message metadata；不得让 GUI 从 provider wire 直接猜测 |
| Desktop Host startup env overlay | 启动 App Server sidecar 前发生 | 无 turn | 无 item；只影响 provider/network bootstrap |

## 4. App Server `configWarning` Handoff

### 4.1 Codex 事实

Codex 第五次 range 的两个 commit 共同给出方向：

- `8f5bb6171e`：TUI 不再直接调用 core exec-policy 预检查，warning 统一由 App Server config warning flow 输出。
- `dbf67f34a0`：`thread/start` 重新加载 cwd / project-local config 和 `.rules` 后，新出现的 exec-policy parse warning 只发给发起该 thread 的连接；initialize 已发过的 warning 不重复。

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

### 4.3 最小结构

`configWarning` 至少需要表达：

| 字段 | 要求 |
| --- | --- |
| `id` | 稳定去重 key，至少覆盖 warning kind + cwd / config path + rule path |
| `kind` | `exec_policy_parse` / `rules_parse` 等结构化分类 |
| `scope` | `initialize` 或 `thread_start` |
| `connectionId` | thread/start warning 只发给当前连接；initialize warning 按连接初始化发送 |
| `sessionId` / `threadId` | thread/start warning 必须能绑定当前 thread；initialize 可以为空 |
| `cwd` | 表示本次 config reload 的项目目录 |
| `severity` | warning / error；不让 GUI 解析 message 文案 |
| `message` | presentation 文案或 i18n key 的后备信息 |

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
  -> initialize configWarning notification
  -> agentSession/turn/start configWarning notification on same request response path
```

仍待完成的垂直切片：

```text
thread/start .rules / exec-policy config reload
  -> structured config warning event
  -> connection-scoped notification
  -> frontend event listener receives typed warning
```

如果 App Server initialize warning owner 还不存在，下一刀补 App Server runtime emitter 和 connection-scoped delivery tests；不要先做 GUI 文案。

### 4.6 最小验证

| 验证 | 证明 |
| --- | --- |
| App Server warning tests | initialize 和 thread/start warning 均可发出；重复 warning 可去重 |
| connection-scoped notification tests | thread/start warning 只发给当前请求连接，不广播到其它连接 |
| bridge event tests | Desktop Host / frontend bridge 只透传 typed event，不解析 rules |
| GUI warning presentation tests | GUI 消费 warning event，不直接读 core/rules |
| governance guard | 禁止 GUI / Electron 引入 exec-policy core direct check |

2026-07-07 protocol contract 验证：

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol notification_round_trips_config_warning_payload -- --nocapture`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_registry_matches_declared_type_names -- --nocapture`
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol schema_fixtures_match_generated_output -- --nocapture`
- `CARGO_TARGET_DIR="/tmp/lime-app-server-protocol-config-warning-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol app_server_method_catalog_keeps_request_and_notification_methods_together -- --nocapture`
- `npm run check:protocol-types`

2026-07-07 processor emitter 验证：

- `cargo fmt --manifest-path "lime-rs/Cargo.toml" -p app-server --check`
- `git diff --check -- "lime-rs/crates/app-server/src/processor/config_warning.rs" "lime-rs/crates/app-server/src/processor/mod.rs" "lime-rs/crates/app-server/src/processor/dispatch.rs" "lime-rs/crates/app-server/src/processor/tests.rs" "lime-rs/crates/app-server/src/processor/tests/config_warning.rs"`
- 阻塞：`CARGO_TARGET_DIR="/tmp/lime-app-server-config-warning-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server config_warning -- --nocapture` 在编译无关并行热区 `lime-rs/crates/tool-runtime/src/apply_patch.rs` 时失败，错误为 unresolved import `patch_apply`；本切片不接管 `tool-runtime` 写集。

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
  -> read model / GUI presentation
```

如果内部已有 `fasterModel` 展示命名，可以作为兼容 DTO 字段保留；但 provider wire parser 必须以 `retry_model` 为事实源，并明确 `null` 与缺失字段的语义差异。

### 5.3 最小结构

| 字段 | 要求 |
| --- | --- |
| `retryModel` | 从 payload `retry_model` 读取；显式 `null` 表示无 retry target |
| `fallbackHeaderModel` | 仅在 payload 缺失 `retry_model` 时读取旧 header |
| `source` | `payload_retry_model` / `explicit_null` / `legacy_header` / `missing` |
| `sessionId` / `threadId` / `turnId` | 必须绑定当前 provider stream 所属 turn |
| `provider` / `model` | 可用于 GUI 展示和 evidence，不作为 routing truth |

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

第二刀再接 read model / GUI presentation。这样可以先封住 wire semantics，不让 GUI 先行生成假入口。

### 5.6 最小验证

| 验证 | 证明 |
| --- | --- |
| provider stream parser tests | `retry_model` 优先、explicit null unset、missing fallback header |
| RuntimeEvent projection tests | event 绑定 session/thread/turn，不直通 provider raw payload |
| read model tests | safety buffering 进入 diagnostic / metadata，不污染 assistant text |
| GUI presentation tests | GUI 消费 projection，不解析 raw wire |

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

| 验证 | 证明 |
| --- | --- |
| Desktop Host sidecar env tests | overlay 在 spawn 前完成，内部变量受保护 |
| provider connectivity fixture | proxy/env overlay 能影响 provider network bootstrap |
| Windows/macOS startup smoke | 桌面端双平台启动不回归 |

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

| 顺序 | 切片 | 原因 |
| --- | --- | --- |
| 1 | App Server `configWarning` typed owner | Codex 已证明 warning owner 必须在 App Server，且 thread/start cwd reload 会产生新 warning |
| 2 | provider safety buffering `retry_model` parser | wire semantics 有上游修正，越早封住 parser 越少 GUI / projection 误解 |
| 3 | Desktop Host env overlay watch-to-implementation | 只有 provider proxy / network env 需求出现时再做，避免无需求扩张启动逻辑 |

## 9. 本轮分类

- `current`：本 handoff 是第五次 Codex adopt-now 信号进入 Lime P2/P3 跟进的施工事实源。
- `current`：App Server warning event、provider stream parser、Desktop Host sidecar startup 分别是三个 owner。
- `compat`：旧 provider header `x-codex-safety-buffering-faster-model` 只允许作为 missing-field fallback，不是新 wire truth。
- `deprecated`：无新增。
- `dead`：旧 `agent_runtime_*` production surface、旧 `lime-rs/src/**`、Aster vendor 新业务承接仍 forbidden。

## 10. 本轮验证

本文件只改文档，最小验证为：

```bash
rg -n "[ \t]+$" internal/research/refactor/v1
rg -n '(<{7}|={7}|>{7})' internal/research/refactor/v1
```

后续代码实现必须按对应 owner 跑 App Server warning tests、provider stream parser tests、bridge event tests、projection tests 和 GUI presentation tests。
