/// Lime-owned native tool overlay installed on top of the temporary Aster registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RuntimeNativeToolOverlay {
    ViewImage,
    ApplyPatch,
    SkillSearch,
    Skill,
    Sleep,
    UpdatePlan,
    WebFetch,
    WebSearch,
}

impl RuntimeNativeToolOverlay {
    pub const fn name(self) -> &'static str {
        match self {
            Self::ViewImage => "view_image",
            Self::ApplyPatch => "apply_patch",
            Self::SkillSearch => "skill_search",
            Self::Skill => "Skill",
            Self::Sleep => "sleep",
            Self::UpdatePlan => "update_plan",
            Self::WebFetch => "WebFetch",
            Self::WebSearch => "WebSearch",
        }
    }
}

const RUNTIME_NATIVE_TOOL_OVERLAY: &[RuntimeNativeToolOverlay] = &[
    RuntimeNativeToolOverlay::ViewImage,
    RuntimeNativeToolOverlay::ApplyPatch,
    RuntimeNativeToolOverlay::SkillSearch,
    RuntimeNativeToolOverlay::Skill,
    RuntimeNativeToolOverlay::Sleep,
    RuntimeNativeToolOverlay::UpdatePlan,
    RuntimeNativeToolOverlay::WebFetch,
    RuntimeNativeToolOverlay::WebSearch,
];

const RUNTIME_NATIVE_TOOL_OVERLAY_NAMES: &[&str] = &[
    "view_image",
    "apply_patch",
    "skill_search",
    "Skill",
    "sleep",
    "update_plan",
    "WebFetch",
    "WebSearch",
];

pub fn runtime_native_tool_overlay_tools() -> &'static [RuntimeNativeToolOverlay] {
    RUNTIME_NATIVE_TOOL_OVERLAY
}

pub fn runtime_native_tool_overlay_tool_names() -> &'static [&'static str] {
    RUNTIME_NATIVE_TOOL_OVERLAY_NAMES
}

/// Temporary allowlist for tools that may still be registered through the Aster registry.
///
/// The list is owned here so App Server / GUI inventory and the migration guard have
/// one current policy source while the reply loop is still being removed from Aster.
const RUNTIME_NATIVE_TOOL_REGISTRATION_ALLOWLIST: &[&str] = &[
    "Bash",
    "PowerShell",
    "Read",
    "view_image",
    "Glob",
    "Grep",
    "Ask",
    "LSP",
    "Skill",
    "apply_patch",
    "skill_search",
    "sleep",
    "update_plan",
    "WebFetch",
    "WebSearch",
    "memory_list",
    "memory_read",
    "memory_search",
    "memory_add_note",
    "lime_create_image_generation_task",
    "EnterPlanMode",
    "ExitPlanMode",
    "ListMcpResources",
    "ReadMcpResource",
    "ToolSearch",
    "Agent",
    "SendMessage",
    "TeamCreate",
    "TeamDelete",
    "ListPeers",
];

pub fn runtime_native_tool_registration_allowlist() -> &'static [&'static str] {
    RUNTIME_NATIVE_TOOL_REGISTRATION_ALLOWLIST
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn runtime_native_tool_overlay_names_are_current_contract() {
        assert_eq!(
            runtime_native_tool_overlay_tool_names(),
            &[
                "view_image",
                "apply_patch",
                "skill_search",
                "Skill",
                "sleep",
                "update_plan",
                "WebFetch",
                "WebSearch"
            ]
        );
    }

    #[test]
    fn runtime_native_tool_overlay_name_slice_matches_tools() {
        let names = runtime_native_tool_overlay_tools()
            .iter()
            .map(|tool| tool.name())
            .collect::<Vec<_>>();

        assert_eq!(names, runtime_native_tool_overlay_tool_names());
    }

    #[test]
    fn runtime_native_tool_overlay_names_are_unique() {
        let names = runtime_native_tool_overlay_tool_names();
        let unique = names.iter().copied().collect::<HashSet<_>>();
        assert_eq!(unique.len(), names.len());
    }

    #[test]
    fn runtime_native_tool_registration_allowlist_is_codex_first_contract() {
        let names = runtime_native_tool_registration_allowlist();
        let unique = names.iter().copied().collect::<HashSet<_>>();
        assert_eq!(unique.len(), names.len());
        assert!(names.contains(&"Bash"));
        assert!(names.contains(&"Read"));
        assert!(names.contains(&"view_image"));
        assert!(names.contains(&"apply_patch"));
        assert!(names.contains(&"sleep"));
        assert!(names.contains(&"update_plan"));
        assert!(!names.contains(&"Write"));
        assert!(!names.contains(&"Edit"));
        assert!(!names.contains(&"TaskCreate"));
        assert!(!names.contains(&"TaskList"));
        assert!(!names.contains(&"TaskGet"));
        assert!(!names.contains(&"TaskUpdate"));
        assert!(!names.contains(&"TaskOutput"));
        assert!(!names.contains(&"TaskStop"));
        assert!(!names.contains(&"UpdatePlan"));
        assert!(!names.contains(&"ViewImage"));
        assert!(!names.contains(&"NotebookEdit"));
        assert!(!names.contains(&"EnterWorktree"));
        assert!(!names.contains(&"Workflow"));
        assert!(!names.contains(&"Config"));
        assert!(!names.contains(&"Sleep"));
        assert!(!names.contains(&"SleepTool"));
        assert!(!names.contains(&"Cron"));
        assert!(!names.contains(&"RemoteTrigger"));
    }
}
