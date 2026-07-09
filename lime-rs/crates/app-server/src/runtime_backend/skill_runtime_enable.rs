use crate::ExecutionRequest;
use lime_agent::register_project_skill_from_directory;
use serde_json::{Map, Value};
use std::path::{Component, Path, PathBuf};
use tool_runtime::skill_gate::{
    clear_skill_tool_session_access, set_skill_tool_session_allowed_skill_sources,
    set_skill_tool_session_allowed_skills, SkillToolSessionSkillSource,
};

const ENABLE_SOURCE_MANUAL_SESSION: &str = "manual_session_enable";
const ENABLE_APPROVAL_MANUAL: &str = "manual";
const MAX_PERMISSION_SUMMARY_ITEMS: usize = 8;

pub(super) struct SkillRuntimeEnableGuard {
    session_id: String,
}

impl Drop for SkillRuntimeEnableGuard {
    fn drop(&mut self) {
        clear_skill_tool_session_access(&self.session_id);
    }
}

pub(super) fn apply_workspace_skill_runtime_enable(
    request: &ExecutionRequest,
    session_id: &str,
) -> SkillRuntimeEnableGuard {
    let guard = clear_workspace_skill_runtime_enable(session_id);

    let sources = workspace_skill_runtime_enable_sources(request);
    if !sources.is_empty() {
        register_workspace_skill_runtime_sources(&sources);
        set_skill_tool_session_allowed_skill_sources(session_id, sources);
    } else {
        let skill_names = selected_agent_skill_names_from_request(request);
        if !skill_names.is_empty() {
            set_skill_tool_session_allowed_skills(session_id, skill_names);
        }
    }

    guard
}

fn register_workspace_skill_runtime_sources(sources: &[SkillToolSessionSkillSource]) {
    for source in sources {
        if let Err(error) = register_project_skill_from_directory(
            &source.directory,
            Path::new(&source.registered_skill_directory),
        ) {
            tracing::warn!(
                skill = %source.skill_name,
                registered_skill_directory = %source.registered_skill_directory,
                "[AgentRuntime] workspace skill runtime enable 注册 Skill 失败: {}",
                error
            );
        }
    }
}

pub(super) fn clear_workspace_skill_runtime_enable(session_id: &str) -> SkillRuntimeEnableGuard {
    let guard = SkillRuntimeEnableGuard {
        session_id: session_id.to_string(),
    };
    clear_skill_tool_session_access(session_id);
    guard
}

fn selected_agent_skill_names_from_request(request: &ExecutionRequest) -> Vec<String> {
    let host_request = super::request_context::aster_chat_request_from_request(request);
    let workspace_scope =
        super::request_context::request_workspace_scope(request, host_request.as_ref());
    super::agent_skills_context::selected_agent_skill_names_for_turn(
        &request.input.text,
        &request_metadata_values(request),
        workspace_scope.working_dir.as_deref(),
        workspace_scope.project_root.as_deref(),
    )
}

pub(super) fn workspace_skill_runtime_enable_sources(
    request: &ExecutionRequest,
) -> Vec<SkillToolSessionSkillSource> {
    request_metadata_values(request)
        .into_iter()
        .find_map(workspace_skill_runtime_enable_value)
        .and_then(parse_workspace_skill_runtime_enable)
        .unwrap_or_default()
}

pub(super) fn request_metadata_values(request: &ExecutionRequest) -> Vec<&Value> {
    let mut values = Vec::new();
    if let Some(metadata) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
    {
        values.push(metadata);
    }
    if let Some(metadata) = request.metadata.as_ref() {
        values.push(metadata);
    }
    if let Some(host_options) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.host_options.as_ref())
    {
        collect_host_metadata_values(host_options, &mut values);
    }
    values
}

fn collect_host_metadata_values<'a>(host_options: &'a Value, values: &mut Vec<&'a Value>) {
    let Some(aster_chat_request) = host_options.get("asterChatRequest") else {
        return;
    };
    if let Some(metadata) = aster_chat_request
        .get("turn_config")
        .or_else(|| aster_chat_request.get("turnConfig"))
        .and_then(|turn_config| turn_config.get("metadata"))
    {
        values.push(metadata);
    }
    if let Some(metadata) = aster_chat_request.get("metadata") {
        values.push(metadata);
    }
}

