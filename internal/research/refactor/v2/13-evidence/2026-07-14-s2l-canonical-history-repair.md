# S2l Canonical history 与实时 reasoning 顺序修复

> date: 2026-07-14
> slice: S2l-canonical-history-repair
> owner: root
> lime_head: 650d7503363364614ee26921c0df810c0a914bef（dirty working tree）
> codex_reference: /Users/coso/Documents/dev/rust/codex

## 用户闭环

同一回合必须始终按 canonical Item 首次出现位置展示：思考在最终正文之前。该顺序在 live
streaming、回合终态、切换会话后重新 hydrate 和应用重启恢复时必须一致；列表项必须能点击，
进入后消息与输入框都可用。

## 根因

问题不是 EventLog 反序，而是三个 current projection 边界混用了 mutable completion sequence：

1. 历史 ThreadItem 排序和 content-part metadata 使用 Item 最新更新 `sequence`。Reasoning 在正文
   后才 completed 时，`sequence` 会晚于 AgentMessage；稳定时间线位置实际是 `ordinal`。
2. `StreamingRenderer` 会再次按 content-part metadata 排序。即使历史 Item 已按 ordinal 排好，
   metadata 继续写 completion sequence 仍会把 reasoning 二次移到正文后。
3. live streaming 中，持久化 Reasoning 接管同轮临时 thinking 时，若临时 part 已经落在正文后且
   其它 part 没有 sequence，旧分支只原位替换，保留错误索引。重新进入历史后才恢复正确，因此
   出现“实时反序、重进正确”。

## 实现

- `resolveThreadItemTimelinePosition` 统一采用 `ordinal -> metadata.ordinal -> sequence`。
- 历史 Item 排序、Reasoning/Tool/Text content-part metadata 和 live tool/reasoning sync 共用同一
  timeline position，不再各自解释 sequence。
- 持久化 Reasoning 接管临时 thinking 时先移除旧 part，再按 canonical position 或首个正文边界
  重新插入；删除无 sequence 时原位保留的分叉。
- 没有修改 CSS、没有新增 Renderer 状态机、没有从 `turn.completed` 合成 Message terminal，也
  没有引入 projected fallback 或生产 mock。

## 回归与静态验证

```text
npx vitest run \
  agentStreamReasoningContentSync.unit.test.ts \
  agentChatHistoryThreadItems.test.ts \
  streamingContentPartOrder.unit.test.ts
结果：3 files / 12 tests passed。

npm run typecheck
结果：passed。

npx eslint <S2l TypeScript write set>
git diff --check -- <S2l TypeScript write set>
结果：passed。

cargo test -p app-server projection_repair --lib
结果：8/8 passed。

cargo test -p app-server canonical_thread_store --lib
结果：21/21 passed，包含 Plan revision restart identity。
```

`RUST_MIN_STACK=8388608 npm run test:rust:related -- <S2l Rust paths>` 最终为 `1093/1094`；
唯一失败是 conversation import 的 completed Plan `plan.final` 缺 canonical Item。该失败不经过 S2l
Renderer/history 写集，已交给后续 S2m 独立修复，不能把 S2l related 报成全绿。

## Electron 验证

- `npm run smoke:agent-session-history-electron-fixture`：通过。真实 Electron/preload/IPC、
  `agentSession/start/read/update/list`、归档/恢复、侧栏进入、分页与 reasoning replay 全闭环。
- `npm run verify:gui-smoke -- --reuse-running`：通过。最新 renderer、Electron host/preload、App
  Server `1.102.0`、Claw shell 与 memory settings ready。
- `npm run smoke:agent-runtime-current-fixture`：历史 31、终态 32、Electron guard 64 通过；首页、
  短问候、Coding、图片、停止继续、approval、rich draft、queue/hydrate 和 Plan history 均通过。
  最终独立 Skills Runtime fixture 因 Provider 鉴权失败退出；不覆盖为通过，也不在 S2l 修改
  Skills/provider 热区。

## Gate B

```text
Electron CDP: http://127.0.0.1:9223
page:         http://127.0.0.1:1420/?nativeStartup=1
session:      sess_7827308372264379bfb153eab62b8e53
screenshot:   .lime/refactor-v2/order-178-gate-b-final.png
```

- `window.__LIME_ELECTRON__ === true`，preload `electronAPI.invoke` 存在。
- 侧栏先进入“你好”，再点击 `ORDER-178`，两次点击均成功，消息历史恢复，输入框可用。
- `electron-ipc -> app_server_handle_json_lines -> agentSession/read` 成功。
- canonical read：Reasoning `ordinal=6, sequence=320`；AgentMessage
  `ordinal=314, sequence=316`。
- GUI signature：`thinking#6|text#314`；`StreamingRenderer` 第一子项为 `thinking-block`，第二
  子项为最终正文。第二个 live Provider 回合也保持思考在上、正文在下并恢复输入。

## 治理分类

- `current`：canonical ThreadItem ordinal、history/live reasoning sync、App Server read model、
  Electron IPC 与 GUI projection。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：用 Item completion sequence 作为展示位置、无 sequence 时原位保留
  反序 thinking、Renderer 本地终态合成、生产 mock fallback。

S2l 用户问题完成度：`100%`。Refactor v2 仍为 `in_progress`；下一刀是 S2m conversation import
completed Plan Item lifecycle。
