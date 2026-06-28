use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

const PLUGIN_PACKAGE_SCHEMA_VERSION: &str = "lime.plugin.package.v1";

const RUNTIME_CONTRIBUTION_FIELD: &str = "runtime";
const WORKBENCH_CONTRIBUTION_FIELD: &str = "workbench";

pub(crate) struct PluginPackageManifestProjection {
    pub(crate) plugin_manifest: Value,
    pub(crate) agent_app_manifest: Value,
}

pub(crate) fn resolve_plugin_package_manifest(
    app_dir: &Path,
) -> Result<PluginPackageManifestProjection, String> {
    let plugin_manifest_path = app_dir.join("plugin.json");
    if !plugin_manifest_path.is_file() {
        return Err(format!("插件包目录缺少 plugin.json: {}", app_dir.display()));
    }
    let plugin_manifest = read_json_file(&plugin_manifest_path, "读取插件包 plugin.json 失败")?;
    validate_plugin_package_manifest(&plugin_manifest)?;
    let runtime = read_contribution_yaml(app_dir, &plugin_manifest, RUNTIME_CONTRIBUTION_FIELD)?;
    let workbench =
        read_contribution_yaml(app_dir, &plugin_manifest, WORKBENCH_CONTRIBUTION_FIELD)?;
    let agent_app_manifest = project_plugin_package_to_agent_app_manifest(
        app_dir,
        &plugin_manifest,
        runtime.as_ref(),
        workbench.as_ref(),
    )?;

    Ok(PluginPackageManifestProjection {
        plugin_manifest,
        agent_app_manifest,
    })
}

fn read_json_file(path: &Path, context: &str) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("{context} {}: {error}", path.display()))?;
    serde_json::from_str(&content).map_err(|error| format!("{context} {}: {error}", path.display()))
}

fn validate_plugin_package_manifest(manifest: &Value) -> Result<(), String> {
    let schema_version = read_string(manifest, &["schemaVersion"])
        .ok_or_else(|| "插件包 plugin.json 缺少 schemaVersion。".to_string())?;
    if schema_version != PLUGIN_PACKAGE_SCHEMA_VERSION {
        return Err(format!(
            "插件包 plugin.json schemaVersion 必须是 {PLUGIN_PACKAGE_SCHEMA_VERSION}。"
        ));
    }
    require_string(manifest, &["id"], "插件包 plugin.json 缺少 id。")?;
    require_string(manifest, &["version"], "插件包 plugin.json 缺少 version。")?;
    if !manifest
        .get("contributions")
        .is_some_and(|value| value.is_object())
    {
        return Err("插件包 plugin.json 缺少 contributions。".to_string());
    }
    Ok(())
}

fn read_contribution_yaml(
    app_dir: &Path,
    plugin_manifest: &Value,
    field: &str,
) -> Result<Option<Value>, String> {
    let Some(relative_path) = read_string(plugin_manifest, &["contributions", field]) else {
        return Ok(None);
    };
    let path = resolve_package_relative_path(app_dir, &relative_path)?;
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "读取插件包 contributions.{field} 失败 {}: {error}",
            path.display()
        )
    })?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|error| {
        format!(
            "解析插件包 contributions.{field} 失败 {}: {error}",
            path.display()
        )
    })?;
    serde_json::to_value(yaml_value)
        .map(Some)
        .map_err(|error| format!("转换插件包 contributions.{field} 失败: {error}"))
}

fn resolve_package_relative_path(app_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(format!("插件包路径必须是包内相对路径: {relative_path}"));
    }
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(format!("插件包路径不能越过包根目录: {relative_path}"));
    }
    Ok(app_dir.join(path))
}

