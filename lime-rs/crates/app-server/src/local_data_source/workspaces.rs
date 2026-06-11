use super::data_error;
use crate::RuntimeCoreError;
use app_server_protocol::WorkspaceDeleteParams;
use app_server_protocol::WorkspaceDeleteResponse;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspaceEnsureProjectParams;
use app_server_protocol::WorkspaceEnsureProjectResponse;
use app_server_protocol::WorkspaceEnsureReadyResponse;
use app_server_protocol::WorkspaceListResponse;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceProjectPathResolveResponse;
use app_server_protocol::WorkspaceProjectsRootReadResponse;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceReadResponse;
use app_server_protocol::WorkspaceUpdateParams;
use app_server_protocol::WorkspaceUpdateResponse;
use chrono::Utc;
use lime_core::app_paths;
use lime_core::database;
use lime_core::database::DbConnection;
use rusqlite::params;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use serde_json::json;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use uuid::Uuid;

const LEGACY_DEFAULT_WORKSPACE_ID: &str = "workspace-default";
const DEFAULT_PROJECT_NAME: &str = "默认项目";

pub(crate) fn normalize_workspace_filter(value: Option<&str>) -> Option<&str> {
    let value = value?.trim();
    if value.is_empty() || value == LEGACY_DEFAULT_WORKSPACE_ID {
        None
    } else {
        Some(value)
    }
}

pub(crate) fn list_workspaces(
    db: &DbConnection,
) -> Result<WorkspaceListResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                    created_at, updated_at, icon, color, is_favorite, is_archived,
                    tags_json, default_persona_id
             FROM workspaces
             ORDER BY updated_at DESC",
        )
        .map_err(data_error)?;
    let workspaces = stmt
        .query_map([], row_to_workspace_value)
        .map_err(data_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(data_error)?;
    Ok(WorkspaceListResponse { workspaces })
}

pub(crate) fn read_workspace(
    db: &DbConnection,
    params: WorkspaceReadParams,
) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace = read_workspace_by_id(&conn, &params.id).map_err(data_error)?;
    Ok(WorkspaceReadResponse { workspace })
}

pub(crate) fn update_workspace(
    db: &DbConnection,
    params: WorkspaceUpdateParams,
) -> Result<WorkspaceUpdateResponse, RuntimeCoreError> {
    let id = params.id.trim();
    if id.is_empty() {
        return Err(data_error("workspace id is required"));
    }

    let conn = database::lock_db(db).map_err(data_error)?;
    if read_workspace_by_id(&conn, id)
        .map_err(data_error)?
        .is_none()
    {
        return Err(data_error(format!("workspace not found: {id}")));
    }

    let name = params
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let root_path = params
        .root_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let settings_json = match params.settings {
        Some(settings) => Some(serde_json::to_string(&settings).map_err(data_error)?),
        None => None,
    };
    let tags_json = match params.tags {
        Some(tags) => Some(serde_json::to_string(&tags).map_err(data_error)?),
        None => None,
    };
    let now = Utc::now().timestamp_millis();

    conn.execute(
        "UPDATE workspaces
         SET name = COALESCE(?, name),
             root_path = COALESCE(?, root_path),
             settings_json = COALESCE(?, settings_json),
             icon = COALESCE(?, icon),
             color = COALESCE(?, color),
             is_favorite = COALESCE(?, is_favorite),
             is_archived = COALESCE(?, is_archived),
             tags_json = COALESCE(?, tags_json),
             default_persona_id = COALESCE(?, default_persona_id),
             updated_at = ?
         WHERE id = ?",
        params![
            name,
            root_path,
            settings_json,
            params.icon,
            params.color,
            params.is_favorite,
            params.is_archived,
            tags_json,
            params.default_persona_id,
            now,
            id,
        ],
    )
    .map_err(|error| data_error(format!("update workspace failed: {error}")))?;

    let workspace = read_workspace_by_id(&conn, id)
        .map_err(data_error)?
        .ok_or_else(|| data_error("failed to reload updated workspace"))?;
    Ok(WorkspaceUpdateResponse { workspace })
}

