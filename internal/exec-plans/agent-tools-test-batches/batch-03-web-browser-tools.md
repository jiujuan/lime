# Batch 03: Web 与 Browser / MCP 浏览器工具测试计划

## 独立背景

本批次覆盖联网搜索、网页抓取、浏览器自动化和 MCP browser/playwright/chrome 类工具。用户当前最关注的是国际新闻整理场景：模型确实调用了搜索工具，但 UI 把最终正文和搜索过程显示错序，且来源引用位置、字体和细节需要对齐 Codex app。

上一轮已经修复 `web_search` 流式 overlay / completion reconcile 的代表错序，并用历史“国际新闻简报”会话验证 DOM 顺序为：前置说明 -> `已搜索网页 6 次` -> `今日国际新闻简报`。本批次要把这个验证扩展到 WebFetch、浏览器 MCP、失败/空结果、来源引用和动态工具名。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定搜索过程、来源引用、浏览器 MCP timeline、hover 操作或历史恢复口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 本批次必须特别记录搜索来源 title / host / URL 的位置、字号和悬停行为，因为这是用户重点要求复刻的路径。

## 覆盖工具

native：

- `WebSearch`
- `WebFetch`

兼容 alias：

- `web_search`
- `web_fetch`
- `WebSearchTool`
- `WebFetchTool`
- `mcp__system__web_search`
- `mcp__system__web_fetch`

动态 MCP / 浏览器族：

- `browser_navigate`
- `browser_click`
- `browser_snapshot`
- `browser_screenshot`
- `browser_wait`
- `browser_tabs`
- `browser_evaluate`
- `mcp__playwright__*`
- `mcp__browser__*`
- `mcp__chrome__*`
- 任意 `mcp__<server>__search/read/list/browser/action` 风格工具名

## 认领边界

建议认领：

- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx`
- `src/components/agent/chat/utils/searchResultPreview.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/utils/toolDisplayInfo.ts`

不要修改：

- 文件变更卡撤销链路。
- Agent / Team / AskUserQuestion 交互链路。

## 必测场景

1. `WebSearch -> final text`：
   - `已搜索网页 N 次` 必须在最终正文前。
   - 展开后保留 query 和来源 title / hostname / url。
   - raw JSON 不应直接展示在正文里。

2. `WebSearch + WebFetch` 混合：
   - `WebFetch` 成功时展示可读摘要。
   - `WebFetch` 失败或 503 时不污染最终正文。
   - 搜索来源引用仍可见。

3. 多个搜索工具名：
   - `web_search`
   - `mcp__news__web_search`
   - `WebSearchTool`
   - 均应进入 web search 摘要，而不是 generic 工具。

4. browser / playwright：
   - `browser_navigate -> browser_snapshot -> browser_click -> final text`
   - 应折叠为浏览器过程组。
   - 展开后可看到 URL / selector / snapshot 摘要。
   - 截图类不应把二进制或长路径塞进正文。

5. 历史恢复：
   - 点击历史国际新闻会话。
   - 冷路径不应把搜索过程统一 trailing 到最终正文后。

6. 来源引用细节：
   - 搜索结果标题、host、URL 的位置和字号要稳定。
   - 未悬停隐藏的操作按钮不要常驻干扰来源展示。

## 建议测试入口

```bash
npm test -- "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx"
npm test -- "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/ToolSearchSummaryPanel.test.tsx"
```

Rust 定向：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" tools::web -- --nocapture
```

GUI / Playwright：

```bash
npm run bridge:health -- --timeout-ms 120000
```

然后用 Playwright 打开 `http://127.0.0.1:1420/`，进入“国际新闻简报”或新建联网任务，记录 DOM index：

- 前置说明 index
- `已搜索网页` index
- 最终标题 index

## 交付记录模板

```md
## Batch 03 结果

- 进程/认领人：
- 覆盖工具：
- 搜索来源引用证据：
- browser MCP 证据：
- DOM 顺序 index：
- GUI 截图/快照：
- 控制台状态：
- 发现问题：
- 下一刀：
```

## 2026-06-03 工具族识别收口记录

- 进程/认领人：Codex，Batch 03 Web/Search 渲染链路。
- 最佳实践查证：
  - Codex current 在 app-server v2 中把 `webSearch` 作为独立 `ThreadItem`，携带 `query` 与结构化 `WebSearchAction`；Responses `web_search_call` 由 `event_mapping.rs` 转成 `TurnItem::WebSearch`，不是在 UI 层临时猜工具名。
  - Claude Code 的 `sdkMessageAdapter.ts` 用 `tool_result` content block shape 判断远端工具结果，并明确不依赖不可靠的 `parent_tool_use_id`；`tool_use_summary` 作为 SDK 噪音被忽略。
  - 对 Lime 的结论：搜索来源渲染应消费稳定语义投影与结构化来源解析；工具族判断必须收敛到共享 helper，不能在 `ToolCallDisplay` / batch grouping 中散落 `includes("websearch")` 之类局部规则。
