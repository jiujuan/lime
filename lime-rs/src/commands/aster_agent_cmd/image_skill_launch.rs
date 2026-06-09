use super::*;
use crate::commands::modality_runtime_contracts::{
    insert_image_generation_contract_fields, IMAGE_GENERATION_CONTRACT_KEY,
    IMAGE_GENERATION_MODALITY, IMAGE_GENERATION_ROUTING_SLOT,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};

const IMAGE_SKILL_INPUT_REF_PREFIX: &str = "skill-input-image://";
pub(super) const IMAGE_SKILL_LAUNCH_PROMPT_MARKER: &str = "<<LIME_IMAGE_SKILL_LAUNCH_HINT>>";
const IMAGE_GENERATION_CONFIRMATION_GUARD_MARKER: &str =
    "<<LIME_IMAGE_GENERATION_CONFIRMATION_GUARD>>";
const IMAGE_SKILL_LAUNCH_DETOUR_DENY_PATTERNS: &[&str] = &[
    TOOL_SEARCH_TOOL_NAME,
    "WebSearch",
    "web_search",
    LIME_SEARCH_WEB_IMAGES_TOOL_NAME,
    "search_web_images",
    "Bash",
    "Read",
    "read",
    "Write",
    "write",
    "Edit",
    "edit",
    "Glob",
    "glob",
    "Grep",
    "grep",
    "mcp__lime-browser__*",
    "browser_*",
    "mcp__playwright__*",
    "playwright*",
];
const IMAGE_SKILL_LAUNCH_MAIN_ALLOWED_TOOLS: &[&str] = &["Skill"];
const IMAGE_SKILL_LAUNCH_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const IMAGE_SKILL_LAUNCH_TOOL_SURFACE_KEY: &str = "tool_surface";
const IMAGE_SKILL_LAUNCH_RUNTIME_CONTROL_KEY: &str = "runtime_control";
const IMAGE_SKILL_LAUNCH_STOP_AFTER_TOOL_RESULT_KEY: &str = "stop_after_tool_result";
fn extract_object_string(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn insert_non_empty_string_if_missing(
    record: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: Option<&str>,
) {
    if record
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .is_some()
    {
        return;
    }
    let Some(value) = value.map(str::trim).filter(|item| !item.is_empty()) else {
        return;
    };
    record.insert(
        key.to_string(),
        serde_json::Value::String(value.to_string()),
    );
}

fn build_image_skill_input_ref(index: usize) -> String {
    format!("{IMAGE_SKILL_INPUT_REF_PREFIX}{}", index + 1)
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        "image/svg+xml" => "svg",
        _ => "png",
    }
}

fn resolve_image_skill_input_root(
    workspace_root: &Path,
    session_id: &str,
    turn_id: &str,
) -> PathBuf {
    workspace_root
        .join(".lime")
        .join("turn-inputs")
        .join(session_id)
        .join(turn_id)
}

fn persist_image_skill_input_images(root: &Path, images: &[ImageInput]) -> Vec<Option<String>> {
    if images.is_empty() {
        return Vec::new();
    }

    if let Err(error) = fs::create_dir_all(root) {
        tracing::warn!(
            "[AsterAgent] 创建图片技能输入目录失败 path={}: {}",
            root.display(),
            error
        );
        return vec![None; images.len()];
    }

    images
        .iter()
        .enumerate()
        .map(|(index, image)| {
            let file_name = format!(
                "input-{}.{}",
                index + 1,
                extension_for_media_type(&image.media_type)
            );
            let file_path = root.join(file_name);
            let bytes = match STANDARD.decode(&image.data) {
                Ok(bytes) => bytes,
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 解码图片技能输入失败 ref={} media_type={}: {}",
                        build_image_skill_input_ref(index),
                        image.media_type,
                        error
                    );
                    return None;
                }
            };
            match fs::write(&file_path, bytes) {
                Ok(_) => Some(file_path.to_string_lossy().to_string()),
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 写入图片技能输入失败 path={}: {}",
                        file_path.display(),
                        error
                    );
                    None
                }
            }
        })
        .collect()
}

