# S6v Retired Roster Sanitizer Removal

## Fact Source

SubAgent roster 的 current owner 是 canonical thread family 与 AgentGraph。retired session roster
key 必须在 producer contract 中不存在；production reader 不保留读取、解释或删除旧 key 的
compat sanitizer。

## Changes

- 删除 `appServerSessionClient` 与 `sessionClient` 中两套
  `omitLegacyRosterFields`，session detail 直接消费 canonical typed response。
- 删除 App Server session client 的 retired roster 正向 fixture；不再证明旧 payload 可被
  production reader 接受后清洗。
- 将 boundary guard 从“两个 reader 各允许一次删除”反转为 production source 对 retired
  key 和 sanitizer 零引用。
- 保留 S2q 的 missing canonical detail fail-closed、session type owner、Approval lowering 与
  read-model normalization 累计改动，未触碰 Rust app-data fallback。

## Validation

- `appServerSessionClient.test.ts`、`sessionClient.current-boundary.test.ts`、
  `sessionRosterContractBoundary.test.ts`: 28/28 passed。
- `npm run typecheck`: passed。
- exact ESLint、Prettier 与 scoped diff check: passed。
- production reader retired key / sanitizer scan: zero matches。
- `npm run governance:legacy-report`: zero-reference `0`、classification drift `0`、
  boundary violations `0`。

## Classification

- `current`: ThreadStore-backed AgentSession presentation 与 canonical thread/AgentGraph roster。
- `compat`: none。
- `deprecated`: none。
- `dead / deleted / forbidden-to-restore`: retired roster sanitizer、正向 legacy payload fixture
  与允许规则。

## Next Cut

删除 App Server production `read_agent_session -> session_hydration` app-data fallback；read、
thread identity resolution 与 resume hydration 只能走 RuntimeCore + ProjectionStore current owner。
