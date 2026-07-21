use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const MIGRATION_MANIFEST_FILE_NAME: &str = "migration-manifest.json";
const MIGRATION_MANIFEST_SCHEMA_VERSION: &str = "storage-migration.v1";
const DATABASE_PATH_MIGRATION_ID: &str = "database-path-v1";
const COMPLETED_STATE: &str = "completed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileFingerprint {
    pub sha256: String,
    pub size_bytes: u64,
    pub modified_at_unix_nanos: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DatabaseSnapshot {
    pub fingerprint: Option<FileFingerprint>,
    pub schema_version: Option<u32>,
    pub schema_object_count: Option<u64>,
    pub user_signal: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DatabaseMigrationMode {
    Copied,
    AdoptedExisting,
    FreshInstall,
}

impl DatabaseMigrationMode {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Copied => "copied",
            Self::AdoptedExisting => "adopted-existing",
            Self::FreshInstall => "fresh-install",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DatabaseMigrationRecord {
    pub mode: DatabaseMigrationMode,
    pub source_path: Option<PathBuf>,
    pub source: Option<DatabaseSnapshot>,
    pub target_path: PathBuf,
    pub target: DatabaseSnapshot,
    pub started_at: String,
    pub verified_at: String,
    pub cutover_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestDatabaseSnapshot {
    fingerprint: Option<FileFingerprint>,
    schema_version: Option<u32>,
    schema_object_count: Option<u64>,
    user_signal: Option<u64>,
}

impl From<DatabaseSnapshot> for ManifestDatabaseSnapshot {
    fn from(value: DatabaseSnapshot) -> Self {
        Self {
            fingerprint: value.fingerprint,
            schema_version: value.schema_version,
            schema_object_count: value.schema_object_count,
            user_signal: value.user_signal,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestSource {
    kind: String,
    path: String,
    snapshot: ManifestDatabaseSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestTarget {
    relative_path: String,
    snapshot: ManifestDatabaseSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestPayload {
    schema_version: String,
    migration_id: String,
    state: String,
    mode: String,
    source: Option<ManifestSource>,
    target: ManifestTarget,
    started_at: String,
    verified_at: String,
    cutover_at: String,
    cleanup_authorized_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredManifest {
    #[serde(flatten)]
    payload: ManifestPayload,
    manifest_sha256: String,
}

pub(crate) fn now_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn capture_file_fingerprint(path: &Path) -> Result<FileFingerprint, String> {
    let bytes = fs::read(path)
        .map_err(|error| format!("读取迁移文件指纹失败 {}: {error}", path.display()))?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("读取迁移文件元数据失败 {}: {error}", path.display()))?;
    let modified_at_unix_nanos = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_nanos()).ok());

    Ok(FileFingerprint {
        sha256: sha256_hex(&bytes),
        size_bytes: metadata.len(),
        modified_at_unix_nanos,
    })
}

pub(crate) fn completed_manifest_exists(root: &Path) -> Result<bool, String> {
    let path = root.join(MIGRATION_MANIFEST_FILE_NAME);
    if !path.exists() {
        return Ok(false);
    }

    let content = fs::read(&path)
        .map_err(|error| format!("读取迁移 manifest 失败 {}: {error}", path.display()))?;
    let manifest: StoredManifest = serde_json::from_slice(&content)
        .map_err(|error| format!("解析迁移 manifest 失败 {}: {error}", path.display()))?;
    validate_manifest(&manifest, &path)?;
    Ok(true)
}

pub(crate) fn write_completed_manifest(
    root: &Path,
    record: DatabaseMigrationRecord,
) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("创建迁移 manifest 目录失败 {}: {error}", root.display()))?;
    if completed_manifest_exists(root)? {
        return Ok(());
    }

    let target_relative_path = record
        .target_path
        .strip_prefix(root)
        .map_err(|_| {
            format!(
                "迁移目标不在 manifest root 内: root={} target={}",
                root.display(),
                record.target_path.display()
            )
        })?
        .to_path_buf();
    validate_relative_path(&target_relative_path)?;

    let source = match (record.source_path, record.source) {
        (Some(path), Some(snapshot)) => Some(ManifestSource {
            kind: "legacy-product-db".to_string(),
            path: path.to_string_lossy().into_owned(),
            snapshot: snapshot.into(),
        }),
        (None, None) => None,
        _ => {
            return Err(
                "迁移 manifest 的 source path 与 snapshot 必须同时存在或同时为空".to_string(),
            )
        }
    };
    let payload = ManifestPayload {
        schema_version: MIGRATION_MANIFEST_SCHEMA_VERSION.to_string(),
        migration_id: DATABASE_PATH_MIGRATION_ID.to_string(),
        state: COMPLETED_STATE.to_string(),
        mode: record.mode.as_str().to_string(),
        source,
        target: ManifestTarget {
            relative_path: target_relative_path.to_string_lossy().into_owned(),
            snapshot: record.target.into(),
        },
        started_at: record.started_at,
        verified_at: record.verified_at,
        cutover_at: record.cutover_at,
        cleanup_authorized_at: None,
    };
    let manifest = StoredManifest {
        manifest_sha256: payload_sha256(&payload)?,
        payload,
    };
    let mut content = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("序列化迁移 manifest 失败: {error}"))?;
    content.push(b'\n');

    let manifest_path = root.join(MIGRATION_MANIFEST_FILE_NAME);
    let staging_path = manifest_staging_path(root);
    let mut staging = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging_path)
        .map_err(|error| {
            format!(
                "创建迁移 manifest 暂存文件失败 {}: {error}",
                staging_path.display()
            )
        })?;
    let publish_result = (|| -> Result<(), String> {
        staging.write_all(&content).map_err(|error| {
            format!(
                "写入迁移 manifest 暂存文件失败 {}: {error}",
                staging_path.display()
            )
        })?;
        staging.sync_all().map_err(|error| {
            format!(
                "同步迁移 manifest 暂存文件失败 {}: {error}",
                staging_path.display()
            )
        })?;
        drop(staging);

        match fs::hard_link(&staging_path, &manifest_path) {
            Ok(()) => Ok(()),
            Err(_) if manifest_path.exists() => completed_manifest_exists(root).map(|_| ()),
            Err(error) => Err(format!(
                "发布迁移 manifest 失败 {} -> {}: {error}",
                staging_path.display(),
                manifest_path.display()
            )),
        }
    })();
    let _ = fs::remove_file(&staging_path);
    publish_result
}

fn validate_manifest(manifest: &StoredManifest, path: &Path) -> Result<(), String> {
    if manifest.payload.schema_version != MIGRATION_MANIFEST_SCHEMA_VERSION {
        return Err(format!(
            "不支持的迁移 manifest schemaVersion {}: {}",
            manifest.payload.schema_version,
            path.display()
        ));
    }
    if manifest.payload.migration_id != DATABASE_PATH_MIGRATION_ID
        || manifest.payload.state != COMPLETED_STATE
    {
        return Err(format!(
            "迁移 manifest identity/state 非法 {}: migrationId={} state={}",
            path.display(),
            manifest.payload.migration_id,
            manifest.payload.state
        ));
    }
    validate_relative_path(Path::new(&manifest.payload.target.relative_path))?;
    let expected_sha256 = payload_sha256(&manifest.payload)?;
    if manifest.manifest_sha256 != expected_sha256 {
        return Err(format!(
            "迁移 manifest 摘要不匹配 {}: expected={} actual={}",
            path.display(),
            expected_sha256,
            manifest.manifest_sha256
        ));
    }
    Ok(())
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(format!(
            "迁移 manifest target relativePath 非法: {}",
            path.display()
        ));
    }
    Ok(())
}

fn payload_sha256(payload: &ManifestPayload) -> Result<String, String> {
    let content = serde_json::to_vec(payload)
        .map_err(|error| format!("序列化迁移 manifest payload 失败: {error}"))?;
    Ok(sha256_hex(&content))
}

fn sha256_hex(content: &[u8]) -> String {
    Sha256::digest(content)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn manifest_staging_path(root: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    root.join(format!(
        ".migration-manifest-{}-{nonce}.tmp",
        std::process::id()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn empty_snapshot() -> DatabaseSnapshot {
        DatabaseSnapshot {
            fingerprint: None,
            schema_version: None,
            schema_object_count: None,
            user_signal: None,
        }
    }

    #[test]
    fn manifest_round_trip_validates_digest_and_relative_target() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("app-server");
        let timestamp = now_timestamp();

        write_completed_manifest(
            &root,
            DatabaseMigrationRecord {
                mode: DatabaseMigrationMode::FreshInstall,
                source_path: None,
                source: None,
                target_path: root.join("lime.db"),
                target: empty_snapshot(),
                started_at: timestamp.clone(),
                verified_at: timestamp.clone(),
                cutover_at: timestamp,
            },
        )
        .unwrap();

        assert!(completed_manifest_exists(&root).unwrap());
        let content = fs::read_to_string(root.join(MIGRATION_MANIFEST_FILE_NAME)).unwrap();
        assert!(content.contains("\"schemaVersion\": \"storage-migration.v1\""));
        assert!(content.contains("\"migrationId\": \"database-path-v1\""));
        assert!(content.contains("\"relativePath\": \"lime.db\""));
        assert!(content.contains("\"cleanupAuthorizedAt\": null"));
    }

    #[test]
    fn manifest_tampering_fails_closed() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("app-server");
        let timestamp = now_timestamp();
        write_completed_manifest(
            &root,
            DatabaseMigrationRecord {
                mode: DatabaseMigrationMode::FreshInstall,
                source_path: None,
                source: None,
                target_path: root.join("lime.db"),
                target: empty_snapshot(),
                started_at: timestamp.clone(),
                verified_at: timestamp.clone(),
                cutover_at: timestamp,
            },
        )
        .unwrap();
        let path = root.join(MIGRATION_MANIFEST_FILE_NAME);
        let content = fs::read_to_string(&path)
            .unwrap()
            .replace("fresh-install", "adopted-existing");
        fs::write(&path, content).unwrap();

        let error = completed_manifest_exists(&root).unwrap_err();
        assert!(error.contains("摘要不匹配"));
    }
}
