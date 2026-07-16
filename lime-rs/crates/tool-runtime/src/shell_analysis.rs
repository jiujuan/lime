mod bash;
mod common;
mod powershell;

use std::path::{Path, PathBuf};

use crate::path_guard::PathMutationCandidate;

pub fn is_bash_command_concurrency_safe(command: &str) -> bool {
    bash::is_command_concurrency_safe(command)
}

pub fn is_powershell_command_concurrency_safe(command: &str) -> bool {
    powershell::is_command_concurrency_safe(command)
}

pub fn missing_bash_read_targets(command: &str, cwd: &Path) -> Vec<PathBuf> {
    bash::missing_read_targets(command, cwd)
}

pub fn missing_powershell_read_targets(command: &str, cwd: &Path) -> Vec<PathBuf> {
    powershell::missing_read_targets(command, cwd)
}

pub fn command_references_wsl_drive_mount(command: &str) -> bool {
    common::command_references_wsl_drive_mount(command)
}

pub fn detect_blocked_sleep_pattern(command: &str) -> Option<String> {
    powershell::detect_blocked_sleep_pattern(command)
}

pub(crate) fn normalized_tool_name(tool_name: &str) -> String {
    common::normalized_tool_name(tool_name)
}

pub(crate) fn collect_bash_path_candidates(command: &str) -> Vec<PathMutationCandidate> {
    bash::collect_path_candidates(command)
}

pub(crate) fn collect_powershell_path_candidates(command: &str) -> Vec<PathMutationCandidate> {
    powershell::collect_path_candidates(command)
}

pub(crate) fn has_dangerous_device_redirect(command: &str) -> bool {
    bash::has_dangerous_device_redirect(command)
}

pub(crate) fn detect_high_risk_bash_reason(command: &str) -> Option<String> {
    bash::detect_high_risk_reason(command)
}

pub(crate) fn detect_high_risk_powershell_reason(command: &str) -> Option<String> {
    powershell::detect_high_risk_reason(command)
}

pub(crate) fn detect_mutating_bash_warning(command: &str) -> Option<String> {
    bash::detect_mutating_warning(command)
}

pub(crate) fn detect_mutating_powershell_warning(command: &str) -> Option<String> {
    powershell::detect_mutating_warning(command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn bash_read_target_reports_missing_file() {
        let cwd = std::env::temp_dir().join(format!(
            "tool-runtime-shell-analysis-{}",
            std::process::id()
        ));
        fs::create_dir_all(&cwd).unwrap();
        let missing = missing_bash_read_targets("cat missing.txt", &cwd);
        assert_eq!(missing, vec![cwd.join("missing.txt")]);
        let _ = fs::remove_dir_all(&cwd);
    }

    #[test]
    fn bash_read_target_ignores_file_descriptor_redirection() {
        let cwd = std::env::temp_dir().join(format!(
            "tool-runtime-shell-analysis-redirection-{}",
            std::process::id()
        ));
        let packages = cwd.join("packages");
        fs::create_dir_all(&packages).unwrap();

        let missing =
            missing_bash_read_targets("ls packages/ 2>/dev/null || echo \"no packages dir\"", &cwd);

        assert!(missing.is_empty());
        let _ = fs::remove_dir_all(&cwd);
    }

    #[test]
    fn powershell_read_target_reports_missing_file() {
        let cwd = std::env::temp_dir().join(format!(
            "tool-runtime-shell-analysis-pwsh-{}",
            std::process::id()
        ));
        fs::create_dir_all(&cwd).unwrap();
        let missing = missing_powershell_read_targets("Get-Content missing.txt", &cwd);
        assert_eq!(missing, vec![cwd.join("missing.txt")]);
        let _ = fs::remove_dir_all(&cwd);
    }

    #[test]
    fn bash_concurrency_safe_accepts_read_only_pipeline() {
        assert!(is_bash_command_concurrency_safe("rg foo src | head -20"));
    }

    #[test]
    fn bash_concurrency_safe_rejects_mutation() {
        assert!(!is_bash_command_concurrency_safe("mkdir tmp-output"));
        assert!(!is_bash_command_concurrency_safe("git checkout main"));
    }

    #[test]
    fn powershell_concurrency_safe_accepts_read_only_pipeline() {
        assert!(is_powershell_command_concurrency_safe(
            "Get-Content README.md | Select-String Lime"
        ));
    }

    #[test]
    fn powershell_concurrency_safe_rejects_mutation() {
        assert!(!is_powershell_command_concurrency_safe(
            "Set-Content out.txt hi"
        ));
        assert!(!is_powershell_command_concurrency_safe("git checkout main"));
    }

    #[test]
    fn blocked_sleep_pattern_reports_long_first_sleep() {
        assert_eq!(
            detect_blocked_sleep_pattern("Start-Sleep 5"),
            Some("standalone Start-Sleep 5".to_string())
        );
        assert_eq!(
            detect_blocked_sleep_pattern("sleep 4; Get-Process"),
            Some("Start-Sleep 4 followed by: Get-Process".to_string())
        );
        assert_eq!(detect_blocked_sleep_pattern("Start-Sleep 1"), None);
    }

    #[test]
    fn powershell_env_assign_segment_does_not_panic() {
        let command = "$p = 'C:/Users/coso/.yansu-agent'; if (Test-Path $p) { Get-ChildItem $p }";
        let candidates = collect_powershell_path_candidates(command);
        assert!(candidates.is_empty());
    }
}
