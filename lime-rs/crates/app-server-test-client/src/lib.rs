use app_server_client::AppServerClient;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionStartParams;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ClientCapabilities;
use app_server_protocol::ClientInfo;
use app_server_protocol::InitializeParams;
use app_server_protocol::METHOD_AGENT_SESSION_UPDATE;

mod harness;

pub use harness::decode_exchange;
pub use harness::encode_exchange;
pub use harness::parse_cli_args;
pub use harness::run_session_facade_archive_failure_stdio_smoke;
pub use harness::run_session_facade_stdio_smoke;
pub use harness::run_stdio_smoke;
pub use harness::HarnessCommand;
pub use harness::SessionFacadeArchiveFailureStdioSmokeReport;
pub use harness::SessionFacadeStdioSmokeReport;
pub use harness::StdioLaunchConfig;
pub use harness::StdioSmokeReport;
pub use harness::TestClientCli;

pub const SESSION_FACADE_SAMPLE_SESSION_ID: &str = "sess_test_client_facade";
const SESSION_FACADE_SAMPLE_THREAD_ID: &str = "thread_test_client_facade";
const SESSION_FACADE_SAMPLE_APP_ID: &str = "content-studio";
const SESSION_FACADE_SAMPLE_WORKSPACE_ID: &str = "default";
const SESSION_FACADE_SAMPLE_UPDATED_TITLE: &str = "App Server Test Client Session";

pub fn sample_initialize_line(client_name: impl Into<String>) -> anyhow::Result<String> {
    let mut client = AppServerClient::new();
    let request = client.initialize(InitializeParams {
        client_info: ClientInfo {
            name: client_name.into(),
            title: None,
            version: None,
        },
        capabilities: ClientCapabilities::default(),
    })?;
    Ok(AppServerClient::encode_request(request)?)
}

pub fn sample_initialized_line() -> anyhow::Result<String> {
    Ok(AppServerClient::encode_notification(
        AppServerClient::new().initialized(),
    )?)
}

pub fn sample_capability_list_line(client: &mut AppServerClient) -> anyhow::Result<String> {
    let request = client.list_capabilities(CapabilityListParams::default())?;
    Ok(AppServerClient::encode_request(request)?)
}

pub fn sample_smoke_lines(client_name: impl Into<String>) -> anyhow::Result<Vec<String>> {
    let mut client = AppServerClient::new();
    let initialize = client.initialize(InitializeParams {
        client_info: ClientInfo {
            name: client_name.into(),
            title: None,
            version: None,
        },
        capabilities: ClientCapabilities::default(),
    })?;
    let capability_list = client.list_capabilities(CapabilityListParams::default())?;

    Ok(vec![
        AppServerClient::encode_request(initialize)?,
        AppServerClient::encode_notification(client.initialized())?,
        AppServerClient::encode_request(capability_list)?,
    ])
}

pub fn sample_session_facade_lines(client_name: impl Into<String>) -> anyhow::Result<Vec<String>> {
    let mut client = initialized_session_facade_client(client_name)?;
    let start = sample_session_start_request(&mut client)?;
    let list = client.list_sessions(AgentSessionListParams {
        include_archived: Some(true),
        archived_only: None,
        workspace_id: Some(SESSION_FACADE_SAMPLE_WORKSPACE_ID.to_string()),
        cwd: None,
        limit: Some(20),
    })?;
    let read = client.read_session(AgentSessionReadParams {
        session_id: SESSION_FACADE_SAMPLE_SESSION_ID.to_string(),
        history_limit: Some(50),
        history_offset: None,
        history_before_message_id: None,
    })?;
    let archive = sample_session_update_request(&mut client, Some(true), None)?;
    let unarchive = sample_session_update_request(
        &mut client,
        Some(false),
        Some(SESSION_FACADE_SAMPLE_UPDATED_TITLE),
    )?;

    Ok(vec![
        AppServerClient::encode_request(client.initialize_request)?,
        AppServerClient::encode_notification(client.initialized_notification)?,
        AppServerClient::encode_request(start)?,
        AppServerClient::encode_request(list)?,
        AppServerClient::encode_request(read)?,
        AppServerClient::encode_request(archive)?,
        AppServerClient::encode_request(unarchive)?,
    ])
}

