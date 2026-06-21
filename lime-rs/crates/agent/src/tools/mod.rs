//! Tools 模块
//!
//! 提供各种工具的包装器和辅助函数

pub mod apply_patch_tool;
pub mod browser_tool;
pub mod skill_search_tool;
pub mod skill_tool_gate;

pub use crate::agent_tools::catalog::SKILL_SEARCH_TOOL_NAME;
pub use apply_patch_tool::{ApplyPatchTool, APPLY_PATCH_TOOL_NAME};
pub use browser_tool::{BrowserAction, BrowserTool, BrowserToolError, BrowserToolResult};
pub use skill_search_tool::SkillSearchTool;
pub use skill_tool_gate::{
    clear_skill_tool_session_access, set_skill_tool_session_access,
    set_skill_tool_session_allowed_skill_sources, set_skill_tool_session_allowed_skills,
    LimeSkillTool, SkillToolSessionSkillSource,
};
