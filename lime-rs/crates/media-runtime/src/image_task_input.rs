use serde_json::{Map, Value};

use super::image_postprocess::{
    apply_image_postprocess_prompt_hint, read_layered_design_chroma_key_postprocess_plan,
    PreparedImageTaskPostprocessPlan,
};
use super::image_references::{read_image_reference_images, PreparedImageReference};
use super::image_request::{normalize_image_generation_executor_mode, ImageGenerationRequestInput};
use super::task_artifact::read_payload_string;
use super::{model_route, MediaTaskOutput};

const STORYBOARD_3X3_LAYOUT_HINT: &str = "storyboard_3x3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PreparedImageTaskSlot {
    pub(crate) slot_index: u32,
    pub(crate) slot_id: String,
    pub(crate) label: Option<String>,
    pub(crate) prompt: String,
    pub(crate) shot_type: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct PreparedImageTaskInput {
    pub(crate) prompt: String,
    pub(crate) model: String,
    pub(crate) size: Option<String>,
    pub(crate) count: u32,
    pub(crate) style: Option<String>,
    pub(crate) provider_id: Option<String>,
    pub(crate) executor_mode: String,
    pub(crate) outer_model: Option<String>,
    pub(crate) layout_hint: Option<String>,
    pub(crate) reference_images: Vec<PreparedImageReference>,
    pub(crate) postprocess_plan: Option<PreparedImageTaskPostprocessPlan>,
    pub(crate) request_slots: Vec<PreparedImageTaskSlot>,
}

fn read_payload_positive_u32(payload: &Value, keys: &[&str]) -> Option<u32> {
    keys.iter().find_map(|key| {
        let value = payload.get(*key)?;
        if let Some(number) = value.as_u64() {
            return u32::try_from(number).ok().filter(|item| *item > 0);
        }
        value
            .as_str()
            .and_then(|item| item.trim().parse::<u32>().ok().filter(|parsed| *parsed > 0))
    })
}

fn read_positive_u32_from_value(value: &Value) -> Option<u32> {
    if let Some(number) = value.as_u64() {
        return u32::try_from(number).ok().filter(|item| *item > 0);
    }

    value
        .as_str()
        .and_then(|item| item.trim().parse::<u32>().ok().filter(|parsed| *parsed > 0))
}

