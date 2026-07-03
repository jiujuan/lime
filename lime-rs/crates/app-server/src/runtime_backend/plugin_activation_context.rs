use serde_json::Value;

const PLUGIN_ACTIVATION_CONTEXT_MARKER: &str = "<plugin_activation_context>";

#[derive(Debug, Clone, PartialEq, Eq)]
struct PluginActivationContext {
    source: String,
    trigger: String,
    body: String,
    session_id: String,
    plugin_id: String,
    active_plugin_id: Option<String>,
    active_entry_key: Option<String>,
    intent_key: Option<String>,
    task_kind: Option<String>,
    output_artifact_kind: Option<String>,
    right_surface: Option<String>,
    expected_objects: Vec<String>,
    matched_phrase: Option<String>,
    selected_skill_keys: Vec<String>,
    selected_object_ref: Option<PluginObjectRef>,
    opened_tabs: Vec<String>,
    context_source: Option<String>,
    runtime_readiness: Option<PluginRuntimeReadiness>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PluginObjectRef {
    plugin_id: String,
    object_kind: String,
    object_id: String,
    version: Option<String>,
    artifact_ids: Vec<String>,
    source_turn_id: Option<String>,
    source_task_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PluginRuntimeReadiness {
    status: String,
    connector_refs: Vec<String>,
    hook_refs: Vec<String>,
    cli_refs: Vec<String>,
    connectors: Vec<PluginRuntimeReadinessItem>,
    hooks: Vec<PluginRuntimeReadinessItem>,
    clis: Vec<PluginRuntimeReadinessItem>,
    blocker_codes: Vec<String>,
    warning_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PluginRuntimeReadinessItem {
    id: String,
    status: String,
    source: Option<String>,
    reason_codes: Vec<String>,
}

pub(super) fn append_plugin_activation_context_to_system_prompt(
    system_prompt: Option<String>,
    metadata_values: &[&Value],
) -> Option<String> {
    if system_prompt
        .as_deref()
        .is_some_and(|prompt| prompt.contains(PLUGIN_ACTIVATION_CONTEXT_MARKER))
    {
        return system_prompt;
    }
    let Some(context) = metadata_values
        .iter()
        .find_map(|metadata| plugin_activation_value(metadata).and_then(parse_plugin_activation))
    else {
        return system_prompt;
    };

    append_context_block(system_prompt, render_plugin_activation_context(&context))
}

fn plugin_activation_value(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/harness/plugin_activation")
        .or_else(|| metadata.pointer("/harness/pluginActivation"))
        .or_else(|| metadata.get("plugin_activation"))
        .or_else(|| metadata.get("pluginActivation"))
}

fn parse_plugin_activation(value: &Value) -> Option<PluginActivationContext> {
    let object = value.as_object()?;
    let source = read_string(value, &["source"])?;
    let trigger = read_string(value, &["trigger"])?;
    let session_id = read_string(value, &["session_id", "sessionId"])?;
    let plugin_id = read_string(value, &["plugin_id", "pluginId"])?;

    Some(PluginActivationContext {
        source,
        trigger,
        body: read_string(value, &["body"]).unwrap_or_default(),
        session_id,
        plugin_id,
        active_plugin_id: read_string(value, &["active_plugin_id", "activePluginId"]),
        active_entry_key: read_string(value, &["active_entry_key", "activeEntryKey"]),
        intent_key: read_string(value, &["intent_key", "intentKey"]),
        task_kind: read_string(value, &["task_kind", "taskKind"]),
        output_artifact_kind: read_string(value, &["output_artifact_kind", "outputArtifactKind"]),
        right_surface: read_string(value, &["right_surface", "rightSurface"]),
        expected_objects: read_string_array(
            object
                .get("expected_objects")
                .or_else(|| object.get("expectedObjects")),
        ),
        matched_phrase: read_string(value, &["matched_phrase", "matchedPhrase"]),
        selected_skill_keys: read_string_array(
            object
                .get("selected_skill_keys")
                .or_else(|| object.get("selectedSkillKeys")),
        ),
        selected_object_ref: object
            .get("selected_object_ref")
            .or_else(|| object.get("selectedObjectRef"))
            .and_then(parse_plugin_object_ref),
        opened_tabs: read_string_array(
            object
                .get("opened_tabs")
                .or_else(|| object.get("openedTabs")),
        ),
        context_source: read_string(value, &["context_source", "contextSource"]),
        runtime_readiness: object
            .get("runtime_readiness")
            .or_else(|| object.get("runtimeReadiness"))
            .and_then(parse_plugin_runtime_readiness),
    })
}

fn parse_plugin_object_ref(value: &Value) -> Option<PluginObjectRef> {
    let object = value.as_object()?;
    Some(PluginObjectRef {
        plugin_id: read_string(value, &["plugin_id", "pluginId"])?,
        object_kind: read_string(value, &["object_kind", "objectKind"])?,
        object_id: read_string(value, &["object_id", "objectId"])?,
        version: read_string(value, &["version"]),
        artifact_ids: read_string_array(
            object
                .get("artifact_ids")
                .or_else(|| object.get("artifactIds")),
        ),
        source_turn_id: read_string(value, &["source_turn_id", "sourceTurnId"]),
        source_task_id: read_string(value, &["source_task_id", "sourceTaskId"]),
    })
}

fn parse_plugin_runtime_readiness(value: &Value) -> Option<PluginRuntimeReadiness> {
    let object = value.as_object()?;
    Some(PluginRuntimeReadiness {
        status: read_string(value, &["status"])?,
        connector_refs: read_string_array(
            object
                .get("connector_refs")
                .or_else(|| object.get("connectorRefs")),
        ),
        hook_refs: read_string_array(object.get("hook_refs").or_else(|| object.get("hookRefs"))),
        cli_refs: read_string_array(object.get("cli_refs").or_else(|| object.get("cliRefs"))),
        connectors: parse_plugin_runtime_readiness_items(object.get("connectors")),
        hooks: parse_plugin_runtime_readiness_items(object.get("hooks")),
        clis: parse_plugin_runtime_readiness_items(object.get("clis")),
        blocker_codes: read_string_array(
            object
                .get("blocker_codes")
                .or_else(|| object.get("blockerCodes")),
        ),
        warning_codes: read_string_array(
            object
                .get("warning_codes")
                .or_else(|| object.get("warningCodes")),
        ),
    })
}

fn parse_plugin_runtime_readiness_items(value: Option<&Value>) -> Vec<PluginRuntimeReadinessItem> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(parse_plugin_runtime_readiness_item)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_plugin_runtime_readiness_item(value: &Value) -> Option<PluginRuntimeReadinessItem> {
    let object = value.as_object()?;
    Some(PluginRuntimeReadinessItem {
        id: read_string(value, &["id"])?,
        status: read_string(value, &["status"])?,
        source: read_string(value, &["source"]),
        reason_codes: read_string_array(
            object
                .get("reason_codes")
                .or_else(|| object.get("reasonCodes")),
        ),
    })
}

fn render_plugin_activation_context(context: &PluginActivationContext) -> String {
    let mut lines = vec![
        PLUGIN_ACTIVATION_CONTEXT_MARKER.to_string(),
        "The user explicitly activated a Lime plugin for this turn. Treat this block as routing context, not as user-authored content.".to_string(),
        "Do not infer or switch plugins from natural language. Do not execute plugin surface actions unless the user explicitly requests them in this turn.".to_string(),
        format!("- source: {}", context.source),
        format!("- trigger: {}", context.trigger),
        format!("- session_id: {}", context.session_id),
        format!("- plugin_id: {}", context.plugin_id),
    ];
    if !context.body.is_empty() {
        lines.push(format!("- body_after_trigger: {}", context.body));
    }
    push_optional_line(&mut lines, "active_plugin_id", &context.active_plugin_id);
    push_optional_line(&mut lines, "active_entry_key", &context.active_entry_key);
    push_optional_line(&mut lines, "intent_key", &context.intent_key);
    push_optional_line(&mut lines, "task_kind", &context.task_kind);
    push_optional_line(
        &mut lines,
        "output_artifact_kind",
        &context.output_artifact_kind,
    );
    push_optional_line(&mut lines, "right_surface", &context.right_surface);
    if !context.expected_objects.is_empty() {
        lines.push(format!(
            "- expected_objects: {}",
            context.expected_objects.join(", ")
        ));
    }
    push_optional_line(&mut lines, "matched_phrase", &context.matched_phrase);
    if !context.selected_skill_keys.is_empty() {
        lines.push(format!(
            "- selected_skill_keys: {}",
            context.selected_skill_keys.join(", ")
        ));
    }
    if let Some(object_ref) = &context.selected_object_ref {
        lines.push("- selected_object_ref:".to_string());
        lines.push(format!("  - plugin_id: {}", object_ref.plugin_id));
        lines.push(format!("  - object_kind: {}", object_ref.object_kind));
        lines.push(format!("  - object_id: {}", object_ref.object_id));
        push_optional_line(&mut lines, "  - version", &object_ref.version);
        if !object_ref.artifact_ids.is_empty() {
            lines.push(format!(
                "  - artifact_ids: {}",
                object_ref.artifact_ids.join(", ")
            ));
        }
        push_optional_line(&mut lines, "  - source_turn_id", &object_ref.source_turn_id);
        push_optional_line(&mut lines, "  - source_task_id", &object_ref.source_task_id);
    }
    if !context.opened_tabs.is_empty() {
        lines.push(format!("- opened_tabs: {}", context.opened_tabs.join(", ")));
    }
    push_optional_line(&mut lines, "context_source", &context.context_source);
    if let Some(readiness) = &context.runtime_readiness {
        render_plugin_runtime_readiness(&mut lines, readiness);
    }
    lines.push("</plugin_activation_context>".to_string());
    lines.join("\n")
}

fn render_plugin_runtime_readiness(lines: &mut Vec<String>, readiness: &PluginRuntimeReadiness) {
    lines.push("- runtime_readiness:".to_string());
    lines.push(format!("  - status: {}", readiness.status));
    push_runtime_readiness_refs(lines, "connector_refs", &readiness.connector_refs);
    push_runtime_readiness_refs(lines, "hook_refs", &readiness.hook_refs);
    push_runtime_readiness_refs(lines, "cli_refs", &readiness.cli_refs);
    push_runtime_readiness_items(lines, "connectors", &readiness.connectors);
    push_runtime_readiness_items(lines, "hooks", &readiness.hooks);
    push_runtime_readiness_items(lines, "clis", &readiness.clis);
    push_runtime_readiness_refs(lines, "blocker_codes", &readiness.blocker_codes);
    push_runtime_readiness_refs(lines, "warning_codes", &readiness.warning_codes);
}

fn push_runtime_readiness_refs(lines: &mut Vec<String>, label: &str, refs: &[String]) {
    if !refs.is_empty() {
        lines.push(format!("  - {label}: {}", refs.join(", ")));
    }
}

fn push_runtime_readiness_items(
    lines: &mut Vec<String>,
    label: &str,
    items: &[PluginRuntimeReadinessItem],
) {
    if items.is_empty() {
        return;
    }
    lines.push(format!("  - {label}:"));
    for item in items {
        let source = item
            .source
            .as_deref()
            .map(|value| format!(", source={value}"))
            .unwrap_or_default();
        let reasons = if item.reason_codes.is_empty() {
            String::new()
        } else {
            format!(", reasons={}", item.reason_codes.join("|"))
        };
        lines.push(format!(
            "    - {}: {}{}{}",
            item.id, item.status, source, reasons
        ));
    }
}

fn push_optional_line(lines: &mut Vec<String>, label: &str, value: &Option<String>) {
    if let Some(value) = value.as_deref().filter(|value| !value.is_empty()) {
        let prefix = if label.trim_start().starts_with('-') {
            label.to_string()
        } else {
            format!("- {label}")
        };
        lines.push(format!("{prefix}: {value}"));
    }
}

fn append_context_block(system_prompt: Option<String>, context: String) -> Option<String> {
    let mut prompt = system_prompt.unwrap_or_default();
    if !prompt.trim().is_empty() {
        prompt.push_str("\n\n");
    }
    prompt.push_str(&context);
    Some(prompt)
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

fn read_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn appends_plugin_activation_context_from_harness_metadata() {
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "source": "plugin_explicit_mention",
                    "trigger": "@创作工作台",
                    "body": "写一篇公众号文章",
                    "session_id": "session-1",
                    "plugin_id": "creator-workbench",
                    "active_entry_key": "creator",
                    "intent_key": "content_article_generate",
                    "task_kind": "content.article.generate",
                    "output_artifact_kind": "content_factory.workspace_patch",
                    "right_surface": "articleWorkspace",
                    "expected_objects": ["articleDraft"],
                    "matched_phrase": "写一篇公众号文章",
                    "selected_skill_keys": ["article-draft"],
                    "selected_object_ref": {
                        "plugin_id": "creator-workbench",
                        "object_kind": "articleDraft",
                        "object_id": "pending",
                        "artifact_ids": ["artifact-1"]
                    },
                    "opened_tabs": ["articleWorkspace"],
                    "context_source": "user",
                    "runtime_readiness": {
                        "status": "declared",
                        "connector_refs": ["web-research"],
                        "hook_refs": ["prompt-submit"],
                        "cli_refs": ["content-factory"],
                        "connectors": [
                            {
                                "id": "web-research",
                                "status": "declared",
                                "source": "runtime_registry",
                                "reason_codes": ["PLUGIN_RUNTIME_REGISTRY_DECLARED"]
                            }
                        ],
                        "hooks": [
                            {
                                "id": "prompt-submit",
                                "status": "ready",
                                "source": "manifest_declaration"
                            }
                        ],
                        "clis": [
                            {
                                "id": "content-factory",
                                "status": "ready",
                                "source": "runtime_registry"
                            }
                        ],
                        "warning_codes": ["PLUGIN_RUNTIME_REGISTRY_DECLARED"]
                    }
                }
            }
        });

