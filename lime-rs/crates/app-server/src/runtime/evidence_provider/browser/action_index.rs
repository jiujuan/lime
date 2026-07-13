mod extraction;
mod presentation;

use super::super::canonical_tool::canonical_tool_or_side_channel;
use app_server_protocol::AgentEvent;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidencePackArtifact;
use extraction::{
    browser_action_status_from_candidates, browser_candidate_values,
    browser_confirmation_request_id, event_status_label, first_bool, first_string,
    first_string_list, first_u64, has_any_key, infer_action_from_tool_name,
    infer_browser_artifact_kind, infer_executor_from_tool_name, is_browser_artifact_kind,
    is_browser_record, is_empty_browser_start_event, tool_name_from_value,
};
use presentation::{
    browser_action_item_value, browser_artifact_title, count_entries, increment_count,
    item_dedupe_key,
};
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Default)]
struct BrowserActionItem {
    artifact_path: Option<String>,
    artifact_kind: String,
    tool_name: Option<String>,
    action: Option<String>,
    action_id: Option<String>,
    status: String,
    success: Option<bool>,
    session_id: Option<String>,
    target_id: Option<String>,
    tab_id: Option<String>,
    profile_key: Option<String>,
    backend: Option<String>,
    request_id: Option<String>,
    confirmation_request_id: Option<String>,
    control_mode: Option<String>,
    lifecycle_state: Option<String>,
    human_reason: Option<String>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    content_id: Option<String>,
    executor: Option<String>,
    evidence_refs: Vec<String>,
    last_url: Option<String>,
    title: Option<String>,
    attempt_count: Option<u64>,
    observation_available: bool,
    screenshot_available: bool,
}

