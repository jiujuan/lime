use super::RuntimeEvent;
use serde_json::{json, Value};

pub(super) const CONTENT_FACTORY_WORKSPACE_PATCH_PATH: &str =
    ".lime/artifacts/content-factory/workspace-patch.json";

pub(super) struct ContentFactoryWorkspaceStreamingSnapshot<'a> {
    pub app_id: &'a str,
    pub locale: Option<&'a str>,
    pub prompt: &'a str,
    pub process_markdown: Option<&'a str>,
    pub session_id: &'a str,
    pub surface_kind: Option<&'a str>,
    pub task_id: &'a str,
    pub task_kind: &'a str,
    pub turn_id: &'a str,
    pub workspace_id: Option<&'a str>,
}

pub(super) fn initial_content_factory_workspace_snapshot(
    snapshot: ContentFactoryWorkspaceStreamingSnapshot<'_>,
) -> RuntimeEvent {
    let copy = streaming_copy(snapshot.locale);
    let article_id = format!("article-{}", slugify(snapshot.prompt));
    let article_artifact_id = format!("artifact-{article_id}");
    let process_markdown = snapshot
        .process_markdown
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| initial_article_markdown(snapshot.prompt, copy));
    let object_ref = json!({
        "appId": snapshot.app_id,
        "kind": "articleDraft",
        "id": article_id,
        "sessionId": snapshot.session_id,
        "artifactIds": [article_artifact_id],
        "sourceTurnId": snapshot.turn_id,
        "sourceTaskId": snapshot.task_id,
    });
    let patch = json!({
        "schemaVersion": "article-workspace.v1",
        "appId": snapshot.app_id,
        "sessionId": snapshot.session_id,
        "workspaceId": snapshot.workspace_id,
        "surfaceKind": snapshot.surface_kind,
        "selectedObjectRef": object_ref,
        "objects": [
            {
                "ref": object_ref,
                "title": copy.article_title,
                "status": "generating",
                "summary": copy.generating_summary,
                "source": {
                    "taskKind": snapshot.task_kind,
                    "taskId": snapshot.task_id,
                    "turnId": snapshot.turn_id,
                    "prompt": snapshot.prompt,
                    "processMarkdown": process_markdown,
                    "documentText": "",
                    "finalMarkdown": "",
                    "hostSearchStatus": "running"
                }
            }
        ]
    });
    RuntimeEvent::new(
        "artifact.snapshot",
        json!({
            "artifact": {
                "artifactId": format!("{}:workspace-patch:streaming", snapshot.task_id),
                "artifactRef": format!("{}:workspace-patch", snapshot.task_id),
                "path": CONTENT_FACTORY_WORKSPACE_PATCH_PATH,
                "filePath": CONTENT_FACTORY_WORKSPACE_PATCH_PATH,
                "file_path": CONTENT_FACTORY_WORKSPACE_PATCH_PATH,
                "kind": "content_factory.workspace_patch",
                "type": "document",
                "title": copy.workspace_title,
                "status": "streaming",
                "content": patch.to_string(),
                "metadata": {
                    "kind": "content_factory.workspace_patch",
                    "complete": false,
                    "writePhase": "streaming",
                    "contentStatus": "streaming",
                    "contentFactoryWorkspacePatch": patch
                }
            }
        }),
    )
}

pub(crate) fn ensure_workspace_patch_artifact_paths(events: &mut [RuntimeEvent]) {
    for event in events {
        if event.event_type != "artifact.snapshot" {
            continue;
        }
        let Some(artifact) = event.payload.get_mut("artifact") else {
            continue;
        };
        if !is_workspace_patch_artifact(artifact) {
            continue;
        }
        ensure_artifact_path_fields(artifact);
    }
}

pub(crate) fn streaming_workspace_patch_events(events: &[RuntimeEvent]) -> Vec<RuntimeEvent> {
    events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .flat_map(streaming_workspace_patch_events_from_event)
        .collect()
}

fn streaming_workspace_patch_events_from_event(event: &RuntimeEvent) -> Vec<RuntimeEvent> {
    let Some(artifact) = event.payload.get("artifact") else {
        return Vec::new();
    };
    let Some(patch) = artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .or_else(|| {
            artifact
                .get("metadata")
                .and_then(|metadata| metadata.get("workspace_patch"))
        })
    else {
        return Vec::new();
    };
    article_document_prefixes(article_document_text(patch).as_deref())
        .into_iter()
        .enumerate()
        .filter_map(|(index, document_text)| {
            streaming_workspace_patch_event(artifact, Some(document_text.as_str()), index + 1)
        })
        .collect()
}

