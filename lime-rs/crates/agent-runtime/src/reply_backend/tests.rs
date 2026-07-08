use super::*;

struct FailingReplyBackend;

#[derive(Default)]
struct RecordingReplySource;

impl RuntimeReplySource for RecordingReplySource {
    type Stream<'a> = &'static str;
    type Error = anyhow::Error;

    fn run<'a>(
        self,
        call: RuntimeReplySourceRun,
    ) -> BoxFuture<'a, Result<Self::Stream<'a>, Self::Error>>
    where
        Self: 'a,
    {
        Box::pin(async move {
            match call {
                RuntimeReplySourceCall::Default(_) => Ok("default"),
                RuntimeReplySourceCall::Provider(_) => Ok("provider"),
            }
        })
    }
}

impl RuntimeReplyBackend<()> for FailingReplyBackend {
    fn uses_pinned_provider(&self) -> bool {
        false
    }

    fn provider_handle(&self) -> Option<&RuntimeReplyProviderHandle> {
        None
    }

    fn start_reply_stream<'a>(
        &'a self,
        _start_request: RuntimeReplyStartRequest,
    ) -> BoxFuture<'a, RuntimeReplyStartResult<'a, ()>> {
        Box::pin(async { Err(RuntimeReplyStartError::new("backend unavailable", false)) })
    }
}

#[test]
fn reply_backend_contract_is_aster_free() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let backend = FailingReplyBackend;
    let error = match futures::executor::block_on(backend.start_reply_stream(start_request)) {
        Ok(_) => panic!("test backend should fail"),
        Err(error) => error,
    };

    assert_eq!(error.message, "backend unavailable");
    assert!(!backend.uses_pinned_provider());
    assert!(backend.provider_handle().is_none());
}

fn _assert_stream_alias_is_exported<E>(_stream: crate::reply_host::RuntimeReplyStream<'_, E>) {}

#[test]
fn backend_start_materializes_current_request_parts() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_start = RuntimeReplyBackendStart::from_start_request(start_request);

    assert_eq!(backend_start.message_chars(), 5);
    assert!(backend_start.provider_wire_support_start_error().is_none());

    let (message, stream_request, session_config, cancel_token, emitted_any) =
        backend_start.into_parts();
    assert_eq!(message.concat_text(), "hello");
    assert_eq!(stream_request.session_id, "session-backend");
    assert_eq!(session_config.id, "session-backend");
    assert!(cancel_token.is_none());
    assert!(emitted_any);
}

#[test]
fn backend_start_maps_provider_wire_support_issue_to_start_error() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyModelRequestPolicy, RuntimeReplyProviderCapabilities,
        RuntimeReplyProviderHandle, RuntimeReplyProviderIdentity,
        RuntimeReplyProviderWireSupportIssue, RuntimeReplyResponsesPolicy,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::ChatCompletions),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::AsterCompat,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let model_request_policy = RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses_lite".to_string(),
            instructions_location: "input_prefix".to_string(),
            tools_location: "input_prefix".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    );
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(provider),
        model_request_policy,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_start = RuntimeReplyBackendStart::from_start_request(start_request);
    let (issue, error) = backend_start
        .provider_wire_support_start_error()
        .expect("wire support issue");

    assert_eq!(
        issue.provider_backend,
        Some(RuntimeProviderBackend::AsterCompat)
    );
    assert_eq!(error.message, RuntimeReplyProviderWireSupportIssue::MESSAGE);
    assert!(error.emitted_any);
}

#[test]
fn backend_start_maps_provider_stream_start_error() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyProviderCapabilities, RuntimeReplyProviderHandle,
        RuntimeReplyProviderIdentity,
    };
    use model_provider::ModelProviderProtocol;

    let expected_provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let actual_provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "anthropic".to_string(),
            provider_selector: None,
            model_name: "claude-sonnet-4.5".to_string(),
            credential_uuid: "credential-2".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(actual_provider),
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_start = RuntimeReplyBackendStart::from_start_request(start_request);
    let error = backend_start
        .provider_stream_start(&expected_provider)
        .expect_err("provider handle mismatch");

    assert!(error.message.contains("Provider stream handle mismatch"));
    assert!(error.message.contains("openai/gpt-5.3-codex"));
    assert!(error.message.contains("anthropic/claude-sonnet-4.5"));
    assert!(error.emitted_any);
}

