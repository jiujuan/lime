use lime_skills::{AgentSkillRoot, AgentSkillScope};
use serde_json::Value;
use std::path::{Component, Path, PathBuf};

const PLUGIN_RUNTIME_CONTEXT_MARKER: &str = "<plugin_runtime_capabilities>";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PluginRuntimeContext {
    pub(super) plugin_id: String,
    pub(super) version: Option<String>,
    pub(super) package_source_uri: Option<String>,
    pub(super) active_workflow_key: Option<String>,
    pub(super) active_task_kind: Option<String>,
    pub(super) skills: Vec<PluginRuntimeSkill>,
    pub(super) mcp_bindings: Vec<PluginRuntimeMcpBinding>,
    workflow_bindings: Vec<PluginRuntimeWorkflowBinding>,
    selected_skill_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PluginRuntimeSkill {
    pub(super) id: String,
    pub(super) title: Option<String>,
    pub(super) path: Option<String>,
    pub(super) activation: Option<String>,
    pub(super) required: bool,
    pub(super) prompt_injection_mode: String,
    pub(super) prompt_injection_source: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PluginRuntimeMcpBinding {
    pub(super) server_id: String,
    pub(super) tool_key: String,
    pub(super) provider: String,
    pub(super) required: bool,
    pub(super) call_proof_arguments: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PluginRuntimeMcpTarget {
    pub(super) plugin_id: String,
    pub(super) server_id: String,
    pub(super) tool_key: String,
    pub(super) provider: String,
    pub(super) required: bool,
    pub(super) caller: String,
    pub(super) expected_tool_name: String,
    pub(super) call_proof_arguments: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PluginRuntimeWorkflowBinding {
    workflow_key: String,
    task_kind: Option<String>,
    skill_ids: Vec<String>,
}

pub(super) fn append_plugin_runtime_context_to_system_prompt(
    system_prompt: Option<String>,
    metadata_values: &[&Value],
) -> Option<String> {
    if system_prompt
        .as_deref()
        .is_some_and(|prompt| prompt.contains(PLUGIN_RUNTIME_CONTEXT_MARKER))
    {
        return system_prompt;
    }
    let contexts = plugin_runtime_contexts(metadata_values);
    if contexts.is_empty() {
        return system_prompt;
    }
    append_context_block(system_prompt, render_plugin_runtime_contexts(&contexts))
}

pub(super) fn plugin_runtime_contexts(metadata_values: &[&Value]) -> Vec<PluginRuntimeContext> {
    let mut contexts = Vec::new();
    for metadata in metadata_values {
        let activation = plugin_activation_value(metadata);
        for capabilities in runtime_capability_values(metadata, activation) {
            let Some(context) = parse_plugin_runtime_context(capabilities, activation) else {
                continue;
            };
            if contexts.iter().any(|existing: &PluginRuntimeContext| {
                existing.plugin_id == context.plugin_id && existing.version == context.version
            }) {
                continue;
            }
            contexts.push(context);
        }
    }
    contexts
}

pub(super) fn plugin_runtime_skill_candidates(metadata_values: &[&Value]) -> Vec<String> {
    let mut candidates = Vec::new();
    for context in plugin_runtime_contexts(metadata_values) {
        for skill in context.prompt_injection_skills() {
            push_unique(&mut candidates, &skill.id);
            if let Some(title) = skill.title.as_deref() {
                push_unique(&mut candidates, title);
            }
        }
    }
    candidates
}

pub(super) fn has_plugin_runtime_skill_policy(metadata_values: &[&Value]) -> bool {
    plugin_runtime_contexts(metadata_values)
        .iter()
        .any(|context| !context.prompt_injection_skills().is_empty())
}

pub(super) fn plugin_runtime_mcp_targets(
    metadata_values: &[&Value],
) -> Vec<PluginRuntimeMcpTarget> {
    let mut targets = Vec::new();
    for context in plugin_runtime_contexts(metadata_values) {
        for target in context.mcp_targets() {
            push_mcp_target_unique(&mut targets, target);
        }
    }
    targets
}

pub(super) fn plugin_runtime_agent_skill_roots(metadata_values: &[&Value]) -> Vec<AgentSkillRoot> {
    let mut roots = Vec::new();
    for context in plugin_runtime_contexts(metadata_values) {
        for root in context.agent_skill_roots() {
            push_agent_skill_root_unique(&mut roots, root);
        }
    }
    roots
}

impl PluginRuntimeContext {
    pub(super) fn prompt_injection_skills(&self) -> Vec<&PluginRuntimeSkill> {
        let active_refs = self.active_skill_refs();
        self.skills
            .iter()
            .filter(|skill| skill.prompt_injection_enabled())
            .filter(|skill| {
                if active_refs.is_empty() {
                    return skill.required || skill.prompt_injection_mode == "available";
                }
                active_refs.iter().any(|candidate| {
                    candidate.eq_ignore_ascii_case(&skill.id)
                        || skill
                            .title
                            .as_deref()
                            .is_some_and(|title| candidate.eq_ignore_ascii_case(title))
                })
            })
            .collect()
    }

    pub(super) fn mcp_targets(&self) -> Vec<PluginRuntimeMcpTarget> {
        self.mcp_bindings
            .iter()
            .map(|binding| binding.runtime_target(&self.plugin_id))
            .collect()
    }

    fn agent_skill_roots(&self) -> Vec<AgentSkillRoot> {
        let Some(package_root) = self
            .package_source_uri
            .as_deref()
            .and_then(local_package_root_from_source_uri)
        else {
            return Vec::new();
        };
        let mut roots = Vec::new();
        for skill in &self.skills {
            let Some(path) = skill.path.as_deref() else {
                continue;
            };
            let Some(root_path) = plugin_skill_snapshot_root(&package_root, path) else {
                continue;
            };
            push_agent_skill_root_unique(
                &mut roots,
                AgentSkillRoot {
                    path: root_path,
                    scope: AgentSkillScope::App,
                },
            );
        }
        roots
    }

    fn active_skill_refs(&self) -> Vec<String> {
        let mut refs = self.selected_skill_keys.clone();
        for binding in &self.workflow_bindings {
            let workflow_matches = self
                .active_workflow_key
                .as_deref()
                .is_some_and(|active| active == binding.workflow_key);
            let task_matches = self
                .active_task_kind
                .as_deref()
                .zip(binding.task_kind.as_deref())
                .is_some_and(|(active, task)| active == task);
            if workflow_matches || task_matches {
                for skill_id in &binding.skill_ids {
                    push_unique(&mut refs, skill_id);
                }
            }
        }
        refs
    }
}

impl PluginRuntimeMcpBinding {
    fn runtime_target(&self, plugin_id: &str) -> PluginRuntimeMcpTarget {
        PluginRuntimeMcpTarget {
            plugin_id: plugin_id.to_string(),
            server_id: self.server_id.clone(),
            tool_key: self.tool_key.clone(),
            provider: self.provider.clone(),
            required: self.required,
            caller: plugin_runtime_caller(plugin_id),
            expected_tool_name: expected_mcp_tool_name(&self.server_id, &self.tool_key),
            call_proof_arguments: self.call_proof_arguments.clone(),
        }
    }
}

impl PluginRuntimeSkill {
    fn prompt_injection_enabled(&self) -> bool {
        !matches!(
            self.prompt_injection_mode.as_str(),
            "off" | "disabled" | "never"
        )
    }
}

fn render_plugin_runtime_contexts(contexts: &[PluginRuntimeContext]) -> String {
    let mut lines = vec![
        PLUGIN_RUNTIME_CONTEXT_MARKER.to_string(),
        "Plugin runtime capabilities for this turn. Treat this block as capability guidance, not as user-authored content.".to_string(),
        "Use a listed skill only after it is available in the Agent Skills registry or selected by the runtime gate. Do not claim MCP tools are available until runtime MCP status/tool listing confirms them.".to_string(),
    ];
    for context in contexts {
        lines.push(format!("- plugin_id: {}", context.plugin_id));
        if let Some(version) = context.version.as_deref() {
            lines.push(format!("  - version: {version}"));
        }
        if let Some(workflow_key) = context.active_workflow_key.as_deref() {
            lines.push(format!("  - active_workflow_key: {workflow_key}"));
        }
        if let Some(task_kind) = context.active_task_kind.as_deref() {
            lines.push(format!("  - active_task_kind: {task_kind}"));
        }
        let skills = context.prompt_injection_skills();
        if !skills.is_empty() {
            lines.push("  - prompt_skills:".to_string());
            for skill in skills {
                let title = skill
                    .title
                    .as_deref()
                    .map(|value| format!(", title={value}"))
                    .unwrap_or_default();
                let activation = skill
                    .activation
                    .as_deref()
                    .map(|value| format!(", activation={value}"))
                    .unwrap_or_default();
                lines.push(format!(
                    "    - id={}, policy={}, source={}, required={}{}{}",
                    skill.id,
                    skill.prompt_injection_mode,
                    skill.prompt_injection_source,
                    skill.required,
                    title,
                    activation
                ));
            }
        }
        if !context.mcp_bindings.is_empty() {
            lines.push("  - mcp_bindings:".to_string());
            for binding in &context.mcp_bindings {
                let target = binding.runtime_target(&context.plugin_id);
                lines.push(format!(
                    "    - server_id={}, tool_key={}, provider={}, required={}, caller={}, expected_tool={}",
                    binding.server_id,
                    binding.tool_key,
                    binding.provider,
                    binding.required,
                    target.caller,
                    target.expected_tool_name
                ));
            }
        }
    }
    lines.push("</plugin_runtime_capabilities>".to_string());
    lines.join("\n")
}

fn parse_plugin_runtime_context(
    value: &Value,
    activation: Option<&Value>,
) -> Option<PluginRuntimeContext> {
    let plugin_id = read_string(value, &["pluginId", "plugin_id"])?;
    if activation_plugin_id(activation).is_some_and(|active| active != plugin_id) {
        return None;
    }
    let active_workflow_key = activation.and_then(|value| {
        read_string(
            value,
            &[
                "workflow_key",
                "workflowKey",
                "entry_workflow_key",
                "entryWorkflowKey",
                "intent_workflow_key",
                "intentWorkflowKey",
            ],
        )
    });
    let active_task_kind = activation.and_then(|value| {
        read_string(
            value,
            &["task_kind", "taskKind", "entry_task_kind", "entryTaskKind"],
        )
    });
    Some(PluginRuntimeContext {
        plugin_id,
        version: read_string(value, &["version"]),
        package_source_uri: plugin_package_source_uri(activation, value),
        active_workflow_key,
        active_task_kind,
        skills: parse_skills(value.get("skills")),
        mcp_bindings: parse_mcp_bindings(
            value
                .get("mcpBindings")
                .or_else(|| value.get("mcp_bindings")),
        ),
        workflow_bindings: parse_workflow_bindings(
            value
                .get("workflowBindings")
                .or_else(|| value.get("workflow_bindings")),
        ),
        selected_skill_keys: activation.map(selected_skill_refs).unwrap_or_default(),
    })
}

fn runtime_capability_values<'a>(
    metadata: &'a Value,
    activation: Option<&'a Value>,
) -> Vec<&'a Value> {
    let mut values = Vec::new();
    if let Some(activation) = activation {
        push_value(
            &mut values,
            activation
                .get("runtime_capabilities")
                .or_else(|| activation.get("runtimeCapabilities")),
        );
    }
    push_value(
        &mut values,
        metadata
            .pointer("/harness/plugin_runtime_capabilities")
            .or_else(|| metadata.pointer("/harness/pluginRuntimeCapabilities")),
    );
    push_value(
        &mut values,
        metadata
            .get("plugin_runtime_capabilities")
            .or_else(|| metadata.get("pluginRuntimeCapabilities")),
    );
    values
}

fn push_value<'a>(values: &mut Vec<&'a Value>, value: Option<&'a Value>) {
    if let Some(value) = value.filter(|value| value.is_object()) {
        values.push(value);
    }
}

fn plugin_activation_value(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/harness/plugin_activation")
        .or_else(|| metadata.pointer("/harness/pluginActivation"))
        .or_else(|| metadata.get("plugin_activation"))
        .or_else(|| metadata.get("pluginActivation"))
}

fn activation_plugin_id(activation: Option<&Value>) -> Option<String> {
    activation.and_then(|value| read_string(value, &["plugin_id", "pluginId"]))
}

fn plugin_package_source_uri(activation: Option<&Value>, capabilities: &Value) -> Option<String> {
    activation
        .and_then(|value| {
            read_string(
                value,
                &["package_source_uri", "packageSourceUri", "sourceUri"],
            )
        })
        .or_else(|| read_string(capabilities, &["packageSourceUri", "package_source_uri"]))
}

fn parse_skills(value: Option<&Value>) -> Vec<PluginRuntimeSkill> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_skill).collect())
        .unwrap_or_default()
}