fn project_plugin_package_to_agent_app_manifest(
    app_dir: &Path,
    plugin_manifest: &Value,
    runtime_layer: Option<&Value>,
    workbench_layer: Option<&Value>,
) -> Result<Value, String> {
    let runtime = unwrap_named_object(runtime_layer, "agentRuntime")
        .or_else(|| unwrap_named_object(runtime_layer, "runtime"));
    let workbench = unwrap_named_object(workbench_layer, "workbench");
    let mut manifest = Map::new();
    let plugin_id = require_string(plugin_manifest, &["id"], "插件包 plugin.json 缺少 id。")?;
    let display_name = read_string(plugin_manifest, &["displayName"])
        .or_else(|| read_string(plugin_manifest, &["interface", "displayName"]))
        .unwrap_or_else(|| plugin_id.clone());

    manifest.insert(
        "manifestVersion".to_string(),
        Value::String("0.11.0".to_string()),
    );
    manifest.insert("name".to_string(), Value::String(plugin_id.clone()));
    manifest.insert(
        "displayName".to_string(),
        Value::String(display_name.clone()),
    );
    manifest.insert(
        "version".to_string(),
        Value::String(require_string(
            plugin_manifest,
            &["version"],
            "插件包 plugin.json 缺少 version。",
        )?),
    );
    manifest.insert("status".to_string(), Value::String("ready".to_string()));
    manifest.insert(
        "appType".to_string(),
        Value::String("domain-app".to_string()),
    );
    manifest.insert(
        "profiles".to_string(),
        Value::Array(vec![Value::String("workbench".to_string())]),
    );
    manifest.insert(
        "description".to_string(),
        Value::String(read_string(plugin_manifest, &["description"]).unwrap_or_default()),
    );
    manifest.insert(
        "runtimeTargets".to_string(),
        Value::Array(vec![Value::String("local".to_string())]),
    );
    manifest.insert("requires".to_string(), build_requires(runtime, workbench));
    manifest.insert(
        "distribution".to_string(),
        json!({
            "primaryInstallSurface": "lime-app-center",
            "channel": "local",
            "visibility": "local"
        }),
    );
    if let Some(presentation) = plugin_manifest.get("presentation").cloned() {
        manifest.insert("presentation".to_string(), presentation);
    }
    if let Some(interface) = plugin_manifest.get("interface").cloned() {
        manifest.insert("interface".to_string(), interface);
    }
    manifest.insert(
        "componentPaths".to_string(),
        build_component_paths(plugin_manifest),
    );
    if let Some(runtime) = runtime {
        manifest.insert("agentRuntime".to_string(), runtime.clone());
        if let Some(worker) = runtime.get("worker") {
            manifest.insert("runtimePackage".to_string(), json!({ "worker": worker }));
        }
        let activation_entries = activation_entries_from_runtime(runtime);
        if !activation_entries.is_empty() {
            manifest.insert(
                "activationEntries".to_string(),
                Value::Array(activation_entries),
            );
        }
        let entries = entries_from_runtime(runtime, &display_name);
        manifest.insert("entries".to_string(), Value::Array(entries));
        manifest.insert("artifacts".to_string(), artifacts_from_runtime(runtime));
        manifest.insert("subagents".to_string(), subagents_from_runtime(runtime));
        manifest.insert(
            "skillRefs".to_string(),
            skill_refs_from_runtime(app_dir, plugin_manifest, runtime),
        );
        manifest.insert(
            "toolRefs".to_string(),
            tool_refs_from_runtime(plugin_manifest, runtime),
        );
    } else {
        manifest.insert(
            "entries".to_string(),
            Value::Array(vec![json!({
                "key": plugin_id,
                "kind": "workflow",
                "title": display_name
            })]),
        );
    }
    if let Some(workbench) = workbench {
        manifest.insert("workbench".to_string(), workbench.clone());
    }
    manifest.insert("install".to_string(), build_install(plugin_manifest));
    manifest.insert(
        "storage".to_string(),
        json!({
            "namespace": plugin_id,
            "retention": "ask"
        }),
    );

    Ok(Value::Object(manifest))
}

fn unwrap_named_object<'a>(layer: Option<&'a Value>, field: &str) -> Option<&'a Value> {
    let value = layer?;
    value
        .get(field)
        .filter(|nested| nested.is_object())
        .or_else(|| value.as_object().map(|_| value))
}

