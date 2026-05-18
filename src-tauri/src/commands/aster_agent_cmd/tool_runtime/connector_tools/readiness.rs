#[derive(Clone)]
pub(super) struct ConnectorAdapterReadiness {
    pub(super) kind: &'static str,
    pub(super) readiness: &'static str,
    pub(super) reason: &'static str,
    pub(super) next_required: &'static str,
    pub(super) secret_delivery_status: &'static str,
    pub(super) secret_delivery_source: &'static str,
    pub(super) secret_delivery_target: &'static str,
    pub(super) secret_delivery_lease_ref: Option<String>,
    pub(super) secret_delivery_expires_at: Option<String>,
    pub(super) external_delivery: Option<ConnectorExternalDelivery>,
    pub(super) executable: bool,
}

#[derive(Clone)]
pub(super) struct ConnectorExternalDelivery {
    pub(super) channel: String,
    pub(super) target: String,
    pub(super) target_label: Option<String>,
}

struct ConnectorSecretDeliveryFact {
    lease_ref: String,
    expires_at: Option<String>,
}

impl ConnectorAdapterReadiness {
    fn default_unconfigured() -> Self {
        Self {
            kind: "cloud_overlay",
            readiness: "adapter_not_configured",
            reason: "connector_toolruntime_adapter_not_configured",
            next_required: "current_connector_toolruntime_adapter",
            secret_delivery_status: "not_observed",
            secret_delivery_source: "not_observed",
            secret_delivery_target: "not_ready",
            secret_delivery_lease_ref: None,
            secret_delivery_expires_at: None,
            external_delivery: None,
            executable: false,
        }
    }

    fn desktop_system() -> Self {
        Self {
            kind: "desktop_system_connector",
            readiness: "desktop_action_surface_known",
            reason: "desktop_connector_action_adapter_not_configured",
            next_required: "desktop_connector_action_adapter",
            secret_delivery_status: "not_required",
            secret_delivery_source: "not_required",
            secret_delivery_target: "desktop_system",
            secret_delivery_lease_ref: None,
            secret_delivery_expires_at: None,
            external_delivery: None,
            executable: false,
        }
    }

    fn cloud_overlay_authorized(
        secret_delivery_fact: Option<ConnectorSecretDeliveryFact>,
        external_delivery: Option<ConnectorExternalDelivery>,
    ) -> Self {
        if let Some(secret_delivery_fact) = secret_delivery_fact {
            return Self {
                kind: "cloud_overlay",
                readiness: "host_managed_secret_delivery_adapter_ready",
                reason: "cloud_overlay_secret_delivery_adapter_ready",
                next_required: "cloud_overlay_worker_delivery",
                secret_delivery_status: "ready",
                secret_delivery_source: "host_managed_secret_delivery_fact",
                secret_delivery_target: "cloud_overlay_worker",
                secret_delivery_lease_ref: Some(secret_delivery_fact.lease_ref),
                secret_delivery_expires_at: secret_delivery_fact.expires_at,
                external_delivery,
                executable: true,
            };
        }

        Self {
            kind: "cloud_overlay",
            readiness: "host_managed_outbox_adapter_ready",
            reason: "cloud_overlay_connector_outbox_adapter_ready",
            next_required: "cloud_overlay_secret_delivery_adapter",
            secret_delivery_status: "pending",
            secret_delivery_source: "not_observed",
            secret_delivery_target: "cloud_overlay_worker",
            secret_delivery_lease_ref: None,
            secret_delivery_expires_at: None,
            external_delivery: None,
            executable: true,
        }
    }

    fn host_fixture() -> Self {
        Self {
            kind: "host_fixture_connector",
            readiness: "host_managed_fixture_adapter_ready",
            reason: "host_fixture_connector_adapter_ready",
            next_required: "external_connector_oauth_adapter",
            secret_delivery_status: "host_fixture",
            secret_delivery_source: "host_fixture",
            secret_delivery_target: "host_fixture",
            secret_delivery_lease_ref: None,
            secret_delivery_expires_at: None,
            external_delivery: None,
            executable: true,
        }
    }

    pub(super) fn for_request(
        connector_id: &str,
        action: &str,
        request_metadata: Option<&serde_json::Value>,
    ) -> Self {
        if is_host_fixture_connector_action(connector_id, action)
            && connector_authorized_runtime_fact_observed(request_metadata)
        {
            return Self::host_fixture();
        }

        if is_known_desktop_connector_action(connector_id, action) {
            return Self::desktop_system();
        }

        if connector_authorized_runtime_fact_observed(request_metadata) {
            let secret_delivery_fact = connector_secret_delivery_ready_fact(request_metadata);
            let external_delivery = if secret_delivery_fact.is_some() {
                connector_external_delivery_config(request_metadata)
            } else {
                None
            };
            return Self::cloud_overlay_authorized(secret_delivery_fact, external_delivery);
        }

        Self::default_unconfigured()
    }

