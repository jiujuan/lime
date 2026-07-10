use serde_json::Value;

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
}
