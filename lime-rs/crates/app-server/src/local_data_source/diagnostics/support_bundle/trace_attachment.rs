use super::normalize_archive_path;
use crate::export_trace_events_from_store_to_path;
use app_server_protocol::DiagnosticsTraceExportParams;
use app_server_protocol::SupportBundleTraceExportSelection;
use serde::Serialize;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub(super) struct SupportBundleTraceExportManifest {
    pub(super) relative_path: String,
    pub(super) session_id: String,
    pub(super) trace_id: String,
    pub(super) event_count: u64,
    pub(super) redaction_mode: String,
    pub(super) summary_only_trace_events_included: bool,
}

pub(super) fn write_selected_trace_export(
    bundle_dir: &Path,
    trace_root: Option<&Path>,
    selection: &SupportBundleTraceExportSelection,
    generated_at: &str,
) -> Result<SupportBundleTraceExportManifest, String> {
    let Some(trace_root) = trace_root.filter(|path| path.exists()) else {
        return Err("无法附带 trace export：trace store 不可用".to_string());
    };

    let relative_path = PathBuf::from("trace-export").join(format!(
        "claw-trace-{}-{}.zip",
        safe_support_file_stem(&selection.session_id),
        safe_support_file_stem(&selection.trace_id)
    ));
    let bundle_path = bundle_dir.join(&relative_path);
    let params = DiagnosticsTraceExportParams {
        session_id: selection.session_id.clone(),
        trace_id: selection.trace_id.clone(),
    };
    let Some(summary) =
        export_trace_events_from_store_to_path(trace_root, &params, &bundle_path, generated_at)?
    else {
        return Err(format!(
            "无法附带 trace export：找不到 session={} trace={}",
            selection.session_id, selection.trace_id
        ));
    };

    Ok(SupportBundleTraceExportManifest {
        relative_path: normalize_archive_path(&relative_path),
        session_id: summary.session_id,
        trace_id: summary.trace_id,
        event_count: summary.event_count,
        redaction_mode: "summary_only".to_string(),
        summary_only_trace_events_included: true,
    })
}

fn safe_support_file_stem(value: &str) -> String {
    let stem = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let stem = stem.trim_matches('_');
    if stem.is_empty() {
        "unknown".to_string()
    } else {
        stem.to_string()
    }
}