    pub(super) fn is_host_fixture(&self) -> bool {
        self.executable
            && self.kind == "host_fixture_connector"
            && self.readiness == "host_managed_fixture_adapter_ready"
    }

    pub(super) fn is_cloud_overlay_outbox(&self) -> bool {
        self.executable
            && self.kind == "cloud_overlay"
            && matches!(
                self.readiness,
                "host_managed_outbox_adapter_ready" | "host_managed_secret_delivery_adapter_ready"
            )
    }
}

fn is_host_fixture_connector_action(connector_id: &str, action: &str) -> bool {
    connector_id == "lime_fixture" && matches!(action, "recordMutation" | "record_mutation")
}

fn is_known_desktop_connector_action(connector_id: &str, action: &str) -> bool {
    matches!(
        (connector_id, action),
        (
            "reminders",
            "list_reminders" | "create_reminder" | "update_reminder"
        ) | ("calendar", "list_events" | "create_event" | "update_event")
            | ("notes", "list_notes" | "read_note" | "create_note")
            | ("mail", "list_mailboxes" | "read_messages" | "create_draft")
            | (
                "contacts",
                "search_contacts" | "read_contact" | "create_contact"
            )
    )
}

fn connector_request_value<'a>(
    request_metadata: Option<&'a serde_json::Value>,
) -> Option<&'a serde_json::Value> {
    [
        &["agent_app_tool_execution", "internalRequest"][..],
        &["agent_app_tool_execution", "internal_request"][..],
        &["agent_app_tool_execution", "requestInternal"][..],
        &["agentAppToolExecution", "internalRequest"][..],
        &["agentAppToolExecution", "requestInternal"][..],
        &["harness", "agent_app_tool_execution", "internalRequest"][..],
        &["harness", "agent_app_tool_execution", "requestInternal"][..],
        &["harness", "agentAppToolExecution", "internalRequest"][..],
        &["harness", "agentAppToolExecution", "requestInternal"][..],
        &["agent_app_tool_execution", "request"][..],
        &["agentAppToolExecution", "request"][..],
        &["harness", "agent_app_tool_execution", "request"][..],
        &["harness", "agentAppToolExecution", "request"][..],
    ]
    .iter()
    .find_map(|path| connector_value_at_path(request_metadata, path))
    .filter(|value| value.is_object())
}

fn connector_internal_request_value<'a>(
    request_metadata: Option<&'a serde_json::Value>,
) -> Option<&'a serde_json::Value> {
    [
        &["agent_app_tool_execution", "internalRequest"][..],
        &["agent_app_tool_execution", "internal_request"][..],
        &["agent_app_tool_execution", "requestInternal"][..],
        &["agentAppToolExecution", "internalRequest"][..],
        &["agentAppToolExecution", "requestInternal"][..],
        &["harness", "agent_app_tool_execution", "internalRequest"][..],
        &["harness", "agent_app_tool_execution", "requestInternal"][..],
        &["harness", "agentAppToolExecution", "internalRequest"][..],
        &["harness", "agentAppToolExecution", "requestInternal"][..],
    ]
    .iter()
    .find_map(|path| connector_value_at_path(request_metadata, path))
    .filter(|value| value.is_object())
}

