use crate::{AppDataSource, RuntimeCoreError};
use app_server_protocol::{
    MemoryStoreAddNoteParams, MemoryStoreListParams, MemoryStoreReadParams, MemoryStoreRootParams,
    MemoryStoreScope, MemoryStoreSearchMatchMode, MemoryStoreSearchParams,
};
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use lime_agent::agent_tools::catalog::{
    MEMORY_ADD_NOTE_TOOL_NAME, MEMORY_LIST_TOOL_NAME, MEMORY_READ_TOOL_NAME,
    MEMORY_SEARCH_TOOL_NAME,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub(crate) fn create_memory_tools(app_data_source: Arc<dyn AppDataSource>) -> Vec<Box<dyn Tool>> {
    vec![
        Box::new(MemoryListTool::new(app_data_source.clone())),
        Box::new(MemoryReadTool::new(app_data_source.clone())),
        Box::new(MemorySearchTool::new(app_data_source.clone())),
        Box::new(MemoryAddNoteTool::new(app_data_source)),
    ]
}

#[derive(Clone)]
struct MemoryToolBase {
    app_data_source: Arc<dyn AppDataSource>,
}

impl MemoryToolBase {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self { app_data_source }
    }

    fn root_params(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> Result<MemoryStoreRootParams, ToolError> {
        let scope = string_param(params, &["scope"])
            .map(|value| match value {
                "global" => Ok(MemoryStoreScope::Global),
                "workspace" | "" => Ok(MemoryStoreScope::Workspace),
                _ => Err(ToolError::invalid_params(
                    "scope must be either 'workspace' or 'global'",
                )),
            })
            .transpose()?
            .unwrap_or(MemoryStoreScope::Workspace);
        let workspace_root = match scope {
            MemoryStoreScope::Global => None,
            MemoryStoreScope::Workspace => Some(context_workspace_root(context)?),
        };
        Ok(MemoryStoreRootParams {
            scope,
            workspace_root,
        })
    }
}

struct MemoryListTool {
    base: MemoryToolBase,
}

impl MemoryListTool {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self {
            base: MemoryToolBase::new(app_data_source),
        }
    }
}

#[async_trait]
impl Tool for MemoryListTool {
    fn name(&self) -> &str {
        MEMORY_LIST_TOOL_NAME
    }

    fn description(&self) -> &str {
        "List files and directories in the current memory store. Paths are memory-store relative and safe to pass to memory_read."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace",
                    "description": "Memory store scope. Defaults to the current workspace memory store."
                },
                "path": {
                    "type": "string",
                    "description": "Relative directory path inside the memory store."
                },
                "cursor": { "type": "string" },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200
                }
            }
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        ensure_not_cancelled(context)?;
        let request = MemoryStoreListParams {
            root: self.base.root_params(&params, context)?,
            path: string_param(&params, &["path"]).map(str::to_string),
            cursor: string_param(&params, &["cursor"]).map(str::to_string),
            max_results: usize_param(&params, &["maxResults", "max_results"])?,
        };
        let response = self
            .base
            .app_data_source
            .list_memory_store(request)
            .await
            .map_err(runtime_error)?;
        let metadata = metadata_map(json!({
            "operation": "list",
            "rootScope": response.root_scope,
            "path": response.path,
            "entries": response.entries,
            "truncated": response.truncated,
            "nextCursor": response.next_cursor,
        }));
        Ok(ToolResult::success(format!(
            "Listed {} memory entries under '{}'.{}",
            metadata
                .get("entries")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0),
            metadata
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            metadata
                .get("truncated")
                .and_then(Value::as_bool)
                .is_some_and(|value| value)
                .then_some(" More entries are available via nextCursor.")
                .unwrap_or("")
        ))
        .with_metadata_map(metadata))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        check_memory_path_permission(params, context, false)
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

struct MemoryReadTool {
    base: MemoryToolBase,
}

impl MemoryReadTool {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self {
            base: MemoryToolBase::new(app_data_source),
        }
    }
}

