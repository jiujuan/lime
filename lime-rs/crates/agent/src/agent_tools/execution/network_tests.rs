use super::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionPolicyService, ToolExecutionResolverInput,
};
use lime_core::config::{
    ToolExecutionCommandRiskLevelConfig as ConfigToolExecutionCommandRiskLevelConfig,
    ToolExecutionCommandRuleMatchTypeConfig as ConfigToolExecutionCommandRuleMatchTypeConfig,
    ToolExecutionNetworkRuleConfig as ConfigToolExecutionNetworkRuleConfig,
    ToolExecutionNetworkRuleTargetConfig as ConfigToolExecutionNetworkRuleTargetConfig,
    ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
};
use serde_json::json;
use std::path::Path;

#[test]
fn test_tool_execution_policy_service_matches_persisted_network_host_rule() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        network_rules: vec![ConfigToolExecutionNetworkRuleConfig {
            rule_id: "persisted_internal_host".to_string(),
            match_type: ConfigToolExecutionCommandRuleMatchTypeConfig::Prefix,
            target: ConfigToolExecutionNetworkRuleTargetConfig::Host,
            pattern: "internal.".to_string(),
            risk_level: ConfigToolExecutionCommandRiskLevelConfig::High,
            reason_code: "persisted_internal_network".to_string(),
            reason: "持久化策略标记内部域名".to_string(),
        }],
        ..Default::default()
    };
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: Some(&persisted_policy),
        request_metadata: None,
    });

    let rule_match = service
        .classify_network_access(
            "WebFetch",
            &json!({ "url": "https://internal.example.test/docs" }),
            None,
        )
        .expect("network request should match persisted host rule");

    assert_eq!(rule_match.rule_id, "persisted_internal_host");
    assert_eq!(rule_match.source.label(), "persisted");
    assert_eq!(rule_match.risk_level.label(), "high");
    assert_eq!(rule_match.host.as_deref(), Some("internal.example.test"));
    assert_eq!(rule_match.target.label(), "host");
}

#[test]
fn test_tool_execution_policy_service_request_network_rule_overrides_runtime_rule() {
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "networkRules": [
                    {
                        "ruleId": "runtime_example_host",
                        "matchType": "exact",
                        "target": "host",
                        "pattern": "downloads.example.test",
                        "riskLevel": "high",
                        "reasonCode": "runtime_download_host",
                        "reason": "运行时策略标记下载域名"
                    }
                ]
            },
            "requestExecutionPolicy": {
                "networkRules": [
                    {
                        "ruleId": "request_example_host",
                        "matchType": "exact",
                        "target": "host",
                        "pattern": "downloads.example.test",
                        "riskLevel": "high",
                        "reasonCode": "request_download_host",
                        "reason": "请求策略标记下载域名"
                    }
                ]
            }
        }
    });
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: None,
        request_metadata: Some(&request_metadata),
    });

    let rule_match = service
        .classify_network_access(
            "WebFetch",
            &json!({ "url": "https://downloads.example.test/archive.zip" }),
            None,
        )
        .expect("network request should match request rule");

    assert_eq!(rule_match.rule_id, "request_example_host");
    assert_eq!(rule_match.source.label(), "request");
    assert_eq!(rule_match.reason_code, "request_download_host");
}

#[test]
fn test_decide_tool_execution_adds_network_rule_metadata_for_webfetch() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        network_rules: vec![ConfigToolExecutionNetworkRuleConfig {
            rule_id: "docs_host".to_string(),
            match_type: ConfigToolExecutionCommandRuleMatchTypeConfig::Exact,
            target: ConfigToolExecutionNetworkRuleTargetConfig::Host,
            pattern: "docs.example.test".to_string(),
            risk_level: ConfigToolExecutionCommandRiskLevelConfig::Medium,
            reason_code: "docs_network_access".to_string(),
            reason: "访问受管文档域名".to_string(),
        }],
        ..Default::default()
    };

    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "WebFetch",
        params: &json!({ "url": "https://docs.example.test/guide" }),
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("on_request"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: Some(&persisted_policy),
            request_metadata: None,
        },
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::Allow);
    assert_eq!(
        decision.metadata.get("networkRuleId"),
        Some(&json!("docs_host"))
    );
    assert_eq!(
        decision.metadata.get("networkRuleSource"),
        Some(&json!("persisted"))
    );
    assert_eq!(
        decision.metadata.get("networkRiskLevel"),
        Some(&json!("medium"))
    );
    assert_eq!(
        decision.metadata.get("networkRiskReasonCode"),
        Some(&json!("docs_network_access"))
    );
    assert_eq!(
        decision.metadata.get("networkHost"),
        Some(&json!("docs.example.test"))
    );
}

#[test]
fn test_decide_tool_execution_adds_network_rule_metadata_for_curl_command() {
    let request_metadata = json!({
        "harness": {
            "requestExecutionPolicy": {
                "networkRules": [
                    {
                        "ruleId": "request_download_url",
                        "matchType": "prefix",
                        "target": "url",
                        "pattern": "https://downloads.example.test/",
                        "riskLevel": "high",
                        "reasonCode": "request_download_url",
                        "reason": "请求策略标记下载 URL"
                    }
                ]
            }
        }
    });

    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "exec_command",
        params: &json!({ "command": "curl -L https://downloads.example.test/archive.zip" }),
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("on_request"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: Some(&request_metadata),
        },
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::RequiresApproval);
    assert_eq!(
        decision.metadata.get("commandRuleId"),
        Some(&json!("network_download"))
    );
    assert_eq!(
        decision.metadata.get("networkRuleId"),
        Some(&json!("request_download_url"))
    );
    assert_eq!(
        decision.metadata.get("networkRuleTarget"),
        Some(&json!("url"))
    );
    assert_eq!(
        decision.metadata.get("networkRuleSource"),
        Some(&json!("request"))
    );
    assert_eq!(
        decision.metadata.get("networkRiskLevel"),
        Some(&json!("high"))
    );
}
