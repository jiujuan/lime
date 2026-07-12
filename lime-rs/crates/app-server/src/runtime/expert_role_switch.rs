use super::json_string;
use super::RuntimeEvent;
use serde_json::{json, Map, Value};

pub(in crate::runtime) fn runtime_event_from_request_metadata(
    metadata: Option<&Value>,
) -> Option<RuntimeEvent> {
    let metadata = metadata?;
    let role_switch = metadata.pointer("/harness/expert_role_switch")?;
    if json_string(role_switch, &["kind"]).as_deref() != Some("expert_profile_switch") {
        return None;
    }
    if json_string(role_switch, &["scope"]).as_deref() != Some("thread") {
        return None;
    }

    let next_expert_id = json_string(role_switch, &["next_expert_id"])
        .or_else(|| json_string(metadata, &["expert", "expertId"]))
        .or_else(|| json_string(metadata, &["harness", "expert", "expert_id"]));
    let next_release_id = json_string(role_switch, &["next_release_id"])
        .or_else(|| json_string(metadata, &["expert", "releaseId"]))
        .or_else(|| json_string(metadata, &["harness", "expert", "release_id"]));
    let previous_expert_id = json_string(role_switch, &["previous_expert_id"]);
    let previous_release_id = json_string(role_switch, &["previous_release_id"]);
    let switched_at = json_string(role_switch, &["switched_at"]);
    let source = json_string(role_switch, &["source"])
        .unwrap_or_else(|| "runtime_request.metadata.harness.expert_role_switch".to_string());

    let mut harness = Map::new();
    if let Some(expert) = metadata.pointer("/harness/expert").cloned() {
        harness.insert("expert".to_string(), expert);
    }
    harness.insert("expert_role_switch".to_string(), role_switch.clone());

    let mut payload = Map::new();
    payload.insert(
        "schemaVersion".to_string(),
        json!("thread-expert-profile-switch.v1"),
    );
    payload.insert("kind".to_string(), json!("expert_profile_switch"));
    payload.insert("scope".to_string(), json!("thread"));
    payload.insert("source".to_string(), json!(source));
    payload.insert("status".to_string(), json!("completed"));
    payload.insert("title".to_string(), json!("Expert profile switched"));
    payload.insert("expert_role_switch".to_string(), role_switch.clone());
    payload.insert("expertRoleSwitch".to_string(), role_switch.clone());
    payload.insert("harness".to_string(), Value::Object(harness.clone()));
    payload.insert(
        "metadata".to_string(),
        json!({
            "source": "runtime_request.metadata",
            "harness": Value::Object(harness),
        }),
    );
    insert_optional_string(
        &mut payload,
        "previous_expert_id",
        previous_expert_id.clone(),
    );
    insert_optional_string(&mut payload, "previousExpertId", previous_expert_id);
    insert_optional_string(
        &mut payload,
        "previous_release_id",
        previous_release_id.clone(),
    );
    insert_optional_string(&mut payload, "previousReleaseId", previous_release_id);
    insert_optional_string(&mut payload, "next_expert_id", next_expert_id.clone());
    insert_optional_string(&mut payload, "nextExpertId", next_expert_id);
    insert_optional_string(&mut payload, "next_release_id", next_release_id.clone());
    insert_optional_string(&mut payload, "nextReleaseId", next_release_id);
    insert_optional_string(&mut payload, "switched_at", switched_at.clone());
    insert_optional_string(&mut payload, "switchedAt", switched_at);
    if let Some(expert) = metadata.get("expert").cloned() {
        payload.insert("expert".to_string(), expert);
    }

    Some(RuntimeEvent::new(
        "expert.profile_switch.completed",
        Value::Object(payload),
    ))
}

fn insert_optional_string(payload: &mut Map<String, Value>, key: &str, value: Option<String>) {
    let Some(value) = value else {
        return;
    };
    payload.insert(key.to_string(), Value::String(value));
}
