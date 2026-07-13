# S5 Canonical Terminal GUI Evidence

日期：2026-07-12

S5 让 GUI nested Turn lifecycle 只消费 `canonicalEvent.method=turn/updated`，raw `payload.turn` 不再覆盖 canonical identity/status/timestamp/error；缺 canonical、method/status 不符和 session/thread/turn identity 冲突均 fail-closed。`interrupted` 显式 lower 为 GUI `canceled`，provider raw diagnostics 只走 side-channel。session read 不再让 legacy `detail.turns` 覆盖 canonical `response.turns`，canonical Approval Item 已进入 history projection。

验证：

- focused Vitest：90 tests 通过。
- 定向 ESLint：通过。
- TypeScript typecheck：通过。
- `npm run test:contracts`：通过。
- `npm run smoke:claw-chat-current-fixture -- --scenario home-hotpath`：真实 Electron Gate B 通过，session `claw-chat-current-1783884371452-33540`。

治理分类：canonical Turn/Approval projection 为 `current`；provider diagnostics 为显式 side-channel；legacy `detail.turns` overwrite 为 `dead` 并已退出恢复路径；`agentSession/event` envelope 仍是迁移期 `compat`，由 S6 后续删除。

