//! V1 迁移：创建统一记忆表

use rusqlite::{Connection, Result};

/// V1 迁移 SQL 脚本
pub const SQL_SCHEMA: &str = include_str!("v1_unified_memory.sql");

/// 执行 V1 迁移
pub fn migrate(conn: &Connection) -> Result<()> {
    tracing::info!("[记忆模块] 执行 V1 迁移：创建 unified_memory 表");

    // 执行 SQL 脚本
    conn.execute_batch(SQL_SCHEMA)?;

    tracing::info!("[记忆模块] V1 迁移完成");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sql_schema_valid() {
        // 验证 SQL 脚本包含必要的表定义
        assert!(SQL_SCHEMA.contains("CREATE TABLE IF NOT EXISTS unified_memory"));
        assert!(SQL_SCHEMA.contains("id TEXT PRIMARY KEY"));
        assert!(SQL_SCHEMA.contains("memory_type TEXT NOT NULL"));
        assert!(SQL_SCHEMA.contains("category TEXT NOT NULL"));
        assert!(SQL_SCHEMA.contains("confidence REAL NOT NULL DEFAULT 0.5"));
        assert!(SQL_SCHEMA.contains("importance INTEGER NOT NULL DEFAULT 5"));
        assert!(SQL_SCHEMA.contains("embedding BLOB"));
    }

    #[test]
    fn test_sql_schema_indexes() {
        // 验证 SQL 脚本包含必要的索引
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_session"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_type"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_category"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_archived"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_updated"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_importance"));
        assert!(SQL_SCHEMA.contains("CREATE INDEX IF NOT EXISTS idx_unified_memory_access_count"));
    }
}
