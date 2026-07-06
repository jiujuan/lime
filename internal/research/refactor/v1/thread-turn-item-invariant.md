# Thread / Turn / Item Invariant

> 状态：P1 current invariant
> 更新时间：2026-07-05
> 目标：把 Codex 第一原语变成 Lime Agent 改动的前置检查，而不是停留在命名或架构说明。

## 1. 结论

Lime Agent 主链必须满足：

```text
Thread 管历史，Turn 管执行，Item 管投影。
```

任何 Agent 协议、runtime、projection、Evidence、Replay、Telemetry、GUI 改动，进入主链前都必须回答：

```text
它属于哪个 Thread？
它发生在哪个 Turn？
它应该落成哪个 Item？
```

答不清这三点，就不能进入 Agent 主链。

## 2. 事实源

| 层 | Codex 事实 | Lime current 事实 |
| --- | --- | --- |
| Thread | `Thread` 含 `id / session_id / forked_from_id / parent_thread_id / status / cwd / turns` | `agentSession/*`、`thread_id`、`SessionDetail`、ProjectionStore、Evidence/export |
| Turn | `Turn` 含 `id / items / items_view / status / error / started_at / completed_at` | `agentSession/turn/start`、`turn_id`、`turn_execution.rs`、active stream、queued turns |
| Item | Codex `ThreadItem` 有稳定 `id()`，覆盖 message、reasoning、tool、file、web、image、context compaction | `AgentEvent`、typed `item/*` notification、`thread_item_projection`、`tool_item_projection`、read model `items` |
| ReadModel | Codex thread read / history materialize turns 和 items | Lime `runtime_session_read_detail_with_options` 输出 `turns / items / queued_turns / thread_read` |
| Projection | Codex event mapping 先 materialize，再给 UI | Lime `ProjectionStore.apply_events / read_session_projection` 是 read side owner |

opencode 不参与本 invariant。opencode 只在 `ContentPart / ModelCapability / LLMEvent / provider lowering` 层提供多模型、多模态能力表达。

## 3. Current Owner

| 语义 | Current owner | 说明 |
| --- | --- | --- |
| Thread identity | `agentSession/start`、`session_id`、`thread_id`、ProjectionStore | `agentSession/*` 是现有协议名；新设计使用 `Thread` 语义 |
| Turn lifecycle | `agentSession/turn/start`、`AgentSessionTurnStartParams`、`turn_execution.rs` | Turn 终态只认结构化事件 |
| Item lifecycle | typed `item/agentMessage/delta`、`item/started`、`item/completed` | Item 必须有 `itemId`，不能靠组件临时 shape |
| Read model | `read_model.rs`、`thread_item_projection.rs`、`tool_item_projection.rs`、`file_checkpoint_projection.rs` | GUI、Evidence、Replay 读取这里 |
| Projection store | `ProjectionStore` | 写入、修复、读取 projection 的事实源 |
| GUI projection | MessageList / Timeline / Workbench selectors | 只消费 projection，不承接 runtime truth |

## 4. Invariant Rules

### 4.1 Thread

必须满足：

1. 所有 Agent event、notification、read model、Evidence 记录都能追溯到 `sessionId` 或 `threadId`。
2. `Thread` 不是前端 chat id；它承载 history、resume、fork、sub-agent tree 和 export。
3. 多 Agent、realtime、media、plugin worker 也必须落回 Thread，不允许各自开 transcript store。

禁止：

- 用 React state 当 Thread truth。
- 用 Codex rollout 直接替代 Lime read model。
- 为新能力新增 `agentSession` 风格域名而不说明兼容原因。

### 4.2 Turn

必须满足：

1. 一次用户输入、steer、interrupt、cancel、resume、plugin task execution 都要明确 `turnId`。
2. `turn.completed / failed / interrupted` 必须来自结构化 runtime event。
3. active stream 清理必须绑定 `sessionId/threadId + turnId`，不能误停新 Turn。
4. queued turn 必须进入 read model 或明确说明为何不进入。

禁止：

- 用 UI `loading` boolean 代表 Turn。
- 用 timeout 合成 Turn 终态。
- 用正文文案判断 completed / failed。
- 让 stale terminal event 影响后续 Turn。

### 4.3 Item

