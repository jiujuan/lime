use app_server_protocol::PROTOCOL_VERSION;
use app_server_transport::DEFAULT_LISTEN_URL;
use serde::{Deserialize, Serialize};
use std::env;
use std::error::Error as StdError;
use std::fmt;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};

mod managed_sidecar;
mod settings;

pub use managed_sidecar::executable_identity;
pub use managed_sidecar::executable_identity_from_bytes;
pub use managed_sidecar::managed_sidecar_binary_path;
pub use managed_sidecar::ExecutableIdentity;
pub use settings::DaemonSettings;

#[cfg(windows)]
pub const SIDECAR_BINARY_NAME: &str = "app-server.exe";

#[cfg(not(windows))]
pub const SIDECAR_BINARY_NAME: &str = "app-server";

pub const DEFAULT_SIDECAR_ENV_VAR: &str = "APP_SERVER_BIN";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarLaunchConfig {
    pub binary_path: PathBuf,
    pub listen_url: String,
    pub expected_sha256: Option<String>,
}

impl SidecarLaunchConfig {
    pub fn stdio(binary_path: impl Into<PathBuf>) -> Self {
        Self {
            binary_path: binary_path.into(),
            listen_url: DEFAULT_LISTEN_URL.to_string(),
            expected_sha256: None,
        }
    }

    pub fn args(&self) -> Vec<String> {
        if self.listen_url == DEFAULT_LISTEN_URL {
            return vec!["--stdio".to_string()];
        }
        vec!["--listen".to_string(), self.listen_url.clone()]
    }

    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.binary_path);
        command
            .args(self.args())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    pub fn spawn(&self) -> std::io::Result<Child> {
        self.command().spawn()
    }

    pub fn spawn_verified(&self) -> Result<SidecarProcess, SidecarProcessError> {
        SidecarProcess::spawn(self)
    }

    pub fn verify_expected_sha256(&self) -> Result<(), String> {
        verify_sidecar_file_sha256(self)
    }

    pub fn requires_sha256_verification(&self) -> bool {
        self.expected_sha256
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
    }
}

#[derive(Debug)]
pub struct SidecarProcess {
    child: Child,
}

impl SidecarProcess {
    pub fn spawn(config: &SidecarLaunchConfig) -> Result<Self, SidecarProcessError> {
        config
            .verify_expected_sha256()
            .map_err(SidecarProcessError::Sha256)?;
        let child = config.spawn().map_err(SidecarProcessError::Spawn)?;
        Ok(Self { child })
    }

    pub fn id(&self) -> u32 {
        self.child.id()
    }

    pub fn child(&mut self) -> &mut Child {
        &mut self.child
    }

    pub fn into_child(self) -> Child {
        self.child
    }

    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.child.try_wait()
    }

    pub fn wait(&mut self) -> io::Result<ExitStatus> {
        self.child.wait()
    }

    pub fn kill(&mut self) -> io::Result<()> {
        self.child.kill()
    }
}

#[derive(Debug)]
pub enum SidecarProcessError {
    Sha256(String),
    Spawn(io::Error),
}

impl fmt::Display for SidecarProcessError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sha256(error) => write!(formatter, "{error}"),
            Self::Spawn(error) => write!(formatter, "failed to spawn app-server sidecar: {error}"),
        }
    }
}

