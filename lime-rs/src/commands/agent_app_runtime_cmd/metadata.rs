mod skill_contract;

use self::skill_contract::{
    build_agent_app_skill_contract, insert_agent_app_required_skill_tool_scope,
    render_agent_app_skill_contract_lines,
};
use super::common::{
    non_empty, AGENT_APP_RUNTIME_CAPABILITY_SOURCE, AGENT_APP_RUNTIME_METADATA_KEY,
    CONTENT_FACTORY_WORKSPACE_PATCH_KIND, LIME_RUNTIME_METADATA_KEY,
};
use super::tool_execution::{
    insert_agent_app_tool_execution_runtime_hints, render_agent_app_tool_execution_contract_lines,
};
use super::types::AgentAppRuntimeStartTaskRequest;
use crate::services::agent_app_runtime_capability_catalog_service::{
    resolve_capability_descriptors, AgentAppRuntimeCapabilityDescriptor,
};
use serde_json::{json, Map, Value};

fn default_task_message(request: &AgentAppRuntimeStartTaskRequest) -> String {
    let title = non_empty(request.title.as_deref())
        .or_else(|| non_empty(request.prompt.as_deref()))
        .unwrap_or_else(|| request.task_kind.trim().to_string());
    let input = request
        .input
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let expected_output = request
        .expected_output
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());

    [
        "【Agent App Runtime Task】".to_string(),
        format!("App: {}", request.app_id.trim()),
        format!(
            "Entry: {}",
            request.entry_key.as_deref().unwrap_or("default").trim()
        ),
        format!("TaskKind: {}", request.task_kind.trim()),
        format!("Title: {title}"),
        "".to_string(),
        "请在 Lime AgentRuntime 主链中完成这个 App 业务任务。".to_string(),
        "不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。"
            .to_string(),
        "".to_string(),
        "Input JSON:".to_string(),
        input,
        "".to_string(),
        "Expected Output JSON:".to_string(),
        expected_output,
    ]
    .join("\n")
}

fn expected_artifact_kind(request: &AgentAppRuntimeStartTaskRequest) -> Option<String> {
    let expected_output = request.expected_output.as_ref()?.as_object()?;
    [
        "artifactKind",
        "artifact_kind",
        "artifact_type",
        "artifactType",
        "kind",
        "outputKind",
    ]
    .iter()
    .filter_map(|key| expected_output.get(*key).and_then(Value::as_str))
    .find_map(|value| non_empty(Some(value)))
}

fn value_string_at_paths(value: Option<&Value>, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value?;
        for key in path.iter() {
            current = current.get(*key)?;
        }
        current.as_str().and_then(|item| non_empty(Some(item)))
    })
}

fn content_factory_project_id(request: &AgentAppRuntimeStartTaskRequest) -> Option<String> {
    value_string_at_paths(
        request.input.as_ref(),
        &[
            &["projectId"][..],
            &["project_id"][..],
            &["activeProjectId"][..],
            &["active_project_id"][..],
            &["project", "id"][..],
            &["projectContext", "project", "id"][..],
            &["project_context", "project", "id"][..],
        ],
    )
    .or_else(|| {
        value_string_at_paths(
            request.metadata.as_ref(),
            &[
                &["contentFactory", "projectId"][..],
                &["contentFactory", "project_id"][..],
                &["content_factory", "projectId"][..],
                &["content_factory", "project_id"][..],
                &["projectId"][..],
                &["project_id"][..],
            ],
        )
    })
}

fn is_content_factory_runtime_task(request: &AgentAppRuntimeStartTaskRequest) -> bool {
    request.app_id.trim() == "content-factory-app"
        || request.task_kind.trim().starts_with("content_factory.")
}

