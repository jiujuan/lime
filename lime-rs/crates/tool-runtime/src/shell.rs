use serde_json::Value;

pub const SHELL_COMMAND_PARAM_KEYS: &[&str] = &["command", "cmd", "script"];
pub const WORKING_DIRECTORY_PARAM_KEYS: &[&str] = &["cwd", "workingDir", "working_dir"];

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
    matches!(
        normalized_tool_name(tool_name).as_str(),
        "bash" | "powershell" | "bashtool" | "powershelltool" | "shellcommand" | "execcommand"
    )
}

pub fn shell_command_for_tool(tool_name: &str, command: &str) -> Vec<String> {
    if normalized_tool_name(tool_name).contains("powershell") {
        return powershell_command(command);
    }
    default_shell_command(command)
}

pub fn default_shell_command(command: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            "cmd".to_string(),
            "/D".to_string(),
            "/S".to_string(),
            "/C".to_string(),
            command.to_string(),
        ]
    } else {
        vec!["sh".to_string(), "-c".to_string(), command.to_string()]
    }
}

pub fn powershell_command(command: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            "powershell.exe".to_string(),
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-Command".to_string(),
            command.to_string(),
        ]
    } else {
        default_shell_command(command)
    }
}

pub fn param_string(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
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
    use serde_json::json;

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
    fn shell_command_for_tool_should_wrap_by_tool_kind() {
        assert!(is_shell_tool_name("PowerShellTool"));
        let command = shell_command_for_tool("Bash", "cargo check");
        if cfg!(windows) {
            assert_eq!(command, vec!["cmd", "/D", "/S", "/C", "cargo check"]);
        } else {
            assert_eq!(command, vec!["sh", "-c", "cargo check"]);
        }
    }

    #[test]
    fn param_string_should_preserve_first_matching_string_semantics() {
        let value = json!({
            "command": " ",
            "cmd": " cargo test ",
            "script": "ignored",
        });

        assert_eq!(param_string(&value, SHELL_COMMAND_PARAM_KEYS), None);
        assert_eq!(
            param_string(&json!({ "cmd": " cargo test " }), SHELL_COMMAND_PARAM_KEYS),
            Some("cargo test".to_string()),
        );
        assert_eq!(param_string(&value, &["missing"]), None);
    }
}
