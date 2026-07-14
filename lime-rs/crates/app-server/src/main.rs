use app_server::capability_source_from_app_policy_json;
use app_server::init_app_server_otel_from_env;
use app_server::run_stdio;
use app_server::AppDataSource;
use app_server::AppServer;
use app_server::AppServerBackendMode;
use app_server::AppServerRuntimeFactory;
use app_server::EventLogWriter;
use app_server::ExternalBackendConfig;
use app_server::FilesystemFileCheckpointSnapshotStore;
use app_server::FilesystemOutputSnapshotStore;
use app_server::LocalAppDataSource;
use app_server::ProjectionStore;
use app_server::SidecarStore;
use app_server::StorageRoots;
use app_server::TraceEventWriter;
use app_server::DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS;
use app_server_transport::DEFAULT_LISTEN_URL;
use lime_core::app_paths;
use lime_core::database;
use lime_core::database::DbConnection;
use lime_core::product_db_migration_cleanup::{
    cleanup_migrated_product_db_source, ProductDbMigrationCleanupPolicy,
};
use lime_infra::telemetry::TelemetryStore;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::Arc;

const APP_SERVER_DATA_DIR_ENV: &str = "APP_SERVER_DATA_DIR";
const PRODUCT_DB_MIGRATION_CLEANUP_ENV: &str = "APP_SERVER_PRODUCT_DB_MIGRATION_CLEANUP";

struct InitializedDatabase {
    db: DbConnection,
    storage_roots: Option<StorageRoots>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = parse_args()?;
    if config.listen != DEFAULT_LISTEN_URL {
        anyhow::bail!("unsupported listen URL: {}", config.listen);
    }

    let _otel_guard = init_app_server_otel_from_env()?;
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
    product_db_migration_cleanup_policy: ProductDbMigrationCleanupPolicy,
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
    parse_args_from_with_env(
        std::env::args().skip(1),
        std::env::var_os(APP_SERVER_DATA_DIR_ENV),
        std::env::var_os(PRODUCT_DB_MIGRATION_CLEANUP_ENV),
    )
}

