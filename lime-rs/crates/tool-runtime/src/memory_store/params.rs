use super::definitions::{
    MEMORY_ADD_NOTE_TOOL_NAME, MEMORY_LIST_TOOL_NAME, MEMORY_READ_TOOL_NAME,
    MEMORY_SEARCH_TOOL_NAME,
};
use crate::tool_executor::{RuntimeToolExecutionError, RuntimeToolPolicyErrorKind};
use app_server_protocol::{MemoryStoreRootParams, MemoryStoreScope, MemoryStoreSearchMatchMode};
use serde_json::Value;
use std::path::{Path, PathBuf};

pub fn check_runtime_memory_store_permissions(
    tool_name: &str,
    params: &Value,
    working_directory: &Path,
) -> Result<(), RuntimeToolExecutionError> {
    match tool_name {
        MEMORY_LIST_TOOL_NAME | MEMORY_READ_TOOL_NAME => {
            check_memory_path_permission(params, working_directory, false)
        }
        MEMORY_SEARCH_TOOL_NAME => check_memory_path_permission(params, working_directory, false),
        MEMORY_ADD_NOTE_TOOL_NAME => {
            let Some(content) = string_param(params, &["content"]) else {
                return Err(runtime_memory_store_permission_error(
                    "memory_add_note requires content",
                ));
            };
            if content.trim().is_empty() {
                return Err(runtime_memory_store_permission_error(
                    "memory_add_note requires non-empty content",
                ));
            }
            check_memory_path_permission(params, working_directory, true)
        }
        _ => Err(runtime_memory_store_permission_error(format!(
            "unknown memory tool '{tool_name}'"
        ))),
    }
}

pub(crate) fn root_params(
    params: &Value,
    working_directory: &Path,
) -> Result<MemoryStoreRootParams, RuntimeToolExecutionError> {
    let scope = memory_scope_param(params)?;
    let workspace_root = match scope {
        MemoryStoreScope::Global => None,
        MemoryStoreScope::Workspace => Some(context_workspace_root(working_directory)?),
    };
    Ok(MemoryStoreRootParams {
        scope,
        workspace_root,
    })
}

pub(crate) fn string_param<'a>(params: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub(crate) fn required_string_param(
    params: &Value,
    keys: &[&str],
) -> Result<String, RuntimeToolExecutionError> {
    string_param(params, keys)
        .map(str::to_string)
        .ok_or_else(|| {
            runtime_memory_store_error(format!("Missing required parameter: {}", keys[0]))
        })
}

pub(crate) fn usize_param(
    params: &Value,
    keys: &[&str],
) -> Result<Option<usize>, RuntimeToolExecutionError> {
    let Some(value) = keys.iter().filter_map(|key| params.get(*key)).next() else {
        return Ok(None);
    };
    if let Some(number) = value.as_u64() {
        return usize::try_from(number)
            .map(Some)
            .map_err(|_| runtime_memory_store_error(format!("{} is too large", keys[0])));
    }
    Err(runtime_memory_store_error(format!(
        "{} must be a non-negative integer",
        keys[0]
    )))
}

pub(crate) fn bool_param(params: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn string_array_param(
    params: &Value,
    keys: &[&str],
) -> Result<Vec<String>, RuntimeToolExecutionError> {
    let value = keys
        .iter()
        .filter_map(|key| params.get(*key))
        .next()
        .ok_or_else(|| {
            runtime_memory_store_error(format!("Missing required parameter: {}", keys[0]))
        })?;
    let Some(items) = value.as_array() else {
        return Err(runtime_memory_store_error(format!(
            "{} must be an array of strings",
            keys[0]
        )));
    };
    let queries = items
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if queries.is_empty() {
        return Err(runtime_memory_store_error(
            "queries must include at least one non-empty string",
        ));
    }
    Ok(queries)
}

pub(crate) fn match_mode_param(
    params: &Value,
) -> Result<MemoryStoreSearchMatchMode, RuntimeToolExecutionError> {
    match string_param(params, &["matchMode", "match_mode"]).unwrap_or("any") {
        "any" => Ok(MemoryStoreSearchMatchMode::Any),
        "allOnSameLine" | "all_on_same_line" => Ok(MemoryStoreSearchMatchMode::AllOnSameLine),
        "allWithinLines" | "all_within_lines" => Ok(MemoryStoreSearchMatchMode::AllWithinLines),
        _ => Err(runtime_memory_store_error(
            "matchMode must be any, allOnSameLine, or allWithinLines",
        )),
    }
}

pub(crate) fn runtime_memory_store_error(message: impl Into<String>) -> RuntimeToolExecutionError {
    let message = message.into();
    RuntimeToolExecutionError::new(
        message.clone(),
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(message)),
    )
}

