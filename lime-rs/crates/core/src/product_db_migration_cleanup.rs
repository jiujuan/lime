#[cfg(test)]
use rusqlite::Connection;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::time::Duration;

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProductDbMigrationCleanupPolicy {
    Retain,
    ClearRows,
    DropTables,
    DeleteFile,
}

#[cfg(test)]
impl Default for ProductDbMigrationCleanupPolicy {
    fn default() -> Self {
        Self::Retain
    }
}

#[cfg(test)]
impl ProductDbMigrationCleanupPolicy {
    pub fn parse(value: &str) -> Result<Self, String> {
        let normalized = value.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "retain" => Ok(Self::Retain),
            "clear-rows" => Ok(Self::ClearRows),
            "drop-tables" => Ok(Self::DropTables),
            "delete-file" => Ok(Self::DeleteFile),
            _ => Err(format!(
                "unsupported product DB migration cleanup policy: {value}"
            )),
        }
    }
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProductDbMigrationCleanupReport {
    pub source_path: PathBuf,
    pub policy: ProductDbMigrationCleanupPolicy,
    pub rows_deleted: usize,
    pub schema_objects_dropped: usize,
    pub database_files_deleted: usize,
}

#[cfg(test)]
impl ProductDbMigrationCleanupReport {
    pub fn changed(&self) -> bool {
        self.rows_deleted > 0 || self.schema_objects_dropped > 0 || self.database_files_deleted > 0
    }
}

#[cfg(test)]
pub fn cleanup_migrated_product_db_source(
    source_path: &Path,
    policy: ProductDbMigrationCleanupPolicy,
) -> Result<ProductDbMigrationCleanupReport, String> {
    let mut report = ProductDbMigrationCleanupReport {
        source_path: source_path.to_path_buf(),
        policy,
        rows_deleted: 0,
        schema_objects_dropped: 0,
        database_files_deleted: 0,
    };

    match policy {
        ProductDbMigrationCleanupPolicy::Retain => Ok(report),
        ProductDbMigrationCleanupPolicy::ClearRows => {
            report.rows_deleted = clear_user_rows(source_path)?;
            Ok(report)
        }
        ProductDbMigrationCleanupPolicy::DropTables => {
            report.schema_objects_dropped = drop_user_schema_objects(source_path)?;
            Ok(report)
        }
        ProductDbMigrationCleanupPolicy::DeleteFile => {
            report.database_files_deleted = remove_database_with_sidecars(source_path)?;
            Ok(report)
        }
    }
}

pub(crate) fn remove_database_with_sidecars(path: &Path) -> Result<usize, String> {
    let mut deleted = 0;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|e| format!("删除旧数据库文件失败 {}: {e}", path.display()))?;
        deleted += 1;
    }

    for suffix in ["-wal", "-shm", "-journal"] {
        let sidecar = sqlite_sidecar_path(path, suffix);
        if sidecar.exists() {
            fs::remove_file(&sidecar)
                .map_err(|e| format!("删除数据库伴生文件失败 {}: {e}", sidecar.display()))?;
            deleted += 1;
        }
    }

    Ok(deleted)
}

#[cfg(test)]
fn clear_user_rows(path: &Path) -> Result<usize, String> {
    if !path.exists() {
        return Ok(0);
    }

    let mut conn = open_source_database(path)?;
    let tables = user_table_names(&conn)?;
    if tables.is_empty() {
        return Ok(0);
    }

    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("关闭旧数据库外键失败 {}: {e}", path.display()))?;
    let transaction = conn
        .transaction()
        .map_err(|e| format!("打开旧数据库清理事务失败 {}: {e}", path.display()))?;
    let mut rows_deleted = 0;
    for table in tables {
        rows_deleted += transaction
            .execute(&format!("DELETE FROM {}", quote_identifier(&table)), [])
            .map_err(|e| format!("清空旧数据库表 {table} 失败: {e}"))?;
    }
    if sqlite_sequence_exists(&transaction)? {
        let _ = transaction.execute("DELETE FROM sqlite_sequence", []);
    }
    transaction
        .commit()
        .map_err(|e| format!("提交旧数据库清理事务失败 {}: {e}", path.display()))?;
    Ok(rows_deleted)
}

#[cfg(test)]
fn drop_user_schema_objects(path: &Path) -> Result<usize, String> {
    if !path.exists() {
        return Ok(0);
    }

    let mut conn = open_source_database(path)?;
    let objects = [
        ("TRIGGER", user_schema_object_names(&conn, "trigger")?),
        ("VIEW", user_schema_object_names(&conn, "view")?),
        ("INDEX", user_schema_object_names(&conn, "index")?),
        ("TABLE", user_schema_object_names(&conn, "table")?),
    ];
    if objects.iter().all(|(_, names)| names.is_empty()) {
        return Ok(0);
    }

    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("关闭旧数据库外键失败 {}: {e}", path.display()))?;
    let transaction = conn
        .transaction()
        .map_err(|e| format!("打开旧数据库 drop 事务失败 {}: {e}", path.display()))?;
    let mut dropped = 0;
    for (kind, names) in objects {
        for name in names {
            transaction
                .execute(
                    &format!("DROP {kind} IF EXISTS {}", quote_identifier(&name)),
                    [],
                )
                .map_err(|e| format!("删除旧数据库对象 {kind} {name} 失败: {e}"))?;
            dropped += 1;
        }
    }
    transaction
        .commit()
        .map_err(|e| format!("提交旧数据库 drop 事务失败 {}: {e}", path.display()))?;
    Ok(dropped)
}

