use crate::naming::{build_runtime_tool_name, extract_runtime_inner_tool_name};
use crate::McpToolDefinition;
use tool_runtime::tool_extension::{RuntimeExtensionConfig, RuntimeExtensionToolSurface};

pub fn runtime_extension_name(server_name: &str) -> String {
    let mut name = build_runtime_tool_name(server_name, "");
    if name.ends_with("__") {
        name.truncate(name.len() - 2);
    }
    name
}

pub fn build_runtime_extension_surface(
    extension_name: &str,
    description: impl Into<String>,
    tools: &[McpToolDefinition],
) -> RuntimeExtensionConfig {
    let tool_surfaces = tools
        .iter()
        .map(|tool| {
            let inner_name =
                runtime_extension_inner_tool_name(extension_name, &tool.server_name, &tool.name);
            RuntimeExtensionToolSurface::new(
                inner_name,
                tool.deferred_loading,
                tool.always_visible,
                tool.allowed_callers.clone(),
            )
        })
        .collect::<Vec<_>>();

    RuntimeExtensionConfig::from_tool_surfaces(extension_name, description, &tool_surfaces)
}

fn runtime_extension_inner_tool_name<'a>(
    extension_name: &str,
    server_name: &str,
    tool_name: &'a str,
) -> &'a str {
    extract_runtime_inner_tool_name(server_name, tool_name)
        .or_else(|| {
            tool_name
                .strip_prefix(extension_name)
                .and_then(|rest| rest.strip_prefix("__"))
                .filter(|inner_name| !inner_name.is_empty())
        })
        .unwrap_or(tool_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tool(
        name: &str,
        deferred_loading: Option<bool>,
        always_visible: Option<bool>,
        allowed_callers: Option<Vec<&str>>,
    ) -> McpToolDefinition {
        McpToolDefinition {
            name: name.to_string(),
            description: format!("{name} description"),
            input_schema: serde_json::json!({ "type": "object" }),
            output_schema: None,
            server_name: "docs".to_string(),
            deferred_loading,
            always_visible,
            allowed_callers: allowed_callers
                .map(|items| items.into_iter().map(str::to_string).collect()),
            input_examples: None,
            tags: None,
        }
    }

    #[test]
    fn runtime_extension_name_uses_mcp_runtime_prefix() {
        assert_eq!(runtime_extension_name("docs"), "mcp__docs");
    }

    #[test]
    fn build_runtime_extension_surface_collapses_single_caller() {
        let tools = vec![
            sample_tool(
                "search_docs",
                Some(true),
                Some(false),
                Some(vec!["assistant"]),
            ),
            sample_tool(
                "read_docs",
                Some(false),
                Some(true),
                Some(vec!["assistant"]),
            ),
        ];

        let surface = build_runtime_extension_surface("mcp__docs", "docs tools", &tools);
        assert!(surface.deferred_loading);
        assert_eq!(surface.allowed_caller.as_deref(), Some("assistant"));
        assert_eq!(surface.always_expose_tools, vec!["read_docs".to_string()]);
    }

    #[test]
    fn build_runtime_extension_surface_drops_mixed_callers() {
        let tools = vec![
            sample_tool(
                "search_docs",
                Some(true),
                Some(false),
                Some(vec!["assistant"]),
            ),
            sample_tool(
                "admin_docs",
                Some(true),
                Some(false),
                Some(vec!["code_execution"]),
            ),
        ];

        let surface = build_runtime_extension_surface("mcp__docs", "docs tools", &tools);
        assert_eq!(surface.allowed_caller, None);
    }

    #[test]
    fn build_runtime_extension_surface_dedups_available_and_exposed_tools() {
        let tools = vec![
            sample_tool(
                "search_docs",
                Some(true),
                Some(true),
                Some(vec!["assistant"]),
            ),
            sample_tool(
                "read_docs",
                Some(false),
                Some(false),
                Some(vec!["assistant"]),
            ),
            sample_tool(
                "search_docs",
                Some(true),
                Some(true),
                Some(vec!["assistant"]),
            ),
        ];

        let surface = build_runtime_extension_surface("mcp__docs", "docs tools", &tools);
        assert!(surface.deferred_loading);
        assert_eq!(surface.allowed_caller.as_deref(), Some("assistant"));
        assert_eq!(
            surface.available_tools,
            vec!["read_docs".to_string(), "search_docs".to_string()]
        );
        assert_eq!(
            surface.always_expose_tools,
            vec!["read_docs".to_string(), "search_docs".to_string()]
        );
    }

    #[test]
    fn build_runtime_extension_surface_rejects_blank_allowed_caller() {
        let tools = vec![
            sample_tool(
                "search_docs",
                Some(true),
                Some(false),
                Some(vec!["assistant"]),
            ),
            sample_tool("read_docs", Some(false), Some(true), Some(vec!["   "])),
        ];

        let surface = build_runtime_extension_surface("mcp__docs", "docs tools", &tools);
        assert_eq!(surface.allowed_caller, None);
    }

    #[test]
    fn build_runtime_extension_surface_strips_runtime_prefix_from_prefixed_tools() {
        let tools = vec![
            sample_tool(
                "mcp__docs__search_docs",
                Some(true),
                Some(false),
                Some(vec!["assistant"]),
            ),
            sample_tool(
                "mcp__docs__read_docs",
                Some(false),
                Some(true),
                Some(vec!["assistant"]),
            ),
        ];

        let surface = build_runtime_extension_surface("mcp__docs", "docs tools", &tools);
        assert_eq!(
            surface.available_tools,
            vec!["read_docs".to_string(), "search_docs".to_string()]
        );
        assert_eq!(surface.always_expose_tools, vec!["read_docs".to_string()]);
    }
}