fn build_agent_app_output_contract(request: &AgentAppRuntimeStartTaskRequest) -> Option<Value> {
    if !is_content_factory_runtime_task(request) {
        return None;
    }
    let artifact_kind = expected_artifact_kind(request)?;
    let mut contract = json!({
        "producer": "agent_runtime_artifact_metadata",
        "artifact_kind": artifact_kind,
        "artifact_metadata_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
        "patch_metadata_keys": ["contentFactoryWorkspacePatch", "workspacePatch"],
        "required_patch_fields": ["kind", "projectId"],
        "accepted_patch_fields": [
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
            "riskCheck",
            "assetPack"
        ],
    });
    if let (Some(contract), Some(project_id)) = (
        contract.as_object_mut(),
        content_factory_project_id(request),
    ) {
        contract.insert("project_id".to_string(), json!(project_id));
    }
    Some(contract)
}

fn render_content_factory_artifact_requirements(artifact_kind: &str) -> Vec<String> {
    match artifact_kind {
        "scene_table" => vec![
            "- artifactKind=scene_table 时，最终 JSON 必须写入 contentFactoryWorkspacePatch.sceneTable。".to_string(),
            "- sceneTable.actualCount 必须不小于 expectedOutput.minimumScenarioCount；sceneTable.rows 必须是可物化数组，每条至少包含 scene / dimension / decisionStage / imageBrief。".to_string(),
            "- imagePrompts 必须随 sceneTable 一起写入；如果 Skill 只返回 evidence / review_pack，也要把 Skill 依据综合成 scene_table workspace patch。".to_string(),
            "- 只返回 analysis artifact、Markdown 总结或 Skill evidence 不算完成；没有 sceneTable workspace patch 时任务应继续补齐结构化 JSON。".to_string(),
        ],
        "content_batch" => vec![
            "- artifactKind=content_batch 时，最终 JSON 必须写入 contentFactoryWorkspacePatch.contentBatch，并按需要写入 scripts / imagePrompts。".to_string(),
            "- contentBatch.items 必须是可审核数组；只返回自然语言文案摘要不算完成。".to_string(),
        ],
        "script_batch" => vec![
            "- artifactKind=script_batch 时，最终 JSON 必须写入 contentFactoryWorkspacePatch.scripts，并保留对应 imagePrompts 或场景依据。".to_string(),
            "- scripts 必须是可审核数组；只返回一个普通分析 artifact 不算完成。".to_string(),
        ],
        "strategy_report" => vec![
            "- artifactKind=strategy_report 时，最终 JSON 必须写入 strategyReport，并按需要写入 pptOutline / riskCheck。".to_string(),
        ],
        "review_report" => vec![
            "- artifactKind=review_report 时，最终 JSON 必须写入 reviewReport，并给出下一轮建议和人工确认依据。".to_string(),
        ],
        _ => Vec::new(),
    }
}