fn parse_skill(value: &Value) -> Option<PluginRuntimeSkill> {
    let policy = value
        .get("promptInjectionPolicy")
        .or_else(|| value.get("prompt_injection_policy"));
    Some(PluginRuntimeSkill {
        id: read_string(value, &["id"])?,
        title: read_string(value, &["title"]),
        path: read_string(value, &["path"]),
        activation: read_string(value, &["activation"]),
        required: value
            .get("required")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        prompt_injection_mode: policy
            .and_then(|policy| read_string(policy, &["mode"]))
            .unwrap_or_else(|| "available".to_string()),
        prompt_injection_source: policy
            .and_then(|policy| read_string(policy, &["source"]))
            .unwrap_or_else(|| "runtimeCapabilities.skills".to_string()),
    })
}

fn parse_mcp_bindings(value: Option<&Value>) -> Vec<PluginRuntimeMcpBinding> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_mcp_binding).collect())
        .unwrap_or_default()
}

fn parse_mcp_binding(value: &Value) -> Option<PluginRuntimeMcpBinding> {
    Some(PluginRuntimeMcpBinding {
        server_id: read_string(value, &["serverId", "server_id"])?,
        tool_key: read_string(value, &["toolKey", "tool_key"])?,
        provider: read_string(value, &["provider"]).unwrap_or_else(|| "mcp".to_string()),
        required: value
            .get("required")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        call_proof_arguments: read_call_proof_arguments(value),
    })
}

