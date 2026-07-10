use crate::config::paths::Paths;
use crate::config::AsterMode;
use fs2::FileExt;
use keyring::Entry;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_yaml::Mapping;
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use thiserror::Error;

const KEYRING_SERVICE: &str = "aster";
const KEYRING_USERNAME: &str = "secrets";
pub const CONFIG_YAML_NAME: &str = "config.yaml";

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
    fn from(err: serde_json::Error) -> Self {
        ConfigError::DeserializeError(err.to_string())
    }
}

impl From<serde_yaml::Error> for ConfigError {
    fn from(err: serde_yaml::Error) -> Self {
        ConfigError::DeserializeError(err.to_string())
    }
}

impl From<keyring::Error> for ConfigError {
    fn from(err: keyring::Error) -> Self {
        ConfigError::KeyringError(err.to_string())
    }
}

/// Configuration management for aster.
///
/// This module provides a flexible configuration system that supports:
/// - Dynamic configuration keys
/// - Multiple value types through serde deserialization
/// - Environment variable overrides
/// - YAML-based configuration file storage
/// - Hot reloading of configuration changes
/// - Secure secret storage in system keyring
///
/// Configuration values are loaded with the following precedence:
/// 1. Environment variables (exact key match)
/// 2. Configuration file (~/.config/aster/config.yaml by default)
///
/// Secrets are loaded with the following precedence:
/// 1. Environment variables (exact key match)
/// 2. System keyring (which can be disabled with ASTER_DISABLE_KEYRING)
/// 3. If the keyring is disabled, secrets are stored in a secrets file
///    (~/.config/aster/secrets.yaml by default)
///
/// # Examples
///
/// ```no_run
/// use aster::ConfigError;
/// use serde::Deserialize;
///
/// // Get a string value
/// let config = Config::global();
/// let api_key: String = config.get_param("OPENAI_API_KEY").unwrap();
///
/// // Get a complex type
/// #[derive(Deserialize)]
/// struct ServerConfig {
///     host: String,
///     port: u16,
/// }
///
/// let server_config: ServerConfig = config.get_param("server").unwrap();
/// ```
///
/// # Naming Convention
/// we recommend snake_case for keys, and will convert to UPPERCASE when
/// checking for environment overrides. e.g. openai_api_key will check for an
/// environment variable OPENAI_API_KEY
///
/// For aster-specific configuration, consider prefixing with "aster_" to avoid conflicts.
pub struct Config {
    config_path: PathBuf,
    secrets: SecretStorage,
    guard: Mutex<()>,
}

enum SecretStorage {
    Keyring { service: String },
    File { path: PathBuf },
}

// Global instance
static GLOBAL_CONFIG: OnceCell<Config> = OnceCell::new();

impl Default for Config {
    fn default() -> Self {
        let config_dir = Paths::config_dir();

        let config_path = config_dir.join(CONFIG_YAML_NAME);

        let secrets = match env::var("ASTER_DISABLE_KEYRING") {
            Ok(_) => SecretStorage::File {
                path: config_dir.join("secrets.yaml"),
            },
            Err(_) => SecretStorage::Keyring {
                service: KEYRING_SERVICE.to_string(),
            },
        };
        Config {
            config_path,
            secrets,
            guard: Mutex::new(()),
        }
    }
}

pub trait ConfigValue {
    const KEY: &'static str;
    const DEFAULT: &'static str;
}

macro_rules! config_value {
    ($key:ident, $type:ty) => {
        impl Config {
            paste::paste! {
                pub fn [<get_ $key:lower>](&self) -> Result<$type, ConfigError> {
                    self.get_param(stringify!($key))
                }
            }
            paste::paste! {
                pub fn [<set_ $key:lower>](&self, v: impl Into<$type>) -> Result<(), ConfigError> {
                    self.set_param(stringify!($key), &v.into())
                }
            }
        }
    };

    ($key:ident, $inner:ty, $default:expr) => {
        paste::paste! {
            #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
            #[serde(transparent)]
            pub struct [<$key:camel>]($inner);

            impl ConfigValue for [<$key:camel>] {
                const KEY: &'static str = stringify!($key);
                const DEFAULT: &'static str = $default;
            }

            impl Default for [<$key:camel>] {
                fn default() -> Self {
                    [<$key:camel>]($default.into())
                }
            }

            impl std::ops::Deref for [<$key:camel>] {
                type Target = $inner;

                fn deref(&self) -> &Self::Target {
                    &self.0
                }
            }

            impl std::ops::DerefMut for [<$key:camel>] {
                fn deref_mut(&mut self) -> &mut Self::Target {
                    &mut self.0
                }
            }

            impl std::fmt::Display for [<$key:camel>] {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    write!(f, "{:?}", self.0)
                }
            }

            impl From<$inner> for [<$key:camel>] {
                fn from(value: $inner) -> Self {
                    [<$key:camel>](value)
                }
            }

            impl From<[<$key:camel>]> for $inner {
                fn from(value: [<$key:camel>]) -> $inner {
                    value.0
                }
            }

            config_value!($key, [<$key:camel>]);
        }
    };
}

