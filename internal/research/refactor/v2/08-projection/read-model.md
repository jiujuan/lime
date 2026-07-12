# Item Materialization 与 GUI Read Model

> status: target projection contract
> owner: app-server projection + thread-store
> last_verified: 2026-07-12
> codex_reference: `thread_history.rs`, `thread_history_projection.rs`, `item_builders.rs`

## 唯一转换链

```text
provider wire event
  -> model-provider normalized LLMEvent
  -> agent-runtime RuntimeEvent
  -> canonical event log
  -> Item materialization / ThreadHistoryChangeSet
  -> ProjectionStore + ThreadStore read model
  -> typed notification/read response
  -> GUI projection
```

React 不得消费 provider wire event，也不得直接把 RuntimeEvent 映射成 JSX。所有 consumer（消息列表、时间线、工作台、evidence、replay）必须从同一 Item/read model 读取。

## Item 族

以 Codex current `ThreadItem` 为基础，Lime 只增加产品确有需要的 domain item：

| Item | 最小字段 | GUI 投影 |
| --- | --- | --- |
| UserMessage | id、content、client id | 输入气泡 |
| AgentMessage | id、text/content parts、phase | assistant 消息 |
| Reasoning | id、summary/content、visibility | reasoning 区块 |
| ToolCall/Result | id、name、args、status、output、duration | 工具卡片 |
| Approval | id、action、policy、decision、expires | 审批面板 |
| FileChange/Command | id、cwd、status、diff/output | coding workbench |
| Media/Artifact | id、reference、mime、preview、status | 媒体/产物工作台 |
| SubAgentActivity | id、parent/child thread、kind、status | 子 agent 时间线 |
| ContextCompaction | id、window、summary/reference | 上下文状态 |

每个 Item 需要稳定 `item_id`、`turn_id`、`sequence/ordinal`、生命周期状态；GUI 专属 display copy 不进入 canonical Item。

## Change set 与幂等

参考 Codex `ThreadHistoryChangeSet`：materializer 按 `(turn_id,item_id)` 合并增量，支持：

- create/update/remove item。
- turn status update。
- rollback 删除后续 item。
- duplicate event 幂等。
- stale sequence 丢弃并记录 diagnostic。

ProjectionStore 的 `apply_events` 必须是事务性的：事件日志成功追加后，read model 才能提交；部分失败要可 repair，不能产生“通知已显示但历史不存在”的状态。

## 存储分工

| 存储 | 事实 | 不能承担 |
| --- | --- | --- |
| canonical event log | 事件顺序、幂等键、trace 关联 | GUI 查询优化 |
| ThreadStore | Thread/Turn/Item 可恢复历史、分页、metadata | provider wire body |
| ProjectionStore | GUI/read model、索引、repair 状态 | 作为唯一 runtime command queue |
| Sidecar/artifact store | 大文本、媒体、diff、二进制引用 | 直接注入模型上下文 |
| Evidence/export | 脱敏审计、replay bundle、分析 | 反向驱动生产状态 |

## 分页与 ordinal

借鉴 Codex 当前 paginated history/ordinal：

- 使用稳定 cursor/ordinal，不使用数组 index。
- `thread/read` 与 `turn/items/list` 明确 `has_more`、cursor 和边界排序。
- 新事件追加后，旧页不因 GUI 排序改变 ID。
- 断裂 JSONL 或未终止记录先 repair，再生成 read model；repair 结果可审计。

## ContentPart 与引用

Provider-neutral ContentPart 可表达 text/media/tool/reasoning；Lime 的 `artifact/reference` 只保存 URI、mime、尺寸、摘要和权限信息。媒体正文和高容量工具输出进入 sidecar，模型和 GUI 按需读取 bounded preview。

禁止：

- 在 Item 中嵌入无上限 base64。
- 为 media、tool、artifact 各建一份独立历史 transcript。
- 在组件里从 markdown/文本猜 Item kind。

## GUI selector 契约

GUI projection 只做纯函数：

```text
read model + notification delta + local display state
  -> visible items / timeline groups / workbench sections
```

允许保存：输入草稿、展开状态、选中项、滚动位置、窗口布局。禁止保存：Turn terminal truth、tool result truth、Thread history 或 approval decision truth。

## 最小验证

- Rust materializer：create/update/remove/rollback/duplicate/stale。
- ThreadStore：分页、ordinal、resume、repair、fork。
- TS projection：消息、工具、媒体、子 agent、终态和 stale event。
- 真实 GUI：Gate A 验证 projection，Gate B 验证 Electron -> App Server -> read model -> GUI。
