# Batch 15：Runtime Empty Final / Error Recovery

## 功能目标

覆盖工具执行结束后的运行时完成态分流：

- 空 `final_done` 且没有真实产物信号时，落失败态并提示重试。
- 工具结果或 artifact 已形成真实产物时，空最终答复可软完成，过程与产物保留在当前消息里。
- provider stream 失败，例如 503 / Service Unavailable，即使前面已有工具过程，也必须落失败态，不被误判为“空 final 软完成”。
- 空 final 相关用户可见文案接入 `agent` namespace，并覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。

## 本轮实现

- `agentStreamCompletionController` 将空 final error/fallback 文案接入 i18n，同时保留中文 fallback。
- `agentStreamRuntimeHandler.unit.test` 新增 provider stream 503 失败回归，证明工具过程卡保留、runtime status 失败、toast 使用 provider unavailable 文案。
- `agentStreamCompletionController.test` 新增五语言资源覆盖断言。

## 验证

- `npm test -- "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamToolEventController.test.ts"`
- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts"`
- `npm test -- "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts"`
- `npx eslint "src/components/agent/chat/hooks/agentStreamCompletionController.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" --max-warnings 0`
- `npx prettier --check "src/components/agent/chat/hooks/agentStreamCompletionController.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/i18n/resources/zh-CN/agent.json" "src/i18n/resources/zh-TW/agent.json" "src/i18n/resources/en-US/agent.json" "src/i18n/resources/ja-JP/agent.json" "src/i18n/resources/ko-KR/agent.json"`

## 剩余缺口

真实 provider 503 不应在本地 GUI 续测中复现；本批次使用 deterministic runtime handler 单测覆盖 provider stream 失败分流。GUI 侧由最终 Audit 证明历史 runtime fixture 可打开、过程摘要不丢、控制台无 error / warning。
