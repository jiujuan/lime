# Agent Tools 批次最终 Audit

## 结论

Batch 01-15 的工具族覆盖已收口到当前事实源；剩余不再按批次继续拆分。真实 GUI 证据已补到“可打开历史 runtime fixture、过程摘要不丢、控制台无 error / warning”的最低门槛。

## 本轮 GUI / Playwright 证据

- DevBridge：`http://127.0.0.1:3030/health` 返回 `{"service":"DevBridge","status":"ok","version":"1.0.0"}`。
- 前端入口：`http://127.0.0.1:1420/` 返回 `200 OK`。
- Playwright 页面：`http://127.0.0.1:1420/`，标题 `Lime`。
- 打开历史会话：`Code runtime fixture 2026-06-03T11:56:18.641Z`。
- 页面可见证据：用户消息可见；assistant 消息展示 `已完成 3 个步骤`、`已完成`、耗时和 token 用量，说明历史过程摘要没有被最终正文覆盖或挪走。
- 控制台：全量 error `0`，warning `0`。
- 截图：Playwright MCP 输出 `lime-batch15-final-audit-runtime-fixture.png`。
- 动态 MCP 尾项：`mcp__docs__read_page / mcp__docs__list_pages / mcp__linear__query_issues` 已用单测证明不会因为 `page` 误判成 browser，也不会让探索批次折叠退回 null。

## 本轮命令证据

- `npm test -- "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamToolEventController.test.ts"`
- `npm test -- "src/i18n/__tests__/loadNamespace.test.ts"`
- `npm test -- "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/protocolResidue.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts"`
- `npm run smoke:agent-runtime-tool-surface`
- `npm test -- "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts"`
- `npx eslint "src/components/agent/chat/hooks/agentStreamCompletionController.ts" "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" --max-warnings 0`
- `npx prettier --check` 覆盖本轮代码、i18n 资源和批次文档。

## 剩余风险

- 本地 GUI 没有真实调用 provider 503；该路径由单元测试锁住，不在 Final Audit 里主动打真实模型或制造外部服务失败。
- 浏览器模式仍会对更新检查相关命令走 mock；本轮控制台无 error / warning，且该 mock 不影响 Agent runtime 主链。
