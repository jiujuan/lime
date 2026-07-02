use super::RuntimeEvent;
use serde_json::{json, Value};

pub(super) const WORKSPACE_PATCH_PATH: &str =
    ".lime/artifacts/content-factory/workspace-patch.json";

pub(super) struct WorkspacePatchStreamingSnapshot<'a> {
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

pub(super) fn initial_workspace_patch_snapshot(
    snapshot: WorkspacePatchStreamingSnapshot<'_>,
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
                "path": WORKSPACE_PATCH_PATH,
                "filePath": WORKSPACE_PATCH_PATH,
                "file_path": WORKSPACE_PATCH_PATH,
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
        .or_insert_with(|| json!(WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("filePath".to_string())
        .or_insert_with(|| json!(WORKSPACE_PATCH_PATH));
    artifact_object
        .entry("file_path".to_string())
        .or_insert_with(|| json!(WORKSPACE_PATCH_PATH));
}

#[derive(Debug, Clone, Copy)]
struct WorkspacePatchStreamingCopy {
    article_title: &'static str,
    generating_summary: &'static str,
    prompt_label: &'static str,
    workspace_title: &'static str,
}

fn streaming_copy(locale: Option<&str>) -> &'static WorkspacePatchStreamingCopy {
    match locale.unwrap_or("zh-CN") {
        value if value.eq_ignore_ascii_case("zh-TW") || value.eq_ignore_ascii_case("zh-HK") => {
            &WorkspacePatchStreamingCopy {
                article_title: "公眾號文章草稿",
                generating_summary: "正在檢索資料並生成文章草稿",
                prompt_label: "寫作需求",
                workspace_title: "內容工廠工作區",
            }
        }
        value if value.eq_ignore_ascii_case("en-US") || value.eq_ignore_ascii_case("en") => {
            &WorkspacePatchStreamingCopy {
                article_title: "Article Draft",
                generating_summary: "Researching source material and drafting the article",
                prompt_label: "Writing brief",
                workspace_title: "Content Factory Workspace",
            }
        }
        value if value.eq_ignore_ascii_case("ja-JP") || value.eq_ignore_ascii_case("ja") => {
            &WorkspacePatchStreamingCopy {
                article_title: "記事ドラフト",
                generating_summary: "資料を調査し、記事ドラフトを生成しています",
                prompt_label: "執筆依頼",
                workspace_title: "コンテンツファクトリー ワークスペース",
            }
        }
        value if value.eq_ignore_ascii_case("ko-KR") || value.eq_ignore_ascii_case("ko") => {
            &WorkspacePatchStreamingCopy {
                article_title: "글 초안",
                generating_summary: "자료를 조사하고 글 초안을 생성하는 중입니다",
                prompt_label: "작성 요청",
                workspace_title: "콘텐츠 팩토리 작업 공간",
            }
        }
        _ => &WorkspacePatchStreamingCopy {
            article_title: "公众号文章草稿",
            generating_summary: "正在检索资料并生成文章草稿",
            prompt_label: "写作需求",
            workspace_title: "内容工厂工作区",
        },
    }
}

fn initial_article_markdown(prompt: &str, copy: &WorkspacePatchStreamingCopy) -> String {
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

pub(super) fn is_incomplete_workspace_patch_snapshot(event: &RuntimeEvent) -> bool {
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
        let event = initial_workspace_patch_snapshot(WorkspacePatchStreamingSnapshot {
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
        let event = initial_workspace_patch_snapshot(WorkspacePatchStreamingSnapshot {
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
}
