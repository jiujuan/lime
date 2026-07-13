# S4h live tool args closeout

> status: completed / coordinator-validated
> verified_at: 2026-07-13
> owner: refactor-v2-coordinator

## 收口结果

- production `item.started.payload.arguments` 是 live Tool arguments 唯一事实源。
- EventStore 拒绝 retired raw `tool.started/tool.args/tool.result/tool.failed`，仅显式
  conversation import compat 可接受旧 wire。
- sequence verifier 使用 canonical Tool Item call identity，拒绝无 start 的 completed、
  duplicate start 和 Turn terminal 时未关闭的 Tool。
- approval terminal test backend 只发 `item.started/item.completed`，取消结果以
  canonical failed Tool Item 表达，不再恢复 raw `tool.failed` fixture。

## 验证

```text
runtime::tool_lifecycle::tests::                         13/13 PASS
runtime_backend::tool_events::tests::                    13/13 PASS
runtime::tests::external_events::canonical_tool_items::   4/4 PASS
agent_ui_sequence_verifier::tests::rejects_               6/6 PASS
approval_cancel_skips_backend_cancel_when_action_response_already_terminal
                                                           1/1 PASS
cargo fmt --package app-server -- --check                 PASS
node scripts/check-app-server-client-contract.mjs          289 checks PASS
git diff --check (exact coordinator write set)             PASS
```

首次宽过滤 `cargo test -p app-server tool --lib` 还匹配到无关 MCP
local-data-source 测试并触发其既有 stack overflow，因此最终证据使用列举后的精确
module/test filters。链接时本机 sherpa native library 需要通过绝对
`LIBRARY_PATH`/`DYLD_LIBRARY_PATH` 提供；该环境设置未写入产品配置。

## 治理分类

- `current`：canonical Tool Item lifecycle。
- `compat`：conversation import 显式旧 tool wire，仅限导入边界。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：live raw tool lifecycle 与额外 `tool.args` synthesis。
