# S4aj followup target route

日期：2026-07-15

## 结论

warm `followup_task` 现在使用目标 child session 最近一个 Turn 的 effective `RuntimeOptions` snapshot，不再用发送者当前 route 覆盖目标 route。目标尚未加载或没有可用 snapshot 时，继续使用 caller effective options 作为明确的 cold/resume fallback；`spawn_agent` 的 parent effective snapshot 继承保持不变。

实现只在既有 AgentControl gateway 内选择 TriggerTurn options：按目标 session 的 Turn 顺序反向读取唯一 `StoredSession.turn_runtime_options` map，复用既有 child sanitizer 清除 event、queue 和 output-contract 字段。没有新增持久化表、metadata parser、协议、第二 request context 或 mock fallback。

## Codex 对照

- Codex 对已加载 target 的 followup 只投递 `InterAgentCommunication(trigger_turn=true)`，保持 target 自身 live config。
- 只有 target 未加载、需要 resume 时，才从 caller Turn materialize resume config。
- Lime 对应收敛为 warm target snapshot 优先、caller effective snapshot 仅 cold fallback。

## 验证

- `RUST_MIN_STACK=8388608 npm run test:rust:unit -- -p app-server warm_followup_keeps_the_target_effective_route`：1/1 通过。
- `RUST_MIN_STACK=8388608 npm run test:rust:unit -- -p app-server agent_control`：15/15 通过，覆盖 spawn、followup、interrupt、wait 与 restart/cold target。
- `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server --lib`：通过。
- claimed files `rustfmt --edition 2021 --check`：通过。
- claimed write set `git diff --check`：通过。
- S4ah 在本切片 Rust 修改后生成的真实 Electron visible-DOM Gate B：`status=pass`、28/28 assertions，六个 AgentControl Tool row completed/visible，Started/Interacted/Interrupted 可见，`agentSession/read=electron-ipc`，console/invoke error 0。

## 分类

- `current`：warm target effective options、cold caller effective fallback、durable mailbox TriggerTurn。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：warm followup 无条件套用 sender route、为此新增 session metadata/profile 二次解析或第二 route map。

架构影响：非重大。只修正既有 RuntimeCore AgentControl gateway 内的 options 选择优先级；App Server、RuntimeBackend、tool-runtime、ThreadStore 与 GUI owner 不变。
