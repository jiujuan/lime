pub(crate) fn normalize_execution_strategy_to_react(execution_strategy: Option<&str>) -> String {
    match execution_strategy
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some("react") | Some("code_orchestrated") | Some("auto") | None => "react".to_string(),
        Some(_) => "react".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_execution_strategy_to_react;

    #[test]
    fn normalizes_legacy_values_to_react() {
        assert_eq!(
            normalize_execution_strategy_to_react(Some("react")),
            "react"
        );
        assert_eq!(
            normalize_execution_strategy_to_react(Some("code_orchestrated")),
            "react"
        );
        assert_eq!(normalize_execution_strategy_to_react(Some("auto")), "react");
        assert_eq!(
            normalize_execution_strategy_to_react(Some("unknown")),
            "react"
        );
        assert_eq!(normalize_execution_strategy_to_react(None), "react");
    }
}
