use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use utoipa::ToSchema;

pub(crate) use crate::agents::ExtensionConfig;

pub const DEFAULT_EXTENSION: &str = "developer";
pub const DEFAULT_EXTENSION_TIMEOUT: u64 = 300;
pub const DEFAULT_DISPLAY_NAME: &str = "Developer";

#[derive(Copy, Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AsterMode {
    Auto,
    Approve,
    SmartApprove,
    Chat,
}

impl std::str::FromStr for AsterMode {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "auto" => Ok(Self::Auto),
            "approve" => Ok(Self::Approve),
            "smart_approve" => Ok(Self::SmartApprove),
            "chat" => Ok(Self::Chat),
            other => Err(format!("invalid mode: {other}")),
        }
    }
}

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Configuration value not found: {0}")]
    NotFound(String),
    #[error("Failed to deserialize value: {0}")]
    DeserializeError(String),
    #[error("Failed to read config file: {0}")]
    FileError(#[from] std::io::Error),
    #[error("Failed to create config directory: {0}")]
    DirectoryError(String),
    #[error("Failed to access keyring: {0}")]
    KeyringError(String),
    #[error("Failed to lock config file: {0}")]
    LockError(String),
}

impl From<serde_json::Error> for ConfigError {
    fn from(error: serde_json::Error) -> Self {
        Self::DeserializeError(error.to_string())
    }
}

impl From<serde_yaml::Error> for ConfigError {
    fn from(error: serde_yaml::Error) -> Self {
        Self::DeserializeError(error.to_string())
    }
}

#[derive(Default)]
pub struct Config {
    values: Mutex<HashMap<String, Value>>,
    secrets: Mutex<HashMap<String, Value>>,
}

static GLOBAL_CONFIG: OnceLock<Config> = OnceLock::new();