#[test]
fn backend_start_exposes_trace_snapshot() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyModelRequestPolicy, RuntimeReplyProviderCapabilities,
        RuntimeReplyProviderHandle, RuntimeReplyProviderIdentity, RuntimeReplyResponsesPolicy,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let policy = RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses".to_string(),
            instructions_location: "request".to_string(),
            tools_location: "request".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    );
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(provider),
        policy,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let backend_start = RuntimeReplyBackendStart::from_start_request(start_request);
    let trace = backend_start.trace();

    assert_eq!(
        trace.provider_backend,
        Some(RuntimeProviderBackend::Current)
    );
    assert_eq!(trace.provider_name, Some("openai"));
    assert_eq!(trace.model_name, Some("gpt-5.3-codex"));
    assert_eq!(trace.use_responses_lite, Some(true));
    assert_eq!(trace.reasoning_context, Some("all_turns"));
    assert_eq!(trace.parallel_tool_calls, None);
    assert_eq!(trace.requires_responses_lite_header, Some(true));
    assert_eq!(trace.message_chars, 5);
}

#[test]
fn backend_start_prepares_session_metadata() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeReplyModelRequestPolicy, RuntimeReplyResponsesPolicy,
    };

    let policy = RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses".to_string(),
            instructions_location: "request".to_string(),
            tools_location: "request".to_string(),
            reasoning_context: "keep".to_string(),
            parallel_tool_calls_allowed: true,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    );
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        policy,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let mut backend_start = RuntimeReplyBackendStart::from_start_request(start_request);
    let preparation = backend_start.prepare_session_metadata(["Bash", "PowerShell", "bash"]);

    assert!(preparation.provider_wire_shape_requested);
    assert!(preparation.provider_wire_shape_attached);

    let (_, _, session_config, _, _) = backend_start.into_parts();
    let metadata = session_config
        .turn_context
        .as_ref()
        .expect("turn context")
        .metadata
        .get(crate::reply_session::TOOL_SCOPE_METADATA_KEY)
        .expect("tool scope metadata");
    assert_eq!(
        metadata
            .get(crate::reply_session::DISALLOWED_TOOLS_METADATA_KEY)
            .expect("disallowed tools"),
        &serde_json::json!(["Bash", "PowerShell"])
    );
    assert!(
        session_config
            .turn_context
            .as_ref()
            .expect("turn context")
            .metadata
            .contains_key(
                model_provider::provider_stream::RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY
            )
    );
}

#[test]
fn backend_start_prepare_run_selects_default_path() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let backend_run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, ["Bash"])
        .expect("default run");

    assert_eq!(backend_run.message_chars(), 5);
    assert_eq!(
        backend_run.session_preparation(),
        RuntimeReplySessionPreparation {
            provider_wire_shape_requested: false,
            provider_wire_shape_attached: false,
        }
    );

    let (message, path, stream_request, session_config, cancel_token, emitted_any) =
        backend_run.into_parts();
    assert_eq!(message.concat_text(), "hello");
    assert_eq!(path, RuntimeReplyBackendRunPath::Default);
    assert!(stream_request.provider.is_none());
    assert_eq!(session_config.id, "session-backend");
    assert!(cancel_token.is_none());
    assert!(!emitted_any);
}