fn streaming_workspace_patch_event(
    artifact: &Value,
    document_text: Option<&str>,
    sequence: usize,
) -> Option<RuntimeEvent> {
    let mut streaming_artifact = artifact.clone();
    let content = {
        let metadata = streaming_artifact
            .get_mut("metadata")
            .and_then(Value::as_object_mut)?;
        let patch = if let Some(patch) = metadata.get_mut("contentFactoryWorkspacePatch") {
            patch
        } else {
            metadata.get_mut("workspace_patch")?
        };
        mark_patch_streaming(patch, document_text);
        let content = serde_json::to_string(patch).ok();
        metadata.insert("complete".to_string(), json!(false));
        metadata.insert("writePhase".to_string(), json!("streaming"));
        metadata.insert("contentStatus".to_string(), json!("streaming"));
        metadata.insert("streamSequence".to_string(), json!(sequence));
        content
    };
    if let Some(content) = content {
        if let Some(artifact_object) = streaming_artifact.as_object_mut() {
            artifact_object.insert("content".to_string(), Value::String(content));
        }
    }
    if let Some(artifact_object) = streaming_artifact.as_object_mut() {
        artifact_object.insert("status".to_string(), json!("streaming"));
    }
    ensure_artifact_path_fields(&mut streaming_artifact);
    Some(RuntimeEvent::new(
        "artifact.snapshot",
        json!({ "artifact": streaming_artifact }),
    ))
}

fn is_workspace_patch_artifact(artifact: &Value) -> bool {
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .is_some()
        || artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("workspace_patch"))
            .is_some()
        || artifact.get("contentFactoryWorkspacePatch").is_some()
}

fn ensure_artifact_path_fields(artifact: &mut Value) {
    let Some(artifact_object) = artifact.as_object_mut() else {
        return;
    };
    artifact_object
        .entry("path".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("filePath".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("file_path".to_string())
        .or_insert_with(|| json!(CONTENT_FACTORY_WORKSPACE_PATCH_PATH));
}

fn mark_patch_streaming(patch: &mut Value, document_text: Option<&str>) {
    let Some(objects) = patch.get_mut("objects").and_then(Value::as_array_mut) else {
        return;
    };
    for object in objects {
        if object_ref_kind(object).as_deref() != Some("articleDraft") {
            continue;
        }
        if let Some(object_map) = object.as_object_mut() {
            object_map.insert("status".to_string(), json!("generating"));
            object_map
                .entry("summary".to_string())
                .or_insert_with(|| json!("正在检索资料并生成文章草稿"));
        }
        if let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) {
            source
                .entry("hostSearchStatus".to_string())
                .or_insert_with(|| json!("completed"));
            source.insert("articleGenerationStatus".to_string(), json!("streaming"));
            if let Some(document_text) = document_text {
                source.insert("documentText".to_string(), json!(document_text));
                source.insert("finalMarkdown".to_string(), json!(document_text));
            }
        }
    }
}

fn article_document_text(patch: &Value) -> Option<String> {
    patch
        .get("objects")
        .and_then(Value::as_array)?
        .iter()
        .find(|object| object_ref_kind(object).as_deref() == Some("articleDraft"))
        .and_then(|object| object.get("source"))
        .and_then(|source| {
            string_field(source, &["documentText", "document_text"])
                .or_else(|| string_field(source, &["finalMarkdown", "final_markdown"]))
        })
}

fn article_document_prefixes(document_text: Option<&str>) -> Vec<String> {
    let Some(document_text) = document_text
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Vec::new();
    };
    let char_count = document_text.chars().count();
    if char_count <= 160 {
        return vec![document_text.to_string()];
    }

    [0.28_f32, 0.52, 0.76, 1.0]
        .into_iter()
        .map(|ratio| {
            if ratio >= 1.0 {
                return document_text.to_string();
            }
            let target = ((char_count as f32) * ratio).ceil() as usize;
            prefix_at_markdown_boundary(document_text, target.min(char_count))
        })
        .fold(Vec::new(), |mut prefixes, prefix| {
            if prefixes.last() != Some(&prefix) {
                prefixes.push(prefix);
            }
            prefixes
        })
}

fn prefix_at_markdown_boundary(document_text: &str, target_chars: usize) -> String {
    let mut byte_index = document_text.len();
    for (index, (byte_offset, _)) in document_text.char_indices().enumerate() {
        if index >= target_chars {
            byte_index = byte_offset;
            break;
        }
    }
    let prefix = &document_text[..byte_index];
    let boundary = prefix
        .rfind("\n\n")
        .filter(|index| *index >= prefix.len().saturating_mul(2) / 3)
        .filter(|index| prefix.len().saturating_sub(*index) <= 240)
        .map(|index| index + 2)
        .unwrap_or(byte_index);
    document_text[..boundary].trim_end().to_string()
}

