use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallRepairFailureKind {
    MissingName,
    UnknownTool,
    MalformedArguments,
    ArgumentsNotObject,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolArgumentChange {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<Value>,
    pub after: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolCallRepair {
    pub requested_name: String,
    pub resolved_name: String,
    pub original_arguments: Map<String, Value>,
    pub arguments: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub argument_changes: Vec<ToolArgumentChange>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolCallRepairFailure {
    pub requested_name: String,
    pub raw_arguments: String,
    pub kind: ToolCallRepairFailureKind,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ToolCallRepairOutcome {
    Ready(ToolCallRepair),
    Invalid(ToolCallRepairFailure),
}

pub fn repair_tool_call<T: AsRef<str>>(
    available_tool_names: &[T],
    requested_name: &str,
    raw_arguments: &str,
    canonical_name: &dyn Fn(&str) -> Option<String>,
) -> ToolCallRepairOutcome {
    let requested_name = requested_name.trim();
    if requested_name.is_empty() {
        return invalid_tool_call_repair(
            requested_name,
            raw_arguments,
            ToolCallRepairFailureKind::MissingName,
        );
    }
    let Some(resolved_name) =
        runtime_tool_call_surface_name(available_tool_names, requested_name, canonical_name)
    else {
        return invalid_tool_call_repair(
            requested_name,
            raw_arguments,
            ToolCallRepairFailureKind::UnknownTool,
        );
    };
    let parsed_arguments = match serde_json::from_str::<Value>(raw_arguments) {
        Ok(value) => value,
        Err(_) => {
            return invalid_tool_call_repair(
                requested_name,
                raw_arguments,
                ToolCallRepairFailureKind::MalformedArguments,
            );
        }
    };
    let Value::Object(original_arguments) = parsed_arguments else {
        return invalid_tool_call_repair(
            requested_name,
            raw_arguments,
            ToolCallRepairFailureKind::ArgumentsNotObject,
        );
    };
    let mut arguments = original_arguments.clone();
    runtime_tool_call_normalize_arguments(&resolved_name, &mut arguments);
    let argument_changes = arguments
        .iter()
        .filter_map(|(key, after)| {
            let before = original_arguments.get(key);
            (before != Some(after)).then(|| ToolArgumentChange {
                key: key.clone(),
                before: before.cloned(),
                after: after.clone(),
            })
        })
        .collect();

    ToolCallRepairOutcome::Ready(ToolCallRepair {
        requested_name: requested_name.to_string(),
        resolved_name,
        original_arguments,
        arguments,
        argument_changes,
    })
}

fn invalid_tool_call_repair(
    requested_name: &str,
    raw_arguments: &str,
    kind: ToolCallRepairFailureKind,
) -> ToolCallRepairOutcome {
    ToolCallRepairOutcome::Invalid(ToolCallRepairFailure {
        requested_name: requested_name.to_string(),
        raw_arguments: raw_arguments.to_string(),
        kind,
    })
}

pub fn runtime_tool_call_surface_name<T: AsRef<str>>(
    available_tool_names: &[T],
    requested_name: &str,
    canonical_name: &dyn Fn(&str) -> Option<String>,
) -> Option<String> {
    let requested_name = requested_name.trim();
    if requested_name.is_empty() {
        return None;
    }

    if let Some(surface_name) = current_surface_tool_name(available_tool_names, requested_name) {
        return Some(surface_name);
    }

    let canonical_name = canonical_name(requested_name)?;
    current_surface_tool_name(available_tool_names, &canonical_name)
}

pub fn runtime_tool_call_normalize_arguments(
    tool_name: &str,
    arguments: &mut serde_json::Map<String, Value>,
) {
    match tool_name {
        "Read" => {
            copy_string_argument_if_missing(arguments, "file_path", "path");
            copy_string_argument_if_missing(arguments, "filePath", "path");
            if !arguments.contains_key("end_line") {
                if let Some(head) = positive_integer_argument(arguments, "head") {
                    arguments.insert("end_line".to_string(), Value::Number(head.into()));
                    arguments
                        .entry("start_line".to_string())
                        .or_insert_with(|| Value::Number(1.into()));
                }
            }
        }
        "Glob" | "Grep" => {
            copy_string_argument_if_missing(arguments, "query", "pattern");
        }
        _ => {}
    }
}

fn current_surface_tool_name<T: AsRef<str>>(
    available_tool_names: &[T],
    name: &str,
) -> Option<String> {
    available_tool_names
        .iter()
        .find(|tool_name| tool_name.as_ref() == name)
        .or_else(|| {
            available_tool_names
                .iter()
                .find(|tool_name| tool_name.as_ref().eq_ignore_ascii_case(name))
        })
        .map(|tool_name| tool_name.as_ref().to_string())
}

fn positive_integer_argument(arguments: &serde_json::Map<String, Value>, key: &str) -> Option<i64> {
    arguments
        .get(key)
        .and_then(|value| match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.trim().parse::<i64>().ok(),
            _ => None,
        })
        .filter(|value| *value > 0)
}

fn copy_string_argument_if_missing(
    arguments: &mut serde_json::Map<String, Value>,
    from: &str,
    to: &str,
) {
    if arguments.contains_key(to) {
        return;
    }
    let Some(value) = arguments
        .get(from)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
    else {
        return;
    };
    arguments.insert(to.to_string(), Value::String(value));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Map};

    fn canonical_name(name: &str) -> Option<String> {
        match name {
            "read_file" | "ReadTool" => Some("Read".to_string()),
            "ripgrep" => Some("Grep".to_string()),
            _ => None,
        }
    }

    #[test]
    fn tool_call_surface_name_matches_exact_and_case_insensitive_names() {
        let tools = vec!["Read", "Grep", "search_query"];

        assert_eq!(
            runtime_tool_call_surface_name(&tools, "Read", &canonical_name),
            Some("Read".to_string())
        );
        assert_eq!(
            runtime_tool_call_surface_name(&tools, "grep", &canonical_name),
            Some("Grep".to_string())
        );
    }

    #[test]
    fn tool_call_surface_name_resolves_current_aliases() {
        let tools = vec!["Read", "Grep"];

        assert_eq!(
            runtime_tool_call_surface_name(&tools, " read_file ", &canonical_name),
            Some("Read".to_string())
        );
        assert_eq!(
            runtime_tool_call_surface_name(&tools, "ripgrep", &canonical_name),
            Some("Grep".to_string())
        );
        assert_eq!(
            runtime_tool_call_surface_name(&tools, "unknown", &canonical_name),
            None
        );
    }

    #[test]
    fn normalize_read_arguments_copies_path_and_head() {
        let mut arguments = Map::from_iter([
            ("file_path".to_string(), json!(" src/lib.rs ")),
            ("head".to_string(), json!("42")),
        ]);

        runtime_tool_call_normalize_arguments("Read", &mut arguments);

        assert_eq!(arguments.get("path"), Some(&json!("src/lib.rs")));
        assert_eq!(arguments.get("start_line"), Some(&json!(1)));
        assert_eq!(arguments.get("end_line"), Some(&json!(42)));
    }

    #[test]
    fn normalize_arguments_does_not_override_existing_values() {
        let mut arguments = Map::from_iter([
            ("filePath".to_string(), json!("other.rs")),
            ("path".to_string(), json!("current.rs")),
            ("head".to_string(), json!(10)),
            ("end_line".to_string(), json!(5)),
        ]);

        runtime_tool_call_normalize_arguments("Read", &mut arguments);

        assert_eq!(arguments.get("path"), Some(&json!("current.rs")));
        assert_eq!(arguments.get("end_line"), Some(&json!(5)));
        assert!(!arguments.contains_key("start_line"));
    }

    #[test]
    fn normalize_search_arguments_copies_query_to_pattern() {
        let mut grep_arguments = Map::from_iter([("query".to_string(), json!("TODO"))]);
        let mut glob_arguments = Map::from_iter([("query".to_string(), json!("*.rs"))]);

        runtime_tool_call_normalize_arguments("Grep", &mut grep_arguments);
        runtime_tool_call_normalize_arguments("Glob", &mut glob_arguments);

        assert_eq!(grep_arguments.get("pattern"), Some(&json!("TODO")));
        assert_eq!(glob_arguments.get("pattern"), Some(&json!("*.rs")));
    }

    #[test]
    fn repair_resolves_alias_and_records_read_argument_changes() {
        let outcome = repair_tool_call(
            &["Read", "Grep"],
            "read_file",
            r#"{"file_path":" src/lib.rs ","head":"42"}"#,
            &canonical_name,
        );

        let ToolCallRepairOutcome::Ready(repair) = outcome else {
            panic!("repair should be ready");
        };
        assert_eq!(repair.requested_name, "read_file");
        assert_eq!(repair.resolved_name, "Read");
        assert_eq!(repair.original_arguments.get("path"), None);
        assert_eq!(repair.arguments.get("path"), Some(&json!("src/lib.rs")));
        assert_eq!(repair.arguments.get("start_line"), Some(&json!(1)));
        assert_eq!(repair.arguments.get("end_line"), Some(&json!(42)));
        assert_eq!(
            repair.argument_changes,
            vec![
                ToolArgumentChange {
                    key: "end_line".to_string(),
                    before: None,
                    after: json!(42),
                },
                ToolArgumentChange {
                    key: "path".to_string(),
                    before: None,
                    after: json!("src/lib.rs"),
                },
                ToolArgumentChange {
                    key: "start_line".to_string(),
                    before: None,
                    after: json!(1),
                },
            ]
        );
    }

    #[test]
    fn repair_preserves_existing_target_arguments() {
        let outcome = repair_tool_call(
            &["Read"],
            "read",
            r#"{"filePath":"other.rs","path":"current.rs","head":10,"end_line":5}"#,
            &canonical_name,
        );

        let ToolCallRepairOutcome::Ready(repair) = outcome else {
            panic!("repair should be ready");
        };
        assert_eq!(repair.resolved_name, "Read");
        assert_eq!(repair.arguments.get("path"), Some(&json!("current.rs")));
        assert_eq!(repair.arguments.get("end_line"), Some(&json!(5)));
        assert!(repair.argument_changes.is_empty());
    }

    #[test]
    fn repair_returns_typed_invalid_for_bad_arguments() {
        let malformed = repair_tool_call(
            &["Read"],
            "Read",
            r#"{"path": "unfinished"#,
            &canonical_name,
        );
        let scalar = repair_tool_call(&["Read"], "Read", r#"["src/lib.rs"]"#, &canonical_name);

        assert!(matches!(
            malformed,
            ToolCallRepairOutcome::Invalid(ToolCallRepairFailure {
                kind: ToolCallRepairFailureKind::MalformedArguments,
                ..
            })
        ));
        assert!(matches!(
            scalar,
            ToolCallRepairOutcome::Invalid(ToolCallRepairFailure {
                kind: ToolCallRepairFailureKind::ArgumentsNotObject,
                ..
            })
        ));
    }

    #[test]
    fn repair_returns_typed_invalid_for_missing_or_unknown_tool() {
        let missing = repair_tool_call(&["Read"], " ", "{}", &canonical_name);
        let unknown = repair_tool_call(&["Read"], "write_file", "{}", &canonical_name);

        assert!(matches!(
            missing,
            ToolCallRepairOutcome::Invalid(ToolCallRepairFailure {
                kind: ToolCallRepairFailureKind::MissingName,
                ..
            })
        ));
        assert!(matches!(
            unknown,
            ToolCallRepairOutcome::Invalid(ToolCallRepairFailure {
                kind: ToolCallRepairFailureKind::UnknownTool,
                ..
            })
        ));
    }

    #[test]
    fn repair_outcome_serializes_as_typed_contract() {
        let ready = repair_tool_call(&["Grep"], "ripgrep", r#"{"query":"TODO"}"#, &canonical_name);
        let invalid = repair_tool_call(&["Read"], "unknown", "{}", &canonical_name);

        let ready_value = json!({
            "status": "ready",
            "requested_name": "ripgrep",
            "resolved_name": "Grep",
            "original_arguments": { "query": "TODO" },
            "arguments": { "pattern": "TODO", "query": "TODO" },
            "argument_changes": [
                { "key": "pattern", "after": "TODO" }
            ]
        });
        let invalid_value = json!({
            "status": "invalid",
            "requested_name": "unknown",
            "raw_arguments": "{}",
            "kind": "unknown_tool"
        });

        assert_eq!(
            serde_json::to_value(&ready).expect("serialize ready repair"),
            ready_value
        );
        assert_eq!(
            serde_json::to_value(&invalid).expect("serialize invalid repair"),
            invalid_value
        );
        assert_eq!(
            serde_json::from_value::<ToolCallRepairOutcome>(ready_value)
                .expect("deserialize ready repair"),
            ready
        );
        assert_eq!(
            serde_json::from_value::<ToolCallRepairOutcome>(invalid_value)
                .expect("deserialize invalid repair"),
            invalid
        );
    }
}
