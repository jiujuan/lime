use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonSettings {
    #[serde(default)]
    pub allow_env_override: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resource_relative_path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_policy_path: Option<PathBuf>,
}

impl DaemonSettings {
    pub fn load(path: &Path) -> Result<Self, String> {
        let contents = match fs::read_to_string(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => {
                return Err(format!(
                    "failed to read app-server daemon settings {}: {error}",
                    path.display()
                ));
            }
        };

        serde_json::from_str(&contents).map_err(|error| {
            format!(
                "failed to parse app-server daemon settings {}: {error}",
                path.display()
            )
        })
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "failed to create app-server daemon settings directory {}: {error}",
                    parent.display()
                )
            })?;
        }
        let contents = serde_json::to_vec_pretty(self)
            .map_err(|error| format!("failed to serialize app-server daemon settings: {error}"))?;
        fs::write(path, contents).map_err(|error| {
            format!(
                "failed to write app-server daemon settings {}: {error}",
                path.display()
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn daemon_settings_use_camel_case_json() {
        let settings = DaemonSettings {
            allow_env_override: true,
            resource_relative_path: Some(PathBuf::from("app-server/darwin-arm64/app-server")),
            backend_mode: Some("external".to_string()),
            app_policy_path: Some(PathBuf::from("content-studio.policy.json")),
        };

        let value = serde_json::to_value(settings).expect("settings json");

        assert_eq!(value["allowEnvOverride"], true);
        assert_eq!(
            value["resourceRelativePath"],
            "app-server/darwin-arm64/app-server"
        );
        assert_eq!(value["backendMode"], "external");
        assert_eq!(value["appPolicyPath"], "content-studio.policy.json");
    }

    #[test]
    fn daemon_settings_missing_file_loads_default_and_save_creates_parent() {
        let path = temp_settings_path("nested/settings.json");

        assert_eq!(
            DaemonSettings::load(&path).expect("default settings"),
            DaemonSettings::default()
        );

        let settings = DaemonSettings {
            allow_env_override: true,
            ..DaemonSettings::default()
        };
        settings.save(&path).expect("save");

        assert_eq!(DaemonSettings::load(&path).expect("load"), settings);
        let _ = std::fs::remove_dir_all(path.parent().and_then(Path::parent).expect("temp root"));
    }

    fn temp_settings_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir()
            .join(format!("app-server-daemon-settings-{nanos}"))
            .join(name)
    }
}
