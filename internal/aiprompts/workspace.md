# Workspace 设计文档

## 概述

Workspace 是 Lime 应用层的概念，用于组织和管理 AI Agent 的工作上下文。它是对 Aster 框架 `Session.working_dir` 的命名和配置包装，不修改 Aster 框架本身。

## 设计背景

### 行业调研

基于对 Cursor、Claude Code、Manus、AI21 等产品的调研，总结出以下关键洞察：

| 来源                  | 核心观点                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| Manus (philschmid.de) | "Share memory by communicating, don't communicate by sharing memory"               |
| AI21                  | "Agents that only read can share an environment. Agents that write need isolation" |
| Cursor                | Shadow Workspace 实现后台 AI 迭代，不影响用户体验                                  |
| Claude Code           | 通过 `--add-dir` 支持多目录，`CLAUDE.md` 实现层级配置                              |

### 核心原则

1. **读共享，写隔离** - 只读操作可以共享环境，写操作需要隔离
2. **最小有效 context** - 只传递必要的 context，避免 context pollution
3. **Workspace = 边界** - 文件系统边界 + context 边界 + 配置边界

## 工作区预览规则

对 Lime 的通用工作区，真实文件仍是文件内容的业务事实源，但右侧打开链路必须统一走 `Preview Artifact Contract`。

固定实施规则：

1. 用户显式打开项目文件、导出 Markdown、历史任务里的真实文件时，先把 source 投影成 source-backed preview artifact，再通过统一 artifact workbench 打开。
2. preview artifact 只表达 UI 打开和展示能力，不反向定义“当前主稿是什么”；写回真实文件必须由显式保存动作完成。
3. `ArtifactDocument v1` 继续承担正式交付物、结构化增量写入、版本、diff、导出；普通文件预览默认不升级为正式文档。
4. Markdown / HTML 预览要以当前文件路径作为基准解析相对图片路径，保证同目录 `images/` 等资源能直接渲染。
5. 文件标题、默认预览、工作台下载/打开动作应尽量保留项目内相对路径；只有在实际读取磁盘时才解析绝对路径。
6. 二进制、DOCX、图片、URL、任务结果、知识库命中、Plugin shell entry 都应进入同一 preview projection，再按 `contentKind / renderMode / capabilities` 退化到文本、媒体、独立窗口、系统打开或 unsupported。

## 架构设计

### 层级关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    Lime (应用层)                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Workspace 管理                                             ││
│  │  - WorkspaceManager: CRUD 操作                              ││
│  │  - WorkspaceSettings: workspace 级配置                      ││
│  │  - 通过 working_dir 关联 Aster Session                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Aster (框架层) - 不修改                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Session 管理                                               ││
│  │  - SessionManager: Session CRUD                             ││
│  │  - Session.working_dir: 工作目录                            ││
│  │  - Conversation: 对话历史                                   ││
│  │  - EnhancedContextManager: context 压缩                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 与 Aster Session 的关系

- Workspace 通过 `root_path` 与 Aster `Session.working_dir` 关联
- 一个 Workspace 可以包含多个 Session（同一 working_dir）
- Lime 按 Workspace 分组显示 Session 列表

## 数据模型

### Workspace 协议投影

```rust
// lime-rs/crates/app-server-protocol/src/protocol/v0/workspaces.rs

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};

/// Workspace 唯一标识
pub type WorkspaceId = String;

/// Workspace 类型
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceType {
    #[default]
    Persistent,  // 持久化 workspace
    Temporary,   // 临时 workspace（自动清理）
}

/// Workspace 元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: WorkspaceId,
    pub name: String,
    pub workspace_type: WorkspaceType,
    pub root_path: PathBuf,           // 对应 Aster Session.working_dir
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub settings: WorkspaceSettings,
}

/// Workspace 级别设置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspaceSettings {
    pub mcp_config: Option<serde_json::Value>,  // workspace 级 MCP 配置
    pub default_provider: Option<String>,        // 默认 provider
    pub auto_compact: bool,                      // 是否允许运行时自动压缩上下文；关闭后只保留手动压缩
}
```

### 数据库 Schema

```sql
-- lime 应用数据库
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workspace_type TEXT NOT NULL DEFAULT 'persistent',
    root_path TEXT NOT NULL UNIQUE,  -- 对应 Aster Session.working_dir
    is_default BOOLEAN DEFAULT FALSE,
    settings_json TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workspaces_root_path ON workspaces(root_path);
```

## 核心接口

### Workspace App Server Owner