impl StdError for SidecarProcessError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            Self::Sha256(_) => None,
            Self::Spawn(error) => Some(error),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerReleaseManifest {
    pub version: String,
    pub protocol_version: String,
    pub artifacts: Vec<AppServerReleaseArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppServerReleaseArtifact {
    pub platform: String,
    pub url: String,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedSidecarLaunchConfig {
    pub config: SidecarLaunchConfig,
    pub artifact: AppServerReleaseArtifact,
    pub binary_path_source: SidecarBinaryPathSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarBinaryPathSource {
    Env,
    Resources,
    Dev,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarBinaryPathResolution {
    pub binary_path: PathBuf,
    pub source: SidecarBinaryPathSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarBinaryPathOptions {
    pub env_var_name: String,
    pub env_binary_path: Option<PathBuf>,
    pub allow_env_override: bool,
    pub resources_path: Option<PathBuf>,
    pub resource_relative_path: Option<PathBuf>,
    pub dev_binary_path: Option<PathBuf>,
    pub platform: String,
    pub arch: String,
}

impl Default for SidecarBinaryPathOptions {
    fn default() -> Self {
        let env_var_name = DEFAULT_SIDECAR_ENV_VAR.to_string();
        Self {
            env_binary_path: env::var_os(&env_var_name).map(PathBuf::from),
            env_var_name,
            allow_env_override: true,
            resources_path: None,
            resource_relative_path: None,
            dev_binary_path: None,
            platform: env::consts::OS.to_string(),
            arch: env::consts::ARCH.to_string(),
        }
    }
}

pub fn sidecar_binary_name_for_platform(platform: &str) -> &'static str {
    if platform == "windows" || platform == "win32" {
        "app-server.exe"
    } else {
        "app-server"
    }
}

pub fn platform_key(platform: &str, arch: &str) -> String {
    match (platform, arch) {
        ("macos" | "darwin", "aarch64" | "arm64") => "darwin-arm64".to_string(),
        ("macos" | "darwin", _) => "darwin-x64".to_string(),
        ("windows" | "win32", _) => "win32-x64".to_string(),
        ("linux", _) => "linux-x64".to_string(),
        _ => format!("{platform}-{arch}"),
    }
}

pub fn find_release_artifact<'a>(
    manifest: &'a AppServerReleaseManifest,
    platform: &str,
) -> Option<&'a AppServerReleaseArtifact> {
    manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.platform == platform)
}

pub fn default_packaged_sidecar_relative_path(platform: &str, arch: &str) -> PathBuf {
    PathBuf::from("app-server")
        .join(platform_key(platform, arch))
        .join(sidecar_binary_name_for_platform(platform))
}

pub fn resolve_sidecar_binary_path(
    options: &SidecarBinaryPathOptions,
) -> Option<SidecarBinaryPathResolution> {
    if options.allow_env_override {
        if let Some(binary_path) = non_empty_path(options.env_binary_path.as_ref()) {
            return Some(SidecarBinaryPathResolution {
                binary_path: binary_path.to_path_buf(),
                source: SidecarBinaryPathSource::Env,
            });
        }
    }

    if let Some(resources_path) = non_empty_path(options.resources_path.as_ref()) {
        let relative_path = options.resource_relative_path.clone().unwrap_or_else(|| {
            default_packaged_sidecar_relative_path(&options.platform, &options.arch)
        });
        return Some(SidecarBinaryPathResolution {
            binary_path: resources_path.join(relative_path),
            source: SidecarBinaryPathSource::Resources,
        });
    }

    non_empty_path(options.dev_binary_path.as_ref()).map(|binary_path| {
        SidecarBinaryPathResolution {
            binary_path: binary_path.to_path_buf(),
            source: SidecarBinaryPathSource::Dev,
        }
    })
}

pub fn resolve_sidecar_from_release_manifest(
    manifest: &AppServerReleaseManifest,
    options: &SidecarBinaryPathOptions,
    listen_url: Option<String>,
) -> Result<Option<ResolvedSidecarLaunchConfig>, String> {
    if manifest.protocol_version != PROTOCOL_VERSION {
        return Err(format!(
            "unsupported app-server protocol: expected {}, got {}",
            PROTOCOL_VERSION, manifest.protocol_version
        ));
    }

    let platform = platform_key(&options.platform, &options.arch);
    let Some(artifact) = find_release_artifact(manifest, &platform) else {
        return Ok(None);
    };
    let Some(binary_path) = resolve_sidecar_binary_path(options) else {
        return Ok(None);
    };

    let expected_sha256 = match binary_path.source {
        SidecarBinaryPathSource::Resources => Some(artifact.sha256.clone()),
        SidecarBinaryPathSource::Env | SidecarBinaryPathSource::Dev => None,
    };

    Ok(Some(ResolvedSidecarLaunchConfig {
        config: SidecarLaunchConfig {
            binary_path: binary_path.binary_path,
            listen_url: listen_url.unwrap_or_else(|| DEFAULT_LISTEN_URL.to_string()),
            expected_sha256,
        },
        artifact: artifact.clone(),
        binary_path_source: binary_path.source,
    }))
}

pub fn parse_release_manifest(content: &str) -> Result<AppServerReleaseManifest, String> {
    serde_json::from_str(content)
        .map_err(|error| format!("failed to parse app-server release manifest: {error}"))
}

pub fn read_release_manifest(path: impl Into<PathBuf>) -> Result<AppServerReleaseManifest, String> {
    let path = path.into();
    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "failed to read app-server release manifest {}: {}",
            path.display(),
            error
        )
    })?;
    parse_release_manifest(&content)
}

