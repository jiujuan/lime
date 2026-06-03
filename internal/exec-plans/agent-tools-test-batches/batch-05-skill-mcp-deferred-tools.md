# Batch 05: Skill / MCP Resource / Deferred Tools 测试计划

## 独立背景

本批次覆盖 Skill、Workflow、ToolSearch、MCP resource 和动态 deferred MCP 工具。它们的关键风险是工具名和 schema 不是固定枚举：Lime 不能靠 hard code 几个工具名来保证展示正确。前端必须用 `mcp__server__tool` 命名规则、操作词分类和 ToolSearch 结果来做泛化。

用户明确指出工具数量有几十个，不止前面几个。因此本批次重点验证“动态工具族”不会漏测、不会被 web_search 特判掩盖，也不会在历史恢复里丢失过程。

## 参考与交接约束

- 外部参考优先级：先看 `/Users/coso/Documents/dev/rust/codex`，再看 `/Users/coso/Documents/dev/js/claudecode`。
- 不确定 deferred tool、MCP resource、ToolSearch、dynamic `mcp__server__tool` 分类或 schema 展示口径时，以 Codex current 行为为准；Codex 与 Claude Code 冲突时默认取 Codex。
- 只参考架构和行为，禁止把具体 session、path、provider、model、tool name 特例硬编码进 Lime。
- 本批次的核心不是枚举所有 MCP server，而是证明 `mcp__<server>__<verb>` 泛化分类和历史恢复不依赖 hard code。

## 覆盖工具

native / current：

- `Skill`
- `Workflow`
- `ToolSearch`
- `ListMcpResourcesTool`
- `ReadMcpResourceTool`

动态 MCP：

- `mcp__<server>__list_*`
- `mcp__<server>__read_*`
- `mcp__<server>__get_*`
- `mcp__<server>__search_*`
- `mcp__<server>__find_*`
- `mcp__<server>__query_*`
- `mcp__<server>__create_*`
- `mcp__<server>__update_*`
- `mcp__<server>__delete_*`
- `mcp__<server>__run_*`
- `mcp__<server>__execute_*`

## 认领边界

建议认领：

- `src/components/agent/chat/utils/toolDisplayInfo.ts`
- `src/components/agent/chat/utils/toolBatchGrouping.ts`
- `src/components/agent/chat/utils/toolProcessSummary.ts`
- `src/components/agent/chat/components/ToolSearchSummaryPanel.test.tsx`
- `src/components/agent/chat/components/StreamingRenderer.test.tsx`
- `src/components/agent/chat/components/MessageList.test.tsx`
- `src/components/agent/chat/projection/agentUiEventProjection.test.ts`

不要修改：

- Native tool registry，除非发现 alias 事实源错误。
- 单个具体 MCP server 的业务实现。

## 必测场景

1. `ToolSearch`：
   - ToolSearch 结果应显示工具确认/搜索摘要。
   - 不把 ToolSearch 元数据当最终正文。
   - 直接选择 `select:<tool_name>` 的结果可被正确摘要。

2. `ListMcpResourcesTool` / `ReadMcpResourceTool`：
   - list 类显示为查看/列表过程。
   - read 类显示为资源读取过程。
   - resource URI / server name 不丢。

3. `Skill`：
   - 直执 Skill 的本地 thinking 和过程保留。
   - 已完成历史 Skill 不应只剩最终正文。
   - 服务型 Skill 与普通 Skill 都覆盖。

4. `Workflow`：
   - workflow 执行过程不应被当普通 generic 长文本。
   - 失败时显示可读错误。

5. 动态 MCP 分类：
   - `mcp__docs__search`
   - `mcp__docs__read_page`
   - `mcp__db__list_tables`
   - `mcp__github__create_issue`
   - `mcp__linear__update_task`
   - search/list/read/browser/mutation 分类符合预期。

6. 历史恢复：
   - 动态 MCP 工具名不应因为没有 exact config 就落到最终正文后面。

## 建议测试入口

```bash
npm test -- "src/components/agent/chat/components/ToolSearchSummaryPanel.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm test -- "src/components/agent/chat/components/MessageList.test.tsx"
npm test -- "src/components/agent/chat/projection/agentUiEventProjection.test.ts"
```

Rust 定向：

```bash
cargo test --manifest-path "src-tauri/Cargo.toml" tools::tool_search_tool -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::mcp_resource_tools -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" skills::tool -- --nocapture
cargo test --manifest-path "src-tauri/Cargo.toml" tools::workflow_tool -- --nocapture
```

## GUI 验证

优先用已有 Skill / MCP fixture，不要求真实外部服务：

