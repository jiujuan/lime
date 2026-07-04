use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

const PLUGIN_PACKAGE_SCHEMA_VERSION: &str = "lime.plugin.package.v1";

const RUNTIME_CONTRIBUTION_FIELD: &str = "runtime";
const WORKBENCH_CONTRIBUTION_FIELD: &str = "workbench";
const TEXT_PREVIEW_CHAR_LIMIT: usize = 420;

pub(crate) struct PluginPackageManifestProjection {
    pub(crate) plugin_manifest: Value,
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
    let package_components = read_plugin_package_components(app_dir, &plugin_manifest)?;
    let plugin_manifest = project_plugin_package_to_plugin_manifest(
        app_dir,
        &plugin_manifest,
        runtime.as_ref(),
        workbench.as_ref(),
        &package_components,
    )?;
    let plugin_manifest = merge_plugin_package_components(plugin_manifest, &package_components);

    Ok(PluginPackageManifestProjection { plugin_manifest })
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

#[derive(Default)]
struct PluginPackageComponents {
    skills: Vec<Value>,
    subagents: Vec<Value>,
    cli_tools: Vec<Value>,
    connectors: Vec<Value>,
    hooks: Vec<Value>,
}

fn read_plugin_package_components(
    app_dir: &Path,
    plugin_manifest: &Value,
) -> Result<PluginPackageComponents, String> {
    Ok(PluginPackageComponents {
        skills: read_skill_contributions(app_dir, plugin_manifest)?,
        subagents: read_subagent_contributions(app_dir, plugin_manifest)?,
        cli_tools: read_cli_contributions(app_dir, plugin_manifest)?,
        connectors: read_connector_contributions(app_dir, plugin_manifest)?,
        hooks: read_hook_contributions(app_dir, plugin_manifest)?,
    })
}

fn merge_plugin_package_components(
    plugin_manifest: Value,
    components: &PluginPackageComponents,
) -> Value {
    let Some(mut manifest) = plugin_manifest.as_object().cloned() else {
        return plugin_manifest;
    };
    insert_non_empty_array(&mut manifest, "skills", components.skills.clone());
    insert_non_empty_array(&mut manifest, "subagents", components.subagents.clone());
    insert_non_empty_array(&mut manifest, "connectors", components.connectors.clone());
    if !components.cli_tools.is_empty() {
        manifest.insert("clis".to_string(), json!({ "tools": components.cli_tools }));
    }
    if !components.hooks.is_empty() {
        manifest.insert("hooks".to_string(), json!({ "items": components.hooks }));
    }
    Value::Object(manifest)
}

fn insert_non_empty_array(manifest: &mut Map<String, Value>, key: &str, values: Vec<Value>) {
    if !values.is_empty() {
        manifest.insert(key.to_string(), Value::Array(values));
    }
}

fn contribution_path(
    app_dir: &Path,
    plugin_manifest: &Value,
    field: &str,
) -> Result<Option<PathBuf>, String> {
    read_string(plugin_manifest, &["contributions", field])
        .map(|relative_path| resolve_package_relative_path(app_dir, &relative_path))
        .transpose()
}

fn package_relative_string(app_dir: &Path, path: &Path) -> Option<String> {
    path.strip_prefix(app_dir)
        .ok()
        .map(|relative| format!("./{}", relative.to_string_lossy().replace('\\', "/")))
}

fn read_markdown_frontmatter_field(content: &str, field: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return None;
    }
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        if key.trim() == field {
            let normalized = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .trim()
                .to_string();
            if !normalized.is_empty() {
                return Some(normalized);
            }
        }
    }
    None
}

