# S7c App Server Runtime Guard Currentization Evidence

## 结论

`appServerRuntimeBoundary` 已从历史 Agent adapter 事实校正到 current App Server / lime-agent /
agent-runtime / tool-runtime owner。守卫没有增加 legacy whitelist，也没有放宽 `runtime_backend.rs`
的 `480` 行门槛；focused guard `25/25`、App Server client contract `288 checks` 和 legacy
report `0/0/0` 均通过。

## 分类

- `current`：App Server 只通过 `agent_runtime_registry.rs` 直接调用
  `lime_agent::initialize_agent_runtime`；主 turn streaming owner 是
  `stream_current_provider_turn`；session config 由 `lime-agent/session_configuration.rs` 直接
  re-export `agent-runtime` current 类型与 builder；workspace patch 批执行留在
  `workspace_patch_host.rs` 的 `RuntimeTool::execute_call`；shell permission / execution decision
  归 `tool-runtime`。
- `current`：`image_command/events.rs`、`runtime/value_fields.rs` 和
  `runtime_backend/execution_backend.rs` 已登记为现役拆分 owner，主文件体量与职责回流守卫继续
  生效。
- `compat / deprecated`：本切片没有保留或新增 surface。
- `dead / forbidden-to-restore`：`session_config_adapter.rs`、
  `workspace_patch_runtime_adapter.rs`、`agent_tools/tool_orchestrator.rs`。守卫改为断言文件不得
  恢复，而不是为测试重建 adapter。

## 变更事实

- `productionSource` 新增 `*_tests.rs` 排除规则，test-only 源码不再被生产耦合扫描误报。
- runtime 初始化扫描从模糊的 `initialize_agent_runtime(` 收紧为
  `lime_agent::initialize_agent_runtime(`，只允许 registry current owner。
- Agent execution snippets 对齐 `stream_current_provider_turn`、
  `run_agent_turn_with_policy` 与 current provider configuration 入口。
- session configuration、workspace patch 与 shell execution 断言改为验证现役 owner，并为三个
  已删除 adapter 增加负向回流守卫。
- `app-server-agent-runtime-boundary-governance.md` 同步 current streaming、session config、
  workspace patch 与 tool-runtime ownership；没有修改 Rust 生产行为。

## 验证

```text
./node_modules/.bin/vitest run \
  src/lib/governance/appServerRuntimeBoundary.test.ts --reporter=dot
=> 1 file passed; 25 passed; 0 failed

node scripts/check-app-server-client-contract.mjs
=> ok (288 checks)

npm run governance:legacy-report
=> zero-reference candidates: 0
=> classification drift candidates: 0
=> boundary violations: 0

git diff --check -- <S7c/S7d/S7f claimed implementation files>
=> passed
```

## 阻塞与未验证

- 本切片是治理 guard / roadmap currentization，不改变 Renderer、Electron、JSON-RPC 或 GUI
  行为，因此未运行 GUI smoke 或 Gate B；这些结果不能被解读为 GUI 可交付证据。
- 未运行聚合 `npm run test:contracts` 或全量 Vitest；本轮只执行贴边的 App Server client
  contract 与 focused guard。当前没有 S7c 局部阻塞。

## 下一刀

后续 owner 拆分必须继续登记到同一 guard，并保持 `480` 行阈值和 dead adapter 负向断言；不要
用扩大允许集合消除真实越界。S7c 完成后应回到 S2l canonical message/history Gate B 主链，
而不是继续扩张治理规则。