fn read_call_proof_arguments(value: &Value) -> Option<Value> {
    let proof = value
        .get("callProof")
        .or_else(|| value.get("call_proof"))?
        .as_object()?;
    let arguments = proof
        .get("arguments")
        .or_else(|| proof.get("args"))?
        .clone();
    arguments.is_object().then_some(arguments)
}

fn parse_workflow_bindings(value: Option<&Value>) -> Vec<PluginRuntimeWorkflowBinding> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_workflow_binding).collect())
        .unwrap_or_default()
}

fn parse_workflow_binding(value: &Value) -> Option<PluginRuntimeWorkflowBinding> {
    Some(PluginRuntimeWorkflowBinding {
        workflow_key: read_string(value, &["workflowKey", "workflow_key"])?,
        task_kind: read_string(value, &["taskKind", "task_kind"]),
        skill_ids: read_string_array(value.get("skillIds").or_else(|| value.get("skill_ids"))),
    })
}

fn selected_skill_refs(activation: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    collect_string_array(
        &mut refs,
        activation
            .get("selected_skill_keys")
            .or_else(|| activation.get("selectedSkillKeys")),
    );
    collect_skill_ref_array(
        &mut refs,
        activation
            .get("skill_refs")
            .or_else(|| activation.get("skillRefs")),
    );
    if let Some(contract) = activation
        .get("workflow_contract")
        .or_else(|| activation.get("workflowContract"))
    {
        collect_workflow_step_skill_refs(&mut refs, contract.get("steps"));
    }
    refs
}

