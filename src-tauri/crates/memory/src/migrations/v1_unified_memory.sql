-- 统一记忆表 (V1)
--
-- 存储所有类型的记忆条目，包括对话历史自动提取和项目相关的记忆
-- 支持 5 种分类：identity/context/preference/experience/activity
-- 包含元数据：置信度、重要性、访问次数、向量嵌入等

-- 索引说明
CREATE TABLE IF NOT EXISTS unified_memory (
    -- 主键
    id TEXT PRIMARY KEY,

    -- 关联信息
    session_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,  -- 'conversation' | 'project'
    category TEXT NOT NULL,    -- 'identity' | 'context' | 'preference' | 'experience' | 'activity'

    -- 内容字段
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL,          -- JSON array: ["tag1", "tag2"]

    -- 元数据字段
    confidence REAL NOT NULL DEFAULT 0.5,           -- 置信度 0.0-1.0
    importance INTEGER NOT NULL DEFAULT 5,        -- 重要性 0-10
    access_count INTEGER NOT NULL DEFAULT 0,       -- 访问次数
    last_accessed_at INTEGER,                   -- 上次访问时间（毫秒时间戳）
    source TEXT NOT NULL,                        -- 'auto_extracted' | 'manual' | 'imported'

    -- 向量嵌入（可选，用于语义搜索）
    embedding BLOB,                             -- f32 数组，维度由当前嵌入模型决定

    -- 时间戳
    created_at INTEGER NOT NULL,               -- 创建时间（毫秒时间戳）
    updated_at INTEGER NOT NULL,               -- 更新时间（毫秒时间戳）

    -- 状态
    archived BOOLEAN NOT NULL DEFAULT 0          -- 是否已归档
);

-- 索引：按会话 ID 查询
CREATE INDEX IF NOT EXISTS idx_unified_memory_session
    ON unified_memory(session_id);

-- 索引：按记忆类型查询
CREATE INDEX IF NOT EXISTS idx_unified_memory_type
    ON unified_memory(memory_type);

-- 索引：按分类查询
CREATE INDEX IF NOT EXISTS idx_unified_memory_category
    ON unified_memory(category);

-- 索引：按归档状态查询（通常只查询未归档的）
CREATE INDEX IF NOT EXISTS idx_unified_memory_archived
    ON unified_memory(archived);

-- 索引：按更新时间倒序排列（常用）
CREATE INDEX IF NOT EXISTS idx_unified_memory_updated
    ON unified_memory(updated_at DESC);

-- 索引：按重要性排序（用于智能检索）
CREATE INDEX IF NOT EXISTS idx_unified_memory_importance
    ON unified_memory(importance DESC);

-- 索引：按访问次数排序（用于热门记忆）
CREATE INDEX IF NOT EXISTS idx_unified_memory_access_count
    ON unified_memory(access_count DESC);

-- 全文搜索虚拟表（可选，用于高级文本搜索）
-- 注意：FTS5 需要 SQLite 3.9.0 或更高版本
-- CREATE VIRTUAL TABLE IF NOT EXISTS unified_memory_fts USING fts5(
--     id,
--     title,
--     content,
--     summary,
--     tags
-- );
--
-- -- 全文搜索触发器：保持 FTS 索引同步
-- CREATE TRIGGER IF NOT EXISTS tgr_unified_memory_fts_insert
--     AFTER INSERT ON unified_memory BEGIN
--     INSERT INTO unified_memory_fts(id, title, content, summary, tags)
--     VALUES (new.id, new.title, new.content, new.summary, new.tags);
-- END;
--
-- CREATE TRIGGER IF NOT EXISTS tgr_unified_memory_fts_delete
--     AFTER DELETE ON unified_memory BEGIN
--     DELETE FROM unified_memory_fts WHERE id = old.id;
-- END;
--
-- CREATE TRIGGER IF NOT EXISTS tgr_unified_memory_fts_update
--     AFTER UPDATE ON unified_memory BEGIN
--     DELETE FROM unified_memory_fts WHERE id = new.id;
--     INSERT INTO unified_memory_fts(id, title, content, summary, tags)
--     VALUES (new.id, new.title, new.content, new.summary, new.tags);
-- END;