fn build_requires(runtime: Option<&Value>, workbench: Option<&Value>) -> Value {
    let mut capabilities = vec![
        "lime.agent".to_string(),
        "lime.artifacts".to_string(),
        "lime.evidence".to_string(),
        "lime.workflow".to_string(),
    ];
    if runtime.and_then(|value| value.get("connectors")).is_some() {
        capabilities.push("lime.knowledge".to_string());
    }
    if workbench.is_some() {
        capabilities.push("lime.storage".to_string());
    }
    capabilities.sort();
    capabilities.dedup();
    json!({
        "sdk": "@lime/app-sdk@^0.11.0",
        "capabilities": capabilities
    })
}

fn build_component_paths(plugin_manifest: &Value) -> Value {
    plugin_manifest
        .get("contributions")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()))
}

fn build_install(plugin_manifest: &Value) -> Value {
    let local_install = plugin_manifest
        .get("install")
        .and_then(|value| value.get("local"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let modes = if local_install {
        vec![Value::String("in_lime".to_string())]
    } else {
        Vec::new()
    };
    json!({
        "modes": modes,
        "runtime": {
            "minVersion": "0.11.0",
            "bridge": "app-server-json-rpc"
        },
        "branding": {
            "name": read_string(plugin_manifest, &["displayName"])
                .unwrap_or_else(|| read_string(plugin_manifest, &["id"]).unwrap_or_else(|| "Plugin".to_string())),
            "icon": read_string(plugin_manifest, &["presentation", "icon"]),
            "windowTitle": read_string(plugin_manifest, &["displayName"])
                .unwrap_or_else(|| read_string(plugin_manifest, &["id"]).unwrap_or_else(|| "Plugin".to_string()))
        }
    })
}

fn activation_entries_from_runtime(runtime: &Value) -> Vec<Value> {
    runtime
        .get("activationEntries")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let key = read_string_from_record(item, "key")?;
                    Some(json!({
                        "key": key,
                        "title": read_string_from_record(item, "title").unwrap_or_else(|| key.clone()),
                        "aliases": read_string_array(item.get("aliases")),
                        "kind": read_string_from_record(item, "kind").unwrap_or_else(|| "plugin".to_string()),
                        "intent": read_string_from_record(item, "intent").unwrap_or_else(|| "at_command".to_string()),
                        "defaultObjectKind": read_string_from_record(item, "defaultObjectKind"),
                    }))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn entries_from_runtime(runtime: &Value, display_name: &str) -> Vec<Value> {
    let activation_entries = runtime
        .get("activationEntries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if activation_entries.is_empty() {
        return vec![json!({
            "key": "default",
            "kind": "workflow",
            "title": display_name
        })];
    }
    activation_entries
        .iter()
        .filter_map(|entry| {
            let key = read_string_from_record(entry, "key")?;
            Some(json!({
                "key": key,
                "kind": "workflow",
                "title": read_string_from_record(entry, "title").unwrap_or_else(|| display_name.to_string()),
                "description": read_string_from_record(entry, "description"),
                "workflow": read_string_from_record(entry, "workflow"),
                "requiredCapabilities": ["lime.agent", "lime.artifacts", "lime.workflow"]
            }))
        })
        .collect()
}

fn artifacts_from_runtime(runtime: &Value) -> Value {
    let artifact_kinds = runtime
        .get("tasks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|task| {
            task.get("output")
                .and_then(|output| output.get("artifactKinds"))
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let mut artifact_kinds = artifact_kinds;
    if let Some(kind) = runtime
        .get("worker")
        .and_then(|worker| worker.get("outputArtifactKind"))
        .and_then(Value::as_str)
    {
        artifact_kinds.push(kind.to_string());
    }
    artifact_kinds.sort();
    artifact_kinds.dedup();
    Value::Array(
        artifact_kinds
            .into_iter()
            .map(|kind| json!({ "key": normalize_key(&kind), "type": kind }))
            .collect(),
    )
}

fn subagents_from_runtime(runtime: &Value) -> Value {
    let mut subagents = Map::new();
    runtime
        .get("workflows")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|workflow| {
            workflow
                .get("steps")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .for_each(|step| {
            if let Some(id) = read_string_from_record(step, "subagent") {
                let entry = subagents.entry(id.clone()).or_insert_with(|| {
                    json!({
                        "id": id,
                        "title": read_string_from_record(step, "title"),
                        "activation": read_string_from_record(step, "expectedOutput"),
                        "required": false,
                        "skills": read_string_array(step.get("skillRefs"))
                    })
                });
                if let Some(object) = entry.as_object_mut() {
                    let existing = object
                        .get("skills")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let mut skills = existing
                        .into_iter()
                        .filter_map(|value| value.as_str().map(ToString::to_string))
                        .chain(read_string_array(step.get("skillRefs")))
                        .collect::<Vec<_>>();
                    skills.sort();
                    skills.dedup();
                    object.insert(
                        "skills".to_string(),
                        Value::Array(skills.into_iter().map(Value::String).collect()),
                    );
                }
            }
        });
    Value::Array(subagents.into_values().collect())
}

fn skill_refs_from_runtime(app_dir: &Path, plugin_manifest: &Value, runtime: &Value) -> Value {
    let workflows = runtime
        .get("workflows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut skill_ids = workflows
        .iter()
        .flat_map(|workflow| {
            workflow
                .get("steps")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .flat_map(|step| read_string_array(step.get("skillRefs")))
        .collect::<Vec<_>>();
    skill_ids.sort();
    skill_ids.dedup();
    let skills_root = read_string(plugin_manifest, &["contributions", "skills"])
        .and_then(|relative_path| resolve_package_relative_path(app_dir, &relative_path).ok());
    Value::Array(
        skill_ids
            .into_iter()
            .map(|id| {
                let activation = activation_for_skill(&workflows, &id);
                let path = skills_root
                    .as_ref()
                    .and_then(|root| find_skill_path(root, &id))
                    .and_then(|path| path.strip_prefix(app_dir).ok().map(Path::to_path_buf))
                    .map(|path| format!("./{}", path.to_string_lossy().replace('\\', "/")));
                json!({
                    "id": id,
                    "title": humanize_id(&id),
                    "path": path,
                    "activation": activation,
                    "required": false
                })
            })
            .collect(),
    )
}

fn activation_for_skill(workflows: &[Value], skill_id: &str) -> Option<String> {
    workflows
        .iter()
        .filter_map(|workflow| {
            let task_kind = read_string_from_record(workflow, "taskKind");
            let has_skill = workflow
                .get("steps")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .any(|step| {
                    read_string_array(step.get("skillRefs"))
                        .iter()
                        .any(|id| id == skill_id)
                });
            if has_skill {
                task_kind
            } else {
                None
            }
        })
        .next()
}

fn tool_refs_from_runtime(plugin_manifest: &Value, runtime: &Value) -> Value {
    let mut tool_refs = Vec::new();
    if let Some(cli_path) = read_string(plugin_manifest, &["contributions", "clis"]) {
        tool_refs.push(json!({
            "key": "plugin-cli",
            "provider": "local-cli",
            "path": cli_path,
            "required": false
        }));
    }
    runtime
        .get("connectors")
        .and_then(|connectors| connectors.get("registry"))
        .and_then(Value::as_str)
        .map(|path| {
            tool_refs.push(json!({
                "key": "plugin-connectors",
                "provider": "connector-registry",
                "path": path,
                "required": false
            }))
        });
    Value::Array(tool_refs)
}

fn find_skill_path(skills_root: &Path, skill_id: &str) -> Option<PathBuf> {
    let direct = skills_root.join(skill_id).join("SKILL.md");
    if direct.is_file() {
        return Some(direct);
    }
    let underscored = skills_root
        .join(skill_id.replace('-', "_"))
        .join("SKILL.md");
    if underscored.is_file() {
        return Some(underscored);
    }
    None
}

fn normalize_key(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn humanize_id(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
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

fn read_string_from_record(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn require_string(value: &Value, path: &[&str], message: &str) -> Result<String, String> {
    read_string(value, path).ok_or_else(|| message.to_string())
}

fn read_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}