pub(crate) fn delete_workspace(
    db: &DbConnection,
    params: WorkspaceDeleteParams,
) -> Result<WorkspaceDeleteResponse, RuntimeCoreError> {
    let id = params.id.trim();
    if id.is_empty() {
        return Err(data_error("workspace id is required"));
    }
    if params.delete_directory == Some(true) {
        return Err(data_error(
            "workspace/delete does not support deleting local directories",
        ));
    }

    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace = read_workspace_by_id(&conn, id)
        .map_err(data_error)?
        .ok_or_else(|| data_error(format!("workspace not found: {id}")))?;
    if workspace
        .get("is_default")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(data_error("default workspace cannot be deleted"));
    }

    let affected = conn
        .execute("DELETE FROM workspaces WHERE id = ?", params![id])
        .map_err(|error| data_error(format!("delete workspace failed: {error}")))?;
    Ok(WorkspaceDeleteResponse {
        deleted: affected > 0,
    })
}

pub(crate) fn read_workspace_by_path(
    db: &DbConnection,
    params: WorkspacePathReadParams,
) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace =
        read_workspace_by_root_path(&conn, Path::new(&params.root_path)).map_err(data_error)?;
    Ok(WorkspaceReadResponse { workspace })
}

pub(crate) fn ensure_project_workspace(
    db: &DbConnection,
    params: WorkspaceEnsureProjectParams,
) -> Result<WorkspaceEnsureProjectResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let root = PathBuf::from(params.root_path.trim());
    if params.root_path.trim().is_empty() {
        return Err(data_error("workspace root_path is required"));
    }

    let root_path = root
        .to_str()
        .ok_or_else(|| data_error("invalid workspace root_path"))?
        .to_string();
    if let Some(existing) =
        read_workspace_by_root_path(&conn, Path::new(&root_path)).map_err(data_error)?
    {
        let existed = root.is_dir();
        fs::create_dir_all(&root).map_err(data_error)?;
        return Ok(WorkspaceEnsureProjectResponse {
            workspace: existing,
            created: false,
            root_created: !existed,
        });
    }

    let workspace_type = normalize_workspace_type(params.workspace_type.as_deref())?;
    let name = normalize_workspace_name(&params.name, &root_path);
    let existed = root.is_dir();
    fs::create_dir_all(&root).map_err(data_error)?;

    let now = Utc::now().timestamp_millis();
    let id = Uuid::new_v4().to_string();
    let icon = default_workspace_icon(workspace_type);
    conn.execute(
        "INSERT INTO workspaces (
            id, name, workspace_type, root_path, is_default, settings_json,
            icon, color, is_favorite, is_archived, tags_json, default_persona_id,
            created_at, updated_at
         )
         VALUES (?, ?, ?, ?, 0, '{}', ?, NULL, 0, 0, '[]', NULL, ?, ?)",
        params![id, name, workspace_type, root_path, icon, now, now],
    )
    .map_err(|error| data_error(format!("ensure workspace failed: {error}")))?;

    let workspace = read_workspace_by_id(&conn, &id)
        .map_err(data_error)?
        .ok_or_else(|| data_error("failed to reload ensured workspace"))?;
    Ok(WorkspaceEnsureProjectResponse {
        workspace,
        created: true,
        root_created: !existed,
    })
}

pub(crate) fn read_default_workspace(
    db: &DbConnection,
) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace = read_current_default_workspace(&conn).map_err(data_error)?;
    Ok(WorkspaceReadResponse { workspace })
}

pub(crate) fn ensure_default_workspace(
    db: &DbConnection,
) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace = ensure_current_default_workspace(&conn).map_err(data_error)?;
    Ok(WorkspaceReadResponse {
        workspace: Some(workspace),
    })
}

