use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StylePackInstallStatus {
    Discovered,
    Downloading,
    Validating,
    Installing,
    Installed,
    Enabled,
    Disabled,
    Failed,
    Uninstalled,
}

impl StylePackInstallStatus {
    pub(crate) fn from_registry_entry(entry: &Value) -> Result<Self, String> {
        let status = entry
            .get("status")
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
            .ok_or_else(|| "Soul Style Pack registry 缺少 status".to_string())?;
        Self::from_str(status)
    }

    pub(crate) fn from_str(status: &str) -> Result<Self, String> {
        match status {
            "discovered" => Ok(Self::Discovered),
            "downloading" => Ok(Self::Downloading),
            "validating" => Ok(Self::Validating),
            "installing" => Ok(Self::Installing),
            "installed" => Ok(Self::Installed),
            "enabled" => Ok(Self::Enabled),
            "disabled" => Ok(Self::Disabled),
            "failed" => Ok(Self::Failed),
            "uninstalled" => Ok(Self::Uninstalled),
            _ => Err(format!("未知 Soul Style Pack install status: {status}")),
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Discovered => "discovered",
            Self::Downloading => "downloading",
            Self::Validating => "validating",
            Self::Installing => "installing",
            Self::Installed => "installed",
            Self::Enabled => "enabled",
            Self::Disabled => "disabled",
            Self::Failed => "failed",
            Self::Uninstalled => "uninstalled",
        }
    }

    pub(crate) fn can_transition_to(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Discovered, Self::Downloading)
                | (Self::Discovered, Self::Validating)
                | (Self::Downloading, Self::Validating)
                | (Self::Downloading, Self::Failed)
                | (Self::Validating, Self::Installing)
                | (Self::Validating, Self::Failed)
                | (Self::Installing, Self::Installed)
                | (Self::Installing, Self::Failed)
                | (Self::Installed, Self::Enabled)
                | (Self::Installed, Self::Uninstalled)
                | (Self::Enabled, Self::Disabled)
                | (Self::Disabled, Self::Enabled)
                | (Self::Disabled, Self::Uninstalled)
                | (Self::Failed, Self::Discovered)
        )
    }

    pub(crate) fn ensure_transition_to(self, next: Self) -> Result<(), String> {
        if self.can_transition_to(next) {
            return Ok(());
        }
        Err(format!(
            "Soul Style Pack install status transition 不合法: {} -> {}",
            self.as_str(),
            next.as_str()
        ))
    }

    pub(crate) fn is_prompt_readable(self) -> bool {
        matches!(self, Self::Enabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_documented_install_status_transitions() {
        for (from, to) in [
            (
                StylePackInstallStatus::Discovered,
                StylePackInstallStatus::Downloading,
            ),
            (
                StylePackInstallStatus::Discovered,
                StylePackInstallStatus::Validating,
            ),
            (
                StylePackInstallStatus::Downloading,
                StylePackInstallStatus::Validating,
            ),
            (
                StylePackInstallStatus::Downloading,
                StylePackInstallStatus::Failed,
            ),
            (
                StylePackInstallStatus::Validating,
                StylePackInstallStatus::Installing,
            ),
            (
                StylePackInstallStatus::Validating,
                StylePackInstallStatus::Failed,
            ),
            (
                StylePackInstallStatus::Installing,
                StylePackInstallStatus::Installed,
            ),
            (
                StylePackInstallStatus::Installing,
                StylePackInstallStatus::Failed,
            ),
            (
                StylePackInstallStatus::Installed,
                StylePackInstallStatus::Enabled,
            ),
            (
                StylePackInstallStatus::Installed,
                StylePackInstallStatus::Uninstalled,
            ),
            (
                StylePackInstallStatus::Enabled,
                StylePackInstallStatus::Disabled,
            ),
            (
                StylePackInstallStatus::Disabled,
                StylePackInstallStatus::Enabled,
            ),
            (
                StylePackInstallStatus::Disabled,
                StylePackInstallStatus::Uninstalled,
            ),
            (
                StylePackInstallStatus::Failed,
                StylePackInstallStatus::Discovered,
            ),
        ] {
            from.ensure_transition_to(to).expect("allowed transition");
        }
    }

    #[test]
    fn rejects_shortcuts_that_would_leave_half_installed_packs_readable() {
        assert!(StylePackInstallStatus::Discovered
            .ensure_transition_to(StylePackInstallStatus::Enabled)
            .is_err());
        assert!(StylePackInstallStatus::Failed
            .ensure_transition_to(StylePackInstallStatus::Enabled)
            .is_err());
        assert!(StylePackInstallStatus::Uninstalled
            .ensure_transition_to(StylePackInstallStatus::Enabled)
            .is_err());
    }

    #[test]
    fn only_enabled_status_is_prompt_readable() {
        for status in [
            StylePackInstallStatus::Discovered,
            StylePackInstallStatus::Downloading,
            StylePackInstallStatus::Validating,
            StylePackInstallStatus::Installing,
            StylePackInstallStatus::Installed,
            StylePackInstallStatus::Disabled,
            StylePackInstallStatus::Failed,
            StylePackInstallStatus::Uninstalled,
        ] {
            assert!(!status.is_prompt_readable(), "{}", status.as_str());
        }
        assert!(StylePackInstallStatus::Enabled.is_prompt_readable());
    }
}