fn replace_image_skill_input_refs(
    value: &mut serde_json::Value,
    materialized_paths: &[Option<String>],
) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                replace_image_skill_input_refs(item, materialized_paths);
            }
        }
        serde_json::Value::Object(record) => {
            for item in record.values_mut() {
                replace_image_skill_input_refs(item, materialized_paths);
            }
        }
        serde_json::Value::String(text) => {
            let normalized = text.trim();
            if let Some(index_text) = normalized.strip_prefix(IMAGE_SKILL_INPUT_REF_PREFIX) {
                if let Ok(index) = index_text.parse::<usize>() {
                    if let Some(Some(path)) = materialized_paths.get(index.saturating_sub(1)) {
                        *value = serde_json::Value::String(path.clone());
                    }
                }
            }
        }
        _ => {}
    }
}

fn extract_harness_nested_object_mut<'a>(
    value: &'a mut serde_json::Value,
    keys: &[&str],
) -> Option<&'a mut serde_json::Map<String, serde_json::Value>> {
    let root = value.as_object_mut()?;
    let harness = if root.contains_key("harness") {
        root.get_mut("harness")
            .and_then(serde_json::Value::as_object_mut)?
    } else {
        root
    };

    for key in keys.iter().copied() {
        let exists = harness
            .get(key)
            .and_then(serde_json::Value::as_object)
            .is_some();
        if exists {
            return harness
                .get_mut(key)
                .and_then(serde_json::Value::as_object_mut);
        }
    }

    None
}

fn ensure_image_skill_launch_workbench_chat_mode(value: &mut serde_json::Value) {
    let Some(root) = value.as_object_mut() else {
        return;
    };
    let harness = if root.contains_key("harness") {
        match root
            .get_mut("harness")
            .and_then(serde_json::Value::as_object_mut)
        {
            Some(harness) => harness,
            None => return,
        }
    } else {
        root
    };

    let has_launch = ["image_skill_launch", "imageSkillLaunch"]
        .iter()
        .any(|key| {
            harness
                .get(*key)
                .and_then(serde_json::Value::as_object)
                .is_some()
        });
    if !has_launch {
        return;
    }

    harness.insert(
        "chat_mode".to_string(),
        serde_json::Value::String("workbench".to_string()),
    );
}

fn ensure_image_skill_launch_turn_tool_scope(value: &mut serde_json::Value) {
    let Some(root) = value.as_object_mut() else {
        return;
    };
    let launch_container = root
        .get("harness")
        .and_then(serde_json::Value::as_object)
        .unwrap_or(root);
    let has_launch = ["image_skill_launch", "imageSkillLaunch"]
        .iter()
        .any(|key| {
            launch_container
                .get(*key)
                .and_then(serde_json::Value::as_object)
                .is_some()
        });
    if !has_launch {
        return;
    }

    root.insert(
        "tool_scope".to_string(),
        serde_json::json!({
            "allowed_tools": IMAGE_SKILL_LAUNCH_MAIN_ALLOWED_TOOLS,
            "source": "image_skill_launch"
        }),
    );
    root.insert(
        IMAGE_SKILL_LAUNCH_RUNTIME_CONTROL_KEY.to_string(),
        serde_json::json!({
            IMAGE_SKILL_LAUNCH_STOP_AFTER_TOOL_RESULT_KEY: {
                "source": "image_skill_launch",
                "metadata_equals": {
                    "skill_forwarded_tool_name": "lime_create_image_generation_task",
                    "task_type": "image_generate"
                },
                "require_any": ["task_id", "artifact_path", "path"],
                "statuses": ["pending_submit", "queued", "running", "partial", "succeeded"]
            }
        }),
    );
    if let Some(runtime) = root
        .get_mut(IMAGE_SKILL_LAUNCH_RUNTIME_METADATA_KEY)
        .and_then(serde_json::Value::as_object_mut)
    {
        runtime.remove(IMAGE_SKILL_LAUNCH_TOOL_SURFACE_KEY);
    }
}