1. 打开 `Skills` 或 Agent 会话。
2. 触发一个 Skill 执行或历史 Skill 会话。
3. 若当前有 MCP tools，触发 ToolSearch 或资源读取。
4. 验证过程摘要、最终正文顺序和控制台状态。

## 交付记录模板

```md
## Batch 05 结果

- 进程/认领人：
- 覆盖工具：
- 动态 MCP 分类样例：
- Skill / Workflow 证据：
- 历史恢复证据：
- 控制台状态：
- 发现问题：
- 下一刀：
```

## Batch 05 结果 - 2026-06-03

- 进程/认领人：Codex，本轮只认领 Batch 05 的前端工具族分类、过程摘要、ToolSearch 结果解析和组件回归。
- 参考查证：
  - Codex current：`sdk/typescript/src/items.ts` 中 MCP 调用是结构化 `McpToolCallItem`，字段包含 `server / tool / arguments / result / error / status`；`codex-rs/core/src/tools/handlers/mcp_resource.rs` 对 MCP resource begin/end 也发独立 item。结论是 UI 不应靠具体 server 名枚举，而应按结构化 MCP 名称/操作族投影。
  - Claude Code：`src/remote/sdkMessageAdapter.ts` 按 `tool_result` block shape 识别工具结果，并忽略 `tool_use_summary`，结论是展示事实源应来自真实 tool result / timeline，而不是额外摘要消息。
- 覆盖工具：
  - `ToolSearch`
  - `ListMcpResourcesTool`
  - `ReadMcpResourceTool`
  - `mcp__<server>__search/read/list/create/update/execute`
- 动态 MCP 分类样例：
  - `mcp__github__search_code` -> `search`
  - `mcp__github__get_file_contents` -> `read`
  - `mcp__docs__read_page` -> `read`
  - `mcp__github__create_issue` -> `mutation`
  - `mcp__linear__update_task` -> `mutation`
  - `mcp__runner__execute_job` -> `mutation`
  - `mcp__playwright__browser_click` -> `browser`
- 本轮修复：
  - `toolNameFamily.ts` 把 MCP `mutation` 作为显式操作族，而不是用 `null` 混同“无法识别”；browser 仍优先识别，避免页面操作被 create/update/run 等词误伤。
  - `toolDisplayInfo.ts` 为 MCP mutation 走通用 MCP 工具展示，补齐 `ListMcpResourceTemplatesTool` alias，并让 MCP resource / dynamic MCP 主体提取保留 `server / uri / title / subject / action` 等用户可读字段。
  - `toolBatchGrouping.ts` 让 mutation 计入重要工具调用但不吸收到探索/网页搜索/浏览器批次，避免写操作被折叠成“已探索项目”。
  - `toolSearchResultSummary.ts` 兼容 deferred tool 结果里的 `call_name / callName / tool_name` 字段，避免 ToolSearch 结果不是 `name` 时被丢弃。
- Skill / Workflow 证据：
  - 本轮未改 Skill / Workflow 主逻辑；保留既有 `toolProcessSummary.test.ts` 中 `SkillTool / WorkflowTool / lime_run_service_skill` 文案回归。
- 历史恢复证据：
  - 本轮未启动 GUI 历史会话；通过 helper + `ToolCallDisplay` 组件回归证明动态 MCP mutation 不再落回搜索/读取族，也不会被探索批次吞掉。完整历史恢复仍需 GUI 环境恢复后补测。
- 控制台状态：
  - 未进入 Playwright GUI。当前本机此前已确认 DevBridge `127.0.0.1:3030/health` 不在线，`127.0.0.1:1420` 被旧 Vite/Tauri 进程占用，且 Playwright MCP 默认 profile 被其他长期进程占用；按并行协作规则，本轮未杀旧进程。
- 已执行验证：
  - `npm test -- "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolSearchResultSummary.test.ts" "src/components/agent/chat/components/ToolSearchSummaryPanel.test.tsx"`：6 files / 48 tests passed。
  - `npm test -- "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/utils/toolNameFamily.unit.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/toolSearchResultSummary.test.ts"`：6 files / 50 tests passed。
- 发现问题：
  - Lime 仍靠前端 `toolNameFamily` 从 tool name 还原 MCP 结构，尚未完全达到 Codex app-server 那种 `McpToolCallItem` 结构化 item 事实源；这是架构差距，不应继续用具体工具名 hard code 弥补。
  - GUI/Playwright 证据未完成，不能声称 Batch 05 产品级完全可交付。
- 下一刀：
  - GUI 环境释放后，补 Batch 05 的历史恢复与 Playwright DOM 顺序证据。
  - 若继续前端架构收口，下一步应把 runtime/projection 中 MCP tool call 的 `server/tool/operationKind` 作为结构化字段传给 UI，减少 UI 继续解析字符串的比例。