pub fn sample_session_facade_stdio_lines(
    client_name: impl Into<String>,
) -> anyhow::Result<Vec<String>> {
    let mut client = initialized_session_facade_client(client_name)?;
    let start = sample_session_start_request(&mut client)?;
    let list = client.list_sessions(AgentSessionListParams {
        include_archived: Some(true),
        archived_only: None,
        workspace_id: Some(SESSION_FACADE_SAMPLE_WORKSPACE_ID.to_string()),
        cwd: None,
        limit: Some(20),
    })?;
    let read = client.read_session(AgentSessionReadParams {
        session_id: SESSION_FACADE_SAMPLE_SESSION_ID.to_string(),
        history_limit: Some(50),
        history_offset: None,
        history_before_message_id: None,
    })?;
    let update = sample_session_update_request(
        &mut client,
        Some(false),
        Some(SESSION_FACADE_SAMPLE_UPDATED_TITLE),
    )?;

    Ok(vec![
        AppServerClient::encode_request(client.initialize_request)?,
        AppServerClient::encode_notification(client.initialized_notification)?,
        AppServerClient::encode_request(start)?,
        AppServerClient::encode_request(list)?,
        AppServerClient::encode_request(read)?,
        AppServerClient::encode_request(update)?,
    ])
}

pub fn sample_session_facade_archive_failure_stdio_lines(
    client_name: impl Into<String>,
) -> anyhow::Result<Vec<String>> {
    let mut client = initialized_session_facade_client(client_name)?;
    let start = sample_session_start_request(&mut client)?;
    let archive = sample_session_update_request(&mut client, Some(true), None)?;

    Ok(vec![
        AppServerClient::encode_request(client.initialize_request)?,
        AppServerClient::encode_notification(client.initialized_notification)?,
        AppServerClient::encode_request(start)?,
        AppServerClient::encode_request(archive)?,
    ])
}

struct InitializedSessionFacadeClient {
    client: AppServerClient,
    initialize_request: app_server_protocol::JsonRpcRequest,
    initialized_notification: app_server_protocol::JsonRpcNotification,
}

impl std::ops::Deref for InitializedSessionFacadeClient {
    type Target = AppServerClient;

    fn deref(&self) -> &Self::Target {
        &self.client
    }
}

impl std::ops::DerefMut for InitializedSessionFacadeClient {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.client
    }
}

fn initialized_session_facade_client(
    client_name: impl Into<String>,
) -> anyhow::Result<InitializedSessionFacadeClient> {
    let mut client = AppServerClient::new();
    let initialize_request = client.initialize(InitializeParams {
        client_info: ClientInfo {
            name: client_name.into(),
            title: None,
            version: None,
        },
        capabilities: ClientCapabilities::default(),
    })?;
    let initialized_notification = client.initialized();

    Ok(InitializedSessionFacadeClient {
        client,
        initialize_request,
        initialized_notification,
    })
}

fn sample_session_start_request(
    client: &mut AppServerClient,
) -> Result<app_server_protocol::JsonRpcRequest, app_server_client::ClientError> {
    client.start_session(AgentSessionStartParams {
        session_id: Some(SESSION_FACADE_SAMPLE_SESSION_ID.to_string()),
        thread_id: Some(SESSION_FACADE_SAMPLE_THREAD_ID.to_string()),
        app_id: SESSION_FACADE_SAMPLE_APP_ID.to_string(),
        workspace_id: Some(SESSION_FACADE_SAMPLE_WORKSPACE_ID.to_string()),
        business_object_ref: None,
        locale: None,
    })
}