pub(crate) fn ensure_workspace_ready(
    db: &DbConnection,
    params: WorkspaceEnsureParams,
) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let workspace = read_workspace_by_id(&conn, &params.id)
        .map_err(data_error)?
        .ok_or_else(|| data_error(format!("workspace not found: {}", params.id)))?;
    let root_path = workspace
        .get("root_path")
        .and_then(Value::as_str)
        .ok_or_else(|| data_error("workspace root_path missing"))?;
    let root = PathBuf::from(root_path);
    let existed = root.is_dir();
    fs::create_dir_all(&root).map_err(data_error)?;
    Ok(WorkspaceEnsureReadyResponse {
        result: json!({
            "workspaceId": params.id,
            "rootPath": root.to_string_lossy(),
            "existed": existed,
            "created": !existed,
            "repaired": !existed,
            "relocated": false,
            "previousRootPath": null,
            "warning": null,
        }),
    })
}

pub(crate) fn read_workspace_projects_root(
) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
    let root_path = app_paths::resolve_projects_dir().map_err(data_error)?;
    Ok(WorkspaceProjectsRootReadResponse {
        root_path: root_path.to_string_lossy().to_string(),
    })
}

pub(crate) fn resolve_workspace_project_path(
    params: WorkspaceProjectPathResolveParams,
) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
    let root_dir = match params
        .parent_root_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
        Some(path) => PathBuf::from(path),
        None => app_paths::resolve_projects_dir().map_err(data_error)?,
    };
    Ok(WorkspaceProjectPathResolveResponse {
        root_path: root_dir
            .join(sanitize_project_dir_name(&params.name))
            .to_string_lossy()
            .to_string(),
    })
}

fn row_to_workspace_value(row: &Row<'_>) -> Result<Value, rusqlite::Error> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let workspace_type: String = row.get(2)?;
    let root_path: String = row.get(3)?;
    let is_default: bool = row.get(4)?;
    let settings_json: String = row.get(5)?;
    let created_at: i64 = row.get(6)?;
    let updated_at: i64 = row.get(7)?;
    let icon: Option<String> = row.get(8)?;
    let color: Option<String> = row.get(9)?;
    let is_favorite: bool = row.get::<_, Option<bool>>(10)?.unwrap_or(false);
    let is_archived: bool = row.get::<_, Option<bool>>(11)?.unwrap_or(false);
    let tags_json: Option<String> = row.get(12)?;
    let default_persona_id: Option<String> = row.get(13)?;
    let settings: Value = serde_json::from_str(&settings_json).unwrap_or_else(|_| json!({}));
    let tags: Vec<String> = tags_json
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();

    Ok(json!({
        "id": id,
        "name": name,
        "workspace_type": workspace_type,
        "root_path": root_path,
        "is_default": is_default,
        "settings": settings,
        "created_at": created_at,
        "updated_at": updated_at,
        "icon": icon,
        "color": color,
        "is_favorite": is_favorite,
        "is_archived": is_archived,
        "tags": tags,
        "default_persona_id": default_persona_id,
    }))
}

fn read_workspace_by_id(conn: &rusqlite::Connection, id: &str) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE id = ?",
        params![id],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read workspace failed: {error}"))
}

fn read_workspace_by_root_path(
    conn: &rusqlite::Connection,
    root_path: &Path,
) -> Result<Option<Value>, String> {
    let root_path = root_path
        .to_str()
        .ok_or_else(|| "invalid workspace root path".to_string())?;
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE root_path = ?",
        params![root_path],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read workspace by path failed: {error}"))
}

fn read_default_workspace_value(conn: &rusqlite::Connection) -> Result<Option<Value>, String> {
    conn.query_row(
        "SELECT id, name, workspace_type, root_path, is_default, settings_json,
                created_at, updated_at, icon, color, is_favorite, is_archived,
                tags_json, default_persona_id
         FROM workspaces WHERE is_default = 1",
        [],
        row_to_workspace_value,
    )
    .optional()
    .map_err(|error| format!("read default workspace failed: {error}"))
}

fn read_current_default_workspace(conn: &rusqlite::Connection) -> Result<Option<Value>, String> {
    match read_default_workspace_value(conn)? {
        Some(workspace) if workspace_id(&workspace) != Some(LEGACY_DEFAULT_WORKSPACE_ID) => {
            Ok(Some(workspace))
        }
        _ => Ok(None),
    }
}

