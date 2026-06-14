use app_server::capability_source_from_app_policy_json;
use app_server::run_stdio;
use app_server::AppDataSource;
use app_server::AppServer;
use app_server::AppServerBackendMode;
use app_server::AppServerRuntimeFactory;
use app_server::ExternalBackendConfig;
use app_server::FilesystemFileCheckpointSnapshotStore;
use app_server::FilesystemOutputSnapshotStore;
use app_server::LocalAppDataSource;
use app_server::DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS;
use app_server_transport::DEFAULT_LISTEN_URL;
use lime_core::database;
use lime_core::database::DbConnection;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::Arc;

const APP_SERVER_DATA_DIR_ENV: &str = "APP_SERVER_DATA_DIR";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = parse_args()?;
    if config.listen != DEFAULT_LISTEN_URL {
        anyhow::bail!("unsupported listen URL: {}", config.listen);
    }

    run_stdio(build_app_server(&config).await?).await?;

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CliConfig {
    listen: String,
    backend_mode: AppServerBackendMode,
    app_policy_path: Option<String>,
    backend_command: Option<String>,
    backend_args: Vec<String>,
    backend_timeout_ms: u64,
    data_dir: Option<PathBuf>,
}

impl CliConfig {
    fn external_backend_config(&self) -> anyhow::Result<ExternalBackendConfig> {
        let command = self.backend_command.as_ref().ok_or_else(|| {
            anyhow::anyhow!("--backend-command is required when --backend external")
        })?;
        Ok(ExternalBackendConfig::new(command.clone())
            .with_args(self.backend_args.clone())
            .with_timeout_ms(self.backend_timeout_ms))
    }
}

fn parse_args() -> anyhow::Result<CliConfig> {
    parse_args_from_with_data_dir_env(
        std::env::args().skip(1),
        std::env::var_os(APP_SERVER_DATA_DIR_ENV),
    )
}

async fn build_app_server(config: &CliConfig) -> anyhow::Result<AppServer> {
    let db = initialize_database(config)?;
    let app_data_source: Arc<dyn AppDataSource> = Arc::new(
        LocalAppDataSource::initialize_with_db(db.clone())
            .await
            .map_err(|error| {
                anyhow::anyhow!("failed to initialize local app data source: {error}")
            })?,
    );
    let capability_source = config
        .app_policy_path
        .as_deref()
        .map(load_app_policy_source)
        .transpose()?
        .map(Arc::new);

    let runtime = match (config.backend_mode, capability_source) {
        (AppServerBackendMode::External, Some(capability_source)) => {
            AppServerRuntimeFactory::external_runtime_core_with_capability_source(
                config.external_backend_config()?,
                capability_source,
            )
        }
        (AppServerBackendMode::External, None) => {
            AppServerRuntimeFactory::external_runtime_core(config.external_backend_config()?)
        }
        (AppServerBackendMode::Runtime, Some(capability_source)) => {
            AppServerRuntimeFactory::runtime_backend_core_with_db_and_capability_source(
                db,
                capability_source,
            )
        }
        (AppServerBackendMode::Runtime, None) => {
            AppServerRuntimeFactory::runtime_backend_core_with_db(db)
        }
        (AppServerBackendMode::Mock, Some(capability_source)) => {
            AppServerRuntimeFactory::mock_runtime_core_with_capability_source(capability_source)
        }
        (AppServerBackendMode::Mock, None) => AppServerRuntimeFactory::mock_runtime_core(),
        (AppServerBackendMode::Unavailable, Some(capability_source)) => {
            AppServerRuntimeFactory::unavailable_runtime_core_with_capability_source(
                capability_source,
            )
        }
        (AppServerBackendMode::Unavailable, None) => {
            AppServerRuntimeFactory::unavailable_runtime_core()
        }
    }
    .with_file_checkpoint_snapshot_store(Arc::new(FilesystemFileCheckpointSnapshotStore::new()))
    .with_output_snapshot_store(Arc::new(FilesystemOutputSnapshotStore::new()))
    .with_app_data_source(app_data_source);

    Ok(AppServer::with_runtime(runtime))
}

fn initialize_database(config: &CliConfig) -> anyhow::Result<DbConnection> {
    match config.data_dir.as_ref() {
        Some(data_dir) => database::init_database_with_data_dir(data_dir).map_err(|error| {
            anyhow::anyhow!(
                "failed to initialize app-server database at {}: {error}",
                data_dir.display()
            )
        }),
        None => database::init_database()
            .map_err(|error| anyhow::anyhow!("failed to initialize app-server database: {error}")),
    }
}

#[cfg(test)]
fn parse_args_from(args: impl IntoIterator<Item = String>) -> anyhow::Result<CliConfig> {
    parse_args_from_with_data_dir_env(args, None)
}