fn workspace_skill_runtime_enable_value(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/harness/workspace_skill_runtime_enable")
        .or_else(|| metadata.pointer("/harness/workspaceSkillRuntimeEnable"))
        .or_else(|| metadata.get("workspace_skill_runtime_enable"))
        .or_else(|| metadata.get("workspaceSkillRuntimeEnable"))
}

fn parse_workspace_skill_runtime_enable(value: &Value) -> Option<Vec<SkillToolSessionSkillSource>> {
    let object = value.as_object()?;
    if read_string(object, &["source"]).as_deref() != Some(ENABLE_SOURCE_MANUAL_SESSION) {
        return None;
    }
    if read_string(object, &["approval"]).as_deref() != Some(ENABLE_APPROVAL_MANUAL) {
        return None;
    }

    let workspace_root = read_string(object, &["workspace_root", "workspaceRoot"])?;
    let workspace_root_path = normalized_absolute_path(&workspace_root)?;
    let skills_root = workspace_root_path.join(".agents").join("skills");

    let bindings = object.get("bindings")?.as_array()?;
    let sources = bindings
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|binding| {
            parse_runtime_enable_binding(
                binding,
                &workspace_root,
                &workspace_root_path,
                &skills_root,
            )
        })
        .collect::<Vec<_>>();

    if sources.is_empty() {
        None
    } else {
        Some(sources)
    }
}

fn parse_runtime_enable_binding(
    binding: &Map<String, Value>,
    workspace_root: &str,
    workspace_root_path: &Path,
    skills_root: &Path,
) -> Option<SkillToolSessionSkillSource> {
    let directory = read_string(binding, &["directory"])?;
    if !is_safe_relative_segment(&directory) {
        return None;
    }

    let registered_skill_directory = read_string(
        binding,
        &["registered_skill_directory", "registeredSkillDirectory"],
    )?;
    let registered_skill_directory_path = normalized_absolute_path(&registered_skill_directory)?;
    let expected_skill_directory = skills_root.join(&directory);
    if registered_skill_directory_path != expected_skill_directory {
        return None;
    }
    if !registered_skill_directory_path.starts_with(workspace_root_path)
        || !registered_skill_directory_path.starts_with(skills_root)
    {
        return None;
    }

    let skill_name = read_string(binding, &["skill", "skill_name", "skillName"])
        .unwrap_or_else(|| format!("project:{directory}"));
    if skill_name != format!("project:{directory}") && skill_name != directory {
        return None;
    }

    let source_draft_id = read_string(binding, &["source_draft_id", "sourceDraftId"])?;
    let source_verification_report_id = read_string(
        binding,
        &[
            "source_verification_report_id",
            "sourceVerificationReportId",
        ],
    )?;

    Some(SkillToolSessionSkillSource {
        workspace_root: workspace_root.to_string(),
        source: ENABLE_SOURCE_MANUAL_SESSION.to_string(),
        approval: ENABLE_APPROVAL_MANUAL.to_string(),
        directory: directory.clone(),
        registered_skill_directory,
        skill_name: format!("project:{directory}"),
        source_draft_id,
        source_verification_report_id,
        permission_summary: read_string_array(
            binding
                .get("permission_summary")
                .or_else(|| binding.get("permissionSummary")),
        ),
    })
}