- 本轮修复：
  - 新增 `src/components/agent/chat/utils/toolNameFamily.ts`，集中处理 MCP 名称解析、MCP operation kind、browser 工具族、WebSearch/WebFetch alias 与动态 MCP `mcp__<server>__web_search` / `web_fetch`。
  - `searchResultPreview.ts` 继续导出 `isUnifiedWebSearchToolName`，但实现转到共享 helper，保持调用侧兼容。
  - `toolDisplayInfo.ts` 删除本地 MCP 解析 / browser 判断重复实现，改为 re-export 共享 helper，避免显示 catalog 与搜索来源解析分叉。
  - `toolBatchGrouping.ts` 改为使用 `isUnifiedWebSearchToolName` / `isUnifiedWebFetchToolName`，避免动态 MCP web search 漏判，也避免普通 `mcp__github__search_code` 被混成 WebSearch。
- 已补测试：
  - `toolNameFamily.unit.test.ts`：覆盖 WebSearch/WebFetch alias、动态 MCP web_search/web_fetch、普通 MCP search/read/browser/mutation 分类、误判排除。
  - `searchResultPreview.test.ts`：覆盖旧导出兼容与 `mcp__news__web_search` 识别。
  - `ToolCallDisplay.test.tsx`：覆盖 `mcp__news__web_search` 结构化结果渲染为搜索来源列表，默认不显示 raw result panel。
- 已执行校验：
  - `npm test -- "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`：4 files / 23 tests passed。
  - `npm test -- "src/components/agent/chat/utils/toolDisplayInfo.test.ts"`：1 file / 7 tests passed。
- 仍需 GUI 证据：
  - 进入 Lime 页面验证历史“国际新闻简报”或新建联网任务，记录 DOM 顺序：前置正文 -> `已搜索网页` -> 最终正文。
  - 验证来源 title / host / URL 的字号、位置与 hover 行为。
  - 验证 browser/playwright MCP 批次仍折叠为页面检查摘要。
- GUI / Playwright 状态：
  - `npm run bridge:health -- --timeout-ms 120000` 通过，DevBridge `status=ok`。
  - Playwright MCP 交互未完成：默认 MCP Chrome profile `/Users/coso/Library/Caches/ms-playwright/mcp-chrome-348597d` 被其他长期 MCP 进程占用，`browser_tabs` / `browser_navigate` / `browser_close` 均返回 `Browser is already in use`。本轮未杀其他进程，避免影响并行验证。
  - `npm run verify:gui-smoke` 部分通过：workspace ready、browser runtime、site adapters、agent service skill entry、agent runtime tool surface 均跑到通过；browser runtime 证据为 `consoleEvents=0 networkEvents=0`。
  - `npm run verify:gui-smoke` 最后一段 `smoke:agent-runtime-tool-surface-page` 超时（`>630000ms`），脚本已清理对应 page smoke 子命令与 smoke Chrome profile。因此本轮不能声明 GUI smoke 全量通过。
  - 校验过程中出现仓库既有 Browserslist 数据过期提示，不属于本轮 Web/Search helper 改动引入。

## 2026-06-03 GUI 阻塞复查记录

- 复查 `smoke:agent-runtime-tool-surface-page`：
  - 单跑 `npm run smoke:agent-runtime-tool-surface-page -- --app-url http://127.0.0.1:1420/ --health-url http://127.0.0.1:3030/health --invoke-url http://127.0.0.1:3030/invoke --timeout-ms 60000 --interval-ms 1000` 失败在 `wait-health`，错误为 `DevBridge 未就绪 ... fetch failed`。
  - `curl --max-time 5 http://127.0.0.1:3030/health` 无法连接，`lsof -iTCP:3030` 无监听，说明 page smoke 复跑时 DevBridge 已不在线。
  - 尝试 `npm run tauri:dev:headless` 失败，原因是 `http://127.0.0.1:1420/` 已被旧 Vite dev server 占用且不是浏览器 DevBridge mock 模式。
  - `lsof -iTCP:1420` 显示监听进程为 `node ... vite`，进程链来自约 2 小时前启动的 `pnpm run tauri dev` / `tauri dev`，非本轮创建；本轮未杀该进程，避免影响并行验证。
- 复查 Playwright MCP：
  - 当前仍有多个长期 `npm exec @playwright/mcp@latest` / `playwright-mcp` 进程，并有 Chrome 使用 `/Users/coso/Library/Caches/ms-playwright/mcp-chrome-348597d`。
  - 因此 Playwright MCP `browser_tabs` / `browser_navigate` 的 `Browser is already in use` 属于 profile 占用环境问题；本轮未强杀。
- 当前判定：
  - GUI 阻塞与本轮 Web/Search 工具族 helper 改动没有直接因果证据。
  - 下一次要补 GUI 证据，需要先由持有进程的一方释放 `1420` 与 MCP Chrome profile，或显式允许使用隔离 profile / 新端口启动 GUI 验证。
