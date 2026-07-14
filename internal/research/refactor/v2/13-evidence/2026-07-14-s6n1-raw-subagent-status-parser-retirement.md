# S6n1 raw SubAgent status parser retirement evidence

## 结论

`subagent_status_changed` 已从 Renderer 生产语义入口迁出：

- `parseAgentEvent` 对该旧事件返回 `null`。
- `buildAgentUiProjectionEvents` 即使被测试直接传入旧事件，也返回空投影。
- canonical `item_started / item_updated / item_completed -> subagent_activity` 投影和 `runtime_status -> team.changed` 保持 current。

本切片不物理删除文件；旧 TS type、独立 helper 和 package helper 留给后续有明确删除窗口的切片统一收掉。

## 事实证据

- Rust、Electron、App Server typed protocol/schema 对 `subagent_status_changed`、`agent_subagent_status:*`、`agent_subagent_stream:*` 均无 producer。
- App Server 历史 EventLog 使用通用 `AgentEvent { event_type, payload }` 读取旧 JSONL，不依赖 Renderer 专用 parser/type。
- current SubAgent GUI 链是 canonical SubAgent Item notification -> canonical item reader -> thread item projection；roster/status 是 `thread/list` child lifecycle。

## 验证

- 精确 retired parser/dispatcher guard：2/2。
- `agentUiEventProjection.test.ts` 完整：22/22。
- `npm run typecheck`：通过。
- claimed write set `git diff --check`：通过。
- `agentProtocol.test.ts` 完整：27/28；唯一失败是既有 `action_required.request_id` fixture 漂移（期望 `req-action-1`，实现返回 `claw_request_turn_1`），与本切片无关；本切片精确用例通过。

## 分类

- `current`：canonical Thread/Turn/Item、SubAgent Item projection、child Thread lifecycle、generic EventLog/hydration、runtime status projection。
- `dead`：raw `subagent_status_changed` Renderer parser 和 dispatcher 分支。
- `deprecated / pending deletion`：raw TS type、独立 projector/package helper、fixture/i18n 正向断言。
