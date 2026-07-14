# S4l MCP Sampling-Step Snapshot

## Fact source

Codex 在每次 model sampling step 构造新的 step context；不是在整个用户 Turn
开始时永久冻结工具面。Lime current 链据此固定为：

`provider request -> RuntimeToolStepSnapshot(definitions + executor) -> same-step tool calls`

MCP snapshot 的唯一 owner 是 `tool-runtime::mcp_connection`。同一步的 prefixed
definition、per-tool caller policy、dispatch route、connection handle 与 handle 内的
configured tool timeout 必须一致；live registry refresh 只影响下一 sampling step。

## Changes

- `agent-runtime` 在每次 provider request 前 capture `RuntimeToolStepSnapshot`，本 step
  返回的 tool call 只允许精确命中该 snapshot definitions。未广告 native/MCP 名称走
  专用拒绝 executor，保留 canonical failed lifecycle，但真实 executor 调用次数为零。
- `McpStepSnapshot` 同时冻结 tool definition、raw inner name、per-tool
  `allowed_callers`、route 和 `Arc<McpConnectionHandle>`；capture 与 dispatch 双重执行
  caller gate。mixed caller server 不再因 extension-level collapse 为 `None` 而放开。
- MCP discovery 用 `JoinSet` 按 server 并发，每个 server 的完整分页在独立 timeout
  内原子完成；error/slow server 被跳过，健康 server tools 和 routes 保留。
- `tool_search` 命中后只写同一 provider Turn source 持有的
  `DeferredToolSelections`。旧 snapshot 不变，下一 sampling step capture 才消费选择；
  新 Turn 使用新的 selection set，不跨 Thread/Turn 泄漏。
- 删除 registry 中无 writer 的进程级 `loaded_deferred_tools`；live registry dispatch
  对未默认暴露的 deferred tool 保持 fail closed。
- `McpBridgeSnapshot` 携带 `McpServerConfig::tool_timeout_secs()` 的归一化 Duration；
  immutable bridge client 仅对 `call_tool` 使用该 timeout，其余 request 保持 60 秒。
  registry replace 后旧 step 继续使用旧 client/timeout。
- Lime adapter 不再把 provider tool argument delta 投影为 raw
  `AgentEvent::ToolInputDelta` product event；完整 arguments 只随 canonical Tool Item
  lifecycle 进入 App Server。
- localhost fixture `providerConfig` 改为 current camelCase wire，Context7 smoke 的
  scripted tool name 改为 canonical `tool_search`。未在 Rust protocol 增加 compat alias。
- 将 1075 行 `provider_turn.rs` tests 和 1312 行 current turn executor 分别拆到
  600/413 行子模块；owner 入口降到 474/912 行。

## Validation

- `cargo test -p agent-runtime`: `112/112`。
- `cargo test -p tool-runtime`: `268/268`。
- `cargo test -p lime-mcp`: `112/112`。
- `cargo test -p lime-agent current_provider_turn`: `9/9`。
- localhost OpenAI-compatible fixture unit：`9/9`。
- `cargo check -p lime-agent`: pass，无 S4l warning。
- `npm run test:contracts`: pass，`290 checks`。
- `npm run governance:legacy-report`: pass，边界违规 `0`。
- `npm run verify:gui-smoke`: pass；Electron/App Server protocol `appserver.v0`，版本
  `1.101.0`。
- `npm run smoke:agent-runtime-tool-execution -- --batch mcp-context7-toolsearch`: pass。
  evidence 为 `.lime/qc/agent-runtime-tool-execution-mcp-context7-toolsearch.json`；
  session `sess_d8b2a669840540288016ec07c401214a`、turn
  `tool-execution-1783921994458-45873`，localhost provider 收到 3 次 sampling request，
  `tool_search` 与真实 Context7 `query-docs` 均为 completed/success。
- `npm run test:rust:related -- <S4l Rust paths>` 使用 `RUST_MIN_STACK=8388608`：
  `agent-runtime 112/112` 后，App Server 反向依赖为 `990/1002`；12 个失败均位于
  并行 S4h/S4m 热区的 raw `tool.started`、已删除 `tool.args`、sequence/approval stale
  fixture，不在 S4l 写集。未越界修改。
- `npm run smoke:agent-runtime-current-fixture`：历史/缓存 31、流式收尾 32、Electron
  guard 61，以及 home/greeting/Workbench/image/cancel-continue 场景通过；最终在既有
  approval second-record compact 断言失败，不在 S4l 写集。
- `npm run electron:build:app-server-assets`: pass；使用 current App Server sidecar。
- `npm run smoke:agent-runtime-tool-execution:managed -- --batch mcp-deferred-tool-search-gate-b --timeout-ms 300000 --output .lime/qc/agent-runtime-tool-execution-mcp-deferred-tool-search-gate-b.json`:
  pass。真实 Electron Desktop Host/preload 经 `app_server_handle_json_lines` 建立临时
  stdio MCP server；其唯一 `deferred_echo` tool 通过 `x-lime.deferred_loading=true`
  标记为不可默认注入。localhost OpenAI fixture 的首个 provider sampling request 为
  21 tools，未含 deferred tool；同一 Turn `tool_search` 后的第 2/3 个 request 为 22
  tools，均含该 tool，且 canonical Tool Item completed/success；第 2 Turn 的 request
  恢复为 21 tools，不含前一 Turn selection。全部 16 个 assertion 通过。
- `git diff --check`: pass。

Context7 当前只暴露 2 个 tools，小于自动 deferred 阈值 `>6`，因此它只证明 current
MCP control plane、canonical `tool_search`、多次 sampling、真实 MCP call 和 canonical
Tool projection。专用 localhost deferred fixture 现已补齐 Electron Gate B：old-step
deny、same-Turn next-step visible/executed 与 Turn-local no-leak 均由真实 Host/preload/
App Server/runtime 链验证。

## Classification

- `current`: per-sampling-step `RuntimeToolStepSnapshot`、caller-bound `McpStepSnapshot`、
  Turn-local deferred selection、immutable bridge timeout、canonical Tool lifecycle。
- `compat`: none。
- `deprecated`: none。
- `dead / deleted`: process-global deferred loaded set、Lime current adapter raw
  `tool.input.delta` product projection、fixture `ToolSearch` alias 与 snake_case
  `providerConfig` wire。
- `test-only`: localhost provider、Context7 smoke orchestration、临时 stdio deferred MCP
  server、forged denied-route test。

## Residuals

- MCP resource、prompt、capability 与 MCP server elicitation 仍走 live manager，不在本
  snapshot。
- `supports_parallel_tool_calls` 尚未进入 bridge snapshot；同 connection Mutex 当前
  保守串行，属于能力/性能缺口，不是越权并发。
- `McpConnectionRegistry::dispatch` 当前无生产 callsite且 caller-unaware，后续应删除或
  改为 caller-required；current provider 已只走 caller-bound snapshot dispatch。
- discovery timeout 后的协议级 cancellation/logging 可继续补强；不影响已验证的
  partial-success surface。

## Next cut

MCP resource/prompt/capability/elicitation snapshot 与 mailbox/edge persistence 应单独
认领；不得恢复 live registry redispatch、全局 deferred state 或 raw Tool product wire。