impl Config {
    pub fn global() -> &'static Config {
        GLOBAL_CONFIG.get_or_init(Config::default)
    }

    pub fn new<P: AsRef<Path>>(_config_path: P, _service: &str) -> Result<Self, ConfigError> {
        Ok(Self::default())
    }

    pub fn new_with_file_secrets<P1: AsRef<Path>, P2: AsRef<Path>>(
        _config_path: P1,
        _secrets_path: P2,
    ) -> Result<Self, ConfigError> {
        Ok(Self::default())
    }

    pub fn exists(&self) -> bool {
        false
    }

    pub fn get_param<T: DeserializeOwned>(&self, key: &str) -> Result<T, ConfigError> {
        if let Some(value) = self
            .values
            .lock()
            .ok()
            .and_then(|map| map.get(key).cloned())
        {
            return serde_json::from_value(value).map_err(Into::into);
        }

        if let Ok(raw) = std::env::var(key) {
            return parse_config_value(key, &raw);
        }

        if let Some(raw) = default_value_for_key(key) {
            return parse_config_value(key, raw);
        }

        Err(ConfigError::NotFound(key.to_string()))
    }

    pub fn set_param<V: Serialize>(&self, key: &str, value: V) -> Result<(), ConfigError> {
        let value = serde_json::to_value(value)?;
        self.values
            .lock()
            .map_err(|error| ConfigError::LockError(error.to_string()))?
            .insert(key.to_string(), value);
        Ok(())
    }

    pub fn get_secret<T: DeserializeOwned>(&self, key: &str) -> Result<T, ConfigError> {
        if let Some(value) = self
            .secrets
            .lock()
            .ok()
            .and_then(|map| map.get(key).cloned())
        {
            return serde_json::from_value(value).map_err(Into::into);
        }
        self.get_param(key)
    }

    pub fn get_secrets(&self) -> Result<HashMap<String, Value>, ConfigError> {
        self.secrets
            .lock()
            .map(|map| map.clone())
            .map_err(|error| ConfigError::LockError(error.to_string()))
    }

    pub fn set_secret<V: Serialize>(&self, key: &str, value: &V) -> Result<(), ConfigError> {
        let value = serde_json::to_value(value)?;
        self.secrets
            .lock()
            .map_err(|error| ConfigError::LockError(error.to_string()))?
            .insert(key.to_string(), value);
        Ok(())
    }

    pub fn delete_secret(&self, key: &str) -> Result<(), ConfigError> {
        self.secrets
            .lock()
            .map_err(|error| ConfigError::LockError(error.to_string()))?
            .remove(key);
        Ok(())
    }

    pub fn get_aster_search_paths(&self) -> Result<Vec<String>, ConfigError> {
        self.get_param("ASTER_SEARCH_PATHS")
    }

    pub fn get_aster_mode(&self) -> Result<AsterMode, ConfigError> {
        self.get_param("ASTER_MODE")
    }

    pub fn get_aster_provider(&self) -> Result<String, ConfigError> {
        self.get_param("ASTER_PROVIDER")
    }

    pub fn get_aster_model(&self) -> Result<String, ConfigError> {
        self.get_param("ASTER_MODEL")
    }

    pub fn get_aster_max_active_agents(&self) -> Result<usize, ConfigError> {
        self.get_param("ASTER_MAX_ACTIVE_AGENTS")
    }

    pub fn get_claude_code_command(&self) -> Result<base::ClaudeCodeCommand, ConfigError> {
        self.get_value_type()
    }

    pub fn get_gemini_cli_command(&self) -> Result<base::GeminiCliCommand, ConfigError> {
        self.get_value_type()
    }

    pub fn get_cursor_agent_command(&self) -> Result<base::CursorAgentCommand, ConfigError> {
        self.get_value_type()
    }

    pub fn get_codex_command(&self) -> Result<base::CodexCommand, ConfigError> {
        self.get_value_type()
    }

    pub fn get_codex_reasoning_effort(&self) -> Result<base::CodexReasoningEffort, ConfigError> {
        self.get_value_type()
    }

    pub fn get_codex_enable_skills(&self) -> Result<base::CodexEnableSkills, ConfigError> {
        self.get_value_type()
    }

    pub fn get_codex_skip_git_check(&self) -> Result<base::CodexSkipGitCheck, ConfigError> {
        self.get_value_type()
    }

    pub fn get_codex_use_app_server(&self) -> Result<base::CodexUseAppServer, ConfigError> {
        self.get_value_type()
    }

    fn get_value_type<T>(&self) -> Result<T, ConfigError>
    where
        T: base::ConfigValue + From<String>,
    {
        self.get_param::<String>(T::KEY)
            .or_else(|_| Ok(T::DEFAULT.to_string()))
            .map(T::from)
    }
}

fn parse_config_value<T: DeserializeOwned>(key: &str, raw: &str) -> Result<T, ConfigError> {
    if let Ok(value) = serde_yaml::from_str(raw) {
        return Ok(value);
    }
    if let Ok(value) = serde_json::from_str(raw) {
        return Ok(value);
    }
    serde_json::from_value(Value::String(raw.to_string()))
        .map_err(|error| ConfigError::DeserializeError(format!("failed to parse {key}: {error}")))
}

fn default_value_for_key(key: &str) -> Option<&'static str> {
    match key {
        "CLAUDE_CODE_COMMAND" => Some("claude"),
        "GEMINI_CLI_COMMAND" => Some("gemini"),
        "CURSOR_AGENT_COMMAND" => Some("cursor-agent"),
        "CODEX_COMMAND" => Some("codex"),
        "CODEX_REASONING_EFFORT" => Some("high"),
        "CODEX_ENABLE_SKILLS" => Some("true"),
        "CODEX_SKIP_GIT_CHECK" => Some("false"),
        "CODEX_USE_APP_SERVER" => Some("true"),
        "ASTER_SEARCH_PATHS" => Some("[]"),
        "ASTER_MODE" => Some("auto"),
        "ASTER_MAX_ACTIVE_AGENTS" => Some("16"),
        _ => None,
    }
}

