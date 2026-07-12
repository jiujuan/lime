# Desktop Host 与 App Server 命令边界

状态：current

目录、依赖方向和完整协议层级以 [architecture.md](architecture.md) 为准。本页只定义命令应落在哪一层，以及跨层变更的同步要求。

## 唯一业务通道

```text
Renderer typed gateway
  -> preload / Desktop Host（仅宿主能力或 JSONL 转发）
  -> app_server_handle_json_lines
  -> App Server JSON-RPC method
  -> runtime/domain owner
```

业务能力只通过 App Server JSON-RPC 进入 Rust runtime。Electron IPC 只用于窗口、文件/目录选择、系统权限、外链、托盘、自动更新、sidecar 生命周期等宿主能力，或转发 `app_server_handle_json_lines`。Renderer 不直接调用 provider、tool runtime、数据库或 Electron main 私有实现。

## Owner 判定

| 需求 | Owner |
| --- | --- |
| Thread / Turn / Item、read model、evidence、业务查询与写入 | App Server protocol + handler + current Rust domain |
| 模型路由、canonical content、capability、provider wire lowering | `runtime-core` / `model-provider` |
| 工具定义、审批、sandbox、dispatch、MCP | `tool-runtime` |
| 窗口、系统文件选择、通知、Dock、tray、updater、sidecar | Electron Desktop Host |
| UI request builder、response normalization、projection | Renderer `src/lib/api/` 或 typed package |

禁止为业务调用新增第二个 Electron 后端、renderer mock fallback、临时 DevBridge 命令或 legacy wrapper。生产失败必须显式失败；mock 仅在测试夹具中显式注入。

## 协议变更清单

新增或修改跨层业务 method 时，同一变更集必须同步：

1. `app-server-protocol` method、params、result、notification 与 schema。
2. App Server handler、current domain owner 与 Rust client（如适用）。
3. `packages/app-server-client` 或 Renderer typed gateway。
4. Electron preload / IPC 白名单，仅当请求需要宿主转发或系统能力时。
5. catalog、受控 fixture、mock policy 和负向回流 guard。
6. `npm run test:contracts` 与受影响的 Rust / TypeScript 定向测试。

改变 method、schema、read model、notification、preload 边界或 sidecar 行为属于重大架构变更时，按 [architecture.md](architecture.md#11-重大架构变更与开发者确认) 更新架构图并由责任开发者确认。

## 验证入口

| 风险 | 最低验证 |
| --- | --- |
| Typed client / protocol | `npm run test:contracts` |
| Rust domain | `npm run test:rust:related -- <paths...>` |
| Desktop bridge | `npm run test:contracts` + `npm run verify:gui-smoke` |
| Agent 主链 | `npm run smoke:agent-runtime-current-fixture` |
| 真实桌面闭环 | Gate B Electron fixture / GUI smoke |

具体质量选择见 [quality-workflow.md](quality-workflow.md)。

## MCP 控制面主链

MCP 管理、发现和调用只允许走：

`src/lib/api/mcp.ts -> AppServerClient.request(...) -> app_server_handle_json_lines -> App Server JSON-RPC -> lime-rs/crates/mcp`

current method 为 `mcpServer/list`、`mcpServerStatus/list`、`mcpServer/create`、`mcpServer/update`、`mcpServer/delete`、`mcpServer/enabled/set`、`mcpServer/importFromApp`、`mcpServer/syncAllToLive`、`mcpServer/oauth/login`、`mcpServer/start`、`mcpServer/stop`、`mcpTool/list`、`mcpTool/listForContext`、`mcpTool/search`、`mcpTool/call`、`mcpTool/callWithCaller`、`mcpPrompt/list`、`mcpPrompt/get`、`mcpResource/list`、`mcpResource/read`、`mcpResource/subscribe` 与 `mcpResource/unsubscribe`。事件 `mcp:resources_updated` 和 `mcp:resource_updated` 必须经真实 MCP manager / Desktop Host event bridge 投影；浏览器模式不得静默退回 mock event fallback。

live evidence 仅通过 `smoke:mcp-current -- --allow-live-provider` 显式开启，且需要 `LIME_MCP_LIVE_SERVER_URL`。该 URL 不得包含 username、password、query 或 hash；认证只能引用环境变量名，不允许 inline secret。`network-invoke.json` 仅可记录脱敏的 host、环境变量名、header 名、范围和工具/资源摘要。

旧 MCP Desktop facade 已统一归类为 `dead / retired guard-only`：`get_mcp_servers`、`mcp_list_servers_with_status`、`mcp_list_tools`、`mcp_list_prompts`、`mcp_list_resources`、`mcp_call_tool`、`mcp_start_server`、`sync_all_mcp_to_live` 只能出现在负向 guard 或历史 evidence，禁止回到前端网关、Desktop Host、mock 或 App Server current 主链。
