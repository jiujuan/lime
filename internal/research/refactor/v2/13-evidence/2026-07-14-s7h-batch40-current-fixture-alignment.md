# S7h Batch 40 Current Fixture Alignment Evidence

## 结论

Smart Vitest batch 40 暴露的是测试仍在描述已退役事件语义，不是 production owner 缺失。
S7h 只校正 current fixture：Approval 只使用 canonical `request_id`；缺少 canonical Item lifecycle 的
raw message/turn 不得进入 listener；raw `tool_completed` 不得再合成 legacy `tool_start/tool_end`
fan-out。生产 parser、event gateway、projection 和 App Server 均未由本切片修改。

## 实际补丁

- `src/lib/api/agentProtocol.test.ts`：移除同一 Approval 同时携带 `request_id` 与 `actionId` 的双身份
  fixture，required/resolved 两端都只保留 canonical `request_id`。
- `src/lib/api/agentRuntimeEvents.test.ts`：把 raw `text_delta + turn_completed` 的正向投递断言改为
  fail-closed；没有 canonical Item lifecycle 时 listener 必须保持零调用。
- `src/lib/api/agentRuntimeEvents.test.ts`：把 raw `tool_completed` 合成两条 legacy tool event 的正向
  断言改为 fail-closed；listener 必须保持零调用。
- 两份测试文件中的其他并行 diff 不归 S7h；本 evidence 不把它们计入本切片变更。

## 分类

- `current`：Approval 的 canonical `request_id`；App Server canonical Item lifecycle；
  `projectAgentRuntimeSequenceGatePayloads(..., "fail-closed", ...)` 事件门禁。
- `test-only`：本切片修改的协议与 runtime event fixtures。
- `dead / forbidden-to-restore`：Approval 双 ID / `actionId` 优先级、无 Item lifecycle 的 raw
  message/turn 直投、raw `tool_completed` 的 legacy fan-out。
- `compat / deprecated`：本切片没有新增或保留项。

## 验证

```text
npm exec vitest run \
  src/lib/api/agentProtocol.test.ts \
  src/lib/api/agentRuntimeEvents.test.ts
=> 2 files / 34 tests passed

npm exec vitest run \
  src/components/agent/chat/projection/agentUiEventProjection.test.ts \
  src/lib/api/agentRuntime/eventSequenceGate.test.ts \
  src/lib/api/agentRuntime/canonicalApprovalItemProjection.test.ts \
  src/components/agent/chat/projection/actionProjection.test.ts \
  src/components/agent/chat/projection/toolEventProjection.test.ts
=> 5 files / 52 tests passed
```

第二组是 closeout 时对当前共享工作树的扩展复验；测试集已大于实施时记录的 `38/38`，因此以本次
实际输出 `52/52` 为准。本切片未恢复 raw event adapter、tool fan-out 或 Approval compat 身份。
