-- Unified memory table
CREATE TABLE IF NOT EXISTS unified_memory (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    importance INTEGER NOT NULL DEFAULT 5,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    source TEXT NOT NULL,
    embedding BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_unified_memory_session ON unified_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_unified_memory_type ON unified_memory(memory_type);
CREATE INDEX IF NOT EXISTS idx_unified_memory_category ON unified_memory(category);
CREATE INDEX IF NOT EXISTS idx_unified_memory_archived ON unified_memory(archived);
CREATE INDEX IF NOT EXISTS idx_unified_memory_updated ON unified_memory(updated_at DESC);
