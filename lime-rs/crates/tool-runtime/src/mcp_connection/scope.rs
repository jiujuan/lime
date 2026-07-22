/// Per-call correlation inside a connection whose runtime owner is already fixed.
///
/// Thread ownership is captured when the MCP connection is created. A tool call
/// contributes optional turn correlation and captured snapshot provenance; session,
/// tool-call and raw request identities must never be used to rediscover a connection owner.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct McpCallScope {
    turn_id: Option<String>,
    snapshot_generation: Option<u64>,
    environment_id: Option<String>,
    auth_scopes: Option<Vec<String>>,
}

impl McpCallScope {
    pub fn new(turn_id: Option<impl Into<String>>) -> Result<Self, &'static str> {
        let turn_id = turn_id
            .map(Into::into)
            .map(|value| non_empty(value, "turn_id"))
            .transpose()?;
        Ok(Self {
            turn_id,
            snapshot_generation: None,
            environment_id: None,
            auth_scopes: None,
        })
    }

    pub fn turn_id(&self) -> Option<&str> {
        self.turn_id.as_deref()
    }

    pub fn snapshot_generation(&self) -> Option<u64> {
        self.snapshot_generation
    }

    pub fn auth_scopes(&self) -> Option<&[String]> {
        self.auth_scopes.as_deref()
    }

    pub fn environment_id(&self) -> Option<&str> {
        self.environment_id.as_deref()
    }

    pub fn with_snapshot_generation(mut self, generation: u64) -> Self {
        self.snapshot_generation = Some(generation);
        self
    }

    pub fn with_environment_id(mut self, environment_id: impl Into<String>) -> Self {
        let environment_id = environment_id.into();
        self.environment_id = (!environment_id.trim().is_empty()).then_some(environment_id);
        self
    }

    pub fn with_auth_scopes(mut self, scopes: Vec<String>) -> Self {
        self.auth_scopes = (!scopes.is_empty()).then_some(scopes);
        self
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
        assert_eq!(scope.snapshot_generation(), None);
        assert_eq!(scope.environment_id(), None);
        assert_eq!(scope.auth_scopes(), None);
        assert_eq!(
            scope
                .clone()
                .with_snapshot_generation(7)
                .snapshot_generation(),
            Some(7)
        );
        assert_eq!(
            scope
                .clone()
                .with_auth_scopes(vec!["search.read".to_string()])
                .auth_scopes(),
            Some(["search.read".to_string()].as_slice())
        );
        assert_eq!(
            scope.clone().with_environment_id("remote").environment_id(),
            Some("remote")
        );
        assert_eq!(McpCallScope::new(None::<String>).unwrap().turn_id(), None);
        assert_eq!(McpCallScope::new(Some(" ")), Err("turn_id"));
    }
}