fn collect_workflow_step_skill_refs(refs: &mut Vec<String>, value: Option<&Value>) {
    let Some(steps) = value.and_then(Value::as_array) else {
        return;
    };
    for step in steps {
        collect_skill_ref_array(
            refs,
            step.get("skill_refs").or_else(|| step.get("skillRefs")),
        );
    }
}

fn collect_skill_ref_array(refs: &mut Vec<String>, value: Option<&Value>) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };
    for item in items {
        if let Some(text) = item.as_str() {
            push_unique(refs, text);
            continue;
        }
        push_optional_unique(refs, read_string(item, &["id"]));
        push_optional_unique(refs, read_string(item, &["key"]));
        push_optional_unique(refs, read_string(item, &["title"]));
        push_optional_unique(refs, read_string(item, &["name"]));
    }
}

fn read_string_array(value: Option<&Value>) -> Vec<String> {
    let mut values = Vec::new();
    collect_string_array(&mut values, value);
    values
}

fn collect_string_array(values: &mut Vec<String>, value: Option<&Value>) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };
    for item in items {
        if let Some(value) = item.as_str() {
            push_unique(values, value);
        }
    }
}

fn push_optional_unique(values: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value {
        push_unique(values, &value);
    }
}

fn push_mcp_target_unique(
    targets: &mut Vec<PluginRuntimeMcpTarget>,
    target: PluginRuntimeMcpTarget,
) {
    if targets.iter().any(|existing| {
        existing.plugin_id.eq_ignore_ascii_case(&target.plugin_id)
            && existing.server_id.eq_ignore_ascii_case(&target.server_id)
            && existing.tool_key.eq_ignore_ascii_case(&target.tool_key)
            && existing.caller.eq_ignore_ascii_case(&target.caller)
    }) {
        return;
    }
    targets.push(target);
}