#[cfg(test)]
fn open_source_database(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("打开迁移源数据库失败 {}: {e}", path.display()))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("设置迁移源数据库 busy_timeout 失败: {e}"))?;
    Ok(conn)
}

#[cfg(test)]
fn user_table_names(conn: &Connection) -> Result<Vec<String>, String> {
    user_schema_object_names(conn, "table")
}

#[cfg(test)]
fn user_schema_object_names(conn: &Connection, object_type: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT name
             FROM sqlite_master
             WHERE type = ?1
               AND name NOT LIKE 'sqlite_%'
               AND sql IS NOT NULL
             ORDER BY name",
        )
        .map_err(|e| format!("读取旧数据库 schema 失败: {e}"))?;
    let rows = statement
        .query_map([object_type], |row| row.get::<_, String>(0))
        .map_err(|e| format!("遍历旧数据库 schema 失败: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取旧数据库对象名称失败: {e}"))
}

#[cfg(test)]
fn sqlite_sequence_exists(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*)
         FROM sqlite_master
         WHERE type = 'table' AND name = 'sqlite_sequence'",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(|e| format!("检查 sqlite_sequence 失败: {e}"))
}

#[cfg(test)]
fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn sqlite_sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let Some(file_name) = path.file_name() else {
        return PathBuf::from(format!("{}{}", path.display(), suffix));
    };
    let mut sidecar_name = OsString::from(file_name);
    sidecar_name.push(suffix);
    path.with_file_name(sidecar_name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn default_policy_retains_migrated_source() {
        let temp = tempdir().unwrap();
        let db_path = temp.path().join("lime.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('providers.active_tab', 'service-providers')",
            [],
        )
        .unwrap();
        drop(conn);
        let before = fs::read(&db_path).unwrap();

        let policy = ProductDbMigrationCleanupPolicy::default();
        let report = cleanup_migrated_product_db_source(&db_path, policy).unwrap();

        assert_eq!(policy, ProductDbMigrationCleanupPolicy::Retain);
        assert!(!report.changed());
        assert_eq!(fs::read(&db_path).unwrap(), before);
    }

    #[test]
    fn parse_accepts_supported_policies() {
        assert_eq!(
            ProductDbMigrationCleanupPolicy::parse("retain").unwrap(),
            ProductDbMigrationCleanupPolicy::Retain
        );
        assert_eq!(
            ProductDbMigrationCleanupPolicy::parse("clear-rows").unwrap(),
            ProductDbMigrationCleanupPolicy::ClearRows
        );
        assert_eq!(
            ProductDbMigrationCleanupPolicy::parse("drop-tables").unwrap(),
            ProductDbMigrationCleanupPolicy::DropTables
        );
        assert_eq!(
            ProductDbMigrationCleanupPolicy::parse("delete-file").unwrap(),
            ProductDbMigrationCleanupPolicy::DeleteFile
        );
        assert!(ProductDbMigrationCleanupPolicy::parse("drop-db").is_err());
    }

    #[test]
    fn clear_rows_keeps_schema_without_user_rows() {
        let temp = tempdir().unwrap();
        let db_path = temp.path().join("lime.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('providers.active_tab', 'service-providers')",
            [],
        )
        .unwrap();
        drop(conn);

        let report = cleanup_migrated_product_db_source(
            &db_path,
            ProductDbMigrationCleanupPolicy::ClearRows,
        )
        .unwrap();

        assert_eq!(report.rows_deleted, 1);
        let conn = Connection::open(&db_path).unwrap();
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(table_count, 1);
        assert_eq!(row_count, 0);
    }

    #[test]
    fn drop_tables_removes_user_schema_and_keeps_database_file() {
        let temp = tempdir().unwrap();
        let db_path = temp.path().join("lime.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('providers.active_tab', 'service-providers')",
            [],
        )
        .unwrap();
        drop(conn);

        let report = cleanup_migrated_product_db_source(
            &db_path,
            ProductDbMigrationCleanupPolicy::DropTables,
        )
        .unwrap();

        assert!(report.schema_objects_dropped >= 1);
        assert!(db_path.is_file());
        let conn = Connection::open(&db_path).unwrap();
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 0);
    }

    #[test]
    fn delete_file_removes_database_and_sidecars() {
        let temp = tempdir().unwrap();
        let db_path = temp.path().join("lime.db");
        fs::write(&db_path, b"db").unwrap();
        fs::write(sqlite_sidecar_path(&db_path, "-wal"), b"wal").unwrap();
        fs::write(sqlite_sidecar_path(&db_path, "-shm"), b"shm").unwrap();
        fs::write(sqlite_sidecar_path(&db_path, "-journal"), b"journal").unwrap();

        let report = cleanup_migrated_product_db_source(
            &db_path,
            ProductDbMigrationCleanupPolicy::DeleteFile,
        )
        .unwrap();

        assert_eq!(report.database_files_deleted, 4);
        assert!(!db_path.exists());
        assert!(!sqlite_sidecar_path(&db_path, "-wal").exists());
        assert!(!sqlite_sidecar_path(&db_path, "-shm").exists());
        assert!(!sqlite_sidecar_path(&db_path, "-journal").exists());
    }
}
