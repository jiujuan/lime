//! Skill 命令错误码与格式化工具
//!
//! 约定错误消息格式：`<code>|<message>`
//! 例如：`skill_not_found|未找到名为 "writer" 的 Skill`

pub const SKILL_ERR_CATALOG_UNAVAILABLE: &str = "skill_catalog_unavailable";
pub const SKILL_ERR_NOT_FOUND: &str = "skill_not_found";
pub const SKILL_ERR_SESSION_INIT_FAILED: &str = "skill_session_init_failed";
pub const SKILL_ERR_PROVIDER_UNAVAILABLE: &str = "skill_provider_unavailable";
pub const SKILL_ERR_EXECUTE_FAILED: &str = "skill_execute_failed";

pub fn format_skill_error(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}|{}", message.as_ref())
}

pub fn map_find_skill_error(error: String) -> String {
    let normalized = error.to_lowercase();
    if normalized.contains("not found") || error.contains("不存在") {
        return format_skill_error(SKILL_ERR_NOT_FOUND, error);
    }

    format_skill_error(
        SKILL_ERR_EXECUTE_FAILED,
        format!("加载 Skill 失败: {error}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_skill_error() {
        let result = format_skill_error(SKILL_ERR_NOT_FOUND, "foo");
        assert_eq!(result, "skill_not_found|foo");
    }

    #[test]
    fn test_map_find_skill_error_not_found() {
        let result = map_find_skill_error("Skill not found: demo".to_string());
        assert!(result.starts_with("skill_not_found|"));
    }

    #[test]
    fn test_map_find_skill_error_generic() {
        let result = map_find_skill_error("io failure".to_string());
        assert!(result.starts_with("skill_execute_failed|"));
    }
}