#[async_trait]
impl Tool for MemoryReadTool {
    fn name(&self) -> &str {
        MEMORY_READ_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Read a bounded line range from a memory-store file. Use paths returned by memory_list or memory_search; output includes citation fields."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "path": {
                    "type": "string",
                    "description": "Relative file path inside the memory store."
                },
                "lineOffset": {
                    "type": "integer",
                    "minimum": 0
                },
                "maxLines": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 500
                },
                "maxTokens": {
                    "type": "integer",
                    "minimum": 1
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        ensure_not_cancelled(context)?;
        let request = MemoryStoreReadParams {
            root: self.base.root_params(&params, context)?,
            path: required_string_param(&params, &["path"])?,
            line_offset: usize_param(&params, &["lineOffset", "line_offset"])?,
            max_lines: usize_param(&params, &["maxLines", "max_lines"])?,
            max_tokens: usize_param(&params, &["maxTokens", "max_tokens"])?,
        };
        let response = self
            .base
            .app_data_source
            .read_memory_store(request)
            .await
            .map_err(runtime_error)?;
        let content = response.content.clone();
        let metadata = metadata_map(json!({
            "operation": "read",
            "path": response.path,
            "startLineNumber": response.start_line_number,
            "content": response.content,
            "truncated": response.truncated,
            "citation": response.citation,
        }));
        Ok(ToolResult::success(content).with_metadata_map(metadata))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        check_memory_path_permission(params, context, false)
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

struct MemorySearchTool {
    base: MemoryToolBase,
}

impl MemorySearchTool {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self {
            base: MemoryToolBase::new(app_data_source),
        }
    }
}

#[async_trait]
impl Tool for MemorySearchTool {
    fn name(&self) -> &str {
        MEMORY_SEARCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Search memory-store text files with bounded results. Hits include path, line numbers, content snippets, and citations."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "queries": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1
                },
                "matchMode": {
                    "type": "string",
                    "enum": ["any", "allOnSameLine", "allWithinLines"],
                    "default": "any"
                },
                "withinLines": {
                    "type": "integer",
                    "minimum": 1
                },
                "caseSensitive": { "type": "boolean" },
                "normalized": { "type": "boolean" },
                "contextLines": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 20
                },
                "cursor": { "type": "string" },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200
                }
            },
            "required": ["queries"]
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        ensure_not_cancelled(context)?;
        let request = MemoryStoreSearchParams {
            root: self.base.root_params(&params, context)?,
            queries: string_array_param(&params, &["queries"])?,
            match_mode: match_mode_param(&params)?,
            within_lines: usize_param(&params, &["withinLines", "within_lines"])?,
            case_sensitive: bool_param(&params, &["caseSensitive", "case_sensitive"]),
            normalized: bool_param(&params, &["normalized"]),
            context_lines: usize_param(&params, &["contextLines", "context_lines"])?.unwrap_or(0),
            cursor: string_param(&params, &["cursor"]).map(str::to_string),
            max_results: usize_param(&params, &["maxResults", "max_results"])?,
        };
        let response = self
            .base
            .app_data_source
            .search_memory_store(request)
            .await
            .map_err(runtime_error)?;
        let hit_count = response.hits.len();
        let metadata = metadata_map(json!({
            "operation": "search",
            "hits": response.hits,
            "truncated": response.truncated,
            "nextCursor": response.next_cursor,
        }));
        Ok(ToolResult::success(format!(
            "Found {hit_count} memory hits.{}",
            metadata
                .get("truncated")
                .and_then(Value::as_bool)
                .is_some_and(|value| value)
                .then_some(" More hits are available via nextCursor.")
                .unwrap_or("")
        ))
        .with_metadata_map(metadata))
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

struct MemoryAddNoteTool {
    base: MemoryToolBase,
}

impl MemoryAddNoteTool {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self {
            base: MemoryToolBase::new(app_data_source),
        }
    }
}

#[async_trait]
impl Tool for MemoryAddNoteTool {
    fn name(&self) -> &str {
        MEMORY_ADD_NOTE_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Add an explicit ad-hoc note to the memory store. This writes only under extensions/ad_hoc/notes and does not modify MEMORY.md or memory_summary.md."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "content": {
                    "type": "string",
                    "description": "User-approved note content to save for later consolidation."
                },
                "title": { "type": "string" },
                "slug": { "type": "string" }
            },
            "required": ["content"]
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        ensure_not_cancelled(context)?;
        let request = MemoryStoreAddNoteParams {
            root: self.base.root_params(&params, context)?,
            content: required_string_param(&params, &["content"])?,
            title: string_param(&params, &["title"]).map(str::to_string),
            slug: string_param(&params, &["slug"]).map(str::to_string),
        };
        let response = self
            .base
            .app_data_source
            .add_memory_store_note(request)
            .await
            .map_err(runtime_error)?;
        let metadata = metadata_map(json!({
            "operation": "add_note",
            "path": response.path,
            "citation": response.citation,
        }));
        Ok(ToolResult::success(format!(
            "Saved memory note at {}.",
            metadata
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("extensions/ad_hoc/notes")
        ))
        .with_metadata_map(metadata))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        let Some(content) = string_param(params, &["content"]) else {
            return PermissionCheckResult::deny("memory_add_note requires content");
        };
        if content.trim().is_empty() {
            return PermissionCheckResult::deny("memory_add_note requires non-empty content");
        }
        check_memory_path_permission(params, context, true)
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

