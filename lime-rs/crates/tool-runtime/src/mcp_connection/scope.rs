/// Per-call correlation inside a connection whose runtime owner is already fixed.
///
/// Thread ownership is captured when the MCP connection is created. A tool call
/// only contributes its optional Turn correlation; session, tool-call and raw
/// request identities must never be used to rediscover a connection owner.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct McpCallScope {
    turn_id: Option<String>,
}

impl McpCallScope {
    pub fn new(turn_id: Option<impl Into<String>>) -> Result<Self, &'static str> {
        let turn_id = turn_id
            .map(Into::into)
            .map(|value| non_empty(value, "turn_id"))
            .transpose()?;
        Ok(Self { turn_id })
    }

    pub fn turn_id(&self) -> Option<&str> {
        self.turn_id.as_deref()
    }
}

fn non_empty(value: String, field: &'static str) -> Result<String, &'static str> {
    if value.trim().is_empty() {
        Err(field)
    } else {
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_keeps_only_optional_turn_correlation() {
        let scope = McpCallScope::new(Some("turn-1")).expect("turn correlation");
        assert_eq!(scope.turn_id(), Some("turn-1"));
        assert_eq!(McpCallScope::new(None::<String>).unwrap().turn_id(), None);
        assert_eq!(McpCallScope::new(Some(" ")), Err("turn_id"));
    }
}
