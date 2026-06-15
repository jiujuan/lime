use chrono::{SecondsFormat, Utc};
use hex::encode as hex_encode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarRef {
    #[serde(rename = "ref")]
    pub ref_id: String,
    pub kind: String,
    pub relative_path: String,
    pub bytes: u64,
    pub sha256: String,
    pub content_status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarWriteRequest {
    pub session_id: String,
    pub kind: String,
    pub logical_id: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarStore {
    root: PathBuf,
}

impl SidecarStore {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, String> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root)
            .map_err(|error| format!("无法创建 sidecar 根目录 {}: {error}", root.display()))?;
        Ok(Self { root })
    }

    pub fn write_text(&self, request: &SidecarWriteRequest) -> Result<SidecarRef, String> {
        let relative_path = normalize_sidecar_relative_path(&request.relative_path)?;
        let path = self
            .root
            .join(relative_path_to_platform_path(&relative_path));
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建 sidecar 目录 {}: {error}", parent.display()))?;
        }

        fs::write(&path, request.content.as_bytes())
            .map_err(|error| format!("无法写入 sidecar 文件 {}: {error}", path.display()))?;

        let bytes = request.content.len() as u64;
        let sha256 = sha256_prefixed(request.content.as_bytes());
        let actual = sha256_prefixed(
            &fs::read(&path)
                .map_err(|error| format!("无法读取 sidecar 文件 {}: {error}", path.display()))?,
        );
        if actual != sha256 {
            return Err(format!(
                "sidecar 文件校验失败 {}: expected {sha256}, actual {actual}",
                path.display()
            ));
        }

        Ok(SidecarRef {
            ref_id: sidecar_ref_id(&request.kind, &request.session_id, &request.logical_id),
            kind: request.kind.trim().to_string(),
            relative_path,
            bytes,
            sha256,
            content_status: "available".to_string(),
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        })
    }

    pub fn read_text(&self, relative_path: &str) -> Option<String> {
        let relative_path = normalize_sidecar_relative_path(relative_path).ok()?;
        fs::read_to_string(
            self.root
                .join(relative_path_to_platform_path(&relative_path)),
        )
        .ok()
    }
}

pub fn normalize_sidecar_relative_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err("sidecar relative path must not be empty".to_string());
    }
    if trimmed.starts_with('/') || trimmed.contains("://") {
        return Err(format!("sidecar relative path must be relative: {path}"));
    }

    let mut parts = Vec::new();
    for component in Path::new(&trimmed).components() {
        match component {
            Component::Normal(value) => {
                let value = value
                    .to_str()
                    .ok_or_else(|| format!("sidecar path contains non-utf8 component: {path}"))?;
                if value.is_empty() {
                    continue;
                }
                parts.push(value.to_string());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("sidecar path must stay inside root: {path}"));
            }
        }
    }

    if parts.is_empty() {
        Err("sidecar relative path must include a file name".to_string())
    } else {
        Ok(parts.join("/"))
    }
}

pub fn session_scoped_relative_path(session_id: &str, file_name: &str) -> String {
    format!("sessions/{}/{}", safe_file_stem(session_id), file_name)
}

fn relative_path_to_platform_path(relative_path: &str) -> PathBuf {
    relative_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect()
}

fn sidecar_ref_id(kind: &str, session_id: &str, logical_id: &str) -> String {
    format!(
        "sidecar://{}/{}",
        safe_ref_part(kind),
        hex_encode(Sha256::digest(
            format!("{session_id}:{logical_id}").as_bytes()
        ))
    )
}

fn safe_file_stem(value: &str) -> String {
    let stem = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let stem = stem.trim_matches('_');
    if stem.is_empty() {
        "unknown".to_string()
    } else {
        stem.to_string()
    }
}

fn safe_ref_part(value: &str) -> String {
    let part = value
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    if part.is_empty() {
        "content".to_string()
    } else {
        part
    }
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", hex_encode(Sha256::digest(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_text_persists_relative_file_and_ref_metadata() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = SidecarStore::new(temp.path()).expect("store");

        let reference = store
            .write_text(&SidecarWriteRequest {
                session_id: "sess-a".to_string(),
                kind: "tool_output".to_string(),
                logical_id: "output-a".to_string(),
                relative_path: "sessions/sess-a/runtime-outputs/output-a.txt".to_string(),
                content: "hello".to_string(),
            })
            .expect("write");

        assert_eq!(
            reference.relative_path,
            "sessions/sess-a/runtime-outputs/output-a.txt"
        );
        assert_eq!(reference.bytes, 5);
        assert!(reference.sha256.starts_with("sha256:"));
        assert_eq!(
            store.read_text(&reference.relative_path).as_deref(),
            Some("hello")
        );
    }

    #[test]
    fn rejects_paths_outside_sidecar_root() {
        assert!(normalize_sidecar_relative_path("../secret.txt").is_err());
        assert!(normalize_sidecar_relative_path("/tmp/secret.txt").is_err());
        assert!(normalize_sidecar_relative_path("file://secret.txt").is_err());
    }
}
