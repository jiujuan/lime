use aster::agents::Agent;
use aster::tools::{Tool, ToolRegistry};
use std::sync::Arc;
use tokio::sync::RwLock;
use tool_runtime::native_overlay::{
    runtime_native_tool_install_plan, RuntimeNativeToolInstallStep, RuntimeNativeToolOverlay,
};

pub(crate) struct RuntimeNativeToolRegistry {
    registry: Arc<RwLock<ToolRegistry>>,
}

impl RuntimeNativeToolRegistry {
    pub(crate) async fn contains_native(&self, tool_name: &str) -> bool {
        let registry = self.registry.read().await;
        registry.contains_native(tool_name)
    }

    pub(crate) async fn register(&self, tool: Box<dyn Tool>) -> String {
        let tool_name = tool.name().to_string();
        let mut registry = self.registry.write().await;
        registry.register(tool);
        tool_name
    }
}

pub(crate) fn runtime_native_tool_registry(agent: &Agent) -> RuntimeNativeToolRegistry {
    RuntimeNativeToolRegistry {
        registry: agent.tool_registry().clone(),
    }
}

pub(crate) async fn configure_lime_native_tool_overlay(agent: &mut Agent) {
    agent.add_tool_inspector(Box::new(
        crate::agent_tools::tool_policy_inspector::WorkspaceToolPolicyInspector::new(),
    ));
    // Aster 默认工具池由 Agent::with_tool_config -> register_all_tools 注册。
    // 这里只覆盖 Lime 需要改变策略或收口事实源的工具，不重复接管 Aster 默认工具。
    let registry_handle = runtime_native_tool_registry(agent);
    let mut registry = registry_handle.registry.write().await;
    for step in runtime_native_tool_install_plan() {
        register_runtime_native_tool_overlay(&mut registry, *step);
    }
}

fn register_runtime_native_tool_overlay(
    registry: &mut ToolRegistry,
    step: RuntimeNativeToolInstallStep,
) {
    registry.register(create_runtime_native_tool(step));
}

fn create_runtime_native_tool(step: RuntimeNativeToolInstallStep) -> Box<dyn Tool> {
    match step.tool() {
        RuntimeNativeToolOverlay::ViewImage => crate::native_tools::create_view_image_tool(),
        RuntimeNativeToolOverlay::ApplyPatch => crate::tools::create_apply_patch_tool(),
        RuntimeNativeToolOverlay::SkillSearch => crate::tools::create_skill_search_tool(),
        // 覆盖默认 SkillTool，避免通用对话默认暴露全部本地 Skills。
        RuntimeNativeToolOverlay::Skill => Box::new(crate::tools::LimeSkillTool::new()),
        RuntimeNativeToolOverlay::Sleep => crate::native_tools::create_sleep_tool(),
        RuntimeNativeToolOverlay::UpdatePlan => crate::native_tools::create_update_plan_tool(),
        RuntimeNativeToolOverlay::WebFetch => crate::native_tools::create_web_fetch_tool(),
        RuntimeNativeToolOverlay::WebSearch => crate::native_tools::create_web_search_tool(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn overlay_registers_current_view_image_with_lookup_only_aliases() {
        let tool_config = crate::runtime_state_support::create_lime_tool_config();
        let mut agent = Agent::with_tool_config(tool_config);

        configure_lime_native_tool_overlay(&mut agent).await;

        let registry = agent.tool_registry();
        let registry = registry.read().await;
        assert!(registry.contains("view_image"));
        assert_eq!(
            registry.canonical_native_name("ViewImage").as_deref(),
            Some("view_image")
        );
        assert_eq!(
            registry.canonical_native_name("ViewImageTool").as_deref(),
            Some("view_image")
        );

        let definition_names = registry
            .get_definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        assert!(definition_names.iter().any(|name| name == "view_image"));
        assert!(!definition_names.iter().any(|name| name == "ViewImage"));
        assert!(!definition_names.iter().any(|name| name == "ViewImageTool"));
    }

    #[tokio::test]
    async fn overlay_does_not_register_aster_write_edit_task_tools() {
        let tool_config = crate::runtime_state_support::create_lime_tool_config();
        let mut agent = Agent::with_tool_config(tool_config);

        configure_lime_native_tool_overlay(&mut agent).await;

        let registry = agent.tool_registry();
        let registry = registry.read().await;
        assert!(!registry.contains("Write"));
        assert!(!registry.contains("Edit"));
        assert!(!registry.contains("TaskCreate"));
        assert!(!registry.contains("TaskList"));
        assert!(!registry.contains("TaskGet"));
        assert!(!registry.contains("TaskUpdate"));
        assert!(!registry.contains("TaskOutput"));
        assert!(!registry.contains("TaskStop"));
        assert!(registry.contains("apply_patch"));
        assert!(registry.contains("update_plan"));
    }

    #[tokio::test]
    async fn overlay_registers_current_update_plan_with_lookup_only_aliases() {
        let tool_config = crate::runtime_state_support::create_lime_tool_config();
        let mut agent = Agent::with_tool_config(tool_config);

        configure_lime_native_tool_overlay(&mut agent).await;

        let registry = agent.tool_registry();
        let registry = registry.read().await;
        assert!(registry.contains("update_plan"));
        assert_eq!(
            registry.canonical_native_name("UpdatePlan").as_deref(),
            Some("update_plan")
        );
        assert_eq!(
            registry.canonical_native_name("UpdatePlanTool").as_deref(),
            Some("update_plan")
        );

        let definition_names = registry
            .get_definitions()
            .into_iter()
            .map(|definition| definition.name)
            .collect::<Vec<_>>();
        assert!(definition_names.iter().any(|name| name == "update_plan"));
        assert!(!definition_names.iter().any(|name| name == "UpdatePlan"));
        assert!(!definition_names.iter().any(|name| name == "UpdatePlanTool"));
    }
}
