//! 全局快捷键安全边界。
//!
//! 系统输入法切换通常依赖 Space 组合键。应用一旦把这些组合注册为全局快捷键，
//! 用户在任意输入框里都会感觉“输入法切不动”，所以在注册前统一拦截。

const RESERVED_INPUT_METHOD_SHORTCUT_REASON: &str =
    "快捷键与系统输入法切换冲突，请换成包含字母或数字的组合，例如 CommandOrControl+Shift+V";

const RESERVED_INPUT_METHOD_SHORTCUTS: &[&[&str]] = &[
    &["commandorcontrol", "space"],
    &["control", "space"],
    &["command", "space"],
    &["super", "space"],
    &["alt", "space"],
    &["shift", "space"],
    &["control", "alt", "space"],
    &["commandorcontrol", "alt", "space"],
];

pub(crate) fn reserved_system_shortcut_reason(shortcut: &str) -> Option<&'static str> {
    let tokens = normalized_shortcut_tokens(shortcut);
    let reserved = RESERVED_INPUT_METHOD_SHORTCUTS
        .iter()
        .any(|candidate| matches_shortcut_tokens(&tokens, candidate));

    reserved.then_some(RESERVED_INPUT_METHOD_SHORTCUT_REASON)
}

fn normalized_shortcut_tokens(shortcut: &str) -> Vec<String> {
    let mut tokens: Vec<String> = shortcut
        .split('+')
        .filter_map(|token| {
            let normalized = normalize_shortcut_token(token);
            (!normalized.is_empty()).then_some(normalized)
        })
        .collect();
    tokens.sort();
    tokens.dedup();
    tokens
}

fn normalize_shortcut_token(token: &str) -> String {
    let compact = token
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '-', '_'], "");

    match compact.as_str() {
        "ctrl" | "control" => "control".to_string(),
        "cmd" | "command" => "command".to_string(),
        "cmdorctrl" | "cmdorcontrol" | "commandorcontrol" => "commandorcontrol".to_string(),
        "option" | "alt" => "alt".to_string(),
        "win" | "windows" | "meta" | "super" => "super".to_string(),
        "spacebar" | "space" => "space".to_string(),
        _ => compact,
    }
}

fn matches_shortcut_tokens(tokens: &[String], candidate: &[&str]) -> bool {
    tokens.len() == candidate.len()
        && candidate
            .iter()
            .all(|candidate_token| tokens.iter().any(|token| token == candidate_token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_input_method_reserved_space_shortcuts() {
        for shortcut in [
            "CommandOrControl+Space",
            "Ctrl+Space",
            "Command+Space",
            "Super+Space",
            "Win+Space",
            "Alt+Space",
            "Shift+Space",
            "Control+Alt+Space",
        ] {
            assert!(
                reserved_system_shortcut_reason(shortcut).is_some(),
                "{shortcut} should be reserved",
            );
        }
    }

    #[test]
    fn keeps_normal_global_shortcuts_available() {
        for shortcut in [
            "CommandOrControl+Shift+V",
            "CommandOrControl+Alt+Q",
            "Ctrl+C",
            "Shift+A",
        ] {
            assert!(
                reserved_system_shortcut_reason(shortcut).is_none(),
                "{shortcut} should stay available",
            );
        }
    }
}
