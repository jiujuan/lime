# @limecloud/agent-ui-contracts

`@limecloud/agent-ui-contracts` 是 Lime Agent UI / Runtime 共享的类型契约事实源。它只导出 TypeScript 类型，不包含投影逻辑、React 组件、JSON-RPC client 或 Electron bridge。

## Boundary

这个包负责：

- runtime execution event 最小公共形状。
- 跨宿主 Agent UI adapter event 最小公共形状。
- action、read model、message parts、process timeline、execution graph 和 projection state 类型。
- `AgentUiProjector` 等纯接口定义。

这个包不负责：

- 将 runtime events 投影成 UI state。
- 渲染 React UI。
- 发起或订阅 JSON-RPC。
- 管理 session store 或业务对象。

## Package Roles

```text
@limecloud/agent-runtime-client
  -> App Server current runtime facade
@limecloud/agent-ui-contracts
  -> shared event and UI projection contracts
@limecloud/agent-runtime-projection
  -> pure event-to-state projection
@limecloud/agent-runtime-ui
  -> React primitives for the projection state
```

## Source Layout

实现必须按职责拆分，`src/index.ts` 只能做 type-only barrel exports：

```text
src/events.ts     -> Agent UI adapter event taxonomy
src/runtime.ts    -> runtime execution event / read model / action contracts
src/projection.ts -> AgentUiProjectionState / projector contracts
src/messages.ts   -> UI message part contracts
src/timeline.ts   -> process timeline contracts
src/graph.ts      -> execution graph contracts
src/index.ts      -> barrel exports only
```

新增类型必须落在对应职责文件；不得把事件、runtime、projection、message、timeline 和 graph 类型重新合并回 `src/index.ts`。

`AgentRuntimeEventProjection.action` 保留兼容单按钮读取，`AgentRuntimeEventProjection.actions` 是标准多 action controls 表达，用于 approve / reject / answer / retry / stop 等宿主 intent。

## Development

```bash
npm --prefix packages/agent-ui-contracts run test
```