fn push_agent_skill_root_unique(roots: &mut Vec<AgentSkillRoot>, root: AgentSkillRoot) {
    let normalized = root
        .path
        .canonicalize()
        .unwrap_or_else(|_| root.path.clone());
    if roots.iter().any(|existing| {
        existing
            .path
            .canonicalize()
            .unwrap_or_else(|_| existing.path.clone())
            == normalized
    }) {
        return;
    }
    roots.push(AgentSkillRoot {
        path: normalized,
        scope: root.scope,
    });
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    if values
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(value))
    {
        return;
    }
    values.push(value.to_string());
}

fn plugin_runtime_caller(plugin_id: &str) -> String {
    format!("plugin:{}", plugin_id.trim())
}

fn expected_mcp_tool_name(server_id: &str, tool_key: &str) -> String {
    let tool_key = tool_key.trim();
    if tool_key.starts_with("mcp__") {
        return tool_key.to_string();
    }
    let server_id = server_id.trim();
    let server_prefix = format!("{server_id}/");
    let inner = tool_key
        .strip_prefix(&server_prefix)
        .or_else(|| tool_key.split_once('/').map(|(_, inner)| inner))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(tool_key);
    format!("mcp__{server_id}__{inner}")
}

fn local_package_root_from_source_uri(source_uri: &str) -> Option<PathBuf> {
    let source_uri = source_uri.trim();
    if source_uri.is_empty() || source_uri.contains("://") {
        return None;
    }
    let canonical = PathBuf::from(source_uri).canonicalize().ok()?;
    canonical.is_dir().then_some(canonical)
}

fn plugin_skill_snapshot_root(package_root: &Path, relative_path: &str) -> Option<PathBuf> {
    let skill_path = resolve_package_relative_path(package_root, relative_path)?;
    if skill_path.file_name().and_then(|name| name.to_str()) == Some("SKILL.md")
        && skill_path.is_file()
    {
        return skill_path
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf);
    }
    if skill_path.join("SKILL.md").is_file() {
        return skill_path.parent().map(Path::to_path_buf);
    }
    skill_path.is_dir().then_some(skill_path)
}