pub fn resolve_sidecar_from_release_manifest_path(
    manifest_path: impl Into<PathBuf>,
    options: &SidecarBinaryPathOptions,
    listen_url: Option<String>,
) -> Result<Option<ResolvedSidecarLaunchConfig>, String> {
    let manifest = read_release_manifest(manifest_path)?;
    resolve_sidecar_from_release_manifest(&manifest, options, listen_url)
}

fn non_empty_path(path: Option<&PathBuf>) -> Option<&PathBuf> {
    path.filter(|value| !value.as_os_str().to_string_lossy().trim().is_empty())
}

pub fn sha256_hex(content: impl AsRef<[u8]>) -> String {
    use sha2::Digest;

    let mut hasher = sha2::Sha256::new();
    hasher.update(content.as_ref());
    hex::encode(hasher.finalize())
}

pub fn sha256_file(path: impl Into<PathBuf>) -> std::io::Result<String> {
    fs::read(path.into()).map(sha256_hex)
}

pub fn assert_sha256(actual_sha256: &str, expected_sha256: &str) -> Result<(), String> {
    if actual_sha256
        .trim()
        .eq_ignore_ascii_case(expected_sha256.trim())
    {
        Ok(())
    } else {
        Err("app-server sha256 mismatch".to_string())
    }
}