#[derive(Debug, Clone, Copy)]
struct ContentFactoryStreamingCopy {
    article_title: &'static str,
    generating_summary: &'static str,
    prompt_label: &'static str,
    workspace_title: &'static str,
}

fn streaming_copy(locale: Option<&str>) -> &'static ContentFactoryStreamingCopy {
    match locale.unwrap_or("zh-CN") {
        value if value.eq_ignore_ascii_case("zh-TW") || value.eq_ignore_ascii_case("zh-HK") => {
            &ContentFactoryStreamingCopy {
                article_title: "公眾號文章草稿",
                generating_summary: "正在檢索資料並生成文章草稿",
                prompt_label: "寫作需求",
                workspace_title: "內容工廠工作區",
            }
        }
        value if value.eq_ignore_ascii_case("en-US") || value.eq_ignore_ascii_case("en") => {
            &ContentFactoryStreamingCopy {
                article_title: "Article Draft",
                generating_summary: "Researching source material and drafting the article",
                prompt_label: "Writing brief",
                workspace_title: "Content Factory Workspace",
            }
        }
        value if value.eq_ignore_ascii_case("ja-JP") || value.eq_ignore_ascii_case("ja") => {
            &ContentFactoryStreamingCopy {
                article_title: "記事ドラフト",
                generating_summary: "資料を調査し、記事ドラフトを生成しています",
                prompt_label: "執筆依頼",
                workspace_title: "コンテンツファクトリー ワークスペース",
            }
        }
        value if value.eq_ignore_ascii_case("ko-KR") || value.eq_ignore_ascii_case("ko") => {
            &ContentFactoryStreamingCopy {
                article_title: "글 초안",
                generating_summary: "자료를 조사하고 글 초안을 생성하는 중입니다",
                prompt_label: "작성 요청",
                workspace_title: "콘텐츠 팩토리 작업 공간",
            }
        }
        _ => &ContentFactoryStreamingCopy {
            article_title: "公众号文章草稿",
            generating_summary: "正在检索资料并生成文章草稿",
            prompt_label: "写作需求",
            workspace_title: "内容工厂工作区",
        },
    }
}

fn initial_article_markdown(prompt: &str, copy: &ContentFactoryStreamingCopy) -> String {
    let trimmed_prompt = prompt.trim();
    if trimmed_prompt.is_empty() {
        format!("# {}\n\n{}。", copy.article_title, copy.generating_summary)
    } else {
        format!(
            "# {}\n\n> {}: {trimmed_prompt}\n\n{}。",
            copy.article_title, copy.prompt_label, copy.generating_summary
        )
    }
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_separator = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_ascii_alphanumeric() || is_cjk_unified_ideograph(character) {
            slug.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            slug.push('-');
            previous_was_separator = true;
        }
        if slug.chars().count() >= 48 {
            break;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "content".to_string()
    } else {
        slug
    }
}

fn is_cjk_unified_ideograph(character: char) -> bool {
    ('\u{4e00}'..='\u{9fa5}').contains(&character)
}

pub(super) fn is_incomplete_content_factory_workspace_snapshot(event: &RuntimeEvent) -> bool {
    if event.event_type != "artifact.snapshot" {
        return false;
    }
    let Some(artifact) = event.payload.get("artifact") else {
        return false;
    };
    if !(artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
        .is_some()
        && artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("complete"))
            .and_then(Value::as_bool)
            == Some(false))
    {
        return false;
    }
    let Some(patch) = artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
    else {
        return false;
    };
    !patch_contains_final_article_document(patch)
}

fn patch_contains_final_article_document(patch: &Value) -> bool {
    patch
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|object| object_ref_kind(object).as_deref() == Some("articleDraft"))
        .filter_map(|object| object.get("source"))
        .any(|source| {
            string_field(source, &["documentText", "document_text"])
                .or_else(|| string_field(source, &["finalMarkdown", "final_markdown"]))
                .is_some()
        })
}

