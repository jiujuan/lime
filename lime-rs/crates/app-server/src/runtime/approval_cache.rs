use super::{string_field, AgentEvent, StoredSession, TurnStartRequest};
use app_server_protocol::{AgentSessionActionScope, AgentSessionApprovalDecision, RuntimeOptions};
use hex::encode as hex_encode;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use url::Url;

const ACTION_KIND_PERMISSION_PREFLIGHT: &str = "permission_preflight";
const CACHE_METADATA_KEY: &str = "approval_session_cache";

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct SessionApprovalCacheKey {
    pub(super) action_kind: String,
    pub(super) tool_family: String,
    pub(super) approval_policy: String,
    pub(super) sandbox_policy: String,
    pub(super) contract_key: String,
    pub(super) scope: SessionApprovalCacheScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct SessionApprovalCacheScope {
    pub(super) risk_class: String,
    pub(super) workspace_id: Option<String>,
    pub(super) working_dir_hash: Option<String>,
    pub(super) project_root_hash: Option<String>,
    pub(super) network_host: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct SessionApprovalCacheEntry {
    pub(super) key: SessionApprovalCacheKey,
    pub(super) request_id: String,
    pub(super) decision: AgentSessionApprovalDecision,
    pub(super) action_scope: Option<AgentSessionActionScope>,
    pub(super) created_at: String,
}

pub(super) type SessionApprovalCache = HashMap<String, Vec<SessionApprovalCacheEntry>>;

pub(super) fn entry_from_action_response(
    stored: &StoredSession,
    request_id: &str,
    decision: Option<AgentSessionApprovalDecision>,
    action_scope: Option<AgentSessionActionScope>,
    created_at: String,
) -> Option<SessionApprovalCacheEntry> {
    if decision != Some(AgentSessionApprovalDecision::AllowForSession) {
        return None;
    }

    let event = stored
        .events
        .iter()
        .rev()
        .find(|event| event_request_id(event).as_deref() == Some(request_id))?;
    let key = key_from_action_required_event(event)?;

    Some(SessionApprovalCacheEntry {
        key,
        request_id: request_id.to_string(),
        decision: AgentSessionApprovalDecision::AllowForSession,
        action_scope,
        created_at,
    })
}

pub(super) fn insert_entry(
    cache: &mut SessionApprovalCache,
    session_id: &str,
    entry: SessionApprovalCacheEntry,
) {
    let entries = cache.entry(session_id.to_string()).or_default();
    entries.retain(|existing| existing.key != entry.key);
    entries.push(entry);
}

pub(super) fn remove_session(cache: &mut SessionApprovalCache, session_id: &str) {
    cache.remove(session_id);
}

pub(super) fn apply_hint_to_turn_start(
    cache: &SessionApprovalCache,
    params: &mut TurnStartRequest,
    session_workspace_id: Option<&str>,
) -> Option<SessionApprovalCacheEntry> {
    let key = key_from_runtime_options(params.runtime_options.as_ref(), session_workspace_id)?;
    let entry = cache
        .get(&params.session_id)?
        .iter()
        .rev()
        .find(|entry| entry.key == key)?
        .clone();

    let runtime_options = params
        .runtime_options
        .get_or_insert_with(RuntimeOptions::default);
    let runtime_request = runtime_options.runtime_request.as_mut()?;
    let metadata = runtime_request.metadata.get_or_insert_with(|| json!({}));
    let metadata_object = ensure_object(metadata);
    let harness = ensure_nested_object(metadata_object, "harness");
    harness.insert(CACHE_METADATA_KEY.to_string(), entry_metadata(&entry));
    Some(entry)
}

pub(crate) fn metadata_has_session_approval_cache_hit(metadata: Option<&Value>) -> bool {
    metadata
        .and_then(|metadata| metadata.pointer("/harness/approval_session_cache"))
        .and_then(Value::as_object)
        .is_some_and(|cache| {
            cache
                .get("decision")
                .and_then(Value::as_str)
                .is_some_and(|decision| {
                    decision == AgentSessionApprovalDecision::AllowForSession.as_str()
                })
                && cache
                    .get("decisionScope")
                    .or_else(|| cache.get("decision_scope"))
                    .and_then(Value::as_str)
                    .is_some_and(|scope| scope == "session")
        })
}

pub(crate) fn session_approval_cache_hit_payload(metadata: Option<&Value>) -> Option<Value> {
    metadata
        .and_then(|metadata| metadata.pointer("/harness/approval_session_cache"))
        .cloned()
}

pub(crate) fn approval_scope_payload_from_parts(
    risk_class: &str,
    workspace_id: Option<&str>,
    working_dir: Option<&str>,
    project_root: Option<&str>,
    metadata: Option<&Value>,
) -> Value {
    scope_metadata(&scope_from_parts(
        risk_class.to_string(),
        normalize_string(workspace_id),
        hash_scope_value(working_dir),
        hash_scope_value(project_root),
        metadata.and_then(network_host_from_metadata),
    ))
}

fn event_request_id(event: &AgentEvent) -> Option<String> {
    super::event_request_id(&event.payload)
}

fn key_from_action_required_event(event: &AgentEvent) -> Option<SessionApprovalCacheKey> {
    if event.event_type != "action.required" {
        return None;
    }
    let payload = &event.payload;
    if action_type(payload)? != "tool_confirmation" {
        return None;
    }
    let action_kind = string_field(payload, &["actionKind", "action_kind"])?;
    if action_kind != ACTION_KIND_PERMISSION_PREFLIGHT {
        return None;
    }
    let tool_family = string_field(payload, &["toolName", "tool_name"])?;
    let contract_key = contract_key_from_payload(payload)?;
    let scope = scope_from_payload(payload, &tool_family, &contract_key);
    key_from_parts(
        action_kind,
        tool_family,
        string_field(payload, &["approvalPolicy", "approval_policy"])?,
        string_field(payload, &["sandboxPolicy", "sandbox_policy"])?,
        contract_key,
        scope,
    )
}

fn key_from_runtime_options(
    options: Option<&RuntimeOptions>,
    session_workspace_id: Option<&str>,
) -> Option<SessionApprovalCacheKey> {
    let options = options?;
    let runtime_request = options.runtime_request.as_ref()?;
    let metadata = runtime_request.metadata.as_ref()?;
    let workspace_id = runtime_request
        .workspace_id
        .clone()
        .or_else(|| metadata_string_from_pointers(metadata, &["/workspaceId", "/workspace_id"]))
        .or_else(|| normalize_string(session_workspace_id));
    let working_dir = runtime_request.working_dir.clone().or_else(|| {
        metadata_string_from_pointers(
            metadata,
            &[
                "/workingDir",
                "/working_dir",
                "/workingDirectory",
                "/working_directory",
                "/cwd",
                "/harness/workingDir",
                "/harness/working_dir",
                "/harness/workingDirectory",
                "/harness/working_directory",
                "/harness/cwd",
            ],
        )
    });
    let project_root = runtime_request
        .project_root
        .clone()
        .or_else(|| runtime_request.workspace_root.clone())
        .or_else(|| {
            metadata_string_from_pointers(
                metadata,
                &[
                    "/workspaceRoot",
                    "/workspace_root",
                    "/projectRoot",
                    "/project_root",
                    "/harness/workspaceRoot",
                    "/harness/workspace_root",
                    "/harness/projectRoot",
                    "/harness/project_root",
                ],
            )
        });
    let contract_key = contract_key_from_metadata(metadata)?;
    let scope = scope_from_parts(
        contract_key.clone(),
        workspace_id,
        hash_scope_value(working_dir.as_deref()),
        hash_scope_value(project_root.as_deref()),
        network_host_from_metadata(metadata),
    );

    key_from_parts(
        ACTION_KIND_PERMISSION_PREFLIGHT.to_string(),
        "browser_control".to_string(),
        runtime_request.approval_policy.clone()?,
        runtime_request.sandbox_policy.clone()?,
        contract_key,
        scope,
    )
}

fn key_from_parts(
    action_kind: String,
    tool_family: String,
    approval_policy: String,
    sandbox_policy: String,
    contract_key: String,
    scope: SessionApprovalCacheScope,
) -> Option<SessionApprovalCacheKey> {
    Some(SessionApprovalCacheKey {
        action_kind,
        tool_family,
        approval_policy,
        sandbox_policy,
        contract_key,
        scope,
    })
}

fn scope_from_payload(
    payload: &Value,
    tool_family: &str,
    contract_key: &str,
) -> SessionApprovalCacheScope {
    let explicit = payload
        .get("approvalScope")
        .or_else(|| payload.get("approval_scope"))
        .or_else(|| payload.pointer("/data/approvalScope"))
        .or_else(|| payload.pointer("/data/approval_scope"));
    let risk_class = explicit
        .and_then(|value| string_field(value, &["riskClass", "risk_class"]))
        .unwrap_or_else(|| {
            if contract_key.trim().is_empty() {
                tool_family.to_string()
            } else {
                contract_key.to_string()
            }
        });
    let workspace_id = explicit
        .and_then(|value| string_field(value, &["workspaceId", "workspace_id"]))
        .or_else(|| {
            payload
                .get("scope")
                .and_then(|scope| string_field(scope, &["workspaceId", "workspace_id"]))
        });
    let working_dir_hash =
        explicit.and_then(|value| string_field(value, &["workingDirHash", "working_dir_hash"]));
    let project_root_hash =
        explicit.and_then(|value| string_field(value, &["projectRootHash", "project_root_hash"]));
    let network_host =
        explicit.and_then(|value| string_field(value, &["networkHost", "network_host"]));
    scope_from_parts(
        risk_class,
        workspace_id,
        working_dir_hash,
        project_root_hash,
        network_host,
    )
}

fn scope_from_parts(
    risk_class: String,
    workspace_id: Option<String>,
    working_dir_hash: Option<String>,
    project_root_hash: Option<String>,
    network_host: Option<String>,
) -> SessionApprovalCacheScope {
    SessionApprovalCacheScope {
        risk_class: risk_class.trim().to_string(),
        workspace_id: normalize_owned_string(workspace_id),
        working_dir_hash: normalize_owned_string(working_dir_hash),
        project_root_hash: normalize_owned_string(project_root_hash),
        network_host: normalize_owned_string(network_host),
    }
}

fn action_type(payload: &Value) -> Option<&str> {
    payload
        .get("actionType")
        .or_else(|| payload.get("action_type"))
        .and_then(Value::as_str)
}

fn contract_key_from_payload(payload: &Value) -> Option<String> {
    payload
        .get("runtime_contract")
        .or_else(|| payload.pointer("/data/runtime_contract"))
        .and_then(contract_key_from_metadata)
}

fn contract_key_from_metadata(metadata: &Value) -> Option<String> {
    metadata
        .pointer("/harness/browser_assist/runtime_contract/contract_key")
        .or_else(|| metadata.pointer("/browser_assist/runtime_contract/contract_key"))
        .or_else(|| metadata.get("contract_key"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn metadata_string_from_pointers(metadata: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        metadata
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| normalize_string(Some(value)))
    })
}

fn normalize_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn normalize_owned_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn hash_scope_value(value: Option<&str>) -> Option<String> {
    let value = value.map(str::trim).filter(|value| !value.is_empty())?;
    Some(format!(
        "sha256:{}",
        hex_encode(Sha256::digest(value.as_bytes()))
    ))
}

fn network_host_from_metadata(metadata: &Value) -> Option<String> {
    [
        "/harness/browser_launch_url",
        "/harness/browserLaunchUrl",
        "/browser_launch_url",
        "/browserLaunchUrl",
        "/harness/browser_assist/launch_url",
        "/harness/browser_assist/launchUrl",
        "/harness/browser_assist/target_url",
        "/harness/browser_assist/targetUrl",
        "/harness/browserAssist/launchUrl",
        "/harness/browserAssist/targetUrl",
        "/harness/browser_requirement/launch_url",
        "/harness/browser_requirement/launchUrl",
        "/harness/browserRequirement/launchUrl",
    ]
    .iter()
    .find_map(|pointer| {
        metadata
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(normalize_network_host)
    })
}

fn normalize_network_host(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = Url::parse(trimmed)
        .or_else(|_| Url::parse(&format!("https://{trimmed}")))
        .ok()?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    let host = parsed.host_str()?.to_ascii_lowercase();
    let port = parsed.port_or_known_default();
    let default_port = matches!(
        (scheme.as_str(), port),
        ("http", Some(80)) | ("https", Some(443))
    );
    if default_port || port.is_none() {
        Some(format!("{scheme}://{host}"))
    } else {
        Some(format!("{scheme}://{host}:{}", port.expect("port checked")))
    }
}

fn ensure_object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = json!({});
    }
    value.as_object_mut().expect("metadata object")
}

