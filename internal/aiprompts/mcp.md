# MCP 服务器

## 概述

MCP (Model Context Protocol) 服务器管理模块。

## 目录结构

```
lime-rs/src/services/
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

## Desktop Host / App Server 边界

MCP 相关新能力默认收敛到 App Server JSON-RPC 能力发现与 Agent runtime 工具执行链；Electron Desktop Host 只负责 IPC、窗口和 sidecar 生命周期，不承接 MCP 业务事实。

```typescript
// src/lib/api/mcp.ts / src/lib/api/appServer.ts

const capabilityListRequest = {
  method: "capability/list",
  params: {
    caller: "agent-workspace",
    includeDeferred: true,
  },
};

const turnStartRequest = {
  method: "agentSession/turn/start",
  params: {
    sessionId: "session-main",
    prompt: "调用当前会话允许的 MCP 工具完成任务",
  },
};
```

## 相关文档

- [services.md](services.md) - 业务服务
- [commands.md](commands.md) - Desktop Host / App Server 命令边界