fn ensure_not_cancelled(context: &ToolContext) -> Result<(), ToolError> {
    if context.is_cancelled() {
        Err(ToolError::Cancelled)
    } else {
        Ok(())
    }
}

fn context_workspace_root(context: &ToolContext) -> Result<String, ToolError> {
    let root = context
        .working_directory
        .canonicalize()
        .unwrap_or_else(|_| context.working_directory.clone());
    if !root.is_absolute() {
        return Err(ToolError::invalid_params(
            "workspace memory requires an absolute working directory",
        ));
    }
    Ok(path_to_string(&root)?)
}

fn path_to_string(path: &Path) -> Result<String, ToolError> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| ToolError::invalid_params("workspace path must be UTF-8"))
}

fn runtime_error(error: RuntimeCoreError) -> ToolError {
    ToolError::execution_failed(error.to_string())
}

fn metadata_map(value: Value) -> HashMap<String, Value> {
    match value {
        Value::Object(object) => object.into_iter().collect(),
        _ => HashMap::new(),
    }
}

fn string_param<'a>(params: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn required_string_param(params: &Value, keys: &[&str]) -> Result<String, ToolError> {
    string_param(params, keys)
        .map(str::to_string)
        .ok_or_else(|| {
            ToolError::invalid_params(format!("Missing required parameter: {}", keys[0]))
        })
}

fn usize_param(params: &Value, keys: &[&str]) -> Result<Option<usize>, ToolError> {
    let Some(value) = keys.iter().filter_map(|key| params.get(*key)).next() else {
        return Ok(None);
    };
    if let Some(number) = value.as_u64() {
        return usize::try_from(number)
            .map(Some)
            .map_err(|_| ToolError::invalid_params(format!("{} is too large", keys[0])));
    }
    Err(ToolError::invalid_params(format!(
        "{} must be a non-negative integer",
        keys[0]
    )))
}

fn bool_param(params: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_bool)
        .unwrap_or(false)
}

fn string_array_param(params: &Value, keys: &[&str]) -> Result<Vec<String>, ToolError> {
    let value = keys
        .iter()
        .filter_map(|key| params.get(*key))
        .next()
        .ok_or_else(|| {
            ToolError::invalid_params(format!("Missing required parameter: {}", keys[0]))
        })?;
    let Some(items) = value.as_array() else {
        return Err(ToolError::invalid_params(format!(
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
        return Err(ToolError::invalid_params(
            "queries must include at least one non-empty string",
        ));
    }
    Ok(queries)
}

fn match_mode_param(params: &Value) -> Result<MemoryStoreSearchMatchMode, ToolError> {
    match string_param(params, &["matchMode", "match_mode"]).unwrap_or("any") {
        "any" => Ok(MemoryStoreSearchMatchMode::Any),
        "allOnSameLine" | "all_on_same_line" => Ok(MemoryStoreSearchMatchMode::AllOnSameLine),
        "allWithinLines" | "all_within_lines" => Ok(MemoryStoreSearchMatchMode::AllWithinLines),
        _ => Err(ToolError::invalid_params(
            "matchMode must be any, allOnSameLine, or allWithinLines",
        )),
    }
}

fn check_memory_path_permission(
    params: &Value,
    context: &ToolContext,
    add_note: bool,
) -> PermissionCheckResult {
    let scope = string_param(params, &["scope"]).unwrap_or("workspace");
    if scope != "workspace" && scope != "global" {
        return PermissionCheckResult::deny("scope must be either 'workspace' or 'global'");
    }
    if !context.working_directory.is_absolute() {
        return PermissionCheckResult::deny(
            "workspace memory tools require an absolute working directory",
        );
    }

    if add_note {
        return PermissionCheckResult::allow();
    }

    let Some(path) = string_param(params, &["path"]) else {
        return PermissionCheckResult::allow();
    };
    match validate_memory_relative_path(path) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::NoopAppDataSource;

    fn context() -> ToolContext {
        ToolContext::new(std::env::current_dir().expect("cwd"))
    }

    #[test]
    fn read_permission_rejects_absolute_memory_path() {
        let result =
            check_memory_path_permission(&json!({"path": "/tmp/MEMORY.md"}), &context(), false);
        assert!(result.is_denied());
    }

    #[test]
    fn read_permission_rejects_traversal_memory_path() {
        let result =
            check_memory_path_permission(&json!({"path": "../MEMORY.md"}), &context(), false);
        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn list_tool_uses_workspace_scope_by_default() {
        let tool = MemoryListTool::new(Arc::new(NoopAppDataSource));
        let error = tool
            .execute(json!({}), &context())
            .await
            .expect_err("noop data source should fail after params are accepted");
        assert!(error.to_string().contains("memoryStore/list"));
    }
}