pub fn verify_sidecar_file_sha256(config: &SidecarLaunchConfig) -> Result<(), String> {
    let Some(expected_sha256) = config
        .expected_sha256
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(());
    };
    let actual_sha256 = sha256_file(config.binary_path.clone()).map_err(|error| {
        format!(
            "failed to read app-server sidecar for sha256 verification: {}",
            error
        )
    })?;
    assert_sha256(&actual_sha256, expected_sha256)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn stdio_sidecar_uses_codex_style_stdio_flag() {
        let config = SidecarLaunchConfig::stdio(PathBuf::from(SIDECAR_BINARY_NAME));

        assert_eq!(config.args(), vec!["--stdio".to_string()]);
    }

    #[test]
    fn sidecar_command_uses_launch_args() {
        let config = SidecarLaunchConfig {
            binary_path: PathBuf::from("app-server"),
            listen_url: "local://test".to_string(),
            expected_sha256: None,
        };
        let command = config.command();

        assert_eq!(command.get_program().to_string_lossy(), "app-server");
        assert_eq!(
            command
                .get_args()
                .map(|arg| arg.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
            vec!["--listen".to_string(), "local://test".to_string()]
        );
    }

    #[test]
    fn sha256_verification_is_required_only_for_non_empty_expected_hash() {
        let mut config = SidecarLaunchConfig::stdio(PathBuf::from("app-server"));
        assert!(!config.requires_sha256_verification());

        config.expected_sha256 = Some("  ".to_string());
        assert!(!config.requires_sha256_verification());

        config.expected_sha256 = Some("abc".to_string());
        assert!(config.requires_sha256_verification());
    }

    #[test]
    fn verifies_sidecar_file_sha256_when_expected_hash_is_present() {
        let path = temp_sidecar_path("sha256-ok");
        fs::write(&path, b"sidecar-binary").expect("write sidecar");
        let expected_sha256 = sha256_hex(b"sidecar-binary");
        let config = SidecarLaunchConfig {
            binary_path: path.clone(),
            listen_url: DEFAULT_LISTEN_URL.to_string(),
            expected_sha256: Some(expected_sha256.to_uppercase()),
        };

        assert!(config.verify_expected_sha256().is_ok());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn rejects_sidecar_file_sha256_mismatch() {
        let path = temp_sidecar_path("sha256-bad");
        fs::write(&path, b"sidecar-binary").expect("write sidecar");
        let config = SidecarLaunchConfig {
            binary_path: path.clone(),
            listen_url: DEFAULT_LISTEN_URL.to_string(),
            expected_sha256: Some("bad".to_string()),
        };

        let error = config
            .verify_expected_sha256()
            .expect_err("sha mismatch should fail");
        assert!(error.contains("sha256 mismatch"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn spawn_verified_rejects_sha256_mismatch_before_process_start() {
        let path = temp_sidecar_path("sha256-spawn-bad");
        fs::write(&path, b"sidecar-binary").expect("write sidecar");
        let config = SidecarLaunchConfig {
            binary_path: path.clone(),
            listen_url: DEFAULT_LISTEN_URL.to_string(),
            expected_sha256: Some("bad".to_string()),
        };

        let error = config
            .spawn_verified()
            .expect_err("sha mismatch should stop spawn");

        assert!(matches!(error, SidecarProcessError::Sha256(_)));
        assert!(error.to_string().contains("sha256 mismatch"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn resolves_packaged_sidecar_relative_paths() {
        assert_eq!(
            default_packaged_sidecar_relative_path("darwin", "arm64"),
            PathBuf::from("app-server")
                .join("darwin-arm64")
                .join("app-server")
        );
        assert_eq!(
            default_packaged_sidecar_relative_path("windows", "x86_64"),
            PathBuf::from("app-server")
                .join("win32-x64")
                .join("app-server.exe")
        );
    }

    #[test]
    fn resolves_sidecar_binary_path_priority() {
        let options = SidecarBinaryPathOptions {
            env_binary_path: Some(PathBuf::from("/custom/app-server")),
            resources_path: Some(PathBuf::from("/app/resources")),
            dev_binary_path: Some(PathBuf::from("/dev/app-server")),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };
        assert_eq!(
            resolve_sidecar_binary_path(&options),
            Some(SidecarBinaryPathResolution {
                binary_path: PathBuf::from("/custom/app-server"),
                source: SidecarBinaryPathSource::Env,
            })
        );

        let options = SidecarBinaryPathOptions {
            allow_env_override: false,
            ..options
        };
        assert_eq!(
            resolve_sidecar_binary_path(&options),
            Some(SidecarBinaryPathResolution {
                binary_path: PathBuf::from("/app/resources")
                    .join("app-server")
                    .join("darwin-arm64")
                    .join("app-server"),
                source: SidecarBinaryPathSource::Resources,
            })
        );

        let options = SidecarBinaryPathOptions {
            env_binary_path: None,
            resources_path: None,
            dev_binary_path: Some(PathBuf::from("/dev/app-server")),
            ..SidecarBinaryPathOptions::default()
        };
        assert_eq!(
            resolve_sidecar_binary_path(&options),
            Some(SidecarBinaryPathResolution {
                binary_path: PathBuf::from("/dev/app-server"),
                source: SidecarBinaryPathSource::Dev,
            })
        );

        let options = SidecarBinaryPathOptions {
            env_binary_path: Some(PathBuf::from("  ")),
            resources_path: Some(PathBuf::from("/app/resources")),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };
        assert_eq!(
            resolve_sidecar_binary_path(&options),
            Some(SidecarBinaryPathResolution {
                binary_path: PathBuf::from("/app/resources")
                    .join("app-server")
                    .join("darwin-arm64")
                    .join("app-server"),
                source: SidecarBinaryPathSource::Resources,
            })
        );
    }

    #[test]
    fn resolves_sidecar_from_release_manifest() {
        let manifest = AppServerReleaseManifest {
            version: "1.58.0".to_string(),
            protocol_version: PROTOCOL_VERSION.to_string(),
            artifacts: vec![AppServerReleaseArtifact {
                platform: "darwin-arm64".to_string(),
                url: "https://example/app-server-darwin-arm64.tar.gz".to_string(),
                sha256: "abc".to_string(),
            }],
        };
        let options = SidecarBinaryPathOptions {
            env_binary_path: None,
            resources_path: Some(PathBuf::from("/app/resources")),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };

        assert_eq!(
            resolve_sidecar_from_release_manifest(&manifest, &options, None).expect("manifest"),
            Some(ResolvedSidecarLaunchConfig {
                artifact: manifest.artifacts[0].clone(),
                binary_path_source: SidecarBinaryPathSource::Resources,
                config: SidecarLaunchConfig {
                    binary_path: PathBuf::from("/app/resources")
                        .join("app-server")
                        .join("darwin-arm64")
                        .join("app-server"),
                    listen_url: DEFAULT_LISTEN_URL.to_string(),
                    expected_sha256: Some("abc".to_string()),
                },
            })
        );

        let options = SidecarBinaryPathOptions {
            env_binary_path: Some(PathBuf::from("/dev/app-server")),
            resources_path: Some(PathBuf::from("/app/resources")),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };
        let resolved =
            resolve_sidecar_from_release_manifest(&manifest, &options, None).expect("manifest");
        assert_eq!(
            resolved.expect("resolved").config,
            SidecarLaunchConfig {
                binary_path: PathBuf::from("/dev/app-server"),
                listen_url: DEFAULT_LISTEN_URL.to_string(),
                expected_sha256: None,
            }
        );
    }

    #[test]
    fn resolves_sidecar_from_release_manifest_file() {
        let manifest_path = temp_sidecar_path("manifest-json");
        fs::write(
            &manifest_path,
            format!(
                r#"{{
                    "version": "1.58.0",
                    "protocolVersion": "{}",
                    "artifacts": [
                        {{
                            "platform": "darwin-arm64",
                            "url": "https://example/app-server-darwin-arm64.tar.gz",
                            "sha256": "abc"
                        }}
                    ]
                }}"#,
                PROTOCOL_VERSION
            ),
        )
        .expect("write manifest");
        let options = SidecarBinaryPathOptions {
            env_binary_path: None,
            resources_path: Some(PathBuf::from("/app/resources")),
            platform: "darwin".to_string(),
            arch: "arm64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };

        let resolved = resolve_sidecar_from_release_manifest_path(&manifest_path, &options, None)
            .expect("manifest")
            .expect("resolved");

        assert_eq!(
            resolved.binary_path_source,
            SidecarBinaryPathSource::Resources
        );
        assert_eq!(
            resolved.config.binary_path,
            PathBuf::from("/app/resources")
                .join("app-server")
                .join("darwin-arm64")
                .join("app-server")
        );
        assert_eq!(resolved.config.expected_sha256, Some("abc".to_string()));
        let _ = fs::remove_file(manifest_path);
    }

    #[test]
    fn release_manifest_rejects_protocol_drift_and_missing_artifact() {
        let manifest = AppServerReleaseManifest {
            version: "1.58.0".to_string(),
            protocol_version: PROTOCOL_VERSION.to_string(),
            artifacts: Vec::new(),
        };
        let options = SidecarBinaryPathOptions {
            resources_path: Some(PathBuf::from("/app/resources")),
            platform: "linux".to_string(),
            arch: "x64".to_string(),
            ..SidecarBinaryPathOptions::default()
        };

        assert_eq!(
            resolve_sidecar_from_release_manifest(&manifest, &options, None).expect("manifest"),
            None
        );
        let error = resolve_sidecar_from_release_manifest(
            &AppServerReleaseManifest {
                protocol_version: "appserver.v9".to_string(),
                ..manifest
            },
            &options,
            None,
        )
        .expect_err("protocol drift should fail");
        assert!(error.contains("unsupported app-server protocol"));
    }

    fn temp_sidecar_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        env::temp_dir().join(format!("app-server-daemon-{name}-{nanos}"))
    }
}
