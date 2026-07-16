pub fn process_id_for_tool(tool_id: &str) -> String {
    format!("process-{tool_id}")
}

pub fn shell_command_text_from_argv(command: &[String]) -> String {
    command
        .iter()
        .skip_while(|part| shell_wrapper_part(part))
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_shell_tool_name(tool_name: &str) -> bool {
    normalized_tool_name(tool_name) == "execcommand"
}

fn shell_wrapper_part(part: &str) -> bool {
    matches!(
        part,
        "sh" | "bash"
            | "zsh"
            | "cmd"
            | "cmd.exe"
            | "powershell"
            | "powershell.exe"
            | "pwsh"
            | "pwsh.exe"
            | "-c"
            | "/C"
            | "/c"
            | "/D"
            | "/S"
            | "-NoProfile"
            | "-NonInteractive"
            | "-Command"
    )
}

fn normalized_tool_name(tool_name: &str) -> String {
    tool_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_command_text_should_strip_known_wrappers() {
        assert_eq!(
            shell_command_text_from_argv(&[
                "powershell.exe".to_string(),
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                "cargo test".to_string(),
            ]),
            "cargo test"
        );
        assert_eq!(
            shell_command_text_from_argv(&["sh".to_string(), "-c".to_string(), "pwd".to_string()]),
            "pwd"
        );
    }

    #[test]
    fn only_codex_exec_command_is_a_current_shell_tool() {
        assert!(is_shell_tool_name("exec_command"));
        assert!(!is_shell_tool_name("Bash"));
        assert!(!is_shell_tool_name("PowerShell"));
    }
}
