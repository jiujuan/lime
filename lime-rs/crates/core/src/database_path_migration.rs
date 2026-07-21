use rusqlite::{Connection, DatabaseName, OpenFlags};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

use crate::migration_manifest::{capture_file_fingerprint, now_timestamp, DatabaseSnapshot};
use crate::product_db_migration_cleanup::remove_database_with_sidecars;

const USER_SIGNAL_TABLES: &[&str] = &[
    "contents",
    "agent_sessions",
    "general_chat_sessions",
    "materials",
    "provider_ui_state",
    "providers",
    "api_keys",
    "heartbeat_executions",
];
const USER_SIGNAL_QUERIES: &[&str] = &[
    "SELECT COUNT(*) FROM api_key_providers WHERE COALESCE(is_system, 0) = 0",
    "SELECT COUNT(*) FROM settings WHERE key NOT LIKE 'migrated_%' AND key NOT LIKE 'migration_%' AND key NOT LIKE 'cleaned_%'",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DatabaseSignal {
    pub user_signal: u64,
    pub schema_object_count: u64,
    pub schema_version: u32,
}

impl DatabaseSignal {
    pub(crate) fn has_schema(&self) -> bool {
        self.schema_object_count > 0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DatabaseMigrationOutcome {
    pub source: DatabaseSnapshot,
    pub target: DatabaseSnapshot,
    pub started_at: String,
    pub verified_at: String,
    pub cutover_at: String,
}

pub(crate) fn inspect_database_signal(path: &Path) -> Option<DatabaseSignal> {
    if !path.exists() {
        return None;
    }

    let conn = open_read_only_database(path).ok()?;
    let schema_object_count = conn
        .query_row(
            "SELECT COUNT(*)
             FROM sqlite_master
             WHERE type IN ('table', 'index', 'view', 'trigger')
               AND name NOT LIKE 'sqlite_%'
               AND sql IS NOT NULL",
            [],
            |row| row.get::<_, u64>(0),
        )
        .unwrap_or(0);
    let schema_version = conn
        .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
        .unwrap_or(0);

    let user_signal = USER_SIGNAL_TABLES
        .iter()
        .map(|table| {
            let sql = format!("SELECT COUNT(*) FROM {table}");
            conn.query_row(&sql, [], |row| row.get::<_, u64>(0))
                .unwrap_or(0)
        })
        .chain(USER_SIGNAL_QUERIES.iter().map(|sql| {
            conn.query_row(sql, [], |row| row.get::<_, u64>(0))
                .unwrap_or(0)
        }))
        .sum();

    Some(DatabaseSignal {
        user_signal,
        schema_object_count,
        schema_version,
    })
}

pub(crate) fn inspect_migration_source_database_signal(
    path: &Path,
) -> Result<Option<DatabaseSignal>, String> {
    if !path.exists() {
        return Ok(None);
    }
    if let Some(conflict_path) = migration_source_sidecar_path(path) {
        return Err(format!(
            "迁移源数据库存在活动伴生文件，拒绝自动迁移 {}（冲突文件：{}）",
            path.display(),
            conflict_path.display()
        ));
    }
    Ok(inspect_database_signal(path))
}

pub(crate) fn database_snapshot(
    path: &Path,
    signal: Option<&DatabaseSignal>,
) -> Result<DatabaseSnapshot, String> {
    if !path.exists() {
        return Ok(DatabaseSnapshot {
            fingerprint: None,
            schema_version: None,
            schema_object_count: None,
            user_signal: None,
        });
    }
    let signal = signal.ok_or_else(|| format!("读取数据库快照失败 {}", path.display()))?;
    Ok(DatabaseSnapshot {
        fingerprint: Some(capture_file_fingerprint(path)?),
        schema_version: Some(signal.schema_version),
        schema_object_count: Some(signal.schema_object_count),
        user_signal: Some(signal.user_signal),
    })
}

pub(crate) fn migrate_legacy_database(
    legacy_path: &Path,
    preferred_path: &Path,
) -> Result<DatabaseMigrationOutcome, String> {
    let started_at = now_timestamp();
    if let Some(conflict_path) = existing_database_file_set_path(preferred_path) {
        return Err(target_database_conflict_error(
            preferred_path,
            &conflict_path,
        ));
    }
    if let Some(parent) = preferred_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建数据库目录 {}: {error}", parent.display()))?;
    }

    let source_signal = inspect_migration_source_database_signal(legacy_path)?
        .ok_or_else(|| format!("迁移源数据库不存在或不可读 {}", legacy_path.display()))?;
    let source_snapshot = database_snapshot(legacy_path, Some(&source_signal))?;

    let source = open_read_only_database(legacy_path)
        .map_err(|error| format!("打开旧数据库失败 {}: {error}", legacy_path.display()))?;
    source
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("设置旧数据库 busy_timeout 失败: {error}"))?;
    let staging_path = migration_staging_path(preferred_path);
    if staging_path.exists() {
        return Err(format!(
            "数据库迁移暂存文件已存在，拒绝覆盖 {}",
            staging_path.display()
        ));
    }

    if let Err(error) = source.backup(DatabaseName::Main, &staging_path, None) {
        let _ = remove_database_with_sidecars(&staging_path);
        return Err(format!(
            "复制旧数据库 {} -> {} 失败: {error}",
            legacy_path.display(),
            preferred_path.display()
        ));
    }

    let verification = (|| -> Result<(DatabaseSnapshot, String), String> {
        if let Some(conflict_path) = migration_source_sidecar_path(legacy_path) {
            return Err(format!(
                "迁移源数据库在复制期间出现伴生文件，拒绝发布 {}（冲突文件：{}）",
                legacy_path.display(),
                conflict_path.display()
            ));
        }
        let source_after = database_snapshot(legacy_path, Some(&source_signal))?;
        if source_after != source_snapshot {
            return Err(format!(
                "迁移源数据库在复制期间发生变化，拒绝发布 {}",
                legacy_path.display()
            ));
        }
        verify_database_integrity(&staging_path)?;
        let staging_signal = inspect_database_signal(&staging_path)
            .ok_or_else(|| format!("读取迁移暂存数据库信号失败 {}", staging_path.display()))?;
        if staging_signal != source_signal {
            return Err(format!(
                "迁移暂存数据库与源数据库计数不一致 {} -> {}",
                legacy_path.display(),
                staging_path.display()
            ));
        }
        let target_snapshot = database_snapshot(&staging_path, Some(&staging_signal))?;
        Ok((target_snapshot, now_timestamp()))
    })();
    let (target_snapshot, verified_at) = match verification {
        Ok(result) => result,
        Err(error) => {
            let _ = remove_database_with_sidecars(&staging_path);
            return Err(error);
        }
    };

    if let Some(conflict_path) = existing_database_file_set_path(preferred_path) {
        let _ = remove_database_with_sidecars(&staging_path);
        return Err(target_database_conflict_error(
            preferred_path,
            &conflict_path,
        ));
    }

    if let Err(error) = fs::hard_link(&staging_path, preferred_path) {
        let _ = remove_database_with_sidecars(&staging_path);
        return Err(format!(
            "发布迁移数据库 {} -> {} 失败: {error}",
            staging_path.display(),
            preferred_path.display()
        ));
    }
    let cutover_at = now_timestamp();
    let published_signal = inspect_database_signal(preferred_path)
        .ok_or_else(|| format!("读取已发布迁移数据库信号失败 {}", preferred_path.display()));
    let published_snapshot = published_signal.and_then(|signal| {
        if signal != source_signal {
            return Err(format!(
                "已发布迁移数据库与源数据库计数不一致 {} -> {}",
                legacy_path.display(),
                preferred_path.display()
            ));
        }
        database_snapshot(preferred_path, Some(&signal))
    });
    let published_snapshot = match published_snapshot {
        Ok(snapshot) if snapshot == target_snapshot => snapshot,
        Ok(_) => {
            let _ = remove_database_with_sidecars(&staging_path);
            let _ = remove_database_with_sidecars(preferred_path);
            return Err(format!(
                "已发布迁移数据库指纹不一致 {}",
                preferred_path.display()
            ));
        }
        Err(error) => {
            let _ = remove_database_with_sidecars(&staging_path);
            let _ = remove_database_with_sidecars(preferred_path);
            return Err(error);
        }
    };
    let _ = remove_database_with_sidecars(&staging_path);

    Ok(DatabaseMigrationOutcome {
        source: source_snapshot,
        target: published_snapshot,
        started_at,
        verified_at,
        cutover_at,
    })
}

fn verify_database_integrity(path: &Path) -> Result<(), String> {
    let conn = open_read_only_database(path)
        .map_err(|error| format!("打开迁移暂存数据库失败 {}: {error}", path.display()))?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("执行 integrity_check 失败 {}: {error}", path.display()))?;
    if integrity != "ok" {
        return Err(format!(
            "迁移暂存数据库 integrity_check 未通过 {}: {integrity}",
            path.display()
        ));
    }

    let mut statement = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| format!("准备 foreign_key_check 失败 {}: {error}", path.display()))?;
    let mut rows = statement
        .query([])
        .map_err(|error| format!("执行 foreign_key_check 失败 {}: {error}", path.display()))?;
    if rows
        .next()
        .map_err(|error| format!("读取 foreign_key_check 失败 {}: {error}", path.display()))?
        .is_some()
    {
        return Err(format!(
            "迁移暂存数据库 foreign_key_check 未通过 {}",
            path.display()
        ));
    }
    Ok(())
}

