use serde_json::{json, Value};

pub(super) const CONTENT_FACTORY_APP_ID: &str = "content-factory-app";
pub(super) const WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
pub(super) const LEGACY_CREATOR_WORKSPACE_PATCH_KIND: &str = "creator.workspace_patch";

const ARTICLE_WORKSPACE_SCHEMA: &str = "article-workspace.v1";

pub(super) fn plugin_output_artifact_kind(
    app_id: &str,
    output_artifact_kind: Option<String>,
) -> Option<Option<String>> {
    match output_artifact_kind {
        Some(value) if !value.trim().is_empty() => {
            let normalized = value.trim();
            if app_id == CONTENT_FACTORY_APP_ID && normalized == LEGACY_CREATOR_WORKSPACE_PATCH_KIND
            {
                return Some(Some(WORKSPACE_PATCH_KIND.to_string()));
            }
            Some(Some(normalized.to_string()))
        }
        _ => None,
    }
}

pub(super) fn expected_output_contract(output_artifact_kind: &str) -> Value {
    if output_artifact_kind != WORKSPACE_PATCH_KIND {
        return json!({
            "artifactKind": output_artifact_kind,
        });
    }
    json!({
        "artifactKind": output_artifact_kind,
        "articleWorkspaceSchema": ARTICLE_WORKSPACE_SCHEMA,
        "objectKinds": [
            "contentBrief",
            "articleDraft",
            "imageGenerationSet",
            "videoScript",
            "videoStoryboard",
            "deliveryChecklist"
        ],
        "requiredObjectKinds": [
            "articleDraft",
            "imageGenerationSet",
            "videoStoryboard",
            "deliveryChecklist"
        ]
    })
}
