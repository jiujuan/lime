use regex::Regex;
use std::path::Path;
use std::sync::OnceLock;

use crate::path_guard::{
    evaluate_path_mutations, summarize_paths, summarize_raw_paths, PathGuardFinding,
    PathMutationCandidate,
};
use crate::shell_analysis::{
    collect_bash_path_candidates, collect_powershell_path_candidates, detect_blocked_sleep_pattern,
    detect_high_risk_bash_reason, detect_high_risk_powershell_reason, detect_mutating_bash_warning,
    detect_mutating_powershell_warning, has_dangerous_device_redirect, normalized_tool_name,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellPermissionDecision {
    Allow,
    Deny(String),
    RequiresConfirmation(String),
}

impl ShellPermissionDecision {
    pub fn into_result_without_confirmation(self) -> Result<(), String> {
        match self {
            Self::Allow => Ok(()),
            Self::Deny(reason) | Self::RequiresConfirmation(reason) => Err(reason),
        }
    }
}

pub fn check_shell_command_permission(
    tool_name: &str,
    command: &str,
    working_directory: &Path,
) -> ShellPermissionDecision {
    if cfg!(target_os = "windows") || normalized_tool_name(tool_name).contains("powershell") {
        return check_powershell_command_permission(command, working_directory);
    }
    check_bash_command_permission(command, working_directory)
}

pub fn check_bash_command_permission(
    command: &str,
    working_directory: &Path,
) -> ShellPermissionDecision {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return ShellPermissionDecision::Deny("Missing command parameter".to_string());
    }
    for dangerous in default_bash_dangerous_commands() {
        if trimmed.to_ascii_lowercase().contains(dangerous) {
            return ShellPermissionDecision::Deny(format!(
                "Command contains dangerous pattern: '{dangerous}'"
            ));
        }
    }
    if bash_fork_bomb_re().is_match(trimmed)
        || trimmed.contains("${:|:&}")
        || bash_self_spawn_re().is_match(trimmed)
    {
        return ShellPermissionDecision::Deny("Command appears to be a fork bomb".to_string());
    }
    if has_dangerous_device_redirect(trimmed) {
        return ShellPermissionDecision::Deny(
            "Command contains dangerous redirect to device file".to_string(),
        );
    }
    if let Some(reason) = detect_high_risk_bash_reason(trimmed) {
        return ShellPermissionDecision::Deny(reason);
    }
    if let Some(path_decision) = validate_command_paths(
        &collect_bash_path_candidates(trimmed),
        working_directory,
        "",
    ) {
        return path_decision;
    }
    if let Some(warning) = bash_warning(trimmed) {
        return ShellPermissionDecision::RequiresConfirmation(format!(
            "Command may be dangerous: {warning}. Do you want to proceed?"
        ));
    }

    ShellPermissionDecision::Allow
}

pub fn check_powershell_command_permission(
    command: &str,
    working_directory: &Path,
) -> ShellPermissionDecision {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return ShellPermissionDecision::Deny("Command cannot be empty".to_string());
    }
    if detect_blocked_sleep_pattern(trimmed).is_some() {
        return ShellPermissionDecision::Deny(
            "Blocked: long Start-Sleep commands should use the Sleep tool or run_in_background."
                .to_string(),
        );
    }
    if let Some(reason) = detect_high_risk_powershell_reason(trimmed) {
        return ShellPermissionDecision::Deny(reason);
    }
    for pattern in default_powershell_dangerous_patterns() {
        if pattern.is_match(trimmed) {
            return ShellPermissionDecision::Deny(format!(
                "Command contains dangerous PowerShell pattern: {}",
                pattern.as_str()
            ));
        }
    }
    if let Some(path_decision) = validate_command_paths(
        &collect_powershell_path_candidates(trimmed),
        working_directory,
        "PowerShell ",
    ) {
        return path_decision;
    }
    if let Some(warning) = powershell_warning(trimmed) {
        return ShellPermissionDecision::RequiresConfirmation(format!(
            "PowerShell command may be dangerous: {warning}. Do you want to proceed?"
        ));
    }

    ShellPermissionDecision::Allow
}

fn default_bash_dangerous_commands() -> &'static [&'static str] {
    &[
        "rm -rf /",
        "rm -rf /*",
        "rm -rf ~",
        "rm -rf ~/*",
        "rm -rf .",
        "rm -rf ..",
        "mkfs",
        "fdisk",
        "dd if=/dev/zero",
        "dd if=/dev/random",
        ":(){ :|:& };:",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
        "init 0",
        "init 6",
        "> /dev/sda",
        "> /dev/hda",
        "nc -l",
        "chmod 777 /",
        "chown -r",
    ]
}

fn bash_warning(command: &str) -> Option<String> {
    for pattern in default_bash_warning_patterns() {
        if pattern.is_match(command) {
            return Some(format!("Matches warning pattern: {}", pattern.as_str()));
        }
    }
    detect_mutating_bash_warning(command)
}

