use crate::apply_patch::apply_patch_tool_definition;
use crate::skill_search::skill_search_tool_definition;
use crate::sleep::{sleep_tool_definition, CLOCK_SLEEP_TOOL_NAME};
use crate::tool_definition::RuntimeToolDefinition;
use crate::update_plan::{update_plan_definition, UPDATE_PLAN_LEGACY_ALIASES};
use crate::view_image::{view_image_tool_definition, VIEW_IMAGE_LEGACY_ALIASES};
use crate::web_fetch::web_fetch_tool_definition;
use crate::web_search::web_search_tool_definition;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RuntimeNativeToolRegistrationOwner {
    NativeDispatch,
    SkillGate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct RuntimeNativeToolRegistration {
    tool: RuntimeNativeToolOverlay,
    name: &'static str,
    owner: RuntimeNativeToolRegistrationOwner,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeNativeToolSurface {
    definition: RuntimeToolDefinition,
    aliases: &'static [&'static str],
    max_retries: Option<u32>,
}

impl RuntimeNativeToolRegistration {
    pub const fn new(tool: RuntimeNativeToolOverlay) -> Self {
        Self {
            tool,
            name: tool.name(),
            owner: tool.registration_owner(),
        }
    }

    pub const fn tool(self) -> RuntimeNativeToolOverlay {
        self.tool
    }

    pub const fn name(self) -> &'static str {
        self.name
    }

    pub const fn owner(self) -> RuntimeNativeToolRegistrationOwner {
        self.owner
    }
}

impl RuntimeNativeToolSurface {
    pub fn new(
        definition: RuntimeToolDefinition,
        aliases: &'static [&'static str],
        max_retries: Option<u32>,
    ) -> Self {
        Self {
            definition,
            aliases,
            max_retries,
        }
    }

    pub fn name(&self) -> &str {
        &self.definition.name
    }

    pub fn description(&self) -> &str {
        &self.definition.description
    }

    pub fn input_schema(&self) -> serde_json::Value {
        self.definition.input_schema.clone()
    }

    pub fn aliases(&self) -> &'static [&'static str] {
        self.aliases
    }

    pub fn max_retries(&self) -> Option<u32> {
        self.max_retries
    }
}

impl RuntimeNativeToolOverlay {
    pub const fn registration_owner(self) -> RuntimeNativeToolRegistrationOwner {
        match self {
            Self::Skill => RuntimeNativeToolRegistrationOwner::SkillGate,
            Self::ViewImage
            | Self::ApplyPatch
            | Self::SkillSearch
            | Self::Sleep
            | Self::UpdatePlan
            | Self::WebFetch
            | Self::WebSearch => RuntimeNativeToolRegistrationOwner::NativeDispatch,
        }
    }
}

const APPLY_PATCH_LEGACY_ALIASES: &[&str] = &["ApplyPatchTool"];
const SKILL_SEARCH_LEGACY_ALIASES: &[&str] = &["SkillSearchTool"];
const SLEEP_LEGACY_ALIASES: &[&str] = &[CLOCK_SLEEP_TOOL_NAME];
const NO_LEGACY_ALIASES: &[&str] = &[];

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

const RUNTIME_NATIVE_TOOL_OVERLAY_REGISTRATIONS: &[RuntimeNativeToolRegistration] = &[
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::ViewImage),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::ApplyPatch),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::SkillSearch),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::Skill),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::Sleep),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::UpdatePlan),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::WebFetch),
    RuntimeNativeToolRegistration::new(RuntimeNativeToolOverlay::WebSearch),
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

pub fn runtime_native_tool_overlay_registrations() -> &'static [RuntimeNativeToolRegistration] {
    RUNTIME_NATIVE_TOOL_OVERLAY_REGISTRATIONS
}

pub fn runtime_native_tool_overlay_tool_names() -> &'static [&'static str] {
    RUNTIME_NATIVE_TOOL_OVERLAY_NAMES
}

