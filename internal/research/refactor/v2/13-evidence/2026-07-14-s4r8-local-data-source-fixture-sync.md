# S4r8 LocalAppDataSource Fixture Sync

日期：2026-07-14  
状态：completed / focused-validated

## 事实源

`LocalAppDataSource` 是 App Server 本地 MCP 控制面与 runtime bridge 的唯一
`ElicitationRequestRouter` owner。测试 fixture 必须构造同一 production field；不得用
缺字段初始化、临时 mock router 或第二套 pending state 规避编译。

## 变更

- `local_data_source::tests::setup_data_source` 初始化 default
  `ElicitationRequestRouter`，与 production constructor 一致。
- `McpAppDataSource for LocalAppDataSource` 直接 clone 自有 router field，保证 runtime
  bridge 取得 data source 已拥有的 router，不回退 trait default。
- 真实 stdio MCP fixture 继续以精确 `server` + `uri` 调用 Resource read/subscribe/
  unsubscribe，并断言 list result 的 server identity。

初次诊断发现该真实 fixture 在当前 macOS test worker 默认栈上溢出；使用仓库已有
`RUST_MIN_STACK=8388608` 口径后通过。直接 field clone 与更大栈下的通过结果表明没有
router trait 无限递归；该现象记录为 test-runner stack 环境限制，不是生产 fallback。

## 验证

```text
RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml -p app-server \
  local_data_source::tests::mcp_current_jsonrpc_starts_real_stdio_server_and_reads_tool_resource \
  --lib -- --exact
# 1 passed

RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml -p app-server \
  agent_control --lib
# 6 passed; 解除 S4v 的 fixture 编译阻塞

RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml -p app-server \
  agent_mailbox_store::tests --lib
# 4 passed; 解除 S4u 的 fixture 编译阻塞

cargo check --manifest-path lime-rs/Cargo.toml -p app-server
# passed

rustfmt --edition 2021 --check <two changed Rust files>
git diff --check -- <two changed Rust files>
# passed
```

App Server 当前工作树仍有 `runtime_backend` 与未接 gateway 的 `agent_control` dead-code
warning；它们属于并行 S4w/S4v 后续接线，不是本 slice 的 diagnostic。

## 分类与下一刀

- `current`：`LocalAppDataSource` 的 router field、MCP runtime bridge 读取与真实 stdio
  fixture。
- `compat`：无。
- `deprecated`：无。
- `dead`：无新增 surface。

本 slice 只恢复 shared fixture 的可编译性，不代表 Multi-Agent 产品链完成。下一刀仍是
S4w，且必须等待 `event_store`、`runtime_backend`、`tool-runtime` 热区释放后，以 durable
mailbox 的 deterministic Item-before-ack、`TriggerTurn` 与 activity/wait 为唯一生产消费链。
