//! Tools 模块
//!
//! 提供各种工具的包装器和辅助函数

pub mod apply_patch_tool;
pub mod browser_tool;
pub mod skill_search_tool;
pub mod skill_tool_gate;

pub use crate::agent_tools::catalog::SKILL_SEARCH_TOOL_NAME;
pub(crate) use apply_patch_tool::create_apply_patch_tool;
pub use apply_patch_tool::APPLY_PATCH_TOOL_NAME;
pub use browser_tool::{BrowserAction, BrowserTool, BrowserToolError, BrowserToolResult};
pub(crate) use skill_search_tool::create_skill_search_tool;
pub use skill_tool_gate::LimeSkillTool;
