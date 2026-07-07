use crate::tool_definition::RuntimeToolDefinition;
use serde_json::json;

pub const MEMORY_LIST_TOOL_NAME: &str = "memory_list";
pub const MEMORY_READ_TOOL_NAME: &str = "memory_read";
pub const MEMORY_SEARCH_TOOL_NAME: &str = "memory_search";
pub const MEMORY_ADD_NOTE_TOOL_NAME: &str = "memory_add_note";

pub fn memory_store_tool_definitions() -> Vec<RuntimeToolDefinition> {
    vec![
        memory_list_tool_definition(),
        memory_read_tool_definition(),
        memory_search_tool_definition(),
        memory_add_note_tool_definition(),
    ]
}

pub fn memory_store_tool_definition(tool_name: &str) -> Option<RuntimeToolDefinition> {
    match tool_name {
        MEMORY_LIST_TOOL_NAME => Some(memory_list_tool_definition()),
        MEMORY_READ_TOOL_NAME => Some(memory_read_tool_definition()),
        MEMORY_SEARCH_TOOL_NAME => Some(memory_search_tool_definition()),
        MEMORY_ADD_NOTE_TOOL_NAME => Some(memory_add_note_tool_definition()),
        _ => None,
    }
}

pub fn memory_list_tool_definition() -> RuntimeToolDefinition {
    RuntimeToolDefinition::new(
        MEMORY_LIST_TOOL_NAME,
        "List files and directories in the current memory store. Paths are memory-store relative and safe to pass to memory_read.",
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace",
                    "description": "Memory store scope. Defaults to the current workspace memory store."
                },
                "path": {
                    "type": "string",
                    "description": "Relative directory path inside the memory store."
                },
                "cursor": { "type": "string" },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200
                }
            }
        }),
    )
}

pub fn memory_read_tool_definition() -> RuntimeToolDefinition {
    RuntimeToolDefinition::new(
        MEMORY_READ_TOOL_NAME,
        "Read a bounded line range from a memory-store file. Use paths returned by memory_list or memory_search; output includes citation fields.",
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "path": {
                    "type": "string",
                    "description": "Relative file path inside the memory store."
                },
                "lineOffset": {
                    "type": "integer",
                    "minimum": 0
                },
                "maxLines": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 500
                },
                "maxTokens": {
                    "type": "integer",
                    "minimum": 1
                }
            },
            "required": ["path"]
        }),
    )
}

pub fn memory_search_tool_definition() -> RuntimeToolDefinition {
    RuntimeToolDefinition::new(
        MEMORY_SEARCH_TOOL_NAME,
        "Search memory-store text files with bounded results. Hits include path, line numbers, content snippets, and citations.",
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "queries": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1
                },
                "matchMode": {
                    "type": "string",
                    "enum": ["any", "allOnSameLine", "allWithinLines"],
                    "default": "any"
                },
                "withinLines": {
                    "type": "integer",
                    "minimum": 1
                },
                "caseSensitive": { "type": "boolean" },
                "normalized": { "type": "boolean" },
                "contextLines": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 20
                },
                "cursor": { "type": "string" },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200
                }
            },
            "required": ["queries"]
        }),
    )
}

pub fn memory_add_note_tool_definition() -> RuntimeToolDefinition {
    RuntimeToolDefinition::new(
        MEMORY_ADD_NOTE_TOOL_NAME,
        "Add an explicit ad-hoc note to the memory store. This writes only under extensions/ad_hoc/notes and does not modify MEMORY.md or memory_summary.md.",
        json!({
            "type": "object",
            "properties": {
                "scope": {
                    "type": "string",
                    "enum": ["workspace", "global"],
                    "default": "workspace"
                },
                "content": {
                    "type": "string",
                    "description": "User-approved note content to save for later consolidation."
                },
                "title": { "type": "string" },
                "slug": { "type": "string" }
            },
            "required": ["content"]
        }),
    )
}
