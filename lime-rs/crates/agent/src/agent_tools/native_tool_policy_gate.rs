use crate::agent_tools::catalog::{tool_catalog_entry, ToolCatalogEntry};
use crate::model_request_policy::{
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_metadata,
};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativeToolPolicyGate {
    disallowed_tool_names: Vec<&'static str>,
}

impl NativeToolPolicyGate {
    pub(super) fn from_request_metadata(request_metadata: Option<&Value>) -> Self {
        Self {
            disallowed_tool_names: request_metadata
                .and_then(native_tool_policy_from_metadata)
                .map(|policy| native_tool_policy_disallowed_tool_names(Some(&policy)))
                .unwrap_or_default(),
        }
    }

    pub(super) fn allows_catalog_entry(&self, entry: &ToolCatalogEntry) -> bool {
        self.allows_tool_name(entry.name)
    }

    pub(super) fn allows_tool_name(&self, tool_name: &str) -> bool {
        match tool_catalog_entry(tool_name).map(|entry| entry.name) {
            Some(canonical_name) => !self
                .disallowed_tool_names
                .iter()
                .any(|disallowed| canonical_name.eq_ignore_ascii_case(disallowed)),
            _ => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn gate_defaults_to_allowing_native_tools_without_policy() {
        let gate = NativeToolPolicyGate::from_request_metadata(None);

        assert!(gate.allows_tool_name("exec_command"));
        assert!(gate.allows_tool_name("write_stdin"));
        assert!(gate.allows_tool_name("apply_patch"));
    }

    #[test]
    fn gate_hides_shell_command_surface_when_policy_disables_shell() {
        let metadata = json!({
            "harness": {
                "model_request_policy": {
                    "native_tool_policy": {
                        "shell_type": "disabled",
                        "shell_tool_enabled": false,
                        "apply_patch_tool_type": "freeform"
                    }
                }
            }
        });
        let gate = NativeToolPolicyGate::from_request_metadata(Some(&metadata));

        assert!(!gate.allows_tool_name("exec_command"));
        assert!(!gate.allows_tool_name("write_stdin"));
        assert!(gate.allows_tool_name("apply_patch"));
    }

    #[test]
    fn gate_requires_freeform_apply_patch_type() {
        let metadata = json!({
            "harness": {
                "model_request_policy": {
                    "native_tool_policy": {
                        "shell_type": "shell_command",
                        "apply_patch_tool_enabled": true
                    }
                }
            }
        });
        let gate = NativeToolPolicyGate::from_request_metadata(Some(&metadata));

        assert!(gate.allows_tool_name("exec_command"));
        assert!(!gate.allows_tool_name("ApplyPatchTool"));
    }
}
