use crate::RuntimeCoreError;
use app_server_protocol::SessionFileEntry;
use app_server_protocol::SessionFileEntryResponse;
use app_server_protocol::SessionFileGetOrCreateParams;
use app_server_protocol::SessionFileIdParams;
use app_server_protocol::SessionFileListResponse;
use app_server_protocol::SessionFileMeta;
use app_server_protocol::SessionFileMetaResponse;
use app_server_protocol::SessionFileMutationResponse;
use app_server_protocol::SessionFileReadResponse;
use app_server_protocol::SessionFileResolvePathResponse;
use app_server_protocol::SessionFileSaveParams;
use app_server_protocol::SessionFileUpdateMetaParams;
use lime_core::session_files;
use lime_core::session_files::SessionFileStorage;
use std::path::PathBuf;

pub(crate) async fn get_or_create_session_file(
    base_dir: PathBuf,
    params: SessionFileGetOrCreateParams,
) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .get_or_create_session(&session_id)
            .map(|meta| SessionFileMetaResponse {
                meta: protocol_meta_from_core(meta),
            })
    })
    .await
}

pub(crate) async fn update_session_file_meta(
    base_dir: PathBuf,
    params: SessionFileUpdateMetaParams,
) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .get_or_create_session(&session_id)
            .and_then(|_| {
                storage.update_meta(
                    &session_id,
                    normalize_optional(params.title),
                    normalize_optional(params.theme),
                    normalize_optional(params.creation_mode),
                )
            })
            .map(|meta| SessionFileMetaResponse {
                meta: protocol_meta_from_core(meta),
            })
    })
    .await
}

pub(crate) async fn save_session_file(
    base_dir: PathBuf,
    params: SessionFileSaveParams,
) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    let file_name = normalize_required(params.file_name, "fileName")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .save_file_with_metadata(&session_id, &file_name, &params.content, params.metadata)
            .map(|file| SessionFileEntryResponse {
                file: protocol_file_from_core(file),
            })
    })
    .await
}

pub(crate) async fn read_session_file(
    base_dir: PathBuf,
    params: SessionFileIdParams,
) -> Result<SessionFileReadResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    let file_name = normalize_required(params.file_name, "fileName")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .read_file(&session_id, &file_name)
            .map(|content| SessionFileReadResponse { content })
    })
    .await
}

pub(crate) async fn resolve_session_file_path(
    base_dir: PathBuf,
    params: SessionFileIdParams,
) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    let file_name = normalize_required(params.file_name, "fileName")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .resolve_file_path(&session_id, &file_name)
            .map(|path| SessionFileResolvePathResponse { path })
    })
    .await
}

pub(crate) async fn delete_session_file(
    base_dir: PathBuf,
    params: SessionFileIdParams,
) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    let file_name = normalize_required(params.file_name, "fileName")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .delete_file(&session_id, &file_name)
            .map(|_| SessionFileMutationResponse {})
    })
    .await
}

pub(crate) async fn list_session_files(
    base_dir: PathBuf,
    params: SessionFileGetOrCreateParams,
) -> Result<SessionFileListResponse, RuntimeCoreError> {
    let session_id = normalize_required(params.session_id, "sessionId")?;
    run_storage_operation(base_dir, move |storage| {
        storage
            .get_or_create_session(&session_id)
            .and_then(|_| storage.list_files(&session_id))
            .map(|files| SessionFileListResponse {
                files: files.into_iter().map(protocol_file_from_core).collect(),
            })
    })
    .await
}

async fn run_storage_operation<T>(
    base_dir: PathBuf,
    operation: impl FnOnce(SessionFileStorage) -> Result<T, String> + Send + 'static,
) -> Result<T, RuntimeCoreError>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let storage = SessionFileStorage::with_base_dir(base_dir)?;
        operation(storage)
    })
    .await
    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?
    .map_err(RuntimeCoreError::Backend)
}

fn normalize_required(value: String, field_name: &str) -> Result<String, RuntimeCoreError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "{field_name} is required for sessionFile"
        )));
    }
    Ok(value.to_string())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            None
        } else {
            Some(value.to_string())
        }
    })
}

fn protocol_meta_from_core(meta: session_files::SessionMeta) -> SessionFileMeta {
    SessionFileMeta {
        session_id: meta.session_id,
        title: meta.title,
        theme: meta.theme,
        creation_mode: meta.creation_mode,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        file_count: meta.file_count,
        total_size: meta.total_size,
    }
}

fn protocol_file_from_core(file: session_files::SessionFile) -> SessionFileEntry {
    SessionFileEntry {
        name: file.name,
        file_type: file.file_type,
        metadata: file.metadata,
        size: file.size,
        created_at: file.created_at,
        updated_at: file.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn session_file_operations_use_injected_agent_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let agent_root = temp.path().join("app-server");
        let base_dir = SessionFileStorage::base_dir_for_agent_root(&agent_root);
        let session_id = "session-injected-root";
        let file_name = "reports/alignment.md";

        save_session_file(
            base_dir.clone(),
            SessionFileSaveParams {
                session_id: session_id.to_string(),
                file_name: file_name.to_string(),
                content: "# storage alignment".to_string(),
                metadata: None,
            },
        )
        .await
        .expect("save session file");
        let resolved = resolve_session_file_path(
            base_dir,
            SessionFileIdParams {
                session_id: session_id.to_string(),
                file_name: file_name.to_string(),
            },
        )
        .await
        .expect("resolve session file path");

        let expected_session_root = agent_root
            .join("artifacts")
            .join("sessions")
            .join(session_id)
            .canonicalize()
            .expect("canonical session artifact root");
        assert!(PathBuf::from(resolved.path).starts_with(expected_session_root));
        assert!(!agent_root.join("sessions").exists());
    }
}