pub mod base {
    use super::*;

    pub trait ConfigValue {
        const KEY: &'static str;
        const DEFAULT: &'static str;
    }

    macro_rules! value_type {
        ($name:ident, $key:literal, $default:literal) => {
            #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
            #[serde(transparent)]
            pub struct $name(String);

            impl ConfigValue for $name {
                const KEY: &'static str = $key;
                const DEFAULT: &'static str = $default;
            }

            impl Default for $name {
                fn default() -> Self {
                    Self(Self::DEFAULT.to_string())
                }
            }

            impl From<String> for $name {
                fn from(value: String) -> Self {
                    Self(value)
                }
            }

            impl From<$name> for String {
                fn from(value: $name) -> Self {
                    value.0
                }
            }

            impl From<$name> for OsString {
                fn from(value: $name) -> Self {
                    OsString::from(value.0)
                }
            }

            impl std::fmt::Display for $name {
                fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    formatter.write_str(&self.0)
                }
            }
        };
    }

    value_type!(ClaudeCodeCommand, "CLAUDE_CODE_COMMAND", "claude");
    value_type!(GeminiCliCommand, "GEMINI_CLI_COMMAND", "gemini");
    value_type!(CursorAgentCommand, "CURSOR_AGENT_COMMAND", "cursor-agent");
    value_type!(CodexCommand, "CODEX_COMMAND", "codex");
    value_type!(CodexReasoningEffort, "CODEX_REASONING_EFFORT", "high");
    value_type!(CodexEnableSkills, "CODEX_ENABLE_SKILLS", "true");
    value_type!(CodexSkipGitCheck, "CODEX_SKIP_GIT_CHECK", "false");
    value_type!(CodexUseAppServer, "CODEX_USE_APP_SERVER", "true");
}

pub mod paths {
    use super::*;

    static PATH_ROOT_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();

    pub struct Paths;

    impl Paths {
        pub fn config_dir() -> PathBuf {
            root_or_default().join("config")
        }

        pub fn data_dir() -> PathBuf {
            root_or_default().join("data")
        }

        pub fn state_dir() -> PathBuf {
            root_or_default().join("state")
        }

        pub fn in_state_dir(subpath: &str) -> PathBuf {
            Self::state_dir().join(subpath)
        }

        pub fn in_config_dir(subpath: &str) -> PathBuf {
            Self::config_dir().join(subpath)
        }

        pub fn in_data_dir(subpath: &str) -> PathBuf {
            Self::data_dir().join(subpath)
        }
    }

    pub fn initialize_path_root(root: PathBuf) -> Result<PathBuf, String> {
        if root.as_os_str().is_empty() {
            return Err("Aster path root 不能为空".to_string());
        }
        let normalized = if root.is_absolute() {
            root
        } else {
            std::env::current_dir()
                .map_err(|error| error.to_string())?
                .join(root)
        };
        match PATH_ROOT_OVERRIDE.get() {
            Some(existing) if existing == &normalized => Ok(existing.clone()),
            Some(existing) => Err(format!(
                "Aster path root 已初始化为 {}，不能再切换到 {}",
                existing.to_string_lossy(),
                normalized.to_string_lossy()
            )),
            None => {
                let _ = PATH_ROOT_OVERRIDE.set(normalized.clone());
                Ok(normalized)
            }
        }
    }

    pub fn initialized_path_root() -> Option<PathBuf> {
        PATH_ROOT_OVERRIDE.get().cloned()
    }

    fn root_or_default() -> PathBuf {
        initialized_path_root()
            .or_else(|| std::env::var("ASTER_PATH_ROOT").ok().map(PathBuf::from))
            .unwrap_or_else(|| {
                dirs::data_dir()
                    .unwrap_or_else(std::env::temp_dir)
                    .join("aster")
            })
    }
}

pub mod permission {
    use super::*;