fn parse_args_from_with_data_dir_env(
    args: impl IntoIterator<Item = String>,
    data_dir_env: Option<OsString>,
) -> anyhow::Result<CliConfig> {
    let mut args = args.into_iter();
    let mut listen = DEFAULT_LISTEN_URL.to_string();
    let mut backend_mode = AppServerBackendMode::Unavailable;
    let mut app_policy_path = None;
    let mut backend_command = None;
    let mut backend_args = Vec::new();
    let mut backend_timeout_ms = DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS;
    let mut data_dir = data_dir_env
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);

    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--data-dir=") {
            if value.is_empty() {
                anyhow::bail!("--data-dir requires a path");
            }
            data_dir = Some(PathBuf::from(value));
            continue;
        }

        match arg.as_str() {
            "--stdio" => listen = DEFAULT_LISTEN_URL.to_string(),
            "--listen" => {
                listen = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--listen requires a URL"))?;
            }
            "--backend" => {
                let value = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--backend requires a value"))?;
                backend_mode = AppServerBackendMode::parse(&value)?;
            }
            "--backend-command" => {
                backend_command = Some(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--backend-command requires a path"))?,
                );
            }
            "--backend-arg" => {
                backend_args.push(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--backend-arg requires a value"))?,
                );
            }
            "--backend-timeout-ms" => {
                let value = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--backend-timeout-ms requires a value"))?;
                backend_timeout_ms = value
                    .parse::<u64>()
                    .map_err(|error| anyhow::anyhow!("invalid --backend-timeout-ms: {error}"))?;
            }
            "--app-policy" => {
                app_policy_path = Some(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("--app-policy requires a path"))?,
                );
            }
            "--data-dir" => {
                data_dir =
                    Some(PathBuf::from(args.next().ok_or_else(|| {
                        anyhow::anyhow!("--data-dir requires a path")
                    })?));
            }
            "--help" | "-h" => {
                println!(
                    "Usage: app-server [--stdio] [--listen stdio://] [--backend external|runtime|mock|unavailable] [--backend-command path] [--backend-arg value] [--backend-timeout-ms ms] [--app-policy path] [--data-dir path]"
                );
                std::process::exit(0);
            }
            other => anyhow::bail!("unknown argument: {other}"),
        }
    }

    Ok(CliConfig {
        listen,
        backend_mode,
        app_policy_path,
        backend_command,
        backend_args,
        backend_timeout_ms,
        data_dir,
    })
}

