use super::super::*;
use crate::CapabilityListContext;

pub(in crate::runtime::tests) struct TestCapabilitySource;

impl CapabilitySource for TestCapabilitySource {
    fn list_capabilities(&self, context: &CapabilityListContext) -> Vec<CapabilityDescriptor> {
        let app_id = context.app_id.as_deref().unwrap_or("unknown-app");
        let workspace_id = context
            .workspace_id
            .as_deref()
            .unwrap_or("unknown-workspace");
        vec![CapabilityDescriptor {
            id: format!("test.capability.{app_id}.{workspace_id}"),
            title: format!("Test Capability for {app_id}"),
            description: None,
            methods: vec!["test/method".to_string()],
        }]
    }
}
