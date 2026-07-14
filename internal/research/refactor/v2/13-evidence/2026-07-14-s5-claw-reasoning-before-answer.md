# S5 Claw reasoning 先于最终正文证据

> date: 2026-07-14
> slice: S5-claw-reasoning-before-answer
> owner: root
> lime_head: 650d7503363364614ee26921c0df810c0a914bef（dirty working tree）
> codex_head: 5c19155cbd93bfa099016e7487259f61669823ff

## 用户闭环

同一轮中，思考内容必须在最终正文之前出现。思考完成后可以折叠，但不能因为 completion
事件晚于正文 delta 而移动到结果后面。live streaming 与重新进入历史会话必须保持相同顺序。

## 现场根因

初始真实会话：

```text
session: sess_a7dfe9233a7f4cb7b02a9be0410e9208
turn:    48cc2e69-62bd-40b6-a535-536bc84c73c4
events:  reasoning.started=6 -> first message.delta=46 -> reasoning.ended=85
read:    reasoning sequence=85, ordinal=1；没有独立 user/agent Item
DOM:     text#48 -> thinking#85
```

EventLog 本身没有反序。错误发生在两个 current projection 边界：

1. canonical materializer 把 turn 级 `request_id` 作为通用 Item ID。user message、agent message、
   reasoning 共用同一 request 后，在 canonical store 中互相覆盖；最终 reasoning 继承 user
   message 的 ordinal/created time，同时持有 reasoning terminal sequence。
2. Renderer reasoning content sync 使用 `sequence` 做展示顺序。canonical `sequence` 表示 Item
   最新更新事件，`ordinal` 才是稳定创建位置，因此 reasoning 在完成时被移到正文之后。

## Codex 对齐与实现

Codex App Server 的每个 ThreadItem 有稳定独立 identity，生命周期为
`item/started -> deltas -> item/completed`；completion 只更新原 Item，不创建新的时间线位置。

本刀保持两层唯一 owner：

```text
App Server materializer
  -> family-scoped Item identity
  -> canonical sequence（最新更新）+ ordinal（稳定位置）
  -> agentSession/read / canonical notification
  -> Renderer reasoning sync 读取 ordinal
  -> StreamingRenderer interleaved timeline
```

- 非 approval Item 不再读取 `requestId/request_id` 作为 identity；approval 继续以 request identity
  表达用户决策请求。
- `AgentThreadItem` 显式携带可选 `ordinal`；canonical live event reader 保留该字段。
- reasoning 与 tool 的 interleaved display position 优先使用 ordinal；非 canonical/旧数据缺失
  ordinal 时才使用原 sequence。
- 没有修改 CSS、没有强行把 thinking prepend、没有新增 renderer 排序状态机，也没有生产 mock。

## 回归与静态验证

```text
npx vitest run \
  src/components/agent/chat/hooks/agentStreamReasoningContentSync.unit.test.ts \
  src/components/agent/chat/components/StreamingRenderer.webSearch.sequence.test.tsx \
  src/components/agent/chat/hooks/agentStreamRuntimeHandler.test.ts \
  src/lib/api/agentRuntime/appServerCanonicalItemReader.test.ts \
  src/lib/api/agentRuntime/appServerCanonicalItemProjection.test.ts
结果：5 files / 33 tests passed。

npm run typecheck
结果：passed。

npx eslint <changed TS files>
结果：passed。

npm run test:rust:unit -- \
  -p app-server request_id_does_not_collapse_user_agent_and_reasoning_items
结果：1 passed；1076 filtered out。

cargo build --manifest-path lime-rs/Cargo.toml -p app-server --bin app-server
结果：passed。

npm run verify:gui-smoke
结果：passed；Renderer、Host/preload、App Server 1.102.0、Claw shell、memory settings ready。

git diff --check -- <本刀窄写集>
结果：passed。
```

聚合 `npm run smoke:agent-runtime-current-fixture` 已通过 history、stream、首页普通/短问候、
Coding、两种图片、停止继续、四种 approval、rich draft 与三种 queue/hydrate 场景；随后既知
`plan-history-hydrate` 因 `revisionId/revisionSource` 为空失败。计划正文、三步计划和确认面板均已
可见，该失败未经过本刀文件，不覆盖为通过。

## Gate B

最终 live Provider 会话：

```text
Electron CDP: http://127.0.0.1:9223
page:         http://127.0.0.1:1420/?nativeStartup=1
session:      sess_8a7772167ed84335ae7563b8d186a931
turn:         cb6edb6b-e827-4361-986e-99d9fbd20b22
```

- `window.__LIME_ELECTRON__ === true`；preload `electronAPI.invoke` 存在。
- EventLog：`turn.accepted` 的 source 为 `agentSession/turn/start`；reasoning 从 sequence `6`
  开始，正文从 `133` 开始，reasoning 到 `160` 才 terminal，turn 在 `161` completed。
- GUI：assistant renderer signature 为 `thinking#6|text#134`；DOM 第一子项是 reasoning，第二项
  是最终正文；console error `0`，composer 恢复。
- `agentSession/read` 返回 completed session 和两条 user/assistant message；同一 turn 的
  canonical Item 为：

```text
user_message  id=item_user-<turn>       sequence=1   ordinal=1
reasoning     id=item_reasoning-<turn>  sequence=160 ordinal=6   completed
agent_message id=item_agent-<turn>      sequence=156 ordinal=133
```

这份证据覆盖真实 Electron、preload/IPC、`app_server_handle_json_lines`、App Server JSON-RPC、
live provider、RuntimeCore、canonical ThreadItem/read model 与用户可见 DOM，不依赖 fixture backend。

## 剩余 concern

identity 拆开后，canonical user/agent message Item 在 turn completed 后仍为 `in_progress`，说明
runtime 尚未完整发出 Codex 式 `message/item.completed` 生命周期。当前 turn terminal、GUI 输入恢复
和 reasoning 顺序均正确；本刀没有用 turn completed 猜测所有 Item 终态。下一刀应在 runtime
canonical item lifecycle owner 补真实 item completion，并增加 live/hydrate 一致性回归。

## 治理分类

- `current`：App Server canonical materializer、ThreadItem ordinal/sequence、Renderer reasoning sync。
- `compat`：本刀未新增、未依赖。
- `deprecated`：本刀未新增。
- `dead`：把 turn `request_id` 当成所有 Item identity、把 latest sequence 当展示位置的假设已移除。

请求问题完成度：`100%`。Refactor v2 全局仍为 `in_progress`；下一刀回到 canonical message
lifecycle 与既有 plan revision hydrate blocker。
