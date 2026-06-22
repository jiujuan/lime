# mcp

<!-- 一旦我所属的文件夹有所变化，请更新我 -->

## 架构说明

MCP (Model Context Protocol) 服务器管理组件集合。
提供完整的 MCP 前端管理界面，包括配置管理、运行时控制、工具/提示词/资源浏览与调用。

## 文件索引

- `McpPanel.tsx` - MCP 管理面板 facade（运行时 hook、OAuth 打开、Tab 内容接线）
- `McpPanelHeader.tsx` - MCP 管理面板页头与摘要指标
- `McpPanelTabs.tsx` - MCP 管理面板 Tab 导航
- `mcpPanelModel.ts` - MCP 管理面板 Tab、计数和同步状态投影
- `McpPage.tsx` - MCP 配置管理页面 facade（服务器增删改查、导入/同步编排）
- `McpPageActions.tsx` - 配置页导入 / 同步操作区
- `McpPageServerList.tsx` - 配置页服务器列表（选择、刷新、新建入口）
- `McpPageEditor.tsx` - 配置页服务器编辑器（预设、结构化连接配置、JSON 配置、保存 / 删除入口）
- `McpPage.test.tsx` - 配置页创建 / 编辑 / Context7 preset 与稳定测试标识回归
- `mcpPageModel.ts` - 配置页预设、结构化连接配置摘要 / JSON patch helper、共享按钮样式和应用标签投影
- `mcpPageModel.unit.test.ts` - 配置页连接配置 JSON patch 与摘要投影回归
- `useMcpPageEditorState.ts` - 配置页编辑状态 hook（选择、新建、预设、JSON 校验、保存 / 删除确认）
- `McpServerList.tsx` - 服务器运行状态列表 facade（刷新、空态、运行操作接线）
- `McpServerRow.tsx` - 单个服务器运行状态行（启动 / 停止 / 重连 / OAuth 状态展示）
- `mcpServerListModel.ts` - 服务器列表摘要、连接阶段、OAuth 状态与能力标签投影
- `McpToolsBrowser.tsx` - 工具浏览器 facade（工具列表、展开状态、Schema 展示）
- `mcpToolBrowserModel.ts` - 工具浏览器去重、分组、搜索过滤与排序投影
- `McpToolCaller.tsx` - 工具调用组件（调用状态、参数表单 / JSON 模式和结果展示接线）
- `mcpToolCallerModel.ts` - 工具调用字段提取、表单 / JSON 参数组装与内容类型投影
- `McpPromptsBrowser.tsx` - 提示词浏览器 facade（搜索、展开状态、内容获取接线）
- `McpPromptServerGroup.tsx` - 提示词服务器分组、提示词行、参数表单与结果预览
- `mcpPromptBrowserModel.ts` - 提示词浏览器分组、搜索过滤与参数投影
- `McpResourcesBrowser.tsx` - 资源浏览器 facade（资源列表、订阅 / 读取生命周期接线）
- `McpResourceContentPreview.tsx` - 资源内容预览 UI（文本截断、图片 / 二进制摘要展示）
- `mcpResourceBrowserModel.ts` - 资源浏览器分组与搜索过滤投影
- `mcpResourcePreview.ts` - MCP 资源内容预览投影（文本截断、图片 / 二进制摘要）
- `index.ts` - 模块导出

## 依赖关系

- Hooks: `useMcp`（运行时状态）、`useMcpServers`（配置管理）
- API: `src/lib/api/mcp.ts`（App Server JSON-RPC 网关封装）
- 后端: `packages/app-server-client/src/protocol.ts`、`lime-rs/crates/app-server-protocol/src/protocol/v0.rs`、`lime-rs/crates/app-server/src/runtime.rs`、`lime-rs/crates/mcp/`
- 旧 Tauri wrapper: `lime-rs/src/commands/mcp_cmd.rs` 已删除；MCP 后续能力只允许继续进入 App Server current 或 Electron Desktop Host 壳边界

## 更新提醒

任何文件变更后，请更新此文档和相关的上级文档。