fn ensure_current_default_workspace(conn: &rusqlite::Connection) -> Result<Value, String> {
    if let Some(workspace) = read_current_default_workspace(conn)? {
        return Ok(workspace);
    }

    let default_project_path = app_paths::resolve_default_project_dir()?;
    if let Some(existing) = read_workspace_by_root_path(conn, &default_project_path)? {
        if workspace_id(&existing) != Some(LEGACY_DEFAULT_WORKSPACE_ID) {
            set_default_workspace(conn, workspace_id(&existing).unwrap_or_default())?;
            return read_workspace_by_root_path(conn, &default_project_path)?
                .ok_or_else(|| "failed to reload default workspace".to_string());
        }
    }

    let creation_path = if read_workspace_by_root_path(conn, &default_project_path)?.is_some() {
        let file_name = default_project_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("default");
        default_project_path.with_file_name(format!("{file_name}-current"))
    } else {
        default_project_path
    };
    fs::create_dir_all(&creation_path)
        .map_err(|error| format!("create default project directory failed: {error}"))?;

    if let Some(existing) = read_workspace_by_root_path(conn, &creation_path)? {
        set_default_workspace(conn, workspace_id(&existing).unwrap_or_default())?;
        return read_workspace_by_root_path(conn, &creation_path)?
            .ok_or_else(|| "failed to reload default workspace".to_string());
    }

    let now = Utc::now().timestamp_millis();
    let id = Uuid::new_v4().to_string();
    let root_path = creation_path
        .to_str()
        .ok_or_else(|| "invalid default project path".to_string())?
        .to_string();
    conn.execute(
        "INSERT INTO workspaces (
            id, name, workspace_type, root_path, is_default, settings_json,
            icon, color, is_favorite, is_archived, tags_json, default_persona_id,
            created_at, updated_at
         )
         VALUES (?, ?, ?, ?, 1, '{}', NULL, NULL, 0, 0, '[]', NULL, ?, ?)",
        params![id, DEFAULT_PROJECT_NAME, "persistent", root_path, now, now],
    )
    .map_err(|error| format!("create default workspace failed: {error}"))?;
    set_default_workspace(conn, &id)?;
    read_workspace_by_id(conn, &id)?.ok_or_else(|| "failed to load default workspace".to_string())
}

fn set_default_workspace(conn: &rusqlite::Connection, id: &str) -> Result<(), String> {
    conn.execute("UPDATE workspaces SET is_default = 0", [])
        .map_err(|error| format!("clear default workspace failed: {error}"))?;
    let updated_at = Utc::now().timestamp_millis();
    let affected = conn
        .execute(
            "UPDATE workspaces SET is_default = 1, updated_at = ? WHERE id = ?",
            params![updated_at, id],
        )
        .map_err(|error| format!("set default workspace failed: {error}"))?;
    if affected == 0 {
        return Err(format!("workspace not found: {id}"));
    }
    Ok(())
}

fn workspace_id(value: &Value) -> Option<&str> {
    value.get("id").and_then(Value::as_str)
}

fn normalize_workspace_type(value: Option<&str>) -> Result<&'static str, RuntimeCoreError> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok("general"),
        Some("persistent") => Ok("persistent"),
        Some("temporary") => Ok("temporary"),
        Some("general") => Ok("general"),
        Some(value) => Err(data_error(format!(
            "unsupported workspace_type '{value}', only persistent / temporary / general are supported"
        ))),
    }
}

fn normalize_workspace_name(name: &str, root_path: &str) -> String {
    let trimmed = name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    Path::new(root_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("未命名项目")
        .to_string()
}

fn default_workspace_icon(workspace_type: &str) -> Option<&'static str> {
    match workspace_type {
        "general" => Some("💬"),
        "persistent" | "temporary" => Some("📁"),
        _ => None,
    }
}

fn sanitize_project_dir_name(name: &str) -> String {
    let sanitized: String = name
        .trim()
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ if ch.is_control() => '_',
            _ => ch,
        })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed
    }
}
