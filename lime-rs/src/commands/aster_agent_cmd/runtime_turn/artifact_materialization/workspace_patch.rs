use super::output_contract::{
    collect_agent_app_required_skill_names, is_agent_app_draft_materialization_output_kind,
    is_agent_app_report_output_kind, is_content_factory_agent_app_output_contract,
    resolve_agent_app_content_factory_project_id, resolve_agent_app_output_contract_artifact_kind,
    resolve_agent_app_output_contract_value,
};
use regex::Regex;
use serde_json::json;
use std::path::PathBuf;

pub(super) fn json_object_has_any_key(
    value: &serde_json::Value,
    keys: &[&str],
    depth: usize,
) -> bool {
    if depth > 8 {
        return false;
    }
    match value {
        serde_json::Value::Object(object) => {
            keys.iter().any(|key| object.contains_key(*key))
                || object
                    .values()
                    .any(|child| json_object_has_any_key(child, keys, depth + 1))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .any(|child| json_object_has_any_key(child, keys, depth + 1)),
        _ => false,
    }
}

fn looks_like_content_factory_workspace_patch(value: &serde_json::Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let kind = object
        .get("kind")
        .or_else(|| object.get("type"))
        .or_else(|| object.get("patchKind"))
        .or_else(|| object.get("patch_kind"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim);
    kind == Some("content_factory.workspace_patch")
        || [
            "workspace",
            "project",
            "projectKnowledge",
            "readiness",
            "sceneTable",
            "contentBatch",
            "scripts",
            "imagePrompts",
            "strategyReport",
            "pptOutline",
            "reviewReport",
            "assetPack",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
}

fn extract_content_factory_workspace_patch_from_value(
    value: &serde_json::Value,
    depth: usize,
) -> Option<serde_json::Value> {
    if depth > 8 {
        return None;
    }
    match value {
        serde_json::Value::Object(object) => {
            for key in [
                "contentFactoryWorkspacePatch",
                "content_factory_workspace_patch",
                "workspacePatch",
                "workspace_patch",
            ] {
                if let Some(candidate) = object.get(key).filter(|candidate| candidate.is_object()) {
                    return Some(candidate.clone());
                }
            }
            if looks_like_content_factory_workspace_patch(value) {
                return Some(value.clone());
            }
            object.values().find_map(|child| {
                extract_content_factory_workspace_patch_from_value(child, depth + 1)
            })
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|child| extract_content_factory_workspace_patch_from_value(child, depth + 1)),
        _ => None,
    }
}

fn repair_unescaped_string_quotes(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    let mut output = String::new();
    let mut in_string = false;
    let mut escaped = false;

    for (index, character) in chars.iter().enumerate() {
        if escaped {
            output.push(*character);
            escaped = false;
            continue;
        }
        if in_string && *character == '\\' {
            output.push(*character);
            escaped = true;
            continue;
        }
        if *character == '"' {
            if !in_string {
                in_string = true;
                output.push(*character);
                continue;
            }
            let next = chars
                .iter()
                .skip(index + 1)
                .find(|candidate| !candidate.is_whitespace())
                .copied();
            if next.is_none_or(|next| matches!(next, ',' | '}' | ']' | ':')) {
                in_string = false;
                output.push(*character);
            } else {
                output.push('\\');
                output.push(*character);
            }
            continue;
        }
        output.push(*character);
    }

    output
}

fn parse_json_candidate(candidate: &str) -> Option<serde_json::Value> {
    let candidate = candidate.trim();
    if candidate.is_empty() {
        return None;
    }
    serde_json::from_str::<serde_json::Value>(candidate)
        .ok()
        .or_else(|| {
            let repaired = repair_unescaped_string_quotes(candidate);
            if repaired == candidate {
                return None;
            }
            serde_json::from_str::<serde_json::Value>(repaired.as_str()).ok()
        })
        .or_else(|| {
            let start = candidate.find('{')?;
            let end = candidate.rfind('}')?;
            if start >= end {
                return None;
            }
            let sliced = &candidate[start..=end];
            serde_json::from_str::<serde_json::Value>(sliced)
                .ok()
                .or_else(|| {
                    let repaired = repair_unescaped_string_quotes(sliced);
                    if repaired == sliced {
                        return None;
                    }
                    serde_json::from_str::<serde_json::Value>(repaired.as_str()).ok()
                })
        })
}

fn extract_content_factory_workspace_patch_from_text(raw_text: &str) -> Option<serde_json::Value> {
    let text = raw_text.trim();
    if text.is_empty() {
        return None;
    }

    if let Some(parsed) = parse_json_candidate(text) {
        if let Some(patch) = extract_content_factory_workspace_patch_from_value(&parsed, 0) {
            return Some(patch);
        }
    }

    let fenced_json_regex = Regex::new(r"(?is)```(?:json)?\s*(.*?)```").ok()?;
    for capture in fenced_json_regex.captures_iter(text) {
        let Some(candidate) = capture.get(1).map(|matched| matched.as_str()) else {
            continue;
        };
        let Some(parsed) = parse_json_candidate(candidate) else {
            continue;
        };
        if let Some(patch) = extract_content_factory_workspace_patch_from_value(&parsed, 0) {
            return Some(patch);
        }
    }

    None
}

fn truncate_agent_app_materialized_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    let mut output = String::new();
    for character in trimmed.chars().take(max_chars) {
        output.push(character);
    }
    if trimmed.chars().count() > max_chars {
        output.push('…');
    }
    output
}

fn first_agent_app_output_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| truncate_agent_app_materialized_text(line, 140))
}

