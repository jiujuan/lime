# MCP 服务器

## 概述

MCP (Model Context Protocol) 服务器管理模块。

## 目录结构

```
src-tauri/src/services/
├── mcp_service.rs      # MCP 服务管理
└── mcp_sync.rs         # 配置同步

src/components/mcp/
├── McpPanel.tsx        # MCP 管理面板
├── McpServerList.tsx   # 服务器列表
└── McpToolList.tsx     # 工具列表
```

## MCP 服务

```rust
pub struct McpService {
    servers: HashMap<String, McpServer>,
    config_path: PathBuf,
}

pub struct McpServer {
    name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    status: ServerStatus,
    tools: Vec<Tool>,
}

impl McpService {
    /// 启动服务器
    pub async fn start(&mut self, name: &str) -> Result<()>;
    
    /// 停止服务器
    pub async fn stop(&mut self, name: &str) -> Result<()>;
    
    /// 列出工具
    pub async fn list_tools(&self, name: &str) -> Result<Vec<Tool>>;
    
    /// 调用工具
    pub async fn call_tool(
        &self,
        server: &str,
        tool: &str,
        args: Value,
    ) -> Result<Value>;
}
```

## 配置格式

```json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
            "env": {},
            "disabled": false
        }
    }
}
```

## Tauri 命令

```rust
#[tauri::command]
async fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String>;

#[tauri::command]
async fn mcp_start_server(name: String) -> Result<(), String>;

#[tauri::command]
async fn mcp_stop_server(name: String) -> Result<(), String>;

#[tauri::command]
async fn mcp_list_tools(server: String) -> Result<Vec<Tool>, String>;

#[tauri::command]
async fn mcp_call_tool(server: String, tool: String, args: Value) -> Result<Value, String>;
```

## 相关文档

- [services.md](services.md) - 业务服务
- [commands.md](commands.md) - Tauri 命令
