use crate::native_tools::runtime_tool_bridge::create_runtime_native_tool_adapter;
use aster::agents::Agent;
use aster::tools::{Tool, ToolRegistry};
use std::sync::Arc;
use tokio::sync::RwLock;
use tool_runtime::native_overlay::{
    runtime_native_tool_definition, runtime_native_tool_install_plan, RuntimeNativeToolInstallStep,
    RuntimeNativeToolRegistrationOwner,
};
use tool_runtime::tool_definition::RuntimeToolDefinition;

pub(crate) struct NativeRegistration {
    definition: RuntimeToolDefinition,
    tool: Box<dyn Tool>,
}

impl NativeRegistration {
    pub(crate) fn new(definition: RuntimeToolDefinition, tool: Box<dyn Tool>) -> Self {
        Self { definition, tool }
    }

    #[cfg(test)]
    pub(crate) fn name(&self) -> &str {
        &self.definition.name
    }

    pub(crate) fn definition(&self) -> RuntimeToolDefinition {
        self.definition.clone()
    }

    pub(crate) fn into_tool(self) -> Box<dyn Tool> {
        self.tool
    }
}

pub(crate) async fn configure_lime_native_tool_overlay(
    agent: &mut Agent,
) -> Vec<RuntimeToolDefinition> {
    agent.add_tool_inspector(Box::new(
        crate::agent_tools::tool_policy_inspector::WorkspaceToolPolicyInspector::new(),
    ));
    // Aster 默认工具池由 Agent::with_tool_config -> register_all_tools 注册。
    // 这里只覆盖 Lime 需要改变策略或收口事实源的工具，不重复接管 Aster 默认工具。
    let registry = agent.tool_registry().clone();
    let mut registry = registry.write().await;
    let mut definitions = Vec::new();
    for step in runtime_native_tool_install_plan() {
        definitions.push(register_runtime_native_tool_overlay(&mut registry, *step));
    }
    definitions
}

pub(crate) async fn register_native_tool_on_agent(
    agent_state: &Arc<RwLock<Option<Agent>>>,
    registration: NativeRegistration,
) -> Result<RuntimeToolDefinition, String> {
    let registry = {
        let agent_guard = agent_state.read().await;
        let agent = agent_guard.as_ref().ok_or("Agent not initialized")?;
        agent.tool_registry().clone()
    };
    let definition = registration.definition();
    let mut registry = registry.write().await;
    registry.register(registration.into_tool());
    Ok(definition)
}

fn register_runtime_native_tool_overlay(
    registry: &mut ToolRegistry,
    step: RuntimeNativeToolInstallStep,
) -> RuntimeToolDefinition {
    let registration = create_runtime_native_tool(step);
    let definition = registration.definition();
    registry.register(registration.into_tool());
    definition
}

fn create_runtime_native_tool(step: RuntimeNativeToolInstallStep) -> NativeRegistration {
    let definition = runtime_native_tool_definition(step.tool());
    let tool = match step.owner() {
        RuntimeNativeToolRegistrationOwner::NativeDispatch => {
            create_runtime_native_tool_adapter(step.tool())
        }
        // 覆盖默认 SkillTool，避免通用对话默认暴露全部本地 Skills。
        RuntimeNativeToolRegistrationOwner::SkillGate => {
            Box::new(crate::tools::LimeSkillTool::new())
        }
    };
    NativeRegistration::new(definition, tool)
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