pub(super) fn build_agent_app_runtime_task_message(
    request: &AgentAppRuntimeStartTaskRequest,
) -> String {
    let prompt = non_empty(request.prompt.as_deref())
        .or_else(|| non_empty(request.title.as_deref()))
        .unwrap_or_else(|| request.task_kind.trim().to_string());
    let input = request
        .input
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let expected_output = request
        .expected_output
        .as_ref()
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let mut lines = vec![
        "【Agent App Runtime Task】".to_string(),
        format!("App: {}", request.app_id.trim()),
        format!(
            "Entry: {}",
            request.entry_key.as_deref().unwrap_or("default").trim()
        ),
        format!("TaskKind: {}", request.task_kind.trim()),
        "".to_string(),
        "Business Prompt:".to_string(),
        prompt,
        "".to_string(),
        "Runtime Boundary:".to_string(),
        "- 请在 Lime AgentRuntime 主链中完成这个 App 业务任务。".to_string(),
        "- 不要要求用户跳回通用 Chat；如需补充上下文，请通过可审计的 action / request 机制表达。"
            .to_string(),
    ];

    lines.extend(render_agent_app_tool_execution_contract_lines(
        request.metadata.as_ref(),
    ));

    if let Some(skill_contract) =
        build_agent_app_skill_contract(request, is_content_factory_runtime_task(request))
    {
        lines.extend(render_agent_app_skill_contract_lines(&skill_contract));
    }

    if let Some(contract) = build_agent_app_output_contract(request) {
        let artifact_kind = contract
            .get("artifact_kind")
            .and_then(Value::as_str)
            .unwrap_or("content_batch");
        if let Some(project_id) = content_factory_project_id(request) {
            lines.push(format!(
                "- patch.projectId 必须等于当前 Agent App 请求的项目 ID：{project_id}；不得改成样例或历史项目 ID。"
            ));
        }
        lines.extend([
            "".to_string(),
            "Content Factory Output Contract:".to_string(),
            format!(
                "- 如果任务产出可直接物化到内容工厂项目，必须创建 artifactKind={artifact_kind} 的 artifact。"
            ),
            format!(
                "- artifact metadata 必须包含 contentFactoryWorkspacePatch 或 workspacePatch；metadata.kind 可使用 {}。",
                CONTENT_FACTORY_WORKSPACE_PATCH_KIND
            ),
            "- 不要通过 Bash、shell、脚本或直接写 .lime/artifacts 文件来伪造 artifact；最终回答应直接输出结构化 JSON。"
                .to_string(),
            "- 最终回答的顶层 JSON 必须包含 contentFactoryWorkspacePatch 或 workspacePatch，方便 Host 自动回写当前 App 页面。"
                .to_string(),
            "- patch 至少包含 kind / projectId，并按结果类型填写 sceneTable、contentBatch、scripts、imagePrompts、assetPack、strategyReport、pptOutline、reviewReport 或 riskCheck。"
                .to_string(),
            "- tools / capabilityHints 只是可选能力提示，不能把复合内容工厂任务改写成单一 research / image Skill；业务 requiredSkills 必须先通过 Skill 工具执行，最终仍收敛为 workspace patch。"
                .to_string(),
            "- 不要只返回自然语言总结；结构化 patch 是 App 自动回写当前页面的事实源。".to_string(),
        ]);
        lines.extend(render_content_factory_artifact_requirements(artifact_kind));
    }

    lines.extend([
        "".to_string(),
        "Input JSON:".to_string(),
        input,
        "".to_string(),
        "Expected Output JSON:".to_string(),
        expected_output,
    ]);

    lines.join("\n")
}

fn insert_string_if_some(map: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.map(|item| item.trim().to_string()) {
        if !value.is_empty() {
            map.insert(key.to_string(), json!(value));
        }
    }
}

fn is_connector_authorization_secret_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .collect::<String>()
        .to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "secretbinding" | "tokenexposed" | "sessionscoped"
    ) {
        return false;
    }
    normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("apikey")
        || normalized.contains("credential")
        || normalized.contains("authorization")
        || normalized.contains("oauth")
        || normalized.contains("password")
}