fn existing_database_file_set_path(path: &Path) -> Option<PathBuf> {
    std::iter::once(path.to_path_buf())
        .chain(
            ["-wal", "-shm", "-journal"]
                .into_iter()
                .map(|suffix| sqlite_sidecar_path(path, suffix)),
        )
        .find(|candidate| candidate.exists())
}

fn migration_source_sidecar_path(path: &Path) -> Option<PathBuf> {
    ["-wal", "-shm", "-journal"]
        .into_iter()
        .map(|suffix| sqlite_sidecar_path(path, suffix))
        .find(|candidate| candidate.exists())
}

fn target_database_conflict_error(preferred_path: &Path, conflict_path: &Path) -> String {
    format!(
        "目标数据库已存在，拒绝覆盖 {}（冲突文件：{}）",
        preferred_path.display(),
        conflict_path.display()
    )
}

pub(crate) fn sqlite_sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut sidecar_path = path.as_os_str().to_os_string();
    sidecar_path.push(suffix);
    PathBuf::from(sidecar_path)
}

pub(crate) fn open_read_only_database(path: &Path) -> rusqlite::Result<Connection> {
    let mut uri =
        Url::from_file_path(path).map_err(|_| rusqlite::Error::InvalidPath(path.to_path_buf()))?;
    uri.query_pairs_mut().append_pair("immutable", "1");
    Connection::open_with_flags(
        uri.as_str(),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
}

fn migration_staging_path(preferred_path: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let pid = std::process::id();
    let file_name = preferred_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("database");
    preferred_path.with_file_name(format!(".{file_name}.migration-staging-{pid}-{nonce}.tmp"))
}