fn load_app_policy_source(path: &str) -> anyhow::Result<app_server::CapabilityInventorySource> {
    let json = std::fs::read_to_string(path)
        .map_err(|error| anyhow::anyhow!("failed to read app policy {path}: {error}"))?;
    capability_source_from_app_policy_json(&json)
        .map_err(|error| anyhow::anyhow!("failed to load app policy {path}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_args_defaults_to_stdio_unavailable_backend() {
        let config = parse_args_from(Vec::new()).expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::Unavailable);
        assert_eq!(config.app_policy_path, None);
        assert_eq!(config.backend_command, None);
        assert!(config.backend_args.is_empty());
        assert_eq!(
            config.backend_timeout_ms,
            DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS
        );
        assert_eq!(config.data_dir, None);
    }

    #[test]
    fn parse_args_accepts_explicit_mock_backend() {
        let config =
            parse_args_from(["--stdio", "--backend", "mock"].map(str::to_string)).expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::Mock);
        assert_eq!(config.app_policy_path, None);
        assert_eq!(config.backend_command, None);
        assert!(config.backend_args.is_empty());
    }

    #[test]
    fn parse_args_accepts_explicit_unavailable_backend() {
        let config = parse_args_from(["--stdio", "--backend", "unavailable"].map(str::to_string))
            .expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::Unavailable);
        assert_eq!(config.app_policy_path, None);
        assert_eq!(config.backend_command, None);
        assert!(config.backend_args.is_empty());
    }

    #[test]
    fn parse_args_accepts_explicit_runtime_backend() {
        let config = parse_args_from(["--stdio", "--backend", "runtime"].map(str::to_string))
            .expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::Runtime);
        assert_eq!(config.app_policy_path, None);
        assert_eq!(config.backend_command, None);
        assert!(config.backend_args.is_empty());
    }

    #[test]
    fn parse_args_accepts_data_dir() {
        let config = parse_args_from(
            ["--stdio", "--data-dir", "/tmp/platform-app-server"].map(str::to_string),
        )
        .expect("config");

        assert_eq!(
            config.data_dir,
            Some(PathBuf::from("/tmp/platform-app-server"))
        );
    }

    #[test]
    fn parse_args_accepts_data_dir_equals_form() {
        let config = parse_args_from(["--data-dir=/tmp/platform-app-server"].map(str::to_string))
            .expect("config");

        assert_eq!(
            config.data_dir,
            Some(PathBuf::from("/tmp/platform-app-server"))
        );
    }

    #[test]
    fn parse_args_data_dir_cli_wins_over_env() {
        let config = parse_args_from_with_data_dir_env(
            ["--data-dir", "/tmp/cli-app-server"].map(str::to_string),
            Some(OsString::from("/tmp/env-app-server")),
        )
        .expect("config");

        assert_eq!(config.data_dir, Some(PathBuf::from("/tmp/cli-app-server")));
    }

    #[test]
    fn parse_args_accepts_data_dir_env_fallback() {
        let config = parse_args_from_with_data_dir_env(
            Vec::new(),
            Some(OsString::from("/tmp/env-app-server")),
        )
        .expect("config");

        assert_eq!(config.data_dir, Some(PathBuf::from("/tmp/env-app-server")));
    }

    #[test]
    fn initialize_database_uses_configured_data_dir() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let data_dir = temp_dir.path().join("desktop-platform").join("app-server");
        let config = CliConfig {
            listen: DEFAULT_LISTEN_URL.to_string(),
            backend_mode: AppServerBackendMode::Unavailable,
            app_policy_path: None,
            backend_command: None,
            backend_args: Vec::new(),
            backend_timeout_ms: DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS,
            data_dir: Some(data_dir.clone()),
        };

        let db = initialize_database(&config).expect("initialize database");
        drop(db);

        assert!(data_dir.join("lime.db").is_file());
    }

    #[test]
    fn parse_args_accepts_external_backend_command() {
        let config = parse_args_from(
            [
                "--stdio",
                "--backend",
                "external",
                "--backend-command",
                "/tmp/agent-backend",
                "--backend-arg",
                "--profile",
                "--backend-arg",
                "content",
                "--backend-timeout-ms",
                "1234",
            ]
            .map(str::to_string),
        )
        .expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::External);
        assert_eq!(
            config.backend_command.as_deref(),
            Some("/tmp/agent-backend")
        );
        assert_eq!(
            config.backend_args,
            vec!["--profile".to_string(), "content".to_string()]
        );
        assert_eq!(config.backend_timeout_ms, 1234);

        let backend_config = config.external_backend_config().expect("backend config");
        assert_eq!(backend_config.command, "/tmp/agent-backend");
        assert_eq!(
            backend_config.args,
            vec!["--profile".to_string(), "content".to_string()]
        );
        assert_eq!(backend_config.timeout_ms, 1234);
    }

    #[test]
    fn external_backend_requires_command() {
        let config =
            parse_args_from(["--backend", "external"].map(str::to_string)).expect("config");
        let error = config.external_backend_config().expect_err("error");

        assert!(error
            .to_string()
            .contains("--backend-command is required when --backend external"));
    }

    #[test]
    fn parse_args_accepts_app_policy_path() {
        let config = parse_args_from(
            ["--stdio", "--app-policy", "/tmp/content-studio.policy.json"].map(str::to_string),
        )
        .expect("config");

        assert_eq!(config.listen, DEFAULT_LISTEN_URL);
        assert_eq!(config.backend_mode, AppServerBackendMode::Unavailable);
        assert_eq!(
            config.app_policy_path.as_deref(),
            Some("/tmp/content-studio.policy.json")
        );
    }

    #[test]
    fn load_app_policy_source_reads_scoped_capabilities() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let policy_path = temp_dir.path().join("app-policy.json");
        std::fs::write(
            &policy_path,
            r#"{
              "capabilities": [
                {
                  "id": "content.draft.generate",
                  "title": "Generate Draft",
                  "methods": ["agentSession/turn/start"],
                  "appIds": ["content-studio"]
                }
              ]
            }"#,
        )
        .expect("write policy");

        let source = load_app_policy_source(policy_path.to_str().expect("policy path"))
            .expect("policy source");
        let capabilities = app_server::CapabilitySource::list_capabilities(
            &source,
            &app_server::CapabilityListContext {
                app_id: Some("content-studio".to_string()),
                workspace_id: None,
                session_id: None,
            },
        );

        assert_eq!(capabilities.len(), 1);
        assert_eq!(capabilities[0].id, "content.draft.generate");
    }

    #[test]
    fn parse_args_rejects_aster_backend_for_standalone_binary() {
        let error = parse_args_from(["--backend", "aster"].map(str::to_string)).expect_err("error");

        assert!(error
            .to_string()
            .contains("unsupported app-server backend mode: aster"));
    }
}
