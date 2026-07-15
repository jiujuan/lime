# S4l Deferred MCP Visible-DOM Gate B

状态：`completed / runtime-read-model-and-visible-DOM-Gate-B-validated`

## Claim boundary

本切片验证同一次 managed Electron run 中的 current 产品链：

`Electron Host -> preload -> app_server_handle_json_lines -> App Server -> Runtime -> read model -> GUI`

Provider 使用 localhost deterministic fixture；本结果不证明 live provider。生产 GUI 只增加稳定、不可见的
Tool row 身份属性；其余改动只在 tool execution test-only fixture/helper/test。

## Codex-first 纠偏

最初断言要求 GUI 同时显示 `tool_search` 与被选中的 deferred Tool row。该断言不符合 Codex：

- Codex App Server `ThreadItem` 没有 ToolSearch variant。
- Codex `ResponseItem::ToolSearchCall/ToolSearchOutput` 保留在 provider/rollout history；
  `handle_non_tool_response_item` 不把它们投影为 public Turn Item。
- GUI/TUI 应展示真正执行的 dynamic/MCP Tool，而不是内部发现步骤。

因此最终契约是：`tool_search` 必须在 current runtime/read model 中 `completed`，但不进入可见 Tool row；
被选中的 `deferred_echo` 必须以 typed completed Tool row 可见，最终 assistant 文本必须可见。

## 实现

- managed wrapper 在 child runtime smoke 完成后保留同一个 Electron 进程并恢复目标 session。
- 历史 timeline preview 与 inactive process details 的两级展开都等待 React DOM materialization，避免查询过早。
- Tool row 使用 `data-tool-name`、`data-tool-status` 与既有 call ID 做稳定观测，不依赖 locale 文案或列表顺序。
- 结构化 summary 写回 Electron/preload/App Server/read model、typed rows、最终文本、invoke/console error 与截图。
- focused guard 固定 Codex-first 语义：`tool_search` operational + internal，deferred Tool user-visible。

## 最新真实运行

命令：

```bash
npm run smoke:agent-runtime-tool-execution:managed -- \
  --batch mcp-deferred-tool-search-gate-b \
  --output .lime/qc/agent-runtime-tool-execution-mcp-deferred-visible-dom-gate-b.json \
  --timeout-ms 300000
```

独立事实：

- session：`sess_231bc484775c4fbd9b25efe78341c2a6`
- managed bridge：`http://127.0.0.1:56322`
- localhost provider：`http://127.0.0.1:56328`
- runtime assertions：`16/16` pass
- visible-DOM assertions：`12/12` pass
- 首 Turn provider requests：`3`；new-Turn isolation：`1`
- `tool_search`：read model `completed / success=true`，DOM 保持 internal
- `mcp__DeferredToolSearchmrlfvyey21q0__deferred_echo`：read model 与 visible DOM 均 `completed`
- new Turn 未泄漏 deferred tool：pass
- `agentSession/read`：`electron-ipc / success`
- invoke errors：`0`；console errors：`0`
- 最终文本 `AGENT_RUNTIME_DEFERRED_MCP_TOOLSEARCH_DONE`：可见
- screenshot：`.lime/qc/agent-runtime-tool-execution-mcp-deferred-visible-dom-gate-b-visible-dom.png`

截图已人工检查：目标 deferred Tool 行、两轮最终文本与输入框可见，无 UI 重叠或空白画面。

## 验证

- `npx vitest run scripts/agent-runtime/tool-execution-smoke.test.mjs --reporter=dot`：`5/5` pass。
- 三个 claimed 文件 `node --check`：pass。
- 三个 claimed 文件 Prettier：pass。
- claimed `git diff --check`：pass。
- `npm run governance:scripts`：pass，`retiredRoot=0 / retiredDirs=0`。
- managed Electron Gate B：runtime `16/16`、visible DOM `12/12`、总状态 `pass`。

## 独立 residual

只读审计发现两个不属于本 Gate B 的后续 current slice：

- canonical ThreadStore 的 producer ordinal 可能跨 message/tool producer 冲突；schema 对
  `(thread_id, ordinal)` 唯一，普通 apply 失败目前只 warn。应单独收敛为 ThreadStore 统一 ordinal owner。
- Codex conversation import 仍把 `tool_search_call/output` lower 成 public Tool lifecycle；应保留 provider
  transcript fidelity，但停止生成 GUI Thread Item。

这两个 residual 不改变本 run 已证明的 sampling-step/deferred product outcome，必须独立 claim 和回归，
不得用恢复 raw wire、显示内部 ToolSearch 或放宽 canonical store 错误来绕过。

## 治理分类

- `current`：Electron/App Server/runtime/read-model/GUI 产品链、typed deferred Tool row、Codex-first internal search。
- `test-only`：localhost provider、临时 HOME/userData、动态 bridge、`.lime/qc` summary/screenshot。
- `compat / deprecated`：未新增。
- `dead`：未恢复 retired MCP facade、mock fallback 或旧 runtime surface。

路线图关系：S4l sampling-step snapshot 已完成 runtime、read model 与 GUI Gate B；本切片完成度 `100%`。
下一刀回到 canonical ThreadStore ordinal 单 owner及 Codex import internal ToolSearch 收口。