fn sanitize_connector_authorization_value(value: &Value, key: Option<&str>, depth: usize) -> Value {
    if key.is_some_and(is_connector_authorization_secret_key) {
        return json!("[redacted:host_managed_secret]");
    }
    if depth >= 8 {
        return json!("[redacted:depth_limit]");
    }
    match value {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| sanitize_connector_authorization_value(item, key, depth + 1))
                .collect(),
        ),
        Value::Object(object) => Value::Object(
            object
                .iter()
                .map(|(item_key, item_value)| {
                    (
                        item_key.clone(),
                        sanitize_connector_authorization_value(
                            item_value,
                            Some(item_key.as_str()),
                            depth + 1,
                        ),
                    )
                })
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn app_task_prompt_summary(request: &AgentAppRuntimeStartTaskRequest) -> String {
    non_empty(request.prompt.as_deref())
        .or_else(|| non_empty(request.title.as_deref()))
        .unwrap_or_else(|| default_task_message(request))
}

fn build_agent_app_capability_request_context(
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
    descriptor: AgentAppRuntimeCapabilityDescriptor,
) -> Map<String, Value> {
    let prompt = app_task_prompt_summary(request);
    let mut context = Map::new();

    context.insert(
        "source".to_string(),
        json!(AGENT_APP_RUNTIME_CAPABILITY_SOURCE),
    );
    context.insert("capability_id".to_string(), json!(descriptor.capability_id));
    context.insert("app_id".to_string(), json!(request.app_id.trim()));
    context.insert("task_id".to_string(), json!(task_id));
    context.insert("trace_id".to_string(), json!(trace_id));
    context.insert("task_kind".to_string(), json!(request.task_kind.trim()));
    context.insert(
        "entry_source".to_string(),
        json!(AGENT_APP_RUNTIME_CAPABILITY_SOURCE),
    );
    context.insert("raw_text".to_string(), json!(prompt.clone()));
    context.insert("prompt".to_string(), json!(prompt));
    context.insert(
        "required_capabilities".to_string(),
        json!(request.required_capabilities.clone()),
    );
    context.insert(
        "capability_hints".to_string(),
        json!(request.capability_hints.clone()),
    );
    context.insert(
        "human_review".to_string(),
        json!(request.human_review.unwrap_or(false)),
    );

    insert_string_if_some(
        &mut context,
        "entry_key",
        non_empty(request.entry_key.as_deref()),
    );
    insert_string_if_some(
        &mut context,
        "workspace_id",
        non_empty(request.workspace_id.as_deref()),
    );
    insert_string_if_some(
        &mut context,
        "idempotency_key",
        non_empty(request.idempotency_key.as_deref()),
    );

    if let Some(input) = request.input.clone() {
        context.insert("input".to_string(), input);
    }
    if let Some(expected_output) = request.expected_output.clone() {
        context.insert("expected_output".to_string(), expected_output);
    }
    if !request.knowledge_bindings.is_empty() {
        context.insert(
            "knowledge_bindings".to_string(),
            json!(request.knowledge_bindings.clone()),
        );
    }

    match descriptor.context_key {
        "image_task" | "cover_task" => {
            context.insert("mode".to_string(), json!("generate"));
        }
        "research_request" | "report_request" => {
            if !context.contains_key("query") {
                let query = context
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请根据当前 App 任务补齐资料")
                    .to_string();
                context.insert("query".to_string(), json!(query));
            }
        }
        _ => {}
    }

    context
}

fn resolve_agent_app_runtime_capability_descriptors(
    request: &AgentAppRuntimeStartTaskRequest,
) -> Vec<AgentAppRuntimeCapabilityDescriptor> {
    resolve_capability_descriptors(
        request
            .required_capabilities
            .iter()
            .map(String::as_str)
            .chain(request.capability_hints.iter().map(String::as_str)),
    )
}

fn capability_descriptor_metadata(descriptor: AgentAppRuntimeCapabilityDescriptor) -> Value {
    json!({
        "capability_id": descriptor.capability_id,
        "skill_name": descriptor.skill_name,
        "launch_key": descriptor.launch_key,
        "context_key": descriptor.context_key,
        "default_kind": descriptor.default_kind,
    })
}

fn build_agent_app_capability_workflow_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    descriptors: &[AgentAppRuntimeCapabilityDescriptor],
    output_contract: Option<&Value>,
    inserts_primary_launch: bool,
) -> Option<Value> {
    if descriptors.is_empty() {
        return None;
    }

    Some(json!({
        "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
        "mode": if output_contract.is_some() {
            "composite_output_contract"
        } else if descriptors.len() > 1 {
            "multi_capability"
        } else {
            "single_capability"
        },
        "launch_policy": if inserts_primary_launch {
            "primary_skill_launch"
        } else {
            "metadata_only"
        },
        "requested_capabilities": request.required_capabilities.clone(),
        "capability_hints": request.capability_hints.clone(),
        "descriptors": descriptors
            .iter()
            .copied()
            .map(capability_descriptor_metadata)
            .collect::<Vec<_>>(),
    }))
}

fn insert_agent_app_capability_launch_metadata(
    root: &mut Map<String, Value>,
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
    descriptor: AgentAppRuntimeCapabilityDescriptor,
) {
    let launch_context =
        build_agent_app_capability_request_context(request, task_id, trace_id, descriptor);
    let harness = root
        .entry("harness".to_string())
        .or_insert_with(|| json!({}));
    let Some(harness) = harness.as_object_mut() else {
        return;
    };

    harness.insert("allow_model_skills".to_string(), json!(true));
    let mut launch = Map::new();
    launch.insert("skill_name".to_string(), json!(descriptor.skill_name));
    launch.insert("kind".to_string(), json!(descriptor.default_kind));
    launch.insert(
        descriptor.context_key.to_string(),
        Value::Object(launch_context),
    );
    harness.insert(descriptor.launch_key.to_string(), Value::Object(launch));
}