fn memory_scope_param(params: &Value) -> Result<MemoryStoreScope, RuntimeToolExecutionError> {
    string_param(params, &["scope"])
        .map(|value| match value {
            "global" => Ok(MemoryStoreScope::Global),
            "workspace" | "" => Ok(MemoryStoreScope::Workspace),
            _ => Err(runtime_memory_store_error(
                "scope must be either 'workspace' or 'global'",
            )),
        })
        .transpose()
        .map(|scope| scope.unwrap_or(MemoryStoreScope::Workspace))
}

fn context_workspace_root(working_directory: &Path) -> Result<String, RuntimeToolExecutionError> {
    let root = working_directory
        .canonicalize()
        .unwrap_or_else(|_| working_directory.to_path_buf());
    if !root.is_absolute() {
        return Err(runtime_memory_store_error(
            "workspace memory requires an absolute working directory",
        ));
    }
    path_to_string(&root)
}

fn path_to_string(path: &Path) -> Result<String, RuntimeToolExecutionError> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| runtime_memory_store_error("workspace path must be UTF-8"))
}

fn check_memory_path_permission(
    params: &Value,
    working_directory: &Path,
    add_note: bool,
) -> Result<(), RuntimeToolExecutionError> {
    memory_scope_param(params)
        .map_err(|error| runtime_memory_store_permission_error(error.message().to_string()))?;
    if !working_directory.is_absolute() {
        return Err(runtime_memory_store_permission_error(
            "workspace memory tools require an absolute working directory",
        ));
    }

    if add_note {
        return Ok(());
    }

    let Some(path) = string_param(params, &["path"]) else {
        return Ok(());
    };
    validate_memory_relative_path(path).map_err(runtime_memory_store_permission_error)
}

fn validate_memory_relative_path(path: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        return Err("memory path must be relative".to_string());
    }
    for component in path.components() {
        match component {
            std::path::Component::Normal(segment) => {
                let Some(segment) = segment.to_str() else {
                    return Err("memory path must be UTF-8".to_string());
                };
                if segment.is_empty() || segment.starts_with('.') {
                    return Err("hidden memory path segments are not allowed".to_string());
                }
            }
            std::path::Component::CurDir => {}
            _ => return Err("memory path traversal is not allowed".to_string()),
        }
    }
    Ok(())
}

fn runtime_memory_store_permission_error(message: impl Into<String>) -> RuntimeToolExecutionError {
    let message = message.into();
    RuntimeToolExecutionError::new(
        message.clone(),
        Some(RuntimeToolPolicyErrorKind::PermissionDenied(message)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn read_permission_rejects_absolute_memory_path() {
        let dir = tempdir().expect("tempdir");
        let result = check_runtime_memory_store_permissions(
            MEMORY_READ_TOOL_NAME,
            &json!({"path": "/tmp/MEMORY.md"}),
            dir.path(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn read_permission_rejects_traversal_memory_path() {
        let dir = tempdir().expect("tempdir");
        let result = check_runtime_memory_store_permissions(
            MEMORY_READ_TOOL_NAME,
            &json!({"path": "../MEMORY.md"}),
            dir.path(),
        );

        assert!(result.is_err());
    }
}