fn powershell_warning(command: &str) -> Option<String> {
    for pattern in default_powershell_warning_patterns() {
        if pattern.is_match(command) {
            return Some(format!(
                "Command matches warning pattern: {}",
                pattern.as_str()
            ));
        }
    }
    detect_mutating_powershell_warning(command)
}

fn default_bash_warning_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            [
                r"rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*)+",
                r"sudo\s+",
                r"(curl|wget)\s+.*\|\s*(bash|sh|zsh)",
                r"chmod\s+[0-7]*7[0-7]*",
                r"kill\s+-9\s+-1",
                r"killall",
                r"export\s+PATH=",
                r"export\s+LD_PRELOAD",
                r"git\s+push\s+.*--force",
                r"git\s+push\s+-f",
                r"DROP\s+DATABASE",
                r"DROP\s+TABLE",
                r"docker\s+rm\s+-f",
                r"docker\s+system\s+prune",
            ]
            .iter()
            .filter_map(|pattern| Regex::new(pattern).ok())
            .collect()
        })
        .as_slice()
}

fn default_powershell_dangerous_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            [
                r"(?i)\b(format-volume|clear-disk|diskpart|stop-computer|restart-computer)\b",
                r"(?i)\bremove-item\b.+\b(recurse|force)\b.+\b([a-z]:\\|/)\b",
            ]
            .iter()
            .filter_map(|pattern| Regex::new(pattern).ok())
            .collect()
        })
        .as_slice()
}

fn default_powershell_warning_patterns() -> &'static [Regex] {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS
        .get_or_init(|| {
            [
                r"(?i)\b(remove-item|clear-content|stop-process|set-executionpolicy)\b",
                r"(?i)\b(invoke-expression|iex)\b",
                r"(?i)\bstart-process\b.+\b-verb\s+runas\b",
                r"(?i)\bgit\s+push\s+.*(--force|-f)\b",
            ]
            .iter()
            .filter_map(|pattern| Regex::new(pattern).ok())
            .collect()
        })
        .as_slice()
}

fn bash_fork_bomb_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:").expect("valid bash fork bomb regex")
    })
}

fn bash_self_spawn_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\.\/\s*\$0\s*&").expect("valid self spawn regex"))
}

fn validate_command_paths(
    candidates: &[PathMutationCandidate],
    cwd: &Path,
    prefix: &str,
) -> Option<ShellPermissionDecision> {
    match evaluate_path_mutations(candidates, cwd)? {
        PathGuardFinding::ProtectedPaths(paths) => Some(ShellPermissionDecision::Deny(format!(
            "Blocked: {prefix}command targets protected path(s): {}",
            summarize_paths(&paths)
        ))),
        PathGuardFinding::OutsideWorkspace(paths) => {
            Some(ShellPermissionDecision::RequiresConfirmation(format!(
                "{prefix}command modifies path(s) outside the current working directory: {}. Do you want to proceed?",
                summarize_paths(&paths)
            )))
        }
        PathGuardFinding::DynamicPaths(paths) => {
            Some(ShellPermissionDecision::RequiresConfirmation(format!(
                "{prefix}command uses path expression(s) that cannot be validated safely: {}. Do you want to proceed?",
                summarize_raw_paths(&paths)
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bash_permission_denies_dangerous_root_remove() {
        let decision = check_bash_command_permission("rm -rf /", Path::new("/tmp/project"));
        assert!(
            matches!(decision, ShellPermissionDecision::Deny(reason) if reason.contains("dangerous"))
        );
    }

    #[test]
    fn bash_permission_requires_confirmation_for_workspace_escape() {
        let decision =
            check_bash_command_permission("rm ../outside.txt", Path::new("/tmp/project"));
        assert!(matches!(
            decision,
            ShellPermissionDecision::RequiresConfirmation(reason)
                if reason.contains("outside the current working directory")
        ));
    }

    #[test]
    fn bash_permission_denies_protected_git_path() {
        let decision = check_bash_command_permission("rm .git/config", Path::new("/tmp/project"));
        assert!(
            matches!(decision, ShellPermissionDecision::Deny(reason) if reason.contains("protected path"))
        );
    }

    #[test]
    fn powershell_permission_denies_high_risk_git_reset() {
        let decision =
            check_powershell_command_permission("git reset --hard HEAD", Path::new("/tmp/project"));
        assert!(
            matches!(decision, ShellPermissionDecision::Deny(reason) if reason.contains("reset --hard"))
        );
    }

    #[test]
    fn powershell_permission_requires_confirmation_for_write_path_escape() {
        let decision = check_powershell_command_permission(
            "Set-Content -Path ../outside.txt -Value hi",
            Path::new("/tmp/project"),
        );
        assert!(matches!(
            decision,
            ShellPermissionDecision::RequiresConfirmation(reason)
                if reason.contains("outside the current working directory")
        ));
    }
}