        let prompt = append_plugin_activation_context_to_system_prompt(
            Some("base".to_string()),
            &[&metadata],
        )
        .expect("prompt");

        assert!(prompt.starts_with("base"));
        assert!(prompt.contains("<plugin_activation_context>"));
        assert!(prompt.contains("plugin_id: creator-workbench"));
        assert!(prompt.contains("trigger: @创作工作台"));
        assert!(prompt.contains("body_after_trigger: 写一篇公众号文章"));
        assert!(prompt.contains("intent_key: content_article_generate"));
        assert!(prompt.contains("task_kind: content.article.generate"));
        assert!(prompt.contains("output_artifact_kind: content_factory.workspace_patch"));
        assert!(prompt.contains("expected_objects: articleDraft"));
        assert!(prompt.contains("object_kind: articleDraft"));
        assert!(prompt.contains("runtime_readiness:"));
        assert!(prompt.contains("status: declared"));
        assert!(prompt.contains("connector_refs: web-research"));
        assert!(prompt.contains("web-research: declared, source=runtime_registry"));
        assert!(prompt.contains("prompt-submit: ready, source=manifest_declaration"));
        assert!(prompt.contains("content-factory: ready, source=runtime_registry"));
        assert!(prompt.contains("warning_codes: PLUGIN_RUNTIME_REGISTRY_DECLARED"));
        assert!(prompt.contains("Do not infer or switch plugins from natural language"));
    }

    #[test]
    fn ignores_incomplete_plugin_activation_metadata() {
        let metadata = json!({
            "harness": {
                "plugin_activation": {
                    "trigger": "@创作工作台"
                }
            }
        });

        assert_eq!(
            append_plugin_activation_context_to_system_prompt(
                Some("base".to_string()),
                &[&metadata]
            ),
            Some("base".to_string())
        );
    }
}
