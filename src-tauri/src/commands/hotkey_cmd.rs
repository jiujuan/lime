use tauri::command;
use tauri_plugin_global_shortcut::Shortcut;

#[command]
pub fn validate_shortcut(shortcut_str: String) -> Result<bool, String> {
    if shortcut_str.trim().is_empty() {
        return Err("快捷键不能为空".to_string());
    }

    shortcut_str
        .parse::<Shortcut>()
        .map_err(|error| format!("无法解析快捷键 '{shortcut_str}': {error}"))?;

    if let Some(reason) =
        crate::global_shortcut_guard::reserved_system_shortcut_reason(&shortcut_str)
    {
        return Err(reason.to_string());
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_shortcut_accepts_common_global_shortcuts() {
        assert!(validate_shortcut("CommandOrControl+Shift+S".to_string()).is_ok());
        assert!(validate_shortcut("Alt+F4".to_string()).is_ok());
        assert!(validate_shortcut("Ctrl+C".to_string()).is_ok());
    }

    #[test]
    fn validate_shortcut_rejects_invalid_values() {
        assert!(validate_shortcut("".to_string()).is_err());
        assert!(validate_shortcut("InvalidKey".to_string()).is_err());
    }

    #[test]
    fn validate_shortcut_rejects_input_method_reserved_shortcuts() {
        let result = validate_shortcut("CommandOrControl+Space".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("输入法切换"));
    }
}