fn read_storyboard_slot_text(record: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        record
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn build_default_image_task_slot_id(layout_hint: Option<&str>, slot_index: u32) -> String {
    if layout_hint == Some(STORYBOARD_3X3_LAYOUT_HINT) {
        return format!("storyboard-slot-{slot_index}");
    }

    format!("image-slot-{slot_index}")
}

fn storyboard_fallback_beat(slot_index: u32) -> (&'static str, &'static str, &'static str) {
    match slot_index {
        1 => (
            "建立镜头",
            "establishing",
            "第1格使用建立镜头，先交代整体场景、时代氛围、空间关系和主要主体的分布",
        ),
        2 => (
            "主体亮相",
            "hero_intro",
            "第2格聚焦一个核心主体或主角，给出具有辨识度的亮相画面",
        ),
        3 => (
            "另一核心主体",
            "secondary_intro",
            "第3格切到另一位核心主体、阵营或关键对象，形成明显区分",
        ),
        4 => (
            "关系镜头",
            "relationship",
            "第4格展示多位主体之间的关系、对峙、协作或队形变化",
        ),
        5 => (
            "行动推进",
            "action",
            "第5格进入明确动作或事件推进，不要重复前面的静态构图",
        ),
        6 => (
            "情绪特写",
            "close_up",
            "第6格给出情绪、反应或心理张力的近景或特写",
        ),
        7 => (
            "环境细节",
            "detail",
            "第7格切到关键环境、道具、符号或世界细节，补足叙事信息",
        ),
        8 => (
            "高潮转折",
            "climax",
            "第8格表现冲突升级、关键转折或最强张力时刻",
        ),
        9 => (
            "收束定格",
            "finale",
            "第9格作为收束画面，形成完整结尾或海报式定格",
        ),
        _ => (
            "补充镜头",
            "supplementary",
            "这一格补充新的主体、动作、关系或环境信息，继续推进叙事，不要重复已有镜头",
        ),
    }
}

fn build_storyboard_fallback_slots(prompt: &str, count: u32) -> Vec<PreparedImageTaskSlot> {
    (1..=count)
        .map(|slot_index| {
            let (label, shot_type, directive) = storyboard_fallback_beat(slot_index);
            PreparedImageTaskSlot {
                slot_index,
                slot_id: build_default_image_task_slot_id(
                    Some(STORYBOARD_3X3_LAYOUT_HINT),
                    slot_index,
                ),
                label: Some(label.to_string()),
                prompt: format!(
                    "{prompt}。{directive}。保持与其他格明显区分，避免重复同一群像、同一构图或只换画风。"
                ),
                shot_type: Some(shot_type.to_string()),
            }
        })
        .collect()
}

fn build_repeated_image_task_slots(
    prompt: &str,
    count: u32,
    layout_hint: Option<&str>,
) -> Vec<PreparedImageTaskSlot> {
    (1..=count)
        .map(|slot_index| PreparedImageTaskSlot {
            slot_index,
            slot_id: build_default_image_task_slot_id(layout_hint, slot_index),
            label: None,
            prompt: prompt.to_string(),
            shot_type: None,
        })
        .collect()
}

fn read_storyboard_slots(payload: &Value, layout_hint: Option<&str>) -> Vec<PreparedImageTaskSlot> {
    payload
        .get("storyboard_slots")
        .or_else(|| payload.get("storyboardSlots"))
        .and_then(Value::as_array)
        .map(|items| {
            let mut slots = items
                .iter()
                .enumerate()
                .filter_map(|(index, item)| {
                    let record = item.as_object()?;
                    let slot_index = record
                        .get("slot_index")
                        .or_else(|| record.get("slotIndex"))
                        .and_then(read_positive_u32_from_value)
                        .unwrap_or(index as u32 + 1);
                    let prompt = read_storyboard_slot_text(
                        record,
                        &["prompt", "slot_prompt", "slotPrompt"],
                    )?;

                    Some(PreparedImageTaskSlot {
                        slot_index,
                        slot_id: read_storyboard_slot_text(record, &["slot_id", "slotId"])
                            .unwrap_or_else(|| {
                                build_default_image_task_slot_id(layout_hint, slot_index)
                            }),
                        label: read_storyboard_slot_text(
                            record,
                            &["label", "slot_label", "slotLabel"],
                        ),
                        prompt,
                        shot_type: read_storyboard_slot_text(record, &["shot_type", "shotType"]),
                    })
                })
                .collect::<Vec<_>>();
            slots.sort_by_key(|slot| slot.slot_index);
            slots.dedup_by_key(|slot| slot.slot_index);
            slots
        })
        .unwrap_or_default()
}

fn build_request_slots(
    prompt: &str,
    count: u32,
    layout_hint: Option<&str>,
    explicit_slots: Vec<PreparedImageTaskSlot>,
) -> Vec<PreparedImageTaskSlot> {
    let mut slots = explicit_slots;
    if slots.is_empty() {
        return if layout_hint == Some(STORYBOARD_3X3_LAYOUT_HINT) {
            build_storyboard_fallback_slots(prompt, count)
        } else {
            build_repeated_image_task_slots(prompt, count, layout_hint)
        };
    }

    let supplemental = if layout_hint == Some(STORYBOARD_3X3_LAYOUT_HINT) {
        build_storyboard_fallback_slots(prompt, count)
    } else {
        build_repeated_image_task_slots(prompt, count, layout_hint)
    };
    for slot in supplemental {
        if slots
            .iter()
            .any(|existing| existing.slot_index == slot.slot_index)
        {
            continue;
        }
        slots.push(slot);
        if slots.len() >= count as usize {
            break;
        }
    }

    slots.sort_by_key(|slot| slot.slot_index);
    slots.truncate(count as usize);
    slots
}

pub(crate) fn prepare_image_task_input(
    task: &MediaTaskOutput,
) -> Result<PreparedImageTaskInput, String> {
    let payload = &task.record.payload;
    let resolved_route = model_route::resolved_model_route_from_payload(payload);
    let prompt = read_payload_string(payload, &["prompt"])
        .ok_or_else(|| "图片任务缺少 prompt，无法继续执行".to_string())?;
    let layout_hint = read_payload_string(payload, &["layout_hint", "layoutHint"]);
    let explicit_slots = read_storyboard_slots(payload, layout_hint.as_deref());
    let requested_count =
        read_payload_positive_u32(payload, &["count", "image_count"]).unwrap_or(1);
    let max_slot_index = explicit_slots
        .iter()
        .map(|slot| slot.slot_index)
        .max()
        .unwrap_or(0);
    let count = requested_count
        .max(explicit_slots.len() as u32)
        .max(max_slot_index)
        .max(1);
    let postprocess_plan = read_layered_design_chroma_key_postprocess_plan(payload);
    let reference_images = read_image_reference_images(payload)?;
    let request_slots: Vec<PreparedImageTaskSlot> =
        build_request_slots(&prompt, count, layout_hint.as_deref(), explicit_slots)
            .into_iter()
            .map(|mut slot| {
                slot.prompt =
                    apply_image_postprocess_prompt_hint(&slot.prompt, postprocess_plan.as_ref());
                slot
            })
            .collect();

    Ok(PreparedImageTaskInput {
        prompt,
        model: resolved_route
            .as_ref()
            .and_then(|route| route.model_id.clone())
            .or_else(|| read_payload_string(payload, &["model"]))
            .unwrap_or_default(),
        size: read_payload_string(payload, &["size"]),
        count: request_slots.len() as u32,
        style: read_payload_string(payload, &["style"]),
        provider_id: resolved_route
            .as_ref()
            .and_then(|route| route.provider_id.clone())
            .or_else(|| read_payload_string(payload, &["provider_id", "providerId"])),
        executor_mode: normalize_image_generation_executor_mode(
            resolved_route
                .as_ref()
                .and_then(|route| {
                    model_route::image_executor_mode_from_route_protocol(route.protocol.as_deref())
                        .map(ToString::to_string)
                })
                .or_else(|| read_payload_string(payload, &["executor_mode", "executorMode"])),
        ),
        outer_model: read_payload_string(payload, &["outer_model", "outerModel"]),
        layout_hint,
        reference_images,
        postprocess_plan,
        request_slots,
    })
}

pub(crate) fn image_generation_request_input(
    prepared_input: &PreparedImageTaskInput,
) -> ImageGenerationRequestInput {
    ImageGenerationRequestInput {
        model: prepared_input.model.clone(),
        size: prepared_input.size.clone(),
        style: prepared_input.style.clone(),
        provider_id: prepared_input.provider_id.clone(),
        executor_mode: prepared_input.executor_mode.clone(),
        outer_model: prepared_input.outer_model.clone(),
        reference_image_urls: prepared_input
            .reference_images
            .iter()
            .map(|reference| reference.image_url.clone())
            .collect(),
    }
}