#[test]
fn backend_start_prepare_run_selects_provider_path() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyProviderCapabilities, RuntimeReplyProviderHandle,
        RuntimeReplyProviderIdentity,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(provider.clone()),
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(Some(&provider), std::iter::empty::<&str>())
        .expect("provider run");

    let (_, path, stream_request, _, _, _) = backend_run.into_parts();
    match path {
        RuntimeReplyBackendRunPath::Provider(provider_start) => {
            assert_eq!(provider_start.stream_request(), &stream_request);
        }
        RuntimeReplyBackendRunPath::Default => panic!("expected provider path"),
    }
}

#[test]
fn reply_source_runner_executes_default_path() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, std::iter::empty::<&str>())
        .expect("default run");
    let source = RecordingReplySource;
    let (outcome, stream_request, stream_result) =
        futures::executor::block_on(run_reply_source(source, run));

    assert_eq!(stream_request.session_id, "session-backend");
    assert_eq!(outcome.message_chars, 5);
    assert_eq!(stream_result.expect("source stream"), "default");
}

#[test]
fn reply_source_runner_executes_provider_path() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyProviderCapabilities, RuntimeReplyProviderHandle,
        RuntimeReplyProviderIdentity,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(provider.clone()),
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(Some(&provider), std::iter::empty::<&str>())
        .expect("provider run");
    let source = RecordingReplySource;
    let (_, _, stream_result) = futures::executor::block_on(run_reply_source(source, run));

    assert_eq!(stream_result.expect("source stream"), "provider");
}

#[test]
fn provider_source_call_maps_current_payload_for_compat_boundary() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyProviderCapabilities, RuntimeReplyProviderHandle,
        RuntimeReplyProviderIdentity,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "openai".to_string(),
            provider_selector: None,
            model_name: "gpt-5.3-codex".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::Responses),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::Current,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-provider-call",
        RuntimeReplyInput::text("hello provider").into(),
        Some(provider.clone()),
        None,
    );
    let session_config = SessionConfigBuilder::new("session-provider-call").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(Some(&provider), std::iter::empty::<&str>())
        .expect("provider run");
    let (message, path, _stream_request, session_config, cancel_token, _emitted_any) =
        run.into_parts();
    let RuntimeReplyBackendRunPath::Provider(provider_start) = path else {
        panic!("expected provider path");
    };

    let call =
        RuntimeReplyProviderSourceCall::new(provider_start, message, session_config, cancel_token);
    assert_eq!(call.trace().provider_name, Some("openai"));

    let mapped = call.map(
        |message| message.concat_text(),
        |session_config| session_config.id,
    );
    let (provider_start, message_text, session_id, cancel_token) = mapped.into_parts();

    assert_eq!(provider_start.trace().session_id, "session-provider-call");
    assert_eq!(message_text, "hello provider");
    assert_eq!(session_id, "session-provider-call");
    assert!(cancel_token.is_none());
}

#[test]
fn default_source_call_maps_current_payload_for_compat_boundary() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-default-call",
        RuntimeReplyInput::text("hello default").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-default-call").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, std::iter::empty::<&str>())
        .expect("default run");
    let (message, path, _stream_request, session_config, cancel_token, _emitted_any) =
        run.into_parts();
    assert_eq!(path, RuntimeReplyBackendRunPath::Default);

    let call = RuntimeReplyDefaultSourceCall::new(message, session_config, cancel_token);
    let mapped = call.map(
        |message| message.concat_text(),
        |session_config| session_config.id,
    );
    let (message_text, session_id, cancel_token) = mapped.into_parts();

    assert_eq!(message_text, "hello default");
    assert_eq!(session_id, "session-default-call");
    assert!(cancel_token.is_none());
}