fn ensure_image_generation_contract_metadata(
    launch: &mut serde_json::Map<String, serde_json::Value>,
) {
    insert_image_generation_contract_fields(launch);
    if let Some(image_task) = launch
        .get_mut("image_task")
        .and_then(serde_json::Value::as_object_mut)
    {
        insert_image_generation_contract_fields(image_task);
    }
}

fn truncate_prompt_text(value: String, max_chars: usize) -> String {
    let total_chars = value.chars().count();
    if total_chars <= max_chars {
        return value;
    }

    let truncated = value.chars().take(max_chars).collect::<String>();
    format!("{truncated}...(已截断，原始长度 {total_chars} 字)")
}

fn truncate_json_value(value: Option<&serde_json::Value>, max_chars: usize) -> Option<String> {
    value.map(|item| {
        truncate_prompt_text(
            serde_json::to_string(item).unwrap_or_else(|_| "{}".to_string()),
            max_chars,
        )
    })
}

pub(crate) fn prepare_image_skill_launch_request_metadata(
    workspace_root: &Path,
    session_id: &str,
    turn_id: &str,
    request_metadata: Option<&serde_json::Value>,
    images: Option<&[ImageInput]>,
) -> Option<serde_json::Value> {
    let mut metadata = request_metadata.cloned()?;
    ensure_image_skill_launch_workbench_chat_mode(&mut metadata);
    ensure_image_skill_launch_turn_tool_scope(&mut metadata);

    let Some(launch) = extract_harness_nested_object_mut(
        &mut metadata,
        &["image_skill_launch", "imageSkillLaunch"],
    ) else {
        return Some(metadata);
    };

    ensure_image_generation_contract_metadata(launch);

    let Some(images) = images.filter(|items| !items.is_empty()) else {
        return Some(metadata);
    };

    let image_root = resolve_image_skill_input_root(workspace_root, session_id, turn_id);
    let materialized_paths = persist_image_skill_input_images(&image_root, images);
    if materialized_paths.is_empty() {
        return Some(metadata);
    }

    let mut launch_value = serde_json::Value::Object(launch.clone());
    replace_image_skill_input_refs(&mut launch_value, &materialized_paths);
    if let Some(updated_launch) = launch_value.as_object() {
        *launch = updated_launch.clone();
    }

    Some(metadata)
}

pub(crate) fn merge_system_prompt_with_image_skill_launch(
    base_prompt: Option<String>,
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let Some(launch_prompt) = build_image_skill_launch_system_prompt(request_metadata) else {
        return merge_prompt_once(
            base_prompt,
            IMAGE_GENERATION_CONFIRMATION_GUARD_MARKER,
            build_image_generation_confirmation_guard_prompt(),
        );
    };

    merge_prompt_once(base_prompt, IMAGE_SKILL_LAUNCH_PROMPT_MARKER, launch_prompt)
}

fn merge_prompt_once(
    base_prompt: Option<String>,
    marker: &str,
    appended_prompt: String,
) -> Option<String> {
    match base_prompt {
        Some(base) => {
            if base.contains(marker) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(appended_prompt)
            } else {
                Some(format!("{base}\n\n{appended_prompt}"))
            }
        }
        None => Some(appended_prompt),
    }
}

fn build_image_generation_confirmation_guard_prompt() -> String {
    [
        IMAGE_GENERATION_CONFIRMATION_GUARD_MARKER,
        "- 普通聊天中，用户可能是在让你整理视觉方案、海报概念或生成提示词；不要因此自动调用 Skill(image_generate) 或 lime_create_image_generation_task。",
        "- 只有当用户显式使用 @配图/@修图/@重绘/@image，或在你询问后明确确认“调用画图/现在生成/开始画”时，才允许进入图片生成主链。",
        "- 如果用户没有 @ 命令但内容明显像配图提示词、海报 brief、封面 brief 或视觉设计 brief，必须先用 1 句简洁确认：是否要调用画图功能生成图片。",
        "- 上述普通视觉 brief 确认回合不要输出 HTML/CSS/SVG/Markdown 草图，不要写完整设计方案，不要生成提示词全文，不要输出任务详情表、排队状态或任务已提交模板。",
        "- 确认句必须按用户当前语言和上下文自然表达，不要机械复述固定句式。",
    ]
    .join("\n")
}

