# A2UI 表单数据持久化设计

## 问题背景

当前 A2UI 表单数据只存在于前端内存中，页面刷新或切换话题后会丢失。用户填写的表单数据需要持久化到数据库，以便重新进入时能够恢复。

## 数据分析

### 需要持久化的数据

1. **A2UI 响应结构** (`A2UIResponse`)
   - `id`: 响应 ID
   - `components`: 组件列表（包含表单字段定义）
   - `root`: 根组件 ID
   - `data`: 初始数据模型
   - `submitAction`: 提交动作配置

2. **用户填写的表单数据** (`A2UIFormData`)
   - 键值对形式，key 是组件 ID，value 是用户输入的值
   - 例如：`{ "scene": "我和同事说", "feeling": "对 go 很陌生" }`

3. **表单状态**
   - `submitted`: 是否已提交
   - `submittedAt`: 提交时间
   - `submittedData`: 提交时的数据快照

## 设计方案

### 方案 A：扩展 agent_messages 表（推荐）

在现有 `agent_messages` 表中添加字段存储 A2UI 相关数据：

```sql
-- 添加 A2UI 相关字段
ALTER TABLE agent_messages ADD COLUMN a2ui_response_json TEXT;
ALTER TABLE agent_messages ADD COLUMN a2ui_form_data_json TEXT;
ALTER TABLE agent_messages ADD COLUMN a2ui_submitted INTEGER DEFAULT 0;
ALTER TABLE agent_messages ADD COLUMN a2ui_submitted_at TEXT;
```

**优点**：

- 数据与消息紧密关联，查询简单
- 不需要额外的表和外键
- 迁移简单

**缺点**：

- 消息表字段增多
- 如果一条消息有多个 A2UI 表单，需要用 JSON 数组存储

### 方案 B：独立的 A2UI 表单表

创建独立的表存储 A2UI 表单数据：

```sql
CREATE TABLE IF NOT EXISTS a2ui_forms (
    id TEXT PRIMARY KEY,
    message_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    a2ui_response_json TEXT NOT NULL,
    form_data_json TEXT DEFAULT '{}',
    submitted INTEGER DEFAULT 0,
    submitted_at TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_a2ui_forms_message ON a2ui_forms(message_id);
CREATE INDEX IF NOT EXISTS idx_a2ui_forms_session ON a2ui_forms(session_id);
```

**优点**：

- 数据结构清晰
- 支持一条消息多个表单
- 便于单独查询和管理表单数据

**缺点**：

- 需要额外的表和外键
- 查询时需要 JOIN

## 推荐方案：方案 B

考虑到：

1. 一条 AI 消息可能包含多个 A2UI 表单
2. 表单数据需要独立更新（用户填写时实时保存）
3. 未来可能需要表单历史版本、表单模板等功能

### 数据流设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React)                              │
├─────────────────────────────────────────────────────────────────┤
│  StreamingRenderer                                               │
│       │                                                          │
│       ▼                                                          │
│  A2UIRenderer ──────► onFormChange() ──────► 防抖保存            │
│       │                                                          │
│       ▼                                                          │
│  onSubmit() ──────────────────────────────► 提交表单             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Commands                               │
├─────────────────────────────────────────────────────────────────┤
│  save_a2ui_form_data(form_id, form_data)                        │
│  submit_a2ui_form(form_id, form_data)                           │
│  get_a2ui_forms_by_session(session_id)                          │
│  get_a2ui_form_by_message(message_id)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Rust Backend                                 │
├─────────────────────────────────────────────────────────────────┤
│  A2UIFormService                                                 │
│    - save_form_data()                                           │
│    - submit_form()                                              │
│    - get_forms_by_session()                                     │
│    - get_form_by_message()                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SQLite Database                              │
├─────────────────────────────────────────────────────────────────┤
│  a2ui_forms 表                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 前端改动

1. **A2UIRenderer 组件**
   - 添加 `formId` prop（从后端获取或生成）
   - 添加 `initialFormData` prop（从后端加载）
   - 添加 `onFormChange` 回调（防抖保存）

2. **useAgentChatUnified / useAsterAgentChat Hook**
   - `switchTopic` 时加载该会话的所有 A2UI 表单数据
   - 将表单数据与消息关联

3. **StreamingRenderer 组件**
   - 传递表单数据给 A2UIRenderer

### 后端改动

1. **数据库 Schema**
   - 添加 `a2ui_forms` 表

2. **Tauri Commands**
   - `save_a2ui_form_data`: 保存表单数据（防抖调用）
   - `submit_a2ui_form`: 提交表单
   - `get_a2ui_forms_by_session`: 获取会话的所有表单
   - `create_a2ui_form`: 创建新表单记录

3. **消息保存逻辑**
   - 保存 AI 消息时，解析 A2UI 内容并创建表单记录

## 实现步骤

### Phase 1: 数据库层

1. 添加 `a2ui_forms` 表到 schema.rs
2. 创建 A2UIFormDao

### Phase 2: 后端服务

1. 创建 A2UIFormService
2. 添加 Tauri Commands

### Phase 3: 前端集成

1. 添加 API 调用函数
2. 修改 A2UIRenderer 支持数据持久化
3. 修改 useAgentChatUnified / useAsterAgentChat 加载表单数据

### Phase 4: 测试和优化

1. 测试表单数据保存和恢复
2. 优化防抖保存策略
3. 处理边界情况（网络错误、并发等）

## 注意事项

1. **防抖保存**：用户输入时不要每次都保存，使用 500ms 防抖
2. **乐观更新**：先更新 UI，后台异步保存
3. **错误处理**：保存失败时提示用户，但不阻塞操作
4. **数据清理**：删除会话时级联删除表单数据
