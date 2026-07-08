use super::model_registry_metadata;
use super::model_route_contract;
use super::model_routing;
use super::request_context::RuntimeModelSelection;
use crate::ExecutionRequest;
use app_server_protocol::{ModelTaskRequest, ResolvedModelRoute};
use lime_agent::SessionProviderConfig;
use lime_core::database::DbConnection;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json::Value;

#[derive(Debug, Clone)]
pub(super) struct ChatModelRouteResolution {
    pub(super) selection: RuntimeModelSelection,
    pub(super) model_task_request: ModelTaskRequest,
    pub(super) resolved_route: ResolvedModelRoute,
    pub(super) decision_payload: Value,
    pub(super) fallback_payload: Option<Value>,
    pub(super) not_possible_payload: Option<Value>,
}

impl ChatModelRouteResolution {
    pub(super) fn service_model_slot(&self) -> &str {
        self.resolved_route
            .decision
            .service_model_slot
            .as_deref()
            .or(self.model_task_request.routing_slot.as_deref())
            .unwrap_or("coding")
    }
}

pub(super) async fn resolve_chat_model_route(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    request: &ExecutionRequest,
    requested_selection: &RuntimeModelSelection,
    direct_provider_config: Option<&SessionProviderConfig>,
) -> Result<ChatModelRouteResolution, String> {
    let routing_resolution = model_routing::resolve_ready_routing(
        db,
        api_key_provider_service,
        request,
        requested_selection,
        direct_provider_config,
    )?;
    let selection = &routing_resolution.selection;
    let model_routing = &routing_resolution.routing;
    let provider_readiness = &routing_resolution.readiness;
    let model_registry = model_registry_metadata::resolve_runtime_model_registry_metadata(
        db,
        api_key_provider_service,
        selection,
        direct_provider_config,
    )
    .await?;
    let provider_record = if direct_provider_config.is_some() {
        None
    } else {
        api_key_provider_service.get_provider(db, &selection.provider)?
    };
    let routing_payload = model_routing::routing_decision_payload(
        selection,
        model_routing,
        provider_readiness,
        &model_registry,
    );
    let model_task_request =
        model_route_contract::chat_task_request_from_runtime(request, selection, &routing_payload);
    let resolved_route = model_route_contract::resolved_route_from_runtime(
        &model_task_request,
        selection,
        &routing_payload,
        provider_record.as_ref(),
        direct_provider_config,
    );
    let evidence = runtime_core::route_resolution_evidence_payloads(
        requested_selection,
        &routing_resolution,
        model_registry.payload(),
        &model_task_request,
        &resolved_route,
    );

    Ok(ChatModelRouteResolution {
        selection: selection.clone(),
        model_task_request,
        resolved_route,
        decision_payload: evidence.decision_payload,
        fallback_payload: evidence.fallback_payload,
        not_possible_payload: evidence.not_possible_payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_backend::tests::request_for_test;
    use app_server_protocol::{AuthKind, EndpointKind, ProtocolKind, RouteFailureCategory};
    use lime_core::database::dao::api_key_provider::ApiProviderType;
    use lime_core::database::schema::create_tables;
    use lime_core::database::DbConnection;
    use rusqlite::Connection;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    fn test_db() -> DbConnection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create schema");
        Arc::new(Mutex::new(conn))
    }

    fn selection(provider: &str, model: &str) -> RuntimeModelSelection {
        RuntimeModelSelection {
            provider: provider.to_string(),
            model: model.to_string(),
            source: "runtime_options",
            reasoning_effort: None,
        }
    }

    #[tokio::test]
    async fn direct_provider_config_keeps_runtime_only_route_without_registry_block() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let request = request_for_test("hello", None, None);
        let requested_selection = selection("fixture-openai", "fixture-model");
        let direct_provider_config = SessionProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("fixture-openai".to_string()),
            model_name: "fixture-model".to_string(),
            api_key: Some("fixture-key".to_string()),
            base_url: Some("http://127.0.0.1:56599".to_string()),
            credential_uuid: None,
            reasoning_effort: None,
            route_protocol: None,
            toolshim: false,
            toolshim_model: None,
            model_capabilities: None,
        };

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &requested_selection,
            Some(&direct_provider_config),
        )
        .await
        .expect("route");

        assert!(route.resolved_route.failure.is_none());
        assert_eq!(route.resolved_route.protocol, ProtocolKind::OpenaiChat);
        assert_eq!(
            route.resolved_route.endpoint.kind,
            EndpointKind::DirectRequest
        );
        assert_eq!(
            route.resolved_route.endpoint.base_url.as_deref(),
            Some("http://127.0.0.1:56599")
        );
        assert_eq!(route.resolved_route.auth.kind, AuthKind::DirectApiKey);
        assert_eq!(
            route
                .decision_payload
                .pointer("/modelRegistry/reasonCode")
                .and_then(|value| value.as_str()),
            Some("direct_provider_config_not_in_registry")
        );
        assert!(route.not_possible_payload.is_none());
    }

    #[tokio::test]
    async fn direct_provider_config_can_declare_fixture_tool_capabilities() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let request = request_for_test("hello", None, None);
        let requested_selection = selection("fixture-openai", "fixture-model");
        let direct_provider_config = SessionProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("fixture-openai".to_string()),
            model_name: "fixture-model".to_string(),
            api_key: Some("fixture-key".to_string()),
            base_url: Some("http://127.0.0.1:56599".to_string()),
            credential_uuid: None,
            reasoning_effort: None,
            route_protocol: None,
            toolshim: false,
            toolshim_model: None,
            model_capabilities: Some(json!({
                "capabilities": {
                    "tools": true,
                    "streaming": true,
                    "jsonMode": true,
                    "functionCalling": true
                },
                "taskFamilies": ["chat"],
                "inputModalities": ["text"],
                "outputModalities": ["text"],
                "runtimeFeatures": ["streaming", "tool_calling"]
            })),
        };

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &requested_selection,
            Some(&direct_provider_config),
        )
        .await
        .expect("route");

        assert!(route.resolved_route.failure.is_none());
        assert!(route.resolved_route.capability_snapshot.capabilities.tools);
        assert!(
            route
                .resolved_route
                .capability_snapshot
                .capabilities
                .function_calling
        );
        assert!(route
            .resolved_route
            .capability_snapshot
            .runtime_features
            .contains(&"tool_calling".to_string()));
        assert_eq!(
            route
                .decision_payload
                .pointer("/modelRegistry/modelCapabilities/capabilities/tools")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
    }

    #[tokio::test]
    async fn disabled_provider_returns_provider_disabled_failure() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let provider = service
            .add_custom_provider(
                &db,
                "Disabled Gateway".to_string(),
                ApiProviderType::Openai,
                "https://disabled.example.com/v1".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        service
            .add_api_key(&db, &provider.id, "sk-disabled", None, true)
            .expect("api key");
        service
            .update_provider(
                &db,
                &provider.id,
                None,
                None,
                None,
                Some(false),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .expect("disable provider");
        let request = request_for_test("hello", None, None);

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &selection(&provider.id, "gpt-4.1-mini"),
            None,
        )
        .await
        .expect("route");

        let failure = route.resolved_route.failure.expect("route failure");
        assert_eq!(failure.category, RouteFailureCategory::ProviderDisabled);
        assert_eq!(failure.reason_code, "provider_disabled");
        assert_eq!(failure.provider_id.as_deref(), Some(provider.id.as_str()));
        assert_eq!(
            route
                .not_possible_payload
                .as_ref()
                .and_then(|payload| payload.pointer("/routeFailure/reasonCode"))
                .and_then(|value| value.as_str()),
            Some("provider_disabled")
        );
    }

    #[tokio::test]
    async fn declared_capability_gap_blocks_image_chat_before_provider_call() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let provider = service
            .add_custom_provider(
                &db,
                "Text Gateway".to_string(),
                ApiProviderType::Openai,
                "https://text.example.com/v1".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        service
            .add_api_key(&db, &provider.id, "sk-text", None, true)
            .expect("api key");
        service
            .update_provider(
                &db,
                &provider.id,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(vec!["text-only-model".to_string()]),
            )
            .expect("declared model");
        let mut request = request_for_test("看图", None, None);
        request
            .input
            .attachments
            .push(app_server_protocol::AgentAttachment {
                kind: "image".to_string(),
                uri: Some("file:///tmp/poster.png".to_string()),
                metadata: None,
            });

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &selection(&provider.id, "text-only-model"),
            None,
        )
        .await
        .expect("route");

        let failure = route.resolved_route.failure.expect("capability gap");
        assert_eq!(failure.category, RouteFailureCategory::CapabilityGap);
        assert_eq!(failure.reason_code, "capability_gap");
        assert_eq!(
            failure.capability_gap.as_deref(),
            Some("task_family:vision_understanding")
        );
        assert_eq!(
            route
                .decision_payload
                .pointer("/modelTaskRequest/requirements/inputModalities")
                .and_then(|value| value.as_array())
                .map(|items| items.iter().any(|item| item.as_str() == Some("image"))),
            Some(true)
        );
        assert_eq!(
            route
                .not_possible_payload
                .as_ref()
                .and_then(|payload| payload.pointer("/routeFailure/capabilityGap"))
                .and_then(|value| value.as_str()),
            Some("task_family:vision_understanding")
        );
    }

    #[tokio::test]
    async fn provider_type_maps_to_route_protocol_endpoint_and_auth() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let provider = service
            .add_custom_provider(
                &db,
                "Anthropic Gateway".to_string(),
                ApiProviderType::Anthropic,
                "https://api.anthropic.com".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        service
            .add_api_key(&db, &provider.id, "sk-ant", None, true)
            .expect("api key");
        let request = request_for_test("hello", None, None);

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &selection(&provider.id, "claude-sonnet-4"),
            None,
        )
        .await
        .expect("route");

        assert!(route.resolved_route.failure.is_none());
        assert_eq!(
            route.resolved_route.protocol,
            ProtocolKind::AnthropicMessages
        );
        assert_eq!(
            route.resolved_route.endpoint.kind,
            EndpointKind::ProviderBaseUrl
        );
        assert_eq!(
            route.resolved_route.endpoint.base_url.as_deref(),
            Some("https://api.anthropic.com")
        );
        assert_eq!(route.resolved_route.auth.kind, AuthKind::ApiKeyRef);
        assert_eq!(
            route.resolved_route.auth.provider_id.as_deref(),
            Some(provider.id.as_str())
        );
    }

    #[tokio::test]
    async fn managed_lime_hub_tenant_provider_without_key_resolves_no_auth_route() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let provider = service
            .add_custom_provider(
                &db,
                "Lime Hub".to_string(),
                ApiProviderType::Openai,
                "https://llm.limeai.run/v1#lime_tenant_id=tenant-0001".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        service
            .update_provider(
                &db,
                &provider.id,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(vec!["agnes-2.0-flash".to_string()]),
            )
            .expect("declared model");
        let request = request_for_test("hello", None, None);

        let route = resolve_chat_model_route(
            &db,
            &service,
            &request,
            &selection(&provider.id, "agnes-2.0-flash"),
            None,
        )
        .await
        .expect("route");

        assert!(route.resolved_route.failure.is_none());
        assert_eq!(route.resolved_route.protocol, ProtocolKind::OpenaiChat);
        assert_eq!(
            route.resolved_route.endpoint.kind,
            EndpointKind::OpenaiCompatible
        );
        assert_eq!(
            route.resolved_route.endpoint.base_url.as_deref(),
            Some("https://llm.limeai.run/v1#lime_tenant_id=tenant-0001")
        );
        assert_eq!(route.resolved_route.auth.kind, AuthKind::NoAuth);
        assert_eq!(
            route
                .decision_payload
                .pointer("/providerReadiness/reasonCode")
                .and_then(|value| value.as_str()),
            None
        );
    }

    #[tokio::test]
    async fn unready_coding_slot_emits_fallback_payload_for_ready_base_slot() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let coding = service
            .add_custom_provider(
                &db,
                "Coding Gateway".to_string(),
                ApiProviderType::Openai,
                "https://coding.example.com/v1".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        service
            .initialize_system_providers(&db)
            .expect("system providers");
        service
            .add_api_key(&db, "openai", "sk-openai", None, true)
            .expect("openai api key");
        let request = request_for_test(
            "hello",
            None,
            Some(json!({
                "harness": {
                    "coding_model_slots": {
                        "coding": {
                            "provider": coding.id,
                            "model": "missing-key-coder"
                        },
                        "base": {
                            "provider": "openai",
                            "model": "gpt-4.1-mini"
                        }
                    }
                }
            })),
        );
        let requested_selection = model_routing::selection_from_profile_model_slot(&request)
            .expect("requested selection");

        let route = resolve_chat_model_route(&db, &service, &request, &requested_selection, None)
            .await
            .expect("route");

        assert_eq!(route.selection.provider, "openai");
        assert_eq!(route.selection.model, "gpt-4.1-mini");
        assert!(route.resolved_route.failure.is_none());
        assert_eq!(route.service_model_slot(), "base");
        assert_eq!(
            route
                .fallback_payload
                .as_ref()
                .and_then(|payload| payload.pointer("/fallbackApplied"))
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            route
                .fallback_payload
                .as_ref()
                .and_then(|payload| payload.pointer("/routingAttempts"))
                .and_then(|value| value.as_array())
                .map(Vec::len),
            Some(2)
        );
    }
}
