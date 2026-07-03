use serde_json::Value;

const INLINE_IMAGE_TASK_SLOT_MARKER: &str = "lime:image-task-slot:";
const INLINE_IMAGE_TASK_PLACEHOLDER: &str = "pending-image-task://";

pub(super) fn metadata_edited_draft<'a>(
    metadata: &'a serde_json::Map<String, Value>,
) -> Option<&'a Value> {
    metadata
        .get("articleWorkspaceEditedDraft")
        .or_else(|| metadata.get("article_workspace_edited_draft"))
        .filter(|value| value.is_object())
}

pub(super) fn should_reject_edited_draft_update(existing: Option<&Value>, next: &Value) -> bool {
    let Some(existing) = existing else {
        return false;
    };
    let Some(existing_key) = object_key(existing) else {
        return false;
    };
    let Some(next_key) = object_key(next) else {
        return false;
    };
    if existing_key != next_key {
        return false;
    }
    let Some(existing_markdown) = markdown(existing) else {
        return false;
    };
    let Some(next_markdown) = markdown(next) else {
        return false;
    };
    contains_inline_image_task_marker(existing_markdown)
        && !contains_inline_image_task_marker(next_markdown)
}

fn contains_inline_image_task_marker(markdown: &str) -> bool {
    markdown.contains(INLINE_IMAGE_TASK_SLOT_MARKER)
        || markdown.contains(INLINE_IMAGE_TASK_PLACEHOLDER)
}

fn markdown(value: &Value) -> Option<&str> {
    value
        .get("markdown")
        .or_else(|| value.get("documentText"))
        .or_else(|| value.get("document_text"))
        .or_else(|| value.get("finalMarkdown"))
        .or_else(|| value.get("final_markdown"))
        .and_then(Value::as_str)
}

fn object_key(value: &Value) -> Option<String> {
    value
        .get("objectKey")
        .or_else(|| value.get("object_key"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            value
                .get("objectRef")
                .or_else(|| value.get("object_ref"))
                .and_then(object_ref_key)
        })
}

fn object_ref_key(ref_value: &Value) -> Option<String> {
    let app_id = string_field(ref_value, &["appId", "app_id"])?;
    let session_id = string_field(ref_value, &["sessionId", "session_id"])?;
    let kind = string_field(ref_value, &["kind"])?;
    let id = string_field(ref_value, &["id"])?;
    Some(format!("{app_id}:{session_id}:{kind}:{id}"))
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        let Some(text) = value.get(*key).and_then(Value::as_str) else {
            continue;
        };
        let normalized = text.trim();
        if !normalized.is_empty() {
            return Some(normalized.to_string());
        }
    }
    None
}
