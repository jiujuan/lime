use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

const RUNTIME_CAPABILITY_SCHEMA_VERSION: &str = "plugin-runtime-capabilities/v0.1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginRuntimeCapabilitySnapshot {
    schema_version: String,
    plugin_id: String,
    version: Option<String>,
    skills: Vec<PluginSkillCapability>,
    tools: Vec<PluginToolBinding>,
    mcp_bindings: Vec<PluginMcpBinding>,
    workflow_bindings: Vec<PluginWorkflowBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginSkillCapability {
    id: String,
    title: Option<String>,
    description: Option<String>,
    path: Option<String>,
    activation: Option<String>,
    required: bool,
    prompt_injection_policy: PluginPromptInjectionPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginPromptInjectionPolicy {
    mode: String,
    source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginToolBinding {
    key: String,
    title: Option<String>,
    provider: String,
    binding_kind: String,
    path: Option<String>,
    capabilities: Vec<String>,
    required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginMcpBinding {
    server_id: String,
    tool_key: String,
    provider: String,
    required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginWorkflowBinding {
    workflow_key: String,
    task_kind: Option<String>,
    skill_ids: Vec<String>,
    tool_keys: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct SkillBuilder {
    id: String,
    title: Option<String>,
    description: Option<String>,
    path: Option<String>,
    activation: Option<String>,
    required: bool,
}

pub(crate) fn build_plugin_runtime_capabilities(manifest: &Value) -> Option<Value> {
    let snapshot = PluginRuntimeCapabilitySnapshot::from_manifest(manifest)?;
    serde_json::to_value(snapshot).ok()
}

impl PluginRuntimeCapabilitySnapshot {
    fn from_manifest(manifest: &Value) -> Option<Self> {
        let plugin_id = read_string(manifest, &["name"])
            .or_else(|| read_string(manifest, &["appId"]))
            .or_else(|| read_string(manifest, &["id"]))?;
        Some(Self {
            schema_version: RUNTIME_CAPABILITY_SCHEMA_VERSION.to_string(),
            plugin_id,
            version: read_string(manifest, &["version"]),
            skills: skill_capabilities_from_manifest(manifest),
            tools: tool_bindings_from_manifest(manifest),
            mcp_bindings: mcp_bindings_from_manifest(manifest),
            workflow_bindings: workflow_bindings_from_manifest(manifest),
        })
    }
}

fn skill_capabilities_from_manifest(manifest: &Value) -> Vec<PluginSkillCapability> {
    let mut skills: BTreeMap<String, SkillBuilder> = BTreeMap::new();
    for value in array_field(manifest, "skillRefs")
        .into_iter()
        .chain(array_field(manifest, "skills"))
    {
        let Some(id) = value
            .as_str()
            .map(str::to_string)
            .or_else(|| read_string(value, &["id"]))
        else {
            continue;
        };
        let entry = skills.entry(id.clone()).or_insert_with(|| SkillBuilder {
            id,
            ..SkillBuilder::default()
        });
        entry.title = read_string(value, &["title"]).or_else(|| entry.title.clone());
        entry.description =
            read_string(value, &["description"]).or_else(|| entry.description.clone());
        entry.path = read_string(value, &["path"]).or_else(|| entry.path.clone());
        entry.activation = read_string(value, &["activation"]).or_else(|| entry.activation.clone());
        entry.required |= value
            .get("required")
            .and_then(Value::as_bool)
            .unwrap_or(false);
    }
    skills
        .into_values()
        .map(|skill| {
            let mode = if skill.activation.is_some() {
                "workflow_scoped"
            } else {
                "available"
            };
            PluginSkillCapability {
                id: skill.id,
                title: skill.title,
                description: skill.description,
                path: skill.path,
                activation: skill.activation,
                required: skill.required,
                prompt_injection_policy: PluginPromptInjectionPolicy {
                    mode: mode.to_string(),
                    source: "manifest.skillRefs".to_string(),
                },
            }
        })
        .collect()
}

fn tool_bindings_from_manifest(manifest: &Value) -> Vec<PluginToolBinding> {
    array_field(manifest, "toolRefs")
        .into_iter()
        .filter_map(|tool| {
            let key = tool
                .as_str()
                .map(str::to_string)
                .or_else(|| read_string(tool, &["key"]))
                .or_else(|| read_string(tool, &["id"]))?;
            let provider =
                read_string(tool, &["provider"]).unwrap_or_else(|| "unknown".to_string());
            Some(PluginToolBinding {
                binding_kind: tool_binding_kind(tool, &key, &provider),
                key,
                title: read_string(tool, &["title"]),
                provider,
                path: read_string(tool, &["path"]),
                capabilities: read_string_array_from_keys(tool, &["capabilities", "taskKinds"]),
                required: tool
                    .get("required")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn mcp_bindings_from_manifest(manifest: &Value) -> Vec<PluginMcpBinding> {
    tool_bindings_from_manifest(manifest)
        .into_iter()
        .filter_map(|tool| {
            let server_id = mcp_server_id(&tool.key, &tool.provider)?;
            Some(PluginMcpBinding {
                server_id,
                tool_key: tool.key,
                provider: tool.provider,
                required: tool.required,
            })
        })
        .collect()
}

fn workflow_bindings_from_manifest(manifest: &Value) -> Vec<PluginWorkflowBinding> {
    let Some(runtime) = manifest
        .get("agentRuntime")
        .or_else(|| manifest.get("runtime"))
        .filter(|value| value.is_object())
    else {
        return Vec::new();
    };
    array_field(runtime, "workflows")
        .into_iter()
        .enumerate()
        .map(|(index, workflow)| {
            let workflow_key = read_string(workflow, &["key"])
                .or_else(|| read_string(workflow, &["id"]))
                .or_else(|| read_string(workflow, &["taskKind"]))
                .unwrap_or_else(|| format!("workflow-{index}"));
            PluginWorkflowBinding {
                workflow_key,
                task_kind: read_string(workflow, &["taskKind"])
                    .or_else(|| read_string(workflow, &["task_kind"])),
                skill_ids: workflow_ref_ids(workflow, &["skillRefs", "skill_refs", "skills"]),
                tool_keys: workflow_ref_ids(workflow, &["toolRefs", "tool_refs", "tools"]),
            }
        })
        .collect()
}

fn workflow_ref_ids(workflow: &Value, keys: &[&str]) -> Vec<String> {
    let mut values = read_string_array_from_keys(workflow, keys);
    values.extend(
        array_field(workflow, "steps")
            .into_iter()
            .flat_map(|step| read_string_array_from_keys(step, keys)),
    );
    values.sort();
    values.dedup();
    values
}

fn tool_binding_kind(tool: &Value, key: &str, provider: &str) -> String {
    if read_string(tool, &["mcpServerId"])
        .or_else(|| read_string(tool, &["mcp_server_id"]))
        .or_else(|| mcp_server_id(key, provider))
        .is_some()
    {
        return "mcp".to_string();
    }
    if provider.starts_with("connector:") {
        return "connector".to_string();
    }
    if provider == "local-cli" {
        return "cli".to_string();
    }
    if provider == "lifecycle-hook" {
        return "hook".to_string();
    }
    "tool".to_string()
}

fn mcp_server_id(key: &str, provider: &str) -> Option<String> {
    provider
        .strip_prefix("mcp:")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            (provider == "mcp")
                .then(|| key.split_once('/').map(|(server, _)| server.to_string()))
                .flatten()
        })
}

fn array_field<'a>(value: &'a Value, key: &str) -> Vec<&'a Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

fn read_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn read_string_array_from_keys(value: &Value, keys: &[&str]) -> Vec<String> {
    let mut values = keys
        .iter()
        .flat_map(|key| {
            value
                .get(*key)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

#[cfg(test)]
mod tests {
    use super::super::plugin_manifest::resolve_plugin_package_manifest;
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn snapshot_merges_skill_metadata_with_workflow_prompt_policy() {
        let manifest = json!({
            "name": "content-factory-app",
            "version": "2.0.0",
            "skillRefs": [
                {
                    "id": "article-writing",
                    "activation": "content.article.generate",
                    "path": "./skills/article-writing/SKILL.md"
                }
            ],
            "skills": [
                {
                    "id": "article-writing",
                    "title": "Article Writing",
                    "description": "Draft article copy."
                }
            ],
            "toolRefs": [
                {
                    "key": "web-research",
                    "provider": "connector:api",
                    "capabilities": ["content.article.generate"]
                }
            ],
            "agentRuntime": {
                "workflows": [
                    {
                        "key": "content_article_workflow",
                        "taskKind": "content.article.generate",
                        "steps": [
                            {
                                "skillRefs": ["article-writing"],
                                "toolRefs": ["web-research"]
                            }
                        ]
                    }
                ]
            }
        });

        let snapshot = PluginRuntimeCapabilitySnapshot::from_manifest(&manifest).expect("snapshot");

        assert_eq!(snapshot.plugin_id, "content-factory-app");
        assert_eq!(snapshot.skills.len(), 1);
        assert_eq!(snapshot.skills[0].id, "article-writing");
        assert_eq!(snapshot.skills[0].title.as_deref(), Some("Article Writing"));
        assert_eq!(
            snapshot.skills[0].prompt_injection_policy.mode,
            "workflow_scoped"
        );
        assert_eq!(snapshot.tools[0].binding_kind, "connector");
        assert_eq!(snapshot.workflow_bindings[0].skill_ids, ["article-writing"]);
        assert_eq!(snapshot.workflow_bindings[0].tool_keys, ["web-research"]);
    }

    #[test]
    fn snapshot_extracts_mcp_bindings_from_tool_refs() {
        let manifest = json!({
            "name": "research-plugin",
            "toolRefs": [
                {
                    "key": "browser/search",
                    "provider": "mcp",
                    "required": true
                },
                {
                    "key": "filesystem-read",
                    "provider": "mcp:filesystem"
                },
                {
                    "key": "local-tool",
                    "provider": "local-cli"
                }
            ]
        });

        let snapshot = PluginRuntimeCapabilitySnapshot::from_manifest(&manifest).expect("snapshot");

        assert_eq!(snapshot.tools.len(), 3);
        assert_eq!(snapshot.mcp_bindings.len(), 2);
        assert_eq!(snapshot.mcp_bindings[0].server_id, "browser");
        assert_eq!(snapshot.mcp_bindings[0].tool_key, "browser/search");
        assert_eq!(snapshot.mcp_bindings[1].server_id, "filesystem");
        assert_eq!(snapshot.tools[2].binding_kind, "cli");
    }

    #[test]
    fn serialized_snapshot_uses_stable_manifest_field_names() {
        let manifest = json!({
            "name": "simple-plugin",
            "skillRefs": ["outline-writing"]
        });

        let value = build_plugin_runtime_capabilities(&manifest).expect("snapshot value");

        assert_eq!(value["schemaVersion"], RUNTIME_CAPABILITY_SCHEMA_VERSION);
        assert_eq!(value["pluginId"], "simple-plugin");
        assert_eq!(
            value["skills"][0]["promptInjectionPolicy"]["mode"],
            "available"
        );
    }

    #[test]
    fn resolved_plugin_manifest_includes_runtime_capability_snapshot() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("plugin.json"),
            r#"{
              "schemaVersion": "lime.plugin.package.v1",
              "id": "content-factory-app",
              "version": "2.0.0",
              "contributions": {
                "runtime": "./app.runtime.yaml",
                "skills": "./skills"
              }
            }"#,
        )
        .expect("plugin.json");
        fs::write(
            temp.path().join("app.runtime.yaml"),
            r#"agentRuntime:
  workflows:
    - key: article-workflow
      taskKind: content.article.generate
      steps:
        - skillRefs:
            - article-writing
"#,
        )
        .expect("runtime yaml");
        fs::create_dir_all(temp.path().join("skills/article-writing")).expect("skill dir");
        fs::write(
            temp.path().join("skills/article-writing/SKILL.md"),
            r#"---
name: article-writing
description: Draft articles.
---

# Article Writing
"#,
        )
        .expect("skill markdown");

        let projection = resolve_plugin_package_manifest(temp.path()).expect("projection");

        assert_eq!(
            projection.plugin_manifest["runtimeCapabilities"]["schemaVersion"],
            RUNTIME_CAPABILITY_SCHEMA_VERSION
        );
        assert_eq!(
            projection.plugin_manifest["runtimeCapabilities"]["pluginId"],
            "content-factory-app"
        );
        assert_eq!(
            projection.plugin_manifest["runtimeCapabilities"]["skills"][0]["id"],
            "article-writing"
        );
        assert_eq!(
            projection.plugin_manifest["runtimeCapabilities"]["workflowBindings"][0]["skillIds"][0],
            "article-writing"
        );
    }
}
