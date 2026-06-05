const LEGACY_DECISION_PREFIXES: [&str; 2] = ["已决定：", "已决定:"];

pub fn normalize_legacy_runtime_status_title(title: &str) -> String {
    let trimmed = title.trim();

    for prefix in LEGACY_DECISION_PREFIXES {
        if let Some(stripped) = trimmed.strip_prefix(prefix) {
            return stripped.trim().to_string();
        }
    }

    trimmed.to_string()
}

pub fn normalize_legacy_turn_summary_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut lines = trimmed.lines();
    let Some(first_line) = lines.next() else {
        return String::new();
    };

    let normalized_first_line = normalize_legacy_runtime_status_title(first_line);
    let remaining = lines.collect::<Vec<_>>();

    if remaining.is_empty() {
        return normalized_first_line;
    }

    if normalized_first_line.is_empty() {
        return remaining.join("\n").trim().to_string();
    }

    format!("{normalized_first_line}\n{}", remaining.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_legacy_runtime_status_title, normalize_legacy_turn_summary_text};

    #[test]
    fn test_normalize_legacy_runtime_status_title_strips_decision_prefix() {
        assert_eq!(
            normalize_legacy_runtime_status_title("已决定：先深度思考"),
            "先深度思考"
        );
        assert_eq!(
            normalize_legacy_runtime_status_title("已决定: 直接回答优先"),
            "直接回答优先"
        );
        assert_eq!(
            normalize_legacy_runtime_status_title("直接回答优先"),
            "直接回答优先"
        );
    }

    #[test]
    fn test_normalize_legacy_turn_summary_text_strips_only_first_line_prefix() {
        assert_eq!(
            normalize_legacy_turn_summary_text(
                "已决定：先规划再输出\n当前请求更像计划拆解。\n• 检测到计划需求"
            ),
            "先规划再输出\n当前请求更像计划拆解。\n• 检测到计划需求"
        );
        assert_eq!(
            normalize_legacy_turn_summary_text("已决定：直接回答优先"),
            "直接回答优先"
        );
    }
}