pub(super) fn connector_value_at_path<'a>(
    root: Option<&'a serde_json::Value>,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    let mut current = root?;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn connector_authorized_runtime_fact_observed(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    let Some(request) = connector_request_value(request_metadata) else {
        return false;
    };

    let authorized = [
        &["connectorRuntimeFacts", "status"][..],
        &["connectorRuntimeFacts", "authorizationStatus"][..],
        &["connectorRuntimeFacts", "authorization_status"][..],
        &["runtimeFacts", "status"][..],
        &["runtimeFacts", "authorizationStatus"][..],
        &["input", "connectorRuntimeFacts", "status"][..],
        &["input", "connectorRuntimeFacts", "authorizationStatus"][..],
        &["input", "runtimeFacts", "status"][..],
        &["input", "runtimeFacts", "authorizationStatus"][..],
        &["policy", "authorizationStatus"][..],
        &["policy", "authorization_status"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .filter_map(serde_json::Value::as_str)
    .map(|value| value.trim().to_ascii_lowercase())
    .any(|value| {
        matches!(
            value.as_str(),
            "authorized" | "connected" | "ready" | "observed"
        )
    });

    authorized
        && connector_request_capability_is_connectors(request)
        && connector_host_managed_secret_observed(request)
        && connector_token_not_exposed(request)
}

fn connector_request_capability_is_connectors(request: &serde_json::Value) -> bool {
    connector_value_at_path(Some(request), &["capability"])
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .is_some_and(|value| value == "lime.connectors")
}

fn connector_host_managed_secret_observed(request: &serde_json::Value) -> bool {
    [
        &["connectorRuntimeFacts", "secretBinding"][..],
        &["connectorRuntimeFacts", "secret_binding"][..],
        &["runtimeFacts", "secretBinding"][..],
        &["runtimeFacts", "secret_binding"][..],
        &["input", "connectorRuntimeFacts", "secretBinding"][..],
        &["input", "connectorRuntimeFacts", "secret_binding"][..],
        &["input", "runtimeFacts", "secretBinding"][..],
        &["input", "runtimeFacts", "secret_binding"][..],
        &["policy", "secretBinding"][..],
        &["policy", "secret_binding"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .filter_map(serde_json::Value::as_str)
    .map(|value| value.trim().to_ascii_lowercase())
    .any(|value| value == "host_managed")
}

fn connector_token_not_exposed(request: &serde_json::Value) -> bool {
    [
        &["connectorRuntimeFacts", "tokenExposed"][..],
        &["connectorRuntimeFacts", "token_exposed"][..],
        &["runtimeFacts", "tokenExposed"][..],
        &["runtimeFacts", "token_exposed"][..],
        &["input", "connectorRuntimeFacts", "tokenExposed"][..],
        &["input", "connectorRuntimeFacts", "token_exposed"][..],
        &["input", "runtimeFacts", "tokenExposed"][..],
        &["input", "runtimeFacts", "token_exposed"][..],
        &["policy", "tokenExposed"][..],
        &["policy", "token_exposed"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .any(|value| match value {
        serde_json::Value::Bool(exposed) => !exposed,
        serde_json::Value::String(text) => text.trim().eq_ignore_ascii_case("false"),
        _ => false,
    })
}

fn connector_secret_delivery_ready_fact(
    request_metadata: Option<&serde_json::Value>,
) -> Option<ConnectorSecretDeliveryFact> {
    let Some(request) = connector_request_value(request_metadata) else {
        return None;
    };

    let ready = [
        &["connectorRuntimeFacts", "secretDeliveryStatus"][..],
        &["connectorRuntimeFacts", "secret_delivery_status"][..],
        &["connectorRuntimeFacts", "secretDelivery", "status"][..],
        &["connectorRuntimeFacts", "secret_delivery", "status"][..],
        &["runtimeFacts", "secretDeliveryStatus"][..],
        &["runtimeFacts", "secret_delivery_status"][..],
        &["runtimeFacts", "secretDelivery", "status"][..],
        &["input", "connectorRuntimeFacts", "secretDeliveryStatus"][..],
        &["input", "connectorRuntimeFacts", "secret_delivery_status"][..],
        &["input", "connectorRuntimeFacts", "secretDelivery", "status"][..],
        &["input", "runtimeFacts", "secretDeliveryStatus"][..],
        &["policy", "secretDeliveryStatus"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .filter_map(serde_json::Value::as_str)
    .map(|value| value.trim().to_ascii_lowercase())
    .any(|value| {
        matches!(
            value.as_str(),
            "ready" | "available" | "observed" | "delivered" | "lease_observed"
        )
    });

    if !ready
        || !connector_secret_delivery_binding_is_host_managed(request)
        || !connector_secret_delivery_source_is_host_managed(request)
        || !connector_secret_delivery_target_is_cloud_overlay_worker(request)
        || !connector_secret_material_not_exposed(request)
        || !connector_secret_delivery_token_not_exposed(request)
    {
        return None;
    }

    let lease_ref = connector_secret_delivery_lease_ref(request)?;
    if !valid_secret_delivery_lease_ref(&lease_ref) {
        return None;
    }

    Some(ConnectorSecretDeliveryFact {
        lease_ref,
        expires_at: connector_secret_delivery_expires_at(request),
    })
}

fn connector_first_string_at_paths(
    request: &serde_json::Value,
    paths: &[&[&str]],
) -> Option<String> {
    paths
        .iter()
        .filter_map(|path| connector_value_at_path(Some(request), path))
        .filter_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .next()
}

fn connector_any_string_at_paths(
    request: &serde_json::Value,
    paths: &[&[&str]],
    expected: &str,
) -> bool {
    connector_first_string_at_paths(request, paths)
        .is_some_and(|value| value.eq_ignore_ascii_case(expected))
}

fn connector_secret_delivery_binding_is_host_managed(request: &serde_json::Value) -> bool {
    connector_any_string_at_paths(
        request,
        &[
            &["connectorRuntimeFacts", "secretDelivery", "binding"][..],
            &["connectorRuntimeFacts", "secret_delivery", "binding"][..],
            &["runtimeFacts", "secretDelivery", "binding"][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "binding",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secret_delivery",
                "binding",
            ][..],
            &["input", "runtimeFacts", "secretDelivery", "binding"][..],
            &["policy", "secretDeliveryBinding"][..],
        ],
        "host_managed",
    )
}

fn connector_secret_delivery_source_is_host_managed(request: &serde_json::Value) -> bool {
    connector_any_string_at_paths(
        request,
        &[
            &["connectorRuntimeFacts", "secretDelivery", "source"][..],
            &["connectorRuntimeFacts", "secret_delivery", "source"][..],
            &["runtimeFacts", "secretDelivery", "source"][..],
            &["input", "connectorRuntimeFacts", "secretDelivery", "source"][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secret_delivery",
                "source",
            ][..],
            &["input", "runtimeFacts", "secretDelivery", "source"][..],
            &["policy", "secretDeliverySource"][..],
        ],
        "host_managed_secret_delivery_fact",
    )
}

fn connector_secret_delivery_target_is_cloud_overlay_worker(request: &serde_json::Value) -> bool {
    connector_any_string_at_paths(
        request,
        &[
            &["connectorRuntimeFacts", "secretDelivery", "target"][..],
            &["connectorRuntimeFacts", "secret_delivery", "target"][..],
            &["runtimeFacts", "secretDelivery", "target"][..],
            &["input", "connectorRuntimeFacts", "secretDelivery", "target"][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secret_delivery",
                "target",
            ][..],
            &["input", "runtimeFacts", "secretDelivery", "target"][..],
            &["policy", "secretDeliveryTarget"][..],
        ],
        "cloud_overlay_worker",
    )
}

fn connector_secret_delivery_lease_ref(request: &serde_json::Value) -> Option<String> {
    connector_first_string_at_paths(
        request,
        &[
            &["connectorRuntimeFacts", "secretDelivery", "leaseRef"][..],
            &["connectorRuntimeFacts", "secretDelivery", "lease_ref"][..],
            &["connectorRuntimeFacts", "secretDelivery", "lease", "ref"][..],
            &["connectorRuntimeFacts", "secret_delivery", "lease_ref"][..],
            &["connectorRuntimeFacts", "secretLeaseRef"][..],
            &["connectorRuntimeFacts", "secret_lease_ref"][..],
            &["runtimeFacts", "secretDelivery", "leaseRef"][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "leaseRef",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "lease_ref",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "lease",
                "ref",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secret_delivery",
                "lease_ref",
            ][..],
            &["input", "connectorRuntimeFacts", "secretLeaseRef"][..],
            &["input", "connectorRuntimeFacts", "secret_lease_ref"][..],
            &["policy", "secretDeliveryLeaseRef"][..],
        ],
    )
}

fn connector_secret_delivery_expires_at(request: &serde_json::Value) -> Option<String> {
    connector_first_string_at_paths(
        request,
        &[
            &["connectorRuntimeFacts", "secretDelivery", "expiresAt"][..],
            &["connectorRuntimeFacts", "secretDelivery", "expires_at"][..],
            &[
                "connectorRuntimeFacts",
                "secretDelivery",
                "lease",
                "expiresAt",
            ][..],
            &["connectorRuntimeFacts", "secret_delivery", "expires_at"][..],
            &["runtimeFacts", "secretDelivery", "expiresAt"][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "expiresAt",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "expires_at",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secretDelivery",
                "lease",
                "expiresAt",
            ][..],
            &[
                "input",
                "connectorRuntimeFacts",
                "secret_delivery",
                "expires_at",
            ][..],
            &["policy", "secretDeliveryExpiresAt"][..],
        ],
    )
}

fn valid_secret_delivery_lease_ref(lease_ref: &str) -> bool {
    lease_ref.starts_with("secret-lease://connector/")
}

fn connector_external_delivery_config(
    request_metadata: Option<&serde_json::Value>,
) -> Option<ConnectorExternalDelivery> {
    let request = connector_internal_request_value(request_metadata)?;
    let config = [
        &[
            "connectorRuntimeFacts",
            "secretDelivery",
            "externalDelivery",
        ][..],
        &[
            "connectorRuntimeFacts",
            "secret_delivery",
            "external_delivery",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secretDelivery",
            "externalDelivery",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secret_delivery",
            "external_delivery",
        ][..],
        &["input", "externalDelivery"][..],
        &["externalDelivery"][..],
    ]
    .iter()
    .find_map(|path| connector_value_at_path(Some(request), path))
    .filter(|value| value.is_object())?;
    let status = connector_first_string_at_paths(
        config,
        &[
            &["status"][..],
            &["deliveryStatus"][..],
            &["delivery_status"][..],
        ],
    )?;
    if !matches!(status.to_ascii_lowercase().as_str(), "ready" | "available") {
        return None;
    }
    if !connector_any_string_at_paths(config, &[&["binding"][..]], "host_managed") {
        return None;
    }
    if !connector_external_delivery_false_flag(config, "targetExposed", "target_exposed")
        || !connector_external_delivery_false_flag(
            config,
            "credentialMaterialExposed",
            "credential_material_exposed",
        )
        || !connector_external_delivery_false_flag(config, "tokenExposed", "token_exposed")
    {
        return None;
    }
    let channel = connector_first_string_at_paths(config, &[&["channel"][..]])?;
    if !channel.eq_ignore_ascii_case("webhook") {
        return None;
    }
    let target = connector_first_string_at_paths(config, &[&["target"][..], &["targetUrl"][..]])?;
    if !valid_external_delivery_target(&target) {
        return None;
    }
    Some(ConnectorExternalDelivery {
        channel: "webhook".to_string(),
        target: target.trim().to_string(),
        target_label: connector_first_string_at_paths(
            config,
            &[&["targetLabel"][..], &["target_label"][..]],
        ),
    })
}

fn connector_external_delivery_false_flag(
    config: &serde_json::Value,
    camel_key: &str,
    snake_key: &str,
) -> bool {
    [camel_key, snake_key]
        .iter()
        .filter_map(|key| connector_value_at_path(Some(config), &[*key]))
        .any(|value| match value {
            serde_json::Value::Bool(exposed) => !exposed,
            serde_json::Value::String(text) => text.trim().eq_ignore_ascii_case("false"),
            _ => false,
        })
}

fn valid_external_delivery_target(target: &str) -> bool {
    let trimmed = target.trim();
    trimmed.starts_with("https://")
        || trimmed.starts_with("http://127.0.0.1:")
        || trimmed.starts_with("http://localhost:")
}

fn connector_secret_material_not_exposed(request: &serde_json::Value) -> bool {
    [
        &["connectorRuntimeFacts", "credentialMaterialExposed"][..],
        &["connectorRuntimeFacts", "credential_material_exposed"][..],
        &[
            "connectorRuntimeFacts",
            "secretDelivery",
            "credentialMaterialExposed",
        ][..],
        &[
            "connectorRuntimeFacts",
            "secret_delivery",
            "credential_material_exposed",
        ][..],
        &["runtimeFacts", "credentialMaterialExposed"][..],
        &[
            "runtimeFacts",
            "secretDelivery",
            "credentialMaterialExposed",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "credentialMaterialExposed",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "credential_material_exposed",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secretDelivery",
            "credentialMaterialExposed",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secret_delivery",
            "credential_material_exposed",
        ][..],
        &["policy", "credentialMaterialExposed"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .any(|value| match value {
        serde_json::Value::Bool(exposed) => !exposed,
        serde_json::Value::String(text) => text.trim().eq_ignore_ascii_case("false"),
        _ => false,
    })
}

fn connector_secret_delivery_token_not_exposed(request: &serde_json::Value) -> bool {
    [
        &["connectorRuntimeFacts", "secretDelivery", "tokenExposed"][..],
        &["connectorRuntimeFacts", "secret_delivery", "token_exposed"][..],
        &["runtimeFacts", "secretDelivery", "tokenExposed"][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secretDelivery",
            "tokenExposed",
        ][..],
        &[
            "input",
            "connectorRuntimeFacts",
            "secret_delivery",
            "token_exposed",
        ][..],
        &["input", "runtimeFacts", "secretDelivery", "tokenExposed"][..],
        &["policy", "secretDeliveryTokenExposed"][..],
    ]
    .iter()
    .filter_map(|path| connector_value_at_path(Some(request), path))
    .any(|value| match value {
        serde_json::Value::Bool(exposed) => !exposed,
        serde_json::Value::String(text) => text.trim().eq_ignore_ascii_case("false"),
        _ => false,
    })
}