fn should_insert_agent_app_capability_launch_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    output_contract: Option<&Value>,
) -> bool {
    // 内容工厂这类复合业务任务的 tools/capabilityHints 表示“可用能力”，
    // 不能被提升为单一 Claw Skill 启动，否则会偏离 App 的 workspace patch 产物合同。
    if is_content_factory_runtime_task(request) && output_contract.is_some() {
        return false;
    }

    true
}

fn insert_agent_app_output_contract_runtime_hints(
    harness: &mut Map<String, Value>,
    request: &AgentAppRuntimeStartTaskRequest,
    output_contract: Option<&Value>,
) {
    if !is_content_factory_runtime_task(request) || output_contract.is_none() {
        return;
    }

    // 内容工厂 patch 产出优先走直接回答 + ArtifactDocument 自动落盘，
    // 避免复合业务任务被 FullRuntime 的通用工具链带偏成读文件 / Bash / 子代理循环。
    harness
        .entry("chat_mode".to_string())
        .or_insert_with(|| json!("general"));
    harness
        .entry("session_mode".to_string())
        .or_insert_with(|| json!("general_workbench"));
}

pub(super) fn build_agent_app_runtime_metadata(
    request: &AgentAppRuntimeStartTaskRequest,
    task_id: &str,
    trace_id: &str,
) -> Value {
    let mut metadata = request.metadata.clone().unwrap_or_else(|| json!({}));
    if !metadata.is_object() {
        metadata = json!({});
    }
    let connector_authorization = metadata
        .get("agent_app_connector_authorization")
        .map(|value| sanitize_connector_authorization_value(value, None, 0));

    let mut app_runtime = json!({
        "surface": "agent_app",
        "app_id": request.app_id.trim(),
        "entry_key": request.entry_key.as_deref().unwrap_or("").trim(),
        "task_id": task_id,
        "trace_id": trace_id,
        "task_kind": request.task_kind.trim(),
        "idempotency_key": request.idempotency_key.as_deref().unwrap_or("").trim(),
        "required_capabilities": request.required_capabilities.clone(),
        "capability_hints": request.capability_hints.clone(),
        "knowledge_bindings": request.knowledge_bindings.clone(),
        "human_review": request.human_review.unwrap_or(false),
    });
    let output_contract = build_agent_app_output_contract(request);
    let skill_contract =
        build_agent_app_skill_contract(request, is_content_factory_runtime_task(request));
    let capability_descriptors = resolve_agent_app_runtime_capability_descriptors(request);
    let should_insert_primary_capability_launch =
        should_insert_agent_app_capability_launch_metadata(request, output_contract.as_ref())
            && !capability_descriptors.is_empty();
    let capability_workflow = build_agent_app_capability_workflow_metadata(
        request,
        &capability_descriptors,
        output_contract.as_ref(),
        should_insert_primary_capability_launch,
    );
    if let (Some(app_runtime), Some(output_contract)) =
        (app_runtime.as_object_mut(), output_contract.clone())
    {
        app_runtime.insert("output_contract".to_string(), output_contract);
    }
    if let (Some(app_runtime), Some(project_id)) = (
        app_runtime.as_object_mut(),
        content_factory_project_id(request),
    ) {
        app_runtime.insert("project_id".to_string(), json!(project_id));
    }
    if let (Some(app_runtime), Some(capability_workflow)) =
        (app_runtime.as_object_mut(), capability_workflow.clone())
    {
        app_runtime.insert("capability_workflow".to_string(), capability_workflow);
    }
    if let (Some(app_runtime), Some(skill_contract)) =
        (app_runtime.as_object_mut(), skill_contract.clone())
    {
        app_runtime.insert("skill_contract".to_string(), skill_contract);
    }

    if let Some(root) = metadata.as_object_mut() {
        if let Some(connector_authorization) = connector_authorization.clone() {
            root.insert(
                "agent_app_connector_authorization".to_string(),
                connector_authorization.clone(),
            );
        }
        root.insert(
            AGENT_APP_RUNTIME_METADATA_KEY.to_string(),
            app_runtime.clone(),
        );
        if let Some(project_id) = content_factory_project_id(request) {
            let content_factory = root
                .entry("contentFactory".to_string())
                .or_insert_with(|| json!({}));
            if let Some(content_factory) = content_factory.as_object_mut() {
                content_factory.insert("projectId".to_string(), json!(project_id));
            }
        }
        let lime_runtime = root
            .entry(LIME_RUNTIME_METADATA_KEY.to_string())
            .or_insert_with(|| json!({}));
        if let Some(lime_runtime) = lime_runtime.as_object_mut() {
            lime_runtime.insert("surface".to_string(), json!("agent_app"));
            lime_runtime.insert("app_id".to_string(), json!(request.app_id.trim()));
            lime_runtime.insert("task_id".to_string(), json!(task_id));
            lime_runtime.insert("trace_id".to_string(), json!(trace_id));
            lime_runtime.insert("task_kind".to_string(), json!(request.task_kind.trim()));
            let runtime_summary = lime_runtime
                .entry("runtime_summary".to_string())
                .or_insert_with(|| json!({}));
            if let Some(runtime_summary) = runtime_summary.as_object_mut() {
                runtime_summary.insert("surface".to_string(), json!("agent_app"));
                runtime_summary.insert("app_id".to_string(), json!(request.app_id.trim()));
                runtime_summary.insert("task_id".to_string(), json!(task_id));
                runtime_summary.insert("trace_id".to_string(), json!(trace_id));
                runtime_summary.insert("task_kind".to_string(), json!(request.task_kind.trim()));
                if let Some(connector_authorization) = connector_authorization.clone() {
                    runtime_summary.insert(
                        "agent_app_connector_authorization".to_string(),
                        connector_authorization,
                    );
                }
            }
        }
        let should_insert_skill_tool_scope = skill_contract.is_some();
        {
            let harness = root
                .entry("harness".to_string())
                .or_insert_with(|| json!({}));
            if let Some(harness) = harness.as_object_mut() {
                harness.insert(
                    AGENT_APP_RUNTIME_METADATA_KEY.to_string(),
                    app_runtime.clone(),
                );
                if let Some(output_contract) = output_contract.clone() {
                    harness.insert(
                        "agent_app_runtime_output_contract".to_string(),
                        output_contract,
                    );
                }
                if let Some(project_id) = content_factory_project_id(request) {
                    let content_factory = harness
                        .entry("contentFactory".to_string())
                        .or_insert_with(|| json!({}));
                    if let Some(content_factory) = content_factory.as_object_mut() {
                        content_factory.insert("projectId".to_string(), json!(project_id));
                    }
                }
                insert_agent_app_output_contract_runtime_hints(
                    harness,
                    request,
                    output_contract.as_ref(),
                );
                if let Some(skill_contract) = skill_contract.clone() {
                    harness.insert("allow_model_skills".to_string(), json!(true));
                    harness.insert(
                        "agent_app_runtime_skill_contract".to_string(),
                        skill_contract.clone(),
                    );
                    harness.insert("content_factory_skill_contract".to_string(), skill_contract);
                }
                if let Some(capability_workflow) = capability_workflow.clone() {
                    harness.insert(
                        "agent_app_runtime_capability_workflow".to_string(),
                        capability_workflow,
                    );
                }
            }
        }
        if should_insert_skill_tool_scope {
            insert_agent_app_required_skill_tool_scope(root);
        }
        insert_agent_app_tool_execution_runtime_hints(root);
        if should_insert_primary_capability_launch {
            if let Some(descriptor) = capability_descriptors.first().copied() {
                insert_agent_app_capability_launch_metadata(
                    root, request, task_id, trace_id, descriptor,
                );
            }
        }
    }

    metadata
}