fn sample_session_update_request(
    client: &mut AppServerClient,
    archived: Option<bool>,
    title: Option<&str>,
) -> Result<app_server_protocol::JsonRpcRequest, app_server_client::ClientError> {
    client.request(
        METHOD_AGENT_SESSION_UPDATE,
        AgentSessionUpdateParams {
            session_id: SESSION_FACADE_SAMPLE_SESSION_ID.to_string(),
            title: title.map(str::to_string),
            archived,
            provider_selector: None,
            provider_name: None,
            model_name: None,
            execution_strategy: None,
            recent_access_mode: None,
            recent_preferences: None,
            recent_team_selection: None,
            product_workspace_selected_object_ref: None,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sample_initialize_line_is_jsonl() {
        let line = sample_initialize_line("fixture").expect("line");

        assert!(line.contains("\"method\":\"initialize\""));
        assert!(line.ends_with('\n'));
    }

    #[test]
    fn initialized_line_is_jsonl_notification() {
        let line = sample_initialized_line().expect("line");

        assert!(line.contains("\"method\":\"initialized\""));
        assert!(line.ends_with('\n'));
    }

    #[test]
    fn smoke_lines_keep_request_id_sequence_and_initialized_notification() {
        let lines = sample_smoke_lines("fixture").expect("lines");

        assert_eq!(lines.len(), 3);
        assert!(lines[0].contains("\"id\":1"));
        assert!(lines[0].contains("\"method\":\"initialize\""));
        assert!(lines[1].contains("\"method\":\"initialized\""));
        assert!(!lines[1].contains("\"id\""));
        assert!(lines[2].contains("\"id\":2"));
        assert!(lines[2].contains("\"method\":\"capability/list\""));
    }

    #[test]
    fn session_facade_lines_cover_current_session_shape() {
        let lines = sample_session_facade_lines("fixture").expect("lines");

        assert_eq!(lines.len(), 7);
        assert!(lines[0].contains("\"id\":1"));
        assert!(lines[0].contains("\"method\":\"initialize\""));
        assert!(lines[1].contains("\"method\":\"initialized\""));
        assert!(!lines[1].contains("\"id\""));
        assert!(lines[2].contains("\"id\":2"));
        assert!(lines[2].contains("\"method\":\"agentSession/start\""));
        assert!(lines[2].contains("\"sessionId\":\"sess_test_client_facade\""));
        assert!(lines[3].contains("\"id\":3"));
        assert!(lines[3].contains("\"method\":\"agentSession/list\""));
        assert!(lines[3].contains("\"includeArchived\":true"));
        assert!(lines[4].contains("\"id\":4"));
        assert!(lines[4].contains("\"method\":\"agentSession/read\""));
        assert!(lines[5].contains("\"id\":5"));
        assert!(lines[5].contains("\"method\":\"agentSession/update\""));
        assert!(lines[5].contains("\"archived\":true"));
        assert!(lines[6].contains("\"id\":6"));
        assert!(lines[6].contains("\"method\":\"agentSession/update\""));
        assert!(lines[6].contains("\"archived\":false"));
    }

    #[test]
    fn session_facade_stdio_lines_skip_archiving_memory_sessions() {
        let lines = sample_session_facade_stdio_lines("fixture").expect("lines");

        assert_eq!(lines.len(), 6);
        assert!(lines[2].contains("\"method\":\"agentSession/start\""));
        assert!(lines[3].contains("\"method\":\"agentSession/list\""));
        assert!(lines[4].contains("\"method\":\"agentSession/read\""));
        assert!(lines[5].contains("\"method\":\"agentSession/update\""));
        assert!(lines[5].contains("\"archived\":false"));
        assert!(!lines[5].contains("\"archived\":true"));
    }

    #[test]
    fn session_facade_archive_failure_stdio_lines_cover_memory_archive_gap() {
        let lines = sample_session_facade_archive_failure_stdio_lines("fixture").expect("lines");

        assert_eq!(lines.len(), 4);
        assert!(lines[0].contains("\"id\":1"));
        assert!(lines[0].contains("\"method\":\"initialize\""));
        assert!(lines[1].contains("\"method\":\"initialized\""));
        assert!(!lines[1].contains("\"id\""));
        assert!(lines[2].contains("\"id\":2"));
        assert!(lines[2].contains("\"method\":\"agentSession/start\""));
        assert!(lines[3].contains("\"id\":3"));
        assert!(lines[3].contains("\"method\":\"agentSession/update\""));
        assert!(lines[3].contains("\"archived\":true"));
    }
}