```rust
// lime-rs/crates/app-server/src/runtime/workspaces.rs

impl WorkspaceManager {
    /// 创建新 workspace
    pub async fn create(&self, name: String, root_path: PathBuf) -> Result<Workspace>;

    /// 获取 workspace
    pub async fn get(&self, id: &WorkspaceId) -> Result<Workspace>;

    /// 列出所有 workspace
    pub async fn list(&self) -> Result<Vec<Workspace>>;

    /// 更新 workspace
    pub async fn update(&self, id: &WorkspaceId, updates: WorkspaceUpdate) -> Result<Workspace>;

    /// 删除 workspace
    pub async fn delete(&self, id: &WorkspaceId) -> Result<()>;

    /// 设置默认 workspace
    pub async fn set_default(&self, id: &WorkspaceId) -> Result<()>;

    /// 获取默认 workspace
    pub async fn get_default(&self) -> Result<Option<Workspace>>;

    /// 获取 workspace 下的所有 sessions（通过 working_dir 关联）
    pub async fn list_sessions(&self, workspace_id: &WorkspaceId) -> Result<Vec<Session>> {
        let workspace = self.get(workspace_id).await?;

        // 使用 Aster 的 SessionManager，按 working_dir 过滤
        let all_sessions = aster::session::SessionManager::list_sessions().await?;

        Ok(all_sessions
            .into_iter()
            .filter(|s| s.working_dir == workspace.root_path)
            .collect())
    }

    /// 在 workspace 中创建新 session
    pub async fn create_session(
        &self,
        workspace_id: &WorkspaceId,
        name: String
    ) -> Result<Session> {
        let workspace = self.get(workspace_id).await?;

        // 使用 Aster 的 SessionManager
        aster::session::SessionManager::create_session(
            workspace.root_path.clone(),
            name,
            aster::session::SessionType::User,
        ).await
    }
}
```

### Desktop Host / App Server 边界

Workspace 数据读取默认走 App Server JSON-RPC；Electron Desktop Host 只保留窗口、对话框、托盘、Dock、updater 和 sidecar 生命周期等桌面壳能力。

```typescript
// packages/app-server-client / src/lib/api/appServer.ts

const workspaceListRequest = {
  method: "workspace/list",
  params: {},
};

const sessionListRequest = {
  method: "agentSession/list",
  params: { workspaceId: "workspace-main" },
};
```

旧 workspace 桥接入口只允许作为 compat facade 委托 current 数据源，不得承接新业务逻辑或作为新测试的可交付证据。

## 目录结构

```
~/.aster/                              # Aster 框架目录（不修改）
├── config/
├── data/
│   └── sessions/
│       └── sessions.db                # Aster 管理的 session 数据库
└── state/

~/Library/Application Support/lime/  # Lime 应用目录
├── lime.db                       # 应用数据库（包含 workspaces 表）
├── credentials/                       # 已退役托管凭证副本目录；启动期只做清理
└── workspaces/                        # workspace 级配置
    ├── default/
    │   └── mcp.json                   # workspace 级 MCP 配置
    └── my-project/
        └── mcp.json
```

## 前端组件

### WorkspaceSelector

```typescript
// lime/src/components/workspace/WorkspaceSelector.tsx

interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  isDefault: boolean;
  workspaceType: 'persistent' | 'temporary';
}

export function WorkspaceSelector() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);

  useEffect(() => {
    listWorkspaces().then(setWorkspaces);
    readDefaultWorkspace().then(setCurrent);
  }, []);

  const switchWorkspace = async (id: string) => {
    await updateWorkspace({ id, isDefault: true });
    const ws = workspaces.find(w => w.id === id);
    setCurrent(ws || null);
    // 触发 session 列表刷新
  };

  return (
    <Select value={current?.id} onValueChange={switchWorkspace}>
      {workspaces.map(ws => (
        <SelectItem key={ws.id} value={ws.id}>
          <FolderIcon /> {ws.name}
        </SelectItem>
      ))}
      <SelectItem value="__new__">
        <PlusIcon /> 添加工作目录...
      </SelectItem>
    </Select>
  );
}
```

## 实现优先级

### Phase 1: 基础功能

1. 数据库 schema 迁移
2. App Server Workspace owner 核心 CRUD
3. 前端 API 网关接入 App Server JSON-RPC
4. WorkspaceSelector 组件

### Phase 2: 集成功能

1. Session 列表按 Workspace 分组
2. 创建 Session 时自动关联当前 Workspace
3. Workspace 级别的 MCP 配置

### Phase 3: 高级功能

1. 临时 Workspace 支持
2. Workspace 导入/导出
3. Workspace 级别的 Provider 配置

## 设计决策

| 决策点             | 选择                  | 理由                              |
| ------------------ | --------------------- | --------------------------------- |
| Workspace 存储位置 | Lime 应用层           | 不修改 Aster 框架，保持框架通用性 |
| 与 Session 关系    | 通过 working_dir 关联 | 利用 Aster 现有字段，无需修改框架 |
| 配置存储           | 独立目录 + 数据库     | 配置文件便于编辑，元数据存数据库  |
| 默认 Workspace     | 支持                  | 新 Session 自动关联默认 Workspace |

## 参考资料

- [Context Engineering for AI Agents](https://www.philschmid.de/context-engineering-part-2) - Manus 团队经验
- [Scaling State-Modifying AI Agents with MCP Workspaces](https://www.ai21.com/blog/stateful-agent-workspaces-mcp) - AI21 的 MCP Workspace 扩展
- [Iterating with shadow workspaces](https://www.cursor.com/blog/shadow-workspace) - Cursor 的 Shadow Workspace 实现
- [Managing Claude Code's Context](https://www.cometapi.com/managing-claude-codes-context/) - Claude Code 的 Context 管理
