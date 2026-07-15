# S7ab Rust Test Worker Stack Runner

## 结论

统一 Rust layer runner 现在只在 macOS 且调用者未设置 `RUST_MIN_STACK` 时，为 Cargo
test worker 注入仓库既有口径 `8388608`。调用者的非空显式值始终优先，Linux 等其它平台
保持原环境不变。

这解除的是 `test:rust:*` 与 `verify:local` 的平台性假阻断，不修改 MCP、App Server
fixture、Cargo scope 或测试筛选。`RUST_MIN_STACK` 未设置时，默认 npm runner 已让原始 MCP
stdio 精确用例 `1/1` 通过，不再 SIGABRT。

## 根因边界

只读调查证明 direct Cargo 默认栈仍会失败：2.5 MiB 仍溢出，3 MiB 与 8 MiB 通过。
根因是 `RequestProcessor::handle_request_inner` 的大型未 boxing async dispatcher future，
不是 MCP 递归或 stdio fixture。后续结构根治应由独立 Rust owner 在 dispatcher 边界 boxing
future；本 slice 不用测试 fixture 掩盖 production future 膨胀。

## 分类

- `current`：统一 Rust layer runner 的 macOS test-worker 环境默认值。
- `test-only`：helper 单测与 MCP 精确回归命令。
- `compat / deprecated / dead`：无新增 surface。
- 结构债务：direct Cargo 默认 worker 栈仍受未 boxing dispatcher future 影响，需独立 Rust claim。

## 验证

- `run-rust-layer.unit.test.mjs`：`16/16`。
- 当前 shell `RUST_MIN_STACK=<unset>`；默认 npm runner MCP stdio 精确用例：`1/1`。
- `governance:scripts`：通过；claimed files Prettier 与 diff check：通过。
- `test:rust:changed -- --changed=origin/main`：`agent-runtime 116/116`；`app-server
1104/1111`，没有 stack overflow。
- changed Rust 的 7 个失败均归共享 canonical message/reasoning lifecycle owner：conversation
  import、mailbox delivery 两项、terminal activity、reasoning read model 两项、commentary/final
  message lifecycle；本 slice 未触碰对应 Rust 文件。
- `verify:local` 已通过版本、i18n、lint、typecheck 和前端前 59 批，随后被 stale
  clientFactory session fixture 提前阻断；该独立 `S7ac` 已修复，resume 后前端 `110/110`
  全部通过。
- `verify:gui-smoke`：真实 Electron renderer/host/App Server sidecar 与 Claw workbench smoke
  通过。

`verify:local` 未以单次命令返回 0，剩余阻塞是上述外部 lifecycle 7 failures；runner 原始
stack overflow blocker 已解除。