pub(crate) fn should_lock_image_skill_launch_to_image_generation(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    let Some(launch) = extract_harness_nested_object(
        request_metadata,
        &["image_skill_launch", "imageSkillLaunch"],
    ) else {
        return false;
    };

    extract_object_string(launch, &["kind"]).unwrap_or_else(|| "image_task".to_string())
        == "image_task"
}

pub(crate) fn append_image_skill_launch_session_permissions(
    permissions: &mut Vec<ToolPermission>,
    session_id: &str,
    request_metadata: Option<&serde_json::Value>,
) {
    if !should_lock_image_skill_launch_to_image_generation(request_metadata) {
        return;
    }

    let session_id = session_id.trim();
    let conditions = if session_id.is_empty() {
        Vec::new()
    } else {
        vec![PermissionCondition {
            condition_type: ConditionType::Session,
            field: Some("session_id".to_string()),
            operator: ConditionOperator::Equals,
            value: serde_json::json!(session_id),
            validator: None,
            description: Some("仅对当前图片技能启动回合生效".to_string()),
        }]
    };

    for pattern in IMAGE_SKILL_LAUNCH_DETOUR_DENY_PATTERNS {
        permissions.push(ToolPermission {
            tool: (*pattern).to_string(),
            allowed: false,
            priority: 1240,
            conditions: conditions.clone(),
            parameter_restrictions: Vec::new(),
            scope: PermissionScope::Session,
            reason: Some(
                "图片技能启动回合已锁定为 Skill(image_generate) 主链，禁止先走通用工具搜索/读文件链路偏航"
                    .to_string(),
            ),
            expires_at: None,
            metadata: HashMap::new(),
        });
    }
}

pub(crate) fn prune_image_skill_launch_detour_tools_from_registry(
    registry: &mut aster::tools::ToolRegistry,
    request_metadata: Option<&serde_json::Value>,
) {
    if !should_lock_image_skill_launch_to_image_generation(request_metadata) {
        return;
    }

    for tool_name in IMAGE_SKILL_LAUNCH_DETOUR_DENY_PATTERNS {
        registry.unregister(tool_name);
    }
    for tool in get_chrome_mcp_tools() {
        registry.unregister(&format!("mcp__lime-browser__{}", tool.name));
    }
}

