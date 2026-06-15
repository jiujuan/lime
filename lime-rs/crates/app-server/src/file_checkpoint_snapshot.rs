use crate::runtime::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use app_server_protocol::AgentEvent;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct FileCheckpointSnapshotSaveRequest {
    pub session_id: String,
    pub checkpoint_id: String,
    pub path: String,
    pub content: String,
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FileCheckpointSnapshotReadRequest {
    pub session_id: String,
    pub file_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileCheckpointSnapshotRecord {
    pub file_name: String,
    pub sidecar_ref: SidecarRef,
}

pub trait FileCheckpointSnapshotStore: Send + Sync {
    fn save_file_checkpoint_snapshot(
        &self,
        request: &FileCheckpointSnapshotSaveRequest,
    ) -> Result<Option<FileCheckpointSnapshotRecord>, String>;

    fn read_file_checkpoint_snapshot(
        &self,
        request: &FileCheckpointSnapshotReadRequest,
    ) -> Option<String>;
}

#[derive(Debug, Default)]
pub struct NoopFileCheckpointSnapshotStore;

impl FileCheckpointSnapshotStore for NoopFileCheckpointSnapshotStore {
    fn save_file_checkpoint_snapshot(
        &self,
        _request: &FileCheckpointSnapshotSaveRequest,
    ) -> Result<Option<FileCheckpointSnapshotRecord>, String> {
        Ok(None)
    }

    fn read_file_checkpoint_snapshot(
        &self,
        _request: &FileCheckpointSnapshotReadRequest,
    ) -> Option<String> {
        None
    }
}

#[derive(Debug, Clone, Default)]
pub struct FilesystemFileCheckpointSnapshotStore {
    sidecar_store: Option<SidecarStore>,
}

impl FilesystemFileCheckpointSnapshotStore {
    pub fn new() -> Self {
        Self {
            sidecar_store: None,
        }
    }

    pub fn with_base_dir(base_dir: impl AsRef<std::path::Path>) -> Self {
        Self::with_sidecar_root(base_dir)
    }

    pub fn with_sidecar_root(root: impl AsRef<std::path::Path>) -> Self {
        let sidecar_store = SidecarStore::new(root).ok();
        Self { sidecar_store }
    }

    fn sidecar_store(&self) -> Result<&SidecarStore, String> {
        self.sidecar_store.as_ref().ok_or_else(|| {
            "file checkpoint snapshot store 缺少显式 sidecar root，不能写入默认 sessions 目录"
                .to_string()
        })
    }
}

impl FileCheckpointSnapshotStore for FilesystemFileCheckpointSnapshotStore {
    fn save_file_checkpoint_snapshot(
        &self,
        request: &FileCheckpointSnapshotSaveRequest,
    ) -> Result<Option<FileCheckpointSnapshotRecord>, String> {
        let file_name = file_checkpoint_snapshot_file_name(
            request.checkpoint_id.as_str(),
            request.path.as_str(),
        );
        let sidecar_ref = self
            .sidecar_store()?
            .write_text(&SidecarWriteRequest {
                session_id: request.session_id.clone(),
                kind: "file_checkpoint".to_string(),
                logical_id: request.checkpoint_id.clone(),
                relative_path: session_scoped_relative_path(
                    request.session_id.as_str(),
                    &file_name,
                ),
                content: request.content.clone(),
            })
            .map_err(|error| format!("保存文件快照内容失败: {error}"))?;
        Ok(Some(FileCheckpointSnapshotRecord {
            file_name,
            sidecar_ref,
        }))
    }

    fn read_file_checkpoint_snapshot(
        &self,
        request: &FileCheckpointSnapshotReadRequest,
    ) -> Option<String> {
        self.sidecar_store.as_ref()?.read_text(
            session_scoped_relative_path(request.session_id.as_str(), request.file_name.as_str())
                .as_str(),
        )
    }
}

pub fn persist_runtime_file_checkpoint_snapshot(
    event: &mut AgentEvent,
    session_id: &str,
    snapshot_store: &dyn FileCheckpointSnapshotStore,
) -> Result<(), String> {
    if event.event_type != "file.changed" {
        return Ok(());
    }
    let Some(path) = string_field(&event.payload, &["path", "filePath", "file_path"]) else {
        return Ok(());
    };
    let Some(content) = previous_content_from_payload(&event.payload) else {
        return Ok(());
    };
    let checkpoint_id = string_field(
        &event.payload,
        &[
            "checkpointRef",
            "checkpoint_ref",
            "checkpointId",
            "checkpoint_id",
        ],
    )
    .unwrap_or_else(|| {
        stable_scope_id(
            "checkpoint:file",
            format!("{}:{}", event.event_id, path).as_str(),
        )
    });
    let metadata = json!({
        "eventId": event.event_id,
        "sequence": event.sequence,
        "turnId": event.turn_id,
        "path": path,
        "checkpointId": checkpoint_id,
        "kind": "file_checkpoint_previous_content",
    });

    let Some(snapshot) =
        snapshot_store.save_file_checkpoint_snapshot(&FileCheckpointSnapshotSaveRequest {
            session_id: session_id.to_string(),
            checkpoint_id,
            path,
            content,
            metadata,
        })?
    else {
        return Ok(());
    };
    attach_checkpoint_snapshot_ref(&mut event.payload, snapshot.file_name.as_str());
    attach_sidecar_ref(&mut event.payload, &snapshot.sidecar_ref);
    Ok(())
}

fn attach_checkpoint_snapshot_ref(payload: &mut Value, file_name: &str) {
    let Value::Object(object) = payload else {
        return;
    };
    remove_previous_content_fields(object);
    object.insert(
        "checkpointSnapshotFile".to_string(),
        Value::String(file_name.to_string()),
    );

    let change = object.entry("change").or_insert_with(|| json!({}));
    if let Value::Object(change_object) = change {
        remove_previous_content_fields(change_object);
        change_object.insert(
            "previousContentSnapshotFile".to_string(),
            Value::String(file_name.to_string()),
        );
    }
}

fn attach_sidecar_ref(payload: &mut Value, sidecar_ref: &SidecarRef) {
    let Value::Object(object) = payload else {
        return;
    };
    object.insert(
        "sidecarRef".to_string(),
        serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({})),
    );
    let change = object.entry("change").or_insert_with(|| json!({}));
    if let Value::Object(change_object) = change {
        change_object.insert(
            "sidecarRef".to_string(),
            serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({})),
        );
    }
}

fn remove_previous_content_fields(object: &mut Map<String, Value>) {
    for key in [
        "previousContent",
        "previous_content",
        "beforeContent",
        "before_content",
        "oldContent",
        "old_content",
    ] {
        object.remove(key);
    }
}

fn previous_content_from_payload(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &[
            "previousContent",
            "previous_content",
            "beforeContent",
            "before_content",
            "oldContent",
            "old_content",
        ],
    )
    .or_else(|| {
        let change = payload.get("change")?;
        string_field(
            change,
            &[
                "previousContent",
                "previous_content",
                "beforeContent",
                "before_content",
                "oldContent",
                "old_content",
            ],
        )
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(value_string)
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn file_checkpoint_snapshot_file_name(checkpoint_id: &str, path: &str) -> String {
    format!(
        "runtime-file-checkpoints/{:016x}.txt",
        stable_hash(format!("{checkpoint_id}:{path}").as_str())
    )
}

fn stable_scope_id(prefix: &str, value: &str) -> String {
    format!("{prefix}:{:016x}", stable_hash(value))
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
