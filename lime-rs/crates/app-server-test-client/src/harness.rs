use app_server_protocol::JsonRpcMessage;
use app_server_protocol::RequestId;
use app_server_transport::decode_message;
use app_server_transport::encode_message;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Write;
use std::path::PathBuf;
use std::process::Child;
use std::process::{Command, Stdio};
use std::time::Duration;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HarnessCommand {
    InitializeLine {
        client_name: String,
    },
    InitializedLine,
    CapabilityListLine,
    SmokeLines {
        client_name: String,
    },
    LaunchStdio {
        app_server_bin: PathBuf,
        extra_args: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestClientCli {
    pub command: HarnessCommand,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StdioLaunchConfig {
    pub app_server_bin: PathBuf,
    pub extra_args: Vec<String>,
}

impl StdioLaunchConfig {
    pub fn new(app_server_bin: impl Into<PathBuf>) -> Self {
        Self {
            app_server_bin: app_server_bin.into(),
            extra_args: Vec::new(),
        }
    }

    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.app_server_bin);
        command
            .arg("--stdio")
            .args(&self.extra_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    pub fn args(&self) -> Vec<String> {
        let mut args = vec!["--stdio".to_string()];
        args.extend(self.extra_args.clone());
        args
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StdioSmokeReport {
    pub app_server_bin: PathBuf,
    pub initialize_response_id: RequestId,
    pub capability_list_response_id: RequestId,
    pub capability_count: usize,
}

impl StdioSmokeReport {
    pub fn summary_line(&self) -> String {
        format!(
            "[app-server-test-client] ok appServerBin={} initializeResponseId={} capabilityListResponseId={} capabilities={}",
            self.app_server_bin.display(),
            self.initialize_response_id,
            self.capability_list_response_id,
            self.capability_count
        )
    }
}

pub fn parse_cli_args(args: impl IntoIterator<Item = String>) -> TestClientCli {
    let mut args = args.into_iter();
    let command = args.next();
    let command = match command.as_deref() {
        None => HarnessCommand::InitializeLine {
            client_name: "app-server-test-client".to_string(),
        },
        Some("initialize-line") => HarnessCommand::InitializeLine {
            client_name: args
                .next()
                .unwrap_or_else(|| "app-server-test-client".to_string()),
        },
        Some("initialized-line") => HarnessCommand::InitializedLine,
        Some("capability-list-line") => HarnessCommand::CapabilityListLine,
        Some("smoke-lines") => HarnessCommand::SmokeLines {
            client_name: args
                .next()
                .unwrap_or_else(|| "app-server-test-client".to_string()),
        },
        Some("launch-stdio") => {
            let app_server_bin = args
                .next()
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("app-server"));
            let extra_args = args.collect::<Vec<_>>();
            HarnessCommand::LaunchStdio {
                app_server_bin,
                extra_args,
            }
        }
        Some(client_name) => HarnessCommand::InitializeLine {
            client_name: client_name.to_string(),
        },
    };
    TestClientCli { command }
}

pub fn encode_exchange(messages: &[JsonRpcMessage]) -> Result<Vec<String>, String> {
    messages
        .iter()
        .map(|message| encode_message(message).map_err(|error| error.to_string()))
        .collect()
}

pub fn decode_exchange(lines: &[String]) -> Result<Vec<JsonRpcMessage>, String> {
    lines
        .iter()
        .map(|line| decode_message(line).map_err(|error| error.to_string()))
        .collect()
}

pub fn run_stdio_smoke(
    config: StdioLaunchConfig,
    input_lines: &[String],
) -> Result<StdioSmokeReport, String> {
    let mut child = config
        .command()
        .spawn()
        .map_err(|error| format!("failed to spawn app-server stdio process: {error}"))?;
    let result = run_stdio_smoke_with_child(&mut child, &config, input_lines);
    cleanup_child(&mut child);
    result
}

fn run_stdio_smoke_with_child(
    child: &mut Child,
    config: &StdioLaunchConfig,
    input_lines: &[String],
) -> Result<StdioSmokeReport, String> {
    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "app-server stdio stdin is not available".to_string())?;
        for line in input_lines {
            stdin
                .write_all(line.as_bytes())
                .map_err(|error| format!("failed to write app-server stdio request: {error}"))?;
        }
        stdin
            .flush()
            .map_err(|error| format!("failed to flush app-server stdio request: {error}"))?;
    }

    let (initialize, capability_list) = {
        let stdout = child
            .stdout
            .as_mut()
            .ok_or_else(|| "app-server stdio stdout is not available".to_string())?;
        let mut stdout = BufReader::new(stdout);
        (
            read_response(&mut stdout, RequestId::Integer(1))?,
            read_response(&mut stdout, RequestId::Integer(2))?,
        )
    };
    let capability_count = capability_list
        .result
        .get("capabilities")
        .and_then(|value| value.as_array())
        .map_or(0, Vec::len);

    drop(child.stdin.take());
    wait_for_exit(child, Duration::from_secs(2))?;

    Ok(StdioSmokeReport {
        app_server_bin: config.app_server_bin.clone(),
        initialize_response_id: initialize.id,
        capability_list_response_id: capability_list.id,
        capability_count,
    })
}

fn read_response(
    stdout: &mut impl BufRead,
    expected_id: RequestId,
) -> Result<app_server_protocol::JsonRpcResponse, String> {
    let mut line = String::new();
    stdout
        .read_line(&mut line)
        .map_err(|error| format!("failed to read app-server stdio response: {error}"))?;
    if line.is_empty() {
        return Err("app-server stdio closed before expected response".to_string());
    }
    match decode_message(&line).map_err(|error| format!("failed to decode response: {error}"))? {
        JsonRpcMessage::Response(response) if response.id == expected_id => Ok(response),
        JsonRpcMessage::Response(response) => Err(format!(
            "unexpected response id: expected {expected_id}, got {}",
            response.id
        )),
        JsonRpcMessage::Error(error) => Err(format!(
            "app-server returned error for request {}: {}",
            error.id, error.error.message
        )),
        other => Err(format!("expected JSON-RPC response, got {other:?}")),
    }
}

fn wait_for_exit(child: &mut Child, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        match child
            .try_wait()
            .map_err(|error| format!("failed to poll app-server process: {error}"))?
        {
            Some(status) if status.success() => return Ok(()),
            Some(status) => {
                return Err(format!("app-server process exited with status {status}"));
            }
            None if Instant::now() >= deadline => {
                return Err("app-server process did not exit after stdin closed".to_string());
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    }
}

fn cleanup_child(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
    }
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::JsonRpcNotification;
    use app_server_protocol::JsonRpcRequest;
    use app_server_protocol::RequestId;

    #[test]
    fn parses_codex_style_cli_subcommands_without_business_commands() {
        assert_eq!(
            parse_cli_args(vec!["smoke-lines".to_string(), "fixture".to_string()]),
            TestClientCli {
                command: HarnessCommand::SmokeLines {
                    client_name: "fixture".to_string()
                }
            }
        );
        assert_eq!(
            parse_cli_args(vec![
                "launch-stdio".to_string(),
                "/bin/app-server".to_string()
            ]),
            TestClientCli {
                command: HarnessCommand::LaunchStdio {
                    app_server_bin: PathBuf::from("/bin/app-server"),
                    extra_args: Vec::new()
                }
            }
        );
        assert_eq!(
            parse_cli_args(vec![
                "launch-stdio".to_string(),
                "/bin/app-server".to_string(),
                "--backend".to_string(),
                "mock".to_string(),
            ]),
            TestClientCli {
                command: HarnessCommand::LaunchStdio {
                    app_server_bin: PathBuf::from("/bin/app-server"),
                    extra_args: vec!["--backend".to_string(), "mock".to_string()]
                }
            }
        );
        assert_eq!(
            parse_cli_args(vec!["legacy-client".to_string()]),
            TestClientCli {
                command: HarnessCommand::InitializeLine {
                    client_name: "legacy-client".to_string()
                }
            }
        );
    }

    #[test]
    fn stdio_launch_config_builds_codex_style_stdio_command() {
        let config = StdioLaunchConfig {
            app_server_bin: PathBuf::from("/bin/app-server"),
            extra_args: vec!["--backend".to_string(), "unavailable".to_string()],
        };

        assert_eq!(
            config.args(),
            vec!["--stdio", "--backend", "unavailable"]
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn exchange_helpers_round_trip_jsonl_messages() {
        let messages = vec![
            JsonRpcMessage::Request(JsonRpcRequest::new(
                RequestId::Integer(1),
                app_server_protocol::METHOD_INITIALIZE,
                None,
            )),
            JsonRpcMessage::Notification(JsonRpcNotification::new(
                app_server_protocol::METHOD_INITIALIZED,
                None,
            )),
        ];
        let lines = encode_exchange(&messages).expect("encode");

        assert_eq!(decode_exchange(&lines).expect("decode"), messages);
    }

    #[test]
    fn stdio_smoke_report_summary_is_stable() {
        let report = StdioSmokeReport {
            app_server_bin: PathBuf::from("/bin/app-server"),
            initialize_response_id: RequestId::Integer(1),
            capability_list_response_id: RequestId::Integer(2),
            capability_count: 4,
        };

        assert_eq!(
            report.summary_line(),
            "[app-server-test-client] ok appServerBin=/bin/app-server initializeResponseId=1 capabilityListResponseId=2 capabilities=4"
        );
    }
}