必须满足：

1. 面向 UI 的语义单元必须 materialize 成 Item，再进入 projection。
2. message delta、reasoning、tool、file checkpoint、warning、error、media、artifact 都要能说明 `itemId` 或明确属于 Thread/Turn 级事件。
3. Item projection 是 MessageList、Timeline、Workbench、Evidence 的共同输入。

禁止：

- 让 provider wire event 直通 GUI。
- 在组件内部临时猜 item type。
- 把 `TimelineItem` 当 runtime truth。
- 让 tool、media、artifact 绕过 read model 单独成历史。

## 5. 进入主链前置检查

新增或修改 Agent 能力时，必须在计划、PRD 或实现说明中填这张表：

| 检查项 | 必填答案 |
| --- | --- |
| Thread | 属于哪个 `threadId` / `sessionId`？是否影响 fork、resume、export？ |
| Turn | 属于哪个 `turnId`？是否有 start / terminal / cancel / queue 语义？ |
| Item | 会 materialize 成什么 Item？`itemId` 从哪里来？ |
| Event | provider/core event 如何转成 RuntimeEvent？ |
| Projection | 如何进入 read model / ProjectionStore？ |
| GUI | 哪个 selector / ViewModel 消费 projection？ |
| Evidence | export / replay / telemetry 如何关联 Thread / Turn / Item？ |
| Protocol | 是否需要 method registry / serialization scope？ |
| Boundary | 是否触碰 Electron Desktop Host / App Server / API gateway？ |
| Dead path | 是否会恢复 `agent_runtime_*`、`lime-rs/src/**` 或生产 mock fallback？ |

## 6. Current / Compat / Dead

| 分类 | 允许 |
| --- | --- |
| `current` | `lime-rs/crates/**`、App Server JSON-RPC、RuntimeCore / agent、ProjectionStore、read model、`src/lib/api/*`、GUI projection |
| `current legacy-name` | `agentSession/*` 现有 v0 protocol namespace |
| `compat / controlled residual` | `src/lib/api/agentRuntime.ts` thin barrel、Aster controlled adapter、DevBridge legacy policy |
| `test-only / retired guard` | `agent_runtime_*` 负向测试、contract guard、fixture |
| `dead / forbidden-to-restore` | `lime-rs/src/**`、旧 Tauri command wrapper、旧 `agent_runtime_*` production surface、生产 mock fallback |

## 7. 验证入口

| 改动类型 | 最小验证 |
| --- | --- |
| 仅本文档 / research 文档 | 未完成标记扫描；行尾空格检查 |
| App Server protocol / gateway | `npm run test:contracts` |
| Runtime / projection | Rust related tests；projection 定向测试 |
| Agent current fixture | `npm run smoke:agent-runtime-current-fixture` |
| GUI 主路径 | 定向 Vitest；必要时 `npm run verify:gui-smoke` |
| Evidence / replay / telemetry | export/replay 定向测试 |

文档检查只能证明 invariant 已写入；工程完成必须由对应代码测试证明。

## 8. 后续任务模板

```markdown
### <主题>

- Thread：<threadId/sessionId owner，是否影响 resume/fork/export>
- Turn：<turnId owner，start/terminal/cancel/queue 语义>
- Item：<itemId 来源，Item 类型，projection owner>
- Event chain：<provider wire -> LLMEvent -> RuntimeEvent -> Item>
- Read model：<ProjectionStore/read_model 落点>
- GUI projection：<selector/ViewModel/组件消费边界>
- Evidence / Replay / Telemetry：<关联方式>
- Protocol / scope：<method registry 和 serialization scope>
- Boundary：<App Server / Electron Desktop Host / API gateway>
- Forbidden path check：<agent_runtime_* / lime-rs/src / mock fallback 是否未回流>
- Verification：<实际命令和结果>
```

## 9. P1-1 退出条件

P1-1 视为完成需要同时满足：

1. [naming-alignment.md](./naming-alignment.md) 已定义短命名。
2. 本文档定义 invariant、前置检查和任务模板。
3. README、PRD、架构、模块计划、优先级计划引用本文档。
4. P1 下一刀切到 method definition registry / serialization scope。

完成 P1-1 不代表工程主线完成；它只是封住后续实现的第一原语入口。