fn object_ref_kind(object: &Value) -> Option<String> {
    string_field(object, &["kind"]).or_else(|| {
        object
            .get("ref")
            .or_else(|| object.get("objectRef"))
            .and_then(|reference| string_field(reference, &["kind"]))
    })
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .filter_map(Value::as_str)
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_snapshot_uses_worker_article_object_ref() {
        let event =
            initial_content_factory_workspace_snapshot(ContentFactoryWorkspaceStreamingSnapshot {
                app_id: "content-factory-app",
                locale: Some("zh-CN"),
                prompt: "Regenerate the image set with two candidate images.",
                process_markdown: None,
                session_id: "session-1",
                surface_kind: Some("articleWorkspace"),
                task_id: "task-1",
                task_kind: "content.image.generate",
                turn_id: "turn-1",
                workspace_id: Some("workspace-main"),
            });

        let object_ref = &event.payload["artifact"]["metadata"]["contentFactoryWorkspacePatch"]
            ["objects"][0]["ref"];
        assert_eq!(
            object_ref["id"],
            "article-regenerate-the-image-set-with-two-candidate-imag"
        );
        assert_eq!(
            object_ref["artifactIds"][0],
            "artifact-article-regenerate-the-image-set-with-two-candidate-imag"
        );
        assert_eq!(event.payload["artifact"]["status"], "streaming");
    }

    #[test]
    fn initial_snapshot_copy_respects_locale_metadata() {
        let event =
            initial_content_factory_workspace_snapshot(ContentFactoryWorkspaceStreamingSnapshot {
                app_id: "content-factory-app",
                locale: Some("en-US"),
                prompt: "Write a practical article.",
                process_markdown: None,
                session_id: "session-1",
                surface_kind: Some("articleWorkspace"),
                task_id: "task-1",
                task_kind: "content.article.generate",
                turn_id: "turn-1",
                workspace_id: Some("workspace-main"),
            });

        let artifact = &event.payload["artifact"];
        assert_eq!(artifact["title"], "Content Factory Workspace");
        let object = &artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0];
        assert_eq!(object["title"], "Article Draft");
        assert_eq!(
            object["summary"],
            "Researching source material and drafting the article"
        );
        assert!(object["source"]["processMarkdown"]
            .as_str()
            .expect("processMarkdown")
            .contains("Writing brief"));
        assert_eq!(object["source"]["documentText"], "");
        assert_eq!(object["source"]["finalMarkdown"], "");
    }

    #[test]
    fn builds_streaming_content_factory_workspace_snapshot() {
        let document_text = "# 草稿\n\n这是第一段，文章开始进入正式正文，不再把过程稿放进编辑器。这里继续补充更多上下文，确保第一段已经足够长，可以验证正式文章产物是按内容逐步增长，而不是一次性写入完整正文。\n\n这是第二段，继续补充完整观点和依据，模拟流式输出时逐步增长的文章内容。它会说明检索完成后，证据、标题、大纲和正文如何依次进入产物框，而不是混在对话过程里。\n\n这是第三段，用来确认最后一个 streaming snapshot 能够包含完整正文。这里再加入发布检查、引用核对、配图规划和后续编辑动作，保证测试文本明显超过单段输出阈值。";
        let events = vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "artifact-article-workspace",
                    "kind": "content_factory.workspace_patch",
                    "status": "ready",
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "appId": "content-factory-app",
                            "objects": [
                                {
                                    "ref": {
                                        "appId": "content-factory-app",
                                        "kind": "articleDraft",
                                        "id": "article-draft-1",
                                        "sessionId": "session-1"
                                    },
                                    "title": "公众号文章草稿",
                                    "status": "ready",
                                    "source": {
                                        "documentText": document_text,
                                        "finalMarkdown": document_text
                                    }
                                }
                            ]
                        }
                    }
                }
            }),
        )];

        let streaming = streaming_workspace_patch_events(&events);

        assert!(streaming.len() > 1);
        let artifact = &streaming[0].payload["artifact"];
        assert_eq!(artifact["status"], "streaming");
        assert_eq!(artifact["filePath"], CONTENT_FACTORY_WORKSPACE_PATCH_PATH);
        assert_eq!(artifact["metadata"]["complete"], false);
        assert_eq!(artifact["metadata"]["writePhase"], "streaming");
        assert_eq!(artifact["metadata"]["streamSequence"], 1);
        let patch = &artifact["metadata"]["contentFactoryWorkspacePatch"];
        assert_eq!(patch["objects"][0]["status"], "generating");
        assert_eq!(
            patch["objects"][0]["source"]["hostSearchStatus"],
            "completed"
        );
        assert!(
            patch["objects"][0]["source"]["documentText"]
                .as_str()
                .expect("documentText")
                .len()
                < document_text.len()
        );
        let final_patch = &streaming.last().expect("last streaming event").payload["artifact"]
            ["metadata"]["contentFactoryWorkspacePatch"];
        assert_eq!(
            final_patch["objects"][0]["source"]["documentText"],
            document_text
        );
        assert!(artifact["content"]
            .as_str()
            .expect("content")
            .contains("hostSearchStatus"));
    }
}