pub fn runtime_native_tool_surface(
    tool: RuntimeNativeToolOverlay,
) -> Option<RuntimeNativeToolSurface> {
    match tool {
        RuntimeNativeToolOverlay::ViewImage => Some(RuntimeNativeToolSurface::new(
            view_image_tool_definition(),
            VIEW_IMAGE_LEGACY_ALIASES,
            Some(0),
        )),
        RuntimeNativeToolOverlay::ApplyPatch => Some(RuntimeNativeToolSurface::new(
            apply_patch_tool_definition(),
            APPLY_PATCH_LEGACY_ALIASES,
            Some(0),
        )),
        RuntimeNativeToolOverlay::SkillSearch => Some(RuntimeNativeToolSurface::new(
            skill_search_tool_definition(),
            SKILL_SEARCH_LEGACY_ALIASES,
            None,
        )),
        RuntimeNativeToolOverlay::Skill => None,
        RuntimeNativeToolOverlay::Sleep => Some(RuntimeNativeToolSurface::new(
            sleep_tool_definition(),
            SLEEP_LEGACY_ALIASES,
            Some(0),
        )),
        RuntimeNativeToolOverlay::UpdatePlan => Some(RuntimeNativeToolSurface::new(
            update_plan_definition(),
            UPDATE_PLAN_LEGACY_ALIASES,
            Some(0),
        )),
        RuntimeNativeToolOverlay::WebFetch => Some(RuntimeNativeToolSurface::new(
            web_fetch_tool_definition(),
            NO_LEGACY_ALIASES,
            Some(0),
        )),
        RuntimeNativeToolOverlay::WebSearch => Some(RuntimeNativeToolSurface::new(
            web_search_tool_definition(),
            NO_LEGACY_ALIASES,
            Some(0),
        )),
    }
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
    fn runtime_native_tool_overlay_registrations_match_tools() {
        let tools = runtime_native_tool_overlay_tools().to_vec();
        let registration_tools = runtime_native_tool_overlay_registrations()
            .iter()
            .map(|registration| registration.tool())
            .collect::<Vec<_>>();
        let registration_names = runtime_native_tool_overlay_registrations()
            .iter()
            .map(|registration| registration.name())
            .collect::<Vec<_>>();

        assert_eq!(registration_tools, tools);
        assert_eq!(registration_names, runtime_native_tool_overlay_tool_names());
    }

    #[test]
    fn runtime_native_tool_overlay_dispatch_plan_matches_current_dispatch() {
        let dispatch_names = crate::native_dispatch::runtime_native_dispatch_tool_names();

        for registration in runtime_native_tool_overlay_registrations() {
            match registration.owner() {
                RuntimeNativeToolRegistrationOwner::NativeDispatch => {
                    assert!(
                        dispatch_names
                            .iter()
                            .any(|name| name == registration.name()),
                        "{} must be backed by tool-runtime native dispatch",
                        registration.name()
                    );
                }
                RuntimeNativeToolRegistrationOwner::SkillGate => {
                    assert_eq!(registration.name(), "Skill");
                }
            }
        }
    }

    #[test]
    fn runtime_native_tool_surface_matches_registration_plan() {
        for registration in runtime_native_tool_overlay_registrations() {
            match registration.owner() {
                RuntimeNativeToolRegistrationOwner::NativeDispatch => {
                    let surface = runtime_native_tool_surface(registration.tool())
                        .expect("dispatch-backed registration must have a current surface");
                    assert_eq!(surface.name(), registration.name());
                    assert!(!surface.description().trim().is_empty());
                    assert!(surface.input_schema().is_object());
                }
                RuntimeNativeToolRegistrationOwner::SkillGate => {
                    assert!(
                        runtime_native_tool_surface(registration.tool()).is_none(),
                        "Skill gate overlay must not pretend to be backed by native dispatch"
                    );
                }
            }
        }
    }

    #[test]
    fn runtime_native_tool_surface_keeps_wrapper_alias_and_retry_contract() {
        assert_eq!(
            runtime_native_tool_surface(RuntimeNativeToolOverlay::ViewImage)
                .expect("view_image surface")
                .aliases(),
            &["ViewImage", "ViewImageTool"]
        );
        assert_eq!(
            runtime_native_tool_surface(RuntimeNativeToolOverlay::Sleep)
                .expect("sleep surface")
                .aliases(),
            &["clock.sleep"]
        );
        assert_eq!(
            runtime_native_tool_surface(RuntimeNativeToolOverlay::SkillSearch)
                .expect("skill_search surface")
                .max_retries(),
            None
        );
        assert_eq!(
            runtime_native_tool_surface(RuntimeNativeToolOverlay::ApplyPatch)
                .expect("apply_patch surface")
                .max_retries(),
            Some(0)
        );
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
