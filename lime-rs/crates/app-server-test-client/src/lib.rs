use app_server_client::AppServerClient;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ClientCapabilities;
use app_server_protocol::ClientInfo;
use app_server_protocol::InitializeParams;

mod harness;

pub use harness::decode_exchange;
pub use harness::encode_exchange;
pub use harness::parse_cli_args;
pub use harness::run_stdio_smoke;
pub use harness::HarnessCommand;
pub use harness::StdioLaunchConfig;
pub use harness::StdioSmokeReport;
pub use harness::TestClientCli;

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
}