async fn build_app_server(config: &CliConfig) -> anyhow::Result<AppServer> {
    let initialized = initialize_database(config)?;
    let db = initialized.db;
    let sidecar_store = initialized
        .storage_roots
        .as_ref()
        .map(|storage_roots| {
            SidecarStore::new(&storage_roots.sidecar_root)
                .map(Arc::new)
                .map_err(|error| anyhow::anyhow!("failed to initialize sidecar store: {error}"))
        })
        .transpose()?;
    let _image_task_worker_scheduler =
        app_server::spawn_image_task_worker_scheduler(db.clone(), sidecar_store.clone());
    let data_root = initialized
        .storage_roots
        .as_ref()
        .map(|storage_roots| storage_roots.data_root.clone());
    let mut app_data_source = match data_root {
        Some(data_root) => {
            LocalAppDataSource::initialize_with_db_and_data_root(db.clone(), data_root).await
        }
        None => LocalAppDataSource::initialize_with_db(db.clone()).await,
    }
    .map_err(|error| anyhow::anyhow!("failed to initialize local app data source: {error}"))?;
    if let Some(sidecar_store) = sidecar_store.clone() {
        app_data_source = app_data_source.with_sidecar_store(sidecar_store);
    }
    let mcp_elicitation_router = app_data_source.mcp_elicitation_router();
    let app_data_source: Arc<dyn AppDataSource> = Arc::new(app_data_source);
    let capability_source = config
        .app_policy_path
        .as_deref()
        .map(load_app_policy_source)
        .transpose()?
        .map(Arc::new);

    let mut runtime = match (config.backend_mode, capability_source) {
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
    .with_app_data_source(app_data_source);
    if let Some(storage_roots) = initialized.storage_roots {
        runtime = runtime
            .with_file_checkpoint_snapshot_store(Arc::new(
                FilesystemFileCheckpointSnapshotStore::with_sidecar_root(
                    &storage_roots.sidecar_root,
                ),
            ))
            .with_output_snapshot_store(Arc::new(
                FilesystemOutputSnapshotStore::with_sidecar_root(&storage_roots.sidecar_root),
            ));
        if let Some(sidecar_store) = sidecar_store.clone() {
            runtime = runtime.with_sidecar_store(sidecar_store);
        }
        let event_log_writer = EventLogWriter::new(&storage_roots.event_log_root)
            .map_err(|error| anyhow::anyhow!("failed to initialize event log writer: {error}"))?;
        let trace_event_writer = TraceEventWriter::new(&storage_roots.trace_log_root)
            .map_err(|error| anyhow::anyhow!("failed to initialize trace event writer: {error}"))?;
        let projection_store = ProjectionStore::initialize(&storage_roots.projection_db_path)
            .map_err(|error| anyhow::anyhow!("failed to initialize projection store: {error}"))?;
        let telemetry_store = TelemetryStore::initialize(&storage_roots.telemetry_db_path)
            .map_err(|error| anyhow::anyhow!("failed to initialize telemetry store: {error}"))?;
        runtime = runtime
            .with_event_log_writer(Arc::new(event_log_writer))
            .with_trace_event_writer(Arc::new(trace_event_writer))
            .with_projection_store(Arc::new(projection_store))
            .with_telemetry_store(Arc::new(telemetry_store));
    }

    AppServer::with_runtime(runtime)
        .with_mcp_elicitation_router(mcp_elicitation_router)
        .map_err(|error| anyhow::anyhow!("failed to attach MCP elicitation router: {error}"))
}

fn initialize_database(config: &CliConfig) -> anyhow::Result<InitializedDatabase> {
    match config.data_dir.as_ref() {
        Some(data_dir) => {
            let storage_roots = StorageRoots::initialize(data_dir)
                .map_err(|error| anyhow::anyhow!("failed to initialize storage roots: {error}"))?;
            let (db, resolution) = database::init_database_with_data_dir_resolution(data_dir)
                .map_err(|error| {
                    anyhow::anyhow!(
                        "failed to initialize app-server database at {}: {error}",
                        storage_roots.product_db_path.display()
                    )
                })?;
            cleanup_migrated_product_db_source_after_init(
                resolution.migrated_from.as_ref(),
                &resolution.database_path,
                config.product_db_migration_cleanup_policy,
            )?;
            Ok(InitializedDatabase {
                db,
                storage_roots: Some(storage_roots),
            })
        }
        None => {
            let data_root = app_paths::best_effort_data_dir();
            let storage_roots = StorageRoots::initialize(&data_root)
                .map_err(|error| anyhow::anyhow!("failed to initialize storage roots: {error}"))?;
            let (db, resolution) = database::init_database_with_data_dir_resolution(&data_root)
                .map_err(|error| {
                    anyhow::anyhow!(
                        "failed to initialize app-server database at {}: {error}",
                        storage_roots.product_db_path.display()
                    )
                })?;
            cleanup_migrated_product_db_source_after_init(
                resolution.migrated_from.as_ref(),
                &resolution.database_path,
                config.product_db_migration_cleanup_policy,
            )?;
            Ok(InitializedDatabase {
                db,
                storage_roots: Some(storage_roots),
            })
        }
    }
}

fn cleanup_migrated_product_db_source_after_init(
    migrated_from: Option<&PathBuf>,
    database_path: &PathBuf,
    policy: ProductDbMigrationCleanupPolicy,
) -> anyhow::Result<()> {
    let Some(source_path) = migrated_from else {
        return Ok(());
    };
    if source_path == database_path {
        return Ok(());
    }

    let report = cleanup_migrated_product_db_source(source_path, policy).map_err(|error| {
        anyhow::anyhow!(
            "failed to clean migrated product database source {} with policy {}: {error}",
            source_path.display(),
            policy.as_str()
        )
    })?;
    if report.changed() {
        tracing::info!(
            "[路径迁移] 已按 {} 清理迁移源 Product DB {}（rows={}, schema_objects={}, files={}）",
            report.policy.as_str(),
            report.source_path.display(),
            report.rows_deleted,
            report.schema_objects_dropped,
            report.database_files_deleted
        );
    }
    Ok(())
}

#[cfg(test)]
fn parse_args_from(args: impl IntoIterator<Item = String>) -> anyhow::Result<CliConfig> {
    parse_args_from_with_env(args, None, None)
}

fn parse_args_from_with_env(
    args: impl IntoIterator<Item = String>,
    data_dir_env: Option<OsString>,
    product_db_migration_cleanup_env: Option<OsString>,
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
    let mut product_db_migration_cleanup_policy = product_db_migration_cleanup_env
        .and_then(|value| value.into_string().ok())
        .map(|value| ProductDbMigrationCleanupPolicy::parse(&value))
        .transpose()
        .map_err(|error| anyhow::anyhow!(error))?
        .unwrap_or_default();

    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--data-dir=") {
            if value.is_empty() {
                anyhow::bail!("--data-dir requires a path");
            }
            data_dir = Some(PathBuf::from(value));
            continue;
        }
        if let Some(value) = arg.strip_prefix("--product-db-migration-cleanup=") {
            product_db_migration_cleanup_policy = ProductDbMigrationCleanupPolicy::parse(value)
                .map_err(|error| anyhow::anyhow!(error))?;
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
            "--product-db-migration-cleanup" => {
                let value = args.next().ok_or_else(|| {
                    anyhow::anyhow!("--product-db-migration-cleanup requires a value")
                })?;
                product_db_migration_cleanup_policy =
                    ProductDbMigrationCleanupPolicy::parse(&value)
                        .map_err(|error| anyhow::anyhow!(error))?;
            }
            "--help" | "-h" => {
                println!(
                    "Usage: app-server [--stdio] [--listen stdio://] [--backend external|runtime|mock|unavailable] [--backend-command path] [--backend-arg value] [--backend-timeout-ms ms] [--app-policy path] [--data-dir path] [--product-db-migration-cleanup retain|clear-rows|drop-tables|delete-file]"
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
        product_db_migration_cleanup_policy,
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
        assert_eq!(
            config.product_db_migration_cleanup_policy,
            ProductDbMigrationCleanupPolicy::DropTables
        );
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
        let config = parse_args_from_with_env(
            ["--data-dir", "/tmp/cli-app-server"].map(str::to_string),
            Some(OsString::from("/tmp/env-app-server")),
            None,
        )
        .expect("config");

        assert_eq!(config.data_dir, Some(PathBuf::from("/tmp/cli-app-server")));
    }

    #[test]
    fn parse_args_accepts_data_dir_env_fallback() {
        let config = parse_args_from_with_env(
            Vec::new(),
            Some(OsString::from("/tmp/env-app-server")),
            None,
        )
        .expect("config");

        assert_eq!(config.data_dir, Some(PathBuf::from("/tmp/env-app-server")));
    }

    #[test]
    fn parse_args_accepts_product_db_migration_cleanup_policy() {
        let config =
            parse_args_from(["--product-db-migration-cleanup", "delete-file"].map(str::to_string))
                .expect("config");

        assert_eq!(
            config.product_db_migration_cleanup_policy,
            ProductDbMigrationCleanupPolicy::DeleteFile
        );

        let config = parse_args_from_with_env(
            ["--product-db-migration-cleanup=retain"].map(str::to_string),
            None,
            Some(OsString::from("clear-rows")),
        )
        .expect("config");

        assert_eq!(
            config.product_db_migration_cleanup_policy,
            ProductDbMigrationCleanupPolicy::Retain
        );

        let config = parse_args_from_with_env(Vec::new(), None, Some(OsString::from("clear-rows")))
            .expect("config");

        assert_eq!(
            config.product_db_migration_cleanup_policy,
            ProductDbMigrationCleanupPolicy::ClearRows
        );
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
            product_db_migration_cleanup_policy: ProductDbMigrationCleanupPolicy::DropTables,
        };

        let db = initialize_database(&config).expect("initialize database");
        drop(db);

        assert!(data_dir.join("lime.db").is_file());
        let storage_roots = StorageRoots::initialize(&data_dir).expect("storage roots");
        assert_eq!(
            storage_roots.projection_db_path,
            data_dir.join("runtime").join("projection_1.sqlite")
        );
        assert_eq!(
            storage_roots.event_log_root,
            data_dir.join("runtime").join("events")
        );
        assert_eq!(
            storage_roots.trace_log_root,
            data_dir.join("runtime").join("traces")
        );
    }

    #[test]
    fn initialize_database_migrates_previous_product_settings_from_user_data_root() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let user_data_root = temp_dir.path().join("desktop-platform");
        let app_server_data_dir = user_data_root.join("app-server");
        let previous_db = user_data_root.join("lime.db");
        let previous_db_conn =
            database::init_database_at_path(&previous_db).expect("previous product database");
        {
            let conn = previous_db_conn.lock().expect("previous db lock");
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                ("providers.active_tab", "service-providers"),
            )
            .expect("insert previous setting");
            conn.execute(
                "INSERT INTO api_key_providers
                 (id, name, type, api_host, is_system, group_name, enabled, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 0, ?5, 1, 1, ?6, ?6)",
                (
                    "custom-openai-compatible",
                    "Custom OpenAI Compatible",
                    "openai",
                    "https://models.example.invalid/v1",
                    "custom",
                    "2026-06-15T00:00:00Z",
                ),
            )
            .expect("insert previous provider");
        }
        drop(previous_db_conn);

        let config = CliConfig {
            listen: DEFAULT_LISTEN_URL.to_string(),
            backend_mode: AppServerBackendMode::Unavailable,
            app_policy_path: None,
            backend_command: None,
            backend_args: Vec::new(),
            backend_timeout_ms: DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS,
            data_dir: Some(app_server_data_dir.clone()),
            product_db_migration_cleanup_policy: ProductDbMigrationCleanupPolicy::DropTables,
        };

        let db = initialize_database(&config).expect("initialize app-server database");
        drop(db);

        let migrated = rusqlite::Connection::open(app_server_data_dir.join("lime.db"))
            .expect("migrated app-server db");
        let setting_value: String = migrated
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                ["providers.active_tab"],
                |row| row.get(0),
            )
            .expect("migrated provider setting");
        let provider_count: i64 = migrated
            .query_row(
                "SELECT COUNT(*) FROM api_key_providers WHERE id = ?1",
                ["custom-openai-compatible"],
                |row| row.get(0),
            )
            .expect("migrated custom provider");

        assert_eq!(setting_value, "service-providers");
        assert_eq!(provider_count, 1);

        let previous = rusqlite::Connection::open(&previous_db).expect("old product db shell");
        let old_user_table_count: i64 = previous
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .expect("old product db tables cleared");
        assert_eq!(old_user_table_count, 0);
    }

    #[test]
    fn initialize_database_can_delete_migrated_product_db_source_by_policy() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let user_data_root = temp_dir.path().join("desktop-platform");
        let app_server_data_dir = user_data_root.join("app-server");
        let previous_db = user_data_root.join("lime.db");
        let previous_db_conn =
            database::init_database_at_path(&previous_db).expect("previous product database");
        {
            let conn = previous_db_conn.lock().expect("previous db lock");
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                ("providers.active_tab", "service-providers"),
            )
            .expect("insert previous setting");
        }
        drop(previous_db_conn);

        let config = CliConfig {
            listen: DEFAULT_LISTEN_URL.to_string(),
            backend_mode: AppServerBackendMode::Unavailable,
            app_policy_path: None,
            backend_command: None,
            backend_args: Vec::new(),
            backend_timeout_ms: DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS,
            data_dir: Some(app_server_data_dir.clone()),
            product_db_migration_cleanup_policy: ProductDbMigrationCleanupPolicy::DeleteFile,
        };

        let db = initialize_database(&config).expect("initialize app-server database");
        drop(db);

        assert!(!previous_db.exists());
        let migrated = rusqlite::Connection::open(app_server_data_dir.join("lime.db"))
            .expect("migrated app-server db");
        let setting_value: String = migrated
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                ["providers.active_tab"],
                |row| row.get(0),
            )
            .expect("migrated provider setting");
        assert_eq!(setting_value, "service-providers");
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
    fn parse_args_rejects_runtime_backend_for_standalone_binary() {
        let error = parse_args_from(["--backend", "agent"].map(str::to_string)).expect_err("error");

        assert!(error
            .to_string()
            .contains("unsupported app-server backend mode: agent"));
    }
}