fn ensure_nested_object<'a>(
    object: &'a mut Map<String, Value>,
    key: &str,
) -> &'a mut Map<String, Value> {
    if !object.get(key).is_some_and(Value::is_object) {
        object.insert(key.to_string(), json!({}));
    }
    object
        .get_mut(key)
        .and_then(Value::as_object_mut)
        .expect("nested metadata object")
}

fn entry_metadata(entry: &SessionApprovalCacheEntry) -> Value {
    json!({
        "decision": entry.decision.as_str(),
        "decisionScope": entry.decision.scope(),
        "sourceRequestId": &entry.request_id,
        "createdAt": &entry.created_at,
        "key": key_metadata(&entry.key),
        "actionScope": &entry.action_scope,
    })
}

pub(super) fn entry_key_metadata(entry: &SessionApprovalCacheEntry) -> Value {
    key_metadata(&entry.key)
}

fn key_metadata(key: &SessionApprovalCacheKey) -> Value {
    json!({
        "actionKind": &key.action_kind,
        "toolFamily": &key.tool_family,
        "approvalPolicy": &key.approval_policy,
        "sandboxPolicy": &key.sandbox_policy,
        "contractKey": &key.contract_key,
        "scope": scope_metadata(&key.scope),
    })
}

fn scope_metadata(scope: &SessionApprovalCacheScope) -> Value {
    let mut object = Map::new();
    object.insert(
        "riskClass".to_string(),
        Value::String(scope.risk_class.clone()),
    );
    insert_optional_string(&mut object, "workspaceId", scope.workspace_id.as_ref());
    insert_optional_string(
        &mut object,
        "workingDirHash",
        scope.working_dir_hash.as_ref(),
    );
    insert_optional_string(
        &mut object,
        "projectRootHash",
        scope.project_root_hash.as_ref(),
    );
    insert_optional_string(&mut object, "networkHost", scope.network_host.as_ref());
    Value::Object(object)
}

fn insert_optional_string(object: &mut Map<String, Value>, key: &str, value: Option<&String>) {
    if let Some(value) = value {
        object.insert(key.to_string(), Value::String(value.clone()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::RuntimeRequest;

    #[test]
    fn runtime_cache_key_uses_session_workspace_when_request_omits_it() {
        let metadata = json!({
            "harness": {
                "browser_launch_url": "https://example.com/approval-session-cache",
                "browser_assist": {
                    "runtime_contract": {
                        "contract_key": "browser_control"
                    }
                }
            }
        });
        let options = RuntimeOptions {
            runtime_request: Some(RuntimeRequest {
                approval_policy: Some("on-request".to_string()),
                sandbox_policy: Some("workspace-write".to_string()),
                metadata: Some(metadata),
                ..RuntimeRequest::default()
            }),
            ..RuntimeOptions::default()
        };

        let key = key_from_runtime_options(Some(&options), Some("workspace-permission"))
            .expect("browser control cache key");

        assert_eq!(
            key.scope.workspace_id.as_deref(),
            Some("workspace-permission")
        );
        assert_eq!(
            key.scope.network_host.as_deref(),
            Some("https://example.com")
        );
    }
}
