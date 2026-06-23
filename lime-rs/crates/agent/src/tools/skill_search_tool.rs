use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::agent_tools::catalog::SKILL_SEARCH_TOOL_NAME;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolResult};
use async_trait::async_trait;
use lime_skills::{
    build_agent_skill_snapshot_from_workspace, search_agent_skills, AgentSkillMetadata,
    AgentSkillSearchOptions, AgentSkillSearchResult, DEFAULT_AGENT_SKILL_SEARCH_LIMIT,
};
use serde::Deserialize;
use serde_json::{json, Map as JsonMap, Value};

const MAX_SKILL_SEARCH_LIMIT: usize = 20;

#[derive(Debug, Default)]
pub struct SkillSearchTool;

#[derive(Debug, Deserialize)]
struct SkillSearchInput {
    query: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[async_trait]
impl Tool for SkillSearchTool {
    fn name(&self) -> &str {
        SKILL_SEARCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Search available Agent Skills by lightweight metadata. For expert-bound or workspace-enabled skill candidates, call this before Skill so the selector evidence is recorded. Returns matching skill names, scopes, locators, and reasons only; it does not read SKILL.md bodies, enable SkillTool, or expand tool permissions."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language task or keywords to match against Agent Skill metadata."
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_SKILL_SEARCH_LIMIT,
                    "description": "Maximum number of metadata matches to return. Defaults to 8."
                }
            },
            "required": ["query"]
        })
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["SkillSearchTool"]
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let input = parse_input(params)?;
        let workspace = resolve_skill_search_workspace(context);
        let snapshot = build_agent_skill_snapshot_from_workspace(
            workspace.working_dir.as_deref(),
            workspace.project_root.as_deref(),
        );
        let results = search_agent_skills(
            &snapshot,
            &input.query,
            AgentSkillSearchOptions {
                limit: input.limit,
                ..AgentSkillSearchOptions::default()
            },
        );
        let output = skill_search_output(&input.query, &workspace, snapshot.skills.len(), &results);
        let output_text = serde_json::to_string_pretty(&output).map_err(|error| {
            ToolError::execution_failed(format!("序列化 skill_search 结果失败: {error}"))
        })?;

        Ok(
            ToolResult::success(output_text).with_metadata_map(skill_search_metadata(
                &input.query,
                snapshot.skills.len(),
                results.len(),
            )),
        )
    }

    async fn check_permissions(
        &self,
        params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        match parse_input(params.clone()) {
            Ok(_) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
struct ParsedSkillSearchInput {
    query: String,
    limit: usize,
}

#[derive(Debug, Clone, Default)]
struct SkillSearchWorkspace {
    working_dir: Option<PathBuf>,
    project_root: Option<PathBuf>,
}

fn parse_input(params: Value) -> Result<ParsedSkillSearchInput, ToolError> {
    let input: SkillSearchInput = serde_json::from_value(params)
        .map_err(|error| ToolError::invalid_params(format!("skill_search 参数无效: {error}")))?;
    let query = input.query.trim().to_string();
    if query.chars().count() < 2 {
        return Err(ToolError::invalid_params("query 至少需要 2 个非空字符"));
    }
    let limit = input
        .limit
        .unwrap_or(DEFAULT_AGENT_SKILL_SEARCH_LIMIT)
        .clamp(1, MAX_SKILL_SEARCH_LIMIT);

    Ok(ParsedSkillSearchInput { query, limit })
}

fn resolve_skill_search_workspace(context: &ToolContext) -> SkillSearchWorkspace {
    let turn_context = aster::session_context::current_turn_context();
    let metadata = turn_context
        .as_ref()
        .map(|turn_context| &turn_context.metadata);
    let project_root = turn_context
        .as_ref()
        .and_then(|turn_context| {
            turn_context_metadata_path(&turn_context.metadata, PROJECT_ROOT_KEYS)
        })
        .or_else(|| metadata.and_then(|metadata| metadata_path(metadata, PROJECT_ROOT_POINTERS)));
    let working_dir = turn_context
        .as_ref()
        .and_then(|turn_context| turn_context.cwd.clone())
        .or_else(|| {
            turn_context.as_ref().and_then(|turn_context| {
                turn_context_metadata_path(&turn_context.metadata, WORKING_DIR_KEYS)
            })
        })
        .or_else(|| metadata.and_then(|metadata| metadata_path(metadata, WORKING_DIR_POINTERS)))
        .or_else(|| Some(context.working_directory.clone()));

    SkillSearchWorkspace {
        working_dir: normalize_existing_path(working_dir),
        project_root: normalize_existing_path(project_root),
    }
}

const PROJECT_ROOT_KEYS: &[&str] = &["project_root", "projectRoot"];
const WORKING_DIR_KEYS: &[&str] = &["working_directory", "workingDirectory", "cwd"];
const PROJECT_ROOT_POINTERS: &[&str] = &[
    "/harness/project_root",
    "/harness/projectRoot",
    "/project_root",
    "/projectRoot",
];
const WORKING_DIR_POINTERS: &[&str] = &[
    "/harness/working_directory",
    "/harness/workingDirectory",
    "/harness/cwd",
    "/working_directory",
    "/workingDirectory",
    "/cwd",
];

fn turn_context_metadata_path(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<PathBuf> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_to_path)
}

fn metadata_path(metadata: &HashMap<String, Value>, pointers: &[&str]) -> Option<PathBuf> {
    let value = metadata
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<JsonMap<String, Value>>();
    let value = Value::Object(value);
    pointers
        .iter()
        .filter_map(|pointer| value.pointer(pointer))
        .find_map(value_to_path)
}

fn value_to_path(value: &Value) -> Option<PathBuf> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn normalize_existing_path(path: Option<PathBuf>) -> Option<PathBuf> {
    let path = path?;
    Some(path.canonicalize().unwrap_or(path))
}

fn skill_search_output(
    query: &str,
    workspace: &SkillSearchWorkspace,
    snapshot_skill_count: usize,
    results: &[AgentSkillSearchResult],
) -> Value {
    json!({
        "query": query,
        "resultCount": results.len(),
        "snapshotSkillCount": snapshot_skill_count,
        "workingDirectory": workspace.working_dir.as_ref().map(|path| path.display().to_string()),
        "projectRoot": workspace.project_root.as_ref().map(|path| path.display().to_string()),
        "results": results
            .iter()
            .map(skill_search_result_value)
            .collect::<Vec<_>>(),
        "usage": "Search results are metadata only. To use a skill, select one result and let the Agent Skills selector load its SKILL.md; do not treat this search as execution approval."
    })
}

fn skill_search_result_value(result: &AgentSkillSearchResult) -> Value {
    let skill = &result.skill;
    json!({
        "name": skill.name,
        "displayName": skill.display_name,
        "description": skill.description,
        "scope": skill.scope.as_label(),
        "source": skill.source,
        "directory": path_string(&skill.directory),
        "skillFilePath": path_string(&skill.skill_file_path),
        "locator": skill_locator_value(skill),
        "declaredTools": skill.allowed_tools,
        "argumentHint": skill.argument_hint,
        "whenToUse": skill.when_to_use,
        "score": result.score,
        "matchedTerms": result.matched_terms,
        "reason": result.reason,
    })
}

fn skill_locator_value(skill: &AgentSkillMetadata) -> Value {
    json!({
        "source": skill.scope.as_label(),
        "name": skill.name,
        "directory": path_string(&skill.directory),
        "skillFilePath": path_string(&skill.skill_file_path),
    })
}

fn path_string(path: &Path) -> String {
    path.display().to_string()
}

fn skill_search_metadata(
    query: &str,
    snapshot_skill_count: usize,
    result_count: usize,
) -> HashMap<String, Value> {
    HashMap::from([
        ("tool_family".to_string(), json!("skill_search")),
        ("skill_search_query".to_string(), json!(query)),
        (
            "skill_search_snapshot_skill_count".to_string(),
            json!(snapshot_skill_count),
        ),
        ("skill_search_result_count".to_string(), json!(result_count)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::session::TurnContextOverride;
    use tempfile::TempDir;

    #[tokio::test]
    async fn search_returns_metadata_without_body_or_gate_metadata() {
        let root = TempDir::new().expect("root");
        let skills_root = root.path().join(".agents").join("skills");
        write_skill(
            &skills_root,
            "research",
            "Research",
            "uniquefactsprobe 事实核验与联网调研",
        );
        write_skill(&skills_root, "writer", "Writer", "写作润色");
        let context = ToolContext::new(root.path().to_path_buf()).with_session_id("session-1");
        let tool = SkillSearchTool;

        let result = tool
            .execute(json!({ "query": "uniquefactsprobe", "limit": 3 }), &context)
            .await
            .expect("search should work");

        assert!(result.success);
        let output: Value =
            serde_json::from_str(result.output.as_deref().expect("output")).expect("json output");
        let results = output["results"].as_array().expect("results");
        let research = results
            .iter()
            .find(|result| result["name"] == "research")
            .expect("research result should exist");
        assert_eq!(research["displayName"], "Research");
        let expected_skill_file = skills_root
            .join("research")
            .join("SKILL.md")
            .canonicalize()
            .unwrap();
        assert_eq!(
            research["locator"]["skillFilePath"],
            json!(expected_skill_file.display().to_string())
        );
        assert!(result.metadata.contains_key("tool_family"));
        assert!(!result.metadata.contains_key("skill_name"));
        assert!(!result
            .metadata
            .contains_key("workspace_skill_runtime_enable"));
        assert!(!output.to_string().contains("SECRET BODY"));
    }

    #[tokio::test]
    async fn search_uses_turn_context_project_root_when_present() {
        let project = TempDir::new().expect("project");
        let nested = project.path().join("nested");
        std::fs::create_dir_all(&nested).expect("nested");
        let skills_root = project.path().join(".agents").join("skills");
        write_skill(
            &skills_root,
            "translate",
            "Translate",
            "uniquetranslateprobe 中英翻译",
        );
        let context = ToolContext::new(nested);
        let turn_context = TurnContextOverride {
            metadata: HashMap::from([(
                "project_root".to_string(),
                json!(project.path().display().to_string()),
            )]),
            ..TurnContextOverride::default()
        };

        let result = aster::session_context::with_turn_context(Some(turn_context), async {
            SkillSearchTool
                .execute(json!({ "query": "翻译" }), &context)
                .await
        })
        .await
        .expect("search should work");

        let output: Value =
            serde_json::from_str(result.output.as_deref().expect("output")).expect("json output");
        assert_eq!(output["results"][0]["name"], "translate");
        assert_eq!(output["results"][0]["displayName"], "Translate");
        assert_eq!(
            output["projectRoot"],
            json!(project.path().canonicalize().unwrap().display().to_string())
        );
    }

    #[tokio::test]
    async fn permission_check_rejects_empty_query() {
        let result = SkillSearchTool
            .check_permissions(&json!({ "query": "" }), &ToolContext::default())
            .await;

        assert!(result.is_denied());
    }

    fn write_skill(root: &Path, name: &str, display_name: &str, description: &str) {
        let skill_dir = root.join(name);
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!(
                "---\nname: {display_name}\ndescription: {description}\n---\n\n# {display_name}\nSECRET BODY"
            ),
        )
        .expect("skill");
    }
}
