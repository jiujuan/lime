//! Session insights read model.
//!
//! This module owns the pure aggregate projection for session insights. SQL
//! readers should pass raw aggregate values here before runtime-specific DTO
//! adapters expose them.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionInsightsRecord {
    pub total_sessions: usize,
    pub total_tokens: i64,
}

pub fn project_session_insights(total_sessions: i64, total_tokens: i64) -> SessionInsightsRecord {
    SessionInsightsRecord {
        total_sessions: usize::try_from(total_sessions).unwrap_or(0),
        total_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::project_session_insights;

    #[test]
    fn project_session_insights_should_keep_counts() {
        let insights = project_session_insights(3, 42);

        assert_eq!(insights.total_sessions, 3);
        assert_eq!(insights.total_tokens, 42);
    }

    #[test]
    fn project_session_insights_should_drop_invalid_negative_session_count() {
        let insights = project_session_insights(-1, 42);

        assert_eq!(insights.total_sessions, 0);
        assert_eq!(insights.total_tokens, 42);
    }
}
