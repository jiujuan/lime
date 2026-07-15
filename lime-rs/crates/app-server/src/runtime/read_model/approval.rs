use agent_protocol::{ApprovalDecision, ApprovalScope};
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
struct ApprovalReadResponse<'a> {
    decision: ApprovalDecision,
    decision_scope: ApprovalScope,
    reason_code: Option<&'a str>,
}

pub(super) fn read_response(
    decision: Option<ApprovalDecision>,
    decision_scope: ApprovalScope,
    reason_code: Option<&str>,
) -> Option<Value> {
    decision.map(|decision| {
        serde_json::to_value(ApprovalReadResponse {
            decision,
            decision_scope,
            reason_code,
        })
        .expect("Approval read response must serialize")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn response_preserves_all_canonical_decisions() {
        for (decision, expected) in [
            (ApprovalDecision::Approved, "approved"),
            (ApprovalDecision::ApprovedForSession, "approvedForSession"),
            (ApprovalDecision::Denied, "denied"),
            (ApprovalDecision::TimedOut, "timedOut"),
            (ApprovalDecision::Abort, "abort"),
        ] {
            assert_eq!(
                read_response(Some(decision), ApprovalScope::Turn, Some("policy")),
                Some(json!({
                    "decision": expected,
                    "decision_scope": "turn",
                    "reason_code": "policy",
                }))
            );
        }
        assert_eq!(read_response(None, ApprovalScope::Once, None), None);
    }
}