fn first_markdown_heading(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn text_preview(content: &str) -> Option<String> {
    let mut preview = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("---") && !line.starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ");
    if preview.is_empty() {
        return None;
    }
    if preview.chars().count() > TEXT_PREVIEW_CHAR_LIMIT {
        preview = preview.chars().take(TEXT_PREVIEW_CHAR_LIMIT).collect();
        preview.push('…');
    }
    Some(preview)
}

fn read_skill_contributions(app_dir: &Path, plugin_manifest: &Value) -> Result<Vec<Value>, String> {
    let Some(skills_root) = contribution_path(app_dir, plugin_manifest, "skills")? else {
        return Ok(Vec::new());
    };
    if !skills_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&skills_root).map_err(|error| {
        format!(
            "读取插件包 contributions.skills 目录失败 {}: {error}",
            skills_root.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("读取插件包 skill 条目失败: {error}"))?;
        let skill_dir = entry.path();
        if !skill_dir.is_dir() {
            continue;
        }
        let skill_path = skill_dir.join("SKILL.md");
        if !skill_path.is_file() {
            continue;
        }
        let content = fs::read_to_string(&skill_path)
            .map_err(|error| format!("读取插件包 skill 失败 {}: {error}", skill_path.display()))?;
        let directory_id = entry.file_name().to_string_lossy().to_string();
        if !is_valid_skill_id(&directory_id) {
            return Err(format!(
                "插件包 skill 目录名不符合 Agent Skills 规范 {}: {directory_id}",
                skill_dir.display()
            ));
        }
        let id = read_markdown_frontmatter_field(&content, "name").ok_or_else(|| {
            format!(
                "插件包 skill 缺少 frontmatter name，且必须与目录一致: {}",
                skill_path.display()
            )
        })?;
        if id != directory_id {
            return Err(format!(
                "插件包 skill frontmatter name 必须与目录一致 {}: expected {}, got {}",
                skill_path.display(),
                directory_id,
                id
            ));
        }
        let description =
            read_markdown_frontmatter_field(&content, "description").ok_or_else(|| {
                format!(
                    "插件包 skill description 不能为空: {}",
                    skill_path.display()
                )
            })?;
        let title = first_markdown_heading(&content).unwrap_or_else(|| humanize_id(&id));
        entries.push(json!({
            "id": id,
            "title": title,
            "description": description,
            "path": package_relative_string(app_dir, &skill_path),
            "required": false
        }));
    }
    entries.sort_by_key(|value| {
        value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    Ok(entries)
}

fn read_subagent_contributions(
    app_dir: &Path,
    plugin_manifest: &Value,
) -> Result<Vec<Value>, String> {
    let Some(subagents_root) = contribution_path(app_dir, plugin_manifest, "subagents")? else {
        return Ok(Vec::new());
    };
    if !subagents_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&subagents_root).map_err(|error| {
        format!(
            "读取插件包 contributions.subagents 目录失败 {}: {error}",
            subagents_root.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("读取插件包 subagent 条目失败: {error}"))?;
        let subagent_dir = entry.path();
        if !subagent_dir.is_dir() {
            continue;
        }
        let prompt_path = subagent_dir.join("prompt.md");
        if !prompt_path.is_file() {
            continue;
        }
        let content = fs::read_to_string(&prompt_path).map_err(|error| {
            format!(
                "读取插件包 subagent prompt 失败 {}: {error}",
                prompt_path.display()
            )
        })?;
        let id = entry.file_name().to_string_lossy().to_string();
        entries.push(json!({
            "id": id,
            "title": first_markdown_heading(&content).unwrap_or_else(|| humanize_id(&id)),
            "description": text_preview(&content),
            "promptPath": package_relative_string(app_dir, &prompt_path),
            "required": false
        }));
    }
    entries.sort_by_key(|value| {
        value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    Ok(entries)
}

fn read_cli_contributions(app_dir: &Path, plugin_manifest: &Value) -> Result<Vec<Value>, String> {
    let Some(cli_path) = contribution_path(app_dir, plugin_manifest, "clis")? else {
        return Ok(Vec::new());
    };
    if !cli_path.is_file() {
        return Ok(Vec::new());
    }
    let registry = read_json_file(&cli_path, "读取插件包 contributions.clis 失败")?;
    let tools = registry
        .get("tools")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(tools
        .into_iter()
        .filter_map(|tool| {
            let record = tool.as_object()?;
            let id = read_string_from_record(&tool, "id")
                .or_else(|| read_string_from_record(&tool, "key"))?;
            let title = read_string_from_record(&tool, "displayName")
                .or_else(|| read_string_from_record(&tool, "title"))
                .unwrap_or_else(|| id.clone());
            let source = record.get("source").cloned();
            Some(json!({
                "key": id,
                "title": title,
                "description": read_string_from_record(&tool, "description"),
                "provider": "local-cli",
                "path": package_relative_string(app_dir, &cli_path),
                "capabilities": read_string_array(tool.get("capabilities")),
                "required": false,
                "source": source
            }))
        })
        .collect())
}

fn read_connector_contributions(
    app_dir: &Path,
    plugin_manifest: &Value,
) -> Result<Vec<Value>, String> {
    let Some(connectors_path) = contribution_path(app_dir, plugin_manifest, "connectors")? else {
        return Ok(Vec::new());
    };
    if !connectors_path.is_file() {
        return Ok(Vec::new());
    }
    let registry = read_json_file(&connectors_path, "读取插件包 contributions.connectors 失败")?;
    Ok(registry
        .get("connectors")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|connector| {
            let id = read_string_from_record(&connector, "id")?;
            Some(json!({
                "id": id,
                "title": read_string_from_record(&connector, "title").unwrap_or_else(|| id.clone()),
                "kind": read_string_from_record(&connector, "kind").unwrap_or_else(|| "api".to_string()),
                "description": read_string_from_record(&connector, "description"),
                "taskKinds": read_string_array(connector.get("taskKinds")),
                "path": package_relative_string(app_dir, &connectors_path),
                "required": connector.get("required").and_then(Value::as_bool).unwrap_or(false)
            }))
        })
        .collect())
}

fn read_hook_contributions(app_dir: &Path, plugin_manifest: &Value) -> Result<Vec<Value>, String> {
    let Some(hooks_root) = contribution_path(app_dir, plugin_manifest, "hooks")? else {
        return Ok(Vec::new());
    };
    if !hooks_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut hooks = Vec::new();
    for entry in fs::read_dir(&hooks_root).map_err(|error| {
        format!(
            "读取插件包 contributions.hooks 目录失败 {}: {error}",
            hooks_root.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("读取插件包 hook 条目失败: {error}"))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("mjs") {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("hook")
            .to_string();
        hooks.push(json!({
            "key": id,
            "title": humanize_id(&id),
            "entrypoint": package_relative_string(app_dir, &path),
            "required": false
        }));
    }
    hooks.sort_by_key(|value| {
        value
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    Ok(hooks)
}

fn project_plugin_package_to_plugin_manifest(
    app_dir: &Path,
    plugin_manifest: &Value,
    runtime_layer: Option<&Value>,
    workbench_layer: Option<&Value>,
    package_components: &PluginPackageComponents,
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
        "schemaVersion".to_string(),
        Value::String(
            read_string(plugin_manifest, &["schemaVersion"])
                .unwrap_or_else(|| PLUGIN_PACKAGE_SCHEMA_VERSION.to_string()),
        ),
    );
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
        if let Some(runtime_package) = runtime_package_from_runtime(runtime) {
            manifest.insert("runtimePackage".to_string(), runtime_package);
        }
        let activation_entries = activation_entries_from_runtime(runtime);
        if !activation_entries.is_empty() {
            manifest.insert(
                "activationEntries".to_string(),
                Value::Array(activation_entries),
            );
        }
        let entries = entries_from_runtime(runtime, &plugin_id, &display_name);
        manifest.insert("entries".to_string(), Value::Array(entries));
        manifest.insert("artifacts".to_string(), artifacts_from_runtime(runtime));
        manifest.insert(
            "subagents".to_string(),
            merge_records_by_id(
                subagents_from_runtime(runtime)
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                package_components.subagents.clone(),
                "id",
            ),
        );
        manifest.insert(
            "skillRefs".to_string(),
            merge_records_by_id(
                skill_refs_from_runtime(app_dir, plugin_manifest, runtime)
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                package_components.skills.clone(),
                "id",
            ),
        );
        manifest.insert(
            "toolRefs".to_string(),
            tool_refs_from_runtime(plugin_manifest, runtime, package_components),
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
    if runtime.and_then(|value| value.get("ui")).is_some() {
        capabilities.push("lime.ui".to_string());
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
                    let task_kind = read_string_from_record(item, "taskKind")
                        .or_else(|| read_string_from_record(item, "task_kind"));
                    let workflow_key = read_string_from_record(item, "workflowKey")
                        .or_else(|| read_string_from_record(item, "workflow_key"))
                        .or_else(|| read_string_from_record(item, "workflow"));
                    let output_artifact_kind =
                        read_string_from_record(item, "outputArtifactKind")
                            .or_else(|| read_string_from_record(item, "output_artifact_kind"))
                            .or_else(|| {
                                activation_workflow_output_artifact_kind(
                                    runtime,
                                    workflow_key.as_deref(),
                                    task_kind.as_deref(),
                                )
                            });
                    Some(json!({
                        "key": key,
                        "title": read_string_from_record(item, "title").unwrap_or_else(|| key.clone()),
                        "aliases": read_string_array(item.get("aliases")),
                        "kind": read_string_from_record(item, "kind").unwrap_or_else(|| "plugin".to_string()),
                        "intent": read_string_from_record(item, "intent").unwrap_or_else(|| "at_command".to_string()),
                        "taskKind": task_kind,
                        "workflowKey": workflow_key,
                        "outputArtifactKind": output_artifact_kind,
                        "rightSurface": read_string_from_record(item, "rightSurface")
                            .or_else(|| read_string_from_record(item, "right_surface")),
                        "expectedObjects": read_string_array(item.get("expectedObjects"))
                            .into_iter()
                            .chain(read_string_array(item.get("expected_objects")))
                            .collect::<Vec<_>>(),
                        "defaultObjectKind": read_string_from_record(item, "defaultObjectKind")
                            .or_else(|| read_string_from_record(item, "default_object_kind")),
                    }))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn activation_workflow_output_artifact_kind(
    runtime: &Value,
    workflow_key: Option<&str>,
    task_kind: Option<&str>,
) -> Option<String> {
    runtime
        .get("workflows")
        .and_then(Value::as_array)?
        .iter()
        .find(|workflow| {
            workflow_key
                .is_some_and(|key| read_string_from_record(workflow, "key").as_deref() == Some(key))
                || task_kind.is_some_and(|kind| {
                    read_string_from_record(workflow, "taskKind")
                        .or_else(|| read_string_from_record(workflow, "task_kind"))
                        .as_deref()
                        == Some(kind)
                })
        })
        .and_then(|workflow| {
            read_string_from_record(workflow, "outputArtifactKind")
                .or_else(|| read_string_from_record(workflow, "output_artifact_kind"))
        })
}

fn runtime_package_from_runtime(runtime: &Value) -> Option<Value> {
    let mut package = Map::new();
    if let Some(worker) = runtime.get("worker") {
        package.insert("worker".to_string(), worker.clone());
    }
    if let Some(ui) = runtime.get("ui") {
        package.insert("ui".to_string(), ui.clone());
    }
    if package.is_empty() {
        None
    } else {
        Some(Value::Object(package))
    }
}

fn ui_entry_from_runtime(runtime: &Value, plugin_id: &str, display_name: &str) -> Option<Value> {
    let ui = runtime.get("ui")?.as_object()?;
    let key = ui
        .get("key")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(plugin_id)
        .to_string();
    let kind = ui
        .get("kind")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "page" | "panel" | "settings"))
        .unwrap_or("page");
    Some(json!({
        "key": key,
        "kind": kind,
        "title": ui
            .get("title")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(display_name),
        "description": ui.get("description").and_then(Value::as_str),
        "route": ui.get("route").and_then(Value::as_str).unwrap_or("/"),
        "requiredCapabilities": ["lime.ui", "lime.agent", "lime.storage"]
    }))
}

fn entries_from_runtime(runtime: &Value, plugin_id: &str, display_name: &str) -> Vec<Value> {
    let activation_entries = runtime
        .get("activationEntries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut entries = ui_entry_from_runtime(runtime, plugin_id, display_name)
        .into_iter()
        .collect::<Vec<_>>();
    if activation_entries.is_empty() {
        if entries.is_empty() {
            entries.push(json!({
                "key": "default",
                "kind": "workflow",
                "title": display_name
            }));
        }
        return entries;
    }
    entries.extend(activation_entries
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
        }));
    entries
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

fn merge_records_by_id(base: Vec<Value>, overlay: Vec<Value>, key: &str) -> Value {
    let mut merged: Map<String, Value> = Map::new();
    for value in base.into_iter().chain(overlay) {
        let Some(id) = value
            .get(key)
            .and_then(Value::as_str)
            .map(ToString::to_string)
        else {
            continue;
        };
        match (merged.remove(&id), value) {
            (Some(Value::Object(mut existing)), Value::Object(next)) => {
                for (field, field_value) in next {
                    if !field_value.is_null() {
                        existing.insert(field, field_value);
                    }
                }
                merged.insert(id, Value::Object(existing));
            }
            (_, next) => {
                merged.insert(id, next);
            }
        }
    }
    let mut values = merged.into_values().collect::<Vec<_>>();
    values.sort_by_key(|value| {
        value
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    Value::Array(values)
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

fn tool_refs_from_runtime(
    plugin_manifest: &Value,
    runtime: &Value,
    package_components: &PluginPackageComponents,
) -> Value {
    let mut tool_refs = Vec::new();
    if let Some(cli_path) = read_string(plugin_manifest, &["contributions", "clis"]) {
        tool_refs.push(json!({
            "key": "plugin-cli",
            "provider": "local-cli",
            "path": cli_path,
            "required": false
        }));
    }
    tool_refs.extend(package_components.cli_tools.clone());
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
    tool_refs.extend(package_components.connectors.iter().filter_map(|connector| {
        let id = read_string_from_record(connector, "id")?;
        Some(json!({
            "key": id,
            "title": read_string_from_record(connector, "title").unwrap_or_else(|| id.clone()),
            "description": read_string_from_record(connector, "description"),
            "provider": format!(
                "connector:{}",
                read_string_from_record(connector, "kind").unwrap_or_else(|| "api".to_string())
            ),
            "path": read_string_from_record(connector, "path"),
            "capabilities": read_string_array(connector.get("taskKinds")),
            "required": connector.get("required").and_then(Value::as_bool).unwrap_or(false)
        }))
    }));
    tool_refs.extend(package_components.hooks.iter().filter_map(|hook| {
        let key = read_string_from_record(hook, "key")?;
        Some(json!({
            "key": format!("hook:{key}"),
            "title": read_string_from_record(hook, "title").unwrap_or_else(|| key.clone()),
            "description": "Plugin lifecycle hook",
            "provider": "lifecycle-hook",
            "path": read_string_from_record(hook, "entrypoint"),
            "required": hook.get("required").and_then(Value::as_bool).unwrap_or(false)
        }))
    }));
    let mut seen = Map::new();
    for tool in tool_refs {
        let Some(key) = read_string_from_record(&tool, "key") else {
            continue;
        };
        seen.insert(key, tool);
    }
    let mut values = seen.into_values().collect::<Vec<_>>();
    values.sort_by_key(|value| {
        value
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    Value::Array(values)
}

fn find_skill_path(skills_root: &Path, skill_id: &str) -> Option<PathBuf> {
    let direct = skills_root.join(skill_id).join("SKILL.md");
    direct.is_file().then_some(direct)
}

fn is_valid_skill_id(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    let mut previous_was_hyphen = false;
    for ch in std::iter::once(first).chain(chars) {
        match ch {
            'a'..='z' | '0'..='9' => previous_was_hyphen = false,
            '-' if !previous_was_hyphen => previous_was_hyphen = true,
            _ => return false,
        }
    }
    !previous_was_hyphen
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn text_preview_truncates_multibyte_text_on_char_boundary() {
        let content = format!("# 标题\n\n{}", "中文描述".repeat(180));

        let preview = text_preview(&content).expect("preview");

        assert!(preview.ends_with('…'));
        assert_eq!(
            preview.trim_end_matches('…').chars().count(),
            TEXT_PREVIEW_CHAR_LIMIT
        );
    }

    #[test]
    fn resolve_plugin_package_manifest_rejects_legacy_skill_directory_name() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("plugin.json"),
            r#"{
              "schemaVersion": "lime.plugin.package.v1",
              "id": "content-factory-app",
              "version": "1.0.0",
              "contributions": {
                "runtime": "./app.runtime.yaml",
                "workbench": "./app.workbench.yaml",
                "skills": "./skills"
              }
            }"#,
        )
        .expect("plugin.json");
        fs::write(temp.path().join("app.runtime.yaml"), "agentRuntime: {}\n")
            .expect("runtime yaml");
        fs::write(temp.path().join("app.workbench.yaml"), "workbench: {}\n")
            .expect("workbench yaml");
        fs::create_dir_all(temp.path().join("skills/article_writing")).expect("skill dir");
        fs::write(
            temp.path().join("skills/article_writing/SKILL.md"),
            r#"---
name: article-writing
description: 正文写作技能
---

# Article Writing
"#,
        )
        .expect("skill markdown");

        let error = match resolve_plugin_package_manifest(temp.path()) {
            Ok(_) => panic!("legacy skill dir should be rejected"),
            Err(error) => error,
        };

        assert!(error.contains("Agent Skills 规范"));
        assert!(error.contains("article_writing"));
    }
}