fn parse_yaml_content(content: &str) -> Result<Mapping, ConfigError> {
    serde_yaml::from_str(content).map_err(|e| e.into())
}

impl Config {
    /// Get the global configuration instance.
    ///
    /// This will initialize the configuration with the default path (~/.config/aster/config.yaml)
    /// if it hasn't been initialized yet.
    pub fn global() -> &'static Config {
        GLOBAL_CONFIG.get_or_init(Config::default)
    }

    /// Create a new configuration instance with custom paths
    ///
    /// This is primarily useful for testing or for applications that need
    /// to manage multiple configuration files.
    pub fn new<P: AsRef<Path>>(config_path: P, service: &str) -> Result<Self, ConfigError> {
        Ok(Config {
            config_path: config_path.as_ref().to_path_buf(),
            secrets: SecretStorage::Keyring {
                service: service.to_string(),
            },
            guard: Mutex::new(()),
        })
    }

    /// Create a new configuration instance with custom paths
    ///
    /// This is primarily useful for testing or for applications that need
    /// to manage multiple configuration files.
    pub fn new_with_file_secrets<P1: AsRef<Path>, P2: AsRef<Path>>(
        config_path: P1,
        secrets_path: P2,
    ) -> Result<Self, ConfigError> {
        Ok(Config {
            config_path: config_path.as_ref().to_path_buf(),
            secrets: SecretStorage::File {
                path: secrets_path.as_ref().to_path_buf(),
            },
            guard: Mutex::new(()),
        })
    }

    pub fn exists(&self) -> bool {
        self.config_path.exists()
    }

    pub fn clear(&self) -> Result<(), ConfigError> {
        Ok(std::fs::remove_file(&self.config_path)?)
    }

    pub fn path(&self) -> String {
        self.config_path.to_string_lossy().to_string()
    }

    fn load(&self) -> Result<Mapping, ConfigError> {
        if self.config_path.exists() {
            self.load_values_with_recovery()
        } else {
            // Config file doesn't exist, try to recover from backup first
            tracing::info!("Config file doesn't exist, attempting recovery from backup");

            if let Ok(backup_values) = self.try_restore_from_backup() {
                tracing::info!("Successfully restored config from backup");
                return Ok(backup_values);
            }

            // No backup available, create a default config
            tracing::info!("No backup found, creating default configuration");

            // Try to load from init-config.yaml if it exists, otherwise use empty config
            let default_config = self.load_init_config_if_exists().unwrap_or_default();

            self.create_and_save_default_config(default_config)
        }
    }

    pub fn all_values(&self) -> Result<HashMap<String, Value>, ConfigError> {
        self.load().map(|m| {
            HashMap::from_iter(m.into_iter().filter_map(|(k, v)| {
                k.as_str()
                    .map(|k| k.to_string())
                    .zip(serde_json::to_value(v).ok())
            }))
        })
    }

    // Helper method to create and save default config with consistent logging
    fn create_and_save_default_config(
        &self,
        default_config: Mapping,
    ) -> Result<Mapping, ConfigError> {
        // Try to write the default config to disk
        match self.save_values(default_config.clone()) {
            Ok(_) => {
                if default_config.is_empty() {
                    tracing::info!("Created fresh empty config file");
                } else {
                    tracing::info!(
                        "Created fresh config file from init-config.yaml with {} keys",
                        default_config.len()
                    );
                }
                Ok(default_config)
            }
            Err(write_error) => {
                tracing::error!("Failed to write default config file: {}", write_error);
                // Even if we can't write to disk, return config so app can still run
                Ok(default_config)
            }
        }
    }

    fn load_values_with_recovery(&self) -> Result<Mapping, ConfigError> {
        let file_content = std::fs::read_to_string(&self.config_path)?;

        match parse_yaml_content(&file_content) {
            Ok(values) => Ok(values),
            Err(parse_error) => {
                tracing::warn!(
                    "Config file appears corrupted, attempting recovery: {}",
                    parse_error
                );

                // Try to recover from backup
                if let Ok(backup_values) = self.try_restore_from_backup() {
                    tracing::info!("Successfully restored config from backup");
                    return Ok(backup_values);
                }

                // Last resort: create a fresh default config file
                tracing::error!("Could not recover config file, creating fresh default configuration. Original error: {}", parse_error);

                let default_config = self.load_init_config_if_exists().unwrap_or_default();

                self.create_and_save_default_config(default_config)
            }
        }
    }

    fn try_restore_from_backup(&self) -> Result<Mapping, ConfigError> {
        let backup_paths = self.get_backup_paths();

        for backup_path in backup_paths {
            if backup_path.exists() {
                match std::fs::read_to_string(&backup_path) {
                    Ok(backup_content) => {
                        match parse_yaml_content(&backup_content) {
                            Ok(values) => {
                                // Successfully parsed backup, restore it as the main config
                                if let Err(e) = self.save_values(values.clone()) {
                                    tracing::warn!(
                                        "Failed to restore backup as main config: {}",
                                        e
                                    );
                                } else {
                                    tracing::info!(
                                        "Restored config from backup: {:?}",
                                        backup_path
                                    );
                                }
                                return Ok(values);
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Backup file {:?} is also corrupted: {}",
                                    backup_path,
                                    e
                                );
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Could not read backup file {:?}: {}", backup_path, e);
                        continue;
                    }
                }
            }
        }

        Err(ConfigError::NotFound("No valid backup found".to_string()))
    }

    // Get list of backup file paths in order of preference
    fn get_backup_paths(&self) -> Vec<PathBuf> {
        let mut paths = Vec::new();

        // Primary backup (created by backup_config endpoint)
        if let Some(file_name) = self.config_path.file_name() {
            let mut backup_name = file_name.to_os_string();
            backup_name.push(".bak");
            paths.push(self.config_path.with_file_name(backup_name));
        }

        // Timestamped backups
        for i in 1..=5 {
            if let Some(file_name) = self.config_path.file_name() {
                let mut backup_name = file_name.to_os_string();
                backup_name.push(format!(".bak.{}", i));
                paths.push(self.config_path.with_file_name(backup_name));
            }
        }

        paths
    }

    fn load_init_config_if_exists(&self) -> Result<Mapping, ConfigError> {
        load_init_config_from_workspace()
    }

    fn save_values(&self, values: Mapping) -> Result<(), ConfigError> {
        // Create backup before writing new config
        self.create_backup_if_needed()?;

        // Convert to YAML for storage
        let yaml_value = serde_yaml::to_string(&values)?;

        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| ConfigError::DirectoryError(e.to_string()))?;
        }

        // Write to a temporary file first for atomic operation
        let temp_path = self.config_path.with_extension("tmp");

        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_path)?;

            // Acquire an exclusive lock
            file.lock_exclusive()
                .map_err(|e| ConfigError::LockError(e.to_string()))?;

            // Write the contents using the same file handle
            file.write_all(yaml_value.as_bytes())?;
            file.sync_all()?;

            // Unlock is handled automatically when file is dropped
        }

        // Atomically replace the original file
        std::fs::rename(&temp_path, &self.config_path)?;

        Ok(())
    }

    pub fn initialize_if_empty(&self, values: Mapping) -> Result<(), ConfigError> {
        let _guard = self.guard.lock().unwrap();
        if !self.exists() {
            self.save_values(values)
        } else {
            Ok(())
        }
    }

    // Create backup of current config file if it exists and is valid
    fn create_backup_if_needed(&self) -> Result<(), ConfigError> {
        if !self.config_path.exists() {
            return Ok(());
        }

        // Check if current config is valid before backing it up
        let current_content = std::fs::read_to_string(&self.config_path)?;
        if parse_yaml_content(&current_content).is_err() {
            // Don't back up corrupted files
            return Ok(());
        }

        // Rotate existing backups
        self.rotate_backups()?;

        // Create new backup
        if let Some(file_name) = self.config_path.file_name() {
            let mut backup_name = file_name.to_os_string();
            backup_name.push(".bak");
            let backup_path = self.config_path.with_file_name(backup_name);

            if let Err(e) = std::fs::copy(&self.config_path, &backup_path) {
                tracing::warn!("Failed to create config backup: {}", e);
                // Don't fail the entire operation if backup fails
            } else {
                tracing::debug!("Created config backup: {:?}", backup_path);
            }
        }

        Ok(())
    }

    // Rotate backup files to keep the most recent ones
    fn rotate_backups(&self) -> Result<(), ConfigError> {
        if let Some(file_name) = self.config_path.file_name() {
            // Move .bak.4 to .bak.5, .bak.3 to .bak.4, etc.
            for i in (1..5).rev() {
                let mut current_backup = file_name.to_os_string();
                current_backup.push(format!(".bak.{}", i));
                let current_path = self.config_path.with_file_name(&current_backup);

                let mut next_backup = file_name.to_os_string();
                next_backup.push(format!(".bak.{}", i + 1));
                let next_path = self.config_path.with_file_name(&next_backup);

                if current_path.exists() {
                    let _ = std::fs::rename(&current_path, &next_path);
                }
            }

            // Move .bak to .bak.1
            let mut backup_name = file_name.to_os_string();
            backup_name.push(".bak");
            let backup_path = self.config_path.with_file_name(&backup_name);

            if backup_path.exists() {
                let mut backup_1_name = file_name.to_os_string();
                backup_1_name.push(".bak.1");
                let backup_1_path = self.config_path.with_file_name(&backup_1_name);
                let _ = std::fs::rename(&backup_path, &backup_1_path);
            }
        }

        Ok(())
    }

    pub fn all_secrets(&self) -> Result<HashMap<String, Value>, ConfigError> {
        match &self.secrets {
            SecretStorage::Keyring { service } => {
                let entry = Entry::new(service, KEYRING_USERNAME)?;

                match entry.get_password() {
                    Ok(content) => {
                        let values: HashMap<String, Value> = serde_json::from_str(&content)?;
                        Ok(values)
                    }
                    Err(keyring::Error::NoEntry) => Ok(HashMap::new()),
                    Err(e) => Err(ConfigError::KeyringError(e.to_string())),
                }
            }
            SecretStorage::File { path } => {
                if path.exists() {
                    let file_content = std::fs::read_to_string(path)?;
                    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&file_content)?;
                    let json_value: Value = serde_json::to_value(yaml_value)?;
                    match json_value {
                        Value::Object(map) => Ok(map.into_iter().collect()),
                        _ => Ok(HashMap::new()),
                    }
                } else {
                    Ok(HashMap::new())
                }
            }
        }
    }

    /// Parse an environment variable value into a JSON Value.
    ///
    /// This function tries to intelligently parse environment variable values:
    /// 1. First attempts JSON parsing (for structured data)
    /// 2. If that fails, tries primitive type parsing for common cases
    /// 3. Falls back to string if nothing else works
    fn parse_env_value(val: &str) -> Result<Value, ConfigError> {
        // First try JSON parsing - this handles quoted strings, objects, arrays, etc.
        if let Ok(json_value) = serde_json::from_str(val) {
            return Ok(json_value);
        }

        let trimmed = val.trim();

        match trimmed.to_lowercase().as_str() {
            "true" => return Ok(Value::Bool(true)),
            "false" => return Ok(Value::Bool(false)),
            _ => {}
        }

        if let Ok(int_val) = trimmed.parse::<i64>() {
            return Ok(Value::Number(int_val.into()));
        }

        if let Ok(float_val) = trimmed.parse::<f64>() {
            if let Some(num) = serde_json::Number::from_f64(float_val) {
                return Ok(Value::Number(num));
            }
        }

        Ok(Value::String(val.to_string()))
    }

    // check all possible places for a parameter
    pub fn get(&self, key: &str, is_secret: bool) -> Result<Value, ConfigError> {
        if is_secret {
            self.get_secret(key)
        } else {
            self.get_param(key)
        }
    }

    // save a parameter in the appropriate location based on if it's secret or not
    pub fn set<V>(&self, key: &str, value: &V, is_secret: bool) -> Result<(), ConfigError>
    where
        V: Serialize,
    {
        if is_secret {
            self.set_secret(key, value)
        } else {
            self.set_param(key, value)
        }
    }

    /// Get a configuration value (non-secret).
    ///
    /// This will attempt to get the value from:
    /// 1. Environment variable with the exact key name
    /// 2. Configuration file
    ///
    /// The value will be deserialized into the requested type. This works with
    /// both simple types (String, i32, etc.) and complex types that implement
    /// serde::Deserialize.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - The key doesn't exist in either environment or config file
    /// - The value cannot be deserialized into the requested type
    /// - There is an error reading the config file
    pub fn get_param<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<T, ConfigError> {
        let env_key = key.to_uppercase();
        if let Ok(val) = env::var(&env_key) {
            let value = Self::parse_env_value(&val)?;
            return Ok(serde_json::from_value(value)?);
        }

        let values = self.load()?;
        values
            .get(key)
            .ok_or_else(|| ConfigError::NotFound(key.to_string()))
            .and_then(|v| Ok(serde_yaml::from_value(v.clone())?))
    }

    /// Set a configuration value in the config file (non-secret).
    ///
    /// This will immediately write the value to the config file. The value
    /// can be any type that can be serialized to JSON/YAML.
    ///
    /// Note that this does not affect environment variables - those can only
    /// be set through the system environment.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - There is an error reading or writing the config file
    /// - There is an error serializing the value
    pub fn set_param<V: Serialize>(&self, key: &str, value: V) -> Result<(), ConfigError> {
        let _guard = self.guard.lock().unwrap();
        let mut values = self.load()?;
        values.insert(serde_yaml::to_value(key)?, serde_yaml::to_value(value)?);
        self.save_values(values)
    }

    /// Delete a configuration value in the config file.
    ///
    /// This will immediately write the value to the config file. The value
    /// can be any type that can be serialized to JSON/YAML.
    ///
    /// Note that this does not affect environment variables - those can only
    /// be set through the system environment.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - There is an error reading or writing the config file
    /// - There is an error serializing the value
    pub fn delete(&self, key: &str) -> Result<(), ConfigError> {
        // Lock before reading to prevent race condition.
        let _guard = self.guard.lock().unwrap();

        let mut values = self.load()?;
        values.shift_remove(key);

        self.save_values(values)
    }

    /// Get a secret value.
    ///
    /// This will attempt to get the value from:
    /// 1. Environment variable with the exact key name
    /// 2. System keyring
    ///
    /// The value will be deserialized into the requested type. This works with
    /// both simple types (String, i32, etc.) and complex types that implement
    /// serde::Deserialize.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - The key doesn't exist in either environment or keyring
    /// - The value cannot be deserialized into the requested type
    /// - There is an error accessing the keyring
    pub fn get_secret<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<T, ConfigError> {
        // First check environment variables (convert to uppercase)
        let env_key = key.to_uppercase();
        if let Ok(val) = env::var(&env_key) {
            let value = Self::parse_env_value(&val)?;
            return Ok(serde_json::from_value(value)?);
        }

        // Then check keyring
        let values = self.all_secrets()?;
        values
            .get(key)
            .ok_or_else(|| ConfigError::NotFound(key.to_string()))
            .and_then(|v| Ok(serde_json::from_value(v.clone())?))
    }

    /// Get secrets. If primary is in env, use env for all keys. Otherwise use secret storage.
    pub fn get_secrets(
        &self,
        primary: &str,
        maybe_secret: &[&str],
    ) -> Result<HashMap<String, String>, ConfigError> {
        let use_env = env::var(primary.to_uppercase()).is_ok();
        let get_value = |key: &str| -> Result<String, ConfigError> {
            if use_env {
                env::var(key.to_uppercase()).map_err(|_| ConfigError::NotFound(key.to_string()))
            } else {
                self.get_secret(key)
            }
        };

        let mut result = HashMap::new();
        result.insert(primary.to_string(), get_value(primary)?);
        for &key in maybe_secret {
            if let Ok(v) = get_value(key) {
                result.insert(key.to_string(), v);
            }
        }
        Ok(result)
    }

    /// Set a secret value in the system keyring.
    ///
    /// This will store the value in a single JSON object in the system keyring,
    /// alongside any other secrets. The value can be any type that can be
    /// serialized to JSON.
    ///
    /// Note that this does not affect environment variables - those can only
    /// be set through the system environment.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - There is an error accessing the keyring
    /// - There is an error serializing the value
    pub fn set_secret<V>(&self, key: &str, value: &V) -> Result<(), ConfigError>
    where
        V: Serialize,
    {
        // Lock before reading to prevent race condition.
        let _guard = self.guard.lock().unwrap();

        let mut values = self.all_secrets()?;
        values.insert(key.to_string(), serde_json::to_value(value)?);

        match &self.secrets {
            SecretStorage::Keyring { service } => {
                let json_value = serde_json::to_string(&values)?;
                let entry = Entry::new(service, KEYRING_USERNAME)?;
                entry.set_password(&json_value)?;
            }
            SecretStorage::File { path } => {
                let yaml_value = serde_yaml::to_string(&values)?;
                std::fs::write(path, yaml_value)?;
            }
        };
        Ok(())
    }

    /// Delete a secret from the system keyring.
    ///
    /// This will remove the specified key from the JSON object in the system keyring.
    /// Other secrets will remain unchanged.
    ///
    /// # Errors
    ///
    /// Returns a ConfigError if:
    /// - There is an error accessing the keyring
    /// - There is an error serializing the remaining values
    pub fn delete_secret(&self, key: &str) -> Result<(), ConfigError> {
        // Lock before reading to prevent race condition.
        let _guard = self.guard.lock().unwrap();

        let mut values = self.all_secrets()?;
        values.remove(key);

        match &self.secrets {
            SecretStorage::Keyring { service } => {
                let json_value = serde_json::to_string(&values)?;
                let entry = Entry::new(service, KEYRING_USERNAME)?;
                entry.set_password(&json_value)?;
            }
            SecretStorage::File { path } => {
                let yaml_value = serde_yaml::to_string(&values)?;
                std::fs::write(path, yaml_value)?;
            }
        };
        Ok(())
    }
}

