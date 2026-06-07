//! Runtime evidence auxiliary runtime 投影。
//!
//! 负责从 image / auxiliary task artifact 中提取辅助 runtime snapshot，
//! evidence pack 主服务只消费归一化后的机器事实。

use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_json_utils_service::{
    find_json_value_at_paths, read_json_bool, read_json_string,
};
use crate::services::runtime_evidence_path_service::resolve_workspace_path;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeAuxiliaryRuntimeSnapshotSummary {
    pub(crate) applicable_count: usize,
    pub(crate) snapshots: Vec<Value>,
}

pub(crate) fn build_auxiliary_runtime_snapshots_json(
    summary: &RuntimeAuxiliaryRuntimeSnapshotSummary,
) -> Value {
    json!({
        "applicableArtifactCount": summary.applicable_count,
        "snapshotCount": summary.snapshots.len(),
        "snapshots": summary.snapshots.clone()
    })
}

pub(crate) fn collect_auxiliary_runtime_snapshots(
    workspace_root: Option<&Path>,
    recent_artifacts: &[RuntimeRecentArtifact],
) -> RuntimeAuxiliaryRuntimeSnapshotSummary {
    let mut summary = RuntimeAuxiliaryRuntimeSnapshotSummary::default();

    for artifact in recent_artifacts {
        if !is_auxiliary_runtime_applicable(artifact) {
            continue;
        }

        summary.applicable_count += 1;

        let Some(workspace_root) = workspace_root else {
            continue;
        };

        let absolute_path = resolve_workspace_path(workspace_root, artifact.path.as_str());
        let Ok(raw) = fs::read_to_string(&absolute_path) else {
            continue;
        };
        let Ok(document) = serde_json::from_str::<Value>(raw.as_str()) else {
            continue;
        };

        if let Some(snapshot) = extract_auxiliary_runtime_snapshot(document, artifact.path.as_str())
        {
            summary.snapshots.push(snapshot);
        }
    }

    summary
}

fn is_auxiliary_runtime_applicable(artifact: &RuntimeRecentArtifact) -> bool {
    let normalized_path = artifact.path.replace('\\', "/").to_ascii_lowercase();
    if normalized_path.contains(".lime/tasks/image_generate/") {
        return true;
    }
    if normalized_path.contains("/auxiliary-runtime/") {
        return true;
    }

    artifact
        .metadata
        .as_ref()
        .and_then(|metadata| {
            read_json_string(
                metadata,
                &[
                    &["task_type"][..],
                    &["taskType"][..],
                    &["type"][..],
                    &["artifactType"][..],
                ],
            )
        })
        .map(|value| {
            value.eq_ignore_ascii_case("image_generate")
                || value.eq_ignore_ascii_case("auxiliary_runtime_projection")
        })
        .unwrap_or(false)
}

fn extract_auxiliary_runtime_snapshot(document: Value, artifact_path: &str) -> Option<Value> {
    if let Some(snapshot) = extract_auxiliary_runtime_projection_snapshot(&document, artifact_path)
    {
        return Some(snapshot);
    }

    let title_generation_result = find_json_value_at_paths(
        &document,
        &[
            &["title_generation_result"][..],
            &["titleGenerationResult"][..],
            &["payload", "title_generation_result"][..],
            &["payload", "titleGenerationResult"][..],
            &["record", "payload", "title_generation_result"][..],
            &["record", "payload", "titleGenerationResult"][..],
        ],
    )?;
    let execution_runtime = find_json_value_at_paths(
        title_generation_result,
        &[
            &["execution_runtime"][..],
            &["executionRuntime"][..],
            &["runtime"][..],
        ],
    )?
    .clone();

    let session_id = read_json_string(
        title_generation_result,
        &[&["sessionId"][..], &["session_id"][..]],
    )
    .or_else(|| {
        read_json_string(
            &execution_runtime,
            &[&["session_id"][..], &["sessionId"][..]],
        )
    });

    Some(json!({
        "artifactPath": artifact_path,
        "source": "image_task.title_generation_result",
        "title": read_json_string(title_generation_result, &[&["title"][..]]),
        "sessionId": session_id,
        "usedFallback": read_json_bool(
            title_generation_result,
            &[&["usedFallback"][..], &["used_fallback"][..]]
        ),
        "fallbackReason": read_json_string(
            title_generation_result,
            &[&["fallbackReason"][..], &["fallback_reason"][..]]
        ),
        "route": read_json_string(&execution_runtime, &[&["route"][..]]),
        "runtimeSource": read_json_string(&execution_runtime, &[&["source"][..]]),
        "taskKind": read_json_string(
            &execution_runtime,
            &[
                &["task_profile", "kind"][..],
                &["task_profile", "task_kind"][..],
                &["taskProfile", "kind"][..],
                &["taskProfile", "taskKind"][..],
                &["task_kind"][..],
                &["taskKind"][..],
            ]
        ),
        "routingMode": read_json_string(
            &execution_runtime,
            &[
                &["routing_decision", "routingMode"][..],
                &["routing_decision", "routing_mode"][..],
                &["routingDecision", "routingMode"][..],
                &["routingDecision", "routing_mode"][..],
                &["routing_mode"][..],
                &["routingMode"][..],
            ]
        ),
        "decisionSource": read_json_string(
            &execution_runtime,
            &[
                &["routing_decision", "decisionSource"][..],
                &["routing_decision", "decision_source"][..],
                &["routingDecision", "decisionSource"][..],
                &["routingDecision", "decision_source"][..],
                &["decision_source"][..],
                &["decisionSource"][..],
            ]
        ),
        "estimatedCostClass": read_json_string(
            &execution_runtime,
            &[
                &["cost_state", "estimatedCostClass"][..],
                &["cost_state", "estimated_cost_class"][..],
                &["costState", "estimatedCostClass"][..],
                &["costState", "estimated_cost_class"][..],
                &["estimated_cost_class"][..],
                &["estimatedCostClass"][..],
            ]
        ),
        "executionRuntime": execution_runtime
    }))
}

