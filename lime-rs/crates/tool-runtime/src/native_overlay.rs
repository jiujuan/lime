/// Lime-owned native tool overlay installed on top of the temporary Aster registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RuntimeNativeToolOverlay {
    Write,
    Edit,
    ApplyPatch,
    SkillSearch,
    Skill,
}

impl RuntimeNativeToolOverlay {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Write => "Write",
            Self::Edit => "Edit",
            Self::ApplyPatch => "apply_patch",
            Self::SkillSearch => "skill_search",
            Self::Skill => "Skill",
        }
    }
}

const RUNTIME_NATIVE_TOOL_OVERLAY: &[RuntimeNativeToolOverlay] = &[
    RuntimeNativeToolOverlay::Write,
    RuntimeNativeToolOverlay::Edit,
    RuntimeNativeToolOverlay::ApplyPatch,
    RuntimeNativeToolOverlay::SkillSearch,
    RuntimeNativeToolOverlay::Skill,
];

const RUNTIME_NATIVE_TOOL_OVERLAY_NAMES: &[&str] =
    &["Write", "Edit", "apply_patch", "skill_search", "Skill"];

pub fn runtime_native_tool_overlay_tools() -> &'static [RuntimeNativeToolOverlay] {
    RUNTIME_NATIVE_TOOL_OVERLAY
}

pub fn runtime_native_tool_overlay_tool_names() -> &'static [&'static str] {
    RUNTIME_NATIVE_TOOL_OVERLAY_NAMES
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn runtime_native_tool_overlay_names_are_current_contract() {
        assert_eq!(
            runtime_native_tool_overlay_tool_names(),
            &["Write", "Edit", "apply_patch", "skill_search", "Skill"]
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
}