#[test]
fn source_call_maps_current_payload_for_compat_boundary() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-source-call",
        RuntimeReplyInput::text("hello source").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-source-call").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, false);
    let run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, std::iter::empty::<&str>())
        .expect("source run");
    let (message, path, _stream_request, session_config, cancel_token, _emitted_any) =
        run.into_parts();
    assert_eq!(path, RuntimeReplyBackendRunPath::Default);

    let call = RuntimeReplySourceCall::Default(RuntimeReplyDefaultSourceCall::new(
        message,
        session_config,
        cancel_token,
    ));
    let mapped = call.map(
        |message| message.concat_text(),
        |session_config| session_config.id,
    );

    match mapped {
        RuntimeReplySourceCall::Default(call) => {
            let (message_text, session_id, cancel_token) = call.into_parts();
            assert_eq!(message_text, "hello source");
            assert_eq!(session_id, "session-source-call");
            assert!(cancel_token.is_none());
        }
        RuntimeReplySourceCall::Provider(_) => panic!("expected default source call"),
    }
}

#[test]
fn backend_start_prepare_run_maps_wire_support_issue() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeProviderBackend, RuntimeReplyModelRequestPolicy, RuntimeReplyProviderCapabilities,
        RuntimeReplyProviderHandle, RuntimeReplyProviderIdentity,
        RuntimeReplyProviderWireSupportIssue, RuntimeReplyResponsesPolicy,
    };
    use model_provider::ModelProviderProtocol;

    let provider = RuntimeReplyProviderHandle {
        identity: RuntimeReplyProviderIdentity {
            provider_name: "custom-openai-compatible".to_string(),
            provider_selector: None,
            model_name: "gpt-compatible".to_string(),
            credential_uuid: "credential-1".to_string(),
            protocol: Some(ModelProviderProtocol::ChatCompletions),
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
        },
        backend: RuntimeProviderBackend::AsterCompat,
        capabilities: RuntimeReplyProviderCapabilities::default(),
    };
    let model_request_policy = RuntimeReplyModelRequestPolicy::new(
        Some(RuntimeReplyResponsesPolicy {
            use_responses_lite: true,
            request_mode: "responses_lite".to_string(),
            instructions_location: "input_prefix".to_string(),
            tools_location: "input_prefix".to_string(),
            reasoning_context: "all_turns".to_string(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        }),
        None,
        None,
    );
    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        Some(provider.clone()),
        model_request_policy,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let error = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(Some(&provider), std::iter::empty::<&str>())
        .expect_err("wire support issue");

    let issue = error
        .provider_wire_support_issue()
        .expect("wire support issue");
    assert_eq!(
        issue.provider_backend,
        Some(RuntimeProviderBackend::AsterCompat)
    );
    assert_eq!(
        error.into_start_error().message,
        RuntimeReplyProviderWireSupportIssue::MESSAGE
    );
}

#[test]
fn backend_run_outcome_finishes_successful_stream() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;
    use futures::stream;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, std::iter::empty::<&str>())
        .expect("default run");
    let outcome = backend_run.outcome();
    let stream: crate::reply_host::RuntimeReplyStream<'_, ()> = Box::pin(stream::empty());
    let (_stream, message_chars) = outcome
        .finish_stream::<(), anyhow::Error>(Ok(stream))
        .expect("successful stream");

    assert_eq!(message_chars, 5);
}

#[test]
fn backend_run_outcome_maps_source_error_to_start_error() {
    use crate::reply_input::RuntimeReplyInput;
    use crate::reply_request::RuntimeReplyRequest;
    use crate::session_config::SessionConfigBuilder;

    let request = RuntimeReplyRequest::from_attempt_input(
        "session-backend",
        RuntimeReplyInput::text("hello").into(),
        None,
        None,
    );
    let session_config = SessionConfigBuilder::new("session-backend").build();
    let start_request = RuntimeReplyStartRequest::new(request, session_config, None, true);
    let backend_run = RuntimeReplyBackendStart::from_start_request(start_request)
        .prepare_run(None, std::iter::empty::<&str>())
        .expect("default run");
    let error = match backend_run
        .outcome()
        .finish_stream::<(), _>(Err(anyhow::anyhow!("source backend failed")))
    {
        Ok(_) => panic!("source error should fail backend start"),
        Err(error) => error,
    };

    assert_eq!(error.message, "Agent error: source backend failed");
    assert!(error.emitted_any);
}
