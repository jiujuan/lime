# S4r6g MCP Elicitation Form Semantics

## 事实源

MCP server elicitation 在 Renderer 中只能消费 typed `requestedSchema`，并通过主窗口根部的
唯一 controller 等待 App Server reverse JSON-RPC response。它不读取 raw MCP request id、私有
token、session id 或 `parentToolCallId`，也不复用 Approval 或 ask-user UI。

## 已收口语义

- optional boolean 在用户编辑前保持字段缺失；required boolean 才初始化为 `false`。
- primitive schema default 会作为未编辑表单的 typed content 保留；date-time default 在本地输入框
  展示后仍以 RFC3339 提交。
- string 的 email、URI、date 与 RFC3339 date-time，以及 number/integer、enum、长度和范围，均在
  前端先行校验；Rust final validator 继续是跨边界的最终拒绝点。
- `required` 引用未声明 property 时在显示前 fail closed，不渲染半有效表单。
- `serverRequest/resolved` 的 `AbortSignal` 可撤销队首或非队首 pending 表单，后续 settle 不会重开
  或误答另一请求。

## GUI 语义

该界面是主窗口的待确认模态表单：主对象是一次服务器信息请求，唯一主操作是提交，拒绝和关闭分别
表达 decline/cancel。表面复用 Lime 的实体对话框、边框、清晰字段层级与深色主按钮，不新增装饰性
背景或第二个进度面板。五种 locale 均有稳定文案回归。

## 验证

- `npm test -- src/lib/api/mcpServerElicitation.unit.test.ts src/components/agent/chat/components/McpServerElicitationDialog.test.tsx`：2 files、16 tests 通过。
- `npx eslint`（controller/dialog 四个受控 TS/TSX 文件）：通过。
- `npx prettier --check`（受控文件）：通过。
- `npm run typecheck`：通过。
- `npm run i18n:check:json`：五语言、零缺失、零额外 key。
- scoped `git diff --check`：通过。

## 分类与后续

- `current`：typed schema 到全局 MCP form 的 Renderer 表现与本地校验。
- `compat`：无。
- `deprecated`：无。
- `dead`：Approval/ask-user 复用、raw MCP identity 展示、页面级 modal 挂载与生产 mock fallback。

本 slice 没有单独执行 Electron Gate B。真实 `tool call -> elicitation -> form -> response -> provider
final text` 闭环归 S4r8 及其 product loop evidence，不能用本地组件回归替代。