fn resolve_package_relative_path(package_root: &Path, relative_path: &str) -> Option<PathBuf> {
    let package_root = package_root.canonicalize().ok()?;
    let mut normalized = PathBuf::new();
    for component in Path::new(relative_path.trim()).components() {
        match component {
            Component::Normal(value) => normalized.push(value),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if normalized.as_os_str().is_empty() {
        return None;
    }
    let candidate = package_root.join(normalized).canonicalize().ok()?;
    candidate.starts_with(&package_root).then_some(candidate)
}

fn read_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn append_context_block(system_prompt: Option<String>, context: String) -> Option<String> {
    let mut prompt = system_prompt.unwrap_or_default();
    if !prompt.trim().is_empty() {
        prompt.push_str("\n\n");
    }
    prompt.push_str(&context);
    Some(prompt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn workflow_scoped_policy_uses_active_workflow_skill_ids() {
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "plugin_id": "content-factory-app",
                    "workflow_key": "article-workflow",
                    "runtime_capabilities": {
                        "pluginId": "content-factory-app",
                        "skills": [
                            {
                                "id": "article-writing",
                                "promptInjectionPolicy": {
                                    "mode": "workflow_scoped",
                                    "source": "runtimeCapabilities.skills"
                                }
                            },
                            {
                                "id": "unused",
                                "promptInjectionPolicy": { "mode": "workflow_scoped", "source": "runtimeCapabilities.skills" }
                            }
                        ],
                        "mcpBindings": [],
                        "workflowBindings": [
                            {
                                "workflowKey": "article-workflow",
                                "skillIds": ["article-writing"]
                            }
                        ]
                    }
                }
            }
        });

        let candidates = plugin_runtime_skill_candidates(&[&metadata]);

        assert_eq!(candidates, vec!["article-writing".to_string()]);
    }

    #[test]
    fn selected_skill_refs_accept_object_skill_refs() {
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "plugin_id": "creator",
                    "skill_refs": [
                        { "id": "article-research", "title": "资料检索" }
                    ],
                    "runtimeCapabilities": {
                        "pluginId": "creator",
                        "skills": [
                            {
                                "id": "article-research",
                                "title": "资料检索",
                                "promptInjectionPolicy": { "mode": "workflow_scoped", "source": "runtimeCapabilities.skills" }
                            }
                        ],
                        "mcpBindings": [],
                        "workflowBindings": []
                    }
                }
            }
        });

        let candidates = plugin_runtime_skill_candidates(&[&metadata]);

        assert_eq!(
            candidates,
            vec!["article-research".to_string(), "资料检索".to_string()]
        );
    }

    #[test]
    fn mismatched_activation_plugin_is_ignored() {
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "plugin_id": "active-plugin",
                    "runtime_capabilities": {
                        "pluginId": "other-plugin",
                        "skills": [
                            { "id": "other", "promptInjectionPolicy": { "mode": "available", "source": "runtimeCapabilities.skills" } }
                        ],
                        "mcpBindings": [],
                        "workflowBindings": []
                    }
                }
            }
        });

        assert!(plugin_runtime_contexts(&[&metadata]).is_empty());
    }

    #[test]
    fn renders_mcp_binding_guidance_without_importing_server() {
        let metadata = json!({
            "harness": {
                "plugin_runtime_capabilities": {
                    "pluginId": "research-plugin",
                    "skills": [],
                    "mcpBindings": [
                        {
                            "serverId": "browser",
                            "toolKey": "browser/search",
                            "provider": "mcp",
                            "required": true
                        }
                    ],
                    "workflowBindings": []
                }
            }
        });

        let prompt =
            append_plugin_runtime_context_to_system_prompt(Some("base".to_string()), &[&metadata])
                .expect("prompt");

        assert!(prompt.contains("<plugin_runtime_capabilities>"));
        assert!(prompt.contains("server_id=browser"));
        assert!(prompt.contains("tool_key=browser/search"));
        assert!(prompt.contains("caller=plugin:research-plugin"));
        assert!(prompt.contains("expected_tool=mcp__browser__search"));
    }

    #[test]
    fn normalizes_plugin_mcp_targets_for_runtime_listing() {
        let metadata = json!({
            "harness": {
                "plugin_runtime_capabilities": {
                    "pluginId": "research-plugin",
                    "skills": [],
                    "mcpBindings": [
                        {
                            "serverId": "browser",
                            "toolKey": "browser/search",
                            "provider": "mcp",
                            "required": true,
                            "callProof": {
                                "arguments": {
                                    "query": "lime"
                                }
                            }
                        },
                        {
                            "serverId": "filesystem",
                            "toolKey": "filesystem-read",
                            "provider": "mcp:filesystem"
                        },
                        {
                            "serverId": "browser",
                            "toolKey": "browser/search",
                            "provider": "mcp",
                            "required": true
                        }
                    ],
                    "workflowBindings": []
                }
            }
        });

        let targets = plugin_runtime_mcp_targets(&[&metadata]);

        assert_eq!(targets.len(), 2);
        assert_eq!(targets[0].plugin_id, "research-plugin");
        assert_eq!(targets[0].caller, "plugin:research-plugin");
        assert_eq!(targets[0].server_id, "browser");
        assert_eq!(targets[0].tool_key, "browser/search");
        assert_eq!(targets[0].expected_tool_name, "mcp__browser__search");
        assert_eq!(
            targets[0].call_proof_arguments,
            Some(json!({ "query": "lime" }))
        );
        assert_eq!(targets[1].server_id, "filesystem");
        assert_eq!(
            targets[1].expected_tool_name,
            "mcp__filesystem__filesystem-read"
        );
        assert_eq!(targets[1].call_proof_arguments, None);
    }

    #[test]
    fn resolves_local_package_skill_roots_for_agent_skill_snapshot() {
        let package = tempfile::tempdir().expect("package");
        let skill_dir = package.path().join("skills").join("article-writing");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: article-writing\ndescription: Draft articles.\n---\n\n# Article Writing\n",
        )
        .expect("skill");
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "plugin_id": "content-factory-app",
                    "package_source_uri": package.path().to_string_lossy(),
                    "runtime_capabilities": {
                        "pluginId": "content-factory-app",
                        "skills": [
                            {
                                "id": "article-writing",
                                "path": "./skills/article-writing/SKILL.md",
                                "promptInjectionPolicy": {
                                    "mode": "workflow_scoped",
                                    "source": "runtimeCapabilities.skills"
                                }
                            }
                        ],
                        "mcpBindings": [],
                        "workflowBindings": []
                    }
                }
            }
        });

        let roots = plugin_runtime_agent_skill_roots(&[&metadata]);

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].scope, AgentSkillScope::App);
        assert!(roots[0].path.ends_with("skills"));
    }

    #[test]
    fn rejects_package_skill_path_traversal() {
        let package = tempfile::tempdir().expect("package");
        let outside = tempfile::tempdir().expect("outside");
        let skill_dir = outside.path().join("article-writing");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: article-writing\ndescription: Draft articles.\n---\n\n# Article Writing\n",
        )
        .expect("skill");
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "plugin_id": "content-factory-app",
                    "package_source_uri": package.path().to_string_lossy(),
                    "runtime_capabilities": {
                        "pluginId": "content-factory-app",
                        "skills": [
                            {
                                "id": "article-writing",
                                "path": "../article-writing/SKILL.md",
                                "promptInjectionPolicy": {
                                    "mode": "workflow_scoped",
                                    "source": "runtimeCapabilities.skills"
                                }
                            }
                        ],
                        "mcpBindings": [],
                        "workflowBindings": []
                    }
                }
            }
        });

        assert!(plugin_runtime_agent_skill_roots(&[&metadata]).is_empty());
    }
}