fn normalize_agent_app_workspace_patch(
    mut patch: serde_json::Value,
    artifact_kind: &str,
    project_id: &str,
    source: &str,
) -> Option<serde_json::Value> {
    let object = patch.as_object_mut()?;
    object
        .entry("kind".to_string())
        .or_insert_with(|| json!("content_factory.workspace_patch"));
    object
        .entry("artifactKind".to_string())
        .or_insert_with(|| json!(artifact_kind));
    if project_id.trim() == "unknown-project" {
        object
            .entry("projectId".to_string())
            .or_insert_with(|| json!(project_id));
    } else {
        object.insert("projectId".to_string(), json!(project_id));
    }
    object
        .entry("source".to_string())
        .or_insert_with(|| json!(source));
    object
        .entry("message".to_string())
        .or_insert_with(|| json!("已由 Lime AgentRuntime 物化为内容工厂工作区补丁。"));
    Some(patch)
}

fn build_agent_app_report_workspace_patch(
    artifact_kind: &str,
    project_id: &str,
    final_text_output: &str,
    required_skill_names: &[String],
) -> serde_json::Value {
    let output_summary = first_agent_app_output_line(final_text_output).unwrap_or_else(|| {
        "AgentRuntime 已完成 required Skills，但模型未返回可直接解析的结构化补丁。".to_string()
    });
    let raw_output = truncate_agent_app_materialized_text(final_text_output, 8000);
    let required_skills = required_skill_names
        .iter()
        .map(|skill| json!({ "skill": skill, "status": "completed" }))
        .collect::<Vec<_>>();
    let runtime_materialization = json!({
        "status": "repaired_from_runtime_output",
        "reason": "模型完成回合后没有创建 contentFactoryWorkspacePatch Artifact；Host Runtime 按 App 输出合同保留业务输出和 Skill 证据。",
        "rawRuntimeOutput": raw_output.clone(),
    });

    if artifact_kind == "review_report" {
        return json!({
            "kind": "content_factory.workspace_patch",
            "artifactKind": artifact_kind,
            "projectId": project_id,
            "mergePolicy": "replace_section",
            "source": "agent_app_output_contract_materialization",
            "message": "Lime AgentRuntime 已完成复盘分析，并物化为可复核工作区补丁。",
            "requiresHumanReview": true,
            "skillEvidence": required_skills,
            "reviewReport": {
                "status": "requires_review",
                "decision": "待人工复核",
                "summary": output_summary,
                "rawRuntimeOutput": raw_output,
                "nextCampaignSuggestion": {
                    "action": "review_before_next_campaign",
                    "reason": "已保留 AI Agent 输出，需人工确认后再进入下一轮运营动作。"
                }
            },
            "runtimeMaterialization": runtime_materialization,
        });
    }

    json!({
        "kind": "content_factory.workspace_patch",
        "artifactKind": artifact_kind,
        "projectId": project_id,
        "mergePolicy": "replace_section",
        "source": "agent_app_output_contract_materialization",
        "message": "Lime AgentRuntime 已完成交付包生成，并物化为可复核工作区补丁。",
        "requiresHumanReview": true,
        "skillEvidence": required_skills,
        "strategyReport": {
            "status": "requires_review",
            "title": "交付结论",
            "executiveSummary": {
                "decision": output_summary,
                "reason": "已保留 AI Agent 输出，需人工确认后进入正式交付。",
                "feasibilityScore": 0
            },
            "rawRuntimeOutput": raw_output,
            "riskCheck": {
                "status": "requires_review",
                "items": ["模型未返回结构化 strategy_report patch，已按运行输出生成可复核交付草稿。"]
            }
        },
        "pptOutline": {
            "title": "交付演示结构",
            "sections": [
                { "title": "项目背景与目标", "source": "runtime_output" },
                { "title": "内容资产与证据链", "source": "runtime_output" },
                { "title": "交付结论与风险", "source": "runtime_output" }
            ]
        },
        "runtimeMaterialization": runtime_materialization,
    })
}