fn extract_auxiliary_runtime_projection_snapshot(
    document: &Value,
    artifact_path: &str,
) -> Option<Value> {
    let projection_kind = read_json_string(
        document,
        &[&["projectionKind"][..], &["projection_kind"][..]],
    )?;
    let execution_runtime = find_json_value_at_paths(
        document,
        &[&["executionRuntime"][..], &["execution_runtime"][..]],
    )
    .cloned();
    let title_generation_result = find_json_value_at_paths(
        document,
        &[
            &["titleGenerationResult"][..],
            &["title_generation_result"][..],
        ],
    );
    let persona_generation_result = find_json_value_at_paths(
        document,
        &[
            &["personaGenerationResult"][..],
            &["persona_generation_result"][..],
        ],
    );

    let session_id = read_json_string(
        document,
        &[
            &["auxiliarySessionId"][..],
            &["auxiliary_session_id"][..],
            &["sessionId"][..],
            &["session_id"][..],
        ],
    )
    .or_else(|| {
        execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(runtime, &[&["sessionId"][..], &["session_id"][..]])
        })
    });
    let source = read_json_string(document, &[&["source"][..]]).unwrap_or_else(|| {
        if projection_kind.eq_ignore_ascii_case("persona_generation") {
            "auxiliary.generate_persona".to_string()
        } else {
            "auxiliary.title_generation_result".to_string()
        }
    });
    let title = title_generation_result
        .and_then(|result| read_json_string(result, &[&["title"][..]]))
        .or_else(|| {
            persona_generation_result.and_then(|result| {
                read_json_string(
                    result,
                    &[
                        &["persona", "name"][..],
                        &["personaName"][..],
                        &["persona_name"][..],
                    ],
                )
            })
        });

    Some(json!({
        "artifactPath": artifact_path,
        "source": source,
        "projectionKind": projection_kind,
        "title": title,
        "sessionId": session_id,
        "usedFallback": title_generation_result.and_then(|result| {
            read_json_bool(result, &[&["usedFallback"][..], &["used_fallback"][..]])
        }),
        "fallbackReason": title_generation_result.and_then(|result| {
            read_json_string(
                result,
                &[&["fallbackReason"][..], &["fallback_reason"][..]]
            )
        }),
        "route": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(runtime, &[&["route"][..]])
        }),
        "runtimeSource": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(runtime, &[&["source"][..]])
        }),
        "taskKind": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(
                runtime,
                &[
                    &["task_profile", "kind"][..],
                    &["task_profile", "task_kind"][..],
                    &["taskProfile", "kind"][..],
                    &["taskProfile", "taskKind"][..],
                    &["task_kind"][..],
                    &["taskKind"][..],
                ]
            )
        }),
        "routingMode": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(
                runtime,
                &[
                    &["routing_decision", "routingMode"][..],
                    &["routing_decision", "routing_mode"][..],
                    &["routingDecision", "routingMode"][..],
                    &["routingDecision", "routing_mode"][..],
                    &["routing_mode"][..],
                    &["routingMode"][..],
                ]
            )
        }),
        "decisionSource": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(
                runtime,
                &[
                    &["routing_decision", "decisionSource"][..],
                    &["routing_decision", "decision_source"][..],
                    &["routingDecision", "decisionSource"][..],
                    &["routingDecision", "decision_source"][..],
                    &["decision_source"][..],
                    &["decisionSource"][..],
                ]
            )
        }),
        "estimatedCostClass": execution_runtime.as_ref().and_then(|runtime| {
            read_json_string(
                runtime,
                &[
                    &["cost_state", "estimatedCostClass"][..],
                    &["cost_state", "estimated_cost_class"][..],
                    &["costState", "estimatedCostClass"][..],
                    &["costState", "estimated_cost_class"][..],
                    &["estimated_cost_class"][..],
                    &["estimatedCostClass"][..],
                ]
            )
        }),
        "executionRuntime": execution_runtime
    }))
}