fn normalized_absolute_path(value: &str) -> Option<PathBuf> {
    let path = PathBuf::from(value.trim());
    if !path.is_absolute() {
        return None;
    }
    Some(normalize_path(&path))
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                normalized.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !matches!(
                    normalized.components().last(),
                    Some(Component::RootDir | Component::Prefix(_))
                ) {
                    normalized.pop();
                }
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn is_safe_relative_segment(value: &str) -> bool {
    let path = Path::new(value);
    let mut components = path.components();
    matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none()
}

fn read_string(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        object
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn read_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .take(MAX_PERMISSION_SUMMARY_ITEMS)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_agent::is_skill_registered;
    use serde_json::json;
    use tempfile::TempDir;
    use tool_runtime::skill_gate::is_skill_tool_session_skill_allowed;

    fn request_with_metadata(metadata: Value) -> ExecutionRequest {
        super::super::tests::request_for_test("hello", None, Some(metadata))
    }

    fn is_skill_allowed(session_id: &str, skill_name: &str) -> bool {
        is_skill_tool_session_skill_allowed(session_id, skill_name)
    }

    #[test]
    fn valid_runtime_enable_metadata_projects_workspace_skill_source() {
        let request = request_with_metadata(json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "workspace_root": "/tmp/work",
                    "bindings": [
                        {
                            "directory": "capability-report",
                            "skill": "project:capability-report",
                            "registered_skill_directory": "/tmp/work/.agents/skills/capability-report",
                            "source_draft_id": "capdraft-1",
                            "source_verification_report_id": "capver-1",
                            "permission_summary": ["Level 0 只读发现"]
                        }
                    ]
                }
            }
        }));

        let sources = workspace_skill_runtime_enable_sources(&request);

        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].workspace_root, "/tmp/work");
        assert_eq!(sources[0].directory, "capability-report");
        assert_eq!(sources[0].skill_name, "project:capability-report");
        assert_eq!(sources[0].source_draft_id, "capdraft-1");
        assert_eq!(sources[0].source_verification_report_id, "capver-1");
        assert_eq!(sources[0].permission_summary, vec!["Level 0 只读发现"]);
    }

    #[test]
    fn runtime_enable_rejects_path_escape() {
        let request = request_with_metadata(json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "workspace_root": "/tmp/work",
                    "bindings": [
                        {
                            "directory": "../escape",
                            "skill": "project:../escape",
                            "registered_skill_directory": "/tmp/work/.agents/skills/../escape",
                            "source_draft_id": "capdraft-1",
                            "source_verification_report_id": "capver-1"
                        },
                        {
                            "directory": "capability-report",
                            "skill": "project:capability-report",
                            "registered_skill_directory": "/tmp/work/.agents/other/capability-report",
                            "source_draft_id": "capdraft-2",
                            "source_verification_report_id": "capver-2"
                        }
                    ]
                }
            }
        }));

        assert!(workspace_skill_runtime_enable_sources(&request).is_empty());
    }

    #[test]
    fn runtime_enable_requires_manual_source_and_approval() {
        let request = request_with_metadata(json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "automation",
                    "approval": "manual",
                    "workspace_root": "/tmp/work",
                    "bindings": [
                        {
                            "directory": "capability-report",
                            "registered_skill_directory": "/tmp/work/.agents/skills/capability-report",
                            "source_draft_id": "capdraft-1",
                            "source_verification_report_id": "capver-1"
                        }
                    ]
                }
            }
        }));

        assert!(workspace_skill_runtime_enable_sources(&request).is_empty());
    }

    #[tokio::test]
    async fn apply_runtime_enable_allows_only_current_turn_sources() {
        let session_id = "app-server-runtime-enable-session";
        let request = request_with_metadata(json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "workspace_root": "/tmp/work",
                    "bindings": [
                        {
                            "directory": "capability-report",
                            "registered_skill_directory": "/tmp/work/.agents/skills/capability-report",
                            "source_draft_id": "capdraft-1",
                            "source_verification_report_id": "capver-1"
                        }
                    ]
                }
            }
        }));
        let guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(session_id, "project:capability-report"));
        assert!(!is_skill_allowed(session_id, "project:other-skill"));

        drop(guard);

        assert!(!is_skill_allowed(session_id, "project:capability-report"));
    }

    #[tokio::test]
    async fn apply_runtime_enable_registers_workspace_skill_source() {
        let workspace = TempDir::new().expect("workspace");
        let skill_name = "runtime-enable-registers-skill";
        write_agent_skill(&workspace, skill_name);
        let skill_dir = workspace
            .path()
            .join(".agents")
            .join("skills")
            .join(skill_name);
        let session_id = "app-server-runtime-enable-registers-source-session";
        let request = request_with_metadata(json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "workspace_root": workspace.path().to_string_lossy().to_string(),
                    "bindings": [
                        {
                            "directory": skill_name,
                            "skill": format!("project:{skill_name}"),
                            "registered_skill_directory": skill_dir.to_string_lossy().to_string(),
                            "source_draft_id": "capdraft-registers-source",
                            "source_verification_report_id": "capver-registers-source"
                        }
                    ]
                }
            }
        }));

        let guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(
            session_id,
            &format!("project:{skill_name}")
        ));
        assert!(is_skill_registered(&format!("project:{skill_name}")));

        drop(guard);

        assert!(!is_skill_allowed(
            session_id,
            &format!("project:{skill_name}")
        ));
    }

    #[tokio::test]
    async fn missing_runtime_enable_keeps_skill_tool_fail_closed() {
        let session_id = "app-server-runtime-enable-missing-session";
        let request = request_with_metadata(json!({ "harness": {} }));
        let _guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(!is_skill_allowed(session_id, "project:capability-report"));
    }

    #[tokio::test]
    async fn explicit_agent_skill_selection_enables_only_selected_skill_for_turn() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let session_id = "app-server-explicit-agent-skill-session";
        let request = super::super::tests::request_for_test(
            "请用 $writer 改写这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
            })),
        );
        let guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(session_id, "writer"));
        assert!(is_skill_allowed(session_id, "project:writer"));
        assert!(!is_skill_allowed(session_id, "project:other"));

        drop(guard);

        assert!(!is_skill_allowed(session_id, "writer"));
    }

    #[tokio::test]
    async fn catalog_bound_service_scene_metadata_enables_selected_skill_for_turn() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let session_id = "app-server-catalog-bound-agent-skill-session";
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "service_scene_launch": {
                        "service_scene_run": {
                            "skill_key": "local:writer",
                            "skill_id": "service-skill-writer",
                            "linked_skill_id": "service-skill-writer"
                        }
                    }
                }
            })),
        );
        let guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(session_id, "writer"));
        assert!(is_skill_allowed(session_id, "project:writer"));
        assert!(!is_skill_allowed(session_id, "project:other"));

        drop(guard);

        assert!(!is_skill_allowed(session_id, "writer"));
    }

    #[tokio::test]
    async fn expert_bound_skill_ref_enables_selected_skill_for_turn() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let session_id = "app-server-expert-bound-agent-skill-session";
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "expert": {
                        "skill_refs": ["skill:writer"]
                    }
                }
            })),
        );
        let guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(session_id, "writer"));
        assert!(is_skill_allowed(session_id, "project:writer"));
        assert!(!is_skill_allowed(session_id, "project:other"));

        drop(guard);

        assert!(!is_skill_allowed(session_id, "writer"));
    }

    #[tokio::test]
    async fn unknown_catalog_bound_service_scene_metadata_keeps_skill_tool_fail_closed() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let session_id = "app-server-catalog-bound-unknown-agent-skill-session";
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "service_scene_launch": {
                        "service_scene_run": {
                            "skill_key": "missing"
                        }
                    }
                }
            })),
        );
        let _guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(!is_skill_allowed(session_id, "writer"));
    }

    #[tokio::test]
    async fn workspace_runtime_enable_takes_precedence_over_explicit_skill_selection() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let workspace_root = workspace.path().to_string_lossy().to_string();
        let session_id = "app-server-runtime-enable-precedence-session";
        let request = super::super::tests::request_for_test(
            "请用 $writer 改写这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace_root,
                "harness": {
                    "workspace_skill_runtime_enable": {
                        "source": "manual_session_enable",
                        "approval": "manual",
                        "workspace_root": workspace.path().to_string_lossy().to_string(),
                        "bindings": [
                            {
                                "directory": "capability-report",
                                "registered_skill_directory": workspace
                                    .path()
                                    .join(".agents/skills/capability-report")
                                    .to_string_lossy()
                                    .to_string(),
                                "source_draft_id": "capdraft-1",
                                "source_verification_report_id": "capver-1"
                            }
                        ]
                    }
                }
            })),
        );
        let _guard = apply_workspace_skill_runtime_enable(&request, session_id);

        assert!(is_skill_allowed(session_id, "project:capability-report"));
        assert!(!is_skill_allowed(session_id, "writer"));
    }

    fn write_agent_skill(workspace: &TempDir, name: &str) {
        let skill_dir = workspace.path().join(".agents").join("skills").join(name);
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Test skill.\n---\n\n# {name}\n"),
        )
        .expect("skill");
    }
}