fn build_agent_app_draft_workspace_patch(
    artifact_kind: &str,
    project_id: &str,
    final_text_output: &str,
    required_skill_names: &[String],
) -> serde_json::Value {
    let output_summary = first_agent_app_output_line(final_text_output).unwrap_or_else(|| {
        "AgentRuntime 已完成 required Skills，但模型未返回可直接解析的结构化补丁。".to_string()
    });
    let raw_output = truncate_agent_app_materialized_text(final_text_output, 8000);
    let required_skills = required_skill_names
        .iter()
        .map(|skill| json!({ "skill": skill, "status": "completed" }))
        .collect::<Vec<_>>();
    let runtime_materialization = json!({
        "status": "requires_human_review",
        "reason": "模型完成回合后没有创建 contentFactoryWorkspacePatch Artifact；Host Runtime 只物化可复核草稿，不把草稿伪装成已完成脚本或图片需求。",
        "rawRuntimeOutput": raw_output.clone(),
    });

    if artifact_kind == "prompt_batch" {
        return json!({
            "kind": "content_factory.workspace_patch",
            "artifactKind": artifact_kind,
            "projectId": project_id,
            "mergePolicy": "append_review_draft",
            "source": "agent_app_output_contract_materialization",
            "message": "Lime AgentRuntime 已完成图片需求草稿，并物化为需人工复核的工作区补丁。",
            "requiresHumanReview": true,
            "skillEvidence": required_skills,
            "imagePrompts": [{
                "id": "runtime-image-review-1",
                "prompt": output_summary,
                "description": raw_output,
                "requiresHumanReview": true,
                "source": "runtime_output_review_draft"
            }],
            "runtimeMaterialization": runtime_materialization,
        });
    }

    json!({
        "kind": "content_factory.workspace_patch",
        "artifactKind": artifact_kind,
        "projectId": project_id,
        "mergePolicy": "append_review_draft",
        "source": "agent_app_output_contract_materialization",
        "message": "Lime AgentRuntime 已完成脚本草稿，并物化为需人工复核的工作区补丁。",
        "requiresHumanReview": true,
        "skillEvidence": required_skills,
        "scripts": [{
            "id": "runtime-script-review-1",
            "templateLabel": "AI Agent 脚本草稿（需复核）",
            "level": "review",
            "opening": output_summary,
            "script": raw_output,
            "requiresHumanReview": true,
            "source": "runtime_output_review_draft"
        }],
        "runtimeMaterialization": runtime_materialization,
    })
}

pub(crate) fn build_agent_app_output_contract_workspace_patch(
    request_metadata: Option<&serde_json::Value>,
    final_text_output: &str,
) -> Option<serde_json::Value> {
    let output_contract = resolve_agent_app_output_contract_value(request_metadata)?;
    if !is_content_factory_agent_app_output_contract(request_metadata, &output_contract) {
        return None;
    }
    let artifact_kind = resolve_agent_app_output_contract_artifact_kind(&output_contract)?;
    let project_id = resolve_agent_app_content_factory_project_id(request_metadata);

    if let Some(patch) = extract_content_factory_workspace_patch_from_text(final_text_output)
        .and_then(|patch| {
            normalize_agent_app_workspace_patch(
                patch,
                artifact_kind.as_str(),
                project_id.as_str(),
                "agent_app_output_contract_model_patch",
            )
        })
    {
        return Some(patch);
    }

    if !is_agent_app_report_output_kind(artifact_kind.as_str())
        && !is_agent_app_draft_materialization_output_kind(artifact_kind.as_str())
    {
        return None;
    }

    let required_skill_names = collect_agent_app_required_skill_names(request_metadata);
    if final_text_output.trim().is_empty() && required_skill_names.is_empty() {
        return None;
    }

    if is_agent_app_draft_materialization_output_kind(artifact_kind.as_str()) {
        return Some(build_agent_app_draft_workspace_patch(
            artifact_kind.as_str(),
            project_id.as_str(),
            final_text_output,
            &required_skill_names,
        ));
    }

    Some(build_agent_app_report_workspace_patch(
        artifact_kind.as_str(),
        project_id.as_str(),
        final_text_output,
        &required_skill_names,
    ))
}

pub(super) fn agent_app_output_contract_slug(value: &str) -> String {
    let slug = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if slug.is_empty() {
        "agent-app".to_string()
    } else {
        slug
    }
}

pub(super) fn persist_agent_app_output_contract_workspace_patch(
    workspace_root: &str,
    task_id: &str,
    turn_id: &str,
    artifact_kind: &str,
    workspace_patch: &serde_json::Value,
) -> Result<(String, String), String> {
    let task_slug = agent_app_output_contract_slug(task_id);
    let turn_slug = agent_app_output_contract_slug(turn_id);
    let kind_slug = agent_app_output_contract_slug(artifact_kind);
    let relative_path = format!(
        ".lime/artifacts/agent-app/{task_slug}/{turn_slug}/{kind_slug}.workspace-patch.json"
    );
    let absolute_path = PathBuf::from(workspace_root)
        .join(relative_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = absolute_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Agent App Artifact 目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(workspace_patch)
        .map_err(|error| format!("序列化 Agent App workspace patch 失败: {error}"))?;
    std::fs::write(&absolute_path, content.as_bytes())
        .map_err(|error| format!("写入 Agent App workspace patch 失败: {error}"))?;
    Ok((relative_path, content))
}
