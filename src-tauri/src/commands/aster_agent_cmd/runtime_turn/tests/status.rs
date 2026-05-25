use super::*;

#[test]
fn build_submit_accepted_runtime_status_should_use_preparing_copy() {
    let status = build_submit_accepted_runtime_status();

    assert_eq!(status.phase, "preparing");
    assert_eq!(status.title, "已接收请求，正在准备执行");
    assert_eq!(
        status.detail,
        "系统正在初始化本轮执行环境并整理上下文，稍后会继续返回更详细进度。"
    );
    assert_eq!(
        status.checkpoints,
        vec![
            "请求已进入运行时主链".to_string(),
            "正在准备工作区与会话上下文".to_string(),
            "等待后续详细执行事件".to_string(),
        ]
    );
    assert_diagnostics_runtime_status_metadata(status.metadata.as_ref().expect("submit metadata"));
}

#[test]
fn build_runtime_turn_keepalive_status_should_explain_active_waiting() {
    let status = build_runtime_turn_keepalive_status(2, Duration::from_secs(91));

    assert_eq!(status.phase, "routing");
    assert_eq!(status.title, "仍在执行，等待下一步进度");
    assert!(status.detail.contains("约 91 秒"));
    assert_eq!(
        status.checkpoints,
        vec![
            "请求仍在后台执行".to_string(),
            "正在等待模型、工具或上下文准备返回".to_string(),
            "如果长时间无结果，可手动停止后重试".to_string(),
        ]
    );
    let metadata = status.metadata.expect("keepalive metadata");
    assert_diagnostics_runtime_status_metadata(&metadata);
    assert_eq!(
        metadata.get("keepalive_kind"),
        Some(&serde_json::Value::String(
            "runtime_turn_active".to_string()
        ))
    );
    assert_eq!(
        metadata.get("keepalive_sequence"),
        Some(&serde_json::Value::Number(2_u64.into()))
    );
    assert_eq!(
        metadata.get("keepalive_elapsed_ms"),
        Some(&serde_json::Value::Number(91_000_u64.into()))
    );
}
