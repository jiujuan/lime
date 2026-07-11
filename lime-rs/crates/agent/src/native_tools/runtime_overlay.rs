use crate::native_tools::runtime_tool_bridge::create_runtime_native_tool_adapter;
use aster::Agent;
use aster::{Tool, ToolRegistry};
use std::sync::Arc;
use tokio::sync::RwLock;
use tool_runtime::gateway_dispatch_execution::RuntimeGatewayToolExecutionRegistration;
use tool_runtime::native_overlay::{
    runtime_native_tool_definition, runtime_native_tool_install_plan,
    runtime_native_tool_registration_is_allowed, RuntimeNativeToolInstallStep,
};
use tool_runtime::tool_definition::RuntimeToolDefinition;

pub(crate) struct NativeRegistration {
    definition: RuntimeToolDefinition,
    tool: Option<Box<dyn Tool>>,
    gateway_execution: Option<RuntimeGatewayToolExecutionRegistration>,
}

impl NativeRegistration {
    pub(crate) fn new(definition: RuntimeToolDefinition, tool: Box<dyn Tool>) -> Self {
        Self {
            definition,
            tool: Some(tool),
            gateway_execution: None,
        }
    }

    pub(crate) fn gateway(registration: RuntimeGatewayToolExecutionRegistration) -> Self {
        Self {
            definition: registration.definition(),
            tool: None,
            gateway_execution: Some(registration),
        }
    }

    pub(crate) fn definition(&self) -> RuntimeToolDefinition {
        self.definition.clone()
    }

    pub(crate) fn gateway_execution(&self) -> Option<RuntimeGatewayToolExecutionRegistration> {
        self.gateway_execution.clone()
    }

    pub(crate) fn into_tool(self) -> Box<dyn Tool> {
        self.tool
            .expect("non-gateway native registration must include an Aster Tool adapter")
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
    let definition = registration.definition();
    if !runtime_native_tool_registration_is_allowed(&definition.name) {
        return Err(format!(
            "Native tool {} is not allowed by tool-runtime current registration policy",
            definition.name
        ));
    }
    let gateway_execution = registration.gateway_execution();
    let mut agent_guard = agent_state.write().await;
    let agent = agent_guard.as_mut().ok_or("Agent not initialized")?;
    if let Some(gateway_execution) = gateway_execution {
        agent.register_runtime_gateway_tool_execution(gateway_execution);
        return Ok(definition);
    }
    let tool = registration.into_tool();
    let registry = agent.tool_registry().clone();
    drop(agent_guard);
    let mut registry = registry.write().await;
    registry.register(tool);
    Ok(definition)
}

fn register_runtime_native_tool_overlay(
    registry: &mut ToolRegistry,
    step: RuntimeNativeToolInstallStep,
) -> RuntimeToolDefinition {
    let definition = runtime_native_tool_definition(step.tool());
    debug_assert!(
        runtime_native_tool_registration_is_allowed(&definition.name),
        "{} must be allowed by tool-runtime current registration policy",
        definition.name
    );
    if step.registers_aster_tool() {
        let registration = create_runtime_native_tool(step);
        registry.register(registration.into_tool());
    }
    definition
}

fn create_runtime_native_tool(step: RuntimeNativeToolInstallStep) -> NativeRegistration {
    let definition = runtime_native_tool_definition(step.tool());
    let tool = create_runtime_native_tool_adapter(step.tool());
    NativeRegistration::new(definition, tool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::json;

    struct BlockedTool;

    #[async_trait]
    impl Tool for BlockedTool {
        fn name(&self) -> &str {
            "Write"
        }

        fn description(&self) -> &str {
            "blocked legacy write tool"
        }

        fn input_schema(&self) -> serde_json::Value {
            json!({
                "type": "object",
                "additionalProperties": false
            })
        }

        async fn execute(
            &self,
            _params: serde_json::Value,
            _context: &aster::ToolContext,
        ) -> Result<aster::ToolResult, aster::ToolError> {
            Ok(aster::ToolResult::success("blocked"))
        }
    }

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

        let definitions = configure_lime_native_tool_overlay(&mut agent).await;

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
        assert!(!registry.contains("Skill"));
        assert!(definitions
            .iter()
            .any(|definition| definition.name == "Skill"));
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

    #[tokio::test]
    async fn register_native_tool_on_agent_rejects_unallowed_aster_tool_name() {
        let tool_config = crate::runtime_state_support::create_lime_tool_config();
        let agent_state = Arc::new(RwLock::new(Some(Agent::with_tool_config(tool_config))));
        let registration = NativeRegistration::new(
            RuntimeToolDefinition::new(
                "Write",
                "blocked legacy write tool",
                json!({
                    "type": "object",
                    "additionalProperties": false
                }),
            ),
            Box::new(BlockedTool),
        );

        let error = register_native_tool_on_agent(&agent_state, registration)
            .await
            .expect_err("legacy Write registration must fail closed");

        assert!(error.contains("not allowed by tool-runtime current registration policy"));
        let agent_guard = agent_state.read().await;
        let agent = agent_guard.as_ref().expect("agent");
        let registry = agent.tool_registry().read().await;
        assert!(!registry.contains("Write"));
    }
}
