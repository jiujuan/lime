use super::super::RuntimeCoreError;
use super::json_helpers::json_string;
use super::{PaneActionWorkerTurn, CLOUD_RELEASE_SOURCE_KIND, WORKER_PACKAGE_SIGNATURE_UNVERIFIED};
use serde_json::Value;

pub(super) fn validate_worker_turn_launch_preconditions(
    installed_state: &Value,
    worker_turn: &PaneActionWorkerTurn,
) -> Result<(), RuntimeCoreError> {
    if installed_state
        .get("disabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Err(RuntimeCoreError::Backend(format!(
            "Plugin 已禁用: {}",
            worker_turn.app_id
        )));
    }
    validate_worker_cloud_release_signature(installed_state)
}

pub(super) fn validate_worker_cloud_release_signature(
    installed_state: &Value,
) -> Result<(), RuntimeCoreError> {
    let source_kind = installed_state
        .get("identity")
        .and_then(|identity| json_string(identity, &["sourceKind", "source_kind"]));
    if source_kind.as_deref() != Some(CLOUD_RELEASE_SOURCE_KIND) {
        return Ok(());
    }

    let app_id =
        json_string(installed_state, &["appId", "app_id"]).unwrap_or_else(|| "unknown".to_string());
    let Some(evidence) = installed_state
        .get("setup")
        .and_then(|setup| setup.get("cloudReleaseEvidence"))
        .filter(|value| value.is_object())
    else {
        return Err(worker_package_signature_error(
            app_id.as_str(),
            "missing cloud release evidence",
        ));
    };

    let mut issues = Vec::new();
    let signature_policy = json_string(evidence, &["signaturePolicy", "signature_policy"])
        .unwrap_or_else(|| "required".to_string());
    let signature_status = json_string(
        evidence,
        &[
            "signatureVerificationStatus",
            "signature_verification_status",
        ],
    )
    .unwrap_or_else(|| "not_configured".to_string());
    let signature_required = signature_policy == "required";
    if signature_required && signature_status != "verified" {
        issues.push("required signature is not verified");
    }
    if evidence
        .get("packageHashMatched")
        .or_else(|| evidence.get("package_hash_matched"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        issues.push("package hash is not verified");
    }
    if evidence
        .get("manifestHashMatched")
        .or_else(|| evidence.get("manifest_hash_matched"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        issues.push("manifest hash is not verified");
    }
    if json_string(
        evidence,
        &["packageVerificationStatus", "package_verification_status"],
    )
    .as_deref()
        != Some("verified")
    {
        issues.push("package verification is not verified");
    }
    let evidence_status = json_string(evidence, &["status"]).unwrap_or_else(|| "blocked".into());
    if evidence_status == "blocked" {
        issues.push("release evidence is blocked");
    } else if signature_required && evidence_status != "ready" {
        issues.push("required-signature release evidence is not ready");
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(worker_package_signature_error(
            app_id.as_str(),
            issues.join(", ").as_str(),
        ))
    }
}

fn worker_package_signature_error(app_id: &str, reason: &str) -> RuntimeCoreError {
    RuntimeCoreError::Backend(format!(
        "{WORKER_PACKAGE_SIGNATURE_UNVERIFIED}: cloud release package signature gate failed for {app_id}: {reason}"
    ))
}
