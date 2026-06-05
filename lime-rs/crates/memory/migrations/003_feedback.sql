-- Memory feedback table
-- Records user feedback on extracted memories

CREATE TABLE IF NOT EXISTS memory_feedback (
    id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- JSON: {"type": "approve|reject|modify", ...}
    session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (memory_id) REFERENCES unified_memory(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_memory ON memory_feedback(memory_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session ON memory_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON memory_feedback(created_at DESC);