config_value!(CLAUDE_CODE_COMMAND, OsString, "claude");
config_value!(GEMINI_CLI_COMMAND, OsString, "gemini");
config_value!(CURSOR_AGENT_COMMAND, OsString, "cursor-agent");
config_value!(CODEX_COMMAND, OsString, "codex");
config_value!(CODEX_REASONING_EFFORT, String, "high");
config_value!(CODEX_ENABLE_SKILLS, String, "true");
config_value!(CODEX_SKIP_GIT_CHECK, String, "false");
config_value!(CODEX_USE_APP_SERVER, String, "true");

config_value!(ASTER_SEARCH_PATHS, Vec<String>);
config_value!(ASTER_MODE, AsterMode);
config_value!(ASTER_PROVIDER, String);
config_value!(ASTER_MODEL, String);
config_value!(ASTER_MAX_ACTIVE_AGENTS, usize);

/// Load init-config.yaml from workspace root if it exists.
/// This function is shared between the config recovery and the init_config endpoint.
pub fn load_init_config_from_workspace() -> Result<Mapping, ConfigError> {
    let workspace_root = match std::env::current_exe() {
        Ok(mut exe_path) => {
            while let Some(parent) = exe_path.parent() {
                let cargo_toml = parent.join("Cargo.toml");
                if cargo_toml.exists() {
                    if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
                        if content.contains("[workspace]") {
                            exe_path = parent.to_path_buf();
                            break;
                        }
                    }
                }
                exe_path = parent.to_path_buf();
            }
            exe_path
        }
        Err(_) => {
            return Err(ConfigError::FileError(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Could not determine executable path",
            )))
        }
    };

    let init_config_path = workspace_root.join("init-config.yaml");
    if !init_config_path.exists() {
        return Err(ConfigError::NotFound(
            "init-config.yaml not found".to_string(),
        ));
    }

    let init_content = std::fs::read_to_string(&init_config_path)?;
    parse_yaml_content(&init_content)
}