pub(super) fn browser_action_index_summary(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Option<Value> {
    let items = collect_browser_action_items(events, artifacts);
    if items.is_empty() {
        return None;
    }

    let mut session_ids = BTreeSet::new();
    let mut target_ids = BTreeSet::new();
    let mut profile_keys = BTreeSet::new();
    let mut status_counts = BTreeMap::new();
    let mut artifact_kind_counts = BTreeMap::new();
    let mut action_counts = BTreeMap::new();
    let mut backend_counts = BTreeMap::new();
    let mut executor_counts = BTreeMap::new();
    let mut thread_ids = BTreeSet::new();
    let mut turn_ids = BTreeSet::new();
    let mut content_ids = BTreeSet::new();
    let mut last_url = None;

    for item in &items {
        if let Some(thread_id) = item.thread_id.as_deref() {
            thread_ids.insert(thread_id.to_string());
        }
        if let Some(turn_id) = item.turn_id.as_deref() {
            turn_ids.insert(turn_id.to_string());
        }
        if let Some(content_id) = item.content_id.as_deref() {
            content_ids.insert(content_id.to_string());
        }
        if let Some(session_id) = item.session_id.as_deref() {
            session_ids.insert(session_id.to_string());
        }
        if let Some(target_id) = item.target_id.as_deref() {
            target_ids.insert(target_id.to_string());
        }
        if let Some(profile_key) = item.profile_key.as_deref() {
            profile_keys.insert(profile_key.to_string());
        }
        if let Some(action) = item.action.as_deref() {
            increment_count(&mut action_counts, action);
        }
        if let Some(backend) = item.backend.as_deref() {
            increment_count(&mut backend_counts, backend);
        }
        if let Some(executor) = item.executor.as_deref() {
            increment_count(&mut executor_counts, executor);
        }
        increment_count(&mut status_counts, &item.status);
        increment_count(&mut artifact_kind_counts, &item.artifact_kind);
        if item.last_url.is_some() {
            last_url = item.last_url.clone();
        }
    }

    Some(json!({
        "action_count": items.len(),
        "session_count": session_ids.len(),
        "observation_count": items.iter().filter(|item| item.observation_available).count(),
        "screenshot_count": items.iter().filter(|item| item.screenshot_available).count(),
        "last_url": last_url,
        "thread_ids": thread_ids.into_iter().collect::<Vec<_>>(),
        "turn_ids": turn_ids.into_iter().collect::<Vec<_>>(),
        "content_ids": content_ids.into_iter().collect::<Vec<_>>(),
        "session_ids": session_ids.into_iter().collect::<Vec<_>>(),
        "target_ids": target_ids.into_iter().collect::<Vec<_>>(),
        "profile_keys": profile_keys.into_iter().collect::<Vec<_>>(),
        "status_counts": count_entries(status_counts, "status"),
        "artifact_kind_counts": count_entries(artifact_kind_counts, "artifact_kind"),
        "action_counts": count_entries(action_counts, "action"),
        "backend_counts": count_entries(backend_counts, "backend"),
        "executor_counts": count_entries(executor_counts, "executor"),
        "items": items.into_iter().map(browser_action_item_value).collect::<Vec<_>>(),
    }))
}

pub(super) fn browser_evidence_artifacts(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<EvidencePackArtifact> {
    collect_browser_action_items(events, artifacts)
        .into_iter()
        .filter_map(|item| {
            let relative_path = item.artifact_path.clone()?;
            Some(EvidencePackArtifact {
                kind: item.artifact_kind.clone(),
                title: browser_artifact_title(&item),
                relative_path,
                absolute_path: None,
                bytes: 0,
            })
        })
        .collect()
}

fn collect_browser_action_items(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<BrowserActionItem> {
    let mut items = Vec::new();
    let mut seen = BTreeSet::new();

    for event in events {
        if let Some(item) = browser_action_item_from_event(event) {
            let key = item_dedupe_key(&item, event.event_id.as_str());
            if seen.insert(key) {
                items.push(item);
            }
        }
    }

    for artifact in artifacts {
        if let Some(item) = browser_action_item_from_artifact(artifact) {
            let key = item_dedupe_key(&item, artifact.artifact_ref.as_str());
            if seen.insert(key) {
                items.push(item);
            }
        }
    }

    items
}

fn browser_action_item_from_event(event: &AgentEvent) -> Option<BrowserActionItem> {
    let tool = canonical_tool_or_side_channel(event)?;
    let canonical_value = tool.as_ref().map(|tool| tool.evidence_value());
    let payload = canonical_value.as_ref().unwrap_or(&event.payload);
    let candidates = browser_candidate_values(payload);
    let tool_name = tool_name_from_value(payload);
    let action = first_string(&candidates, &["action", "operation"])
        .or_else(|| infer_action_from_tool_name(tool_name.as_deref()));
    let artifact_kind = first_string(
        &candidates,
        &[
            "artifactKind",
            "artifact_kind",
            "kind",
            "evidenceKind",
            "evidence_kind",
        ],
    )
    .or_else(|| infer_browser_artifact_kind(action.as_deref(), &candidates, tool_name.as_deref()));
    let artifact_path = first_string(
        &candidates,
        &[
            "artifactPath",
            "artifact_path",
            "relativePath",
            "relative_path",
            "browserSessionArtifactPath",
            "browser_session_artifact_path",
            "browserSnapshotArtifactPath",
            "browser_snapshot_artifact_path",
            "snapshotPath",
            "snapshot_path",
            "screenshotPath",
            "screenshot_path",
        ],
    );

    if !is_browser_record(
        &candidates,
        tool_name.as_deref(),
        action.as_deref(),
        artifact_kind.as_deref(),
    ) || is_empty_browser_start_event(
        event.event_type.as_str(),
        &candidates,
        artifact_path.as_deref(),
    ) {
        return None;
    }

    let status = browser_action_status_from_candidates(&candidates).unwrap_or_else(|| {
        tool.as_ref()
            .map(|tool| tool.status_label())
            .unwrap_or_else(|| event_status_label(event.event_type.as_str()))
            .to_string()
    });
    let success = first_bool(&candidates, &["success", "ok"]);
    let observation_available = first_bool(
        &candidates,
        &["observationAvailable", "observation_available"],
    )
    .unwrap_or(false)
        || action.as_deref().is_some_and(|action| {
            matches!(action, "read_page" | "get_page_info" | "get_page_text")
        })
        || has_any_key(
            &candidates,
            &["page_info", "pageInfo", "markdown", "accessibility"],
        );
    let screenshot_available = first_bool(
        &candidates,
        &["screenshotAvailable", "screenshot_available"],
    )
    .unwrap_or(false)
        || has_any_key(
            &candidates,
            &[
                "screenshot",
                "screenshotPath",
                "screenshot_path",
                "screenshotUrl",
                "screenshot_url",
            ],
        );

    Some(BrowserActionItem {
        artifact_path,
        artifact_kind: artifact_kind.unwrap_or_else(|| "browser_session".to_string()),
        tool_name: tool_name.clone(),
        action,
        action_id: first_string(
            &candidates,
            &[
                "actionId",
                "action_id",
                "commandId",
                "command_id",
                "requestId",
                "request_id",
            ],
        ),
        status,
        success,
        session_id: first_string(
            &candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
            ],
        ),
        target_id: first_string(&candidates, &["targetId", "target_id", "tabId", "tab_id"]),
        tab_id: first_string(&candidates, &["tabId", "tab_id", "targetId", "target_id"]),
        profile_key: first_string(&candidates, &["profileKey", "profile_key"]),
        backend: first_string(
            &candidates,
            &[
                "backend",
                "transportKind",
                "transport_kind",
                "adapterKind",
                "adapter_kind",
            ],
        ),
        request_id: first_string(
            &candidates,
            &[
                "requestId",
                "request_id",
                "toolCallId",
                "tool_call_id",
                "actionId",
                "action_id",
                "commandId",
                "command_id",
            ],
        )
        .or_else(|| Some(event.event_id.clone())),
        confirmation_request_id: browser_confirmation_request_id(payload),
        control_mode: first_string(&candidates, &["controlMode", "control_mode"]),
        lifecycle_state: first_string(&candidates, &["lifecycleState", "lifecycle_state"]),
        human_reason: first_string(&candidates, &["humanReason", "human_reason"]),
        thread_id: event.thread_id.clone().or_else(|| {
            first_string(
                &candidates,
                &[
                    "threadId",
                    "thread_id",
                    "sessionThreadId",
                    "session_thread_id",
                ],
            )
        }),
        turn_id: event.turn_id.clone().or_else(|| {
            first_string(
                &candidates,
                &["turnId", "turn_id", "sessionTurnId", "session_turn_id"],
            )
        }),
        content_id: first_string(
            &candidates,
            &[
                "contentId",
                "content_id",
                "itemId",
                "item_id",
                "messageId",
                "message_id",
                "artifactId",
                "artifact_id",
            ],
        ),
        executor: first_string(
            &candidates,
            &[
                "executor",
                "executorKind",
                "executor_kind",
                "executorId",
                "executor_id",
                "toolExecutor",
                "tool_executor",
            ],
        )
        .or_else(|| infer_executor_from_tool_name(tool_name.as_deref())),
        evidence_refs: first_string_list(&candidates, &["evidenceRefs", "evidence_refs"]),
        last_url: first_string(
            &candidates,
            &[
                "lastUrl",
                "last_url",
                "url",
                "href",
                "targetUrl",
                "target_url",
            ],
        ),
        title: first_string(&candidates, &["title", "targetTitle", "target_title"]),
        attempt_count: first_u64(&candidates, &["attemptCount", "attempt_count"]),
        observation_available,
        screenshot_available,
    })
}

fn browser_action_item_from_artifact(artifact: &ArtifactSummary) -> Option<BrowserActionItem> {
    let metadata = artifact.metadata.as_ref()?;
    let candidates = browser_candidate_values(metadata);
    let artifact_kind = first_string(&candidates, &["artifactKind", "artifact_kind", "kind"])
        .or_else(|| artifact.kind.clone())
        .filter(|kind| is_browser_artifact_kind(kind));
    if artifact_kind.is_none()
        && !is_browser_record(&candidates, None, None, artifact.kind.as_deref())
    {
        return None;
    }

    let artifact_path = first_string(
        &candidates,
        &[
            "artifactPath",
            "artifact_path",
            "relativePath",
            "relative_path",
        ],
    )
    .or_else(|| artifact.path.clone())
    .or_else(|| Some(artifact.artifact_ref.clone()));
    let action = first_string(&candidates, &["action", "operation"]);
    let observation_available = first_bool(
        &candidates,
        &["observationAvailable", "observation_available"],
    )
    .unwrap_or(false)
        || has_any_key(&candidates, &["page_info", "pageInfo", "markdown"]);
    let screenshot_available = first_bool(
        &candidates,
        &["screenshotAvailable", "screenshot_available"],
    )
    .unwrap_or(false)
        || has_any_key(
            &candidates,
            &["screenshot", "screenshotPath", "screenshot_path"],
        );

    Some(BrowserActionItem {
        artifact_path,
        artifact_kind: artifact_kind.unwrap_or_else(|| "browser_snapshot".to_string()),
        tool_name: first_string(&candidates, &["toolName", "tool_name"]),
        action,
        action_id: first_string(
            &candidates,
            &[
                "actionId",
                "action_id",
                "commandId",
                "command_id",
                "requestId",
                "request_id",
            ],
        ),
        status: first_string(&candidates, &["status"])
            .or_else(|| artifact.status.clone())
            .unwrap_or_else(|| "completed".to_string()),
        success: first_bool(&candidates, &["success", "ok"]),
        session_id: first_string(
            &candidates,
            &[
                "browserSessionId",
                "browser_session_id",
                "sessionId",
                "session_id",
            ],
        ),
        target_id: first_string(&candidates, &["targetId", "target_id", "tabId", "tab_id"]),
        tab_id: first_string(&candidates, &["tabId", "tab_id", "targetId", "target_id"]),
        profile_key: first_string(&candidates, &["profileKey", "profile_key"]),
        backend: first_string(&candidates, &["backend", "transportKind", "transport_kind"]),
        request_id: first_string(
            &candidates,
            &[
                "requestId",
                "request_id",
                "actionId",
                "action_id",
                "commandId",
                "command_id",
            ],
        ),
        confirmation_request_id: browser_confirmation_request_id(metadata),
        control_mode: first_string(&candidates, &["controlMode", "control_mode"]),
        lifecycle_state: first_string(&candidates, &["lifecycleState", "lifecycle_state"]),
        human_reason: first_string(&candidates, &["humanReason", "human_reason"]),
        thread_id: first_string(&candidates, &["threadId", "thread_id"]),
        turn_id: artifact
            .turn_id
            .clone()
            .or_else(|| first_string(&candidates, &["turnId", "turn_id"])),
        content_id: artifact.artifact_id.clone().or_else(|| {
            first_string(
                &candidates,
                &[
                    "contentId",
                    "content_id",
                    "itemId",
                    "item_id",
                    "messageId",
                    "message_id",
                    "artifactId",
                    "artifact_id",
                ],
            )
        }),
        executor: first_string(
            &candidates,
            &[
                "executor",
                "executorKind",
                "executor_kind",
                "executorId",
                "executor_id",
                "toolExecutor",
                "tool_executor",
            ],
        )
        .or_else(|| {
            infer_executor_from_tool_name(
                first_string(&candidates, &["toolName", "tool_name"]).as_deref(),
            )
        }),
        evidence_refs: first_string_list(&candidates, &["evidenceRefs", "evidence_refs"]),
        last_url: first_string(
            &candidates,
            &[
                "lastUrl",
                "last_url",
                "url",
                "href",
                "targetUrl",
                "target_url",
            ],
        ),
        title: first_string(&candidates, &["title", "targetTitle", "target_title"])
            .or_else(|| artifact.title.clone()),
        attempt_count: first_u64(&candidates, &["attemptCount", "attempt_count"]),
        observation_available,
        screenshot_available,
    })
}