    #[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, ToSchema)]
    #[serde(rename_all = "snake_case")]
    pub enum PermissionLevel {
        AlwaysAllow,
        AskBefore,
        NeverAllow,
    }
}

#[derive(Debug, Clone, Default)]
pub struct PermissionManager {
    permission_map: HashMap<String, permission::PermissionLevel>,
}

impl PermissionManager {
    pub fn new<P: AsRef<Path>>(_config_path: P) -> Self {
        Self::default()
    }

    pub fn get_permission_names(&self) -> Vec<String> {
        self.permission_map.keys().cloned().collect()
    }

    pub fn get_user_permission(&self, principal_name: &str) -> Option<permission::PermissionLevel> {
        self.permission_map.get(principal_name).cloned()
    }

    pub fn get_smart_approve_permission(
        &self,
        principal_name: &str,
    ) -> Option<permission::PermissionLevel> {
        self.permission_map.get(principal_name).cloned()
    }

    pub fn update_user_permission(
        &mut self,
        principal_name: &str,
        level: permission::PermissionLevel,
    ) {
        self.permission_map
            .insert(principal_name.to_string(), level);
    }

    pub fn update_smart_approve_permission(
        &mut self,
        principal_name: &str,
        level: permission::PermissionLevel,
    ) {
        self.permission_map
            .insert(principal_name.to_string(), level);
    }

    pub fn remove_extension(&mut self, extension_name: &str) {
        self.permission_map
            .retain(|principal, _| !principal.starts_with(extension_name));
    }
}

pub mod search_path {
    use super::*;

    pub struct SearchPaths {
        paths: Vec<PathBuf>,
    }

    impl SearchPaths {
        pub fn builder() -> Self {
            let mut paths = Config::global()
                .get_aster_search_paths()
                .unwrap_or_default()
                .into_iter()
                .map(PathBuf::from)
                .collect::<Vec<_>>();
            paths.push(PathBuf::from("~/.local/bin"));
            #[cfg(unix)]
            paths.push(PathBuf::from("/usr/local/bin"));
            if cfg!(target_os = "macos") {
                paths.push(PathBuf::from("/opt/homebrew/bin"));
                paths.push(PathBuf::from("/opt/local/bin"));
            }
            Self { paths }
        }

        pub fn with_npm(mut self) -> Self {
            if cfg!(windows) {
                if let Some(appdata) = dirs::data_dir() {
                    self.paths.push(appdata.join("npm"));
                }
            } else if let Some(home) = dirs::home_dir() {
                self.paths.push(home.join(".npm-global/bin"));
            }
            self
        }

        pub fn path(self) -> Result<OsString> {
            let inherited_path = std::env::var_os("PATH");
            let paths = self.paths.into_iter().map(expand_home).chain(
                inherited_path
                    .as_ref()
                    .map(std::env::split_paths)
                    .into_iter()
                    .flatten(),
            );
            std::env::join_paths(paths).map_err(Into::into)
        }

        pub fn resolve<N>(self, name: N) -> Result<PathBuf>
        where
            N: AsRef<std::ffi::OsStr>,
        {
            which::which_in_global(name.as_ref(), Some(self.path()?))?
                .next()
                .with_context(|| {
                    format!(
                        "could not resolve command '{}': file does not exist",
                        name.as_ref().to_string_lossy()
                    )
                })
        }
    }

    fn expand_home(path: PathBuf) -> PathBuf {
        let raw = path.to_string_lossy();
        if let Some(stripped) = raw.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return home.join(stripped);
            }
        }
        path
    }
}

pub mod extensions {
    use super::*;

    #[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
    pub struct ExtensionEntry {
        pub enabled: bool,
        #[serde(flatten)]
        pub config: ExtensionConfig,
    }

    pub fn name_to_key(name: &str) -> String {
        name.chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase()
    }
}

pub fn get_extension_by_name(_name: &str) -> Option<ExtensionConfig> {
    None
}

pub fn get_all_extensions() -> Vec<extensions::ExtensionEntry> {
    Vec::new()
}
