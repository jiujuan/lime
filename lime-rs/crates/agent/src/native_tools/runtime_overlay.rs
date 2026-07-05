use aster::agents::Agent;
use aster::tools::{create_shared_history, EditTool, Tool, ToolRegistry, WriteTool};
use std::sync::Arc;
use tokio::sync::RwLock;

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
    let shared_history = create_shared_history();
    let registry_handle = runtime_native_tool_registry(agent);
    let mut registry = registry_handle.registry.write().await;
    registry.register(Box::new(
        WriteTool::new(shared_history.clone()).with_require_read_before_overwrite(false),
    ));
    registry.register(Box::new(
        EditTool::new(shared_history).with_require_read_before_edit(false),
    ));
    registry.register(Box::new(crate::tools::ApplyPatchTool));
    registry.register(Box::new(crate::tools::SkillSearchTool));
    // 覆盖默认 SkillTool，避免通用对话默认暴露全部本地 Skills。
    registry.register(Box::new(crate::tools::LimeSkillTool::new()));
}