fn build_image_skill_launch_system_prompt(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let launch = extract_harness_nested_object(
        request_metadata,
        &["image_skill_launch", "imageSkillLaunch"],
    )?;
    let kind = extract_object_string(launch, &["kind"]).unwrap_or_else(|| "image_task".to_string());
    if kind != "image_task" {
        return None;
    }

    let skill_name = extract_object_string(launch, &["skill_name", "skillName"])
        .unwrap_or_else(|| "image_generate".to_string());
    let image_task = launch
        .get("image_task")
        .and_then(serde_json::Value::as_object)?;
    let raw_text = extract_object_string(image_task, &["raw_text", "rawText"]);
    let prompt = extract_object_string(image_task, &["prompt"]);
    let mode =
        extract_object_string(image_task, &["mode"]).unwrap_or_else(|| "generate".to_string());
    let size = extract_object_string(image_task, &["size"]);
    let layout_hint = extract_object_string(image_task, &["layout_hint", "layoutHint"]);
    let aspect_ratio = extract_object_string(image_task, &["aspect_ratio", "aspectRatio"]);
    let provider_id = extract_object_string(image_task, &["provider_id", "providerId"]);
    let model = extract_object_string(image_task, &["model"]);
    let entry_source = extract_object_string(image_task, &["entry_source", "entrySource"])
        .unwrap_or_else(|| "at_image_command".to_string());
    let modality_contract_key = extract_object_string(
        image_task,
        &["modality_contract_key", "modalityContractKey"],
    )
    .unwrap_or_else(|| IMAGE_GENERATION_CONTRACT_KEY.to_string());
    let modality = extract_object_string(image_task, &["modality"])
        .unwrap_or_else(|| IMAGE_GENERATION_MODALITY.to_string());
    let routing_slot = extract_object_string(image_task, &["routing_slot", "routingSlot"])
        .unwrap_or_else(|| IMAGE_GENERATION_ROUTING_SLOT.to_string());
    let reference_images = image_task
        .get("reference_images")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let persona_context_json = truncate_json_value(image_task.get("persona_context"), 2_000);
    let presentation_json = truncate_json_value(image_task.get("presentation"), 2_000);
    let taste_context_json = truncate_json_value(image_task.get("taste_context"), 2_000);
    let args_payload = serde_json::json!({
        "user_input": prompt
            .clone()
            .or(raw_text.clone())
            .unwrap_or_else(|| "请根据当前要求执行图片任务".to_string()),
        "image_task": serde_json::Value::Object(image_task.clone()),
    });
    let args_json = truncate_prompt_text(
        serde_json::to_string(&args_payload).unwrap_or_else(|_| "{}".to_string()),
        4_000,
    );
    let image_task_json = truncate_prompt_text(
        serde_json::to_string(image_task).unwrap_or_else(|_| "{}".to_string()),
        4_000,
    );

    let mut lines = vec![
        IMAGE_SKILL_LAUNCH_PROMPT_MARKER.to_string(),
        "- 当前回合来自图片技能启动，不要把它当成普通聊天回答。".to_string(),
        format!(
            "- 当前底层运行合同：modality_contract_key={modality_contract_key}, modality={modality}, routing_slot={routing_slot}；后续创建任务必须原样保留 contract 字段。"
        ),
        "- 先快速归纳用户目标，然后立刻把任务交给 Skill 工具；不要停留在泛泛解释。".to_string(),
        "- 如果发现人物肖像、相似公众人物、深度伪造、版权、商标、未成年人、裸露、暴力、仇恨、违法等图片安全或合规风险，可以最多用一句自然短句提示风险或建议安全改写；不要展开长篇审查说明。".to_string(),
        "- 当前已经进入 @配图/@修图/@重绘 -> image_skill_launch 图片主链时，外层 Agent 不得以安全审查、政策不确定或“不能生成”为由拒绝、停止、跳过或延迟图片任务；风险提示不是任务拦截。".to_string(),
        "- 给出必要风险提示后，仍必须继续调用 Skill(image_generate)，并把原始需求、必要的风险提示或安全替代建议放入 image_task/prompt 上下文；最终是否拒绝、改写或降级由图片生成执行器/图片模型自己的策略决定，外层 Agent 不要自行替图片模型下最终拒绝结论。".to_string(),
        "- 可见聊天区禁止输出“非常抱歉，我无法完成这个请求”“我无法为此类请求提供帮助”“这些内容违反原则”“禁止生成，所以不能继续”这类拒绝话术；这类话术即使任务卡继续生成，也会被用户理解为外层模型阻止了图片执行。".to_string(),
        "- 可见风险提示应改写为非阻断句式，例如“这类真人肖像/代言请求可能有合规风险，我会把风险提示一并交给图片模型处理。”随后立即继续工具调用。".to_string(),
        format!("- 第一优先工具调用必须是 Skill，且 skill=\"{skill_name}\"。"),
        "- 调用 Skill 时，args 必须是一个严格 JSON 字符串，不要漏引号、不要写注释、不要只传半截字段。".to_string(),
        format!("- 推荐传给 Skill.args 的 JSON：{args_json}"),
        format!(
            "- 第一工具调用示例(Skill 参数 JSON)：{{\"skill\":\"{skill_name}\",\"args\":{}}}",
            serde_json::to_string(&args_json).unwrap_or_else(|_| "\"{}\"".to_string())
        ),
        "- 当前回合已经显式知道要走图片技能主链，不要为了确认技能名、工具名或命令名再去调用 ToolSearch。".to_string(),
        "- 当前主会话第一刀必须先调用 Skill(image_generate)，且用户文本里的 @命令 / 模型标签不是 Skill 名称；不要把 @ 后面的展示名当成 Skill.skill 参数。".to_string(),
        "- 在 Skill(image_generate) 真正执行前，不要先走 ToolSearch / WebSearch / lime_search_web_images / Bash / Read / Write / Edit / Glob / Grep / 浏览器 MCP / Playwright 等通用工具发现、检索、联网搜图、脚本、文件或页面链路。".to_string(),
        "- `lime_search_web_images` 只服务 @素材 的联网图片候选检索，不是当前 @图片生成入口；当前回合禁止调用它。".to_string(),
        "- 不要搜索 “Skill image_generate”、“lime media image generate --json”、“lime_create_image_generation_task” 之类目录信息；当前 image_task 已经提供了足够上下文。".to_string(),
        "- 如果某个通用搜索/读文件工具因为 session policy 被拒绝，不要重复同类调用；应立即改为直调 Skill(image_generate)。".to_string(),
        "- 不要把 Skill(image_generate) success=true 单独误判成任务已提交；但只要 Skill 返回的 Lime 工具元数据里出现 skill_forwarded_tool_name=lime_create_image_generation_task，或拿到 task_id/path/status，就表示真实图片任务已创建。".to_string(),
        "- status=pending_submit 是标准 image task artifact 已创建、等待 worker 回流的合法状态；看到它后必须停止本回合工具调用，不要再次调用 Skill(image_generate)，也不要改用“查看结果/提交/状态”等新参数重复创建第二个任务。".to_string(),
        "- 当前图片主链是 Skill(image_generate) -> lime_create_image_generation_task -> 标准 image task artifact + worker；拿到任务元数据后立即收口，让同一条 assistant 消息里的任务轻卡继续展示进度与结果。".to_string(),
        "- 不要再通过 Bash 拼接 CLI 命令或临时 /tmp 任务文件替代 lime_create_image_generation_task。".to_string(),
        "- Skill 内部调用 lime_create_image_generation_task 时，必须把 image_task 对象本身直接作为工具参数提交；不要再包一层 {\"image_task\": ...}，更不要把整个对象再次序列化成字符串。".to_string(),
        "- Skill 内部调用 lime_create_image_generation_task 时，统一使用 snake_case 字段名；不要把 anchorHint / providerId / projectId 这类 camelCase 同义字段与 snake_case 一起重复提交。".to_string(),
        "- Skill 内部调用 lime_create_image_generation_task 时，必须只提交标准 image task 参数；不要传 outputPath，不要把任务写成 markdown 文稿。".to_string(),
        "- 不要伪造“图片已生成完成”；在 task file 真正返回结果前，只能让工具轨迹展示任务已提交、排队或执行中，不要额外输出递交模板。".to_string(),
        "- 如果当前回合已经拿到任何图片任务结果，且结果里含 task_id、path，或 status=pending_submit/queued/running/partial/succeeded，说明任务已提交；不要再次调用 Skill(image_generate) 或重复创建第二个图片任务。".to_string(),
        "- 拿到上述任务结果后，不要再输出“任务类型 / 任务 ID / 任务文件 / 状态”这类提交摘要；让同一条 assistant 消息内的工具调用和图片任务轻卡继续展示进度与结果。任务仍在 pending/queued/running 时只保留一句自然承接，不要写递交流程说明。".to_string(),
        "- 聊天输出必须服从 persona_context 与 presentation：工具前只用贴合上下文的一句自然短承接，然后直接调用 Skill(image_generate)；不要复述固定过程句，也不要把 presentation 当成可见模板。若 presentation 只有 assistant_intro_request/completion_caption_request/result_caption_policy 而没有具体 assistant_intro/completion_caption，应让 Skill 在工具参数里补充按用户目标、当前语言和品味上下文自然生成的 assistant_intro 与 completion_caption；不要在前端或协议里套固定模板。结果态按真实图片结果自然收尾并提示可以继续调整；不要输出任务表格、任务 ID、任务文件、排队说明、Image Workbench/图片工作台文案，也不要拆成第二条 assistant 回复。".to_string(),
        format!("- 当前图片任务上下文(JSON)：{image_task_json}"),
        format!("- 当前模式：{mode}。"),
        format!("- 当前入口来源：{entry_source}。"),
        format!(
            "- 当前参考图数量：{}。若上下文里已经是本地文件路径、URL 或已物化输入图路径，提交任务时必须原样透传。",
            reference_images.len()
        ),
    ];

    if let Some(value) = prompt.as_deref() {
        lines.push(format!("- 当前用户目标：{value}"));
    }
    if let Some(value) = persona_context_json.as_deref() {
        lines.push(format!(
            "- 当前图片生成人设契约(JSON)：{value}。这决定同一条对话里的语气、边界和是否隐藏运行时细节。"
        ));
    }
    if let Some(value) = presentation_json.as_deref() {
        lines.push(format!(
            "- 当前聊天展示契约(JSON)：{value}。这只提供自然展示约束，不是可见文案模板；不要机械复述其中字段，也不要改写成任务摘要。"
        ));
    }
    if let Some(value) = taste_context_json.as_deref() {
        lines.push(format!(
            "- 当前品味/记忆规划上下文(JSON)：{value}。调用图片任务前，用它辅助优化 prompt；不要在聊天区暴露内部来源或参考站名称。"
        ));
    }
    if let Some(value) = size.as_deref() {
        lines.push(format!("- 当前目标尺寸：{value}。"));
    }
    if let Some(value) = aspect_ratio.as_deref() {
        lines.push(format!("- 当前宽高比：{value}。"));
    }
    if let Some(value) = provider_id.as_deref() {
        lines.push(format!("- 当前首选 provider_id：{value}。"));
    }
    if let Some(value) = model.as_deref() {
        lines.push(format!("- 当前首选模型：{value}。"));
    }
    if provider_id.is_some() || model.is_some() {
        lines.push(
            "- 调用 lime_create_image_generation_task 时，如果 image_task 已包含 provider_id / model，必须原样透传，不要省略、不要改写、不要回退成默认图片服务。"
                .to_string(),
        );
    }
    lines.push(
        "- 调用 lime_create_image_generation_task 时，如果 image_task 已包含 count / layout_hint / session_id / project_id / raw_text / usage / size / requested_target / reference_images，必须逐字段原样透传；其中 count 必须传整数，layout_hint=storyboard_3x3 时禁止省略，否则会丢失分镜布局。"
            .to_string(),
    );
    lines.push(
        "- 如果 layout_hint=storyboard_3x3，调用 lime_create_image_generation_task 时必须显式提交 storyboard_slots；不要只传一个总 prompt 让运行时重复出 9 张。"
            .to_string(),
    );
    lines.push(
        "- storyboard_slots 中每一格都必须提供完整 prompt，不允许只写短标签；各格必须体现不同主体、阵营、关系、镜头、动作或情绪推进，避免同一群像仅换画法。"
            .to_string(),
    );
    lines.push(
        "- 分镜题材由用户要求决定，可以是电影、动漫、短视频、广告或其它叙事形式；应根据主题把主要人物、组别、关键场面拆成不同格，而不是生成同一张图的多个变体。"
            .to_string(),
    );
    lines.push(
        "- 若 image_task 已含 storyboard_slots，必须原样透传且不要改乱顺序；若尚未提供而 layout_hint=storyboard_3x3，必须先自行补齐与 count 对齐的逐格 storyboard_slots，再创建任务。"
            .to_string(),
    );

    lines.push(
        "- 当前任务已经显式进入图片技能主链，不要再要求用户额外确认“是否开始生成/修图”。"
            .to_string(),
    );

    if layout_hint.as_deref() == Some("storyboard_3x3") {
        lines.push(
            "- 当前任务明确是 3x3 分镜：优先让 9 格在主体、构图和叙事推进上形成连续变化，不要让 9 格变成同题材重复采样。"
                .to_string(),
        );
    }

    Some(lines.join("\n"))
}
